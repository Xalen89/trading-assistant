import { describe, expect, it } from "vitest";
import {
  benjaminiHochbergAdjust,
  calculatePerformanceStatistics,
  hasOwnTrendHODLMetrics,
  type ActualNetReturnPoint,
} from "../../lib/trading/performance-statistics";

const NOW = 1_800_000_000_000;
const actual: ActualNetReturnPoint[] = [
  { at: NOW - 4_000, netReturn: 0.01 },
  { at: NOW - 3_000, netReturn: -0.02 },
  { at: NOW - 2_000, netReturn: 0.03 },
  { at: NOW - 1_000, netReturn: -0.01 },
  { at: NOW, netReturn: 0.02 },
];

describe("performance statistics from actual supplied net-return fixtures only", () => {
  it("computes descriptive statistics and leaves PSR/DSR unavailable without supplied trials/sampling", () => {
    const result = calculatePerformanceStatistics({
      netReturns: actual,
      asOf: NOW,
      riskFreeReturnPerPeriod: 0,
      omegaThreshold: 0,
      tailProbability: 0.2,
    });

    expect(result.available).toBe(true);
    expect(result.observations).toBe(actual.length);
    expect(result.sharpe).toMatchObject({ available: true });
    expect(result.omega).toMatchObject({ available: true });
    expect(result.skewness).toMatchObject({ available: true });
    expect(result.excessKurtosis).toMatchObject({ available: true });
    expect(result.empiricalValueAtRisk).toMatchObject({
      available: true,
      value: 0.02,
    });
    expect(result.empiricalConditionalValueAtRisk).toMatchObject({
      available: true,
      value: 0.02,
    });
    expect(result.probabilisticSharpeRatio).toMatchObject({ available: false });
    expect(result.deflatedSharpeRatio).toMatchObject({ available: false });
    expect(result.probabilisticSharpeRatio.reason).toContain("numberOfTrials");
    expect(result.methods.join(" ")).toContain("DSR");
  });

  it("calculates TE, beta, and IR only for exactly aligned supplied benchmark returns", () => {
    const benchmark = actual.map((point, index) => ({
      at: point.at,
      netReturn: [0.005, -0.01, 0.01, -0.005, 0.015][index],
    }));
    const result = calculatePerformanceStatistics({
      netReturns: actual,
      asOf: NOW,
      benchmark: { returns: benchmark },
      sharpeInference: {
        numberOfTrials: 10,
        observedSharpeStandardError: 0.2,
        nullSharpeMean: 0,
        nullSharpeStandardDeviation: 0.1,
        targetSharpe: 0,
      },
    });

    expect(result.trackingError).toMatchObject({ available: true });
    expect(result.beta).toMatchObject({ available: true });
    expect(result.informationRatio).toMatchObject({ available: true });
    expect(result.probabilisticSharpeRatio).toMatchObject({ available: true });
    expect(result.deflatedSharpeRatio).toMatchObject({ available: true });
    expect(result.deflatedSharpeRatio.value).toBeGreaterThanOrEqual(0);
    expect(result.deflatedSharpeRatio.value).toBeLessThanOrEqual(1);

    const misaligned = calculatePerformanceStatistics({
      netReturns: actual,
      asOf: NOW,
      benchmark: {
        returns: benchmark.map((point, index) =>
          index === 2 ? { ...point, at: point.at + 1 } : point,
        ),
      },
    });
    expect(misaligned.trackingError).toMatchObject({ available: false });
    expect(misaligned.beta.reason).toContain("exactly timestamp-aligned");
  });

  it("rejects future net-return data and does not fabricate a trend/HODL benchmark property", () => {
    const future = calculatePerformanceStatistics({
      netReturns: [...actual.slice(0, -1), { at: NOW + 1, netReturn: 0.02 }],
      asOf: NOW,
    });
    expect(future).toMatchObject({ available: false });
    expect(future.reasons.join(" ")).toContain("future-dated");

    const inheritedBenchmark = Object.create({
      trendHODLmetrics: { fabricated: true },
    });
    inheritedBenchmark.returns = actual;
    expect(hasOwnTrendHODLMetrics(inheritedBenchmark)).toBe(false);
    const ownBenchmark = {
      returns: actual,
      trendHODLmetrics: { existing: true },
    };
    expect(hasOwnTrendHODLMetrics(ownBenchmark)).toBe(true);
    expect(
      calculatePerformanceStatistics({
        netReturns: actual,
        asOf: NOW,
        benchmark: ownBenchmark,
      }).benchmarkTrendHODLMetricsPresent,
    ).toBe(true);
  });

  it("exports a deterministic Benjamini-Hochberg helper without changing factor p-values", () => {
    const adjusted = benjaminiHochbergAdjust(
      [
        { factor: "value", pValue: 0.04 },
        { factor: "quality", pValue: 0.01 },
        { factor: "momentum", pValue: 0.03 },
      ],
      0.05,
    );

    expect(adjusted.valid).toBe(true);
    expect(adjusted.rows.map((row) => row.factor)).toEqual([
      "value",
      "quality",
      "momentum",
    ]);
    expect(adjusted.rows.map((row) => row.pValue)).toEqual([0.04, 0.01, 0.03]);
    expect(adjusted.rows.find((row) => row.factor === "quality")).toMatchObject(
      {
        rank: 1,
        adjustedPValue: 0.03,
        reject: true,
      },
    );
    expect(adjusted.method).toContain("Benjamini-Hochberg");
  });
});
