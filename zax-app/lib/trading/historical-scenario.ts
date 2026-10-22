import type { Candle, Strategy, Timeframe } from "./model";
import type { ForecastScenario } from "./setup-model";

const QUERY_BARS = 12;
const HORIZON_BARS = 12;
const MINIMUM_BARS = QUERY_BARS + HORIZON_BARS + QUERY_BARS;
const MAXIMUM_BARS = 3_000;
const DIRECTION_DEADBAND = 0.0001;

const SUPPORTED_TIMEFRAMES: readonly Timeframe[] = [
  "1m",
  "5m",
  "15m",
  "30m",
  "1h",
  "4h",
  "1d",
  "1w",
];

type Candidate = {
  index: number;
  distance: number;
};

type StrategyMetadata = Pick<Strategy, "id" | "version">;

/**
 * Returns true only for complete, internally consistent positive-price OHLC records.
 * The caller is responsible for passing closed candles; this module does not infer
 * a completion time from a clock or a market calendar.
 */
function isValidCandle(value: unknown): value is Candle {
  if (!value || typeof value !== "object") return false;
  const candle = value as Partial<Candle>;
  const fields = [
    candle.time,
    candle.open,
    candle.high,
    candle.low,
    candle.close,
    candle.volume,
  ];
  if (!fields.every((field) => typeof field === "number" && Number.isFinite(field)))
    return false;
  if (
    candle.time === undefined ||
    candle.open === undefined ||
    candle.high === undefined ||
    candle.low === undefined ||
    candle.close === undefined ||
    candle.volume === undefined
  )
    return false;
  return (
    candle.time > 0 &&
    candle.open > 0 &&
    candle.high > 0 &&
    candle.low > 0 &&
    candle.close > 0 &&
    candle.volume >= 0 &&
    candle.high >= candle.low &&
    candle.high >= Math.max(candle.open, candle.close) &&
    candle.low <= Math.min(candle.open, candle.close)
  );
}

/**
 * Sorts completed, valid input without changing any OHLC values, retains the first
 * record for a duplicate timestamp, and bounds the lookup to the most recent 3,000
 * observations. A malformed raw array is deliberately skipped rather than repaired.
 */
function completedCandles(raw: unknown): Candle[] {
  if (!Array.isArray(raw) || raw.some((candle) => !isValidCandle(candle))) return [];

  const sorted = raw
    .map((candle, index) => ({ candle, index }))
    .sort((left, right) => left.candle.time - right.candle.time || left.index - right.index);
  const deduplicated: Candle[] = [];
  for (const item of sorted) {
    if (deduplicated.at(-1)?.time !== item.candle.time)
      deduplicated.push(item.candle);
  }
  return deduplicated.slice(-MAXIMUM_BARS);
}

function normalizedCloseShape(bars: readonly Candle[]): number[] | undefined {
  const first = bars[0]?.close;
  if (!first || !Number.isFinite(first) || first <= 0) return undefined;

  const startLog = Math.log(first);
  const values = bars.map((bar) => Math.log(bar.close) - startLog);
  if (!values.every(Number.isFinite)) return undefined;

  const sumOfSquares = values.reduce((sum, value) => sum + value * value, 0);
  if (!Number.isFinite(sumOfSquares) || sumOfSquares < 0) return undefined;
  const norm = Math.sqrt(sumOfSquares);
  if (!Number.isFinite(norm)) return undefined;
  return norm === 0 ? values.map(() => 0) : values.map((value) => value / norm);
}

function shapeDistance(left: readonly number[], right: readonly number[]): number | undefined {
  if (left.length !== QUERY_BARS || right.length !== QUERY_BARS) return undefined;
  const meanSquare = left.reduce((sum, value, index) => {
    const difference = value - right[index];
    return sum + difference * difference;
  }, 0) / QUERY_BARS;
  if (!Number.isFinite(meanSquare) || meanSquare < 0) return undefined;
  const distance = Math.sqrt(meanSquare);
  return Number.isFinite(distance) ? distance : undefined;
}

function projectedContinuation(
  continuation: readonly Candle[],
  historicalAnchor: number,
  anchorPrice: number,
): Candle[] | undefined {
  const scale = anchorPrice / historicalAnchor;
  if (!Number.isFinite(scale) || scale <= 0) return undefined;

  const scaled = continuation.map((bar) => ({
    time: bar.time,
    open: bar.open * scale,
    high: bar.high * scale,
    low: bar.low * scale,
    close: bar.close * scale,
    volume: bar.volume,
  }));
  return scaled.every(isValidCandle) ? scaled : undefined;
}

function selectedStrategyMetadata(raw: unknown): StrategyMetadata[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((strategy): strategy is StrategyMetadata => {
    if (!strategy || typeof strategy !== "object") return false;
    const value = strategy as Partial<Strategy>;
    return (
      typeof value.id === "string" &&
      value.id.length > 0 &&
      typeof value.version === "number" &&
      Number.isFinite(value.version)
    );
  });
}

