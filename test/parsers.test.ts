import assert from "node:assert/strict";
import test from "node:test";
import { parseCodexUsage, parseCopilotUsage, parseOpenCodeUsage } from "../src/parse.js";

test("parses Codex rolling and weekly windows", () => {
	const value = parseCodexUsage({
		plan_type: "plus",
		rate_limit: {
			primary_window: { used_percent: 12.4, reset_at: 1_800_000_000 },
			secondary_window: { used_percent: 55 },
		},
	});
	assert.equal(value.plan, "plus");
	assert.deepEqual(
		value.metrics.map(({ label, usedPercent }) => ({ label, usedPercent })),
		[
			{ label: "rolling", usedPercent: 12.4 },
			{ label: "weekly", usedPercent: 55 },
		],
	);
	assert.equal(value.metrics[0]?.resetAt, 1_800_000_000_000);
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

test("parses Copilot metered and unlimited quotas", () => {
	const value = parseCopilotUsage({
		copilot_plan: "individual",
		quota_reset_date: "2030-01-01T00:00:00Z",
		quota_snapshots: {
			premium_interactions: {
				entitlement: 300,
				quota_remaining: 240,
				percent_remaining: 80,
			},
			chat: { unlimited: true },
		},
	});
	assert.deepEqual(value.metrics[0], {
		label: "premium interactions",
		limit: 300,
		remaining: 240,
		usedPercent: 20,
		resetAt: Date.parse("2030-01-01T00:00:00Z"),
	});
	assert.equal(value.metrics[1]?.unlimited, true);
});

test("parses labeled OpenCode dashboard cards and ignores scripts", () => {
	const value = parseOpenCodeUsage(`
		<script>weekly 99%</script>
		<section><h2>Rolling</h2><span>12.5%</span></section>
		<section><h2>Weekly usage</h2><span>40%</span></section>
		<section><h2>Monthly</h2><span>100%</span></section>
	`);
	assert.deepEqual(
		value.metrics.map(({ label, usedPercent }) => ({ label, usedPercent })),
		[
			{ label: "rolling", usedPercent: 12.5 },
			{ label: "weekly", usedPercent: 40 },
			{ label: "monthly", usedPercent: 100 },
		],
	);
});

test("accepts Copilot remaining aliases, invalid reset dates, and skips malformed snapshots", () => {
	const value = parseCopilotUsage({
		quota_reset_date: "not-a-date",
		quota_snapshots: {
			bad: null,
			empty: {},
			negative: { entitlement: -1, remaining: -2 },
			remaining: { remaining: 3 },
		},
	});
	assert.deepEqual(
		value.metrics.map(({ label, remaining }) => ({ label, remaining })),
		[
			{ label: "negative", remaining: undefined },
			{ label: "remaining", remaining: 3 },
		],
	);
});

test("rejects malformed Copilot usage", () => {
	for (const input of [null, [], {}, { quota_snapshots: [] }]) {
		assert.throws(() => parseCopilotUsage(input), /invalid Copilot/);
	}
	assert.throws(() => parseCopilotUsage({ quota_snapshots: {} }), /no recognized/);
});

test("rejects an OpenCode login page or changed shape", () => {
	assert.throws(() => parseOpenCodeUsage("<html>Please sign in</html>"), /no recognized/);
});
