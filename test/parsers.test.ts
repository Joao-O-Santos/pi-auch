import assert from "node:assert/strict";
import test from "node:test";
import { parseCodexUsage } from "../src/parse.js";

test("parses Codex 5h and weekly windows from their durations", (t) => {
	t.mock.method(Date, "now", () => 1_000_000);
	const value = parseCodexUsage({
		plan_type: "plus",
		rate_limit: {
			primary_window: {
				used_percent: 12.4,
				limit_window_seconds: 18_000,
				reset_at: 0,
				reset_after_seconds: 60,
			},
			secondary_window: {
				used_percent: 55,
				limit_window_seconds: 604_800,
				reset_at: 1_800_000_000,
			},
		},
	});
	assert.equal(value.plan, "plus");
	assert.deepEqual(value.metrics, [
		{ label: "5h", usedPercent: 12.4, resetAt: 1_060_000 },
		{ label: "weekly", usedPercent: 55, resetAt: 1_800_000_000_000 },
	]);
});

test("uses Codex response position as a fallback for missing durations", () => {
	const paired = parseCodexUsage({
		rate_limit: {
			primary_window: { used_percent: 12.4 },
			secondary_window: { used_percent: 55 },
		},
	});
	assert.deepEqual(
		paired.metrics.map(({ label, usedPercent }) => ({ label, usedPercent })),
		[
			{ label: "5h", usedPercent: 12.4 },
			{ label: "weekly", usedPercent: 55 },
		],
	);

	const single = parseCodexUsage({
		rate_limit: { primary_window: { used_percent: 12.4, reset_at: "2030-01-01T00:00:00Z" } },
	});
	assert.deepEqual(single.metrics, [
		{ label: "weekly", usedPercent: 12.4, resetAt: Date.parse("2030-01-01T00:00:00Z") },
	]);
});

test("uses an explicit 5h duration even when it is the only Codex window", () => {
	const value = parseCodexUsage({
		rate_limit: {
			primary_window: { used_percent: 4, limit_window_seconds: 18_000 },
		},
	});
	assert.equal(value.metrics[0]?.label, "5h");
});

test("rejects malformed Codex usage", () => {
	for (const input of [null, [], {}, { rate_limit: [] }]) {
		assert.throws(() => parseCodexUsage(input), /invalid Codex/);
	}
	assert.throws(
		() =>
			parseCodexUsage({
				rate_limit: { primary_window: { used_percent: 101 } },
			}),
		/no recognized/,
	);
});
