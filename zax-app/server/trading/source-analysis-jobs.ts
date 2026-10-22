import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  SOURCE_ANALYSIS_JOB_KIND,
  sourceAnalysisJobResultSchema,
  sourceAnalysisRequestSchema,
  type SourceAnalysisCancel,
  type SourceAnalysisJob,
  type SourceAnalysisJobResult,
  type SourceAnalysisRetry,
  type SourceAnalysisStart,
} from "../../lib/trading/source-analysis-job-types";
import { uid, type Pattern } from "../../lib/trading/model";
import { isReviewOnlySource } from "../../lib/trading/source-purpose";
import { tradingResearchJobs, users } from "../../drizzle/schema";
import { consumeAppQuota } from "./app-quota";
import { analyzeLibraryBlueprint } from "./library-blueprint";
import {
  dbRequired,
  getSource,
  getSourceDefinition,
  persistSourceAnalysisResult,
  updateSourceVisualIndexForActiveJob,
} from "./repository";
import { indexImage } from "./vectors";

const STALE_RUNNING_MS = 360_000;
const ACTIVE_STATUSES = ["queued", "running"] as const;

function sourceRequestWhere(sourceId: string) {
  return sql`JSON_UNQUOTE(JSON_EXTRACT(${tradingResearchJobs.request}, '$.sourceId')) = ${sourceId}`;
}

function jobTime(value: unknown) {
  return value instanceof Date ? value.getTime() : Date.now();
}

function resultFor(
  progressPhase: SourceAnalysisJobResult["progressPhase"],
  values: Omit<SourceAnalysisJobResult, "progressPhase"> = {},
): SourceAnalysisJobResult {
  return { progressPhase, ...values };
}

function sourceJobFromRow(row: any): SourceAnalysisJob | null {
  const request = sourceAnalysisRequestSchema.safeParse(row?.request);
  if (!request.success || row?.kind !== SOURCE_ANALYSIS_JOB_KIND) return null;
  const status = row?.status;
  if (
    !(
      ["queued", "running", "succeeded", "failed", "cancelled"] as string[]
    ).includes(status)
  ) {
    return null;
  }
  const parsedResult = sourceAnalysisJobResultSchema.safeParse(row.result);
  const result = parsedResult.success ? parsedResult.data : undefined;
  const progressPhase =
    result?.progressPhase ??
    (status === "queued"
      ? "queued"
      : status === "running"
        ? "claimed"
        : status === "succeeded"
          ? "succeeded"
          : status === "cancelled"
            ? "cancelled"
            : "failed");
  return {
    id: String(row.id),
    kind: SOURCE_ANALYSIS_JOB_KIND,
    status,
    request: request.data,
    progressPhase,
    createdAt: jobTime(row.createdAt),
    updatedAt: jobTime(row.updatedAt),
    ...(typeof row.error === "string" && row.error.trim()
      ? { error: row.error.slice(0, 1_000) }
      : {}),
    ...(result ? { result } : {}),
  };
}

function staleFailureMessage() {
  return "Analysis was interrupted after its worker lease expired. Reload the current source, then explicitly retry this same job once; no automatic model retry was made.";
}

function changedSourceMessage() {
  return "The original source version changed before analysis could run. Reload its authoritative record, then explicitly retry this same job once.";
}

function revisionConflictMessage() {
  return "The source was revised while this unapproved proposal was being saved. A newer owner revision was not overwritten. Reload the authoritative source, then explicitly retry once if still needed.";
}

function cancellationMessage() {
  return "Owner cancelled this analysis. A model call already in progress may finish, but its result will not be saved.";
}

/** Do not surface provider payloads, private bytes, signed URLs, or credentials. */
function safeFailureMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/no extractable text/i.test(message)) {
    return "This PDF has no extractable text for structured review. The original private source remains retained; upload a PNG/JPEG chart or text-extractable PDF and retry.";
  }
  if (/25 MiB analysis limit|source size exceeded limit/i.test(message)) {
    return "The retained source exceeds the 25 MiB analysis limit. The original source remains retained; use a smaller source and retry.";
  }
  if (/structured safety checks|source-evidence checks/i.test(message)) {
    return "The generated proposal did not pass source-evidence safety checks. The original source remains retained; explicitly retry if appropriate.";
  }
  if (/Source bytes unavailable/i.test(message)) {
    return "Source bytes are temporarily unavailable. The original source remains retained; reload and explicitly retry.";
  }
  if (error instanceof TRPCError && error.code === "NOT_FOUND") {
    return "The source is no longer available in this private library. Reload before retrying.";
  }
  return "Source analysis could not finish. The original source remains retained and unchanged; reload and explicitly retry if needed.";
}

