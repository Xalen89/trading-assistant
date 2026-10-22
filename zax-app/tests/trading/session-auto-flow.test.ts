import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  tradingPaperProposals,
  tradingPaperTrades,
  tradingRuntimeState,
  tradingSchedules,
} from "../../drizzle/schema";
import { tradeMetrics } from "../../lib/trading/engine";
import type { Strategy, Trade, Workspace } from "../../lib/trading/model";

const state = vi.hoisted(() => ({
  db: undefined as any,
  workspace: undefined as unknown as Workspace,
  analysis: undefined as any,
  market: undefined as any,
  quote: undefined as any,
  proposals: new Map<string, any>(),
  trades: [] as Trade[],
  runtime: new Map<
    string,
    {
      lastScheduledAt?: number;
      taskUid?: string;
      lastScheduledHeartbeat?: number;
    }
  >(),
  scheduled: false,
  acquired: true,
  allowed: true,
  production: true,
  guardFailure: false,
  sourceCalls: 0,
  orderCalls: 0,
  locks: [] as string[],
  lastOrder: undefined as any,
}));

vi.mock("../../server/trading/access", () => ({
  mayUseApp: () => state.allowed,
}));
vi.mock("../../server/_core/env", () => ({
  ENV: {
    get isProduction() {
      return state.production;
    },
  },
}));
vi.mock("../../server/trading/repository", () => ({
  dbRequired: async () => state.db,
  loadWorkspace: async () => ({ workspace: state.workspace }),
}));
vi.mock("../../server/trading/setup-service", () => ({
  marketFor: async () => state.market,
  setupAnalysis: async () => {
    state.sourceCalls += 1;
    return state.analysis;
  },
}));
vi.mock("../../server/trading/market", () => ({
  getQuote: async () => state.quote,
}));
vi.mock("../../server/trading/paper-gate", () => ({
  enforceStrategyGate: () => {
    if (state.guardFailure) throw new Error("fixture gate failure");
  },
}));
vi.mock("../../server/trading/paper-service", () => ({
  createPaperOrder: async (_user: unknown, input: any) => {
    state.orderCalls += 1;
    state.lastOrder = input;
    if (!state.proposals.has(input.proposalId))
      throw new Error(
        "NOT_FOUND: immutable claim was not committed before order connection read",
      );
    const trade: Trade = {
      id: `paper_${input.proposalId}`,
      market: "NQ",
      valuationSymbol: "NQ",
      side: "long",
      status: "open",
      entry: 101,
      stop: input.stop,
      target: input.target,
      quantity: input.quantity,
      pointValue: 20,
      strategyId: "session-flow",
      strategyName: "Session flow",
      strategyVersion: 4,
      factors: [],
      journal: input.journal,
      createdAt: Date.now(),
      entryMode: input.entryMode,
      orderType: input.orderType,
      autoManage: input.autoManage,
    };
    state.trades.push(trade);
    return trade;
  },
}));

import {
  checkSessionAutoPaper,
  sessionAutoStatus,
} from "../../server/trading/session-auto-paper";

const NOW = Date.UTC(2026, 9, 19, 14, 3, 5);
const user = { id: 77 } as any;
const config = {
  version: 1 as const,
  confirmed: true,
  timezone: "Etc/GMT+5" as const,
  family: "london-breakout" as const,
  executionTimeframe: "15m" as const,
  stopMode: "midpoint" as const,
  targetMode: "2r" as const,
};

function fixtureStrategy(): Strategy {
  return {
    id: "session-flow",
    name: "Session flow",
    description: "Fixture deterministic session",
    color: "#ffffff",
    kind: "strategy",
    setupFamily: "london-breakout",
    visible: true,
    version: 4,
    sessionConfig: config,
    factors: [],
    confluence: {
      contract: {
        contractVersion: 1,
        strategyId: "session-flow",
        strategyVersion: 4,
        configVersion: 2,
        approval: {
          status: "approved",
          approvedAt: NOW - 1_000,
          approvedBy: "owner",
        },
        trigger: {
          id: "session-breakout",
          name: "Closed breakout",
          predicate: "closed source bar",
          source: {
            id: "native-15m",
            name: "fixture",
            required: true,
            freshness: { maxAgeMs: 120_000 },
          },
        },
        conditions: [
          {
            id: "range",
            name: "Range",
            predicate: "complete range",
            enabled: true,
            weight: 100,
            source: {
              id: "native-15m",
              name: "fixture",
              required: true,
              freshness: { maxAgeMs: 120_000 },
            },
          },
        ],
        threshold: 100,
      },
      binding: {
        side: "long",
        triggerStepId: "session-breakout",
        conditions: [{ conditionId: "range", stepId: "session-range" }],
      },
    },
  };
}

