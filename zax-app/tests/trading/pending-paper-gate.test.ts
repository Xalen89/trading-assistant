import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Trade } from "../../lib/trading/model";

const mock = vi.hoisted(() => ({
  trades: [] as any[],
  workspace: undefined as any,
  quote: undefined as any,
  analysis: undefined as any,
  writes: [] as any[],
  setup: vi.fn(),
  enforce: vi.fn(),
}));

vi.mock("../../server/trading/repository", () => ({
  loadWorkspace: async () => ({ workspace: mock.workspace }),
}));
vi.mock("../../server/trading/market", () => ({
  getQuote: async () => mock.quote,
}));
vi.mock("../../server/trading/setup-service", () => ({
  marketFor: vi.fn(),
  readProposal: vi.fn(),
  setupAnalysis: (...args: any[]) => mock.setup(...args),
}));
vi.mock("../../server/trading/paper-gate", () => ({
  paperEntryEvidence: vi.fn(),
  enforceStrategyGate: (...args: any[]) => mock.enforce(...args),
}));
vi.mock("../../lib/trading/trade-features", () => ({
  tradeFeatureSnapshot: vi.fn(() => ({
    version: 1,
    asOf: Date.now(),
    source: "Synthetic entry feature fixture only",
    values: {},
    regime: "unknown",
    volatilityRegime: "unknown",
    missing: [],
  })),
}));
vi.mock("../../server/trading/setup-history", () => ({
  activePaperTrades: async () => mock.trades,
  writePaperTrade: async (_userId: number, trade: Trade) => {
    const stored = structuredClone(trade);
    mock.writes.push(stored);
    mock.trades = [stored];
    return stored;
  },
  paperTrade: vi.fn(),
  paperHistory: async () => ({ trades: [] }),
  paperRevisions: async () => [],
}));

import { managePaperTrades } from "../../server/trading/paper-service";

const currentSnapshot = (configVersion = 1) => ({
  timestampUnit: "unix-epoch-milliseconds" as const,
  evaluatedAt: Date.now(),
  decisionBarOpenAt: Date.now() - 300_000,
  deterministicScore: 100,
  threshold: 50,
  gateMet: true,
  strategyEntryEligible: true,
  version: {
    contractVersion: 1 as const,
    strategyId: "synthetic-strategy",
    strategyVersion: 1,
    configVersion,
  },
  approval: { status: "approved" as const, approvedAt: Date.now() - 1, approvedBy: "unit" },
  trigger: null,
  checklist: [],
});

const strategy = (configVersion = 1) => ({
  id: "synthetic-strategy",
  name: "Synthetic strategy only",
  description: "Synthetic fixture; no persisted strategy data.",
  color: "#FFFFFF",
  kind: "strategy" as const,
  visible: true,
  version: 1,
  factors: [],
  confluence: {
    contract: {
      contractVersion: 1 as const,
      strategyId: "synthetic-strategy",
      strategyVersion: 1,
      configVersion,
      approval: { status: "approved" as const, approvedAt: Date.now() - 1, approvedBy: "unit" },
      trigger: { id: "trigger", name: "Synthetic", predicate: "synthetic", source: { id: "unit", name: "Synthetic", required: true, freshness: { maxAgeMs: 60_000 } } },
      conditions: [],
      threshold: 50,
    },
    binding: { triggerStepId: "trigger", side: "long" as const, conditions: [] },
  },
});

const pending = (overrides: Partial<Trade> = {}): Trade => {
  const at = Date.now() - 2_000;
  return {
    id: "synthetic-pending",
    market: "UNIT",
    side: "long",
    status: "pending",
    entry: 100,
    stop: 95,
    target: 115,
    quantity: 10,
    pointValue: 1,
    strategyId: "synthetic-strategy",
    strategyName: "Synthetic strategy only",
    strategyVersion: 1,
    strategyIds: ["synthetic-strategy"],
    strategyVersions: [1],
    timeframe: "5m",
    combination: "all",
    snapshotPhase: "placement",
    factors: [],
    journal: { fixture: "Synthetic only; no database." },
    createdAt: at,
    version: 1,
    orderType: "limit",
    autoManage: false,
    entryMode: "strategy",
    initialRisk: 50,
    initialQuantity: 10,
    originalStop: 95,
    originalTarget: 115,
    confluenceSnapshots: [currentSnapshot(1)],
    events: [{ id: "synthetic-created", kind: "created", at, note: "Synthetic only." }],
    ...overrides,
  };
};

