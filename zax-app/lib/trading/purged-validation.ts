export type ValidationMode = "walk-forward" | "cpcv";

export type LabelInterval = {
  /** Inclusive row position at which the labelled outcome begins. */
  start: number;
  /** Inclusive row position at which the labelled outcome ends. */
  end: number;
};

export type DirectionClassCounts = {
  negative: number;
  positive: number;
  total: number;
};

export type FoldProvenance = {
  id: string;
  mode: ValidationMode;
  /** Consecutive temporal groups selected as test groups. */
  testGroupIds: number[];
  /** Exact local-row indices used to fit the fold model or its calibrator. */
  trainingIndices: number[];
  /** Exact capped subset used to fit the fold model, populated by the caller. */
  modelTrainingIndices?: number[];
  modelTrainingClassCounts?: DirectionClassCounts;
  /** Chronologically later train-only partition used to fit the calibrator, if viable. */
  calibrationIndices?: number[];
  calibrationClassCounts?: DirectionClassCounts;
  /** Exact local-row indices scored only after fitting/calibration. */
  testIndices: number[];
  /** Candidate training indices rejected because their label intervals intersect a test label. */
  purgedIndices: number[];
  /** Candidate training indices rejected by the percentage embargo after a tested block. */
  embargoedIndices: number[];
  trainingClassCounts: DirectionClassCounts;
  testClassCounts: DirectionClassCounts;
};

export type ValidationPlan = {
  mode: ValidationMode;
  /** Label intervals indexed by every fold in this plan. */
  events: LabelInterval[];
  groupCount: number;
  testGroupsPerFold: number;
  embargoPct: number;
  embargoRows: number;
  /** Number of independent model-fitting jobs in this bounded plan. */
  fittingJobs: number;
  folds: FoldProvenance[];
};

export type BuildValidationPlanOptions = {
  mode: ValidationMode;
  /** Must be within [0, 1]. It is converted to ceil(pct * nRows). */
  embargoPct: number;
  /** Bound for CPCV fitting jobs. CPCV uses all combinations within this bound. */
  maxFolds: number;
  /** Class direction, aligned with events. */
  labels: readonly (-1 | 1)[];
};

const MAX_CPCV_GROUPS = 6;
const MAX_CPCV_TEST_GROUPS = 2;
const MAX_CPCV_FITTING_JOBS = 15;
const WALK_FORWARD_FOLDS = 3;

function countClasses(
  indices: readonly number[],
  labels: readonly (-1 | 1)[],
): DirectionClassCounts {
  let negative = 0;
  let positive = 0;
  for (const index of indices) {
    if (labels[index] === 1) positive += 1;
    else if (labels[index] === -1) negative += 1;
  }
  return { negative, positive, total: negative + positive };
}

function intervalsOverlap(left: LabelInterval, right: LabelInterval): boolean {
  return left.start <= right.end && right.start <= left.end;
}

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  const selected = Math.min(k, n - k);
  let value = 1;
  for (let index = 1; index <= selected; index += 1) {
    value = (value * (n - selected + index)) / index;
  }
  return Math.round(value);
}

function combinations(values: readonly number[], size: number): number[][] {
  const selected: number[][] = [];
  const current: number[] = [];
  const visit = (start: number) => {
    if (current.length === size) {
      selected.push([...current]);
      return;
    }
    for (
      let index = start;
      index <= values.length - (size - current.length);
      index += 1
    ) {
      current.push(values[index]);
      visit(index + 1);
      current.pop();
    }
  };
  visit(0);
  return selected;
}

function consecutiveGroups(length: number, groups: number): number[][] {
  return Array.from({ length: groups }, (_, group) => {
    const start = Math.floor((group * length) / groups);
    const end = Math.floor(((group + 1) * length) / groups);
    return Array.from({ length: end - start }, (_, offset) => start + offset);
  });
}

