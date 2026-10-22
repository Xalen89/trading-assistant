import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  tradingPaperProposals,
  tradingPaperTrades,
} from "../../drizzle/schema";
import { ORB_STRATEGY } from "../../lib/trading/orb-presets";
import {
  initialWorkspace,
  MARKETS,
  type Candle,
  type Trade,
} from "../../lib/trading/model";
import { analyzeSetups } from "../../lib/trading/setup-engine";
import { draftConfluence } from "../../lib/trading/confluence-runtime";
import { tradeMetrics } from "../../lib/trading/engine";

// No live DB/provider/owner record. Simulates distinct pool connections and committed visibility.
const state = vi.hoisted(() => ({
  db: undefined as any,
  workspace: undefined as any,
  nextWorkspace: undefined as any,
  analysis: undefined as any,
  market: undefined as any,
  quote: undefined as any,
  proposals: new Map<string, any>(),
  trades: [] as any[],
  locks: [] as string[],
  acquired: true,
  orderCalls: 0,
  sourceCalls: 0,
  sourceMarkets: [] as string[],
  loadCalls: 0,
}));
vi.mock("../../server/trading/access", () => ({ mayUseApp: () => true }));
vi.mock("../../server/trading/repository", () => ({
  dbRequired: async () => state.db,
  loadWorkspace: async () => ({
    workspace:
      state.loadCalls++ > 0 && state.nextWorkspace
        ? state.nextWorkspace
        : state.workspace,
  }),
}));
vi.mock("../../server/trading/setup-history", () => ({
  activePaperTrades: async () => state.trades,
}));
vi.mock("../../server/trading/setup-service", () => ({
  marketFor: async () => state.market,
  setupAnalysis: async (_user: unknown, request: { market: string }) => {
    state.sourceCalls++;
    state.sourceMarkets.push(request.market);
    return state.analysis;
  },
}));
vi.mock("../../server/trading/market", () => ({
  getQuote: async () => state.quote,
}));
vi.mock("../../server/trading/paper-gate", () => ({
  enforceStrategyGate: () => undefined,
}));
vi.mock("../../server/trading/paper-service", () => ({
  createPaperOrder: async (_user: unknown, input: any) => {
    state.orderCalls++;
    // This independently pooled lifecycle cannot read a claim left uncommitted in the lock transaction.
    const proposal = state.proposals.get(input.proposalId);
    if (!proposal)
      throw new Error("NOT_FOUND: proposal invisible to the order connection");
    const trade = {
      id: `paper_${input.proposalId}`,
      market: state.market.id,
      valuationSymbol: state.market.valuationSymbol,
      side: "long",
      status: "open",
      entry: input.entry,
      stop: input.stop,
      target: input.target,
      quantity: input.quantity,
      pointValue: state.market.pointValue,
      createdAt: Date.now(),
      strategyId: ORB_STRATEGY.id,
      strategyName: "ORB unit",
      strategyVersion: 1,
      journal: input.journal,
      entryMode: input.entryMode,
      orderType: input.orderType,
    };
    state.trades.push(trade);
    return trade;
  },
}));
import {
  checkOrbAutoPaper,
  orbAutoStatus,
} from "../../server/trading/orb-auto-paper";

