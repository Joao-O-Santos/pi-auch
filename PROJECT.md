# pi-auch

## Objective

- {accepted} Provide quota visibility primarily through Pi's existing footer.
- {accepted} Support OpenAI Codex and GitHub Copilot.
- {accepted} Keep the extension small, direct, and easy to review.

## Current direction

- {accepted} Report Codex 5-hour and weekly rolling quotas with time until each reset.
- {accepted} Report Copilot premium-request and generic request limits passively after normal provider use, including counts, percentages, and reset times when exposed.
- {accepted} Keep single-metric footer output compact and retain labels for multi-window providers.
- {accepted} Add compact emoji/color `nice`/`ohhh`/`auch!`/`AUCH!!` reactions, weighting Codex 5-hour and weekly reset time separately.
- {accepted} Refresh quota on session start, `/auch`, and a 5-minute interval.

## Audience

- {accepted} Pi users who authenticate these providers through Pi and want current quota information without opening a dashboard.

## Contribution

- {accepted} Use real quota sources rather than spending quota on model probes:
  - Codex: ChatGPT `wham/usage`.
  - GitHub Copilot: passive quota/rate-limit headers from normal session use.
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

## Definition of done

- The footer populates on session start for all configured providers; Copilot quota appears after normal Copilot use exposes response headers.
- Quota data refreshes at a conservative interval and all session resources are cleaned up on shutdown.
- `/auch` refreshes and reports all configured providers without revealing secrets.
- Provider failures are isolated; stale successful data remains identifiable and usable.
- Tests, type checking, package validation, and a Pi smoke check pass.
- Independent read-only review finds no credential leakage, unbounded lifecycle work, or unnecessary model requests.

## Previous action

- Confirmed from a redacted live quota read that Codex identifies its 5-hour and weekly windows with `limit_window_seconds`; no credential or response body was logged.
- Removed OpenCode Go because its available sources did not report trustworthy subscription limits.
- Kept Copilot passive-only and expanded recognized details without adding a model probe.
- Implemented concise quota reactions and a 5-minute refresh interval; local release checks pass with 27 tests and 100% line/function coverage.
- Added the optimized project logo to the README and published package boundary.
- Promoted the patch release `v0.2.1`; branch and tag CI/CD passed, including npm publication.
- Restored the exact original-resolution logo asset.
- Hardened refresh/session isolation, removed recovered Copilot rate-limit state, and normalized passive headers once per response after stronger review.
- Promoted patch release `v0.2.2`; branch and tag CI/CD passed, including npm publication.
- The release contains the stronger-reviewed refresh/session fixes and the restored original-resolution logo.

## Immediate next step

- Monitor `v0.2.2` installation and its reactive two-window Codex footer in normal Pi use.

## Unresolved

- {unresolved} Whether normal Copilot responses expose detailed quota headers consistently enough to provide more than configured status.
