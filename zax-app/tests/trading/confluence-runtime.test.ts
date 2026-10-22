import { describe, expect, it } from "vitest";
import {
  confluenceForAnalysis,
  draftConfluence,
  evaluateSetupConfluence,
  type ConfluenceRuleConfig,
} from "../../lib/trading/confluence-runtime";
import type { Strategy } from "../../lib/trading/model";
import type {
  SetupAnalysis,
  SetupCandidate,
} from "../../lib/trading/setup-model";

// Synthetic native-unit fixture epoch in Unix seconds; no app, provider, quote, or broker data.
const UNIT_SECONDS = 1_800_000_000;
const UNIT_NOW_MS = (UNIT_SECONDS + 300) * 1000;

const strategy: Strategy = {
  id: "native-unit-core",
  name: "Native UNIT Core",
  description: "Native unit fixture only",
  color: "#ffffff",
  kind: "reference",
  visible: true,
  version: 3,
  source: "UNIT closed OHLC",
  factors: [],
};

function candidate(overrides: Partial<SetupCandidate> = {}): SetupCandidate {
  return {
    id: "native-unit-core-long",
    family: "core-sequence",
    side: "long",
    strategyId: strategy.id,
    strategyVersion: strategy.version,
    name: strategy.name,
    // Eligibility must not take this convenience display flag as its only input.
    ready: false,
    source: "UNIT closed OHLC",
    zones: [],
    steps: [
      {
        id: "htf-context",
        name: "HTF metadata",
        status: "met",
        evidence: "Excluded metadata",
      },
      {
        id: "liquidity-sweep",
        name: "Liquidity sweep",
        status: "met",
        evidence: "Native closed bar",
      },
      {
        id: "displacement",
        name: "Displacement",
        status: "met",
        evidence: "Native closed bar",
      },
      { id: "mss", name: "MSS", status: "met", evidence: "Native closed bar" },
      { id: "fvg", name: "FVG", status: "met", evidence: "Native closed bar" },
      {
        id: "retest",
        name: "Retest",
        status: "met",
        evidence: "Native closed bar",
      },
    ],
    ...overrides,
  };
}

function analysis(
  unitCandidate = candidate(),
  overrides: Partial<SetupAnalysis> = {},
): SetupAnalysis {
  return {
    market: "UNIT",
    timeframe: "5m",
    asOf: UNIT_SECONDS + 300,
    source: "UNIT closed OHLC",
    profile: {
      bias: "Unknown",
      source: "UNIT",
      basis: "UNIT",
      explanation: "UNIT fixture",
    },
    candidates: [unitCandidate],
    confluences: [],
    levels: [],
    estimate: {
      rate: null,
      wins: 0,
      losses: 0,
      unresolved: 0,
      ambiguous: 0,
      samples: 0,
      horizon: 0,
      costs: "UNIT",
      label: "UNIT",
      probability: null,
    },
    rhythm: null,
    messages: [],
    selectedStrategyIds: [strategy.id],
    combination: "any",
    // This bar's close is the prospective decision bar's open.  It is the exact t-1 source bar.
    candles: [
      {
        time: UNIT_SECONDS,
        open: 100,
        high: 101,
        low: 99,
        close: 100,
        volume: 100,
      },
    ],
    ...overrides,
  };
}

function approved(config: ConfluenceRuleConfig): ConfluenceRuleConfig {
  return {
    ...config,
    contract: {
      ...config.contract,
      approval: {
        status: "approved",
        approvedAt: UNIT_NOW_MS - 1,
        approvedBy: "UNIT_OWNER_REVIEW",
      },
    },
  };
}

