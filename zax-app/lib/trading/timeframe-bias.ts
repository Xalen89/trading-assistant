import { SECONDS } from "./engine";
import type { Candle, Timeframe } from "./model";

/** Fixed display and fetch order. Do not infer or omit frames from a response. */
export const TIMEFRAME_BIAS_TIMEFRAMES = [
  "1m",
  "5m",
  "15m",
  "30m",
  "1h",
  "4h",
  "1d",
  "1w",
] as const satisfies readonly Timeframe[];

export type TimeframeBiasTimeframe = (typeof TIMEFRAME_BIAS_TIMEFRAMES)[number];
export type TimeframeBiasStatus =
  | "bullish"
  | "bearish"
  | "neutral"
  | "insufficient"
  | "stale"
  | "unavailable";

export type TimeframeBiasValues = {
  close: number;
  ema20: number;
  ema50: number;
  ema20FiveBarsAgo: number;
};

export type TimeframeBiasRow = {
  timeframe: TimeframeBiasTimeframe;
  status: TimeframeBiasStatus;
  /** Provider family, not a price quote or a trade instruction. */
  provider: string;
  /** Exact provenance returned by the candle feed. */
  source: string;
  /** Epoch milliseconds when this frame was fetched from getCandles. */
  asOf: number;
  /** Unix-second opening time of the newest eligible, completed source bar. */
  latestClosedBar?: number;
  completedBars: number;
  values?: TimeframeBiasValues;
  warnings: string[];
  definition: string;
};

export type TimeframeBiasInput = {
  timeframe: TimeframeBiasTimeframe;
  candles: Candle[];
  provider?: string;
  source?: string;
  asOf?: number;
  /** Unix seconds, injectable to keep analysis deterministic in tests. */
  now?: number;
};

export const TIMEFRAME_BIAS_DEFINITION =
  "Bullish requires the latest completed close > EMA20 > EMA50 and EMA20 above its value five completed bars earlier. Bearish requires the exact inverse. All other completed-bar combinations are mixed / neutral.";

/** 55 completed observations provides EMA50 plus a five-bar EMA20 comparison. */
export const MIN_TIMEFRAME_BIAS_BARS = 55;

function validCandle(candle: Candle): boolean {
  return (
    Number.isFinite(candle.time) &&
    candle.time > 0 &&
    Number.isFinite(candle.open) &&
    Number.isFinite(candle.high) &&
    Number.isFinite(candle.low) &&
    Number.isFinite(candle.close) &&
    Number.isFinite(candle.volume) &&
    candle.open > 0 &&
    candle.high > 0 &&
    candle.low > 0 &&
    candle.close > 0 &&
    candle.volume >= 0 &&
    candle.high >= Math.max(candle.open, candle.close) &&
    candle.low <= Math.min(candle.open, candle.close)
  );
}

function ema(closes: number[], period: number): Array<number | undefined> {
  const output = Array<number | undefined>(closes.length).fill(undefined);
  if (closes.length < period) return output;

  let current =
    closes.slice(0, period).reduce((total, close) => total + close, 0) / period;
  output[period - 1] = current;
  const multiplier = 2 / (period + 1);
  for (let index = period; index < closes.length; index += 1) {
    current = (closes[index] - current) * multiplier + current;
    output[index] = current;
  }
  return output;
}

function baseRow(
  input: Pick<TimeframeBiasInput, "timeframe" | "provider" | "source" | "asOf">,
  status: TimeframeBiasStatus,
  overrides: Partial<TimeframeBiasRow> = {},
): TimeframeBiasRow {
  return {
    timeframe: input.timeframe,
    status,
    provider: input.provider || "unknown provider",
    source: input.source || "getCandles unavailable",
    asOf: Number.isFinite(input.asOf) ? input.asOf! : Date.now(),
    completedBars: 0,
    warnings: [],
    definition: TIMEFRAME_BIAS_DEFINITION,
    ...overrides,
  };
}

/** Builds an explicit non-directional row when a single provider frame fails. */
export function unavailableTimeframeBias(
  input: Omit<TimeframeBiasInput, "candles"> & { message: string },
): TimeframeBiasRow {
  return baseRow(input, "unavailable", { warnings: [input.message] });
}

/**
 * Analyses one frame only. Forming/current and future bars are excluded before
 * EMA calculation; this function never creates, fills, or carries forward bars.
 */
