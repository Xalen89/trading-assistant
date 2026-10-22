/**
 * Small, dependency-free numerical methods used by paper-only quant research.
 *
 * These are independent implementations of textbook formulas. They consume
 * caller-supplied observations only and deliberately make no data, execution,
 * calibration, or validation claim.
 */

const EPSILON = 1e-12;

export type NumericPoint = Readonly<{ x: number; y: number }>;

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function clamp(value: number, lower: number, upper: number): number {
  return Math.max(lower, Math.min(upper, value));
}

export function mean(values: readonly number[]): number | null {
  if (!values.length || !values.every(isFiniteNumber)) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return Number.isFinite(total) ? total / values.length : null;
}

/** Population standard deviation; callers specify the relevant observation window. */
export function standardDeviation(values: readonly number[]): number | null {
  const average = mean(values);
  if (average === null) return null;
  const variance =
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
    values.length;
  const result = Math.sqrt(variance);
  return Number.isFinite(result) ? result : null;
}

export type OlsFit = Readonly<{
  intercept: number;
  slope: number;
  residualMean: number;
  residualStd: number;
}>;

/** Ordinary least squares with an intercept, y = intercept + slope * x. */
export function olsWithIntercept(points: readonly NumericPoint[]): OlsFit | null {
  if (points.length < 2) return null;
  if (!points.every((point) => isFiniteNumber(point.x) && isFiniteNumber(point.y)))
    return null;

  const xMean = mean(points.map((point) => point.x));
  const yMean = mean(points.map((point) => point.y));
  if (xMean === null || yMean === null) return null;

  let covariance = 0;
  let xVariance = 0;
  for (const point of points) {
    const xDelta = point.x - xMean;
    covariance += xDelta * (point.y - yMean);
    xVariance += xDelta * xDelta;
  }
  if (!Number.isFinite(covariance) || !Number.isFinite(xVariance) || xVariance <= EPSILON)
    return null;

  const slope = covariance / xVariance;
  const intercept = yMean - slope * xMean;
  if (!Number.isFinite(slope) || !Number.isFinite(intercept)) return null;

  const residuals = points.map((point) => point.y - (intercept + slope * point.x));
  const residualMean = mean(residuals);
  const residualStd = standardDeviation(residuals);
  if (
    residualMean === null ||
    residualStd === null ||
    !Number.isFinite(residualMean) ||
    !Number.isFinite(residualStd)
  )
    return null;
  return { intercept, slope, residualMean, residualStd };
}

/**
 * Average ranks are deterministic for ties. Rank 1 is the smallest value;
 * Spearman correlation is invariant to reversing both rank vectors.
 */
export function averageRanks(values: readonly number[]): number[] | null {
  if (!values.length || !values.every(isFiniteNumber)) return null;
  const indexed = values
    .map((value, index) => ({ value, index }))
    .sort((left, right) => left.value - right.value || left.index - right.index);
  const ranks = new Array<number>(values.length);
  for (let start = 0; start < indexed.length; ) {
    let end = start + 1;
    while (end < indexed.length && indexed[end].value === indexed[start].value) end += 1;
    const averageRank = (start + 1 + end) / 2;
    for (let index = start; index < end; index += 1)
      ranks[indexed[index].index] = averageRank;
    start = end;
  }
  return ranks;
}

/** Spearman rank IC with average tie ranks; null means rank variance is zero or input is invalid. */
export function spearmanRankCorrelation(
  left: readonly number[],
  right: readonly number[],
): number | null {
  if (left.length !== right.length || left.length < 2) return null;
  const leftRanks = averageRanks(left);
  const rightRanks = averageRanks(right);
  if (!leftRanks || !rightRanks) return null;
  const leftMean = mean(leftRanks);
  const rightMean = mean(rightRanks);
  if (leftMean === null || rightMean === null) return null;
  let covariance = 0;
  let leftVariance = 0;
  let rightVariance = 0;
  for (let index = 0; index < leftRanks.length; index += 1) {
    const leftDelta = leftRanks[index] - leftMean;
    const rightDelta = rightRanks[index] - rightMean;
    covariance += leftDelta * rightDelta;
    leftVariance += leftDelta * leftDelta;
    rightVariance += rightDelta * rightDelta;
  }
  const denominator = Math.sqrt(leftVariance * rightVariance);
  if (!(denominator > EPSILON) || !Number.isFinite(denominator)) return null;
  const result = covariance / denominator;
  return Number.isFinite(result) ? clamp(result, -1, 1) : null;
}

