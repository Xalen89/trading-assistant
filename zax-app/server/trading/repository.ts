import { and, desc, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { getDb } from "../db";
import {
  tradingWorkspaces,
  tradingSources,
  tradingAlertEvents,
  tradingReferenceVersions,
  tradingPaperTrades,
  tradingPaperEvents,
  tradingResearchJobs,
} from "../../drizzle/schema";
import { Pattern, Workspace, AlertEvent, Trade } from "../../lib/trading/model";
import { WORKSPACE_CAPACITY_LIMITS } from "../../lib/trading/workspace-capacity";
import { storagePut, storageGetSignedUrl } from "../storage";
import { ENV } from "../_core/env";
import { patternSchema } from "./validation";

const SOURCE_INDEX_CAPACITY = WORKSPACE_CAPACITY_LIMITS.sourceLibrary;

export type SourceIndexRecoveryStatus =
  | "not-needed"
  | "recovered"
  | "capacity-limited"
  | "source-capacity-exceeded"
  | "concurrent-update";

/** Metadata-only outcome attached to a workspace load; encrypted originals are never read or changed. */
export type SourceIndexRecovery = {
  status: SourceIndexRecoveryStatus;
  recoveredSourceIds: string[];
  invalidSourceCount: number;
  skippedSourceCount: number;
};

type SourceMetadataRow = { id: string; metadata: unknown };

/**
 * Source metadata retains the encrypted-object key server-side so revisions can
 * protect the original. Client-facing source DTOs must never carry that key.
 */
export function publicSourcePattern(pattern: Pattern): Pattern {
  const { fileKey: _fileKey, ...safe } = pattern;
  return safe;
}

function publicWorkspaceSources(workspace: Workspace): Workspace {
  return {
    ...workspace,
    patterns: workspace.patterns.map(publicSourcePattern),
  };
}

function recovery(
  status: SourceIndexRecoveryStatus,
  recoveredSourceIds: string[] = [],
  invalidSourceCount = 0,
  skippedSourceCount = 0,
): SourceIndexRecovery {
  return {
    status,
    recoveredSourceIds,
    invalidSourceCount,
    skippedSourceCount,
  };
}

/**
 * Adds only absent, schema-valid owner source definitions to the workspace
 * index. Existing workspace entries deliberately win: a load must never
 * replace a local/cloud owner edit, even when its source record differs.
 */
export function reconcileWorkspaceSourceIndex(
  workspace: Workspace,
  sourceRows: readonly SourceMetadataRow[],
): { workspace: Workspace; sourceIndexRecovery: SourceIndexRecovery } {
  if (sourceRows.length > SOURCE_INDEX_CAPACITY)
    return {
      workspace,
      sourceIndexRecovery: recovery(
        "source-capacity-exceeded",
        [],
        0,
        sourceRows.length,
      ),
    };

  const valid: Pattern[] = [];
  let invalidSourceCount = 0;
  for (const row of sourceRows) {
    const parsed = patternSchema.safeParse(row.metadata);
    // The row ID is canonical. Do not index malformed/cross-record metadata.
    if (!parsed.success || parsed.data.id !== row.id) {
      invalidSourceCount += 1;
      continue;
    }
    valid.push(parsed.data);
  }

  const indexedIds = new Set(workspace.patterns.map((pattern) => pattern.id));
  const missing = valid.filter((pattern) => !indexedIds.has(pattern.id));
  if (!missing.length)
    return {
      workspace,
      sourceIndexRecovery: recovery("not-needed", [], invalidSourceCount),
    };

  const available = Math.max(
    0,
    SOURCE_INDEX_CAPACITY - workspace.patterns.length,
  );
  const additions = missing.slice(0, available);
  const skippedSourceCount = missing.length - additions.length;
  if (!additions.length)
    return {
      workspace,
      sourceIndexRecovery: recovery(
        "capacity-limited",
        [],
        invalidSourceCount,
        skippedSourceCount,
      ),
    };

  return {
    workspace: {
      ...workspace,
      patterns: [...workspace.patterns, ...additions],
    },
    sourceIndexRecovery: recovery(
      skippedSourceCount ? "capacity-limited" : "recovered",
      additions.map((pattern) => pattern.id),
      invalidSourceCount,
      skippedSourceCount,
    ),
  };
}
export async function dbRequired() {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message:
        "Cloud database is unavailable. Your local workspace has not been overwritten.",
    });
  return db;
}
export async function loadWorkspace(userId: number) {
  const db = await dbRequired();
  const rows = await db
    .select()
    .from(tradingWorkspaces)
    .where(eq(tradingWorkspaces.userId, userId))
    .limit(1);
  if (!rows[0]) return { workspace: null, revision: 0 };

  // A durable source upload may finish after the client has gone away and
  // before it writes `workspace.patterns`. Recover only current owner metadata
  // and persist it with a workspace CAS so concurrent owner saves win safely.
  const sourceRows = (await db
    .select({ id: tradingSources.id, metadata: tradingSources.metadata })
    .from(tradingSources)
    .where(eq(tradingSources.userId, userId))
    .orderBy(desc(tradingSources.createdAt))
    .limit(SOURCE_INDEX_CAPACITY + 1)) as SourceMetadataRow[];
  let workspace = rows[0].payload as Workspace;
  let revision = rows[0].revision;
  let sourceIndexRecovery: SourceIndexRecovery | undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const reconciled = reconcileWorkspaceSourceIndex(workspace, sourceRows);
    sourceIndexRecovery = reconciled.sourceIndexRecovery;
    if (!sourceIndexRecovery.recoveredSourceIds.length) break;

    const result = await db
      .update(tradingWorkspaces)
      .set({ payload: reconciled.workspace, revision: revision + 1 })
      .where(
        and(
          eq(tradingWorkspaces.userId, userId),
          eq(tradingWorkspaces.revision, revision),
        ),
      );
    if (result[0].affectedRows === 1) {
      workspace = reconciled.workspace;
      revision += 1;
      break;
    }

    if (attempt === 1) {
      sourceIndexRecovery = recovery(
        "concurrent-update",
        [],
        sourceIndexRecovery.invalidSourceCount,
        sourceIndexRecovery.skippedSourceCount +
          sourceIndexRecovery.recoveredSourceIds.length,
      );
      break;
    }
    const latest = await db
      .select()
      .from(tradingWorkspaces)
      .where(eq(tradingWorkspaces.userId, userId))
      .limit(1);
    if (!latest[0])
      return {
        workspace: null,
        revision: 0,
        sourceIndexRecovery: recovery("concurrent-update"),
      };
    workspace = latest[0].payload as Workspace;
    revision = latest[0].revision;
  }

  const canonical = await db
    .select()
    .from(tradingPaperTrades)
    .where(eq(tradingPaperTrades.userId, userId))
    .orderBy(desc(tradingPaperTrades.createdAt))
    .limit(2000);
  const trades = new Map(workspace.trades.map((t) => [t.id, t]));
  for (const row of canonical)
    if (
      (row.payload as Trade).orderType ||
      ((row.payload as Trade).version || 1) >
        (trades.get(row.tradeId)?.version || 1)
    )
      trades.set(row.tradeId, row.payload as Trade);
  const canonicalWorkspace = {
    ...workspace,
    trades: [...trades.values()].sort((a, b) => b.createdAt - a.createdAt),
  };
  const events = await db
    .select()
    .from(tradingAlertEvents)
    .where(eq(tradingAlertEvents.userId, userId))
    .orderBy(desc(tradingAlertEvents.createdAt))
    .limit(100);
  const byId = new Map(canonicalWorkspace.events.map((e) => [e.id, e]));
  for (const row of events) {
    const event = row.payload as AlertEvent;
    byId.set(event.id, {
      ...event,
      read: byId.get(event.id)?.read || false,
      delivery: row.delivery,
    });
  }
  return {
    workspace: publicWorkspaceSources({
      ...canonicalWorkspace,
      events: [...byId.values()]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 100),
    }),
    revision,
    ...(sourceIndexRecovery ? { sourceIndexRecovery } : {}),
  };
}
function logFingerprint(trade: Trade) {
  const value = { ...trade };
  delete value.version;
  delete value.events;
  delete value.autoManage;
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v).sort(([a], [b]) => a.localeCompare(b)),
        )
      : v,
  );
}
async function archiveNewLogs(userId: number, workspace: Workspace) {
  const db = await dbRequired(),
    rows = await db
      .select()
      .from(tradingPaperTrades)
      .where(eq(tradingPaperTrades.userId, userId)),
    old = new Map(rows.map((r) => [r.tradeId, r.payload as Trade]));
  let complete = true;
  for (const input of workspace.trades) {
    const original = old.get(input.id);
    if (original?.orderType) continue;
    if (original && logFingerprint(original) === logFingerprint(input))
      continue;
    if (original && (input.version || 1) !== (original.version || 1)) {
      complete = false;
      continue;
    }
    const trade: Trade = {
      ...input,
      version: (original?.version || 0) + 1,
      autoManage: false,
      events: [
        ...(input.events || []),
        {
          id: `${input.id}:history-v${(original?.version || 0) + 1}`,
          kind: "created",
          at: Date.now(),
          note: "Owner-entered manual paper history revision. No broker fill is asserted; original user journal retained in its prior snapshot.",
        },
      ],
    };
    await db.transaction(async (tx) => {
      if (original) {
        const result = await tx
          .update(tradingPaperTrades)
          .set({
            version: trade.version!,
            status: trade.status,
            payload: trade,
          })
          .where(
            and(
              eq(tradingPaperTrades.userId, userId),
              eq(tradingPaperTrades.tradeId, input.id),
              eq(tradingPaperTrades.version, original.version || 1),
            ),
          );
        if (result[0].affectedRows !== 1)
          throw new TRPCError({ code: "CONFLICT" });
      } else
        await tx.insert(tradingPaperTrades).values({
          id: `${userId}:${input.id}`,
          tradeId: input.id,
          userId,
          version: trade.version!,
          status: trade.status,
          payload: trade,
          createdAt: new Date(input.createdAt),
        });
      await tx.insert(tradingPaperEvents).values({
        id: `${userId}:${input.id}:v${trade.version}`,
        userId,
        tradeId: input.id,
        version: trade.version!,
        payload: trade,
      });
    });
  }
  return complete;
}
async function archiveAfterSave(userId: number, workspace: Workspace) {
  try {
    return await archiveNewLogs(userId, workspace);
  } catch {
    console.warn("[History] Log archive deferred; workspace save succeeded.");
    return false;
  }
}
export async function saveWorkspace(
  userId: number,
  workspace: Workspace,
  revision: number,
) {
  const db = await dbRequired();
  if (revision === 0) {
    try {
      await db
        .insert(tradingWorkspaces)
        .values({ userId, payload: workspace, revision: 1 });
      return {
        revision: 1,
        historyArchived: await archiveAfterSave(userId, workspace),
      };
    } catch {
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "A cloud workspace already exists. Load it before saving; local changes remain on this device.",
      });
    }
  }
  const result = await db
    .update(tradingWorkspaces)
    .set({ payload: workspace, revision: revision + 1 })
    .where(
      and(
        eq(tradingWorkspaces.userId, userId),
        eq(tradingWorkspaces.revision, revision),
      ),
    );
  if (result[0].affectedRows !== 1)
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "Cloud workspace changed elsewhere. Load or export local changes before retrying; nothing was overwritten.",
    });
  return {
    revision: revision + 1,
    historyArchived: await archiveAfterSave(userId, workspace),
  };
}
function encryptionKey() {
  if (!ENV.cookieSecret)
    throw new Error("Private file encryption is unavailable.");
  return Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(ENV.cookieSecret),
      Buffer.from(ENV.appId),
      Buffer.from("stratdesk-private-files-v1"),
      32,
    ),
  );
}
export function encryptFile(bytes: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([Buffer.from("SD01"), iv, cipher.getAuthTag(), data]);
}
export function decryptFile(bytes: Buffer) {
  if (bytes.subarray(0, 4).toString() !== "SD01")
    throw new Error("Invalid encrypted source envelope.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    bytes.subarray(4, 16),
  );
  decipher.setAuthTag(bytes.subarray(16, 32));
  return Buffer.concat([decipher.update(bytes.subarray(32)), decipher.final()]);
}
export async function storeSource(
  userId: number,
  pattern: Pattern,
  bytes: Buffer,
) {
  const db = await dbRequired();
  const uploaded = await storagePut(
    `private-sources/${userId}/${pattern.id}.enc`,
    encryptFile(bytes),
    "application/octet-stream",
  );
  await db.insert(tradingSources).values({
    id: pattern.id,
    userId,
    objectKey: uploaded.key,
    mime: pattern.mime!,
    filename: pattern.filename!,
    metadata: pattern,
  });
  return uploaded.key;
}
export async function updateSource(userId: number, pattern: Pattern) {
  const db = await dbRequired();
  await db.transaction(async (tx) => {
    await tx
      .update(tradingSources)
      .set({ metadata: pattern })
      .where(
        and(
          eq(tradingSources.id, pattern.id),
          eq(tradingSources.userId, userId),
        ),
      );
    await tx
      .insert(tradingReferenceVersions)
      .values({
        id: `${userId}:${pattern.id}:v${pattern.version}`,
        userId,
        patternId: pattern.id,
        version: pattern.version,
        payload: pattern,
      })
      .onDuplicateKeyUpdate({ set: { payload: pattern } });
  });
}

