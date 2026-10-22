import { and, eq, gte, lt, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { backgroundStrategyStatus } from "./background-strategy-status";
import type { User } from "../../drizzle/schema";
import {
  tradingPaperProposals,
  tradingPaperTrades,
  tradingRuntimeState,
  tradingSchedules,
} from "../../drizzle/schema";
import type {
  Market,
  Strategy,
  Trade,
  Workspace,
} from "../../lib/trading/model";
import type {
  PaperProposal,
  SetupAnalysis,
  SetupCandidate,
} from "../../lib/trading/setup-model";
import {
  SESSION_CRITICAL_IDS,
  isSessionStrategyFamily,
  sessionStrategyConfigSchema,
  sessionVolumeAllowed,
  type SessionStrategyConfig,
} from "../../lib/trading/session-strategy-model";
import { sessionPaperGeometry } from "../../lib/trading/session-paper-geometry";
import {
  sessionAutoSettingsSchema,
  type SessionAutoOrigin,
  type SessionAutoResult,
  type SessionAutoSettings,
  type SessionAutoStatus,
} from "../../lib/trading/session-auto-types";
import { paperPerformance } from "../../lib/trading/paper-performance";
import { tradeMetrics, SECONDS } from "../../lib/trading/engine";
import { evaluateDiscipline } from "../../lib/trading/trading-discipline";
import { selectDisciplineGuards } from "../../lib/trading/discipline-policy";
import { ENV } from "../_core/env";
import { mayUseApp } from "./access";
import { createPaperOrder } from "./paper-service";
import { enforceStrategyGate } from "./paper-gate";
import { getQuote } from "./market";
import { dbRequired, loadWorkspace } from "./repository";
import { marketFor, setupAnalysis } from "./setup-service";

type SettingsCarrier = { sessionAutoPaper?: unknown };
type Gate = {
  strategyEntryEligible?: boolean;
  snapshot?: {
    version?: {
      strategyId?: string;
      strategyVersion?: number;
      configVersion?: number;
    };
    approval?: { status?: string };
  };
};
type LockResult<T> = { acquired: boolean; value?: T; reason?: string };
type SessionContext = NonNullable<SetupAnalysis["sessionContexts"]>[number];
type SessionGeometry = { stop: number; target: number; riskDistance: number };

const AUTO_JOURNAL_MARKER = "v1";
const MAX_EXPIRY_MS = 24 * 60 * 60 * 1000;
const AUTO_LOCK_TIMEOUT_SECONDS = 1;
const SCHEDULE_CALLBACK_FRESH_MS = 3 * 60 * 1000;
const SCHEDULE_RUNTIME_KIND = "session-auto-paper-scheduled";

function result(
  state: SessionAutoResult["state"],
  message: string,
  extra: Partial<SessionAutoResult> = {},
): SessionAutoResult {
  return { state, message, checkedAt: Date.now(), ...extra };
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function finiteTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** Stable only for the complete persisted consent object; local drafts never activate execution. */
export function sessionConsentSignature(settings: SessionAutoSettings) {
  return JSON.stringify({
    version: settings.version,
    enabled: settings.enabled,
    strategyId: settings.strategyId,
    market: settings.market,
    riskPct: settings.riskPct,
    maxTradesPerDay: settings.maxTradesPerDay,
    runWhenClosed: settings.runWhenClosed,
    armedAt: settings.armedAt,
    expiresAt: settings.expiresAt,
  });
}

export function sessionAutoSettingsReason(
  raw: unknown,
  now = Date.now(),
): {
  settings?: SessionAutoSettings;
  state: "off" | "blocked" | "waiting";
  reason: string;
} {
  if (raw === undefined)
    return { state: "off", reason: "Automatic session paper trading is off." };
  const parsed = sessionAutoSettingsSchema.safeParse(raw);
  if (!parsed.success)
    return {
      state: "blocked",
      reason:
        "Saved session paper consent is invalid; no order can be created.",
    };
  const settings = parsed.data;
  if (!settings.enabled)
    return {
      settings,
      state: "off",
      reason: "Automatic session paper trading is off.",
    };
  if (!settings.armedAt || !settings.expiresAt)
    return {
      settings,
      state: "blocked",
      reason: "Saved session paper consent is missing arm or expiry times.",
    };
  if (settings.armedAt > now + 30_000)
    return {
      settings,
      state: "blocked",
      reason: "The saved session arm time is not valid on the server clock.",
    };
  if (
    settings.expiresAt <= settings.armedAt ||
    settings.expiresAt - settings.armedAt > MAX_EXPIRY_MS ||
    settings.expiresAt <= now
  )
    return {
      settings,
      state: "blocked",
      reason: "Automatic session paper consent has expired.",
    };
  return {
    settings,
    state: "waiting",
    reason: "Saved session paper consent is active.",
  };
}

function localParts(now: number, timezone: string) {
  try {
    const values = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(new Date(now))
        .map((part) => [part.type, part.value]),
    );
    const year = Number(values.year);
    const month = Number(values.month);
    const day = Number(values.day);
    const hour = Number(values.hour);
    const minute = Number(values.minute);
    const second = Number(values.second);
    if ([year, month, day, hour, minute, second].every(Number.isFinite))
      return { year, month, day, hour, minute, second };
  } catch {
    // A saved configuration with an invalid zone is blocked by its strict parser.
  }
  return undefined;
}

/** Server-derived source-local calendar day; neither the client nor a schedule supplies it. */
export function sessionLocalDay(now: number, timezone: string) {
  const local = localParts(now, timezone);
  return local
    ? `${String(local.year).padStart(4, "0")}-${String(local.month).padStart(2, "0")}-${String(local.day).padStart(2, "0")}`
    : undefined;
}

/** Exact UTC bounds for the source strategy's local day, including a DST midnight correction. */
export function sessionLocalDayBounds(now: number, timezone: string) {
  const local = localParts(now, timezone);
  if (!local) return undefined;
  const offsetAt = (instant: number) => {
    const at = localParts(instant, timezone);
    return at
      ? Date.UTC(at.year, at.month - 1, at.day, at.hour, at.minute, at.second) -
          instant
      : undefined;
  };
  const utcMidnight = Date.UTC(local.year, local.month - 1, local.day);
  const firstOffset = offsetAt(utcMidnight);
  if (firstOffset === undefined) return undefined;
  let start = utcMidnight - firstOffset;
  const correctedStartOffset = offsetAt(start);
  if (correctedStartOffset === undefined) return undefined;
  start = utcMidnight - correctedStartOffset;

  const next = new Date(Date.UTC(local.year, local.month - 1, local.day + 1));
  const nextMidnight = Date.UTC(
    next.getUTCFullYear(),
    next.getUTCMonth(),
    next.getUTCDate(),
  );
  const nextOffset = offsetAt(nextMidnight);
  if (nextOffset === undefined) return undefined;
  let end = nextMidnight - nextOffset;
  const correctedEndOffset = offsetAt(end);
  if (correctedEndOffset === undefined) return undefined;
  end = nextMidnight - correctedEndOffset;
  return { start, end };
}

function configSignature(config: SessionStrategyConfig) {
  return JSON.stringify(config);
}

function pdcConfigurationReason(config: SessionStrategyConfig) {
  if (config.family !== "pdc-continuation") return undefined;
  if (config.pdcBasis === "unselected")
    return "PDC basis is not selected; automatic paper execution remains unavailable.";
  if (!positive(config.priceTick))
    return "PDC price tick must be explicitly selected before automatic paper execution.";
  if (config.targetMode === "owner-key-levels") {
    if (!positive(config.longTargetPrice) || !positive(config.shortTargetPrice))
      return "PDC owner key-level targets must be selected for both directions before automatic paper execution.";
  } else if (!Number.isInteger(config.premarketStartMinute)) {
    return "PDC premarket target mode requires its declared premarket start minute.";
  }
  if (
    config.pdcBasis === "declared-session-close" &&
    !Number.isInteger(config.sessionCloseMinute)
  )
    return "PDC declared-session-close basis requires its declared close minute.";
  return undefined;
}

function configuredSessionStrategy(
  workspace: Workspace,
  settings: SessionAutoSettings,
): { strategy?: Strategy; config?: SessionStrategyConfig; reason?: string } {
  const strategy = workspace.strategies.find(
    (item) => item.id === settings.strategyId,
  );
  if (!strategy || strategy.archived)
    return {
      reason: "The selected canonical session strategy is missing or archived.",
    };
  if (!isSessionStrategyFamily(strategy.setupFamily))
    return {
      reason:
        "The selected strategy is not a supported London, Initial Balance, or PDC session family.",
    };
  const config = sessionStrategyConfigSchema.safeParse(strategy.sessionConfig);
  if (!config.success || config.data.family !== strategy.setupFamily)
    return {
      reason:
        "The selected session strategy has no valid matching execution configuration.",
    };
  if (config.data.version !== 1 || config.data.confirmed !== true)
    return {
      reason:
        "The selected session execution configuration is not explicitly confirmed.",
    };
  if (!localParts(Date.now(), config.data.timezone))
    return { reason: "The selected session execution time zone is invalid." };
  const pdcReason = pdcConfigurationReason(config.data);
  if (pdcReason) return { reason: pdcReason };
  if (
    !strategy.confluence ||
    strategy.confluence.contract.strategyId !== strategy.id ||
    strategy.confluence.contract.strategyVersion !== strategy.version ||
    strategy.confluence.contract.approval.status !== "approved"
  )
    return {
      reason: "A same-version approved confluence configuration is required.",
    };
  if (
    strategy.confluence.binding.side !== "long" &&
    strategy.confluence.binding.side !== "short"
  )
    return {
      reason:
        "The approved session confluence must specify one deterministic direction.",
    };
  return { strategy, config: config.data };
}

export function sessionGateEligible(
  gate: Gate | undefined,
  strategy: Strategy,
) {
  return Boolean(
    gate?.strategyEntryEligible &&
    gate.snapshot?.approval?.status === "approved" &&
    gate.snapshot?.version?.strategyId === strategy.id &&
    gate.snapshot?.version?.strategyVersion === strategy.version &&
    gate.snapshot?.version?.configVersion ===
      strategy.confluence?.contract.configVersion,
  );
}

function quoteObservationReason(context: SessionContext, now: number) {
  const evidence = context.quoteEvidence;
  if (!evidence || evidence.method !== "owner-persisted-rest-observations")
    return "PDC continuation requires its persisted external quote-cross observations.";
  const previous = evidence.previous;
  const current = evidence.current;
  if (!previous || previous.status !== "live" || current.status !== "live")
    return "PDC continuation requires a live preceding and current external quote observation.";
  if (
    !finiteTimestamp(previous.timestamp) ||
    !finiteTimestamp(current.timestamp) ||
    !positive(previous.price) ||
    !positive(current.price) ||
    !text(previous.source) ||
    !text(current.source)
  )
    return "PDC external quote observations are incomplete.";
  const currentMs = current.timestamp * 1000;
  if (
    previous.symbol !== current.symbol ||
    previous.source !== current.source ||
    previous.timestamp >= current.timestamp ||
    current.timestamp - previous.timestamp > 90
  )
    return "PDC external quote observations are not a causal same-source quote pair.";
  if (currentMs < now - 30_000 || currentMs > now + 30_000)
    return "PDC external quote observation is stale or future-dated.";
  if (
    !finiteTimestamp(evidence.observedAt) ||
    evidence.observedAt < current.timestamp ||
    evidence.observedAt * 1000 < now - 30_000 ||
    evidence.observedAt * 1000 > now + 30_000
  )
    return "PDC quote observation receipt time is unavailable.";
  return undefined;
}

/**
 * Confirms that a current native-frame candidate has every family-owned critical
 * fact. This does not infer a stop, target, volume, PDC quote crossing, or side.
 */
export function criticalSessionCandidateReason(input: {
  analysis: SetupAnalysis;
  strategy: Strategy;
  config: SessionStrategyConfig;
  side: "long" | "short";
  now?: number;
}): {
  candidate?: SetupCandidate;
  context?: SessionContext;
  decisionBar?: number;
  reason?: string;
} {
  const now = input.now ?? Date.now();
  const { analysis, strategy, config, side } = input;
  if (config.instrumentMarket && config.instrumentMarket !== analysis.market)
    return {
      reason:
        "Detected instrument settings belong to another market; prepare this instrument before automation.",
    };
  if (analysis.timeframe !== config.executionTimeframe)
    return {
      reason:
        "Session automation requires analysis at the strategy's exact native execution timeframe.",
    };
  if (analysis.market.length === 0 || !text(analysis.source))
    return { reason: "The current session source is unnamed or unavailable." };
  const decision = analysis.candles.at(-1);
  const seconds = SECONDS[config.executionTimeframe];
  if (!decision || !finiteTimestamp(decision.time) || !seconds)
    return { reason: "The latest source decision bar is unavailable." };
  const closedAt = (decision.time + seconds) * 1000;
  if (
    closedAt > now + 30_000 ||
    closedAt < now - Math.max(seconds * 3000, 15 * 60_000)
  )
    return {
      reason: "The latest native source decision bar is not fresh and closed.",
    };
  const contexts = (analysis.sessionContexts || []).filter(
    (context) =>
      context.strategyId === strategy.id &&
      context.family === config.family &&
      context.timezone === config.timezone &&
      configSignature(context.config) === configSignature(config),
  );
  if (contexts.length !== 1)
    return {
      reason:
        "The current same-strategy session context is unavailable or ambiguous.",
    };
  const context = contexts[0];
  if (context.missing.length)
    return {
      reason: `Session source facts are incomplete: ${context.missing.join(", ")}.`,
    };
  if (
    (config.family === "initial-balance" ||
      config.family === "pdc-continuation") &&
    !sessionVolumeAllowed(config, context.volumeBasis)
  )
    return {
      reason:
        "The selected volume policy is unavailable; broker proxy requires explicit selection, and unknown/zero readings do not become an automatic signal.",
    };
  if (config.family === "pdc-continuation") {
    const quoteReason = quoteObservationReason(context, now);
    if (quoteReason) return { reason: quoteReason };
  }
  const candidates = analysis.candidates.filter(
    (candidate) =>
      candidate.strategyId === strategy.id &&
      candidate.strategyVersion === strategy.version &&
      candidate.family === config.family &&
      candidate.side === side &&
      candidate.ready,
  );
  if (candidates.length !== 1)
    return {
      reason:
        "A single current same-version ready session candidate is required.",
    };
  const candidate = candidates[0];
  const steps = new Map(candidate.steps.map((step) => [step.id, step.status]));
  const missing = SESSION_CRITICAL_IDS[config.family].filter(
    (id) => steps.get(id) !== "met",
  );
  if (missing.length)
    return {
      reason: `Session critical evidence is not fully met: ${missing.join(", ")}.`,
    };
  if (
    !positive(candidate.entry) ||
    !positive(candidate.stop) ||
    !positive(candidate.target)
  )
    return {
      reason: "The source-owned session entry, stop, or target is unavailable.",
    };
  if (
    (side === "long" &&
      !(
        candidate.stop < candidate.entry && candidate.entry < candidate.target
      )) ||
    (side === "short" &&
      !(candidate.target < candidate.entry && candidate.entry < candidate.stop))
  )
    return {
      reason:
        "The source-owned session bracket has invalid directional geometry.",
    };
  return { candidate, context, decisionBar: decision.time };
}

function freshEntry(
  quote: Awaited<ReturnType<typeof getQuote>>,
  side: "long" | "short",
) {
  if (
    quote.status !== "live" ||
    !finiteTimestamp(quote.timestamp) ||
    quote.timestamp * 1000 < Date.now() - 120_000 ||
    quote.timestamp * 1000 > Date.now() + 30_000
  )
    return undefined;
  const entry =
    side === "long" ? quote.ask || quote.price : quote.bid || quote.price;
  return positive(entry) ? entry : undefined;
}

function scalar(value: unknown): unknown {
  if (Array.isArray(value)) return scalar(value[0]);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["acquired", "released", "GET_LOCK", "RELEASE_LOCK"]) {
      if (key in record) return record[key];
    }
    const first = Object.values(record)[0];
    if (first !== undefined) return scalar(first);
  }
  return value;
}

