import { z } from "zod";
import {
  libraryBlueprintSchema,
  type LibraryBlueprint,
} from "./library-blueprint-types";

/** Stored in the existing generic research-job table; kept below its 20-char kind limit. */
export const SOURCE_ANALYSIS_JOB_KIND = "source-blueprint" as const;

export const sourceAnalysisStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
export type SourceAnalysisStatus = z.infer<typeof sourceAnalysisStatusSchema>;

/**
 * These are durable observations of real worker code points, not estimates of
 * model completion. They are intentionally suitable for a resumed UI poll.
 */
export const sourceAnalysisProgressPhaseSchema = z.enum([
  "queued",
  "claimed",
  "version-checking",
  "indexing-image",
  "analyzing-source",
  "persisting-revision",
  "succeeded",
  "failed",
  "cancelled",
]);
export type SourceAnalysisProgressPhase = z.infer<
  typeof sourceAnalysisProgressPhaseSchema
>;

export const sourceAnalysisRequestSchema = z
  .object({
    sourceId: z.string().trim().min(1).max(100),
    expectedVersion: z.number().int().positive(),
    /** Initial work is attempt 1; a user may explicitly lease this same job once. */
    attempts: z.number().int().min(1).max(2),
  })
  .strict();
export type SourceAnalysisRequest = z.infer<typeof sourceAnalysisRequestSchema>;

export const sourceAnalysisStartSchema = sourceAnalysisRequestSchema
  .pick({ sourceId: true, expectedVersion: true })
  .strict();
export type SourceAnalysisStart = z.infer<typeof sourceAnalysisStartSchema>;

export const sourceAnalysisRetrySchema = sourceAnalysisStartSchema
  .extend({ id: z.string().trim().min(1).max(100) })
  .strict();
export type SourceAnalysisRetry = z.infer<typeof sourceAnalysisRetrySchema>;

/** Cancellation is bound to both the durable job and its immutable source id. */
export const sourceAnalysisCancelSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    sourceId: z.string().trim().min(1).max(100),
  })
  .strict();
export type SourceAnalysisCancel = z.infer<typeof sourceAnalysisCancelSchema>;

/**
 * `blueprint` is retained on a revision conflict so the owner can review what
 * was generated without ever overwriting the newer source revision.
 */
export const sourceAnalysisJobResultSchema = z
  .object({
    progressPhase: sourceAnalysisProgressPhaseSchema,
    blueprint: libraryBlueprintSchema.optional(),
    revisedSourceVersion: z.number().int().positive().optional(),
    /** False only when initial durable quota consumption did not complete. */
    retryable: z.boolean().optional(),
  })
  .strict();
export type SourceAnalysisJobResult = z.infer<
  typeof sourceAnalysisJobResultSchema
>;

export const sourceAnalysisJobSchema = z
  .object({
    id: z.string().min(1).max(100),
    kind: z.literal(SOURCE_ANALYSIS_JOB_KIND),
    status: sourceAnalysisStatusSchema,
    request: sourceAnalysisRequestSchema,
    progressPhase: sourceAnalysisProgressPhaseSchema,
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
    error: z.string().min(1).max(1_000).optional(),
    result: sourceAnalysisJobResultSchema.optional(),
  })
  .strict();
export type SourceAnalysisJob = z.infer<typeof sourceAnalysisJobSchema>;

export type SourceAnalysisBlueprintResult = {
  blueprint: LibraryBlueprint;
  revisedSourceVersion?: number;
};

export function activeSourceAnalysis(status: SourceAnalysisStatus | undefined) {
  return status === "queued" || status === "running";
}
