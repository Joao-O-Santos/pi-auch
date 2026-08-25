import type { ProviderId, QuotaMetric, QuotaResult } from "./types.js";

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | undefined {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as RecordValue)
		: undefined;
}

function finite(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function percent(value: unknown): number | undefined {
	const number = finite(value);
	return number !== undefined && number >= 0 && number <= 100 ? number : undefined;
}

function timestamp(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value) && value > 0) {
		return value < 10_000_000_000 ? value * 1000 : value;
	}
	if (typeof value === "string") {
		const parsed = Date.parse(value);
		return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
	}
	return undefined;
}

function result(provider: ProviderId, metrics: QuotaMetric[], plan?: unknown): QuotaResult {
	if (metrics.length === 0) throw new Error("usage response has no recognized quota fields");
	return {
		provider,
		fetchedAt: Date.now(),
		metrics,
		...(typeof plan === "string" && plan ? { plan } : {}),
	};
}

function codexLabel(window: RecordValue, fallback: "5h" | "weekly"): "5h" | "weekly" {
	const seconds = finite(window.limit_window_seconds);
	if (seconds === 18_000) return "5h";
	if (seconds === 604_800) return "weekly";
	return fallback;
}

function codexMetric(
	window: RecordValue | undefined,
	fallback: "5h" | "weekly",
): QuotaMetric | undefined {
	if (!window) return undefined;
	const usedPercent = percent(window.used_percent);
	if (usedPercent === undefined) return undefined;
	const absoluteReset = timestamp(window.reset_at);
	const resetAfter = finite(window.reset_after_seconds);
	const resetAt =
		absoluteReset ??
		(resetAfter !== undefined ? Date.now() + Math.max(0, resetAfter) * 1000 : undefined);
	return {
		label: codexLabel(window, fallback),
		usedPercent,
		...(resetAt !== undefined ? { resetAt } : {}),
	};
}

export function parseCodexUsage(value: unknown): QuotaResult {
	const root = record(value);
	const rateLimit = record(root?.rate_limit);
	if (!root || !rateLimit) throw new Error("invalid Codex usage response");

	const primary = record(rateLimit.primary_window);
	const secondary = record(rateLimit.secondary_window);
	const metrics = [
		codexMetric(primary, secondary ? "5h" : "weekly"),
		codexMetric(secondary, "weekly"),
	].filter((metric): metric is QuotaMetric => metric !== undefined);
	return result("openai-codex", metrics, root.plan_type);
}