/** Causal EMA seeded from the first supplied value. */
export function latestEwma(
  values: readonly number[],
  span: number,
): number | null {
  if (!Number.isInteger(span) || span < 2 || values.length < 1) return null;
  if (!values.every(isFiniteNumber)) return null;
  const alpha = 2 / (span + 1);
  let estimate = values[0];
  for (let index = 1; index < values.length; index += 1)
    estimate = alpha * values[index] + (1 - alpha) * estimate;
  return Number.isFinite(estimate) ? estimate : null;
}

export type EwmacForecast = Readonly<{
  fast: number;
  slow: number;
  raw: number;
  normalized: number;
  capped: number;
  volatility: number;
}>;

/**
 * Causal EWMAC forecast. The price-space EMA gap is divided by trailing return
 * volatility in price units, then capped. No forecast scalar is estimated from
 * the same historical outcomes.
 */
export function ewmacForecast(
  closes: readonly number[],
  fastSpan: number,
  slowSpan: number,
  volatilityWindow: number,
  forecastCap = 20,
): EwmacForecast | null {
  if (
    !Number.isInteger(fastSpan) ||
    !Number.isInteger(slowSpan) ||
    !Number.isInteger(volatilityWindow) ||
    fastSpan < 2 ||
    slowSpan <= fastSpan ||
    volatilityWindow < 2 ||
    !Number.isFinite(forecastCap) ||
    forecastCap <= 0 ||
    closes.length < Math.max(slowSpan + 1, volatilityWindow + 1) ||
    !closes.every((value) => isFiniteNumber(value) && value > 0)
  )
    return null;

  const fast = latestEwma(closes, fastSpan);
  const slow = latestEwma(closes, slowSpan);
  if (fast === null || slow === null) return null;
  const returns: number[] = [];
  const start = closes.length - volatilityWindow;
  for (let index = start; index < closes.length; index += 1) {
    const previous = closes[index - 1];
    const current = closes[index];
    const result = Math.log(current / previous);
    if (!Number.isFinite(result)) return null;
    returns.push(result);
  }
  const volatility = standardDeviation(returns);
  const lastClose = closes.at(-1);
  if (
    volatility === null ||
    volatility <= EPSILON ||
    lastClose === undefined ||
    !(lastClose > 0)
  )
    return null;
  const raw = (fast - slow) / (lastClose * volatility);
  const capped = clamp(raw, -forecastCap, forecastCap);
  const normalized = capped / forecastCap;
  if (![raw, capped, normalized].every(Number.isFinite)) return null;
  return { fast, slow, raw, normalized, capped, volatility };
}

export type KalmanHedgePoint = Readonly<{
  intercept: number;
  beta: number;
  residual: number;
}>;

/**
 * A two-state recursive Kalman filter for left = intercept + beta * right.
 * It uses only each point and its preceding filter state. Process and
 * measurement noise are fixed research parameters, not outcome-calibrated.
 */
export function kalmanHedgePath(
  points: readonly NumericPoint[],
  processNoise = 1e-5,
  measurementNoise = 1e-3,
): KalmanHedgePoint[] | null {
  if (
    !points.length ||
    !points.every((point) => isFiniteNumber(point.x) && isFiniteNumber(point.y)) ||
    !Number.isFinite(processNoise) ||
    !Number.isFinite(measurementNoise) ||
    processNoise <= 0 ||
    measurementNoise <= 0
  )
    return null;

  let intercept = 0;
  let beta = 0;
  let p00 = 1_000_000;
  let p01 = 0;
  let p11 = 1_000_000;
  const path: KalmanHedgePoint[] = [];

  for (const point of points) {
    // Random-walk state prediction with diagonal process noise.
    p00 += processNoise;
    p11 += processNoise;
    const innovation = point.y - (intercept + beta * point.x);
    const innovationVariance =
      p00 + 2 * point.x * p01 + point.x * point.x * p11 + measurementNoise;
    if (!(innovationVariance > EPSILON) || !Number.isFinite(innovationVariance))
      return null;
    const k0 = (p00 + point.x * p01) / innovationVariance;
    const k1 = (p01 + point.x * p11) / innovationVariance;
    if (![innovation, k0, k1].every(Number.isFinite)) return null;

    intercept += k0 * innovation;
    beta += k1 * innovation;
    const nextP00 = p00 - k0 * (p00 + point.x * p01);
    const nextP01 = p01 - k0 * (p01 + point.x * p11);
    const nextP11 = p11 - k1 * (p01 + point.x * p11);
    p00 = Math.max(0, nextP00);
    p01 = nextP01;
    p11 = Math.max(0, nextP11);
    const residual = point.y - (intercept + beta * point.x);
    if (![intercept, beta, p00, p01, p11, residual].every(Number.isFinite))
      return null;
    path.push({ intercept, beta, residual });
  }
  return path;
}

