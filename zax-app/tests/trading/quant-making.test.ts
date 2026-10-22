import { describe, expect, it } from "vitest";
import { runMarketMaking } from "../../lib/trading/quant-making";
import type { Candle } from "../../lib/trading/model";
import type { QuantLabInput } from "../../lib/trading/quant-lab-types";

const NOW = 1_800_000_000_000;
const SYNTHETIC_SOURCE =
  "SYNTHETIC algorithm fixture only; not trading evidence";

function candle(time: number, close = 100): Candle {
  return {
    time,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 10,
  };
}

function input(overrides: Partial<QuantLabInput> = {}): QuantLabInput {
  return {
    family: "making",
    now: NOW,
    settings: {
      lookback: 60,
      entryZ: 2,
      exitZ: 0.5,
      feeBps: 1,
      slippageBps: 1,
      holdingBars: 5,
      startingEquity: 100_000,
      inventory: 0.04,
      orderSize: 0.03,
      maxInventory: 0.1,
    },
    series: [
      {
        symbol: "SYNTH-USD",
        timeframe: "1m",
        source: SYNTHETIC_SOURCE,
        fetchedAt: NOW - 1,
        provenance: "provider",
        candles: [candle(NOW / 1_000 - 120), candle(NOW / 1_000 - 60)],
      },
    ],
    book: {
      symbol: "SYNTH-USD",
      source: SYNTHETIC_SOURCE,
      receivedAt: NOW - 2,
      status: "streamed",
      tickSize: 0.1,
      lotSize: 0.01,
      bids: [
        [99.9, 4],
        [99.8, 2],
      ],
      asks: [
        [100.1, 1],
        [100.2, 3],
      ],
    },
    ...overrides,
  };
}

function metric(result: ReturnType<typeof runMarketMaking>, key: string) {
  return result.metrics.find((item) => item.key === key)?.value;
}

describe("market-making synthetic algorithm fixtures (not performance evidence)", () => {
  it("builds a passive tick/lot plan from supplied L2 and keeps each possible fill inside its inventory cap", () => {
    const result = runMarketMaking(input());

    expect(result.status).toBe("ready");
    expect(result.paperPlan?.legs).toHaveLength(2);
    expect(result.equity).toEqual([]);
    expect(result.validation).toMatchObject({
      status: "unconfirmed",
      actualSamples: 0,
      walkForward: false,
      untouchedHoldout: false,
    });
    expect(result.validation.reasons.join(" ")).toContain("100");
    expect(result.validation.reasons.join(" ")).toContain("OOS");
    expect(metric(result, "best-bid")).toBe(99.9);
    expect(metric(result, "best-ask")).toBe(100.1);
    expect(metric(result, "depth-imbalance")).toBeCloseTo(0.2);

    for (const leg of result.paperPlan!.legs) {
      expect(leg.referencePrice / 0.1).toBeCloseTo(
        Math.round(leg.referencePrice / 0.1),
      );
      expect(leg.quantity / 0.01).toBeCloseTo(Math.round(leg.quantity / 0.01));
      if (leg.side === "long")
        expect(0.04 + leg.quantity).toBeLessThanOrEqual(0.1);
      else expect(0.04 - leg.quantity).toBeGreaterThanOrEqual(-0.1);
    }
  });

  it("uses only user-supplied costs as the no-quote gate and never invents a venue fee", () => {
    const result = runMarketMaking(
      input({
        settings: { ...input().settings, feeBps: 12, slippageBps: 12 },
      }),
    );

    expect(result.status).toBe("ready");
    expect(result.paperPlan).toBeUndefined();
    expect(result.summary).toContain(
      "supplied two-sided fee and slippage allowance",
    );
    expect(metric(result, "fee-bps")).toBe(12);
    expect(metric(result, "slippage-bps")).toBe(12);
    expect(metric(result, "two-sided-cost-bps")).toBe(48);
    expect(result.equity).toEqual([]);
  });

  it("excludes duplicate, invalid, open, future, and future-fetched inputs without filling or merging them", () => {
    const base = input();
    const result = runMarketMaking({
      ...base,
      series: [
        {
          ...base.series[0],
          candles: [
            candle(NOW / 1_000 - 120),
            candle(NOW / 1_000 - 120, 101),
            candle(NOW / 1_000 - 59),
            candle(NOW / 1_000 + 60),
            { ...candle(NOW / 1_000 - 180), close: Number.NaN },
          ],
        },
        {
          ...base.series[0],
          symbol: "IMPORTED-SYNTH",
          provenance: "user-import",
          fetchedAt: NOW + 1,
          candles: [candle(NOW / 1_000 - 120)],
        },
      ],
      book: {
        ...base.book!,
        bids: [
          [99.9, 3],
          [99.9, 2],
          [99.8, 1],
          [Number.NaN, 1],
          [99.7, 0],
        ],
      },
    });

    expect(result.status).toBe("ready");
    expect(metric(result, "provider-series")).toBe(1);
    expect(metric(result, "imported-series")).toBe(1);
    expect(metric(result, "closed-bars-diagnostic")).toBe(0);
    expect(metric(result, "duplicate-bars-excluded")).toBe(2);
    expect(metric(result, "book-levels-excluded")).toBe(4);
    expect(metric(result, "best-bid")).toBe(99.8);
    expect(
      result.paperPlan?.legs.every((leg) => leg.symbol === "SYNTH-USD"),
    ).toBe(true);
  });

  it("rejects a future book instead of treating it as current market data", () => {
    const base = input();
    const result = runMarketMaking({
      ...base,
      book: { ...base.book!, receivedAt: NOW + 1 },
    });

    expect(result.status).toBe("insufficient-data");
    expect(result.paperPlan).toBeUndefined();
    expect(result.summary).toContain("after now");
  });

  it("invalidates a stale streamed WebSocket receipt rather than proposing a current paper quote", () => {
    const base = input();
    const result = runMarketMaking({
      ...base,
      book: { ...base.book!, receivedAt: NOW - 10_001 },
    });

    expect(result.status).toBe("insufficient-data");
    expect(result.paperPlan).toBeUndefined();
    expect(result.summary).toContain("snapshot receipt");
    expect(result.dataRequirements.join(" ")).toContain("stale");
  });

  it("rejects over-asset and oversized history inputs rather than silently truncating them", () => {
    const base = input();
    const tooManyAssets = Array.from({ length: 9 }, (_, index) => ({
      ...base.series[0],
      symbol: `SYNTH-${index}`,
    }));
    const tooManyBars = {
      ...base.series[0],
      candles: Array.from({ length: 5_001 }, (_, index) =>
        candle(NOW / 1_000 - 60 - index * 60),
      ),
    };

    expect(runMarketMaking({ ...base, series: tooManyAssets }).status).toBe(
      "insufficient-data",
    );
    expect(
      runMarketMaking({ ...base, series: [tooManyBars] }).dataRequirements.join(
        " ",
      ),
    ).toContain("at most 5000 bars");
  });
});
