# pi-auch implementation plan

Status: awaiting owner approval

## Scope

Build a footer-first Pi extension for Codex, GitHub Copilot, and OpenCode Go quota reporting. Preserve Pi's built-in footer by contributing one compact `setStatus` entry. Keep `/auch` as a manual refresh/details path. Do not probe models.

## Implementation

1. **Establish package and contracts**
   - Keep a minimal Pi package manifest and TypeScript configuration.
   - Define a small provider-neutral quota result used by footer and command rendering.
   - Document authentication sources and OpenCode Go setup without including credential examples that resemble real secrets.

2. **Implement bounded provider readers**
   - Read Pi credentials from `getAgentDir()/auth.json`.
   - Codex: request `https://chatgpt.com/backend-api/wham/usage` with OAuth and account ID.
   - Copilot: request `https://api.github.com/copilot_internal/user` with the stored GitHub OAuth credential.
   - OpenCode Go: read a private workspace/cookie config and parse rolling, weekly, and monthly usage from the dashboard HTML.
   - Apply request deadlines, response-size limits, shape validation, and sanitized errors.

3. **Implement footer lifecycle**
   - Populate on `session_start`.
   - Select the active model's provider and update on `model_select`.
   - Refresh conservatively (initial target: 15 minutes), deduplicate concurrent work, and preserve marked stale data after transient errors.
   - Clear timers and footer status on `session_shutdown`.

4. **Implement `/auch`**
   - Force a bounded refresh of all three providers.
   - Report compact provider details and isolated unavailable/error states through Pi UI.
   - Never print tokens, cookies, authorization headers, or raw provider response bodies.

5. **Test and verify**
   - Unit-test valid, partial, malformed, exhausted, and unlimited quota payloads.
   - Test timeout/abort, oversized responses, stale-cache fallback, concurrent refresh deduplication, provider selection, timer cleanup, and private-file validation.
   - Run formatter if configured, TypeScript checking, tests, `npm pack --dry-run`, production dependency audit, and a local Pi extension smoke check.

6. **Independent review**
   - Obtain a read-only review focused on credential safety, lifecycle cleanup, endpoint behavior, parser brittleness, and unnecessary complexity.
   - Address confirmed findings coherently, rerun verification, and update `PROJECT.md` only to describe the resulting truth.

## Global constraints

- No model probes.
- No credential logging or persistence in cache files.
- No replacement custom footer unless explicitly requested; use `ctx.ui.setStatus()`.
- No publication, push, tag, or release without separate owner instruction.
- Keep runtime dependencies at zero unless a concrete requirement justifies one and the owner approves it.

## Not in the initial version

- Historical usage accounting.
- Graphs, overlays, or a dashboard UI.
- Multiple-account management.
- Automatic browser-cookie discovery.
- Provider support beyond the three named services.
