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
	assert.equal(formatFooter("github-copilot", undefined), "GH…");
	assert.equal(formatFooter("github-copilot", unavailable), "GH—");
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
		"Cdx 😬 ohhh 55% ~",
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
	assert.equal(formatFooter("openai-codex", state), "Cdx 🙂 nice 12%/5h - 😬 ohhh 55%/3d");
	assert.equal(
		formatDetail("openai-codex", state),
		"Codex: 🙂 nice 5h 12%/4.5h · 😬 ohhh weekly 55%/2.5d",
	);
	assert.equal(
		formatFooter("openai-codex", state, (color, text) => `[${color}:${text}]`),
		"Cdx [success:🙂 nice] 12%/5h - [warning:😬 ohhh] 55%/3d",
	);
});

test("formats all configured providers and omits missing credentials", () => {
	const states = new Map([
		["openai-codex", unavailable],
		["github-copilot", ready([{ label: "chat", unlimited: true }])],
	] as const);
	assert.equal(formatConfiguredFooter(states), "Cdx— | GH 🙂 nice ∞");
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
	assert.equal(formatFooter("github-copilot", state), "GH 🙂 nice 8/10/3h - 🙂 nice ∞");
	assert.equal(
		formatDetail("github-copilot", state),
		"Copilot (pro): 🙂 nice premium interactions 8/10 left/3.0h · 🙂 nice chat ∞ · other 3 left/3m · 🙂 nice completions 20% · unknown/30s",
	);
});

test("weights pain by quota use and time until the matching reset", (t) => {
	t.mock.method(Date, "now", () => 1_000_000);
	const state: QuotaState = {
		status: "ready",
		stale: false,
		value: {
			provider: "openai-codex",
			fetchedAt: 1,
			metrics: [
				{ label: "5h", usedPercent: 49, resetAt: 1_000_000 + 5 * 3_600_000 },
				{ label: "weekly", usedPercent: 49, resetAt: 1_000_000 + 7 * 86_400_000 },
			],
		},
	};
	assert.equal(formatFooter("openai-codex", state), "Cdx 😬 ohhh 49%/5h - 😬 ohhh 49%/7d");
	assert.equal(
		formatFooter("openai-codex", {
			...state,
			value: { ...state.value, metrics: [{ label: "5h", usedPercent: 95 }] },
		}),
		"Cdx 😭 AUCH!! 95%",
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
