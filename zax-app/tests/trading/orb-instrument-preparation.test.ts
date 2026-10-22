import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ORB_DEFAULT_CONFIG } from "../../lib/trading/orb-model";
import type { Market } from "../../lib/trading/model";
const mocks = vi.hoisted(() => ({
  owner: true,
  market: vi.fn(),
  facts: vi.fn(),
}));
vi.mock("../../server/trading/access", () => ({
  mayUseApp: () => mocks.owner,
}));
vi.mock("../../server/trading/setup-service", () => ({
  marketFor: mocks.market,
}));
vi.mock("../../server/trading/instrument-facts-service", () => ({
  instrumentFactsFor: mocks.facts,
}));
import {
  prepareOrbInstrument,
  orbInstrumentPreparationSchema,
} from "../../server/trading/orb-instrument-preparation";
const market = {
  id: "TL:3884",
  providerSymbol: "NAS100",
  provider: "tradelocker",
  category: "Indices",
  name: "NAS100 CFD",
  precision: 2,
} as Market;
const request = () => ({
  market: market.id,
  config: {
    ...ORB_DEFAULT_CONFIG,
    confirmed: false,
    marketMode: "nas100-cfd" as const,
  },
});
beforeEach(() => {
  mocks.owner = true;
  mocks.market.mockReset().mockResolvedValue(market);
  mocks.facts.mockReset().mockResolvedValue({
    market: market.id,
    providerSymbol: "NAS100",
    source: "UNIT metadata only",
    retrievedAt: Date.now(),
    tick: { value: 0.1, source: "UNIT actual increment fixture" },
    volumeBasis: "broker-reported",
    messages: [],
  });
});
afterEach(() => vi.restoreAllMocks());
describe("read-only NAS100 ORB preparation — unit fixtures, no orders or owner records", () => {
  it("accepts the actual broker EQUITY/Stocks classification only for exact NAS100", async () => {
    mocks.market.mockResolvedValue({ ...market, category: "Stocks" });
    expect(
      (await prepareOrbInstrument({ id: 77 } as any, request())).config
        .priceTick,
    ).toBe(0.1);
    mocks.market.mockResolvedValue({
      ...market,
      category: "Stocks",
      providerSymbol: "NAS100.PRO",
    });
    await expect(
      prepareOrbInstrument({ id: 77 } as any, request()),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
  it("fills only actual selected broker increment and preserves explicit approval state and source clock", async () => {
    const input = request();
    const before = JSON.stringify(input);
    const result = await prepareOrbInstrument({ id: 77 } as any, input);
    expect(result.config.priceTick).toBe(0.1);
    expect(result.config.instrumentMarket).toBe("TL:3884");
    expect(result.config.confirmed).toBe(false);
    expect(result.config.timezone).toBe("Etc/GMT+5");
    expect(result.remaining.join(" ")).toContain(
      "before separately arming paper",
    );
    expect(JSON.stringify(input)).toBe(before);
    expect(mocks.facts).toHaveBeenCalledTimes(1);
  });
  it("checks owner before market/private metadata work", async () => {
    mocks.owner = false;
    await expect(
      prepareOrbInstrument({ id: 77 } as any, request()),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.market).not.toHaveBeenCalled();
    expect(mocks.facts).not.toHaveBeenCalled();
  });
  it("does not infer absent increments from display decimals or use CME fallback", async () => {
    mocks.facts.mockResolvedValue({
      market: market.id,
      providerSymbol: "NAS100",
      source: "UNIT",
      volumeBasis: "unknown",
      messages: [],
    });
    const result = await prepareOrbInstrument({ id: 77 } as any, request());
    expect(result.config.priceTick).toBeUndefined();
    expect(result.remaining.join(" ")).toContain(
      "No CME or display-decimal tick",
    );
  });
  it("rejects Gold, crypto, futures aliases and any other broker CFD", async () => {
    for (const invalid of [
      { ...market, providerSymbol: "XAUUSD" },
      { ...market, provider: "coinbase" },
      { ...market, category: "Futures" },
      { ...market, id: "NAS100" },
      { ...market, providerSymbol: "US100" },
    ]) {
      mocks.market.mockResolvedValue(invalid);
      await expect(
        prepareOrbInstrument({ id: 77 } as any, request()),
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    }
    expect(mocks.facts).not.toHaveBeenCalled();
  });
  it("rejects mismatched provider metadata and does not silently activate CFD mode", async () => {
    await expect(
      prepareOrbInstrument({ id: 77 } as any, {
        market: market.id,
        config: ORB_DEFAULT_CONFIG,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    mocks.facts.mockResolvedValue({
      market: "TL:1",
      providerSymbol: "NAS100",
      tick: { value: 0.1 },
      messages: [],
    });
    await expect(
      prepareOrbInstrument({ id: 77 } as any, request()),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(
      orbInstrumentPreparationSchema.safeParse({
        ...request(),
        model: "arbitrary",
      }).success,
    ).toBe(false);
  });
});
