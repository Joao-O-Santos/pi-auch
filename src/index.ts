import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { QuotaCache } from "./cache.js";
import { createReaders, type ProviderAuth } from "./readers.js";
import { formatConfiguredFooter, formatDetail } from "./render.js";
import { PROVIDERS } from "./types.js";

const STATUS_KEY = "pi-auch";
const REFRESH_MS = 15 * 60 * 1000;

export default function piAuch(pi: ExtensionAPI) {
	let resolveAuth: (provider: string) => Promise<ProviderAuth | undefined> = async () => undefined;
	const cache = new QuotaCache(createReaders((provider) => resolveAuth(provider)));
	let timer: ReturnType<typeof setInterval> | undefined;
	let running = false;

	const render = (ctx: ExtensionContext) => {
		const states = new Map(
			PROVIDERS.flatMap((provider) => {
				const state = cache.get(provider);
				return state ? [[provider, state] as const] : [];
			}),
		);
		ctx.ui.setStatus(STATUS_KEY, running ? formatConfiguredFooter(states) : undefined);
	};

	const refresh = async (ctx: ExtensionContext) => {
		await cache.refreshAll();
		if (running) render(ctx);
	};

	pi.on("session_start", async (_event, ctx) => {
		running = true;
		resolveAuth = async (provider) => (await ctx.modelRegistry.getProviderAuth(provider))?.auth;
		render(ctx);
		void refresh(ctx);
		if (timer) clearInterval(timer);
		timer = setInterval(() => void refresh(ctx), REFRESH_MS);
		timer.unref?.();
	});

	const shutdown = (ctx: ExtensionContext) => {
		running = false;
		if (timer) clearInterval(timer);
		timer = undefined;
		cache.abort();
		ctx.ui.setStatus(STATUS_KEY, undefined);
	};
	pi.on("session_shutdown", (_event, ctx) => shutdown(ctx));
	pi.registerCommand("auch", {
		description: "Refresh and show quota details for configured providers",
		handler: async (_args, ctx) => {
			const states = await cache.refreshAll();
			if (running) render(ctx);
			const lines = PROVIDERS.map((provider) => {
				const state = states.get(provider);
				return state ? formatDetail(provider, state) : `${provider}: unavailable`;
			});
			ctx.ui.notify(
				lines.join("\n"),
				lines.every((line) => line.includes("unavailable")) ? "warning" : "info",
			);
		},
	});
}
