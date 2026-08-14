import assert from "node:assert/strict";
import test from "node:test";
import { parseCodexUsage, parseOpenCodeUsage } from "../src/parse.js";

test("parses Codex weekly window only", () => {
	const value = parseCodexUsage({
		plan_type: "plus",
		rate_limit: {
			primary_window: { used_percent: 12.4 },
			secondary_window: { used_percent: 55, reset_at: 1_800_000_000 },
		},
	});
	assert.equal(value.plan, "plus");
	assert.deepEqual(
		value.metrics.map(({ label, usedPercent }) => ({ label, usedPercent })),
		[{ label: "weekly", usedPercent: 55 }],
	);
	assert.equal(value.metrics[0]?.resetAt, 1_800_000_000_000);
});

test("uses Codex primary window when it is the only quota window", () => {
	const value = parseCodexUsage({
		rate_limit: {
			primary_window: { used_percent: 12.4, reset_at: 1_800_000_000 },
		},
	});
	assert.deepEqual(value.metrics, [
		{ label: "weekly", usedPercent: 12.4, resetAt: 1_800_000_000_000 },
	]);
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

test("parses OpenCode dashboard embedded quota data", () => {
	const before = Date.now();
	const value = parseOpenCodeUsage(
		"rollingUsage:$R[1]={usagePercent:9.5,resetInSec:60} weeklyUsage:$R[2]={usagePercent:20}",
	);
	assert.equal(value.metrics[0]?.usedPercent, 9.5);
	assert.ok((value.metrics[0]?.resetAt ?? 0) >= before + 60_000);
	assert.equal(value.metrics[1]?.usedPercent, 20);
});

test("rejects an OpenCode login page or changed shape", () => {
	for (const html of ["<html>Please sign in</html>", "rollingUsage:$R[1]={usagePercent:101}"]) {
		assert.throws(() => parseOpenCodeUsage(html), /no recognized/);
	}
});
