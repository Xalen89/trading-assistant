# 02-chart repair report

## Scope completed

- **All eight scenario display timeframes persist:** `scenario-layer-storage.ts` now imports the shared `SCENARIO_TIMEFRAMES` contract and caps `displayTimeframes` at `SCENARIO_TIMEFRAMES.length`, preserving the existing uniqueness, 12-saved-layer, and 6-drawn-layer safeguards.
- **Forming bars are explicit and cannot anchor analysis:** `lightweight-payload.ts` has a bounded `chartCandleState` split. It retains only completed bars plus an optional terminal forming quote-update candle, emits typed `formingCandle` / `closedAnchorAt` metadata, and uses the last completed bar for AI forecasts, saved scenario layers, historical replay anchors, indicators, FVG/range-derived display layers, and local-reference placement. No gap is invented or saved scenario re-anchored to the forming bar.
- **Native chart state is visible:** `CandleChart` displays `FORMING / QUOTE UPDATE · CURRENT BAR NOT CLOSED · SCENARIOS USE LAST COMPLETED BAR`, including in the explicit SVG fallback. The isolated local chart bridge, no-credential boundary, and paper-only controls were not changed.
- **Daily context language is honest and responsive:** `WeeklyContext` uses a bounded pure helper to show the supplied profile source/explanation when daily context is unavailable, or a fixed clear unavailable state otherwise. It does not invent a profile bias. `CLOSED BARS` and its value are single-line fitted text with a flexible narrow column, avoiding the fixed 84px split.

## Pure regression evidence

Pre-inspected the three selected test files: they contain synthetic fixtures only and no database/provider/account/order/network/write operations.

```text
pnpm exec vitest run tests/trading/scenario-layers.test.ts tests/trading/lightweight-chart.test.ts tests/trading/weekly-context-copy.test.ts

Test Files  3 passed (3)
Tests       23 passed (23)
```

The regressions cover:

1. all-eight-timeframe schema → workspace validation → sanitation → rendered scenario layer round trip;
2. a terminal forming quote candle rendered as explicit non-closed state while forecast and scenario-layer anchors remain on the preceding completed candle; and
3. actual daily-analysis reason versus the fixed unavailable copy, without asserting a directional bias.

`git diff --check` passed after formatting the scoped files.

## Integration boundaries and remaining verification

- **feed03 owns daily-profile acquisition.** This repair only renders its source/explanation if present and otherwise states the clear unavailable condition; it does not alter provider reads or acquisition policy.
- The generated local chart runtime was intentionally **not rebuilt**; parent integration should rebuild it after concurrent source work as directed. `lightweight-controller.ts`, `scenario-layers.ts`, `scenario-layer-manager.tsx`, `setup-service.ts`, provider parsers, schema/migrations, and configuration were not changed.
- No device/browser/Metro/API/build/export/full-suite run occurred. No real database, provider, broker/account, model/inference, order/proposal, upload, schedule, notification, or network operation was performed. This is source and pure-test evidence only.
