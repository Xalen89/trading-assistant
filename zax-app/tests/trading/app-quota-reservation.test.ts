import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  tradingRuntimeState,
  tradingWorkspaces,
  users,
} from "../../drizzle/schema";

// A serialized in-memory database double; no managed DB, account or model is used.
const memory = vi.hoisted(() => ({
  payload: undefined as Record<string, unknown> | undefined,
  queue: Promise.resolve() as Promise<void>,
}));
vi.mock("../../server/trading/repository", () => ({
  dbRequired: async () => ({
    transaction: async (work: (tx: unknown) => Promise<unknown>) => {
      const previous = memory.queue;
      let unlock!: () => void;
      memory.queue = new Promise<void>((resolve) => {
        unlock = resolve;
      });
      await previous;
      const snapshot = memory.payload && structuredClone(memory.payload);
      const tx = {
        select: () => {
          let table: unknown;
          const rows = () =>
            table === users
              ? [{ id: 42 }]
              : table === tradingWorkspaces
                ? [{ payload: { settings: {} } }]
                : table === tradingRuntimeState && memory.payload
                  ? [{ payload: structuredClone(memory.payload) }]
                  : [];
          const query = {
            from: (value: unknown) => {
              table = value;
              return query;
            },
            where: () => query,
            for: async () => rows(),
            limit: async () => rows(),
          };
          return query;
        },
        insert: () => ({
          values: async (row: { payload: Record<string, unknown> }) => {
            memory.payload = structuredClone(row.payload);
          },
        }),
        update: () => ({
          set: (row: { payload: Record<string, unknown> }) => ({
            where: async () => {
              memory.payload = structuredClone(row.payload);
            },
          }),
        }),
        delete: () => ({ where: async () => undefined }),
      };
      try {
        return await work(tx);
      } catch (error) {
        memory.payload = snapshot;
        throw error;
      } finally {
        unlock();
      }
    },
  }),
}));
import {
  reserveAppQuota,
  releaseAppQuotaReservation,
} from "../../server/trading/app-quota";

beforeEach(() => {
  memory.payload = undefined;
  memory.queue = Promise.resolve();
});

describe("application quota reservation — isolated transaction fixtures", () => {
  it("releases a terminal no-output request exactly once without releasing another reservation", async () => {
    const [first, second] = await Promise.all([
      reserveAppQuota(42, "forecast", 1, 650_000),
      reserveAppQuota(42, "forecast", 1, 650_000),
    ]);
    expect(memory.payload).toMatchObject({ used: 2, attempts: 2 });
    expect(await releaseAppQuotaReservation(first.reservation)).toBe(true);
    expect(memory.payload).toMatchObject({ used: 1, attempts: 2 });
    expect(await releaseAppQuotaReservation(first.reservation)).toBe(false);
    expect(memory.payload).toMatchObject({ used: 1, attempts: 2 });
    expect(
      (memory.payload!.reservations as Record<string, number>)[
        second.reservation.token
      ],
    ).toBe(1);
  });

  it("does not reset the independent attempt ceiling when every terminal failure releases output usage", async () => {
    for (let index = 0; index < 60; index += 1) {
      const request = await reserveAppQuota(42, "forecast", 1, 650_000);
      expect(await releaseAppQuotaReservation(request.reservation)).toBe(true);
    }
    expect(memory.payload).toMatchObject({ used: 0, attempts: 60 });
    await expect(
      reserveAppQuota(42, "forecast", 1, 650_000),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(memory.payload).toMatchObject({ used: 0, attempts: 60 });
  });
});
