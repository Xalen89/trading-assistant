import { loadWorkspace } from "./repository";
import { paperPerformance } from "../../lib/trading/paper-performance";
import { loadCanonicalPaperBalance } from "./paper-balance";
import { targetAtR } from "../../lib/trading/setup-engine";
import { samePaperProposalForm } from "../../lib/trading/paper-form";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { User } from "../../drizzle/schema";
import { type Strategy, type Trade, uid } from "../../lib/trading/model";
import { tradeMetrics, validatePlan } from "../../lib/trading/engine";
import {
  isSessionStrategyFamily,
  sessionEntryWindowOpen,
} from "../../lib/trading/session-strategy-model";
import { sessionPaperGeometry } from "../../lib/trading/session-paper-geometry";
import { advancePaperTrade } from "../../lib/trading/paper-lifecycle";
import {
  observePaperExcursion,
  observedLimitFillPrice,
  openObservedPaperLimit,
} from "../../lib/trading/paper-observations";
import { getQuote } from "./market";
import { marketFor, readProposal, setupAnalysis } from "./setup-service";
import {
  activePaperTrades,
  paperHistory,
  paperRevisions,
  paperTrade,
  writePaperTrade,
} from "./setup-history";
import { beforeDeadline } from "./scan-budget";
import { enforceStrategyGate, paperEntryEvidence } from "./paper-gate";
import { tradeFeatureSnapshot } from "../../lib/trading/trade-features";
import { evaluateDiscipline } from "../../lib/trading/trading-discipline";
import { selectDisciplineGuards } from "../../lib/trading/discipline-policy";
import { orbPaperGeometry } from "../../lib/trading/orb-strategy";
import { orbEntryWindowOpen } from "../../lib/trading/orb-model";
export const paperOrderSchema = z
  .object({
    proposalId: z.string().min(1).max(100),
    entry: z.number().positive().finite(),
    stop: z.number().positive().finite(),
    target: z.number().positive().finite(),
    quantity: z.number().positive().finite(),
    orderType: z.enum(["market", "limit"]),
    autoManage: z.boolean(),
    entryMode: z.enum(["practice", "strategy"]).default("practice"),
    targetMode: z.enum(["rr", "price"]).default("price"),
    rr: z.number().positive().finite().max(1000).optional(),
    journal: z.record(z.string().max(100), z.string().max(10000)),
  })
  .superRefine((value, ctx) => {
    if (value.targetMode === "rr" && value.rr === undefined)
      ctx.addIssue({
        code: "custom",
        path: ["rr"],
        message: "A positive selected R is required for RR target mode.",
      });
  });
function fresh(q: Awaited<ReturnType<typeof getQuote>>) {
  if (
    q.status !== "live" ||
    Date.now() / 1000 - q.timestamp > 120 ||
    q.timestamp > Date.now() / 1000 + 30
  )
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "A current selected-market quote is required for a paper fill, exit, or cancellation.",
    });
}

/**
 * Proposal payloads are produced and retained by the server. New proposals
 * expose their resolved cap directly; the fallback keeps already-retained
 * proposals executable under the original server policy, never a client copy.
 */
function effectivePaperRiskCapPct(proposal: {
  riskPct: number;
  effectiveRiskCapPct?: unknown;
}) {
  const explicit = proposal.effectiveRiskCapPct;
  if (
    typeof explicit === "number" &&
    Number.isFinite(explicit) &&
    explicit > 0 &&
    explicit <= 2
  )
    return explicit;
  return proposal.riskPct === 0 ? 2 : proposal.riskPct;
}

type PaperDisciplineSettings = {
  enforceCooldown?: boolean;
  enforceOvertrading?: boolean;
  enforceRiskEscalation?: boolean;
  enforceLossStreak?: boolean;
  cooldownMinutes?: number;
  maxTradesPerDay?: number;
};

export type PaperManagementResult = {
  trades: Trade[];
  checkedIds: string[];
  message: string;
};

const hasEnabledDisciplineGuard = (settings: PaperDisciplineSettings) =>
  settings.enforceCooldown === true ||
  settings.enforceOvertrading === true ||
  settings.enforceRiskEscalation === true ||
  settings.enforceLossStreak === true;

async function completeClosedPaperHistory(userId: number) {
  const trades: Trade[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const part = await paperHistory(userId, "closed", cursor, 100);
    trades.push(...part.trades);
    cursor = part.nextCursor;
    if (!cursor) return trades;
  }
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message:
      "Enabled paper discipline guards cannot be verified against the complete bounded closed-paper ledger; no order or pending fill was created.",
  });
}

