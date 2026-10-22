import { paperProcessingStatus } from "./paper-processing";
import {
  activePaperTrades,
  paperHistory as recentHistory,
} from "./setup-history";
import { z } from "zod";
import { router } from "../_core/trpc";
import { ownerProcedure } from "./access";
import { orbAutoStatus, checkOrbAutoPaper } from "./orb-auto-paper";
import { sessionAutoStatus, checkSessionAutoPaper } from "./session-auto-paper";
import {
  prepareInstrument,
  instrumentPreparationSchema,
} from "./instrument-preparation";
import {
  prepareOrbInstrument,
  orbInstrumentPreparationSchema,
} from "./orb-instrument-preparation";
import {
  setupRequestSchema,
  proposalSchema,
  setupAnalysis,
  createProposal,
} from "./setup-service";
import {
  createPaperOrder,
  paperOrderSchema,
  editPaperTrade,
  closePaperTrade,
  cancelPaperTrade,
  managePaperTrades,
  paperHistory,
  paperDetail,
} from "./paper-service";
export const setupRouter = router({
  prepareOrbInstrument: ownerProcedure
    .input(orbInstrumentPreparationSchema)
    .mutation(({ ctx, input }) => prepareOrbInstrument(ctx.user, input)),
  prepareInstrument: ownerProcedure
    .input(instrumentPreparationSchema)
    .mutation(({ ctx, input }) => prepareInstrument(ctx.user, input)),
  analyze: ownerProcedure
    .input(setupRequestSchema)
    .query(({ ctx, input }) => setupAnalysis(ctx.user, input)),
  propose: ownerProcedure
    .input(proposalSchema)
    .mutation(({ ctx, input }) => createProposal(ctx.user, input)),
});
export const paperRouter = router({
  orbAutoStatus: ownerProcedure.query(({ ctx }) => orbAutoStatus(ctx.user)),
  orbAutoCheck: ownerProcedure.mutation(({ ctx }) =>
    checkOrbAutoPaper(ctx.user),
  ),
  sessionAutoStatus: ownerProcedure.query(({ ctx }) =>
    sessionAutoStatus(ctx.user),
  ),
  sessionAutoCheck: ownerProcedure.mutation(({ ctx }) =>
    checkSessionAutoPaper(ctx.user, "foreground"),
  ),
  processing: ownerProcedure
    .input(z.object({ tradeId: z.string().min(1).max(100).optional() }))
    .query(({ ctx, input }) =>
      paperProcessingStatus(ctx.user.id, input.tradeId),
    ),
  working: ownerProcedure.query(async ({ ctx }) => {
    const [active, recent, cancelled] = await Promise.all([
      activePaperTrades(ctx.user.id),
      recentHistory(ctx.user.id, "closed"),
      recentHistory(ctx.user.id, "cancelled"),
    ]);
    return [...active, ...recent.trades, ...cancelled.trades];
  }),
  order: ownerProcedure
    .input(paperOrderSchema)
    .mutation(({ ctx, input }) => createPaperOrder(ctx.user, input)),
  history: ownerProcedure
    .input(
      z.object({
        status: z.enum(["pending", "open", "closed", "cancelled"]).optional(),
        cursor: z.string().max(180).optional(),
        limit: z.number().int().min(1).max(100).default(50),
      }),
    )
    .query(({ ctx, input }) =>
      paperHistory(ctx.user.id, input.status, input.cursor, input.limit),
    ),
  detail: ownerProcedure
    .input(z.object({ id: z.string().min(1).max(100) }))
    .query(({ ctx, input }) => paperDetail(ctx.user.id, input.id)),
  edit: ownerProcedure
    .input(
      z.object({
        id: z.string().min(1).max(100),
        version: z.number().int().positive(),
        stop: z.number().positive().finite(),
        target: z.number().positive().finite(),
        autoManage: z.boolean().optional(),
        review: z.string().max(10000).optional(),
      }),
    )
    .mutation(({ ctx, input }) => editPaperTrade(ctx.user, input)),
  close: ownerProcedure
    .input(
      z.object({
        id: z.string().min(1).max(100),
        version: z.number().int().positive(),
      }),
    )
    .mutation(({ ctx, input }) =>
      closePaperTrade(ctx.user, input.id, input.version),
    ),
  cancel: ownerProcedure
    .input(
      z.object({
        id: z.string().min(1).max(100),
        version: z.number().int().positive(),
      }),
    )
    .mutation(({ ctx, input }) =>
      cancelPaperTrade(ctx.user, input.id, input.version),
    ),
  manage: ownerProcedure.mutation(({ ctx }) => managePaperTrades(ctx.user)),
});
