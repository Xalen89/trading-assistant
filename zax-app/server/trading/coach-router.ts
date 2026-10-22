import { coachAnalytics } from "./coach-analytics";
import { z } from "zod";
import type { CoachAskInput } from "../../lib/trading/coach-types";
import { AI_QUALITIES } from "../../lib/trading/ai-quality";
import { router } from "../_core/trpc";
import { ownerProcedure } from "./access";
import { askCoach, coachStatus } from "./coach-service";
import { symbol, timeframe } from "./validation";
import { TRPCError } from "@trpc/server";
import { LLMServiceError } from "../_core/llm-errors";

const historyTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(7_000),
});

export const coachAskSchema: z.ZodType<CoachAskInput> = z
  .object({
    message: z.string().trim().min(1).max(7_000),
    history: z.array(historyTurnSchema).max(14).optional(),
    market: symbol.optional(),
    timeframe: timeframe.optional(),
    strategyId: z.string().min(1).max(100).optional(),
    sourceId: z.string().min(1).max(100).optional(),
    aiQuality: z.enum(AI_QUALITIES).optional(),
  })
  .strict();

/** Optional so legacy `coach.status` calls without an input remain valid. */
export const coachStatusSchema = z
  .object({ aiQuality: z.enum(AI_QUALITIES).optional() })
  .strict()
  .optional();

/** Parent router composition exposes this as `coach.status` and `coach.ask`. */
export const coachRouter = router({
  analytics: ownerProcedure.query(({ ctx }) => coachAnalytics(ctx.user.id)),
  status: ownerProcedure
    .input(coachStatusSchema)
    .query(({ ctx, input }) => coachStatus(ctx.user, input)),
  ask: ownerProcedure.input(coachAskSchema).mutation(async ({ ctx, input }) => {
    try {
      return await askCoach(ctx.user, input);
    } catch (error) {
      if (error instanceof LLMServiceError)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Coach unavailable. No response was fabricated.",
          cause: error,
        });
      throw error;
    }
  }),
});
