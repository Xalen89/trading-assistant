# Repair 04-paper — Canonical paper lifecycle

## Scope completed

Only the assigned paper lifecycle modules, two new typed helpers, and focused tests were changed. No plan/TODO/config/schema/migration/service/port/owner-record files were edited. No database, provider, account, model, network, order, proposal, upload, scheduler, or push operation was invoked.

## Implemented corrections

- **Canonical balance authority:** Added `server/trading/paper-balance.ts` with exported `loadCanonicalPaperBalance(userId): Promise<number>`.
  - Reads the canonical workspace starting balance and every current owner-scoped durable paper trade page (`20 × 100` maximum), then derives realised equity through the existing `paperPerformance` logic.
  - Fails closed with `PRECONDITION_FAILED` for missing/non-positive/non-finite starting equity; malformed, duplicate, non-finite, or closed-without-exit ledger records; invalid/repeated cursors; or an incomplete ledger beyond the bound.
  - Has no client balance argument and performs no writes.
  - `createPaperOrder` now sizes/risk-checks against this canonical balance rather than `proposal.initialRisk / capPct`. It re-reads the balance immediately before insert and fails closed if it changed while the order was being checked.
- **Conservative same-bar lifecycle:** After a **bar-based** partial moves the stop to break-even, a bar that also reaches that new stop closes the remainder at break-even before target credit. Long and short mocked regressions cover the ambiguous OHLC path.
- **Terminal immutability:** Closed and cancelled records permit only an exact-bracket, exact-management review revision. Any review request that changes stop, target, or explicit `autoManage` is rejected.
- **Duplicate insert race:** A duplicate-insert reread now requires both the original `setupId` and `entryMode`; a mismatched stored mode/evidence returns `CONFLICT` instead of returning the other mode's trade.
- **Idempotent cancellation:** An already-cancelled plan returns before optimistic-version comparison, allowing safe retry after a lost successful response without a second event.
- **Management assessment contract:** `managePaperTrades` now returns typed `PaperManagementResult` with the existing `trades` mutation array plus separate `checkedIds`. An ID is included only after its fresh quote has been successfully assessed, including no-transition checks.
- **0.5% ticket preservation:** Added pure `lib/trading/paper-risk-template.ts`; the sheet retains 0.5% and displays it as a selectable risk template. Unsupported selection normalizes to 0.5%, never 1%.

## Focused regression evidence

Command (all persistence/provider dependencies mocked, except the pure lifecycle function):

```sh
pnpm exec vitest run tests/trading/paper-lifecycle.test.ts tests/trading/paper-balance.test.ts tests/trading/paper-service.test.ts tests/trading/paper-plan-sheet.test.ts
```

Result: **4 files passed, 38 tests passed**.

`git diff --check` passed for the scoped files. No full suite, install, build/export, real integration, device, push, inference, or deployment check was run.

## Parent integration notes

1. **Feed03 proposal sizing:** import `loadCanonicalPaperBalance` directly from `server/trading/paper-balance` and use its returned number as the sole balance passed to proposal sizing. Do not add a client-balance fallback; its `PRECONDITION_FAILED` result is intentionally fail-closed.
2. **Alerts06 processing:** retain `paperUpdates.trades` for actual paper mutations. Use `paperUpdates.checkedIds` for the real set of fresh management assessments/processing heartbeat records; do not infer checks from `trades`.
3. **Parent-owned chart state:** the sheet now preserves/exposes 0.5%, but the parent still needs to change the owner `index.tsx` initial paper-risk state from 1 to 0.5 as assigned.
4. This remains paper-only. These source tests do not establish actual provider freshness, device behavior, closed-app scheduling/push, database runtime behavior, real account access, inference, or deployment.
