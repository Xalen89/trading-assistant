import { describe, expect, it } from "vitest";
import {
  CONFLUENCE_CONTRACT_VERSION,
  TIMESTAMP_UNIT,
  evaluateConfluence,
  validateConfluenceConfig,
  validationEligibility,
} from "../../lib/trading/confluence-contract";
import type {
  ConfluenceEvaluationInput,
  ConfluenceStrategyContract,
} from "../../lib/trading/confluence-contract";

// Synthetic unit-fixture epoch in Unix milliseconds only; never app, market, or broker data.
const UNIT_EPOCH_MS = 1_800_000_000_000;
const DECISION_BAR_OPEN_MS = UNIT_EPOCH_MS + 300_000;

function unitContract(): ConfluenceStrategyContract {
  return {
    contractVersion: CONFLUENCE_CONTRACT_VERSION,
    strategyId: "unit-closed-bar-strategy",
    strategyVersion: 7,
    configVersion: 3,
    approval: {
      status: "approved",
      approvedAt: UNIT_EPOCH_MS - 10_000,
      approvedBy: "UNIT_REVIEWER",
    },
    trigger: {
      id: "close-break",
      name: "Closed-bar breakout trigger",
      predicate: "close[t-1] > rangeHigh[t-1]",
      source: {
        id: "unit-price",
        name: "UNIT closed price feed",
        required: true,
        freshness: { maxAgeMs: 60_000 },
      },
    },
    conditions: [
      {
        id: "trend-alignment",
        name: "Closed-bar trend alignment",
        predicate: "ema20[t-1] > ema50[t-1]",
        source: {
          id: "unit-price",
          name: "UNIT closed price feed",
          required: true,
          freshness: { maxAgeMs: 60_000 },
        },
        enabled: true,
        weight: 60,
      },
      {
        id: "relative-volume",
        name: "Closed-bar relative volume",
        predicate: "volume[t-1] >= sma(volume, 20)[t-1]",
        source: {
          id: "unit-volume",
          name: "UNIT closed volume feed",
          required: false,
          freshness: { maxAgeMs: 60_000 },
        },
        enabled: true,
        weight: 40,
      },
    ],
    threshold: 60,
  };
}

function unitInput(): ConfluenceEvaluationInput {
  const closedBarAt = DECISION_BAR_OPEN_MS;
  return {
    evaluatedAt: DECISION_BAR_OPEN_MS + 1_000,
    decisionBarOpenAt: DECISION_BAR_OPEN_MS,
    trigger: {
      sourceId: "unit-price",
      status: "met",
      providerStatus: "ready",
      observedAt: closedBarAt,
      lastClosedBarAt: closedBarAt,
      bar: "t-1",
    },
    conditions: [
      {
        conditionId: "trend-alignment",
        sourceId: "unit-price",
        status: "met",
        providerStatus: "ready",
        observedAt: closedBarAt,
        lastClosedBarAt: closedBarAt,
        bar: "t-1",
      },
      {
        conditionId: "relative-volume",
        sourceId: "unit-volume",
        status: "not-met",
        providerStatus: "ready",
        observedAt: closedBarAt,
        lastClosedBarAt: closedBarAt,
        bar: "t-1",
      },
    ],
  };
}

