# pi-auch

## Objective

- {accepted} Provide quota visibility primarily through Pi's existing footer.
- {accepted} Support OpenAI Codex, GitHub Copilot, and OpenCode Go.
- {accepted} Keep the extension small, direct, and easy to review.

## Audience

- {accepted} Pi users who authenticate these providers through Pi and want current quota information without opening a dashboard.

## Contribution

- {accepted} Use real quota sources rather than spending quota on model probes:
  - Codex: ChatGPT `wham/usage`.
  - GitHub Copilot: `copilot_internal/user`.
  - OpenCode Go: authenticated workspace dashboard usage.
- {provisional} Show a compact status for the active model's provider in Pi's standard footer via `ctx.ui.setStatus()`.
- {provisional} Keep `/auch` as a secondary command for explicit refresh and provider details.

## Deliverable

- {accepted} A dependency-light Pi package installable from a local path, Git, or npm.
- {provisional} One extension entry point with small modules for credentials, provider parsing/fetching, and quota cache state.
- {provisional} Unit tests for parsers and lifecycle/cache behavior using fixtures and mocked requests.

## Constraints

- {accepted} Do not expose or log credentials.
- {accepted} Resolve Pi state with `getAgentDir()` / `PI_CODING_AGENT_DIR`; do not hardcode `~/.pi/agent`.
- {accepted} Do not use model probes when a quota endpoint exists.
- {accepted} Leave the adjacent `pi-sych` repository unchanged.
- {inferred} Bound network requests and response sizes, retain stale successful data on transient failures, and avoid overlapping refreshes.
- {inferred} Treat the OpenCode Go browser cookie file as sensitive and require private permissions on POSIX systems.

## Completion criteria

- The footer populates on session start and follows model changes.
- Quota data refreshes at a conservative interval and all session resources are cleaned up on shutdown.
- `/auch` refreshes and reports all configured providers without revealing secrets.
- Provider failures are isolated; stale successful data remains identifiable and usable.
- Tests, type checking, package validation, and a Pi smoke check pass.
- Independent read-only review finds no credential leakage, unbounded lifecycle work, or unnecessary model requests.

## Unresolved

- {unresolved} Final compact wording and whether the footer should show only the active provider or all three when terminal width permits. The initial implementation will use the active provider unless the owner chooses otherwise.
- {unresolved} Whether to publish publicly; implementation and local installation do not imply publication.
