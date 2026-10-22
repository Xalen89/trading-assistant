/**
 * Clean-room descriptive performance statistics for supplied actual net returns.
 * No equity, benchmark, sampling distribution, factor p-value, or return path is
 * synthesized by this module.
 */

const EPSILON = 1e-12;
const EULER_MASCHERONI = 0.5772156649015329;

export type ActualNetReturnPoint = Readonly<{
  /** Unix-millisecond observation timestamp. */
  at: number;
  /** Actual supplied net return for one observed period, in decimal units. */
  netReturn: number;
}>;

export type AlignedBenchmarkInput = Readonly<{
  /** Must have exactly the same timestamps and length as the net-return path. */
  returns: readonly ActualNetReturnPoint[];
  /**
   * Optional owner-produced benchmark metadata. This module only checks whether
   * this is an own property; it never invents a trend/HODL benchmark or consumes
   * an inherited property.
   */
  trendHODLmetrics?: unknown;
}>;

export type SharpeInferenceInput = Readonly<{
  /** Count of independently tried specifications, supplied by the caller. */
  numberOfTrials: number;
  /** Caller-supplied standard error of the observed Sharpe estimate. */
  observedSharpeStandardError: number;
  /** Mean of the caller-supplied null Sharpe sampling distribution. */
  nullSharpeMean: number;
  /** Standard deviation of that caller-supplied null Sharpe sampling distribution. */
  nullSharpeStandardDeviation: number;
  /** Sharpe hurdle for the non-deflated probabilistic Sharpe ratio. */
  targetSharpe: number;
}>;

export type PerformanceStatisticsInput = Readonly<{
  /** Only actual, already-netted return observations belong in this path. */
  netReturns: readonly ActualNetReturnPoint[];
  /** Latest permitted timestamp. Future observations are rejected rather than used. */
  asOf: number;
  /** Explicit periodic risk-free return. Omit to report a zero-threshold per-period Sharpe. */
  riskFreeReturnPerPeriod?: number;
  /** Explicit Omega threshold in the same periodic return units. Defaults to zero. */
  omegaThreshold?: number;
  /** Empirical lower-tail probability. Defaults to 0.05; no parametric tail is assumed. */
  tailProbability?: number;
  /** Optional only; benchmark-relative statistics are never calculated from a proxy. */
  benchmark?: AlignedBenchmarkInput;
  /** Optional only; PSR/DSR are unavailable unless a complete external sampling input is supplied. */
  sharpeInference?: SharpeInferenceInput;
}>;

export type Statistic<T = number> = Readonly<{
  available: boolean;
  value: T | null;
  method: string;
  reason: string | null;
}>;

export type PerformanceStatistics = Readonly<{
  available: boolean;
  observations: number;
  netReturnMean: Statistic;
  netReturnStandardDeviation: Statistic;
  sharpe: Statistic;
  omega: Statistic;
  skewness: Statistic;
  excessKurtosis: Statistic;
  empiricalValueAtRisk: Statistic;
  empiricalConditionalValueAtRisk: Statistic;
  trackingError: Statistic;
  beta: Statistic;
  informationRatio: Statistic;
  probabilisticSharpeRatio: Statistic;
  deflatedSharpeRatio: Statistic;
  benchmarkTrendHODLMetricsPresent: boolean;
  methods: readonly string[];
  reasons: readonly string[];
}>;

export type FactorPValue = Readonly<{
  factor: string;
  pValue: number;
}>;

export type BenjaminiHochbergRow = Readonly<{
  factor: string;
  pValue: number;
  rank: number;
  criticalValue: number;
  adjustedPValue: number;
  reject: boolean;
}>;

export type BenjaminiHochbergResult = Readonly<{
  valid: boolean;
  falseDiscoveryRate: number | null;
  rows: readonly BenjaminiHochbergRow[];
  reason: string | null;
  method: string;
}>;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function available(value: number, method: string): Statistic {
  return { available: true, value, method, reason: null };
}