/** Half-life from Δspread[t] = intercept + slope * spread[t-1]. */
export function meanReversionHalfLife(values: readonly number[]): number | null {
  if (values.length < 3 || !values.every(isFiniteNumber)) return null;
  const points: NumericPoint[] = [];
  for (let index = 1; index < values.length; index += 1)
    points.push({ x: values[index - 1], y: values[index] - values[index - 1] });
  const fit = olsWithIntercept(points);
  if (!fit) return null;
  const rho = 1 + fit.slope;
  if (!(rho > 0 && rho < 1)) return null;
  const halfLife = -Math.log(2) / Math.log(rho);
  return Number.isFinite(halfLife) && halfLife > 0 ? halfLife : null;
}

export type HurstEstimate = Readonly<{
  value: number | null;
  method: string;
  observations: number;
  minimumObservations: number;
}>;

/**
 * Deterministic rescaled-range (R/S) log-log slope screen. It is descriptive;
 * it is not a stationarity, cointegration, or future-return guarantee.
 */
export function hurstRescaledRange(values: readonly number[]): HurstEstimate {
  const minimumObservations = 128;
  const method = "deterministic rescaled-range log-log slope";
  if (values.length < minimumObservations || !values.every(isFiniteNumber))
    return { value: null, method, observations: values.length, minimumObservations };

  const scales: number[] = [];
  for (let scale = 8; scale <= Math.floor(values.length / 2); scale *= 2)
    scales.push(scale);
  const logPoints: NumericPoint[] = [];
  for (const scale of scales) {
    const ratios: number[] = [];
    const segments = Math.floor(values.length / scale);
    for (let segment = 0; segment < segments; segment += 1) {
      const slice = values.slice(segment * scale, (segment + 1) * scale);
      const sliceMean = mean(slice);
      const deviation = standardDeviation(slice);
      if (sliceMean === null || deviation === null || deviation <= EPSILON) continue;
      let cumulative = 0;
      let maximum = -Infinity;
      let minimum = Infinity;
      for (const value of slice) {
        cumulative += value - sliceMean;
        maximum = Math.max(maximum, cumulative);
        minimum = Math.min(minimum, cumulative);
      }
      const ratio = (maximum - minimum) / deviation;
      if (Number.isFinite(ratio) && ratio > 0) ratios.push(ratio);
    }
    const averageRatio = mean(ratios);
    if (averageRatio !== null && averageRatio > 0)
      logPoints.push({ x: Math.log(scale), y: Math.log(averageRatio) });
  }
  const fit = olsWithIntercept(logPoints);
  const value = fit && Number.isFinite(fit.slope) ? fit.slope : null;
  return { value, method, observations: values.length, minimumObservations };
}

export type CoefficientStability = Readonly<{
  samples: number;
  mean: number | null;
  standardDeviation: number | null;
  coefficientOfVariation: number | null;
}>;

