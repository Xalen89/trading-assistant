import { describe, expect, it } from "vitest";
import { tradeMetrics } from "../../lib/trading/engine";
import type { Market } from "../../lib/trading/model";
import {
  paperFormGeometryError,
  paperFormRiskReward,
  paperTargetAtR,
  parsePaperFormValues,
} from "../../lib/trading/paper-form";

const cashMarket: Market = {
  id: "UNIT",
  name: "Unit market",
  category: "Crypto",
  provider: "coinbase",
  providerSymbol: "UNIT-USD",
  precision: 2,
  pointValue: 1,
};

const yenMarket: Market = {
  ...cashMarket,
  id: "USDJPY",
  name: "USD / Japanese Yen",
  providerSymbol: "USDJPY",
  precision: 3,
  valuationSymbol: "USDJPY",
};

describe("paper form validation", () => {
  it.each([
    ["long", 100, 95],
    ["short", 100, 105],
  ] as const)("accepts an explicit positive 1R %s bracket", (side, entry, stop) => {
    const target = paperTargetAtR({
      market: cashMarket,
      side,
      entry,
      stop,
      rr: 1,
    });
    expect(target).toBeDefined();
    expect(
      paperFormGeometryError({
        market: cashMarket,
        side,
        entry,
        stop,
        target: target!,
        quantity: 1,
      }),
    ).toBeNull();
  });

  it("uses exact USDJPY inverse valuation when solving a custom RR target", () => {
    const target = paperTargetAtR({
      market: yenMarket,
      side: "long",
      entry: 150,
      stop: 149,
      rr: 3,
    });
    expect(target).toBeGreaterThan(153);
    const rr = tradeMetrics({
      market: yenMarket.id,
      valuationSymbol: yenMarket.valuationSymbol,
      side: "long",
      entry: 150,
      stop: 149,
      target: target!,
      quantity: 1,
      pointValue: yenMarket.pointValue,
    }).rr;
    expect(rr).toBeCloseTo(3, 10);
    expect(
      paperFormGeometryError({
        market: yenMarket,
        side: "long",
        entry: 150,
        stop: 149,
        target: target!,
        quantity: 1,
      }),
    ).toBeNull();
  });

  it("does not invoke target math for an invalid numeric draft", () => {
    const values = parsePaperFormValues({
      entry: "not-a-price",
      stop: "95",
      target: "110",
      quantity: "1",
    });
    expect(() =>
      paperFormGeometryError({
        market: cashMarket,
        side: "long",
        ...values,
      }),
    ).not.toThrow();
    expect(
      paperFormGeometryError({
        market: cashMarket,
        side: "long",
        ...values,
      }),
    ).toBe("Enter positive finite entry, stop, target and size values.");
    expect(
      paperTargetAtR({
        market: cashMarket,
        side: "long",
        entry: values.entry,
        stop: values.stop,
        rr: 2,
      }),
    ).toBeUndefined();
  });

  it("reports the actual positive RR for direct targets below the old 2R floor", () => {
    const rr = paperFormRiskReward({
      market: cashMarket,
      side: "long",
      entry: 100,
      stop: 90,
      target: 110,
      quantity: 1,
    });
    expect(rr).toBeCloseTo(1);
    expect(
      paperFormGeometryError({
        market: cashMarket,
        side: "long",
        entry: 100,
        stop: 90,
        target: 110,
        quantity: 1,
      }),
    ).toBeNull();
  });
});
