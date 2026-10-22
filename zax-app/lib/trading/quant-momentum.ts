import { SECONDS } from "./engine";
import type { Candle, Timeframe } from "./model";
import { mean, spearmanRankCorrelation } from "./quant-methods";
import {
  emptyQuantResult,
  type QuantLabInput,
  type QuantLabResult,
  type QuantMetric,
  type QuantSignal,
} from "./quant-lab-types";

/**
 * Deliberately small limits keep this client-safe calculation bounded on mobile
 * as well as server render paths. Bars above the cap are not inspected.
 */
const MAX_ASSETS = 10;
const MAX_BARS_PER_ASSET = 2_000;
const MAX_LOOKBACK_BARS = 252;
const MIN_UNCONFIRMED_OUTCOMES = 100;
const EPSILON = 1e-12;

type CleanCandle = Pick<Candle, "time" | "close">;
type CleanSeries = {
  symbol: string;
  source: string;
  provenance: "provider" | "user-import";
  timeframe: Timeframe;
  adjustedTotalReturn: boolean;
  candles: CleanCandle[];
  byTime: Map<number, { close: number; index: number }>;
  invalidBars: number;
  duplicateBars: number;
  futureOrOpenBars: number;
  truncated: boolean;
  irregular: boolean;
};
type AssetSnapshot = {
  series: CleanSeries;
  close: number;
  momentum: number;
  volatility: number;
  rank: number;
};
type Target = AssetSnapshot & { weight: number };
type Rebalance = {
  index: number;
  time: number;
  snapshots: AssetSnapshot[];
  targets: Target[];
};
type MomentumSettingsExtension = {
  pointInTimeUniverse?: unknown;
  betaNeutral?: unknown;
  benchmarkAligned?: unknown;
};
type RankDiagnostic = {
  ic: number | null;
  topReturn: number | null;
  bottomReturn: number | null;
  longShortReturn: number | null;
};

function isFinitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function requiredResult(
  summary: string,
  reasons: string[],
  unavailable = false,
): QuantLabResult {
  const result = emptyQuantResult("momentum", "Momentum lab", summary, reasons);
  result.status = unavailable ? "unavailable" : "insufficient-data";
  result.dataRequirements = [
    "A fixed universe of 2–8 distinct assets on one timeframe, with closed positive-price bars.",
    "Timestamped input provenance and supplied fee/slippage assumptions for exploratory calculations.",
    "Point-in-time universe membership, delistings and corporate-action metadata before making survivorship or total-return claims.",
    ...reasons,
  ];
  result.limitations = [
    "This is a synchronous exploratory calculation, not an execution service or investment recommendation.",
    "No survivorship-free, delisting, corporate-action or adjusted-total-return property is inferred from prices.",
  ];
  return result;
}

function validSettings(input: QuantLabInput): {
  lookback: number;
  holdingBars: number;
  startingEquity: number;
  costRate: number;
} | null {
  const { settings } = input;
  if (
    !settings ||
    !Number.isInteger(settings.lookback) ||
    settings.lookback < 2 ||
    settings.lookback > MAX_LOOKBACK_BARS
  )
    return null;
  if (
    !Number.isInteger(settings.holdingBars) ||
    settings.holdingBars < 1 ||
    settings.holdingBars > MAX_LOOKBACK_BARS
  )
    return null;
  if (!isFinitePositive(settings.startingEquity)) return null;
  if (
    !Number.isFinite(settings.feeBps) ||
    settings.feeBps < 0 ||
    !Number.isFinite(settings.slippageBps) ||
    settings.slippageBps < 0
  )
    return null;
  return {
    lookback: settings.lookback,
    holdingBars: settings.holdingBars,
    startingEquity: settings.startingEquity,
    // Turnover is sum(abs(target weight - prior weight)); no venue fee is invented.
    costRate: (settings.feeBps + settings.slippageBps) / 10_000,
  };
}

