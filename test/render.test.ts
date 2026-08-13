import assert from "node:assert/strict";
import test from "node:test";
import { formatDetail, formatFooter, providerForModel } from "../src/render.js";
import type { QuotaMetric, QuotaState } from "../src/types.js";

const unavailable: QuotaState = {
	status: "unavailable",
	error: "not configured",
};

function ready(metrics: QuotaMetric[], stale = false): QuotaState {
	return {
		status: "ready",
		stale,
		...(stale ? { error: "offline" } : {}),
		value: {
			provider: "github-copilot",
			fetchedAt: 1,
			plan: "pro",
			metrics,
		},
	};
}

test("selects only supported active providers", () => {
	for (const provider of ["openai-codex", "github-copilot", "opencode-go"] as const) {
		assert.equal(providerForModel(provider), provider);
	}
	assert.equal(providerForModel("anthropic"), undefined);
	assert.equal(providerForModel(undefined), undefined);
});

test("renders loading, unavailable, and compact stale footer states", () => {
	assert.equal(formatFooter("opencode-go", undefined), "Go …");
	assert.equal(formatFooter("github-copilot", unavailable), "Copilot unavailable");
	assert.equal(
		formatFooter("openai-codex", {
			status: "ready",
			stale: true,
			error: "network request failed",
			value: {
				provider: "openai-codex",
				fetchedAt: 1,
				metrics: [
					{ label: "rolling", usedPercent: 12.4 },
					{ label: "weekly", usedPercent: 55 },
				],
			},
		}),
		"Codex rolling 12% · weekly 55% (stale)",
	);
});

test("formats and prioritizes every metric representation", () => {
	const state = ready([
		{ label: "other", remaining: 3 },
		{ label: "chat", unlimited: true },
		{ label: "premium interactions", remaining: 8, limit: 10 },
		{ label: "completions", usedPercent: 20 },
		{ label: "unknown" },
	]);
	assert.equal(
		formatFooter("github-copilot", state),
		"Copilot premium interactions 8/10 left · chat ∞",
	);
	assert.equal(
		formatDetail("github-copilot", state),
		"Copilot (pro): premium interactions 8/10 left · chat ∞ · other 3 left · completions 20% · unknown",
	);
});

test("formats unavailable and stale details, including absent stale error", () => {
	assert.equal(formatDetail("opencode-go", unavailable), "Go: unavailable — not configured");
	assert.match(
		formatDetail("github-copilot", ready([{ label: "chat", unlimited: true }], true)),
		/\[stale: offline\]$/,
	);
	const stale = ready([{ label: "chat", unlimited: true }], true);
	if (stale.status === "ready") delete stale.error;
	assert.match(formatDetail("github-copilot", stale), /\[stale\]$/);
});
