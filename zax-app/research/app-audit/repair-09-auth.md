# Repair 09-auth — Owner authentication, portable workspace consent

## Confirmed fixes

1. **Portable automatic-paper consent cannot cross the export/import boundary.**
   - `lib/trading/workspace-portability.ts` now removes `settings.orbAutoPaper` and `settings.sessionAutoPaper` before portable export, while preserving other static preferences.
   - Preview sanitizes forged/raw archive settings identically, retains imported alerts as disabled, and tells the user that automatic-paper settings must be explicitly re-armed.
   - `applyPortableImport` repeats the removal so a caller cannot bypass preview by supplying a crafted `PortableImportPreview`. The omitted optional settings are the existing strict-schema, default-off form: no `armedAt`, `expiresAt`, or `runWhenClosed` can survive.
   - No broker endpoint, paper order, provider, workspace save, or cloud operation was invoked by this repair.

2. **Cookie logout is no longer cross-site-form logoutable.**
   - `server/_core/cors.ts` exports `isAllowedCorsOrigin`, the existing exact credentialed-CORS policy including its constrained loopback rule; middleware behavior is refactored to reuse it unchanged.
   - New pure helper `server/_core/auth-security.ts` classifies a logout request as either an exact CORS-allowlisted browser origin or a no-Origin bearer candidate. Cookie-only/no-Origin requests and all unallowlisted origins fail closed.
   - `server/_core/oauth.ts` now clears the session cookie only after an allowlisted browser origin, or after `sdk.verifySession` validates a no-Origin bearer token. Cron-prefixed identities are rejected on that native-only path. Existing session-cookie scope/options, OAuth callback flow, owner/tRPC boundaries, and logout response shape are unchanged.

## Regression evidence

- Added `tests/auth-audit-09.test.ts`, an isolated no-I/O test file:
  - creates a pure portable archive carrying armed ORB and session settings, then verifies export, forged raw preview, and final application remove both settings while the enabled imported alert remains disabled;
  - uses mocked `server/db`, mocked SDK module, injected bearer verification, and mock Express request/response objects to reject an attacker form, accept an allowlisted Preview origin, accept a verified native bearer, and reject an invalid bearer without clearing a cookie.
- Command run:

  ```sh
  pnpm exec vitest run tests/auth-audit-09.test.ts
  ```

  Result: **1 test file passed, 2 tests passed**.
- Scoped `git diff --check` passed for all five changed source/test files. Source was formatted with Prettier for those files only.

## Boundaries and integration notes

- Tests did **not** start Express, make HTTP requests, access real cookies, authenticate a user, read/write any DB, contact a provider, submit paper/broker activity, run inference, or alter a workspace.
- This is source/mock evidence only; it does not claim real browser iframe behavior, device-native bearer handling, OAuth login, deployment, push delivery, or a signed build.
- No schema, migration, config, service, port, plan/TODO, documentation, package, or Git metadata was changed. No global/full suite, install, build/export, or concurrent parent integration was run.
