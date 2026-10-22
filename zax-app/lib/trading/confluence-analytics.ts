import { tradeMetrics } from "./engine";
import type { ConfluenceEvaluationSnapshot } from "./confluence-contract";
import type { Trade } from "./model";
import type { TradeFeatureSnapshot } from "./trade-features";

export const MINIMUM_DESCRIPTIVE_GROUP_SIZE = 100;
export const MAX_CORRELATION_CONDITIONS = 100;
export const MAX_CORRELATION_TRADES = 2_000;

export type AnalyticsEvidenceStatus = "insufficient-data" | "unconfirmed";

export type DescriptiveOutcomeMetrics = {
  count: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number | null;
  expectancyR: number | null;
  profitFactor: number | null;
  grossProfit: number;
  grossLoss: number;
  status: AnalyticsEvidenceStatus;
  scope: string;
};

export type ScoreBucket = {
  label: "0-24" | "25-49" | "50-74" | "75-100";
  minScore: number;
  maxScore: number;
  metrics: DescriptiveOutcomeMetrics;
};

export type ConditionContribution = {
  key: string;
  conditionId: string;
  strategyId: string | null;
  name: string | null;
  predicate: string | null;
  present: DescriptiveOutcomeMetrics;
  absent: DescriptiveOutcomeMetrics;
  /** Present expectancy R minus absent expectancy R; null until both groups have 100 outcomes. */
  expectancyDifferenceR: number | null;
  comparisonStatus: AnalyticsEvidenceStatus;
  rank: number | null;
  interpretation: string;
};

export type RegimeContribution = {
  regime: "trending" | "choppy" | "unknown" | "high" | "low";
  metrics: DescriptiveOutcomeMetrics;
};

export type CorrelatedCondition = {
  leftKey: string;
  rightKey: string;
  /** Standard Pearson correlation of matched binary met/not-met observations. */
  correlation: number;
  count: number;
  status: AnalyticsEvidenceStatus;
  interpretation: string;
};

export type ZeroVarianceCorrelation = {
  leftKey: string;
  rightKey: string;
  count: number;
  correlation: null;
};

export type HumanRuleProposal = {
  kind: "watch" | "review";
  automatic: false;
  evidenceStatus: AnalyticsEvidenceStatus;
  title: string;
  basis: string;
  action: string;
};

export type ExploratoryChronologicalGate = {
  status: "not-available" | "candidate";
  selection: string;
  untouchedHoldoutUsedForTuning: false;
  candidate: {
    conditionKey: string;
    train: {
      present: DescriptiveOutcomeMetrics;
      absent: DescriptiveOutcomeMetrics;
      expectancyDifferenceR: number;
    };
    holdout: {
      present: DescriptiveOutcomeMetrics;
      absent: DescriptiveOutcomeMetrics;
      expectancyDifferenceR: number | null;
    };
  } | null;
  message: string;
};

export type ConfluenceTradeAnalytics = {
  asOf: number;
  learningSourceStatus: {
    status: "paper-only";
    realMoney: false;
    executionData: false;
    message: string;
  };
  outcomeCoverage: {
    inputTrades: number;
    eligibleClosedOutcomes: number;
    excluded: {
      notClosed: number;
      invalidClosedTimestamp: number;
      futureClosedTimestamp: number;
      invalidOutcome: number;
      invalidOriginalRisk: number;
    };
    entryFeatures: {
      available: number;
      missing: number;
      futureOrInvalid: number;
    };
    confluenceSnapshots: {
      available: number;
      missing: number;
      futureOrInvalid: number;
    };
  };
  /** Overall eligible paper outcomes, not limited by the correlation caps. */
  overall: DescriptiveOutcomeMetrics;
  /** Bounded records used for all snapshot/condition/regime comparisons. */
  boundedAnalysis: {
    tradeCap: number;
    conditionCap: number;
    eligibleOutcomesAvailable: number;
    eligibleOutcomesUsed: number;
    omittedOutcomes: number;
    observedConditionKeys: number;
    omittedConditionKeys: number;
    selection: string;
  };
  scoreBuckets: ScoreBucket[];
  conditionContribution: ConditionContribution[];
  conditionRanking: string;
  regimes: {
    trend: RegimeContribution[];
    volatility: RegimeContribution[];
  };
  correlatedConditions: CorrelatedCondition[];
  correlationDiagnostics: {
    pairsConsidered: number;
    insufficientCommonObservationPairs: number;
    zeroVariancePairs: ZeroVarianceCorrelation[];
  };
  exploratoryChronologicalGate: ExploratoryChronologicalGate;
  humanRuleProposals: HumanRuleProposal[];
};