function validTimeframe(value: unknown): value is Timeframe {
  return typeof value === "string" && SUPPORTED_TIMEFRAMES.includes(value as Timeframe);
}

/**
 * Replays the continuation that followed the closest fully historical 12-bar close
 * shape. It uses no strategy factors, readiness state, trade side, or performance
 * estimate: selected strategies are retained solely as scenario metadata.
 */
export function contextualScenario(
  candles: Candle[],
  market: string,
  timeframe: Timeframe,
  strategies: Strategy[],
  combination: "all" | "any",
  source: string,
): ForecastScenario | undefined {
  if (
    typeof market !== "string" ||
    typeof source !== "string" ||
    !validTimeframe(timeframe) ||
    (combination !== "all" && combination !== "any")
  )
    return undefined;

  const completed = completedCandles(candles);
  if (completed.length < MINIMUM_BARS) return undefined;

  const currentQuery = completed.slice(-QUERY_BARS);
  const currentShape = normalizedCloseShape(currentQuery);
  const anchor = currentQuery.at(-1);
  if (!currentShape || !anchor || !Number.isFinite(anchor.close) || anchor.close <= 0)
    return undefined;

  // Candidate continuations end before the first current-query candle. Timestamp gaps
  // are intentionally retained: FX weekends and provider gaps are not synthetic bars.
  const currentStart = completed.length - QUERY_BARS;
  let nearest: Candidate | undefined;
  for (let index = 0; index + QUERY_BARS + HORIZON_BARS <= currentStart; index += 1) {
    const historicalQuery = completed.slice(index, index + QUERY_BARS);
    const candidateShape = normalizedCloseShape(historicalQuery);
    if (!candidateShape) continue;
    const distance = shapeDistance(candidateShape, currentShape);
    if (distance === undefined) continue;

    const continuation = completed.slice(
      index + QUERY_BARS,
      index + QUERY_BARS + HORIZON_BARS,
    );
    if (
      continuation.length !== HORIZON_BARS ||
      !projectedContinuation(continuation, historicalQuery.at(-1)!.close, anchor.close)
    )
      continue;

    if (!nearest || distance < nearest.distance) nearest = { index, distance };
  }
  if (!nearest) return undefined;

  const sourceQuery = completed.slice(nearest.index, nearest.index + QUERY_BARS);
  const sourceContinuation = completed.slice(
    nearest.index + QUERY_BARS,
    nearest.index + QUERY_BARS + HORIZON_BARS,
  );
  const drawnCandles = projectedContinuation(
    sourceContinuation,
    sourceQuery.at(-1)!.close,
    anchor.close,
  );
  if (!drawnCandles || !drawnCandles.length) return undefined;

  const selected = selectedStrategyMetadata(strategies);
  const sourceAt = sourceQuery.at(-1)!.time;
  const sourceEndAt = sourceContinuation.at(-1)!.time;
  const scenario: ForecastScenario = {
    id: `context-replay:${market}:${timeframe}:${source}:${anchor.time}`,
    anchorAt: anchor.time,
    sourceAt,
    source,
    strategyIds: selected.map((strategy) => strategy.id),
    strategyVersions: selected.map((strategy) => strategy.version),
    combination,
    candles: drawnCandles,
    distance: nearest.distance,
    explanation:
      `Context replay of the nearest 12-bar close shape (distance ${nearest.distance.toFixed(6)}). ` +
      `Its actual 12-bar historical continuation is positively scaled to the latest closed anchor; ` +
      `source timestamps, including gaps, are retained. No strategy rules, trade side, or success probability is inferred.`,
    basis: "context-replay",
    anchorPrice: anchor.close,
    queryBars: QUERY_BARS,
    sourceEndAt,
  };
  scenario.direction = scenarioDirection(scenario);
  return scenario;
}

/**
 * Classifies only the final drawn close against the scenario anchor. The comparison
 * deliberately ignores a setup/trade side and any pre-existing direction field.
 */
export function scenarioDirection(
  scenario: ForecastScenario | undefined,
  anchorFallback?: number,
): "up" | "down" | "flat" | undefined {
  const finalClose = scenario?.candles?.at(-1)?.close;
  const declaredAnchor = scenario?.anchorPrice;
  const anchor =
    typeof declaredAnchor === "number" && Number.isFinite(declaredAnchor) && declaredAnchor > 0
      ? declaredAnchor
      : typeof anchorFallback === "number" &&
          Number.isFinite(anchorFallback) &&
          anchorFallback > 0
        ? anchorFallback
        : undefined;
  if (
    typeof finalClose !== "number" ||
    !Number.isFinite(finalClose) ||
    finalClose <= 0 ||
    anchor === undefined
  )
    return undefined;

  const relativeMove = finalClose / anchor - 1;
  if (!Number.isFinite(relativeMove)) return finalClose > anchor ? "up" : "down";
  if (relativeMove > DIRECTION_DEADBAND) return "up";
  if (relativeMove < -DIRECTION_DEADBAND) return "down";
  return "flat";
}
