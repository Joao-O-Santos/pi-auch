import type { ProviderId, QuotaMetric, QuotaState } from "./types.js";

const NAMES: Record<ProviderId, string> = {
	"openai-codex": "Codex",
	"github-copilot": "Copilot",
};

function resetSuffix(resetAt: number | undefined): string {
	if (resetAt === undefined) return "";
	const milliseconds = Math.max(0, resetAt - Date.now());
	if (milliseconds >= 2 * 86_400_000) return `/${(milliseconds / 86_400_000).toFixed(1)}d`;
	if (milliseconds >= 2 * 3_600_000) return `/${(milliseconds / 3_600_000).toFixed(1)}h`;
	if (milliseconds >= 2 * 60_000) return `/${Math.ceil(milliseconds / 60_000)}m`;
	return `/${Math.ceil(milliseconds / 1000)}s`;
}

function formatMetric(metric: QuotaMetric, showLabel: boolean): string {
	const reset = resetSuffix(metric.resetAt);
	if (metric.unlimited) return showLabel ? `${metric.label} ∞` : "∞";
	if (metric.remaining !== undefined && metric.limit !== undefined) {
		return showLabel
			? `${metric.label} ${metric.remaining}/${metric.limit} left${reset}`
			: `${metric.remaining}/${metric.limit} left${reset}`;
	}
	if (metric.usedPercent !== undefined) {
		const percent = `${Math.round(metric.usedPercent)}%${reset}`;
		return showLabel ? `${metric.label} ${percent}` : percent;
	}
	if (metric.remaining !== undefined) {
		return showLabel
			? `${metric.label} ${metric.remaining} left${reset}`
			: `${metric.remaining} left${reset}`;
	}
	return `${metric.label}${reset}`;
}

export function formatFooter(provider: ProviderId, state: QuotaState | undefined): string {
	const name = NAMES[provider];
	if (!state) return `${name} …`;
	if (state.status === "unavailable") return `${name} unavailable`;
	const metrics = prioritizedMetrics(provider, state.value.metrics).slice(0, 2);
	const formatted = metrics.map((item) => formatMetric(item, metrics.length > 1));
	return `${name} ${formatted.join(" · ")}${state.stale ? " (stale)" : ""}`;
}

export function formatConfiguredFooter(states: Map<ProviderId, QuotaState>): string | undefined {
	const parts = [...states]
		.filter(([, state]) => state.status === "ready" || !state.error.endsWith(" is not configured"))
		.map(([provider, state]) => formatFooter(provider, state));
	return parts.length > 0 ? parts.join(" | ") : undefined;
}

export function formatDetail(provider: ProviderId, state: QuotaState): string {
	const name = NAMES[provider];
	if (state.status === "unavailable") return `${name}: unavailable — ${state.error}`;
	const plan = state.value.plan ? ` (${state.value.plan})` : "";
	const metrics = prioritizedMetrics(provider, state.value.metrics);
	const formatted = metrics.map((item) => formatMetric(item, metrics.length > 1)).join(" · ");
	const stale = state.stale ? ` [stale${state.error ? `: ${state.error}` : ""}]` : "";
	return `${name}${plan}: ${formatted}${stale}`;
}

function prioritizedMetrics(provider: ProviderId, metrics: QuotaMetric[]): QuotaMetric[] {
	if (provider !== "github-copilot") return metrics;
	return [...metrics].sort((a, b) => {
		const rank = (label: string) =>
			label.startsWith("premium") ? 0 : label === "requests" || label === "chat" ? 1 : 2;
		return rank(a.label) - rank(b.label);
	});
}
