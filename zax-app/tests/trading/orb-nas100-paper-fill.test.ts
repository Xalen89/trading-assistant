import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { ORB_DEFAULT_CONFIG } from "../../lib/trading/orb-model";
const state = vi.hoisted(() => ({
  trade: undefined as any,
  writes: 0,
  now: Date.UTC(2026, 9, 19, 14, 3, 5),
  analysis: undefined as any,
}));
const stop = 97 - 0.1;
vi.mock("../../server/trading/repository", () => ({
  loadWorkspace: async () => ({ workspace: undefined }),
}));
// Actual balance verification has its own fail-closed mocked ledger tests.
vi.mock("../../server/trading/paper-balance", () => ({
  loadCanonicalPaperBalance: async () => 100_000,
}));
vi.mock("../../server/trading/setup-service", () => ({
  marketFor: async () => ({
    id: "TL:3884",
    providerSymbol: "NAS100",
    category: "Indices",
    provider: "tradelocker",
    name: "UNIT NAS100",
    pointValue: 1,
    precision: 2,
    paperSupported: true,
  }),
  readProposal: async () => ({
    id: "UNIT-NAS-FILL",
    side: "long",
    entry: 125,
    stop: 97 - 0.1,
    target: 125 + 3 * (125 - (97 - 0.1)),
    quantity: 10,
    rr: 3,
    riskPct: 1,
    initialRisk: 10 * (125 - (97 - 0.1)),
    effectiveRiskCapPct: 1,
    strategyIds: ["UNIT-ORB"],
    strategyVersions: [1],
    strategyNames: ["Unit ORB"],
    rationale: [],
    checklist: {},
    analysis: state.analysis,
  }),
}));
vi.mock("../../server/trading/market", () => ({
  getQuote: async () => ({
    symbol: "TL:3884",
    price: 125.1,
    bid: 125,
    ask: 125.1,
    timestamp: state.now / 1000,
    status: "live",
    change: 0,
    source: "UNIT quote",
  }),
}));
vi.mock("../../server/trading/setup-history", () => ({
  paperTrade: async () => {
    if (!state.trade) throw new TRPCError({ code: "NOT_FOUND" });
    return state.trade;
  },
  activePaperTrades: async () => [],
  paperHistory: async () => ({ trades: [] }),
  paperRevisions: async () => [],
  writePaperTrade: async (_u: unknown, t: any) => {
    state.writes++;
    state.trade = t;
    return t;
  },
}));
vi.mock("../../server/trading/paper-gate", () => ({
  enforceStrategyGate: () => ({}),
  paperEntryEvidence: async () => ({
    analysis: state.analysis,
    evaluations: { "UNIT-ORB": { strategyEntryEligible: true } },
    snapshots: [],
    strategies: [],
  }),
}));
import { createPaperOrder } from "../../server/trading/paper-service";
const form = {
  proposalId: "UNIT-NAS-FILL",
  entry: 125,
  stop,
  target: 125 + 3 * (125 - stop),
  quantity: 10,
  orderType: "market" as const,
  targetMode: "rr" as const,
  rr: 3,
  autoManage: false,
  entryMode: "strategy" as const,
  journal: { note: "Software-only NAS100 fill fixture" },
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(state.now);
  state.trade = undefined;
  state.writes = 0;
  state.analysis = {
    market: "TL:3884",
    timeframe: "1m",
    asOf: state.now / 1000,
    source: "UNIT closed NAS100",
    candles: [
      {
        time: state.now / 1000 - 65,
        open: 110,
        high: 127,
        low: 109,
        close: 125,
        volume: 100,
      },
    ],
    confluences: [],
    levels: [],
    candidates: [
      {
        family: "orb",
        strategyId: "UNIT-ORB",
        side: "long",
        ready: true,
        stop,
        steps: [],
      },
    ],
    orbContexts: [
      {
        strategyId: "UNIT-ORB",
        timezone: "Etc/GMT+5",
        config: {
          ...ORB_DEFAULT_CONFIG,
          marketMode: "nas100-cfd",
          instrumentMarket: "TL:3884",
          priceTick: 0.1,
        },
        instrumentMetadata: {
          market: "TL:3884",
          priceTick: 0.1,
          source: "UNIT minimum increment",
        },
        sessionLevels: [],
        missing: [],
      },
    ],
  };
});
afterEach(() => vi.useRealTimers());
describe("canonical NAS100 paper fills — unit-only no owner writes", () => {
  it("uses current ask, exact actual-source stop and3R without native tick fallback", async () => {
    const trade = await createPaperOrder({ id: 77 } as any, form);
    expect(trade.entry).toBe(125.1);
    expect(trade.stop).toBe(stop);
    expect(trade.target).toBeCloseTo(trade.entry + 3 * (trade.entry - stop), 8);
    expect(state.writes).toBe(1);
  });
  it("rejects changed broker metadata or market binding before a paper write", async () => {
    state.analysis.orbContexts[0].instrumentMetadata.priceTick = 0.25;
    await expect(createPaperOrder({ id: 77 } as any, form)).rejects.toThrow();
    expect(state.writes).toBe(0);
  });
  it("rejects edited retest stop, wrongR and expired clock without a write", async () => {
    await expect(
      createPaperOrder({ id: 77 } as any, { ...form, stop: 96 }),
    ).rejects.toThrow();
    expect(state.writes).toBe(0);
    await expect(
      createPaperOrder({ id: 77 } as any, { ...form, rr: 2 }),
    ).rejects.toThrow(/3R/);
    expect(state.writes).toBe(0);
    vi.setSystemTime(Date.UTC(2026, 9, 19, 16));
    await expect(createPaperOrder({ id: 77 } as any, form)).rejects.toThrow();
    expect(state.writes).toBe(0);
  });
});
