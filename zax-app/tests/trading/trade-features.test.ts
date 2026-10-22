import { describe, expect, it } from "vitest";
import { tradeFeatureSnapshot } from "../../lib/trading/trade-features";
import type { Candle, Quote, Trade } from "../../lib/trading/model";
import type { SetupAnalysis } from "../../lib/trading/setup-model";

// Synthetic unit OHLC only. These fixtures do not represent app, market, or broker performance.
const AS_OF_SECONDS = 1_900_000_000;

function candle(index: number): Candle {
  const close = 100 + index;
  return {
    time: AS_OF_SECONDS - 25 * 60 + index * 60,
    open: close - 0.25,
    high: close + 1,
    low: close - 1,
    close,
    volume: 100 + index * 10,
  };
}

function analysis(asOf: number = AS_OF_SECONDS): SetupAnalysis {
  return {
    market: "UNIT",
    timeframe: "1m",
    asOf,
    source: "UNIT supplied OHLC",
    candles: [
      ...Array.from({ length: 25 }, (_, index) => candle(index)),
      {
        ...candle(999),
        time: AS_OF_SECONDS,
        close: 9_999,
        open: 9_998,
        high: 10_000,
        low: 9_997,
      },
    ],
  } as SetupAnalysis;
}

function trade(): Trade {
  return {
    id: "unit-trade",
    market: "UNIT",
    side: "long",
    status: "open",
    entry: 124,
    stop: 120,
    target: 132,
    quantity: 2,
    pointValue: 1,
    strategyId: "unit",
    strategyName: "Synthetic unit strategy",
    strategyVersion: 1,
    factors: [],
    journal: {},
    createdAt: AS_OF_SECONDS * 1_000 - 5_000,
    initialQuantity: 2,
    originalStop: 120,
    originalTarget: 132,
    initialRisk: 8,
  };
}

describe("tradeFeatureSnapshot — deterministic synthetic UNIT fixtures", () => {
  it("uses only fully closed bars at the stated seconds cutoff and stores milliseconds explicitly", () => {
    const snapshot = tradeFeatureSnapshot(
      analysis(AS_OF_SECONDS * 1_000),
      trade(),
      {
        symbol: "UNIT",
        price: 124.5,
        change: 0,
        bid: 124.4,
        ask: 124.6,
        timestamp: AS_OF_SECONDS - 1,
        source: "UNIT quote",
        status: "live",
      },
    );

    expect(snapshot.asOf).toBe(AS_OF_SECONDS * 1_000);
    expect(snapshot.values.analysis_as_of_ms).toBe(AS_OF_SECONDS * 1_000);
    expect(snapshot.values.closed_bar_count).toBe(25);
    // The synthetic candle at AS_OF_SECONDS remains incomplete (time + 60 > cutoff).
    expect(snapshot.values.bar_close_t1).toBe(124);
    expect(snapshot.values.bar_close_t1).not.toBe(9_999);
    expect(snapshot.values.trend_efficiency_20).toBeCloseTo(1);
    expect(snapshot.regime).toBe("trending");
    expect(snapshot.values.planned_initial_risk).toBe(8);
    expect(snapshot.values.planned_reward_to_risk).toBe(2);
    expect(snapshot.values.quote_spread).toBeCloseTo(0.2);
    expect(snapshot.source).toContain("1900000000s / 1900000000000ms");
    expect(snapshot.source).toContain("broker/provider proxy");
    expect(Object.keys(snapshot.values)).not.toContain("realized_pnl");
    expect(Object.keys(snapshot.values)).not.toContain("outcome");
  });

  it("does not manufacture bid/ask, venue VWAP, NBBO, order flow, or correlation", () => {
    const quote: Quote = {
      symbol: "UNIT",
      price: 124,
      change: 0,
      timestamp: AS_OF_SECONDS - 1,
      source: "UNIT single-price quote",
      status: "live",
    };
    const snapshot = tradeFeatureSnapshot(analysis(), trade(), quote);

    expect(snapshot.values.quote_bid).toBeNull();
    expect(snapshot.values.quote_ask).toBeNull();
    expect(snapshot.values.quote_mid).toBeNull();
    expect(snapshot.values.venue_vwap).toBeNull();
    expect(snapshot.values.nbbo_mid).toBeNull();
    expect(snapshot.values.order_flow_imbalance).toBeNull();
    expect(snapshot.values.benchmark_return_correlation_20).toBeNull();
    expect(snapshot.missing.join("\n")).toContain("quote_bid:");
    expect(snapshot.missing.join("\n")).toContain("venue_vwap:");
    expect(snapshot.missing.join("\n")).toContain("nbbo_mid:");
    expect(snapshot.missing.join("\n")).toContain("order_flow_imbalance:");
    expect(snapshot.missing.join("\n")).toContain(
      "benchmark_return_correlation_20:",
    );
  });

  it("excludes a quote later than the analysis cutoff rather than leaking future price information", () => {
    const snapshot = tradeFeatureSnapshot(analysis(), trade(), {
      symbol: "UNIT",
      price: 130,
      change: 0,
      bid: 129.9,
      ask: 130.1,
      timestamp: AS_OF_SECONDS + 1,
      source: "UNIT future quote",
      status: "live",
    });

    expect(snapshot.values.quote_price).toBeNull();
    expect(snapshot.values.quote_bid).toBeNull();
    expect(snapshot.missing.join(" ")).toContain(
      "excluded as future information",
    );
  });
});
