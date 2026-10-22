# Repair 05 — Strategies

**Scope:** owner-only, paper-only Session/PDC source geometry and strategy revision rollback.  This repair made no provider, account, database, model, network, order/proposal, upload, schedule, push, or consent operation. No upload image was opened.

## Completed fixes

1. **PDC `previous-day-extremes` now has source-owned paper geometry.**
   - `SessionStrategyContext` carries `previousDay` only when the detector has already verified a causal daily provider row. It includes finite high/low, ISO provider-row date, close time, provenance label, and optional opaque source identity.
   - `sessionPaperGeometry` has an explicit `previous-day-extremes` branch: long uses verified prior-day high and short uses low. It refuses absent/non-finite/non-positive values, an at/behind target, a missing current quote, mixed origins, and forged source context. It does **not** fall back to a premarket range, owner key level, or generic R target.
   - PDC quote matching now requires the exact opaque identity whenever one is declared. Provider-prefix matching was removed. Legacy fixtures remain accepted only when no identity is declared and the quote/source labels are exactly identical.
   - Daily and execution source identities also fail closed if either side declares an identity but the other is missing or differs. Invalid PDC/quote evidence now makes the source risk guard failed rather than presenting an unknown safe-looking bracket.

2. **Restore-as-new-revision now restores source configuration faithfully.**
   - Added pure helper `lib/trading/strategies05-revision-restore.ts`.
   - Restores cloned `orbConfig` and `sessionConfig`, explicitly assigning `undefined` when the historical revision omitted either configuration.
   - Always clears `confluence` on rollback, preserving reapproval requirements for the newly incremented revision.
   - The Strategies history marker now also identifies stored ORB configuration.

## Regression coverage

All executed tests were inspected pure in-memory fixtures before invocation; they import no server routes and do not make provider/database/account/order/schedule calls.

```text
pnpm exec vitest run \
  tests/trading/pdc-continuation.test.ts \
  tests/trading/strategies05-session-paper-geometry.test.ts \
  tests/trading/strategies05-revision-restore.test.ts

3 files passed, 21 tests passed
```

New coverage proves:

- ready detector -> verified previous-day context -> paper-only proposal keeps the daily high target;
- a forged cross-origin current quote is rejected again by actual source geometry;
- a `TradeLocker · ...`-style provider label prefix cannot bypass an opaque identity, while identical legacy labels still pass;
- rollback clones both configurations, prevents mutation of historical snapshots, clears stale confluence, and explicitly restores missing configurations as `undefined`.

`prettier --check` passed for all scoped files and `git diff --check` passed.

## Integration notes / remaining dependency

- **Feed 03 integration is required for identity-declared production PDC:** `SetupInput.sourceIdentity` is already forwarded to the detector, but the current `Quote` shared contract exposes only `source`. Therefore the feed repair must persist/forward the same opaque broker fingerprint in `Quote.source` (or add a shared quote identity field and update this PDC contract together). Until then, a feed that declares a candle identity but supplies a human quote label is deliberately rejected; there is no provider-prefix bypass.
- `pnpm check --pretty false` was attempted after the scoped tests. It is blocked by concurrent, out-of-scope errors only:
  - `components/trading/ai-forecast-panel.tsx:67` and `components/trading/scenario-layer-manager.tsx:282` — hook/function expects one argument but receives zero;
  - `components/trading/source-analysis-job.tsx:32` — status label record lacks `cancelled` and `indexing-image`;
  - `server/trading/orb-auto-paper.ts:1114,1211` — `string | undefined` supplied where `string` is required.
  None originate in this scope; no out-of-scope edits were made.

## Boundaries retained

The change remains owner-authority preserving, paper-only, default-off for automation, strict about source clock/volume/risk evidence, probability-null, and does not claim broker execution, device behavior, deployment, push delivery, or inference.

## Parent integration correction

The feed finishing pass moved opaque quote origins into `Quote.sourceIdentity`, keeping human-readable provenance separate. The final integrated suite exposed that this scope's prior-day geometry and its older fixture still compared `Quote.source` to that fingerprint. The parent corrected the actual geometry comparison and fixture fields rather than relaxing source equality. Prior-day date, matching PDC close time, source chronology and a non-inverted range are also required. The initial corrected source/geometry run passed24tests across three files; the final report header records the later dated-context regression and full-suite result. The earlier cross-dependency/compiler notes above describe the worker's handoff state and are superseded by this correction and the final integrated checks.
