import { describe, it, expect } from "vitest";
import { confluenceAlertDecision } from "../../lib/trading/confluence-alerts";
import type { AlertRule } from "../../lib/trading/model";
import type { ConfluenceEvaluation } from "../../lib/trading/confluence-contract";
const rule = {
  kind: "confluence",
  minimumPoints: 70,
  minimumConditions: 2,
} as AlertRule;
const base = {
  configValid: true,
  deterministicScore: 80,
  threshold: 85,
  gateMet: false,
  snapshot: {
    approval: { status: "approved" },
    trigger: { status: "met" },
    checklist: [
      { enabled: true, status: "met" },
      { enabled: true, status: "met" },
      { enabled: true, status: "not-met" },
    ],
  },
} as unknown as ConfluenceEvaluation;
describe("Weighted alerts — synthetic state fixtures only", () => {
  it("lets user alert below an entry gate without granting execution", () => {
    const result = confluenceAlertDecision(rule, base);
    expect(result.fire).toBe(true);
    expect(result.reason).toContain("not execution");
  });
  it("requires count, trigger and approval", () => {
    expect(
      confluenceAlertDecision({ ...rule, minimumConditions: 3 }, base).fire,
    ).toBe(false);
    expect(
      confluenceAlertDecision(rule, {
        ...base,
        snapshot: {
          ...base.snapshot,
          trigger: { ...base.snapshot.trigger!, status: "not-met" },
        },
      }).fire,
    ).toBe(false);
    expect(
      confluenceAlertDecision(rule, {
        ...base,
        snapshot: {
          ...base.snapshot,
          approval: { ...base.snapshot.approval!, status: "draft" },
        },
      }).fire,
    ).toBe(false);
  });
  it("blocks pending/stale enabled evidence", () => {
    expect(
      confluenceAlertDecision(rule, {
        ...base,
        snapshot: {
          ...base.snapshot,
          checklist: [{ ...base.snapshot.checklist[0], status: "pending" }],
        },
      }).fire,
    ).toBe(false);
  });
  it("warns of a sourced trigger below the approved gate", () => {
    expect(
      confluenceAlertDecision(
        { ...rule, kind: "below-gate", minimumPoints: 85 },
        base,
      ).fire,
    ).toBe(true);
    expect(
      confluenceAlertDecision(
        { ...rule, kind: "below-gate", minimumPoints: 85 },
        { ...base, gateMet: true, deterministicScore: 90 },
      ).fire,
    ).toBe(false);
  });

  it("uses below-gate minimum points and condition settings rather than a dead UI", () => {
    const warning = confluenceAlertDecision(
      {
        ...rule,
        kind: "below-gate",
        minimumPoints: 90,
        minimumConditions: 3,
      },
      base,
    );
    expect(warning.fire).toBe(true);
    expect(warning.reason).toContain("90 points and 3 conditions");

    expect(
      confluenceAlertDecision(
        {
          ...rule,
          kind: "below-gate",
          minimumPoints: 70,
          minimumConditions: 2,
        },
        base,
      ).fire,
    ).toBe(false);
  });
});
