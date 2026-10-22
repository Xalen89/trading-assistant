import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Strategy, Workspace } from "../../lib/trading/model";
import {
  canonicalSessionConsentUnchanged,
  checkSessionAutoPaper,
  criticalSessionCandidateReason,
  deterministicSessionSignalId,
  isAutomaticSessionPaperTrade,
  sessionAutoSettingsReason,
  sessionGateEligible,
  sessionLocalDayBounds,
  sessionRiskAndDisciplineReason,
} from "../../server/trading/session-auto-paper";

const NOW = Date.UTC(2026, 9, 19, 14, 5, 0);
const config = {
  version: 1 as const,
  confirmed: true,
  timezone: "Etc/GMT+5" as const,
  family: "london-breakout" as const,
  executionTimeframe: "15m" as const,
  stopMode: "midpoint" as const,
  targetMode: "2r" as const,
};
const settings = {
  version: 1 as const,
  enabled: true,
  strategyId: "session-unit",
  market: "NQ",
  riskPct: 1 as const,
  maxTradesPerDay: 1 as const,
  runWhenClosed: false,
  armedAt: NOW - 1_000,
  expiresAt: NOW + 60_000,
};
const strategy: Strategy = {
  id: "session-unit",
  name: "Session unit",
  description: "Deterministic source test strategy",
  color: "#ffffff",
  kind: "strategy",
  setupFamily: "london-breakout",
  visible: true,
  version: 4,
  sessionConfig: config,
  factors: [],
  confluence: {
    contract: {
      contractVersion: 1,
      strategyId: "session-unit",
      strategyVersion: 4,
      configVersion: 2,
      approval: {
        status: "approved",
        approvedAt: NOW - 2_000,
        approvedBy: "owner",
      },
      trigger: {
        id: "session-breakout",
        name: "Closed breakout",
        predicate: "closed source bar",
        source: {
          id: "native-15m",
          name: "unit",
          required: true,
          freshness: { maxAgeMs: 120_000 },
        },
      },
      conditions: [
        {
          id: "range",
          name: "Range",
          predicate: "complete range",
          enabled: true,
          weight: 100,
          source: {
            id: "native-15m",
            name: "unit",
            required: true,
            freshness: { maxAgeMs: 120_000 },
          },
        },
      ],
      threshold: 100,
    },
    binding: {
      side: "long",
      triggerStepId: "session-breakout",
      conditions: [{ conditionId: "range", stepId: "session-range" }],
    },
  },
};

function workspace(auto = settings): Workspace {
  return {
    schemaVersion: 1,
    strategies: [strategy],
    patterns: [],
    matches: [],
    trades: [],
    alerts: [],
    events: [],
    levels: [],
    activeStrategyId: strategy.id,
    market: "NQ",
    timeframe: "15m",
    favorites: [],
    confirmations: {},
    overlays: {},
    settings: {
      timezone: "Etc/GMT+5",
      weeklyBias: "Neutral",
      sampleMode: false,
      futureOverlay: false,
      adaptation: true,
      dailyDrawdownLimitPct: 2,
      sessionAutoPaper: auto,
    },
    paperStartingBalance: 100_000,
  };
}

function analysis(overrides: Record<string, unknown> = {}) {
  const decisionBar = NOW / 1000 - 900;
  return {
    market: "NQ",
    timeframe: "15m",
    asOf: NOW / 1000,
    source: "fixture native 15m",
    candles: [
      {
        time: decisionBar,
        open: 99,
        high: 102,
        low: 98,
        close: 101,
        volume: 100,
      },
    ],
    candidates: [
      {
        id: "candidate",
        family: "london-breakout",
        side: "long",
        strategyId: strategy.id,
        strategyVersion: strategy.version,
        name: strategy.name,
        ready: true,
        entry: 101,
        stop: 95,
        target: 113,
        source: "fixture native 15m",
        zones: [],
        steps: [
          "session-config",
          "session-frame",
          "session-clock",
          "session-range",
          "session-breakout",
          "session-risk",
        ].map((id) => ({
          id,
          name: id,
          status: "met" as const,
          evidence: "closed fixture",
        })),
      },
    ],
    sessionContexts: [
      {
        strategyId: strategy.id,
        family: "london-breakout",
        timezone: "Etc/GMT+5",
        config,
        range: {
          high: 100,
          low: 90,
          midpoint: 95,
          startAt: decisionBar - 900,
          endAt: decisionBar,
          source: "fixture native 15m",
          basis: "complete-15m-window",
        },
        volumeBasis: "venue",
        missing: [],
      },
    ],
    ...overrides,
  } as any;
}