type OutcomeRecord = {
  id: string;
  closedAt: number;
  entryAt: number | null;
  pnl: number;
  r: number;
  featureSnapshot: TradeFeatureSnapshot | null;
  confluenceSnapshot: ConfluenceEvaluationSnapshot | null;
};

type ConditionObservation = {
  key: string;
  conditionId: string;
  strategyId: string | null;
  name: string | null;
  predicate: string | null;
  met: boolean;
  record: OutcomeRecord;
};

type CorrelationSummary = Pick<
  ConfluenceTradeAnalytics,
  "correlatedConditions" | "correlationDiagnostics"
>;

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const positive = (value: unknown): value is number =>
  finite(value) && value > 0;
const validEpochMilliseconds = (value: unknown): value is number =>
  finite(value) && value > 0;

function outcomeStatus(count: number): AnalyticsEvidenceStatus {
  return count < MINIMUM_DESCRIPTIVE_GROUP_SIZE
    ? "insufficient-data"
    : "unconfirmed";
}

function originalRisk(trade: Trade): number | null {
  if (positive(trade.initialRisk)) return trade.initialRisk;
  const quantity = positive(trade.initialQuantity)
    ? trade.initialQuantity
    : trade.quantity;
  const stop = positive(trade.originalStop) ? trade.originalStop : trade.stop;
  const target = positive(trade.originalTarget)
    ? trade.originalTarget
    : trade.target;
  const validGeometry =
    positive(trade.entry) &&
    positive(stop) &&
    positive(target) &&
    positive(quantity) &&
    positive(trade.pointValue) &&
    (trade.side === "long"
      ? stop < trade.entry && target > trade.entry
      : stop > trade.entry && target < trade.entry);
  if (!validGeometry) return null;
  // Preserve the entry bracket/quantity if the working stop was moved after a
  // partial. This follows tradeMetrics' valuation conversion, including USDJPY
  // and USDCAD, rather than applying an ad-hoc P/L formula.
  const metrics = tradeMetrics({
    ...trade,
    quantity,
    stop,
    target,
    initialRisk: undefined,
  });
  return positive(metrics.risk) ? metrics.risk : null;
}

function outcomeMetrics(
  records: readonly OutcomeRecord[],
  scope: string,
): DescriptiveOutcomeMetrics {
  let wins = 0;
  let losses = 0;
  let breakeven = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let sumR = 0;
  for (const record of records) {
    sumR += record.r;
    if (record.pnl > 0) {
      wins += 1;
      grossProfit += record.pnl;
    } else if (record.pnl < 0) {
      losses += 1;
      grossLoss += Math.abs(record.pnl);
    } else breakeven += 1;
  }
  const count = records.length;
  return {
    count,
    wins,
    losses,
    breakeven,
    winRate: count ? wins / count : null,
    expectancyR: count ? sumR / count : null,
    // Infinity would overstate a finite observation set. A no-loss group has
    // an undefined profit factor, not an infinite edge.
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    grossProfit,
    grossLoss,
    status: outcomeStatus(count),
    scope,
  };
}

function entryTimestamp(trade: Trade): number | null {
  const candidate = trade.openedAt ?? trade.createdAt;
  return validEpochMilliseconds(candidate) ? candidate : null;
}

