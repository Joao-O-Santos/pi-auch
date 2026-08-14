# pi-auch

[![pipeline
status](https://gitlab.com/Joao-O-Santos/pi-auch/badges/main/pipeline.svg)](https://gitlab.com/Joao-O-Santos/pi-auch/-/commits/main)
[![coverage](https://gitlab.com/Joao-O-Santos/pi-auch/badges/main/coverage.svg?job=check)](https://gitlab.com/Joao-O-Santos/pi-auch/-/pipelines)
[![npm
version](https://img.shields.io/npm/v/pi-auch.svg)](https://www.npmjs.com/package/pi-auch)
[![npm
downloads](https://img.shields.io/npm/dt/pi-auch.svg)](https://www.npmjs.com/package/pi-auch)
[![license](https://img.shields.io/npm/l/pi-auch.svg)](https://gitlab.com/Joao-O-Santos/pi-auch/-/blob/main/LICENSE)

Compact quota visibility for Pi's standard footer. It supports OpenAI Codex, GitHub Copilot, and OpenCode Go without sending model probes.

## Install

```bash
pi install npm:pi-auch
```

To try it for one session without installing it:

```bash
pi -e npm:pi-auch
```

Usage for every configured provider is shown in Pi's existing footer. Run `/auch` to refresh and display full provider details.

## Authentication

- **OpenAI Codex:** uses Pi's `openai-codex` OAuth login and the ChatGPT `wham/usage` endpoint.
- **GitHub Copilot:** uses Pi's resolved `github-copilot` authentication to detect configuration. After Copilot is used in the session, quota/rate-limit information is read passively from its response headers. No model request is sent by pi-auch.
- **OpenCode Go:** uses Pi's resolved `opencode-go` authentication to detect configuration. Dashboard quota requires a workspace ID and browser `auth` cookie because OpenCode does not expose that data through its API key.

For OpenCode Go dashboard quota, set both:

```bash
export OPENCODE_GO_WORKSPACE_ID="your-workspace-id"
export OPENCODE_GO_AUTH_COOKIE="your-auth-cookie-value"
```

Alternatively, create `$PI_CODING_AGENT_DIR/pi-auch-opencode-go.json` (normally under Pi's agent directory), or point `OPENCODE_GO_QUOTA_CONFIG` at another file:

```json
{
	"workspaceId": "your-workspace-id",
	"authCookie": "your-auth-cookie-value"
}
```

On POSIX systems the file must be a regular file with mode `0600`. The workspace ID appears in `https://opencode.ai/workspace/<workspaceId>/go`; obtain the `auth` cookie from browser developer tools. Without dashboard configuration, Go remains visible as configured and can acquire passive quota headers if OpenCode returns them.

pi-auch never opens Pi's credential files or stores provider credentials itself. Pi authentication is resolved through Pi's provider API. The optional OpenCode cookie is read only from the explicit environment/configuration above and used only for the bounded dashboard request. pi-auch does not log credentials or provider response bodies.

## Behavior

Quota is fetched at session start, every 15 minutes, and on `/auch`. Passive provider data updates after normal model responses. Requests have deadlines and body-size limits. Concurrent refreshes are deduplicated. A transient failure keeps the last successful value marked as stale.

The OpenCode dashboard and passive-header implementation is adapted from MIT-licensed [`@mtrojnar/pi-usage`](https://github.com/mtrojnar/pi-usage); see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Development

```bash
npm install
npm run check
npm pack --dry-run
```

Run the opt-in live smoke test from a development checkout to check the supported providers
configured in the current Pi installation:

```bash
npm run smoke
# or: make smoke
```

The smoke test resolves authentication through Pi's `ModelRuntime`; it does not inspect credential
files, print authentication, or send model probes. Providers without a local subscription are
skipped. Codex performs a bounded live quota request and requires weekly percentage and reset data.
Copilot validates Pi authentication but cannot obtain passive quota until normal Copilot use returns
quota headers. OpenCode Go fetches live dashboard quota when its optional dashboard configuration is
present; otherwise it validates Pi authentication and reports `configured`.
