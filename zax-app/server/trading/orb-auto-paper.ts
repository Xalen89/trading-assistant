import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { User } from "../../drizzle/schema";
import {
  tradingPaperProposals,
  tradingPaperTrades,
} from "../../drizzle/schema";
import type {
  Candle,
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
  ORB_CRITICAL_STEP_IDS,
  orbConfigSchema,
  orbEntryWindowOpen,
  type OrbConfig,
  type OrbContext,
  type OrbInstrumentMetadata,
} from "../../lib/trading/orb-model";
import {
  isNas100CfdMarket,
  resolveOrbMarketProfile,
} from "../../lib/trading/orb-market-profile";
import { orbPaperGeometry } from "../../lib/trading/orb-strategy";
import {
  orbAutoPaperSettingsSchema,
  type OrbAutoPaperResult,
  type OrbAutoPaperSettings,
} from "../../lib/trading/orb-auto-types";
import { paperPerformance } from "../../lib/trading/paper-performance";
import { tradeMetrics } from "../../lib/trading/engine";
import { evaluateDiscipline } from "../../lib/trading/trading-discipline";
import { selectDisciplineGuards } from "../../lib/trading/discipline-policy";
import { mayUseApp } from "./access";
import { dbRequired, loadWorkspace } from "./repository";
import { activePaperTrades } from "./setup-history";
import { createPaperOrder } from "./paper-service";
import { enforceStrategyGate } from "./paper-gate";
import { getQuote } from "./market";
import { marketFor, setupAnalysis } from "./setup-service";

type SettingsCarrier = { orbAutoPaper?: unknown };
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
type LockDb = { execute?: (query: unknown) => Promise<unknown> };
type LockResult<T> = { acquired: boolean; value?: T; reason?: string };

type OrbGeometry = { target: number; stop: number; riskDistance: number };

export type OrbAutoPaperStatus = {
  state: OrbAutoPaperResult["state"];
  message: string;
  checkedAt: number;
  settings?: OrbAutoPaperSettings;
  blockReasons?: string[];
  strategyVersion?: number;
  gateConfigVersion?: number;
};

const MAX_EXPIRY_MS = 24 * 60 * 60 * 1000;
const AUTO_JOURNAL_MARKER = "v1";
const AUTO_LOCK_TIMEOUT_SECONDS = 1;
const ENTRY_TIMEFRAME = "1m" as const;

function result(
  state: OrbAutoPaperResult["state"],
  message: string,
  extra: Partial<OrbAutoPaperResult> = {},
): OrbAutoPaperResult {
  return { state, message, checkedAt: Date.now(), ...extra };
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function settingsFrom(workspace: Workspace | null | undefined) {
  return orbAutoPaperSettingsSchema.safeParse(
    (workspace?.settings as SettingsCarrier | undefined)?.orbAutoPaper,
  );
}

/** Stable only for the strict, persisted consent shape; no UI/local draft can activate it. */
export function orbConsentSignature(settings: OrbAutoPaperSettings) {
  return JSON.stringify({
    version: settings.version,
    enabled: settings.enabled,
    strategyId: settings.strategyId,
    market: settings.market,
    riskPct: settings.riskPct,
    maxTradesPerDay: settings.maxTradesPerDay,
    armedAt: settings.armedAt,
    expiresAt: settings.expiresAt,
  });
}

export function orbAutoSettingsReason(
  raw: unknown,
  now = Date.now(),
): {
  settings?: OrbAutoPaperSettings;
  state: "off" | "blocked" | "waiting";
  reason: string;
} {
  if (raw === undefined)
    return { state: "off", reason: "Automatic ORB paper trading is off." };
  const parsed = orbAutoPaperSettingsSchema.safeParse(raw);
  if (!parsed.success)
    return {
      state: "blocked",
      reason: "Saved ORB paper consent is invalid; no order can be created.",
    };
  const settings = parsed.data;
  if (!settings.enabled)
    return {
      settings,
      state: "off",
      reason: "Automatic ORB paper trading is off.",
    };
  if (!settings.armedAt || !settings.expiresAt)
    return {
      settings,
      state: "blocked",
      reason: "Saved ORB paper consent is missing its arm/expiry times.",
    };
  if (settings.armedAt > now + 30000)
    return {
      settings,
      state: "blocked",
      reason: "The saved ORB arm time has not begun on the server clock.",
    };
  if (
    settings.expiresAt <= settings.armedAt ||
    settings.expiresAt - settings.armedAt > MAX_EXPIRY_MS ||
    settings.expiresAt <= now
  )
    return {
      settings,
      state: "blocked",
      reason: "Automatic ORB paper consent has expired.",
    };
  return {
    settings,
    state: "waiting",
    reason: "Saved ORB paper consent is active.",
  };
}

function timeParts(now: number, timezone: string) {
  try {
    const entries = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(now));
    const byType = Object.fromEntries(
      entries.map((part) => [part.type, part.value]),
    );
    const n = (name: string) => Number(byType[name]);
    const year = n("year"),
      month = n("month"),
      day = n("day"),
      hour = n("hour"),
      minute = n("minute"),
      second = n("second");
    if ([year, month, day, hour, minute, second].every(Number.isFinite))
      return { year, month, day, hour, minute, second };
  } catch {
    // Invalid time zones are separately rejected by the strategy config check.
  }
  return undefined;
}

