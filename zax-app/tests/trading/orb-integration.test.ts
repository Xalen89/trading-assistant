import { describe, expect, it } from "vitest";
import { ORB_STRATEGY } from "../../lib/trading/orb-presets";
import {
  ORB_CRITICAL_STEP_IDS,
  orbEntryWindowOpen,
} from "../../lib/trading/orb-model";
import { orbAutoPaperSettingsSchema } from "../../lib/trading/orb-auto-types";
import { MARKETS, type Candle, type Strategy } from "../../lib/trading/model";
import { analyzeSetups, proposePaper } from "../../lib/trading/setup-engine";
import { resolveSetupFamily } from "../../lib/trading/setup-presets";
import {
  draftConfluence,
  evaluateSetupConfluence,
} from "../../lib/trading/confluence-runtime";
import {
  strategySchema,
  workspaceSchema,
} from "../../server/trading/validation";
import { initialWorkspace } from "../../lib/trading/model";
import type { SetupInput } from "../../lib/trading/setup-model";

// Deterministic software-unit fixtures only, not market history, forecasts or validation evidence.
const opening = Date.UTC(2026, 9, 19, 13) / 1000;
const breakout = opening + 3600;
const NOW = (breakout + 185) * 1000;
const market = MARKETS.find((item) => item.id === "NQ")!;
const strategy = (): Strategy => JSON.parse(JSON.stringify(ORB_STRATEGY));
function bar(
  time: number,
  open = 100,
  high = 101,
  low = 99,
  close = 100,
): Candle {
  return { time, open, high, low, close, volume: 100 };
}
function input(source = strategy()): SetupInput {
  const candles: Candle[] = [];
  for (let time = opening + 900; time < breakout; time += 60)
    candles.push(bar(time));
  candles.push(bar(breakout, 119, 123, 118, 122));
  candles.push(bar(breakout + 60, 122, 124, 97, 110));
  candles.push(bar(breakout + 120, 110, 127, 109, 125));
  return {
    market,
    timeframe: "1m",
    candles,
    daily: [],
    hourly: [],
    strategies: [source],
    patterns: [],
    combination: "all",
    timezone: "America/New_York",
    now: NOW / 1000,
    source: "UNIT one provider",
    dailySource: "UNIT no daily",
    hourlySource: "UNIT no hourly",
    orbRangeFeed: {
      candles: [bar(opening, 100, 120, 80, 101)],
      source: "UNIT one provider",
      timeframe: "15m",
    },
  };
}
function approved(
  analysis: ReturnType<typeof analyzeSetups>,
  source = strategy(),
) {
  const candidate = analysis.candidates.find(
    (item) => item.family === "orb" && item.side === "long",
  )!;
  const config = draftConfluence(source, candidate, "1m");
  config.contract.approval = {
    status: "approved",
    approvedAt: NOW - 1,
    approvedBy: "UNIT_OWNER",
  };
  return { candidate, config };
}

