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

test("OpenCode reader reports configuration, passive usage, and configuration errors", async (t) => {
	const oldConfig = process.env.OPENCODE_GO_QUOTA_CONFIG;
	const oldWorkspace = process.env.OPENCODE_GO_WORKSPACE_ID;
	const oldCookie = process.env.OPENCODE_GO_AUTH_COOKIE;
	process.env.OPENCODE_GO_QUOTA_CONFIG = "/definitely/missing/pi-auch.json";
	delete process.env.OPENCODE_GO_WORKSPACE_ID;
	delete process.env.OPENCODE_GO_AUTH_COOKIE;
	t.after(() => {
		if (oldConfig === undefined) delete process.env.OPENCODE_GO_QUOTA_CONFIG;
		else process.env.OPENCODE_GO_QUOTA_CONFIG = oldConfig;
		if (oldWorkspace === undefined) delete process.env.OPENCODE_GO_WORKSPACE_ID;
		else process.env.OPENCODE_GO_WORKSPACE_ID = oldWorkspace;
		if (oldCookie === undefined) delete process.env.OPENCODE_GO_AUTH_COOKIE;
		else process.env.OPENCODE_GO_AUTH_COOKIE = oldCookie;
	});
	const openCode = reader({ "opencode-go": { apiKey: "resolved" } }, 2);
	assert.equal((await openCode.read(new AbortController().signal)).metrics[0]?.label, "configured");
	const passive = {
		provider: "opencode-go" as const,
		fetchedAt: 1,
		metrics: [{ label: "available" }],
	};
	const passiveReader = createReaders(
		async (provider) => (provider === "opencode-go" ? { apiKey: "resolved" } : undefined),
		(provider) => (provider === "opencode-go" ? passive : undefined),
	)[2];
	assert.ok(passiveReader);
	assert.strictEqual(await passiveReader.read(new AbortController().signal), passive);
	process.env.OPENCODE_GO_WORKSPACE_ID = "only-one";
	await assert.rejects(openCode.read(new AbortController().signal), /needs/);
	await assert.rejects(reader({}, 2).read(new AbortController().signal), /not configured/);
});

test("OpenCode reader uses explicitly configured dashboard cookie", async (t) => {
	const oldWorkspace = process.env.OPENCODE_GO_WORKSPACE_ID;
	const oldCookie = process.env.OPENCODE_GO_AUTH_COOKIE;
	process.env.OPENCODE_GO_WORKSPACE_ID = "space/id";
	process.env.OPENCODE_GO_AUTH_COOKIE = "browser-cookie";
	t.after(() => {
		if (oldWorkspace === undefined) delete process.env.OPENCODE_GO_WORKSPACE_ID;
		else process.env.OPENCODE_GO_WORKSPACE_ID = oldWorkspace;
		if (oldCookie === undefined) delete process.env.OPENCODE_GO_AUTH_COOKIE;
		else process.env.OPENCODE_GO_AUTH_COOKIE = oldCookie;
	});
	await withFetch(
		new Response("<h2>Rolling</h2><b>8%</b>", {
			headers: { "content-type": "text/html" },
		}),
		async (calls) => {
			const openCode = reader({ "opencode-go": { apiKey: "resolved" } }, 2);
			assert.equal((await openCode.read(new AbortController().signal)).provider, "opencode-go");
			assert.equal(calls[0]?.url, "https://opencode.ai/workspace/space%2Fid/go");
			assert.equal(new Headers(calls[0]?.init?.headers).get("cookie"), "auth=browser-cookie");
			assert.equal(new Headers(calls[0]?.init?.headers).get("authorization"), null);
		},
	);
});
