import { SETUP_PRESETS } from "./setup-presets";

/** Catalog scope only. This does not manufacture a detector, history, or strategy entry. */
const requestedPresetIds = new Set([
  "ob-retest",
  "vwap-stdv",
  "core-sequence",
  "sma-crossover",
  "macd-momentum",
  "trend-following",
  "breakout-momentum",
  "mean-reversion",
]);
export const FOUNDRY_PRESETS = SETUP_PRESETS.filter((preset) =>
  requestedPresetIds.has(preset.id),
);
export const FOUNDRY_DATA_PREREQUISITES = [
  {
    id: "pairs",
    name: "Statistical arbitrage / pairs",
    detail:
      "Unavailable: synchronized historical pairs, cointegration/hedge-ratio model, executable two-leg costs and 100+ qualified outcomes are not configured.",
  },
  {
    id: "momentum",
    name: "Cross-sectional / time-series momentum",
    detail:
      "Unavailable: point-in-time universe membership, delistings, corporate actions, total-return history and ranking/rebalance model are not configured.",
  },
  {
    id: "making",
    name: "Market making",
    detail:
      "Unavailable: genuine venue L2, queue/partial-fill/cancel evidence, tick/lot sizes, fee/rebate schedules and inventory simulator are not connected. Broker quotes are not depth.",
  },
  {
    id: "macro",
    name: "Systematic macro / trend following",
    detail:
      "Unavailable as a macro model: historical release vintages and 5–10 years of multi-asset data are missing. The separate EMA pullback detector is not macro analysis.",
  },
  {
    id: "ml",
    name: "Machine learning",
    detail:
      "Unavailable: point-in-time features/labels, training pipeline, costed walk-forward, untouched holdout and minimum 100 real outcomes are not established. File scanning is not a trained win model.",
  },
] as const;