function entryFeatureSnapshot(
  trade: Trade,
  at: number | null,
): { snapshot: TradeFeatureSnapshot | null; invalid: boolean } {
  const snapshot = trade.entryFeatures;
  if (!snapshot) return { snapshot: null, invalid: false };
  if (
    at === null ||
    snapshot.version !== 1 ||
    !validEpochMilliseconds(snapshot.asOf) ||
    snapshot.asOf > at
  )
    return { snapshot: null, invalid: true };
  if (
    snapshot.regime !== "trending" &&
    snapshot.regime !== "choppy" &&
    snapshot.regime !== "unknown"
  )
    return { snapshot: null, invalid: true };
  if (
    snapshot.volatilityRegime !== "high" &&
    snapshot.volatilityRegime !== "low" &&
    snapshot.volatilityRegime !== "unknown"
  )
    return { snapshot: null, invalid: true };
  return { snapshot, invalid: false };
}

function entryConfluenceSnapshot(
  trade: Trade,
  at: number | null,
): { snapshot: ConfluenceEvaluationSnapshot | null; invalid: boolean } {
  const supplied = trade.confluenceSnapshots;
  if (!Array.isArray(supplied) || supplied.length === 0)
    return { snapshot: null, invalid: false };
  if (at === null) return { snapshot: null, invalid: true };
  const eligible = supplied.filter(
    (snapshot) =>
      validEpochMilliseconds(snapshot.evaluatedAt) &&
      snapshot.evaluatedAt! <= at &&
      (snapshot.decisionBarOpenAt === null ||
        (validEpochMilliseconds(snapshot.decisionBarOpenAt) &&
          snapshot.decisionBarOpenAt <= at)),
  );
  if (!eligible.length) return { snapshot: null, invalid: true };
  return {
    snapshot: [...eligible].sort(
      (left, right) => right.evaluatedAt! - left.evaluatedAt!,
    )[0],
    invalid: false,
  };
}

function conditionKey(
  snapshot: ConfluenceEvaluationSnapshot,
  conditionId: string,
): { key: string; strategyId: string | null } {
  const strategyId = snapshot.version?.strategyId?.trim() || null;
  return {
    strategyId,
    key: `${strategyId || "unknown-strategy"}:${conditionId}`,
  };
}

function conditionObservations(
  records: readonly OutcomeRecord[],
): ConditionObservation[] {
  const observations: ConditionObservation[] = [];
  for (const record of records) {
    const snapshot = record.confluenceSnapshot;
    if (!snapshot) continue;
    for (const item of snapshot.checklist) {
      if (
        !item.enabled ||
        !item.conditionId?.trim() ||
        (item.status !== "met" && item.status !== "not-met")
      )
        continue;
      const key = conditionKey(snapshot, item.conditionId);
      observations.push({
        key: key.key,
        conditionId: item.conditionId,
        strategyId: key.strategyId,
        name: item.name?.trim() || null,
        predicate: item.predicate?.trim() || null,
        met: item.status === "met",
        record,
      });
    }
  }
  return observations;
}

/**
 * Standard sample Pearson correlation. A constant (zero-variance) series has
 * no defined correlation and returns null rather than a manufactured zero.
 */
export function standardPearson(
  left: readonly number[],
  right: readonly number[],
): number | null {
  if (left.length !== right.length || left.length < 2) return null;
  if (
    left.some((value) => !finite(value)) ||
    right.some((value) => !finite(value))
  )
    return null;
  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length;
  let numerator = 0;
  let leftSquares = 0;
  let rightSquares = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = left[index] - leftMean;
    const rightDelta = right[index] - rightMean;
    numerator += leftDelta * rightDelta;
    leftSquares += leftDelta * leftDelta;
    rightSquares += rightDelta * rightDelta;
  }
  const denominator = Math.sqrt(leftSquares * rightSquares);
  return denominator > 0 ? numerator / denominator : null;
}

