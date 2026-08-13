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
	let provider: string | undefined = "openai-codex";
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
		model: { provider },
		modelRegistry: {
			async getProviderAuth() {
				return undefined;
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
	assert.deepEqual([...handlers.keys()], ["session_start", "model_select", "session_shutdown"]);
	assert.ok(command);

	await command("", context);
	assert.equal(notices.at(-1)?.level, "warning");

	await handlers.get("session_start")?.({} as never, context);
	await handlers.get("session_start")?.({} as never, context);
	intervalCallback?.();
	await new Promise((resolve) => setImmediate(resolve));
	assert.match(statuses.at(-1) ?? "", /^Codex/);

	await handlers.get("model_select")?.({ model: { provider: "openai-codex" } } as never, context);
	assert.match(statuses.at(-1) ?? "", /^Codex/);

	provider = "anthropic";
	await handlers.get("model_select")?.({ model: { provider } } as never, context);
	assert.equal(statuses.at(-1), undefined);

	await command("", context);
	assert.equal(notices.at(-1)?.level, "warning");
	assert.match(notices.at(-1)?.message ?? "", /Codex: unavailable/);

	await handlers.get("session_shutdown")?.({} as never, context);
	assert.equal(statuses.at(-1), undefined);
});
