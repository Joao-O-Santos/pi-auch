import type { ProviderId, QuotaMetric, QuotaResult } from "./types.js";

// Header conventions adapted from pi-usage (MIT); see THIRD_PARTY_NOTICES.md.

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
	const rawLimit = number(headers, `${prefix}-limit`);
	const rawRemaining = number(headers, `${prefix}-remaining`);
	const rawUsed = number(headers, `${prefix}-used`);
	const limit = rawLimit !== undefined && rawLimit >= 0 ? rawLimit : undefined;
	const remaining = rawRemaining !== undefined && rawRemaining >= 0 ? rawRemaining : undefined;
	const used = rawUsed !== undefined && rawUsed >= 0 ? rawUsed : undefined;
	const explicitPercent = number(headers, `${prefix}-used-percent`, `${prefix}-usage-percent`);
	const remainingPercent = number(headers, `${prefix}-remaining-percent`);
	const usedPercent =
		explicitPercent ??
		(remainingPercent !== undefined
			? 100 - remainingPercent
			: limit !== undefined && limit > 0 && (used !== undefined || remaining !== undefined)
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

/** Fallback signal for a rate-limited response with no recognized quota metrics. */
function rateLimited(headers: Record<string, string>, provider: ProviderId): QuotaResult {
	const retry = number(headers, "retry-after");
	return result(provider, [
		{
			label: "rate limited",
			...(retry !== undefined ? { resetAt: Date.now() + Math.max(0, retry) * 1000 } : {}),
		},
	]);
}

export function parseCopilotHeaders(
	headers: Record<string, string>,
	status: number,
): QuotaResult | undefined {
	const metrics = [
		metric(headers, "x-copilot-premium-requests", "premium"),
		metric(headers, "x-ratelimit", "requests"),
	].filter((value): value is QuotaMetric => value !== undefined);
	if (metrics.length > 0) return result("github-copilot", metrics);
	if (status === 429) return rateLimited(headers, "github-copilot");
	return undefined;
}