function difference(
  present: DescriptiveOutcomeMetrics,
  absent: DescriptiveOutcomeMetrics,
): number | null {
  if (
    present.count < MINIMUM_DESCRIPTIVE_GROUP_SIZE ||
    absent.count < MINIMUM_DESCRIPTIVE_GROUP_SIZE ||
    present.expectancyR === null ||
    absent.expectancyR === null
  )
    return null;
  return present.expectancyR - absent.expectancyR;
}

function buildContributions(records: readonly OutcomeRecord[]): {
  contributions: ConditionContribution[];
  observedKeys: number;
} {
  const observations = conditionObservations(records);
  const allKeys = [...new Set(observations.map((item) => item.key))].sort();
  const selectedKeys = new Set(allKeys.slice(0, MAX_CORRELATION_CONDITIONS));
  const byKey = new Map<string, ConditionObservation[]>();
  for (const observation of observations)
    if (selectedKeys.has(observation.key)) {
      const current = byKey.get(observation.key) || [];
      current.push(observation);
      byKey.set(observation.key, current);
    }

  const contributions: ConditionContribution[] = [...byKey.entries()].map(
    ([key, entries]) => {
      const first = entries[0];
      // At most one evaluator snapshot is selected per trade, but duplicate
      // checklist entries are still deduplicated by trade id defensively.
      const present = new Map<string, OutcomeRecord>();
      const absent = new Map<string, OutcomeRecord>();
      entries.forEach((entry) =>
        (entry.met ? present : absent).set(entry.record.id, entry.record),
      );
      const presentMetrics = outcomeMetrics(
        [...present.values()],
        "Observed paper outcomes with this condition status met.",
      );
      const absentMetrics = outcomeMetrics(
        [...absent.values()],
        "Observed paper outcomes with this condition status not-met; missing or pending snapshots are excluded, never treated as absent.",
      );
      const expectancyDifferenceR = difference(presentMetrics, absentMetrics);
      return {
        key,
        conditionId: first.conditionId,
        strategyId: first.strategyId,
        name: first.name,
        predicate: first.predicate,
        present: presentMetrics,
        absent: absentMetrics,
        expectancyDifferenceR,
        comparisonStatus:
          expectancyDifferenceR === null ? "insufficient-data" : "unconfirmed",
        rank: null,
        interpretation:
          "Present-minus-absent observed expectancy R is descriptive only. It is not a success probability, optimal threshold, or authorization to alter a rule.",
      } satisfies ConditionContribution;
    },
  );

  contributions.sort((left, right) => {
    const leftScore = Math.abs(left.expectancyDifferenceR ?? -Infinity);
    const rightScore = Math.abs(right.expectancyDifferenceR ?? -Infinity);
    if (rightScore !== leftScore) return rightScore - leftScore;
    return left.key.localeCompare(right.key);
  });
  let rank = 0;
  contributions.forEach((contribution) => {
    if (contribution.expectancyDifferenceR !== null) {
      rank += 1;
      contribution.rank = rank;
    }
  });
  return { contributions, observedKeys: allKeys.length };
}

function scoreBuckets(records: readonly OutcomeRecord[]): ScoreBucket[] {
  const definitions: Array<
    Pick<ScoreBucket, "label" | "minScore" | "maxScore">
  > = [
    { label: "0-24", minScore: 0, maxScore: 24 },
    { label: "25-49", minScore: 25, maxScore: 49 },
    { label: "50-74", minScore: 50, maxScore: 74 },
    { label: "75-100", minScore: 75, maxScore: 100 },
  ];
  return definitions.map((definition) => {
    const inBucket = records.filter((record) => {
      const score = record.confluenceSnapshot?.deterministicScore;
      return (
        finite(score) &&
        score >= definition.minScore &&
        score <= definition.maxScore
      );
    });
    return {
      ...definition,
      metrics: outcomeMetrics(
        inBucket,
        "Observed paper outcomes with a point-in-time deterministic confluence score in this fixed descriptive bucket.",
      ),
    };
  });
}

