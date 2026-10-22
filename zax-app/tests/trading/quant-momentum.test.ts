import { describe, expect, it } from "vitest";
import type { Candle, Timeframe } from "../../lib/trading/model";
import type {
  QuantLabInput,
  QuantSeries,
} from "../../lib/trading/quant-lab-types";
import { runMomentum } from "../../lib/trading/quant-momentum";

// Synthetic fixtures below exercise arithmetic only; they are never performance evidence.
const START = 1_700_000_000;
const TIMEFRAME: Timeframe = "1m";
const COUNT = 30;
const NOW = (START + COUNT * 60) * 1_000;

function syntheticSeries(
  symbol: string,
  closeAt: (index: number) => number,
  provenance: "provider" | "user-import" = "provider",
  timeframe: Timeframe = TIMEFRAME,
): QuantSeries {
  const seconds = timeframe === "1m" ? 60 : 300;
  const candles: Candle[] = Array.from({ length: COUNT }, (_, index) => {
    const close = closeAt(index);
    return {
      time: START + index * seconds,
      open: close * 0.999,
      high: close * 1.002,
      low: close * 0.998,
      close,
      volume: 100 + index,
    };
  });
  return {
    symbol,
    timeframe,
    source:
      provenance === "provider" ? "synthetic-provider" : "synthetic-import",
    candles,
    fetchedAt: NOW,
    provenance,
  };
}

function syntheticInput(feeBps = 0, slippageBps = 0): QuantLabInput {
  return {
    family: "momentum",
    now: NOW,
    settings: {
      lookback: 4,
      entryZ: 2,
      exitZ: 0.5,
      feeBps,
      slippageBps,
      holdingBars: 2,
      startingEquity: 10_000,
      inventory: 0,
      orderSize: 0.01,
      maxInventory: 0.1,
    },
    series: [
      syntheticSeries(
        "UP",
        (index) => 100 * (1 + index * 0.012 + (index % 3) * 0.0007),
      ),
      syntheticSeries(
        "DOWN",
        (index) => 100 * (1 - index * 0.006 + (index % 4) * 0.0005),
        "user-import",
      ),
    ],
  };
}

function value(
  result: ReturnType<typeof runMomentum>,
  key: string,
): number | string | null | undefined {
  return result.metrics.find((item) => item.key === key)?.value;
}

describe("runMomentum", () => {
  it("ranks a fixed supplied universe, produces causal paper targets, and stays unconfirmed", () => {
    const result = runMomentum(syntheticInput());

    expect(result.family).toBe("momentum");
    expect(result.status).toBe("ready");
    expect(result.signals.map((signal) => signal.symbol)).toEqual([
      "UP",
      "DOWN",
    ]);
    expect(
      result.signals.find((signal) => signal.symbol === "UP")?.direction,
    ).toBe("long");
    expect(
      result.signals.find((signal) => signal.symbol === "DOWN")?.direction,
    ).toBe("short");
    expect(result.paperPlan?.description).toContain("paper-only");
    expect(result.equity.length).toBeGreaterThan(1);
    expect(result.equity.every((point) => point.time + 60 <= NOW / 1_000)).toBe(
      true,
    );
    expect(value(result, "source-counts")).toContain(
      "provider:synthetic-provider",
    );
    expect(value(result, "source-counts")).toContain(
      "user-import:synthetic-import",
    );
    expect(result.validation.status).toBe("unconfirmed");
    expect(result.validation.actualSamples).toBeLessThan(100);
    expect(result.validation.walkForward).toBe(false);
    expect(result.validation.untouchedHoldout).toBe(false);
    expect(result.validation.reasons.join(" ")).toContain("out-of-sample");
  });

  it("applies only the user-supplied fee and slippage to turnover", () => {
    const noCosts = runMomentum(syntheticInput());
    const costed = runMomentum(syntheticInput(15, 10));

    expect(value(costed, "supplied-cost")).toBe(25);
    expect(value(costed, "final-equity")).toBeTypeOf("number");
    expect(value(noCosts, "final-equity")).toBeTypeOf("number");
    expect(value(costed, "final-equity") as number).toBeLessThan(
      value(noCosts, "final-equity") as number,
    );
  });

  it("excludes duplicate, future, and still-open supplied candles without forward filling", () => {
    const input = syntheticInput();
    const up = input.series[0];
    const duplicate = { ...up.candles[5] };
    const future: Candle = {
      ...up.candles.at(-1)!,
      time: START + COUNT * 60,
      close: 999_999,
    };
    input.series[0] = { ...up, candles: [...up.candles, duplicate, future] };

    const result = runMomentum(input);

    expect(result.status).toBe("ready");
    expect(result.asOf).toBeLessThan(future.time);
    expect(value(result, "filtered-bars")).toBe("0 / 2 / 1");
    expect(result.limitations.join(" ")).toContain("no interpolation");
  });

  it("refuses mixed horizons and a universe outside its bounded asset limit", () => {
    const mixed = syntheticInput();
    mixed.series[1] = syntheticSeries(
      "FIVE",
      (index) => 100 + index,
      "provider",
      "5m",
    );
    expect(runMomentum(mixed).status).toBe("insufficient-data");

    const tooMany = syntheticInput();
    tooMany.series = Array.from({ length: 11 }, (_, index) =>
      syntheticSeries(`S${index}`, (bar) => 100 + bar + index),
    );
    expect(runMomentum(tooMany).status).toBe("unavailable");
  });

  it("does not claim adjusted total return when the input does not declare it", () => {
    const result = runMomentum(syntheticInput());
    expect(result.limitations.join(" ")).toContain(
      "No input declares adjusted total-return prices.",
    );
    expect(result.limitations.join(" ")).toContain(
      "no point-in-time membership, delisting or survivorship data",
    );
  });

  it("reports causal rank-IC and quintile diagnostics for a supplied fixed universe without inventing beta neutrality", () => {
    const input = syntheticInput(8, 4);
    input.series = [
      syntheticSeries("A", (index) => 100 * (1 + index * 0.02)),
      syntheticSeries("B", (index) => 100 * (1 + index * 0.012)),
      syntheticSeries("C", (index) => 100 * (1 + index * 0.006)),
      syntheticSeries("D", (index) => 100 * (1 - index * 0.004)),
      syntheticSeries("E", (index) => 100 * (1 - index * 0.009)),
    ];
    const settings = input.settings as typeof input.settings & {
      pointInTimeUniverse?: boolean;
    };
    settings.pointInTimeUniverse = true;

    const result = runMomentum(input);

    expect(result.status).toBe("ready");
    expect(value(result, "spearman-rank-ic")).toBeTypeOf("number");
    expect(value(result, "top-quintile-forward-return")).toBeTypeOf("number");
    expect(value(result, "long-short-quintile-forward-return")).toBeTypeOf(
      "number",
    );
    expect(value(result, "modeled-turnover")).toBeGreaterThan(0);
    expect(value(result, "modeled-turnover-costs")).toBeGreaterThan(0);
    expect(value(result, "point-in-time-universe")).toContain("declared");
    expect(value(result, "beta-neutrality")).toContain("unavailable");
    expect(result.validation.status).toBe("unconfirmed");
  });
});
