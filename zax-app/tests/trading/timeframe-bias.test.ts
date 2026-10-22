import { describe, expect, it } from "vitest";
import type { User } from "../../drizzle/schema";
import type { Candle } from "../../lib/trading/model";
import { aggregateClosedWeeklyFromDaily } from "../../lib/trading/timeframes";
import {
  MIN_TIMEFRAME_BIAS_BARS,
  TIMEFRAME_BIAS_TIMEFRAMES,
  deriveTimeframeBias,
  type TimeframeBiasTimeframe,
} from "../../lib/trading/timeframe-bias";
import { fetchTimeframeBias } from "../../server/trading/bias-router";

const MINUTE = 60;
const NOW = 2_000_000_000;

function syntheticCandles(
  closes: number[],
  timeframeSeconds = MINUTE,
  endAt = NOW - timeframeSeconds,
): Candle[] {
  const first = endAt - (closes.length - 1) * timeframeSeconds;
  return closes.map((close, index) => ({
    time: first + index * timeframeSeconds,
    open: close,
    high: close + 0.5,
    low: close - 0.5,
    close,
    volume: 10 + index,
  }));
}

function syntheticTrend(start: number, step: number, length = 70) {
  return Array.from({ length }, (_, index) => start + index * step);
}

function derive(
  candles: Candle[],
  timeframe: TimeframeBiasTimeframe = "1m",
  now = NOW,
) {
  return deriveTimeframeBias({
    timeframe,
    candles,
    provider: "synthetic",
    source: "synthetic fixture",
    asOf: now * 1000,
    now,
  });
}