/** Entry clock is 09:00 inclusive and 11:00 exclusive in the confirmed ORB time zone. */
export function isOrbEntryWindow(now: number, timezone: string) {
  return orbEntryWindowOpen(now / 1000, timezone as OrbConfig["timezone"]);
}

export function orbLocalDay(now: number, timezone: string) {
  const local = timeParts(now, timezone);
  return local
    ? `${String(local.year).padStart(4, "0")}-${String(local.month).padStart(2, "0")}-${String(local.day).padStart(2, "0")}`
    : undefined;
}

/** Converts the owner-selected local calendar day to an exact UTC range without a client supplied date. */
export function orbLocalDayBounds(now: number, timezone: string) {
  const local = timeParts(now, timezone);
  if (!local) return undefined;
  const date = { year: local.year, month: local.month, day: local.day };
  const desired = Date.UTC(date.year, date.month - 1, date.day);
  const offsetAt = (instant: number) => {
    const p = timeParts(instant, timezone);
    if (!p) return undefined;
    return (
      Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - instant
    );
  };
  // A second pass correctly handles a DST offset change at a local midnight.
  const firstOffset = offsetAt(desired);
  if (firstOffset === undefined) return undefined;
  let start = desired - firstOffset;
  const correctedOffset = offsetAt(start);
  if (correctedOffset === undefined) return undefined;
  start = desired - correctedOffset;
  const tomorrow = new Date(Date.UTC(date.year, date.month - 1, date.day + 1));
  const nextDesired = Date.UTC(
    tomorrow.getUTCFullYear(),
    tomorrow.getUTCMonth(),
    tomorrow.getUTCDate(),
  );
  const nextFirstOffset = offsetAt(nextDesired);
  if (nextFirstOffset === undefined) return undefined;
  let end = nextDesired - nextFirstOffset;
  const nextCorrectedOffset = offsetAt(end);
  if (nextCorrectedOffset === undefined) return undefined;
  end = nextDesired - nextCorrectedOffset;
  return { start, end };
}

export function deterministicOrbProposalId(input: {
  userId: number;
  strategyId: string;
  strategyVersion: number;
  market: string;
  confirmationBar: number;
  localDay: string;
}) {
  const safe = [
    input.userId,
    input.strategyId,
    input.strategyVersion,
    input.market,
    Math.floor(input.confirmationBar),
    input.localDay,
  ]
    .map((part) => String(part).replace(/[^A-Za-z0-9_-]/g, "_"))
    .join("_");
  return `orb_auto_${safe}`.slice(0, 100);
}

export function isAutomaticOrbPaperTrade(trade: Pick<Trade, "journal">) {
  return trade.journal?.orbAutoPaper === AUTO_JOURNAL_MARKER;
}

function expectedOrbConfig(config: OrbConfig | undefined): string | undefined {
  const parsed = orbConfigSchema.safeParse(config);
  if (!parsed.success || parsed.data.version !== 1 || parsed.data.confirmed !== true)
    return "The ORB strategy is not explicitly confirmed.";
  config = parsed.data;
  if (
    config.executionTimeframe !== "1m" ||
    config.midpoint !== "opening-range-50" ||
    config.breakout !== "closed-outside-range" ||
    config.confirmation !== "close-beyond-retest" ||
    config.stop !== "retest-wick-plus-tick" ||
    config.stopBufferTicks !== 1
  )
    return "The saved ORB configuration does not match the confirmed closed-bar, 50% retest, and one-tick stop rules.";
  if (!timeParts(Date.now(), config.timezone))
    return "The saved ORB time zone is invalid.";
  return undefined;
}

function sameOrbConfig(
  left: OrbConfig | undefined,
  right: OrbConfig | undefined,
) {
  const parsedLeft = orbConfigSchema.safeParse(left);
  const parsedRight = orbConfigSchema.safeParse(right);
  return (
    parsedLeft.success &&
    parsedRight.success &&
    JSON.stringify(parsedLeft.data) === JSON.stringify(parsedRight.data)
  );
}