/** Uses the same owner lock name as ORB so auto families cannot scan/order the same account concurrently. */
async function withOwnerAutoLock<T>(
  db: {
    transaction?: (
      run: (tx: any) => Promise<LockResult<T>>,
    ) => Promise<LockResult<T>>;
  },
  userId: number,
  work: (rootDb: any) => Promise<T>,
): Promise<LockResult<T>> {
  if (typeof db.transaction !== "function")
    return {
      acquired: false,
      reason:
        "The database driver cannot provide a transaction-bound advisory lock.",
    };
  // This exact shared lock deliberately serializes ORB and all session-family automatic paper scans.
  const name = `stratdesk:ownerauto:orb:${userId}`;
  try {
    return await db.transaction(async (tx: any) => {
      if (typeof tx.execute !== "function")
        return {
          acquired: false,
          reason: "The database transaction does not support advisory locks.",
        };
      let acquired = false;
      try {
        const reply = await tx.execute(
          sql`SELECT GET_LOCK(${name}, ${AUTO_LOCK_TIMEOUT_SECONDS}) AS acquired`,
        );
        acquired = Number(scalar(reply)) === 1;
        if (!acquired)
          return {
            acquired: false,
            reason:
              "Another automatic paper check is active; no concurrent order was attempted.",
          };
        // Keep this connection exclusively for GET_LOCK/RELEASE_LOCK. Claims use root-db autocommit,
        // therefore createPaperOrder's separate pooled connection can read the committed proposal.
        return { acquired: true, value: await work(db) };
      } finally {
        if (acquired) {
          try {
            await tx.execute(sql`SELECT RELEASE_LOCK(${name}) AS released`);
          } catch {
            // A connection end releases MySQL locks; a later automatic run still fails closed on lock trouble.
          }
        }
      }
    });
  } catch {
    return {
      acquired: false,
      reason:
        "The database advisory lock could not be verified; automatic paper execution is blocked.",
    };
  }
}

