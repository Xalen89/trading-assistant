import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../../drizzle/schema";

const mocks = vi.hoisted(() => ({
  mayUseApp: vi.fn(),
  dbRequired: vi.fn(),
}));

vi.mock("../../server/trading/access", () => ({
  mayUseApp: mocks.mayUseApp,
}));
vi.mock("../../server/trading/repository", () => ({
  dbRequired: mocks.dbRequired,
}));

import {
  observeStrategyQuote,
  strategyQuoteObservationId,
  transitionStrategyQuoteObservation,
} from "../../server/trading/strategy-quote-observations";

type RuntimeRow = { payload: unknown };
type MemoryState = {
  row?: RuntimeRow;
  duplicateOnce?: boolean;
  concurrentPayload?: unknown;
};

type Audit = {
  locks: number;
  inserts: number;
  updates: number;
  transactions: number;
};

const owner = {
  id: 7,
  openId: "approved-owner",
  role: "admin",
  createdAt: new Date(0),
  updatedAt: new Date(0),
  lastSignedIn: new Date(0),
} as User;
const nonOwner = { ...owner, id: 8, openId: "not-owner" } as User;

function quote(
  timestamp: number,
  changes: Partial<{
    symbol: string;
    source: string;
    price: number;
    change: number;
    status: "live" | "stale" | "unavailable";
    sourceIdentity: string;
  }> = {},
) {
  return {
    symbol: "BTC-USD",
    source: "Coinbase Exchange · public REST · provider timestamp",
    price: 100,
    change: 0.5,
    timestamp,
    status: "live" as const,
    ...changes,
  };
}

/** A small transactional Drizzle double; it performs no network/database I/O. */
function memoryDb(state: MemoryState, audit: Audit) {
  function client() {
    return {
      select() {
        return {
          from() {
            const query: any = {
              where() {
                return query;
              },
              limit() {
                return query;
              },
              for() {
                audit.locks += 1;
                return query;
              },
              then(
                resolve: (rows: RuntimeRow[]) => unknown,
                reject: (error: unknown) => unknown,
              ) {
                return Promise.resolve(state.row ? [state.row] : []).then(
                  resolve,
                  reject,
                );
              },
            };
            return query;
          },
        };
      },
      update() {
        return {
          set(values: { payload: unknown }) {
            return {
              async where() {
                audit.updates += 1;
                if (state.row) state.row.payload = values.payload;
                return [{ affectedRows: state.row ? 1 : 0 }];
              },
            };
          },
        };
      },
      insert() {
        return {
          async values(values: { payload: unknown }) {
            audit.inserts += 1;
            if (state.duplicateOnce) {
              state.duplicateOnce = false;
              state.row = { payload: state.concurrentPayload };
              const error = Object.assign(new Error("Duplicate entry"), {
                code: "ER_DUP_ENTRY",
              });
              throw error;
            }
            state.row = { payload: values.payload };
            return [{ affectedRows: 1 }];
          },
        };
      },
    };
  }
  return {
    transaction: vi.fn(async (callback: (tx: any) => Promise<unknown>) => {
      audit.transactions += 1;
      return callback(client());
    }),
  };
}

function stored(firstAt = 990, secondAt = 1_000) {
  const first = transitionStrategyQuoteObservation(
    undefined,
    quote(firstAt),
    firstAt,
  );
  if (first.action !== "store") throw new Error("fixture failed");
  const second = transitionStrategyQuoteObservation(
    first.record,
    quote(secondAt, { price: 101 }),
    secondAt,
  );
  if (second.action !== "store") throw new Error("fixture failed");
  return second.record;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.mayUseApp.mockImplementation(
    (user: User) => user.openId === owner.openId,
  );
});

