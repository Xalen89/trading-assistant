import { describe, it, expect } from "vitest";
import {
  forecastATR,
  forecastDraftSchema,
  materializeForecast,
  type ForecastDraft,
} from "../../lib/trading/ai-forecast";
import { usableForecast } from "../../lib/trading/forecast-display";
import { buildLightweightPayload } from "../../lib/trading/lightweight-payload";
// Synthetic unit fixtures ONLY: no forecast accuracy or real outcomes are asserted.
const now = Date.now(),
  anchorAt = Math.floor(now / 1000 / 300) * 300;
const input = {
  id: "test-forecast",
  market: "BTC-USD",
  timeframe: "5m" as const,
  model: "fixture-model",
  generatedAt: now,
  expiresAt: now + 300000,
  anchorAt,
  anchorPrice: 100,
  sourceLastClosedAt: anchorAt - 300,
  source: "synthetic-unit-fixture",
  atr: 2,
};
const draft: ForecastDraft = {
  direction: "up",
  thesis: "Conditional unit fixture",
  assumptions: ["Fixture condition"],
  invalidation: "Fixture only",
  steps: Array.from({ length: 12 }, (_, i) => ({
    closeAtr: (i + 1) * 0.1,
    upperWickAtr: 0.1,
    lowerWickAtr: 0.1,
  })),
};
describe("separate AI hypothetical display scenario", () => {
  it("materializes12valid future display-only points with no probability", () => {
    const f = materializeForecast(draft, input);
    expect(f.kind).toBe("ai-hypothetical");
    expect(f.candles).toHaveLength(12);
    expect(f.candles[0].time).toBe(anchorAt + 300);
    expect(f.candles[0].open).toBe(100);
    expect(f.probability).toBeNull();
    expect(f.volumeMeaning).toBe("display-placeholder-not-forecast");
  });
  it("rejects wrong path direction, malformed budgets and nonpositive OHLC", () => {
    expect(() =>
      materializeForecast({ ...draft, direction: "down" }, input),
    ).toThrow(/direction/);
    expect(() =>
      forecastDraftSchema.parse({ ...draft, steps: draft.steps.slice(1) }),
    ).toThrow();
    expect(() =>
      materializeForecast(
        {
          ...draft,
          direction: "down",
          steps: draft.steps.map(() => ({
            closeAtr: -4,
            upperWickAtr: 0,
            lowerWickAtr: 1,
          })),
        },
        { ...input, anchorPrice: 1 },
      ),
    ).toThrow(/bounds/);
  });
  it("hides wrong market, expired and source-rollover scenarios", () => {
    const f = materializeForecast(draft, input),
      last = {
        time: anchorAt,
        open: 100,
        high: 102,
        low: 99,
        close: 100,
        volume: 10,
      };
    expect(usableForecast(f, "BTC-USD", "5m", last, now).valid).toBe(true);
    expect(usableForecast(f, "ETH-USD", "5m", last, now).valid).toBe(false);
    expect(usableForecast(f, "BTC-USD", "5m", last, now + 400000).valid).toBe(
      false,
    );
    expect(
      usableForecast(f, "BTC-USD", "5m", { ...last, time: anchorAt + 300 }, now)
        .valid,
    ).toBe(false);
  });
  it("never appends generated prices into actual candles or historical replay", () => {
    const actual = {
      time: anchorAt,
      open: 100,
      high: 102,
      low: 99,
      close: 100,
      volume: 10,
    };
    const p = buildLightweightPayload(
      {
        candles: [actual],
        market: "BTC-USD",
        timeframe: "5m",
        precision: 2,
        showFvg: false,
        showRanges: false,
        showLevels: false,
        future: false,
        aiForecast: materializeForecast(draft, input),
        aiForecastStyle: "both",
      },
      anchorAt + 300,
    );
    expect(p.candles).toEqual([actual]);
    expect(p.ghost).toEqual([]);
    expect(p.forecastGhost).toHaveLength(12);
    expect(p.forecastLabel).toMatch(/HYPOTHETICAL/);
  });
  it("uses actual OHLC volatility with requiredwarmup", () => {
    expect(() => forecastATR([])).toThrow(/completed/);
    const closed = Array.from({ length: 20 }, (_, i) => ({
      time: anchorAt - 300 * (20 - i),
      open: 100,
      close: 100,
      high: 101,
      low: 99,
      volume: 10,
    }));
    expect(forecastATR(closed)).toBe(2);
  });
});
