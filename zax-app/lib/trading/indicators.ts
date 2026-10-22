import type { Candle, Timeframe } from "./model";
import { SECONDS } from "./engine";
export type IndicatorPoint = {
  time: number;
  ema20?: number;
  ema50?: number;
  atr14?: number;
  rsi14?: number;
  bbMid?: number;
  bbUpper?: number;
  bbLower?: number;
  rvol20?: number;
  trail2Atr?: number;
  sma20?: number;
  sma50?: number;
  macd?: number;
  macdSignal?: number;
  macdHistogram?: number;
  donchianUpper?: number;
  donchianLower?: number;
};
export type IndicatorSnapshot = {
  timeframe: Timeframe;
  source: string;
  asOf?: number;
  points: IndicatorPoint[];
  formulas: string;
  volumeBasis: string;
  messages: string[];
};
export const INDICATOR_FORMULAS =
  "Close EMA20/50: initial period SMA then α=2/(n+1). ATR14: first14 true ranges (previous close required), then Wilder1/14. RSI14: first14 close changes then Wilder1/14; flat=50, no losses=100, no gains=0. BB20: close SMA ±2 populationσ. RVOL20: completed volume / mean of preceding20 positive volumes, excluding current; not time-of-day-normalized.";
const valid = (c: Candle) =>
  Number.isFinite(c.time) &&
  c.time > 0 &&
  [c.open, c.high, c.low, c.close].every((v) => Number.isFinite(v) && v > 0) &&
  c.high >= Math.max(c.open, c.close) &&
  c.low <= Math.min(c.open, c.close);
export function completedIndicatorBars(
  raw: Candle[],
  timeframe: Timeframe,
  now: number,
): Candle[] {
  const seconds = now > 10_000_000_000 ? now / 1000 : now;
  if (!Number.isFinite(seconds)) return [];
  const unique = new Map<number, Candle>();
  raw.forEach((c) => {
    if (valid(c) && c.time + SECONDS[timeframe] <= seconds)
      unique.set(c.time, c);
  });
  return [...unique.values()].sort((a, b) => a.time - b.time).slice(-3000);
}
export function ema(values: number[], period: number): (number | undefined)[] {
  const out: (number | undefined)[] = Array(values.length).fill(undefined);
  if (!Number.isInteger(period) || period < 1)
    throw new Error("EMA period must be a positive integer.");
  if (values.length < period) return out;
  let current = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = current;
  const alpha = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    current = alpha * values[i] + (1 - alpha) * current;
    out[i] = current;
  }
  return out;
}
export function indicatorSnapshot(
  raw: Candle[],
  timeframe: Timeframe,
  source: string,
  now: number,
): IndicatorSnapshot {
  const bars = completedIndicatorBars(raw, timeframe, now),
    closes = bars.map((c) => c.close),
    e20 = ema(closes, 20),
    e50 = ema(closes, 50);
  const fast = ema(closes, 12),
    slow = ema(closes, 26),
    macds = closes.slice(25).map((_, i) => fast[i + 25]! - slow[i + 25]!),
    signals = ema(macds, 9);
  let atr: number | undefined,
    gain: number | undefined,
    loss: number | undefined,
    trSum = 0,
    gainSum = 0,
    lossSum = 0;
  const points = bars.map((c, i): IndicatorPoint => {
    const p: IndicatorPoint = { time: c.time, ema20: e20[i], ema50: e50[i] };
    if (i >= 19)
      p.sma20 = closes.slice(i - 19, i + 1).reduce((a, b) => a + b, 0) / 20;
    if (i >= 49)
      p.sma50 = closes.slice(i - 49, i + 1).reduce((a, b) => a + b, 0) / 50;
    if (i >= 25) {
      p.macd = macds[i - 25];
      p.macdSignal = signals[i - 25];
      if (p.macdSignal !== undefined) p.macdHistogram = p.macd - p.macdSignal;
    }
    if (i >= 20) {
      const prior = bars.slice(i - 20, i);
      p.donchianUpper = Math.max(...prior.map((b) => b.high));
      p.donchianLower = Math.min(...prior.map((b) => b.low));
    }
    if (i > 0) {
      const delta = c.close - bars[i - 1].close,
        tr = Math.max(
          c.high - c.low,
          Math.abs(c.high - bars[i - 1].close),
          Math.abs(c.low - bars[i - 1].close),
        );
      if (i <= 14) {
        trSum += tr;
        gainSum += Math.max(0, delta);
        lossSum += Math.max(0, -delta);
        if (i === 14) {
          atr = trSum / 14;
          gain = gainSum / 14;
          loss = lossSum / 14;
        }
      } else {
        atr = (atr! * 13 + tr) / 14;
        gain = (gain! * 13 + Math.max(0, delta)) / 14;
        loss = (loss! * 13 + Math.max(0, -delta)) / 14;
      }
      if (atr !== undefined) {
        p.atr14 = atr;
        p.trail2Atr = c.close - 2 * atr;
        p.rsi14 =
          gain === 0 && loss === 0
            ? 50
            : loss === 0
              ? 100
              : gain === 0
                ? 0
                : 100 - 100 / (1 + gain! / loss!);
      }
    }
    if (i >= 19) {
      const values = closes.slice(i - 19, i + 1),
        mid = values.reduce((a, b) => a + b, 0) / 20,
        sd = Math.sqrt(values.reduce((a, b) => a + (b - mid) ** 2, 0) / 20);
      p.bbMid = mid;
      p.bbUpper = mid + 2 * sd;
      p.bbLower = mid - 2 * sd;
    }
    if (i >= 20) {
      const volumes = bars.slice(i - 20, i).map((b) => b.volume);
      if (
        volumes.every((v) => Number.isFinite(v) && v > 0) &&
        Number.isFinite(c.volume) &&
        c.volume >= 0
      ) {
        const mean = volumes.reduce((a, b) => a + b, 0) / 20;
        p.rvol20 = c.volume / mean;
      }
    }
    return p;
  });
  const messages: string[] = [];
  if (bars.length < 55)
    messages.push(
      `${bars.length} closed bars: EMA50 needs50, five-bar slope needs55; warm-up values are absent, not zero.`,
    );
  if (!points.at(-1)?.rvol20 && points.at(-1)?.rvol20 !== 0)
    messages.push(
      "RVOL unavailable: need20 preceding positive finite volumes and a finite nonnegative current volume.",
    );
  const volumeBasis = /Coinbase Exchange/i.test(source)
    ? "Coinbase supplied asset volume; same-frame raw ratio, not consolidated stock/time-of-day RVOL."
    : "Provider OHLC volume units/type not established; any raw ratio is indicative, not verified traded/consolidated volume.";
  if (!/Coinbase Exchange/i.test(source))
    messages.push(
      "Broker/provider volume semantics are unknown; a raw ratio cannot confirm the source RVOL filter.",
    );
  return {
    timeframe,
    source,
    asOf: bars.at(-1) ? bars.at(-1)!.time + SECONDS[timeframe] : undefined,
    points,
    formulas:
      INDICATOR_FORMULAS +
      " SMA20/50 include current closed close. MACD12/26/9 uses SMA-seeded price EMAs and first-nine-MACD SMA signal seed;35 closes for current/prior comparison; convergence not guaranteed by minimum warm-up. Donchian20 excludes current bar from high/low window.",
    volumeBasis,
    messages,
  };
}
