import { describe, expect, it } from "vitest";

import { SECONDS } from "../../lib/trading/engine";
import type { Candle } from "../../lib/trading/model";
import { runMacroTrend } from "../../lib/trading/quant-macro";
import type {
  QuantLabInput,
  QuantSeries,
} from "../../lib/trading/quant-lab-types";

// Synthetic unit fixtures are algorithm tests only. They are never performance evidence.
const START = 1_700_000_000;
const DAY = SECONDS["1d"];

function syntheticBars(count: number, base: number, finalShock = 1): Candle[] {
  return Array.from({ length: count }, (_, index) => {
    const trend = 0.0012 * index;
    const variation = 0.004 * Math.sin(index * 0.73 + base);
    const shock = index === count - 1 ? finalShock : 1;
    const close = base * Math.exp(trend + variation) * shock;
    const open =
      base *
      Math.exp(
        0.0012 * Math.max(0, index - 1) +
          0.004 * Math.sin(Math.max(0, index - 1) * 0.73 + base),
      );
    return {
      time: START + index * DAY,
      open,
      high: Math.max(open, close) * 1.002,
      low: Math.min(open, close) * 0.998,
      close,
      volume: 100,
    };
  });
}

function input(
  series: QuantSeries[],
  now = (START + 50 * DAY) * 1000,
  feeBps = 0,
  slippageBps = 0,
): QuantLabInput {
  return {
    family: "macro",
    series,
    now,
    settings: {
      lookback: 20,
      entryZ: 2,
      exitZ: 0.5,
      feeBps,
      slippageBps,
      holdingBars: 5,
      startingEquity: 100_000,
      inventory: 0,
      orderSize: 0.01,
      maxInventory: 0.1,
    },
  };
}

function asset(
  symbol: string,
  base: number,
  provenance: "provider" | "user-import",
  finalShock = 1,
): QuantSeries {
  return {
    symbol,
    timeframe: "1d",
    source: "Synthetic algorithm fixture — not performance evidence",
    candles: syntheticBars(50, base, finalShock),
    fetchedAt: (START + 50 * DAY) * 1000,
    provenance,
    adjustedTotalReturn: false,
  };
}