/**
 * Persists optional visual-index metadata without advancing the owner revision.
 * The durable job row is locked first, so a completed cancellation prevents any
 * late index metadata write from an already-running worker.
 */
export async function updateSourceVisualIndexForActiveJob(
  userId: number,
  input: {
    jobId: string;
    sourceId: string;
    expectedVersion: number;
    pattern: Pattern;
  },
): Promise<Pattern | null> {
  const db = await dbRequired();
  return db.transaction(async (tx) => {
    const jobs = await tx
      .select({ status: tradingResearchJobs.status })
      .from(tradingResearchJobs)
      .where(
        and(
          eq(tradingResearchJobs.id, input.jobId),
          eq(tradingResearchJobs.userId, userId),
          eq(tradingResearchJobs.kind, "source-blueprint"),
        ),
      )
      .limit(1)
      .for("update");
    if (jobs[0]?.status !== "running") return null;

    const rows = await tx
      .select()
      .from(tradingSources)
      .where(
        and(
          eq(tradingSources.id, input.sourceId),
          eq(tradingSources.userId, userId),
        ),
      )
      .limit(1)
      .for("update");
    const original = rows[0]?.metadata as Pattern | undefined;
    if (!original || original.version !== input.expectedVersion) {
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "The source changed before visual-index metadata could be saved.",
      });
    }

    const persisted: Pattern = {
      ...original,
      visualIndex: input.pattern.visualIndex,
    };
    const updated = await tx
      .update(tradingSources)
      .set({ metadata: persisted })
      .where(
        and(
          eq(tradingSources.id, input.sourceId),
          eq(tradingSources.userId, userId),
          sql`JSON_EXTRACT(${tradingSources.metadata}, '$.version') = ${input.expectedVersion}`,
        ),
      );
    if (updated[0].affectedRows !== 1) {
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "The source changed before visual-index metadata could be saved.",
      });
    }
    await tx
      .insert(tradingReferenceVersions)
      .values({
        id: `${userId}:${input.sourceId}:v${input.expectedVersion}`,
        userId,
        patternId: input.sourceId,
        version: input.expectedVersion,
        payload: persisted,
      })
      .onDuplicateKeyUpdate({ set: { payload: persisted } });
    return persisted;
  });
}