function unavailable(method: string, reason: string): Statistic {
  return { available: false, value: null, method, reason };
}

function sampleMean(values: readonly number[]): number | null {
  if (!values.length || !values.every(finite)) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return finite(total) ? total / values.length : null;
}

function sampleVariance(
  values: readonly number[],
  average?: number,
): number | null {
  if (values.length < 2 || !values.every(finite)) return null;
  const mean = average ?? sampleMean(values);
  if (mean === null) return null;
  const sum = values.reduce((total, value) => total + (value - mean) ** 2, 0);
  const variance = sum / (values.length - 1);
  return finite(variance) && variance >= 0 ? variance : null;
}

function sampleStandardDeviation(
  values: readonly number[],
  average?: number,
): number | null {
  const variance = sampleVariance(values, average);
  return variance === null ? null : Math.sqrt(variance);
}

function sampleCovariance(
  left: readonly number[],
  right: readonly number[],
): number | null {
  if (left.length < 2 || left.length !== right.length) return null;
  const leftMean = sampleMean(left);
  const rightMean = sampleMean(right);
  if (leftMean === null || rightMean === null) return null;
  const total = left.reduce(
    (sum, value, index) =>
      sum + (value - leftMean) * (right[index] - rightMean),
    0,
  );
  const covariance = total / (left.length - 1);
  return finite(covariance) ? covariance : null;
}

function validChronologicalPath(
  points: readonly ActualNetReturnPoint[],
  asOf: number,
): string | null {
  if (!finite(asOf) || asOf < 10_000_000_000)
    return "asOf must be a finite Unix-millisecond timestamp.";
  if (!Array.isArray(points) || points.length < 2)
    return "At least two actual supplied net-return observations are required.";
  let prior = -Infinity;
  for (const point of points) {
    if (!point || !finite(point.at) || !finite(point.netReturn))
      return "Every supplied return observation needs finite at and netReturn values.";
    if (point.at > asOf)
      return "A future-dated net-return observation was supplied and is excluded rather than used.";
    if (point.at <= prior)
      return "Net-return timestamps must be strictly increasing with no duplicates.";
    prior = point.at;
  }
  return null;
}

function sampleSkewness(
  values: readonly number[],
  average: number,
  deviation: number,
): number | null {
  const n = values.length;
  if (n < 3 || !(deviation > EPSILON)) return null;
  const cubed = values.reduce(
    (total, value) => total + ((value - average) / deviation) ** 3,
    0,
  );
  const result = (n * cubed) / ((n - 1) * (n - 2));
  return finite(result) ? result : null;
}

function sampleExcessKurtosis(
  values: readonly number[],
  average: number,
  deviation: number,
): number | null {
  const n = values.length;
  if (n < 4 || !(deviation > EPSILON)) return null;
  const fourth = values.reduce(
    (total, value) => total + ((value - average) / deviation) ** 4,
    0,
  );
  const result =
    (n * (n + 1) * fourth) / ((n - 1) * (n - 2) * (n - 3)) -
    (3 * (n - 1) ** 2) / ((n - 2) * (n - 3));
  return finite(result) ? result : null;
}

function empiricalTail(
  values: readonly number[],
  tailProbability: number,
): { quantile: number; conditionalMean: number } | null {
  if (
    !finite(tailProbability) ||
    tailProbability <= 0 ||
    tailProbability >= 0.5 ||
    !values.length ||
    !values.every(finite)
  )
    return null;
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(ordered.length * tailProbability) - 1);
  const quantile = ordered[index];
  const tail = ordered.filter((value) => value <= quantile);
  const conditionalMean = sampleMean(tail);
  if (conditionalMean === null || !finite(quantile)) return null;
  return { quantile, conditionalMean };
}

