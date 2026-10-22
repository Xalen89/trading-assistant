import { describe, expect, it } from 'vitest';
import type { Candle } from '../../lib/trading/model';
import { SECONDS } from '../../lib/trading/engine';
import {
  aggregateClosed30mFrom15m,
  aggregateClosed4hFromHourly,
  aggregateClosedWeeklyFromDaily,
  utcMondayStart,
} from '../../lib/trading/timeframes';
import { timeframe } from '../../server/trading/validation';

const monday = Date.UTC(2026, 0, 5) / 1000;
const candle = (time: number, value: number): Candle => ({
  time,
  open: value,
  high: value + 2,
  low: value - 1,
  close: value + 1,
  volume: value * 10,
});

describe('strict analytical timeframe aggregation', () => {
  it('accepts the derived frames through the shared API contract and durations', () => {
    expect(timeframe.parse('30m')).toBe('30m');
    expect(timeframe.parse('4h')).toBe('4h');
    expect(timeframe.parse('1w')).toBe('1w');
    expect(SECONDS).toMatchObject({ '30m': 1_800, '4h': 14_400, '1w': 604_800 });
  });

  it('creates a closed 30m candle only from two aligned contiguous 15m periods with exact OHLCV geometry', () => {
    const fifteenMinute = Array.from({ length: 4 }, (_, index) =>
      candle(monday + index * 900, index + 1),
    );
    const result = aggregateClosed30mFrom15m(
      fifteenMinute,
      monday + 3_600,
    );

    expect(result).toEqual([
      { time: monday, open: 1, high: 4, low: 0, close: 3, volume: 30 },
      { time: monday + 1_800, open: 3, high: 6, low: 2, close: 5, volume: 70 },
    ]);
  });

  it('omits incomplete, current, misaligned, and duplicate/conflicting 30m source buckets', () => {
    const first = candle(monday, 1);
    const second = candle(monday + 900, 2);
    expect(
      aggregateClosed30mFrom15m([first], monday + 1_800),
    ).toEqual([]);
    expect(
      aggregateClosed30mFrom15m([first, second], monday + 1_799),
    ).toEqual([]);
    expect(
      aggregateClosed30mFrom15m([first, second, { ...second, close: 999 }], monday + 1_800),
    ).toEqual([]);
    expect(
      aggregateClosed30mFrom15m(
        [first, { ...second, time: monday + 901 }],
        monday + 1_800,
      ),
    ).toEqual([]);
  });

  it('creates a closed UTC 4h candle only from four exact hourly bars', () => {
    const hourly = Array.from({ length: 8 }, (_, index) =>
      candle(monday + index * 3_600, index + 1),
    );
    const result = aggregateClosed4hFromHourly(hourly, monday + 8 * 3_600);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      time: monday,
      open: 1,
      high: 6,
      low: 0,
      close: 5,
      volume: 100,
    });
    expect(result[1].time).toBe(monday + 4 * 3_600);
  });

  it('omits missing-hour and unfinished 4h buckets rather than filling them', () => {
    const missingHour = [0, 1, 3].map((index) =>
      candle(monday + index * 3_600, index + 1),
    );
    expect(aggregateClosed4hFromHourly(missingHour, monday + 4 * 3_600)).toEqual([]);

    const currentBucket = Array.from({ length: 4 }, (_, index) =>
      candle(monday + 4 * 3_600 + index * 3_600, index + 1),
    );
    expect(aggregateClosed4hFromHourly(currentBucket, monday + 7 * 3_600)).toEqual([]);
  });

  it('uses Monday UTC, not the Unix Thursday epoch, and requires seven daily bars', () => {
    expect(utcMondayStart(0)).toBe(Date.UTC(1969, 11, 29) / 1000);
    const week = Array.from({ length: 7 }, (_, index) =>
      candle(monday + index * 86_400, index + 1),
    );
    const result = aggregateClosedWeeklyFromDaily(week, monday + 7 * 86_400);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      time: monday,
      open: 1,
      high: 9,
      low: 0,
      close: 8,
      volume: 280,
    });
    expect(
      aggregateClosedWeeklyFromDaily(week.filter((bar) => bar.time !== monday + 2 * 86_400), monday + 7 * 86_400),
    ).toEqual([]);
  });

  it('never emits an unfinished analytic week', () => {
    const currentWeek = Array.from({ length: 7 }, (_, index) =>
      candle(monday + index * 86_400, index + 1),
    );
    expect(aggregateClosedWeeklyFromDaily(currentWeek, monday + 6 * 86_400 + 60)).toEqual([]);
  });
});
