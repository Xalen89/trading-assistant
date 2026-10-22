import { describe, expect, it } from "vitest";
import { prepareForecastSource } from "../../server/trading/forecast-source";

const MINUTE = 60;
const period = 15 * MINUTE;
const now = 1_800_000_000_000;

function bars(lastOpen: number) {
  return Array.from({ length: 16 }, (_, index) => {
    const value = 100 + index;
    return {
      time: lastOpen - (15 - index) * period,
      open: value,
      high: value + 1,
      low: value - 1,
      close: value,
      volume: 1,
    };
  });
}

describe("forecast source context preparation", () => {
  it("keeps current context strict and gives a stale-bar recovery route with close time and age", () => {
    const lastOpen = now / 1_000 - 3 * 60 * MINUTE;
    expect(() =>
      prepareForecastSource(
        {
          market: "BTC-USD",
          timeframe: "15m",
          feed: {
            candles: bars(lastOpen),
            source: "unit source",
            fetchedAt: now,
            sourceCadenceSeconds: period,
            // This declared fact must not waive the shared stale-bar policy.
            session: {
              coverage: "declared",
              timezone: "UTC",
              calendarState: "closed",
            },
          },
          quote: {
            symbol: "BTC-USD",
            price: 115,
            change: 0,
            timestamp: now / 1_000,
            source: "unit quote",
            status: "live",
          },
        },
        now,
      ),
    ).toThrow(
      /Completed source bars are stale:.*Last completed bar closed at .*age .*available-history mode/i,
    );
  });

  it("allows an explicitly requested old context with a completed-bar anchor and no quote", () => {
    const lastOpen = now / 1_000 - 3 * 60 * MINUTE;
    const prepared = prepareForecastSource(
      {
        market: "BTC-USD",
        timeframe: "15m",
        contextMode: "last-available",
        feed: {
          candles: bars(lastOpen),
          source: "unit source",
          fetchedAt: now,
          sourceCadenceSeconds: period,
          session: {
            coverage: "unknown",
            timezone: "UTC",
            calendarState: "unknown",
          },
        },
      },
      now,
    );

    expect(prepared).toMatchObject({
      contextMode: "last-available",
      anchor: { time: lastOpen },
      sourceFreshness: {
        status: "stale",
        closedAt: lastOpen + period,
        ageSeconds: 3 * 60 * MINUTE - period,
        fetchedAt: now,
      },
    });
    expect(prepared.currentQuote).toBeUndefined();
    expect(prepared.closed).toHaveLength(16);
  });

  it("does not allow a stale quote to pass strict current mode even when completed bars are fresh", () => {
    const lastOpen = now / 1_000 - period;
    expect(() =>
      prepareForecastSource(
        {
          market: "BTC-USD",
          timeframe: "15m",
          feed: {
            candles: bars(lastOpen),
            source: "unit source",
            fetchedAt: now,
            sourceCadenceSeconds: period,
          },
          quote: {
            symbol: "BTC-USD",
            price: 115,
            change: 0,
            timestamp: now / 1_000 - 121,
            source: "unit quote",
            status: "live",
          },
        },
        now,
      ),
    ).toThrow(
      /current timestamped live quote:.*No candle close was used as a substitute quote.*available-history mode/i,
    );
  });
});
