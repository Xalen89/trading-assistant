# Repair 10-journal — Discipline & screenshot evidence

**Scope:** Owner-only, paper-only Expo Router / TypeScript screenshot-review and discipline-control fixes. This repair made no provider, account, database, storage, upload, device, model, network, order, proposal, schedule, push, configuration, or Git operation. No image attachment was opened.

## Fixed

1. **Acknowledged discipline enforcement**
   - Added `lib/trading/discipline-guard-ack.ts`, a pure typed helper that applies the local optional guard value then waits for the existing `saveCloud` canonical acknowledgement.
   - `DisciplineGuardControl` now says a guard is enabled/disabled only after that acknowledgement. A failed or unavailable save retains the local value but explicitly says **server enforcement is unchanged**.
   - The optional legacy `onGuardChange` is now a post-acknowledgement observer; it cannot be the basis for an enforcement claim.
   - Default-off behavior and advisory-only treatment of non-canonical/self-reported conditions remain unchanged.

2. **Review-only screenshot retention**
   - `uploadTradeScreenshot` calls the Library-owned `uploadReference` review-only contract with `reviewOnly: true` and `sourcePurpose: "trade-screenshot"`. That contract skips generic extraction/indexing and Library promotion/matching paths.
   - Linked uploads load the canonical owner-scoped paper trade before retention and derive `market`, `timeframe`, `strategyId`, and `strategyVersion` from it. Stale current-workspace context is ignored for linked records.
   - The client now sends `canonicalTradeId` at upload (not only at analysis), plus the current strategy revision only for standalone context.

3. **Durable immutable screenshot context and remount recovery**
   - Added bounded Zod-backed source-context helpers in `lib/trading/trade-screenshot-types.ts`; the immutable context contains only canonical ID/linkage and market/timeframe/strategy revision—**never fills, brackets, outcomes, or model output**.
   - Context is encoded in the existing, Library-owned review-only Pattern `notes` metadata alongside the source-purpose marker. No Pattern-model, schema, migration, or database change was made.
   - The service verifies that the uploaded source actually retained the exact context and fails closed otherwise.
   - Analysis and confirmation use that retained context, reject a forged different `canonicalTradeId` before protected-source bytes/model invocation, re-check owner-scoped canonical ownership, and continue withholding all trade fields from the model.
   - The screenshot router now resolves bounded metadata-only definitions for the 100-item screenshot inventory and filters by the immutable link. Thus a source linked at retention reappears after remount even if dedicated analysis failed and no `tradeReview` draft exists.
   - The panel restores context when reopening a source and does not silently re-link a retained standalone source.

## Files changed

- `components/trading/discipline-guard-control.tsx`
- `components/trading/trade-screenshot-panel.tsx`
- `lib/trading/discipline-guard-ack.ts` (new)
- `lib/trading/trade-screenshot-types.ts`
- `server/trading/trade-screenshot-router.ts`
- `server/trading/trade-screenshot-service.ts`
- `tests/trading/discipline-guard-ack.test.ts` (new)
- `tests/trading/trade-screenshot-router.test.ts` (new)
- `tests/trading/trade-screenshot-service.test.ts`
- `tests/trading/trade-screenshot-types.test.ts`

## Verification

The following focused test command used only pure/in-memory or mocked boundaries; repository, source bytes, LLM/provider, storage, and paper-trade dependencies were mocked where invoked:

```text
pnpm vitest run \
  tests/trading/discipline-guard-ack.test.ts \
  tests/trading/discipline-policy.test.ts \
  tests/trading/trade-screenshot-types.test.ts \
  tests/trading/trade-screenshot-service.test.ts \
  tests/trading/trade-screenshot-router.test.ts --reporter=verbose

5 files passed; 18 tests passed; 0 failed
```

Regression coverage includes:

- enable → immediate simulated canonical order request remains unblocked until cloud acknowledgement;
- failed guard save stays local-only/default-off on the canonical snapshot;
- review-only purpose/options and zero direct generic-model calls from the screenshot service;
- canonical rather than stale-workspace market/timeframe/strategy metadata;
- failed dedicated review retaining remount-visible linked context;
- forged analysis link rejection before protected source bytes/model use;
- immutable source-context schema boundaries (no fills/outcomes);
- router filtering of an unreviewed retained source by immutable canonical context.

Scoped Prettier check and `git diff --check` passed for all owned files.

## Integration / remaining

- The repair depends on the concurrently owned Library `uploadReference` review-only/source-purpose contract. At the time of verification, that contract was present and stores the source-purpose marker in existing Pattern notes while skipping generic indexing/extraction. No Library/repository/model/schema file was edited by this repair.
- `pnpm check` was run once as a check-only diagnostic and reports **five unrelated, pre-existing/concurrent errors** outside this scope: `components/trading/ai-forecast-panel.tsx` (1), `components/trading/scenario-layer-manager.tsx` (1), `components/trading/source-analysis-job.tsx` (1), and `server/trading/orb-auto-paper.ts` (2). No owned 10-journal path was named. Parent integration should resolve/recheck those owner modules rather than changing them here.
- No full suite, installation, build/export, service startup, actual database/storage/provider/model/device/push action, native deployment, or broker execution was performed or claimed.
