import { SECONDS } from "./engine";
import type { Candle, Timeframe } from "./model";
import type {
  QuantLabInput,
  QuantLabResult,
  QuantMetric,
  QuantSeries,
  QuantSignal,
} from "./quant-lab-types";
import {
  buildPurgedHoldoutFold,
  buildPurgedValidationPlan,
  type FoldProvenance,
  type ValidationMode,
  type ValidationPlan,
} from "./purged-validation";
import {
  brierScore,
  calibratedPositiveProbability,
  fitPlattCalibrator,
  reliabilityBins,
  type ReliabilityBin,
} from "./calibration";

const MAX_ASSETS = 8;
const MAX_BARS_PER_ASSET = 5_000;
// Fixed caps keep four fits per asset (three OOS folds plus holdout model) mobile-safe.
const MAX_MODEL_TRAIN_ROWS = 1_200;
const MAX_HOLDING_BARS = 20;
const MIN_LOOKBACK = 10;
const MAX_LOOKBACK = 60;
const MIN_TRAIN_ROWS = 60;
const MIN_ELIGIBLE_ROWS = 120;
const MIN_HOLDOUT_ROWS = 20;
const WALK_FORWARD_FOLDS = 3;
const MAX_STUMPS = 6;
const SCALE_LIMIT = 8;
const EPSILON = 1e-12;
const MAX_VALIDATION_ROWS = 2_000;
const MIN_CALIBRATION_ROWS = 20;
const DEFAULT_EMBARGO_PCT = 0.01;
const DEFAULT_MAX_FOLDS = 15;

/** Parent integration target: add these optional fields to QuantSettings. */
export type MLValidationSettings = {
  validationMode?: ValidationMode;
  /** Fraction of capped chronological rows embargoed after each tested block, 0..1. */
  embargoPct?: number;
  /** Maximum total validation fits per asset, including the untouched-holdout fit, 4..15. */
  maxFolds?: number;
};

export type MLReliabilityDiagnostics = {
  /** Evaluated only on a test/holdout partition that did not fit the model or calibrator. */
  scoredSamples: number;
  brierScore: number | null;
  bins: ReliabilityBin[];
  calibratedFor: "positive costed forward-direction label";
  notWinProbability: true;
};

export type MLValidationDiagnostics = {
  mode: ValidationMode;
  validationRows: number;
  /** Inclusive decision-index label intervals referenced by fold provenance indices. */
  events: { start: number; end: number }[];
  inputRowsCapped: boolean;
  embargoPct: number;
  maxFolds: number;
  foldPlan: ValidationPlan;
  /** Latest chronological holdout provenance, separate from the selected validation plan. */
  holdout?: FoldProvenance;
  foldReliability: Record<string, MLReliabilityDiagnostics>;
  holdoutReliability?: MLReliabilityDiagnostics;
  /** Sum of fold fits plus the holdout fit; never exceeds maxFolds. */
  fittingJobs: number;
};

export type MLRunValidationDiagnostics = {
  label: "costed forward-direction classification";
  assets: { symbol: string; diagnostics: MLValidationDiagnostics }[];
};

/** Runtime-compatible extension until the parent adds the optional field to QuantLabResult. */
export type MLRunResult = QuantLabResult & {
  mlValidation?: MLRunValidationDiagnostics;
};

type Direction = -1 | 1;
type FeatureRow = {
  /** Earliest closed OHLC index read by the lagged feature vector. */
  featureStartIndex: number;
  decisionIndex: number;
  time: number;
  exitTime: number;
  features: number[];
  label: Direction;
  longNet: number;
  shortNet: number;
};
type Scale = { mean: number[]; deviation: number[] };
type Stump = {
  feature: number;
  threshold: number;
  polarity: Direction;
  weight: number;
};
type Model = { scale: Scale; stumps: Stump[]; totalWeight: number };
type PreparedBars = {
  bars: Candle[];
  invalid: number;
  duplicate: number;
  excludedOpen: number;
  irregular: number;
};
type AssetResult = {
  rows: FeatureRow[];
  currentFeatures?: number[];
  currentAt?: number;
  closedBars: number;
  invalidBars: number;
  duplicateBars: number;
  excludedOpenBars: number;
  irregularGaps: number;
  trainRows: number;
  walkForwardCorrect: number;
  walkForwardRows: number;
  holdoutCorrect: number;
  holdoutRows: number;
  validation?: MLValidationDiagnostics;
  equity: { time: number; value: number }[];
  signal?: QuantSignal;
  reasons: string[];
};

const timeframeIsSupported = (value: unknown): value is Timeframe =>
  typeof value === "string" &&
  Object.prototype.hasOwnProperty.call(SECONDS, value);

function validCandle(value: unknown): value is Candle {
  if (!value || typeof value !== "object") return false;
  const candle = value as Partial<Candle>;
  return (
    Number.isSafeInteger(candle.time) &&
    candle.time !== undefined &&
    candle.time > 0 &&
    [candle.open, candle.high, candle.low, candle.close, candle.volume].every(
      (field) => typeof field === "number" && Number.isFinite(field),
    ) &&
    candle.open! > 0 &&
    candle.high! > 0 &&
    candle.low! > 0 &&
    candle.close! > 0 &&
    candle.volume! >= 0 &&
    candle.high! >= candle.low! &&
    candle.high! >= Math.max(candle.open!, candle.close!) &&
    candle.low! <= Math.min(candle.open!, candle.close!)
  );
}

/**
 * Retains raw OHLC records only: malformed records are skipped, duplicate timestamps
 * keep the earliest supplied record, and gaps are reported rather than filled.
 */
