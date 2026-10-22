import { afterEach, describe, expect, it, vi } from "vitest";
import {
  aggregateClosedWeeklyFromDeclaredDaily,
  getCandles,
  getQuote,
  retryQuote,
} from "../../server/trading/market";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Coinbase read-only quote retry", () => {
  it("re-reads the timestamped ticker and never substitutes a candle close", async () => {
    const providerTime = new Date().toISOString();
    const fetch = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/ticker"))
        return new Response(
          JSON.stringify({ price: "100.25", bid: "100.20", ask: "100.30", time: providerTime }),
          { status: 200 },
        );
      if (url.endsWith("/stats"))
        return new Response(JSON.stringify({ open: "99.25" }), { status: 200 });
      return new Response(JSON.stringify({ message: "unexpected request" }), { status: 404 });
    });
    vi.stubGlobal("fetch", fetch);

    const initial = await getQuote("BTC-USD");
    const retried = await retryQuote("BTC-USD");

    expect(initial).toMatchObject({
      status: "live",
      timestampKind: "provider",
      timestamp: Date.parse(providerTime) / 1_000,
      source: expect.stringMatching(/public REST/),
    });
    expect(retried).toMatchObject({ status: "live", price: 100.25 });
    expect(fetch.mock.calls.filter(([url]) => String(url).endsWith("/ticker"))).toHaveLength(2);
    expect(fetch.mock.calls.some(([url]) => String(url).includes("/candles"))).toBe(false);
  });

  it("refuses a derived frame when the source has no declared session periods", async () => {
    vi.stubEnv("FMP_API_KEY", "unit-read-only-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify([
        { timestamp: 1_700_000_000, open: 100, high: 101, low: 99, close: 100, volume: 1 },
        { timestamp: 1_700_003_600, open: 100, high: 101, low: 99, close: 100, volume: 1 },
        { timestamp: 1_700_007_200, open: 100, high: 101, low: 99, close: 100, volume: 1 },
      ]), { status: 200 })),
    );

    await expect(getCandles("AAPL", "4h")).rejects.toThrow(
      /no declared session metadata/i,
    );
  });

  it("aggregates a declared five-day UTC session but omits a week with one real missing day", () => {
    const monday = Date.UTC(2024, 0, 1) / 1_000;
    const weekdays = [1, 2, 3, 4, 5];
    const daily = weekdays.map((weekday, index) => {
      const value = 100 + index;
      return {
        time: monday + (weekday - 1) * 86_400,
        open: value,
        high: value + 1,
        low: value - 1,
        close: value + 0.5,
        volume: 10,
      };
    });
    const now = monday + 7 * 86_400;
    expect(aggregateClosedWeeklyFromDeclaredDaily(daily, now, weekdays)).toMatchObject([
      { time: monday, open: 100, close: 104.5, volume: 50 },
    ]);
    expect(
      aggregateClosedWeeklyFromDeclaredDaily(
        daily.filter((bar) => bar.time !== monday + 2 * 86_400),
        now,
        weekdays,
      ),
    ).toEqual([]);
  });
});
