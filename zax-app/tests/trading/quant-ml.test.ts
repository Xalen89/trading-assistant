import { describe, expect, it } from "vitest";
import type { Candle, Timeframe } from "../../lib/trading/model";
import type {
  QuantLabInput,
  QuantSeries,
} from "../../lib/trading/quant-lab-types";
import {
  runML,
  type MLValidationSettings,
} from "../../lib/trading/quant-ml";

// Synthetic deterministic algorithm fixtures only. They are not market data,
// performance evidence, a profitability claim, or a model-validation result.
const START = 1_800_000_000;
const SECONDS: Record<Timeframe, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "30m": 1_800,
  "1h": 3_600,
  "4h": 14_400,
  "1d": 86_400,
  "1w": 604_800,
};

function fixture(
  timeframe: Timeframe = "5m",
  count = 420,
  phase = 0,
): Candle[] {
  const seconds = SECONDS[timeframe];
  const closes = Array.from({ length: count }, (_, index) => {
    const cycle = Math.sin((index + phase) * 0.24) * 7;
    const shorterCycle = Math.sin((index + phase) * 0.71) * 1.1;
    return 100 + cycle + shorterCycle;
  });
  return closes.map((close, index) => {
    const open = index ? closes[index - 1] : close * 0.998;
    return {
      time: START + index * seconds,
      open,
      high: Math.max(open, close) + 0.5,
      low: Math.min(open, close) - 0.5,
      close,
      volume: index % 17 === 0 ? 0 : 100 + index,
    };
  });
}

function series(
  symbol = "UNIT-ML",
  provenance: QuantSeries["provenance"] = "provider",
  source = "UNIT synthetic provider",
  candles = fixture(),
): QuantSeries {
  return {
    symbol,
    timeframe: "5m",
    source,
    candles,
    fetchedAt: (START + candles.length * SECONDS["5m"]) * 1_000,
    provenance,
  };
}

function input(overrides: Partial<QuantLabInput> = {}): QuantLabInput {
  const candles = fixture();
  return {
    family: "ml",
    series: [series("UNIT-ML", "provider", "UNIT synthetic provider", candles)],
    settings: {
      lookback: 20,
      entryZ: 2,
      exitZ: 0.5,
      feeBps: 1,
      slippageBps: 2,
      holdingBars: 4,
      startingEquity: 10_000,
      inventory: 0,
      orderSize: 0.01,
      maxInventory: 0.1,
    },
    // The latest fixture bar is closed; the next constructed bar, if any, is open.
    now: (START + candles.length * SECONDS["5m"]) * 1_000,
    ...overrides,
  };
}

const valueFor = (result: ReturnType<typeof runML>, key: string) =>
  result.metrics.find((entry) => entry.key === key)?.value;