/**
 * Saves an unapproved blueprint and transitions its locked job to `succeeded`
 * in one transaction. A cancel that obtains the row lock first wins; a later
 * cancel sees the terminal result and cannot relabel a saved source as cancelled.
 */
export async function persistSourceAnalysisResult(
  userId: number,
  input: {
    jobId: string;
    sourceId: string;
    expectedVersion: number;
    blueprint: unknown;
    result: unknown;
  },
): Promise<Pattern> {
  const db = await dbRequired();
  return db.transaction(async (tx) => {
    const jobs = await tx
      .select({ status: tradingResearchJobs.status })
      .from(tradingResearchJobs)
      .where(
        and(
          eq(tradingResearchJobs.id, input.jobId),
          eq(tradingResearchJobs.userId, userId),
          eq(tradingResearchJobs.kind, "source-blueprint"),
        ),
      )
      .limit(1)
      .for("update");
    if (jobs[0]?.status !== "running") {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Analysis was cancelled before its result could be saved.",
      });
    }

    const rows = await tx
      .select()
      .from(tradingSources)
      .where(
        and(
          eq(tradingSources.id, input.sourceId),
          eq(tradingSources.userId, userId),
        ),
      )
      .limit(1)
      .for("update");
    const original = rows[0]?.metadata as Pattern | undefined;
    if (!original || original.version !== input.expectedVersion) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "This source was revised while the proposal was being saved.",
      });
    }

    const revised: Pattern = {
      ...original,
      status: "review",
      description:
        original.description ||
        "Structured analysis retained for human review.",
      version: input.expectedVersion + 1,
      blueprint: input.blueprint as Pattern["blueprint"],
    };
    const sourceUpdated = await tx
      .update(tradingSources)
      .set({ metadata: revised })
      .where(
        and(
          eq(tradingSources.id, input.sourceId),
          eq(tradingSources.userId, userId),
          sql`JSON_EXTRACT(${tradingSources.metadata}, '$.version') = ${input.expectedVersion}`,
        ),
      );
    if (sourceUpdated[0].affectedRows !== 1) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "This source was revised while the proposal was being saved.",
      });
    }
    await tx.insert(tradingReferenceVersions).values({
      id: `${userId}:${input.sourceId}:v${revised.version}`,
      userId,
      patternId: input.sourceId,
      version: revised.version,
      payload: revised,
    });
    const jobUpdated = await tx
      .update(tradingResearchJobs)
      .set({
        status: "succeeded",
        error: null,
        result: input.result,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tradingResearchJobs.id, input.jobId),
          eq(tradingResearchJobs.userId, userId),
          eq(tradingResearchJobs.kind, "source-blueprint"),
          eq(tradingResearchJobs.status, "running"),
        ),
      );
    if (jobUpdated[0].affectedRows !== 1) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Analysis was cancelled before its result could be saved.",
      });
    }
    return revised;
  });
}
export async function reviseSource(
  userId: number,
  pattern: Pattern,
  expectedVersion: number,
) {
  const db = await dbRequired();
  if (pattern.version !== expectedVersion + 1)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Reference revisions must advance by one.",
    });
  await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(tradingSources)
      .where(
        and(
          eq(tradingSources.id, pattern.id),
          eq(tradingSources.userId, userId),
        ),
      )
      .limit(1);
    if (!rows[0])
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Source not found in your account.",
      });
    const original = rows[0].metadata as Pattern;
    const persisted: Pattern = {
      ...pattern,
      // A public client does not receive this server-only key. Preserve it from
      // the locked authoritative row rather than requiring clients to echo it.
      fileKey: original.fileKey,
      visualIndex: original.visualIndex,
    };
    if (
      pattern.filename !== original.filename ||
      pattern.mime !== original.mime ||
      (pattern.fileKey !== undefined && pattern.fileKey !== original.fileKey)
    )
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "A definition revision cannot replace original source bytes or metadata.",
      });
    const result = await tx
      .update(tradingSources)
      .set({ metadata: persisted })
      .where(
        and(
          eq(tradingSources.id, pattern.id),
          eq(tradingSources.userId, userId),
          sql`JSON_EXTRACT(${tradingSources.metadata}, '$.version') = ${expectedVersion}`,
        ),
      );
    if (result[0].affectedRows !== 1)
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "This source was revised elsewhere. Reload its authoritative record before making another edit.",
      });
    await tx.insert(tradingReferenceVersions).values({
      id: `${userId}:${pattern.id}:v${pattern.version}`,
      userId,
      patternId: pattern.id,
      version: pattern.version,
      payload: persisted,
    });
  });
  return publicSourcePattern(pattern);
}
export async function sourceVersions(userId: number, id: string) {
  const db = await dbRequired();
  const rows = await db
    .select()
    .from(tradingReferenceVersions)
    .where(
      and(
        eq(tradingReferenceVersions.userId, userId),
        eq(tradingReferenceVersions.patternId, id),
      ),
    )
    .orderBy(desc(tradingReferenceVersions.version))
    .limit(20);
  return rows.map((row) => publicSourcePattern(row.payload as Pattern));
}
export async function getSource(userId: number, id: string) {
  const db = await dbRequired();
  const rows = await db
    .select()
    .from(tradingSources)
    .where(and(eq(tradingSources.id, id), eq(tradingSources.userId, userId)))
    .limit(1);
  if (!rows[0])
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Source not found in your private library.",
    });
  const url = await storageGetSignedUrl(rows[0].objectKey);
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error("Source bytes unavailable. Try again later.");
  const encrypted = Buffer.from(await res.arrayBuffer());
  if (encrypted.length > 25 * 1024 * 1024 + 128)
    throw new Error("Source size exceeded limit.");
  return {
    mime: rows[0].mime,
    base64: decryptFile(encrypted).toString("base64"),
    metadata: rows[0].metadata as Pattern,
  };
}