describe("confluence contract — deterministic synthetic UNIT fixtures", () => {
  it("records a closed-bar checklist and immutable-by-value approval/version snapshot", () => {
    const contract = unitContract();
    const result = evaluateConfluence(contract, unitInput());

    expect(result.configValid).toBe(true);
    expect(result.deterministicScore).toBe(60);
    expect(result.threshold).toBe(60);
    expect(result.gateMet).toBe(true);
    expect(result.strategyEntryEligible).toBe(true);
    expect(result.successProbability).toBeNull();
    expect(result.snapshot).toMatchObject({
      timestampUnit: TIMESTAMP_UNIT,
      evaluatedAt: DECISION_BAR_OPEN_MS + 1_000,
      decisionBarOpenAt: DECISION_BAR_OPEN_MS,
      version: {
        contractVersion: CONFLUENCE_CONTRACT_VERSION,
        strategyId: "unit-closed-bar-strategy",
        strategyVersion: 7,
        configVersion: 3,
      },
      approval: { status: "approved", approvedBy: "UNIT_REVIEWER" },
    });
    expect(result.snapshot.trigger?.status).toBe("met");
    expect(result.snapshot.checklist.map((item) => item.status)).toEqual([
      "met",
      "not-met",
    ]);

    contract.approval.approvedBy = "MUTATED_AFTER_EVALUATION";
    contract.conditions[0].source.name = "MUTATED_AFTER_EVALUATION";
    expect(result.snapshot.approval?.approvedBy).toBe("UNIT_REVIEWER");
    expect(result.snapshot.checklist[0].source.name).toBe(
      "UNIT closed price feed",
    );
  });

  it("fails closed when a required source is stale, pending, future, or based on an incomplete bar", () => {
    const staleBase = unitInput();
    const stale = {
      ...staleBase,
      conditions: staleBase.conditions.map((condition, index) =>
        index === 0
          ? { ...condition, providerStatus: "stale" as const }
          : condition,
      ),
    };
    const staleResult = evaluateConfluence(unitContract(), stale);
    expect(staleResult.snapshot.checklist[0].status).toBe("pending");
    expect(staleResult.strategyEntryEligible).toBe(false);
    expect(staleResult.blockedReasons.join(" ")).toContain(
      "Active source for condition trend-alignment",
    );

    const futureBase = unitInput();
    const future = {
      ...futureBase,
      conditions: futureBase.conditions.map((condition, index) =>
        index === 0
          ? {
              ...condition,
              providerStatus: "future" as const,
              bar: "future" as const,
              observedAt: futureBase.evaluatedAt + 1,
            }
          : condition,
      ),
    };
    const futureResult = evaluateConfluence(unitContract(), future);
    expect(futureResult.snapshot.checklist[0].status).toBe("pending");
    expect(futureResult.strategyEntryEligible).toBe(false);

    const incompleteBase = unitInput();
    const incomplete = {
      ...incompleteBase,
      conditions: incompleteBase.conditions.map((condition, index) =>
        index === 0
          ? {
              ...condition,
              bar: "t" as const,
              lastClosedBarAt: incompleteBase.decisionBarOpenAt + 1,
            }
          : condition,
      ),
    };
    const incompleteResult = evaluateConfluence(unitContract(), incomplete);
    expect(incompleteResult.snapshot.checklist[0].status).toBe("pending");
    expect(incompleteResult.snapshot.checklist[0].reasons.join(" ")).toContain(
      "incomplete bar",
    );
    expect(incompleteResult.strategyEntryEligible).toBe(false);
  });

  it("uses observedAt and lastClosedBarAt freshness in milliseconds rather than silently accepting delayed data", () => {
    const delayedBase = unitInput();
    const delayed = {
      ...delayedBase,
      conditions: delayedBase.conditions.map((condition, index) =>
        index === 0
          ? {
              ...condition,
              observedAt: delayedBase.evaluatedAt - 61_000,
              lastClosedBarAt: delayedBase.evaluatedAt - 61_000,
            }
          : condition,
      ),
    };
    const result = evaluateConfluence(unitContract(), delayed);
    expect(result.snapshot.checklist[0]).toMatchObject({
      status: "pending",
      providerStatus: "ready",
    });
    expect(result.snapshot.checklist[0].reasons.join(" ")).toContain(
      "freshness limit",
    );
    expect(result.strategyEntryEligible).toBe(false);
  });

  it("rejects invalid versions, non-normalized weights, and zero enabled weight instead of inventing defaults", () => {
    const invalid = {
      ...unitContract(),
      contractVersion: 99,
      conditions: unitContract().conditions.map((condition) => ({
        ...condition,
        weight: 0,
      })),
    } as unknown as ConfluenceStrategyContract;
    const validation = validateConfluenceConfig(invalid);
    const result = evaluateConfluence(invalid, unitInput());

    expect(validation.valid).toBe(false);
    expect(validation.issues.join(" ")).toContain("contractVersion");
    expect(validation.issues.join(" ")).toContain("greater than zero");
    expect(result).toMatchObject({
      configValid: false,
      deterministicScore: null,
      threshold: null,
      gateMet: false,
      strategyEntryEligible: false,
      successProbability: null,
    });

    const unnormalized = unitContract();
    unnormalized.conditions[0].weight = 55;
    expect(validateConfluenceConfig(unnormalized).valid).toBe(false);
    expect(validateConfluenceConfig(unnormalized).issues.join(" ")).toContain(
      "not auto-normalized",
    );
  });

  it("keeps a zero threshold explicit but never lets the trigger fire alone", () => {
    const contract = unitContract();
    contract.threshold = 0;
    const input = unitInput();
    input.conditions = input.conditions.map((condition) => ({
      ...condition,
      status: "not-met",
    }));
    const result = evaluateConfluence(contract, input);

    expect(result.gateMet).toBe(true);
    expect(result.deterministicScore).toBe(0);
    expect(result.strategyEntryEligible).toBe(false);
    expect(result.blockedReasons).toContain(
      "No enabled condition is met; a trigger alone is insufficient.",
    );
  });

  it("only labels evidence confirmed with 100 actual samples, passed declared walk-forward, and untouched declared holdout", () => {
    // Metadata-only UNIT fixtures: no win-rate, probability, ML, or outcome calculation is performed.
    const tooFew = validationEligibility({
      actualSamples: 99,
      walkForward: { declared: true, passed: true },
      holdout: { declared: true, untouched: true, passed: true },
      multipleTesting: { hypotheses: 1, corrected: true },
    });
    expect(tooFew).toMatchObject({
      status: "unconfirmed",
      mayClaimConfirmedEvidence: false,
      successProbability: null,
    });

    const touchedHoldout = validationEligibility({
      actualSamples: 100,
      walkForward: { declared: true, passed: true },
      holdout: { declared: true, untouched: false, passed: true },
      multipleTesting: { hypotheses: 1, corrected: true },
    });
    expect(touchedHoldout.mayClaimConfirmedEvidence).toBe(false);

    const confirmed = validationEligibility({
      actualSamples: 100,
      walkForward: { declared: true, passed: true },
      holdout: { declared: true, untouched: true, passed: true },
      multipleTesting: { hypotheses: 1, corrected: true },
    });
    expect(confirmed).toEqual({
      actualSamples: 100,
      status: "confirmed",
      mayClaimConfirmedEvidence: true,
      successProbability: null,
      reasons: [],
    });
  });
});

