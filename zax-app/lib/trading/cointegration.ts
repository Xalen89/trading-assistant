/*
 * Bounded Engle–Granger residual-ADF diagnostic. It does not fetch data,
 * execute trades, estimate success probability, or make OOS claims.
 *
 * Numerical coefficient provenance and license notice
 * --------------------------------------------------
 * The MacKinnon 1994 p-value and MacKinnon 2010 critical-value coefficients
 * below reproduce N=2, intercept entries from statsmodels/tsa/adfvalues.py.
 * The OLS, ADF, and normal-CDF implementations in this file are independent.
 *
 * Copyright (C) 2006, Jonathan E. Taylor
 * Copyright (c) 2006-2008 Scipy Developers.
 * Copyright (c) 2009-2018 statsmodels Developers.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 * 1. Redistributions of source code must retain the above copyright notice,
 *    this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of statsmodels nor the names of its contributors may be
 *    used to endorse or promote products derived from this software without
 *    specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS AS IS
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL STATSMODELS OR CONTRIBUTORS BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT
 * LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY
 * OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH
 * DAMAGE.
 */

export const MIN_ENGLE_GRANGER_OBSERVATIONS = 30;
export const MAX_ENGLE_GRANGER_OBSERVATIONS = 4_000;

const MAX_ADF_LAG = 24;
const EPSILON = Number.EPSILON;
const INV_SQRT_TWO_PI = 0.39894228040143267794;

/** A completed, synchronized price pair. Timestamps must strictly increase. */
export type CompletedPricePair = Readonly<{
  timestamp: number;
  left: number;
  right: number;
  completed: boolean;
}>;

export type CointegrationAlpha = 0.01 | 0.05 | 0.1;

export type EngleGrangerInput = Readonly<{
  /** The latest window is diagnosed; the prior equal window is compared when available. */
  observations: readonly CompletedPricePair[];
  /** Number of completed aligned levels in each rolling window. */
  window: number;
  /** Test size used only for the reported reject/fail-to-reject decision. */
  alpha?: CointegrationAlpha;
}>;

export type CointegrationCriticalValues = Readonly<{
  onePercent: number;
  fivePercent: number;
  tenPercent: number;
}>;

export type CointegrationDecision =
  | 'reject-no-cointegration'
  | 'fail-to-reject-no-cointegration'
  | 'unavailable';

export type CointegrationStatus =
  | 'ok'
  | 'invalid-input'
  | 'insufficient-data'
  | 'singular'
  | 'non-finite';

export type CointegrationBreakStatus =
  | 'unavailable'
  | 'not-flagged'
  | 'possible-break';

export type WindowComparison = Readonly<{
  status: CointegrationBreakStatus;
  /** True only when a prior rejection at the selected size is lost currently. */
  flagged: boolean;
  prior: Readonly<{
    status: CointegrationStatus;
    stat: number | null;
    pValue: number | null;
    decision: CointegrationDecision;
    obs: number;
    lag: number | null;
    hedgeRatio: number | null;
  }> | null;
  reason: string;
}>;

export type EngleGrangerResult = Readonly<{
  status: CointegrationStatus;
  /** Residual ADF t-statistic; more negative values are evidence against H0. */
  stat: number | null;
  /** MacKinnon 1994 asymptotic approximation, or null when no statistic exists. */
  pValue: number | null;
  /** MacKinnon 2010 finite-sample values for an N=2 intercept regression. */
  criticalValues: CointegrationCriticalValues | null;
  decision: CointegrationDecision;
  method: string;
  /** Number of levels in the current OLS/residual window. */
  obs: number;
  /** Fixed residual-ADF augmentation lag, selected from window length only. */
  lag: number | null;
  /** Current OLS coefficient in left = intercept + hedgeRatio * right. */
  hedgeRatio: number | null;
  intercept: number | null;
  comparison: WindowComparison;
  limitations: readonly string[];
}>;

type Fit = Readonly<{ intercept: number; hedgeRatio: number; residuals: number[] }>;
type Failure = Readonly<{ status: 'singular' | 'non-finite'; reason: string }>;
type WindowDiagnostic = Readonly<{
  status: Exclude<CointegrationStatus, 'invalid-input' | 'insufficient-data'>;
  stat: number | null;
  pValue: number | null;
  criticalValues: CointegrationCriticalValues | null;
  decision: CointegrationDecision;
  lag: number | null;
  hedgeRatio: number | null;
  intercept: number | null;
  reason?: string;
}>;