export async function getSourceDefinition(userId: number, id: string) {
  const db = await dbRequired();
  const rows = await db
    .select({ metadata: tradingSources.metadata })
    .from(tradingSources)
    .where(and(eq(tradingSources.id, id), eq(tradingSources.userId, userId)))
    .limit(1);
  if (!rows[0])
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Source not found in your private library.",
    });
  return rows[0].metadata as Pattern;
}

/** Bounded metadata-only retrieval: private originals never enter a generic coach packet. */
export async function recentSourceDefinitions(
  userId: number,
  limit = 20,
): Promise<Pattern[]> {
  const db = await dbRequired();
  const rows = await db
    .select({ metadata: tradingSources.metadata })
    .from(tradingSources)
    .where(eq(tradingSources.userId, userId))
    .orderBy(desc(tradingSources.createdAt))
    .limit(Math.max(1, Math.min(50, Math.floor(limit))));
  return rows.map((row) => publicSourcePattern(row.metadata as Pattern));
}

/** Private screenshot inventory survives remounts even when local workspace sync is explicit. */
export async function listScreenshotSources(userId: number, tradeId?: string) {
  const db = await dbRequired();
  const rows = await db
    .select({ metadata: tradingSources.metadata })
    .from(tradingSources)
    .where(
      and(
        eq(tradingSources.userId, userId),
        sql`(JSON_EXTRACT(${tradingSources.metadata}, '$.tradeReview') IS NOT NULL OR JSON_UNQUOTE(JSON_EXTRACT(${tradingSources.metadata}, '$.name')) LIKE 'Screenshot review%')`,
        tradeId
          ? sql`JSON_UNQUOTE(JSON_EXTRACT(${tradingSources.metadata}, '$.tradeReview.linkedTrade.canonicalTradeId')) = ${tradeId}`
          : undefined,
      ),
    )
    .orderBy(desc(tradingSources.createdAt))
    .limit(100);
  return rows.map((row) => {
    const p = row.metadata as Pattern;
    return {
      id: p.id,
      name: p.name,
      version: p.version,
      filename: p.filename,
      mime: p.mime,
      uploadedAt: p.createdAt,
      summary: p.tradeReview?.summary.slice(0, 240),
      stage: p.tradeReview?.stage,
      approval: p.tradeReview?.approval.status,
      linkedTradeId: p.tradeReview?.linkedTrade.canonicalTradeId,
    };
  });
}
