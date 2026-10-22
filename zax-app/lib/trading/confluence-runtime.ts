import {
  CONFLUENCE_CONTRACT_VERSION,
  evaluateConfluence,
  validateConfluenceConfig,
  type ChecklistStatus,
  type ConfluenceCondition,
  type ConfluenceEvaluation,
  type ConfluenceEvaluationInput,
  type ConfluenceSource,
  type ConfluenceStrategyContract,
  type ProviderStatus,
} from "./confluence-contract";
import { SECONDS } from "./engine";
import type { Strategy, Timeframe } from "./model";
import type { SetupAnalysis, SetupCandidate, SetupStep } from "./setup-model";
import { ORB_CRITICAL_STEP_IDS, orbEntryWindowOpen } from "./orb-model";
import {
  isSessionStrategyFamily,
  SESSION_CRITICAL_IDS,
  SESSION_NATIVE_IDS,
  SESSION_TRIGGER_IDS,
  sessionEntryWindowOpen,
  sessionStrategyConfigSchema,
  sessionVolumeAllowed,
} from "./session-strategy-model";

/**
 * The strategy-facing persistence shape.  It deliberately binds contract names
 * to exact setup-engine step ids rather than to factor prose or chart labels.
 */
export type ConfluenceRuleConfig = {
  contract: ConfluenceStrategyContract;
  binding: {
    triggerStepId: string;
    side?: "long" | "short";
    conditions: { conditionId: string; stepId: string }[];
  };
};

type StrategyWithConfluence = Strategy & { confluence?: ConfluenceRuleConfig };

type Timing = {
  evaluatedAt: number;
  decisionBarOpenAt: number;
  observedAt: number;
  lastClosedBarAt: number;
};

const NATIVE_SOURCE_PREFIX = "native-closed-ohlc:";
const TWO_TIMEFRAMES = 2;

/**
 * This is intentionally an allow-list, not a test of a step's display name.
 * Excluded IDs are context/clock/session/news/manual/order-flow/review metadata,
 * including htf-context and source-frame.  The listed steps are the exact
 * candidate-local closed-OHLC detectors currently emitted by setup-engine and
 * indicator-setups/github-setups.
 */
const NATIVE_OHLC_STEP_IDS: Readonly<
  Record<SetupCandidate["family"], readonly string[]>
> = {
  "core-sequence": [
    "liquidity-sweep",
    "displacement",
    "mss",
    "fvg",
    "order-block",
    "retest",
    "poi-valid",
  ],
  "silver-bullet": [
    "liquidity-sweep",
    "displacement",
    "mss",
    "fvg",
    "order-block",
    "retest",
    "poi-valid",
  ],
  "ob-retest": [
    "liquidity-sweep",
    "displacement",
    "mss",
    "fvg",
    "order-block",
    "retest",
    "poi-valid",
  ],
  "vwap-stdv": [
    "vwap-stdv-known-volume",
    "vwap-stdv-window",
    "vwap-stdv-prior-outside",
    "vwap-stdv-reentry",
    "vwap-stdv-stop-extreme",
    "vwap-stdv-target-vwap",
  ],
  stdv: [
    "liquidity-sweep",
    "displacement",
    "mss",
    "fvg",
    "order-block",
    "retest",
    "poi-valid",
    "stdv-targets",
  ],
  "trend-following": [
    "ema-uptrend",
    "ema-touch",
    "ema-bounce",
    "ema-stop",
    "atr-guide",
  ],
  "breakout-momentum": [
    "breakout-consolidation",
    "breakout-close",
    "breakout-rvol",
    "breakout-risk",
  ],
  "mean-reversion": ["bb-oversold", "bb-reentry", "rsi-cross", "mean-target"],
  scalping: [],
  "sma-crossover": ["sma-cross", "sma-rsi-confirm"],
  "macd-momentum": ["macd-cross", "macd-rsi-confirm"],
  "donchian-breakout": ["donchian-break"],
  orb: ["orb-breakout", "orb-midpoint-retest", "orb-continuation"],
  ...SESSION_NATIVE_IDS,
  custom: [],
};

const PREFERRED_TRIGGER_IDS: Readonly<
  Record<SetupCandidate["family"], readonly string[]>
