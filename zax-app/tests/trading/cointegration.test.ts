import {describe, expect, it} from 'vitest';
import {
  fixedResidualAdfLag,
  runEngleGrangerDiagnostic,
  type CompletedPricePair,
} from '../../lib/trading/cointegration';

/** Synthetic fixtures only: deterministic arithmetic, not market evidence. */
function nextRandom(seed: {value: number}): number {
  seed.value = (1664525 * seed.value + 1013904223) % 4294967296;
  return seed.value / 4294967296 - 0.5;
}

function syntheticCointegrated(count = 120, start = 1): CompletedPricePair[] {
  const seed = {value: 123456789};
  let right = 100;
  let residual = 0;
  const observations: CompletedPricePair[] = [];
  for (let index = 0; index < count; index += 1) {
    right += 0.2 + 4 * nextRandom(seed);
    residual = 0.35 * residual + 0.9 * nextRandom(seed);
    observations.push({
      timestamp: start + index,
      left: 7 + 1.8 * right + residual,
      right,
      completed: true,
    });
  }
  return observations;
}

describe('Engle–Granger residual-ADF diagnostic', () => {
  it('uses a fixed bounded Schwert-style augmentation rule', () => {
    expect(fixedResidualAdfLag(30)).toBe(9);
    expect(fixedResidualAdfLag(120)).toBe(13);
    expect(fixedResidualAdfLag(4000)).toBe(24);
  });

  it('returns a formal result for a labelled synthetic cointegrated fixture', () => {
    const result = runEngleGrangerDiagnostic({
      observations: syntheticCointegrated(),
      window: 120,
    });
    expect(result.status).toBe('ok');
    expect(result.obs).toBe(120);
    expect(result.lag).toBe(13);
    expect(result.stat).toBeLessThan(result.criticalValues!.fivePercent);
    expect(result.decision).toBe('reject-no-cointegration');
    expect(result.pValue).toBeLessThan(0.05);
    expect(result.comparison.status).toBe('unavailable');
  });

  it('matches an external known statsmodels reference on a labelled synthetic fixture', () => {
    /*
     * Reference generated with actual statsmodels 0.14.4:
     * coint(left, right, trend='c', maxlag=13, autolag=None).
     * This checks implementation compatibility; it is not an analysis claim.
     */
    const result = runEngleGrangerDiagnostic({
      observations: syntheticCointegrated(),
      window: 120,
    });
    expect(result.stat).toBeCloseTo(-3.84988079401048, 9);
    expect(result.pValue).toBeCloseTo(0.011615890350443109, 9);
    expect(result.criticalValues).toEqual({
      onePercent: expect.closeTo(-3.990840331897465, 12),
      fivePercent: expect.closeTo(-3.3879571944071745, 12),
      tenPercent: expect.closeTo(-3.080282412965186, 12),
    });
  });

  it('flags loss of a prior rolling rejection without calling it a structural-break test', () => {
    const seed = {value: 123456789};
    let right = 100;
    let residual = 0;
    const observations: CompletedPricePair[] = [];
    for (let index = 0; index < 120; index += 1) {
      right += 0.2 + 4 * nextRandom(seed);
      residual = 0.35 * residual + 0.9 * nextRandom(seed);
      observations.push({
        timestamp: index + 1,
        left: 7 + 1.8 * right + residual,
        right,
        completed: true,
      });
    }
    let independentLeft = 180;
    let independentRight = 90;
    for (let index = 0; index < 120; index += 1) {
      independentLeft += 0.1 + 4 * nextRandom(seed);
      independentRight += 0.1 + 4 * nextRandom(seed);
      observations.push({
        timestamp: index + 121,
        left: independentLeft,
        right: independentRight,
        completed: true,
      });
    }
    const result = runEngleGrangerDiagnostic({observations, window: 120});
    expect(result.decision).toBe('fail-to-reject-no-cointegration');
    expect(result.comparison.status).toBe('possible-break');
    expect(result.comparison.flagged).toBe(true);
    expect(result.comparison.prior?.decision).toBe('reject-no-cointegration');
    expect(result.limitations.join(' ')).toContain('not a formal structural-break test');
  });

  it('returns explicit invalid, insufficient, and singular states rather than values', () => {
    const incomplete = syntheticCointegrated();
    incomplete[9] = {...incomplete[9], completed: false};
    expect(runEngleGrangerDiagnostic({observations: incomplete, window: 120})).toMatchObject({
      status: 'invalid-input',
      stat: null,
      pValue: null,
      decision: 'unavailable',
    });
    expect(runEngleGrangerDiagnostic({observations: syntheticCointegrated(29), window: 30})).toMatchObject({
      status: 'insufficient-data',
      pValue: null,
    });
    const singular: CompletedPricePair[] = Array.from({length: 30}, (_, index) => ({
      timestamp: index + 1,
      left: 100 + index,
      right: 50,
      completed: true,
    }));
    expect(runEngleGrangerDiagnostic({observations: singular, window: 30})).toMatchObject({
      status: 'singular',
      stat: null,
      pValue: null,
      criticalValues: null,
    });
    const overflowing: CompletedPricePair[] = Array.from({length: 30}, (_, index) => ({
      timestamp: index + 1,
      left: 1e307 * (1.1 + index / 200),
      right: 1e307 * (1 + index / 100),
      completed: true,
    }));
    expect(runEngleGrangerDiagnostic({observations: overflowing, window: 30})).toMatchObject({
      status: 'non-finite',
      stat: null,
      pValue: null,
    });
  });
});