describe("ML costed-direction research — deterministic synthetic UNIT fixtures", () => {
  it("uses bounded CPCV-by-default boosted-stump research with a latest untouched holdout, without a probability or edge claim", () => {
    const result = runML(input());

    expect(result.family).toBe("ml");
    expect(result.status).toBe("ready");
    expect(result.validation.status).toBe("unconfirmed");
    expect(result.validation.walkForward).toBe(false);
    expect(result.validation.untouchedHoldout).toBe(true);
    expect(result.validation.actualSamples).toBeGreaterThanOrEqual(120);
    expect(result.validation.trainSamples).toBeGreaterThanOrEqual(60);
    expect(result.validation.testSamples).toBeGreaterThan(0);
    expect(valueFor(result, "ml-round-trip-cost")).toBeCloseTo(6);
    expect(valueFor(result, "ml-validation-mode")).toBe("cpcv");
    expect(valueFor(result, "ml-validation-samples")).toBeGreaterThan(0);
    expect(valueFor(result, "ml-holdout-samples")).toBeGreaterThan(0);
    expect(valueFor(result, "ml-walk-forward-accuracy")).not.toBeNull();
    expect(valueFor(result, "ml-holdout-accuracy")).not.toBeNull();
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0].reason).toContain(
      "not a calibrated win probability",
    );
    expect(result.equityBySymbol).toEqual([
      { symbol: "UNIT-ML", points: result.equity },
    ]);
    expect(result.summary).toContain("exploratory and unconfirmed");
    expect(result.limitations.join(" ")).toMatch(
      /No calibrated win probability.*confirmed edge/i,
    );
    expect(result.mlValidation?.label).toBe(
      "costed forward-direction classification",
    );
  });

  it("reports exact fold provenance and test-only reliability without label-overlap, embargo, scaler, model, calibrator, or holdout leakage", () => {
    const result = runML(
      input({
        settings: {
          ...input().settings,
          validationMode: "cpcv",
          embargoPct: 0.03,
          maxFolds: 15,
        } as QuantLabInput["settings"] & MLValidationSettings,
      }),
    );
    const diagnostics = result.mlValidation?.assets[0]?.diagnostics;
    expect(diagnostics).toBeDefined();
    expect(diagnostics?.fittingJobs).toBeLessThanOrEqual(15);
    expect(diagnostics?.validationRows).toBeLessThanOrEqual(2_000);
    expect(diagnostics?.foldPlan.mode).toBe("cpcv");
    expect(diagnostics?.foldPlan.groupCount).toBe(6);
    expect(diagnostics?.foldPlan.testGroupsPerFold).toBe(2);
    expect(diagnostics?.foldPlan.fittingJobs).toBe(15);
    expect(diagnostics?.holdout).toBeDefined();
    expect(diagnostics?.holdoutReliability?.brierScore).not.toBeNull();
    expect(diagnostics?.holdoutReliability?.notWinProbability).toBe(true);

    const overlaps = (left: { start: number; end: number }, right: { start: number; end: number }) =>
      left.start <= right.end && right.start <= left.end;
    const provenance = [
      ...(diagnostics?.foldPlan.folds ?? []),
      ...(diagnostics?.holdout ? [diagnostics.holdout] : []),
    ];
    for (const fold of provenance) {
      const fitted = [
        ...(fold.modelTrainingIndices ?? []),
        ...(fold.calibrationIndices ?? []),
      ];
      expect(fitted.some((index) => fold.testIndices.includes(index))).toBe(
        false,
      );
      for (const trainIndex of fitted) {
        for (const testIndex of fold.testIndices) {
          expect(
            overlaps(
              diagnostics!.events[trainIndex],
              diagnostics!.events[testIndex],
            ),
          ).toBe(false);
        }
      }
      expect(fold.trainingClassCounts.total).toBe(
        fold.trainingClassCounts.negative + fold.trainingClassCounts.positive,
      );
      expect(fold.testClassCounts.total).toBe(
        fold.testClassCounts.negative + fold.testClassCounts.positive,
      );
    }
  });

  it("keeps an explicitly requested walk-forward path causal", () => {
    const result = runML(
      input({
        settings: {
          ...input().settings,
          validationMode: "walk-forward",
          embargoPct: 0.02,
          maxFolds: 8,
        } as QuantLabInput["settings"] & MLValidationSettings,
      }),
    );
    const folds = result.mlValidation?.assets[0]?.diagnostics.foldPlan.folds ?? [];
    expect(result.validation.walkForward).toBe(true);
    expect(folds.length).toBeGreaterThan(0);
    for (const fold of folds) {
      expect(Math.max(...fold.trainingIndices)).toBeLessThan(
        Math.min(...fold.testIndices),
      );
    }
  });

  it("filters open bars using millisecond now against second candle time, keeps first duplicates, and never fills malformed or irregular input", () => {
    const closed = fixture();
    const seconds = SECONDS["5m"];
    const open = {
      ...closed.at(-1)!,
      time: closed.at(-1)!.time + seconds,
    };
    const malformed = { ...closed[4], close: Number.NaN };
    const irregular = { ...closed[90], time: closed[90].time + seconds / 2 };
    const raw = [
      malformed,
      open,
      ...closed.slice().reverse(),
      { ...closed[10] },
      irregular,
    ] as Candle[];
    const now = (closed.at(-1)!.time + seconds) * 1_000;
    const result = runML(
      input({
        now,
        series: [
          series("UNIT-CLEANUP", "provider", "UNIT cleanup source", raw),
        ],
      }),
    );

    expect(result.asOf).toBe(now);
    expect(result.validation.reasons.join(" ")).toContain("malformed OHLC");
    expect(result.validation.reasons.join(" ")).toContain(
      "duplicate timestamp",
    );
    expect(result.validation.reasons.join(" ")).toContain("open/future bar");
    expect(result.validation.reasons.join(" ")).toContain("timestamp gap");
    // The one irregular record is supplied input, not a filled/synthetic bar.
    expect(valueFor(result, "ml-bars-0")).toBe(421);
    expect(result.dataRequirements.join(" ")).toContain(
      "without repair or filling",
    );
  });

  it("keeps multi-series equity paths symbol-labelled, never fabricates a portfolio path, caps processing at eight assets, and reports supplied provenance", () => {
    const allSeries = Array.from({ length: 9 }, (_, index) =>
      series(
        `UNIT-${index}`,
        index % 2 ? "user-import" : "provider",
        index % 2 ? "UNIT imported CSV" : "UNIT provider feed",
        fixture("5m", 360, index),
      ),
    );
    const result = runML(input({ series: allSeries }));
    const sourceMetrics = result.metrics.filter((entry) =>
      entry.key.startsWith("ml-source-"),
    );

    expect(sourceMetrics).toHaveLength(8);
    expect(sourceMetrics[0].value).toContain("provider · UNIT provider feed");
    expect(sourceMetrics[1].value).toContain("user-import · UNIT imported CSV");
    expect(result.validation.reasons.join(" ")).toContain(
      "Only the first 8 supplied series were processed",
    );
    expect(result.equity).toEqual([]);
    expect(result.equityBySymbol?.map((entry) => entry.symbol)).toEqual(
      allSeries.slice(0, 8).map((entry) => entry.symbol),
    );
    expect(
      result.equityBySymbol?.every((entry) => entry.points.length > 0),
    ).toBe(true);
    expect(result.limitations.join(" ")).toContain(
      "no cross-asset allocation, rebalancing, or combined portfolio equity is fabricated",
    );
  });

  it("returns insufficient-data rather than inventing a model when history is short or now is passed in seconds", () => {
    const shortResult = runML(
      input({
        series: [series("SHORT", "provider", "UNIT short", fixture("5m", 80))],
      }),
    );
    const secondsResult = runML(input({ now: START + 1_000 }));

    expect(shortResult.status).toBe("insufficient-data");
    expect(shortResult.signals).toEqual([]);
    expect(shortResult.validation.status).toBe("unconfirmed");
    expect(shortResult.validation.reasons.join(" ")).toContain(
      "eligible costed outcomes",
    );
    expect(secondsResult.status).toBe("insufficient-data");
    expect(secondsResult.validation.reasons.join(" ")).toContain(
      "Unix-millisecond",
    );
  });
});
