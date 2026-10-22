# Repair 08 — No-code quant fixed-universe duplicates

## Scope and result

Fixed the confirmed configuration defect in `lib/trading/no-code-quant.ts` only. A `topN` or `inverseVolWeight` node now rejects repeated symbols **within that same node** after trimming and case normalization. The validation failure occurs before the owner-only router's `quantHistory` loop, so it cannot fetch a source for an invalid repeated-universe draft.

The shared typed `canonicalSymbol(symbol: string)` helper normalizes identifiers consistently for:

- validation and the bounded `assetSymbols` fetch list;
- supplied pure-series matching and duplicate-source detection;
- condition, ranking, and allocation result symbols.

Independent condition nodes remain allowed to reuse a symbol used by a selection or weighting node. The existing editor already derives save eligibility from `validateNoCodeQuantRule`, so no editor change was necessary.

## Regression coverage

Added `tests/trading/no-code-quant.test.ts`, using only in-memory synthetic closed bars:

1. Validates and evaluates mixed-case/space-padded symbols against canonical supplied sources, while an independent condition reuses `BTC-USD`.
2. Confirms `topN` and `inverseVolWeight` each fail closed when their own child lists repeat a symbol through case/whitespace variants; evaluator returns no selections/allocations and `researchReady: false`.

## Checks run

```sh
pnpm vitest run tests/trading/no-code-quant.test.ts
pnpm exec prettier --check tests/trading/no-code-quant.test.ts
git diff --check -- lib/trading/no-code-quant.ts tests/trading/no-code-quant.test.ts
```

Result: **1 test file / 2 tests passed**; test-file formatting and patch whitespace passed. The Vitest fixture imports only the pure quant module and creates no database, provider, account, network, order, proposal, upload, schedule, or other application write.

## Boundaries retained

- Owner-only router authority is unchanged.
- Evaluation remains bounded, pure, hypothetical, paper-only, with `autoExecution: false`.
- No source fetch, model/AI inference, database/provider/account/device/push operation, migration, configuration, service, or editor change was made.
- No material design, migration, or provider capability is required for this repair.

## Files changed

- `lib/trading/no-code-quant.ts`
- `tests/trading/no-code-quant.test.ts`
- `artifacts/app-audit/repair-08-quant.md`
