import { and, eq } from "drizzle-orm";
import { confluenceForAnalysis } from "../../lib/trading/confluence-runtime";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { User } from "../../drizzle/schema";
import { tradingSources, tradingPaperProposals } from "../../drizzle/schema";
import {
  MARKETS,
  uid,
  type Pattern,
  type Timeframe,
  type Strategy,
} from "../../lib/trading/model";
import { SECONDS, validateCandles } from "../../lib/trading/engine";
import type {
  PaperProposal,
  SetupAnalysis,
} from "../../lib/trading/setup-model";
import { analyzeSetups, proposePaper } from "../../lib/trading/setup-engine";
import {
  SETUP_PRESETS,
  resolveSetupFamily,
} from "../../lib/trading/setup-presets";
import { getCandles, getQuote } from "./market";
import { brokerCatalog, brokerOwner } from "./tradelocker";
import { dbRequired, loadWorkspace } from "./repository";
import { retainBars, retainedBars, retainSetup, digest } from "./setup-history";
import { symbol, timeframe, strategySchema } from "./validation";
import { mayUseApp } from "./access";
import { beforeDeadline } from "./scan-budget";
import { isSessionStrategyFamily } from "../../lib/trading/session-strategy-model";
import { observeStrategyQuote } from "./strategy-quote-observations";
import { instrumentFactsFor } from "./instrument-facts-service";
import {
  boundedRequest,
  PROPOSAL_SERVER_MS,
} from "../../lib/trading/request-deadline";
import { loadCanonicalPaperBalance } from "./paper-balance";
export const setupRequestSchema = z.object({
  market: symbol,
  timeframe,
  strategyIds: z.array(z.string().min(1).max(100)).min(1).max(3),
  combination: z.enum(["all", "any"]),
  timezone: z
    .string()
    .max(100)
    .refine((v) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }, "Invalid IANA timezone"),
  strategies: z.array(strategySchema).max(3).optional(),
});
export type SetupRequest = z.infer<typeof setupRequestSchema>;
/** 0 denotes the fixed-units template; it is capped server-side at 2%. */
export const paperRiskTemplateSchema = z
  .number()
  .finite()
  .refine(
    (value) => [0, 0.5, 1, 2].includes(value),
    "Choose fixed units, 1%, or 2% paper risk (0.5% is legacy only).",
  );
export const proposalSchema = setupRequestSchema.extend({
  side: z.enum(["long", "short"]),
  // Accepted only for backward-compatible clients. Paper sizing always reads
  // the authoritative server-side balance below.
  balance: z.number().finite().positive().optional(),
  riskPct: paperRiskTemplateSchema,
});
const recent = new Map<string, { until: number; value: SetupAnalysis }>(),
  pending = new Map<
    string,
    { promise: Promise<SetupAnalysis>; expiresAt: number }
  >();
