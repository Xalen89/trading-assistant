import { describe, expect, it } from "vitest";
import {
  brierScore,
  calibratedPositiveProbability,
  fitPlattCalibrator,
  reliabilityBins,
} from "../../lib/trading/calibration";

describe("train-only forward-label calibration helpers", () => {
  it("requires a viable two-class calibration partition rather than manufacturing a mapping", () => {
    expect(
      fitPlattCalibrator(
        Array.from({ length: 20 }, () => ({ score: 0.5, outcome: 1 as const })),
      ),
    ).toBeUndefined();
    expect(
      fitPlattCalibrator(
        Array.from({ length: 19 }, (_, index) => ({
          score: index ? 0.5 : -0.5,
          outcome: index ? (1 as const) : (0 as const),
        })),
      ),
    ).toBeUndefined();
  });

  it("fits a deterministic monotone mapping and scores Brier/reliability only on supplied test observations", () => {
    const calibrationRows = Array.from({ length: 40 }, (_, index) => {
      const score = -1 + (2 * index) / 39;
      return { score, outcome: score > 0 ? (1 as const) : (0 as const) };
    });
    const calibrator = fitPlattCalibrator(calibrationRows);
    expect(calibrator?.fittedObservations).toBe(40);
    const low = calibratedPositiveProbability(calibrator!, -0.8)!;
    const high = calibratedPositiveProbability(calibrator!, 0.8)!;
    expect(high).toBeGreaterThan(low);

    // These rows intentionally differ from the fitting partition and are only evaluated.
    const testRows = [
      { probability: low, outcome: 0 as const },
      { probability: high, outcome: 1 as const },
    ];
    expect(brierScore(testRows)).toBeGreaterThanOrEqual(0);
    expect(brierScore(testRows)).toBeLessThanOrEqual(1);
    const bins = reliabilityBins(testRows, 5);
    expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(2);
    expect(bins.find((bin) => bin.count)?.meanPredictedProbability).not.toBeNull();
  });
});