async function canonicalTrades(db: any, userId: number): Promise<Trade[]> {
  const rows = await db
    .select()
    .from(tradingPaperTrades)
    .where(eq(tradingPaperTrades.userId, userId));
  return rows.map((row: { payload: unknown }) => row.payload as Trade);
}

export function isAutomaticSessionPaperTrade(trade: Pick<Trade, "journal">) {
  return trade.journal?.sessionAutoPaper === AUTO_JOURNAL_MARKER;
}

async function dailyAutomaticCount(
  db: any,
  userId: number,
  timezone: string,
  now: number,
) {
  const range = sessionLocalDayBounds(now, timezone);
  if (!range) return undefined;
  const rows = await db
    .select({ payload: tradingPaperTrades.payload })
    .from(tradingPaperTrades)
    .where(
      and(
        eq(tradingPaperTrades.userId, userId),
        gte(tradingPaperTrades.createdAt, new Date(range.start)),
        lt(tradingPaperTrades.createdAt, new Date(range.end)),
      ),
    );
  // No history window: pending, open, closed, and cancelled automatic records all consume the local-day cap.
  return rows.filter((row: { payload: unknown }) =>
    isAutomaticSessionPaperTrade(row.payload as Trade),
  ).length;
}

export function sessionRiskAndDisciplineReason(input: {
  workspace: Workspace;
  ledger: Trade[];
  market: string;
  side: "long" | "short";
  proposedRisk: number;
  now: number;
}) {
  const { workspace, ledger, market, side, proposedRisk, now } = input;
  if (!positive(workspace.paperStartingBalance))
    return "A positive canonical paper starting balance is required.";
  const drawdownLimit = workspace.settings.dailyDrawdownLimitPct;
  if (!positive(drawdownLimit))
    return "A positive existing daily drawdown limit is required before automatic session paper use.";
  const performance = paperPerformance(
    ledger,
    workspace.paperStartingBalance,
    [],
    now,
  );
  if (!positive(performance.balance))
    return "The realized canonical paper balance is not positive.";
  if (performance.todayClosedDrawdownPct === null)
    return "Canonical paper drawdown cannot be verified from the retained ledger.";
  if (performance.todayClosedDrawdownPct >= drawdownLimit)
    return "The canonical daily paper drawdown limit has been reached.";
  const report = evaluateDiscipline(ledger, {
    now,
    proposedRisk: positive(proposedRisk) ? proposedRisk : 0,
    market,
    side,
    cooldownMinutes: workspace.settings.cooldownMinutes || 20,
    maxTradesPerDay: workspace.settings.maxTradesPerDay || 6,
  });
  const blocked = selectDisciplineGuards(
    workspace.settings,
    report.flags,
  ).blocks;
  return blocked.length
    ? `${blocked[0].title} is enabled and currently blocks a new paper order.`
    : undefined;
}

