import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import type { Strategy, Workspace } from "../../lib/trading/model";
import {
  canonicalConsentUnchanged,
  checkOrbAutoPaper,
  criticalOrbCandidateReason,
  deterministicOrbProposalId,
  isAutomaticOrbPaperTrade,
  isOrbEntryWindow,
  orbAutoSettingsReason,
  orbGateEligible,
  orbRiskAndDisciplineReason,
} from "../../server/trading/orb-auto-paper";

const now = Date.UTC(2026, 9, 19, 14, 5, 0); // 09:05 fixed EST (Etc/GMT+5)
const armed = {
  version: 1 as const,
  enabled: true,
  strategyId: "orb-unit",
  market: "NQ" as const,
  riskPct: 1 as const,
  maxTradesPerDay: 1 as const,
  armedAt: now - 60_000,
  expiresAt: now + 60_000,
};
const strategy: Strategy = {
  id: "orb-unit",
  name: "ORB unit",
  description: "Deterministic test strategy",
  color: "#fff",
  kind: "strategy",
  setupFamily: "orb",
  visible: true,
  version: 7,
  factors: [],
  orbConfig: {
    version: 1,
    confirmed: true,
    timezone: "Etc/GMT+5",
    midpoint: "opening-range-50",
    executionTimeframe: "1m",
    breakout: "closed-outside-range",
    confirmation: "close-beyond-retest",
    stop: "retest-wick-plus-tick",
    stopBufferTicks: 1,
    sessions: [],
  },
  confluence: {
    contract: {
      contractVersion: 1,
      strategyId: "orb-unit",
      strategyVersion: 7,
      configVersion: 1,
      approval: { status: "approved", approvedAt: now - 120_000, approvedBy: "owner" },
      trigger: {
        id: "orb-continuation",
        name: "Continuation",
        predicate: "closed bar",
        source: { id: "native-closed-ohlc:1m", name: "unit", required: true, freshness: { maxAgeMs: 120_000 } },
      },
      conditions: [{
        id: "range",
        name: "Range",
        predicate: "range",
        enabled: true,
        weight: 100,
        source: { id: "native-closed-ohlc:1m", name: "unit", required: true, freshness: { maxAgeMs: 120_000 } },
      }],
      threshold: 100,
    },
    binding: {
      side: "long",
      triggerStepId: "orb-continuation",
      conditions: [{ conditionId: "range", stepId: "orb-range" }],
    },
  },
};

function workspace(settings = armed): Workspace {
  return {
    schemaVersion: 1,
    strategies: [strategy], patterns: [], matches: [], trades: [], alerts: [], events: [], levels: [],
    activeStrategyId: strategy.id, market: "NQ", timeframe: "1m", favorites: [], confirmations: {}, overlays: {},
    settings: { timezone: "America/New_York", weeklyBias: "Neutral", sampleMode: false, futureOverlay: false, adaptation: true, dailyDrawdownLimitPct: 2, orbAutoPaper: settings },
    paperStartingBalance: 100_000,
  };
}

function analysis(overrides: Record<string, unknown> = {}) {
  const candle = { time: now / 1000 - 60, open: 20100, high: 20120, low: 20090, close: 20115, volume: 1 };
  const ids = ["orb-market", "orb-timeframe", "orb-clock", "orb-config", "orb-range", "orb-breakout", "orb-midpoint-retest", "orb-continuation", "orb-risk-band"];
  return {
    market: "NQ",
    timeframe: "1m" as const,
    source: "actual unit feed",
    candles: [candle],
    candidates: [{ id: "candidate", family: "orb", side: "long", strategyId: strategy.id, strategyVersion: strategy.version, name: strategy.name, ready: true, stop: 20098.25, source: "actual unit feed", zones: [], steps: ids.map((id) => ({ id, name: id, status: "met" as const, evidence: "closed unit evidence" })) }],
    orbContexts: [{ strategyId: strategy.id, timezone: "Etc/GMT+5", config: strategy.orbConfig, range: { startAt: candle.time - 3600, endAt: candle.time - 2700, high: 20100, low: 20000, midpoint: 20050, source: "actual unit feed", basis: "complete-1m-aggregation" as const }, sessionLevels: [], missing: [] }],
    ...overrides,
  } as any;
}

