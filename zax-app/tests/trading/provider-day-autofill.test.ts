import { describe, expect, it } from "vitest";
import type { Candle } from "../../lib/trading/model";
import { resolvePreviousProviderDay } from "../../lib/trading/previous-provider-day";

const day = (dayOfMonth: number) => Date.UTC(2026, 0, dayOfMonth) / 1_000;
const candle = (
  time: number,
  open = 100,
  high = 110,
  low = 90,
  close = 105,
  volume = 0,
): Candle => ({ time, open, high, low, close, volume });

const continuous = (candles: Candle[], cutoff = day(15) + 9 * 60 * 60) =>
  resolvePreviousProviderDay({
    candles,
    basis: "utc-continuous-24h",
    cutoff,
    source: "Crypto provider daily",
  });

describe("previous provider day autofill", () => {
  it("rejects a crypto-continuous daily feed that is missing the exact previous UTC day", () => {
    const result = continuous([candle(day(13))]);
    expect(result.bar).toBeUndefined();
    expect(result.reason).toMatch(/exact immediately previous/i);

    const fractionalAsOf = continuous(
      [candle(day(14))],
      day(15) + 9 * 60 * 60 + 0.25,
    );
    expect(fractionalAsOf).toMatchObject({
      bar: { time: day(14) },
      closeAt: day(15),
    });
  });

  it("allows an observed Friday provider day on Monday only with a current UTC-day provider anchor", () => {
    const result = resolvePreviousProviderDay({
      candles: [candle(day(16), 100, 120, 80, 111), candle(day(19), 111, 115, 109, 112)],
      basis: "utc-provider-trading-days",
      cutoff: day(19) + 9 * 60 * 60,
      source: "Broker daily",
    });
    expect(result).toMatchObject({ bar: { time: day(16), close: 111 }, closeAt: day(17) });

    const missingAnchor = resolvePreviousProviderDay({
      candles: [candle(day(16), 100, 120, 80, 111)],
      basis: "utc-provider-trading-days",
      cutoff: day(19) + 9 * 60 * 60,
      source: "Broker daily",
    });
    expect(missingAnchor.bar).toBeUndefined();
    expect(missingAnchor.reason).toMatch(/current UTC provider-day anchor/i);
  });

  it("fails closed on conflicted, future, and too-old daily provider rows", () => {
    const conflicted = continuous([
      candle(day(14), 100, 110, 90, 105),
      candle(day(14), 100, 111, 90, 105),
    ]);
    expect(conflicted.reason).toMatch(/Conflicting duplicate/i);

    const future = continuous([candle(day(14)), candle(day(16))]);
    expect(future.reason).toMatch(/future UTC daily/i);

    const old = resolvePreviousProviderDay({
      candles: [candle(day(10)), candle(day(19))],
      basis: "utc-provider-trading-days",
      cutoff: day(19) + 9 * 60 * 60,
      source: "Broker daily",
    });
    expect(old.reason).toMatch(/older than seven days/i);
  });
});
