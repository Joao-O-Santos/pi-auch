import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { getOpenCodeGoConfig } from "../src/config.js";

const KEYS = [
	"OPENCODE_GO_WORKSPACE_ID",
	"OPENCODE_GO_AUTH_COOKIE",
	"OPENCODE_GO_QUOTA_CONFIG",
	"PI_CODING_AGENT_DIR",
] as const;

test("loads and validates OpenCode Go environment and private files", (t) => {
	const saved = new Map(KEYS.map((key) => [key, process.env[key]]));
	const dir = mkdtempSync(path.join(tmpdir(), "pi-auch-config-"));
	t.after(() => {
		for (const [key, value] of saved) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	});
	for (const key of KEYS) delete process.env[key];
	process.env.PI_CODING_AGENT_DIR = dir;
	assert.deepEqual(getOpenCodeGoConfig(), {});

	process.env.OPENCODE_GO_WORKSPACE_ID = " ws ";
	assert.match(
		"error" in getOpenCodeGoConfig() ? (getOpenCodeGoConfig().error ?? "") : "",
		/needs/,
	);
	process.env.OPENCODE_GO_AUTH_COOKIE = " cookie ";
	assert.deepEqual(getOpenCodeGoConfig(), {
		config: { workspaceId: "ws", authCookie: "cookie" },
		source: "OpenCode Go quota environment",
	});
	delete process.env.OPENCODE_GO_WORKSPACE_ID;
	delete process.env.OPENCODE_GO_AUTH_COOKIE;

	process.env.OPENCODE_GO_QUOTA_CONFIG = path.join(dir, "missing.json");
	assert.deepEqual(getOpenCodeGoConfig(), {});

	const valid = path.join(dir, "valid.json");
	writeFileSync(valid, '{"workspaceId":"ws","authCookie":"cookie"}', { mode: 0o600 });
	process.env.OPENCODE_GO_QUOTA_CONFIG = valid;
	assert.deepEqual(getOpenCodeGoConfig(), {
		config: { workspaceId: "ws", authCookie: "cookie" },
		source: "valid.json",
	});

	const incomplete = path.join(dir, "incomplete.json");
	writeFileSync(incomplete, "[]", { mode: 0o600 });
	process.env.OPENCODE_GO_QUOTA_CONFIG = incomplete;
	assert.match(
		"error" in getOpenCodeGoConfig() ? (getOpenCodeGoConfig().error ?? "") : "",
		/needs/,
	);

	const malformed = path.join(dir, "malformed.json");
	writeFileSync(malformed, "{", { mode: 0o600 });
	process.env.OPENCODE_GO_QUOTA_CONFIG = malformed;
	assert.match("error" in getOpenCodeGoConfig() ? (getOpenCodeGoConfig().error ?? "") : "", /JSON/);

	const directory = path.join(dir, "directory");
	mkdirSync(directory);
	process.env.OPENCODE_GO_QUOTA_CONFIG = directory;
	assert.match(
		"error" in getOpenCodeGoConfig() ? (getOpenCodeGoConfig().error ?? "") : "",
		/regular file/,
	);

	if (process.platform !== "win32") {
		chmodSync(valid, 0o644);
		process.env.OPENCODE_GO_QUOTA_CONFIG = valid;
		assert.match(
			"error" in getOpenCodeGoConfig() ? (getOpenCodeGoConfig().error ?? "") : "",
			/0600/,
		);
	}
});
