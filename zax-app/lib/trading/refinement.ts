import type { Strategy, Trade } from "./model";
import { tradeMetrics } from "./engine";
export function proposeRefinement(strategy: Strategy, trades: Trade[]) {
  const eligible = trades.filter(
    (t) =>
      t.status === "closed" &&
      t.strategyId === strategy.id &&
      t.strategyVersion === strategy.version &&
      Number.isFinite(tradeMetrics(t).r),
  );
  const proposals: {
    factorId: string;
    name: string;
    weight: number;
    before: number;
    withCount: number;
    withoutCount: number;
    meanDifference: number;
  }[] = [];
  if (eligible.length >= 30)
    for (const f of strategy.factors.filter((f) => f.enabled)) {
      const tagged = (t: Trade) =>
          t.factors.some(
            (key) =>
              key === f.name ||
              key === f.id ||
              key === `${strategy.id}:v${strategy.version}:${f.id}`,
          ),
        withFactor = eligible.filter(tagged),
        without = eligible.filter((t) => !tagged(t));
      if (withFactor.length < 10 || without.length < 10) continue;
      const mean = (list: Trade[]) =>
          list.reduce((sum, t) => sum + (tradeMetrics(t).r || 0), 0) /
          list.length,
        difference = mean(withFactor) - mean(without);
      if (Math.abs(difference) < 0.25) continue;
      const weight = Math.max(
        0,
        Math.min(100, f.weight + (difference > 0 ? 5 : -5)),
      );
      if (weight !== f.weight)
        proposals.push({
          factorId: f.id,
          name: f.name,
          weight,
          before: f.weight,
          withCount: withFactor.length,
          withoutCount: without.length,
          meanDifference: difference,
        });
    }
  return {
    strategyId: strategy.id,
    strategyVersion: strategy.version,
    samples: eligible.length,
    proposals,
    message:
      eligible.length < 30
        ? `Need 30 closed paper trades from this exact strategy version; ${eligible.length} available. No weights changed.`
        : proposals.length
          ? "Observational factor associations suggest review candidates; no strategy was changed."
          : "No factor has adequate contrasted support and effect size; no weights changed.",
    limitations:
      "Paper outcomes only; at least ten factor-present and ten factor-absent observations, 0.25 original-R mean difference, five-weight-point proposals. Correlated factors, market regime, fill assumptions and costs confound these associations. Not causal evidence, calibrated probability, profitability improvement, or fine-tuning. Accept only after review and out-of-sample research.",
  };
}
