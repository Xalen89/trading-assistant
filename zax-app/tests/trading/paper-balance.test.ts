import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  workspace: { paperStartingBalance: 1_000 } as any,
  pages: [] as any[],
  pageIndex: 0,
}));

vi.mock("../../server/trading/repository", () => ({
  loadWorkspace: async () => ({ workspace: mock.workspace }),
}));
vi.mock("../../server/trading/setup-history", () => ({
  paperHistory: async () => mock.pages[mock.pageIndex++] || { trades: [] },
}));

import { loadCanonicalPaperBalance } from "../../server/trading/paper-balance";

const trade = (overrides: Record<string, unknown> = {}) => ({
  id: "paper-unit",
  market: "UNIT",
  side: "long",
  status: "closed",
  entry: 100,
  stop: 90,
  target: 120,
  quantity: 1,
  pointValue: 1,
  strategyId: "unit",
  strategyName: "Synthetic only",
  strategyVersion: 1,
  factors: [],
  journal: {},
  createdAt: 1_700_000_000_000,
  exit: 110,
  ...overrides,
});

describe("loadCanonicalPaperBalance — mocked ledger only", () => {
  beforeEach(() => {
    mock.workspace = { paperStartingBalance: 1_000 };
    mock.pages = [{ trades: [] }];
    mock.pageIndex = 0;
  });

  it("adds complete closed and currently realised open P/L to canonical starting equity", async () => {
    mock.pages = [
      {
        trades: [
          trade(),
          trade({
            id: "paper-partial",
            status: "open",
            realizedPnl: 5,
            exit: undefined,
          }),
        ],
      },
    ];

    await expect(loadCanonicalPaperBalance(7)).resolves.toBe(1_015);
  });

  it("fails closed for a non-finite realized ledger value", async () => {
    mock.pages = [
      {
        trades: [trade({ status: "open", exit: undefined, realizedPnl: NaN })],
      },
    ];

    await expect(loadCanonicalPaperBalance(7)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  it("fails closed rather than silently truncating a ledger beyond the page bound", async () => {
    mock.pages = Array.from({ length: 20 }, (_, index) => ({
      trades: [],
      nextCursor: `synthetic-cursor-${index}`,
    }));

    await expect(loadCanonicalPaperBalance(7)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });
});