describe("ORB pipeline — synthetic software-unit fixtures, never edge", () => {
  it("is a distinct exact source family; edited prose does not silently retain its detector", () => {
    expect(resolveSetupFamily(strategy())).toBe("orb");
    const edited = strategy();
    edited.factors[0].description = "different source rule";
    expect(resolveSetupFamily(edited)).toBe("custom");
    expect(strategySchema.parse(strategy()).orbConfig?.executionTimeframe).toBe(
      "1m",
    );
  });
  it("links opening high/low/50% to the ORB strategy and preserves context replay as unvalidated", () => {
    const analysis = analyzeSetups(input());
    expect(
      analysis.candidates.find((item) => item.side === "long")?.ready,
    ).toBe(true);
    const levels = analysis.levels.filter(
      (item) => item.strategyId === ORB_STRATEGY.id,
    );
    expect(levels.map((item) => item.price)).toEqual(
      expect.arrayContaining([120, 80, 100]),
    );
    expect(analysis.orbContexts?.[0].range?.basis).toBe("exact-15m");
    expect(analysis.estimate.probability).toBeNull();
    expect(analysis.estimate.rate).toBeNull();
    if (analysis.scenario)
      expect(analysis.scenario.basis).toBe("context-replay");
  });
  it("uses the approved tick stop once and exact3R without generic0.01/2R", () => {
    const analysis = analyzeSetups(input());
    const plan = proposePaper(analysis, market, "long", 125, 100000, 1);
    expect(plan.stop).toBe(96.75);
    expect(plan.target).toBeCloseTo(209.75, 8);
    expect(plan.rr).toBeCloseTo(3, 8);
    expect(plan.rationale.join(" ")).toContain(
      "No additional display-unit buffer",
    );
    expect(() =>
      proposePaper(analysis, market, "long", 160, 100000, 1),
    ).toThrow();
  });
  it("admits an approved current native trigger without turning session-clock metadata into OHLC", () => {
    const analysis = analyzeSetups(input());
    const { candidate, config } = approved(analysis);
    expect(config.binding.triggerStepId).toBe("orb-continuation");
    expect(config.binding.conditions.map((item) => item.stepId)).not.toContain(
      "orb-clock",
    );
    expect(
      evaluateSetupConfluence(config, analysis, candidate, NOW)
        .strategyEntryEligible,
    ).toBe(true);
  });
  for (const critical of ORB_CRITICAL_STEP_IDS) {
    it(`cannot omit or down-weight mandatory ${critical}`, () => {
      const analysis = analyzeSetups(input());
      const { candidate, config } = approved(analysis);
      candidate.steps = candidate.steps.map((item) =>
        item.id === critical ? { ...item, status: "unknown" } : item,
      );
      const result = evaluateSetupConfluence(config, analysis, candidate, NOW);
      expect(result.strategyEntryEligible).toBe(false);
      expect(result.blockedReasons.join(" ")).toContain(critical);
    });
  }
  it("checks the actual clock and context even when an old source clock flag says met", () => {
    const analysis = analyzeSetups(input());
    const { candidate, config } = approved(analysis);
    const missing = { ...analysis, orbContexts: undefined };
    expect(
      evaluateSetupConfluence(config, missing, candidate, NOW)
        .strategyEntryEligible,
    ).toBe(false);
    const cutoff = Date.UTC(2026, 9, 19, 16);
    expect(
      evaluateSetupConfluence(
        config,
        analysis,
        candidate,
        cutoff,
      ).blockedReasons.join(" "),
    ).toContain("ORB current entry clock");
    expect(
      orbEntryWindowOpen(Date.UTC(2026, 9, 19, 13, 59) / 1000, "Etc/GMT+5"),
    ).toBe(false);
    expect(
      orbEntryWindowOpen(Date.UTC(2026, 9, 19, 14) / 1000, "Etc/GMT+5"),
    ).toBe(true);
    expect(orbEntryWindowOpen(cutoff / 1000, "Etc/GMT+5")).toBe(false);
  });
  it("persists optional bounded consent, defaults old workspaces off and rejects arbitrary scope/budgets", () => {
    const old = workspaceSchema.parse(initialWorkspace());
    expect(old.settings.orbAutoPaper).toBeUndefined();
    const good = {
      version: 1,
      enabled: true,
      strategyId: ORB_STRATEGY.id,
      market: "NQ",
      riskPct: 1,
      maxTradesPerDay: 1,
      armedAt: NOW,
      expiresAt: NOW + 3600000,
    };
    expect(orbAutoPaperSettingsSchema.safeParse(good).success).toBe(true);
    expect(
      orbAutoPaperSettingsSchema.safeParse({ ...good, market: "TL:3884" })
        .success,
    ).toBe(true); // Shape only; canonical saved NAS100 mode/metadata must still authorize it.
    for (const change of [
      { market: "NAS100" },
      { riskPct: 3 },
      { maxTradesPerDay: 4 },
      { expiresAt: NOW + 86400001 },
      { armedAt: undefined },
      { brokerExecution: true },
    ])
      expect(
        orbAutoPaperSettingsSchema.safeParse({ ...good, ...change }).success,
      ).toBe(false);
    const next = {
      ...old,
      strategies: [...old.strategies, strategy()],
      settings: { ...old.settings, orbAutoPaper: good },
    };
    expect(workspaceSchema.parse(next).settings.orbAutoPaper?.enabled).toBe(
      true,
    );
  });
});
