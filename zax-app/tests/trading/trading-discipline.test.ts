import { describe, expect, it } from "vitest";
import { evaluateDiscipline } from "../../lib/trading/trading-discipline";
import type { Trade } from "../../lib/trading/model";

const now = Date.UTC(2024, 0, 3, 0, 10, 0);

function trade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: "trade",
    market: "BTC-USD",
    side: "long",
    status: "closed",
    entry: 100,
    stop: 90,
    target: 120,
    quantity: 10,
    pointValue: 1,
    strategyId: "unit",
    strategyName: "Synthetic unit fixture",
    strategyVersion: 1,
    factors: [],
    journal: {},
    createdAt: now - 60 * 60_000,
    closedAt: now - 30 * 60_000,
    exit: 110,
    initialRisk: 100,
    initialQuantity: 10,
    ...overrides,
  };
}

const warningIds = (
  trades: Trade[],
  input: Parameters<typeof evaluateDiscipline>[1],
) =>
  evaluateDiscipline(trades, input)
    .flags.filter((flag) => flag.severity === "warning")
    .map((flag) => flag.id);

describe("evaluateDiscipline", () => {
  it("classifies a closed partial from realized partial P/L plus the final side-aware leg", () => {
    const partialThenLoss = trade({
      id: "partial-loss",
      quantity: 5,
      initialQuantity: 10,
      realizedPnl: 10,
      exit: 80,
      events: [
        {
          id: "partial-loss:partial",
          kind: "partial",
          at: now - 31 * 60_000,
          price: 102,
          quantity: 5,
          pnl: 10,
          note: "Synthetic realized partial",
        },
      ],
    });

    const report = evaluateDiscipline([partialThenLoss], { now });

    // 10 realized on the partial + (80 - 100) * 5 on the remaining long = -90.
    expect(report.lastLossAt).toBe(partialThenLoss.closedAt);
    expect(report.counts.consecutiveLosses).toBe(1);
    expect(
      report.flags.find((flag) => flag.id === "unknown-closed-outcome"),
    ).toBeUndefined();
  });

  it("uses UTC day boundaries, not the viewer's local day", () => {
    const beforeMidnight = trade({
      id: "utc-yesterday",
      closedAt: Date.UTC(2024, 0, 2, 23, 59, 59),
    });
    const afterMidnight = trade({
      id: "utc-today",
      closedAt: Date.UTC(2024, 0, 3, 0, 0, 1),
    });

    const report = evaluateDiscipline([beforeMidnight, afterMidnight], { now });

    expect(report.counts.todayTrades).toBe(1);
    expect(
      report.flags.find((flag) => flag.id === "daily-trade-count"),
    ).toBeUndefined();
  });

  it("warns at the six-closed-trade UTC review threshold and on a confirmed loss streak", () => {
    const laterNow = Date.UTC(2024, 0, 3, 20, 0, 0);
    const closedToday = Array.from({ length: 6 }, (_, index) =>
      trade({
        id: `loss-${index}`,
        exit: 90,
        closedAt: laterNow - (index + 1) * 60 * 60_000,
      }),
    );

    const report = evaluateDiscipline(closedToday, { now: laterNow });

    expect(report.counts).toEqual({ todayTrades: 6, consecutiveLosses: 6 });
    expect(report.flags.map((flag) => flag.id)).toEqual(
      expect.arrayContaining(["daily-trade-count", "loss-streak"]),
    );
    expect(report.ready).toBe(false);
  });

  it("suggests a 20-minute pause after a recent realized loss without assigning intent", () => {
    const recentLoss = trade({
      id: "recent-loss",
      exit: 90,
      closedAt: now - 10 * 60_000,
    });

    const report = evaluateDiscipline([recentLoss], { now });
    const flag = report.flags.find(
      (item) => item.id === "rapid-reentry-after-loss",
    );

    expect(flag?.severity).toBe("warning");
    expect(flag?.evidence.join(" ").toLowerCase()).toContain(
      "does not establish revenge trading",
    );
    expect(report.cooldownUntil).toBe(now + 10 * 60_000);
    expect(report.ready).toBe(false);
  });

  it("warns when proposed risk exceeds 1.5 times the recent completed-risk baseline after a loss", () => {
    const normal = trade({
      id: "normal-risk",
      exit: 110,
      closedAt: now - 2 * 60 * 60_000,
      initialRisk: 100,
    });
    const loss = trade({
      id: "latest-loss",
      exit: 90,
      closedAt: now - 60 * 60_000,
      initialRisk: 100,
    });

    const report = evaluateDiscipline([loss, normal], {
      now,
      proposedRisk: 151,
      market: "BTC-USD",
      side: "long",
    });

    expect(warningIds([loss, normal], { now, proposedRisk: 151 })).toContain(
      "risk-escalation-after-loss",
    );
    expect(
      report.flags
        .find((flag) => flag.id === "risk-escalation-after-loss")
        ?.evidence.join(" "),
    ).toContain("151");
  });

  it("excludes future closed timestamps from history, loss, and daily count", () => {
    const futureLoss = trade({
      id: "future-loss",
      exit: 90,
      closedAt: now + 1,
    });

    const report = evaluateDiscipline([futureLoss], { now });

    expect(report.counts).toEqual({ todayTrades: 0, consecutiveLosses: 0 });
    expect(report.lastLossAt).toBeUndefined();
    expect(
      report.flags.find((flag) => flag.id === "invalid-future-closure")
        ?.severity,
    ).toBe("info");
    expect(report.flags.some((flag) => flag.severity === "warning")).toBe(
      false,
    );
  });

  it("labels missing final P/L as unknown rather than clearing a streak", () => {
    const incomplete = trade({ id: "missing-exit", exit: undefined });

    const report = evaluateDiscipline([incomplete], { now });

    expect(
      report.flags.find((flag) => flag.id === "unknown-closed-outcome")
        ?.severity,
    ).toBe("info");
    expect(report.counts.consecutiveLosses).toBe(0);
  });
});
