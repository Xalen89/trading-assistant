import { describe, it, expect } from "vitest";
import {
  quantStarter,
  QUANT_PURPOSE,
} from "../../lib/trading/quant-workbench-config";
import { quantRequestSchema } from "../../server/trading/quant-request";
import type { QuantFamily } from "../../lib/trading/quant-lab-types";
describe("Workbench input configuration — no market data/edge fixture", () => {
  for (const family of [
    "pairs",
    "momentum",
    "making",
    "macro",
    "ml",
  ] as QuantFamily[])
    it(`${family} starter meets the actual router schema without a chart selection`, () => {
      const s = quantStarter(family);
      expect(quantRequestSchema.safeParse({ family, ...s }).success).toBe(true);
      expect(QUANT_PURPOSE[family].question.length).toBeGreaterThan(20);
      expect(QUANT_PURPOSE[family].next.length).toBeGreaterThan(20);
    });
  it("does not carry two pair assets into one-product venue or ML forms", () => {
    expect(quantStarter("making").symbols).toHaveLength(1);
    expect(quantStarter("ml").symbols).toHaveLength(1);
  });
  it("rejects the old one-asset intraday macro default", () => {
    expect(
      quantRequestSchema.safeParse({
        family: "macro",
        ...quantStarter("macro"),
        symbols: ["BTC-USD"],
        timeframe: "5m",
      }).success,
    ).toBe(false);
  });
  it("rejects zero equity, lookback2 and excessive holding periods consistently", () => {
    for (const patch of [
      { startingEquity: 0 },
      { lookback: 2 },
      { holdingBars: 101 },
    ])
      expect(
        quantRequestSchema.safeParse({
          family: "pairs",
          ...quantStarter("pairs"),
          settings: { ...quantStarter("pairs").settings, ...patch },
        }).success,
      ).toBe(false);
  });
  it("returns fresh settings rather than shared mutable source defaults", () => {
    const a = quantStarter("making");
    a.settings.inventory = 100;
    expect(quantStarter("making").settings.inventory).toBe(0);
  });
  it("rejects pair diagnostic windows under30 and classifier horizons above20", () => {
    for (const [family, patch] of [
      ["pairs", { lookback: 29 }],
      ["ml", { holdingBars: 21 }],
      ["momentum", { lookback: 253 }],
    ] as const) {
      const starter = quantStarter(family);
      expect(
        quantRequestSchema.safeParse({
          family,
          ...starter,
          settings: { ...starter.settings, ...patch },
        }).success,
      ).toBe(false);
    }
  });
  it("keeps direct making requests within the same absolute inventory cap as the form", () => {
    const starter = quantStarter("making");
    for (const inventory of [-0.11, 0.11])
      expect(
        quantRequestSchema.safeParse({
          family: "making",
          ...starter,
          settings: { ...starter.settings, inventory, maxInventory: 0.1 },
        }).success,
      ).toBe(false);
    expect(
      quantRequestSchema.safeParse({
        family: "making",
        ...starter,
        settings: { ...starter.settings, inventory: -0.1, maxInventory: 0.1 },
      }).success,
    ).toBe(true);
  });
});

// Regression: every offered validation mode reaches an implemented model path.
it("rejects removed unimplemented purged-kfold mode", () => {
  const starter = quantStarter("ml");
  expect(
    quantRequestSchema.safeParse({
      family: "ml",
      ...starter,
      settings: { ...starter.settings, validationMode: "purged-kfold" },
    }).success,
  ).toBe(false);
});
