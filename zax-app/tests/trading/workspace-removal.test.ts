import { describe, expect, it } from "vitest";
import { initialWorkspace } from "../../lib/trading/model";
import {
  DETACHED_STRATEGY_ID,
  libraryDeleteConfirmation,
  prepareArchivedStrategyRemoval,
  prepareLibraryRemoval,
  previewArchivedStrategyRemoval,
  strategyDeleteConfirmation,
} from "../../lib/trading/workspace-removal";

function fixture() {
  const base = initialWorkspace();
  const archived = {
    ...base.strategies[0],
    id: "retired",
    name: "Retired",
    archived: true,
    version: 7,
  };
  const active = {
    ...base.strategies[0],
    id: "active",
    name: "Active",
    archived: false,
    version: 3,
  };
  const trade = {
    id: "paper-canonical",
    market: "BTC-USD",
    side: "long" as const,
    status: "closed" as const,
    entry: 100,
    stop: 90,
    target: 120,
    quantity: 1,
    pointValue: 1,
    strategyId: "retired",
    strategyName: "Retired",
    strategyVersion: 7,
    factors: ["entry"],
    journal: { immutable: "entry snapshot" },
    createdAt: 1,
    closedAt: 2,
    exit: 110,
  };
  const screenshot = {
    id: "screen-1",
    name: "Screenshot review · trade",
    tags: [],
    kind: "pattern" as const,
    strategyId: "active",
    market: "BTC-USD",
    timeframe: "5m" as const,
    notes: "",
    status: "ready" as const,
    createdAt: 1,
    version: 2,
    feedback: [],
    tradeReview: { linkedTrade: { canonicalTradeId: "paper-canonical" } },
  } as any;
  const source = {
    ...screenshot,
    id: "source-1",
    name: "Rule source",
    strategyId: "retired",
    tradeReview: undefined,
    version: 4,
  };
  return {
    workspace: {
      ...base,
      strategies: [active, archived],
      activeStrategyId: "retired",
      alerts: [
        {
          id: "alert-direct",
          name: "Direct",
          market: "BTC-USD",
          timeframe: "5m" as const,
          strategyId: "retired",
          kind: "above" as const,
          price: 100,
          enabled: true,
          cooldownMinutes: 5,
          createdAt: 1,
        },
        {
          id: "alert-combined",
          name: "Combined",
          market: "BTC-USD",
          timeframe: "5m" as const,
          strategyId: "active",
          combinedStrategyIds: ["active", "retired"],
          kind: "above" as const,
          price: 100,
          enabled: true,
          cooldownMinutes: 5,
          createdAt: 1,
        },
      ],
      trades: [trade],
      patterns: [screenshot, source],
      matches: [
        {
          id: "match",
          name: "Old",
          strategyId: "retired",
          strategyVersion: 7,
          market: "BTC-USD",
          timeframe: "5m" as const,
          evidence: [],
          missing: [],
          status: "candidate" as const,
          createdAt: 1,
        },
      ],
      levels: [
        {
          id: "level",
          strategyId: "retired",
          market: "BTC-USD",
          name: "L",
          price: 100,
          color: "#fff",
        },
      ],
    },
    trade,
    screenshot,
    source,
  };
}

describe("workspace removal plans", () => {
  it("previews alerts, canonical paper records, and source screenshots before archived deletion", () => {
    const { workspace, trade, screenshot, source } = fixture();
    const preview = previewArchivedStrategyRemoval(
      workspace,
      "retired",
      [trade],
      [screenshot, source],
    );
    expect(preview.confirmation).toBe(strategyDeleteConfirmation("retired"));
    expect(preview.dependentAlerts.map((item) => item.id)).toEqual([
      "alert-direct",
      "alert-combined",
    ]);
    expect(preview.canonicalPaperRecords).toEqual([
      expect.objectContaining({ id: "paper-canonical", strategyVersion: 7 }),
    ]);
    expect(preview.sourceScreenshots).toEqual([
      expect.objectContaining({
        id: "screen-1",
        sourceVersion: 2,
        linkedCanonicalTradeId: "paper-canonical",
      }),
    ]);
    expect(preview.sourceLibraryRecords.map((item) => item.id)).toEqual([
      "source-1",
    ]);
    expect(preview.effects.join(" ")).toContain("remain unchanged");
  });

  it("requires archived/versioned explicit deletion and never rewrites the paper snapshot", () => {
    const { workspace, trade } = fixture();
    const originalTrade = JSON.parse(JSON.stringify(trade));
    expect(() =>
      prepareArchivedStrategyRemoval(workspace, {
        strategyId: "retired",
        expectedStrategyVersion: 6,
        confirmation: strategyDeleteConfirmation("retired"),
      }),
    ).toThrow("changed elsewhere");
    expect(() =>
      prepareArchivedStrategyRemoval(workspace, {
        strategyId: "retired",
        expectedStrategyVersion: 7,
        confirmation: "DELETE EVERYTHING",
      }),
    ).toThrow("confirmation");

    const next = prepareArchivedStrategyRemoval(workspace, {
      strategyId: "retired",
      expectedStrategyVersion: 7,
      confirmation: strategyDeleteConfirmation("retired"),
    });
    expect(next.strategies.map((strategy) => strategy.id)).toEqual(["active"]);
    expect(next.alerts).toEqual([]);
    expect(next.levels).toEqual([]);
    expect(next.matches).toEqual([]);
    expect(next.activeStrategyId).toBe("active");
    expect(next.patterns.map((pattern) => pattern.strategyId)).toEqual([
      DETACHED_STRATEGY_ID,
      DETACHED_STRATEGY_ID,
    ]);
    expect(next.trades).toEqual([originalTrade]);
    expect(next.trades[0]).toBe(workspace.trades[0]);
  });

  it("requires a matching source version and exact phrase for metadata/index removal", () => {
    const { workspace } = fixture();
    expect(() =>
      prepareLibraryRemoval(workspace, {
        sourceId: "source-1",
        expectedSourceVersion: 3,
        confirmation: libraryDeleteConfirmation("source-1"),
      }),
    ).toThrow("changed elsewhere");
    const next = prepareLibraryRemoval(workspace, {
      sourceId: "source-1",
      expectedSourceVersion: 4,
      confirmation: libraryDeleteConfirmation("source-1"),
    });
    expect(next.patterns.map((pattern) => pattern.id)).toEqual(["screen-1"]);
  });
});