/** Standard-normal CDF using a published numerical erf approximation. */
function normalCdf(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const erf =
    sign *
    (1 -
      ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
        t +
        0.254829592) *
        t *
        Math.exp(-x * x));
  return (1 + erf) / 2;
}

/** Deterministic bisection avoids importing a numerical/statistics dependency. */
function inverseNormal(probability: number): number | null {
  if (!finite(probability) || probability <= 0 || probability >= 1) return null;
  let lower = -8;
  let upper = 8;
  for (let iteration = 0; iteration < 96; iteration += 1) {
    const midpoint = (lower + upper) / 2;
    if (normalCdf(midpoint) < probability) lower = midpoint;
    else upper = midpoint;
  }
  const result = (lower + upper) / 2;
  return finite(result) ? result : null;
}

function inferenceStatistics(
  sharpeValue: number | null,
  inference: SharpeInferenceInput | undefined,
): { psr: Statistic; dsr: Statistic; methods: string[] } {
  const psrMethod =
    "PSR = Phi((SR_hat - SR_target) / supplied SE(SR_hat)); supplied sampling uncertainty is required and never inferred.";
  const dsrMethod =
    "DSR = Phi((SR_hat - max(SR_target, SR_expected_max)) / supplied SE(SR_hat)); SR_expected_max = mu_null + sigma_null*((1-gamma_E)Phi^-1(1-1/N)+gamma_E Phi^-1(1-1/(N*e))).";
  if (sharpeValue === null)
    return {
      psr: unavailable(
        psrMethod,
        "Sharpe is unavailable from the supplied net-return path.",
      ),
      dsr: unavailable(
        dsrMethod,
        "Sharpe is unavailable from the supplied net-return path.",
      ),
      methods: [psrMethod, dsrMethod],
    };
  if (!inference)
    return {
      psr: unavailable(
        psrMethod,
        "PSR is unavailable: numberOfTrials and an externally supplied Sharpe sampling distribution are required.",
      ),
      dsr: unavailable(
        dsrMethod,
        "DSR is unavailable: numberOfTrials and an externally supplied Sharpe sampling distribution are required.",
      ),
      methods: [psrMethod, dsrMethod],
    };
  if (
    !Number.isInteger(inference.numberOfTrials) ||
    inference.numberOfTrials < 2 ||
    !finite(inference.observedSharpeStandardError) ||
    inference.observedSharpeStandardError <= 0 ||
    !finite(inference.nullSharpeMean) ||
    !finite(inference.nullSharpeStandardDeviation) ||
    inference.nullSharpeStandardDeviation <= 0 ||
    !finite(inference.targetSharpe)
  )
    return {
      psr: unavailable(
        psrMethod,
        "PSR is unavailable: use at least two trials plus finite positive supplied Sharpe standard errors/distribution deviation and a finite target Sharpe.",
      ),
      dsr: unavailable(
        dsrMethod,
        "DSR is unavailable: use at least two trials plus finite positive supplied Sharpe standard errors/distribution deviation and a finite target Sharpe.",
      ),
      methods: [psrMethod, dsrMethod],
    };

  const psr = normalCdf(
    (sharpeValue - inference.targetSharpe) /
      inference.observedSharpeStandardError,
  );
  const first = inverseNormal(1 - 1 / inference.numberOfTrials);
  const second = inverseNormal(1 - 1 / (inference.numberOfTrials * Math.E));
  if (!finite(psr) || first === null || second === null)
    return {
      psr: unavailable(psrMethod, "PSR numerical evaluation failed."),
      dsr: unavailable(dsrMethod, "DSR numerical evaluation failed."),
      methods: [psrMethod, dsrMethod],
    };
  const expectedMaximum =
    inference.nullSharpeMean +
    inference.nullSharpeStandardDeviation *
      ((1 - EULER_MASCHERONI) * first + EULER_MASCHERONI * second);
  const deflatedTarget = Math.max(inference.targetSharpe, expectedMaximum);
  const dsr = normalCdf(
    (sharpeValue - deflatedTarget) / inference.observedSharpeStandardError,
  );
  return {
    psr: available(psr, psrMethod),
    dsr: available(dsr, dsrMethod),
    methods: [psrMethod, dsrMethod],
  };
}