const METHOD =
  'Engle–Granger two-step: OLS with intercept; residual ADF without deterministic terms; fixed Schwert-style lag from window length only; MacKinnon 1994 asymptotic p-value and MacKinnon 2010 finite-sample critical values for N=2 with intercept.';

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validAlpha(value: unknown): value is CointegrationAlpha {
  return value === 0.01 || value === 0.05 || value === 0.1;
}

function unavailable(
  status: Exclude<CointegrationStatus, 'ok'>,
  obs: number,
  limitations: string[],
): EngleGrangerResult {
  return {
    status,
    stat: null,
    pValue: null,
    criticalValues: null,
    decision: 'unavailable',
    method: METHOD,
    obs,
    lag: null,
    hedgeRatio: null,
    intercept: null,
    comparison: {
      status: 'unavailable',
      flagged: false,
      prior: null,
      reason: 'No current formal diagnostic is available for comparison.',
    },
    limitations,
  };
}

/**
 * A non-data-dependent lag rule. It intentionally does not do an AIC, BIC,
 * t-stat, or outcome search, and the same lag applies to current and prior.
 */
export function fixedResidualAdfLag(window: number): number {
  const schwert = Math.ceil(12 * Math.pow(window / 100, 0.25));
  const feasible = Math.floor((window - 3) / 2);
  return Math.min(MAX_ADF_LAG, schwert, feasible);
}

function validate(observations: readonly CompletedPricePair[]): string | undefined {
  let priorTime = -Infinity;
  for (let index = 0; index < observations.length; index += 1) {
    const point = observations[index];
    if (!point || typeof point !== 'object') return `Observation ${index} is missing.`;
    if (!point.completed) return `Observation ${index} is not marked completed.`;
    if (!finite(point.timestamp)) return `Observation ${index} has a non-finite timestamp.`;
    if (point.timestamp <= priorTime) return `Observation ${index} timestamps are not strictly increasing.`;
    if (!finite(point.left) || point.left <= 0)
      return `Observation ${index} has an invalid left price; prices must be finite and greater than zero.`;
    if (!finite(point.right) || point.right <= 0)
      return `Observation ${index} has an invalid right price; prices must be finite and greater than zero.`;
    priorTime = point.timestamp;
  }
  return undefined;
}

/** Welford OLS with intercept and centered residual construction. */
function fitWithIntercept(observations: readonly CompletedPricePair[]): Fit | Failure {
  let meanLeft = 0;
  let meanRight = 0;
  let rightSxx = 0;
  let crossSxy = 0;
  let maxRight = 0;
  let minRight = Infinity;
  for (let index = 0; index < observations.length; index += 1) {
    const left = observations[index].left;
    const right = observations[index].right;
    const count = index + 1;
    const leftDelta = left - meanLeft;
    const rightDelta = right - meanRight;
    meanLeft += leftDelta / count;
    meanRight += rightDelta / count;
    rightSxx += rightDelta * (right - meanRight);
    crossSxy += rightDelta * (left - meanLeft);
    maxRight = Math.max(maxRight, Math.abs(right));
    minRight = Math.min(minRight, right);
    if (!finite(meanLeft) || !finite(meanRight) || !finite(rightSxx) || !finite(crossSxy))
      return { status: 'non-finite', reason: 'OLS accumulation became non-finite.' };
  }
  const range = maxRight - minRight;
  if (!finite(range) || range <= 32 * EPSILON * Math.max(1, maxRight))
    return {
      status: 'singular',
      reason: 'The right price has zero or numerically indistinguishable variation in the selected window.',
    };
  if (!(rightSxx > 0))
    return { status: 'singular', reason: 'The OLS right-price variance is not positive.' };
  const hedgeRatio = crossSxy / rightSxx;
  const intercept = meanLeft - hedgeRatio * meanRight;
  if (!finite(hedgeRatio) || !finite(intercept))
    return { status: 'non-finite', reason: 'OLS coefficients are non-finite.' };

  const residuals: number[] = [];
  let scale = 0;
  for (const point of observations) {
    const residual = point.left - meanLeft - hedgeRatio * (point.right - meanRight);
    if (!finite(residual))
      return { status: 'non-finite', reason: 'OLS residual arithmetic became non-finite.' };
    residuals.push(residual);
    scale = Math.max(scale, Math.abs(residual));
  }
  if (!(scale > 0))
    return {
      status: 'singular',
      reason: 'The OLS residual is exactly constant, so a residual ADF t-statistic is undefined.',
    };
  for (let index = 0; index < residuals.length; index += 1) {
    residuals[index] /= scale;
    if (!finite(residuals[index]))
      return { status: 'non-finite', reason: 'Scaled residual arithmetic became non-finite.' };
  }
  return { intercept, hedgeRatio, residuals };
}

