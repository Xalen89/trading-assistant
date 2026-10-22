import { listScreenshotSources } from "./repository";
import { z } from "zod";
import { symbol } from "./validation";
import {
  screenshotStageSchema,
  tradeScreenshotReviewSchema,
} from "../../lib/trading/trade-screenshot-types";
import { router } from "../_core/trpc";
import { ownerProcedure } from "./access";
import {
  analyzeTradeScreenshot,
  confirmTradeScreenshotReview,
  tradeScreenshotReviewDefinition,
  uploadTradeScreenshot,
} from "./trade-screenshot-service";

const sourceId = z.string().trim().min(1).max(100);
const sourceVersion = z.number().int().positive();
const knownMarket = symbol;
const timeframe = z.enum(["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"]);

/** All procedures require the fixed private owner session. */
export const tradeScreenshotRouter = router({
  list: ownerProcedure
    .input(z.object({ tradeId: sourceId.optional() }).default({}))
    .query(async ({ ctx, input }) => {
      // New review-only sources retain their immutable context at upload, before
      // a draft exists. Resolve that metadata-only definition for remount lists
      // so a failed dedicated review cannot hide the retained original.
      const sources = await listScreenshotSources(ctx.user.id);
      const withContext = await Promise.all(
        sources.map(async (source) => {
          const definition = await tradeScreenshotReviewDefinition(
            ctx.user.id,
            source.id,
          );
          const linkedTradeId =
            definition.sourceContext?.canonicalTradeId ?? source.linkedTradeId;
          return {
            ...source,
            linkedTradeId,
            sourceContext: definition.sourceContext,
          };
        }),
      );
      return input.tradeId
        ? withContext.filter((source) => source.linkedTradeId === input.tradeId)
        : withContext;
    }),
  upload: ownerProcedure
    .input(
      z
        .object({
          filename: z.string().trim().min(1).max(256),
          mime: z.string().trim().max(100),
          base64: z
            .string()
            .min(1)
            .max(12 * 1024 * 1024),
          label: z.string().trim().max(150).optional(),
          market: knownMarket,
          timeframe,
          strategyId: sourceId,
          strategyVersion: z.number().int().positive().optional(),
          canonicalTradeId: sourceId.optional(),
        })
        .strict(),
    )
    .mutation(({ ctx, input }) => uploadTradeScreenshot(ctx.user.id, input)),
  analyze: ownerProcedure
    .input(
      z
        .object({
          sourceId,
          expectedSourceVersion: sourceVersion,
          stage: screenshotStageSchema,
          canonicalTradeId: sourceId.optional(),
          ownerCapturedAt: z.number().finite().nonnegative().optional(),
          ownerTimezone: z.string().trim().max(120).optional(),
        })
        .strict(),
    )
    .mutation(({ ctx, input }) => analyzeTradeScreenshot(ctx.user.id, input)),
  confirm: ownerProcedure
    .input(
      z
        .object({
          review: tradeScreenshotReviewSchema,
          expectedSourceVersion: sourceVersion,
        })
        .strict(),
    )
    .mutation(({ ctx, input }) =>
      confirmTradeScreenshotReview(
        ctx.user.id,
        input.review,
        input.expectedSourceVersion,
      ),
    ),
  definition: ownerProcedure
    .input(z.object({ sourceId }).strict())
    .query(({ ctx, input }) =>
      tradeScreenshotReviewDefinition(ctx.user.id, input.sourceId),
    ),
});
