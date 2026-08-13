import assert from "node:assert/strict";
import test from "node:test";
import { QuotaCache } from "../src/cache.js";
import type { ProviderReader, QuotaResult } from "../src/types.js";

function sample(): QuotaResult {
	return {
		provider: "openai-codex",
		fetchedAt: 1,
		metrics: [{ label: "rolling", usedPercent: 20 }],
	};
}

test("reads, stores, and rejects unsupported providers", async () => {
	const cache = new QuotaCache([]);
	assert.equal(cache.get("openai-codex"), undefined);
	cache.store(sample());
	assert.equal(cache.get("openai-codex")?.status, "ready");
	assert.deepEqual(await cache.refresh("github-copilot"), {
		status: "unavailable",
		error: "unsupported provider",
	});
});

test("deduplicates concurrent provider refreshes and refreshes all", async () => {
	let calls = 0;
	let release: () => void = () => {};
	const gate = new Promise<void>((resolve) => (release = resolve));
	const reader: ProviderReader = {
		id: "openai-codex",
		async read() {
			calls++;
			await gate;
			return sample();
		},
	};
	const cache = new QuotaCache([reader]);
	const first = cache.refresh("openai-codex");
	const second = cache.refresh("openai-codex");
	assert.strictEqual(first, second);
	release();
	await first;
	assert.equal(calls, 1);
	assert.equal((await cache.refreshAll()).get("openai-codex")?.status, "ready");
});

test("retains successful data as stale after Error and unknown failures", async () => {
	let failure: unknown;
	const cache = new QuotaCache([
		{
			id: "openai-codex",
			async read() {
				if (failure !== undefined) throw failure;
				return sample();
			},
		},
	]);
	assert.equal((await cache.refresh("openai-codex")).status, "ready");
	for (const [thrown, expected] of [
		[new Error("network request failed"), "network request failed"],
		["bad", "quota refresh failed"],
	] as const) {
		failure = thrown;
		const state = await cache.refresh("openai-codex");
		assert.equal(state.status, "ready");
		if (state.status === "ready") {
			assert.equal(state.stale, true);
			assert.equal(state.error, expected);
		}
	}
});

test("reports an initial reader failure as unavailable", async () => {
	const cache = new QuotaCache([
		{
			id: "openai-codex",
			async read() {
				throw new Error("nope");
			},
		},
	]);
	assert.deepEqual(await cache.refresh("openai-codex"), {
		status: "unavailable",
		error: "nope",
	});
});

test("abort cancels active readers and is harmless while idle", async () => {
	let aborted = false;
	const cache = new QuotaCache([
		{
			id: "openai-codex",
			read(signal) {
				return new Promise((_resolve, reject) =>
					signal.addEventListener(
						"abort",
						() => {
							aborted = true;
							reject(new Error("cancelled"));
						},
						{ once: true },
					),
				);
			},
		},
	]);
	const pending = cache.refresh("openai-codex");
	cache.abort();
	await pending;
	cache.abort();
	assert.equal(aborted, true);
});