export function deriveTimeframeBias(
  input: TimeframeBiasInput,
): TimeframeBiasRow {
  const now = input.now ?? Date.now() / 1000;
  const seconds = SECONDS[input.timeframe];
  const warnings: string[] = [];
  const duplicateTimes = new Set<number>();
  const byTime = new Map<number, Candle>();
  let invalidBars = 0;
  let formingOrFutureBars = 0;

  for (const candle of input.candles) {
    if (!validCandle(candle)) {
      invalidBars += 1;
      continue;
    }
    // Candle timestamps are opening times in this app. Equality is complete.
    if (candle.time + seconds > now) {
      formingOrFutureBars += 1;
      continue;
    }
    if (byTime.has(candle.time)) {
      byTime.delete(candle.time);
      duplicateTimes.add(candle.time);
      continue;
    }
    if (!duplicateTimes.has(candle.time)) byTime.set(candle.time, candle);
  }

  if (invalidBars)
    warnings.push(
      `${invalidBars} invalid source bar${invalidBars === 1 ? " was" : "s were"} excluded.`,
    );
  if (formingOrFutureBars)
    warnings.push(
      `${formingOrFutureBars} forming or future source bar${formingOrFutureBars === 1 ? " was" : "s were"} excluded.`,
    );
  if (duplicateTimes.size)
    warnings.push(
      `${duplicateTimes.size} duplicate timestamp${duplicateTimes.size === 1 ? " was" : "s were"} excluded rather than arbitrarily selected.`,
    );

  const candles = [...byTime.values()].sort(
    (left, right) => left.time - right.time,
  );
  const latest = candles.at(-1);
  const rowInput = {
    timeframe: input.timeframe,
    provider: input.provider,
    source: input.source,
    asOf: input.asOf,
  };

  if (!latest)
    return baseRow(rowInput, "insufficient", {
      warnings: [...warnings, "No valid completed source bars are available."],
    });

  const gaps = candles
    .slice(1)
    .filter((bar, index) => bar.time - candles[index].time !== seconds).length;
  if (gaps)
    warnings.push(
      `${gaps} source timestamp gap${gaps === 1 ? " was" : "s were"} retained; no missing bars were filled.`,
    );

  const latestClosedBar = latest.time;
  const staleAfterSeconds = Math.max(seconds * 3, 900);
  if (now - (latestClosedBar + seconds) > staleAfterSeconds)
    return baseRow(rowInput, "stale", {
      latestClosedBar,
      completedBars: candles.length,
      warnings: [
        ...warnings,
        `Latest completed bar is older than the ${Math.round(staleAfterSeconds / 60)} minute freshness limit.`,
      ],
    });

  if (candles.length < MIN_TIMEFRAME_BIAS_BARS)
    return baseRow(rowInput, "insufficient", {
      latestClosedBar,
      completedBars: candles.length,
      warnings: [
        ...warnings,
        `${MIN_TIMEFRAME_BIAS_BARS} completed bars are required for EMA50 and the five-bar EMA20 comparison; only ${candles.length} are available.`,
      ],
    });

  const closes = candles.map((candle) => candle.close);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const index = candles.length - 1;
  const values = {
    close: closes[index],
    ema20: ema20[index],
    ema50: ema50[index],
    ema20FiveBarsAgo: ema20[index - 5],
  };

  if (
    !Number.isFinite(values.ema20) ||
    !Number.isFinite(values.ema50) ||
    !Number.isFinite(values.ema20FiveBarsAgo)
  )
    return baseRow(rowInput, "insufficient", {
      latestClosedBar,
      completedBars: candles.length,
      warnings: [
        ...warnings,
        "EMA history is incomplete after completed-bar filtering; no direction was assigned.",
      ],
    });

  const indicators: TimeframeBiasValues = values as TimeframeBiasValues;
  const bullish =
    indicators.close > indicators.ema20 &&
    indicators.ema20 > indicators.ema50 &&
    indicators.ema20 > indicators.ema20FiveBarsAgo;
  const bearish =
    indicators.close < indicators.ema20 &&
    indicators.ema20 < indicators.ema50 &&
    indicators.ema20 < indicators.ema20FiveBarsAgo;

  return baseRow(
    rowInput,
    bullish ? "bullish" : bearish ? "bearish" : "neutral",
    {
      latestClosedBar,
      completedBars: candles.length,
      values: indicators,
      warnings:
        bullish || bearish
          ? warnings
          : [
              ...warnings,
              "Completed-bar conditions are mixed or tied; no binary direction was forced.",
            ],
    },
  );
}
