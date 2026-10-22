import type { QuantLabResult } from "../../lib/trading/quant-lab-types";
export interface QuantResearchRecord {
  family: string;
  generatedAt: number;
  sources: {
    symbol: string;
    source: string;
    barCount: number;
    asOf: number;
    provenance: string;
  }[];
  result: QuantLabResult;
}
const records = new Map<number, QuantResearchRecord[]>();
export function rememberQuantResearch(
  userId: number,
  value: QuantResearchRecord,
) {
  const previous = records.get(userId) || [];
  records.set(
    userId,
    [value, ...previous.filter((r) => r.family !== value.family)].slice(0, 5),
  );
  if (records.size > 1000) records.delete(records.keys().next().value!);
}
/** Caller must already be authenticated owner. Session research is not a sealed dataset or validation registry. */
export function recentQuantResearch(userId: number) {
  return (records.get(userId) || [])
    .filter((r) => Date.now() - r.generatedAt < 3600000)
    .map((r) => ({
      family: r.family,
      generatedAt: r.generatedAt,
      sources: r.sources,
      title: r.result.title,
      summary: r.result.summary,
      metrics: r.result.metrics,
      signals: r.result.signals.slice(-8),
      validation: r.result.validation,
      limitations: r.result.limitations,
      retention:
        "Current server-session research only; lost on restart, never a confirmed edge.",
    }));
}
