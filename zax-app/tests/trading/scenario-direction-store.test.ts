import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  tradingAlertEvents,
  tradingScenarioDirections,
} from "../../drizzle/schema";
import {
  persistDirectionObservation,
  directionBaselineId,
} from "../../server/trading/scenario-directions";
import type { SetupAnalysis } from "../../lib/trading/setup-model";
import { WR1, type AlertRule, type AlertEvent } from "../../lib/trading/model";

const memory = vi.hoisted(() => ({
  baseline: undefined as any,
  events: [] as any[],
  locked: false,
}));
vi.mock("../../server/trading/repository", () => ({
  dbRequired: async () => ({
    transaction: async (work: any) => {
      const old = memory.baseline
          ? structuredClone(memory.baseline)
          : undefined,
        oldEvents = structuredClone(memory.events);
      const tx: any = {
        insert: (table: any) => ({
          values: (row: any) =>
            table === tradingScenarioDirections
              ? {
                  onDuplicateKeyUpdate: async () => {
                    if (!memory.baseline) memory.baseline = row.payload;
                  },
                }
              : Promise.resolve().then(() => {
                  memory.events.push({
                    ...row,
                    createdAt: new Date(row.payload.createdAt),
                  });
                }),
        }),
        select: () => ({
          from: (table: any) => ({
            where: () =>
              table === tradingScenarioDirections
                ? {
                    for: async (mode: string) => {
                      memory.locked = mode === "update";
                      return [{ payload: memory.baseline }];
                    },
                  }
                : {
                    orderBy: () => ({
                      limit: async () => memory.events.slice(-1),
                    }),
                  },
          }),
        }),
        update: () => ({
          set: (value: any) => ({
            where: async () => {
              memory.baseline = value.payload;
            },
          }),
        }),
      };
      try {
        return await work(tx);
      } catch (e) {
        memory.baseline = old;
        memory.events = oldEvents;
        throw e;
      }
    },
  }),
}));
const rule: AlertRule = {
  id: "unit",
  name: "Unit direction",
  market: "BTC-USD",
  timeframe: "5m",
  strategyId: WR1.id,
  kind: "scenario-direction",
  price: 0,
  enabled: true,
  cooldownMinutes: 1,
  createdAt: 1,
};
const quote = {
  symbol: "BTC-USD",
  price: 100,
  change: 0,
  timestamp: 100,
  timestampKind: "received" as const,
  source: "Unit",
  status: "live" as const,
};
const analysis = (close: number, asOf: number): SetupAnalysis => ({
  market: "BTC-USD",
  timeframe: "5m",
  asOf,
  source: "Synthetic unit fixture",
  profile: {
    direction: "Neutral",
    basis: "Unit",
    asOf,
    bars: 60,
    description: "Unit-only",
    probability: null,
  } as any,
  candidates: [],
  confluences: [],
  levels: [],
  estimate: { rate: null, probability: null, samples: 0 } as any,
  rhythm: null,
  messages: [],
  selectedStrategyIds: [WR1.id],
  combination: "all",
  candles: [
    { time: 100, open: 100, high: 100, low: 100, close: 100, volume: 1 },
  ],
  scenario: {
    id: "unit",
    anchorAt: 100,
    anchorPrice: 100,
    sourceAt: 20,
    sourceEndAt: 30,
    source: "Unit-only OHLC",
    basis: "context-replay",
    strategyIds: [WR1.id],
    strategyVersions: [1],
    combination: "all",
    distance: 0,
    explanation: "unit fixture",
    candles: [
      {
        time: 30,
        open: 100,
        high: Math.max(close, 100),
        low: Math.min(close, 100),
        close,
        volume: 1,
      },
    ],
  },
});
beforeEach(() => {
  memory.baseline = undefined;
  memory.events = [];
  memory.locked = false;
});
describe("durable direction observation (isolated mock, no user data)", () => {
  it("seeds, locks and emits one captured flip; repeats do not duplicate", async () => {
    expect(
      await persistDirectionObservation(
        1,
        rule,
        analysis(102, 100),
        [WR1],
        quote,
      ),
    ).toBeUndefined();
    expect(memory.locked).toBe(true);
    const event = await persistDirectionObservation(
      1,
      rule,
      analysis(98, 101),
      [WR1],
      quote,
    );
    expect(event?.title).toContain("UP → DOWN");
    expect(event?.setup?.scenario?.candles[0].close).toBe(98);
    expect(event?.providerTimestamp).toBeUndefined();
    await persistDirectionObservation(1, rule, analysis(98, 101), [WR1], quote);
    expect(memory.events).toHaveLength(1);
  });
  it("does not lose a still-reversed direction during cooldown", async () => {
    await persistDirectionObservation(
      1,
      rule,
      analysis(102, 100),
      [WR1],
      quote,
    );
    await persistDirectionObservation(1, rule, analysis(98, 101), [WR1], quote);
    expect(
      await persistDirectionObservation(
        1,
        rule,
        analysis(103, 102),
        [WR1],
        quote,
      ),
    ).toBeUndefined();
    expect(memory.baseline.lastDirection).toBe("down");
    memory.events[0].createdAt = new Date(Date.now() - 61000);
    const event = await persistDirectionObservation(
      1,
      rule,
      analysis(103, 103),
      [WR1],
      quote,
    );
    expect(event?.title).toContain("DOWN → UP");
    expect(memory.events).toHaveLength(2);
  });
  it("first observation/source changes do not fake an alert, and expired deadline leaves no row", async () => {
    await expect(
      persistDirectionObservation(
        1,
        rule,
        analysis(102, 100),
        [WR1],
        quote,
        Date.now() - 1,
      ),
    ).rejects.toThrow("deadline");
    expect(memory.baseline).toBeUndefined();
    await persistDirectionObservation(
      1,
      rule,
      analysis(102, 100),
      [WR1],
      quote,
    );
    const revised = analysis(98, 101);
    revised.scenario!.strategyVersions = [2];
    expect(
      await persistDirectionObservation(
        1,
        rule,
        revised,
        [{ ...WR1, version: 2 }],
        quote,
      ),
    ).toBeUndefined();
  });
  it("separates owner/rule keys and keeps pending push outbox evidence", async () => {
    expect(directionBaselineId(1, "unit")).not.toBe(
      directionBaselineId(2, "unit"),
    );
    await persistDirectionObservation(
      1,
      rule,
      analysis(102, 100),
      [WR1],
      quote,
    );
    await persistDirectionObservation(1, rule, analysis(98, 101), [WR1], quote);
    expect((memory.events[0].payload as AlertEvent).delivery).toBe("pending");
  });
});
