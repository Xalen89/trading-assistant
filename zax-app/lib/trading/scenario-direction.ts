import type { ForecastScenario, SetupAnalysis } from "./setup-model";
import type { Strategy } from "./model";
import { scenarioDirection } from "./historical-scenario";

export type ScenarioDirection = "up" | "down";
export type DirectionBaseline = {
  context: string;
  lastDirection?: ScenarioDirection;
  lastAsOf: number;
  sequence: number;
};
export type DirectionChange = {
  previous: ScenarioDirection;
  current: ScenarioDirection;
  sequence: number;
  asOf: number;
  context: string;
};

/** Stable source/version context. A strategy or provider change is not a price-direction flip. */
export function scenarioDirectionContext(
  analysis: Pick<
    SetupAnalysis,
    | "market"
    | "timeframe"
    | "combination"
    | "source"
    | "selectedStrategyIds"
    | "scenario"
  >,
  strategies: Strategy[],
): string {
  const versions = analysis.selectedStrategyIds
    .map((id) => {
      const index = analysis.scenario?.strategyIds.indexOf(id) ?? -1;
      return [
        id,
        index >= 0
          ? analysis.scenario?.strategyVersions[index]
          : (strategies.find((s) => s.id === id)?.version ?? 0),
      ];
    })
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return JSON.stringify([
    analysis.market,
    analysis.timeframe,
    analysis.combination,
    versions,
    analysis.source,
  ]);
}

export function observeScenarioDirection(
  prior: DirectionBaseline | undefined,
  observation: { context: string; asOf: number; scenario?: ForecastScenario },
): { state: DirectionBaseline; change?: DirectionChange } {
  const { context, scenario, asOf } = observation;
  const time =
    Number.isFinite(asOf) && asOf > 0 ? asOf : (prior?.lastAsOf ?? 0);
  if (prior && prior.context === context && time < prior.lastAsOf)
    return { state: prior };
  // Missing source does not erase the last directional baseline or manufacture a context reset.
  if (!scenario)
    return { state: prior ?? { context, lastAsOf: time, sequence: 0 } };
  const direction = scenarioDirection(scenario);
  const fresh = !prior || prior.context !== context;
  const state: DirectionBaseline = fresh
    ? { context, lastAsOf: time, sequence: prior?.sequence ?? 0 }
    : { ...prior, lastAsOf: time };
  if (!direction || direction === "flat") return { state };
  if (!state.lastDirection)
    return { state: { ...state, lastDirection: direction } };
  if (direction === state.lastDirection) return { state };
  const sequence = state.sequence + 1;
  return {
    state: { ...state, sequence, lastDirection: direction },
    change: {
      previous: state.lastDirection,
      current: direction,
      sequence,
      asOf: time,
      context,
    },
  };
}