describe("transitionStrategyQuoteObservation", () => {
  it("stores a first valid quote as a baseline without inventing a prior cross", () => {
    const result = transitionStrategyQuoteObservation(
      undefined,
      quote(1_000),
      1_000,
    );

    expect(result).toMatchObject({
      action: "store",
      pair: {
        current: quote(1_000),
        observedAt: 1_000,
        method: "owner-persisted-rest-observations",
      },
      record: { last: quote(1_000), capturedAt: 1_000 },
    });
    expect(result.action === "store" && result.pair.previous).toBeUndefined();
  });

  it("reuses only an identical same-timestamp persisted pair for thirty seconds", () => {
    const result = transitionStrategyQuoteObservation(
      stored(),
      quote(1_000, { price: 101 }),
      1_015,
    );

    expect(result).toMatchObject({
      action: "reuse",
      pair: {
        previous: expect.objectContaining({ price: 100, timestamp: 990 }),
        current: expect.objectContaining({ price: 101, timestamp: 1_000 }),
        observedAt: 1_000,
      },
    });
  });

  it("rejects contradictory same-timestamp prices and out-of-order quotes", () => {
    const record = stored();
    expect(
      transitionStrategyQuoteObservation(
        record,
        quote(1_000, { price: 102 }),
        1_001,
      ),
    ).toEqual({ action: "reject" });
    expect(
      transitionStrategyQuoteObservation(
        record,
        quote(999, { price: 99 }),
        1_000,
      ),
    ).toEqual({ action: "reject" });
  });

  it("uses exact source and symbol boundaries instead of crossing providers", () => {
    const wrongSource = transitionStrategyQuoteObservation(
      stored(),
      quote(1_010, { source: "FMP · provider quote (may be delayed)" }),
      1_010,
    );
    const wrongSymbol = transitionStrategyQuoteObservation(
      stored(),
      quote(1_010, { symbol: "ETH-USD" }),
      1_010,
    );

    expect(wrongSource).toEqual({ action: "reject" });
    expect(wrongSymbol).toEqual({ action: "reject" });
  });

  it("persists declared opaque identities and rejects a same-label identity substitution", () => {
    const first = transitionStrategyQuoteObservation(
      undefined,
      quote(1_000, { sourceIdentity: "opaque-source-A" }),
      1_000,
    );
    if (first.action !== "store") throw new Error("fixture failed");
    expect(first.record).toMatchObject({ sourceIdentity: "opaque-source-A" });
    expect(first.pair).toMatchObject({ sourceIdentity: "opaque-source-A" });
    expect(
      transitionStrategyQuoteObservation(
        first.record,
        quote(1_010, { sourceIdentity: "opaque-source-B" }),
        1_010,
      ),
    ).toEqual({ action: "reject" });

    const legacy = transitionStrategyQuoteObservation(
      undefined,
      quote(1_000),
      1_000,
    );
    expect(legacy.action === "store" && legacy.record).not.toHaveProperty(
      "sourceIdentity",
    );
  });

  it("rejects future, stale, millisecond, non-live, and non-finite quote inputs", () => {
    expect(
      transitionStrategyQuoteObservation(undefined, quote(1_001), 1_000),
    ).toEqual({ action: "reject" });
    expect(
      transitionStrategyQuoteObservation(undefined, quote(969), 1_000),
    ).toEqual({ action: "reject" });
    expect(
      transitionStrategyQuoteObservation(
        undefined,
        quote(1_000_000_000_000),
        1_000,
      ),
    ).toEqual({ action: "reject" });
    expect(
      transitionStrategyQuoteObservation(
        undefined,
        quote(1_000, { status: "stale" }),
        1_000,
      ),
    ).toEqual({ action: "reject" });
    expect(
      transitionStrategyQuoteObservation(
        undefined,
        quote(1_000, { price: Number.NaN }),
        1_000,
      ),
    ).toEqual({ action: "reject" });
  });

  it("withholds a prior after a gap over ninety seconds, then permits the next interval", () => {
    const first = transitionStrategyQuoteObservation(
      undefined,
      quote(900),
      900,
    );
    if (first.action !== "store") throw new Error("fixture failed");
    const gap = transitionStrategyQuoteObservation(
      first.record,
      quote(1_000, { price: 101 }),
      1_000,
    );
    if (gap.action !== "store") throw new Error("fixture failed");
    const next = transitionStrategyQuoteObservation(
      gap.record,
      quote(1_005, { price: 102 }),
      1_005,
    );

    expect(gap.pair.previous).toBeUndefined();
    expect(next).toMatchObject({
      action: "store",
      pair: {
        previous: expect.objectContaining({ timestamp: 1_000, price: 101 }),
      },
    });
  });

  it("drops a forged persisted prior rather than presenting it as a cross", () => {
    const forged = {
      ...stored(),
      previous: quote(999, { source: "forged other provider", price: 1 }),
    };
    const result = transitionStrategyQuoteObservation(
      forged,
      quote(1_000, { price: 101 }),
      1_005,
    );

    expect(result).toMatchObject({
      action: "reuse",
      pair: { current: expect.objectContaining({ price: 101 }) },
    });
    expect(result.action === "reuse" && result.pair.previous).toBeUndefined();
  });
});