const analysis = () => ({
  market: "UNIT",
  timeframe: "5m" as const,
  asOf: Math.floor(Date.now() / 1000),
  source: "Synthetic closed bars only",
  candles: [],
  candidates: [],
  confluences: [],
  levels: [],
  estimate: { rate: null, wins: 0, losses: 0, unresolved: 0, ambiguous: 0, samples: 0, horizon: 0, costs: "synthetic", label: "synthetic", probability: null },
  rhythm: null,
  messages: [],
  selectedStrategyIds: ["synthetic-strategy"],
  combination: "all" as const,
  confluenceEvaluations: { "synthetic-strategy": { snapshot: currentSnapshot(1) } },
});

describe("pending paper entry gate — synthetic mocks only, no database", () => {
  beforeEach(() => {
    mock.writes = [];
    mock.setup.mockReset();
    mock.enforce.mockReset();
    mock.analysis = analysis();
    mock.setup.mockResolvedValue(mock.analysis);
    mock.enforce.mockReturnValue({ "synthetic-strategy": { snapshot: currentSnapshot(1) } });
    mock.workspace = {
      settings: { timezone: "Etc/GMT+5" },
      strategies: [strategy(1)],
    };
    mock.quote = {
      price: 99.5,
      bid: 99.4,
      ask: 99.5,
      timestamp: Date.now() / 1000,
      source: "Synthetic fresh quote only",
      status: "live",
    };
    mock.trades = [pending()];
  });

  it("re-evaluates current canonical strategy evidence at a strategy limit fill", async () => {
    const result = await managePaperTrades({ id: 7 } as any, Date.now() + 10_000);

    expect(mock.setup).toHaveBeenCalledWith(
      { id: 7 },
      {
        market: "UNIT",
        timeframe: "5m",
        strategies: mock.workspace.strategies,
        strategyIds: ["synthetic-strategy"],
        combination: "all",
        timezone: "Etc/GMT+5",
      },
      expect.any(Number),
      { proposalOnly: true },
    );
    expect(mock.enforce).toHaveBeenCalledWith(
      expect.objectContaining({ side: "long", strategyVersions: [1] }),
      mock.workspace.strategies,
      mock.analysis,
      expect.any(Number),
    );
    expect(result.trades).toHaveLength(1);
    expect(mock.writes[0]).toMatchObject({
      status: "open",
      entry: 99.5,
      autoManage: false,
      snapshotPhase: "entry",
      confluenceSnapshots: [expect.objectContaining({
        version: expect.objectContaining({ configVersion: 1 }),
        strategyEntryEligible: true,
      })],
    });
    expect(mock.writes[0].gatePendingReason).toBeUndefined();
  });

  it("does not fill after a saved configuration version changes and does not repeat the same wait write", async () => {
    mock.workspace.strategies = [strategy(2)];
    await managePaperTrades({ id: 7 } as any, Date.now() + 10_000);
    expect(mock.setup).not.toHaveBeenCalled();
    expect(mock.writes).toHaveLength(1);
    expect(mock.writes[0]).toMatchObject({
      status: "pending",
      gatePendingReason: expect.stringContaining("configuration changed"),
    });

    await managePaperTrades({ id: 7 } as any, Date.now() + 10_000);
    expect(mock.writes).toHaveLength(1);
  });

  it("opens a practice limit from observed entry data without turning on automatic brackets", async () => {
    mock.trades = [pending({ entryMode: "practice", confluenceSnapshots: [currentSnapshot(1)] })];
    const result = await managePaperTrades({ id: 7 } as any, Date.now() + 10_000);
    expect(result.trades).toHaveLength(1);
    expect(mock.writes[0]).toMatchObject({
      status: "open",
      autoManage: false,
      snapshotPhase: "entry",
      entry: 99.5,
    });
    expect(mock.enforce).not.toHaveBeenCalled();
  });

  it("retains a changing excursion for an open manual trade without auto-exiting it", async () => {
    mock.trades = [pending({
      status: "open",
      orderType: "market",
      entryMode: "practice",
      openedAt: Date.now() - 2_000,
      entry: 100,
      stop: 95,
      target: 115,
      autoManage: false,
      initialRisk: 50,
    })];
    mock.quote = { ...mock.quote, bid: 95, ask: 95.1, price: 95 };

    await managePaperTrades({ id: 7 } as any, Date.now() + 10_000);
    expect(mock.writes[0]).toMatchObject({
      status: "open",
      autoManage: false,
      excursion: { maeR: 1, mfeR: 0, samples: 1, method: "observed-quotes" },
    });
    expect(mock.writes[0].exit).toBeUndefined();
    expect(mock.writes[0].journal.excursionSampling).toBe(
      "foreground-sampled-not-full-tick-path",
    );
  });
});