function prepareBars(
  raw: unknown,
  timeframe: Timeframe,
  nowMs: number,
): PreparedBars {
  const seconds = SECONDS[timeframe];
  const nowSeconds = nowMs / 1_000;
  const candidates: { candle: Candle; order: number }[] = [];
  let invalid = 0;
  let excludedOpen = 0;

  if (!Array.isArray(raw)) {
    return {
      bars: [],
      invalid: 1,
      duplicate: 0,
      excludedOpen: 0,
      irregular: 0,
    };
  }

  raw.forEach((value, order) => {
    if (!validCandle(value)) {
      invalid += 1;
      return;
    }
    // Candles and timeframes are Unix seconds; QuantLabInput.now is Unix milliseconds.
    if (value.time + seconds > nowSeconds) {
      excludedOpen += 1;
      return;
    }
    candidates.push({ candle: value, order });
  });

  candidates.sort(
    (left, right) =>
      left.candle.time - right.candle.time || left.order - right.order,
  );
  const unique: Candle[] = [];
  let duplicate = 0;
  for (const candidate of candidates) {
    if (unique.at(-1)?.time === candidate.candle.time) {
      duplicate += 1;
      continue;
    }
    unique.push(candidate.candle);
  }

  const bars = unique.slice(-MAX_BARS_PER_ASSET);
  let irregular = 0;
  for (let index = 1; index < bars.length; index += 1) {
    if (bars[index].time - bars[index - 1].time !== seconds) irregular += 1;
  }
  return { bars, invalid, duplicate, excludedOpen, irregular };
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function featureAt(
  bars: readonly Candle[],
  historyEnd: number,
  lookback: number,
): number[] | undefined {
  if (historyEnd < lookback || historyEnd < 5) return undefined;
  const current = bars[historyEnd];
  const prior = bars[historyEnd - 1];
  const fiveBarsAgo = bars[historyEnd - 5];
  const windowStart = historyEnd - lookback + 1;
  const trailing = bars.slice(windowStart, historyEnd + 1);
  const priorWindowClose = bars[historyEnd - lookback].close;
  if (
    !current ||
    !prior ||
    !fiveBarsAgo ||
    !priorWindowClose ||
    trailing.length !== lookback
  )
    return undefined;

  const returns: number[] = [];
  for (let index = windowStart; index <= historyEnd; index += 1) {
    const previousClose = bars[index - 1]?.close;
    const close = bars[index]?.close;
    if (!previousClose || !close) return undefined;
    const value = close / previousClose - 1;
    if (!Number.isFinite(value)) return undefined;
    returns.push(value);
  }
  const returnMean = mean(returns);
  const variance = mean(returns.map((value) => (value - returnMean) ** 2));
  const highest = Math.max(...trailing.map((bar) => bar.high));
  const lowest = Math.min(...trailing.map((bar) => bar.low));
  const span = highest - lowest;
  const position = span > EPSILON ? (current.close - lowest) / span - 0.5 : 0;
  const features = [
    current.close / prior.close - 1,
    current.close / fiveBarsAgo.close - 1,
    (current.high - current.low) / current.close,
    current.close / priorWindowClose - 1,
    position,
    Math.sqrt(Math.max(0, variance)),
  ];
  return features.every(Number.isFinite) ? features : undefined;
}

/**
 * The row at decisionIndex uses only OHLC through decisionIndex - 1. Its costed
 * label uses the next holdingBars actual records; it is never used as a feature.
 * Validation discipline follows research/foundry-audit/ml.md:7-9 and
 * requirements/foundry-scope-04.txt:54-61 (chronological OOS and a latest holdout).
 */
function featureStore(
  bars: readonly Candle[],
  lookback: number,
  holdingBars: number,
  cost: number,
): FeatureRow[] {
  const rows: FeatureRow[] = [];
  for (
    let decisionIndex = lookback + 1;
    decisionIndex + holdingBars - 1 < bars.length;
    decisionIndex += 1
  ) {
    const features = featureAt(bars, decisionIndex - 1, lookback);
    const entry = bars[decisionIndex];
    const exit = bars[decisionIndex + holdingBars - 1];
    if (!features || !entry || !exit || entry.open <= 0 || exit.close <= 0)
      continue;

    const longNet = exit.close / entry.open - 1 - cost;
    const shortNet = entry.open / exit.close - 1 - cost;
    if (!Number.isFinite(longNet) || !Number.isFinite(shortNet)) continue;
    const label: Direction | undefined =
      longNet > 0 ? 1 : shortNet > 0 ? -1 : undefined;
    if (!label) continue; // An in-cost-band outcome is not assigned an invented direction.
    rows.push({
      // featureAt(decisionIndex - 1) reads the prior close immediately before
      // its trailing window, so the feature interval starts one bar earlier.
      featureStartIndex: decisionIndex - lookback - 1,
      decisionIndex,
      time: entry.time,
      exitTime: exit.time,
      features,
      label,
      longNet,
      shortNet,
    });
  }
  return rows;
}

function capTrainingRows(rows: readonly FeatureRow[]): FeatureRow[] {
  if (rows.length <= MAX_MODEL_TRAIN_ROWS) return [...rows];
  const selected: FeatureRow[] = [];
  for (let index = 0; index < MAX_MODEL_TRAIN_ROWS; index += 1) {
    selected.push(
      rows[
        Math.floor((index * (rows.length - 1)) / (MAX_MODEL_TRAIN_ROWS - 1))
      ],
    );
  }
  return selected;
}

function fitScale(rows: readonly FeatureRow[]): Scale | undefined {
  if (!rows.length) return undefined;
  const width = rows[0].features.length;
  if (!width || rows.some((row) => row.features.length !== width))
    return undefined;
  const averages = Array.from({ length: width }, (_, feature) =>
    mean(rows.map((row) => row.features[feature])),
  );
  const deviation = averages.map((average, feature) => {
    const variance = mean(
      rows.map((row) => (row.features[feature] - average) ** 2),
    );
    const value = Math.sqrt(Math.max(0, variance));
    return Number.isFinite(value) && value > EPSILON ? value : 1;
  });
  return averages.every(Number.isFinite) && deviation.every(Number.isFinite)
    ? { mean: averages, deviation }
    : undefined;
}

function scaleFeatures(
  features: readonly number[],
  scale: Scale,
): number[] | undefined {
  if (features.length !== scale.mean.length) return undefined;
  const scaled = features.map((value, index) => {
    const standardized = (value - scale.mean[index]) / scale.deviation[index];
    return Math.max(-SCALE_LIMIT, Math.min(SCALE_LIMIT, standardized));
  });
  return scaled.every(Number.isFinite) ? scaled : undefined;
}

function stumpPrediction(
  stump: Pick<Stump, "feature" | "threshold" | "polarity">,
  features: readonly number[],
): Direction {
  const lowSide: Direction =
    features[stump.feature] <= stump.threshold ? -1 : 1;
  return (lowSide * stump.polarity) as Direction;
}

function thresholdsFor(values: readonly number[]): number[] {
  const sorted = [...values].sort((left, right) => left - right);
  const thresholds = new Set<number>();
  for (const quantile of [0.1, 0.25, 0.5, 0.75, 0.9]) {
    thresholds.add(sorted[Math.floor((sorted.length - 1) * quantile)]);
  }
  return [...thresholds].filter(Number.isFinite);
}

/** A deterministic, bounded AdaBoost-style ensemble of shallow decision stumps. */
function fitModel(rows: readonly FeatureRow[]): Model | undefined {
  const training = capTrainingRows(rows);
  if (training.length < MIN_TRAIN_ROWS) return undefined;
  const positive = training.filter((row) => row.label === 1).length;
  if (!positive || positive === training.length) return undefined;

  const scale = fitScale(training);
  if (!scale) return undefined;
  const scaled = training.map((row) => ({
    row,
    features: scaleFeatures(row.features, scale),
  }));
  if (scaled.some((item) => !item.features)) return undefined;
  const entries = scaled as { row: FeatureRow; features: number[] }[];
  const weights = Array(entries.length).fill(1 / entries.length) as number[];
  const stumps: Stump[] = [];

  for (let round = 0; round < MAX_STUMPS; round += 1) {
    let best: (Omit<Stump, "weight"> & { error: number }) | undefined;
    for (let feature = 0; feature < entries[0].features.length; feature += 1) {
      for (const threshold of thresholdsFor(
        entries.map((entry) => entry.features[feature]),
      )) {
        for (const polarity of [-1, 1] as const) {
          const candidate = {
            feature,
            threshold,
            polarity: polarity as Direction,
          };
          let error = 0;
          entries.forEach((entry, index) => {
            if (stumpPrediction(candidate, entry.features) !== entry.row.label)
              error += weights[index];
          });
          if (
            !best ||
            error < best.error - EPSILON ||
            (Math.abs(error - best.error) <= EPSILON &&
              (feature < best.feature ||
                (feature === best.feature &&
                  (threshold < best.threshold ||
                    (threshold === best.threshold &&
                      polarity < best.polarity)))))
          ) {
            best = { ...candidate, error };
          }
        }
      }
    }
    if (!best || !Number.isFinite(best.error) || best.error >= 0.5 - EPSILON)
      break;
    const boundedError = Math.max(1e-6, Math.min(0.499999, best.error));
    const weight = Math.min(
      2,
      0.5 * Math.log((1 - boundedError) / boundedError),
    );
    if (!Number.isFinite(weight) || weight <= 0) break;
    const stump: Stump = {
      feature: best.feature,
      threshold: best.threshold,
      polarity: best.polarity,
      weight,
    };
    stumps.push(stump);

    let total = 0;
    entries.forEach((entry, index) => {
      const predicted = stumpPrediction(stump, entry.features);
      weights[index] *= Math.exp(-weight * entry.row.label * predicted);
      total += weights[index];
    });
    if (!Number.isFinite(total) || total <= 0) break;
    for (let index = 0; index < weights.length; index += 1)
      weights[index] /= total;
  }

  const totalWeight = stumps.reduce((sum, stump) => sum + stump.weight, 0);
  return stumps.length && Number.isFinite(totalWeight) && totalWeight > 0
    ? { scale, stumps, totalWeight }
    : undefined;
}

function predict(
  model: Model,
  features: readonly number[],
): { direction: Direction; strength: number; signedMargin: number } | undefined {
  const scaled = scaleFeatures(features, model.scale);
  if (!scaled) return undefined;
  const score = model.stumps.reduce(
    (sum, stump) => sum + stump.weight * stumpPrediction(stump, scaled),
    0,
  );
  if (!Number.isFinite(score)) return undefined;
  const signedMargin = Math.max(-1, Math.min(1, score / model.totalWeight));
  return {
    direction: score >= 0 ? 1 : -1,
    // This is a normalized ensemble margin, deliberately not a probability estimate.
    strength: Math.abs(signedMargin),
    signedMargin,
  };
}

function capRowIndices(indices: readonly number[]): number[] {
  if (indices.length <= MAX_MODEL_TRAIN_ROWS) return [...indices];
  return Array.from({ length: MAX_MODEL_TRAIN_ROWS }, (_, index) =>
    indices[Math.floor((index * (indices.length - 1)) / (MAX_MODEL_TRAIN_ROWS - 1))],
  );
}

function capValidationRows(rows: readonly FeatureRow[]): {
  rows: FeatureRow[];
  capped: boolean;
} {
  return rows.length <= MAX_VALIDATION_ROWS
    ? { rows: [...rows], capped: false }
    : { rows: rows.slice(-MAX_VALIDATION_ROWS), capped: true };
}

function remapFoldProvenance(
  fold: FoldProvenance,
  sourceIndices: readonly number[],
): FoldProvenance {
  const map = (indices: readonly number[] | undefined) =>
    indices?.flatMap((index) =>
      sourceIndices[index] === undefined ? [] : [sourceIndices[index]],
    );
  return {
    ...fold,
    trainingIndices: map(fold.trainingIndices) ?? [],
    testIndices: map(fold.testIndices) ?? [],
    purgedIndices: map(fold.purgedIndices) ?? [],
    embargoedIndices: map(fold.embargoedIndices) ?? [],
    ...(fold.modelTrainingIndices
      ? { modelTrainingIndices: map(fold.modelTrainingIndices) ?? [] }
      : {}),
    ...(fold.calibrationIndices
      ? { calibrationIndices: map(fold.calibrationIndices) ?? [] }
      : {}),
  };
}

function rowClassCounts(
  rows: readonly FeatureRow[],
  indices: readonly number[],
): { negative: number; positive: number; total: number } {
  let negative = 0;
  let positive = 0;
  for (const index of indices) {
    if (rows[index]?.label === 1) positive += 1;
    else if (rows[index]?.label === -1) negative += 1;
  }
  return { negative, positive, total: negative + positive };
}

type ResolvedValidationSettings = {
  mode: ValidationMode;
  embargoPct: number;
  maxFolds: number;
};

type FittedFold = {
  model?: Model;
  calibrator?: ReturnType<typeof fitPlattCalibrator>;
  provenance: FoldProvenance;
};

type ScoredFold = {
  correct: number;
  total: number;
  reliability?: MLReliabilityDiagnostics;
};

function resolveValidationSettings(
  settings: QuantLabInput["settings"] & MLValidationSettings,
): ResolvedValidationSettings | undefined {
  const mode = settings.validationMode ?? "cpcv";
  const embargoPct = settings.embargoPct ?? DEFAULT_EMBARGO_PCT;
  const maxFolds = settings.maxFolds ?? DEFAULT_MAX_FOLDS;
  if (mode !== "walk-forward" && mode !== "cpcv") return undefined;
  if (!Number.isFinite(embargoPct) || embargoPct < 0 || embargoPct > 1)
    return undefined;
  // One fitting job is reserved for the latest untouched holdout.
  if (!Number.isInteger(maxFolds) || maxFolds < 4 || maxFolds > DEFAULT_MAX_FOLDS)
    return undefined;
  return { mode, embargoPct, maxFolds };
}

function fitFold(
  rows: readonly FeatureRow[],
  fold: FoldProvenance,
  holdingBars: number,
): FittedFold {
  const trainIndices = [...fold.trainingIndices].sort((left, right) => left - right);
  const calibrationCount =
    trainIndices.length >= MIN_TRAIN_ROWS + MIN_CALIBRATION_ROWS
      ? Math.max(MIN_CALIBRATION_ROWS, Math.floor(trainIndices.length * 0.2))
      : 0;
  const calibrationIndices = calibrationCount
    ? trainIndices.slice(-calibrationCount)
    : [];
  const calibrationStart = calibrationIndices.length
    ? rows[calibrationIndices[0]]?.featureStartIndex
    : undefined;
  const modelCandidates = calibrationStart === undefined
    ? trainIndices
    : trainIndices.slice(0, -calibrationCount).filter((index) => {
        const row = rows[index];
        return row && row.decisionIndex + holdingBars - 1 < calibrationStart;
      });
  const modelTrainingIndices = capRowIndices(modelCandidates);
  const model = fitModel(modelTrainingIndices.map((index) => rows[index]));
  const provenance: FoldProvenance = {
    ...fold,
    modelTrainingIndices,
    calibrationIndices,
    modelTrainingClassCounts: rowClassCounts(rows, modelTrainingIndices),
    calibrationClassCounts: rowClassCounts(rows, calibrationIndices),
  };
  if (!model) return { provenance };

  const calibration = calibrationIndices.flatMap((index) => {
    const row = rows[index];
    const prediction = row ? predict(model, row.features) : undefined;
    return prediction
      ? [{ score: prediction.signedMargin, outcome: row.label === 1 ? (1 as const) : (0 as const) }]
      : [];
  });
  return {
    model,
    calibrator: fitPlattCalibrator(calibration),
    provenance,
  };
}

function scoreFold(
  rows: readonly FeatureRow[],
  fitted: FittedFold,
): ScoredFold {
  if (!fitted.model) return { correct: 0, total: 0 };
  let correct = 0;
  let total = 0;
  const calibrationTestRows: { probability: number; outcome: 0 | 1 }[] = [];
  for (const index of fitted.provenance.testIndices) {
    const row = rows[index];
    if (!row) continue;
    const prediction = predict(fitted.model, row.features);
    if (!prediction) continue;
    total += 1;
    if (prediction.direction === row.label) correct += 1;
    if (fitted.calibrator) {
      const probability = calibratedPositiveProbability(
        fitted.calibrator,
        prediction.signedMargin,
      );
      if (probability !== undefined) {
        calibrationTestRows.push({
          probability,
          outcome: row.label === 1 ? 1 : 0,
        });
      }
    }
  }
  const reliability: MLReliabilityDiagnostics | undefined = fitted.calibrator
    ? {
        scoredSamples: calibrationTestRows.length,
        brierScore: brierScore(calibrationTestRows),
        bins: reliabilityBins(calibrationTestRows),
        calibratedFor: "positive costed forward-direction label",
        notWinProbability: true,
      }
    : undefined;
  return { correct, total, reliability };
}

function reasonForSeries(series: QuantSeries, text: string): string {
  const symbol =
    typeof series?.symbol === "string" && series.symbol
      ? series.symbol
      : "unnamed series";
  return `${symbol}: ${text}`;
}

function resultForAsset(
  series: QuantSeries,
  nowMs: number,
  lookback: number,
  holdingBars: number,
  cost: number,
  startingEquity: number | undefined,
  validationSettings: ResolvedValidationSettings,
): AssetResult {
  const prepared = prepareBars(series?.candles, series?.timeframe, nowMs);
  const rows = featureStore(prepared.bars, lookback, holdingBars, cost);
  const reasons: string[] = [];
  if (prepared.invalid)
    reasons.push(
      reasonForSeries(
        series,
        `${prepared.invalid} malformed OHLC record(s) were skipped.`,
      ),
    );
  if (prepared.duplicate)
    reasons.push(
      reasonForSeries(
        series,
        `${prepared.duplicate} duplicate timestamp(s) were skipped; first supplied record retained.`,
      ),
    );
  if (prepared.excludedOpen)
    reasons.push(
      reasonForSeries(
        series,
        `${prepared.excludedOpen} open/future bar(s) were excluded.`,
      ),
    );
  if (prepared.irregular)
    reasons.push(
      reasonForSeries(
        series,
        `${prepared.irregular} timestamp gap(s) retained as supplied; no bars were filled.`,
      ),
    );
  if (rows.length < MIN_ELIGIBLE_ROWS) {
    reasons.push(
      reasonForSeries(
        series,
        `${rows.length} eligible costed outcomes; need at least ${MIN_ELIGIBLE_ROWS} for bounded chronological ML research.`,
      ),
    );
    return {
      rows,
      closedBars: prepared.bars.length,
      invalidBars: prepared.invalid,
      duplicateBars: prepared.duplicate,
      excludedOpenBars: prepared.excludedOpen,
      irregularGaps: prepared.irregular,
      trainRows: 0,
      walkForwardCorrect: 0,
      walkForwardRows: 0,
      holdoutCorrect: 0,
      holdoutRows: 0,
      equity: [],
      reasons,
    };
  }

  const capped = capValidationRows(rows);
  const validationRows = capped.rows;
  if (capped.capped) {
    reasons.push(
      reasonForSeries(
        series,
        `Validation used the most recent ${MAX_VALIDATION_ROWS} supplied costed outcomes; older actual outcomes were not fitted or scored.`,
      ),
    );
  }
  const holdoutCount = Math.max(
    MIN_HOLDOUT_ROWS,
    Math.ceil(validationRows.length * 0.2),
  );
  const holdoutStart = validationRows.length - holdoutCount;
  const events = validationRows.map((row) => ({
    // Purge the entire observed feature history through the forward label, not
    // merely label-to-label overlap. This also applies to the latest holdout.
    start: row.featureStartIndex,
    end: row.decisionIndex + holdingBars - 1,
  }));
  const labels = validationRows.map((row) => row.label);
  const holdoutIndices = Array.from(
    { length: holdoutCount },
    (_, offset) => holdoutStart + offset,
  );

  let holdout: FoldProvenance;
  let validationPlan: ValidationPlan;
  let development: FeatureRow[];
  let developmentSourceIndices: number[];
  try {
    holdout = buildPurgedHoldoutFold(
      events,
      labels,
      holdoutIndices,
      validationSettings.embargoPct,
    );
    // Exclude every development row whose full feature-to-label interval touches
    // the final holdout before constructing CPCV/WF folds. The holdout is never
    // a fit, calibration, scaling, or validation-plan input.
    developmentSourceIndices = holdout.trainingIndices;
    development = developmentSourceIndices.map((index) => validationRows[index]);
    const developmentEvents = developmentSourceIndices.map((index) => events[index]);
    const developmentLabels = developmentSourceIndices.map((index) => labels[index]);
    validationPlan = buildPurgedValidationPlan(developmentEvents, {
      mode: validationSettings.mode,
      labels: developmentLabels,
      embargoPct: validationSettings.embargoPct,
      maxFolds: validationSettings.maxFolds,
    });
  } catch {
    reasons.push(
      reasonForSeries(series, "The requested purged validation settings could not form bounded folds."),
    );
    return {
      rows,
      closedBars: prepared.bars.length,
      invalidBars: prepared.invalid,
      duplicateBars: prepared.duplicate,
      excludedOpenBars: prepared.excludedOpen,
      irregularGaps: prepared.irregular,
      trainRows: 0,
      walkForwardCorrect: 0,
      walkForwardRows: 0,
      holdoutCorrect: 0,
      holdoutRows: 0,
      equity: [],
      reasons,
    };
  }

  const foldReliability: Record<string, MLReliabilityDiagnostics> = {};
  let walkForwardCorrect = 0;
  let walkForwardRows = 0;
  const completedFolds: FoldProvenance[] = [];
  const fittedFolds: FittedFold[] = [];
  for (const fold of validationPlan.folds) {
    const fitted = fitFold(development, fold, holdingBars);
    const scored = scoreFold(development, fitted);
    fittedFolds.push(fitted);
    completedFolds.push(
      remapFoldProvenance(fitted.provenance, developmentSourceIndices),
    );
    walkForwardCorrect += scored.correct;
    walkForwardRows += scored.total;
    if (scored.reliability) foldReliability[fitted.provenance.id] = scored.reliability;
  }
  const completedPlan: ValidationPlan = {
    ...validationPlan,
    events,
    folds: completedFolds,
  };

  // Reuse a fitted development-only fold to score the untouched holdout. This
  // avoids a sixteenth default fit while keeping the holdout out of every fit,
  // scaler, calibrator, and CPCV/WF planning operation.
  const fittedDevelopment = fittedFolds.find((fitted) => fitted.model);
  const holdoutProvenance = fittedDevelopment
    ? {
        ...holdout,
        id: `latest-holdout-using-${fittedDevelopment.provenance.id}`,
        trainingIndices:
          remapFoldProvenance(
            fittedDevelopment.provenance,
            developmentSourceIndices,
          ).trainingIndices,
        trainingClassCounts: fittedDevelopment.provenance.trainingClassCounts,
        ...(fittedDevelopment.provenance.modelTrainingIndices
          ? {
              modelTrainingIndices:
                remapFoldProvenance(
                  fittedDevelopment.provenance,
                  developmentSourceIndices,
                ).modelTrainingIndices,
            }
          : {}),
        ...(fittedDevelopment.provenance.calibrationIndices
          ? {
              calibrationIndices:
                remapFoldProvenance(
                  fittedDevelopment.provenance,
                  developmentSourceIndices,
                ).calibrationIndices,
            }
          : {}),
      }
    : holdout;
  const fittedHoldout: FittedFold | undefined = fittedDevelopment
    ? { ...fittedDevelopment, provenance: holdoutProvenance }
    : undefined;
  const heldout = fittedHoldout
    ? scoreFold(validationRows, fittedHoldout)
    : { correct: 0, total: 0 };
  const diagnostics: MLValidationDiagnostics = {
    mode: validationSettings.mode,
    validationRows: validationRows.length,
    events,
    inputRowsCapped: capped.capped,
    embargoPct: validationSettings.embargoPct,
    maxFolds: validationSettings.maxFolds,
    foldPlan: completedPlan,
    holdout: holdoutProvenance,
    foldReliability,
    ...(heldout.reliability ? { holdoutReliability: heldout.reliability } : {}),
    fittingJobs: completedPlan.fittingJobs,
  };
  if (!fittedHoldout?.model) {
    reasons.push(
      reasonForSeries(
        series,
        "the pre-holdout training partition lacks both costed directions or a discriminative bounded stump.",
      ),
    );
    return {
      rows,
      closedBars: prepared.bars.length,
      invalidBars: prepared.invalid,
      duplicateBars: prepared.duplicate,
      excludedOpenBars: prepared.excludedOpen,
      irregularGaps: prepared.irregular,
      trainRows: holdoutProvenance.modelTrainingIndices?.length ?? 0,
      walkForwardCorrect,
      walkForwardRows,
      holdoutCorrect: 0,
      holdoutRows: 0,
      validation: diagnostics,
      equity: [],
      reasons,
    };
  }

  const model = fittedHoldout.model;
  const currentFeatures = featureAt(
    prepared.bars,
    prepared.bars.length - 1,
    lookback,
  );
  const currentAt = prepared.bars.at(-1)
    ? prepared.bars.at(-1)!.time + SECONDS[series.timeframe]
    : undefined;
  const currentPrediction = currentFeatures
    ? predict(model, currentFeatures)
    : undefined;
  const provenance =
    series.provenance === "provider" || series.provenance === "user-import"
      ? series.provenance
      : "unrecognized provenance";
  const source =
    typeof series.source === "string" && series.source.trim()
      ? series.source.trim().slice(0, 120)
      : "unnamed source";
  const signal: QuantSignal | undefined =
    currentPrediction && currentAt
      ? {
          at: currentAt,
          symbol:
            typeof series.symbol === "string" && series.symbol
              ? series.symbol
              : "unnamed",
          direction:
            currentPrediction.direction === 1
              ? ("long" as const)
              : ("short" as const),
          strength: currentPrediction.strength,
          reason:
            `Exploratory boosted-stump forward-direction score from lagged closed OHLC; ${provenance} source ${source}. ` +
            "Margin is not a calibrated win probability or a confirmed edge.",
        }
      : undefined;

  const equity: { time: number; value: number }[] = [];
  if (startingEquity !== undefined) {
    let value = startingEquity;
    let lastDecision = -Infinity;
    for (const index of fittedHoldout.provenance.testIndices) {
      const row = validationRows[index];
      if (!row || row.decisionIndex < lastDecision + holdingBars) continue;
      const predicted = predict(model, row.features);
      if (!predicted) continue;
      const net = predicted.direction === 1 ? row.longNet : row.shortNet;
      value = Math.max(0, value * (1 + net));
      if (!Number.isFinite(value)) break;
      equity.push({ time: row.exitTime + SECONDS[series.timeframe], value });
      lastDecision = row.decisionIndex;
    }
  }

  return {
    rows,
    currentFeatures,
    currentAt,
    closedBars: prepared.bars.length,
    invalidBars: prepared.invalid,
    duplicateBars: prepared.duplicate,
    excludedOpenBars: prepared.excludedOpen,
    irregularGaps: prepared.irregular,
    trainRows: fittedHoldout.provenance.modelTrainingIndices?.length ?? 0,
    walkForwardCorrect,
    walkForwardRows,
    holdoutCorrect: heldout.correct,
    holdoutRows: heldout.total,
    validation: diagnostics,
    equity,
    signal,
    reasons,
  };
}
function emptyResult(summary: string, reasons: string[]): QuantLabResult {
  return {
    family: "ml",
    status: "insufficient-data",
    title: "Machine learning — costed direction research",
    summary,
    asOf: 0,
    metrics: [],
    signals: [],
    equity: [],
    validation: {
      status: "unconfirmed",
      actualSamples: 0,
      trainSamples: 0,
      testSamples: 0,
      walkForward: false,
      untouchedHoldout: false,
      reasons,
    },
    dataRequirements: reasons,
    limitations: [
      "No calibrated win probability, confirmed edge, or profitability claim is produced.",
      "This synchronous module neither fetches market data nor places orders.",
    ],
  };
}

function metric(
  key: string,
  label: string,
  value: number | string | null,
  unit?: string,
): QuantMetric {
  return unit ? { key, label, value, unit } : { key, label, value };
}

/**
 * Runs an intentionally small tabular ML research path: per-series lagged OHLC
 * features, train-only scaling, a bounded boosted-stump classifier, selectable
 * walk-forward/CPCV research, and a never-fitted latest holdout.
 */
export function runML(input: QuantLabInput): MLRunResult {
  if (!input || input.family !== "ml") {
    return emptyResult(
      "ML research is unavailable because the input is not the ML family.",
      ['QuantLabInput.family must be "ml".'],
    );
  }
  if (!Number.isFinite(input.now) || input.now < 10_000_000_000) {
    return emptyResult(
      "ML research needs a Unix-millisecond evaluation time to exclude open candles.",
      ["QuantLabInput.now must be a finite Unix-millisecond timestamp."],
    );
  }
  if (!Array.isArray(input.series) || !input.series.length) {
    return emptyResult("ML research needs supplied historical OHLC series.", [
      "Provide at least one timestamped OHLC series.",
    ]);
  }
  if (
    !input.settings ||
    !Number.isInteger(input.settings.lookback) ||
    input.settings.lookback < MIN_LOOKBACK ||
    input.settings.lookback > MAX_LOOKBACK ||
    !Number.isInteger(input.settings.holdingBars) ||
    input.settings.holdingBars < 1 ||
    input.settings.holdingBars > MAX_HOLDING_BARS
  ) {
    return emptyResult(
      "ML research needs bounded integer feature and holding windows.",
      [
        `lookback must be an integer from ${MIN_LOOKBACK} to ${MAX_LOOKBACK}; holdingBars must be an integer from 1 to ${MAX_HOLDING_BARS}.`,
      ],
    );
  }
  if (
    !Number.isFinite(input.settings.feeBps) ||
    !Number.isFinite(input.settings.slippageBps) ||
    input.settings.feeBps < 0 ||
    input.settings.slippageBps < 0
  ) {
    return emptyResult(
      "ML research needs finite non-negative user-supplied fee and slippage inputs.",
      [
        "feeBps and slippageBps must be finite non-negative values; no exchange costs are invented.",
      ],
    );
  }
  const validationSettings = resolveValidationSettings(
    input.settings as QuantLabInput["settings"] & MLValidationSettings,
  );
  if (!validationSettings) {
    return emptyResult(
      "ML research needs bounded purged-validation settings.",
      [
        "validationMode must be walk-forward or cpcv; embargoPct must be a finite fraction from 0 to 1; maxFolds must be an integer from 4 to 15 (including the untouched-holdout fit).",
      ],
    );
  }

  const unsupported = input.series.find(
    (series) => !timeframeIsSupported(series?.timeframe),
  );
  if (unsupported) {
    return emptyResult("ML research received an unsupported timeframe.", [
      "Every series must use a supported Timeframe with a defined SECONDS duration.",
    ]);
  }

  const processed = input.series.slice(0, MAX_ASSETS);
  const cost =
    (2 * (input.settings.feeBps + input.settings.slippageBps)) / 10_000;
  const startingEquity =
    Number.isFinite(input.settings.startingEquity) &&
    input.settings.startingEquity > 0
      ? input.settings.startingEquity
      : undefined;
  const assetResults = processed.map((series) =>
    resultForAsset(
      series,
      input.now,
      input.settings.lookback,
      input.settings.holdingBars,
      cost,
      startingEquity,
      validationSettings,
    ),
  );

  const actualSamples = assetResults.reduce(
    (sum, result) => sum + result.rows.length,
    0,
  );
  const trainSamples = assetResults.reduce(
    (sum, result) => sum + result.trainRows,
    0,
  );
  const walkForwardRows = assetResults.reduce(
    (sum, result) => sum + result.walkForwardRows,
    0,
  );
  const walkForwardCorrect = assetResults.reduce(
    (sum, result) => sum + result.walkForwardCorrect,
    0,
  );
  const holdoutRows = assetResults.reduce(
    (sum, result) => sum + result.holdoutRows,
    0,
  );
  const holdoutCorrect = assetResults.reduce(
    (sum, result) => sum + result.holdoutCorrect,
    0,
  );
  const reasons = assetResults.flatMap((result) => result.reasons);
  const signals = assetResults.flatMap((result) =>
    result.signal ? [result.signal] : [],
  );
  const equityBySymbol = assetResults.flatMap((result, index) => {
    if (!result.equity.length) return [];
    const symbol =
      typeof processed[index].symbol === "string" && processed[index].symbol
        ? processed[index].symbol
        : `series ${index + 1}`;
    return [{ symbol, points: result.equity }];
  });
  // A single legacy path is meaningful only when exactly one asset produced it.
  // Multi-asset research has no allocation or rebalancing rule, so never combine paths.
  const equity = equityBySymbol.length === 1 ? equityBySymbol[0].points : [];
  const latestClosedAtMs = assetResults.reduce((latest, result, index) => {
    const bar = prepareBars(
      processed[index].candles,
      processed[index].timeframe,
      input.now,
    ).bars.at(-1);
    return bar
      ? Math.max(
          latest,
          (bar.time + SECONDS[processed[index].timeframe]) * 1_000,
        )
      : latest;
  }, 0);

  if (input.series.length > MAX_ASSETS)
    reasons.push(
      `Only the first ${MAX_ASSETS} supplied series were processed; ${input.series.length - MAX_ASSETS} were not analyzed.`,
    );
  if (!startingEquity)
    reasons.push(
      "No heldout equity path: startingEquity must be a finite positive user-supplied value.",
    );
  reasons.push(
    "All model scores and validation results are unconfirmed research outputs, not calibrated win probabilities or confirmed edges.",
  );

  const metrics: QuantMetric[] = [
    metric(
      "ml-model",
      "Model",
      `${MAX_STUMPS}-stump bounded boosted classifier; fold train-only z-scaling; signal score is not probability`,
    ),
    metric(
      "ml-round-trip-cost",
      "User-supplied round-trip modeled costs",
      cost * 10_000,
      "bps",
    ),
    metric(
      "ml-eligible-outcomes",
      "Eligible costed outcomes",
      actualSamples,
      "outcomes",
    ),
    metric(
      "ml-validation-accuracy",
      `${validationSettings.mode === "cpcv" ? "Purged CPCV" : "Purged walk-forward"} costed forward-direction accuracy (n=${walkForwardRows}; minimum 30)`,
      walkForwardRows >= 30 ? (100 * walkForwardCorrect) / walkForwardRows : null,
      "%",
    ),
    metric(
      "ml-validation-samples",
      `${validationSettings.mode === "cpcv" ? "Purged CPCV" : "Purged walk-forward"} sample count`,
      walkForwardRows,
      "outcomes",
    ),
    metric(
      "ml-holdout-accuracy",
      `Untouched holdout costed-direction accuracy (n=${holdoutRows}; minimum 30)`,
      holdoutRows >= 30 ? (100 * holdoutCorrect) / holdoutRows : null,
      "%",
    ),
    metric(
      "ml-holdout-samples",
      "Untouched holdout sample count",
      holdoutRows,
      "outcomes",
    ),
    metric(
      "ml-validation-mode",
      "Validation mode",
      validationSettings.mode,
    ),
    metric(
      "ml-embargo",
      "Percentage embargo",
      validationSettings.embargoPct * 100,
      "% of capped rows",
    ),
  ];
  processed.forEach((series, index) => {
    const result = assetResults[index];
    const symbol =
      typeof series.symbol === "string" && series.symbol
        ? series.symbol
        : `series ${index + 1}`;
    const source =
      typeof series.source === "string" && series.source.trim()
        ? series.source.trim().slice(0, 120)
        : "unnamed source";
    const provenance =
      series.provenance === "provider" || series.provenance === "user-import"
        ? series.provenance
        : "unrecognized provenance";
    metrics.push(
      metric(
        `ml-source-${index}`,
        `${symbol} source`,
        `${provenance} · ${source}`,
      ),
      metric(
        `ml-bars-${index}`,
        `${symbol} closed valid OHLC bars`,
        result.closedBars,
        "bars",
      ),
      metric(
        `ml-outcomes-${index}`,
        `${symbol} eligible costed outcomes`,
        result.rows.length,
        "outcomes",
      ),
    );
  });

  const validationAssets = assetResults.flatMap((result, index) =>
    result.validation
      ? [
          {
            symbol:
              typeof processed[index].symbol === "string" && processed[index].symbol
                ? processed[index].symbol
                : `series ${index + 1}`,
            diagnostics: result.validation,
          },
        ]
      : [],
  );
  const operational = signals.length > 0 && holdoutRows > 0;
  return {
    family: "ml",
    status: operational ? "ready" : "insufficient-data",
    title: "Machine learning — costed direction research",
    summary: operational
      ? `Per-series lagged OHLC boosted-stump forward-direction research completed with purged ${validationSettings.mode === "cpcv" ? "CPCV" : "walk-forward"} checks and a most-recent untouched holdout. Results remain exploratory and unconfirmed.`
      : "Insufficient per-series chronological OHLC outcomes for a bounded ML direction-research model; no score or edge is asserted.",
    asOf: latestClosedAtMs,
    metrics,
    signals,
    equity,
    validation: {
      status: "unconfirmed",
      actualSamples,
      trainSamples,
      testSamples: holdoutRows,
      walkForward: validationSettings.mode === "walk-forward" && walkForwardRows > 0,
      untouchedHoldout: holdoutRows > 0,
      reasons,
    },
    dataRequirements: [
      `Per source/asset: at least ${MIN_ELIGIBLE_ROWS} eligible costed outcomes after a ${input.settings.lookback}-bar lagged OHLC warm-up and ${input.settings.holdingBars}-bar outcome horizon.`,
      "Sample counts, including 100 or more outcomes, are research context only and are not a validation guarantee. This module remains unconfirmed regardless.",
      "Closed timestamped OHLC bars are required; malformed, duplicate, and open/future bars are skipped without repair or filling.",
      "Provider and user-import series are modeled separately and shown with their supplied provenance/source.",
    ],
    limitations: [
      "No calibrated win probability, confirmed edge, or profitability claim is produced; classifier strength is only a normalized ensemble margin. Reliability/Brier diagnostics, when available, calibrate the positive costed forward-direction label on train-only calibration data and score only test rows.",
      "User-supplied feeBps and slippageBps are the only modeled costs; spread, market impact, borrow, funding, and venue fees are not invented.",
      "Irregular timestamps are retained as supplied; holdingBars counts observations and no missing bars are synthesized.",
      "Each usable heldout equity path remains labelled by symbol in equityBySymbol; no cross-asset allocation, rebalancing, or combined portfolio equity is fabricated.",
      "CPCV is a non-causal research stress test with purged label overlap and embargo; it is not a forward-deployment path. Walk-forward trains only on prior rows. This pure synchronous module does not fetch, retrain on the holdout, call AI, or place orders.",
    ],
    ...(equityBySymbol.length ? { equityBySymbol } : {}),
    ...(validationAssets.length
      ? {
          mlValidation: {
            label: "costed forward-direction classification" as const,
            assets: validationAssets,
          },
        }
      : {}),
  };
}
