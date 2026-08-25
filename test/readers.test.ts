import assert from "node:assert/strict";
import test from "node:test";
import { createReaders, type ProviderAuth } from "../src/readers.js";

function jwt(accountId?: string): string {
	const payload = accountId
		? { "https://api.openai.com/auth": { chatgpt_account_id: accountId } }
		: {};
	return `x.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.x`;
}

async function withFetch(
	response: Response,
	run: (calls: Array<{ url: string; init?: RequestInit }>) => Promise<void>,
): Promise<void> {
	const original = globalThis.fetch;
	const calls: Array<{ url: string; init?: RequestInit }> = [];
	globalThis.fetch = async (input, init) => {
		calls.push({ url: String(input), ...(init ? { init } : {}) });
		return response;
	};
	try {
		await run(calls);
	} finally {
		globalThis.fetch = original;
	}
}

function readers(auth: Partial<Record<string, ProviderAuth>>) {
	return createReaders(async (provider) => auth[provider]);
}

function reader(auth: Partial<Record<string, ProviderAuth>>, index: number) {
	const value = readers(auth)[index];
	assert.ok(value);
	return value;
}

test("Codex reader uses Pi-resolved auth and account claim", async () => {
	await withFetch(
		new Response('{"rate_limit":{"secondary_window":{"used_percent":12}}}', {
			headers: { "content-type": "application/json" },
		}),
		async (calls) => {
			const codex = reader({ "openai-codex": { apiKey: jwt("acct-1") } }, 0);
			const value = await codex.read(new AbortController().signal);
			assert.equal(value.provider, "openai-codex");
			assert.equal(calls[0]?.url, "https://chatgpt.com/backend-api/wham/usage");
			assert.equal(new Headers(calls[0]?.init?.headers).get("chatgpt-account-id"), "acct-1");
		},
	);
});

test("Codex reader rejects absent and malformed credentials", async () => {
	const absent = reader({}, 0);
	await assert.rejects(absent.read(new AbortController().signal), /not configured/);
	for (const apiKey of ["not-a-jwt", jwt()]) {
		const malformed = reader({ "openai-codex": { apiKey } }, 0);
		await assert.rejects(malformed.read(new AbortController().signal), /no account ID/);
	}
});

test("Copilot reader reports configuration and preserves passive usage without a probe", async () => {
	const configured = reader({ "github-copilot": { apiKey: "resolved" } }, 1);
	assert.equal(
		(await configured.read(new AbortController().signal)).metrics[0]?.label,
		"configured",
	);

	const passive = {
		provider: "github-copilot" as const,
		fetchedAt: 1,
		metrics: [{ label: "requests", usedPercent: 20 }],
	};
	const copilot = createReaders(
		async (provider) => (provider === "github-copilot" ? { apiKey: "resolved" } : undefined),
		(provider) => (provider === "github-copilot" ? passive : undefined),
	)[1];
	assert.ok(copilot);
	assert.strictEqual(await copilot.read(new AbortController().signal), passive);
	await assert.rejects(reader({}, 1).read(new AbortController().signal), /not configured/);
});
