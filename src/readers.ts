import { boundedFetch } from "./http.js";
import { parseCodexUsage, parseCopilotUsage, parseOpenCodeUsage } from "./parse.js";
import type { ProviderReader } from "./types.js";

const USER_AGENT = "pi-auch/0.1";
const OPENCODE_USAGE_URL = "https://opencode.ai/workspace";

export interface ProviderAuth {
	apiKey?: string;
	headers?: Record<string, string | null>;
}

export type ResolveProviderAuth = (provider: string) => Promise<ProviderAuth | undefined>;

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

export function createReaders(resolveAuth: ResolveProviderAuth): ProviderReader[] {
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
			async read(signal) {
				const apiKey = token(await resolveAuth("github-copilot"), "Copilot");
				const value = await boundedFetch("https://api.github.com/copilot_internal/user", {
					expectedType: "json",
					signal,
					headers: {
						Accept: "application/json",
						Authorization: `Bearer ${apiKey}`,
						"User-Agent": USER_AGENT,
					},
				});
				return parseCopilotUsage(value);
			},
		},
		{
			id: "opencode-go",
			async read(signal) {
				const apiKey = token(await resolveAuth("opencode-go"), "OpenCode Go");
				const html = await boundedFetch(OPENCODE_USAGE_URL, {
					expectedType: "html",
					allowSameOriginRedirects: true,
					signal,
					headers: {
						Accept: "text/html",
						Authorization: `Bearer ${apiKey}`,
						"User-Agent": USER_AGENT,
					},
				});
				return parseOpenCodeUsage(html as string);
			},
		},
	];
}