> = {
  "core-sequence": ["retest", "mss", "displacement", "liquidity-sweep"],
  "silver-bullet": ["retest", "fvg", "mss", "liquidity-sweep"],
  "ob-retest": ["retest", "order-block", "mss", "liquidity-sweep"],
  "vwap-stdv": ["vwap-stdv-reentry"],
  stdv: ["mss", "displacement", "liquidity-sweep"],
  "trend-following": ["ema-bounce", "ema-touch", "ema-uptrend"],
  "breakout-momentum": [
    "breakout-close",
    "breakout-consolidation",
    "breakout-rvol",
  ],
  "mean-reversion": ["rsi-cross", "bb-reentry", "bb-oversold"],
  scalping: [],
  "sma-crossover": ["sma-cross", "sma-rsi-confirm"],
  "macd-momentum": ["macd-cross", "macd-rsi-confirm"],
  "donchian-breakout": ["donchian-break"],
  orb: ["orb-continuation"],
  ...SESSION_TRIGGER_IDS,
  custom: [],
};

function isNonemptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isEpochMs(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isFiniteSeconds(value: unknown): value is number {
  // setup-engine's SetupAnalysis.asOf is Unix seconds, not milliseconds.
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value < 10_000_000_000
  );
}

function timeframeMs(timeframe: Timeframe): number {
  return SECONDS[timeframe] * 1000;
}

function nativeSourceId(timeframe: Timeframe): string {
  return `${NATIVE_SOURCE_PREFIX}${timeframe}`;
}

function nativeSource(
  timeframe: Timeframe,
  sourceName: string,
): ConfluenceSource {
  return {
    id: nativeSourceId(timeframe),
    name: sourceName,
    required: true,
    // A native source may be evaluated for at most two explicit source bars.
    freshness: { maxAgeMs: timeframeMs(timeframe) * TWO_TIMEFRAMES },
  };
}

function copySource(source: ConfluenceSource): ConfluenceSource {
  return {
    id: source.id,
    name: source.name,
    required: source.required,
    freshness: { maxAgeMs: source.freshness.maxAgeMs },
  };
}

function sourceName(
  candidate: SetupCandidate,
  analysis?: SetupAnalysis,
): string {
  if (isNonemptyText(candidate.source)) return candidate.source;
  if (analysis && isNonemptyText(analysis.source)) return analysis.source;
  return "Closed OHLC source not identified";
}

function predicateFor(step: SetupStep): string {
  // Do not elevate arbitrary evidence prose into a condition.  The native
  // detector id is the stable, reviewable predicate reference.
  return `Native closed-OHLC setup step ${step.id}: ${step.name}`;
}

function conditionIdFor(stepId: string, used = new Set<string>()): string {
  const base = `native-${stepId}`;
  let id = base;
  let suffix = 2;
  while (used.has(id)) id = `${base}-${suffix++}`;
  return id;
}

/** Returns only actual, candidate-local, allow-listed engine steps. */
function nativeSteps(candidate: SetupCandidate): SetupStep[] {
  const allowed = new Set(NATIVE_OHLC_STEP_IDS[candidate.family] || []);
  const seen = new Set<string>();
  const output: SetupStep[] = [];
  for (const step of candidate.steps || []) {
    if (!allowed.has(step.id) || seen.has(step.id)) continue;
    seen.add(step.id);
    output.push({ ...step });
  }
  return output;
}

function preferredTrigger(
  candidate: SetupCandidate,
  steps: readonly SetupStep[],
): SetupStep | undefined {
  const byId = new Map(steps.map((step) => [step.id, step]));
  for (const id of PREFERRED_TRIGGER_IDS[candidate.family] || []) {
    const step = byId.get(id);
    if (step) return step;
  }
  return steps[0];
}

function unavailableTrigger(source: ConfluenceSource) {
  return {
    id: "native-step-unavailable",
    name: "No supported native closed-OHLC trigger",
    predicate: "No candidate-local native closed-OHLC step is available.",
    source,
  };
}

/**
 * Creates an unapproved review draft.  The caller/editor must explicitly choose
 * and approve it; no factor prose, sessions, clock values, news, HTF label, or
 * market quote can enter this template.
 */
