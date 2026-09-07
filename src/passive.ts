import type { ProviderId, QuotaMetric, QuotaResult } from "./types.js";

// Header conventions adapted from pi-usage (MIT); see THIRD_PARTY_NOTICES.md.

type HeaderLookup = Record<string, string>;

function normalizeHeaders(headers: Record<string, string>): HeaderLookup {
	const normalized: HeaderLookup = Object.create(null);
	for (const [key, value] of Object.entries(headers)) {
		const name = key.toLowerCase();
		if (!Object.hasOwn(normalized, name)) normalized[name] = value;
	}
	return normalized;
}

function header(headers: HeaderLookup, name: string): string | undefined {
	return headers[name.toLowerCase()];
}

function number(headers: HeaderLookup, ...names: string[]): number | undefined {
	for (const name of names) {
		const value = header(headers, name);
		if (!value?.trim()) continue;
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return undefined;
}

function resetAt(headers: HeaderLookup, prefix: string, now: number): number | undefined {
	const raw = header(headers, `${prefix}-reset-at`) ?? header(headers, `${prefix}-reset`);
	if (raw) {
		const numeric = Number(raw);
		if (Number.isFinite(numeric) && numeric > 0)
			return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
		const parsed = Date.parse(raw);
		if (Number.isFinite(parsed)) return parsed;
	}
	const after = number(headers, `${prefix}-reset-after-seconds`, `${prefix}-reset-after`);
	return after !== undefined ? now + Math.max(0, after) * 1000 : undefined;
}

function metric(
	headers: HeaderLookup,
	prefix: string,
	label: string,
	now: number,
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
	const reset = resetAt(headers, prefix, now);
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

function result(provider: ProviderId, metrics: QuotaMetric[], now: number): QuotaResult {
	return { provider, fetchedAt: now, metrics };
}

/** Fallback signal for a rate-limited response with no recognized quota metrics. */
function rateLimited(headers: HeaderLookup, provider: ProviderId, now: number): QuotaResult {
	const retry = number(headers, "retry-after");
	return result(
		provider,
		[
			{
				label: "rate limited",
				...(retry !== undefined ? { resetAt: now + Math.max(0, retry) * 1000 } : {}),
			},
		],
		now,
	);
}

export function parseCopilotHeaders(
	headers: Record<string, string>,
	status: number,
): QuotaResult | undefined {
	const normalized = normalizeHeaders(headers);
	const now = Date.now();
	const metrics = [
		metric(normalized, "x-copilot-premium-requests", "premium", now),
		metric(normalized, "x-ratelimit", "requests", now),
	].filter((value): value is QuotaMetric => value !== undefined);
	if (metrics.length > 0) return result("github-copilot", metrics, now);
	if (status === 429) return rateLimited(normalized, "github-copilot", now);
	return undefined;
}