export async function marketFor(user: User, id: string) {
  if (!mayUseApp(user)) throw new TRPCError({ code: "FORBIDDEN" });
  const markets =
    id.startsWith("TL:") && brokerOwner(user) ? await brokerCatalog() : MARKETS;
  const market = markets.find((m) => m.id === id);
  if (!market)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "This market is not configured for your account.",
    });
  return market;
}
export async function setupAnalysis(
  user: User,
  request: SetupRequest,
  deadline?: number,
  options: { proposalOnly?: boolean } = {},
) {
  if (!mayUseApp(user)) throw new TRPCError({ code: "FORBIDDEN" });
  request = setupRequestSchema.parse(request);
  const key = digest([user.id, request, Boolean(options.proposalOnly)]),
    cached = recent.get(key);
  if (cached && cached.until > Date.now()) return cached.value;
  const previous = pending.get(key);
  if (previous && previous.expiresAt > Date.now())
    return beforeDeadline(previous.promise, deadline);
  if (previous) pending.delete(key);
  const effectiveDeadline = deadline || Date.now() + 45_000;
  const shared = {
    promise: undefined as unknown as Promise<SetupAnalysis>,
    expiresAt: effectiveDeadline,
  };
  const task = (async () => {
    const market = await beforeDeadline(
        marketFor(user, request.market),
        effectiveDeadline,
      ),
      loaded =
        request.strategies?.length === request.strategyIds.length
          ? { workspace: null }
          : await loadWorkspace(user.id);
    const strategies: Strategy[] = request.strategyIds
      .map(
        (id) =>
          request.strategies?.find((s) => s.id === id) ||
          loaded.workspace?.strategies.find((s) => s.id === id) ||
          SETUP_PRESETS.find((s) => s.id === id) ||
          MARKET_WR1(),
      )
      .filter((s, i) => s.id === request.strategyIds[i] && !s.archived);
    if (strategies.length !== request.strategyIds.length)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Save/select your reviewed strategy or provide its current local snapshot before analysis.",
      });
    const hasOrb = strategies.some(
      (strategy) => resolveSetupFamily(strategy) === "orb",
    );
    const pivots = strategies.filter(
      (strategy) => resolveSetupFamily(strategy) === "pdc-continuation",
    );
    const hasLegacy = strategies.some(
      (strategy) => !isSessionStrategyFamily(resolveSetupFamily(strategy)),
    );
    const needsRange = strategies.some(
      (strategy) =>
        ["london-breakout", "initial-balance"].includes(
          resolveSetupFamily(strategy),
        ) ||
        (strategy.sessionConfig?.family === "pdc-continuation" &&
          strategy.sessionConfig.targetMode === "declared-premarket-range"),
    );
    const skipped = (name: string) =>
      Promise.resolve({
        candles: [] as import("../../lib/trading/model").Candle[],
        source: `${name} not required by the selected source strategy`,
        sourceIdentity: undefined as string | undefined,
        requestedAt: undefined as number | undefined,
        fetchedAt: undefined as number | undefined,
        dailyPeriodBasis: "unknown" as const,
      });
    const acquisitionStartedAt = Date.now();
    const acquisitionCutoff = (feed: {
      requestedAt?: number;
      fetchedAt?: number;
    }) =>
      Math.min(
        acquisitionStartedAt,
        Number.isFinite(feed.requestedAt)
          ? feed.requestedAt!
          : Number.isFinite(feed.fetchedAt)
            ? feed.fetchedAt!
            : acquisitionStartedAt,
      ) / 1000;
    const [
      base,
      daily,
      hourly,
      orbRange,
      sessionRange,
      pivotMinute,
      pivotQuote,
      orbFacts,
    ] = await Promise.allSettled([
      getCandles(request.market, request.timeframe, user, effectiveDeadline),
      // The pinned profile/PDH/PDL strip is independent of the selected
      // strategy family. An unavailable/unsupported source still remains
      // Unknown; requesting it never claims daily history exists.
      getCandles(request.market, "1d", user, effectiveDeadline),
      hasLegacy ||
      pivots.some(
        (strategy) =>
          strategy.sessionConfig?.family === "pdc-continuation" &&
          strategy.sessionConfig.pdcBasis === "declared-session-close",
      )
        ? getCandles(request.market, "1h", user, effectiveDeadline)
        : skipped("Hourly context"),
      hasOrb
        ? getCandles(request.market, "15m", user, effectiveDeadline)
        : Promise.resolve(null),
      needsRange
        ? getCandles(request.market, "15m", user, effectiveDeadline)
        : Promise.resolve(null),
      pivots.length
        ? getCandles(request.market, "1m", user, effectiveDeadline)
        : Promise.resolve(null),
      pivots.length
        ? getQuote(request.market, user, effectiveDeadline)
        : Promise.resolve(null),
      strategies.some(
        (s) =>
          resolveSetupFamily(s) === "orb" &&
          s.orbConfig?.marketMode === "nas100-cfd",
      )
        ? instrumentFactsFor(user, market, effectiveDeadline)
        : Promise.resolve(null),
    ]);
    if (base.status !== "fulfilled")
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Actual chart history is unavailable. No setup was invented.",
      });
    const closed = validateCandles(base.value.candles).filter(
        (c) =>
          c.time + SECONDS[request.timeframe] <= acquisitionCutoff(base.value),
      ),
      dailyClosed =
        daily.status === "fulfilled"
          ? validateCandles(daily.value.candles).filter(
              (c) => c.time + SECONDS["1d"] <= acquisitionCutoff(daily.value),
            )
          : [],
      hourlyClosed =
        hourly.status === "fulfilled" && hourly.value.candles.length
          ? validateCandles(hourly.value.candles).filter(
              (c) => c.time + SECONDS["1h"] <= acquisitionCutoff(hourly.value),
            )
          : [];
    if (closed.length < 8)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "At least eight closed actual candles are required.",
      });
    if (!options.proposalOnly && base.value.sourceIdentity)
      await retainBars(
        user.id,
        request.market,
        request.timeframe,
        closed,
        base.value.source,
        base.value.sourceIdentity,
      );
    for (const [tf, result] of options.proposalOnly
      ? []
      : ([
          ["1h", hourly],
          ["1d", daily],
        ] as const))
      if (result.status === "fulfilled" && result.value.sourceIdentity)
        await retainBars(
          user.id,
          request.market,
          tf,
          tf === "1h" ? hourlyClosed : dailyClosed,
          result.value.source,
          result.value.sourceIdentity,
        );
    const stored = options.proposalOnly
        ? []
        : base.value.sourceIdentity
          ? await retainedBars(
              user.id,
              request.market,
              request.timeframe,
              base.value.sourceIdentity,
            )
          : [],
      combined = new Map(stored.map((c) => [c.time, c]));
    for (const time of combined.keys())
      if (time > closed.at(-1)!.time) combined.delete(time);
    closed.forEach((c) => combined.set(c.time, c));
    const sources = options.proposalOnly
      ? []
      : await (await dbRequired())
          .select({ metadata: tradingSources.metadata })
          .from(tradingSources)
          .where(eq(tradingSources.userId, user.id))
          .limit(500);
    const patterns = sources
      .map((s) => s.metadata as Pattern)
      .filter(
        (p) =>
          p.status === "ready" &&
          request.strategyIds.includes(p.strategyId) &&
          (p.market === request.market || p.market === market.providerSymbol) &&
          p.timeframe === request.timeframe,
      );
    const quoteObservations =
      pivotQuote.status === "fulfilled" && pivotQuote.value
        ? await beforeDeadline(
            observeStrategyQuote(user, pivotQuote.value, Date.now() / 1000),
            effectiveDeadline,
          ).catch(() => undefined)
        : undefined;
    const sessionRangeCutoff =
      sessionRange.status === "fulfilled" && sessionRange.value
        ? acquisitionCutoff(sessionRange.value)
        : 0;
    const pivotMinuteCutoff =
      pivotMinute.status === "fulfilled" && pivotMinute.value
        ? acquisitionCutoff(pivotMinute.value)
        : 0;
    const orbRangeCutoff =
      orbRange.status === "fulfilled" && orbRange.value
        ? acquisitionCutoff(orbRange.value)
        : 0;
    const analysis = analyzeSetups({
      market,
      timeframe: request.timeframe,
      candles: [...combined.values()]
        .sort((a, b) => a.time - b.time)
        .slice(-3000),
      daily: dailyClosed,
      hourly: hourlyClosed,
      strategies,
      patterns,
      combination: request.combination,
      timezone: request.timezone,
      now: Date.now() / 1000,
      source: base.value.source,
      sourceIdentity: base.value.sourceIdentity,
      volumeBasis: base.value.volumeBasis,
      dailyPeriodBasis:
        daily.status === "fulfilled" ? daily.value.dailyPeriodBasis : "unknown",
      dailySource:
        daily.status === "fulfilled"
          ? daily.value.source
          : "Daily source unavailable",
      dailySourceIdentity:
        daily.status === "fulfilled" ? daily.value.sourceIdentity : undefined,
      hourlySource:
        hourly.status === "fulfilled"
          ? hourly.value.source
          : "Hourly source unavailable",
      skipHistorical: Boolean(options.proposalOnly),
      sessionRangeFeed:
        sessionRange.status === "fulfilled" && sessionRange.value
          ? {
              candles: sessionRange.value.candles.filter(
                (c) => c.time + SECONDS["15m"] <= sessionRangeCutoff,
              ),
              source: sessionRange.value.source,
              sourceIdentity: sessionRange.value.sourceIdentity,
              timeframe: "15m",
              volumeBasis: sessionRange.value.volumeBasis || "unknown",
            }
          : undefined,
      pivotMinuteFeed:
        pivotMinute.status === "fulfilled" && pivotMinute.value
          ? {
              candles: pivotMinute.value.candles.filter(
                (c) => c.time + SECONDS["1m"] <= pivotMinuteCutoff,
              ),
              source: pivotMinute.value.source,
              sourceIdentity: pivotMinute.value.sourceIdentity,
              timeframe: "1m",
              volumeBasis: pivotMinute.value.volumeBasis || "unknown",
            }
          : undefined,
      quoteObservations,
      orbInstrumentMetadata:
        orbFacts.status === "fulfilled" &&
        orbFacts.value?.market === market.id &&
        orbFacts.value.providerSymbol === market.providerSymbol &&
        orbFacts.value.tick
          ? {
              market: market.id,
              priceTick: orbFacts.value.tick.value,
              source: orbFacts.value.tick.source,
              executionSource: base.value.source,
            }
          : undefined,
      orbRangeFeed:
        orbRange.status === "fulfilled" && orbRange.value
          ? {
              candles: orbRange.value.candles.filter(
                (c) => c.time + SECONDS["15m"] <= orbRangeCutoff,
              ),
              source: orbRange.value.source,
              timeframe: "15m",
            }
          : undefined,
    });
    analysis.confluenceEvaluations = confluenceForAnalysis(
      strategies,
      analysis,
      Date.now(),
    );
    if (daily.status === "rejected")
      analysis.messages.push(
        "Daily profile/PDH/PDL unavailable until this feed returns daily history.",
      );
    if (hourly.status === "rejected")
      analysis.messages.push(
        "HTF POI/bias unavailable until hourly history is available.",
      );
    if (hasOrb && orbRange.status === "rejected")
      analysis.messages.push(
        "ORB15m source unavailable. Only a complete same-source contiguous1m opening window can supply a disclosed range fallback; no range is inferred from higher bars.",
      );
    if (hasOrb && orbFacts.status === "rejected")
      analysis.messages.push(
        "NAS100 broker minimum-increment metadata is unavailable; no futures/display tick was substituted and CFD execution stays blocked.",
      );
    if (Date.now() >= effectiveDeadline)
      throw new Error(
        "Source analysis exceeded its budget; retry for fresh evidence. No paper order created.",
      );
    if (!options.proposalOnly) await retainSetup(user.id, analysis);
    if (options.proposalOnly)
      analysis.messages.push(
        "Fast paper proposal uses current closed source bars; full retained historical/scenario research is not on the order critical path. The original source evidence remains in this immutable proposal.",
      );
    analysis.candles = analysis.candles.slice(-200);
    if (pending.get(key) === shared && Date.now() < effectiveDeadline)
      recent.set(key, { until: Date.now() + 20000, value: analysis });
    if (recent.size > 300) recent.delete(recent.keys().next().value!);
    return analysis;
  })();
  shared.promise = beforeDeadline(task, effectiveDeadline).finally(() => {
    if (pending.get(key) === shared) pending.delete(key);
  });
  pending.set(key, shared);
  return shared.promise;
}
import { WR1 } from "../../lib/trading/model";
function MARKET_WR1() {
  return WR1;
}
export async function createProposal(
  user: User,
  input: z.infer<typeof proposalSchema>,
) {
  try {
    return await boundedRequest(
      createProposalWithinBudget(user, input, Date.now() + PROPOSAL_SERVER_MS),
      PROPOSAL_SERVER_MS,
      "Paper proposal timed out after25seconds. Check source/API connectivity and retry Buy/Sell; no paper order was created.",
    );
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        error instanceof Error
          ? error.message
          : "Paper proposal failed; no paper order was created.",
    });
  }
}
async function createProposalWithinBudget(
  user: User,
  input: z.infer<typeof proposalSchema>,
  deadline: number,
) {
  const [market, canonicalBalance] = await Promise.all([
    beforeDeadline(marketFor(user, input.market), deadline),
    beforeDeadline(loadCanonicalPaperBalance(user.id), deadline),
  ]);
  if (!Number.isFinite(canonicalBalance) || canonicalBalance <= 0)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Your canonical paper balance is unavailable or invalid. No paper proposal was created.",
    });
  const quote = await getQuote(input.market, user, deadline);
  if (quote.status !== "live" || Date.now() / 1000 - quote.timestamp > 120)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "A fresh selected-market quote is required.",
    });
  const analysis = await setupAnalysis(user, input, deadline, {
    proposalOnly: true,
  });
  if (
    !analysis.candles.length ||
    Date.now() / 1000 - analysis.candles.at(-1)!.time >
      Math.max(SECONDS[input.timeframe] * 3, 900)
  )
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Latest actual candles are too old for a current paper proposal. The market may be closed or its feed stale.",
    });
  const entry =
      input.side === "long"
        ? quote.ask || quote.price
        : quote.bid || quote.price,
    proposal: PaperProposal = {
      ...proposePaper(
        analysis,
        market,
        input.side,
        entry,
        canonicalBalance,
        input.riskPct,
      ),
      id: uid("proposal"),
    };
  const loaded =
    input.strategies?.length === input.strategyIds.length
      ? { workspace: null }
      : await beforeDeadline(loadWorkspace(user.id), deadline);
  if (Date.now() >= deadline)
    throw new Error(
      "Paper proposal source checks exceeded the deadline; retry after the feed recovers. No order created.",
    );
  proposal.strategyVersions = input.strategyIds.map(
    (id) =>
      (
        input.strategies?.find((s) => s.id === id) ||
        loaded.workspace?.strategies.find((s) => s.id === id) ||
        SETUP_PRESETS.find((s) => s.id === id) ||
        WR1
      ).version,
  );
  proposal.rationale.push(
    `Paper entry indication from ${quote.source}; ${quote.timestampKind === "received" ? "receipt" : "provider"} time ${new Date(quote.timestamp * 1000).toISOString()}. Bid/ask only when actually supplied; no broker fill.`,
  );
  const db = await dbRequired();
  await db.insert(tradingPaperProposals).values({
    id: proposal.id!,
    userId: user.id,
    market: input.market,
    payload: proposal,
  });
  return proposal;
}
export async function readProposal(userId: number, id: string) {
  const db = await dbRequired();
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
  if (!rows[0] || Date.now() - rows[0].createdAt.getTime() > 900000)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Paper proposal expired or is unavailable. Generate a fresh bracket.",
    });
  return rows[0].payload as PaperProposal;
}
