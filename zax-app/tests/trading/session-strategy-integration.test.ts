import { describe, expect, it } from "vitest";
import { SESSION_STRATEGY_PRESETS } from "../../lib/trading/session-strategy-presets";
import {
  initialWorkspace,
  type Candle,
  type Strategy,
  type Market,
} from "../../lib/trading/model";
import { analyzeSetups, proposePaper } from "../../lib/trading/setup-engine";
import { resolveSetupFamily } from "../../lib/trading/setup-presets";
import {
  draftConfluence,
  evaluateSetupConfluence,
} from "../../lib/trading/confluence-runtime";
import { workspaceSchema } from "../../server/trading/validation";
import type { SetupInput } from "../../lib/trading/setup-model";
// Software fixtures only. No market research/history, database, owner order or predictive validation.
const [LONDON, IB, PIVOT] = SESSION_STRATEGY_PRESETS;
const START = Date.UTC(2026, 9, 19, 5) / 1000;
const NOW = (START + 14 * 900 + 1) * 1000;
const MARKET: Market = {
  id: "UNIT",
  name: "Unit only",
  category: "Crypto",
  provider: "coinbase",
  providerSymbol: "UNIT",
  precision: 2,
  pointValue: 1,
  paperSupported: true,
};
const source = () => structuredClone(LONDON);
function input(strategy = source()): SetupInput {
  const bars: Candle[] = Array.from({ length: 14 }, (_, index) => ({
    time: START + index * 900,
    open: 100,
    high: index < 12 ? 110 : 114,
    low: 90,
    close: index < 13 ? 100 : 112,
    volume: 100,
  }));
  return {
    market: MARKET,
    timeframe: "15m",
    candles: bars,
    daily: [],
    hourly: [],
    strategies: [strategy],
    patterns: [],
    combination: "all",
    timezone: "America/New_York",
    now: NOW / 1000,
    source: "UNIT source",
    sourceIdentity: "UNIT",
    volumeBasis: "venue",
    dailySource: "UNIT none",
    hourlySource: "UNIT none",
    sessionRangeFeed: {
      candles: bars,
      source: "UNIT source",
      sourceIdentity: "UNIT",
      timeframe: "15m",
      volumeBasis: "venue",
    },
  };
}
function gate(analysis: ReturnType<typeof analyzeSetups>, strategy: Strategy) {
  const candidate = analysis.candidates.find(
    (c) => c.family === "london-breakout" && c.side === "long",
  )!;
  const config = draftConfluence(strategy, candidate, "15m");
  config.contract.approval = {
    status: "approved",
    approvedAt: NOW - 1,
    approvedBy: "UNIT_OWNER",
  };
  return { candidate, config };
}
describe("separate session strategies integrated with source contracts — unit only", () => {
  it("resolves all three independent families and keeps IDs distinct", () => {
    expect([LONDON, IB, PIVOT].map(resolveSetupFamily)).toEqual([
      "london-breakout",
      "initial-balance",
      "pdc-continuation",
    ]);
    expect(new Set([LONDON.id, IB.id, PIVOT.id]).size).toBe(3);
  });
  it("links source high/low/midpoint without duplicate level IDs or false validation", () => {
    const analysis = analyzeSetups(input());
    const candidate = analysis.candidates.find(
      (c) => c.family === "london-breakout" && c.side === "long",
    )!;
    expect(candidate.ready, JSON.stringify(candidate.steps)).toBe(true);
    expect(new Set(analysis.levels.map((l) => l.id)).size).toBe(
      analysis.levels.length,
    );
    expect(
      analysis.levels
        .filter((l) => l.strategyId === LONDON.id)
        .map((l) => l.price),
    ).toEqual(expect.arrayContaining([110, 90, 100]));
    expect(analysis.estimate.probability).toBeNull();
    expect(analysis.estimate.rate).toBeNull();
  });
  it("keeps midpoint stop and selected2R at the actual indication", () => {
    const analysis = analyzeSetups(input());
    const plan = proposePaper(analysis, MARKET, "long", 113, 10_000, 1);
    expect(plan.stop).toBe(100);
    expect(plan.target).toBe(plan.entry + 2 * (plan.entry - plan.stop));
    expect(plan.rr).toBe(2);
  });
  it("makes a complete native gate eligible without scoring clock/context as OHLC", () => {
    const strategy = source(),
      analysis = analyzeSetups(input(strategy)),
      { candidate, config } = gate(analysis, strategy);
    expect(
      evaluateSetupConfluence(config, analysis, candidate, NOW)
        .strategyEntryEligible,
    ).toBe(true);
  });
  it("cannot hide a missing source range by removing a weighted condition", () => {
    const strategy = source(),
      valid = analyzeSetups(input(strategy)),
      { config } = gate(valid, strategy);
    const broken = input(strategy);
    broken.sessionRangeFeed = undefined;
    broken.candles = broken.candles.slice(-8);
    const analysis = analyzeSetups(broken),
      candidate = analysis.candidates.find((c) => c.side === "long")!;
    config.contract.conditions = config.contract.conditions.slice(0, 1);
    config.binding.conditions = config.binding.conditions.slice(0, 1);
    expect(
      evaluateSetupConfluence(config, analysis, candidate, NOW)
        .strategyEntryEligible,
    ).toBe(false);
  });
  it("persists strict config without enabling automatic paper or cloud writes", () => {
    const workspace = initialWorkspace();
    const saved = source();
    saved.id = "UNIT-LONDON-SAVED";
    workspace.strategies.push(saved);
    expect(workspaceSchema.safeParse(workspace).success).toBe(true);
    expect(workspace.settings.sessionAutoPaper).toBeUndefined();
  });
});
