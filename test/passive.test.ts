import assert from "node:assert/strict";
import test from "node:test";
import { parseCopilotHeaders, parseOpenCodeGoHeaders } from "../src/passive.js";

test("parses Copilot premium request quota case-insensitively", () => {
	const value = parseCopilotHeaders(
		{
			"X-Copilot-Premium-Requests-Limit": "100",
			"x-copilot-premium-requests-remaining": "75",
			"x-copilot-premium-requests-reset-after": "60",
		},
		200,
	);
	assert.deepEqual(
		value?.metrics.map(({ label, usedPercent }) => ({ label, usedPercent })),
		[{ label: "premium requests", usedPercent: 25 }],
	);
	assert.ok((value?.metrics[0]?.resetAt ?? 0) > Date.now());
});

test("parses explicit percentages, reset dates, and retry limits", () => {
	const dated = parseCopilotHeaders(
		{
			"x-copilot-premium-requests-usage-percent": "110",
			"x-copilot-premium-requests-reset-at": "2030-01-01T00:00:00Z",
		},
		200,
	);
	assert.equal(dated?.metrics[0]?.usedPercent, 100);
	assert.equal(dated?.metrics[0]?.resetAt, Date.parse("2030-01-01T00:00:00Z"));
	const limited = parseCopilotHeaders({ "retry-after": "2" }, 429);
	assert.equal(limited?.metrics[0]?.label, "rate limited");
	assert.ok((limited?.metrics[0]?.resetAt ?? 0) > Date.now());
	assert.equal(parseCopilotHeaders({ "x-copilot-premium-requests-limit": " " }, 204), undefined);
	assert.equal(parseCopilotHeaders({}, 500), undefined);
});

test("parses OpenCode quota header spellings and passive statuses", () => {
	const value = parseOpenCodeGoHeaders(
		{
			"x-opencode-go-rolling-used-percent": "12",
			"x-opencode-quota-weekly-remaining": "30",
			"x-opencode-quota-weekly-limit": "100",
			"x-opencode-monthly-reset-after-seconds": "0",
		},
		200,
	);
	assert.deepEqual(
		value?.metrics.map((metric) => metric.label),
		["rolling", "weekly", "monthly"],
	);
	assert.equal(value?.metrics[1]?.usedPercent, 70);
	assert.equal(parseOpenCodeGoHeaders({}, 429)?.metrics[0]?.label, "rate limited");
	assert.equal(parseOpenCodeGoHeaders({}, 201), undefined);
	assert.equal(parseOpenCodeGoHeaders({}, 401), undefined);
});