function momentumMethodMetadata(settings: QuantLabInput["settings"]): {
  pointInTimeUniverseDeclared: boolean;
  betaNeutralRequested: boolean;
  benchmarkAligned: boolean;
} {
  const extension = settings as QuantLabInput["settings"] & MomentumSettingsExtension;
  return {
    pointInTimeUniverseDeclared: extension.pointInTimeUniverse === true,
    betaNeutralRequested: extension.betaNeutral === true,
    benchmarkAligned: extension.benchmarkAligned === true,
  };
}

function isTimeframe(value: unknown): value is Timeframe {
  return (
    value === "1m" ||
    value === "5m" ||
    value === "15m" ||
    value === "30m" ||
    value === "1h" ||
    value === "4h" ||
    value === "1d" ||
    value === "1w"
  );
}

/**
 * Retain only supplied, complete bars. Duplicate timestamps are all discarded
 * rather than choosing a later revision whose provenance cannot be established.
 */
function cleanSeries(raw: unknown, nowSeconds: number): CleanSeries | null {
  if (!raw || typeof raw !== "object") return null;
  const series = raw as {
    symbol?: unknown;
    source?: unknown;
    provenance?: unknown;
    timeframe?: unknown;
    candles?: unknown;
    fetchedAt?: unknown;
    adjustedTotalReturn?: unknown;
  };
  if (
    typeof series.symbol !== "string" ||
    !series.symbol.trim() ||
    typeof series.source !== "string" ||
    !series.source.trim()
  )
    return null;
  if (
    (series.provenance !== "provider" && series.provenance !== "user-import") ||
    !isTimeframe(series.timeframe)
  )
    return null;
  if (!isFinitePositive(series.fetchedAt) || !Array.isArray(series.candles))
    return null;

  const timeframe = series.timeframe;
  const seconds = SECONDS[timeframe];
  // fetchedAt and now are milliseconds; candle timestamps are Unix seconds.
  const cutoffSeconds = Math.floor(
    Math.min(nowSeconds * 1_000, series.fetchedAt) / 1_000,
  );
  const rawBars = series.candles.slice(-MAX_BARS_PER_ASSET);
  let invalidBars = 0;
  let futureOrOpenBars = 0;
  const candidates: CleanCandle[] = [];

  for (const value of rawBars) {
    const candle = value as Partial<Candle>;
    const time = candle.time;
    const close = candle.close;
    if (
      typeof time !== "number" ||
      !Number.isInteger(time) ||
      !isFinitePositive(close)
    ) {
      invalidBars += 1;
      continue;
    }
    if (time + seconds > cutoffSeconds) {
      futureOrOpenBars += 1;
      continue;
    }
    candidates.push({ time, close });
  }

  candidates.sort((left, right) => left.time - right.time);
  const candles: CleanCandle[] = [];
  let duplicateBars = 0;
  for (let index = 0; index < candidates.length; ) {
    let end = index + 1;
    while (
      end < candidates.length &&
      candidates[end].time === candidates[index].time
    )
      end += 1;
    if (end - index === 1) candles.push(candidates[index]);
    else duplicateBars += end - index;
    index = end;
  }

  const byTime = new Map<number, { close: number; index: number }>();
  candles.forEach((candle, index) =>
    byTime.set(candle.time, { close: candle.close, index }),
  );
  const irregular = candles.some(
    (candle, index) =>
      index > 0 && candle.time - candles[index - 1].time !== seconds,
  );
  return {
    symbol: series.symbol.trim(),
    source: series.source.trim(),
    provenance: series.provenance,
    timeframe,
    adjustedTotalReturn: series.adjustedTotalReturn === true,
    candles,
    byTime,
    invalidBars,
    duplicateBars,
    futureOrOpenBars,
    truncated: series.candles.length > MAX_BARS_PER_ASSET,
    irregular,
  };
}

