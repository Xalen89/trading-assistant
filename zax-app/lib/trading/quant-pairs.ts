import {
  MIN_ENGLE_GRANGER_OBSERVATIONS,
  runEngleGrangerDiagnostic,
} from "./cointegration";
import {
  hurstRescaledRange,
  kalmanHedgePath,
  limitedKellyFromOutcomes,
  meanReversionHalfLife,
  rollingCoefficientStability,
  standardDeviation,
  unsupportedJohansenTraceTwoSeries,
} from "./quant-methods";
import type { Candle, Timeframe } from "./model";
import type {
  QuantLabInput,
  QuantLabResult,
  QuantMetric,
  QuantSeries,
  QuantSettings,
} from "./quant-lab-types";

/**
 * Quantitative-method references:
 * - NIST, Linear Least Squares Regression:
 *   https://www.itl.nist.gov/div898/handbook/pmd/section1/pmd141.htm
 *   The hedge ratio below is the slope from y = intercept + beta * x.
 * - NIST, Autocorrelation Plot:
 *   https://www.itl.nist.gov/div898/handbook/eda/section3/autocopl.htm
 *   Lag-one residual autocorrelation is a descriptive diagnostic only, not a
 *   cointegration or unit-root test.
 * - Product policy: research/foundry-audit/pairs.md requires synchronized,
 *   past-only fits and says a formal residual ADF p-value is currently absent.
 */

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

const MAX_ASSETS = 10;
const MAX_BARS_PER_ASSET = 2_000;
const MIN_LOOKBACK = MIN_ENGLE_GRANGER_OBSERVATIONS;
const MAX_LOOKBACK = 500;
const MIN_SYNCHRONIZED_BARS = 100;
const MAX_HOLDING_BARS = 500;
const MAX_BPS = 100_000;
const EPSILON = 1e-12;
const DEFAULT_FORMATION_WINDOW = 252;
const DEFAULT_TRADING_WINDOW = 63;
const DEFAULT_BLOCK_HISTORY = DEFAULT_FORMATION_WINDOW * 2 + DEFAULT_TRADING_WINDOW;

type PairPoint = { time: number; left: number; right: number };
type Direction = -1 | 0 | 1;
type Position = {
  direction: Direction;
  leftQuantity: number;
  rightQuantity: number;
  entrySignalIndex: number;
};
type Fit = {
  intercept: number;
  beta: number;
  residual: number;
  residualMean: number;
  residualStd: number;
  zScore: number;
  lagOneAutocorrelation: number | null;
};
type HedgeMethod = "rolling-ols" | "kalman";
type ExtendedPairSettings = QuantSettings & {
  formationWindow?: unknown;
  tradingWindow?: unknown;
  hedgeMethod?: unknown;
  kellyFraction?: unknown;
};
type PairMethodConfig = {
  formationWindow: number;
  tradingWindow: number;
  hedgeMethod: HedgeMethod;
  kellyFraction: number;
  formationBlocks: boolean;
};
type CleanSeries = {
  bars: Candle[];
  inputBars: number;
  capped: boolean;
  invalid: number;
  unclosedOrFuture: number;
  identicalDuplicates: number;
  conflictingDuplicates: number;
  fetchedAtProblem?: string;
};

