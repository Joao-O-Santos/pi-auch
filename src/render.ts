import type { ProviderId, QuotaMetric, QuotaState } from "./types.js";

const NAMES: Record<ProviderId, string> = {
	"openai-codex": "Codex",
	"github-copilot": "Copilot",
};
const SHORT_NAMES: Record<ProviderId, string> = {
	"openai-codex": "Cdx",
	"github-copilot": "GH",
};

type ReactionColor = "success" | "warning" | "error";
export type Colorize = (color: ReactionColor, text: string) => string;
type Reaction = readonly [string, ReactionColor];

const REACTION_THRESHOLDS = [45, 65, 85] as const;

function resetSuffix(resetAt: number | undefined, compact: boolean): string {
	if (resetAt === undefined) return "";
	const milliseconds = Math.max(0, resetAt - Date.now());
	if (compact) {
		if (milliseconds >= 86_400_000) return `/${Math.ceil(milliseconds / 86_400_000)}d`;
		if (milliseconds >= 3_600_000) return `/${Math.ceil(milliseconds / 3_600_000)}h`;
		return `/${Math.ceil(milliseconds / 60_000)}m`;
	}
	if (milliseconds >= 2 * 86_400_000) return `/${(milliseconds / 86_400_000).toFixed(1)}d`;
	if (milliseconds >= 2 * 3_600_000) return `/${(milliseconds / 3_600_000).toFixed(1)}h`;
	if (milliseconds >= 2 * 60_000) return `/${Math.ceil(milliseconds / 60_000)}m`;
	return `/${Math.ceil(milliseconds / 1000)}s`;
}

function reaction(metric: QuotaMetric): Reaction | undefined {
	if (metric.unlimited) return ["🙂 nice", "success"];
	if (metric.label === "rate limited") return ["😭 AUCH!!", "error"];
	const used =
		metric.usedPercent ??
		(metric.limit && metric.remaining !== undefined
			? 100 * (1 - metric.remaining / metric.limit)
			: undefined);
	if (used === undefined) return undefined;
	const window =
		metric.label === "5h" ? 5 * 3_600_000 : metric.label === "weekly" ? 7 * 86_400_000 : 0;
	const wait =
		window && metric.resetAt
			? Math.min(1, Math.max(0, (metric.resetAt - Date.now()) / window)) * 20
			: 0;
	const pain = used + wait;
	return pain < REACTION_THRESHOLDS[0]
		? ["🙂 nice", "success"]
		: pain < REACTION_THRESHOLDS[1]
			? ["😬 ohhh", "warning"]
			: pain < REACTION_THRESHOLDS[2]
				? ["😣 auch!", "warning"]
				: ["😭 AUCH!!", "error"];
}

function formatMetric(
	metric: QuotaMetric,
	showLabel: boolean,
	compact: boolean,
	colorize?: Colorize,
): string {
	const label = metric.label;
	const reset = resetSuffix(metric.resetAt, compact);
	let value: string;
	if (metric.unlimited) value = compact ? "∞" : showLabel ? `${label} ∞` : "∞";
	else if (metric.remaining !== undefined && metric.limit !== undefined) {
		value = compact
			? `${metric.remaining}/${metric.limit}${reset}`
			: showLabel
				? `${label} ${metric.remaining}/${metric.limit} left${reset}`
				: `${metric.remaining}/${metric.limit} left${reset}`;
	} else if (metric.usedPercent !== undefined) {
		value = compact
			? `${Math.round(metric.usedPercent)}%${reset}`
			: `${showLabel ? `${label} ` : ""}${Math.round(metric.usedPercent)}%${reset}`;
	} else if (metric.remaining !== undefined) {
		value = compact
			? `${metric.remaining}${reset}`
			: showLabel
				? `${label} ${metric.remaining} left${reset}`
				: `${metric.remaining} left${reset}`;
	} else
		value = compact ? `${label === "rate limited" ? "429" : label}${reset}` : `${label}${reset}`;
	const ouch = reaction(metric);
	if (!ouch) return value;
	return `${colorize ? colorize(ouch[1], ouch[0]) : ouch[0]} ${value}`;
}

export function formatFooter(
	provider: ProviderId,
	state: QuotaState | undefined,
	colorize?: Colorize,
): string {
	const name = SHORT_NAMES[provider];
	if (!state) return `${name}…`;
	if (state.status === "unavailable") return `${name}—`;
	const metrics = prioritizedMetrics(provider, state.value.metrics).slice(0, 2);
	return `${name} ${metrics.map((metric) => formatMetric(metric, false, true, colorize)).join(" - ")}${state.stale ? " ~" : ""}`;
}

export function formatConfiguredFooter(
	states: Map<ProviderId, QuotaState>,
	colorize?: Colorize,
): string | undefined {
	const parts = [...states]
		.filter(([, state]) => state.status === "ready" || !state.error.endsWith(" is not configured"))
		.map(([provider, state]) => formatFooter(provider, state, colorize));
	return parts.length > 0 ? parts.join(" | ") : undefined;
}

export function formatDetail(provider: ProviderId, state: QuotaState, colorize?: Colorize): string {
	const name = NAMES[provider];
	if (state.status === "unavailable") return `${name}: unavailable — ${state.error}`;
	const plan = state.value.plan ? ` (${state.value.plan})` : "";
	const metrics = prioritizedMetrics(provider, state.value.metrics);
	const formatted = metrics
		.map((metric) => formatMetric(metric, metrics.length > 1, false, colorize))
		.join(" · ");
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
