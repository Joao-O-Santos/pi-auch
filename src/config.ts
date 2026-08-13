import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

// Adapted from pi-usage (MIT); see THIRD_PARTY_NOTICES.md.
export interface OpenCodeGoConfig {
	workspaceId: string;
	authCookie: string;
}

export type OpenCodeGoConfigState =
	| { config: OpenCodeGoConfig; source: string; error?: never }
	| { error: string; config?: never }
	| { config?: never; error?: never };

export const OPENCODE_GO_CONFIG_FILE = "pi-auch-opencode-go.json";

function configFile(): string {
	return (
		process.env.OPENCODE_GO_QUOTA_CONFIG?.trim() ||
		path.join(getAgentDir(), OPENCODE_GO_CONFIG_FILE)
	);
}

function validateConfig(value: unknown, source: string): OpenCodeGoConfigState {
	const object =
		value && typeof value === "object" && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: undefined;
	const workspaceId = typeof object?.workspaceId === "string" ? object.workspaceId.trim() : "";
	const authCookie = typeof object?.authCookie === "string" ? object.authCookie.trim() : "";
	return workspaceId && authCookie
		? { config: { workspaceId, authCookie }, source }
		: { error: `${source} needs workspaceId and authCookie` };
}

export function getOpenCodeGoConfig(): OpenCodeGoConfigState {
	const workspaceId = process.env.OPENCODE_GO_WORKSPACE_ID?.trim();
	const authCookie = process.env.OPENCODE_GO_AUTH_COOKIE?.trim();
	if (workspaceId || authCookie) {
		return validateConfig({ workspaceId, authCookie }, "OpenCode Go quota environment");
	}

	const file = configFile();
	if (!existsSync(file)) return {};
	try {
		const stats = statSync(file);
		if (!stats.isFile()) return { error: `${path.basename(file)} must be a regular file` };
		if (process.platform !== "win32" && (stats.mode & 0o777) !== 0o600) {
			return { error: `${path.basename(file)} must have permissions 0600` };
		}
		return validateConfig(JSON.parse(readFileSync(file, "utf8")) as unknown, path.basename(file));
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : "could not be read";
		return { error: `${path.basename(file)}: ${message}` };
	}
}
