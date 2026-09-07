import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import piAuch from "../src/index.js";

type Handler = (
	event: { status: number; headers: Record<string, string> },
	context: ExtensionContext,
) => void | Promise<void>;
type CommandHandler = (args: string, context: ExtensionContext) => Promise<void>;

interface Notice {
	message: string;
	level: string;
}

test("extension follows the complete session, model, command, and shutdown lifecycle", async (t) => {
	const handlers = new Map<string, Handler>();
	let command: CommandHandler | undefined;
	const statuses: Array<string | undefined> = [];
	const notices: Notice[] = [];
	let intervalCallback: (() => void) | undefined;
	let intervalDelay: number | undefined;
	const originalSetInterval = globalThis.setInterval;
	globalThis.setInterval = ((callback: () => void, delay: number) => {
		intervalCallback = callback;
		intervalDelay = delay;
		return { unref() {} };
	}) as unknown as typeof setInterval;

	const pi = {
		on(name: string, handler: Handler) {
			handlers.set(name, handler);
		},
		registerCommand(name: string, options: { handler: CommandHandler }) {
			assert.equal(name, "auch");
			command = options.handler;
		},
	} as unknown as ExtensionAPI;
	const context = {
		model: { provider: "openai-codex" },
		modelRegistry: {
			async getProviderAuth(providerName: string) {
				return providerName === "github-copilot" ? { auth: { apiKey: "resolved" } } : undefined;
			},
		},
		ui: {
			theme: {
				fg(_color: string, text: string) {
					return text;
				},
			},
			setStatus(_key: string, value: string | undefined) {
				statuses.push(value);
			},
			notify(message: string, level: string) {
				notices.push({ message, level });
			},
		},
	} as unknown as ExtensionContext;

	t.after(() => {
		globalThis.setInterval = originalSetInterval;
	});
	piAuch(pi);
	assert.deepEqual(
		[...handlers.keys()],
		["session_start", "session_shutdown", "after_provider_response"],
	);
	assert.ok(command);

	await command("", context);
	assert.equal(notices.at(-1)?.level, "warning");
	const shutdown = handlers.get("session_shutdown");
	assert.ok(shutdown);
	await shutdown({ status: 0, headers: {} }, context);

	await handlers.get("session_start")?.({ status: 0, headers: {} }, context);
	await handlers.get("session_start")?.({ status: 0, headers: {} }, context);
	assert.equal(intervalDelay, 5 * 60 * 1000);
	intervalCallback?.();
	await new Promise((resolve) => setImmediate(resolve));
	assert.match(statuses.at(-1) ?? "", /GH configured/);

	context.model = { provider: "github-copilot" } as typeof context.model;
	await handlers.get("after_provider_response")?.(
		{ status: 200, headers: { "x-copilot-premium-requests-used-percent": "25" } },
		context,
	);
	assert.match(statuses.at(-1) ?? "", /GH 🙂 nice 25%/);
	await handlers.get("after_provider_response")?.({ status: 200, headers: {} }, context);
	assert.match(statuses.at(-1) ?? "", /GH 🙂 nice 25%/);
	await handlers.get("after_provider_response")?.(
		{ status: 200, headers: { "x-ratelimit-used-percent": "10" } },
		context,
	);
	assert.match(statuses.at(-1) ?? "", /GH 🙂 nice 25% - 🙂 nice 10%/);
	await handlers.get("after_provider_response")?.(
		{ status: 429, headers: { "retry-after": "2" } },
		context,
	);
	assert.match(statuses.at(-1) ?? "", /GH 😭 AUCH!! 429\/1m/);
	await handlers.get("after_provider_response")?.(
		{ status: 200, headers: { "x-copilot-premium-requests-used-percent": "30" } },
		context,
	);
	assert.match(statuses.at(-1) ?? "", /GH 🙂 nice 30%/);
	assert.doesNotMatch(statuses.at(-1) ?? "", /429/);
	await handlers.get("after_provider_response")?.({ status: 500, headers: {} }, context);
	context.model = { provider: "openai-codex" } as typeof context.model;
	await handlers.get("after_provider_response")?.({ status: 500, headers: {} }, context);

	await command("", context);
	assert.equal(notices.at(-1)?.level, "info");
	assert.match(notices.at(-1)?.message ?? "", /Codex: unavailable/);

	await shutdown({ status: 0, headers: {} }, context);
	assert.equal(statuses.at(-1), undefined);
});

test("ended sessions cannot render after a later session starts", async (t) => {
	const handlers = new Map<string, Handler>();
	const intervalCallbacks: Array<() => void> = [];
	const originalSetInterval = globalThis.setInterval;
	globalThis.setInterval = ((callback: () => void) => {
		intervalCallbacks.push(callback);
		return { unref() {} };
	}) as unknown as typeof setInterval;
	t.after(() => {
		globalThis.setInterval = originalSetInterval;
	});

	const pi = {
		on(name: string, handler: Handler) {
			handlers.set(name, handler);
		},
		registerCommand() {},
	} as unknown as ExtensionAPI;
	let releaseOldAuth: () => void = () => {};
	const oldAuth = new Promise<void>((resolve) => {
		releaseOldAuth = resolve;
	});
	const makeContext = (statuses: Array<string | undefined>, waitForAuth: boolean) =>
		({
			model: { provider: "github-copilot" },
			modelRegistry: {
				async getProviderAuth(provider: string) {
					if (waitForAuth && provider === "github-copilot") await oldAuth;
					return provider === "github-copilot" ? { auth: { apiKey: "resolved" } } : undefined;
				},
			},
			ui: {
				setStatus(_key: string, value: string | undefined) {
					statuses.push(value);
				},
			},
		}) as unknown as ExtensionContext;
	const oldStatuses: Array<string | undefined> = [];
	const newStatuses: Array<string | undefined> = [];
	const oldContext = makeContext(oldStatuses, true);
	const newContext = makeContext(newStatuses, false);

	piAuch(pi);
	await handlers.get("session_start")?.({ status: 0, headers: {} }, oldContext);
	const oldInterval = intervalCallbacks[0];
	await handlers.get("session_shutdown")?.({ status: 0, headers: {} }, oldContext);
	await handlers.get("session_start")?.({ status: 0, headers: {} }, newContext);
	await new Promise((resolve) => setImmediate(resolve));
	assert.match(newStatuses.at(-1) ?? "", /GH configured/);

	const oldRenderCount = oldStatuses.length;
	oldInterval?.();
	releaseOldAuth();
	await new Promise((resolve) => setImmediate(resolve));
	assert.equal(oldStatuses.length, oldRenderCount);
});