describe("session automatic paper safety boundaries", () => {
  it("defaults absent consent to off and blocks invalid, expired, or future arms", () => {
    expect(sessionAutoSettingsReason(undefined, NOW)).toMatchObject({
      state: "off",
    });
    expect(
      sessionAutoSettingsReason({ ...settings, extra: true }, NOW),
    ).toMatchObject({ state: "blocked" });
    expect(
      sessionAutoSettingsReason({ ...settings, expiresAt: NOW }, NOW),
    ).toMatchObject({ state: "blocked" });
    expect(
      sessionAutoSettingsReason({ ...settings, armedAt: NOW + 30_001 }, NOW),
    ).toMatchObject({ state: "blocked" });
  });

  it("rejects a non-owner before database, source, or order work", async () => {
    await expect(
      checkSessionAutoPaper({ id: 44 } as any),
    ).resolves.toMatchObject({
      state: "blocked",
      message: expect.stringContaining("owner-only"),
    });
  });

  it("requires exact current timeframe, complete critical source facts, and external PDC quotes", () => {
    expect(
      criticalSessionCandidateReason({
        analysis: analysis({ timeframe: "5m" }),
        strategy,
        config,
        side: "long",
        now: NOW,
      }).reason,
    ).toContain("native execution timeframe");
    const missing = analysis();
    missing.candidates[0].steps = missing.candidates[0].steps.filter(
      (step: any) => step.id !== "session-risk",
    );
    expect(
      criticalSessionCandidateReason({
        analysis: missing,
        strategy,
        config,
        side: "long",
        now: NOW,
      }).reason,
    ).toContain("session-risk");
    const pdcConfig = {
      version: 1 as const,
      confirmed: true,
      timezone: "Etc/GMT+5" as const,
      family: "pdc-continuation" as const,
      executionTimeframe: "1m" as const,
      trigger: "observed-quote-cross" as const,
      volumeRule: "last-completed-greater-than-previous" as const,
      pdcBasis: "provider-utc-day" as const,
      priceTick: 0.25,
      targetMode: "owner-key-levels" as const,
      longTargetPrice: 110,
      shortTargetPrice: 90,
    };
    const pdcStrategy: Strategy = {
      ...strategy,
      setupFamily: "pdc-continuation" as const,
      sessionConfig: pdcConfig,
    };
    const pdc = analysis({
      timeframe: "1m",
      candles: [
        {
          time: NOW / 1000 - 60,
          open: 101,
          high: 102,
          low: 100,
          close: 101,
          volume: 100,
        },
      ],
      candidates: [
        {
          ...analysis().candidates[0],
          family: "pdc-continuation",
          strategyVersion: 4,
          steps: [
            "session-config",
            "session-frame",
            "session-clock",
            "pivot-pdc",
            "pivot-opening-side",
            "pivot-quote-cross",
            "pivot-known-volume",
            "pivot-rising-volume",
            "pivot-morning-stop",
            "session-risk",
          ].map((id) => ({ id, name: id, status: "met", evidence: "fixture" })),
        },
      ],
      sessionContexts: [
        {
          strategyId: strategy.id,
          family: "pdc-continuation",
          timezone: "Etc/GMT+5",
          config: pdcConfig,
          pdc: {
            price: 100,
            closeAt: NOW / 1000 - 86400,
            source: "provider daily",
            basis: "provider-utc-day",
          },
          volumeBasis: "venue",
          missing: [],
        },
      ],
    });
    expect(
      criticalSessionCandidateReason({
        analysis: pdc,
        strategy: pdcStrategy,
        config: pdcConfig,
        side: "long",
        now: NOW,
      }).reason,
    ).toContain("external quote");
  });

  it("requires a same-version approved confluence gate and preserves source-local date bounds", () => {
    const good = {
      strategyEntryEligible: true,
      snapshot: {
        approval: { status: "approved" },
        version: {
          strategyId: strategy.id,
          strategyVersion: strategy.version,
          configVersion: 2,
        },
      },
    };
    expect(sessionGateEligible(good, strategy)).toBe(true);
    expect(
      sessionGateEligible(
        {
          ...good,
          snapshot: {
            ...good.snapshot,
            version: { ...good.snapshot.version, configVersion: 3 },
          },
        },
        strategy,
      ),
    ).toBe(false);
    const range = sessionLocalDayBounds(NOW, "Etc/GMT+5");
    expect(range?.start).toBeLessThan(NOW);
    expect(range?.end).toBeGreaterThan(NOW);
  });

  it("uses every PDC quote-pair timestamp/price in a stable durable identity", () => {
    const base = {
      userId: 44,
      strategyId: strategy.id,
      strategyVersion: strategy.version,
      config,
      market: "NQ",
      side: "long" as const,
      source: "named",
      decisionBar: NOW / 1000,
      pdcQuote: {
        previousTimestamp: 1,
        previousPrice: 100,
        currentTimestamp: 2,
        currentPrice: 101,
      },
    };
    expect(deterministicSessionSignalId(base)).toBe(
      deterministicSessionSignalId(base),
    );
    expect(
      deterministicSessionSignalId({
        ...base,
        pdcQuote: { ...base.pdcQuote, currentPrice: 102 },
      }),
    ).not.toBe(deterministicSessionSignalId(base));
    expect(
      isAutomaticSessionPaperTrade({
        journal: { sessionAutoPaper: "v1" },
      } as any),
    ).toBe(true);
  });

  it("never turns the same pivot crossing into another signal when a later display bar closes", () => {
    const pdcConfig = {
      version: 1 as const,
      confirmed: true,
      timezone: "Etc/GMT+5" as const,
      family: "pdc-continuation" as const,
      executionTimeframe: "1m" as const,
      trigger: "observed-quote-cross" as const,
      volumeRule: "last-completed-greater-than-previous" as const,
      pdcBasis: "provider-utc-day" as const,
      priceTick: 0.01,
      targetMode: "owner-key-levels" as const,
      longTargetPrice: 120,
      shortTargetPrice: 80,
    };
    const event = {
      userId: 44,
      strategyId: strategy.id,
      strategyVersion: strategy.version,
      config: pdcConfig,
      market: "UNIT",
      side: "long" as const,
      source: "UNIT",
      decisionBar: NOW / 1000 - 60,
      pdcQuote: {
        previousTimestamp: NOW / 1000 - 10,
        previousPrice: 99,
        currentTimestamp: NOW / 1000,
        currentPrice: 101,
      },
    };
    expect(
      deterministicSessionSignalId({
        ...event,
        decisionBar: event.decisionBar + 60,
      }),
    ).toBe(deterministicSessionSignalId(event));
    expect(
      deterministicSessionSignalId({
        ...event,
        pdcQuote: {
          ...event.pdcQuote,
          currentTimestamp: event.pdcQuote.currentTimestamp + 1,
        },
      }),
    ).not.toBe(deterministicSessionSignalId(event));
  });

  it("uses positive realized balance and existing discipline guards only", () => {
    const missing = workspace();
    delete missing.settings.dailyDrawdownLimitPct;
    expect(
      sessionRiskAndDisciplineReason({
        workspace: missing,
        ledger: [],
        market: "NQ",
        side: "long",
        proposedRisk: 0,
        now: NOW,
      }),
    ).toContain("drawdown limit");
    expect(
      canonicalSessionConsentUnchanged({
        workspace: workspace(),
        signature: JSON.stringify(settings),
        strategy,
        config,
        now: NOW,
      }),
    ).toBe(true);
    expect(
      canonicalSessionConsentUnchanged({
        workspace: workspace({
          ...settings,
          expiresAt: settings.expiresAt - 1,
        }),
        signature: JSON.stringify(settings),
        strategy,
        config,
        now: NOW,
      }),
    ).toBe(false);
  });

  it("contains neither a model trigger nor a separate auto-family lock", () => {
    const source = readFileSync(
      new URL("../../server/trading/session-auto-paper.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(
      /invokeLLM|openai|anthropic|generateCompletion|forecast\s*\(/i,
    );
    expect(source).toContain('entryMode: "strategy"');
    expect(source).toContain("autoManage: false");
    expect(source).toContain("stratdesk:ownerauto:orb:${userId}");
  });
});
