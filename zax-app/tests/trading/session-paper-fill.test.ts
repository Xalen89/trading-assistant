import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
const state = vi.hoisted(() => ({
  trade: undefined as any,
  writes: 0,
  now: Date.UTC(2026, 9, 19, 8, 30, 1),
  config: {
    version: 1,
    confirmed: true,
    timezone: "Etc/GMT+5",
    family: "london-breakout",
    executionTimeframe: "15m",
    stopMode: "midpoint",
    targetMode: "2r",
  },
  analysis: undefined as any,
}));
vi.mock("../../server/trading/repository", () => ({
  loadWorkspace: async () => ({ workspace: undefined }),
}));
// This fixture tests source geometry; canonical ledger completeness is tested
// separately in paper-balance.test.ts. No real workspace/ledger is queried.
vi.mock("../../server/trading/paper-balance", () => ({
  loadCanonicalPaperBalance: async () => 10_000,
}));
vi.mock("../../server/trading/setup-service", () => ({
  marketFor: async () => ({
    id: "UNIT",
    name: "Unit",
    pointValue: 1,
    precision: 2,
    paperSupported: true,
  }),
  readProposal: async () => ({
    id: "UNIT-FILL",
    side: "long",
    entry: 100,
    stop: 90,
    target: 120,
    quantity: 10,
    rr: 2,
    riskPct: 1,
    initialRisk: 100,
    effectiveRiskCapPct: 1,
    strategyIds: ["UNIT-LONDON"],
    strategyVersions: [1],
    strategyNames: ["Unit London"],
    rationale: [],
    checklist: {},
    analysis: state.analysis,
  }),
}));
vi.mock("../../server/trading/market", () => ({
  getQuote: async () => ({
    symbol: "UNIT",
    price: 101,
    bid: 100.9,
    ask: 101,
    timestamp: state.now / 1000,
    status: "live",
    change: 0,
    source: "Synthetic unit quote",
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
    evaluations: { "UNIT-LONDON": { strategyEntryEligible: true } },
    snapshots: [],
    strategies: [],
  }),
}));
import { createPaperOrder } from "../../server/trading/paper-service";
const form = {
  proposalId: "UNIT-FILL",
  entry: 100,
  stop: 90,
  target: 120,
  quantity: 10,
  orderType: "market" as const,
  targetMode: "price" as const,
  autoManage: false,
  entryMode: "strategy" as const,
  journal: { note: "Software-only source fill fixture" },
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(state.now);
  state.trade = undefined;
  state.writes = 0;
  state.analysis = {
    market: "UNIT",
    timeframe: "15m",
    asOf: state.now / 1000,
    source: "Synthetic unit bars",
    strategyIds: ["UNIT-LONDON"],
    strategyVersions: [1],
    strategyNames: ["Unit London"],
    candles: [
      {
        time: state.now / 1000 - 901,
        open: 99,
        high: 101,
        low: 98,
        close: 100.5,
        volume: 100,
      },
    ],
    confluences: [],
    levels: [],
    candidates: [
      {
        family: "london-breakout",
        strategyId: "UNIT-LONDON",
        side: "long",
        ready: true,
        stop: 90,
        steps: [],
      },
    ],
    sessionContexts: [
      {
        strategyId: "UNIT-LONDON",
        family: "london-breakout",
        config: state.config,
        range: {
          high: 100,
          low: 80,
          midpoint: 90,
          startAt: state.now / 1000 - 12600,
          endAt: state.now / 1000 - 1800,
          source: "Synthetic",
          basis: "complete-15m-window",
        },
      },
    ],
  };
});
afterEach(() => vi.useRealTimers());
describe("canonical source fills — mocked paper lifecycle only", () => {
  it("preserves selected2R and source midpoint at actual bid/ask rather than leaving a spread-distorted generic target", async () => {
    const trade = await createPaperOrder({ id: 77 } as any, form);
    expect(trade.entry).toBe(101);
    expect(trade.stop).toBe(90);
    expect(trade.target).toBe(trade.entry + 2 * (trade.entry - trade.stop));
    expect(state.writes).toBe(1);
  });
  it("rejects edited source stop and target without any paper write", async () => {
    await expect(
      createPaperOrder({ id: 77 } as any, { ...form, stop: 89 }),
    ).rejects.toThrow(/source stop/);
    expect(state.writes).toBe(0);
    await expect(
      createPaperOrder({ id: 77 } as any, { ...form, target: 119 }),
    ).rejects.toThrow(/source target/);
    expect(state.writes).toBe(0);
  });
  it("rejects source pending-limit overrides but leaves explicit manual practice available", async () => {
    await expect(
      createPaperOrder({ id: 77 } as any, { ...form, orderType: "limit" }),
    ).rejects.toThrow(/manual practice/);
    expect(state.writes).toBe(0);
  });
  it("requires the actual source entry clock, not an old ready flag", async () => {
    vi.setSystemTime(Date.UTC(2026, 9, 19, 7));
    await expect(createPaperOrder({ id: 77 } as any, form)).rejects.toThrow();
    expect(state.writes).toBe(0);
  });
});