export function deterministicSessionSignalId(input: {
  userId: number;
  strategyId: string;
  strategyVersion: number;
  config: SessionStrategyConfig;
  market: string;
  side: "long" | "short";
  source: string;
  decisionBar: number;
  pdcQuote?: {
    previousTimestamp: number;
    previousPrice: number;
    currentTimestamp: number;
    currentPrice: number;
  };
}) {
  // A pivot event is the observed cross, not a new event each time a later volume bar closes.
  const stable = JSON.stringify({
    v: 1,
    userId: input.userId,
    strategyId: input.strategyId,
    strategyVersion: input.strategyVersion,
    config: input.config,
    market: input.market,
    side: input.side,
    source: input.source,
    decisionBar:
      input.config.family === "pdc-continuation"
        ? undefined
        : Math.floor(input.decisionBar),
    pdcQuote: input.pdcQuote,
  });
  const hash = createHash("sha256").update(stable).digest("hex").slice(0, 40);
  const scope =
    `${input.userId}_${input.strategyId}_${input.strategyVersion}_${input.market}_${input.side}`
      .replace(/[^A-Za-z0-9_-]/g, "_")
      .slice(0, 55);
  return `session_auto_${scope}_${hash}`.slice(0, 100);
}

function pdcSignalQuote(context: SessionContext) {
  const previous = context.quoteEvidence?.previous;
  const current = context.quoteEvidence?.current;
  if (
    !previous ||
    !current ||
    !positive(previous.price) ||
    !positive(current.price)
  )
    return undefined;
  return {
    previousTimestamp: previous.timestamp,
    previousPrice: previous.price,
    currentTimestamp: current.timestamp,
    currentPrice: current.price,
  };
}