/** OLS t-statistic from modified Gram–Schmidt QR; no ADF deterministic term. */
function residualAdf(residuals: readonly number[], lag: number): number | Failure {
  const rows = residuals.length - 1 - lag;
  const columns = lag + 1;
  if (rows <= columns)
    return {
      status: 'singular',
      reason: 'The residual ADF auxiliary regression has no residual degrees of freedom.',
    };
  const differences = new Array<number>(residuals.length - 1);
  for (let index = 1; index < residuals.length; index += 1) {
    const change = residuals[index] - residuals[index - 1];
    if (!finite(change)) return { status: 'non-finite', reason: 'Residual differences are non-finite.' };
    differences[index - 1] = change;
  }
  const matrix = Array.from({ length: rows }, () => new Array<number>(columns));
  const response = new Array<number>(rows);
  for (let row = 0, time = lag + 1; time < residuals.length; row += 1, time += 1) {
    matrix[row][0] = residuals[time - 1];
    for (let column = 1; column < columns; column += 1)
      matrix[row][column] = differences[time - 1 - column];
    response[row] = differences[time - 1];
  }

  const q: number[][] = [];
  const upper = Array.from({ length: columns }, () => new Array<number>(columns).fill(0));
  for (let column = 0; column < columns; column += 1) {
    const vector = matrix.map((row) => row[column]);
    const originalNorm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    if (!finite(originalNorm))
      return { status: 'non-finite', reason: 'Residual ADF design matrix is non-finite.' };
    // One re-orthogonalization pass improves persistent-series conditioning.
    for (let pass = 0; pass < 2; pass += 1) {
      for (let prior = 0; prior < column; prior += 1) {
        const projection = vector.reduce((sum, value, row) => sum + value * q[prior][row], 0);
        if (!finite(projection))
          return { status: 'non-finite', reason: 'Residual ADF QR projection is non-finite.' };
        upper[prior][column] += projection;
        for (let row = 0; row < rows; row += 1) vector[row] -= projection * q[prior][row];
      }
    }
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    if (!finite(norm)) return { status: 'non-finite', reason: 'Residual ADF QR norm is non-finite.' };
    if (!(norm > Math.sqrt(EPSILON) * Math.max(1, originalNorm)))
      return { status: 'singular', reason: 'Residual ADF regressors are numerically collinear.' };
    upper[column][column] = norm;
    q.push(vector.map((value) => value / norm));
  }
  const qResponse = q.map((column) =>
    column.reduce((sum, value, row) => sum + value * response[row], 0),
  );
  const beta = new Array<number>(columns).fill(0);
  for (let row = columns - 1; row >= 0; row -= 1) {
    let value = qResponse[row];
    for (let column = row + 1; column < columns; column += 1)
      value -= upper[row][column] * beta[column];
    beta[row] = value / upper[row][row];
    if (!finite(beta[row]))
      return { status: 'non-finite', reason: 'Residual ADF coefficients are non-finite.' };
  }
  let ssr = 0;
  for (let row = 0; row < rows; row += 1) {
    let fitted = 0;
    for (let column = 0; column < columns; column += 1) fitted += matrix[row][column] * beta[column];
    const error = response[row] - fitted;
    ssr += error * error;
  }
  if (!finite(ssr) || !(ssr > 0))
    return { status: 'singular', reason: 'Residual ADF auxiliary regression has zero residual variance.' };
  const variance = ssr / (rows - columns);
  // (X'X)^-1[0,0] equals the squared norm of R^-T times e_0 for X = QR.
  const inverseFirstColumn = new Array<number>(columns).fill(0);
  for (let row = 0; row < columns; row += 1) {
    let value = row === 0 ? 1 : 0;
    for (let prior = 0; prior < row; prior += 1)
      value -= upper[prior][row] * inverseFirstColumn[prior];
    inverseFirstColumn[row] = value / upper[row][row];
  }
  const covarianceFactor = inverseFirstColumn.reduce((sum, value) => sum + value * value, 0);
  const standardError = Math.sqrt(variance * covarianceFactor);
  const statistic = beta[0] / standardError;
  if (!finite(standardError) || !(standardError > 0) || !finite(statistic))
    return { status: 'non-finite', reason: 'Residual ADF t-statistic is non-finite.' };
  return statistic;
}

