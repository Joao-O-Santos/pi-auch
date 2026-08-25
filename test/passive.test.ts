import assert from "node:assert/strict";
import test from "node:test";
import { parseCopilotHeaders } from "../src/passive.js";

test("parses detailed Copilot premium and request limits case-insensitively", () => {
	const value = parseCopilotHeaders(
		{
			"X-Copilot-Premium-Requests-Limit": "100",
			"x-copilot-premium-requests-remaining": "75",
			"x-copilot-premium-requests-reset-after": "60",
			"X-RateLimit-Limit": "200",
			"x-ratelimit-used": "50",
			"x-ratelimit-reset": "1800000000",
		},
		200,
	);
	assert.deepEqual(
		value?.metrics.map(({ label, limit, remaining, usedPercent }) => ({
			label,
			limit,
			remaining,
			usedPercent,
		})),
		[
			{ label: "premium", limit: 100, remaining: 75, usedPercent: 25 },
			{ label: "requests", limit: 200, remaining: undefined, usedPercent: 25 },
		],
	);
	assert.ok((value?.metrics[0]?.resetAt ?? 0) > Date.now());
	assert.equal(value?.metrics[1]?.resetAt, 1_800_000_000_000);
});

test("parses Copilot percentage variants, reset dates, and retry limits", () => {
	const dated = parseCopilotHeaders(
		{
			"x-copilot-premium-requests-usage-percent": "110",
			"x-copilot-premium-requests-reset-at": "2030-01-01T00:00:00Z",
		},
		200,
	);
	assert.equal(dated?.metrics[0]?.usedPercent, 100);
	assert.equal(dated?.metrics[0]?.resetAt, Date.parse("2030-01-01T00:00:00Z"));

	const remaining = parseCopilotHeaders(
		{ "x-copilot-premium-requests-remaining-percent": "60" },
		200,
	);
	assert.equal(remaining?.metrics[0]?.usedPercent, 40);

	const limited = parseCopilotHeaders({ "retry-after": "2" }, 429);
	assert.equal(limited?.metrics[0]?.label, "rate limited");
	assert.ok((limited?.metrics[0]?.resetAt ?? 0) > Date.now());
	assert.equal(parseCopilotHeaders({ "x-copilot-premium-requests-limit": " " }, 204), undefined);
	assert.equal(
		parseCopilotHeaders(
			{
				"x-copilot-premium-requests-limit": "-1",
				"x-copilot-premium-requests-remaining": "-2",
				"x-copilot-premium-requests-used": "-3",
			},
			200,
		),
		undefined,
	);
	assert.equal(parseCopilotHeaders({}, 500), undefined);
});