function realizedVolatility(
  series: CleanSeries,
  endIndex: number,
  lookback: number,
): number | null {
  const returns: number[] = [];
  for (let index = endIndex - lookback + 1; index <= endIndex; index += 1) {
    const previous = series.candles[index - 1]?.close;
    const current = series.candles[index]?.close;
    if (!isFinitePositive(previous) || !isFinitePositive(current)) return null;
    const logReturn = Math.log(current / previous);
    if (!Number.isFinite(logReturn)) return null;
    returns.push(logReturn);
  }
  if (returns.length !== lookback) return null;
  const mean =
    returns.reduce((total, value) => total + value, 0) / returns.length;
  const variance =
    returns.reduce((total, value) => total + (value - mean) ** 2, 0) /
    returns.length;
  const volatility = Math.sqrt(variance);
  return Number.isFinite(volatility) ? volatility : null;
}

/**
 * Method rationale: research/foundry-audit/momentum.md requires completed
 * observations, cross-sectional ranking, time-series returns and net costs.
 * Returns and volatility are strictly trailing bar observations at `time`.
 */
function snapshotsAt(
  series: CleanSeries[],
  time: number,
  lookback: number,
): AssetSnapshot[] | null {
  const raw: Omit<AssetSnapshot, "rank">[] = [];
  for (const asset of series) {
    const point = asset.byTime.get(time);
    if (!point || point.index < lookback) return null;
    const prior = asset.candles[point.index - lookback]?.close;
    if (!isFinitePositive(prior)) return null;
    const momentum = point.close / prior - 1;
    const volatility = realizedVolatility(asset, point.index, lookback);
    if (
      !Number.isFinite(momentum) ||
      volatility === null ||
      volatility <= EPSILON
    )
      return null;
    raw.push({ series: asset, close: point.close, momentum, volatility });
  }
  raw.sort(
    (left, right) =>
      right.momentum - left.momentum ||
      left.series.symbol.localeCompare(right.series.symbol),
  );
  return raw.map((snapshot, index) => ({ ...snapshot, rank: index + 1 }));
}

/** Select the positive top and negative bottom quintiles, then inverse-volatility scale to gross one. */
function targetsFor(snapshots: AssetSnapshot[]): Target[] {
  const selectionCount = Math.max(1, Math.floor(snapshots.length / 5));
  const longCandidates = snapshots
    .slice(0, selectionCount)
    .filter((item) => item.momentum > 0);
  const shortCandidates = snapshots
    .slice(-selectionCount)
    .filter((item) => item.momentum < 0);
  const sides: Array<{ candidates: AssetSnapshot[]; sign: 1 | -1 }> = [];
  if (longCandidates.length)
    sides.push({ candidates: longCandidates, sign: 1 });
  if (shortCandidates.length)
    sides.push({ candidates: shortCandidates, sign: -1 });
  if (!sides.length) return [];

  const grossPerSide = 1 / sides.length;
  return sides.flatMap(({ candidates, sign }) => {
    const inverseVolatility = candidates.map(
      (candidate) => 1 / candidate.volatility,
    );
    const totalInverseVolatility = inverseVolatility.reduce(
      (total, value) => total + value,
      0,
    );
    if (
      !Number.isFinite(totalInverseVolatility) ||
      totalInverseVolatility <= EPSILON
    )
      return [];
    return candidates.map((candidate, index) => ({
      ...candidate,
      weight:
        (sign * grossPerSide * inverseVolatility[index]) /
        totalInverseVolatility,
    }));
  });
}

/**
 * Cross-sectional diagnostics at one already formed rebalance. Forward returns
 * begin after the rank observation and are never used to create that rank.
 */