/** Rolling OLS coefficient stability from trailing, causally ending windows. */
export function rollingCoefficientStability(
  points: readonly NumericPoint[],
  window: number,
): CoefficientStability {
  if (!Number.isInteger(window) || window < 2 || points.length < window)
    return { samples: 0, mean: null, standardDeviation: null, coefficientOfVariation: null };
  const betas: number[] = [];
  for (let end = window; end <= points.length; end += 1) {
    const fit = olsWithIntercept(points.slice(end - window, end));
    if (fit) betas.push(fit.slope);
  }
  const average = mean(betas);
  const deviation = standardDeviation(betas);
  const coefficientOfVariation =
    average !== null && deviation !== null && Math.abs(average) > EPSILON
      ? deviation / Math.abs(average)
      : null;
  return {
    samples: betas.length,
    mean: average,
    standardDeviation: deviation,
    coefficientOfVariation,
  };
}

export type KellyResearchEstimate = Readonly<{
  available: boolean;
  rawKelly: number | null;
  limitedFraction: number | null;
  outcomes: number;
  reason: string;
}>;

/**
 * Fractional Kelly is reported only after at least 100 completed net outcomes.
 * The output is capped to one-quarter Kelly and must not be treated as a sizing
 * instruction by callers.
 */
export function limitedKellyFromOutcomes(
  outcomes: readonly number[],
  requestedFraction = 0.25,
): KellyResearchEstimate {
  if (!Number.isFinite(requestedFraction) || requestedFraction < 0)
    return {
      available: false,
      rawKelly: null,
      limitedFraction: null,
      outcomes: outcomes.length,
      reason: "Requested Kelly fraction must be finite and non-negative.",
    };
  if (outcomes.length < 100 || !outcomes.every(isFiniteNumber))
    return {
      available: false,
      rawKelly: null,
      limitedFraction: null,
      outcomes: outcomes.length,
      reason: "At least 100 finite, completed net outcomes are required for a research-only Kelly estimate.",
    };
  const gains = outcomes.filter((outcome) => outcome > 0);
  const losses = outcomes.filter((outcome) => outcome < 0).map((outcome) => -outcome);
  const averageGain = mean(gains);
  const averageLoss = mean(losses);
  if (averageGain === null || averageLoss === null || averageGain <= EPSILON || averageLoss <= EPSILON)
    return {
      available: false,
      rawKelly: null,
      limitedFraction: null,
      outcomes: outcomes.length,
      reason: "Both positive and negative completed net outcomes are required; no Kelly value was inferred from a one-sided sample.",
    };
  const winRate = gains.length / outcomes.length;
  const payoffRatio = averageGain / averageLoss;
  const rawKelly = winRate - (1 - winRate) / payoffRatio;
  const limitedFraction = clamp(rawKelly, 0, 1) * Math.min(0.25, requestedFraction);
  if (![rawKelly, limitedFraction].every(Number.isFinite))
    return {
      available: false,
      rawKelly: null,
      limitedFraction: null,
      outcomes: outcomes.length,
      reason: "Kelly arithmetic was non-finite.",
    };
  return {
    available: true,
    rawKelly,
    limitedFraction,
    outcomes: outcomes.length,
    reason: "Research-only fractional Kelly from completed net historical outcomes; it is capped at one-quarter Kelly and is not used for sizing.",
  };
}

/**
 * Johansen trace values require deterministic-term choice and calibrated
 * critical-value surfaces. No such calibration is embedded here, so the test
 * is deliberately explicit rather than returning an uncalibrated rank claim.
 */
export function unsupportedJohansenTraceTwoSeries(): Readonly<{
  status: "unsupported";
  reason: string;
}> {
  return {
    status: "unsupported",
    reason:
      "Two-series Johansen trace rank is unsupported: this build does not embed source-calibrated critical values for a declared deterministic specification.",
  };
}

export type ConditionalRuleMetadata = Readonly<{
  status: "not-supplied" | "metadata-only";
  rules: readonly string[];
}>;

/**
 * Reads human-readable conditional research-rule metadata only. It cannot
 * substitute symbols, alter targets, select assets, or trigger execution.
 */
export function conditionalRuleMetadata(value: unknown): ConditionalRuleMetadata {
  if (!Array.isArray(value)) return { status: "not-supplied", rules: [] };
  const rules = value
    .filter((rule): rule is string => typeof rule === "string")
    .map((rule) => rule.trim())
    .filter(Boolean)
    .slice(0, 20);
  return rules.length
    ? { status: "metadata-only", rules }
    : { status: "not-supplied", rules: [] };
}