export function draftConfluence(
  strategy: Strategy,
  candidate: SetupCandidate,
  timeframe: Timeframe,
): ConfluenceRuleConfig {
  const source = nativeSource(timeframe, sourceName(candidate));
  const steps = nativeSteps(candidate);
  const trigger = preferredTrigger(candidate, steps);
  const conditionSteps = trigger
    ? steps.filter((step) => step.id !== trigger.id)
    : [];
  const weight = conditionSteps.length ? 100 / conditionSteps.length : 0;
  const usedConditionIds = new Set<string>();
  const conditions: ConfluenceCondition[] = conditionSteps.map((step) => {
    const id = conditionIdFor(step.id, usedConditionIds);
    usedConditionIds.add(id);
    return {
      id,
      name: step.name,
      predicate: predicateFor(step),
      source: copySource(source),
      enabled: true,
      weight,
    };
  });

  return {
    contract: {
      contractVersion: CONFLUENCE_CONTRACT_VERSION,
      strategyId: strategy.id,
      strategyVersion: strategy.version,
      configVersion: 1,
      approval: { status: "draft", approvedAt: null, approvedBy: null },
      trigger: trigger
        ? {
            id: trigger.id,
            name: trigger.name,
            predicate: predicateFor(trigger),
            source: copySource(source),
          }
        : unavailableTrigger(source),
      conditions,
      threshold: 70,
    },
    binding: {
      side: candidate.side,
      triggerStepId: trigger?.id || "native-step-unavailable",
      conditions: conditions.map((condition, index) => ({
        conditionId: condition.id,
        stepId: conditionSteps[index].id,
      })),
    },
  };
}

function mapStepStatus(
  status: SetupStep["status"] | undefined,
): ChecklistStatus {
  // waiting and failed are determinate negative observations. Unknown is not
  // converted to a failure because the engine did not establish the fact.
  if (status === "met") return "met";
  if (status === "waiting" || status === "failed") return "not-met";
  return "pending";
}

function invalidTimingInput(): ConfluenceEvaluationInput {
  return {
    evaluatedAt: 0,
    decisionBarOpenAt: 0,
    trigger: {
      sourceId: "invalid-native-source",
      status: "pending",
      providerStatus: "pending",
      observedAt: 0,
      lastClosedBarAt: 0,
      bar: "unknown",
    },
    conditions: [],
  };
}

function analysisTiming(
  analysis: SetupAnalysis,
  nowMs: number,
): { timing?: Timing; issues: string[] } {
  const issues: string[] = [];
  if (!isEpochMs(nowMs))
    issues.push("Evaluation time must be Unix epoch milliseconds.");
  if (!isFiniteSeconds(analysis.asOf)) {
    issues.push("Analysis asOf is missing, invalid, or is not Unix seconds.");
    return { issues };
  }
  const asOfMs = Math.floor(analysis.asOf * 1000);
  if (!isEpochMs(asOfMs)) {
    issues.push(
      "Analysis asOf could not be converted from Unix seconds to milliseconds.",
    );
    return { issues };
  }
  if (isEpochMs(nowMs) && asOfMs > nowMs) {
    issues.push("Analysis asOf is in the future of this decision.");
  }
  if (!isNonemptyText(analysis.source)) {
    issues.push("Analysis has no named closed-OHLC source.");
  }
  const bars = analysis.candles;
  if (!Array.isArray(bars) || bars.length === 0) {
    issues.push(
      "Analysis has no completed OHLC candles for a native t-1 observation.",
    );
    return { issues };
  }
  const seconds = SECONDS[analysis.timeframe];
  if (!Number.isFinite(seconds)) {
    issues.push(
      "Analysis timeframe is unknown; no source freshness interval can be established.",
    );
    return { issues };
  }
  let previous = -Infinity;
  for (const bar of bars) {
    if (!Number.isFinite(bar.time) || bar.time <= 0 || bar.time <= previous) {
      issues.push(
        "Analysis candles must have unique, increasing Unix-second timestamps.",
      );
      break;
    }
    previous = bar.time;
    if (bar.time + seconds > analysis.asOf + 0.000001) {
      issues.push(
        "Analysis includes a candle that was not closed at analysis asOf.",
      );
      break;
    }
  }
  const last = bars.at(-1);
  if (!last || !Number.isFinite(last.time)) return { issues };
  const lastClosedBarAt = Math.floor((last.time + seconds) * 1000);
  const decisionBarOpenAt = lastClosedBarAt;
  if (asOfMs < lastClosedBarAt) {
    issues.push(
      "Analysis asOf precedes its most recent claimed closed candle.",
    );
  }
  if (
    isEpochMs(nowMs) &&
    nowMs >= decisionBarOpenAt + timeframeMs(analysis.timeframe)
  )
    issues.push(
      "The decision bar has rolled over; refresh current closed-bar evidence before entry.",
    );
  // Once the next bar would itself have closed, the analysis cutoff is too late
  // to label this stale snapshot as an observation for that decision bar.
  if (asOfMs > decisionBarOpenAt + timeframeMs(analysis.timeframe)) {
    issues.push(
      "Analysis asOf is after the prospective decision bar; a t-1 claim is no longer point-in-time safe.",
    );
  }
  return {
    timing: {
      evaluatedAt: isEpochMs(nowMs) ? nowMs : 0,
      decisionBarOpenAt,
      observedAt: asOfMs,
      lastClosedBarAt,
    },
    issues,
  };
}

