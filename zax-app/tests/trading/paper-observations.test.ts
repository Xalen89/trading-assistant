import { describe, expect, it } from "vitest";
import type { Quote, Trade } from "../../lib/trading/model";
import {
  observePaperExcursion,
  observedLimitFillPrice,
  openObservedPaperLimit,
} from "../../lib/trading/paper-observations";

const createdAt = 1_700_000_000_000;

const trade = (overrides: Partial<Trade> = {}): Trade => ({
  id: "synthetic-paper-observation",
  market: "UNIT",
  side: "long",
  status: "pending",
  entry: 100,
  stop: 95,
  target: 115,
  quantity: 10,
  pointValue: 1,
  strategyId: "synthetic-only",
  strategyName: "Synthetic fixture only",
  strategyVersion: 1,
  factors: [],
  journal: {},
  createdAt,
  version: 1,
  orderType: "limit",
  autoManage: false,
  initialQuantity: 10,
  originalStop: 95,
  originalTarget: 115,
  events: [{ id: "synthetic:created", kind: "created", at: createdAt, note: "Synthetic only." }],
  ...overrides,
});

const quote = (overrides: Partial<Quote> = {}): Quote => ({
  symbol: "UNIT",
  price: 100,
  change: 0,
  bid: 99.9,
  ask: 100,
  timestamp: (createdAt + 1_000) / 1000,
  source: "Synthetic quote only",
  status: "live",
  ...overrides,
});

describe("paper observations — synthetic fixtures only", () => {
  it("opens a manual-practice long limit on the real ask without enabling bracket automation", () => {
    const pending = trade();
    const observed = {
      time: createdAt + 1_000,
      bid: 99.4,
      ask: 99.5,
      source: "Synthetic long side quote",
    };
    const opened = openObservedPaperLimit(pending, observed, createdAt + 2_000);

    expect(opened).toMatchObject({
      status: "open",
      entry: 99.5,
      openedAt: createdAt + 1_000,
      autoManage: false,
      quantity: 10,
      stop: 95,
      target: 115,
      initialRisk: 45,
      partialAt: 108.5,
      version: 2,
    });
    expect(opened?.events?.at(-1)).toMatchObject({
      kind: "filled",
      price: 99.5,
      quantity: 10,
    });
  });

  it("uses only the executable side and rejects pre-entry, price-only, and invalid-bracket observations", () => {
    const pending = trade();
    expect(
      observedLimitFillPrice(
        pending,
        { time: createdAt + 1_000, bid: 99, source: "Synthetic price-only ask" },
        createdAt + 2_000,
      ),
    ).toBeUndefined();
    expect(
      observedLimitFillPrice(
        pending,
        { time: createdAt - 1, bid: 99, ask: 99, source: "Synthetic pre-entry quote" },
        createdAt + 2_000,
      ),
    ).toBeUndefined();
    expect(
      openObservedPaperLimit(
        trade({ target: 99, originalTarget: 99 }),
        { time: createdAt + 1_000, bid: 98.9, ask: 99, source: "Synthetic bad geometry" },
        createdAt + 2_000,
      ),
    ).toBeUndefined();
  });

  it("uses the short bid to fill a short limit and keeps the selected bracket and quantity", () => {
    const pending = trade({
      side: "short",
      entry: 100,
      stop: 105,
      target: 90,
      originalStop: 105,
      originalTarget: 90,
      quantity: 4,
      initialQuantity: 4,
    });
    const opened = openObservedPaperLimit(
      pending,
      { time: createdAt + 1_000, bid: 100.5, ask: 100.7, source: "Synthetic short side quote" },
      createdAt + 2_000,
    );
    expect(opened).toMatchObject({
      status: "open",
      entry: 100.5,
      stop: 105,
      target: 90,
      quantity: 4,
      autoManage: false,
      initialRisk: 18,
      partialAt: 91.5,
    });
  });

  it("retains only changing MAE/MFE extrema from fresh real side quotes", () => {
    const open = trade({
      status: "open",
      orderType: "market",
      entry: 100,
      stop: 95,
      target: 115,
      openedAt: createdAt,
      initialRisk: 50,
      initialQuantity: 10,
    });
    const adverse = observePaperExcursion(
      open,
      quote({ bid: 95, ask: 95.1, timestamp: (createdAt + 1_000) / 1000 }),
      createdAt + 2_000,
    );
    expect(adverse).toEqual({
      maeR: 1,
      mfeR: 0,
      observedAt: createdAt + 1_000,
      samples: 1,
      method: "observed-quotes",
      sampling: "foreground-sampled-not-full-tick-path",
    });

    const favorable = observePaperExcursion(
      { ...open, excursion: adverse && (({ sampling: _sampling, ...stored }) => stored)(adverse) },
      quote({ bid: 110, ask: 110.1, timestamp: (createdAt + 2_000) / 1000 }),
      createdAt + 3_000,
    );
    expect(favorable).toMatchObject({ maeR: 1, mfeR: 2, samples: 2 });

    const unchanged = observePaperExcursion(
      {
        ...open,
        excursion: favorable && (({ sampling: _sampling, ...stored }) => stored)(favorable),
      },
      quote({ bid: 108, ask: 108.1, timestamp: (createdAt + 3_000) / 1000 }),
      createdAt + 4_000,
    );
    expect(unchanged).toBeUndefined();
  });

  it("rejects future, pre-entry, and price-only excursion observations", () => {
    const open = trade({
      status: "open",
      orderType: "market",
      openedAt: createdAt + 1_000,
      initialRisk: 50,
      initialQuantity: 10,
    });
    expect(
      observePaperExcursion(
        open,
        quote({ bid: 95, ask: 95.1, timestamp: (createdAt + 3_000) / 1000 }),
        createdAt + 2_000,
      ),
    ).toBeUndefined();
    expect(
      observePaperExcursion(
        open,
        quote({ bid: 95, ask: 95.1, timestamp: (createdAt + 500) / 1000 }),
        createdAt + 2_000,
      ),
    ).toBeUndefined();
    expect(
      observePaperExcursion(
        open,
        quote({ bid: undefined, ask: 95.1, price: 95, timestamp: (createdAt + 2_000) / 1000 }),
        createdAt + 3_000,
      ),
    ).toBeUndefined();
  });
});