function metric(
  key: string,
  label: string,
  value: number | string | null,
  unit?: string,
): QuantMetric {
  return unit === undefined
    ? { key, label, value }
    : { key, label, value, unit };
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validCandle(candle: Candle): boolean {
  if (!finite(candle.time) || !Number.isInteger(candle.time) || candle.time < 0)
    return false;
  if (
    !finite(candle.open) ||
    !finite(candle.high) ||
    !finite(candle.low) ||
    !finite(candle.close) ||
    !finite(candle.volume)
  )
    return false;
  if (
    candle.open <= 0 ||
    candle.high <= 0 ||
    candle.low <= 0 ||
    candle.close <= 0 ||
    candle.volume < 0
  )
    return false;
  return (
    candle.low <= candle.high &&
    candle.open >= candle.low &&
    candle.open <= candle.high &&
    candle.close >= candle.low &&
    candle.close <= candle.high
  );
}

function sameCandle(left: Candle, right: Candle): boolean {
  return (
    left.time === right.time &&
    left.open === right.open &&
    left.high === right.high &&
    left.low === right.low &&
    left.close === right.close &&
    left.volume === right.volume
  );
}

/** Keeps observed, closed bars only. Conflicting duplicate timestamps are excluded rather than arbitrarily selected. */
function cleanSeries(series: QuantSeries, nowMs: number): CleanSeries {
  const source = Array.isArray(series.candles) ? series.candles : [];
  const candidate = source.slice(-MAX_BARS_PER_ASSET);
  const byTime = new Map<number, Candle | null>();
  let invalid = 0;
  let unclosedOrFuture = 0;
  let identicalDuplicates = 0;
  let conflictingDuplicates = 0;
  const nowSeconds = nowMs / 1_000;
  const duration = SECONDS[series.timeframe];

  for (const candle of candidate) {
    if (!validCandle(candle)) {
      invalid += 1;
      continue;
    }
    // Candle timestamps are Unix seconds; now/fetchedAt are Unix milliseconds.
    if (candle.time + duration > nowSeconds) {
      unclosedOrFuture += 1;
      continue;
    }
    const existing = byTime.get(candle.time);
    if (existing === undefined) {
      byTime.set(candle.time, candle);
    } else if (existing !== null && sameCandle(existing, candle)) {
      identicalDuplicates += 1;
    } else {
      // A second, different bar at the same timestamp is not reliable source evidence.
      byTime.set(candle.time, null);
      conflictingDuplicates += 1;
    }
  }

  let fetchedAtProblem: string | undefined;
  if (!finite(series.fetchedAt) || series.fetchedAt < 0)
    fetchedAtProblem = "fetchedAt is not a finite Unix-millisecond timestamp";
  else if (series.fetchedAt > nowMs)
    fetchedAtProblem = "fetchedAt is later than the supplied now timestamp";

  return {
    bars: Array.from(byTime.values())
      .filter((candle): candle is Candle => candle !== null)
      .sort((a, b) => a.time - b.time),
    inputBars: source.length,
    capped: source.length > MAX_BARS_PER_ASSET,
    invalid,
    unclosedOrFuture,
    identicalDuplicates,
    conflictingDuplicates,
    ...(fetchedAtProblem === undefined ? {} : { fetchedAtProblem }),
  };
}

function sourceMetrics(
  left: QuantSeries,
  right: QuantSeries,
  leftClean: CleanSeries,
  rightClean: CleanSeries,
  synchronized: number,
  minimum: number,
): QuantMetric[] {
  return [
    metric(
      "left-source",
      "Left source",
      `${left.symbol} · ${left.provenance} · ${left.source}`,
    ),
    metric(
      "right-source",
      "Right source",
      `${right.symbol} · ${right.provenance} · ${right.source}`,
    ),
    metric(
      "left-input-bars",
      "Left supplied bars",
      leftClean.inputBars,
      "bars",
    ),
    metric(
      "right-input-bars",
      "Right supplied bars",
      rightClean.inputBars,
      "bars",
    ),
    metric(
      "left-closed-bars",
      "Left valid closed bars",
      leftClean.bars.length,
      "bars",
    ),
    metric(
      "right-closed-bars",
      "Right valid closed bars",
      rightClean.bars.length,
      "bars",
    ),
    metric(
      "left-fetched-at",
      "Left fetched at",
      finite(left.fetchedAt) ? left.fetchedAt : null,
      "Unix ms",
    ),
    metric(
      "right-fetched-at",
      "Right fetched at",
      finite(right.fetchedAt) ? right.fetchedAt : null,
      "Unix ms",
    ),
    metric(
      "synchronized-bars",
      "Exact synchronized closed bars",
      synchronized,
      "bars",
    ),
    metric(
      "minimum-source-bars",
      "Minimum synchronized bars required",
      minimum,
      "bars",
    ),
  ];
}

function sourceLimitations(side: string, cleaned: CleanSeries): string[] {
  const limitations: string[] = [];
  if (cleaned.capped)
    limitations.push(
      `${side}: only the most recent ${MAX_BARS_PER_ASSET} supplied bars were examined; older supplied rows were not processed.`,
    );
  if (cleaned.invalid)
    limitations.push(
      `${side}: ${cleaned.invalid} malformed, NaN, zero-price, or invalid-OHLC bars were excluded.`,
    );
  if (cleaned.unclosedOrFuture)
    limitations.push(
      `${side}: ${cleaned.unclosedOrFuture} unclosed or future bars were excluded using time + timeframe seconds <= now/1000.`,
    );
  if (cleaned.identicalDuplicates)
    limitations.push(
      `${side}: ${cleaned.identicalDuplicates} exact duplicate timestamps were deduplicated.`,
    );
  if (cleaned.conflictingDuplicates)
    limitations.push(
      `${side}: ${cleaned.conflictingDuplicates} conflicting duplicate timestamps were excluded; no value was selected or invented.`,
    );
  if (cleaned.fetchedAtProblem)
    limitations.push(
      `${side}: ${cleaned.fetchedAtProblem}; it was not used as a bar timestamp.`,
    );
  return limitations;
}

function synchronize(left: Candle[], right: Candle[]): PairPoint[] {
  const rightByTime = new Map(
    right.map((candle) => [candle.time, candle.close]),
  );
  const points: PairPoint[] = [];
  for (const candle of left) {
    const matchingClose = rightByTime.get(candle.time);
    if (matchingClose !== undefined)
      points.push({
        time: candle.time,
        left: candle.close,
        right: matchingClose,
      });
  }
  return points;
}

function irregularGapCount(points: PairPoint[], timeframe: Timeframe): number {
  const duration = SECONDS[timeframe];
  let gaps = 0;
  for (let index = 1; index < points.length; index += 1) {
    if (points[index].time - points[index - 1].time !== duration) gaps += 1;
  }
  return gaps;
}

/** Fits left = intercept + beta * right over [start, end), using no future rows. */
function rollingFit(
  points: PairPoint[],
  start: number,
  end: number,
): Fit | undefined {
  const count = end - start;
  if (count < MIN_LOOKBACK) return undefined;

  let sumLeft = 0;
  let sumRight = 0;
  for (let index = start; index < end; index += 1) {
    sumLeft += points[index].left;
    sumRight += points[index].right;
  }
  const meanLeft = sumLeft / count;
  const meanRight = sumRight / count;
  if (!finite(meanLeft) || !finite(meanRight)) return undefined;

  let covariance = 0;
  let rightVariance = 0;
  for (let index = start; index < end; index += 1) {
    const leftDelta = points[index].left - meanLeft;
    const rightDelta = points[index].right - meanRight;
    covariance += leftDelta * rightDelta;
    rightVariance += rightDelta * rightDelta;
  }
  if (!finite(covariance) || !finite(rightVariance) || rightVariance <= EPSILON)
    return undefined;

  const beta = covariance / rightVariance;
  const intercept = meanLeft - beta * meanRight;
  if (!finite(beta) || !finite(intercept)) return undefined;

  let residualSum = 0;
  for (let index = start; index < end; index += 1)
    residualSum +=
      points[index].left - (intercept + beta * points[index].right);
  const residualMean = residualSum / count;

  let squaredDeviation = 0;
  for (let index = start; index < end; index += 1) {
    const residual =
      points[index].left - (intercept + beta * points[index].right);
    const delta = residual - residualMean;
    squaredDeviation += delta * delta;
  }
  const residualStd = Math.sqrt(squaredDeviation / (count - 1));
  const residual =
    points[end - 1].left - (intercept + beta * points[end - 1].right);
  if (!finite(residualStd) || residualStd <= EPSILON || !finite(residual))
    return undefined;
  const zScore = (residual - residualMean) / residualStd;
  if (!finite(zScore)) return undefined;

  const lagOneAutocorrelation = residualAutocorrelation(
    points,
    start,
    end,
    intercept,
    beta,
  );
  return {
    intercept,
    beta,
    residual,
    residualMean,
    residualStd,
    zScore,
    lagOneAutocorrelation,
  };
}

function residualAutocorrelation(
  points: PairPoint[],
  start: number,
  end: number,
  intercept: number,
  beta: number,
): number | null {
  const count = end - start - 1;
  if (count < 2) return null;
  let priorSum = 0;
  let nextSum = 0;
  for (let index = start + 1; index < end; index += 1) {
    priorSum +=
      points[index - 1].left - (intercept + beta * points[index - 1].right);
    nextSum += points[index].left - (intercept + beta * points[index].right);
  }
  const priorMean = priorSum / count;
  const nextMean = nextSum / count;
  let numerator = 0;
  let priorSquared = 0;
  let nextSquared = 0;
  for (let index = start + 1; index < end; index += 1) {
    const prior =
      points[index - 1].left -
      (intercept + beta * points[index - 1].right) -
      priorMean;
    const next =
      points[index].left - (intercept + beta * points[index].right) - nextMean;
    numerator += prior * next;
    priorSquared += prior * prior;
    nextSquared += next * next;
  }
  const denominator = Math.sqrt(priorSquared * nextSquared);
  const value = denominator > EPSILON ? numerator / denominator : null;
  return value !== null && finite(value) ? value : null;
}

function scoreFitAt(fit: Fit, point: PairPoint): Fit | undefined {
  const residual = point.left - (fit.intercept + fit.beta * point.right);
  const zScore = (residual - fit.residualMean) / fit.residualStd;
  if (!finite(residual) || !finite(zScore)) return undefined;
  return { ...fit, residual, zScore };
}

/** A causal two-state Kalman hedge estimate with trailing residual scale. */
function kalmanFit(
  points: PairPoint[],
  start: number,
  end: number,
): Fit | undefined {
  if (end - start < MIN_LOOKBACK || start < 0 || end > points.length)
    return undefined;
  const path = kalmanHedgePath(
    points.slice(0, end).map((point) => ({ x: point.right, y: point.left })),
  );
  const latest = path?.at(-1);
  if (!path || !latest) return undefined;
  const residuals = path.slice(start, end).map((point) => point.residual);
  const residualMean = residuals.reduce((sum, value) => sum + value, 0) / residuals.length;
  const residualStd = standardDeviation(residuals);
  const residual = latest.residual;
  if (
    !finite(residualMean) ||
    residualStd === null ||
    residualStd <= EPSILON ||
    !finite(residual)
  )
    return undefined;
  const zScore = (residual - residualMean) / residualStd;
  if (!finite(zScore)) return undefined;
  return {
    intercept: latest.intercept,
    beta: latest.beta,
    residual,
    residualMean,
    residualStd,
    zScore,
    lagOneAutocorrelation: null,
  };
}

function fitForMethod(
  points: PairPoint[],
  start: number,
  end: number,
  hedgeMethod: HedgeMethod,
): Fit | undefined {
  return hedgeMethod === "kalman"
    ? kalmanFit(points, start, end)
    : rollingFit(points, start, end);
}

function resolvePairMethodConfig(
  settings: QuantSettings,
  historyBars: number,
): PairMethodConfig {
  const extension = settings as ExtendedPairSettings;
  const requestedFormation = extension.formationWindow;
  const requestedTrading = extension.tradingWindow;
  const formationWindow =
    typeof requestedFormation === "number"
      ? requestedFormation
      : historyBars >= DEFAULT_BLOCK_HISTORY
        ? DEFAULT_FORMATION_WINDOW
        : settings.lookback;
  const tradingWindow =
    typeof requestedTrading === "number"
      ? requestedTrading
      : historyBars >= DEFAULT_BLOCK_HISTORY
        ? DEFAULT_TRADING_WINDOW
        : settings.holdingBars;
  const hedgeMethod: HedgeMethod =
    extension.hedgeMethod === "kalman" ? "kalman" : "rolling-ols";
  const kellyFraction =
    typeof extension.kellyFraction === "number"
      ? Math.min(0.25, extension.kellyFraction)
      : 0.25;
  return {
    formationWindow,
    tradingWindow,
    hedgeMethod,
    kellyFraction,
    formationBlocks:
      historyBars >= formationWindow + tradingWindow &&
      (historyBars >= DEFAULT_BLOCK_HISTORY ||
        requestedFormation !== undefined ||
        requestedTrading !== undefined),
  };
}

function directionFromQuantity(quantity: number): "long" | "short" | "flat" {
  return quantity > 0 ? "long" : quantity < 0 ? "short" : "flat";
}

function hasPosition(position: Position): boolean {
  return (
    position.direction !== 0 &&
    (Math.abs(position.leftQuantity) > EPSILON ||
      Math.abs(position.rightQuantity) > EPSILON)
  );
}

function flatPosition(): Position {
  return {
    direction: 0,
    leftQuantity: 0,
    rightQuantity: 0,
    entrySignalIndex: -1,
  };
}

function twoLegPosition(
  direction: Direction,
  beta: number,
  orderSize: number,
  entrySignalIndex: number,
): Position | undefined {
  if (direction === 0 || !finite(beta) || Math.abs(beta) <= EPSILON)
    return undefined;
  const leftQuantity = direction * orderSize;
  const rightQuantity = -direction * beta * orderSize;
  if (
    !finite(leftQuantity) ||
    !finite(rightQuantity) ||
    Math.abs(rightQuantity) <= EPSILON
  )
    return undefined;
  return { direction, leftQuantity, rightQuantity, entrySignalIndex };
}

function samePosition(left: Position, right: Position): boolean {
  return (
    left.leftQuantity === right.leftQuantity &&
    left.rightQuantity === right.rightQuantity
  );
}

function transactionCost(
  from: Position,
  to: Position,
  point: PairPoint,
  costRate: number,
): number | undefined {
  const tradedNotional =
    Math.abs(to.leftQuantity - from.leftQuantity) * point.left +
    Math.abs(to.rightQuantity - from.rightQuantity) * point.right;
  const cost = tradedNotional * costRate;
  return finite(cost) ? cost : undefined;
}

function pairedPnl(
  position: Position,
  previous: PairPoint,
  current: PairPoint,
): number | undefined {
  const pnl =
    position.leftQuantity * (current.left - previous.left) +
    position.rightQuantity * (current.right - previous.right);
  return finite(pnl) ? pnl : undefined;
}

function settingProblems(settings: QuantSettings): string[] {
  const problems: string[] = [];
  if (
    !Number.isInteger(settings.lookback) ||
    settings.lookback < MIN_LOOKBACK ||
    settings.lookback > MAX_LOOKBACK
  )
    problems.push(
      `lookback must be an integer from ${MIN_LOOKBACK} to ${MAX_LOOKBACK}; the present-window Engle–Granger diagnostic requires at least ${MIN_LOOKBACK} completed observations.`,
    );
  if (!finite(settings.entryZ) || settings.entryZ <= 0)
    problems.push("entryZ must be finite and greater than zero.");
  if (!finite(settings.exitZ) || settings.exitZ < 0)
    problems.push("exitZ must be finite and at least zero.");
  if (
    finite(settings.entryZ) &&
    finite(settings.exitZ) &&
    settings.exitZ >= settings.entryZ
  )
    problems.push("exitZ must be below entryZ.");
  if (
    !finite(settings.feeBps) ||
    settings.feeBps < 0 ||
    settings.feeBps > MAX_BPS
  )
    problems.push(`feeBps must be finite and between 0 and ${MAX_BPS}.`);
  if (
    !finite(settings.slippageBps) ||
    settings.slippageBps < 0 ||
    settings.slippageBps > MAX_BPS
  )
    problems.push(`slippageBps must be finite and between 0 and ${MAX_BPS}.`);
  if (
    !Number.isInteger(settings.holdingBars) ||
    settings.holdingBars < 1 ||
    settings.holdingBars > MAX_HOLDING_BARS
  )
    problems.push(
      `holdingBars must be an integer from 1 to ${MAX_HOLDING_BARS}.`,
    );
  if (!finite(settings.startingEquity) || settings.startingEquity <= 0)
    problems.push("startingEquity must be finite and greater than zero.");
  if (!finite(settings.orderSize) || settings.orderSize <= 0)
    problems.push("orderSize must be finite and greater than zero.");
  const extension = settings as ExtendedPairSettings;
  if (
    extension.formationWindow !== undefined &&
    (!Number.isInteger(extension.formationWindow) ||
      (extension.formationWindow as number) < MIN_LOOKBACK ||
      (extension.formationWindow as number) > MAX_LOOKBACK)
  )
    problems.push(
      `formationWindow must be an integer from ${MIN_LOOKBACK} to ${MAX_LOOKBACK} when supplied.`,
    );
  if (
    extension.tradingWindow !== undefined &&
    (!Number.isInteger(extension.tradingWindow) ||
      (extension.tradingWindow as number) < 1 ||
      (extension.tradingWindow as number) > MAX_HOLDING_BARS)
  )
    problems.push(
      `tradingWindow must be an integer from 1 to ${MAX_HOLDING_BARS} when supplied.`,
    );
  if (
    extension.hedgeMethod !== undefined &&
    extension.hedgeMethod !== "rolling-ols" &&
    extension.hedgeMethod !== "kalman"
  )
    problems.push("hedgeMethod must be 'rolling-ols' or 'kalman' when supplied.");
  if (
    extension.kellyFraction !== undefined &&
    (!finite(extension.kellyFraction) ||
      extension.kellyFraction < 0 ||
      extension.kellyFraction > 0.25)
  )
    problems.push("kellyFraction must be finite and from 0 through 0.25 when supplied.");
  return problems;
}

function unavailable(summary: string, reasons: string[]): QuantLabResult {
  return {
    family: "pairs",
    status: "unavailable",
    title: "Pairs research unavailable",
    summary,
    asOf: 0,
    metrics: [],
    signals: [],
    equity: [],
    validation: {
      status: "unconfirmed",
      actualSamples: 0,
      trainSamples: 0,
      testSamples: 0,
      walkForward: false,
      untouchedHoldout: false,
      reasons,
    },
    dataRequirements: reasons,
    limitations: [
      "No brokerage or exchange execution is initiated by this research function.",
    ],
  };
}

function insufficient(
  summary: string,
  asOf: number,
  metrics: QuantMetric[],
  reasons: string[],
  limitations: string[],
): QuantLabResult {
  return {
    family: "pairs",
    status: "insufficient-data",
    title: "Pairs research — insufficient data",
    summary,
    asOf,
    metrics,
    signals: [],
    equity: [],
    validation: {
      status: "unconfirmed",
      actualSamples: 0,
      trainSamples: 0,
      testSamples: 0,
      walkForward: false,
      untouchedHoldout: false,
      reasons,
    },
    dataRequirements: reasons,
    limitations,
  };
}

/**
 * Runs an exploratory, two-asset pairs diagnostic. It does not fetch data,
 * send orders, select a broker, or turn a signal into a single-leg trade.
 */
export function runPairs(input: QuantLabInput): QuantLabResult {
  if (!input || input.family !== "pairs")
    return unavailable("runPairs accepts only the pairs family.", [
      "Set QuantLabInput.family to 'pairs'.",
    ]);
  if (!finite(input.now) || input.now < 0)
    return unavailable(
      "The supplied now value is not a finite Unix-millisecond timestamp.",
      [
        "Provide now in Unix milliseconds; candle timestamps remain Unix seconds.",
      ],
    );
  if (!Array.isArray(input.series) || input.series.length !== 2) {
    if (Array.isArray(input.series) && input.series.length > 2)
      return unavailable(
        "Too many assets were supplied for a two-asset pairs study.",
        [
          `Pairs research requires exactly two input assets; received ${input.series.length}. The shared runner has a ${MAX_ASSETS}-market ceiling for broader families, but does not select a pair from a basket.`,
        ],
      );
    return unavailable(
      "Pairs research requires exactly two explicitly selected assets.",
      [
        "Supply exactly two series; this function does not choose or combine an arbitrary asset basket.",
      ],
    );
  }

  const problems = settingProblems(input.settings);
  if (problems.length)
    return unavailable("Pairs research settings are invalid.", problems);

  const [leftSeries, rightSeries] = input.series;
  if (leftSeries.symbol === rightSeries.symbol)
    return unavailable("Pairs research requires two distinct symbols.", [
      "Select two distinct assets; a symbol cannot be paired with itself.",
    ]);
  if (leftSeries.timeframe !== rightSeries.timeframe)
    return unavailable("Pairs research requires a shared timeframe.", [
      "Supply both selected assets at the same timeframe for exact timestamp synchronization.",
    ]);
  if (
    !(leftSeries.timeframe in SECONDS) ||
    !(rightSeries.timeframe in SECONDS)
  ) {
    return unavailable("Pairs research received an unsupported timeframe.", [
      "Use a supported timeframe so the closed-bar filter can evaluate time + timeframe seconds <= now/1000.",
    ]);
  }

  const leftClean = cleanSeries(leftSeries, input.now);
  const rightClean = cleanSeries(rightSeries, input.now);
  const points = synchronize(leftClean.bars, rightClean.bars);
  const methodConfig = resolvePairMethodConfig(input.settings, points.length);
  const minimum = Math.max(
    MIN_SYNCHRONIZED_BARS,
    methodConfig.formationWindow * 2,
  );
  const asOf = points.length ? points[points.length - 1].time * 1_000 : 0;
  const metrics = sourceMetrics(
    leftSeries,
    rightSeries,
    leftClean,
    rightClean,
    points.length,
    minimum,
  );
  const limitations = [
    ...sourceLimitations("Left series", leftClean),
    ...sourceLimitations("Right series", rightClean),
    "Provider and user-import provenance remain separately labelled above; neither is converted into the other.",
    "No brokerage order, single-leg substitute, venue routing, or live-book execution is performed by this module.",
    `At most ${MAX_BARS_PER_ASSET} supplied bars per asset are processed; older rows are not inspected.`,
    `Rolling formation windows are limited to ${MIN_LOOKBACK} through ${MAX_LOOKBACK} bars because the present-window Engle–Granger diagnostic requires at least ${MIN_LOOKBACK} completed observations.`,
    methodConfig.formationBlocks
      ? `Historical replay uses non-overlapping ${methodConfig.formationWindow}-bar formation and ${methodConfig.tradingWindow}-bar trading blocks. This protocol remains exploratory, not validated OOS evidence.`
      : "History is below the default 252/63 block threshold, so the supplied legacy lookback/holding controls are used without pretending they are the default block protocol.",
  ];
  const dataRequirements = [
    "Exactly two distinct assets with the same timeframe and exact matching Unix-second timestamps.",
    `At least ${minimum} valid, closed, synchronized bars (the greater of 100 and two lookback windows).`,
    `No more than ${MAX_BARS_PER_ASSET} supplied bars per asset are examined in this bounded runner.`,
    "Candles must be closed by time + timeframe seconds <= now/1000; missing timestamps are not filled.",
  ];

  if (points.length < minimum) {
    return insufficient(
      "The supplied assets do not yet provide enough synchronized, valid, closed history for a rolling hedge-ratio stability diagnostic.",
      asOf,
      metrics,
      dataRequirements,
      limitations,
    );
  }

  const latestFit = fitForMethod(
    points,
    points.length - methodConfig.formationWindow,
    points.length,
    methodConfig.hedgeMethod,
  );
  if (!latestFit) {
    return insufficient(
      "The latest rolling OLS spread cannot be estimated from the synchronized history (zero variation or non-finite arithmetic).",
      asOf,
      metrics,
      dataRequirements,
      [
        ...limitations,
        "No hedge ratio or z-score was invented for a flat or numerically invalid regression window.",
      ],
    );
  }

  const previousFit = fitForMethod(
    points,
    points.length - 2 * methodConfig.formationWindow,
    points.length - methodConfig.formationWindow,
    methodConfig.hedgeMethod,
  );
  const hedgeDrift =
    previousFit && Math.abs(previousFit.beta) > EPSILON
      ? Math.abs(latestFit.beta - previousFit.beta) / Math.abs(previousFit.beta)
      : null;
  const stability =
    hedgeDrift === null
      ? "unavailable"
      : hedgeDrift < 0.25
        ? "within 25% heuristic"
        : "over 25% heuristic";
  const gaps = irregularGapCount(points, leftSeries.timeframe);
  if (gaps)
    limitations.push(
      `${gaps} irregular synchronized timestamp gaps were retained as observed gaps only; no candles were filled. Rolling and holding windows count matched bars, not elapsed calendar time.`,
    );

  const trainSamples = Math.max(
    methodConfig.formationBlocks
      ? methodConfig.formationWindow
      : Math.max(
          input.settings.lookback,
          Math.floor(points.length * 0.7),
        ),
  );
  const testSamples = points.length - trainSamples;
  const costRate =
    (input.settings.feeBps + input.settings.slippageBps) / 10_000;
  let equityValue = input.settings.startingEquity;
  let modeledCosts = 0;
  const realizedNetOutcomes: number[] = [];
  let activeOutcome = false;
  let activeOutcomePnl = 0;
  let calculationFailed = false;
  const equity = [{ time: points[trainSamples].time, value: equityValue }];
  let executed = flatPosition();
  let intended = flatPosition();
  let pending = flatPosition();

  const decisionFit = (index: number): Fit | undefined => {
    if (index < methodConfig.formationWindow || index >= points.length)
      return undefined;
    if (!methodConfig.formationBlocks)
      return fitForMethod(
        points,
        index - methodConfig.formationWindow + 1,
        index + 1,
        methodConfig.hedgeMethod,
      );
    const blockStart =
      trainSamples +
      Math.floor((index - trainSamples) / methodConfig.tradingWindow) *
        methodConfig.tradingWindow;
    const formationFit = fitForMethod(
      points,
      blockStart - methodConfig.formationWindow,
      blockStart,
      methodConfig.hedgeMethod,
    );
    return formationFit ? scoreFitAt(formationFit, points[index]) : undefined;
  };

  const makeDecision = (index: number, fit: Fit | undefined): void => {
    if (!fit) {
      if (hasPosition(intended)) {
        intended = flatPosition();
        pending = intended;
      }
      return;
    }
    if (hasPosition(intended)) {
      const heldBars = index - intended.entrySignalIndex;
      if (
        Math.abs(fit.zScore) <= input.settings.exitZ ||
        heldBars >= input.settings.holdingBars
      ) {
        intended = flatPosition();
        pending = intended;
      } else {
        pending = intended;
      }
      return;
    }
    if (Math.abs(fit.zScore) < input.settings.entryZ) {
      pending = flatPosition();
      return;
    }
    const direction: Direction = fit.zScore > 0 ? -1 : 1;
    const proposed = twoLegPosition(
      direction,
      fit.beta,
      input.settings.orderSize,
      index,
    );
    if (!proposed) {
      pending = flatPosition();
      return;
    }
    intended = proposed;
    pending = proposed;
  };

  // The first OOS close creates a decision. It can only be filled at the next observed close.
  makeDecision(trainSamples, decisionFit(trainSamples));
  for (let index = trainSamples + 1; index < points.length; index += 1) {
    const pnl = pairedPnl(executed, points[index - 1], points[index]);
    const cost = transactionCost(executed, pending, points[index], costRate);
    if (
      pnl === undefined ||
      cost === undefined ||
      !finite(equityValue + pnl - cost) ||
      !finite(modeledCosts + cost)
    ) {
      calculationFailed = true;
      break;
    }
    const wasActive = hasPosition(executed);
    const willBeActive = hasPosition(pending);
    if (wasActive) activeOutcomePnl += pnl;
    if (!wasActive && willBeActive) {
      activeOutcome = true;
      activeOutcomePnl = -cost;
    } else if (activeOutcome && (wasActive || willBeActive)) {
      activeOutcomePnl -= cost;
    }
    if (wasActive && !willBeActive && activeOutcome) {
      realizedNetOutcomes.push(activeOutcomePnl);
      activeOutcome = false;
      activeOutcomePnl = 0;
    }
    equityValue += pnl - cost;
    modeledCosts += cost;
    executed = pending;
    equity.push({ time: points[index].time, value: equityValue });

    // The fit sees this just-closed bar and no later bar; its trade is lagged to the next close.
    makeDecision(index, decisionFit(index));
  }

  if (calculationFailed) {
    return insufficient(
      "The supplied values caused non-finite paired equity arithmetic; no partial performance value is reported.",
      asOf,
      metrics,
      dataRequirements,
      [
        ...limitations,
        "The bounded calculation stopped rather than emitting NaN, Infinity, or an invented equity value.",
      ],
    );
  }

  const resolvedOutcomes = realizedNetOutcomes.length;
  const kelly = limitedKellyFromOutcomes(
    realizedNetOutcomes,
    methodConfig.kellyFraction,
  );
  const coefficientStability = rollingCoefficientStability(
    points.map((point) => ({ x: point.right, y: point.left })),
    methodConfig.formationWindow,
  );
  const residualWindow = points
    .slice(-methodConfig.formationWindow)
    .map(
      (point) => point.left - (latestFit.intercept + latestFit.beta * point.right),
    );
  const halfLife = meanReversionHalfLife(residualWindow);
  const hurst = hurstRescaledRange(residualWindow);
  const johansen = unsupportedJohansenTraceTwoSeries();

  const cointegration = runEngleGrangerDiagnostic({
    observations: points.map((p) => ({
      timestamp: p.time,
      left: p.left,
      right: p.right,
      completed: true,
    })),
    window: methodConfig.formationWindow,
    alpha: 0.05,
  });
  metrics.push(
    metric(
      "cointegration-status",
      "Present-window Engle–Granger status",
      cointegration.status,
    ),
    metric("cointegration-adf", "Residual ADF t-statistic", cointegration.stat),
    metric(
      "cointegration-p",
      "MacKinnon no-cointegration p-value (NOT win probability)",
      cointegration.pValue,
    ),
    metric(
      "cointegration-decision",
      "No-cointegration test decision",
      cointegration.decision,
    ),
    metric(
      "cointegration-break",
      "Prior/current equal-window comparison",
      cointegration.comparison.status,
    ),
    metric(
      "cointegration-critical5",
      "Finite-sample5% critical value",
      cointegration.criticalValues?.fivePercent ?? null,
    ),
  );
  limitations.push(
    "Present-window cointegration diagnostics are descriptive and do not retroactively qualify this replay/OOS performance. p-value is not a trade success probability. Current pair candidates are withheld unless this window rejects no-cointegration and has no flagged loss-of-rejection.",
    ...cointegration.limitations.slice(0, 3),
  );
  const latestPosition = intended;
  const latestSignalFit = decisionFit(points.length - 1) ?? latestFit;
  const signalStrength = Math.min(
    1,
    Math.abs(latestSignalFit.zScore) / input.settings.entryZ,
  );
  const signalReason = `Closed-bar ${methodConfig.hedgeMethod} z-score ${latestSignalFit.zScore.toFixed(2)}; present-window Engle–Granger p=${cointegration.pValue?.toPrecision(4) ?? "unavailable"}; research candidate only—not validated edge. Any paper action remains a two-leg pair.`;
  const signals =
    hasPosition(latestPosition) &&
    cointegration.decision === "reject-no-cointegration" &&
    !cointegration.comparison.flagged
      ? [
          {
            at: points[points.length - 1].time,
            symbol: leftSeries.symbol,
            direction: directionFromQuantity(latestPosition.leftQuantity),
            strength: signalStrength,
            reason: signalReason,
          },
          {
            at: points[points.length - 1].time,
            symbol: rightSeries.symbol,
            direction: directionFromQuantity(latestPosition.rightQuantity),
            strength: signalStrength,
            reason: signalReason,
          },
        ]
      : [];

  metrics.push(
    metric(
      "formation-window",
      "Formation window",
      methodConfig.formationWindow,
      "bars",
    ),
    metric(
      "trading-window",
      "Trading block window",
      methodConfig.tradingWindow,
      "bars",
    ),
    metric(
      "formation-blocks",
      "Non-overlapping formation/trading blocks",
      methodConfig.formationBlocks ? "enabled" : "not enabled (history/settings)",
    ),
    metric("hedge-method", "Causal hedge method", methodConfig.hedgeMethod),
    metric(
      "hedge-ratio",
      "Latest hedge ratio (right units per left hedge)",
      latestFit.beta,
    ),
    metric("spread", "Latest OLS residual spread", latestFit.residual),
    metric("spread-z", "Latest rolling spread z-score", latestFit.zScore, "z"),
    metric(
      "spread-std",
      "Rolling residual standard deviation",
      latestFit.residualStd,
    ),
    metric(
      "residual-autocorrelation",
      "Residual lag-one autocorrelation (diagnostic)",
      latestFit.lagOneAutocorrelation,
    ),
    metric(
      "cointegration-diagnostic",
      "Cointegration diagnostic",
      `${cointegration.status}: ${cointegration.decision}; p=${cointegration.pValue?.toPrecision(4) ?? "unavailable"}`,
    ),
    metric(
      "prior-hedge-ratio",
      "Previous-window hedge ratio",
      previousFit?.beta ?? null,
    ),
    metric(
      "hedge-ratio-drift",
      "Rolling hedge-ratio drift",
      hedgeDrift,
      hedgeDrift === null ? undefined : "ratio",
    ),
    metric("hedge-stability", "Hedge-ratio stability", stability),
    metric(
      "rolling-beta-samples",
      "Rolling coefficient stability samples",
      coefficientStability.samples,
      "windows",
    ),
    metric(
      "rolling-beta-cv",
      "Rolling coefficient of variation",
      coefficientStability.coefficientOfVariation,
    ),
    metric(
      "spread-half-life",
      "Residual mean-reversion half-life",
      halfLife,
      halfLife === null ? undefined : "bars",
    ),
    metric("hurst-method", "Hurst screen method", hurst.method),
    metric("hurst-exponent", "Residual Hurst screen", hurst.value),
    metric(
      "hurst-observations",
      "Hurst screen observations",
      `${hurst.observations}/${hurst.minimumObservations}`,
    ),
    metric("johansen-trace-rank", "Johansen trace rank diagnostic", johansen.status),
    metric("johansen-trace-note", "Johansen trace note", johansen.reason),
    metric(
      "kelly-research-status",
      "Research-only fractional Kelly status",
      kelly.available ? "available (not used for sizing)" : "unavailable",
    ),
    metric(
      "kelly-research-fraction",
      "Research-only fractional Kelly cap",
      kelly.limitedFraction,
    ),
    metric(
      "oos-boundary",
      "OOS boundary",
      points[trainSamples].time * 1_000,
      "Unix ms",
    ),
    metric(
      "modeled-two-leg-costs",
      "Modeled two-leg fees + slippage",
      modeledCosts,
      "price units",
    ),
    metric("fee-bps", "Supplied fee", input.settings.feeBps, "bps"),
    metric(
      "slippage-bps",
      "Supplied slippage",
      input.settings.slippageBps,
      "bps",
    ),
  );

  const validationReasons = [
    `${methodConfig.formationBlocks ? "Historical formation/trading replay begins" : "Historical replay begins"} at ${points[trainSamples].time * 1_000} Unix ms after ${trainSamples} synchronized formation/training bars; every fit uses only the decision bar and prior bars.`,
    `${resolvedOutcomes} non-overlapping resolved OOS pair outcomes; at least 100 are required before any performance verdict.`,
    kelly.reason,
    "No untouched newest holdout is preserved because the newest closed bar is used for the current diagnostic.",
    "Present-window Engle–Granger diagnostics are supplied separately; multiple-testing correction, borrow, funding, FX conversion, delisting and survivorship analysis are not supplied.",
    "Fees and slippage are exactly the user-supplied generic bps assumptions; no exchange, broker, NBBO, or L2 cost was fabricated.",
  ];
  const paperPlan =
    signals.length === 2 && hasPosition(latestPosition)
      ? {
          description:
            "Candidate two-leg paper plan only. It is not a brokerage instruction and must never be decomposed into a single-leg order.",
          legs: [
            {
              symbol: leftSeries.symbol,
              side: directionFromQuantity(latestPosition.leftQuantity) as
                | "long"
                | "short",
              referencePrice: points[points.length - 1].left,
              quantity: Math.abs(latestPosition.leftQuantity),
            },
            {
              symbol: rightSeries.symbol,
              side: directionFromQuantity(latestPosition.rightQuantity) as
                | "long"
                | "short",
              referencePrice: points[points.length - 1].right,
              quantity: Math.abs(latestPosition.rightQuantity),
            },
          ],
        }
      : undefined;

  return {
    family: "pairs",
    status: "ready",
    title: "Pairs research — exploratory",
    summary: `Synchronized ${leftSeries.symbol}/${rightSeries.symbol} rolling OLS spread diagnostic. Any displayed signal is a lagged, costed, two-leg paper candidate only; it is not a validated performance claim.`,
    asOf,
    metrics,
    signals,
    equity,
    validation: {
      status: "unconfirmed",
      actualSamples: resolvedOutcomes,
      trainSamples,
      testSamples,
      walkForward: true,
      untouchedHoldout: false,
      reasons: validationReasons,
    },
    dataRequirements,
    limitations: [
      ...limitations,
      "A present-window Engle–Granger rejection is not stable future cointegration, a structural-break test, a win probability or validated edge.",
      `${johansen.reason} No uncalibrated trace statistic, critical value, or rank claim is displayed.`,
      hurst.value === null
        ? `Hurst screening is insufficient for this residual window (${hurst.observations}/${hurst.minimumObservations} observations); no value is substituted.`
        : "The deterministic Hurst R/S screen is descriptive only; it is not a stationarity, cointegration, or future-return guarantee.",
      "Any fractional Kelly metric is research-only, requires at least 100 completed net outcomes, is capped at 0.25, and is never applied to paper quantities by this module.",
      methodConfig.hedgeMethod === "kalman"
        ? "Kalman hedge estimates use fixed process/measurement noise and are descriptive. They are not outcome-fitted, execution-aware, or a stability guarantee."
        : "Rolling OLS hedge estimates are causal descriptive coefficients, not stable future hedge guarantees.",
      "Historical candle closes cannot establish executable simultaneous two-leg prices, spreads, fills, borrow availability, or funding costs.",
      "The equity path is exploratory: it starts flat at the OOS boundary, applies decisions no earlier than the next observed close, and does not force-close an open pair without a subsequent observed bar.",
    ],
    ...(paperPlan === undefined ? {} : { paperPlan }),
  };
}