function canonicalCandidate(
  analysis: SetupAnalysis,
  candidate: SetupCandidate,
): { candidate?: SetupCandidate; issues: string[] } {
  const matches = (analysis.candidates || []).filter(
    (item) =>
      item.id === candidate.id &&
      item.strategyId === candidate.strategyId &&
      item.strategyVersion === candidate.strategyVersion,
  );
  if (matches.length !== 1) {
    return {
      issues: [
        matches.length
          ? "Candidate identity is ambiguous in the supplied analysis."
          : "Candidate is not present in the supplied analysis; cross-analysis evidence is not accepted.",
      ],
    };
  }
  return { candidate: matches[0], issues: [] };
}

function bindingIssues(
  config: ConfluenceRuleConfig,
  analysis: SetupAnalysis,
  candidate: SetupCandidate,
): string[] {
  const issues: string[] = [];
  const contract = config.contract;
  if (contract.strategyId !== candidate.strategyId) {
    issues.push(
      "Confluence strategy binding does not match the candidate strategy.",
    );
  }
  if (contract.strategyVersion !== candidate.strategyVersion) {
    issues.push(
      "Confluence strategy version does not match the candidate version.",
    );
  }
  if (config.binding.side && config.binding.side !== candidate.side)
    issues.push("Configured direction does not match this candidate.");
  const allowedSteps = nativeSteps(candidate);
  const allowedById = new Map(allowedSteps.map((step) => [step.id, step]));
  if (!allowedSteps.length) {
    issues.push(
      "Candidate has no supported native closed-OHLC steps; manual, clock, HTF, news, and prose steps remain pending.",
    );
  }
  if (!isNonemptyText(config.binding?.triggerStepId)) {
    issues.push("A native trigger step must be explicitly selected.");
  } else if (config.binding.triggerStepId !== contract.trigger.id) {
    issues.push("Trigger binding does not match the contract trigger id.");
  } else if (!allowedById.has(config.binding.triggerStepId)) {
    issues.push(
      "Configured trigger is not a supported candidate-local native closed-OHLC step.",
    );
  }

  const contractConditionIds = new Set<string>();
  for (const condition of contract.conditions || []) {
    if (contractConditionIds.has(condition.id)) {
      issues.push(`Contract has duplicate condition id ${condition.id}.`);
    }
    contractConditionIds.add(condition.id);
  }
  const seenConditionIds = new Set<string>();
  const seenStepIds = new Set<string>();
  for (const item of config.binding?.conditions || []) {
    if (!isNonemptyText(item.conditionId) || !isNonemptyText(item.stepId)) {
      issues.push(
        "Each condition binding needs a conditionId and native stepId.",
      );
      continue;
    }
    if (seenConditionIds.has(item.conditionId)) {
      issues.push(`Duplicate binding for condition ${item.conditionId}.`);
    }
    if (seenStepIds.has(item.stepId)) {
      issues.push(`Duplicate binding for native step ${item.stepId}.`);
    }
    seenConditionIds.add(item.conditionId);
    seenStepIds.add(item.stepId);
    if (!contractConditionIds.has(item.conditionId)) {
      issues.push(
        `Binding references missing contract condition ${item.conditionId}.`,
      );
    }
    if (item.stepId === config.binding.triggerStepId) {
      issues.push(
        "A condition must bind a different native step than the trigger.",
      );
    }
    if (!allowedById.has(item.stepId)) {
      issues.push(
        `Condition ${item.conditionId} is not bound to a supported candidate-local native closed-OHLC step.`,
      );
    }
  }
  for (const conditionId of contractConditionIds) {
    if (!seenConditionIds.has(conditionId)) {
      issues.push(`Missing binding for contract condition ${conditionId}.`);
    }
  }
  for (const source of [
    contract.trigger.source,
    ...contract.conditions.map((item) => item.source),
  ]) {
    if (source.id !== nativeSourceId(analysis.timeframe)) {
      issues.push(
        "Configured source is not the selected native closed-OHLC source for this analysis timeframe.",
      );
      break;
    }
    if (
      source.freshness.maxAgeMs !==
      timeframeMs(analysis.timeframe) * TWO_TIMEFRAMES
    ) {
      issues.push(
        "Configured native source freshness must equal two explicit analysis timeframes.",
      );
      break;
    }
  }
  return [...new Set(issues)];
}