function fixtureWorkspace(
  overrides: Partial<{
    enabled: boolean;
    expiresAt: number;
    runWhenClosed: boolean;
    dailyDrawdownLimitPct: number;
  }> = {},
): Workspace {
  const strategy = fixtureStrategy();
  return {
    schemaVersion: 1,
    strategies: [strategy],
    patterns: [],
    matches: [],
    trades: [],
    alerts: [],
    events: [],
    levels: [],
    activeStrategyId: strategy.id,
    market: "NQ",
    timeframe: "15m",
    favorites: [],
    confirmations: {},
    overlays: {},
    paperStartingBalance: 100_000,
    settings: {
      timezone: "Etc/GMT+5",
      weeklyBias: "Neutral",
      sampleMode: false,
      futureOverlay: false,
      adaptation: true,
      dailyDrawdownLimitPct: overrides.dailyDrawdownLimitPct ?? 3,
      sessionAutoPaper: {
        version: 1,
        enabled: overrides.enabled ?? true,
        strategyId: strategy.id,
        market: "NQ",
        riskPct: 1,
        maxTradesPerDay: 3,
        runWhenClosed: overrides.runWhenClosed ?? false,
        armedAt: NOW - 1_000,
        expiresAt: overrides.expiresAt ?? NOW + 3_600_000,
      },
    },
  };
}

function fixtureAnalysis(stale = false) {
  const decision = NOW / 1000 - (stale ? 4_000 : 900);
  return {
    market: "NQ",
    timeframe: "15m",
    asOf: NOW / 1000,
    source: "fixture native source",
    candles: [
      { time: decision, open: 99, high: 102, low: 98, close: 101, volume: 100 },
    ],
    candidates: [
      {
        id: "candidate",
        family: "london-breakout",
        side: "long",
        strategyId: "session-flow",
        strategyVersion: 4,
        name: "Session flow",
        ready: true,
        entry: 101,
        stop: 95,
        target: 113,
        source: "fixture native source",
        zones: [],
        steps: [
          "session-config",
          "session-frame",
          "session-clock",
          "session-range",
          "session-breakout",
          "session-risk",
        ].map((id) => ({
          id,
          name: id,
          status: "met" as const,
          evidence: "fixture closed source",
        })),
      },
    ],
    confluenceEvaluations: {
      "session-flow": {
        strategyEntryEligible: true,
        snapshot: {
          approval: { status: "approved" },
          version: {
            strategyId: "session-flow",
            strategyVersion: 4,
            configVersion: 2,
          },
        },
      },
    },
    sessionContexts: [
      {
        strategyId: "session-flow",
        family: "london-breakout",
        timezone: "Etc/GMT+5",
        config,
        range: {
          high: 100,
          low: 90,
          midpoint: 95,
          startAt: decision - 900,
          endAt: decision,
          source: "fixture native source",
          basis: "complete-15m-window",
        },
        volumeBasis: "venue",
        missing: [],
      },
    ],
  } as any;
}