async function paperDisciplineBlock(
  userId: number,
  settings: PaperDisciplineSettings,
  proposedRisk: number,
  market: string,
  side: Trade["side"],
) {
  if (!hasEnabledDisciplineGuard(settings)) return;
  const report = evaluateDiscipline(await completeClosedPaperHistory(userId), {
    now: Date.now(),
    proposedRisk,
    market,
    side,
    cooldownMinutes: settings.cooldownMinutes || 20,
    maxTradesPerDay: settings.maxTradesPerDay || 6,
  });
  const selection = selectDisciplineGuards(settings, report.flags);
  if (!selection.blocks.length) return;
  const labels = [...new Set(selection.blocks.map((block) => block.title))];
  return `${labels.join("; ")} is enabled and currently blocks this paper entry. ${selection.blocks[0].flag.action}`;
}

type PendingScope = {
  timeframe: NonNullable<Trade["timeframe"]>;
  strategyIds: string[];
  strategyVersions: number[];
  combination: "all" | "any";
};

type PendingEntryEvidence = {
  analysis: Awaited<ReturnType<typeof setupAnalysis>>;
  snapshots: NonNullable<Trade["confluenceSnapshots"]>;
};

const validPendingScope = (trade: Trade): PendingScope | undefined => {
  const timeframe = trade.timeframe;
  const strategyIds = trade.strategyIds;
  const strategyVersions = trade.strategyVersions;
  if (
    !timeframe ||
    !Array.isArray(strategyIds) ||
    !strategyIds.length ||
    strategyIds.length > 3 ||
    new Set(strategyIds).size !== strategyIds.length ||
    !strategyIds.every((id) => typeof id === "string" && id.trim()) ||
    !Array.isArray(strategyVersions) ||
    strategyVersions.length !== strategyIds.length ||
    !strategyVersions.every(
      (version) => Number.isSafeInteger(version) && version > 0,
    ) ||
    (trade.combination !== "all" && trade.combination !== "any")
  )
    return undefined;
  return {
    timeframe,
    strategyIds,
    strategyVersions,
    combination: trade.combination,
  };
};

const boundedGateReason = (reason: string) =>
  reason.replace(/\s+/g, " ").trim().slice(0, 480) ||
  "Current strategy entry evidence is unavailable.";

const gatePending = (trade: Trade, reason: string): Trade => {
  const gatePendingReason = boundedGateReason(reason);
  if (trade.gatePendingReason === gatePendingReason) return trade;
  return {
    ...trade,
    gatePendingReason,
    version: (trade.version ?? 0) + 1,
  };
};

function evidenceSnapshots(
  analysis: Awaited<ReturnType<typeof setupAnalysis>>,
  strategyIds: readonly string[],
) {
  return strategyIds
    .map((id) => analysis.confluenceEvaluations?.[id]?.snapshot)
    .filter(
      (
        snapshot,
      ): snapshot is NonNullable<Trade["confluenceSnapshots"]>[number] =>
        Boolean(snapshot),
    )
    .slice(0, 3);
}

function entryObservation(quote: Awaited<ReturnType<typeof getQuote>>) {
  return {
    time: quote.timestamp * 1000,
    bid: quote.bid,
    ask: quote.ask,
    source: quote.source,
  };
}

function entryTradeEvidence(
  trade: Trade,
  analysis: Awaited<ReturnType<typeof setupAnalysis>>,
  snapshots: NonNullable<Trade["confluenceSnapshots"]>,
  quote: Awaited<ReturnType<typeof getQuote>>,
): Trade {
  const { gatePendingReason: _clearedGateReason, ...opened } = trade;
  const sidePrice = trade.side === "long" ? quote.ask : quote.bid;
  // The quote was actually observed at entry. Rebase feature eligibility to
  // that timestamp rather than claiming it was available at an earlier bar cut.
  const entryAnalysis = { ...analysis, asOf: quote.timestamp };
  return {
    ...opened,
    confluenceSnapshots: snapshots,
    entryFeatures: tradeFeatureSnapshot(entryAnalysis, trade, quote),
    snapshotPhase: "entry",
    journal: {
      ...trade.journal,
      entryObservation: `${quote.source}; ${quote.timestampKind === "received" ? "received" : "provider"} time ${new Date(quote.timestamp * 1000).toISOString()}; observed ${trade.side === "long" ? "ask" : "bid"} ${sidePrice}.`,
    },
  };
}