const NOW = Date.UTC(2026, 9, 19, 14, 3, 5);
const OPEN = Date.UTC(2026, 9, 19, 13) / 1000;
const BREAK = OPEN + 3600;
const user = { id: 77 } as any;
function bar(
  time: number,
  open = 100,
  high = 101,
  low = 99,
  close = 100,
): Candle {
  return { time, open, high, low, close, volume: 100 };
}
function database(committed = true, pending = new Map<string, any>()): any {
  return {
    select() {
      let table: unknown;
      const rows = () =>
        table === tradingPaperProposals
          ? [
              ...(committed
                ? state.proposals
                : new Map([...state.proposals, ...pending])
              ).values(),
            ].map((payload) => ({ payload }))
          : state.trades.map((payload) => ({ payload }));
      const builder: any = {
        from(value: unknown) {
          table = value;
          return builder;
        },
        where() {
          return builder;
        },
        limit(n: number) {
          return Promise.resolve(rows().slice(0, n));
        },
        then(
          resolve: (rows: unknown[]) => unknown,
          reject: (error: unknown) => unknown,
        ) {
          return Promise.resolve(rows()).then(resolve, reject);
        },
      };
      return builder;
    },
    insert(table: unknown) {
      return {
        values(row: any) {
          return {
            async ignore() {
              if (table !== tradingPaperProposals)
                throw new Error("Only a fixture proposal claim is supported");
              const map = committed ? state.proposals : pending;
              if (!state.proposals.has(row.id) && !map.has(row.id))
                map.set(row.id, row.payload);
            },
          };
        },
      };
    },
    async execute() {
      state.locks.push(state.locks.length % 2 === 0 ? "get" : "release");
      return [[{ acquired: state.acquired ? 1 : 0 }], []];
    },
    async transaction(run: (tx: any) => Promise<unknown>) {
      const held = new Map<string, any>();
      const result = await run(database(false, held));
      for (const [key, value] of held) state.proposals.set(key, value);
      return result;
    },
  };
}
function reset() {
  const strategy = JSON.parse(JSON.stringify(ORB_STRATEGY));
  const market = MARKETS.find((item) => item.id === "NQ")!;
  const candles: Candle[] = [];
  for (let time = OPEN + 900; time < BREAK; time += 60) candles.push(bar(time));
  candles.push(
    bar(BREAK, 119, 123, 118, 122),
    bar(BREAK + 60, 122, 124, 97, 110),
    bar(BREAK + 120, 110, 127, 109, 125),
  );
  const analysis = analyzeSetups({
    market,
    timeframe: "1m",
    candles,
    strategies: [strategy],
    patterns: [],
    combination: "all",
    timezone: "Etc/GMT+5",
    source: "UNIT only",
    now: NOW / 1000,
    daily: [],
    hourly: [],
    dailySource: "UNIT unavailable",
    hourlySource: "UNIT unavailable",
    orbRangeFeed: {
      candles: [bar(OPEN, 100, 120, 80, 101)],
      source: "UNIT only",
      timeframe: "15m",
    },
  });
  const candidate = analysis.candidates.find((item) => item.side === "long")!;
  strategy.confluence = draftConfluence(strategy, candidate, "1m");
  strategy.confluence.contract.approval = {
    status: "approved",
    approvedAt: NOW - 1000,
    approvedBy: "UNIT_OWNER",
  };
  strategy.confluence.binding.side = "long";
  analysis.orbContexts![0].config = strategy.orbConfig;
  analysis.confluenceEvaluations = {
    [strategy.id]: {
      strategyEntryEligible: true,
      snapshot: {
        approval: { status: "approved" },
        version: {
          strategyId: strategy.id,
          strategyVersion: strategy.version,
          configVersion: strategy.confluence.contract.configVersion,
        },
      },
    },
  } as any;
  const workspace = initialWorkspace();
  workspace.strategies.push(strategy);
  workspace.settings.dailyDrawdownLimitPct = 3;
  workspace.settings.orbAutoPaper = {
    version: 1,
    enabled: true,
    strategyId: strategy.id,
    market: "NQ",
    riskPct: 1,
    maxTradesPerDay: 3,
    armedAt: NOW - 1000,
    expiresAt: NOW + 3600000,
  };
  state.workspace = workspace;
  state.nextWorkspace = undefined;
  state.analysis = analysis;
  state.market = market;
  state.quote = {
    symbol: "NQ",
    price: 125,
    ask: 125,
    bid: 124.75,
    timestamp: NOW / 1000,
    timestampKind: "provider",
    status: "live",
    source: "UNIT only",
  };
  state.proposals.clear();
  state.trades = [];
  state.locks = [];
  state.acquired = true;
  state.orderCalls = 0;
  state.sourceCalls = 0;
  state.sourceMarkets = [];
  state.loadCalls = 0;
  state.db = database();
}

