import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { tradeMetrics } from "../../lib/trading/engine";
import { minimumPaperTarget } from "../../lib/trading/paper-form";

const mock = vi.hoisted(() => ({
  record: undefined as any,
  workspace: undefined as any,
  writes: 0,
  expectedVersions: [] as (number | undefined)[],
  closedHistory: [] as any[],
  ledger: [] as any[],
  active: [] as any[],
  duplicateOnWrite: undefined as any,
  proposal: {
    id: "UNIT-PROPOSAL",
    side: "long",
    entry: 100,
    stop: 90,
    target: 120,
    quantity: 50,
    initialRisk: 500,
    riskPct: 0.5,
    strategyIds: ["core-sequence"],
    strategyVersions: [1],
    analysis: { market: "UNIT", candidates: [], confluences: [] },
  } as any,
  market: { id: "UNIT", pointValue: 1, precision: 2, paperSupported: true },
  quote: {
    price: 100,
    bid: 99.9,
    ask: 100,
    timestamp: Date.now() / 1000,
    status: "live",
    source: "Synthetic unit quote",
  },
}));

vi.mock("../../server/trading/repository", () => ({
  loadWorkspace: async () => ({ workspace: mock.workspace }),
}));
vi.mock("../../server/trading/setup-service", () => ({
  readProposal: async () => mock.proposal,
  marketFor: async () => mock.market,
  setupAnalysis: async () => ({
    asOf: Date.now() / 1000,
    confluenceEvaluations: { unit: { snapshot: {} } },
  }),
}));
vi.mock("../../server/trading/market", () => ({
  getQuote: async () => mock.quote,
}));
vi.mock("../../server/trading/setup-history", () => ({
  paperTrade: async () => {
    if (!mock.record) throw new TRPCError({ code: "NOT_FOUND" });
    return mock.record;
  },
  activePaperTrades: async () => mock.active,
  writePaperTrade: async (
    _user: number,
    trade: any,
    expectedVersion?: number,
  ) => {
    mock.writes += 1;
    mock.expectedVersions.push(expectedVersion);
    if (mock.duplicateOnWrite) {
      mock.record = structuredClone(mock.duplicateOnWrite);
      const error = Object.assign(new Error("Synthetic duplicate insert"), {
        code: "ER_DUP_ENTRY",
      });
      throw error;
    }
    mock.record = structuredClone(trade);
    return mock.record;
  },
  paperHistory: async (_user: number, status?: string) => ({
    trades: status === "closed" ? mock.closedHistory : mock.ledger,
  }),
  paperRevisions: async () => [],
}));

import {
  cancelPaperTrade,
  createPaperOrder,
  editPaperTrade,
  managePaperTrades,
} from "../../server/trading/paper-service";

const input = {
  proposalId: "UNIT-PROPOSAL",
  entry: 100,
  stop: 90,
  target: 120,
  quantity: 50,
  orderType: "market" as const,
  autoManage: false,
  journal: { note: "Synthetic unit record" },
};