describe("slow trend / volatility-scale macro family", () => {
  it("uses only closed bars and delays targets by one completed bar", () => {
    const assets = [
      asset("ALPHA", 100, "provider", 0.8),
      asset("BETA", 125, "user-import", 0.8),
    ];
    const full = runMacroTrend(input(assets));
    const withoutFinalBar = runMacroTrend(
      input(assets, (START + 49 * DAY) * 1000),
    );

    expect(full.status).toBe("ready");
    expect(full.summary).toContain("not performance evidence");
    expect(full.equity.slice(0, -1)).toEqual(withoutFinalBar.equity);
    expect(full.equity.at(-1)!.value).toBeLessThan(
      withoutFinalBar.equity.at(-1)!.value,
    );
    expect(full.asOf).toBe(START + 50 * DAY);
    expect(full.signals).toHaveLength(2);
    expect(
      full.metrics.find((metric) => metric.key === "ewmac_components")?.value,
    ).toContain("8/32");
    expect(
      full.metrics.find((metric) => metric.key === "ewmac_forecast_cap")?.value,
    ).toBe(20);
    expect(full.signals.every((signal) => signal.at === full.asOf)).toBe(true);
    expect(
      full.signals.every((signal) =>
        signal.reason.includes("Next-bar target only"),
      ),
    ).toBe(true);
  });

  it("deducts only supplied fees and slippage on target turnover and keeps provenance visible", () => {
    const assets = [
      asset("ALPHA", 100, "provider"),
      asset("BETA", 125, "user-import"),
    ];
    const noCosts = runMacroTrend(input(assets));
    const userCosts = runMacroTrend(input(assets, undefined, 12.5, 3.5));

    expect(userCosts.status).toBe("ready");
    expect(userCosts.equity.at(-1)!.value).toBeLessThan(
      noCosts.equity.at(-1)!.value,
    );
    expect(
      userCosts.metrics.find((metric) => metric.key === "fee_bps")?.value,
    ).toBe(12.5);
    expect(
      userCosts.metrics.find((metric) => metric.key === "slippage_bps")?.value,
    ).toBe(3.5);
    expect(
      userCosts.metrics.find((metric) => metric.key === "estimated_costs")
        ?.value,
    ).toBeGreaterThan(0);
    const sources = String(
      userCosts.metrics.find((metric) => metric.key === "sources")?.value,
    );
    expect(sources).toContain("ALPHA: provider");
    expect(sources).toContain("BETA: user-import");
  });

  it("omits invalid, duplicate, incomplete and irregular records without filling them", () => {
    const alpha = asset("ALPHA", 100, "provider");
    const beta = asset("BETA", 125, "provider");
    const duplicateClose = alpha.candles[10].close * 1.5;
    const duplicate = {
      ...alpha.candles[10],
      close: duplicateClose,
      high: duplicateClose * 1.002,
      low: Math.min(alpha.candles[10].open, duplicateClose) * 0.998,
    };
    alpha.candles = [
      ...alpha.candles,
      duplicate,
      { ...alpha.candles[12], time: alpha.candles[12].time + 50 * DAY },
      { ...alpha.candles[13], close: 0 },
    ];
    beta.candles = beta.candles.filter((bar) => bar.time !== START + 30 * DAY);

    const result = runMacroTrend(input([alpha, beta]));

    expect(result.status).toBe("ready");
    expect(result.equity.some((point) => point.time === START + 31 * DAY)).toBe(
      false,
    );
    expect(result.limitations.join(" ")).toContain("duplicate timestamp");
    expect(result.limitations.join(" ")).toContain("unfinished/future");
    expect(result.limitations.join(" ")).toContain("invalid OHLC");
    expect(result.dataRequirements.join(" ")).toContain("interpolation");
  });

  it("retains unconfirmed/OOS gates and keeps the release-vintage/rate model unavailable", () => {
    const result = runMacroTrend(
      input([asset("ALPHA", 100, "provider"), asset("BETA", 125, "provider")]),
    );

    expect(result.validation.status).toBe("unconfirmed");
    expect(result.validation.walkForward).toBe(false);
    expect(result.validation.untouchedHoldout).toBe(false);
    expect(result.validation.testSamples).toBe(0);
    expect(result.validation.reasons.join(" ")).toContain(
      "100 real, independent OOS",
    );
    expect(
      result.metrics.find((metric) => metric.key === "macro_release_rate_model")
        ?.value,
    ).toBe("not available");
    expect(result.dataRequirements.join(" ")).toContain("revision vintages");
  });

  it("rejects intraday, invalid-cost, over-asset and oversized inputs instead of inventing a replacement", () => {
    const intraday = asset("ALPHA", 100, "provider");
    intraday.timeframe = "1h";
    const second = asset("BETA", 125, "provider");
    expect(runMacroTrend(input([intraday, second])).status).toBe(
      "insufficient-data",
    );

    expect(
      runMacroTrend(
        input(
          [asset("ALPHA", 100, "provider"), asset("BETA", 125, "provider")],
          undefined,
          -1,
        ),
      ),
    ).toMatchObject({
      status: "insufficient-data",
      dataRequirements: expect.arrayContaining([
        expect.stringContaining("no exchange cost estimate"),
      ]),
    });

    const tooMany = Array.from({ length: 11 }, (_, index) =>
      asset(`ASSET-${index}`, 100 + index, "provider"),
    );
    expect(runMacroTrend(input(tooMany))).toMatchObject({
      status: "insufficient-data",
    });

    const tooLarge = asset("ALPHA", 100, "provider");
    tooLarge.candles = Array.from({ length: 5_001 }, (_, index) => ({
      ...tooLarge.candles[index % tooLarge.candles.length],
      time: START + index * DAY,
    }));
    expect(
      runMacroTrend(input([tooLarge, asset("BETA", 125, "provider")])),
    ).toMatchObject({
      status: "insufficient-data",
      dataRequirements: expect.arrayContaining([
        expect.stringContaining("at most 2000 bars"),
      ]),
    });
  });
});
