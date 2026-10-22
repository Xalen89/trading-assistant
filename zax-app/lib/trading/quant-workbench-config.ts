import {
  DEFAULT_QUANT_SETTINGS,
  type QuantFamily,
  type QuantSettings,
} from "./quant-lab-types";
import type { Timeframe } from "./model";
export type QuantStarter = {
  symbols: string[];
  timeframe: Timeframe;
  bars: number;
  settings: QuantSettings;
};
/** Real public-source inputs only. This chooses a research configuration, not sample candles or an order. */
export function quantStarter(family: QuantFamily): QuantStarter {
  return {
    symbols:
      family === "making" || family === "ml"
        ? ["BTC-USD"]
        : ["BTC-USD", "ETH-USD"],
    timeframe: family === "making" ? "1m" : family === "pairs" ? "1h" : "1d",
    bars: family === "making" ? 60 : 900,
    settings: { ...DEFAULT_QUANT_SETTINGS },
  };
}
export const QUANT_PURPOSE: Record<
  QuantFamily,
  {
    question: string;
    steps: string;
    output: string;
    next: string;
    noSignal: string;
  }
> = {
  pairs: {
    question:
      "Are BTC and ETH currently stretched apart relative to their recent relationship?",
    steps:
      "Start with two different markets and synchronized history. Run to calculate their hedge relationship and spread. The test can fail without the tool being broken.",
    output:
      "A spread/z-score, hedge ratio, formal no-cointegration test and exploratory two-leg research. A p-value is NOT a win probability.",
    next: "Inspect relationship stability and costs. Use the coach to understand which conditions failed; do not place one leg of a pair by itself.",
    noSignal:
      "The model ran, but its spread/relationship conditions did not justify a current two-leg candidate. No candidate is the correct result when the gate fails.",
  },
  momentum: {
    question:
      "Which of the selected assets has stronger recent price momentum?",
    steps:
      "Select at least two assets. The starter uses BTC and ETH daily history; you can change the selected comparison set.",
    output:
      "Relative rankings, time-series trend states and an exploratory rebalance/equity history for the exact selected universe.",
    next: "Compare leaders and laggards, then examine turnover and assumed costs. This is not a scan of every asset or a recommended portfolio.",
    noSignal:
      "The selected data did not satisfy the current momentum conditions. Inspect the rankings and threshold rules instead of forcing a trade.",
  },
  making: {
    question:
      "Where would an inventory-aware two-sided quote sit against the actual Coinbase book?",
    steps:
      "Use one supported Coinbase product. Run retrieves venue depth; historical bars are not an input to this model.",
    output:
      "A genuine received book plus theoretical bid/ask quote and inventory constraints—not orders, filled trades or queue priority.",
    next: "Compare the theoretical quotes with the book and fee assumptions. This teaches market-making mechanics; it cannot operate a quoting bot.",
    noSignal:
      "No eligible theoretical quote was produced. Check inventory limits, venue increments, book freshness and cost assumptions.",
  },
  macro: {
    question:
      "What does a slow multi-asset price trend and volatility-scaling rule show?",
    steps:
      "Use at least two assets with daily/weekly history. The starter is BTC and ETH daily data; advanced macro release-vintage inputs remain absent.",
    output:
      "Systematic price-trend/volatility research. This is a working technical trend baseline, not a complete macroeconomic forecasting model.",
    next: "Inspect allocation, turnover and drawdown under your explicit costs. Do not read price trend as knowledge of inflation/rate surprises.",
    noSignal:
      "The price-trend rule is currently neutral or lacks adequate history. Missing macro vintages are a separate scope limit, not a reason to invent a signal.",
  },
  ml: {
    question:
      "Can a simple past-only feature classifier distinguish the next holding-period return direction in this dataset?",
    steps:
      "Start with one asset and sufficient history. The starter requests 900 daily BTC bars for chronological training/testing.",
    output:
      "A forward-return classification experiment with sample/split and cost information—not a trained probability of winning your trade.",
    next: "Inspect the test/holdout coverage, leakage and assumptions before considering features. A classifier score does not approve a strategy.",
    noSignal:
      "The classifier or its thresholds did not produce a current candidate. Check sample coverage and reported model state, not a promised prediction.",
  },
};
