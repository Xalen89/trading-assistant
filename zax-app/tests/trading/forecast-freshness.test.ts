import { describe, expect, it } from "vitest";
import { generateAIPriceForecast } from "../../server/trading/forecast-service";

const HOUR = 3_600;

describe("forecast shared freshness precondition", () => {
  it("rejects a stale source receipt before model discovery or prompt invocation", async () => {
    const now = Math.floor(Date.now() / 1_000);
    const candles = Array.from({ length: 20 }, (_, index) => {
      const value = 100 + index;
      return {
        time: now - (20 - index) * HOUR,
        open: value,
        high: value + 1,
        low: value - 1,
        close: value,
        volume: 1,
      };
    });
    await expect(
      generateAIPriceForecast({
        market: "BTC-USD",
        timeframe: "1h",
        feed: {
          candles,
          source: "unit source",
          fetchedAt: (now - 2 * HOUR - 1) * 1_000,
          sourceCadenceSeconds: HOUR,
        },
        quote: {
          symbol: "BTC-USD",
          price: 120,
          change: 0,
          timestamp: now,
          timestampKind: "provider",
          source: "unit quote",
          status: "live",
        },
      }),
    ).rejects.toThrow(/source bars are stale:.*receipt/i);
  });
});