function appendBlocked(
  evaluation: ConfluenceEvaluation,
  reasons: readonly string[],
): ConfluenceEvaluation {
  if (!reasons.length) return evaluation;
  const blockedReasons = [
    ...new Set([...evaluation.blockedReasons, ...reasons]),
  ];
  return {
    ...evaluation,
    strategyEntryEligible: false,
    blockedReasons,
    snapshot: {
      ...evaluation.snapshot,
      strategyEntryEligible: false,
    },
  };
}

function pendingObservation(
  sourceId: string,
  timing: Timing | undefined,
  status: ChecklistStatus,
  providerStatus: ProviderStatus,
) {
  return {
    sourceId,
    status,
    providerStatus,
    observedAt: timing?.observedAt ?? 0,
    lastClosedBarAt: timing?.lastClosedBarAt ?? 0,
    // Do not label unavailable/invalid evidence as a closed t-1 source bar.
    bar:
      timing && providerStatus === "ready"
        ? ("t-1" as const)
        : ("unknown" as const),
  };
}

/**
 * Evaluates only an actual candidate found in the supplied SetupAnalysis.  It
 * adapts native SetupStep states into the platform-neutral contract, but does
 * not submit orders, infer probabilities, alter a config, or make ready:false
 * itself determinative.
 */
