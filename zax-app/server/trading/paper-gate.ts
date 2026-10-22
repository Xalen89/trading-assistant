import { TRPCError } from "@trpc/server";
import type { User } from "../../drizzle/schema";
import type { Workspace, Strategy } from "../../lib/trading/model";
import type {
  PaperProposal,
  SetupAnalysis,
} from "../../lib/trading/setup-model";
import { confluenceForAnalysis } from "../../lib/trading/confluence-runtime";
import {
  evaluateConfluence,
  type ConfluenceEvaluation,
  type ConfluenceStrategyContract,
} from "../../lib/trading/confluence-contract";
import { setupAnalysis } from "./setup-service";

export function enforceStrategyGate(
  proposal: PaperProposal,
  strategies: Strategy[],
  analysis: SetupAnalysis,
  now: number,
) {
  const evaluations = confluenceForAnalysis(strategies, analysis, now),
    all = proposal.analysis.combination !== "any";
  const passed = proposal.strategyIds.map((id) =>
    Boolean(
      evaluations[id]?.strategyEntryEligible &&
      strategies.find((s) => s.id === id)?.confluence?.binding.side ===
        proposal.side,
    ),
  );
  if (!passed.length || (all ? !passed.every(Boolean) : !passed.some(Boolean)))
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Strategy paper entry blocked: ${
        Object.entries(evaluations)
          .map(
            ([id, e]) =>
              `${id}: ${e.blockedReasons.join("; ") || "direction/gate not met"}`,
          )
          .join(" | ") || "No approved same-direction confluence configuration."
      }`,
    });
  return evaluations;
}
export async function paperEntryEvidence(
  user: User,
  proposal: PaperProposal,
  workspace: Workspace | null,
  mode: "practice" | "strategy",
) {
  let analysis = proposal.analysis,
    strategies = (workspace?.strategies || []).filter((s) =>
      proposal.strategyIds.includes(s.id),
    );
  let evaluations: Record<string, ConfluenceEvaluation>;
  if (mode === "strategy") {
    if (!workspace || !strategies.length)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "Save the approved strategy/gate to your canonical cloud workspace before strategy paper use.",
      });
    for (let index = 0; index < proposal.strategyIds.length; index++) {
      const strategy = strategies.find(
        (s) => s.id === proposal.strategyIds[index],
      );
      if (!strategy || strategy.version !== proposal.strategyVersions[index])
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Strategy version changed or is missing; refresh the paper proposal.",
        });
      const existing =
        proposal.analysis.confluenceEvaluations?.[strategy.id]?.snapshot
          .version;
      if (
        strategy.confluence &&
        (!existing ||
          existing.configVersion !== strategy.confluence.contract.configVersion)
      )
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Approved confluence configuration changed or is absent from this draft; refresh the paper proposal.",
        });
    }
    analysis = await setupAnalysis(
      user,
      {
        market: proposal.analysis.market,
        timeframe: proposal.analysis.timeframe,
        strategies,
        strategyIds: strategies.map((s) => s.id),
        combination: proposal.analysis.combination,
        timezone: workspace.settings.timezone,
      },
      Date.now() + 45000,
      { proposalOnly: true },
    );
    evaluations = enforceStrategyGate(
      proposal,
      strategies,
      analysis,
      Date.now(),
    );
  } else {
    evaluations = confluenceForAnalysis(strategies, analysis, Date.now());
  }
  const snapshots = Object.values(evaluations).map((e) => e.snapshot);
  if (!snapshots.length)
    snapshots.push(
      evaluateConfluence({} as ConfluenceStrategyContract, {
        evaluatedAt: Date.now(),
        decisionBarOpenAt: Date.now(),
        trigger: {
          sourceId: "manual-practice-unconfigured",
          status: "pending",
          providerStatus: "pending",
          observedAt: Date.now(),
          lastClosedBarAt: Date.now(),
          bar: "unknown",
        },
        conditions: [],
      }).snapshot,
    );
  return { analysis, evaluations, snapshots: snapshots.slice(0, 3) };
}