function regimeGroups(
  records: readonly OutcomeRecord[],
): ConfluenceTradeAnalytics["regimes"] {
  const trend = (["trending", "choppy", "unknown"] as const).map((regime) => ({
    regime,
    metrics: outcomeMetrics(
      records.filter((record) => record.featureSnapshot?.regime === regime),
      "Observed paper outcomes with an explicitly recorded entry feature trend regime; missing entry snapshots are excluded.",
    ),
  }));
  const volatility = (["high", "low", "unknown"] as const).map((regime) => ({
    regime,
    metrics: outcomeMetrics(
      records.filter(
        (record) => record.featureSnapshot?.volatilityRegime === regime,
      ),
      "Observed paper outcomes with an explicitly recorded entry feature volatility regime; missing entry snapshots are excluded.",
    ),
  }));
  return { trend, volatility };
}

function correlatedConditions(
  records: readonly OutcomeRecord[],
  contributions: readonly ConditionContribution[],
): CorrelationSummary {
  const selected = new Set(
    contributions.map((contribution) => contribution.key),
  );
  const perRecord = new Map<string, Map<string, boolean>>();
  for (const observation of conditionObservations(records)) {
    if (!selected.has(observation.key)) continue;
    const values =
      perRecord.get(observation.record.id) || new Map<string, boolean>();
    // Duplicate condition rows in a malformed snapshot are not a reason to
    // create extra observations. The first selected value is retained.
    if (!values.has(observation.key))
      values.set(observation.key, observation.met);
    perRecord.set(observation.record.id, values);
  }

  const keys = contributions.map((contribution) => contribution.key).sort();
  const correlated: CorrelatedCondition[] = [];
  const zeroVariancePairs: ZeroVarianceCorrelation[] = [];
  let pairsConsidered = 0;
  let insufficientCommonObservationPairs = 0;
  for (let leftIndex = 0; leftIndex < keys.length; leftIndex += 1)
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < keys.length;
      rightIndex += 1
    ) {
      const leftKey = keys[leftIndex];
      const rightKey = keys[rightIndex];
      const left: number[] = [];
      const right: number[] = [];
      for (const values of perRecord.values()) {
        const leftValue = values.get(leftKey);
        const rightValue = values.get(rightKey);
        if (leftValue === undefined || rightValue === undefined) continue;
        left.push(leftValue ? 1 : 0);
        right.push(rightValue ? 1 : 0);
      }
      pairsConsidered += 1;
      if (left.length < 2) {
        insufficientCommonObservationPairs += 1;
        continue;
      }
      const correlation = standardPearson(left, right);
      if (correlation === null) {
        zeroVariancePairs.push({
          leftKey,
          rightKey,
          count: left.length,
          correlation: null,
        });
        continue;
      }
      if (Math.abs(correlation) > 0.9)
        correlated.push({
          leftKey,
          rightKey,
          correlation,
          count: left.length,
          status: outcomeStatus(left.length),
          interpretation:
            "Binary-condition Pearson association only; it is descriptive, not causation, a rule merge, or an execution instruction.",
        });
    }
  correlated.sort(
    (left, right) =>
      Math.abs(right.correlation) - Math.abs(left.correlation) ||
      left.leftKey.localeCompare(right.leftKey) ||
      left.rightKey.localeCompare(right.rightKey),
  );
  return {
    correlatedConditions: correlated,
    correlationDiagnostics: {
      pairsConsidered,
      insufficientCommonObservationPairs,
      zeroVariancePairs,
    },
  };
}

