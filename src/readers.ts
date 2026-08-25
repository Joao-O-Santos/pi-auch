import { boundedFetch } from "./http.js";
import { parseCodexUsage } from "./parse.js";
import type { ProviderId, ProviderReader, QuotaResult } from "./types.js";

const USER_AGENT = "pi-auch/0.1";

export interface ProviderAuth {
	apiKey?: string;
	headers?: Record<string, string | null>;
}

export type ResolveProviderAuth = (provider: string) => Promise<ProviderAuth | undefined>;
export type ReadPassiveUsage = (provider: ProviderId) => QuotaResult | undefined;

function accountIdFromJwt(token: string): string | undefined {
	try {
		const payload = token.split(".")[1];
		if (!payload) return undefined;
		const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<
			string,
			unknown
		>;
		const auth = decoded["https://api.openai.com/auth"] as Record<string, unknown> | undefined;
		return typeof auth?.chatgpt_account_id === "string" && auth.chatgpt_account_id
			? auth.chatgpt_account_id
			: undefined;
	} catch {
		return undefined;
	}
}

function token(auth: ProviderAuth | undefined, provider: string): string {
	if (!auth?.apiKey) throw new Error(`${provider} is not configured`);
	return auth.apiKey;
}

function configured(provider: ProviderId): QuotaResult {
	return { provider, fetchedAt: Date.now(), metrics: [{ label: "configured" }] };
}

function passiveOrConfigured(readPassive: ReadPassiveUsage, provider: ProviderId): QuotaResult {
	return readPassive(provider) ?? configured(provider);
}

export function createReaders(
	resolveAuth: ResolveProviderAuth,
	readPassive: ReadPassiveUsage = () => undefined,
): ProviderReader[] {
	return [
		{
			id: "openai-codex",
			async read(signal) {
				const apiKey = token(await resolveAuth("openai-codex"), "Codex");
				const accountId = accountIdFromJwt(apiKey);
				if (!accountId) throw new Error("Codex credential has no account ID");
				const value = await boundedFetch("https://chatgpt.com/backend-api/wham/usage", {
					expectedType: "json",
					signal,
					headers: {
						Accept: "application/json",
						Authorization: `Bearer ${apiKey}`,
						"chatgpt-account-id": accountId,
						"User-Agent": USER_AGENT,
					},
				});
				return parseCodexUsage(value);
			},
		},
		{
			id: "github-copilot",
			async read() {
				token(await resolveAuth("github-copilot"), "Copilot");
				return passiveOrConfigured(readPassive, "github-copilot");
			},
		},
	];
}
