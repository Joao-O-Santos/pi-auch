import type { ProviderId, QuotaMetric, QuotaResult } from "./types.js";

// Header families and quota-window conventions adapted from pi-usage (MIT); see THIRD_PARTY_NOTICES.md.

function header(headers: Record<string, string>, name: string): string | undefined {
	const target = name.toLowerCase();
	return Object.entries(headers).find(([key]) => key.toLowerCase() === target)?.[1];
}

function number(headers: Record<string, string>, ...names: string[]): number | undefined {
	for (const name of names) {
		const value = header(headers, name);
		if (!value?.trim()) continue;
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return undefined;
}

function resetAt(headers: Record<string, string>, prefix: string): number | undefined {
	const raw = header(headers, `${prefix}-reset-at`) ?? header(headers, `${prefix}-reset`);
	if (raw) {
		const numeric = Number(raw);
		if (Number.isFinite(numeric) && numeric > 0)
			return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
		const parsed = Date.parse(raw);
		if (Number.isFinite(parsed)) return parsed;
	}
	const after = number(headers, `${prefix}-reset-after-seconds`, `${prefix}-reset-after`);
	return after !== undefined ? Date.now() + Math.max(0, after) * 1000 : undefined;
}

function metric(
	headers: Record<string, string>,
	prefix: string,
	label: string,
): QuotaMetric | undefined {
	const limit = number(headers, `${prefix}-limit`);
	const remaining = number(headers, `${prefix}-remaining`);
	const used = number(headers, `${prefix}-used`);
	const explicitPercent = number(headers, `${prefix}-used-percent`, `${prefix}-usage-percent`);
	const usedPercent =
		explicitPercent ??
		(limit !== undefined && limit > 0 && (used !== undefined || remaining !== undefined)
			? ((used ?? limit - (remaining ?? limit)) / limit) * 100
			: undefined);
	const reset = resetAt(headers, prefix);
	if (
		limit === undefined &&
		remaining === undefined &&
		usedPercent === undefined &&
		reset === undefined
	) {
		return undefined;
	}
	return {
		label,
		...(limit !== undefined ? { limit } : {}),
		...(remaining !== undefined ? { remaining } : {}),
		...(usedPercent !== undefined ? { usedPercent: Math.max(0, Math.min(100, usedPercent)) } : {}),
		...(reset !== undefined ? { resetAt: reset } : {}),
	};
}

function result(provider: ProviderId, metrics: QuotaMetric[]): QuotaResult {
	return { provider, fetchedAt: Date.now(), metrics };
}

export function parseCopilotHeaders(
	headers: Record<string, string>,
	status: number,
): QuotaResult | undefined {
	const metrics = [
		metric(headers, "x-copilot-premium-requests", "premium requests"),
		metric(headers, "x-ratelimit", "requests"),
	].filter((value): value is QuotaMetric => value !== undefined);
	if (metrics.length > 0) return result("github-copilot", metrics);
	if (status === 429) {
		const retry = number(headers, "retry-after");
		return result("github-copilot", [
			{
				label: "rate limited",
				...(retry !== undefined ? { resetAt: Date.now() + Math.max(0, retry) * 1000 } : {}),
			},
		]);
	}
	return undefined;
}

function goMetric(headers: Record<string, string>, window: string): QuotaMetric | undefined {
	for (const prefix of ["x-opencode-go", "x-opencode"]) {
		const value =
			metric(headers, `${prefix}-${window}`, window) ??
			metric(headers, `${prefix}-quota-${window}`, window);
		if (value) return value;
	}
	return undefined;
}

export function parseOpenCodeGoHeaders(
	headers: Record<string, string>,
	status: number,
): QuotaResult | undefined {
	const metrics = ["rolling", "weekly", "monthly"]
		.map((window) => goMetric(headers, window))
		.filter((value): value is QuotaMetric => value !== undefined);
	if (metrics.length > 0) return result("opencode-go", metrics);
	if (status === 429) return result("opencode-go", [{ label: "rate limited" }]);
	return undefined;
}