describe("additional strict confluence guards — UNIT fixtures", () => {
  it("blocks unapproved configurations and any active stale source even at a met gate", () => {
    const draft = unitContract();
    draft.approval = { status: "draft", approvedAt: null, approvedBy: null };
    expect(evaluateConfluence(draft, unitInput()).strategyEntryEligible).toBe(
      false,
    );
    const input = unitInput();
    input.conditions = input.conditions.map((c, i) =>
      i === 1 ? { ...c, providerStatus: "disconnected" } : c,
    );
    const result = evaluateConfluence(unitContract(), input);
    expect(result.gateMet).toBe(true);
    expect(result.strategyEntryEligible).toBe(false);
  });
  it("withholds confirmation when holdout failed or hypothesis correction is absent", () => {
    expect(
      validationEligibility({
        actualSamples: 100,
        walkForward: { declared: true, passed: true },
        holdout: { declared: true, untouched: true, passed: false },
        multipleTesting: { hypotheses: 10, corrected: true },
      }).mayClaimConfirmedEvidence,
    ).toBe(false);
    expect(
      validationEligibility({
        actualSamples: 100,
        walkForward: { declared: true, passed: true },
        holdout: { declared: true, untouched: true, passed: true },
        multipleTesting: { hypotheses: 10, corrected: false },
      }).mayClaimConfirmedEvidence,
    ).toBe(false);
  });
});
