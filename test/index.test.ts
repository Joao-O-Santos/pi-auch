import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import piAuch from "../src/index.js";

type Handler = (event: never, context: ExtensionContext) => Promise<void>;
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
	const originalSetInterval = globalThis.setInterval;
	globalThis.setInterval = ((callback: () => void) => {
		intervalCallback = callback;
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
	assert.deepEqual([...handlers.keys()], ["session_start", "session_shutdown"]);
	assert.ok(command);

	await command("", context);
	assert.equal(notices.at(-1)?.level, "warning");
	const shutdown = handlers.get("session_shutdown");
	assert.ok(shutdown);
	await shutdown({} as never, context);

	const originalFetch = globalThis.fetch;
	globalThis.fetch = async () =>
		new Response(
			JSON.stringify({
				quota_snapshots: {
					chat: { unlimited: true },
				},
			}),
			{ headers: { "content-type": "application/json" } },
		);
	t.after(() => {
		globalThis.fetch = originalFetch;
	});
	await handlers.get("session_start")?.({} as never, context);
	await handlers.get("session_start")?.({} as never, context);
	intervalCallback?.();
	await new Promise((resolve) => setImmediate(resolve));
	assert.match(statuses.at(-1) ?? "", /Copilot chat ∞/);

	await command("", context);
	assert.equal(notices.at(-1)?.level, "info");
	assert.match(notices.at(-1)?.message ?? "", /Codex: unavailable/);

	await shutdown({} as never, context);
	assert.equal(statuses.at(-1), undefined);
});