describe("ORB automatic paper safety boundaries", () => {
  it("defaults absent consent to off and expires an armed consent without a source call", () => {
    expect(orbAutoSettingsReason(undefined, now)).toMatchObject({ state: "off" });
    expect(orbAutoSettingsReason({ ...armed, expiresAt: now }, now)).toMatchObject({ state: "blocked" });
  });

  it("rejects a non-owner before any database/source/order work", async () => {
    await expect(checkOrbAutoPaper({ id: 55 } as any)).resolves.toMatchObject({ state: "blocked", message: expect.stringContaining("owner-only") });
  });

  it("uses the exact fixed-EST 09:00 inclusive / 11:00 exclusive clock", () => {
    expect(isOrbEntryWindow(Date.UTC(2026, 9, 19, 14, 0), "Etc/GMT+5")).toBe(true);
    expect(isOrbEntryWindow(Date.UTC(2026, 9, 19, 16, 0), "Etc/GMT+5")).toBe(false);
  });

  it("fails closed for an unknown timeframe, unnamed source, or missing critical ORB step", () => {
    expect(criticalOrbCandidateReason({ analysis: analysis({ timeframe: "5m" }), strategy, side: "long" }).reason).toContain("1-minute");
    expect(criticalOrbCandidateReason({ analysis: analysis({ source: "" }), strategy, side: "long" }).reason).toContain("unnamed");
    const missing = analysis();
    missing.candidates[0].steps = missing.candidates[0].steps.filter((step: any) => step.id !== "orb-risk-band");
    expect(criticalOrbCandidateReason({ analysis: missing, strategy, side: "long" }).reason).toContain("orb-risk-band");
  });

  it("requires an approved same-version, same-strategy confluence gate", () => {
    const eligible = { strategyEntryEligible: true, snapshot: { approval: { status: "approved" }, version: { strategyId: strategy.id, strategyVersion: strategy.version, configVersion: strategy.confluence!.contract.configVersion } } };
    expect(orbGateEligible(eligible, strategy)).toBe(true);
    expect(orbGateEligible({ ...eligible, snapshot: { ...eligible.snapshot, approval: { status: "draft" } } }, strategy)).toBe(false);
    expect(orbGateEligible({ ...eligible, snapshot: { ...eligible.snapshot, version: { strategyId: strategy.id, strategyVersion: 8 } } }, strategy)).toBe(false);
    expect(orbGateEligible({ ...eligible, snapshot: { ...eligible.snapshot, version: { ...eligible.snapshot.version, configVersion: 2 } } }, strategy)).toBe(false);
  });

  it("rejects a source analysis that changed away from the owner-selected market or config", () => {
    expect(criticalOrbCandidateReason({ analysis: analysis({ market: "ES" }), strategy, side: "long", market: "NQ" }).reason).toContain("did not remain");
    const changed = analysis();
    changed.orbContexts[0].config = { ...strategy.orbConfig, priceTick: 0.5 };
    expect(criticalOrbCandidateReason({ analysis: changed, strategy, side: "long" }).reason).toContain("exact approved execution configuration");
  });

  it("requires a positive existing drawdown cap before automatic activity", () => {
    const missing = workspace();
    delete missing.settings.dailyDrawdownLimitPct;
    expect(orbRiskAndDisciplineReason(missing, [], "NQ", "long", now)).toContain("drawdown limit");
  });

  it("has a stable durable same-signal proposal/order identity across retries", () => {
    const input = { userId: 55, strategyId: strategy.id, strategyVersion: strategy.version, market: "NQ" as const, confirmationBar: 1_792_400_000, localDay: "2026-10-19" };
    expect(deterministicOrbProposalId(input)).toBe(deterministicOrbProposalId(input));
    expect(`paper_${deterministicOrbProposalId(input)}`).toMatch(/^paper_orb_auto_55_orb-unit_7_NQ_/);
    expect(isAutomaticOrbPaperTrade({ journal: { orbAutoPaper: "v1" } } as any)).toBe(true);
  });

  it("stops a pending automatic order path when canonical consent changed during source work", () => {
    const saved = workspace();
    const changed = workspace({ ...armed, expiresAt: armed.expiresAt - 1 });
    // Signature comes from the original immutable consent; the reread differs.
    const signature = JSON.stringify(armed);
    expect(canonicalConsentUnchanged(saved, signature, strategy, now)).toBe(true);
    expect(canonicalConsentUnchanged(changed, signature, strategy, now)).toBe(false);
  });

  it("contains neither an LLM trigger nor a practice-order fallback", () => {
    const source = readFileSync(new URL("../../server/trading/orb-auto-paper.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/invokeLLM|openai|anthropic|generateCompletion|forecast\s*\(/i);
    expect(source).toContain('entryMode: "strategy"');
    expect(source).not.toContain('entryMode: "practice"');
  });
});
