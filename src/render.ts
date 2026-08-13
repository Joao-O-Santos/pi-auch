import type { ProviderId, QuotaMetric, QuotaState } from "./types.js";

const NAMES: Record<ProviderId, string> = {
	"openai-codex": "Codex",
	"github-copilot": "Copilot",
	"opencode-go": "Go",
};

export function providerForModel(provider: string | undefined): ProviderId | undefined {
	if (provider === "openai-codex" || provider === "github-copilot" || provider === "opencode-go")
		return provider;
	return undefined;
}

function formatMetric(metric: QuotaMetric): string {
	if (metric.unlimited) return `${metric.label} ∞`;
	if (metric.remaining !== undefined && metric.limit !== undefined) {
		return `${metric.label} ${metric.remaining}/${metric.limit} left`;
	}
	if (metric.usedPercent !== undefined) return `${metric.label} ${Math.round(metric.usedPercent)}%`;
	if (metric.remaining !== undefined) return `${metric.label} ${metric.remaining} left`;
	return metric.label;
}

export function formatFooter(provider: ProviderId, state: QuotaState | undefined): string {
	const name = NAMES[provider];
	if (!state) return `${name} …`;
	if (state.status === "unavailable") return `${name} unavailable`;
	const metrics = prioritizedMetrics(provider, state.value.metrics).slice(0, 2).map(formatMetric);
	return `${name} ${metrics.join(" · ")}${state.stale ? " (stale)" : ""}`;
}

export function formatDetail(provider: ProviderId, state: QuotaState): string {
	const name = NAMES[provider];
	if (state.status === "unavailable") return `${name}: unavailable — ${state.error}`;
	const plan = state.value.plan ? ` (${state.value.plan})` : "";
	const metrics = prioritizedMetrics(provider, state.value.metrics).map(formatMetric).join(" · ");
	const stale = state.stale ? ` [stale${state.error ? `: ${state.error}` : ""}]` : "";
	return `${name}${plan}: ${metrics}${stale}`;
}

function prioritizedMetrics(provider: ProviderId, metrics: QuotaMetric[]): QuotaMetric[] {
	if (provider !== "github-copilot") return metrics;
	return [...metrics].sort((a, b) => {
		const rank = (label: string) =>
			label === "premium interactions" ? 0 : label === "chat" ? 1 : 2;
		return rank(a.label) - rank(b.label);
	});
}
