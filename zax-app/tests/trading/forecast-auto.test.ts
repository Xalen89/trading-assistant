import { describe, it, expect } from "vitest";
import {
  prepareForecastSource,
  type ForecastSourceInput,
} from "../../server/trading/forecast-source";
import { materializeForecast } from "../../lib/trading/ai-forecast";
import { scenarioLayersSchema } from "../../lib/trading/scenario-layer-storage";

// Synthetic unit fixtures only; these do not establish trading or forecast accuracy.
const now = Date.UTC(2026, 9, 18, 16, 0);
const step = 300;
function input(ageSeconds: number): ForecastSourceInput {
  const lastOpen = now / 1000 - step - ageSeconds;
  return {
    market: "BTC-USD",
    timeframe: "5m",
    contextMode: "auto",
    feed: {
      source: "unit venue",
      fetchedAt: now,
      sourceCadenceSeconds: step,
      candles: Array.from({ length: 16 }, (_, i) => ({
        time: lastOpen - (15 - i) * step,
        open: 100 + i,
        high: 102 + i,
        low: 99 + i,
        close: 101 + i,
        volume: 1,
      })),
    },
    quote: {
      symbol: "BTC-USD",
      price: 116,
      change: 0,
      timestamp: now / 1000,
      status: "live",
      source: "unit quote",
    },
  };
}

describe("automatic forecast context is not a stale-trading override", () => {
  it("keeps current context when actual completed bars and quote are fresh", () => {
    const result = prepareForecastSource(input(30), now);
    expect(result.contextMode).toBe("current");
    expect(result.sourceFreshness.status).toBe("fresh");
    expect(result.currentQuote?.price).toBe(116);
    expect(result.contextResolutionReason).toBeUndefined();
  });
  it("resolves a seven-hour-old source to dated completed history without a quote", () => {
    const original = input(7 * 3600);
    const snapshot = JSON.stringify(original.feed.candles);
    const result = prepareForecastSource(original, now);
    expect(result.contextMode).toBe("last-available");
    expect(result.sourceFreshness.status).toBe("stale");
    expect(result.sourceFreshness.ageSeconds).toBe(7 * 3600);
    expect(result.currentQuote).toBeUndefined();
    expect(result.anchor.time).toBe(original.feed.candles.at(-1)?.time);
    expect(result.contextResolutionReason).toMatch(
      /Auto.*historical-only.*not a current-market/i,
    );
    expect(JSON.stringify(original.feed.candles)).toBe(snapshot);
  });
  it("does not change the strict Current rejection of the same source", () => {
    expect(() =>
      prepareForecastSource(
        { ...input(7 * 3600), contextMode: "current" },
        now,
      ),
    ).toThrow(/Completed source bars are stale/);
  });
  it("uses completed history if quote is missing or stale, without relabelling fresh bars stale", () => {
    for (const quote of [
      undefined,
      { ...input(30).quote!, timestamp: now / 1000 - 121 },
    ]) {
      const result = prepareForecastSource({ ...input(30), quote }, now);
      expect(result.contextMode).toBe("last-available");
      expect(result.sourceFreshness.status).toBe("fresh");
      expect(result.currentQuote).toBeUndefined();
      expect(result.contextResolutionReason).toMatch(/historical-only/);
    }
  });
  it("does not fabricate an Auto scenario from insufficient real history", () => {
    const value = input(30);
    value.feed.candles = value.feed.candles.slice(0, 3);
    expect(() => prepareForecastSource(value, now)).toThrow(
      /at least 15 valid completed/,
    );
  });
  it("persists requested Auto but resolved historical context separately", () => {
    const result = prepareForecastSource(input(7 * 3600), now);
    const forecast = materializeForecast(
      {
        direction: "up",
        thesis: "Unit hypothesis",
        assumptions: ["Unit condition"],
        invalidation: "Unit invalidation",
        steps: Array.from({ length: 12 }, (_, i) => ({
          closeAtr: (i + 1) / 12,
          upperWickAtr: 0.1,
          lowerWickAtr: 0.1,
        })),
      },
      {
        id: "unit-auto",
        market: "BTC-USD",
        timeframe: "5m",
        model: "unit-model",
        generatedAt: now,
        expiresAt: now + 60_000,
        anchorAt: result.anchor.time,
        anchorPrice: result.anchor.close,
        sourceLastClosedAt: result.closed.at(-1)!.time,
        source: "unit venue",
        atr: 2,
        contextMode: result.contextMode,
        requestedContextMode: "auto",
        contextResolutionReason: result.contextResolutionReason,
        sourceFreshness: result.sourceFreshness,
      },
    );
    const saved = scenarioLayersSchema.parse([
      {
        id: "unit-layer",
        kind: "ai",
        label: "Unit",
        market: "BTC-USD",
        sourceTimeframe: "5m",
        displayTimeframes: ["5m", "15m"],
        enabled: true,
        style: "both",
        anchorMode: "follow",
        color: "#59A8FF",
        createdAt: now,
        forecast,
      },
    ]);
    expect(saved[0].kind).toBe("ai");
    if (saved[0].kind === "ai") {
      expect(saved[0].forecast.requestedContextMode).toBe("auto");
      expect(saved[0].forecast.contextMode).toBe("last-available");
      expect(saved[0].forecast.probability).toBeNull();
    }
  });
});
