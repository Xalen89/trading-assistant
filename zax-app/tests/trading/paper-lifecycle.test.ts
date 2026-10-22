import { describe, expect, it } from "vitest";
import { tradeMetrics } from "../../lib/trading/engine";
import { advancePaperTrade } from "../../lib/trading/paper-lifecycle";
import type { Trade } from "../../lib/trading/model";

const createdAt = 1_700_000_000_000;
const observationAt = createdAt + 1_000;
const fixture = (overrides: Partial<Trade> = {}): Trade => ({
  id: "paper-unit",
  market: "BTC-USD",
  side: "long",
  status: "open",
  entry: 100,
  stop: 95,
  target: 115,
  quantity: 10,
  pointValue: 1,
  strategyId: "unit",
  strategyName: "Deterministic unit fixture",
  strategyVersion: 1,
  factors: [],
  journal: {},
  createdAt,
  autoManage: true,
  orderType: "market",
  ...overrides,
});

describe("advancePaperTrade", () => {
  it("fills an opted-in pending limit at the observed long ask, never before creation", () => {
    const pending = fixture({
      status: "pending",
      orderType: "limit",
      entry: 100,
      stop: 95,
      target: 110,
      quantity: 2,
    });
    expect(
      advancePaperTrade(pending, {
        time: createdAt - 1,
        price: 99,
        ask: 99.5,
        source: "unit quote",
      }),
    ).toBe(pending);

    const filled = advancePaperTrade(pending, {
      time: observationAt,
      price: 99,
      bid: 99.4,
      ask: 99.5,
      source: "unit quote",
    });
    expect(filled).toMatchObject({
      status: "open",
      entry: 99.5,
      openedAt: observationAt,
      initialQuantity: 2,
      initialRisk: 9,
      version: 1,
    });
    expect(filled.events).toEqual([
      expect.objectContaining({
        id: `paper-unit:filled:${observationAt}`,
        kind: "filled",
        price: 99.5,
      }),
    ]);
  });

  it("uses a conservative stop-first outcome for a bar that touches stop and target", () => {
    const stopped = advancePaperTrade(fixture(), {
      time: observationAt,
      price: 100,
      source: "matched unit bar",
      bar: {
        time: 1_700_000_001,
        open: 100,
        high: 116,
        low: 94,
        close: 100,
        volume: 1,
      },
    });
    expect(stopped).toMatchObject({
      status: "closed",
      exit: 95,
      closedAt: observationAt,
      version: 1,
    });
    expect(stopped.events).toEqual([
      expect.objectContaining({ kind: "closed", price: 95, pnl: -50 }),
    ]);
    expect(stopped.events?.[0].note).toContain("bar-range bracket level");
  });

  it("takes one 50% 2R partial, records USD P/L, and moves the stop to breakeven", () => {
    const partial = advancePaperTrade(fixture(), {
      time: observationAt,
      price: 110,
      bid: 110,
      ask: 110.1,
      source: "unit quote",
    });
    expect(partial).toMatchObject({
      quantity: 5,
      initialQuantity: 10,
      initialRisk: 50,
      partialAt: 110,
      partialTaken: true,
      realizedPnl: 50,
      stop: 100,
      version: 1,
    });
    expect(partial.events?.map((event) => event.kind)).toEqual([
      "partial",
      "breakeven",
    ]);

    const replay = advancePaperTrade(partial, {
      time: observationAt,
      price: 110,
      bid: 110,
      ask: 110.1,
      source: "unit quote",
    });
    expect(replay).toBe(partial);
    expect(replay.events).toHaveLength(2);
  });

  it("includes the partial and final remaining leg exactly once at final target", () => {
    const partial = advancePaperTrade(fixture(), {
      time: observationAt,
      price: 110,
      bid: 110,
      ask: 110.1,
      source: "unit quote",
    });
    const closed = advancePaperTrade(partial, {
      time: observationAt + 1,
      price: 115,
      bid: 115,
      ask: 115.1,
      source: "unit quote",
    });
    const metrics = tradeMetrics(closed);
    expect(closed).toMatchObject({
      status: "closed",
      quantity: 5,
      exit: 115,
      realizedPnl: 50,
      version: 2,
    });
    expect(metrics).toMatchObject({ risk: 0, pnl: 125, r: 2.5 });
    expect(metrics.rr).toBeCloseTo(1.5);
  });

  it("closes the long remainder at break-even when one OHLC bar reaches partial, break-even, and target", () => {
    const closed = advancePaperTrade(fixture(), {
      time: observationAt,
      price: 100,
      source: "matched unit bar",
      bar: {
        time: 1_700_000_001,
        open: 100,
        high: 115,
        low: 99,
        close: 114,
        volume: 1,
      },
    });
    expect(closed).toMatchObject({
      status: "closed",
      quantity: 5,
      exit: 100,
      realizedPnl: 50,
      version: 1,
    });
    expect(tradeMetrics(closed).pnl).toBe(50);
    expect(closed.events?.map((event) => event.kind)).toEqual([
      "partial",
      "breakeven",
      "closed",
    ]);
    expect(
      advancePaperTrade(closed, {
        time: observationAt,
        price: 100,
        source: "matched unit bar",
      }),
    ).toBe(closed);
  });

  it("closes the short remainder at break-even when an ambiguous same bar reaches partial and target", () => {
    const closed = advancePaperTrade(
      fixture({
        side: "short",
        stop: 105,
        target: 85,
        partialAt: 90,
      }),
      {
        time: observationAt,
        price: 100,
        source: "matched unit bar",
        bar: {
          time: 1_700_000_001,
          open: 100,
          high: 101,
          low: 85,
          close: 86,
          volume: 1,
        },
      },
    );
    expect(closed).toMatchObject({
      status: "closed",
      quantity: 5,
      exit: 100,
      realizedPnl: 50,
      version: 1,
    });
    expect(tradeMetrics(closed).pnl).toBe(50);
    expect(closed.events?.map((event) => event.kind)).toEqual([
      "partial",
      "breakeven",
      "closed",
    ]);
  });

  it("converts USDJPY partial P/L into USD at the observed exit price", () => {
    const yen = fixture({
      id: "yen-unit",
      market: "TL:9",
      valuationSymbol: "USDJPY",
      entry: 150,
      stop: 149,
      target: 153,
      quantity: 1000,
      pointValue: 1 / 150,
    });
    const partial = advancePaperTrade(yen, {
      time: observationAt,
      price: 152,
      bid: 152,
      ask: 152.01,
      source: "unit USDJPY quote",
    });
    expect(partial.realizedPnl).toBeCloseTo(1000 / 152);
    expect(partial.initialRisk).toBeCloseTo(1000 / 149);
  });

  it("leaves plans untouched unless autoManage is explicitly true", () => {
    const manual = fixture({
      autoManage: undefined,
      status: "pending",
      orderType: "limit",
    });
    const unchanged = advancePaperTrade(manual, {
      time: observationAt,
      price: 99,
      ask: 99,
      source: "unit quote",
    });
    expect(unchanged).toBe(manual);
  });

  it("never fills a cancelled pending limit after price crosses its entry", () => {
    const cancelled = {
      ...fixture({
        status: "pending",
        orderType: "limit",
        entry: 100,
        stop: 95,
        target: 110,
      }),
      status: "cancelled",
      cancelledAt: observationAt,
      events: [
        {
          id: "paper-unit:cancelled",
          kind: "cancelled",
          at: observationAt,
          note: "Synthetic cancellation",
        },
      ],
    } as any as Trade;

    expect(
      advancePaperTrade(cancelled, {
        time: observationAt + 1,
        price: 99,
        ask: 99.5,
        source: "later unit quote",
      }),
    ).toBe(cancelled);
  });
});
