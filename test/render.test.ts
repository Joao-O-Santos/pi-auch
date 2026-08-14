import assert from "node:assert/strict";
import test from "node:test";
import { formatConfiguredFooter, formatDetail, formatFooter } from "../src/render.js";
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

test("renders loading, unavailable, and label-free single-metric footer states", () => {
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
				metrics: [{ label: "weekly", usedPercent: 55 }],
			},
		}),
		"Codex 55% (stale)",
	);
});

test("keeps window labels when a provider reports multiple metrics", () => {
	const state: QuotaState = {
		status: "ready",
		stale: false,
		value: {
			provider: "opencode-go",
			fetchedAt: 1,
			metrics: [
				{ label: "rolling", usedPercent: 12 },
				{ label: "weekly", usedPercent: 40 },
				{ label: "monthly", usedPercent: 100 },
			],
		},
	};
	assert.equal(formatFooter("opencode-go", state), "Go rolling 12% · weekly 40%");
	assert.equal(formatDetail("opencode-go", state), "Go: rolling 12% · weekly 40% · monthly 100%");
});

test("formats all configured providers and omits missing credentials", () => {
	const states = new Map([
		["openai-codex", unavailable],
		["github-copilot", ready([{ label: "chat", unlimited: true }])],
		["opencode-go", { status: "unavailable", error: "OpenCode Go is not configured" }],
	] as const);
	assert.equal(formatConfiguredFooter(states), "Codex unavailable | Copilot ∞");
	assert.equal(
		formatConfiguredFooter(
			new Map([
				["openai-codex", { status: "unavailable", error: "Codex is not configured" }],
			] as const),
		),
		undefined,
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
