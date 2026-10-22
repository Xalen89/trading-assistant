import type { ConfluenceCondition } from "./confluence-contract";

/** Explicit configuration edit helper, not automatic tuning or evidence of edge. */
export function normalizeConfluenceWeights(
  conditions: readonly ConfluenceCondition[],
): ConfluenceCondition[] {
  if (
    !conditions.length ||
    conditions.some((c) => !Number.isFinite(c.weight) || c.weight < 0)
  ) {
    throw new Error("Confluence weights must be finite and nonnegative.");
  }
  const total = conditions.reduce(
    (sum, c) => sum + (c.enabled ? c.weight : 0),
    0,
  );
  if (!Number.isFinite(total) || total <= 0)
    throw new Error(
      "At least one enabled condition must have positive weight.",
    );
  return conditions.map((c) => ({
    ...c,
    source: { ...c.source, freshness: { ...c.source.freshness } },
    weight: c.enabled ? (c.weight / total) * 100 : c.weight,
  }));
}