async function findSourceJobRow(
  db: any,
  userId: number,
  input: { sourceId: string; id?: string },
) {
  const rows = await db
    .select()
    .from(tradingResearchJobs)
    .where(
      and(
        eq(tradingResearchJobs.userId, userId),
        eq(tradingResearchJobs.kind, SOURCE_ANALYSIS_JOB_KIND),
        sourceRequestWhere(input.sourceId),
        input.id ? eq(tradingResearchJobs.id, input.id) : undefined,
      ),
    )
    .orderBy(desc(tradingResearchJobs.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

async function running(db: any, userId: number, id: string): Promise<boolean> {
  const rows = await db
    .select({ status: tradingResearchJobs.status })
    .from(tradingResearchJobs)
    .where(
      and(
        eq(tradingResearchJobs.id, id),
        eq(tradingResearchJobs.userId, userId),
        eq(tradingResearchJobs.kind, SOURCE_ANALYSIS_JOB_KIND),
      ),
    )
    .limit(1);
  return rows[0]?.status === "running";
}

async function progress(
  db: any,
  userId: number,
  id: string,
  phase: SourceAnalysisJobResult["progressPhase"],
) {
  await db
    .update(tradingResearchJobs)
    .set({ result: resultFor(phase), updatedAt: new Date() })
    .where(
      and(
        eq(tradingResearchJobs.id, id),
        eq(tradingResearchJobs.userId, userId),
        eq(tradingResearchJobs.kind, SOURCE_ANALYSIS_JOB_KIND),
        eq(tradingResearchJobs.status, "running"),
      ),
    );
}

async function failRunningJob(
  db: any,
  userId: number,
  id: string,
  error: string,
  result: SourceAnalysisJobResult = resultFor("failed"),
) {
  await db
    .update(tradingResearchJobs)
    .set({
      status: "failed",
      error: error.slice(0, 1_000),
      result,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(tradingResearchJobs.id, id),
        eq(tradingResearchJobs.userId, userId),
        eq(tradingResearchJobs.kind, SOURCE_ANALYSIS_JOB_KIND),
        eq(tradingResearchJobs.status, "running"),
      ),
    );
}

/** The visual descriptor remains optional: source review can succeed without it. */
async function indexUploadedImage(
  db: any,
  userId: number,
  job: SourceAnalysisJob,
  original: Pattern,
): Promise<Pattern> {
  if (!original.mime?.startsWith("image/") || isReviewOnlySource(original))
    return original;
  if (!(await running(db, userId, job.id))) return original;
  await progress(db, userId, job.id, "indexing-image");
  if (!(await running(db, userId, job.id))) return original;

  const indexed = { ...original };
  try {
    const source = await getSource(userId, job.request.sourceId);
    if (source.metadata.version !== job.request.expectedVersion)
      return original;
    await indexImage(userId, indexed, Buffer.from(source.base64, "base64"));
  } catch (error) {
    indexed.visualIndex = {
      status: "failed",
      descriptorVersion: "opencv-hog-128x64-v1",
      message:
        error instanceof Error
          ? error.message.slice(0, 1_000)
          : "Visual index failed; source retained.",
    };
  }

  try {
    return (
      (await updateSourceVisualIndexForActiveJob(userId, {
        jobId: job.id,
        sourceId: job.request.sourceId,
        expectedVersion: job.request.expectedVersion,
        pattern: indexed,
      })) ?? original
    );
  } catch {
    // Index persistence never destroys an otherwise analyzable owner source.
    return original;
  }
}

/**
 * Runs one finite in-process unit. Cancellation is checked before model selection,
 * before invocation, and at the transaction that persists the source revision.
 */
export async function runSourceAnalysisJob(userId: number, id: string) {
  const db = await dbRequired();
  const ownedRows = await db
    .select()
    .from(tradingResearchJobs)
    .where(
      and(
        eq(tradingResearchJobs.id, id),
        eq(tradingResearchJobs.userId, userId),
        eq(tradingResearchJobs.kind, SOURCE_ANALYSIS_JOB_KIND),
      ),
    )
    .limit(1);
  const job = sourceJobFromRow(ownedRows[0]);
  if (!job || job.status !== "queued") return false;

  const claim = await db
    .update(tradingResearchJobs)
    .set({
      status: "running",
      error: null,
      result: resultFor("claimed"),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(tradingResearchJobs.id, id),
        eq(tradingResearchJobs.userId, userId),
        eq(tradingResearchJobs.kind, SOURCE_ANALYSIS_JOB_KIND),
        eq(tradingResearchJobs.status, "queued"),
      ),
    );
  if (claim[0]?.affectedRows !== 1) return false;

  try {
    await progress(db, userId, id, "version-checking");
    if (!(await running(db, userId, id))) return true;
    let original = await getSourceDefinition(userId, job.request.sourceId);
    if (original.version !== job.request.expectedVersion) {
      await failRunningJob(db, userId, id, changedSourceMessage());
      return true;
    }
    if (isReviewOnlySource(original)) {
      await failRunningJob(
        db,
        userId,
        id,
        "This private screenshot source is reserved for its dedicated review and cannot be analyzed as a generic library blueprint.",
      );
      return true;
    }

    original = await indexUploadedImage(db, userId, job, original);
    if (!(await running(db, userId, id))) return true;

    await progress(db, userId, id, "analyzing-source");
    if (!(await running(db, userId, id))) return true;
    const blueprint = await analyzeLibraryBlueprint(
      userId,
      job.request.sourceId,
      180_000,
      () => running(db, userId, id),
    );
    if (!(await running(db, userId, id))) return true;
    if (
      blueprint.sourceId !== job.request.sourceId ||
      blueprint.sourceVersion !== job.request.expectedVersion ||
      blueprint.approved !== false
    ) {
      await failRunningJob(
        db,
        userId,
        id,
        "The source changed during analysis, so no proposal was saved. Reload the authoritative source, then explicitly retry this same job once.",
      );
      return true;
    }

    await progress(db, userId, id, "persisting-revision");
    if (!(await running(db, userId, id))) return true;
    try {
      await persistSourceAnalysisResult(userId, {
        jobId: id,
        sourceId: job.request.sourceId,
        expectedVersion: job.request.expectedVersion,
        blueprint,
        result: resultFor("succeeded", {
          blueprint,
          revisedSourceVersion: job.request.expectedVersion + 1,
        }),
      });
    } catch (error) {
      if (!(await running(db, userId, id))) return true;
      if (error instanceof TRPCError && error.code === "CONFLICT") {
        await failRunningJob(
          db,
          userId,
          id,
          revisionConflictMessage(),
          resultFor("failed", { blueprint }),
        );
        return true;
      }
      throw error;
    }
  } catch (error) {
    if (!(await running(db, userId, id))) return true;
    await failRunningJob(db, userId, id, safeFailureMessage(error));
  }
  return true;
}

/**
 * Starts after persisting a queue entry. Quota is consumed once here—not by
 * polling, drain, cancellation, or retry.
 */
export async function startSourceAnalysis(
  userId: number,
  input: SourceAnalysisStart,
) {
  const request = sourceAnalysisRequestSchema.parse({ ...input, attempts: 1 });
  const original = await getSourceDefinition(userId, request.sourceId);
  if (original.version !== request.expectedVersion) {
    throw new TRPCError({ code: "CONFLICT", message: changedSourceMessage() });
  }
  if (isReviewOnlySource(original)) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "This private screenshot source is reserved for its dedicated review.",
    });
  }

  const db = await dbRequired();
  const id = uid("source-analysis");
  await db.transaction(async (tx: any) => {
    const owner = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    if (!owner.length) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Owner account not found.",
      });
    }
    const active = await tx
      .select({
        id: tradingResearchJobs.id,
        request: tradingResearchJobs.request,
      })
      .from(tradingResearchJobs)
      .where(
        and(
          eq(tradingResearchJobs.userId, userId),
          eq(tradingResearchJobs.kind, SOURCE_ANALYSIS_JOB_KIND),
          inArray(tradingResearchJobs.status, ACTIVE_STATUSES),
        ),
      )
      .limit(20);
    if (
      active.some((candidate: any) => {
        const parsed = sourceAnalysisRequestSchema.safeParse(candidate.request);
        return parsed.success && parsed.data.sourceId === request.sourceId;
      })
    ) {
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "This source already has an active analysis job. View its progress before starting another.",
      });
    }
    await tx.insert(tradingResearchJobs).values({
      id,
      userId,
      kind: SOURCE_ANALYSIS_JOB_KIND,
      status: "queued",
      request,
      result: resultFor("queued"),
    });
  });

  try {
    await consumeAppQuota(userId, "source-analysis");
  } catch (error) {
    await db
      .update(tradingResearchJobs)
      .set({
        status: "failed",
        error:
          "Analysis could not start because the durable quota check was unavailable or exhausted. No source analysis was run.",
        result: resultFor("failed", { retryable: false }),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tradingResearchJobs.id, id),
          eq(tradingResearchJobs.userId, userId),
          eq(tradingResearchJobs.kind, SOURCE_ANALYSIS_JOB_KIND),
          eq(tradingResearchJobs.status, "queued"),
        ),
      );
    throw error;
  }

  void runSourceAnalysisJob(userId, id).catch(() => {
    // The durable row remains queued/running/failed/cancelled for owner recovery.
  });
  return { id };
}

