import { afterEach, describe, expect, it, vi } from "vitest";
import {
  recentCoinbaseWindow,
  parseRecentCoinbaseCandles,
  COINBASE_RECENT_BUCKET_LIMIT,
} from "../../server/trading/coinbase-window";
import { getCandles, retryCandles } from "../../server/trading/market";
import { prepareForecastSource } from "../../server/trading/forecast-source";

// Synthetic provider fixtures for contract/regression checks, never market evidence.
const now = Date.UTC(2026, 9, 18, 16, 0);
const step = 300;
const row = (time: number) => [time, 99, 102, 100, 101, 1];
const fifteenMinuteRow = (time: number, value: number) => [
  time,
  value - 1,
  value + 2,
  value,
  value + 0.5,
  value,
];
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("explicit recent Coinbase windows", () => {
  it("requests a trailing UTC interval below the provider's 300 bucket ceiling", () => {
    const w = recentCoinbaseWindow("BTC-USD", "5m", now);
    const url = new URL(w.url);
    expect(url.searchParams.get("granularity")).toBe("300");
    expect(Date.parse(url.searchParams.get("end")!)).toBe(now);
    expect(Date.parse(url.searchParams.get("start")!) / 1000).toBe(w.from);
    expect((w.to - w.from) / step).toBe(COINBASE_RECENT_BUCKET_LIMIT - 1);
    expect(w.to).toBe(now / 1000);
  });
  it("retains actual gaps/timestamps and excludes out-of-window rows instead of filling", () => {
    const w = recentCoinbaseWindow("BTC-USD", "5m", now);
    const times = [w.to - 8 * step, w.to - 4 * step, w.to - step];
    const actual = parseRecentCoinbaseCandles(
      [row(w.from - step), ...times.map(row), row(w.to + step)],
      w,
    );
    expect(actual.map((c) => c.time)).toEqual(times);
    expect(actual).toHaveLength(3);
  });
  it("rejects an entirely unrelated old window but does not relabel an in-window stale tail fresh", () => {
    const w = recentCoinbaseWindow("BTC-USD", "5m", now);
    expect(() =>
      parseRecentCoinbaseCandles(
        [row(w.from - 3 * step), row(w.from - 2 * step), row(w.from - step)],
        w,
      ),
    ).toThrow(/fewer than three actual bars/);
    const last = w.to - 7 * 3600;
    const old = parseRecentCoinbaseCandles(
      Array.from({ length: 16 }, (_, i) => row(last - (15 - i) * step)),
      w,
    );
    expect(() =>
      prepareForecastSource(
        {
          market: "BTC-USD",
          timeframe: "5m",
          contextMode: "current",
          feed: { source: "unit", fetchedAt: now, candles: old },
        },
        now,
      ),
    ).toThrow(/Completed source bars are stale/);
  });
  it("refuses derived resolutions and malformed products", () => {
    expect(() => recentCoinbaseWindow("BTC-USD", "30m", now)).toThrow(
      /actual lower-resolution/,
    );
    expect(() => recentCoinbaseWindow("BTC-USD", "4h", now)).toThrow(
      /actual lower-resolution/,
    );
    expect(() => recentCoinbaseWindow("BTC/USD", "5m", now)).toThrow(
      /Invalid Coinbase product/,
    );
  });
  it("forces a second same-product transport read even inside the ordinary candle cache TTL", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const urls: string[] = [];
    const fetch = vi.fn(async (input: string | URL) => {
      urls.push(String(input));
      return new Response(
        JSON.stringify(
          Array.from({ length: 20 }, (_, i) =>
            row(now / 1000 - (20 - i) * step),
          ),
        ),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetch);
    const initial = await retryCandles("SOL-USD", "5m");
    const cached = await getCandles("SOL-USD", "5m");
    expect(cached.fetchedAt).toBe(initial.fetchedAt);
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.setSystemTime(now + 1000);
    const fresh = await retryCandles("SOL-USD", "5m");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fresh.fetchedAt).toBe(now + 1000);
    for (const value of urls) {
      const url = new URL(value);
      expect(url.pathname).toBe("/products/SOL-USD/candles");
      expect(url.searchParams.has("start")).toBe(true);
      expect(url.searchParams.has("end")).toBe(true);
    }
    expect(new URL(urls[1]).searchParams.get("end")).not.toBe(
      new URL(urls[0]).searchParams.get("end"),
    );
  });

  it("aggregates exact completed 15m Coinbase periods into 30m and refreshes only the lower source", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const urls: string[] = [];
    const fetch = vi.fn(async (input: string | URL) => {
      urls.push(String(input));
      const end = now / 1_000;
      return new Response(
        JSON.stringify(
          Array.from({ length: 9 }, (_, index) =>
            fifteenMinuteRow(end - (8 - index) * 900, 100 + index),
          ),
        ),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetch);

    const initial = await retryCandles("BTC-USD", "30m");
    const cached = await getCandles("BTC-USD", "30m");
    expect(cached).toBe(initial);
    expect(initial.candles[0]).toMatchObject({
      time: now / 1_000 - 8 * 900,
      open: 100,
      high: 103,
      low: 99,
      close: 101.5,
      volume: 201,
    });
    expect(initial.candles).toHaveLength(4);
    expect(initial.candles.at(-1)?.time).toBe(now / 1_000 - 2 * 900);
    expect(initial.source).toMatch(/30m UTC aggregate from exact contiguous 15m periods/);
    expect(initial.sourceIdentity).toBe("coinbase-exchange-public-rest");
    expect(initial.sourceCadenceSeconds).toBe(1_800);
    expect(initial.volumeBasis).toBe("venue");
    expect(initial.dailyPeriodBasis).toBe("utc-continuous-24h");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(new URL(urls[0]).searchParams.get("granularity")).toBe("900");

    vi.setSystemTime(now + 1_000);
    await retryCandles("BTC-USD", "30m");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(new URL(urls[1]).searchParams.get("granularity")).toBe("900");
  });
});