export function evaluateSetupConfluence(
  config: ConfluenceRuleConfig,
  analysis: SetupAnalysis,
  candidate: SetupCandidate,
  nowMs: number,
): ConfluenceEvaluation {
  const contract = config?.contract;
  if (!contract || !analysis || !candidate) {
    // The contract evaluator supplies the canonical invalid-config snapshot.
    return appendBlocked(
      evaluateConfluence(
        (contract || {}) as ConfluenceStrategyContract,
        invalidTimingInput(),
      ),
      [
        "Confluence evaluation requires a configuration, analysis, and candidate.",
      ],
    );
  }

  const canonical = canonicalCandidate(analysis, candidate);
  const timingState = analysisTiming(analysis, nowMs);
  const resolvedCandidate = canonical.candidate;
  const issues = [...canonical.issues, ...timingState.issues];

  const configValidation = validateConfluenceConfig(contract);
  if (!configValidation.valid) {
    return appendBlocked(
      evaluateConfluence(contract, invalidTimingInput()),
      issues,
    );
  }
  if (resolvedCandidate)
    issues.push(...bindingIssues(config, analysis, resolvedCandidate));

  if (resolvedCandidate?.family === "orb") {
    const steps = new Map(
      resolvedCandidate.steps.map((item) => [item.id, item]),
    );
    for (const id of ORB_CRITICAL_STEP_IDS) {
      const item = steps.get(id);
      if (!item || item.status !== "met")
        issues.push(
          `ORB mandatory guard ${id}: ${item?.evidence || "missing source/clock/execution evidence"}`,
        );
    }
    const context = analysis.orbContexts?.find(
      (item) => item.strategyId === resolvedCandidate.strategyId,
    );
    if (!context || !orbEntryWindowOpen(nowMs / 1000, context.timezone))
      issues.push(
        "ORB current entry clock/context is unavailable or outside09:00–11:00; cached steps cannot bypass the cutoff.",
      );
    if (analysis.timeframe !== "1m")
      issues.push("ORB entry requires the approved1m execution frame.");
    if (context?.config?.marketMode === "nas100-cfd") {
      const cfg = context.config;
      const metadata = context.instrumentMetadata;
      if (
        !cfg.confirmed ||
        cfg.instrumentMarket !== analysis.market ||
        !metadata ||
        metadata.market !== analysis.market ||
        !metadata.source?.trim() ||
        (metadata.executionSource ?? metadata.source) !== analysis.source ||
        !Number.isFinite(metadata.priceTick) ||
        metadata.priceTick <= 0 ||
        cfg.priceTick !== metadata.priceTick
      )
        issues.push(
          "NAS100 ORB requires confirmed same-market broker tick metadata; cached ready labels cannot bypass missing, changed or mismatched instrument settings.",
        );
    }
  }
  if (resolvedCandidate && isSessionStrategyFamily(resolvedCandidate.family)) {
    const family = resolvedCandidate.family;
    const steps = new Map(
      resolvedCandidate.steps.map((item) => [item.id, item]),
    );
    for (const id of SESSION_CRITICAL_IDS[family]) {
      const item = steps.get(id);
      if (!item || item.status !== "met")
        issues.push(
          `Session mandatory guard ${id}: ${item?.evidence || "missing current source/config/clock/risk evidence"}`,
        );
    }
    const context = analysis.sessionContexts?.find(
      (item) =>
        item.strategyId === resolvedCandidate.strategyId &&
        item.family === family,
    );
    const parsed = sessionStrategyConfigSchema.safeParse(context?.config);
    if (
      !context ||
      !parsed.success ||
      !parsed.data.confirmed ||
      !sessionEntryWindowOpen(parsed.data, nowMs / 1000)
    )
      issues.push(
        "The current approved session execution clock/config is unavailable or outside its window.",
      );
    if (parsed.success && analysis.timeframe !== parsed.data.executionTimeframe)
      issues.push(
        "The current chart is not the approved session execution timeframe.",
      );
    if (
      parsed.success &&
      parsed.data.instrumentMarket &&
      parsed.data.instrumentMarket !== analysis.market
    )
      issues.push(
        "Detected settings are bound to another market; prepare this instrument instead of reusing its tick.",
      );
    if (
      parsed.success &&
      family !== "london-breakout" &&
      !sessionVolumeAllowed(parsed.data, context?.volumeBasis)
    )
      issues.push(
        "The selected volume provenance policy is unavailable. Broker-reported proxy must be explicitly chosen; unknown volume cannot qualify.",
      );
    if (family === "pdc-continuation") {
      const pair = context?.quoteEvidence;
      const currentClosedAt =
        (analysis.candles.at(-1)?.time ?? Number.POSITIVE_INFINITY) +
        SECONDS[analysis.timeframe];
      if (!pair || pair.observedAt < currentClosedAt)
        issues.push(
          "This cached pivot observation occurred before the current completed volume bar; later volume cannot be certified as t−1 evidence for that old crossing.",
        );
      if (
        !pair?.previous ||
        pair.method !== "owner-persisted-rest-observations" ||
        pair.current.symbol !== analysis.market ||
        pair.previous.symbol !== analysis.market ||
        pair.current.source !== pair.previous.source ||
        pair.current.timestamp <= pair.previous.timestamp ||
        pair.current.timestamp - pair.previous.timestamp > 90 ||
        pair.current.status !== "live" ||
        pair.previous.status !== "live" ||
        pair.current.timestamp > nowMs / 1000 ||
        nowMs / 1000 - pair.current.timestamp > 30 ||
        pair.observedAt > nowMs / 1000 ||
        nowMs / 1000 - pair.observedAt > 30
      )
        issues.push(
          "The separately timestamped observed-quote cross is unavailable/stale/nonmonotonic; it cannot be labelled closed OHLC or authorized by a volume score alone.",
        );
      if (
        !context?.pdc ||
        !Number.isFinite(context.pdc.price) ||
        context.pdc.price <= 0 ||
        !pair?.previous ||
        ![pair.previous.price, pair.current.price].every(
          (price) => Number.isFinite(price) && price > 0,
        ) ||
        !(resolvedCandidate.side === "long"
          ? pair.previous.price <= context.pdc.price &&
            pair.current.price > context.pdc.price
          : pair.previous.price >= context.pdc.price &&
            pair.current.price < context.pdc.price)
      )
        issues.push(
          "The actual observed prices do not cross the declared PDC in this bound direction.",
        );
    }
  }

  const timing = timingState.timing;
  const sourceReady =
    issues.length === 0 && Boolean(timing && resolvedCandidate);
  const providerStatus: ProviderStatus = sourceReady ? "ready" : "pending";
  const triggerStep = resolvedCandidate
    ? new Map(
        nativeSteps(resolvedCandidate).map((step) => [step.id, step]),
      ).get(config.binding?.triggerStepId || "")
    : undefined;
  const boundSteps = resolvedCandidate
    ? new Map(nativeSteps(resolvedCandidate).map((step) => [step.id, step]))
    : new Map<string, SetupStep>();
  const conditionBindings = Array.isArray(config.binding?.conditions)
    ? config.binding.conditions
    : [];
  const sourceId = contract.trigger.source.id;
  const input: ConfluenceEvaluationInput = {
    evaluatedAt: timing?.evaluatedAt ?? 0,
    decisionBarOpenAt: timing?.decisionBarOpenAt ?? 0,
    trigger: pendingObservation(
      sourceId,
      timing,
      sourceReady ? mapStepStatus(triggerStep?.status) : "pending",
      providerStatus,
    ),
    conditions: contract.conditions.map((condition) => {
      const binding = conditionBindings.find(
        (item) => item.conditionId === condition.id,
      );
      const step = binding ? boundSteps.get(binding.stepId) : undefined;
      return {
        conditionId: condition.id,
        ...pendingObservation(
          condition.source.id,
          timing,
          sourceReady ? mapStepStatus(step?.status) : "pending",
          providerStatus,
        ),
      };
    }),
  };

  return appendBlocked(evaluateConfluence(contract, input), issues);
}