function configuredOrbStrategy(
  workspace: Workspace,
  settings: OrbAutoPaperSettings,
): { strategy?: Strategy; reason?: string } {
  const strategy = workspace.strategies.find(
    (item) => item.id === settings.strategyId,
  );
  if (!strategy || strategy.archived)
    return {
      reason: "The selected canonical ORB strategy is missing or archived.",
    };
  if (strategy.setupFamily !== "orb")
    return { reason: "The selected strategy is not the ORB setup family." };
  const configReason = expectedOrbConfig(strategy.orbConfig);
  if (configReason) return { reason: configReason };
  if (
    !strategy.confluence ||
    strategy.confluence.contract.strategyId !== strategy.id ||
    strategy.confluence.contract.strategyVersion !== strategy.version ||
    strategy.confluence.contract.approval.status !== "approved"
  )
    return {
      reason:
        "A same-version approved ORB confluence configuration is required.",
    };
  if (
    strategy.confluence.binding.side !== "long" &&
    strategy.confluence.binding.side !== "short"
  )
    return {
      reason:
        "The approved ORB confluence must specify one deterministic side.",
    };
  return { strategy };
}

/** Never reinterpret a saved NQ/ES consent as a broker CFD, or vice versa. */
function selectedOrbMarketReason(
  market: Market,
  settings: OrbAutoPaperSettings,
  config: OrbConfig,
) {
  if (market.id !== settings.market)
    return "The selected market did not exactly match the saved ORB paper consent.";
  const mode = config.marketMode ?? "native-futures";
  if (mode === "nas100-cfd") {
    if (
      !/^TL:\d{1,18}$/.test(settings.market) ||
      config.instrumentMarket !== settings.market ||
      !isNas100CfdMarket(market)
    )
      return "NAS100 CFD automatic paper use requires the exact saved TradeLocker NAS100 market and matching configured instrument; no other CFD, crypto, metal, alias, or native-futures consent is remapped.";
    return undefined;
  }
  if (settings.market !== "NQ" && settings.market !== "ES")
    return "A broker market id requires explicit NAS100 CFD mode and matching instrument configuration; it is not authorized by native-futures consent.";
  try {
    const profile = resolveOrbMarketProfile(market, config);
    return profile.mode === "native-futures"
      ? undefined
      : "The selected market mode is not native futures.";
  } catch {
    return "Selected market identity is not the exact configured NQ/ES futures instrument.";
  }
}

export function criticalOrbCandidateReason(input: {
  analysis: Pick<
    SetupAnalysis,
    | "market"
    | "timeframe"
    | "source"
    | "candles"
    | "candidates"
    | "orbContexts"
  >;
  strategy: Strategy;
  side: "long" | "short";
  market?: string;
}): {
  candidate?: SetupCandidate;
  confirmationBar?: number;
  context?: OrbContext;
  reason?: string;
} {
  const { analysis, strategy, side } = input;
  if (input.market && analysis.market !== input.market)
    return {
      reason:
        "ORB source analysis did not remain on the owner-selected market; no market substitution is allowed.",
    };
  if (analysis.timeframe !== ENTRY_TIMEFRAME)
    return {
      reason: "ORB automation requires exact 1-minute closed-bar analysis.",
    };
  if (!text(analysis.source))
    return { reason: "The current ORB source is unnamed or unavailable." };
  const context = analysis.orbContexts?.filter(
    (item) =>
      item.strategyId === strategy.id &&
      item.timezone === strategy.orbConfig?.timezone,
  );
  if (context?.length !== 1 || !context[0].range)
    return {
      reason:
        "The current same-strategy ORB range/clock context is unavailable.",
    };
  if (!sameOrbConfig(context[0].config, strategy.orbConfig))
    return {
      reason:
        "The current ORB source context does not contain the exact approved execution configuration.",
    };
  const confirmationBar = analysis.candles.at(-1);
  if (!confirmationBar || !Number.isFinite(confirmationBar.time))
    return { reason: "The latest actual confirmation bar is unavailable." };
  const candidates = analysis.candidates.filter(
    (candidate) =>
      candidate.strategyId === strategy.id &&
      candidate.strategyVersion === strategy.version &&
      candidate.family === "orb" &&
      candidate.side === side &&
      candidate.ready,
  );
  if (candidates.length !== 1)
    return {
      reason: "A single current same-version ready ORB candidate is required.",
    };
  const candidate = candidates[0];
  const steps = new Map(candidate.steps.map((step) => [step.id, step.status]));
  const missing = ORB_CRITICAL_STEP_IDS.filter((id) => steps.get(id) !== "met");
  if (missing.length)
    return {
      reason: `ORB critical evidence is not fully met: ${missing.join(", ")}.`,
    };
  if (!finitePositive(candidate.stop))
    return { reason: "The ORB retest-wick stop is unavailable." };
  return { candidate, confirmationBar: confirmationBar.time, context: context[0] };
}