/* MacKinnon 1994, regression c and N=2; source/provenance is in file notice. */
const MACKINNON_PVALUE = {
  min: -18.86,
  max: 0.92,
  star: -2.62,
  small: [2.92, 1.5012, 0.039796],
  large: [2.1945, 0.64695, -0.29198, -0.042377],
} as const;

/* MacKinnon 2010, regression c and N=2, rows are 1%, 5%, 10%. */
const MACKINNON_CRITICAL = [
  [-3.89644, -10.9519, -33.527, 0],
  [-3.33613, -6.1101, -6.823, 0],
  [-3.04445, -4.2412, -2.72, 0],
] as const;

function horner(coefficients: readonly number[], value: number): number {
  let result = 0;
  for (let index = coefficients.length - 1; index >= 0; index -= 1)
    result = result * value + coefficients[index];
  return result;
}

function density(value: number): number {
  return INV_SQRT_TWO_PI * Math.exp((-value * value) / 2);
}

function simpson(left: number, right: number, a: number, b: number, c: number): number {
  return ((right - left) / 6) * (a + 4 * b + c);
}

/** Adaptive integration is used rather than copying a separate normal-CDF approximation. */
function integrateNormal(
  left: number,
  right: number,
  tolerance: number,
  whole?: number,
  leftValue?: number,
  middleValue?: number,
  rightValue?: number,
  depth = 30,
): number {
  const middle = (left + right) / 2;
  const a = leftValue ?? density(left);
  const b = middleValue ?? density(middle);
  const c = rightValue ?? density(right);
  const estimate = whole ?? simpson(left, right, a, b, c);
  const leftMiddle = (left + middle) / 2;
  const rightMiddle = (middle + right) / 2;
  const d = density(leftMiddle);
  const e = density(rightMiddle);
  const leftEstimate = simpson(left, middle, a, d, b);
  const rightEstimate = simpson(middle, right, b, e, c);
  const delta = leftEstimate + rightEstimate - estimate;
  if (depth <= 0 || Math.abs(delta) <= 15 * tolerance)
    return leftEstimate + rightEstimate + delta / 15;
  return (
    integrateNormal(left, middle, tolerance / 2, leftEstimate, a, d, b, depth - 1) +
    integrateNormal(middle, right, tolerance / 2, rightEstimate, b, e, c, depth - 1)
  );
}

function normalCdf(value: number): number {
  if (value === Infinity) return 1;
  if (value === -Infinity) return 0;
  const magnitude = Math.abs(value);
  if (magnitude === 0) return 0.5;
  if (magnitude < 3) {
    const integral = integrateNormal(0, magnitude, 1e-13);
    return value < 0 ? 0.5 - integral : 0.5 + integral;
  }
  // Direct tails preserve small representable p-values.
  const tail = integrateNormal(
    magnitude,
    40,
    Math.max(1e-300, density(magnitude) * 1e-11),
  );
  return value < 0 ? Math.max(0, tail) : Math.min(1, 1 - tail);
}

function pValue(statistic: number): number {
  if (statistic > MACKINNON_PVALUE.max) return 1;
  if (statistic < MACKINNON_PVALUE.min) return 0;
  const coefficients =
    statistic <= MACKINNON_PVALUE.star
      ? MACKINNON_PVALUE.small
      : MACKINNON_PVALUE.large;
  return Math.min(1, Math.max(0, normalCdf(horner(coefficients, statistic))));
}

function criticalValues(observations: number): CointegrationCriticalValues {
  // This follows statsmodels.coint: use nobs - 1 for the EG response surface.
  const nobs = observations - 1;
  const evaluate = (c: readonly number[]): number =>
    c[0] + c[1] / nobs + c[2] / (nobs * nobs) + c[3] / (nobs * nobs * nobs);
  return {
    onePercent: evaluate(MACKINNON_CRITICAL[0]),
    fivePercent: evaluate(MACKINNON_CRITICAL[1]),
    tenPercent: evaluate(MACKINNON_CRITICAL[2]),
  };
}

