export type BinaryCalibrationObservation = {
  /** Signed classifier margin. Positive supports the +1 forward-direction label. */
  score: number;
  /** Positive forward-direction label indicator. */
  outcome: 0 | 1;
};

export type PlattCalibrator = {
  intercept: number;
  slope: number;
  fittedObservations: number;
};

export type ReliabilityBin = {
  lower: number;
  upper: number;
  count: number;
  meanPredictedProbability: number | null;
  observedPositiveRate: number | null;
};

const EPSILON = 1e-12;
const MAX_ITERATIONS = 250;
const LEARNING_RATE = 0.2;
const L2_SLOPE = 1e-3;

function sigmoid(value: number): number {
  if (value >= 35) return 1 - EPSILON;
  if (value <= -35) return EPSILON;
  return 1 / (1 + Math.exp(-value));
}

function finiteObservations(
  observations: readonly BinaryCalibrationObservation[],
): BinaryCalibrationObservation[] {
  return observations.filter(
    (item) =>
      Number.isFinite(item.score) && (item.outcome === 0 || item.outcome === 1),
  );
}

/**
 * Fits a deliberately small logistic (Platt-style) mapping on a supplied calibration partition.
 * Callers must provide a partition disjoint from every reported test/holdout partition.
 */
export function fitPlattCalibrator(
  observations: readonly BinaryCalibrationObservation[],
): PlattCalibrator | undefined {
  const valid = finiteObservations(observations);
  const positives = valid.filter((item) => item.outcome === 1).length;
  if (valid.length < 20 || !positives || positives === valid.length) return undefined;

  let intercept = Math.log(positives / (valid.length - positives));
  let slope = 1;
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    let interceptGradient = 0;
    let slopeGradient = L2_SLOPE * slope;
    for (const item of valid) {
      const error = sigmoid(intercept + slope * item.score) - item.outcome;
      interceptGradient += error;
      slopeGradient += error * item.score;
    }
    intercept -= (LEARNING_RATE * interceptGradient) / valid.length;
    slope -= (LEARNING_RATE * slopeGradient) / valid.length;
    if (!Number.isFinite(intercept) || !Number.isFinite(slope)) return undefined;
  }
  return { intercept, slope, fittedObservations: valid.length };
}

/** Returns P(label is +1), not a probability that a trade will win. */
export function calibratedPositiveProbability(
  calibrator: PlattCalibrator,
  score: number,
): number | undefined {
  if (!Number.isFinite(score)) return undefined;
  const probability = sigmoid(calibrator.intercept + calibrator.slope * score);
  return Number.isFinite(probability)
    ? Math.max(EPSILON, Math.min(1 - EPSILON, probability))
    : undefined;
}

export function brierScore(
  observations: readonly { probability: number; outcome: 0 | 1 }[],
): number | null {
  const valid = observations.filter(
    (item) =>
      Number.isFinite(item.probability) &&
      item.probability >= 0 &&
      item.probability <= 1 &&
      (item.outcome === 0 || item.outcome === 1),
  );
  if (!valid.length) return null;
  return (
    valid.reduce(
      (sum, item) => sum + (item.probability - item.outcome) ** 2,
      0,
    ) / valid.length
  );
}

/** Summarizes only already-scored test observations; it does not fit or adjust probabilities. */
export function reliabilityBins(
  observations: readonly { probability: number; outcome: 0 | 1 }[],
  binCount = 5,
): ReliabilityBin[] {
  if (!Number.isInteger(binCount) || binCount < 2) {
    throw new RangeError("binCount must be an integer of at least 2.");
  }
  const bins = Array.from({ length: binCount }, (_, index) => ({
    lower: index / binCount,
    upper: (index + 1) / binCount,
    probabilities: [] as number[],
    outcomes: [] as number[],
  }));
  for (const item of observations) {
    if (
      !Number.isFinite(item.probability) ||
      item.probability < 0 ||
      item.probability > 1 ||
      (item.outcome !== 0 && item.outcome !== 1)
    ) {
      continue;
    }
    const index = Math.min(binCount - 1, Math.floor(item.probability * binCount));
    bins[index].probabilities.push(item.probability);
    bins[index].outcomes.push(item.outcome);
  }
  return bins.map((bin) => ({
    lower: bin.lower,
    upper: bin.upper,
    count: bin.probabilities.length,
    meanPredictedProbability: bin.probabilities.length
      ? bin.probabilities.reduce((sum, value) => sum + value, 0) /
        bin.probabilities.length
      : null,
    observedPositiveRate: bin.outcomes.length
      ? bin.outcomes.reduce((sum, value) => sum + value, 0) / bin.outcomes.length
      : null,
  }));
}
