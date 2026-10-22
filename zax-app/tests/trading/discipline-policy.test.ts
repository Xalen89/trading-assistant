import { describe, expect, it } from "vitest";
import {
  hasEnforcedDisciplineBlock,
  selectDisciplineGuards,
} from "../../lib/trading/discipline-policy";
import type { DisciplineFlag } from "../../lib/trading/trading-discipline";

function flag(
  id: string,
  severity: DisciplineFlag["severity"] = "warning",
): DisciplineFlag {
  return {
    id,
    severity,
    title: id,
    evidence: ["Canonical, observable record."],
    action: "Review the written rule.",
  };
}

describe("discipline guard policy", () => {
  it("leaves all observed conditions advisory by default", () => {
    const selected = selectDisciplineGuards(undefined, [
      flag("rapid-reentry-after-loss"),
      flag("loss-streak"),
    ]);

    expect(selected.enabled).toEqual([]);
    expect(selected.actualFlags.map((item) => item.id)).toEqual([
      "rapid-reentry-after-loss",
      "loss-streak",
    ]);
    expect(selected.blocks).toEqual([]);
  });

  it("blocks only the actual flag with the corresponding enabled guard", () => {
    const selected = selectDisciplineGuards(
      { enforceCooldown: true, enforceRiskEscalation: true },
      [
        flag("rapid-reentry-after-loss"),
        flag("daily-trade-count"),
        flag("risk-escalation-after-loss"),
      ],
    );

    expect(selected.enabled).toEqual(["cooldown", "riskEscalation"]);
    expect(selected.actualFlags.map((item) => item.id)).toEqual([
      "rapid-reentry-after-loss",
      "daily-trade-count",
      "risk-escalation-after-loss",
    ]);
    expect(selected.blocks.map((block) => block.guard)).toEqual([
      "cooldown",
      "riskEscalation",
    ]);
    expect(selected.blocks.map((block) => block.flag.id)).toEqual([
      "rapid-reentry-after-loss",
      "risk-escalation-after-loss",
    ]);
    expect(
      hasEnforcedDisciplineBlock({ enforceOvertrading: true }, [
        flag("daily-trade-count"),
      ]),
    ).toBe(true);
  });

  it("never turns unknown/info notes or self-reported state into a block", () => {
    const selected = selectDisciplineGuards(
      {
        enforceCooldown: true,
        enforceOvertrading: true,
        enforceRiskEscalation: true,
        enforceLossStreak: true,
      },
      [
        flag("rapid-reentry-after-loss", "info"),
        flag("self-reported-state"),
        flag("unknown-recent-risk-baseline", "info"),
      ],
    );

    expect(selected.actualFlags).toEqual([]);
    expect(selected.blocks).toEqual([]);
  });
});