/** Pure proposal construction: it uses supplied source geometry and the realized ledger balance only. */
export function createSessionAutoProposal(input: {
  id: string;
  analysis: SetupAnalysis;
  candidate: SetupCandidate;
  market: Market;
  side: "long" | "short";
  entry: number;
  geometry: SessionGeometry;
  balance: number;
  riskPct: 1 | 2;
  strategy: Strategy;
  signalId: string;
}): PaperProposal | undefined {
  const unit = tradeMetrics({
    market: input.market.id,
    valuationSymbol: input.market.valuationSymbol,
    side: input.side,
    entry: input.entry,
    stop: input.geometry.stop,
    target: input.geometry.target,
    quantity: 1,
    pointValue: input.market.pointValue,
  }).risk;
  if (!positive(unit)) return undefined;
  const quantity =
    Math.floor(((input.balance * (input.riskPct / 100)) / unit) * 1e6) / 1e6;
  if (!positive(quantity)) return undefined;
  const metrics = tradeMetrics({
    market: input.market.id,
    valuationSymbol: input.market.valuationSymbol,
    side: input.side,
    entry: input.entry,
    stop: input.geometry.stop,
    target: input.geometry.target,
    quantity,
    pointValue: input.market.pointValue,
  });
  if (!positive(metrics.risk) || !positive(metrics.rr)) return undefined;
  return {
    id: input.id,
    side: input.side,
    entry: input.entry,
    stop: input.geometry.stop,
    target: input.geometry.target,
    quantity,
    riskPct: input.riskPct,
    effectiveRiskCapPct: input.riskPct,
    rr: metrics.rr,
    partialAt: input.geometry.target,
    initialRisk: metrics.risk,
    strategyIds: [input.strategy.id],
    strategyVersions: [input.strategy.version],
    rationale: [
      "Deterministic session automatic PAPER-only proposal. No broker or real-money order is used.",
      `Signal ${input.signalId}; source-owned full stop and target are retained without generic ATR or default-R substitution.`,
      "Automatic management is off: no partial or break-even rule is invented.",
    ],
    checklist: {
      sessionAutoPaper: AUTO_JOURNAL_MARKER,
      sessionSignalId: input.signalId,
      sessionGeometry: "source-owned-full-bracket",
      execution: "deterministic-session-not-ai",
    },
    analysis: input.analysis,
  };
}

export function canonicalSessionConsentUnchanged(input: {
  workspace: Workspace | null;
  signature: string;
  strategy: Strategy;
  config: SessionStrategyConfig;
  now: number;
}) {
  const consent = sessionAutoSettingsReason(
    (input.workspace?.settings as SettingsCarrier | undefined)
      ?.sessionAutoPaper,
    input.now,
  );
  if (consent.state !== "waiting" || !input.workspace || !consent.settings)
    return false;
  if (sessionConsentSignature(consent.settings) !== input.signature)
    return false;
  const current = configuredSessionStrategy(input.workspace, consent.settings);
  return Boolean(
    current.strategy &&
    current.config &&
    current.strategy.id === input.strategy.id &&
    current.strategy.version === input.strategy.version &&
    current.strategy.confluence?.contract.configVersion ===
      input.strategy.confluence?.contract.configVersion &&
    configSignature(current.config) === configSignature(input.config),
  );
}

async function scheduledBinding(db: any, userId: number) {
  const rows = await db
    .select({ taskUid: tradingSchedules.taskUid })
    .from(tradingSchedules)
    .where(eq(tradingSchedules.userId, userId))
    .limit(1);
  return Boolean(rows[0]);
}

async function scheduledRuntime(db: any, userId: number) {
  const id = `${SCHEDULE_RUNTIME_KIND}:${userId}`;
  const rows = await db
    .select({
      payload: tradingRuntimeState.payload,
      updatedAt: tradingRuntimeState.updatedAt,
    })
    .from(tradingRuntimeState)
    .where(
      and(
        eq(tradingRuntimeState.id, id),
        eq(tradingRuntimeState.userId, userId),
      ),
    )
    .limit(1);
  const payload = rows[0]?.payload as { lastScheduledAt?: unknown } | undefined;
  return typeof payload?.lastScheduledAt === "number" &&
    Number.isFinite(payload.lastScheduledAt)
    ? payload.lastScheduledAt
    : undefined;
}

async function recordScheduledCallback(db: any, userId: number, at: number) {
  const id = `${SCHEDULE_RUNTIME_KIND}:${userId}`;
  await db
    .insert(tradingRuntimeState)
    .values({
      id,
      userId,
      kind: SCHEDULE_RUNTIME_KIND,
      payload: { lastScheduledAt: at },
    })
    .onDuplicateKeyUpdate({
      set: { payload: { lastScheduledAt: at }, updatedAt: new Date(at) },
    });
}

async function backgroundState(
  db: any,
  userId: number,
  settings: SessionAutoSettings,
  now: number,
) {
  if (!settings.runWhenClosed || !ENV.isProduction)
    return {
      registered: false,
      backgroundReady: false,
      lastScheduledAt: undefined,
    };
  const actual = await backgroundStrategyStatus(userId);
  const registered = actual.schedulerRegistered;
  const lastScheduledAt = actual.lastScheduledHeartbeat ?? undefined;
  return {
    registered,
    backgroundReady: Boolean(
      registered &&
      lastScheduledAt &&
      lastScheduledAt <= now &&
      now - lastScheduledAt <= SCHEDULE_CALLBACK_FRESH_MS,
    ),
    lastScheduledAt,
  };
}

