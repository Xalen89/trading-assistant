import type { SetupAnalysis } from "./setup-model";
export function setupSignalIdentity(analysis: SetupAnalysis) {
  return JSON.stringify(
    analysis.candidates
      .filter((c) => c.ready)
      .map((c) => [
        c.strategyId,
        c.strategyVersion,
        c.side,
        c.zones.map((z) => z.id),
      ]),
  );
}
export function meaningfulScenarioChange(
  previous: SetupAnalysis | undefined,
  next: SetupAnalysis,
) {
  if (!previous) return Boolean(next.scenario);
  if (Boolean(previous.scenario) !== Boolean(next.scenario)) return true;
  if (!previous.scenario || !next.scenario) return false;
  if (previous.scenario.side !== next.scenario.side) return true;
  const p = previous.scenario,
    n = next.scenario;
  const oldBase = previous.candles.at(-1)?.close,
    newBase = next.candles.at(-1)?.close;
  if (!oldBase || !newBase) return false;
  const count = Math.min(p.candles.length, n.candles.length);
  if (!count) return false;
  const distance = Math.sqrt(
    n.candles
      .slice(0, count)
      .reduce(
        (sum, c, i) =>
          sum + (c.close / newBase - p.candles[i].close / oldBase) ** 2,
        0,
      ) / count,
  );
  const threshold = Math.max(
    0.001,
    ((next.rhythm?.volatility || 0) / 100) * 0.25,
  );
  return distance >= threshold;
}
