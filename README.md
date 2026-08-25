# pi-auch

[![pipeline
status](https://gitlab.com/Joao-O-Santos/pi-auch/badges/main/pipeline.svg)](https://gitlab.com/Joao-O-Santos/pi-auch/-/commits/main)
[![coverage](https://gitlab.com/Joao-O-Santos/pi-auch/badges/main/coverage.svg?job=check)](https://gitlab.com/Joao-O-Santos/pi-auch/-/pipelines)
[![npm
version](https://img.shields.io/npm/v/pi-auch.svg)](https://www.npmjs.com/package/pi-auch)
[![npm
downloads](https://img.shields.io/npm/dt/pi-auch.svg)](https://www.npmjs.com/package/pi-auch)
[![license](https://img.shields.io/npm/l/pi-auch.svg)](https://gitlab.com/Joao-O-Santos/pi-auch/-/blob/main/LICENSE)

Compact quota visibility for Pi's standard footer. It supports OpenAI Codex and GitHub Copilot without sending model probes.

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

- **OpenAI Codex:** uses Pi's `openai-codex` OAuth login and the ChatGPT `wham/usage` endpoint. It reports both the 5-hour and weekly rolling windows, including time until reset.
- **GitHub Copilot:** uses Pi's resolved `github-copilot` authentication to detect configuration. After Copilot is used in the session, premium-request and generic request limits are read passively from recognized response headers, including counts, percentages, and reset times when supplied. No model request is sent by pi-auch.

pi-auch never opens Pi's credential files, stores provider credentials, logs credentials, or logs provider response bodies. Authentication is resolved through Pi's provider API.

## Behavior

Quota is fetched at session start, every 15 minutes, and on `/auch`. Passive provider data updates after normal model responses. Requests have deadlines and body-size limits. Concurrent refreshes are deduplicated. A transient failure keeps the last successful value marked as stale.

The passive quota-header conventions are adapted from MIT-licensed [`@mtrojnar/pi-usage`](https://github.com/mtrojnar/pi-usage); see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

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
skipped. Codex performs a bounded live quota request and requires both 5-hour and weekly percentage
and reset data. Copilot validates Pi authentication but cannot obtain passive quota until normal
Copilot use returns recognized quota headers.