describe("observeStrategyQuote", () => {
  it("durably inserts the first actual quote under a locked owner/source row", async () => {
    const state: MemoryState = {};
    const audit: Audit = { locks: 0, inserts: 0, updates: 0, transactions: 0 };
    mocks.dbRequired.mockResolvedValue(memoryDb(state, audit));

    const result = await observeStrategyQuote(owner, quote(1_000), 1_000);

    expect(result).toMatchObject({ current: quote(1_000), observedAt: 1_000 });
    expect(result?.previous).toBeUndefined();
    expect(audit).toEqual({
      locks: 1,
      inserts: 1,
      updates: 0,
      transactions: 1,
    });
    expect(state.row).toMatchObject({
      payload: { last: quote(1_000), capturedAt: 1_000 },
    });
  });

  it("returns the cached durable pair without a write and never advances its capture time", async () => {
    const state: MemoryState = { row: { payload: stored() } };
    const audit: Audit = { locks: 0, inserts: 0, updates: 0, transactions: 0 };
    mocks.dbRequired.mockResolvedValue(memoryDb(state, audit));

    const result = await observeStrategyQuote(
      owner,
      quote(1_000, { price: 101 }),
      1_015,
    );

    expect(result).toMatchObject({
      observedAt: 1_000,
      previous: expect.objectContaining({ price: 100 }),
    });
    expect(audit).toEqual({
      locks: 1,
      inserts: 0,
      updates: 0,
      transactions: 1,
    });
    expect(state.row).toMatchObject({ payload: { capturedAt: 1_000 } });
  });

  it("does not mutate a durable latest quote for conflicting or out-of-order input", async () => {
    const payload = stored();
    const state: MemoryState = { row: { payload } };
    const audit: Audit = { locks: 0, inserts: 0, updates: 0, transactions: 0 };
    mocks.dbRequired.mockResolvedValue(memoryDb(state, audit));

    await expect(
      observeStrategyQuote(owner, quote(1_000, { price: 999 }), 1_001),
    ).resolves.toBeUndefined();
    await expect(
      observeStrategyQuote(owner, quote(999, { price: 99 }), 1_000),
    ).resolves.toBeUndefined();

    expect(state.row?.payload).toBe(payload);
    expect(audit).toMatchObject({ inserts: 0, updates: 0, locks: 2 });
  });

  it("retries one duplicate insert race and reevaluates the newer durable row", async () => {
    const concurrent = transitionStrategyQuoteObservation(
      undefined,
      quote(1_000),
      1_000,
    );
    if (concurrent.action !== "store") throw new Error("fixture failed");
    const state: MemoryState = {
      duplicateOnce: true,
      concurrentPayload: concurrent.record,
    };
    const audit: Audit = { locks: 0, inserts: 0, updates: 0, transactions: 0 };
    mocks.dbRequired.mockResolvedValue(memoryDb(state, audit));

    const result = await observeStrategyQuote(owner, quote(1_000), 1_000);

    expect(result).toMatchObject({ current: quote(1_000), observedAt: 1_000 });
    expect(audit).toEqual({
      locks: 2,
      inserts: 1,
      updates: 0,
      transactions: 2,
    });
  });

  it("does not clobber a newer row when a late callback loses an insert race", async () => {
    const concurrent = transitionStrategyQuoteObservation(
      undefined,
      quote(1_001, { price: 101 }),
      1_001,
    );
    if (concurrent.action !== "store") throw new Error("fixture failed");
    const state: MemoryState = {
      duplicateOnce: true,
      concurrentPayload: concurrent.record,
    };
    const audit: Audit = { locks: 0, inserts: 0, updates: 0, transactions: 0 };
    mocks.dbRequired.mockResolvedValue(memoryDb(state, audit));

    await expect(
      observeStrategyQuote(owner, quote(1_000), 1_001),
    ).resolves.toBeUndefined();

    expect(state.row).toMatchObject({
      payload: {
        last: expect.objectContaining({ timestamp: 1_001, price: 101 }),
      },
    });
    expect(audit).toEqual({
      locks: 2,
      inserts: 1,
      updates: 0,
      transactions: 2,
    });
  });

  it("does not access storage for an unapproved user and uses owner-specific stable keys", async () => {
    const result = await observeStrategyQuote(nonOwner, quote(1_000), 1_000);

    expect(result).toBeUndefined();
    expect(mocks.dbRequired).not.toHaveBeenCalled();
    expect(
      strategyQuoteObservationId(owner.id, "BTC-USD", "same source"),
    ).not.toBe(
      strategyQuoteObservationId(nonOwner.id, "BTC-USD", "same source"),
    );
  });

  it("fails closed as unknown/not-ready when durable storage is unavailable", async () => {
    mocks.dbRequired.mockRejectedValue(new Error("database unavailable"));

    await expect(
      observeStrategyQuote(owner, quote(1_000), 1_000),
    ).resolves.toBeUndefined();
  });
});