describe("timeframe bias completed-bar classifier", () => {
  it("synthetic no-forming/future fixture excludes the current and future bars before deriving", () => {
    const completed = syntheticCandles(syntheticTrend(100, 1));
    const forming: Candle = {
      ...completed.at(-1)!,
      time: NOW - 30,
      open: 9_999,
      high: 10_000,
      low: 9_998,
      close: 9_999,
    };
    const future: Candle = { ...forming, time: NOW + MINUTE, close: 0.01 };
    const baseline = derive(completed);
    const result = derive([...completed, forming, future]);

    expect(baseline.status).toBe("bullish");
    expect(result.status).toBe("bullish");
    expect(result.latestClosedBar).toBe(baseline.latestClosedBar);
    expect(result.values).toEqual(baseline.values);
    expect(result.completedBars).toBe(completed.length);
    expect(result.warnings.join(" ")).toContain("forming or future");
  });

  it("synthetic rising fixture requires price alignment and a rising EMA20 for bullish", () => {
    const result = derive(syntheticCandles(syntheticTrend(100, 1)));
    expect(result.status).toBe("bullish");
    expect(result.values).toMatchObject({
      close: expect.any(Number),
      ema20: expect.any(Number),
      ema50: expect.any(Number),
      ema20FiveBarsAgo: expect.any(Number),
    });
    expect(result.values!.close).toBeGreaterThan(result.values!.ema20);
    expect(result.values!.ema20).toBeGreaterThan(result.values!.ema50);
    expect(result.values!.ema20).toBeGreaterThan(
      result.values!.ema20FiveBarsAgo,
    );
  });

  it("synthetic ambiguity/neutral fixture does not force a binary direction", () => {
    const closes = syntheticTrend(100, 1).map((value, index) =>
      index > 64 ? 100 : value,
    );
    const result = derive(syntheticCandles(closes));
    expect(result.status).toBe("neutral");
    expect(result.warnings.join(" ")).toContain("mixed or tied");
  });

  it("synthetic insufficient fixture reports the exact completed-bar requirement", () => {
    const result = derive(
      syntheticCandles(syntheticTrend(100, 1, MIN_TIMEFRAME_BIAS_BARS - 1)),
    );
    expect(result.status).toBe("insufficient");
    expect(result.completedBars).toBe(MIN_TIMEFRAME_BIAS_BARS - 1);
    expect(result.warnings.join(" ")).toContain(
      `${MIN_TIMEFRAME_BIAS_BARS} completed bars`,
    );
  });

  it("synthetic higher-frames fixture keeps each supported frame independently labelled", () => {
    const expected = ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"];
    expect(TIMEFRAME_BIAS_TIMEFRAMES).toEqual(expected);
    for (const timeframe of TIMEFRAME_BIAS_TIMEFRAMES) {
      const seconds =
        timeframe === "1m"
          ? 60
          : timeframe === "5m"
            ? 300
            : timeframe === "15m"
              ? 900
              : timeframe === "30m"
                ? 1_800
                : timeframe === "1h"
                  ? 3_600
                  : timeframe === "4h"
                    ? 14_400
                    : timeframe === "1d"
                      ? 86_400
                      : 604_800;
      const now = Math.max(NOW, seconds * 100);
      const result = derive(
        syntheticCandles(syntheticTrend(100, 1), seconds, now - seconds),
        timeframe,
        now,
      );
      expect(result.timeframe).toBe(timeframe);
      expect(result.status).toBe("bullish");
      expect(result.latestClosedBar! + seconds).toBeLessThanOrEqual(now);
    }
  });

  it("synthetic higher-frames weekly fixture uses the existing Monday UTC cutoff and omits a forming week", () => {
    const day = 86_400;
    const week = day * 7;
    const monday = Date.UTC(2024, 0, 1) / 1000;
    const closedDays = Array.from({ length: 56 * 7 }, (_, index) => ({
      time: monday + index * day,
      open: 100 + index,
      high: 101 + index,
      low: 99 + index,
      close: 100 + index,
      volume: 1,
    }));
    const now = monday + 56 * week + day;
    const formingWeekDay = {
      ...closedDays.at(-1)!,
      time: monday + 56 * week,
      close: 9_999,
    };
    const weekly = aggregateClosedWeeklyFromDaily(
      [...closedDays, formingWeekDay],
      now,
    );
    const result = derive(weekly, "1w", now);

    expect(weekly).toHaveLength(56);
    expect(weekly.at(-1)?.time).toBe(monday + 55 * week);
    expect(result.status).toBe("bullish");
    expect(result.latestClosedBar).toBe(monday + 55 * week);
  });

  it("synthetic router fixture injects 1w candles without invoking runtime 900-day history", async () => {
    const calls: string[] = [];
    const now = Date.now() / 1000;
    const candles = syntheticCandles(
      syntheticTrend(100, 1),
      MINUTE,
      now - MINUTE,
    );
    const result = await fetchTimeframeBias("BTC-USD", {} as User, {
      getCandlesFor: async (_market, timeframe) => {
        calls.push(timeframe);
        return {
          candles,
          source: "synthetic injected feed",
          fetchedAt: Date.now(),
          timezone: "UTC",
          status: "historical",
        };
      },
    });

    expect(calls).toEqual(TIMEFRAME_BIAS_TIMEFRAMES);
    expect(result.rows.find((row) => row.timeframe === "1w")?.source).toBe(
      "synthetic injected feed",
    );
  });

  it("uses the immutable request/feed cutoff for completion while freshness uses receipt time", async () => {
    const requestStartedAt = Date.now();
    const requestSeconds = requestStartedAt / 1_000;
    let clockCalls = 0;
    const completed = syntheticCandles(
      syntheticTrend(100, 1),
      MINUTE,
      requestSeconds - MINUTE,
    );
    const returned = [
      ...completed,
      {
        ...completed.at(-1)!,
        time: requestSeconds - 30,
        open: 9_998,
        high: 10_000,
        low: 9_997,
        close: 9_999,
      },
    ];

    const result = await fetchTimeframeBias("BTC-USD", {} as User, {
      now: () =>
        clockCalls++ === 0 ? requestStartedAt : requestStartedAt + 60_000,
      getCandlesFor: async () => ({
        candles: returned,
        source: "slow synthetic feed",
        requestedAt: requestStartedAt,
        fetchedAt: requestStartedAt + 60_000,
        timezone: "UTC",
        status: "historical",
        sourceCadenceSeconds: MINUTE,
      }),
    });

    const minuteRow = result.rows.find((row) => row.timeframe === "1m")!;
    expect(minuteRow.latestClosedBar).toBe(requestSeconds - MINUTE);
    expect(minuteRow.warnings.join(" ")).toContain("forming or future");
  });

  it("synthetic stale fixture is explicit rather than retaining a historical binary signal", () => {
    const oldEnd = NOW - 10_000;
    const result = derive(
      syntheticCandles(syntheticTrend(100, 1), MINUTE, oldEnd),
    );
    expect(result.status).toBe("stale");
    expect(result.values).toBeUndefined();
    expect(result.warnings.join(" ")).toContain("freshness limit");
  });

  it("synthetic falling fixture classifies the symmetric completed-bar condition as bearish", () => {
    const result = derive(syntheticCandles(syntheticTrend(500, -1)));
    expect(result.status).toBe("bearish");
    expect(result.values!.close).toBeLessThan(result.values!.ema20);
    expect(result.values!.ema20).toBeLessThan(result.values!.ema50);
    expect(result.values!.ema20).toBeLessThan(result.values!.ema20FiveBarsAgo);
  });
});