function selectedCriticalValue(values: CointegrationCriticalValues, alpha: CointegrationAlpha): number {
  return alpha === 0.01 ? values.onePercent : alpha === 0.05 ? values.fivePercent : values.tenPercent;
}

function diagnoseWindow(
  observations: readonly CompletedPricePair[],
  lag: number,
  alpha: CointegrationAlpha,
): WindowDiagnostic {
  const fit = fitWithIntercept(observations);
  if ('status' in fit)
    return {
      status: fit.status,
      stat: null,
      pValue: null,
      criticalValues: null,
      decision: 'unavailable',
      lag: null,
      hedgeRatio: null,
      intercept: null,
      reason: fit.reason,
    };
  const stat = residualAdf(fit.residuals, lag);
  if (typeof stat !== 'number')
    return {
      status: stat.status,
      stat: null,
      pValue: null,
      criticalValues: null,
      decision: 'unavailable',
      lag,
      hedgeRatio: fit.hedgeRatio,
      intercept: fit.intercept,
      reason: stat.reason,
    };
  const values = criticalValues(observations.length);
  const approximatePValue = pValue(stat);
  if (!finite(approximatePValue) || !finite(values.onePercent) || !finite(values.fivePercent) || !finite(values.tenPercent))
    return {
      status: 'non-finite',
      stat: null,
      pValue: null,
      criticalValues: null,
      decision: 'unavailable',
      lag,
      hedgeRatio: fit.hedgeRatio,
      intercept: fit.intercept,
      reason: 'MacKinnon p-value or critical-value arithmetic became non-finite.',
    };
  return {
    status: 'ok',
    stat,
    pValue: approximatePValue,
    criticalValues: values,
    decision: stat <= selectedCriticalValue(values, alpha)
      ? 'reject-no-cointegration'
      : 'fail-to-reject-no-cointegration',
    lag,
    hedgeRatio: fit.hedgeRatio,
    intercept: fit.intercept,
  };
}

/**
 * Runs a bounded two-series Engle–Granger diagnostic on completed aligned
 * prices. Loss of a prior rolling rejection is only a warning, not a formal
 * structural-break test.
 */
