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
	assert.equal(formatFooter("github-copilot", undefined), "Copilot …");
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

test("renders Codex 5h and weekly percentages with appropriate reset units", (t) => {
	t.mock.method(Date, "now", () => 1_000_000);
	const state: QuotaState = {
		status: "ready",
		stale: false,
		value: {
			provider: "openai-codex",
			fetchedAt: 1,
			metrics: [
				{ label: "5h", usedPercent: 12, resetAt: 1_000_000 + 4.54 * 3_600_000 },
				{ label: "weekly", usedPercent: 55, resetAt: 1_000_000 + 2.54 * 86_400_000 },
			],
		},
	};
	assert.equal(formatFooter("openai-codex", state), "Codex 5h 12%/4.5h · weekly 55%/2.5d");
	assert.equal(formatDetail("openai-codex", state), "Codex: 5h 12%/4.5h · weekly 55%/2.5d");
});

test("formats all configured providers and omits missing credentials", () => {
	const states = new Map([
		["openai-codex", unavailable],
		["github-copilot", ready([{ label: "chat", unlimited: true }])],
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

test("formats and prioritizes detailed Copilot metrics and reset units", (t) => {
	t.mock.method(Date, "now", () => 1_000_000);
	const state = ready([
		{ label: "other", remaining: 3, resetAt: 1_000_000 + 3 * 60_000 },
		{ label: "chat", unlimited: true },
		{
			label: "premium interactions",
			remaining: 8,
			limit: 10,
			resetAt: 1_000_000 + 3 * 3_600_000,
		},
		{ label: "completions", usedPercent: 20 },
		{ label: "unknown", resetAt: 1_000_000 + 30_000 },
	]);
	assert.equal(
		formatFooter("github-copilot", state),
		"Copilot premium interactions 8/10 left/3.0h · chat ∞",
	);
	assert.equal(
		formatDetail("github-copilot", state),
		"Copilot (pro): premium interactions 8/10 left/3.0h · chat ∞ · other 3 left/3m · completions 20% · unknown/30s",
	);
});

test("formats unavailable and stale details, including absent stale error", () => {
	assert.equal(
		formatDetail("github-copilot", unavailable),
		"Copilot: unavailable — not configured",
	);
	assert.match(
		formatDetail("github-copilot", ready([{ label: "chat", unlimited: true }], true)),
		/\[stale: offline\]$/,
	);
	const stale = ready([{ label: "chat", unlimited: true }], true);
	if (stale.status === "ready") delete stale.error;
	assert.match(formatDetail("github-copilot", stale), /\[stale\]$/);
});
