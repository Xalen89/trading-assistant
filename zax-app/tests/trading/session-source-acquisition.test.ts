import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  now: Date.UTC(2026, 9, 19, 8, 30, 5),
  requestedAt: 0,
  retained: [] as any[],
  calls: [] as string[],
  nonce: 0,
}));
const dailyCandles = Array.from({ length: 14 }, (_, index) => ({
  time: Date.UTC(2026, 9, 5 + index) / 1000,
  open: 100,
  high: 110,
  low: 90,
  close: 100,
  volume: 100,
}));
vi.mock("../../server/trading/access", () => ({ mayUseApp: () => true }));
vi.mock("../../server/trading/tradelocker", () => ({
  brokerOwner: () => false,
  brokerCatalog: async () => [],
}));
vi.mock("../../server/trading/repository", () => ({
  loadWorkspace: async () => ({ workspace: null }),
  dbRequired: async () => ({
    select: () => {
      const q: any = { from: () => q, where: () => q, limit: async () => [] };
      return q;
    },
  }),
}));
vi.mock("../../server/trading/setup-history", () => ({
  digest: () => String(++state.nonce),
  retainBars: async () => {},
  retainedBars: async () => state.retained,
  retainSetup: async () => {},
}));
vi.mock("../../server/trading/market", () => ({
  getQuote: async () => null,
  getCandles: async (_m: string, tf: string) => {
    state.calls.push(tf);
    const start = Date.UTC(2026, 9, 19, 5) / 1000;
    return {
      candles:
        tf === "1d"
          ? dailyCandles
          : Array.from({ length: 14 }, (_, i) => ({
              time: start + i * 900,
              open: 100,
              high: i < 12 ? 110 : 114,
              low: 90,
              close: i < 13 ? 100 : 112,
              volume: 100,
            })),
      source: "UNIT actual-source fixture",
      sourceIdentity: "UNIT",
      fetchedAt: state.now,
      requestedAt: state.requestedAt,
      timezone: "UTC",
      status: "historical",
      volumeBasis: "venue",
    };
  },
}));
vi.mock("../../server/trading/strategy-quote-observations", () => ({
  observeStrategyQuote: async () => undefined,
}));
import { setupAnalysis } from "../../server/trading/setup-service";
import { SESSION_STRATEGY_PRESETS } from "../../lib/trading/session-strategy-presets";
import { MARKETS } from "../../lib/trading/model";
const source = SESSION_STRATEGY_PRESETS[0],
  market = MARKETS.find((m) => m.provider === "coinbase")!;
const request = () => ({
  market: market.id,
  timeframe: "15m" as const,
  strategyIds: [source.id],
  strategies: [source],
  combination: "all" as const,
  timezone: "Etc/UTC",
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(state.now);
  state.requestedAt = state.now;
  state.retained = [];
  state.calls = [];
});
afterEach(() => vi.useRealTimers());
describe("source snapshot acquisition — no real DB/feed/owner order", () => {
  it("requests only the primary/range frames and preserves a genuinely completed latest bar", async () => {
    const analysis = await setupAnalysis(
      { id: 77 } as any,
      request(),
      state.now + 45_000,
      { proposalOnly: true },
    );
    expect(state.calls).toEqual(["15m", "1d", "15m"]);
    expect(analysis.candles.at(-1)?.time).toBe(
      Date.UTC(2026, 9, 19, 8, 15) / 1000,
    );
    expect(analysis.candidates.find((c) => c.side === "long")?.ready).toBe(
      true,
    );
  });
  it("does not promote a cached still-forming source bar after its wall-clock end", async () => {
    state.requestedAt = Date.UTC(2026, 9, 19, 8, 29, 59);
    const analysis = await setupAnalysis(
      { id: 77 } as any,
      request(),
      state.now + 45_000,
      { proposalOnly: true },
    );
    expect(analysis.candles.at(-1)?.time).toBe(Date.UTC(2026, 9, 19, 8) / 1000);
    expect(analysis.candidates.find((c) => c.side === "long")?.ready).toBe(
      false,
    );
  });
  it("never substitutes a later retained bar for a missing current actual source bar", async () => {
    state.requestedAt = Date.UTC(2026, 9, 19, 8, 29, 59);
    state.retained = [
      {
        time: Date.UTC(2026, 9, 19, 8, 15) / 1000,
        open: 100,
        high: 200,
        low: 90,
        close: 150,
        volume: 999,
      },
    ];
    const analysis = await setupAnalysis(
      { id: 77 } as any,
      request(),
      state.now + 45_000,
    );
    expect(analysis.candles.at(-1)?.time).toBe(Date.UTC(2026, 9, 19, 8) / 1000);
    expect(analysis.candidates.find((c) => c.side === "long")?.ready).toBe(
      false,
    );
  });
});