function missingCandidateEvaluation(
  config: ConfluenceRuleConfig,
  analysis: SetupAnalysis,
  nowMs: number,
  reason: string,
): ConfluenceEvaluation {
  const timing = analysisTiming(analysis, nowMs).timing;
  const contract = config.contract;
  const input: ConfluenceEvaluationInput = {
    evaluatedAt: timing?.evaluatedAt ?? 0,
    decisionBarOpenAt: timing?.decisionBarOpenAt ?? 0,
    trigger: pendingObservation(
      contract.trigger.source.id,
      timing,
      "pending",
      "pending",
    ),
    conditions: contract.conditions.map((condition) => ({
      conditionId: condition.id,
      ...pendingObservation(condition.source.id, timing, "pending", "pending"),
    })),
  };
  return appendBlocked(evaluateConfluence(contract, input), [reason]);
}

/**
 * Reads optional parent-owned strategy.confluence without requiring the shared
 * Strategy model to be edited by this module.  A config is evaluated only
 * against a current same-id/same-version candidate.  Multiple same-strategy
 * candidates are deliberately left pending unless a stable directional binding
 * is configured; no long/short evidence is mixed silently.
 */
export function confluenceForAnalysis(
  strategies: Strategy[],
  analysis: SetupAnalysis,
  nowMs: number,
): Record<string, ConfluenceEvaluation> {
  const evaluations: Record<string, ConfluenceEvaluation> = {};
  for (const strategy of strategies || []) {
    const config = (strategy as StrategyWithConfluence).confluence;
    if (!config) continue;
    if (
      config.contract.strategyId !== strategy.id ||
      config.contract.strategyVersion !== strategy.version
    ) {
      evaluations[strategy.id] = missingCandidateEvaluation(
        config,
        analysis,
        nowMs,
        "Confluence configuration does not match the current strategy id and version.",
      );
      continue;
    }
    const candidates = (analysis.candidates || []).filter(
      (candidate) =>
        candidate.strategyId === strategy.id &&
        candidate.strategyVersion === strategy.version &&
        (!config.binding.side || candidate.side === config.binding.side),
    );
    if (candidates.length !== 1) {
      evaluations[strategy.id] = missingCandidateEvaluation(
        config,
        analysis,
        nowMs,
        candidates.length
          ? "Multiple candidate sides match this strategy; configuration lacks a candidate-specific binding."
          : "No current same-version candidate is available for this configured strategy.",
      );
      continue;
    }
    evaluations[strategy.id] = evaluateSetupConfluence(
      config,
      analysis,
      candidates[0],
      nowMs,
    );
  }
  return evaluations;
}
