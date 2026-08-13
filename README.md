# pi-auch

Compact quota visibility for Pi's standard footer. It supports OpenAI Codex, GitHub Copilot, and OpenCode Go without sending model probes.

## Install

```bash
pi install /absolute/path/to/pi-auch
# or try it once
pi -e /absolute/path/to/pi-auch
```

The active model's provider is shown in Pi's existing footer. Run `/auch` to refresh and display all provider details.

## Authentication

- **OpenAI Codex:** uses Pi's `openai-codex` OAuth login and the ChatGPT `wham/usage` endpoint.
- **GitHub Copilot:** uses Pi's `github-copilot` OAuth login and GitHub's `copilot_internal/user` endpoint. GitHub Enterprise is not supported by this endpoint.
- **OpenCode Go:** uses Pi's resolved `opencode-go` authentication against the OpenCode workspace page.

pi-auch never opens Pi's credential files or stores credentials itself. Authentication is resolved through Pi's provider API and used only for the corresponding bounded request. It does not log credentials or provider response bodies.

## Behavior

Quota is fetched at session start, after model changes, every 15 minutes, and on `/auch`. Requests have deadlines and body-size limits. Concurrent refreshes are deduplicated. A transient failure keeps the last successful value marked as stale.

## Development

```bash
npm install
npm run check
npm pack --dry-run
```
