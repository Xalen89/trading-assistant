import { describe, expect, it } from "vitest";
import type { Candle, Timeframe } from "../../lib/trading/model";
import {
  evaluateNoCodeQuantRule,
  validateNoCodeQuantRule,
  type NoCodeQuantRule,
} from "../../lib/trading/no-code-quant";
import type { QuantSeries } from "../../lib/trading/quant-lab-types";

// Local synthetic bars exercise only validation and arithmetic; no provider is contacted.
const START = 1_700_000_000;
const TIMEFRAME: Timeframe = "1m";
const NOW = (START + 5 * 60) * 1_000;

function syntheticSeries(
  symbol: string,
  closes: readonly number[],
): QuantSeries {
  const candles: Candle[] = closes.map((close, index) => ({
    time: START + index * 60,
    open: close,
    high: close,
    low: close,
    close,
    volume: 100 + index,
  }));
  return {
    symbol,
    timeframe: TIMEFRAME,
    source: "synthetic-local-fixture",
    candles,
    fetchedAt: NOW,
    provenance: "provider",
  };
}

function rule(
  topNChildren: readonly string[],
  inverseVolChildren: readonly string[],
): NoCodeQuantRule {
  return {
    ruleVersion: 1,
    name: "Case-normalized closed-bar rule",
    strategyId: "strategy-fixture",
    strategyVersion: 1,
    status: "draft",
    root: {
      type: "all",
      id: "root",
      children: [
        {
          type: "condition",
          id: "condition",
          condition: {
            kind: "trend",
            fastBars: 1,
            slowBars: 2,
            comparison: "above",
          },
          child: { type: "asset", id: "condition-asset", symbol: " btc-usd " },
        },
        {
          type: "topN",
          id: "top-n",
          lookbackBars: 2,
          topN: 1,
          children: topNChildren.map((symbol, index) => ({
            type: "asset",
            id: `top-${index}`,
            symbol,
          })),
        },
        {
          type: "inverseVolWeight",
          id: "inverse-vol",
          lookbackBars: 2,
          children: inverseVolChildren.map((symbol, index) => ({
            type: "asset",
            id: `inverse-${index}`,
            symbol,
          })),
        },
      ],
    },
  };
}

const FIXTURE_SERIES = [
  syntheticSeries(" BTC-USD ", [100, 101, 103, 106, 110]),
  syntheticSeries("eth-usd", [100, 102, 103, 105, 106]),
  syntheticSeries(" Sol-Usd", [100, 99, 101, 100, 103]),
];

describe("no-code quant fixed universes", () => {
  it("allows an independent condition to reuse a canonical symbol and evaluates case/space variants against canonical sources", () => {
    const candidate = rule(["btc-usd", " ETH-USD "], ["BTC-USD", " sol-usd "]);

    const validation = validateNoCodeQuantRule(candidate);
    const evaluation = evaluateNoCodeQuantRule(candidate, {
      now: NOW,
      series: FIXTURE_SERIES,
    });

    expect(validation).toMatchObject({
      valid: true,
      assetSymbols: ["BTC-USD", "ETH-USD", "SOL-USD"],
    });
    expect(evaluation).toMatchObject({
      status: "ready",
      autoExecution: false,
      hypotheticalResearch: true,
    });
    expect(evaluation.conditionResults[0]).toMatchObject({
      symbol: "BTC-USD",
      met: true,
    });
    expect(evaluation.selections[0]?.ranked.map((item) => item.symbol)).toEqual(
      ["BTC-USD", "ETH-USD"],
    );
    expect(
      evaluation.allocations[0]?.weights.map((item) => item.symbol),
    ).toEqual(["BTC-USD", "SOL-USD"]);
  });

  it("fails closed before evaluation when either fixed universe repeats a symbol by case or whitespace", () => {
    const candidate = rule(
      ["BTC-USD", " eth-usd ", "ETH-USD"],
      ["SOL-USD", " sol-usd "],
    );

    const validation = validateNoCodeQuantRule(candidate);
    const evaluation = evaluateNoCodeQuantRule(candidate, {
      now: NOW,
      series: FIXTURE_SERIES,
    });

    expect(validation.valid).toBe(false);
    expect(validation.issues).toEqual(
      expect.arrayContaining([
        "root.children[1].children must contain distinct symbols after trimming and case normalization.",
        "root.children[2].children must contain distinct symbols after trimming and case normalization.",
      ]),
    );
    expect(evaluation.status).toBe("insufficient-data");
    expect(evaluation.selections).toEqual([]);
    expect(evaluation.allocations).toEqual([]);
    expect(evaluation.researchReady).toBe(false);
  });
});
