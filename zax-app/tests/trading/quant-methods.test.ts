import { describe, expect, it } from "vitest";

import {
  averageRanks,
  ewmacForecast,
  hurstRescaledRange,
  kalmanHedgePath,
  limitedKellyFromOutcomes,
  meanReversionHalfLife,
  olsWithIntercept,
  rollingCoefficientStability,
  spearmanRankCorrelation,
  unsupportedJohansenTraceTwoSeries,
} from "../../lib/trading/quant-methods";

// Pure deterministic arithmetic fixtures only; none are market data or evidence of an edge.
describe("quant methods — pure deterministic fixtures", () => {
  it("fits OLS and tie-aware Spearman rank correlation", () => {
    const fit = olsWithIntercept([
      { x: 1, y: 5 },
      { x: 2, y: 7 },
      { x: 3, y: 9 },
      { x: 4, y: 11 },
    ]);

    expect(fit).toMatchObject({ intercept: 3, slope: 2 });
    expect(averageRanks([2, 1, 1, 4])).toEqual([3, 1.5, 1.5, 4]);
    expect(spearmanRankCorrelation([1, 2, 3], [30, 20, 10])).toBe(-1);
    expect(spearmanRankCorrelation([1, 1, 1], [1, 2, 3])).toBeNull();
  });

  it("produces only causal EWMAC arithmetic from a supplied close fixture", () => {
    const closes = Array.from({ length: 80 }, (_, index) =>
      100 * Math.exp(index * 0.01 + Math.sin(index * 0.4) * 0.002),
    );
    const forecast = ewmacForecast(closes, 8, 32, 16, 20);

    expect(forecast).not.toBeNull();
    expect(forecast!.normalized).toBeGreaterThan(0);
    expect(Math.abs(forecast!.capped)).toBeLessThanOrEqual(20);
  });

  it("keeps Kalman, half-life, coefficient stability, and Hurst outputs finite or explicitly unavailable", () => {
    const points = Array.from({ length: 120 }, (_, index) => ({
      x: index + 1,
      y: 2 + 1.5 * (index + 1),
    }));
    const path = kalmanHedgePath(points);
    const decay = Array.from({ length: 140 }, (_, index) => 8 * 0.8 ** index);
    const stability = rollingCoefficientStability(points, 30);

    expect(path?.at(-1)?.beta).toBeCloseTo(1.5, 2);
    expect(meanReversionHalfLife(decay)).toBeCloseTo(
      -Math.log(2) / Math.log(0.8),
      2,
    );
    expect(stability.samples).toBeGreaterThan(1);
    expect(stability.coefficientOfVariation).toBeLessThan(0.01);
    expect(hurstRescaledRange(decay.slice(0, 80)).value).toBeNull();
    expect(hurstRescaledRange(decay).observations).toBe(140);
  });

  it("gates fractional Kelly at 100 completed net outcomes and never fabricates Johansen rank", () => {
    const outcomes = [
      ...Array.from({ length: 60 }, () => 2),
      ...Array.from({ length: 40 }, () => -1),
    ];
    const unavailable = limitedKellyFromOutcomes(outcomes.slice(0, 99));
    const available = limitedKellyFromOutcomes(outcomes);
    const johansen = unsupportedJohansenTraceTwoSeries();

    expect(unavailable).toMatchObject({ available: false, limitedFraction: null });
    expect(available.available).toBe(true);
    expect(available.rawKelly).toBeCloseTo(0.4, 12);
    expect(available.limitedFraction).toBeCloseTo(0.1, 12);
    expect(johansen.status).toBe("unsupported");
    expect(johansen.reason).toContain("critical values");
  });
});
