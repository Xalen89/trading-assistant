/**
 * Pure, platform-neutral confluence contract.
 *
 * All timestamps in this file are Unix epoch **milliseconds**.  This contract
 * evaluates a decision only; it neither submits orders nor reads/writes data.
 */

export const CONFLUENCE_CONTRACT_VERSION = 1 as const;
export const TIMESTAMP_UNIT = "unix-epoch-milliseconds" as const;

export type EpochMilliseconds = number;
export type TimestampUnit = typeof TIMESTAMP_UNIT;
export type ChecklistStatus = "met" | "not-met" | "pending";
export type ProviderStatus =
  | "ready"
  | "pending"
  | "stale"
  | "disconnected"
  | "future";
export type ObservedBar = "t-1" | "t" | "future" | "unknown";
export type ApprovalStatus = "draft" | "approved" | "retired";

/** A source must declare its own freshness limit; the evaluator never chooses one. */
export interface ConfluenceSource {
  id: string;
  name: string;
  required: boolean;
  freshness: {
    /** Maximum permitted age of both observation and closed bar, in milliseconds. */
    maxAgeMs: number;
  };
}

/** A named, falsifiable trigger. It is evaluated separately from confluence. */
export interface NamedTrigger {
  id: string;
  name: string;
  /** A concrete, reviewable test; free-form narrative is not a substitute for this field. */
  predicate: string;
  source: ConfluenceSource;
}

/** A named, falsifiable condition whose user-configured weight is never rewritten here. */
export interface ConfluenceCondition {
  id: string;
  name: string;
  predicate: string;
  source: ConfluenceSource;
  enabled: boolean;
  weight: number;
}

export interface ApprovalMetadata {
  status: ApprovalStatus;
  approvedAt: EpochMilliseconds | null;
  approvedBy: string | null;
}

/**
 * Versioned, serializable strategy contract. Enabled condition weights must
 * already sum to 100; this module intentionally does not normalize them.
 */
export interface ConfluenceStrategyContract {
  contractVersion: typeof CONFLUENCE_CONTRACT_VERSION;
  strategyId: string;
  strategyVersion: number;
  configVersion: number;
  approval: ApprovalMetadata;
  trigger: NamedTrigger;
  conditions: readonly ConfluenceCondition[];
  /** Minimum deterministic confluence points required, inclusive, on the 0..100 scale. */
  threshold: number;
}

/**
 * Evidence for a trigger or condition. `bar: "t-1"` means the evidence is
 * based only on the bar that closed immediately before the decision bar.
 */
export interface ClosedBarObservation {
  sourceId: string;
  status: ChecklistStatus;
  providerStatus: ProviderStatus;
  /** When the source observation was available, in Unix epoch milliseconds. */
  observedAt: EpochMilliseconds;
  /** Close instant of the source's most recent closed bar, in Unix epoch milliseconds. */
  lastClosedBarAt: EpochMilliseconds;
  bar: ObservedBar;
}

export interface TriggerObservation extends ClosedBarObservation {}

export interface ConditionObservation extends ClosedBarObservation {
  conditionId: string;
}

export interface ConfluenceEvaluationInput {
  /** Moment this contract is evaluated, in Unix epoch milliseconds. */
  evaluatedAt: EpochMilliseconds;
  /** Open instant of the prospective decision bar t, in Unix epoch milliseconds. */
  decisionBarOpenAt: EpochMilliseconds;
  trigger: TriggerObservation;
  conditions: readonly ConditionObservation[];
}

export interface ConfigurationValidation {
  valid: boolean;
  issues: readonly string[];
}

export interface VersionSnapshot {
  contractVersion: typeof CONFLUENCE_CONTRACT_VERSION;
  strategyId: string;
  strategyVersion: number;
  configVersion: number;
}

export interface ObservationSnapshot {
  sourceId: string | null;
  providerStatus: ProviderStatus | null;
  observedAt: EpochMilliseconds | null;
  lastClosedBarAt: EpochMilliseconds | null;
  bar: ObservedBar | null;
}