function quoteFresh(quote: Awaited<ReturnType<typeof getQuote>>) {
  return (
    quote.status === "live" &&
    Number.isFinite(quote.timestamp) &&
    Date.now() / 1000 - quote.timestamp <= 120 &&
    quote.timestamp <= Date.now() / 1000 + 30 &&
    finitePositive(quote.price)
  );
}

function actualEntry(
  side: "long" | "short",
  quote: Awaited<ReturnType<typeof getQuote>>,
) {
  const value =
    side === "long" ? quote.ask || quote.price : quote.bid || quote.price;
  return finitePositive(value) ? value : undefined;
}

/** Uses the profile checked against current source metadata; no local CME/default fallback exists. */
function sourceOrbGeometry(
  market: Market,
  side: "long" | "short",
  entry: number,
  stop: number,
  config: OrbConfig,
  metadata?: OrbInstrumentMetadata,
): OrbGeometry | undefined {
  try {
    const profile = resolveOrbMarketProfile(market, config, metadata);
    const geometry = orbPaperGeometry(market, side, entry, stop, config, metadata);
    if (!geometry || !finitePositive(geometry.target) || geometry.rr !== 3)
      return undefined;
    const tickAligned = (value: number) =>
      Math.abs(value / profile.tick - Math.round(value / profile.tick)) <
      0.000001;
    const riskDistance = Math.abs(entry - stop);
    const target =
      side === "long" ? entry + riskDistance * 3 : entry - riskDistance * 3;
    const targetDistance = Math.abs(target - entry);
    if (
      !finitePositive(entry) ||
      !finitePositive(stop) ||
      (side === "long" ? stop >= entry : stop <= entry) ||
      !tickAligned(entry) ||
      !tickAligned(stop) ||
      !tickAligned(target) ||
      targetDistance < profile.minimumTargetPoints ||
      targetDistance > profile.maximumTargetPoints ||
      Math.abs(geometry.target - target) > 0.000001
    )
      return undefined;
    return { target, stop, riskDistance };
  } catch {
    return undefined;
  }
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

async function withOwnerAutoLock<T>(
  db: {
    transaction?: (
      run: (tx: any) => Promise<LockResult<T>>,
    ) => Promise<LockResult<T>>;
  },
  userId: number,
  work: (tx: any) => Promise<T>,
): Promise<LockResult<T>> {
  if (typeof db.transaction !== "function")
    return {
      acquired: false,
      reason:
        "The database driver cannot provide a transaction-bound advisory lock.",
    };
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
              "Another ORB paper check is active; no concurrent order was attempted.",
          };
        // Reserve this connection solely for GET_LOCK/RELEASE_LOCK. Data uses
        // root-db autocommit so createPaperOrder/readProposal on another pool
        // connection can see the immutable claim before attempting its fill.
        // No claim or order write is held uncommitted in this lock transaction.
        return { acquired: true, value: await work(db) };
      } finally {
        if (acquired) {
          try {
            await tx.execute(sql`SELECT RELEASE_LOCK(${name}) AS released`);
          } catch {
            // The transaction still ends on this same connection; fail closed on the next check.
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

async function canonicalTrades(tx: any, userId: number): Promise<Trade[]> {
  const rows = await tx
    .select()
    .from(tradingPaperTrades)
    .where(eq(tradingPaperTrades.userId, userId));
  return rows.map((row: { payload: unknown }) => row.payload as Trade);
}

export function canonicalConsentUnchanged(
  workspace: Workspace | null,
  signature: string,
  strategy: Strategy,
  now: number,
) {
  const consent = orbAutoSettingsReason(
    (workspace?.settings as SettingsCarrier | undefined)?.orbAutoPaper,
    now,
  );
  if (consent.state !== "waiting") return false;
  if (
    !workspace ||
    !consent.settings ||
    consent.settings.enabled !== true ||
    consent.settings.expiresAt! <= now
  )
    return false;
  if (orbConsentSignature(consent.settings) !== signature) return false;
  const current = configuredOrbStrategy(workspace, consent.settings).strategy;
  return Boolean(
    current &&
    current.id === strategy.id &&
    current.version === strategy.version &&
    current.confluence?.contract.configVersion ===
      strategy.confluence?.contract.configVersion &&
    sameOrbConfig(current.orbConfig, strategy.orbConfig),
  );
}

async function dailyAutomaticCount(
  tx: any,
  userId: number,
  timezone: string,
  now: number,
) {
  const range = orbLocalDayBounds(now, timezone);
  if (!range) return undefined;
  // No history limit: pending, open, closed, and cancelled canonical orders count.
  const rows = await tx
    .select({ payload: tradingPaperTrades.payload })
    .from(tradingPaperTrades)
    .where(
      and(
        eq(tradingPaperTrades.userId, userId),
        gte(tradingPaperTrades.createdAt, new Date(range.start)),
        lt(tradingPaperTrades.createdAt, new Date(range.end)),
      ),
    );
  return rows.filter((row: { payload: unknown }) =>
    isAutomaticOrbPaperTrade(row.payload as Trade),
  ).length;
}

export function orbRiskAndDisciplineReason(
  workspace: Workspace,
  ledger: Trade[],
  market: string,
  side: "long" | "short",
  now: number,
) {
  if (!finitePositive(workspace.paperStartingBalance))
    return "A positive canonical paper starting balance is required.";
  const drawdownLimit = workspace.settings.dailyDrawdownLimitPct;
  if (!finitePositive(drawdownLimit))
    return "A positive existing daily drawdown limit is required before automatic ORB paper use.";
  const performance = paperPerformance(
    ledger,
    workspace.paperStartingBalance,
    [],
    now,
  );
  if (performance.todayClosedDrawdownPct === null)
    return "Canonical paper drawdown cannot be verified from the retained ledger.";
  if (performance.todayClosedDrawdownPct >= drawdownLimit)
    return "The canonical daily paper drawdown limit has been reached.";
  const report = evaluateDiscipline(ledger, {
    now,
    proposedRisk: 0, // This pass evaluates active global guards before source/order construction.
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

/**
 * The pure ledger portion of each late automatic-entry guard. It is used after
 * awaited source work and immediately before the sole paper lifecycle call, so
 * an interleaved manual entry cannot inherit the earlier empty occupancy read.
 */
export function orbLateLedgerReason(input: {
  workspace: Workspace;
  ledger: Trade[];
  market: string;
  side: "long" | "short";
  dailyCount: number | undefined;
  maxTradesPerDay: number;
  now: number;
}) {
  const riskReason = orbRiskAndDisciplineReason(
    input.workspace,
    input.ledger,
    input.market,
    input.side,
    input.now,
  );
  if (riskReason) return riskReason;
  if (
    input.ledger.some(
      (trade) =>
        trade.market === input.market &&
        (trade.status === "pending" || trade.status === "open"),
    )
  )
    return "A canonical pending or open paper position already exists for this market.";
  if (input.dailyCount === undefined)
    return "The local day cap cannot be verified.";
  if (input.dailyCount >= input.maxTradesPerDay)
    return `The automatic ORB local-day cap (${input.maxTradesPerDay}) has been reached.`;
  return undefined;
}

async function revalidateOrbAutomaticEntry(input: {
  db: any;
  userId: number;
  signature: string;
  strategy: Strategy;
  market: string;
  side: "long" | "short";
}) {
  const now = Date.now();
  const latest = await loadWorkspace(input.userId);
  if (
    !canonicalConsentUnchanged(
      latest.workspace,
      input.signature,
      input.strategy,
      now,
    )
  )
    return {
      reason:
        "Canonical ORB consent, expiry, or strategy version changed during source checks; no paper order was sent.",
    };
  const workspace = latest.workspace!;
  const settings = orbAutoSettingsReason(
    (workspace.settings as SettingsCarrier).orbAutoPaper,
    now,
  ).settings;
  const current = settings
    ? configuredOrbStrategy(workspace, settings).strategy
    : undefined;
  if (!settings || !current || !isOrbEntryWindow(now, current.orbConfig!.timezone))
    return {
      reason:
        "Canonical ORB consent, source clock, or approved strategy is no longer eligible; no paper order was sent.",
    };
  const localDay = orbLocalDay(now, current.orbConfig!.timezone);
  if (!localDay)
    return { reason: "The ORB local trading day cannot be determined." };
  const ledger = await canonicalTrades(input.db, input.userId);
  const dailyCount = await dailyAutomaticCount(
    input.db,
    input.userId,
    current.orbConfig!.timezone,
    now,
  );
  const guard = orbLateLedgerReason({
    workspace,
    ledger,
    market: input.market,
    side: input.side,
    dailyCount,
    maxTradesPerDay: settings.maxTradesPerDay,
    now,
  });
  return guard ? { reason: guard } : { workspace, ledger, localDay };
}

export function orbGateEligible(gate: Gate | undefined, strategy: Strategy) {
  return Boolean(
    gate?.strategyEntryEligible &&
    gate.snapshot?.approval?.status === "approved" &&
    gate.snapshot?.version?.strategyId === strategy.id &&
    gate.snapshot?.version?.strategyVersion === strategy.version &&
    gate.snapshot?.version?.configVersion ===
      strategy.confluence?.contract.configVersion,
  );
}

function proposalFor(input: {
  id: string;
  analysis: SetupAnalysis;
  candidate: SetupCandidate;
  market: Market;
  side: "long" | "short";
  entry: number;
  geometry: OrbGeometry;
  balance: number;
  riskPct: 1 | 2;
  strategy: Strategy;
  signalKey: string;
}): PaperProposal | undefined {
  const perUnit = tradeMetrics({
    market: input.market.id,
    valuationSymbol: input.market.valuationSymbol,
    side: input.side,
    entry: input.entry,
    stop: input.geometry.stop,
    target: input.geometry.target,
    quantity: 1,
    pointValue: input.market.pointValue,
  }).risk;
  if (!finitePositive(perUnit)) return undefined;
  const quantity =
    Math.floor(((input.balance * (input.riskPct / 100)) / perUnit) * 1e6) / 1e6;
  if (!finitePositive(quantity)) return undefined;
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
  if (!finitePositive(metrics.risk) || Math.abs(metrics.rr - 3) > 0.000001)
    return undefined;
  return {
    id: input.id,
    side: input.side,
    entry: input.entry,
    stop: input.geometry.stop,
    target: input.geometry.target,
    quantity,
    riskPct: input.riskPct,
    effectiveRiskCapPct: input.riskPct,
    rr: 3,
    partialAt: input.geometry.target,
    initialRisk: metrics.risk,
    strategyIds: [input.strategy.id],
    strategyVersions: [input.strategy.version],
    rationale: [
      "Deterministic ORB automatic PAPER-only proposal. No broker API or real-money order is used.",
      `Signal ${input.signalKey}; 08:00–08:15 opening range, closed breakout, later 50% retest, later closed continuation, and the confirmed entry clock are all required.`,
      "ORB geometry must be recomputed at the actual simulated market fill; no partial or break-even management is enabled.",
    ],
    checklist: {
      orbAutoPaper: AUTO_JOURNAL_MARKER,
      orbSignalKey: input.signalKey,
      orbGeometry: "source-validated-3R-tick-band",
      execution: "deterministic-orb-not-ai",
    },
    analysis: input.analysis,
  };
}

/** Cheap status only: it never pulls prices, candles, source analysis, or an AI/model service. */
export async function orbAutoStatus(user: User): Promise<OrbAutoPaperStatus> {
  const now = Date.now();
  if (!mayUseApp(user))
    return {
      state: "blocked",
      message: "Automatic ORB paper controls are owner-only.",
      checkedAt: now,
    };
  try {
    const saved = await loadWorkspace(user.id);
    const state = orbAutoSettingsReason(
      (saved.workspace?.settings as SettingsCarrier | undefined)?.orbAutoPaper,
      now,
    );
    if (!saved.workspace || !state.settings)
      return {
        state: state.state,
        message: state.reason,
        checkedAt: now,
        ...(state.settings ? { settings: state.settings } : {}),
      };
    if (state.state === "off")
      return {
        state: "off",
        message: state.reason,
        checkedAt: now,
        settings: state.settings,
      };
    if (state.state === "blocked")
      return {
        state: "blocked",
        message: state.reason,
        checkedAt: now,
        settings: state.settings,
      };
    const configured = configuredOrbStrategy(saved.workspace, state.settings);
    if (configured.reason)
      return {
        state: "blocked",
        message: configured.reason,
        checkedAt: now,
        settings: state.settings,
        blockReasons: [configured.reason],
      };
    return {
      state: "waiting",
      message:
        "Saved ORB paper consent is armed; foreground checks wait for deterministic closed-bar evidence.",
      checkedAt: now,
      settings: state.settings,
      strategyVersion: configured.strategy!.version,
      gateConfigVersion:
        configured.strategy!.confluence!.contract.configVersion,
    };
  } catch {
    return {
      state: "blocked",
      message:
        "Canonical workspace status is unavailable; no automatic paper check ran.",
      checkedAt: now,
    };
  }
}

/**
 * Server-only automatic PAPER entry. Callers provide no quote, strategy, side,
 * source, model, or consent override. Any unknown/unsupported data blocks rather
 * than downgrading into a practice order or generic strategy proposal.
 */
export async function checkOrbAutoPaper(
  user: User,
): Promise<OrbAutoPaperResult> {
  const now = Date.now();
  if (!mayUseApp(user))
    return result("blocked", "Automatic ORB paper execution is owner-only.");
  let db: Awaited<ReturnType<typeof dbRequired>>;
  try {
    db = await dbRequired();
  } catch {
    return result(
      "blocked",
      "Canonical database is unavailable; no automatic paper order was attempted.",
    );
  }

  const locked = await withOwnerAutoLock(db as any, user.id, async (tx) => {
    const saved = await loadWorkspace(user.id);
    const consent = orbAutoSettingsReason(
      (saved.workspace?.settings as SettingsCarrier | undefined)?.orbAutoPaper,
      now,
    );
    if (consent.state === "off") return result("off", consent.reason);
    if (consent.state === "blocked") return result("blocked", consent.reason);
    if (!saved.workspace || !consent.settings)
      return result("blocked", consent.reason);
    if (consent.settings.expiresAt! <= now)
      return result("blocked", "Automatic ORB paper consent has expired.");
    const workspace = saved.workspace;
    const signature = orbConsentSignature(consent.settings);
    const configured = configuredOrbStrategy(workspace, consent.settings);
    if (!configured.strategy)
      return result(
        "blocked",
        configured.reason || "ORB strategy is unavailable.",
      );
    const strategy = configured.strategy;
    const config = strategy.orbConfig!;
    if (!isOrbEntryWindow(now, config.timezone))
      return result(
        "waiting",
        "ORB entry checks wait for 09:00–11:00 (11:00 exclusive) in the confirmed ORB time zone.",
      );
    if (!orbLocalDay(now, config.timezone))
      return result(
        "blocked",
        "The ORB local trading day cannot be determined.",
      );

    let market: Market;
    try {
      market = await marketFor(user, consent.settings.market);
    } catch {
      return result(
        "blocked",
        "The owner-selected market is unavailable for automatic ORB paper use.",
      );
    }
    const marketReason = selectedOrbMarketReason(
      market,
      consent.settings,
      config,
    );
    if (marketReason) return result("blocked", marketReason);

    const ledger = await canonicalTrades(tx, user.id);
    const riskReason = orbRiskAndDisciplineReason(
      workspace,
      ledger,
      market.id,
      strategy.confluence!.binding.side!,
      now,
    );
    if (riskReason) return result("blocked", riskReason);
    const active = ledger.some(
      (trade) =>
        trade.market === market.id &&
        (trade.status === "pending" || trade.status === "open"),
    );
    if (active)
      return result(
        "blocked",
        "A canonical pending or open paper position already exists for this market.",
      );
    const dailyCount = await dailyAutomaticCount(
      tx,
      user.id,
      config.timezone,
      now,
    );
    if (dailyCount === undefined)
      return result("blocked", "The local day cap cannot be verified.");
    if (dailyCount >= consent.settings.maxTradesPerDay)
      return result(
        "blocked",
        `The automatic ORB local-day cap (${consent.settings.maxTradesPerDay}) has been reached.`,
      );

    let analysis: SetupAnalysis;
    try {
      analysis = await setupAnalysis(
        user,
        {
          market: market.id,
          timeframe: ENTRY_TIMEFRAME,
          strategies: [strategy],
          strategyIds: [strategy.id],
          combination: "all",
          timezone: workspace.settings.timezone,
        },
        Date.now() + 25_000,
        { proposalOnly: true },
      );
    } catch (error) {
      return result(
        "waiting",
        `Current ORB source analysis is unavailable: ${error instanceof Error ? error.message : "unknown source error"}`,
      );
    }

    const side = strategy.confluence!.binding.side!;
    const candidateState = criticalOrbCandidateReason({
      analysis,
      strategy,
      side,
      market: market.id,
    });
    if (
      !candidateState.candidate ||
      candidateState.confirmationBar === undefined
    )
      return result(
        "waiting",
        candidateState.reason || "Current ORB candidate is not ready.",
      );
    const gate = analysis.confluenceEvaluations?.[strategy.id] as
      | Gate
      | undefined;
    if (!orbGateEligible(gate, strategy))
      return result(
        "blocked",
        "The current same-version approved ORB confluence gate is not eligible.",
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
          : "The ORB strategy gate is blocked.",
      );
    }

    const quote = await getQuote(market.id, user, Date.now() + 8_000);
    const entry = actualEntry(side, quote);
    if (!entry || !quoteFresh(quote))
      return result(
        "waiting",
        "A fresh selected-market quote is required for ORB paper entry.",
      );
    const geometry = sourceOrbGeometry(
      market,
      side,
      entry,
      candidateState.candidate.stop!,
      config,
      candidateState.context?.instrumentMetadata,
    );
    if (!geometry)
      return result(
        "blocked",
        "The source ORB 3R/tick/band geometry could not be verified; no generic paper bracket was substituted.",
      );

    // Source work above can be slow. Re-read the owner workspace and full
    // canonical ledger before claiming a signal, rather than reusing the
    // pre-analysis occupancy, cap, consent, or risk result.
    const beforeClaim = await revalidateOrbAutomaticEntry({
      db: tx,
      userId: user.id,
      signature,
      strategy,
      market: market.id,
      side,
    });
    if ("reason" in beforeClaim)
      return result(
        "blocked",
        beforeClaim.reason || "Canonical ORB revalidation blocked the paper order.",
      );

    const proposalId = deterministicOrbProposalId({
      userId: user.id,
      strategyId: strategy.id,
      strategyVersion: strategy.version,
      market: consent.settings.market,
      confirmationBar: candidateState.confirmationBar,
      localDay: beforeClaim.localDay,
    });
    const signalKey = proposalId;
    const existingTrade = beforeClaim.ledger.find(
      (trade) => trade.id === `paper_${proposalId}`,
    );
    if (existingTrade)
      return result(
        "duplicate",
        "This deterministic ORB signal already has a canonical paper order.",
        { tradeId: existingTrade.id, signalKey },
      );

    const proposal = proposalFor({
      id: proposalId,
      analysis,
      candidate: candidateState.candidate,
      market,
      side,
      entry,
      geometry,
      balance: paperPerformance(
        beforeClaim.ledger,
        beforeClaim.workspace.paperStartingBalance,
        [],
        Date.now(),
      ).balance,
      riskPct: consent.settings.riskPct,
      strategy,
      signalKey,
    });
    if (!proposal)
      return result(
        "blocked",
        "ORB paper sizing could not be derived from canonical balance and actual market geometry.",
      );

    // Primary-key INSERT IGNORE is a durable cross-tab/restart signal claim; payload is never overwritten.
    await tx
      .insert(tradingPaperProposals)
      .values({
        id: proposalId,
        userId: user.id,
        market: market.id,
        payload: proposal,
      })
      .ignore();
    const claimed = await tx
      .select()
      .from(tradingPaperProposals)
      .where(
        and(
          eq(tradingPaperProposals.id, proposalId),
          eq(tradingPaperProposals.userId, user.id),
        ),
      )
      .limit(1);
    const immutable = claimed[0]?.payload as PaperProposal | undefined;
    if (
      !immutable ||
      immutable.id !== proposalId ||
      immutable.analysis.market !== market.id ||
      immutable.side !== side ||
      immutable.strategyIds.length !== 1 ||
      immutable.strategyIds[0] !== strategy.id ||
      immutable.strategyVersions[0] !== strategy.version ||
      immutable.checklist?.orbAutoPaper !== AUTO_JOURNAL_MARKER ||
      immutable.checklist?.orbSignalKey !== signalKey
    )
      return result(
        "blocked",
        "The durable ORB signal claim belongs to a different owner/scope; it was not reused.",
        { signalKey },
      );

    // The proposal claim itself is another await. Repeat the complete canonical
    // scope, clock, risk, occupancy, and day-cap guard immediately before the
    // one paper lifecycle call; a manual trade wins over automatic paper.
    const beforeOrder = await revalidateOrbAutomaticEntry({
      db: tx,
      userId: user.id,
      signature,
      strategy,
      market: market.id,
      side,
    });
    if ("reason" in beforeOrder)
      return result(
        "blocked",
        beforeOrder.reason || "Canonical ORB revalidation blocked the paper order.",
        { signalKey },
      );
    // The reserved connection continues to own GET_LOCK, while the claim and
    // normal paper lifecycle use committed root-db operations. Another auto
    // checker cannot race this bar before this one awaited order attempt ends.
    try {
      const trade = await createPaperOrder(user, {
        proposalId,
        entry,
        stop: geometry.stop,
        target: geometry.target,
        quantity: proposal.quantity,
        orderType: "market",
        targetMode: "rr",
        rr: 3,
        autoManage: false,
        entryMode: "strategy",
        journal: {
          orbAutoPaper: AUTO_JOURNAL_MARKER,
          orbAutoSignalKey: signalKey,
          orbAutoGeometry: "source-validated-3R-tick-band",
          executionPolicy: "deterministic-orb; no-ai-or-model-trigger",
          management: "off; source specifies no partial or break-even rule",
        },
      });
      return result(
        "placed",
        "Deterministic ORB paper order recorded. No broker order was sent.",
        {
          tradeId: trade.id,
          signalKey,
        },
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Paper order failed without a retry.";
      return result(
        "blocked",
        `ORB paper order was not confirmed: ${message}`,
        { signalKey },
      );
    }
  });

  if (!locked.acquired)
    return result(
      "busy",
      locked.reason || "A serialized ORB paper check is already active.",
    );
  return (
    locked.value ||
    result("blocked", "ORB paper check did not produce a safe result.")
  );
}
