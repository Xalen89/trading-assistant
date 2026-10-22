import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { ForecastScenario, SetupAnalysis } from "../../lib/trading/setup-model";
import type { Strategy } from "../../lib/trading/model";
import { router } from "../_core/trpc";
import { ownerProcedure } from "./access";
import { setupAnalysis } from "./setup-service";
import { strategySchema, symbol, timeframe } from "./validation";

const strategyIdsSchema = z
  .array(z.string().min(1).max(100))
  .min(1)
  .max(3)
  .refine((ids) => new Set(ids).size === ids.length, "Duplicate strategy IDs");

const timezoneSchema = z
  .string()
  .max(100)
  .refine(
    (value) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    },
    "Invalid IANA timezone",
  );

/**
 * The client must send its selected local snapshots, rather than relying on an unrelated
 * saved-workspace version. setupAnalysis preserves its existing setup archive behavior.
 */
export const historicalScenarioInputSchema = z
  .object({
    market: symbol,
    sourceTimeframe: timeframe,
    strategyIds: strategyIdsSchema,
    strategies: z.array(strategySchema).min(1).max(3),
    combination: z.enum(["all", "any"]),
    timezone: timezoneSchema,
  })
  .superRefine((input, context) => {
    if (input.strategies.length !== input.strategyIds.length) {
      context.addIssue({
        code: "custom",
        path: ["strategies"],
        message: "Send one selected local strategy snapshot for every strategy ID.",
      });
      return;
    }
    for (const id of input.strategyIds) {
      const snapshot = input.strategies.find((strategy) => strategy.id === id);
      if (!snapshot || snapshot.archived) {
        context.addIssue({
          code: "custom",
          path: ["strategies"],
          message: "Selected strategy snapshots must be present and active.",
        });
      }
    }
  });

export type HistoricalScenarioResponse = {
  scenario: ForecastScenario;
  sourceTimeframe: z.infer<typeof timeframe>;
  market: string;
  generatedAt: number;
  source: string;
};

/** Converts an existing setup-analysis snapshot to a display-only historical layer payload. */
export function historicalScenarioResponse(
  analysis: Pick<SetupAnalysis, "candles" | "scenario" | "source">,
  market: string,
  sourceTimeframe: z.infer<typeof timeframe>,
  generatedAt = Date.now(),
): HistoricalScenarioResponse {
  if (!analysis.candles.length)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Historical scenario unavailable: selected source-frame history is empty. No historical path was invented.",
    });
  if (!analysis.scenario || !analysis.scenario.candles.length)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Historical scenario unavailable: the completed source history has no valid past continuation for this snapshot. No forecast was invented.",
    });
  return {
    scenario: analysis.scenario,
    sourceTimeframe,
    market,
    generatedAt,
    source: analysis.source,
  };
}

function selectedSnapshots(
  ids: readonly string[],
  snapshots: readonly Strategy[],
): Strategy[] {
  return ids.map((id) => {
    const snapshot = snapshots.find(
      (candidate) => candidate.id === id && !candidate.archived,
    );
    if (!snapshot)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Selected local strategy snapshots are incomplete or archived.",
      });
    return snapshot;
  });
}

export const scenarioRouter = router({
  historical: ownerProcedure
    .input(historicalScenarioInputSchema)
    .mutation(async ({ ctx, input }) => {
      const strategies = selectedSnapshots(input.strategyIds, input.strategies);
      const analysis = await setupAnalysis(ctx.user, {
        market: input.market,
        timeframe: input.sourceTimeframe,
        strategyIds: input.strategyIds,
        strategies,
        combination: input.combination,
        timezone: input.timezone,
      });
      return historicalScenarioResponse(
        analysis,
        input.market,
        input.sourceTimeframe,
      );
    }),
});