export function runEngleGrangerDiagnostic(input: EngleGrangerInput): EngleGrangerResult {
  if (!input || typeof input !== 'object')
    return unavailable('invalid-input', 0, [
      'Provide completed aligned price observations and a window from 30 through 4000.',
    ]);
  if (!Array.isArray(input.observations))
    return unavailable('invalid-input', 0, ['observations must be an array of completed aligned price pairs.']);
  if (!Number.isInteger(input.window))
    return unavailable('invalid-input', 0, ['window must be an integer number of completed observations.']);
  if (input.window < MIN_ENGLE_GRANGER_OBSERVATIONS || input.window > MAX_ENGLE_GRANGER_OBSERVATIONS)
    return unavailable('invalid-input', 0, [
      `window must be an integer from ${MIN_ENGLE_GRANGER_OBSERVATIONS} through ${MAX_ENGLE_GRANGER_OBSERVATIONS}.`,
    ]);
  const alpha = input.alpha === undefined ? 0.05 : input.alpha;
  if (!validAlpha(alpha))
    return unavailable('invalid-input', 0, ['alpha must be exactly 0.01, 0.05, or 0.1.']);
  if (input.observations.length < input.window)
    return unavailable('insufficient-data', input.observations.length, [
      `Need ${input.window} completed aligned observations for the current diagnostic; received ${input.observations.length}.`,
    ]);

  const retained = input.observations.slice(-Math.min(input.observations.length, input.window * 2));
  const problem = validate(retained);
  if (problem)
    return unavailable('invalid-input', 0, [
      problem,
      'The diagnostic does not drop, fill, or reorder incomplete, unaligned, non-positive, or invalid price observations.',
    ]);
  const current = retained.slice(-input.window);
  const prior = retained.length >= input.window * 2 ? retained.slice(0, input.window) : null;
  const lag = fixedResidualAdfLag(input.window);
  const diagnostic = diagnoseWindow(current, lag, alpha);
  const limitations = [
    'Null hypothesis: no cointegration, conditional on both selected price series being I(1); this diagnostic does not establish integration order.',
    `Only the latest ${input.window} completed aligned observations are used for the current result; timestamps are validated but gaps are not filled or modeled.`,
    'The residual ADF has no deterministic term because the first-stage cointegrating regression includes an intercept.',
    `Lag ${lag} is fixed from requested window length before examining prices; there is no AIC, BIC, t-stat, or outcome-based lag search.`,
    'MacKinnon p-values are asymptotic approximations; finite-sample 1%, 5%, and 10% critical values use the N=2 intercept response surface with nobs = obs - 1.',
    'This diagnostic is not a correlation proof, structural-break test, trade recommendation, edge/success probability, or OOS performance result.',
  ];
  if (input.observations.length > input.window * 2)
    limitations.push(`Only the latest ${input.window * 2} supplied observations were inspected; older observations were not used.`);

  if (diagnostic.status !== 'ok') {
    limitations.push(`No formal current decision: ${diagnostic.reason ?? 'the current residual diagnostic is unavailable'}.`);
    return {
      status: diagnostic.status,
      stat: null,
      pValue: null,
      criticalValues: null,
      decision: 'unavailable',
      method: METHOD,
      obs: input.window,
      lag: diagnostic.lag,
      hedgeRatio: diagnostic.hedgeRatio,
      intercept: diagnostic.intercept,
      comparison: {
        status: 'unavailable',
        flagged: false,
        prior: null,
        reason: 'No current formal diagnostic is available for comparison.',
      },
      limitations,
    };
  }

  if (!prior) {
    limitations.push(`A prior equal ${input.window}-observation window is unavailable, so no rolling loss-of-rejection warning can be evaluated.`);
    return {
      status: 'ok',
      stat: diagnostic.stat,
      pValue: diagnostic.pValue,
      criticalValues: diagnostic.criticalValues,
      decision: diagnostic.decision,
      method: METHOD,
      obs: input.window,
      lag: diagnostic.lag,
      hedgeRatio: diagnostic.hedgeRatio,
      intercept: diagnostic.intercept,
      comparison: {
        status: 'unavailable',
        flagged: false,
        prior: null,
        reason: 'No immediately preceding equal completed window is available.',
      },
      limitations,
    };
  }

  const priorDiagnostic = diagnoseWindow(prior, lag, alpha);
  const priorResult = {
    status: priorDiagnostic.status,
    stat: priorDiagnostic.stat,
    pValue: priorDiagnostic.pValue,
    decision: priorDiagnostic.decision,
    obs: input.window,
    lag: priorDiagnostic.lag,
    hedgeRatio: priorDiagnostic.hedgeRatio,
  } as const;
  if (priorDiagnostic.status !== 'ok') {
    limitations.push(`Prior-window comparison unavailable: ${priorDiagnostic.reason ?? 'the prior residual diagnostic is unavailable'}.`);
    return {
      status: 'ok',
      stat: diagnostic.stat,
      pValue: diagnostic.pValue,
      criticalValues: diagnostic.criticalValues,
      decision: diagnostic.decision,
      method: METHOD,
      obs: input.window,
      lag: diagnostic.lag,
      hedgeRatio: diagnostic.hedgeRatio,
      intercept: diagnostic.intercept,
      comparison: {
        status: 'unavailable',
        flagged: false,
        prior: priorResult,
        reason: 'The prior window has no usable formal diagnostic.',
      },
      limitations,
    };
  }
  const rejectionLost =
    priorDiagnostic.decision === 'reject-no-cointegration' &&
    diagnostic.decision === 'fail-to-reject-no-cointegration';
  if (rejectionLost)
    limitations.push('Rolling warning: the immediately prior window rejected no cointegration at the selected size but the current window does not; this is not a formal structural-break test.');
  return {
    status: 'ok',
    stat: diagnostic.stat,
    pValue: diagnostic.pValue,
    criticalValues: diagnostic.criticalValues,
    decision: diagnostic.decision,
    method: METHOD,
    obs: input.window,
    lag: diagnostic.lag,
    hedgeRatio: diagnostic.hedgeRatio,
    intercept: diagnostic.intercept,
    comparison: {
      status: rejectionLost ? 'possible-break' : 'not-flagged',
      flagged: rejectionLost,
      prior: priorResult,
      reason: rejectionLost
        ? 'A prior rejection at the selected size was lost in the current equal rolling window.'
        : 'No loss of a prior rejection at the selected size was observed.',
    },
    limitations,
  };
}
