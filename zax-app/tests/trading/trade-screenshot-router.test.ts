import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../../server/_core/context";

const mocks = vi.hoisted(() => ({
  listScreenshotSources: vi.fn(),
  tradeScreenshotReviewDefinition: vi.fn(),
  uploadTradeScreenshot: vi.fn(),
  analyzeTradeScreenshot: vi.fn(),
  confirmTradeScreenshotReview: vi.fn(),
}));

vi.mock("../../server/trading/access", async () => {
  const core = await vi.importActual<typeof import("../../server/_core/trpc")>(
    "../../server/_core/trpc",
  );
  return { ownerProcedure: core.protectedProcedure };
});
vi.mock("../../server/trading/repository", () => ({
  listScreenshotSources: mocks.listScreenshotSources,
}));
vi.mock("../../server/trading/trade-screenshot-service", () => ({
  tradeScreenshotReviewDefinition: mocks.tradeScreenshotReviewDefinition,
  uploadTradeScreenshot: mocks.uploadTradeScreenshot,
  analyzeTradeScreenshot: mocks.analyzeTradeScreenshot,
  confirmTradeScreenshotReview: mocks.confirmTradeScreenshotReview,
}));

import { tradeScreenshotRouter } from "../../server/trading/trade-screenshot-router";

function context(user: { id: number } | null): TrpcContext {
  return { user, req: {}, res: {} } as unknown as TrpcContext;
}

describe("trade screenshot router remount inventory", () => {
  it("filters retained originals by immutable context when review analysis has not produced a draft", async () => {
    mocks.listScreenshotSources.mockResolvedValue([
      {
        id: "source-linked",
        name: "Screenshot review · linked synthetic",
        version: 1,
        linkedTradeId: undefined,
      },
      {
        id: "source-standalone",
        name: "Screenshot review · standalone synthetic",
        version: 1,
        linkedTradeId: undefined,
      },
    ]);
    mocks.tradeScreenshotReviewDefinition.mockImplementation(
      async (_userId: number, sourceId: string) => ({
        id: sourceId,
        sourceContext:
          sourceId === "source-linked"
            ? {
                canonicalTradeId: "paper-linked",
                linkage: "owner-scoped-canonical-record",
                market: "BTC-USD",
                timeframe: "15m",
                strategyId: "strategy-linked",
                strategyVersion: 2,
              }
            : {
                canonicalTradeId: null,
                linkage: "standalone",
                market: "BTC-USD",
                timeframe: "15m",
                strategyId: "strategy-standalone",
                strategyVersion: 2,
              },
      }),
    );

    const caller = tradeScreenshotRouter.createCaller(context({ id: 42 }));
    const listed = await caller.list({ tradeId: "paper-linked" });

    expect(mocks.listScreenshotSources).toHaveBeenCalledWith(42);
    expect(mocks.tradeScreenshotReviewDefinition).toHaveBeenCalledTimes(2);
    expect(listed).toEqual([
      expect.objectContaining({
        id: "source-linked",
        linkedTradeId: "paper-linked",
        sourceContext: expect.objectContaining({
          canonicalTradeId: "paper-linked",
          strategyVersion: 2,
        }),
      }),
    ]);
  });
});
