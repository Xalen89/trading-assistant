import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  canonicalBalance: vi.fn(),
  proposePaper: vi.fn(),
  inserted: [] as any[],
}));

vi.mock("../../server/trading/access", () => ({ mayUseApp: () => true }));
vi.mock("../../server/trading/market", () => ({
  getQuote: async () => ({
    symbol: "BTC-USD",
    price: 100,
    bid: 99,
    ask: 101,
    change: 0,
    timestamp: Date.now() / 1_000,
    source: "fully mocked quote",
    status: "live" as const,
  }),
  getCandles: async (_market: string, timeframe: string) => {
    const seconds = { "1m": 60, "1h": 3_600, "1d": 86_400 }[timeframe] || 60;
    const now = Math.floor(Date.now() / 1_000);
    return {
      candles: Array.from({ length: 20 }, (_, index) => ({
        time: now - (21 - index) * seconds,
        open: 100,
        high: 102,
        low: 99,
        close: 101,
        volume: 1,
      })),
      source: "fully mocked candles",
      sourceIdentity: "mocked-feed-origin",
      requestedAt: Date.now(),
      fetchedAt: Date.now(),
      timezone: "UTC",
      status: "historical" as const,
      volumeBasis: "venue" as const,
      dailyPeriodBasis: "utc-continuous-24h" as const,
    };
  },
}));
vi.mock("../../server/trading/repository", () => ({
  loadWorkspace: async () => ({ workspace: null }),
  dbRequired: async () => ({
    insert: () => ({
      values: async (value: unknown) => mock.inserted.push(value),
    }),
  }),
}));
vi.mock("../../server/trading/setup-history", () => ({
  digest: (value: unknown) => JSON.stringify(value),
  retainBars: vi.fn(),
  retainedBars: vi.fn(),
  retainSetup: vi.fn(),
}));
vi.mock("../../server/trading/paper-balance", () => ({
  loadCanonicalPaperBalance: mock.canonicalBalance,
}));
vi.mock("../../lib/trading/confluence-runtime", () => ({
  confluenceForAnalysis: () => [],
}));
vi.mock("../../lib/trading/setup-engine", () => ({
  analyzeSetups: (input: any) => ({
    candles: input.candles,
    messages: [],
    candidates: [],
  }),
  proposePaper: mock.proposePaper,
}));

import { WR1 } from "../../lib/trading/model";
import { createProposal } from "../../server/trading/setup-service";

beforeEach(() => {
  mock.canonicalBalance.mockReset();
  mock.proposePaper.mockReset();
  mock.inserted = [];
  mock.canonicalBalance.mockResolvedValue(12_345);
  mock.proposePaper.mockReturnValue({ rationale: [] });
});

describe("paper proposal sizing — canonical balance only (fully mocked)", () => {
  it("ignores the client compatibility balance and supplies the complete-ledger balance", async () => {
    await createProposal({ id: 42 } as any, {
      market: "BTC-USD",
      timeframe: "1m",
      strategyIds: [WR1.id],
      strategies: [WR1],
      combination: "any",
      timezone: "Etc/UTC",
      side: "long",
      balance: 999_999_999,
      riskPct: 1,
    });

    expect(mock.canonicalBalance).toHaveBeenCalledWith(42);
    expect(mock.proposePaper).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "BTC-USD" }),
      "long",
      101,
      12_345,
      1,
    );
    expect(mock.inserted).toHaveLength(1);
  });
});