function rankDiagnostic(
  rebalance: Rebalance,
  assets: CleanSeries[],
  endTime: number,
): RankDiagnostic | null {
  const forwardReturns: number[] = [];
  const momentums: number[] = [];
  const bySymbol = new Map(
    rebalance.snapshots.map((snapshot) => [snapshot.series.symbol, snapshot]),
  );
  for (const asset of assets) {
    const snapshot = bySymbol.get(asset.symbol);
    const endClose = asset.byTime.get(endTime)?.close;
    if (!snapshot || !isFinitePositive(endClose)) return null;
    const forwardReturn = endClose / snapshot.close - 1;
    if (!Number.isFinite(forwardReturn)) return null;
    forwardReturns.push(forwardReturn);
    momentums.push(snapshot.momentum);
  }
  const bucketSize = Math.floor(rebalance.snapshots.length / 5);
  const top = bucketSize
    ? rebalance.snapshots.slice(0, bucketSize)
    : [];
  const bottom = bucketSize
    ? rebalance.snapshots.slice(-bucketSize)
    : [];
  const returnFor = (bucket: AssetSnapshot[]): number | null => {
    if (!bucket.length) return null;
    const values = bucket.map((snapshot) => {
      const endClose = snapshot.series.byTime.get(endTime)?.close;
      return endClose === undefined ? NaN : endClose / snapshot.close - 1;
    });
    return mean(values);
  };
  const topReturn = returnFor(top);
  const bottomReturn = returnFor(bottom);
  return {
    ic: spearmanRankCorrelation(momentums, forwardReturns),
    topReturn,
    bottomReturn,
    longShortReturn:
      topReturn === null || bottomReturn === null ? null : topReturn - bottomReturn,
  };
}

function maximumDrawdown(
  equity: { time: number; value: number }[],
  initialEquity: number,
): number | null {
  if (!equity.length) return null;
  let peak = initialEquity;
  let drawdown = 0;
  for (const point of equity) {
    peak = Math.max(peak, point.value);
    if (peak > 0) drawdown = Math.min(drawdown, point.value / peak - 1);
  }
  return drawdown;
}

function metric(
  key: string,
  label: string,
  value: number | string | null,
  unit?: string,
): QuantMetric {
  return unit ? { key, label, value, unit } : { key, label, value };
}

function unconfirmedReasons(actualSamples: number): string[] {
  const minimum =
    actualSamples < MIN_UNCONFIRMED_OUTCOMES
      ? `${actualSamples} observed costed rebalance intervals; at least ${MIN_UNCONFIRMED_OUTCOMES} actual, non-overlapping outcomes are required.`
      : `${actualSamples} observed costed rebalance intervals are not treated as confirmed outcomes.`;
  return [
    minimum,
    "No chronological walk-forward train/test split was supplied.",
    "No untouched out-of-sample holdout is available; status remains unconfirmed.",
  ];
}

/**
 * Calculate one bounded cross-sectional and time-series momentum family.
 * It consumes only supplied series and does not fetch, synthesize, or forecast data.
 */