/**
 * Safeguard for optional owner benchmark metadata. An inherited property is not
 * treated as supplied benchmark data, and no trend/HODL return path is invented.
 */
export function hasOwnTrendHODLMetrics(benchmark: unknown): boolean {
  return (
    typeof benchmark === "object" &&
    benchmark !== null &&
    Object.prototype.hasOwnProperty.call(benchmark, "trendHODLmetrics")
  );
}

/**
 * Computes descriptive statistics only from an actual caller-provided net-return
 * path. Tracking error, beta, and information ratio require exact timestamp-aligned
 * caller-provided benchmark returns; this function never aligns, forward-fills, or
 * proxies a benchmark.
 */
export function calculatePerformanceStatistics(
  input: PerformanceStatisticsInput,
): PerformanceStatistics {
  const methods = [
    "Sharpe = mean(netReturn - periodic risk-free threshold) / sample standard deviation(netReturn - threshold); annualization is not inferred.",
    "Omega = sum(max(netReturn - threshold, 0)) / sum(max(threshold - netReturn, 0)).",
    "Skewness and excess kurtosis use finite-sample adjusted central moments of supplied net returns.",
    "Empirical VaR/CVaR are the lower-tail order statistic and mean of observations at/below it; no parametric distribution is fitted.",
    "Tracking error = sample standard deviation(portfolio net return - aligned benchmark return); beta = sample covariance(portfolio, benchmark) / sample variance(benchmark); information ratio = mean(active return) / tracking error.",
  ];
  const baseError = !input
    ? "Performance-statistics input is required."
    : validChronologicalPath(input.netReturns, input.asOf);
  const benchmarkOwnProperty = hasOwnTrendHODLMetrics(input?.benchmark);
  if (baseError) {
    const unavailableMetric = (method: string) =>
      unavailable(method, baseError);
    const inference = inferenceStatistics(null, input?.sharpeInference);
    return {
      available: false,
      observations: Array.isArray(input?.netReturns)
        ? input.netReturns.length
        : 0,
      netReturnMean: unavailableMetric(
        "Arithmetic mean of supplied actual net returns.",
      ),
      netReturnStandardDeviation: unavailableMetric(
        "Sample standard deviation of supplied actual net returns.",
      ),
      sharpe: unavailableMetric(methods[0]),
      omega: unavailableMetric(methods[1]),
      skewness: unavailableMetric(methods[2]),
      excessKurtosis: unavailableMetric(methods[2]),
      empiricalValueAtRisk: unavailableMetric(methods[3]),
      empiricalConditionalValueAtRisk: unavailableMetric(methods[3]),
      trackingError: unavailableMetric(methods[4]),
      beta: unavailableMetric(methods[4]),
      informationRatio: unavailableMetric(methods[4]),
      probabilisticSharpeRatio: inference.psr,
      deflatedSharpeRatio: inference.dsr,
      benchmarkTrendHODLMetricsPresent: benchmarkOwnProperty,
      methods: [...methods, ...inference.methods],
      reasons: [baseError],
    };
  }

  const returns = input.netReturns.map((point) => point.netReturn);
  const average = sampleMean(returns)!;
  const deviation = sampleStandardDeviation(returns, average)!;
  const riskFree = input.riskFreeReturnPerPeriod ?? 0;
  const omegaThreshold = input.omegaThreshold ?? 0;
  const tailProbability = input.tailProbability ?? 0.05;
  const reasons: string[] = [];
  const meanMetric = available(
    average,
    "Arithmetic mean of supplied actual net returns.",
  );
  const deviationMetric = available(
    deviation,
    "Sample standard deviation of supplied actual net returns.",
  );

  const excessReturns = returns.map((value) => value - riskFree);
  const excessMean = sampleMean(excessReturns);
  const excessDeviation = sampleStandardDeviation(
    excessReturns,
    excessMean ?? undefined,
  );
  const sharpe =
    excessMean !== null && excessDeviation !== null && excessDeviation > EPSILON
      ? available(excessMean / excessDeviation, methods[0])
      : unavailable(
          methods[0],
          "At least two non-constant supplied excess-return observations are required.",
        );

  const omegaGains = returns.reduce(
    (total, value) => total + Math.max(value - omegaThreshold, 0),
    0,
  );
  const omegaLosses = returns.reduce(
    (total, value) => total + Math.max(omegaThreshold - value, 0),
    0,
  );
  const omega =
    omegaLosses > EPSILON
      ? available(omegaGains / omegaLosses, methods[1])
      : unavailable(
          methods[1],
          "Omega is unavailable because the supplied path has no observations below its threshold.",
        );

  const skewValue = sampleSkewness(returns, average, deviation);
  const skewness =
    skewValue === null
      ? unavailable(
          methods[2],
          "At least three non-constant supplied observations are required for skewness.",
        )
      : available(skewValue, methods[2]);
  const kurtosisValue = sampleExcessKurtosis(returns, average, deviation);
  const excessKurtosis =
    kurtosisValue === null
      ? unavailable(
          methods[2],
          "At least four non-constant supplied observations are required for excess kurtosis.",
        )
      : available(kurtosisValue, methods[2]);

  const tail = empiricalTail(returns, tailProbability);
  const tailMethod = `${methods[3]} Tail probability=${tailProbability}. Values are reported as positive loss values when the empirical tail return is negative.`;
  const valueAtRisk = tail
    ? available(-tail.quantile, tailMethod)
    : unavailable(
        tailMethod,
        "tailProbability must be finite and strictly between 0 and 0.5.",
      );
  const conditionalValueAtRisk = tail
    ? available(-tail.conditionalMean, tailMethod)
    : unavailable(
        tailMethod,
        "tailProbability must be finite and strictly between 0 and 0.5.",
      );

  let trackingError = unavailable(
    methods[4],
    "Tracking error, beta, and information ratio are unavailable until an exactly timestamp-aligned benchmark path is supplied.",
  );
  let beta = unavailable(methods[4], trackingError.reason!);
  let informationRatio = unavailable(methods[4], trackingError.reason!);
  if (input.benchmark) {
    const benchmarkPath = input.benchmark.returns;
    const aligned =
      Array.isArray(benchmarkPath) &&
      benchmarkPath.length === input.netReturns.length &&
      benchmarkPath.every(
        (point, index) =>
          point &&
          finite(point.at) &&
          finite(point.netReturn) &&
          point.at === input.netReturns[index].at &&
          point.at <= input.asOf,
      );
    if (!aligned) {
      const reason =
        "Benchmark returns must be finite, not future-dated, and exactly timestamp-aligned to the supplied net-return path; no alignment is invented.";
      trackingError = unavailable(methods[4], reason);
      beta = unavailable(methods[4], reason);
      informationRatio = unavailable(methods[4], reason);
      reasons.push(reason);
    } else {
      const benchmarkReturns = benchmarkPath.map((point) => point.netReturn);
      const active = returns.map(
        (value, index) => value - benchmarkReturns[index],
      );
      const activeMean = sampleMean(active)!;
      const activeDeviation = sampleStandardDeviation(active, activeMean)!;
      const benchmarkVariance = sampleVariance(benchmarkReturns);
      trackingError =
        activeDeviation > EPSILON
          ? available(activeDeviation, methods[4])
          : unavailable(
              methods[4],
              "Tracking error is unavailable because supplied active returns are constant.",
            );
      const covariance = sampleCovariance(returns, benchmarkReturns);
      beta =
        covariance !== null &&
        benchmarkVariance !== null &&
        benchmarkVariance > EPSILON
          ? available(covariance / benchmarkVariance, methods[4])
          : unavailable(
              methods[4],
              "Beta is unavailable because supplied benchmark returns have zero variance.",
            );
      informationRatio =
        activeDeviation > EPSILON
          ? available(activeMean / activeDeviation, methods[4])
          : unavailable(
              methods[4],
              "Information ratio is unavailable because supplied active returns are constant.",
            );
    }
  }

  const inference = inferenceStatistics(sharpe.value, input.sharpeInference);
  return {
    available: true,
    observations: returns.length,
    netReturnMean: meanMetric,
    netReturnStandardDeviation: deviationMetric,
    sharpe,
    omega,
    skewness,
    excessKurtosis,
    empiricalValueAtRisk: valueAtRisk,
    empiricalConditionalValueAtRisk: conditionalValueAtRisk,
    trackingError,
    beta,
    informationRatio,
    probabilisticSharpeRatio: inference.psr,
    deflatedSharpeRatio: inference.dsr,
    benchmarkTrendHODLMetricsPresent: benchmarkOwnProperty,
    methods: [...methods, ...inference.methods],
    reasons,
  };
}

