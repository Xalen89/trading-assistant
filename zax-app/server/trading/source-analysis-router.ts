import { uploadSchema } from "./validation";
import { uploadReference } from "./learning";
import { z } from "zod";
import {
  sourceAnalysisCancelSchema,
  sourceAnalysisRetrySchema,
  sourceAnalysisStartSchema,
} from "../../lib/trading/source-analysis-job-types";
import { router } from "../_core/trpc";
import { ownerProcedure } from "./access";
import {
  cancelSourceAnalysis,
  retrySourceAnalysis,
  sourceAnalysisJob,
  startSourceAnalysis,
} from "./source-analysis-jobs";

const sourceId = z.string().trim().min(1).max(100);

/** Owner-scoped asynchronous analysis of one retained library source. */
export const sourceAnalysisRouter = router({
  upload: ownerProcedure
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
        return { source, jobId: job.id, error: undefined };
      } catch (error) {
        return {
          source,
          jobId: undefined,
          error:
            error instanceof Error
              ? error.message
              : "Original retained; analysis could not start.",
        };
      }
    }),
  start: ownerProcedure
    .input(sourceAnalysisStartSchema)
    .mutation(({ ctx, input }) => startSourceAnalysis(ctx.user.id, input)),
  /** Source id remains required even for an id lookup, preventing cross-source recovery. */
  job: ownerProcedure
    .input(
      z
        .object({
          sourceId,
          id: z.string().trim().min(1).max(100).optional(),
        })
        .strict(),
    )
    .query(({ ctx, input }) => sourceAnalysisJob(ctx.user.id, input)),
  /** The same persisted job may be explicitly leased once more; it is never auto-retried. */
  retry: ownerProcedure
    .input(sourceAnalysisRetrySchema)
    .mutation(({ ctx, input }) => retrySourceAnalysis(ctx.user.id, input)),
  /** Cancelling is terminal; a started model call may finish but cannot save. */
  cancel: ownerProcedure
    .input(sourceAnalysisCancelSchema)
    .mutation(({ ctx, input }) => cancelSourceAnalysis(ctx.user.id, input)),
});