/** A cancellation is a compare-and-swap transition; terminal jobs are immutable. */
export async function cancelSourceAnalysis(
  userId: number,
  input: SourceAnalysisCancel,
) {
  const db = await dbRequired();
  const cancelled = await db
    .update(tradingResearchJobs)
    .set({
      status: "cancelled",
      error: cancellationMessage(),
      result: resultFor("cancelled"),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(tradingResearchJobs.id, input.id),
        eq(tradingResearchJobs.userId, userId),
        eq(tradingResearchJobs.kind, SOURCE_ANALYSIS_JOB_KIND),
        sourceRequestWhere(input.sourceId),
        inArray(tradingResearchJobs.status, ACTIVE_STATUSES),
      ),
    );
  if (cancelled[0]?.affectedRows !== 1) {
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "This source analysis is already terminal or changed before cancellation. Reload its status.",
    });
  }
  return { id: input.id };
}

/** Explicit retry leases the same failed job one final time; it never loops. */
export async function retrySourceAnalysis(
  userId: number,
  input: SourceAnalysisRetry,
) {
  const retry = sourceAnalysisRequestSchema
    .pick({ sourceId: true, expectedVersion: true })
    .parse({
      sourceId: input.sourceId,
      expectedVersion: input.expectedVersion,
    });
  const db = await dbRequired();
  const row = await findSourceJobRow(db, userId, {
    sourceId: retry.sourceId,
    id: input.id,
  });
  const job = sourceJobFromRow(row);
  if (!job) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Source analysis job not found for this source.",
    });
  }
  if (job.status !== "failed") {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Only a failed source analysis job can be explicitly retried.",
    });
  }
  if (job.result?.retryable === false) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "This job never passed durable quota consumption, so it cannot be retried. Start a new analysis after the quota check is available.",
    });
  }
  if (job.request.attempts >= 2) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "This source analysis job has used its single explicit retry. Start a new analysis if another review is needed.",
    });
  }

  const source = await getSourceDefinition(userId, retry.sourceId);
  if (source.version !== retry.expectedVersion) {
    throw new TRPCError({ code: "CONFLICT", message: changedSourceMessage() });
  }
  if (isReviewOnlySource(source)) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "This private screenshot source is reserved for its dedicated review.",
    });
  }

  const nextRequest = { ...retry, attempts: job.request.attempts + 1 };
  const lease = await db
    .update(tradingResearchJobs)
    .set({
      status: "queued",
      error: null,
      request: nextRequest,
      result: resultFor("queued"),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(tradingResearchJobs.id, job.id),
        eq(tradingResearchJobs.userId, userId),
        eq(tradingResearchJobs.kind, SOURCE_ANALYSIS_JOB_KIND),
        eq(tradingResearchJobs.status, "failed"),
      ),
    );
  if (lease[0]?.affectedRows !== 1) {
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "This source job changed before it could be retried. Reload its current status.",
    });
  }

  void runSourceAnalysisJob(userId, job.id).catch(() => {
    // A leased row remains durable; no automatic follow-on retry is scheduled.
  });
  return { id: job.id };
}