function database(): any {
  return {
    select() {
      let table: unknown;
      const rows = () => {
        if (table === tradingPaperProposals)
          return [...state.proposals.entries()].map(([id, payload]) => ({
            id,
            userId: user.id,
            market: "NQ",
            payload,
          }));
        if (table === tradingPaperTrades)
          return state.trades.map((payload) => ({
            payload,
            createdAt: new Date(payload.createdAt),
          }));
        if (table === tradingSchedules)
          return state.scheduled
            ? [{ taskUid: "fixture-task", userId: user.id }]
            : [];
        if (table === tradingRuntimeState)
          return [...state.runtime.entries()].map(([id, payload]) => ({
            id,
            userId: user.id,
            payload,
            updatedAt: new Date(
              payload.lastScheduledAt ?? payload.lastScheduledHeartbeat ?? NOW,
            ),
          }));
        return [];
      };
      const builder: any = {
        from(value: unknown) {
          table = value;
          return builder;
        },
        where() {
          return builder;
        },
        limit(count: number) {
          return Promise.resolve(rows().slice(0, count));
        },
        then(
          resolve: (value: unknown[]) => unknown,
          reject: (reason: unknown) => unknown,
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
                throw new Error("unexpected fixture insert");
              if (!state.proposals.has(row.id))
                state.proposals.set(row.id, row.payload);
            },
            async onDuplicateKeyUpdate() {
              if (table !== tradingRuntimeState)
                throw new Error("unexpected fixture update");
              state.runtime.set(row.id, row.payload);
            },
          };
        },
      };
    },
    async transaction(run: (tx: any) => Promise<unknown>) {
      return run({
        async execute() {
          state.locks.push(state.locks.length % 2 === 0 ? "get" : "release");
          return [[{ acquired: state.acquired ? 1 : 0 }], []];
        },
      });
    },
  };
}

function reset() {
  state.workspace = fixtureWorkspace();
  state.analysis = fixtureAnalysis();
  state.market = {
    id: "NQ",
    name: "Nasdaq futures",
    category: "Futures",
    provider: "tradelocker",
    providerSymbol: "NQ",
    precision: 2,
    pointValue: 20,
    paperSupported: true,
    valuationSymbol: "NQ",
  };
  state.quote = {
    symbol: "NQ",
    price: 101,
    ask: 101,
    bid: 100.75,
    timestamp: NOW / 1000,
    timestampKind: "provider",
    source: "fixture quote",
    status: "live",
  };
  state.proposals.clear();
  state.trades = [];
  state.runtime.clear();
  state.scheduled = false;
  state.acquired = true;
  state.allowed = true;
  state.production = true;
  state.guardFailure = false;
  state.sourceCalls = 0;
  state.orderCalls = 0;
  state.locks = [];
  state.lastOrder = undefined;
  state.db = database();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  reset();
});
afterEach(() => vi.useRealTimers());