function chronologicalGate(
  records: readonly OutcomeRecord[],
): ExploratoryChronologicalGate {
  const withSnapshots = records.filter(
    (record) => record.confluenceSnapshot !== null,
  );
  const split = Math.floor(withSnapshots.length * 0.7);
  const train = withSnapshots.slice(0, split);
  const holdout = withSnapshots.slice(split);
  const training = buildContributions(train).contributions.filter(
    (contribution) => contribution.expectancyDifferenceR !== null,
  );
  const selected = training[0];
  if (!selected)
    return {
      status: "not-available",
      selection:
        "Chronological 70% train / 30% holdout. A candidate requires at least 100 train outcomes in both observed present and absent groups.",
      untouchedHoldoutUsedForTuning: false,
      candidate: null,
      message:
        "No train-only condition comparison met the predeclared 100-present and 100-absent outcome minimum. No gate candidate is proposed.",
    };

  const holdoutContribution = buildContributions(holdout).contributions.find(
    (contribution) => contribution.key === selected.key,
  );
  const holdoutPresent =
    holdoutContribution?.present ||
    outcomeMetrics(
      [],
      "No holdout observations for the train-selected condition.",
    );
  const holdoutAbsent =
    holdoutContribution?.absent ||
    outcomeMetrics(
      [],
      "No holdout observations for the train-selected condition.",
    );
  return {
    status: "candidate",
    selection:
      "Candidate selected solely by largest absolute present-minus-absent observed expectancy R in chronological training data, with 100 outcomes required in both training groups. The holdout was never used to select or tune the candidate.",
    untouchedHoldoutUsedForTuning: false,
    candidate: {
      conditionKey: selected.key,
      train: {
        present: selected.present,
        absent: selected.absent,
        expectancyDifferenceR: selected.expectancyDifferenceR!,
      },
      holdout: {
        present: holdoutPresent,
        absent: holdoutAbsent,
        expectancyDifferenceR: difference(holdoutPresent, holdoutAbsent),
      },
    },
    message:
      "Exploratory paper-ledger split only. It supplies neither formal out-of-sample ledger metadata nor confirmed evidence, and cannot change a rule automatically.",
  };
}

function humanProposals(
  overall: DescriptiveOutcomeMetrics,
  contributions: readonly ConditionContribution[],
): HumanRuleProposal[] {
  const strongest = contributions.find(
    (contribution) => contribution.expectancyDifferenceR !== null,
  );
  if (!strongest)
    return [
      {
        kind: "watch",
        automatic: false,
        evidenceStatus: "insufficient-data",
        title: "Watch paper-ledger coverage before reviewing a confluence rule",
        basis: `Overall eligible closed paper outcomes: ${overall.count}. Each condition needs at least ${MINIMUM_DESCRIPTIVE_GROUP_SIZE} observed present outcomes and ${MINIMUM_DESCRIPTIVE_GROUP_SIZE} observed absent outcomes before a difference is ranked.`,
        action:
          "Do not alter conditions, weights, thresholds, or execution. Retain point-in-time entry snapshots and collect complete paper outcomes for later human review.",
      },
    ];
  return [
    {
      kind: "review",
      automatic: false,
      evidenceStatus: "unconfirmed",
      title: `Review observed paper-ledger difference for ${strongest.key}`,
      basis: `Present-minus-absent observed expectancy R is ${strongest.expectancyDifferenceR}; present n=${strongest.present.count}, absent n=${strongest.absent.count}. This is a descriptive ranking only. No out-of-sample ledger metadata was supplied.`,
      action:
        "A human may inspect data quality and a predeclared test plan. Do not automatically alter any rule, weight, threshold, or trade eligibility from this result.",
    },
  ];
}

/**
 * Analyze a paper trade ledger without calibrating probabilities or generating
 * execution advice. Only canonical closed records at or before `now` with a
 * finite final P/L and finite original risk participate. `tradeMetrics` adds
 * realized partial P/L to the final retained leg; original risk uses retained
 * initial-risk/original-bracket fields. Missing entry snapshots are counted and
 * never imputed as a condition, score, or regime.
 */