function embargoIndices(
  testIndices: readonly number[],
  rowCount: number,
  embargoRows: number,
): Set<number> {
  const embargoed = new Set<number>();
  if (!embargoRows || !testIndices.length) return embargoed;
  const sorted = [...testIndices].sort((left, right) => left - right);
  let blockEnd = sorted[0];
  for (let position = 1; position <= sorted.length; position += 1) {
    const index = sorted[position];
    if (index === blockEnd + 1) {
      blockEnd = index;
      continue;
    }
    for (
      let embargo = blockEnd + 1;
      embargo <= Math.min(rowCount - 1, blockEnd + embargoRows);
      embargo += 1
    ) {
      embargoed.add(embargo);
    }
    blockEnd = index;
  }
  return embargoed;
}

function purgedFold(
  id: string,
  mode: ValidationMode,
  testGroupIds: number[],
  candidateTraining: readonly number[],
  testIndices: readonly number[],
  events: readonly LabelInterval[],
  labels: readonly (-1 | 1)[],
  embargoRows: number,
): FoldProvenance {
  const testSet = new Set(testIndices);
  const embargoed = embargoIndices(testIndices, events.length, embargoRows);
  const purgedIndices: number[] = [];
  const embargoedIndices: number[] = [];
  const trainingIndices: number[] = [];

  for (const index of candidateTraining) {
    if (testSet.has(index)) continue;
    const isEmbargoed = embargoed.has(index);
    const hasOverlappingLabel = testIndices.some((testIndex) =>
      intervalsOverlap(events[index], events[testIndex]),
    );
    // Lists are intentionally not exclusive: a row can violate both safeguards.
    if (isEmbargoed) embargoedIndices.push(index);
    if (hasOverlappingLabel) purgedIndices.push(index);
    if (isEmbargoed || hasOverlappingLabel) continue;
    trainingIndices.push(index);
  }

  return {
    id,
    mode,
    testGroupIds,
    trainingIndices,
    testIndices: [...testIndices],
    purgedIndices,
    embargoedIndices,
    trainingClassCounts: countClasses(trainingIndices, labels),
    testClassCounts: countClasses(testIndices, labels),
  };
}

function buildWalkForwardPlan(
  events: readonly LabelInterval[],
  options: BuildValidationPlanOptions,
  embargoRows: number,
): ValidationPlan {
  const firstTest = Math.floor(events.length * 0.55);
  const availableForTests = events.length - firstTest;
  const folds: FoldProvenance[] = [];
  for (let fold = 0; fold < WALK_FORWARD_FOLDS; fold += 1) {
    const start = firstTest + Math.floor((availableForTests * fold) / WALK_FORWARD_FOLDS);
    const end = firstTest + Math.floor((availableForTests * (fold + 1)) / WALK_FORWARD_FOLDS);
    const testIndices = Array.from({ length: Math.max(0, end - start) }, (_, offset) => start + offset);
    if (!testIndices.length) continue;
    const candidateTraining = Array.from({ length: start }, (_, index) => index);
    folds.push(
      purgedFold(
        `wf-${fold + 1}`,
        "walk-forward",
        [fold],
        candidateTraining,
        testIndices,
        events,
        options.labels,
        embargoRows,
      ),
    );
  }
  return {
    mode: "walk-forward",
    events: events.map((event) => ({ ...event })),
    groupCount: WALK_FORWARD_FOLDS,
    testGroupsPerFold: 1,
    embargoPct: options.embargoPct,
    embargoRows,
    fittingJobs: folds.length,
    folds,
  };
}

function cpcvGroupCount(maxFolds: number): number {
  for (let groups = MAX_CPCV_GROUPS; groups >= 3; groups -= 1) {
    if (choose(groups, MAX_CPCV_TEST_GROUPS) <= maxFolds) return groups;
  }
  return 0;
}

