import { describe, expect, it } from "vitest";
import type { Trade } from "../../lib/trading/model";
import {
  mergeCanonicalPaperTrade,
  paperTradeChartLines,
  paperTradeChartSummary,
  storedExecutionTimeframe,
} from "../../lib/trading/trade-chart";

const trade = (patch: Partial<Trade> = {}): Trade => ({
  id: "paper_synthetic",
  market: "BTC-USD",
  side: "long",
  status: "open",
  entry: 100,
  stop: 95,
  target: 110,
  quantity: 2,
  pointValue: 1,
  strategyId: "source",
  strategyName: "Synthetic source",
  strategyVersion: 1,
  factors: [],
  journal: {},
  createdAt: 1,
  orderType: "market",
  autoManage: false,
  ...patch,
});

describe("paperTradeChartLines", () => {
  it("uses saved entry and working brackets without strategy-derived levels", () => {
    const lines = paperTradeChartLines(trade());
    expect(lines.map((line) => [line.id, line.price])).toEqual([
      ["entry", 100],
      ["working-stop", 95],
      ["working-target", 110],
    ]);
    expect(lines.map((line) => line.label).join(" ")).toContain(
      "MANAGEMENT OFF",
    );
  });

  it("retains original bracket lines and reports a recorded partial/break-even", () => {
    const lines = paperTradeChartLines(
      trade({
        stop: 100,
        target: 115,
        originalStop: 95,
        originalTarget: 110,
        partialAt: 110,
        partialTaken: true,
        autoManage: true,
        events: [
          {
            id: "partial-event",
            kind: "partial",
            at: 2,
            price: 111,
            quantity: 1,
            note: "Synthetic recorded partial",
          },
        ],
      }),
    );
    expect(lines.map((line) => line.id)).toEqual([
      "entry",
      "working-stop",
      "working-target",
      "original-stop",
      "original-target",
      "partial-taken",
    ]);
    expect(lines.find((line) => line.id === "working-stop")?.label).toContain(
      "BREAK-EVEN",
    );
    expect(lines.find((line) => line.id === "original-stop")?.dashed).toBe(
      true,
    );
    expect(lines.find((line) => line.id === "partial-taken")).toMatchObject({
      price: 111,
      label: "PARTIAL TAKEN · RECORDED",
    });
  });

  it("labels an event-less partial level as a planned trigger, not a fill", () => {
    const partial = paperTradeChartLines(
      trade({ partialTaken: true, partialAt: 110 }),
    ).find((line) => line.id === "partial-taken");
    expect(partial).toMatchObject({
      price: 110,
      label: "PARTIAL TRIGGER · PLANNED",
    });
  });

  it("keeps paper side, state, and explicit management disclosure visible", () => {
    expect(
      paperTradeChartSummary(
        trade({ side: "short", status: "pending", autoManage: true }),
      ),
    ).toBe("PAPER · SHORT · PENDING · MANAGEMENT ON");
  });
});

describe("mergeCanonicalPaperTrade", () => {
  it("refreshes the canonical bracket without replacing local journal or strategy snapshots", () => {
    const existing = trade({
      stop: 95,
      journal: { thought: "keep my journal" },
      strategyName: "My saved source snapshot",
      factors: ["my factor"],
    });
    const canonical = trade({
      stop: 100,
      target: 115,
      version: 2,
      journal: { executionSource: "server record" },
      strategyName: "server name",
      factors: ["server factor"],
    });
    expect(mergeCanonicalPaperTrade(existing, canonical)).toMatchObject({
      stop: 100,
      target: 115,
      version: 2,
      journal: { thought: "keep my journal" },
      strategyName: "My saved source snapshot",
      factors: ["my factor"],
    });
  });

  it("rejects an older in-flight canonical record", () => {
    const current = trade({
      stop: 100,
      target: 115,
      status: "closed",
      version: 3,
    });
    const stale = trade({ stop: 95, target: 110, status: "open", version: 2 });
    expect(mergeCanonicalPaperTrade(current, stale)).toBe(current);
  });
});

describe("storedExecutionTimeframe", () => {
  it("accepts only the owner-detail proposal timeframe", () => {
    expect(
      storedExecutionTimeframe({ analysis: { timeframe: "15m" } } as any),
    ).toBe("15m");
    expect(
      storedExecutionTimeframe({ analysis: { timeframe: "2m" } } as any),
    ).toBeUndefined();
  });
});
