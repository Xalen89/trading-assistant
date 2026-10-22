import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as any[],
  inserts: [] as any[][],
  updates: [] as any[],
  whereCalls: 0,
}));

vi.mock("../../server/trading/repository", () => ({
  dbRequired: async () => ({
    select: () => {
      const query: any = {
        from: () => query,
        where: () => {
          state.whereCalls += 1;
          return query;
        },
        orderBy: () => query,
        limit: async () => state.rows,
      };
      return query;
    },
    insert: () => ({
      values: (rows: any[]) => {
        state.inserts.push(rows);
        return {
          onDuplicateKeyUpdate: async (update: unknown) => {
            state.updates.push(update);
          },
        };
      },
    }),
  }),
}));

import { retainBars, retainedBars } from "../../server/trading/setup-history";

const candle = (close: number) => ({
  time: 1_700_000_000,
  open: 100,
  high: Math.max(101, close),
  low: 99,
  close,
  volume: 10,
});

beforeEach(() => {
  state.rows = [];
  state.inserts = [];
  state.updates = [];
  state.whereCalls = 0;
});

describe("retained setup bars — source identity boundary (fully mocked DB)", () => {
  it("uses an identity-specific capture key and upserts corrected duplicate payloads", async () => {
    await retainBars(
      91_001,
      "UNIT",
      "1m",
      [candle(100)],
      "visible label",
      "opaque-A",
    );
    await retainBars(
      91_001,
      "UNIT",
      "1m",
      [candle(102)],
      "visible label",
      "opaque-A",
    );

    expect(state.inserts).toHaveLength(2);
    expect(state.inserts[0][0]).toMatchObject({
      source: "opaque-A",
      payload: {
        version: 2,
        source: "visible label",
        sourceIdentity: "opaque-A",
      },
    });
    expect(state.inserts[1][0].payload.candle.close).toBe(102);
    expect(Object.keys(state.updates[1].set).sort()).toEqual([
      "payload",
      "source",
    ]);
  });

  it("returns only exact v2 identity payloads and leaves legacy/unmatched rows unavailable", async () => {
    state.rows = [
      {
        payload: {
          version: 2,
          source: "visible label",
          sourceIdentity: "opaque-A",
          candle: candle(101),
        },
      },
      {
        payload: {
          version: 2,
          source: "same visible label",
          sourceIdentity: "opaque-B",
          candle: candle(102),
        },
      },
      {
        payload: { candle: candle(103), source: "legacy label" },
      },
    ];

    await expect(
      retainedBars(91_002, "UNIT", "1m", "opaque-A"),
    ).resolves.toEqual([candle(101)]);
    expect(state.whereCalls).toBe(1);
  });
});