describe("confluence runtime — native-unit fixtures only", () => {
  it("drafts a candidate-local closed-OHLC template with an explicit 2-timeframe freshness limit", () => {
    const unitCandidate = candidate();
    const config = draftConfluence(strategy, unitCandidate, "5m");

    expect(config.contract.approval.status).toBe("draft");
    expect(config.contract.trigger.id).toBe("retest");
    expect(config.binding.triggerStepId).toBe("retest");
    expect(config.binding.conditions.map((item) => item.stepId)).not.toContain(
      "htf-context",
    );
    expect(config.contract.trigger.source).toMatchObject({
      id: "native-closed-ohlc:5m",
      name: "UNIT closed OHLC",
      freshness: { maxAgeMs: 600_000 },
    });
    expect(
      config.contract.conditions.reduce(
        (total, item) => total + item.weight,
        0,
      ),
    ).toBeCloseTo(100, 8);
  });

  it("requires current human approval but classifies a ready:false native candidate from its actual trigger and conditions", () => {
    const unitCandidate = candidate();
    const unitAnalysis = analysis(unitCandidate);
    const draft = draftConfluence(strategy, unitCandidate, "5m");

    const blockedDraft = evaluateSetupConfluence(
      draft,
      unitAnalysis,
      unitCandidate,
      UNIT_NOW_MS,
    );
    expect(blockedDraft.strategyEntryEligible).toBe(false);
    expect(blockedDraft.blockedReasons.join(" ")).toContain(
      "not human-approved",
    );

    const result = evaluateSetupConfluence(
      approved(draft),
      unitAnalysis,
      unitCandidate,
      UNIT_NOW_MS,
    );
    expect(unitCandidate.ready).toBe(false);
    expect(result.configValid).toBe(true);
    expect(result.snapshot.trigger?.status).toBe("met");
    expect(result.snapshot.trigger?.bar).toBe("t-1");
    expect(
      result.snapshot.checklist.every((item) => item.status === "met"),
    ).toBe(true);
    expect(result.deterministicScore).toBe(100);
    expect(result.strategyEntryEligible).toBe(true);
    expect(result.successProbability).toBeNull();
  });

  it("maps native waiting and failed steps to not-met, and unknown to pending without inventing a pass", () => {
    const unitCandidate = candidate({
      steps: candidate().steps.map((step) =>
        step.id === "liquidity-sweep"
          ? { ...step, status: "waiting" as const }
          : step.id === "displacement"
            ? { ...step, status: "failed" as const }
            : step.id === "mss"
              ? { ...step, status: "unknown" as const }
              : step,
      ),
    });
    const config = approved(draftConfluence(strategy, unitCandidate, "5m"));
    const result = evaluateSetupConfluence(
      config,
      analysis(unitCandidate),
      unitCandidate,
      UNIT_NOW_MS,
    );

    const byId = new Map(
      result.snapshot.checklist.map((item) => [item.conditionId, item]),
    );
    const bindingByStep = new Map(
      config.binding.conditions.map((item) => [item.stepId, item.conditionId]),
    );
    expect(byId.get(bindingByStep.get("liquidity-sweep")!)?.status).toBe(
      "not-met",
    );
    expect(byId.get(bindingByStep.get("displacement")!)?.status).toBe(
      "not-met",
    );
    expect(byId.get(bindingByStep.get("mss")!)?.status).toBe("pending");
    expect(result.strategyEntryEligible).toBe(false);
  });

  it("fails closed for stale, future, post-decision, or malformed full-analysis timing", () => {
    const unitCandidate = candidate();
    const config = approved(draftConfluence(strategy, unitCandidate, "5m"));
    const unitAnalysis = analysis(unitCandidate);

    const stale = evaluateSetupConfluence(
      config,
      unitAnalysis,
      unitCandidate,
      UNIT_NOW_MS + 600_001,
    );
    expect(stale.snapshot.trigger?.status).toBe("pending");
    expect(stale.strategyEntryEligible).toBe(false);

    const future = evaluateSetupConfluence(
      config,
      analysis(unitCandidate, { asOf: UNIT_SECONDS + 301 }),
      unitCandidate,
      UNIT_NOW_MS,
    );
    expect(future.strategyEntryEligible).toBe(false);
    expect(future.blockedReasons.join(" ")).toContain("future");

    const afterDecision = evaluateSetupConfluence(
      config,
      analysis(unitCandidate, { asOf: UNIT_SECONDS + 601 }),
      unitCandidate,
      (UNIT_SECONDS + 601) * 1000,
    );
    expect(afterDecision.strategyEntryEligible).toBe(false);
    expect(afterDecision.blockedReasons.join(" ")).toContain(
      "prospective decision bar",
    );

    const millisecondsMistakenForSeconds = evaluateSetupConfluence(
      config,
      analysis(unitCandidate, { asOf: UNIT_NOW_MS }),
      unitCandidate,
      UNIT_NOW_MS,
    );
    expect(millisecondsMistakenForSeconds.strategyEntryEligible).toBe(false);
    expect(millisecondsMistakenForSeconds.blockedReasons.join(" ")).toContain(
      "Unix seconds",
    );
  });

  it("rejects non-native, duplicate, missing, cross-analysis, and strategy-version bindings", () => {
    const unitCandidate = candidate();
    const config = approved(draftConfluence(strategy, unitCandidate, "5m"));
    const nonNative: ConfluenceRuleConfig = {
      ...config,
      contract: {
        ...config.contract,
        trigger: { ...config.contract.trigger, id: "htf-context" },
      },
      binding: { ...config.binding, triggerStepId: "htf-context" },
    };
    const nonNativeResult = evaluateSetupConfluence(
      nonNative,
      analysis(unitCandidate),
      unitCandidate,
      UNIT_NOW_MS,
    );
    expect(nonNativeResult.strategyEntryEligible).toBe(false);
    expect(nonNativeResult.blockedReasons.join(" ")).toContain(
      "not a supported candidate-local native",
    );

    const duplicate: ConfluenceRuleConfig = {
      ...config,
      binding: {
        ...config.binding,
        conditions: [
          ...config.binding.conditions,
          { ...config.binding.conditions[0] },
        ],
      },
    };
    const duplicateResult = evaluateSetupConfluence(
      duplicate,
      analysis(unitCandidate),
      unitCandidate,
      UNIT_NOW_MS,
    );
    expect(duplicateResult.strategyEntryEligible).toBe(false);
    expect(duplicateResult.blockedReasons.join(" ")).toContain(
      "Duplicate binding",
    );

    const absent = candidate({ id: "native-unit-other" });
    const absentResult = evaluateSetupConfluence(
      config,
      analysis(unitCandidate),
      absent,
      UNIT_NOW_MS,
    );
    expect(absentResult.strategyEntryEligible).toBe(false);
    expect(absentResult.blockedReasons.join(" ")).toContain("not present");

    const versionMismatch = candidate({
      strategyVersion: strategy.version + 1,
    });
    const versionResult = evaluateSetupConfluence(
      config,
      analysis(versionMismatch),
      versionMismatch,
      UNIT_NOW_MS,
    );
    expect(versionResult.strategyEntryEligible).toBe(false);
    expect(versionResult.blockedReasons.join(" ")).toContain("version");
  });

  it("evaluates only optional current-version strategy config and keeps ambiguous candidate sides pending", () => {
    const unitCandidate = candidate();
    const config = approved(draftConfluence(strategy, unitCandidate, "5m"));
    const strategyWithConfig = {
      ...strategy,
      confluence: config,
    } as Strategy & { confluence: ConfluenceRuleConfig };

    const found = confluenceForAnalysis(
      [strategyWithConfig],
      analysis(unitCandidate),
      UNIT_NOW_MS,
    );
    expect(found[strategy.id]?.strategyEntryEligible).toBe(true);

    const otherSide = candidate({
      id: "native-unit-core-short",
      side: "short",
    });
    const ambiguous = confluenceForAnalysis(
      [strategyWithConfig],
      analysis(unitCandidate, { candidates: [unitCandidate, otherSide] }),
      UNIT_NOW_MS,
    );
    expect(ambiguous[strategy.id]?.strategyEntryEligible).toBe(true);
    const legacyConfig = {
      ...config,
      binding: { ...config.binding, side: undefined },
    };
    const legacy = confluenceForAnalysis(
      [{ ...strategyWithConfig, confluence: legacyConfig }],
      analysis(unitCandidate, { candidates: [unitCandidate, otherSide] }),
      UNIT_NOW_MS,
    );
    expect(legacy[strategy.id]?.strategyEntryEligible).toBe(false);
    expect(legacy[strategy.id]?.blockedReasons.join(" ")).toContain(
      "Multiple candidate sides",
    );
    const wrongSide = evaluateSetupConfluence(
      config,
      analysis(otherSide),
      otherSide,
      UNIT_NOW_MS,
    );
    expect(wrongSide.strategyEntryEligible).toBe(false);
    expect(wrongSide.blockedReasons.join(" ")).toContain("direction");

    const oldStrategy = {
      ...strategyWithConfig,
      version: strategy.version + 1,
    };
    const mismatch = confluenceForAnalysis(
      [oldStrategy],
      analysis(unitCandidate),
      UNIT_NOW_MS,
    );
    expect(mismatch[strategy.id]?.strategyEntryEligible).toBe(false);
    expect(mismatch[strategy.id]?.blockedReasons.join(" ")).toContain(
      "current strategy id and version",
    );
  });
});
