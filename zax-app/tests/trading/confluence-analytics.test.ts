import { describe, expect, it } from "vitest";
import {
  analyzeConfluenceTrades,
  standardPearson,
} from "../../lib/trading/confluence-analytics";
import type { ConfluenceEvaluationSnapshot } from "../../lib/trading/confluence-contract";
import type { TradeFeatureSnapshot } from "../../lib/trading/trade-features";
import type { Trade } from "../../lib/trading/model";

// Synthetic paper-ledger math fixtures only; they are not app-valid performance claims.
const EPOCH = 1_900_000_000_000;
const NOW = EPOCH + 10_000_000;

function checklistItem(
  id: string,
  status: "met" | "not-met",
  observedAt: number,
) {
  return {
    conditionId: id,
    name: `Synthetic ${id}`,
    predicate: `${id}[t-1] is synthetic`,
    source: {
      id: "unit-source",
      name: "UNIT closed-bar source",
      required: true,
      freshness: { maxAgeMs: 60_000 },
    },
    enabled: true,
    weight: 50,
    status,
    sourceId: "unit-source",
    providerStatus: "ready" as const,
    observedAt,
    lastClosedBarAt: observedAt,
    bar: "t-1" as const,
    reasons: [],
  };
}

function confluence(
  at: number,
  a: "met" | "not-met",
  b: "met" | "not-met",
  score: number,
): ConfluenceEvaluationSnapshot {
  return {
    timestampUnit: "unix-epoch-milliseconds",
    evaluatedAt: at,
    decisionBarOpenAt: at,
    deterministicScore: score,
    threshold: 50,
    gateMet: score >= 50,
    strategyEntryEligible: false,
    version: {
      contractVersion: 1,
      strategyId: "unit-strategy",
      strategyVersion: 1,
      configVersion: 1,
    },
    approval: { status: "approved", approvedAt: at - 1, approvedBy: "UNIT" },
    trigger: null,
    checklist: [checklistItem("a", a, at), checklistItem("b", b, at)],
  };
}

function features(at: number, winner: boolean): TradeFeatureSnapshot {
  return {
    version: 1,
    asOf: at,
    source: "UNIT entry features",
    values: {},
    regime: winner ? "trending" : "choppy",
    volatilityRegime: winner ? "high" : "low",
    missing: [],
  };
}

function trade(
  index: number,
  winner: boolean,
  overrides: Partial<Trade> = {},
): Trade {
  const openedAt = EPOCH + index * 1_000 + 100;
  return {
    id: `unit-${index}`,
    market: "UNIT",
    side: "long",
    status: "closed",
    entry: 100,
    stop: 95,
    target: 110,
    quantity: 10,
    pointValue: 1,
    strategyId: "unit-strategy",
    strategyName: "Synthetic unit strategy",
    strategyVersion: 1,
    factors: [],
    journal: {},
    createdAt: openedAt - 50,
    openedAt,
    closedAt: openedAt + 50,
    exit: winner ? 110 : 95,
    initialRisk: 50,
    initialQuantity: 10,
    originalStop: 95,
    originalTarget: 110,
    entryFeatures: features(openedAt - 1, winner),
    // `b` is intentionally inverse to `a`, yielding a descriptive -1 binary association.
    confluenceSnapshots: [
      confluence(
        openedAt - 1,
        winner ? "met" : "not-met",
        winner ? "not-met" : "met",
        winner ? 100 : 0,
      ),
    ],
    ...overrides,
  };
}

describe("analyzeConfluenceTrades — deterministic synthetic paper-ledger fixtures", () => {
  it("reports partial-inclusive R outcomes and only unconfirmed descriptive comparisons", () => {
    const ledger = Array.from({ length: 200 }, (_, index) =>
      trade(index, index < 100),
    );
    const report = analyzeConfluenceTrades(ledger, NOW);
    const conditionA = report.conditionContribution.find(
      (condition) => condition.conditionId === "a",
    );

    expect(report.overall).toMatchObject({
      count: 200,
      wins: 100,
      losses: 100,
      winRate: 0.5,
      expectancyR: 0.5,
      profitFactor: 2,
      status: "unconfirmed",
    });
    expect(
      report.scoreBuckets.find((bucket) => bucket.label === "0-24")?.metrics
        .count,
    ).toBe(100);
    expect(
      report.scoreBuckets.find((bucket) => bucket.label === "75-100")?.metrics
        .count,
    ).toBe(100);
    expect(conditionA).toMatchObject({
      present: { count: 100, expectancyR: 2, status: "unconfirmed" },
      absent: { count: 100, expectancyR: -1, status: "unconfirmed" },
      expectancyDifferenceR: 3,
      comparisonStatus: "unconfirmed",
      rank: expect.any(Number),
    });
    expect(report.correlatedConditions).toContainEqual(
      expect.objectContaining({
        leftKey: "unit-strategy:a",
        rightKey: "unit-strategy:b",
        correlation: -1,
        count: 200,
        status: "unconfirmed",
      }),
    );
    expect(report.learningSourceStatus).toMatchObject({
      status: "paper-only",
      realMoney: false,
      executionData: false,
    });
    expect(report.humanRuleProposals[0]).toMatchObject({
      kind: "review",
      automatic: false,
      evidenceStatus: "unconfirmed",
    });
    expect(report.conditionRanking).toContain("descriptive only");
  });

  it("counts missing entry snapshots without treating them as absent conditions or regimes", () => {
    const noSnapshots = trade(1, true, {
      entryFeatures: undefined,
      confluenceSnapshots: undefined,
    });
    const report = analyzeConfluenceTrades([noSnapshots], NOW);

    expect(report.overall.count).toBe(1);
    expect(report.outcomeCoverage.entryFeatures).toEqual({
      available: 0,
      missing: 1,
      futureOrInvalid: 0,
    });
    expect(report.outcomeCoverage.confluenceSnapshots).toEqual({
      available: 0,
      missing: 1,
      futureOrInvalid: 0,
    });
    expect(
      report.scoreBuckets.every((bucket) => bucket.metrics.count === 0),
    ).toBe(true);
    expect(
      report.regimes.trend.every((group) => group.metrics.count === 0),
    ).toBe(true);
  });

  it("includes realized partial P/L exactly once and excludes unclosed, invalid, and future records", () => {
    const partial = trade(1, true, {
      quantity: 5,
      exit: 115,
      realizedPnl: 50,
      initialRisk: 50,
      initialQuantity: 10,
      originalStop: 95,
      originalTarget: 110,
      entryFeatures: undefined,
      confluenceSnapshots: undefined,
    });
    const future = trade(2, true, { closedAt: NOW + 1 });
    const unknownOutcome = trade(3, true, { exit: undefined });
    const open = trade(4, true, { status: "open" });
    const report = analyzeConfluenceTrades(
      [partial, future, unknownOutcome, open],
      NOW,
    );

    // 50 partial P/L + (115 - 100) * remaining 5 = 125; 125 / initial 50 = 2.5R.
    expect(report.overall).toMatchObject({
      count: 1,
      expectancyR: 2.5,
      profitFactor: null,
    });
    expect(report.outcomeCoverage.excluded).toMatchObject({
      futureClosedTimestamp: 1,
      invalidOutcome: 1,
      notClosed: 1,
    });
  });

  it("returns null, not a manufactured value, for constant-series Pearson correlation", () => {
    expect(standardPearson([1, 1, 1], [0, 1, 0])).toBeNull();
    expect(standardPearson([0, 1, 0], [1, 1, 1])).toBeNull();
  });
});
