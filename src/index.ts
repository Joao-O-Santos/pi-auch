import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { QuotaCache } from "./cache.js";
import { createReaders, type ProviderAuth } from "./readers.js";
import { formatDetail, formatFooter, providerForModel } from "./render.js";
import { PROVIDERS, type ProviderId } from "./types.js";

const STATUS_KEY = "pi-auch";
const REFRESH_MS = 15 * 60 * 1000;

export default function piAuch(pi: ExtensionAPI) {
	let resolveAuth: (provider: string) => Promise<ProviderAuth | undefined> = async () => undefined;
	const cache = new QuotaCache(createReaders((provider) => resolveAuth(provider)));
	let activeProvider: ProviderId | undefined;
	let timer: ReturnType<typeof setInterval> | undefined;
	let running = false;

	const render = (ctx: ExtensionContext) => {
		if (!running || !activeProvider) {
			ctx.ui.setStatus(STATUS_KEY, undefined);
			return;
		}
		ctx.ui.setStatus(STATUS_KEY, formatFooter(activeProvider, cache.get(activeProvider)));
	};

	const refreshActive = async (ctx: ExtensionContext, provider = activeProvider) => {
		if (!provider) return;
		await cache.refresh(provider);
		if (running && provider === activeProvider) render(ctx);
	};

	pi.on("session_start", async (_event, ctx) => {
		running = true;
		resolveAuth = async (provider) => (await ctx.modelRegistry.getProviderAuth(provider))?.auth;
		activeProvider = providerForModel(ctx.model?.provider);
		render(ctx);
		void refreshActive(ctx);
		if (timer) clearInterval(timer);
		timer = setInterval(() => void refreshActive(ctx), REFRESH_MS);
		timer.unref?.();
	});

	pi.on("model_select", async (event, ctx) => {
		activeProvider = providerForModel(event.model.provider);
		render(ctx);
		await refreshActive(ctx);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		running = false;
		if (timer) clearInterval(timer);
		timer = undefined;
		cache.abort();
		ctx.ui.setStatus(STATUS_KEY, undefined);
	});

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