describe("session automatic paper wrapper — fixture-only and no live DB/provider/order use", () => {
  it("reports saved closed-app consent as registered only after a durable actual callback, without source work in status", async () => {
    state.workspace = fixtureWorkspace({ runWhenClosed: true });
    state.scheduled = true;
    expect(await sessionAutoStatus(user)).toMatchObject({
      state: "waiting",
      backgroundReady: false,
    });
    expect(state.sourceCalls).toBe(0);
    state.runtime.set("session-auto-paper-scheduled:77", {
      lastScheduledAt: NOW,
    });
    expect(await sessionAutoStatus(user)).toMatchObject({
      backgroundReady: false,
    });
    state.runtime.clear();
    state.runtime.set("strategy-background-heartbeat:77", {
      taskUid: "foreign-task",
      lastScheduledHeartbeat: NOW,
    });
    expect(await sessionAutoStatus(user)).toMatchObject({
      backgroundReady: false,
    });
    state.runtime.set("strategy-background-heartbeat:77", {
      taskUid: "fixture-task",
      lastScheduledHeartbeat: NOW,
    });
    expect(await sessionAutoStatus(user)).toMatchObject({
      state: "waiting",
      backgroundReady: true,
      lastScheduledAt: NOW,
    });
    expect(state.sourceCalls).toBe(0);
  });

  it("commits one durable claim before the separate canonical lifecycle reads it, uses the shared lock, and never repeats the signal", async () => {
    const first = await checkSessionAutoPaper(user);
    expect(first.state).toBe("placed");
    expect(state.orderCalls).toBe(1);
    expect(state.proposals.size).toBe(1);
    expect(state.locks).toEqual(["get", "release"]);
    expect(state.lastOrder).toMatchObject({
      entryMode: "strategy",
      orderType: "market",
      targetMode: "price",
      autoManage: false,
      stop: 95,
      target: 113,
    });
    state.trades[0].status = "closed";
    state.trades[0].exit = 113;
    state.trades[0].closedAt = NOW;
    expect((await checkSessionAutoPaper(user)).state).toBe("duplicate");
    expect(state.orderCalls).toBe(1);
  });

  it("fails closed when lock, canonical Off/expiry, authentication, or scheduled production boundary is unavailable", async () => {
    state.acquired = false;
    expect((await checkSessionAutoPaper(user)).state).toBe("busy");
    expect(state.sourceCalls).toBe(0);
    reset();
    state.workspace = fixtureWorkspace({ enabled: false });
    expect((await checkSessionAutoPaper(user)).state).toBe("off");
    expect(state.sourceCalls).toBe(0);
    reset();
    state.workspace = fixtureWorkspace({ expiresAt: NOW });
    expect((await checkSessionAutoPaper(user)).state).toBe("blocked");
    expect(state.sourceCalls).toBe(0);
    reset();
    state.allowed = false;
    expect((await checkSessionAutoPaper(user)).state).toBe("blocked");
    expect(state.sourceCalls).toBe(0);
    reset();
    state.production = false;
    state.workspace = fixtureWorkspace({ runWhenClosed: true });
    expect((await checkSessionAutoPaper(user, "scheduled")).state).toBe(
      "blocked",
    );
    expect(state.sourceCalls).toBe(0);
    expect(state.orderCalls).toBe(0);
  });

  it("does not implicitly schedule background work and requires a fresh native source bar", async () => {
    state.workspace = fixtureWorkspace({ runWhenClosed: true });
    expect(await sessionAutoStatus(user)).toMatchObject({
      backgroundReady: false,
    });
    expect(state.runtime.size).toBe(0);
    expect(state.sourceCalls).toBe(0);
    state.analysis = fixtureAnalysis(true);
    expect((await checkSessionAutoPaper(user)).state).toBe("waiting");
    expect(state.orderCalls).toBe(0);
    expect(state.proposals.size).toBe(0);
  });

  it("sizes against realized canonical balance and blocks before a claim when current guards fail", async () => {
    const prior: Trade = {
      id: "realized-prior",
      market: "NQ",
      valuationSymbol: "NQ",
      side: "long",
      status: "closed",
      entry: 100,
      stop: 90,
      target: 200,
      exit: 200,
      quantity: 1,
      pointValue: 20,
      strategyId: "manual",
      strategyName: "Manual",
      strategyVersion: 1,
      factors: [],
      journal: {},
      createdAt: NOW - 86_400_000,
      closedAt: NOW - 86_400_000,
    };
    state.trades.push(prior);
    expect((await checkSessionAutoPaper(user)).state).toBe("placed");
    expect(
      tradeMetrics({
        market: "NQ",
        valuationSymbol: "NQ",
        side: "long",
        entry: 101,
        stop: 95,
        target: 113,
        quantity: state.lastOrder.quantity,
        pointValue: 20,
      }).risk,
    ).toBeCloseTo(1_020, 2);
    reset();
    state.guardFailure = true;
    expect((await checkSessionAutoPaper(user)).state).toBe("blocked");
    expect(state.proposals.size).toBe(0);
    expect(state.orderCalls).toBe(0);
  });

  it("requires a prior completed authenticated owner callback even if runWhenClosed was saved directly", async () => {
    state.workspace = fixtureWorkspace({ runWhenClosed: true });
    state.scheduled = true;
    expect((await checkSessionAutoPaper(user, "scheduled")).state).toBe(
      "blocked",
    );
    expect(state.sourceCalls).toBe(0);
    expect(state.orderCalls).toBe(0);
    state.runtime.set("strategy-background-heartbeat:77", {
      taskUid: "fixture-task",
      lastScheduledHeartbeat: NOW,
    });
    expect((await checkSessionAutoPaper(user, "scheduled")).state).toBe(
      "placed",
    );
    expect(state.orderCalls).toBe(1);
  });

  it("does not claim or submit an order after the inherited callback deadline", async () => {
    expect(
      (await checkSessionAutoPaper(user, "foreground", NOW - 1)).state,
    ).toBe("waiting");
    expect(state.orderCalls).toBe(0);
    expect(state.proposals.size).toBe(0);
  });
});
