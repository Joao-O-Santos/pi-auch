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
