import { describe, it, expect } from "vitest";
import {
  orderBookInputSchema,
  orderBookReportSchema,
} from "../../server/trading/orderbook-validation";
import { researchStartSchema } from "../../server/trading/research-jobs";
import { appRouter } from "../../server/routers";
import { WR1 } from "../../lib/trading/model";
const book = () => ({
  instrument: "UNIT_SYNTHETIC_BOOK",
  source: "Artificial unit fixture only; not trading evidence",
  rightsConfirmed: true as const,
  snapshots: Array.from({ length: 500 }, (_, i) => ({
    time: 1_700_000_000 + i,
    bids: [
      { price: 99, quantity: 1 },
      { price: 98, quantity: 2 },
      { price: 97, quantity: 3 },
    ],
    asks: [
      { price: 101, quantity: 1 },
      { price: 102, quantity: 2 },
      { price: 103, quantity: 3 },
    ],
  })),
  spec: {
    horizonSeconds: 600 as const,
    trainingSeconds: 1800 as const,
    testSeconds: 10 as const,
    maxFolds: 1,
  },
});
const request = () => ({
  kind: "orderbook" as const,
  market: "BTC-USD",
  timeframe: "1m" as const,
  strategy: WR1,
  confirmations: {},
  weeklyBias: "Neutral" as const,
  trades: [],
  startingBalance: 100000,
  book: book(),
});
describe("private offline book input", () => {
  it("requires explicit rights and actual three-level snapshots, not OHLC", () => {
    expect(orderBookInputSchema.safeParse(book()).success).toBe(true);
    expect(
      orderBookInputSchema.safeParse({ ...book(), rightsConfirmed: false })
        .success,
    ).toBe(false);
    expect(
      orderBookInputSchema.safeParse({
        ...book(),
        snapshots: [{ time: 1, open: 1, high: 2, low: 1, close: 1, volume: 1 }],
      }).success,
    ).toBe(false);
  });
  it("rejects unsorted/future/crossed books and empty depth rather than repairing them", () => {
    const x = book();
    x.snapshots[1].time = x.snapshots[0].time;
    expect(orderBookInputSchema.safeParse(x).success).toBe(false);
    const y = book();
    y.snapshots[0].bids[0].price = 102;
    expect(orderBookInputSchema.safeParse(y).success).toBe(false);
    const z = book();
    z.snapshots[0].bids.forEach((b) => (b.quantity = 0));
    expect(orderBookInputSchema.safeParse(z).success).toBe(false);
  });
  it("requires book-specific mode and does not attach books to LLM discussion", () => {
    expect(researchStartSchema.safeParse(request()).success).toBe(true);
    expect(
      researchStartSchema.safeParse({ ...request(), book: undefined }).success,
    ).toBe(false);
    expect(
      researchStartSchema.safeParse({ ...request(), kind: "discussion" })
        .success,
    ).toBe(false);
  });
  it("keeps starts owner authenticated and never accepts probability", async () => {
    const caller = appRouter.createCaller({
      user: null,
      req: { headers: {} },
      res: {},
    } as any);
    await expect(caller.research.start(request())).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(
      orderBookReportSchema.safeParse({
        kind: "orderbook-ml",
        engine: "unit",
        instrument: "UNIT",
        source: "unit",
        generatedAt: 1,
        snapshots: 500,
        featureRows: 0,
        features: 64,
        horizonSeconds: 600,
        models: [],
        limitations: [],
        probability: 0.87,
      }).success,
    ).toBe(false);
  });
});