describe("canonical paper risk boundaries", () => {
  beforeEach(() => {
    mock.record = undefined;
    mock.workspace = {
      paperStartingBalance: 100_000,
      settings: {},
      trades: [],
    };
    mock.writes = 0;
    mock.expectedVersions = [];
    mock.closedHistory = [];
    mock.ledger = [];
    mock.duplicateOnWrite = undefined;
    mock.proposal = {
      id: "UNIT-PROPOSAL",
      side: "long",
      entry: 100,
      stop: 90,
      target: 120,
      quantity: 50,
      initialRisk: 500,
      riskPct: 0.5,
      strategyIds: ["core-sequence"],
      strategyVersions: [1],
      analysis: { market: "UNIT", candidates: [], confluences: [] },
    };
    mock.market = {
      id: "UNIT",
      pointValue: 1,
      precision: 2,
      paperSupported: true,
    };
    mock.quote = {
      price: 100,
      bid: 99.9,
      ask: 100,
      timestamp: Date.now() / 1000,
      status: "live",
      source: "Synthetic unit quote",
    };
  });

  it("rejects an explicitly undersized order below 0.5%", async () => {
    await expect(
      createPaperOrder({ id: 1 } as any, { ...input, quantity: 1 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects an oversized order above 1%", async () => {
    await expect(
      createPaperOrder({ id: 1 } as any, { ...input, quantity: 101 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("enforces a selected 1% template with server-derived sizing", async () => {
    mock.proposal = {
      ...mock.proposal,
      riskPct: 1,
      quantity: 100,
      initialRisk: 1000,
    };
    await expect(
      createPaperOrder({ id: 1 } as any, { ...input, quantity: 101 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("enforces the selected 2% template rather than the former 1% cap", async () => {
    mock.proposal = {
      ...mock.proposal,
      riskPct: 2,
      quantity: 200,
      initialRisk: 2000,
    };
    await expect(
      createPaperOrder({ id: 1 } as any, { ...input, quantity: 201 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(
      await createPaperOrder({ id: 1 } as any, { ...input, quantity: 200 }),
    ).toMatchObject({ quantity: 200, initialRisk: 2000 });
  });

  it("allows positive fixed units below the former 0.5% floor while retaining its 2% cap", async () => {
    mock.proposal = {
      ...mock.proposal,
      riskPct: 0,
      quantity: 200,
      initialRisk: 2000,
    };
    await expect(
      createPaperOrder({ id: 1 } as any, { ...input, quantity: 201 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(
      await createPaperOrder({ id: 1 } as any, { ...input, quantity: 1 }),
    ).toMatchObject({ quantity: 1, initialRisk: 10 });
  });

  it("honours an explicit server-provided effective cap for fixed units", async () => {
    mock.proposal = {
      ...mock.proposal,
      riskPct: 0,
      effectiveRiskCapPct: 1,
      quantity: 100,
      initialRisk: 1000,
    };
    await expect(
      createPaperOrder({ id: 1 } as any, { ...input, quantity: 101 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(
      await createPaperOrder({ id: 1 } as any, { ...input, quantity: 100 }),
    ).toMatchObject({ quantity: 100, initialRisk: 1000 });
  });

  it("persists the unedited reference risk only in the durable paper mock", async () => {
    expect(await createPaperOrder({ id: 1 } as any, input)).toMatchObject({
      initialRisk: 500,
      quantity: 50,
      status: "open",
      orderType: "market",
    });
    expect(mock.record).toMatchObject({
      id: "paper_UNIT-PROPOSAL",
      initialRisk: 500,
    });
    expect(mock.writes).toBe(1);
  });

  it("sizes a percentage order from canonical paper equity, not an inflated proposal balance", async () => {
    mock.workspace = {
      paperStartingBalance: 1_000,
      settings: {},
      trades: [],
    };
    mock.proposal = {
      ...mock.proposal,
      quantity: 50_000,
      initialRisk: 500_000,
    };

    const trade = await createPaperOrder({ id: 1 } as any, {
      ...input,
      quantity: 50_000,
    });

    expect(trade).toMatchObject({ quantity: 0.5, initialRisk: 5 });
    expect(mock.record).toMatchObject({ quantity: 0.5, initialRisk: 5 });
  });

  it("recalculates an unedited default target and size when the fresh quote moves beyond target", async () => {
    mock.quote = {
      price: 125,
      bid: 124.9,
      ask: 125,
      timestamp: Date.now() / 1000,
      status: "live",
      source: "Shifted unit quote",
    };
    const trade = await createPaperOrder({ id: 1 } as any, input);
    expect(trade).toMatchObject({
      entry: 125,
      target: 195,
      quantity: 14.285714,
    });
    expect(trade.initialRisk).toBeCloseTo(500, 4);
    expect(trade.journal.targetAdjustment).toContain("default target");
    expect(mock.record).toMatchObject({ target: 195, quantity: 14.285714 });
  });

  it("preserves an explicit selected RR through a fresh market entry", async () => {
    mock.quote = {
      price: 125,
      bid: 124.9,
      ask: 125,
      timestamp: Date.now() / 1000,
      status: "live",
      source: "Shifted unit quote",
    };
    const trade = await createPaperOrder({ id: 1 } as any, {
      ...input,
      targetMode: "rr",
      rr: 3,
    });
    expect(trade.target).toBeCloseTo(230);
    expect(trade.journal.targetAdjustment).toContain("Explicit selected RR");
  });

  it("does not silently repair a custom target whose fresh geometry is invalid", async () => {
    mock.quote = {
      price: 125,
      bid: 124.9,
      ask: 125,
      timestamp: Date.now() / 1000,
      status: "live",
      source: "Shifted unit quote",
    };
    await expect(
      createPaperOrder({ id: 1 } as any, { ...input, target: 119 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mock.record).toBeUndefined();
    expect(mock.writes).toBe(0);
  });

  it("preserves an edited valid absolute target when a fresh market entry moves", async () => {
    mock.quote = {
      price: 125,
      bid: 124.9,
      ask: 125,
      timestamp: Date.now() / 1000,
      status: "live",
      source: "Shifted unit quote",
    };
    const trade = await createPaperOrder({ id: 1 } as any, {
      ...input,
      target: 200,
      targetMode: "price",
    });
    expect(trade.target).toBe(200);
    expect(trade.journal.targetAdjustment).toBe(
      "User-reviewed target retained.",
    );
  });

  it("accepts a conversion-precise USDJPY target within representation tolerance", async () => {
    const market = {
      id: "USDJPY",
      name: "USD / Japanese Yen",
      category: "Forex" as const,
      provider: "fmp" as const,
      providerSymbol: "USDJPY",
      precision: 3,
      pointValue: 1,
      paperSupported: true,
      valuationSymbol: "USDJPY",
    };
    const exactTarget = minimumPaperTarget({
      market,
      side: "long",
      entry: 150,
      stop: 149,
    })!;
    const target = exactTarget - Number.EPSILON * Math.abs(exactTarget);
    const initialRisk = tradeMetrics({
      market: market.id,
      valuationSymbol: market.valuationSymbol,
      side: "long",
      entry: 150,
      stop: 149,
      target,
      quantity: 1000,
      pointValue: 1,
    }).risk;
    mock.market = market;
    mock.quote = {
      price: 150,
      bid: 149.99,
      ask: 150,
      timestamp: Date.now() / 1000,
      status: "live",
      source: "Synthetic USDJPY quote",
    };
    mock.proposal = {
      ...mock.proposal,
      entry: 150,
      stop: 149,
      target,
      quantity: 1000,
      initialRisk,
      analysis: { market: "USDJPY", candidates: [], confluences: [] },
    };
    const trade = await createPaperOrder({ id: 1 } as any, {
      ...input,
      entry: 150,
      stop: 149,
      target,
      quantity: 1000,
    });
    expect(trade.target).toBe(target);
    expect(trade.journal.targetAdjustment).toBe(
      "User-reviewed target retained.",
    );
  });

  it("blocks new orders at a saved daily paper cap", async () => {
    mock.workspace = {
      paperStartingBalance: 1000,
      settings: { dailyDrawdownLimitPct: 2 },
      trades: [
        {
          id: "UNIT-LOSS",
          market: "UNIT",
          side: "long",
          status: "closed",
          entry: 100,
          stop: 90,
          target: 120,
          quantity: 10,
          pointValue: 1,
          exit: 90,
          createdAt: Date.now() - 2000,
          closedAt: Date.now() - 1000,
        },
      ],
    };
    await expect(
      createPaperOrder({ id: 1 } as any, input),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  it("blocks a new plan when an enabled canonical overtrading guard is active", async () => {
    const now = Date.now();
    mock.workspace = {
      paperStartingBalance: 1000,
      settings: { enforceOvertrading: true, maxTradesPerDay: 1 },
      trades: [],
    };
    mock.proposal = { ...mock.proposal, initialRisk: 500 };
    mock.quote = {
      ...mock.quote,
      timestamp: now / 1000,
    };
    const closedTrade = {
      id: "closed-today",
      market: "UNIT",
      side: "long",
      status: "closed",
      entry: 100,
      stop: 90,
      target: 120,
      quantity: 1,
      pointValue: 1,
      strategyId: "unit",
      strategyName: "Synthetic closed trade",
      strategyVersion: 1,
      factors: [],
      journal: {},
      createdAt: now - 2_000,
      closedAt: now - 1_000,
      exit: 110,
    };
    mock.workspace.trades = [closedTrade];
    mock.closedHistory = [closedTrade];
    await expect(
      createPaperOrder({ id: 1 } as any, input),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("Daily closed-trade threshold"),
    });
    expect(mock.writes).toBe(0);
  });

  it("accepts a positive post-partial target below the former two-R floor", async () => {
    mock.record = {
      id: "UNIT",
      version: 1,
      status: "open",
      market: "UNIT",
      side: "long",
      entry: 100,
      stop: 100,
      target: 130,
      originalStop: 90,
      initialRisk: 100,
      initialQuantity: 10,
      quantity: 5,
      pointValue: 1,
      realizedPnl: 100,
      events: [],
    };
    expect(
      await editPaperTrade({ id: 1 } as any, {
        id: "UNIT",
        version: 1,
        stop: 100,
        target: 119,
      }),
    ).toMatchObject({ target: 119, initialRisk: 100, quantity: 5 });
  });

  it("rejects a cancelled-plan review that tries to alter its immutable bracket", async () => {
    mock.record = {
      id: "UNIT-CANCELLED",
      version: 4,
      status: "cancelled",
      market: "UNIT",
      side: "long",
      entry: 100,
      stop: 90,
      target: 120,
      quantity: 1,
      pointValue: 1,
      strategyId: "unit",
      strategyName: "Synthetic cancelled plan",
      strategyVersion: 1,
      factors: [],
      journal: {},
      createdAt: Date.now() - 1_000,
      autoManage: false,
    };

    await expect(
      editPaperTrade({ id: 1 } as any, {
        id: mock.record.id,
        version: 4,
        stop: 89,
        target: 121,
        autoManage: true,
        review: "Synthetic review only",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mock.writes).toBe(0);
  });

  it("rejects a duplicate-insert race when the stored proposal mode differs", async () => {
    mock.duplicateOnWrite = {
      id: "paper_UNIT-PROPOSAL",
      setupId: "UNIT-PROPOSAL",
      entryMode: "strategy",
    };

    await expect(
      createPaperOrder({ id: 1 } as any, {
        ...input,
        entryMode: "practice",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mock.writes).toBe(1);
  });
});

describe("pending paper discipline enforcement", () => {
  beforeEach(() => {
    mock.record = undefined;
    mock.duplicateOnWrite = undefined;
    mock.writes = 0;
    mock.expectedVersions = [];
    mock.closedHistory = [];
    mock.active = [];
    mock.quote = {
      price: 100,
      bid: 99.9,
      ask: 100,
      timestamp: Date.now() / 1000,
      status: "live",
      source: "Synthetic unit quote",
    };
  });

  it("defers a crossed limit before fill when an enabled canonical guard blocks entry", async () => {
    const now = Date.now();
    const pending = {
      id: "paper-discipline-pending",
      version: 1,
      status: "pending",
      orderType: "limit",
      market: "UNIT",
      side: "long",
      entry: 100,
      stop: 90,
      target: 120,
      quantity: 1,
      pointValue: 1,
      strategyId: "unit",
      strategyName: "Synthetic pending plan",
      strategyVersion: 1,
      strategyIds: ["unit"],
      strategyVersions: [1],
      timeframe: "5m",
      combination: "all",
      entryMode: "practice",
      factors: [],
      journal: {},
      createdAt: now - 1_000,
      autoManage: true,
      events: [],
    };
    const closedTrade = {
      ...pending,
      id: "closed-today",
      status: "closed",
      orderType: "market",
      entryMode: undefined,
      createdAt: now - 2_000,
      closedAt: now - 1_000,
      exit: 110,
    };
    mock.workspace = {
      settings: { enforceOvertrading: true, maxTradesPerDay: 1 },
      trades: [closedTrade],
    };
    mock.closedHistory = [closedTrade];
    mock.active = [pending];

    const result = await managePaperTrades({ id: 1 } as any);

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toMatchObject({
      id: pending.id,
      status: "pending",
      version: 2,
      gatePendingReason: expect.stringContaining(
        "Daily closed-trade threshold",
      ),
    });
    expect(
      result.trades[0].events?.some((event) => event.kind === "filled"),
    ).toBe(false);
    expect(result.checkedIds).toEqual([pending.id]);
    expect(mock.record).toMatchObject({ status: "pending", version: 2 });
  });

  it("reports a fresh checked ID even when an active plan has no transition", async () => {
    const pending = {
      id: "paper-checked-only",
      version: 1,
      status: "pending",
      orderType: "limit",
      market: "UNIT",
      side: "long",
      entry: 90,
      stop: 80,
      target: 110,
      quantity: 1,
      pointValue: 1,
      strategyId: "unit",
      strategyName: "Synthetic checked-only plan",
      strategyVersion: 1,
      factors: [],
      journal: {},
      createdAt: Date.now() - 1_000,
      autoManage: false,
    };
    mock.active = [pending];

    const result = await managePaperTrades({ id: 1 } as any);

    expect(result.trades).toEqual([]);
    expect(result.checkedIds).toEqual([pending.id]);
    expect(mock.writes).toBe(0);
  });
});

describe("pending paper cancellation", () => {
  const pending = () => ({
    id: "paper-pending",
    version: 4,
    status: "pending",
    orderType: "limit",
    market: "UNIT",
    side: "long",
    entry: 100,
    stop: 90,
    target: 120,
    quantity: 1,
    pointValue: 1,
    strategyId: "unit",
    strategyName: "Synthetic pending plan",
    strategyVersion: 1,
    factors: [],
    journal: {},
    createdAt: Date.now() - 1_000,
    autoManage: true,
    events: [
      {
        id: "paper-pending:created",
        kind: "created",
        at: Date.now() - 1_000,
        note: "Synthetic pending plan",
      },
    ],
  });

  beforeEach(() => {
    mock.record = undefined;
    mock.workspace = undefined;
    mock.duplicateOnWrite = undefined;
    mock.writes = 0;
    mock.expectedVersions = [];
    mock.closedHistory = [];
    mock.quote = {
      price: 100,
      bid: 99.9,
      ask: 100,
      timestamp: Date.now() / 1000,
      status: "live",
      source: "Synthetic unit quote",
    };
  });

  it("cancels only a version-matched pending plan after a fresh source quote", async () => {
    mock.record = pending();

    const cancelled = await cancelPaperTrade(
      { id: 1 } as any,
      mock.record.id,
      4,
    );

    expect(cancelled).toMatchObject({
      id: "paper-pending",
      status: "cancelled",
      version: 5,
      cancelledAt: expect.any(Number),
    });
    expect(cancelled.events?.at(-1)).toMatchObject({ kind: "cancelled" });
    expect(cancelled.events?.at(-1)?.note).toContain("Synthetic unit quote");
    expect(mock.expectedVersions).toEqual([4]);
    expect(mock.writes).toBe(1);
  });

  it("does not cancel with a stale quote or mutate the pending record", async () => {
    mock.record = pending();
    mock.quote.timestamp = Date.now() / 1000 - 121;

    await expect(
      cancelPaperTrade({ id: 1 } as any, mock.record.id, 4),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(mock.record).toMatchObject({ status: "pending", version: 4 });
    expect(mock.writes).toBe(0);
  });

  it("refuses filled/open plans and a stale optimistic version", async () => {
    mock.record = { ...pending(), status: "open" };
    await expect(
      cancelPaperTrade({ id: 1 } as any, mock.record.id, 4),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    mock.record = pending();
    await expect(
      cancelPaperTrade({ id: 1 } as any, mock.record.id, 3),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mock.writes).toBe(0);
  });

  it("returns an already-cancelled record before checking a replayed version", async () => {
    mock.record = { ...pending(), status: "cancelled", version: 5 };

    await expect(
      cancelPaperTrade({ id: 1 } as any, mock.record.id, 4),
    ).resolves.toBe(mock.record);
    expect(mock.writes).toBe(0);
  });
});