export interface TriggerChecklistItem extends ObservationSnapshot {
  triggerId: string;
  name: string;
  predicate: string;
  source: ConfluenceSource;
  status: ChecklistStatus;
  reasons: readonly string[];
}

export interface ConfluenceChecklistItem extends ObservationSnapshot {
  conditionId: string;
  name: string;
  predicate: string;
  source: ConfluenceSource;
  enabled: boolean;
  weight: number;
  status: ChecklistStatus;
  reasons: readonly string[];
}

/** Immutable-by-value audit data created at the time of evaluation. */
export interface ConfluenceEvaluationSnapshot {
  timestampUnit: TimestampUnit;
  evaluatedAt: EpochMilliseconds | null;
  decisionBarOpenAt: EpochMilliseconds | null;
  deterministicScore: number | null;
  threshold: number | null;
  gateMet: boolean;
  strategyEntryEligible: boolean;
  version: VersionSnapshot | null;
  approval: ApprovalMetadata | null;
  trigger: TriggerChecklistItem | null;
  checklist: readonly ConfluenceChecklistItem[];
}

/** Stable machine codes for the narrow, actionable closed-bar blocker triage. */
export const CONFLUENCE_BLOCKED_REASON_CODES = {
  notApproved: "not-approved",
  stale: "stale-source",
  pending: "pending-source",
  unknown: "unknown-source",
  failedTrigger: "failed-trigger",
  missingSource: "missing-source",
} as const;

export type ConfluenceBlockedReasonCode =
  (typeof CONFLUENCE_BLOCKED_REASON_CODES)[keyof typeof CONFLUENCE_BLOCKED_REASON_CODES];

/**
 * Pure triage detail. `label` is plain display text; `code` and optional
 * `conditionId` remain stable for a why-blocked sheet/deep link. This structure
 * never changes eligibility and has no override field by design.
 */
export interface ConfluenceBlockedReason {
  code: ConfluenceBlockedReasonCode;
  label: string;
  conditionId?: string;
  sourceId?: string;
}

/**
 * A deterministic score is confluence points, not a probability of success.
 * `successProbability` is deliberately always null: this contract estimates none.
 */
export interface ConfluenceEvaluation {
  snapshot: ConfluenceEvaluationSnapshot;
  configValid: boolean;
  deterministicScore: number | null;
  threshold: number | null;
  gateMet: boolean;
  /** No probability is inferred, calibrated, or supplied by this contract. */
  successProbability: null;
  /** Pure eligibility signal only; it has no order-permission or execution side effect. */
  strategyEntryEligible: boolean;
  /** Existing human-readable blockers retained for compatibility with current paper gating. */
  blockedReasons: readonly string[];
  /** Stable, pure triage array; it cannot override `strategyEntryEligible`. */
  blockedReason: readonly ConfluenceBlockedReason[];
  /** Explicit alias for consumers that prefer a plural detail name. */
  blockedReasonDetails: readonly ConfluenceBlockedReason[];
}

export interface ValidationEvidence {
  /** Count of actual resolved observations, not a projection or simulated estimate. */
  actualSamples: number;
  walkForward: {
    declared: boolean;
    passed: boolean;
  };
  holdout: {
    declared: boolean;
    untouched: boolean;
    passed: boolean;
  };
  multipleTesting: {
    hypotheses: number;
    corrected: boolean;
  };
}

export interface ValidationEligibility {
  actualSamples: number | null;
  /** "confirmed" is possible only under all of the declared evidence requirements. */
  status: "confirmed" | "unconfirmed";
  mayClaimConfirmedEvidence: boolean;
  successProbability: null;
  reasons: readonly string[];
}

