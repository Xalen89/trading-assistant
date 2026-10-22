import type { Candle } from './model';

/** Frames assembled only from complete, actual lower-resolution source periods. */
export const DERIVED_TIMEFRAMES = ['30m', '4h', '1w'] as const;
export type DerivedTimeframe = (typeof DERIVED_TIMEFRAMES)[number];

export function isDerivedTimeframe(timeframe: string): timeframe is DerivedTimeframe {
  return (DERIVED_TIMEFRAMES as readonly string[]).includes(timeframe);
}

/** Monday 00:00:00 UTC for a Unix-second timestamp. */
export function utcMondayStart(time: number): number {
  const dayStart = Math.floor(time / 86_400) * 86_400;
  return dayStart - ((new Date(dayStart * 1000).getUTCDay() + 6) % 7) * 86_400;
}

function aggregateExactBuckets(
  source: Candle[],
  bucketStartFor: (time: number) => number,
  sourceSeconds: number,
  barsPerBucket: number,
  now: number,
): Candle[] {
  const byTime = new Map<number, Candle>();
  const duplicateTimes = new Set<number>();
  for (const bar of source) {
    // Do not choose an arbitrary conflicting provider period. Any bucket that
    // needs a duplicate timestamp is omitted below.
    if (byTime.has(bar.time)) {
      byTime.delete(bar.time);
      duplicateTimes.add(bar.time);
    } else if (!duplicateTimes.has(bar.time)) {
      byTime.set(bar.time, bar);
    }
  }
  const starts = new Set(source.map((bar) => bucketStartFor(bar.time)));
  const bucketSeconds = sourceSeconds * barsPerBucket;
  const output: Candle[] = [];

  for (const start of starts) {
    // A derived bar exists only when its full analytical UTC window has ended.
    if (start + bucketSeconds > now) continue;
    const bars: Candle[] = [];
    for (let index = 0; index < barsPerBucket; index++) {
      const expected = start + index * sourceSeconds;
      if (duplicateTimes.has(expected)) break;
      const bar = byTime.get(expected);
      if (!bar) break;
      bars.push(bar);
    }
    if (bars.length !== barsPerBucket) continue;
    output.push({
      time: start,
      open: bars[0].open,
      high: Math.max(...bars.map((bar) => bar.high)),
      low: Math.min(...bars.map((bar) => bar.low)),
      close: bars.at(-1)!.close,
      volume: bars.reduce((sum, bar) => sum + bar.volume, 0),
    });
  }

  return output.sort((left, right) => left.time - right.time);
}

/**
 * Aggregates only completed UTC :00/:30 half-hours with both exact, contiguous
 * :00/:15 or :30/:45 15-minute source periods present. Missing, current, and
 * duplicate/conflicting source periods are omitted rather than filled.
 */
export function aggregateClosed30mFrom15m(
  fifteenMinute: Candle[],
  now = Date.now() / 1000,
): Candle[] {
  return aggregateExactBuckets(
    fifteenMinute.filter((bar) => bar.time % 900 === 0),
    (time) => Math.floor(time / 1_800) * 1_800,
    900,
    2,
    now,
  );
}

/**
 * Aggregates only closed 00:00/04:00/08:00/12:00/16:00/20:00 UTC windows
 * with all four exact hourly source bars present. Missing hours are omitted.
 */
export function aggregateClosed4hFromHourly(
  hourly: Candle[],
  now = Date.now() / 1000,
): Candle[] {
  return aggregateExactBuckets(
    hourly.filter((bar) => bar.time % 3_600 === 0),
    (time) => Math.floor(time / 14_400) * 14_400,
    3_600,
    4,
    now,
  );
}

/**
 * Aggregates only completed Monday-to-Monday UTC weeks with all seven exact
 * UTC-midnight daily bars. This is appropriate only for an explicitly 24/7
 * daily source; it never treats unknown market-session closures as coverage.
 */
export function aggregateClosedWeeklyFromDaily(
  daily: Candle[],
  now = Date.now() / 1000,
): Candle[] {
  return aggregateExactBuckets(
    daily.filter((bar) => bar.time % 86_400 === 0),
    utcMondayStart,
    86_400,
    7,
    now,
  );
}
