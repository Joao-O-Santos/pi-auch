import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { QuotaCache } from "./cache.js";
import { parseCopilotHeaders } from "./passive.js";
import { createReaders, type ProviderAuth } from "./readers.js";
import { type Colorize, formatConfiguredFooter, formatDetail } from "./render.js";
import { PROVIDERS, type ProviderId, type QuotaResult } from "./types.js";

const STATUS_KEY = "pi-auch";
const REFRESH_MS = 5 * 60 * 1000;

const PASSIVE_PARSERS: Partial<
	Record<ProviderId, (headers: Record<string, string>, status: number) => QuotaResult | undefined>
> = {
	"github-copilot": parseCopilotHeaders,
};

function getColorize(ctx: ExtensionContext): Colorize | undefined {
	return ctx.ui.theme?.fg ? (color, text) => ctx.ui.theme.fg(color, text) : undefined;
}

function mergePassive(previous: QuotaResult | undefined, current: QuotaResult): QuotaResult {
	if (!previous || current.metrics.some((metric) => metric.label === "rate limited"))
		return current;
	const currentLabels = new Set(current.metrics.map((metric) => metric.label));
	return {
		...current,
		metrics: [
			...current.metrics,
			...previous.metrics.filter(
				(metric) => metric.label !== "rate limited" && !currentLabels.has(metric.label),
			),
		],
	};
}

export default function piAuch(pi: ExtensionAPI) {
	let resolveAuth: (provider: string) => Promise<ProviderAuth | undefined> = async () => undefined;
	const passive = new Map<ProviderId, QuotaResult>();
	const cache = new QuotaCache(
		createReaders(
			(provider) => resolveAuth(provider),
			(provider) => passive.get(provider),
		),
	);
	let timer: ReturnType<typeof setInterval> | undefined;
	let running = false;
	let sessionGeneration = 0;

	const render = (ctx: ExtensionContext) => {
		const states = new Map(
			PROVIDERS.flatMap((provider) => {
				const state = cache.get(provider);
				return state ? [[provider, state] as const] : [];
			}),
		);
		ctx.ui.setStatus(
			STATUS_KEY,
			running ? formatConfiguredFooter(states, getColorize(ctx)) : undefined,
		);
	};

	const refresh = async (ctx: ExtensionContext, generation: number) => {
		await cache.refreshAll();
		if (running && generation === sessionGeneration) render(ctx);
	};

	pi.on("session_start", async (_event, ctx) => {
		if (timer) clearInterval(timer);
		cache.abort();
		const generation = ++sessionGeneration;
		running = true;
		resolveAuth = async (provider) => (await ctx.modelRegistry.getProviderAuth(provider))?.auth;
		render(ctx);
		void refresh(ctx, generation);
		timer = setInterval(() => void refresh(ctx, generation), REFRESH_MS);
		timer.unref?.();
	});

	const shutdown = (ctx: ExtensionContext) => {
		running = false;
		sessionGeneration++;
		if (timer) clearInterval(timer);
		timer = undefined;
		cache.abort();
		ctx.ui.setStatus(STATUS_KEY, undefined);
	};
	pi.on("session_shutdown", (_event, ctx) => shutdown(ctx));
	pi.on("after_provider_response", (event, ctx) => {
		const provider = ctx.model?.provider as ProviderId | undefined;
		const parsed = provider && PASSIVE_PARSERS[provider]?.(event.headers, event.status);
		if (!parsed) return;
		const value = mergePassive(passive.get(parsed.provider), parsed);
		passive.set(value.provider, value);
		cache.store(value);
		if (running) render(ctx);
	});
	pi.registerCommand("auch", {
		description: "Refresh and show quota details for configured providers",
		handler: async (_args, ctx) => {
			const generation = sessionGeneration;
			const states = await cache.refreshAll();
			if (generation !== sessionGeneration) return;
			if (running) render(ctx);
			const lines = PROVIDERS.map((provider) => {
				const state = states.get(provider);
				return state ? formatDetail(provider, state, getColorize(ctx)) : `${provider}: unavailable`;
			});
			ctx.ui.notify(
				lines.join("\n"),
				lines.every((line) => line.includes("unavailable")) ? "warning" : "info",
			);
		},
	});
}
