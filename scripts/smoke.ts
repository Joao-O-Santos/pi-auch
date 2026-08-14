import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { createReaders, type ProviderAuth } from "../src/readers.js";
import { formatDetail } from "../src/render.js";
import { PROVIDERS, type ProviderId, type QuotaResult } from "../src/types.js";

const AUTH_TIMEOUT_MS = 10_000;
const READ_TIMEOUT_MS = 15_000;
const NAMES: Record<ProviderId, string> = {
	"openai-codex": "Codex",
	"github-copilot": "Copilot",
	"opencode-go": "OpenCode Go",
};

function validateLiveResult(value: QuotaResult): void {
	if (value.provider !== "openai-codex") return;
	const weekly = value.metrics.find((metric) => metric.label === "weekly");
	if (weekly?.usedPercent === undefined) throw new Error("weekly quota is missing");
	if (weekly.resetAt === undefined) throw new Error("weekly reset time is missing");
}

async function main(): Promise<void> {
	const runtime = await ModelRuntime.create({
		allowModelNetwork: false,
		signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
	});
	const auth = new Map<ProviderId, ProviderAuth>();
	let failures = 0;

	for (const provider of PROVIDERS) {
		try {
			const resolved = (
				await runtime.getAuth(provider, {
					signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
				})
			)?.auth;
			if (resolved?.apiKey) auth.set(provider, resolved);
		} catch {
			failures++;
			console.error(`FAIL ${NAMES[provider]}: Pi authentication resolution failed`);
		}
	}

	const readers = createReaders(async (provider) => auth.get(provider as ProviderId));
	let checked = 0;
	for (const reader of readers) {
		if (!auth.has(reader.id)) {
			console.log(`SKIP ${NAMES[reader.id]}: not configured in Pi`);
			continue;
		}
		checked++;
		try {
			const value = await reader.read(AbortSignal.timeout(READ_TIMEOUT_MS));
			validateLiveResult(value);
			console.log(`PASS ${formatDetail(reader.id, { status: "ready", value, stale: false })}`);
		} catch (error) {
			failures++;
			const message = error instanceof Error ? error.message : "unknown failure";
			console.error(`FAIL ${NAMES[reader.id]}: ${message}`);
		}
	}

	if (checked === 0) {
		failures++;
		console.error("FAIL No supported provider is configured in Pi");
	}
	if (failures > 0) process.exitCode = 1;
}

await main();