/**
 * Benjamini-Hochberg FDR adjustment. Rows retain the input factor identities, use
 * deterministic factor-name tie breaks, and never manufacture missing p-values.
 */
export function benjaminiHochbergAdjust(
  values: readonly FactorPValue[],
  falseDiscoveryRate = 0.05,
): BenjaminiHochbergResult {
  const method =
    "Benjamini-Hochberg step-up procedure: sort p-values ascending, compute adjusted p_i=min_{j>=i}(m/j*p_(j)), and reject when adjusted p_i <= requested FDR.";
  if (
    !Array.isArray(values) ||
    !finite(falseDiscoveryRate) ||
    falseDiscoveryRate <= 0 ||
    falseDiscoveryRate >= 1
  )
    return {
      valid: false,
      falseDiscoveryRate: null,
      rows: [],
      reason: "falseDiscoveryRate must be finite and strictly between 0 and 1.",
      method,
    };
  const names = new Set<string>();
  if (
    values.some(
      (item) =>
        !item ||
        typeof item.factor !== "string" ||
        !item.factor.trim() ||
        !finite(item.pValue) ||
        item.pValue < 0 ||
        item.pValue > 1 ||
        names.has(item.factor) ||
        !names.add(item.factor),
    )
  )
    return {
      valid: false,
      falseDiscoveryRate,
      rows: [],
      reason:
        "Each factor must have a unique non-empty label and a finite p-value in [0, 1].",
      method,
    };
  if (!values.length)
    return {
      valid: false,
      falseDiscoveryRate,
      rows: [],
      reason: "At least one supplied factor p-value is required.",
      method,
    };

  const ordered = [...values].sort(
    (left, right) =>
      left.pValue - right.pValue || left.factor.localeCompare(right.factor),
  );
  const adjusted = new Array<number>(ordered.length);
  let runningMinimum = 1;
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    runningMinimum = Math.min(
      runningMinimum,
      (ordered[index].pValue * ordered.length) / (index + 1),
    );
    adjusted[index] = Math.min(1, runningMinimum);
  }
  const byFactor = new Map(
    ordered.map((item, index) => [
      item.factor,
      {
        factor: item.factor,
        pValue: item.pValue,
        rank: index + 1,
        criticalValue: ((index + 1) / ordered.length) * falseDiscoveryRate,
        adjustedPValue: adjusted[index],
        reject: adjusted[index] <= falseDiscoveryRate,
      } satisfies BenjaminiHochbergRow,
    ]),
  );
  return {
    valid: true,
    falseDiscoveryRate,
    rows: values.map((item) => byFactor.get(item.factor)!),
    reason: null,
    method,
  };
}
