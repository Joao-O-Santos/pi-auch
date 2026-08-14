# pi-auch

## Objective

- {accepted} Provide quota visibility primarily through Pi's existing footer.
- {accepted} Support OpenAI Codex, GitHub Copilot, and OpenCode Go.
- {accepted} Keep the extension small, direct, and easy to review.

## Current direction

- {accepted} Report Codex weekly quota from the available Codex rate-limit window and include days until reset.
- {accepted} Report Copilot premium-request quota passively after normal provider use.
- {accepted} Report OpenCode Go daily, weekly, and monthly quota from its dashboard or passive headers.
- {accepted} Keep single-metric footer output compact and retain labels for multi-window providers.

## Audience

- {accepted} Pi users who authenticate these providers through Pi and want current quota information without opening a dashboard.

## Contribution

- {accepted} Use real quota sources rather than spending quota on model probes:
  - Codex: ChatGPT `wham/usage`.
  - GitHub Copilot: passive quota/rate-limit headers from normal session use.
  - OpenCode Go: authenticated workspace dashboard usage, with passive headers when available.
- {accepted} Show compact usage for every configured provider in Pi's standard footer via `ctx.ui.setStatus()`.
- {provisional} Keep `/auch` as a secondary command for explicit refresh and provider details.

## Deliverable

- {accepted} A dependency-light Pi package installable from a local path, Git, or npm.
- {provisional} One extension entry point with small modules for credentials, provider parsing/fetching, and quota cache state.
- {provisional} Unit tests for parsers and lifecycle/cache behavior using fixtures and mocked requests.

## Constraints

- {accepted} Do not expose or log credentials.
- {accepted} Resolve Pi state with `getAgentDir()` / `PI_CODING_AGENT_DIR`; do not hardcode `~/.pi/agent`.
- {accepted} Do not use model probes.
- {accepted} Leave the adjacent `pi-sych` repository unchanged.
- {inferred} Bound network requests and response sizes, retain stale successful data on transient failures, and avoid overlapping refreshes.
- {accepted} Permit an explicitly configured OpenCode Go browser cookie through environment variables or a private config file; require private file permissions on POSIX systems.

## Definition of done

- The footer populates on session start for all configured providers; Copilot quota appears after normal Copilot use exposes response headers.
- Quota data refreshes at a conservative interval and all session resources are cleaned up on shutdown.
- `/auch` refreshes and reports all configured providers without revealing secrets.
- Provider failures are isolated; stale successful data remains identifiable and usable.
- Tests, type checking, package validation, and a Pi smoke check pass.
- Independent read-only review finds no credential leakage, unbounded lifecycle work, or unnecessary model requests.

## Previous action

- Released and tagged `v0.1.5` with weekly-only Codex display and simplified Copilot quota reporting.
- Identified that some Codex accounts expose their weekly quota as the sole `primary_window`; implemented and verified a fallback plus reset-day rendering locally.
- Added an opt-in developer smoke test that uses Pi-resolved authentication without model probes; the local run confirmed live Codex quota and reset data plus configured Copilot and Go subscriptions.

## Immediate next step

- Push version `0.1.6`; create and push its signed release tag after the GitLab `check` job passes.

## Unresolved

- {unresolved} Whether to publish publicly; implementation and local installation do not imply publication.
