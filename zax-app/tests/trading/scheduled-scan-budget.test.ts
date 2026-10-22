import { describe, expect, it, vi } from "vitest";
import {
  withScheduledScanBudget,
  scheduledScanDeadline,
  consumeScheduledBrokerRead,
  scheduledBrokerReadsUsed,
} from "../../server/trading/scheduled-scan-budget";
import { jsonFetch, getQuote, getCandles } from "../../server/trading/market";
describe("finite owner callback source context", () => {
  it("shares a12request budget across awaited work and includes bootstrap attempts", async () => {
    await withScheduledScanBudget(Date.now() + 45_000, async () => {
      for (let index = 0; index < 6; index++) consumeScheduledBrokerRead();
      await Promise.resolve();
      for (let index = 0; index < 6; index++) consumeScheduledBrokerRead();
      expect(scheduledBrokerReadsUsed()).toBe(12);
      expect(() => consumeScheduledBrokerRead()).toThrow(/budget exhausted/);
    });
    expect(scheduledBrokerReadsUsed()).toBe(0);
  });
  it("caps longer nested source deadlines while preserving a tighter request", async () => {
    const deadline = Date.now() + 45_000;
    await withScheduledScanBudget(deadline, async () => {
      expect(scheduledScanDeadline()).toBe(deadline);
      expect(scheduledScanDeadline(deadline + 10_000)).toBe(deadline);
      expect(scheduledScanDeadline(deadline - 10_000)).toBe(deadline - 10_000);
    });
    expect(scheduledScanDeadline(123)).toBe(123);
  });
  it("does not widen a closed context or start expired requests", async () => {
    await expect(
      withScheduledScanBudget(Date.now() - 1, async () => true),
    ).rejects.toThrow(/expired/);
    vi.useFakeTimers();
    try {
      const end = Date.now() + 50;
      await withScheduledScanBudget(end, async () => {
        vi.setSystemTime(end);
        expect(() => consumeScheduledBrokerRead()).toThrow(/expired/);
      });
    } finally {
      vi.useRealTimers();
    }
  });
  it("keeps two owner callback invocations independent", async () => {
    await Promise.all(
      [1, 2].map(async (count) =>
        withScheduledScanBudget(Date.now() + 45_000, async () => {
          for (let i = 0; i < count; i++) consumeScheduledBrokerRead();
          await Promise.resolve();
          expect(scheduledBrokerReadsUsed()).toBe(count);
        }),
      ),
    );
  });
  it("inherits expiry into nested public HTTP and cached source entrypoints with zero network requests", async () => {
    vi.useFakeTimers();
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Unexpected unit-only HTTP attempt"));
    try {
      const end = Date.now() + 50;
      await withScheduledScanBudget(end, async () => {
        vi.setSystemTime(end);
        await expect(
          jsonFetch("https://unit.invalid/not-a-feed", {}, end + 2000),
        ).rejects.toMatchObject({ code: "TIMEOUT" });
        await expect(getQuote("UNIT")).rejects.toThrow(/budget elapsed/i);
        await expect(getCandles("UNIT", "30m")).rejects.toThrow(
          /budget elapsed/i,
        );
        expect(fetch).not.toHaveBeenCalled();
      });
    } finally {
      fetch.mockRestore();
      vi.useRealTimers();
    }
  });
});