/** Optional finite drain; cancellation never revives a queued/running worker. */
export async function drainSourceJobs(userId: number, limit = 1) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Source job drains are limited to one job per invocation.",
    });
  }
  const db = await dbRequired();
  const rows = await db
    .select({ id: tradingResearchJobs.id })
    .from(tradingResearchJobs)
    .where(
      and(
        eq(tradingResearchJobs.userId, userId),
        eq(tradingResearchJobs.kind, SOURCE_ANALYSIS_JOB_KIND),
        eq(tradingResearchJobs.status, "queued"),
      ),
    )
    .orderBy(tradingResearchJobs.createdAt)
    .limit(limit);
  const drained: string[] = [];
  for (const row of rows) {
    if (await runSourceAnalysisJob(userId, row.id)) drained.push(row.id);
  }
  return { drained };
}

/** Owner-scoped latest-job recovery; stale active work is failed, never retried. */
export async function sourceAnalysisJob(
  userId: number,
  input: { sourceId: string; id?: string },
): Promise<SourceAnalysisJob | null> {
  const db = await dbRequired();
  const row = await findSourceJobRow(db, userId, input);
  if (!row) return null;
  const job = sourceJobFromRow(row);
  if (!job) return null;
  if (
    (job.status === "running" || job.status === "queued") &&
    Date.now() - job.updatedAt > STALE_RUNNING_MS
  ) {
    await db
      .update(tradingResearchJobs)
      .set({
        status: "failed",
        error: staleFailureMessage(),
        result: resultFor("failed"),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tradingResearchJobs.id, job.id),
          eq(tradingResearchJobs.userId, userId),
          eq(tradingResearchJobs.kind, SOURCE_ANALYSIS_JOB_KIND),
          eq(tradingResearchJobs.status, job.status),
        ),
      );
    return {
      ...job,
      status: "failed",
      progressPhase: "failed",
      error: staleFailureMessage(),
      result: resultFor("failed"),
      updatedAt: Date.now(),
    };
  }
  return job;
}