const WEIGHT_EPSILON = 0.000001;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isEpochMilliseconds(value: unknown): value is EpochMilliseconds {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isChecklistStatus(value: unknown): value is ChecklistStatus {
  return value === "met" || value === "not-met" || value === "pending";
}

function isProviderStatus(value: unknown): value is ProviderStatus {
  return (
    value === "ready" ||
    value === "pending" ||
    value === "stale" ||
    value === "disconnected" ||
    value === "future"
  );
}

function isObservedBar(value: unknown): value is ObservedBar {
  return (
    value === "t-1" ||
    value === "t" ||
    value === "future" ||
    value === "unknown"
  );
}

function copySource(source: ConfluenceSource): ConfluenceSource {
  return {
    id: source.id,
    name: source.name,
    required: source.required,
    freshness: { maxAgeMs: source.freshness.maxAgeMs },
  };
}

function copyApproval(approval: ApprovalMetadata): ApprovalMetadata {
  return {
    status: approval.status,
    approvedAt: approval.approvedAt,
    approvedBy: approval.approvedBy,
  };
}

function addIssue(issues: string[], message: string): void {
  if (!issues.includes(message)) issues.push(message);
}

function validateSource(value: unknown, path: string, issues: string[]): void {
  if (!isRecord(value)) {
    addIssue(issues, `${path} must be an object.`);
    return;
  }
  if (!isText(value.id))
    addIssue(issues, `${path}.id must be a non-empty string.`);
  if (!isText(value.name))
    addIssue(issues, `${path}.name must be a non-empty string.`);
  if (typeof value.required !== "boolean")
    addIssue(issues, `${path}.required must be boolean.`);
  if (!isRecord(value.freshness)) {
    addIssue(issues, `${path}.freshness must be an object.`);
    return;
  }
  if (
    typeof value.freshness.maxAgeMs !== "number" ||
    !Number.isFinite(value.freshness.maxAgeMs) ||
    value.freshness.maxAgeMs <= 0
  ) {
    addIssue(
      issues,
      `${path}.freshness.maxAgeMs must be greater than zero milliseconds.`,
    );
  }
}

function validateApproval(value: unknown, issues: string[]): void {
  if (!isRecord(value)) {
    addIssue(issues, "approval must be an object.");
    return;
  }
  const status = value.status;
  if (status !== "draft" && status !== "approved" && status !== "retired") {
    addIssue(issues, "approval.status must be draft, approved, or retired.");
    return;
  }
  const approvedAtIsValid =
    value.approvedAt === null || isEpochMilliseconds(value.approvedAt);
  const approvedByIsValid =
    value.approvedBy === null || isText(value.approvedBy);
  if (!approvedAtIsValid)
    addIssue(issues, "approval.approvedAt must be epoch milliseconds or null.");
  if (!approvedByIsValid)
    addIssue(issues, "approval.approvedBy must be a non-empty string or null.");
  if (status === "approved") {
    if (!isEpochMilliseconds(value.approvedAt))
      addIssue(issues, "approved approval requires approval.approvedAt.");
    if (!isText(value.approvedBy))
      addIssue(issues, "approved approval requires approval.approvedBy.");
  }
}

/** Validates the supplied configuration as-is; it never fills values or normalizes weights. */
export function validateConfluenceConfig(
  config: unknown,
): ConfigurationValidation {
  const issues: string[] = [];
  if (!isRecord(config))
    return { valid: false, issues: ["Configuration must be an object."] };

  if (config.contractVersion !== CONFLUENCE_CONTRACT_VERSION) {
    addIssue(
      issues,
      `contractVersion must equal ${CONFLUENCE_CONTRACT_VERSION}.`,
    );
  }
  if (!isText(config.strategyId))
    addIssue(issues, "strategyId must be a non-empty string.");
  if (!isPositiveInteger(config.strategyVersion))
    addIssue(issues, "strategyVersion must be a positive integer.");
  if (!isPositiveInteger(config.configVersion))
    addIssue(issues, "configVersion must be a positive integer.");
  validateApproval(config.approval, issues);

  if (!isRecord(config.trigger)) {
    addIssue(issues, "trigger must be an object.");
  } else {
    if (!isText(config.trigger.id))
      addIssue(issues, "trigger.id must be a non-empty string.");
    if (!isText(config.trigger.name))
      addIssue(issues, "trigger.name must be a non-empty string.");
    if (!isText(config.trigger.predicate))
      addIssue(issues, "trigger.predicate must be a non-empty string.");
    validateSource(config.trigger.source, "trigger.source", issues);
  }

  if (
    typeof config.threshold !== "number" ||
    !Number.isFinite(config.threshold) ||
    config.threshold < 0 ||
    config.threshold > 100
  ) {
    addIssue(issues, "threshold must be a number from 0 through 100.");
  }

  if (!Array.isArray(config.conditions) || config.conditions.length === 0) {
    addIssue(issues, "conditions must contain at least one condition.");
    return { valid: issues.length === 0, issues };
  }

  const ids = new Set<string>();
  let enabledCount = 0;
  let enabledWeight = 0;
  config.conditions.forEach((condition, index) => {
    const path = `conditions[${index}]`;
    if (!isRecord(condition)) {
      addIssue(issues, `${path} must be an object.`);
      return;
    }
    if (!isText(condition.id)) {
      addIssue(issues, `${path}.id must be a non-empty string.`);
    } else if (ids.has(condition.id)) {
      addIssue(issues, `conditions contains duplicate id ${condition.id}.`);
    } else {
      ids.add(condition.id);
    }
    if (!isText(condition.name))
      addIssue(issues, `${path}.name must be a non-empty string.`);
    if (!isText(condition.predicate))
      addIssue(issues, `${path}.predicate must be a non-empty string.`);
    validateSource(condition.source, `${path}.source`, issues);
    if (typeof condition.enabled !== "boolean") {
      addIssue(issues, `${path}.enabled must be boolean.`);
    }
    if (
      typeof condition.weight !== "number" ||
      !Number.isFinite(condition.weight) ||
      condition.weight < 0
    ) {
      addIssue(issues, `${path}.weight must be a nonnegative finite number.`);
    }
    if (
      condition.enabled === true &&
      typeof condition.weight === "number" &&
      Number.isFinite(condition.weight) &&
      condition.weight >= 0
    ) {
      enabledCount += 1;
      enabledWeight += condition.weight;
    }
  });

  if (enabledCount === 0)
    addIssue(issues, "At least one condition must be enabled.");
  if (enabledCount > 0 && enabledWeight <= 0)
    addIssue(issues, "Enabled condition weight must be greater than zero.");
  if (enabledCount > 0 && Math.abs(enabledWeight - 100) > WEIGHT_EPSILON) {
    addIssue(
      issues,
      "Enabled condition weights must sum to 100; weights are not auto-normalized.",
    );
  }
  return { valid: issues.length === 0, issues };
}

interface ParsedEvaluationInput {
  evaluatedAt: EpochMilliseconds | null;
  decisionBarOpenAt: EpochMilliseconds | null;
  trigger: unknown;
  observations: readonly unknown[];
  contextIssues: readonly string[];
}

function parseEvaluationInput(input: unknown): ParsedEvaluationInput {
  if (!isRecord(input)) {
    return {
      evaluatedAt: null,
      decisionBarOpenAt: null,
      trigger: null,
      observations: [],
      contextIssues: ["Evaluation input must be an object."],
    };
  }
  const contextIssues: string[] = [];
  const evaluatedAt = isEpochMilliseconds(input.evaluatedAt)
    ? input.evaluatedAt
    : null;
  const decisionBarOpenAt = isEpochMilliseconds(input.decisionBarOpenAt)
    ? input.decisionBarOpenAt
    : null;
  if (evaluatedAt === null)
    contextIssues.push("evaluatedAt must be Unix epoch milliseconds.");
  if (decisionBarOpenAt === null)
    contextIssues.push("decisionBarOpenAt must be Unix epoch milliseconds.");
  if (
    evaluatedAt !== null &&
    decisionBarOpenAt !== null &&
    evaluatedAt < decisionBarOpenAt
  ) {
    contextIssues.push("evaluatedAt cannot precede decisionBarOpenAt.");
  }
  if (!Array.isArray(input.conditions))
    contextIssues.push("conditions observations must be an array.");
  return {
    evaluatedAt,
    decisionBarOpenAt,
    trigger: input.trigger,
    observations: Array.isArray(input.conditions) ? input.conditions : [],
    contextIssues,
  };
}

interface EvaluatedObservation extends ObservationSnapshot {
  status: ChecklistStatus;
  reasons: readonly string[];
}

function evaluateObservation(
  source: ConfluenceSource,
  raw: unknown,
  context: ParsedEvaluationInput,
  missingReason: string,
  duplicate: boolean,
): EvaluatedObservation {
  const reasons: string[] = [...context.contextIssues];
  if (duplicate)
    reasons.push("More than one observation was supplied for this condition.");
  if (!isRecord(raw)) {
    reasons.push(missingReason);
    return {
      status: "pending",
      sourceId: null,
      providerStatus: null,
      observedAt: null,
      lastClosedBarAt: null,
      bar: null,
      reasons,
    };
  }

  const sourceId = isText(raw.sourceId) ? raw.sourceId : null;
  const providerStatus = isProviderStatus(raw.providerStatus)
    ? raw.providerStatus
    : null;
  const observedAt = isEpochMilliseconds(raw.observedAt)
    ? raw.observedAt
    : null;
  const lastClosedBarAt = isEpochMilliseconds(raw.lastClosedBarAt)
    ? raw.lastClosedBarAt
    : null;
  const bar = isObservedBar(raw.bar) ? raw.bar : null;
  const rawStatus = isChecklistStatus(raw.status) ? raw.status : null;

  if (sourceId === null)
    reasons.push("Observation sourceId is missing or invalid.");
  else if (sourceId !== source.id)
    reasons.push(
      `Observation sourceId ${sourceId} does not match configured source ${source.id}.`,
    );
  if (providerStatus === null)
    reasons.push("providerStatus is missing or invalid.");
  else if (providerStatus !== "ready")
    reasons.push(`Provider status is ${providerStatus}.`);
  if (rawStatus === null)
    reasons.push("Observation status is missing or invalid.");
  if (observedAt === null)
    reasons.push("observedAt must be Unix epoch milliseconds.");
  if (lastClosedBarAt === null)
    reasons.push("lastClosedBarAt must be Unix epoch milliseconds.");
  if (bar === null) reasons.push("Observation bar is missing or invalid.");
  else if (bar !== "t-1")
    reasons.push(
      "Observation must be based on closed bar t-1, not an incomplete or future bar.",
    );

  if (
    context.evaluatedAt !== null &&
    observedAt !== null &&
    observedAt > context.evaluatedAt
  ) {
    reasons.push("observedAt is in the future of evaluatedAt.");
  }
  if (
    context.decisionBarOpenAt !== null &&
    lastClosedBarAt !== null &&
    lastClosedBarAt > context.decisionBarOpenAt
  ) {
    reasons.push(
      "lastClosedBarAt is after decisionBarOpenAt and could inform from an incomplete bar.",
    );
  }
  if (
    observedAt !== null &&
    lastClosedBarAt !== null &&
    lastClosedBarAt > observedAt
  ) {
    reasons.push("lastClosedBarAt cannot be after observedAt.");
  }
  if (
    context.evaluatedAt !== null &&
    observedAt !== null &&
    context.evaluatedAt - observedAt > source.freshness.maxAgeMs
  ) {
    reasons.push("Observation exceeds the configured source freshness limit.");
  }
  if (
    context.evaluatedAt !== null &&
    lastClosedBarAt !== null &&
    context.evaluatedAt - lastClosedBarAt > source.freshness.maxAgeMs
  ) {
    reasons.push("Closed bar exceeds the configured source freshness limit.");
  }
  if (rawStatus === "pending") reasons.push("Source evaluation is pending.");

  return {
    status: reasons.length === 0 && rawStatus !== null ? rawStatus : "pending",
    sourceId,
    providerStatus,
    observedAt,
    lastClosedBarAt,
    bar,
    reasons,
  };
}

function roundScore(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function containsReason(item: { reasons: readonly string[] }, text: string): boolean {
  return item.reasons.some((reason) => reason.toLowerCase().includes(text));
}

function observationTriage(
  item: TriggerChecklistItem | ConfluenceChecklistItem,
  conditionId?: string,
): ConfluenceBlockedReason | null {
  const sourceId = item.sourceId || item.source.id;
  const target = conditionId ? { conditionId, sourceId } : { sourceId };
  if (
    item.sourceId === null ||
    containsReason(item, "missing trigger observation") ||
    containsReason(item, "missing observation for condition") ||
    containsReason(item, "sourceid is missing")
  ) {
    return {
      code: CONFLUENCE_BLOCKED_REASON_CODES.missingSource,
      label: "A required source observation is missing.",
      ...target,
    };
  }
  if (
    item.providerStatus === "stale" ||
    containsReason(item, "freshness limit") ||
    containsReason(item, "closed bar exceeds")
  ) {
    return {
      code: CONFLUENCE_BLOCKED_REASON_CODES.stale,
      label: "Required source evidence is stale.",
      ...target,
    };
  }
  if (item.providerStatus === "pending" || containsReason(item, "evaluation is pending")) {
    return {
      code: CONFLUENCE_BLOCKED_REASON_CODES.pending,
      label: "Required source evidence is still pending.",
      ...target,
    };
  }
  if (
    item.bar === "unknown" ||
    item.providerStatus === null ||
    containsReason(item, "missing or invalid")
  ) {
    return {
      code: CONFLUENCE_BLOCKED_REASON_CODES.unknown,
      label: "Required source evidence is unknown or cannot be verified.",
      ...target,
    };
  }
  if (item.status === "pending") {
    return {
      code: CONFLUENCE_BLOCKED_REASON_CODES.pending,
      label: "Required source evidence is pending or invalid.",
      ...target,
    };
  }
  return null;
}

/**
 * Produces compact, stable display/deep-link details from an already evaluated
 * checklist. It is intentionally a read-only triage helper: it cannot make a
 * blocked evaluation eligible and callers must continue to use the original
 * `strategyEntryEligible` signal for paper gating.
 */
export function triageConfluenceBlockedReasons(input: {
  approval: ApprovalMetadata;
  trigger: TriggerChecklistItem;
  checklist: readonly ConfluenceChecklistItem[];
}): readonly ConfluenceBlockedReason[] {
  const triage: ConfluenceBlockedReason[] = [];
  const add = (reason: ConfluenceBlockedReason | null) => {
    if (
      reason &&
      !triage.some(
        (item) =>
          item.code === reason.code &&
          item.conditionId === reason.conditionId &&
          item.sourceId === reason.sourceId,
      )
    )
      triage.push(reason);
  };
  if (input.approval.status !== "approved") {
    add({
      code: CONFLUENCE_BLOCKED_REASON_CODES.notApproved,
      label: "The confluence configuration is not approved.",
    });
  }
  add(observationTriage(input.trigger));
  if (input.trigger.status === "not-met") {
    add({
      code: CONFLUENCE_BLOCKED_REASON_CODES.failedTrigger,
      label: "The named trigger did not pass.",
      sourceId: input.trigger.sourceId || input.trigger.source.id,
    });
  }
  for (const condition of input.checklist) {
    if (condition.enabled && condition.status === "pending")
      add(observationTriage(condition, condition.conditionId));
  }
  return triage;
}

function noConfigEvaluation(issues: readonly string[]): ConfluenceEvaluation {
  return {
    snapshot: {
      timestampUnit: TIMESTAMP_UNIT,
      evaluatedAt: null,
      decisionBarOpenAt: null,
      deterministicScore: null,
      threshold: null,
      gateMet: false,
      strategyEntryEligible: false,
      version: null,
      approval: null,
      trigger: null,
      checklist: [],
    },
    configValid: false,
    deterministicScore: null,
    threshold: null,
    gateMet: false,
    successProbability: null,
    strategyEntryEligible: false,
    blockedReasons: issues.map(
      (issue) => `Invalid confluence configuration: ${issue}`,
    ),
    blockedReason: [],
    blockedReasonDetails: [],
  };
}

/**
 * Evaluates one closed-bar confluence snapshot. A required source that is
 * pending, stale, disconnected, future-dated, or tied to an incomplete bar
 * makes its active condition pending and blocks this strategy-entry signal.
 */
export function evaluateConfluence(
  config: ConfluenceStrategyContract,
  input: ConfluenceEvaluationInput,
): ConfluenceEvaluation {
  const configValidation = validateConfluenceConfig(config);
  if (!configValidation.valid)
    return noConfigEvaluation(configValidation.issues);

  const safeConfig = config as ConfluenceStrategyContract;
  const parsed = parseEvaluationInput(input);
  const rawByConditionId = new Map<string, unknown>();
  const duplicateConditionIds = new Set<string>();
  for (const raw of parsed.observations) {
    if (!isRecord(raw) || !isText(raw.conditionId)) continue;
    if (rawByConditionId.has(raw.conditionId))
      duplicateConditionIds.add(raw.conditionId);
    else rawByConditionId.set(raw.conditionId, raw);
  }

  const triggerObserved = evaluateObservation(
    safeConfig.trigger.source,
    parsed.trigger,
    parsed,
    "Missing trigger observation.",
    false,
  );
  const trigger: TriggerChecklistItem = {
    triggerId: safeConfig.trigger.id,
    name: safeConfig.trigger.name,
    predicate: safeConfig.trigger.predicate,
    source: copySource(safeConfig.trigger.source),
    ...triggerObserved,
  };

  const checklist: ConfluenceChecklistItem[] = safeConfig.conditions.map(
    (condition) => {
      if (!condition.enabled) {
        return {
          conditionId: condition.id,
          name: condition.name,
          predicate: condition.predicate,
          source: copySource(condition.source),
          enabled: false,
          weight: condition.weight,
          status: "pending",
          sourceId: null,
          providerStatus: null,
          observedAt: null,
          lastClosedBarAt: null,
          bar: null,
          reasons: ["Condition is disabled and excluded from this evaluation."],
        };
      }
      const observed = evaluateObservation(
        condition.source,
        rawByConditionId.get(condition.id),
        parsed,
        `Missing observation for condition ${condition.id}.`,
        duplicateConditionIds.has(condition.id),
      );
      return {
        conditionId: condition.id,
        name: condition.name,
        predicate: condition.predicate,
        source: copySource(condition.source),
        enabled: true,
        weight: condition.weight,
        ...observed,
      };
    },
  );

  const deterministicScore = roundScore(
    checklist.reduce(
      (total, condition) =>
        total +
        (condition.enabled && condition.status === "met"
          ? condition.weight
          : 0),
      0,
    ),
  );
  const gateMet = deterministicScore >= safeConfig.threshold;
  const blockedReasons: string[] = [];
  if (safeConfig.approval.status !== "approved") {
    blockedReasons.push("Confluence configuration is not human-approved.");
  }
  if (
    parsed.evaluatedAt !== null &&
    safeConfig.approval.approvedAt !== null &&
    safeConfig.approval.approvedAt > parsed.evaluatedAt
  ) {
    blockedReasons.push(
      "Configuration approval occurs after this point-in-time decision.",
    );
  }
  if (trigger.status !== "met") {
    blockedReasons.push(
      `Trigger ${safeConfig.trigger.id} is ${trigger.status}.`,
    );
  }
  for (const condition of checklist) {
    if (condition.enabled && condition.status === "pending") {
      blockedReasons.push(
        `Active source for condition ${condition.conditionId} is pending or invalid.`,
      );
    }
  }
  if (!gateMet) {
    blockedReasons.push(
      `Deterministic confluence score ${deterministicScore} is below threshold ${safeConfig.threshold}.`,
    );
  }
  // A zero threshold is valid configuration, but it cannot turn a named trigger into a strategy by itself.
  if (deterministicScore <= 0) {
    blockedReasons.push(
      "No enabled condition is met; a trigger alone is insufficient.",
    );
  }
  const blockedReason = triageConfluenceBlockedReasons({
    approval: safeConfig.approval,
    trigger,
    checklist,
  });

  return {
    snapshot: {
      timestampUnit: TIMESTAMP_UNIT,
      evaluatedAt: parsed.evaluatedAt,
      decisionBarOpenAt: parsed.decisionBarOpenAt,
      deterministicScore,
      threshold: safeConfig.threshold,
      gateMet,
      strategyEntryEligible: blockedReasons.length === 0,
      version: {
        contractVersion: safeConfig.contractVersion,
        strategyId: safeConfig.strategyId,
        strategyVersion: safeConfig.strategyVersion,
        configVersion: safeConfig.configVersion,
      },
      approval: copyApproval(safeConfig.approval),
      trigger,
      checklist,
    },
    configValid: true,
    deterministicScore,
    threshold: safeConfig.threshold,
    gateMet,
    successProbability: null,
    strategyEntryEligible: blockedReasons.length === 0,
    blockedReasons,
    blockedReason,
    blockedReasonDetails: blockedReason,
  };
}

/**
 * Limits the *claim* "confirmed evidence"; it does not calculate expectancy,
 * a probability, a model score, or any other statistical conclusion.
 */
export function validationEligibility(
  evidence: ValidationEvidence,
): ValidationEligibility {
  const raw = isRecord(evidence) ? evidence : null;
  const reasons: string[] = [];
  const actualSamples =
    raw !== null &&
    typeof raw.actualSamples === "number" &&
    Number.isSafeInteger(raw.actualSamples) &&
    raw.actualSamples >= 0
      ? raw.actualSamples
      : null;
  if (actualSamples === null)
    reasons.push(
      "actualSamples must be a nonnegative integer count of actual observations.",
    );
  else if (actualSamples < 100)
    reasons.push(
      "At least 100 actual samples are required before evidence can be called confirmed.",
    );

  const walkForward =
    raw !== null && isRecord(raw.walkForward) ? raw.walkForward : null;
  if (walkForward === null || walkForward.declared !== true) {
    reasons.push("A walk-forward evaluation must be declared.");
  } else if (walkForward.passed !== true) {
    reasons.push("The declared walk-forward evaluation must have passed.");
  }

  const holdout = raw !== null && isRecord(raw.holdout) ? raw.holdout : null;
  if (holdout === null || holdout.declared !== true) {
    reasons.push("An untouched holdout must be declared.");
  } else if (holdout.untouched !== true) {
    reasons.push("The declared holdout must remain untouched.");
  }
  if (holdout?.passed !== true)
    reasons.push("The untouched holdout evaluation must have passed.");
  const testing =
    raw !== null && isRecord(raw.multipleTesting) ? raw.multipleTesting : null;
  if (
    !testing ||
    !isPositiveInteger(testing.hypotheses) ||
    testing.corrected !== true
  ) {
    reasons.push(
      "The full positive hypothesis count and applied multiple-testing correction must be declared.",
    );
  }

  const mayClaimConfirmedEvidence = reasons.length === 0;
  return {
    actualSamples,
    status: mayClaimConfirmedEvidence ? "confirmed" : "unconfirmed",
    mayClaimConfirmedEvidence,
    successProbability: null,
    reasons,
  };
}