/** Cheap status only: no market price, source analysis, order, or model work occurs here. */
export async function sessionAutoStatus(
  user: User,
): Promise<SessionAutoStatus> {
  const now = Date.now();
  if (!mayUseApp(user))
    return {
      state: "blocked",
      message: "Automatic session paper controls are owner-only.",
      checkedAt: now,
    };
  try {
    const saved = await loadWorkspace(user.id);
    const consent = sessionAutoSettingsReason(
      (saved.workspace?.settings as SettingsCarrier | undefined)
        ?.sessionAutoPaper,
      now,
    );
    if (!saved.workspace || !consent.settings)
      return {
        state: consent.state,
        message: consent.reason,
        checkedAt: now,
        ...(consent.settings ? { settings: consent.settings } : {}),
      };
    if (consent.state !== "waiting")
      return {
        state: consent.state,
        message: consent.reason,
        checkedAt: now,
        settings: consent.settings,
      };
    const configured = configuredSessionStrategy(
      saved.workspace,
      consent.settings,
    );
    if (!configured.strategy || !configured.config)
      return {
        state: "blocked",
        message: configured.reason || "Session strategy is unavailable.",
        checkedAt: now,
        settings: consent.settings,
      };
    let backgroundReady = false;
    let lastScheduledAt: number | undefined;
    let backgroundMessage = "";
    if (consent.settings.runWhenClosed) {
      try {
        const db = await dbRequired();
        const background = await backgroundState(
          db,
          user.id,
          consent.settings,
          now,
        );
        backgroundReady = background.backgroundReady;
        lastScheduledAt = background.lastScheduledAt;
        backgroundMessage = !ENV.isProduction
          ? " Closed-app checks are unavailable until the deployed production backend runs."
          : !background.registered
            ? " Closed-app consent is saved, but no authenticated schedule binding exists."
            : backgroundReady
              ? " Closed-app callback is currently reporting."
              : " Closed-app consent is saved and registered, but no recent authenticated callback has reported.";
      } catch {
        backgroundMessage =
          " Closed-app schedule readiness cannot be verified.";
      }
    }
    return {
      state: "waiting",
      message: `Saved session paper consent is armed; deterministic current source evidence still controls every simulated entry.${backgroundMessage}`,
      checkedAt: now,
      settings: consent.settings,
      strategyVersion: configured.strategy.version,
      gateConfigVersion: configured.strategy.confluence!.contract.configVersion,
      backgroundReady,
      lastScheduledAt,
    };
  } catch {
    return {
      state: "blocked",
      message:
        "Canonical workspace status is unavailable; no automatic session paper check ran.",
      checkedAt: now,
    };
  }
}

function currentPositionReason(ledger: Trade[], market: string) {
  return ledger.some(
    (trade) =>
      trade.market === market &&
      (trade.status === "pending" || trade.status === "open"),
  )
    ? "A canonical pending or open paper position already exists for this market."
    : undefined;
}

async function immutableClaim(db: any, userId: number, id: string) {
  const rows = await db
    .select()
    .from(tradingPaperProposals)
    .where(
      and(
        eq(tradingPaperProposals.id, id),
        eq(tradingPaperProposals.userId, userId),
      ),
    )
    .limit(1);
  return rows[0]?.payload as PaperProposal | undefined;
}

function claimMatches(input: {
  proposal: PaperProposal;
  id: string;
  market: string;
  side: "long" | "short";
  strategy: Strategy;
  signalId: string;
}) {
  const proposal = input.proposal;
  return Boolean(
    proposal.id === input.id &&
    proposal.analysis.market === input.market &&
    proposal.side === input.side &&
    proposal.strategyIds.length === 1 &&
    proposal.strategyIds[0] === input.strategy.id &&
    proposal.strategyVersions.length === 1 &&
    proposal.strategyVersions[0] === input.strategy.version &&
    proposal.checklist?.sessionAutoPaper === AUTO_JOURNAL_MARKER &&
    proposal.checklist?.sessionSignalId === input.signalId,
  );
}

/**
 * Server-only automatic PAPER entry. The origin is not a client-selectable router
 * field: foreground is the default; an already authenticated schedule callback is
 * the only parent-owned caller allowed to pass "scheduled".
 */