/** Synthetic broker catalog/source fixture only; no TradeLocker call or order is made. */
function useNas100Cfd() {
  const market = {
    id: "TL:3884",
    name: "NAS100 · broker INDICES",
    category: "Indices" as const,
    provider: "tradelocker" as const,
    providerSymbol: "NAS100",
    precision: 2,
    pointValue: 1,
    paperSupported: true,
  };
  const strategy = state.workspace.strategies.find(
    (item: any) => item.setupFamily === "orb",
  );
  strategy.orbConfig = {
    ...strategy.orbConfig,
    marketMode: "nas100-cfd",
    instrumentMarket: market.id,
    priceTick: 0.5,
  };
  state.workspace.settings.orbAutoPaper.market = market.id;
  state.market = market;
  state.analysis.market = market.id;
  state.analysis.orbContexts[0].config = strategy.orbConfig;
  state.analysis.orbContexts[0].instrumentMetadata = {
    market: market.id,
    priceTick: 0.5,
    source: "UNIT selected broker instrument metadata",
  };
  const candidate = state.analysis.candidates.find(
    (item: any) => item.family === "orb" && item.side === "long",
  );
  candidate.entry = 125;
  candidate.stop = 97;
  candidate.target = 209;
  state.quote = {
    ...state.quote,
    symbol: market.id,
    price: 125,
    ask: 125,
    bid: 125,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  reset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("automatic ORB wrapper — isolated software simulation only", () => {
  it("commits a durable claim before the separate order connection reads it, then releases the lock", async () => {
    expect(await orbAutoStatus(user)).toMatchObject({
      state: "waiting",
      strategyVersion: ORB_STRATEGY.version,
    });
    state.loadCalls = 0;
    const result = await checkOrbAutoPaper(user);
    expect(result.state).toBe("placed");
    expect(state.orderCalls).toBe(1);
    expect(state.proposals.size).toBe(1);
    expect(state.locks).toEqual(["get", "release"]);
    expect(state.sourceMarkets).toEqual(["NQ"]);
    expect(state.trades[0]).toMatchObject({
      entryMode: "strategy",
      orderType: "market",
      stop: 96.75,
      target: 209.75,
    });
    // Even after the first simulated position closes and another poll/restart occurs, the bar is not reused.
    state.trades[0].status = "closed";
    state.trades[0].exit = 125;
    state.trades[0].closedAt = NOW;
    expect((await checkOrbAutoPaper(user)).state).toBe("duplicate");
    expect(state.orderCalls).toBe(1);
  });
  it("cannot attempt an order/claim when the shared lock is unavailable", async () => {
    state.acquired = false;
    expect((await checkOrbAutoPaper(user)).state).toBe("busy");
    expect(state.sourceCalls).toBe(0);
    expect(state.orderCalls).toBe(0);
    expect(state.proposals.size).toBe(0);
  });
  it("stops an awaited signal if canonical Off changed before the one order attempt", async () => {
    state.nextWorkspace = JSON.parse(JSON.stringify(state.workspace));
    state.nextWorkspace.settings.orbAutoPaper.enabled = false;
    expect((await checkOrbAutoPaper(user)).state).toBe("blocked");
    expect(state.proposals.size).toBe(0); // Off is now rechecked before any durable claim.
    expect(state.orderCalls).toBe(0);
  });
  it("uses realized canonical balance for1% sizing and counts all same-day automatic records", async () => {
    const prior: Trade = {
      id: "UNIT_prior",
      market: "ES",
      valuationSymbol: "ES",
      side: "long",
      status: "closed",
      entry: 100,
      stop: 90,
      target: 200,
      exit: 200,
      quantity: 1,
      pointValue: 20,
      strategyId: "UNIT",
      strategyName: "UNIT",
      strategyVersion: 1,
      factors: [],
      journal: {},
      createdAt: NOW - 86400000,
      closedAt: NOW - 86400000,
    };
    state.trades.push(prior);
    expect((await checkOrbAutoPaper(user)).state).toBe("placed");
    expect(tradeMetrics(state.trades.at(-1)).risk).toBeCloseTo(
      (state.workspace.paperStartingBalance + 2000) * 0.01,
      2,
    );
    state.trades.at(-1).status = "cancelled";
    state.workspace.settings.orbAutoPaper.maxTradesPerDay = 1;
    expect((await checkOrbAutoPaper(user)).message).toContain("local-day cap");
    expect(state.orderCalls).toBe(1);
  });
  it("reports an expired canonical arm as blocked, never waiting or source-ready", async () => {
    state.workspace.settings.orbAutoPaper.expiresAt = NOW;
    expect((await orbAutoStatus(user)).state).toBe("blocked");
    expect((await checkOrbAutoPaper(user)).state).toBe("blocked");
    expect(state.sourceCalls).toBe(0);
    expect(state.orderCalls).toBe(0);
  });
  it("cannot place or claim against a future server-clock arm", async () => {
    state.workspace.settings.orbAutoPaper.armedAt = NOW + 60000;
    expect((await orbAutoStatus(user)).state).toBe("blocked");
    expect((await checkOrbAutoPaper(user)).state).toBe("blocked");
    expect(state.sourceCalls).toBe(0);
    expect(state.proposals.size).toBe(0);
  });
  it("uses only the exact selected NAS100 CFD id and current matching metadata for the profile-derived 3R bracket", async () => {
    useNas100Cfd();
    const result = await checkOrbAutoPaper(user);
    expect(result.state).toBe("placed");
    expect(state.sourceMarkets).toEqual(["TL:3884"]);
    expect(state.orderCalls).toBe(1);
    expect(state.trades[0]).toMatchObject({
      market: "TL:3884",
      entry: 125,
      stop: 97,
      target: 209,
    });
  });
  it("blocks NAS100 mode when current source metadata does not exactly match its configured price tick", async () => {
    useNas100Cfd();
    state.analysis.orbContexts[0].instrumentMetadata.priceTick = 0.25;
    const result = await checkOrbAutoPaper(user);
    expect(result.state).toBe("blocked");
    expect(result.message).toContain("geometry could not be verified");
    expect(state.sourceMarkets).toEqual(["TL:3884"]);
    expect(state.orderCalls).toBe(0);
    expect(state.proposals.size).toBe(0);
  });
  it("does not authorize a broker id alone for another CFD or accept a source-market switch", async () => {
    useNas100Cfd();
    state.market = {
      ...state.market,
      providerSymbol: "XAUUSD",
      category: "Metals",
    };
    expect((await checkOrbAutoPaper(user)).state).toBe("blocked");
    expect(state.sourceCalls).toBe(0);
    expect(state.orderCalls).toBe(0);

    reset();
    useNas100Cfd();
    state.analysis.market = "NQ";
    const result = await checkOrbAutoPaper(user);
    expect(result.state).toBe("waiting");
    expect(result.message).toContain("did not remain");
    expect(state.sourceMarkets).toEqual(["TL:3884"]);
    expect(state.orderCalls).toBe(0);
  });
});
