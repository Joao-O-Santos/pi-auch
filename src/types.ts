export const PROVIDERS = ["openai-codex", "github-copilot", "opencode-go"] as const;

export type ProviderId = (typeof PROVIDERS)[number];

export interface QuotaMetric {
	label: string;
	usedPercent?: number;
	remaining?: number;
	limit?: number;
	resetAt?: number;
	unlimited?: boolean;
}

export interface QuotaResult {
	provider: ProviderId;
	fetchedAt: number;
	metrics: QuotaMetric[];
	plan?: string;
}

export type QuotaState =
	| { status: "ready"; value: QuotaResult; stale: boolean; error?: string }
	| { status: "unavailable"; error: string };

export interface ProviderReader {
	id: ProviderId;
	read(signal: AbortSignal): Promise<QuotaResult>;
}