export function analyzeConfluenceTrades(
  trades: Trade[],
  now = Date.now(),
): ConfluenceTradeAnalytics {
  const asOf = validEpochMilliseconds(now) ? now : Date.now();
  const excluded = {
    notClosed: 0,
    invalidClosedTimestamp: 0,
    futureClosedTimestamp: 0,
    invalidOutcome: 0,
    invalidOriginalRisk: 0,
  };
  const featureCoverage = { available: 0, missing: 0, futureOrInvalid: 0 };
  const confluenceCoverage = { available: 0, missing: 0, futureOrInvalid: 0 };
  const eligible: OutcomeRecord[] = [];

  for (const trade of trades) {
    if (trade.status !== "closed") {
      excluded.notClosed += 1;
      continue;
    }
    if (!validEpochMilliseconds(trade.closedAt)) {
      excluded.invalidClosedTimestamp += 1;
      continue;
    }
    if (trade.closedAt > asOf) {
      excluded.futureClosedTimestamp += 1;
      continue;
    }
    const pnl = tradeMetrics(trade).pnl;
    if (!finite(pnl)) {
      excluded.invalidOutcome += 1;
      continue;
    }
    const risk = originalRisk(trade);
    if (risk === null) {
      excluded.invalidOriginalRisk += 1;
      continue;
    }
    const entryAt = entryTimestamp(trade);
    const feature = entryFeatureSnapshot(trade, entryAt);
    const confluence = entryConfluenceSnapshot(trade, entryAt);
    if (feature.snapshot) featureCoverage.available += 1;
    else if (feature.invalid) featureCoverage.futureOrInvalid += 1;
    else featureCoverage.missing += 1;
    if (confluence.snapshot) confluenceCoverage.available += 1;
    else if (confluence.invalid) confluenceCoverage.futureOrInvalid += 1;
    else confluenceCoverage.missing += 1;
    eligible.push({
      id: trade.id,
      closedAt: trade.closedAt,
      entryAt,
      pnl,
      r: pnl / risk,
      featureSnapshot: feature.snapshot,
      confluenceSnapshot: confluence.snapshot,
    });
  }

  eligible.sort(
    (left, right) =>
      left.closedAt - right.closedAt || left.id.localeCompare(right.id),
  );
  const bounded = eligible.slice(0, MAX_CORRELATION_TRADES);
  const built = buildContributions(bounded);
  const score = scoreBuckets(bounded);
  const correlations = correlatedConditions(bounded, built.contributions);
  const overall = outcomeMetrics(
    eligible,
    "All eligible closed paper outcomes at or before the reporting cutoff; descriptive only.",
  );

  return {
    asOf,
    learningSourceStatus: {
      status: "paper-only",
      realMoney: false,
      executionData: false,
      message:
        "Paper-trade ledger only; no real-money fills, broker execution-quality data, slippage model, or execution recommendation is represented.",
    },
    outcomeCoverage: {
      inputTrades: trades.length,
      eligibleClosedOutcomes: eligible.length,
      excluded,
      entryFeatures: featureCoverage,
      confluenceSnapshots: confluenceCoverage,
    },
    overall,
    boundedAnalysis: {
      tradeCap: MAX_CORRELATION_TRADES,
      conditionCap: MAX_CORRELATION_CONDITIONS,
      eligibleOutcomesAvailable: eligible.length,
      eligibleOutcomesUsed: bounded.length,
      omittedOutcomes: eligible.length - bounded.length,
      observedConditionKeys: built.observedKeys,
      omittedConditionKeys: Math.max(
        0,
        built.observedKeys - built.contributions.length,
      ),
      selection:
        "Chronological closedAt ascending, then trade id, first 2,000 eligible outcomes. Condition keys are lexical first 100. Caps apply to snapshot/regime/condition/correlation comparisons; overall remains the complete eligible descriptive ledger.",
    },
    scoreBuckets: score,
    conditionContribution: built.contributions,
    conditionRanking:
      "Ranked by absolute observed present-minus-absent expectancy R only when each group has at least 100 outcomes. It is descriptive only; it does not identify an optimal threshold or a profitable rule.",
    regimes: regimeGroups(bounded),
    ...correlations,
    exploratoryChronologicalGate: chronologicalGate(bounded),
    humanRuleProposals: humanProposals(overall, built.contributions),
  };
}