export function runMomentum(input: QuantLabInput): QuantLabResult {
  if (!input || input.family !== "momentum") {
    return requiredResult(
      "Momentum runner accepts only the momentum family.",
      ["Set family to momentum before calculation."],
      true,
    );
  }
  if (!isFinitePositive(input.now)) {
    return requiredResult(
      "A finite current timestamp in milliseconds is required.",
      ["Provide input.now as Unix milliseconds."],
      true,
    );
  }
  const settings = validSettings(input);
  if (!settings) {
    return requiredResult(
      "Momentum settings are invalid or exceed the bounded calculation range.",
      [
        `lookback must be an integer from 2 to ${MAX_LOOKBACK_BARS}; holdingBars must be an integer from 1 to ${MAX_LOOKBACK_BARS}; startingEquity must be positive; fee/slippage bps must be non-negative finite values.`,
      ],
      true,
    );
  }
  const methodMetadata = momentumMethodMetadata(input.settings);

  const rawUniverse: unknown[] = Array.isArray(input.series)
    ? input.series
    : [];
  if (rawUniverse.length < 2 || rawUniverse.length > MAX_ASSETS) {
    return requiredResult(
      "Momentum ranking needs a bounded fixed universe of two to eight assets.",
      [
        `Received ${rawUniverse.length} assets; this family accepts 2–${MAX_ASSETS}.`,
      ],
      rawUniverse.length > MAX_ASSETS,
    );
  }

  const nowSeconds = Math.floor(input.now / 1_000);
  const universe = rawUniverse.map((series) => cleanSeries(series, nowSeconds));
  if (universe.some((series) => series === null)) {
    return requiredResult(
      "Every fixed-universe member needs valid source, provenance, timeframe, fetchedAt and candle data.",
      [
        "Remove or correct malformed universe members; no invalid asset is silently replaced.",
      ],
      false,
    );
  }
  const assets = universe as CleanSeries[];
  if (new Set(assets.map((asset) => asset.symbol)).size !== assets.length) {
    return requiredResult(
      "Fixed-universe symbols must be distinct.",
      [
        "Duplicate symbols would bias the cross-sectional rank and are not merged.",
      ],
      false,
    );
  }
  if (new Set(assets.map((asset) => asset.timeframe)).size !== 1) {
    return requiredResult(
      "All fixed-universe assets must have the same timeframe.",
      [
        "Mixed timeframes are not ranked together because their bar horizons differ.",
      ],
      false,
    );
  }
  const tooShort = assets.filter(
    (asset) => asset.candles.length <= settings.lookback,
  );
  if (tooShort.length) {
    return requiredResult(
      "Not enough closed bars remain after validation for each fixed-universe member.",
      [
        `Need more than ${settings.lookback} unique, valid, closed bars for: ${tooShort.map((asset) => asset.symbol).join(", ")}.`,
      ],
      false,
    );
  }

  // Exact shared timestamps avoid forward filling, interpolation, and invented prices.
  const sharedTimes = assets[0].candles
    .map((candle) => candle.time)
    .filter((time) => assets.every((asset) => asset.byTime.has(time)));
  if (sharedTimes.length <= settings.lookback) {
    return requiredResult(
      "The supplied assets do not have enough common closed timestamps for a causal fixed-universe rank.",
      [
        `Need more than ${settings.lookback} shared closed timestamps; found ${sharedTimes.length}.`,
      ],
      false,
    );
  }

  const rebalances: Rebalance[] = [];
  for (
    let index = 0;
    index < sharedTimes.length;
    index += settings.holdingBars
  ) {
    const snapshots = snapshotsAt(
      assets,
      sharedTimes[index],
      settings.lookback,
    );
    if (!snapshots) continue;
    rebalances.push({
      index,
      time: sharedTimes[index],
      snapshots,
      targets: targetsFor(snapshots),
    });
  }
  const actionable = rebalances.filter(
    (rebalance) => rebalance.targets.length > 0,
  );
  const completedIntervals = actionable.filter(
    (rebalance) => rebalance.index + settings.holdingBars < sharedTimes.length,
  ).length;
  if (!actionable.length || !completedIntervals) {
    return requiredResult(
      "No completed, actionable momentum rebalance is available from the supplied closed bars.",
      [
        "Need a common timestamp with non-zero trailing volatility and a positive top or negative bottom momentum candidate.",
        "Need at least one later common closed timestamp after an actionable rebalance for exploratory equity.",
      ],
      false,
    );
  }

  const rankDiagnostics = rebalances
    .filter(
      (rebalance) => rebalance.index + settings.holdingBars < sharedTimes.length,
    )
    .map((rebalance) =>
      rankDiagnostic(
        rebalance,
        assets,
        sharedTimes[rebalance.index + settings.holdingBars],
      ),
    )
    .filter((diagnostic): diagnostic is RankDiagnostic => diagnostic !== null);
  const icValues = rankDiagnostics
    .map((diagnostic) => diagnostic.ic)
    .filter((value): value is number => value !== null);
  const topQuantileReturns = rankDiagnostics
    .map((diagnostic) => diagnostic.topReturn)
    .filter((value): value is number => value !== null);
  const bottomQuantileReturns = rankDiagnostics
    .map((diagnostic) => diagnostic.bottomReturn)
    .filter((value): value is number => value !== null);
  const longShortQuantileReturns = rankDiagnostics
    .map((diagnostic) => diagnostic.longShortReturn)
    .filter((value): value is number => value !== null);

  const rebalanceByIndex = new Map(
    rebalances.map((rebalance) => [rebalance.index, rebalance]),
  );
  const weights = new Map<string, number>();
  let equityValue = settings.startingEquity;
  let haltedAtZero = false;
  let totalTurnover = 0;
  let modeledCosts = 0;
  const equity: { time: number; value: number }[] = [];
  let latestActionable: Rebalance | null = null;

  for (let index = 0; index < sharedTimes.length; index += 1) {
    const rebalance = rebalanceByIndex.get(index);
    if (rebalance && !haltedAtZero) {
      const nextWeights = new Map(
        rebalance.targets.map((target) => [
          target.series.symbol,
          target.weight,
        ]),
      );
      let turnover = 0;
      for (const asset of assets)
        turnover += Math.abs(
          (nextWeights.get(asset.symbol) ?? 0) -
            (weights.get(asset.symbol) ?? 0),
        );
      const costFraction = turnover * settings.costRate;
      if (Number.isFinite(costFraction) && costFraction >= 0) {
        const appliedCostFraction = Math.min(1, costFraction);
        modeledCosts += equityValue * appliedCostFraction;
        totalTurnover += turnover;
        equityValue *= 1 - appliedCostFraction;
      }
      weights.clear();
      nextWeights.forEach((weight, symbol) => weights.set(symbol, weight));
      if (rebalance.targets.length) latestActionable = rebalance;
    }

    if (latestActionable)
      equity.push({ time: sharedTimes[index], value: equityValue });
    if (index === sharedTimes.length - 1 || haltedAtZero || !latestActionable)
      continue;

    let portfolioReturn = 0;
    for (const asset of assets) {
      const current = asset.byTime.get(sharedTimes[index])?.close;
      const next = asset.byTime.get(sharedTimes[index + 1])?.close;
      const weight = weights.get(asset.symbol) ?? 0;
      if (
        !isFinitePositive(current) ||
        !isFinitePositive(next) ||
        !Number.isFinite(weight)
      )
        continue;
      portfolioReturn += weight * (next / current - 1);
    }
    const nextEquity = equityValue * (1 + portfolioReturn);
    if (!Number.isFinite(nextEquity) || nextEquity <= 0) {
      equityValue = 0;
      haltedAtZero = true;
    } else {
      equityValue = nextEquity;
    }
  }

  // A scheduled zero-signal rebalance is a valid causal flatten, so report it
  // rather than retaining an older actionable target as the current signal.
  const latest = rebalances.at(-1)!;
  const targetBySymbol = new Map(
    latest.targets.map((target) => [target.series.symbol, target]),
  );
  const signals: QuantSignal[] = latest.snapshots.map((snapshot) => {
    const target = targetBySymbol.get(snapshot.series.symbol);
    const direction = !target ? "flat" : target.weight > 0 ? "long" : "short";
    const strength = !target
      ? 0
      : Math.min(
          1,
          Math.abs(snapshot.momentum) /
            (snapshot.volatility * Math.sqrt(settings.lookback)),
        );
    const selection = !target
      ? "not selected"
      : `${direction} selected with ${(Math.abs(target.weight) * 100).toFixed(1)}% gross weight`;
    return {
      at: latest.time,
      symbol: snapshot.series.symbol,
      direction,
      strength: Number.isFinite(strength) ? strength : 0,
      reason: `Rank ${snapshot.rank}/${latest.snapshots.length}; trailing ${settings.lookback}-bar momentum ${(snapshot.momentum * 100).toFixed(2)}%; ${selection}.`,
    };
  });

  const sourceCounts = assets
    .map(
      (asset) =>
        `${asset.provenance}:${asset.source} (${asset.candles.length} closed bars, ${asset.symbol})`,
    )
    .join("; ");
  const totalInvalid = assets.reduce(
    (total, asset) => total + asset.invalidBars,
    0,
  );
  const totalDuplicates = assets.reduce(
    (total, asset) => total + asset.duplicateBars,
    0,
  );
  const totalFutureOrOpen = assets.reduce(
    (total, asset) => total + asset.futureOrOpenBars,
    0,
  );
  const maxDrawdown = maximumDrawdown(equity, settings.startingEquity);
  const finalEquity = equity.at(-1)?.value ?? null;
  const netReturn =
    finalEquity === null ? null : finalEquity / settings.startingEquity - 1;
  const latestLeader = latest.snapshots[0];
  const icMean = mean(icValues);
  const topQuantileMean = mean(topQuantileReturns);
  const bottomQuantileMean = mean(bottomQuantileReturns);
  const longShortQuantileMean = mean(longShortQuantileReturns);
  const quantileStatus =
    assets.length >= 5
      ? methodMetadata.pointInTimeUniverseDeclared
        ? "fixed-universe quintiles; point-in-time status declared but not independently verifiable from price rows"
        : "fixed-universe quintiles only; point-in-time membership not supplied"
      : "unavailable: at least five supplied assets are required for quintile diagnostics";
  const betaNeutralStatus =
    methodMetadata.betaNeutralRequested && methodMetadata.benchmarkAligned
      ? "unavailable: no benchmark return series/alignment contract is represented in QuantSeries"
      : "unavailable: beta-neutral analysis requires an explicitly aligned benchmark return series";
  const metrics: QuantMetric[] = [
    metric("universe-assets", "Fixed-universe assets", assets.length, "assets"),
    metric("timeframe", "Common timeframe", assets[0].timeframe),
    metric(
      "lookback",
      "Momentum / volatility lookback",
      settings.lookback,
      "bars",
    ),
    metric("rebalances", "Actionable rebalances", actionable.length, "events"),
    metric(
      "completed-intervals",
      "Completed costed intervals",
      completedIntervals,
      "intervals",
    ),
    metric(
      "spearman-rank-ic",
      "Mean forward Spearman rank IC",
      icMean,
    ),
    metric(
      "spearman-rank-ic-observations",
      "Forward rank IC observations",
      icValues.length,
      "rebalances",
    ),
    metric("quantile-diagnostic-status", "Quantile return diagnostic", quantileStatus),
    metric(
      "top-quintile-forward-return",
      "Mean top-quintile forward return",
      topQuantileMean === null ? null : topQuantileMean * 100,
      "%",
    ),
    metric(
      "bottom-quintile-forward-return",
      "Mean bottom-quintile forward return",
      bottomQuantileMean === null ? null : bottomQuantileMean * 100,
      "%",
    ),
    metric(
      "long-short-quintile-forward-return",
      "Mean top-minus-bottom quintile return",
      longShortQuantileMean === null ? null : longShortQuantileMean * 100,
      "%",
    ),
    metric("modeled-turnover", "Modeled one-way turnover", totalTurnover),
    metric(
      "modeled-turnover-costs",
      "Modeled turnover fees + slippage",
      modeledCosts,
      "account units",
    ),
    metric(
      "point-in-time-universe",
      "Point-in-time universe metadata",
      methodMetadata.pointInTimeUniverseDeclared
        ? "declared in settings; not independently verifiable from price rows"
        : "not supplied",
    ),
    metric("beta-neutrality", "Beta-neutral diagnostic", betaNeutralStatus),
    metric(
      "leader",
      "Latest cross-sectional leader",
      latestLeader
        ? `${latestLeader.series.symbol} (${(latestLeader.momentum * 100).toFixed(2)}%)`
        : null,
    ),
    metric(
      "final-equity",
      "Exploratory final equity",
      finalEquity,
      "account units",
    ),
    metric(
      "net-return",
      "Exploratory net return",
      netReturn === null ? null : netReturn * 100,
      "%",
    ),
    metric(
      "max-drawdown",
      "Exploratory maximum drawdown",
      maxDrawdown === null ? null : maxDrawdown * 100,
      "%",
    ),
    metric(
      "supplied-cost",
      "Supplied fee + slippage",
      input.settings.feeBps + input.settings.slippageBps,
      "bps per unit turnover",
    ),
    metric("source-counts", "Closed bars by provenance/source", sourceCounts),
    metric(
      "filtered-bars",
      "Excluded invalid / duplicate / future-or-open bars",
      `${totalInvalid} / ${totalDuplicates} / ${totalFutureOrOpen}`,
    ),
  ];

  const adjustmentDescription = assets.every(
    (asset) => asset.adjustedTotalReturn,
  )
    ? "Every input explicitly declares adjusted total-return prices (not independently verified)."
    : assets.some((asset) => asset.adjustedTotalReturn)
      ? "Only some inputs explicitly declare adjusted total-return prices; series remain distinguishable."
      : "No input declares adjusted total-return prices.";
  const limitations = [
    methodMetadata.pointInTimeUniverseDeclared
      ? `Fixed universe is exactly the supplied ${assets.map((asset) => asset.symbol).join(", ")}; point-in-time membership is declared in settings but no dated membership, delisting, or survivorship rows are represented or independently verified.`
      : `Fixed universe is exactly the supplied ${assets.map((asset) => asset.symbol).join(", ")}; no point-in-time membership, delisting or survivorship data were supplied.`,
    adjustmentDescription,
    "Returns use observed close-to-close bars and exact shared timestamps only; no interpolation, forward fill, forecast or execution price is created.",
    "Spearman IC and top/bottom quintile returns are retrospective diagnostics: ranks use only each rebalance close, while the reported forward return is observed later. They are not forecast or validated-performance claims.",
    "Beta-neutral output remains unavailable without an explicitly aligned benchmark return series; no beta is inferred from arbitrary universe members.",
    "This simplified exploratory equity applies only the supplied fee/slippage bps to turnover; it excludes borrow, financing, tax, margin, liquidity, market impact and fill modeling.",
    "Provider and user-import sources remain labeled separately; equivalence, quality and corporate-action treatment are not inferred.",
    "No chronological walk-forward or untouched holdout is present. This is not validated performance evidence.",
  ];
  if (assets.some((asset) => asset.irregular))
    limitations.push(
      "At least one input has irregular timestamp spacing; lookback and volatility are bar-based rather than calendar-normalized.",
    );
  if (assets.some((asset) => asset.truncated))
    limitations.push(
      `Only the most recent ${MAX_BARS_PER_ASSET} supplied entries per asset were inspected to keep runtime bounded.`,
    );
  if (haltedAtZero)
    limitations.push(
      "The simplified unlevered equity path reached zero and was halted; no margin or liquidation assumptions were invented.",
    );

  const paperPlan =
    latest.targets.length && finalEquity !== null && finalEquity > 0
      ? {
          description:
            "Exploratory latest rebalance allocation from supplied closing prices; paper-only, not an order instruction.",
          legs: latest.targets.map((target) => ({
            symbol: target.series.symbol,
            side: target.weight > 0 ? ("long" as const) : ("short" as const),
            referencePrice: target.close,
            quantity: (Math.abs(target.weight) * finalEquity) / target.close,
          })),
        }
      : undefined;

  return {
    family: "momentum",
    status: "ready",
    title: "Cross-sectional + time-series momentum",
    summary: `Exploratory fixed-universe ${assets.length}-asset rank at ${latest.time}; trailing bar momentum is volatility-scaled and turnover is charged only at the supplied ${input.settings.feeBps + input.settings.slippageBps} bps cost assumption. Validation remains unconfirmed.`,
    asOf: latest.time,
    metrics,
    signals,
    equity,
    validation: {
      status: "unconfirmed",
      actualSamples: completedIntervals,
      trainSamples: 0,
      testSamples: 0,
      walkForward: false,
      untouchedHoldout: false,
      reasons: unconfirmedReasons(completedIntervals),
    },
    dataRequirements: [
      "Dated point-in-time fixed-universe membership, delistings and corporate-action metadata are required before survivorship or total-return claims; a settings declaration alone does not verify them.",
      "An explicitly benchmark-aligned return series and rebalance-calendar contract are required before beta-neutral diagnostics can be calculated.",
      "At least 100 actual, non-overlapping outcomes plus chronological walk-forward and a sealed untouched holdout are required before confirmation.",
      "Execution-quality data are needed to model borrow, financing, impact, liquidity, fills and venue-specific costs.",
    ],
    limitations,
    paperPlan,
  };
}
