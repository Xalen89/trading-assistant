import type { AlertRule } from "./model";
import type { ConfluenceEvaluation } from "./confluence-contract";
export function confluenceAlertDecision(
  rule: AlertRule,
  evaluation: ConfluenceEvaluation,
): {
  fire: boolean;
  reason: string;
  met: number;
  total: number;
  score: number | null;
} {
  const items = evaluation.snapshot.checklist.filter((c) => c.enabled),
    met = items.filter((c) => c.status === "met").length,
    total = items.length,
    score = evaluation.deterministicScore;
  const result = (fire: boolean, reason: string) => ({
    fire,
    reason,
    met,
    total,
    score,
  });
  if (!evaluation.configValid || score === null)
    return result(false, "Confluence configuration is invalid.");
  if (evaluation.snapshot.approval?.status !== "approved")
    return result(
      false,
      "Review and approve the confluence configuration before using a weighted alert.",
    );
  if (evaluation.snapshot.trigger?.status !== "met")
    return result(
      false,
      "Named trigger has not fired on a sourced closed bar.",
    );
  if (items.some((c) => c.status === "pending"))
    return result(
      false,
      "An active confluence source is pending/stale; no actionable alert emitted.",
    );
  const minimum = rule.minimumPoints ?? evaluation.threshold ?? 100,
    needed = rule.minimumConditions ?? 1;
  if (rule.kind === "below-gate") {
    const belowAlertThreshold = score < minimum || met < needed;
    return result(
      belowAlertThreshold,
      `Trigger met; ${met}/${total} conditions and ${score}/100 ${belowAlertThreshold ? "below" : "meet"} your warning threshold of ${minimum} points and ${needed} conditions. Approved entry gate ${evaluation.threshold} is ${evaluation.gateMet ? "met" : "not met"}; alerting is not execution.`,
    );
  }
  return result(
    score >= minimum && met >= needed && met > 0,
    `${met}/${total} conditions met; ${score}/100 against your alert threshold ${minimum}. Entry gate ${evaluation.threshold} is ${evaluation.gateMet ? "met" : "not met"}; alerting is not execution.`,
  );
}
