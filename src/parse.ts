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
	if (typeof value === "number" && Number.isFinite(value)) {
		return value < 10_000_000_000 ? value * 1000 : value;
	}
	if (typeof value === "string") {
		const parsed = Date.parse(value);
		return Number.isFinite(parsed) ? parsed : undefined;
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

export function parseCodexUsage(value: unknown): QuotaResult {
	const root = record(value);
	const rateLimit = record(root?.rate_limit);
	if (!root || !rateLimit) throw new Error("invalid Codex usage response");

	const metrics: QuotaMetric[] = [];
	for (const [key, label] of [
		["primary_window", "rolling"],
		["secondary_window", "weekly"],
	] as const) {
		const window = record(rateLimit[key]);
		if (!window) continue;
		const usedPercent = percent(window.used_percent);
		if (usedPercent === undefined) continue;
		const resetAt = timestamp(window.reset_at);
		metrics.push({
			label,
			usedPercent,
			...(resetAt !== undefined ? { resetAt } : {}),
		});
	}
	return result("openai-codex", metrics, root.plan_type);
}

function decodeEntities(text: string): string {
	return text
		.replaceAll(/&nbsp;|&#160;/gi, " ")
		.replaceAll(/&amp;/gi, "&")
		.replaceAll(/&lt;/gi, "<")
		.replaceAll(/&gt;/gi, ">");
}

export function parseOpenCodeUsage(html: string): QuotaResult {
	const metrics: QuotaMetric[] = [];
	for (const label of ["rolling", "weekly", "monthly"] as const) {
		const embedded = new RegExp(`${label}Usage:\\$R\\[\\d+\\]=\\{([^}]*)\\}`).exec(html)?.[1];
		const usage = embedded ? /usagePercent:(\d+(?:\.\d+)?)/.exec(embedded)?.[1] : undefined;
		if (!usage) continue;
		const usedPercent = Number(usage);
		if (usedPercent < 0 || usedPercent > 100) continue;
		const reset = /resetInSec:(\d+(?:\.\d+)?)/.exec(embedded ?? "")?.[1];
		metrics.push({
			label,
			usedPercent,
			...(reset ? { resetAt: Date.now() + Number(reset) * 1000 } : {}),
		});
	}

	const text = decodeEntities(
		html
			.replaceAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
			.replaceAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
			.replaceAll(/<[^>]+>/g, " "),
	).replaceAll(/\s+/g, " ");

	for (const label of ["rolling", "weekly", "monthly"] as const) {
		if (metrics.some((metric) => metric.label === label)) continue;
		const match = text.match(
			new RegExp(`\\b${label}\\b[^%]{0,100}?((?:100|\\d{1,2})(?:\\.\\d+)?)\\s*%`, "i"),
		);
		if (!match?.[1]) continue;
		const usedPercent = Number(match[1]);
		if (usedPercent >= 0 && usedPercent <= 100) metrics.push({ label, usedPercent });
	}
	return result("opencode-go", metrics);
}