function buildCpcvPlan(
  events: readonly LabelInterval[],
  options: BuildValidationPlanOptions,
  embargoRows: number,
): ValidationPlan {
  const groupCount = cpcvGroupCount(options.maxFolds);
  if (!groupCount) {
    throw new RangeError("CPCV maxFolds must allow at least all 3 combinations from 3 groups / 2 test groups.");
  }
  const groups = consecutiveGroups(events.length, groupCount);
  const groupIds = Array.from({ length: groupCount }, (_, index) => index);
  const testGroupSets = combinations(groupIds, MAX_CPCV_TEST_GROUPS);
  const folds = testGroupSets.map((testGroupIds, index) => {
    const testIndices = testGroupIds.flatMap((group) => groups[group]);
    const testSet = new Set(testIndices);
    const candidateTraining = Array.from({ length: events.length }, (_, row) => row).filter(
      (row) => !testSet.has(row),
    );
    return purgedFold(
      `cpcv-${index + 1}`,
      "cpcv",
      testGroupIds,
      candidateTraining,
      testIndices,
      events,
      options.labels,
      embargoRows,
    );
  });
  return {
    mode: "cpcv",
    events: events.map((event) => ({ ...event })),
    groupCount,
    testGroupsPerFold: MAX_CPCV_TEST_GROUPS,
    embargoPct: options.embargoPct,
    embargoRows,
    fittingJobs: folds.length,
    folds,
  };
}

/**
 * Builds provenance-rich folds without shuffling. Purging is interval based and embargo is
 * applied after each contiguous tested block. This is an independent implementation of the
 * public methodology, deliberately constrained to avoid combinatorial CPU growth.
 */
export function buildPurgedValidationPlan(
  events: readonly LabelInterval[],
  options: BuildValidationPlanOptions,
): ValidationPlan {
  if (!events.length || options.labels.length !== events.length) {
    throw new RangeError("events and labels must be non-empty and aligned.");
  }
  if (events.some((event) => !Number.isInteger(event.start) || !Number.isInteger(event.end) || event.start > event.end)) {
    throw new RangeError("Each label interval needs finite ordered integer bounds.");
  }
  if (options.labels.some((label) => label !== -1 && label !== 1)) {
    throw new RangeError("labels must be -1 or 1.");
  }
  if (!Number.isFinite(options.embargoPct) || options.embargoPct < 0 || options.embargoPct > 1) {
    throw new RangeError("embargoPct must be a finite fraction from 0 to 1.");
  }
  if (!Number.isInteger(options.maxFolds) || options.maxFolds < 3 || options.maxFolds > MAX_CPCV_FITTING_JOBS) {
    throw new RangeError(`maxFolds must be an integer from 3 to ${MAX_CPCV_FITTING_JOBS}.`);
  }
  const embargoRows = Math.ceil(options.embargoPct * events.length);
  return options.mode === "walk-forward"
    ? buildWalkForwardPlan(events, options, embargoRows)
    : buildCpcvPlan(events, options, embargoRows);
}

/**
 * Creates a separately auditable latest holdout split. The supplied test indices are never
 * candidates for training, calibration, scaling, or threshold fitting.
 */
export function buildPurgedHoldoutFold(
  events: readonly LabelInterval[],
  labels: readonly (-1 | 1)[],
  testIndices: readonly number[],
  embargoPct: number,
): FoldProvenance {
  if (!events.length || labels.length !== events.length || !testIndices.length) {
    throw new RangeError("events, labels, and non-empty holdout indices must be aligned.");
  }
  if (!Number.isFinite(embargoPct) || embargoPct < 0 || embargoPct > 1) {
    throw new RangeError("embargoPct must be a finite fraction from 0 to 1.");
  }
  const uniqueTests = [...new Set(testIndices)].sort((left, right) => left - right);
  if (uniqueTests.some((index) => !Number.isInteger(index) || index < 0 || index >= events.length)) {
    throw new RangeError("holdout indices must identify aligned event rows.");
  }
  const testSet = new Set(uniqueTests);
  const candidates = Array.from({ length: events.length }, (_, index) => index).filter(
    (index) => !testSet.has(index),
  );
  return purgedFold(
    "latest-holdout",
    "walk-forward",
    [0],
    candidates,
    uniqueTests,
    events,
    labels,
    Math.ceil(embargoPct * events.length),
  );
}

export const PURGED_VALIDATION_LIMITS = {
  maxCpcvGroups: MAX_CPCV_GROUPS,
  cpcvTestGroups: MAX_CPCV_TEST_GROUPS,
  maxCpcvFittingJobs: MAX_CPCV_FITTING_JOBS,
  maxEmbargoPct: 1,
} as const;
