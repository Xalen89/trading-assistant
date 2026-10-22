import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import type { User } from "../../drizzle/schema";
import type { Candle, Market, Timeframe } from "../../lib/trading/model";
import type { InstrumentFacts } from "../../lib/trading/instrument-setup-types";
import type { CandleFeed } from "../../server/trading/market";
import type { InstrumentPreparationDependencies } from "../../server/trading/instrument-preparation";
import {
  PIVOT_DEFAULT_CONFIG,
  IB_DEFAULT_CONFIG,
} from "../../lib/trading/session-strategy-model";
vi.mock("../../server/trading/access", () => ({
  mayUseApp: (u: User) => u.id === 1,
}));
vi.mock("../../server/trading/setup-service", () => ({ marketFor: vi.fn() }));
vi.mock("../../server/trading/instrument-facts-service", () => ({
  instrumentFactsFor: vi.fn(),
}));
vi.mock("../../server/trading/market", () => ({ getCandles: vi.fn() }));
import { prepareInstrument } from "../../server/trading/instrument-preparation";

const now = Date.parse("2026-10-19T15:00:00Z");
const day = 86400;
const seconds = now / 1000;
const currentDay = Math.floor(seconds / day) * day;
const user = { id: 1 } as User;
const market: Market = {
  id: "BTC-USD",
  provider: "coinbase",
  providerSymbol: "UNIT-USD",
  category: "Crypto",
  name: "Unit-only metadata fixture",
  precision: 2,
  pointValue: 1,
  paperSupported: true,
};
const bar = (time: number, volume = 10): Candle => ({
  time,
  open: 100,
  high: 110,
  low: 90,
  close: 101,
  volume,
});
function deps(broker = false): InstrumentPreparationDependencies {
  return {
    marketFor: vi.fn(
      async (): Promise<Market> => ({
        ...market,
        provider: broker ? "tradelocker" : "coinbase",
      }),
    ),
    facts: vi.fn(
      async (): Promise<InstrumentFacts> => ({
        market: "BTC-USD",
        providerSymbol: "UNIT-USD",
        source: "UNIT fixture metadata",
        retrievedAt: now,
        tick: { value: 0.01, source: "UNIT actual-increment fixture" },
        volumeBasis: broker ? "broker-reported" : "venue",
        dailyBasis: broker ? "utc-provider-trading-days" : "utc-continuous-24h",
        messages: [],
      }),
    ),
    candles: vi.fn(
      async (_id: string, tf: Timeframe): Promise<CandleFeed> => ({
        candles:
          tf === "1d"
            ? [bar(currentDay - day), bar(currentDay)]
            : Array.from({ length: 24 }, (_, i) =>
                bar(seconds - (24 - i) * 60),
              ),
        source: "UNIT fixture",
        sourceIdentity: "unit-private-test",
        requestedAt: now,
        fetchedAt: now,
        timezone: "UTC fixture",
        status: "historical",
        volumeBasis: broker ? "broker-reported" : "venue",
        dailyPeriodBasis: broker
          ? "utc-provider-trading-days"
          : "utc-continuous-24h",
      }),
    ),
  };
}
describe("instrument preparation — unit-only metadata fixtures, no owner writes/orders", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });
  afterEach(() => vi.useRealTimers());
  it("fills verified missing tick/PDC/dynamic key mode but never fabricates target price fields", async () => {
    const result = await prepareInstrument(
      user,
      { market: "BTC-USD", config: PIVOT_DEFAULT_CONFIG },
      deps(),
    );
    expect(result.config).toMatchObject({
      instrumentMarket: "BTC-USD",
      priceTick: 0.01,
      pdcBasis: "provider-utc-day",
      targetMode: "previous-day-extremes",
    });
    expect(result.config).not.toHaveProperty("longTargetPrice");
    expect(result.previousDay).toMatchObject({
      close: 101,
      high: 110,
      low: 90,
      barAt: currentDay - day,
    });
    expect(result.status).toBe("ready");
    expect(PIVOT_DEFAULT_CONFIG).toMatchObject({
      pdcBasis: "unselected",
      targetMode: "owner-key-levels",
    });
  });
  it("preserves personal tick/session-close/targets rather than silently overwriting", async () => {
    const config = {
      ...PIVOT_DEFAULT_CONFIG,
      priceTick: 0.02,
      pdcBasis: "declared-session-close" as const,
      sessionCloseMinute: 960,
      longTargetPrice: 120,
      shortTargetPrice: 80,
    };
    const result = await prepareInstrument(
      user,
      { market: "BTC-USD", config },
      deps(),
    );
    expect(result.config).toMatchObject(config);
    expect(result.warnings.join(" ")).toMatch(/preserved/);
  });
  it("clears an auto tick belonging to a changed market and binds new detected data", async () => {
    const result = await prepareInstrument(
      user,
      {
        market: "BTC-USD",
        config: {
          ...PIVOT_DEFAULT_CONFIG,
          instrumentMarket: "OTHER",
          priceTick: 2,
        },
      },
      deps(),
    );
    expect(result.config).toMatchObject({
      instrumentMarket: "BTC-USD",
      priceTick: 0.01,
    });
  });
  it("uses documented provider trading days but never silently opts into broker proxy", async () => {
    const result = await prepareInstrument(
      user,
      { market: "BTC-USD", config: PIVOT_DEFAULT_CONFIG },
      deps(true),
    );
    expect(result.config).toMatchObject({
      pdcBasis: "provider-utc-trading-day",
    });
    expect(result.config).not.toHaveProperty("volumePolicy");
    expect(result.status).toBe("partial");
    expect(result.choices.join(" ")).toMatch(/deliberately choose/);
  });
  it("honors explicitly chosen proxy while keeping its provenance non-venue", async () => {
    const result = await prepareInstrument(
      user,
      {
        market: "BTC-USD",
        config: {
          ...PIVOT_DEFAULT_CONFIG,
          volumePolicy: "broker-reported-proxy",
        },
      },
      deps(true),
    );
    expect(result.volumeSample.basis).toBe("broker-reported");
    expect(result.status).toBe("ready");
  });
  it("zero broker readings stay partial even with explicit proxy", async () => {
    const d = deps(true);
    const read = d.candles;
    d.candles = vi.fn(async (m, tf, u, end) => {
      const feed = await read(m, tf, u, end);
      return {
        ...feed,
        candles: feed.candles.map((c) => ({ ...c, volume: 0 })),
      };
    });
    const result = await prepareInstrument(
      user,
      {
        market: "BTC-USD",
        config: {
          ...PIVOT_DEFAULT_CONFIG,
          volumePolicy: "broker-reported-proxy",
        },
      },
      d,
    );
    expect(result.status).toBe("partial");
    expect(result.choices.join(" ")).toMatch(/missing\/zero/);
  });
  it("does not derive a tick from display decimals or use alternate metadata on failure", async () => {
    const d = deps();
    d.facts = vi.fn(async () => {
      throw new Error("UNIT metadata unavailable");
    });
    const result = await prepareInstrument(
      user,
      { market: "BTC-USD", config: PIVOT_DEFAULT_CONFIG },
      d,
    );
    expect(result.config).not.toHaveProperty("priceTick");
    expect(result.choices.join(" ")).toMatch(/safe price tick/);
  });
  it("rejects mismatched metadata identity before producing an applicable config", async () => {
    const d = deps();
    const facts = d.facts;
    d.facts = vi.fn(async (u, m, end) => ({
      ...(await facts(u, m, end)),
      market: "OTHER",
    }));
    await expect(
      prepareInstrument(
        user,
        { market: "BTC-USD", config: PIVOT_DEFAULT_CONFIG },
        d,
      ),
    ).rejects.toThrow(/do not match/);
  });
  it("rejects unauthorized users before any metadata/candle access", async () => {
    const d = deps();
    await expect(
      prepareInstrument(
        { id: 2 } as User,
        { market: "BTC-USD", config: IB_DEFAULT_CONFIG },
        d,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(d.marketFor).not.toHaveBeenCalled();
    expect(d.candles).not.toHaveBeenCalled();
  });
});