async function practicePendingEvidence(
  user: User,
  trade: Trade,
  deadline: number,
): Promise<PendingEntryEvidence | { reason: string }> {
  const scope = validPendingScope(trade);
  if (!scope)
    return {
      reason:
        "Pending-entry scope is unavailable; create a new paper plan for current entry evidence.",
    };
  try {
    const saved = await beforeDeadline(loadWorkspace(user.id), deadline);
    if (!saved.workspace)
      return {
        reason: "Canonical workspace is unavailable for entry evidence.",
      };
    const analysis = await setupAnalysis(
      user,
      {
        market: trade.market,
        timeframe: scope.timeframe,
        strategyIds: scope.strategyIds,
        combination: scope.combination,
        timezone: saved.workspace.settings.timezone,
      },
      deadline,
      { proposalOnly: true },
    );
    const snapshots = evidenceSnapshots(analysis, scope.strategyIds);
    return snapshots.length
      ? { analysis, snapshots }
      : { reason: "Current entry confluence evidence is unavailable." };
  } catch (error) {
    return {
      reason: `Current entry evidence is unavailable: ${error instanceof Error ? error.message : "source request failed"}`,
    };
  }
}

async function strategyPendingEvidence(
  user: User,
  trade: Trade,
  deadline: number,
): Promise<PendingEntryEvidence | { reason: string }> {
  const scope = validPendingScope(trade);
  if (!scope)
    return {
      reason:
        "Pending strategy scope is unavailable; create a new plan for current confluence evidence.",
    };
  const placementConfigVersions = scope.strategyIds.map((id, index) => {
    const version = trade.confluenceSnapshots?.find(
      (snapshot) => snapshot.version?.strategyId === id,
    )?.version;
    return version &&
      version.strategyVersion === scope.strategyVersions[index] &&
      Number.isSafeInteger(version.configVersion) &&
      version.configVersion > 0
      ? version.configVersion
      : undefined;
  });
  if (placementConfigVersions.some((version) => version === undefined))
    return {
      reason:
        "Placement confluence configuration versions are unavailable; this pending strategy plan cannot be filled.",
    };

  try {
    const saved = await beforeDeadline(loadWorkspace(user.id), deadline);
    if (!saved.workspace)
      return {
        reason: "Canonical approved strategy workspace is unavailable.",
      };
    const strategies: Strategy[] = [];
    for (let index = 0; index < scope.strategyIds.length; index += 1) {
      const strategy = saved.workspace.strategies.find(
        (candidate) => candidate.id === scope.strategyIds[index],
      );
      const expectedVersion = scope.strategyVersions[index];
      const expectedConfigVersion = placementConfigVersions[index];
      if (!strategy || strategy.archived)
        return { reason: "A canonical strategy is missing or archived." };
      if (strategy.version !== expectedVersion)
        return {
          reason: "A canonical strategy version changed after placement.",
        };
      if (
        !strategy.confluence ||
        strategy.confluence.contract.strategyId !== strategy.id ||
        strategy.confluence.contract.strategyVersion !== expectedVersion ||
        strategy.confluence.contract.configVersion !== expectedConfigVersion
      )
        return {
          reason:
            "Approved confluence configuration changed or is unavailable after placement.",
        };
      const bindingSide = (
        strategy.confluence.binding as { side?: "long" | "short" }
      ).side;
      if (bindingSide !== undefined && bindingSide !== trade.side)
        return {
          reason:
            "Canonical strategy direction no longer matches this pending side.",
        };
      strategies.push(strategy);
    }
    const analysis = await setupAnalysis(
      user,
      {
        market: trade.market,
        timeframe: scope.timeframe,
        strategies,
        strategyIds: scope.strategyIds,
        combination: scope.combination,
        timezone: saved.workspace.settings.timezone,
      },
      deadline,
      { proposalOnly: true },
    );
    const evaluations = enforceStrategyGate(
      {
        side: trade.side,
        strategyIds: scope.strategyIds,
        strategyVersions: scope.strategyVersions,
        analysis,
      } as any,
      strategies,
      analysis,
      Date.now(),
    );
    const snapshots = scope.strategyIds
      .map((id) => evaluations[id]?.snapshot)
      .filter(Boolean) as NonNullable<Trade["confluenceSnapshots"]>;
    return snapshots.length === scope.strategyIds.length
      ? { analysis, snapshots }
      : { reason: "Current strategy confluence snapshots are unavailable." };
  } catch (error) {
    return {
      reason: `Current strategy gate is waiting: ${error instanceof Error ? error.message : "source request failed"}`,
    };
  }
}
export async function createPaperOrder(
  user: User,
  input: z.input<typeof paperOrderSchema>,
): Promise<Trade> {
  const id = `paper_${input.proposalId}`;
  try {
    const existing = await paperTrade(user.id, id);
    if ((existing.entryMode || "practice") !== (input.entryMode || "practice"))
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "This immutable proposal was already used in a different paper mode. Refresh a new proposal.",
      });
    return existing;
  } catch (e) {
    if (!(e instanceof TRPCError && e.code === "NOT_FOUND")) throw e;
  }
  const proposal = await readProposal(user.id, input.proposalId),
    market = await marketFor(user, proposal.analysis.market);
  if (market.paperSupported === false)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "USD paper valuation is not configured for this instrument; broker lots are never guessed.",
    });
  const quote = await getQuote(market.id, user);
  fresh(quote);
  const entry =
    input.orderType === "market"
      ? proposal.side === "long"
        ? quote.ask || quote.price
        : quote.bid || quote.price
      : input.entry;
  let target = input.target,
    quantity = input.quantity;
  const targetMode = input.targetMode ?? "price";
  const raw = () => ({
    market: market.id,
    valuationSymbol: market.valuationSymbol,
    side: proposal.side,
    entry,
    stop: input.stop,
    target,
    quantity,
    pointValue: market.pointValue,
  });
  const explicitRR = targetMode === "rr" ? input.rr : undefined;
  if (explicitRR !== undefined) {
    try {
      // RR mode intentionally tracks the actual entry quote. An absolute target
      // is intentionally never changed below unless the unchanged proposal is
      // itself being recast for a fresh market-style fill.
      target = targetAtR(market, proposal.side, entry, input.stop, explicitRR);
    } catch {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "The selected RR cannot form a reliable target at the current paper entry.",
      });
    }
  }
  const uneditedDefaultFreshFill =
    targetMode === "price" &&
    input.orderType === "market" &&
    samePaperProposalForm(input, proposal);
  const freshStopStillValid =
    proposal.side === "long" ? input.stop < entry : input.stop > entry;
  // An unchanged default bracket follows the actual paper side quote. Do this
  // before geometry validation so a quote beyond the stale default target can
  // be recast; explicitly edited absolute targets are never silently changed.
  if (uneditedDefaultFreshFill && freshStopStillValid) {
    const preview = raw();
    if (validatePlan(preview)) {
      let adjusted: number;
      try {
        adjusted = targetAtR(
          market,
          proposal.side,
          entry,
          input.stop,
          proposal.rr > 0 ? proposal.rr : 2,
        );
      } catch {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "The fresh paper entry cannot form a reliable default target. Refresh the proposal or use a limit-style plan.",
        });
      }
      target = adjusted;
    }
  }
  const plan = raw(),
    geometry = validatePlan(plan);
  if (geometry)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Fresh paper fill geometry is invalid: ${geometry} Refresh the proposal or use a limit-style plan.`,
    });
  let metrics = tradeMetrics(plan);
  if (![0, 0.5, 1, 2].includes(proposal.riskPct))
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "The immutable paper proposal has an unsupported risk template.",
    });
  const capPct = effectivePaperRiskCapPct(proposal);
  // A proposal is immutable evidence, not a balance authority. Size from the
  // complete canonical ledger so an old or crafted proposal cannot increase
  // paper risk.
  const balance = await loadCanonicalPaperBalance(user.id);
  if (proposal.riskPct !== 0 && input.quantity === proposal.quantity) {
    const perUnit = tradeMetrics({ ...plan, quantity: 1 }).risk;
    quantity = Math.floor(((balance * (capPct / 100)) / perUnit) * 1e6) / 1e6;
    metrics = tradeMetrics({ ...plan, quantity });
  }
  if (proposal.riskPct !== 0 && metrics.risk < balance * 0.005 - 0.01)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Edited bracket is below the 0.5% reference paper-risk floor. Restore sizing or review a new proposal.",
    });
  if (metrics.risk > balance * (capPct / 100) + 0.01)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Edited/fresh bracket exceeds the ${capPct}% paper-risk cap. Reduce quantity or refresh sizing.`,
    });
  const saved = await loadWorkspace(user.id),
    cap = saved.workspace?.settings.dailyDrawdownLimitPct;
  if (cap !== undefined && saved.workspace) {
    let cursor: string | undefined;
    const ledger = new Map(saved.workspace.trades.map((t) => [t.id, t]));
    for (let page = 0; page < 20; page++) {
      const part = await paperHistory(user.id, undefined, cursor, 100);
      part.trades.forEach((t) => ledger.set(t.id, t));
      cursor = part.nextCursor;
      if (!cursor) break;
    }
    if (cursor)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "Configured drawdown cap cannot be verified against the complete bounded paper ledger; no new order created.",
      });
    const dd = paperPerformance(
      [...ledger.values()],
      saved.workspace.paperStartingBalance,
      [],
      Date.now(),
    ).todayClosedDrawdownPct;
    if (dd === null || dd >= cap)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          dd === null
            ? "Configured paper cap lacks required closure dates."
            : "Configured paper realised-drawdown cap reached.",
      });
  }
  const evidence = await paperEntryEvidence(
    user,
    proposal,
    saved.workspace,
    input.entryMode || "practice",
  );
  const currentSession = evidence.analysis.candidates.find(
    (candidate) =>
      isSessionStrategyFamily(candidate.family) &&
      candidate.side === proposal.side &&
      evidence.evaluations[candidate.strategyId]?.strategyEntryEligible,
  );
  if (input.entryMode === "strategy" && currentSession) {
    if (input.orderType !== "market")
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "These source triggers use immediate observed market-style paper entries. A pending limit override belongs to manual practice, not this unvalidated source execution.",
      });
    const context = evidence.analysis.sessionContexts?.find(
      (item) =>
        item.strategyId === currentSession.strategyId &&
        item.family === currentSession.family,
    );
    if (
      !context ||
      !sessionEntryWindowOpen(context.config, Date.now() / 1000) ||
      currentSession.stop === undefined
    )
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "Current session source clock/stop is unavailable; refresh the plan.",
      });
    fresh(quote);
    if (
      context.family === "pdc-continuation" &&
      (!context.pdc ||
        (proposal.side === "long"
          ? quote.price <= context.pdc.price
          : quote.price >= context.pdc.price))
    )
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "The current observed quote is no longer on the crossed PDC side.",
      });
    try {
      const source = sessionPaperGeometry(
        context.config,
        context,
        proposal.side,
        entry,
        currentSession.stop,
      );
      if (Math.abs(input.stop - source.stop) > 1e-7)
        throw new Error(
          "The submitted stop no longer matches the actual source stop.",
        );
      // Only the untouched market proposal may follow its own chosen source geometry at the actual bid/ask. Absolute owner edits are never silently repaired.
      if (uneditedDefaultFreshFill) {
        target = source.target;
        plan.target = target;
        metrics = tradeMetrics({ ...plan, quantity });
      }
      if (Math.abs(target - source.target) > 1e-7)
        throw new Error(
          "The submitted target is not the configured London/IB/PDC source target; use manual practice for an override.",
        );
    } catch (error) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          error instanceof Error
            ? error.message
            : "Source session bracket is invalid.",
      });
    }
  }
  const currentOrb = evidence.analysis.candidates.find(
    (candidate) =>
      candidate.family === "orb" &&
      candidate.side === proposal.side &&
      evidence.evaluations[candidate.strategyId]?.strategyEntryEligible,
  );
  if (input.entryMode === "strategy" && currentOrb) {
    const context = evidence.analysis.orbContexts?.find(
      (item) => item.strategyId === currentOrb.strategyId,
    );
    if (input.orderType !== "market")
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "ORB source entry uses its completed confirmation with a market-style paper indication. Limit-style entry is a separate manual-practice override, not this approved automatic rule.",
      });
    if (
      !currentOrb.stop ||
      Math.abs(currentOrb.stop - input.stop) > 1e-8 ||
      !context ||
      !orbEntryWindowOpen(Date.now() / 1000, context.timezone)
    )
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "ORB current confirmation/clock or exact retest-wick stop changed. Refresh the source bracket; no paper order created.",
      });
    try {
      const required = orbPaperGeometry(
        market,
        proposal.side,
        entry,
        input.stop,
        context.config,
        context.instrumentMetadata,
      );
      if (Math.abs(target - required.target) > 1e-7)
        throw new Error(
          "ORB strategy requires exact3R; edited/generic targets are not the approved source bracket.",
        );
    } catch (error) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          error instanceof Error
            ? error.message
            : "ORB source risk/point band is invalid at the actual paper fill.",
      });
    }
  }
  if (saved.workspace) {
    const block = await paperDisciplineBlock(
      user.id,
      saved.workspace.settings,
      metrics.risk,
      market.id,
      proposal.side,
    );
    if (block)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `${block} No new paper order was created.`,
      });
  }
  const active = await activePaperTrades(user.id);
  if (active.length >= 100)
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message:
        "Close an existing paper position before creating more than 100 active positions.",
    });
  const at = Date.now(),
    first = proposal.strategyIds[0] || "manual",
    initialQuantity = quantity;
  const trade: Trade = {
    id,
    market: market.id,
    valuationSymbol: market.valuationSymbol,
    side: proposal.side,
    status: input.orderType === "market" ? "open" : "pending",
    entry,
    stop: input.stop,
    target,
    quantity,
    pointValue: market.pointValue,
    strategyId: first,
    strategyName:
      proposal.analysis.candidates.find((c) => c.strategyId === first)?.name ||
      "Manual review of selected source",
    strategyVersion: proposal.strategyVersions[0] || 1,
    strategyIds: proposal.strategyIds,
    strategyVersions: proposal.strategyVersions,
    timeframe: proposal.analysis.timeframe,
    combination: proposal.analysis.combination,
    snapshotPhase: input.orderType === "market" ? "entry" : "placement",
    factors: proposal.analysis.confluences
      .filter((s) => s.status === "met")
      .map((s) => s.name),
    journal: {
      ...input.journal,
      executionSource: `${quote.source}; ${quote.timestampKind === "received" ? "received" : "provider"} time ${new Date(quote.timestamp * 1000).toISOString()}`,
      inspectionGuideSource: `Immutable proposal ${proposal.id}; generated guidance is stored separately, not written as your thoughts.`,
      sizeAdjustment:
        quantity !== input.quantity
          ? "Unedited default size recalculated against the actual fresh bracket to preserve the chosen risk percentage."
          : "User-reviewed size retained.",
      targetAdjustment:
        explicitRR !== undefined && target !== input.target
          ? "Explicit selected RR recalculated against the fresh market indication."
          : target !== input.target
            ? "Unedited default target recalculated against the fresh market indication."
            : "User-reviewed target retained.",
    },
    createdAt: at,
    openedAt: input.orderType === "market" ? at : undefined,
    version: 1,
    entryMode: input.entryMode || "practice",
    confluenceSnapshots: evidence.snapshots,
    orderType: input.orderType,
    autoManage: input.autoManage,
    initialRisk: metrics.risk,
    initialQuantity,
    originalStop: input.stop,
    originalTarget: target,
    partialAt: targetAtR(market, proposal.side, entry, input.stop, 2),
    partialTaken: false,
    realizedPnl: 0,
    setupId: input.proposalId,
    events: [
      {
        id: `${id}:created`,
        kind: "created",
        at,
        price: entry,
        quantity: initialQuantity,
        note: `${input.orderType === "market" ? "Fresh side-quote paper fill" : "Pending limit-style paper plan"}; no broker order. Source proposal ${proposal.id}.`,
      },
    ],
  };
  trade.entryFeatures = tradeFeatureSnapshot(evidence.analysis, trade, quote);
  if ((await loadCanonicalPaperBalance(user.id)) !== balance)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Canonical paper balance changed while this order was being checked. Refresh the immutable proposal; no paper order was created.",
    });
  try {
    return await writePaperTrade(user.id, trade);
  } catch (e) {
    if (
      (e as any).code === "ER_DUP_ENTRY" ||
      (e as any).cause?.code === "ER_DUP_ENTRY"
    ) {
      const existing = await paperTrade(user.id, id);
      if (
        existing.setupId !== input.proposalId ||
        (existing.entryMode || "practice") !== (input.entryMode || "practice")
      )
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "This proposal ID was concurrently stored with different immutable paper entry evidence. Refresh a new proposal.",
        });
      return existing;
    }
    throw e;
  }
}
export async function editPaperTrade(
  user: User,
  input: {
    id: string;
    version: number;
    stop: number;
    target: number;
    autoManage?: boolean;
    review?: string;
  },
) {
  const old = await paperTrade(user.id, input.id);
  if (old.version !== input.version)
    throw new TRPCError({
      code: "CONFLICT",
      message: "Refresh the current paper trade before editing.",
    });
  const terminal = old.status === "closed" || old.status === "cancelled";
  if (terminal) {
    if (input.review === undefined)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Closed fills, cancelled plans, and brackets are immutable; save a review instead.",
      });
    if (
      input.stop !== old.stop ||
      input.target !== old.target ||
      (input.autoManage !== undefined && input.autoManage !== old.autoManage)
    )
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Closed fills and cancelled plans accept review-only edits; working bracket and management fields are immutable.",
      });
  }
  const next = {
    ...old,
    version: input.version + 1,
    review: input.review ?? old.review,
  };
  if (!terminal) {
    next.stop = input.stop;
    next.target = input.target;
    next.autoManage = input.autoManage ?? old.autoManage;
    const valid =
      old.side === "long"
        ? next.stop < next.target && next.target > next.entry
        : next.stop > next.target && next.target < next.entry;
    if (!valid)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Updated stop may be at break-even; keep target beyond entry in the trade direction.",
      });
    if (old.status === "pending" && validatePlan({ ...next }))
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Pending entry must retain positive stop/entry/target geometry.",
      });
    const original = tradeMetrics({
      ...old,
      quantity: old.initialQuantity ?? old.quantity,
      stop: old.originalStop ?? old.stop,
      target: input.target,
    });
    if (!Number.isFinite(original.rr) || original.rr <= 0)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Working target must retain positive risk-to-reward geometry against the original paper entry.",
      });
  }
  next.events = [
    ...(old.events || []),
    {
      id: uid("paper-event"),
      kind:
        input.review !== undefined
          ? ("review" as const)
          : ("bracket-edit" as const),
      at: Date.now(),
      note:
        input.review !== undefined
          ? "Post-trade review recorded without changing original fill/risk/journal."
          : "User explicitly adjusted the working bracket; original stop/target/risk are retained.",
    },
  ];
  return writePaperTrade(user.id, next, input.version);
}
export async function closePaperTrade(user: User, id: string, version: number) {
  const old = await paperTrade(user.id, id);
  if (old.status === "closed") return old;
  if (old.version !== version)
    throw new TRPCError({
      code: "CONFLICT",
      message: "Refresh before closing the current paper position.",
    });
  if (old.status !== "open")
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Only an open paper position can exit.",
    });
  const quote = await getQuote(old.market, user);
  fresh(quote);
  const exit =
      old.side === "long" ? quote.bid || quote.price : quote.ask || quote.price,
    at = Date.now(),
    next: Trade = {
      ...old,
      status: "closed",
      exit,
      closedAt: at,
      version: version + 1,
      events: [
        ...(old.events || []),
        {
          id: uid("paper-exit"),
          kind: "closed",
          at,
          price: exit,
          quantity: old.quantity,
          note: `Manual simulated exit from ${quote.source}. Broker position unchanged.`,
        },
      ],
    };
  return writePaperTrade(user.id, next, version);
}