export async function checkSessionAutoPaper(
  user: User,
  origin: SessionAutoOrigin = "foreground",
  callbackDeadline?: number,
): Promise<SessionAutoResult> {
  const now = Date.now();
  if (!mayUseApp(user))
    return result(
      "blocked",
      "Automatic session paper execution is owner-only.",
    );
  if (origin !== "foreground" && origin !== "scheduled")
    return result("blocked", "Automatic session paper origin is invalid.");
  let db: Awaited<ReturnType<typeof dbRequired>>;
  try {
    db = await dbRequired();
  } catch {
    return result(
      "blocked",
      "Canonical database is unavailable; no automatic paper order was attempted.",
    );
  }
  if (origin === "scheduled") {
    if (!ENV.isProduction)
      return result(
        "blocked",
        "Scheduled session paper execution is disabled outside deployed production.",
      );
    try {
      if (!(await scheduledBinding(db, user.id)))
        return result(
          "blocked",
          "Scheduled session paper execution has no authenticated schedule binding.",
        );
      const actual = await backgroundStrategyStatus(user.id);
      if (!actual.callbackRecent)
        return result(
          "blocked",
          "A recent completed authenticated owner callback is required before background paper source/order work.",
        );
    } catch {
      return result(
        "blocked",
        "Scheduled session paper binding cannot be verified.",
      );
    }
  }

  const locked = await withOwnerAutoLock(db as any, user.id, async (rootDb) => {
    const saved = await loadWorkspace(user.id);
    const consent = sessionAutoSettingsReason(
      (saved.workspace?.settings as SettingsCarrier | undefined)
        ?.sessionAutoPaper,
      now,
    );
    if (consent.state === "off") return result("off", consent.reason);
    if (consent.state === "blocked") return result("blocked", consent.reason);
    if (!saved.workspace || !consent.settings)
      return result("blocked", "Canonical session consent is unavailable.");
    if (origin === "scheduled" && consent.settings.runWhenClosed !== true)
      return result(
        "blocked",
        "Scheduled session paper execution requires canonical run-when-closed consent.",
      );
    if (origin === "scheduled") {
      try {
        await recordScheduledCallback(rootDb, user.id, now);
      } catch {
        return result(
          "blocked",
          "Authenticated scheduled callback could not be recorded; no session order was attempted.",
        );
      }
    }
    const workspace = saved.workspace;
    const signature = sessionConsentSignature(consent.settings);
    const configured = configuredSessionStrategy(workspace, consent.settings);
    if (!configured.strategy || !configured.config)
      return result(
        "blocked",
        configured.reason || "Session strategy is unavailable.",
      );
    const strategy = configured.strategy;
    const config = configured.config;
    const side = strategy.confluence!.binding.side!;
    const localDay = sessionLocalDay(now, config.timezone);
    if (!localDay)
      return result(
        "blocked",
        "The source strategy local trading day cannot be determined.",
      );

    let market: Market;
    try {
      market = await marketFor(user, consent.settings.market);
    } catch {
      return result(
        "blocked",
        "The owner-selected market is unavailable for this automatic session strategy.",
      );
    }
    if (
      market.id !== consent.settings.market ||
      market.paperSupported === false
    )
      return result(
        "blocked",
        "The owner-selected market identity is not currently paper-supported.",
      );

    const beforeSourceLedger = await canonicalTrades(rootDb, user.id);
    const beforeSourceRisk = sessionRiskAndDisciplineReason({
      workspace,
      ledger: beforeSourceLedger,
      market: market.id,
      side,
      proposedRisk: 0,
      now,
    });
    if (beforeSourceRisk) return result("blocked", beforeSourceRisk);
    const initialPosition = currentPositionReason(
      beforeSourceLedger,
      market.id,
    );
    if (initialPosition) return result("blocked", initialPosition);
    const initialDailyCount = await dailyAutomaticCount(
      rootDb,
      user.id,
      config.timezone,
      now,
    );
    if (initialDailyCount === undefined)
      return result("blocked", "The source-local day cap cannot be verified.");
    if (initialDailyCount >= consent.settings.maxTradesPerDay)
      return result(
        "blocked",
        `The automatic session source-local-day cap (${consent.settings.maxTradesPerDay}) has been reached.`,
      );

    let analysis: SetupAnalysis;
    try {
      analysis = await setupAnalysis(
        user,
        {
          market: market.id,
          timeframe: config.executionTimeframe,
          strategies: [strategy],
          strategyIds: [strategy.id],
          combination: "all",
          timezone: config.timezone,
        },
        Math.min(
          Date.now() + 25_000,
          callbackDeadline ?? Number.POSITIVE_INFINITY,
        ),
        { proposalOnly: true },
      );
    } catch (error) {
      return result(
        "waiting",
        `Current session source analysis is unavailable: ${error instanceof Error ? error.message : "unknown source error"}`,
      );
    }
    const candidateState = criticalSessionCandidateReason({
      analysis,
      strategy,
      config,
      side,
      now: Date.now(),
    });
    if (
      !candidateState.candidate ||
      !candidateState.context ||
      candidateState.decisionBar === undefined
    )
      return result(
        "waiting",
        candidateState.reason || "Current session candidate is not ready.",
      );
    const gate = analysis.confluenceEvaluations?.[strategy.id] as
      | Gate
      | undefined;
    if (!sessionGateEligible(gate, strategy))
      return result(
        "blocked",
        "The current same-version approved session confluence gate is not eligible.",
      );
    try {
      enforceStrategyGate(
        {
          side,
          analysis,
          strategyIds: [strategy.id],
          strategyVersions: [strategy.version],
        } as PaperProposal,
        [strategy],
        analysis,
        Date.now(),
      );
    } catch (error) {
      return result(
        "blocked",
        error instanceof Error
          ? error.message
          : "The session strategy gate is blocked.",
      );
    }

    let quote: Awaited<ReturnType<typeof getQuote>>;
    try {
      quote = await getQuote(
        market.id,
        user,
        Math.min(
          Date.now() + 8_000,
          callbackDeadline ?? Number.POSITIVE_INFINITY,
        ),
      );
    } catch {
      return result(
        "waiting",
        "A fresh owner-selected market quote is required for session paper entry.",
      );
    }
    const entry = freshEntry(quote, side);
    if (!entry)
      return result(
        "waiting",
        "A fresh owner-selected market quote is required for session paper entry.",
      );
    let geometry: SessionGeometry;
    try {
      geometry = sessionPaperGeometry(
        config,
        candidateState.context,
        side,
        entry,
        candidateState.candidate.stop!,
      );
    } catch (error) {
      return result(
        "blocked",
        `The exact source-owned session stop/target bracket is unavailable at the current paper indication; no default R or ATR bracket was substituted. ${error instanceof Error ? error.message : ""}`.trim(),
      );
    }

    const pdcQuote =
      config.family === "pdc-continuation"
        ? pdcSignalQuote(candidateState.context)
        : undefined;
    if (config.family === "pdc-continuation" && !pdcQuote)
      return result(
        "blocked",
        "PDC quote-pair identity is unavailable for a durable automatic signal.",
      );
    const signalId = deterministicSessionSignalId({
      userId: user.id,
      strategyId: strategy.id,
      strategyVersion: strategy.version,
      config,
      market: market.id,
      side,
      source: analysis.source,
      decisionBar: candidateState.decisionBar,
      pdcQuote,
    });

    // After all awaited source reads, recheck immutable consent/config, all canonical risk guards,
    // local-day count, active positions, and existing durable claims before a write/order attempt.
    const latest = await loadWorkspace(user.id);
    if (
      !canonicalSessionConsentUnchanged({
        workspace: latest.workspace,
        signature,
        strategy,
        config,
        now: Date.now(),
      })
    )
      return result(
        "blocked",
        "Canonical session consent, expiry, strategy, or gate configuration changed during source checks; no paper order was sent.",
        { signalId },
      );
    const latestLedger = await canonicalTrades(rootDb, user.id);
    const latestWorkspace = latest.workspace!;
    const latestRisk = sessionRiskAndDisciplineReason({
      workspace: latestWorkspace,
      ledger: latestLedger,
      market: market.id,
      side,
      proposedRisk: 0,
      now: Date.now(),
    });
    if (latestRisk) return result("blocked", latestRisk, { signalId });
    const activeReason = currentPositionReason(latestLedger, market.id);
    if (activeReason) return result("blocked", activeReason, { signalId });
    const latestCount = await dailyAutomaticCount(
      rootDb,
      user.id,
      config.timezone,
      Date.now(),
    );
    if (latestCount === undefined)
      return result("blocked", "The source-local day cap cannot be verified.", {
        signalId,
      });
    if (latestCount >= consent.settings.maxTradesPerDay)
      return result(
        "blocked",
        `The automatic session source-local-day cap (${consent.settings.maxTradesPerDay}) has been reached.`,
        { signalId },
      );
    const existingClaim = await immutableClaim(rootDb, user.id, signalId);
    if (existingClaim)
      return claimMatches({
        proposal: existingClaim,
        id: signalId,
        market: market.id,
        side,
        strategy,
        signalId,
      })
        ? result(
            "duplicate",
            "This deterministic session signal already has a durable claim or canonical paper order.",
            { signalId, strategyId: strategy.id, market: market.id },
          )
        : result(
            "blocked",
            "The durable session signal claim belongs to a different owner or scope; it was not reused.",
            { signalId },
          );

    const balance = paperPerformance(
      latestLedger,
      latestWorkspace.paperStartingBalance,
      [],
      Date.now(),
    ).balance;
    const proposal = createSessionAutoProposal({
      id: signalId,
      analysis,
      candidate: candidateState.candidate,
      market,
      side,
      entry,
      geometry,
      balance,
      riskPct: consent.settings.riskPct,
      strategy,
      signalId,
    });
    if (!proposal)
      return result(
        "blocked",
        "Session paper sizing could not be derived from realized canonical balance and the exact source bracket.",
        { signalId },
      );
    const finalRisk = sessionRiskAndDisciplineReason({
      workspace: latestWorkspace,
      ledger: latestLedger,
      market: market.id,
      side,
      proposedRisk: proposal.initialRisk,
      now: Date.now(),
    });
    if (finalRisk) return result("blocked", finalRisk, { signalId });

    // The lock transaction never owns an uncommitted claim: root-db INSERT IGNORE commits before
    // createPaperOrder reads the proposal using a separate connection.
    if (callbackDeadline !== undefined && Date.now() >= callbackDeadline)
      return result(
        "waiting",
        "Scheduled source budget expired before the signal claim; work deferred.",
        { signalId },
      );
    await rootDb
      .insert(tradingPaperProposals)
      .values({
        id: signalId,
        userId: user.id,
        market: market.id,
        payload: proposal,
      })
      .ignore();
    const claimed = await immutableClaim(rootDb, user.id, signalId);
    if (
      !claimed ||
      !claimMatches({
        proposal: claimed,
        id: signalId,
        market: market.id,
        side,
        strategy,
        signalId,
      })
    )
      return result(
        "blocked",
        "The durable session signal claim could not be verified; no paper order was sent.",
        { signalId },
      );

    // One last off/expiry/version recheck immediately before the canonical order lifecycle.
    const beforeOrder = await loadWorkspace(user.id);
    if (
      !canonicalSessionConsentUnchanged({
        workspace: beforeOrder.workspace,
        signature,
        strategy,
        config,
        now: Date.now(),
      })
    )
      return result(
        "blocked",
        "Canonical session consent, expiry, strategy, or gate configuration changed before order submission.",
        { signalId },
      );
    const beforeOrderLedger = await canonicalTrades(rootDb, user.id);
    const beforeOrderPosition = currentPositionReason(
      beforeOrderLedger,
      market.id,
    );
    if (beforeOrderPosition)
      return result("blocked", beforeOrderPosition, { signalId });
    if (callbackDeadline !== undefined && Date.now() >= callbackDeadline)
      return result(
        "waiting",
        "Scheduled source budget expired before order submission; no new order was attempted.",
        { signalId },
      );
    try {
      const trade = await createPaperOrder(user, {
        proposalId: signalId,
        entry,
        stop: geometry.stop,
        target: geometry.target,
        quantity: proposal.quantity,
        orderType: "market",
        targetMode: "price",
        autoManage: false,
        entryMode: "strategy",
        journal: {
          sessionAutoPaper: AUTO_JOURNAL_MARKER,
          sessionAutoSignalId: signalId,
          sessionAutoGeometry: "source-owned-full-stop-target",
          sessionAutoSource: analysis.source,
          executionPolicy: "deterministic-session; no-ai-or-model-trigger",
          management: "off; no source partial or break-even rule was invented",
        },
      });
      return result(
        "placed",
        "Deterministic session paper order recorded. No broker order was sent.",
        {
          strategyId: strategy.id,
          market: market.id,
          tradeId: trade.id,
          signalId,
        },
      );
    } catch (error) {
      return result(
        "blocked",
        `Session paper order was not confirmed: ${error instanceof Error ? error.message : "paper order failed without a retry"}`,
        { signalId },
      );
    }
  });

  if (!locked.acquired)
    return result(
      "busy",
      locked.reason || "A serialized automatic paper check is already active.",
    );
  return (
    locked.value ||
    result("blocked", "Session paper check did not produce a safe result.")
  );
}
