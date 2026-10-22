import { proposeRefinement } from "../../lib/trading/refinement";
import { paperHistory as tradeHistory } from "./setup-history";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { parse as parseCookie } from "cookie";
import { eq } from "drizzle-orm";
import { router } from "../_core/trpc";
import {
  appProcedure as publicProcedure,
  ownerProcedure as protectedProcedure,
} from "./access";
import { getSessionCookieName } from "../_core/cookies";
import { MARKETS, Pattern, Strategy } from "../../lib/trading/model";
import { validateCandles } from "../../lib/trading/engine";
import { tradingSchedules } from "../../drizzle/schema";
import {
  workspaceSchema,
  symbol,
  timeframe,
  uploadSchema,
  patternSchema,
  strategySchema,
  tradeSchema,
} from "./validation";
import {
  getQuotes,
  getCandles,
  retryQuote,
  fmpAvailable,
  marketContext,
} from "./market";
import {
  dbRequired,
  getSourceDefinition,
  loadWorkspace,
  publicSourcePattern,
  saveWorkspace,
  reviseSource,
  sourceVersions,
} from "./repository";
import {
  matchReferences,
  reviewTrade,
  uploadReference,
  searchLibraryImage,
} from "./learning";
import { startSourceAnalysis } from "./source-analysis-jobs";
import { MAX_PHOTO_SEARCH_BASE64_BYTES } from "../../lib/trading/upload-byte-limits";
import {
  activateSchedule,
  registerDevice,
  scanAlerts,
  getAlertEvent,
} from "./notifications";
import {
  brokerCatalog,
  brokerOwner,
  brokerStatus,
  tradeLockerConfigured,
} from "./tradelocker";
import { reindexSource, visualSearch } from "./vectors";
import {
  researchStartSchema,
  startResearch,
  researchJob,
} from "./research-jobs";
import { uid } from "../../lib/trading/model";
import { collectionPage, collectionQuerySchema } from "./collections";
import { consumeAppQuota } from "./app-quota";
import { backgroundStrategyStatus } from "./background-strategy-status";
import { ownerProcedure } from "./access";
async function limitAI(userId: number, cost = 1) {
  await consumeAppQuota(userId, "source-analysis", cost);
}
function session(req: any) {
  const authorization = req.headers.authorization;
  if (typeof authorization === "string" && authorization.startsWith("Bearer "))
    return authorization.slice(7);
  return parseCookie(req.headers.cookie || "")[getSessionCookieName(req)] || "";
}
export const marketRouter = router({
  catalog: publicProcedure.query(async ({ ctx }) =>
    brokerOwner(ctx.user) && tradeLockerConfigured()
      ? [...(await brokerCatalog()), ...MARKETS]
      : MARKETS,
  ),
  status: publicProcedure.query(async ({ ctx }) => {
    let registered = false;
    if (ctx.user) {
      const db = await dbRequired();
      const rows = await db
        .select()
        .from(tradingSchedules)
        .where(eq(tradingSchedules.userId, ctx.user.id))
        .limit(1);
      registered = Boolean(rows[0]);
    }
    let broker: {
      connected: boolean;
      instrumentCount?: number;
      message: string;
    } = {
      connected: false,
      message: tradeLockerConfigured()
        ? "Sign in with your authorized Manus account to access the private TradeLocker feed."
        : "TradeLocker is not configured.",
    };
    if (brokerOwner(ctx.user) && tradeLockerConfigured()) {
      try {
        broker = await brokerStatus();
      } catch (e) {
        broker = {
          connected: false,
          message:
            e instanceof Error
              ? e.message
              : "TradeLocker data connection unavailable.",
        };
      }
    }
    return {
      coinbase: true,
      fmp: fmpAvailable(),
      futures: false,
      tradelocker: broker,
      pushConfigured: Boolean(process.env.EXPO_PUBLIC_EAS_PROJECT_ID),
      schedulerRegistered: registered,
      message: broker.connected
        ? broker.message
        : "Public Coinbase available. " + broker.message,
    };
  }),
  quotes: publicProcedure
    .input(z.object({ symbols: z.array(symbol).max(40) }))
    .query(({ input, ctx }) => getQuotes(input.symbols, ctx.user)),
  candles: publicProcedure
    .input(z.object({ symbol, timeframe }))
    .query(async ({ input, ctx }) => {
      try {
        return await getCandles(input.symbol, input.timeframe, ctx.user);
      } catch (e) {
        if (e instanceof TRPCError) throw e;
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            e instanceof Error ? e.message : "Historical bars unavailable.",
        });
      }
    }),
  retryQuote: protectedProcedure
    .input(z.object({ symbol }))
    .mutation(({ ctx, input }) => retryQuote(input.symbol, ctx.user)),
  context: publicProcedure.query(() => marketContext()),
});
export const workspaceRouter = router({
  load: protectedProcedure.query(({ ctx }) => loadWorkspace(ctx.user.id)),
  save: protectedProcedure
    .input(
      z.object({
        workspace: workspaceSchema,
        revision: z.number().int().nonnegative(),
      }),
    )
    .mutation(({ ctx, input }) =>
      saveWorkspace(ctx.user.id, input.workspace, input.revision),
    ),
});
export const learningRouter = router({
  blueprint: protectedProcedure
    .input(z.object({ sourceId: z.string().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const source = await getSourceDefinition(ctx.user.id, input.sourceId);
      return startSourceAnalysis(ctx.user.id, {
        sourceId: input.sourceId,
        expectedVersion: source.version,
      });
    }),
  refinement: protectedProcedure
    .input(z.object({ strategy: strategySchema }))
    .query(async ({ ctx, input }) =>
      proposeRefinement(
        input.strategy,
        (await tradeHistory(ctx.user.id, "closed", undefined, 100)).trades,
      ),
    ),
  definition: protectedProcedure
    .input(z.object({ id: z.string().max(100) }))
    .query(async ({ ctx, input }) =>
      publicSourcePattern(await getSourceDefinition(ctx.user.id, input.id)),
    ),
  upload: protectedProcedure
    .input(uploadSchema)
    .mutation(async ({ ctx, input }) => {
      const source = await uploadReference(ctx.user.id, {
        ...input,
        deferAnalysis: true,
      });
      try {
        const job = await startSourceAnalysis(ctx.user.id, {
          sourceId: source.id,
          expectedVersion: source.version,
        });
        // Preserve the legacy Pattern-shaped response while adding the durable id.
        return { ...source, jobId: job.id, error: undefined };
      } catch (error) {
        return {
          ...source,
          jobId: undefined,
          error:
            error instanceof Error
              ? error.message
              : "Original retained; analysis could not start.",
        };
      }
    }),
  search: protectedProcedure
    .input(
      z.object({
        base64: z.string().min(1).max(MAX_PHOTO_SEARCH_BASE64_BYTES),
        mime: z.string().max(100),
        filename: z.string().max(256),
        patterns: z.array(patternSchema).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await limitAI(ctx.user.id);
      let semantic;
      try {
        semantic = await searchLibraryImage(input);
      } catch {
        semantic = {
          description:
            "Semantic extraction unavailable; visual neighbors remain independently available.",
          results: [],
          limitations: "No semantic match or AI description accepted.",
        };
      }
      let visual;
      try {
        visual = await visualSearch(ctx.user.id, { imageBase64: input.base64 });
      } catch (e) {
        visual = {
          results: [],
          examined: 0,
          limitations:
            e instanceof Error ? e.message : "Visual search unavailable.",
        };
      }
      return { ...semantic, visual };
    }),
  reindex: protectedProcedure
    .input(z.object({ id: z.string().min(1).max(100) }))
    .mutation(({ ctx, input }) => reindexSource(ctx.user.id, input.id)),
  visual: protectedProcedure
    .input(
      z.object({
        market: symbol,
        timeframe,
        strategyId: z.string().max(100),
        strategyVersion: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const feed = await getCandles(input.market, input.timeframe, ctx.user);
      const search = await visualSearch(ctx.user.id, {
        candles: feed.candles.slice(-32),
        strategyId: input.strategyId,
        market: input.market,
        timeframe: input.timeframe,
      });
      return {
        search: {
          ...search,
          source: feed.source,
          asOf: feed.candles.at(-1)?.time,
        },
        matches: search.results.map((r) => ({
          id: uid("cv"),
          patternId: r.patternId,
          reference: r.reference,
          name: r.name,
          strategyId: input.strategyId,
          strategyVersion: input.strategyVersion,
          market: input.market,
          timeframe: input.timeframe,
          method: "opencv" as const,
          confidence: r.similarity * 100,
          status: "candidate" as const,
          createdAt: Date.now(),
          evidence: [
            `Visual cosine ${r.similarity.toFixed(4)}; ${r.descriptorVersion}; reference v${r.sourceVersion}`,
            feed.source,
          ],
          missing: [
            "Visual geometry alone does not identify a trading setup or confirm confluences.",
          ],
        })),
      };
    }),
  revise: protectedProcedure
    .input(
      z.object({
        pattern: patternSchema,
        expectedVersion: z.number().int().positive(),
      }),
    )
    .mutation(({ ctx, input }) =>
      reviseSource(ctx.user.id, input.pattern, input.expectedVersion),
    ),
  versions: protectedProcedure
    .input(z.object({ id: z.string().min(1).max(100) }))
    .query(({ ctx, input }) => sourceVersions(ctx.user.id, input.id)),
  match: protectedProcedure
    .input(
      z.object({
        patterns: z.array(patternSchema).max(100),
        strategy: strategySchema,
        candles: z
          .array(
            z.object({
              time: z.number(),
              open: z.number(),
              high: z.number(),
              low: z.number(),
              close: z.number(),
              volume: z.number(),
            }),
          )
          .min(3)
          .max(1000),
        market: symbol,
        timeframe,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await limitAI(ctx.user.id);
      validateCandles(input.candles);
      return matchReferences(ctx.user.id, input);
    }),
  review: protectedProcedure
    .input(z.object({ trade: tradeSchema }))
    .mutation(async ({ ctx, input }) => {
      await limitAI(ctx.user.id);
      if (input.trade.status !== "closed")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Close the paper trade before requesting a deep-dive review.",
        });
      return reviewTrade(input.trade);
    }),
});
export const notificationsRouter = router({
  backgroundStatus: ownerProcedure.query(({ ctx }) =>
    backgroundStrategyStatus(ctx.user.id),
  ),
  event: protectedProcedure
    .input(z.object({ id: z.string().min(1).max(100) }))
    .query(({ ctx, input }) => getAlertEvent(ctx.user.id, input.id)),
  register: protectedProcedure
    .input(
      z.object({
        token: z
          .string()
          .regex(/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/),
        platform: z.enum(["ios", "android"]),
      }),
    )
    .mutation(({ ctx, input }) =>
      registerDevice(ctx.user.id, input.token, input.platform),
    ),
  scan: protectedProcedure.mutation(({ ctx }) => scanAlerts(ctx.user.id)),
  activate: protectedProcedure.mutation(({ ctx }) =>
    activateSchedule(ctx.user.id, session(ctx.req)),
  ),
});
export const researchRouter = router({
  collections: protectedProcedure
    .input(collectionQuerySchema)
    .query(({ input }) => collectionPage(input)),
  start: protectedProcedure
    .input(researchStartSchema)
    .mutation(async ({ ctx, input }) => {
      if (input.kind === "discussion") await limitAI(ctx.user.id, 4);
      return startResearch(ctx.user, input);
    }),
  job: protectedProcedure
    .input(z.object({ id: z.string().max(100).optional() }))
    .query(({ ctx, input }) => researchJob(ctx.user.id, input.id)),
});