/**
 * Cancels a never-filled limit plan. This does not manufacture a fill or P/L:
 * it requires a fresh source quote solely to make the user's cancellation
 * decision contemporaneous with the selected market.
 */
export async function cancelPaperTrade(
  user: User,
  id: string,
  expectedVersion: number,
) {
  const old = await paperTrade(user.id, id);
  if (old.status === "cancelled") return old;
  if (old.version !== expectedVersion)
    throw new TRPCError({
      code: "CONFLICT",
      message: "Refresh the current paper plan before cancelling.",
    });
  if (old.status !== "pending")
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Only a pending, unfilled paper plan can be cancelled.",
    });

  const quote = await getQuote(old.market, user);
  fresh(quote);
  const at = Date.now();
  const next: Trade = {
    ...old,
    status: "cancelled",
    cancelledAt: at,
    version: expectedVersion + 1,
    events: [
      ...(old.events || []),
      {
        id: uid("paper-cancel"),
        kind: "cancelled",
        at,
        note: `Pending plan cancelled after a fresh ${quote.source} quote check at ${new Date(quote.timestamp * 1000).toISOString()}. No paper fill or broker action was created.`,
      },
    ],
  };
  return writePaperTrade(user.id, next, expectedVersion);
}
export async function managePaperTrades(
  user: User,
  deadline = Date.now() + 12000,
  marketFilter?: Set<string>,
  sharedQuotes?: Map<string, Awaited<ReturnType<typeof getQuote>>>,
): Promise<PaperManagementResult> {
  const trades = (await activePaperTrades(user.id)).filter(
    (t) => !marketFilter || marketFilter.has(t.market),
  );
  const updated: Trade[] = [],
    checkedIds = new Set<string>(),
    quotes =
      sharedQuotes || new Map<string, Awaited<ReturnType<typeof getQuote>>>();
  for (const old of trades) {
    if (Date.now() > deadline - 1000) break;
    try {
      const quote =
        quotes.get(old.market) ||
        (await beforeDeadline(getQuote(old.market, user, deadline), deadline));
      quotes.set(old.market, quote);
      fresh(quote);
      // A check is distinct from a state mutation. Callers that record a
      // processing heartbeat must retain every trade actually assessed, even
      // when its brackets did not transition on this observation.
      checkedIds.add(old.id);
      const observation = {
        time: Math.min(Date.now(), quote.timestamp * 1000),
        price: quote.price,
        bid: quote.bid,
        ask: quote.ask,
        source: quote.source,
      };
      let next = old;

      if (old.status === "pending" && old.orderType === "limit") {
        // Limit-entry observation is independent of auto-management. A manual
        // practice trade may open, but its stop/target/partial rules remain off.
        if (
          observedLimitFillPrice(old, entryObservation(quote)) !== undefined
        ) {
          const evidence =
            old.entryMode === "strategy"
              ? await strategyPendingEvidence(user, old, deadline)
              : await practicePendingEvidence(user, old, deadline);
          if ("reason" in evidence) {
            // Strategy wait state is durable but deliberately idempotent. A
            // practice source wait stays silent rather than inventing a gate.
            if (old.entryMode === "strategy")
              next = gatePending(old, evidence.reason);
          } else {
            const saved = await beforeDeadline(
              loadWorkspace(user.id),
              deadline,
            );
            if (!saved.workspace) {
              next = gatePending(
                old,
                "Canonical workspace is unavailable for enabled paper discipline checks.",
              );
            } else {
              const proposedRisk =
                typeof old.initialRisk === "number" && old.initialRisk > 0
                  ? old.initialRisk
                  : tradeMetrics(old).risk;
              const block = await paperDisciplineBlock(
                user.id,
                saved.workspace.settings,
                proposedRisk,
                old.market,
                old.side,
              );
              if (block) next = gatePending(old, block);
              else {
                // Source analysis can consume the request budget. Do not use the
                // formerly fresh quote if it is no longer fresh at actual entry.
                fresh(quote);
                const opened = openObservedPaperLimit(
                  old,
                  entryObservation(quote),
                );
                if (opened)
                  next = entryTradeEvidence(
                    opened,
                    evidence.analysis,
                    evidence.snapshots,
                    quote,
                  );
              }
            }
          }
        }
      } else if (old.status === "open") {
        // Observation is always on real supplied exit-side quotes. Automatic
        // bracket decisions are a separate, explicit user opt-in.
        const excursion = observePaperExcursion(old, quote);
        const advanced = old.autoManage
          ? advancePaperTrade(old, observation)
          : old;
        if (excursion) {
          const { sampling, ...storedExcursion } = excursion;
          next = {
            ...advanced,
            excursion: storedExcursion,
            // This documents the sampling limit until the parent-owned Trade
            // schema can expose the literal on the excursion object itself.
            journal: {
              ...advanced.journal,
              excursionSampling: sampling,
            },
            // A foreground extreme and any bracket transition are one atomic
            // revision, never two version bumps or an autoManage rewrite.
            version: (old.version ?? 0) + 1,
          };
        } else next = advanced;
      }
      if (next !== old) {
        await writePaperTrade(user.id, next, old.version || 1);
        updated.push(next);
      }
    } catch (e) {
      if (e instanceof TRPCError && e.code === "CONFLICT")
        continue; /* Source unavailable: leave paper state untouched. */
    }
  }
  return {
    trades: updated,
    checkedIds: [...checkedIds],
    message:
      "Active paper positions retain only changing MAE/MFE extremes from observed side quotes; only opted-in brackets advance. Missed intrabar paths are not reconstructed; closed-app operation requires deployed scheduling.",
  };
}
export async function paperDetail(userId: number, id: string) {
  const trade = await paperTrade(userId, id),
    revisions = await paperRevisions(userId, id);
  let proposal;
  try {
    if (trade.setupId) {
      const { dbRequired } = await import("./repository");
      const { tradingPaperProposals } = await import("../../drizzle/schema");
      const { and, eq } = await import("drizzle-orm");
      const rows = await (
        await dbRequired()
      )
        .select()
        .from(tradingPaperProposals)
        .where(
          and(
            eq(tradingPaperProposals.userId, userId),
            eq(tradingPaperProposals.id, trade.setupId),
          ),
        )
        .limit(1);
      proposal = rows[0]?.payload;
    }
  } catch {
    /* Trade history remains readable if proposal data is unavailable. */
  }
  return { trade, revisions, proposal };
}
export { paperHistory };
