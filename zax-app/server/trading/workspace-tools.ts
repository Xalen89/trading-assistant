import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import {
  tradingPaperTrades,
  tradingReferenceVersions,
  tradingRuntimeState,
  tradingSources,
  tradingVectors,
  tradingWorkspaces,
} from "../../drizzle/schema";
import {
  logicalSourceDeletionResult,
  pendingSourceCleanupRecord,
} from "../../lib/trading/source-cleanup";
import type { Pattern, Trade, Workspace } from "../../lib/trading/model";
import {
  DETACHED_STRATEGY_ID,
  prepareArchivedStrategyRemoval,
  prepareLibraryRemoval,
  previewArchivedStrategyRemoval,
  previewLibraryRemoval,
  type LibraryRemovalPreview,
  type StrategyRemovalPreview,
  type VersionedSource,
} from "../../lib/trading/workspace-removal";
import { workspaceCapacity } from "../../lib/trading/workspace-capacity";
import { getDb } from "../db";
import { getSourceDefinition, loadWorkspace } from "./repository";

const MAX_DEPENDENCY_PREVIEW = 10_000;

function conflict(message: string): never {
  throw new TRPCError({ code: "CONFLICT", message });
}

function badRequest(message: string): never {
  throw new TRPCError({ code: "BAD_REQUEST", message });
}

async function dbRequired() {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Private workspace storage is unavailable. Nothing was deleted.",
    });
  return db;
}

async function savedWorkspace(
  userId: number,
  expectedWorkspaceRevision?: number,
) {
  const loaded = await loadWorkspace(userId);
  if (!loaded.workspace)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "No saved workspace exists for this owner.",
    });
  if (
    expectedWorkspaceRevision !== undefined &&
    loaded.revision !== expectedWorkspaceRevision
  )
    conflict("Workspace changed elsewhere. Reopen the removal preview.");
  return loaded as { workspace: Workspace; revision: number };
}

async function ownerSourceDefinitions(userId: number) {
  const db = await dbRequired();
  const rows = await db
    .select({ metadata: tradingSources.metadata })
    .from(tradingSources)
    .where(eq(tradingSources.userId, userId))
    .limit(501);
  if (rows.length > 500)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Source library exceeds the 500-record safety bound; no removal was attempted.",
    });
  return rows.map((row) => row.metadata as Pattern);
}

async function canonicalPaperRecords(userId: number) {
  const db = await dbRequired();
  const rows = await db
    .select({ payload: tradingPaperTrades.payload })
    .from(tradingPaperTrades)
    .where(eq(tradingPaperTrades.userId, userId))
    .limit(MAX_DEPENDENCY_PREVIEW + 1);
  if (rows.length > MAX_DEPENDENCY_PREVIEW)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Paper history is too large for a safe deletion preview. Nothing was changed.",
    });
  return rows.map((row) => row.payload as Trade);
}

function sourcesFromPreview(preview: StrategyRemovalPreview) {
  const sourceMap = new Map<string, VersionedSource>();
  for (const source of [
    ...preview.sourceScreenshots,
    ...preview.sourceLibraryRecords,
  ])
    sourceMap.set(source.id, { id: source.id, version: source.sourceVersion });
  return [...sourceMap.values()];
}

function assertExactSourceVersions(
  required: readonly VersionedSource[],
  supplied: readonly VersionedSource[],
) {
  const suppliedById = new Map(
    supplied.map((source) => [source.id, source.version]),
  );
  if (suppliedById.size !== required.length)
    conflict(
      "Dependent source selection changed. Reopen the deletion preview.",
    );
  for (const source of required) {
    if (suppliedById.get(source.id) !== source.version)
      conflict("A dependent source changed. Reopen the deletion preview.");
  }
}

/**
 * Deletion mutations read their CAS row under a transaction lock rather than
 * using `loadWorkspace`: the latter is appropriate for previews, but cannot
 * make a workspace revision and dependent source changes one atomic unit.
 */
async function lockedWorkspace(
  tx: any,
  userId: number,
  expectedWorkspaceRevision: number,
): Promise<{ workspace: Workspace; revision: number }> {
  const rows = await tx
    .select({
      payload: tradingWorkspaces.payload,
      revision: tradingWorkspaces.revision,
    })
    .from(tradingWorkspaces)
    .where(eq(tradingWorkspaces.userId, userId))
    .limit(1)
    .for("update");
  if (!rows[0])
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "No saved workspace exists for this owner.",
    });
  if (rows[0].revision !== expectedWorkspaceRevision)
    conflict("Workspace changed elsewhere. Reopen the removal preview.");
  return {
    workspace: rows[0].payload as Workspace,
    revision: rows[0].revision,
  };
}

async function lockedOwnerSources(tx: any, userId: number): Promise<Pattern[]> {
  const rows = await tx
    .select({ metadata: tradingSources.metadata })
    .from(tradingSources)
    .where(eq(tradingSources.userId, userId))
    .limit(501)
    .for("update");
  if (rows.length > 500)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Source library exceeds the 500-record safety bound; no removal was attempted.",
    });
  return rows.map((row: { metadata: unknown }) => row.metadata as Pattern);
}

async function lockedOwnerSource(
  tx: any,
  userId: number,
  sourceId: string,
): Promise<{ metadata: Pattern; objectKey: string }> {
  const rows = await tx
    .select({
      metadata: tradingSources.metadata,
      objectKey: tradingSources.objectKey,
    })
    .from(tradingSources)
    .where(
      and(eq(tradingSources.id, sourceId), eq(tradingSources.userId, userId)),
    )
    .limit(1)
    .for("update");
  if (!rows[0])
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Source not found in your private library.",
    });
  return {
    metadata: rows[0].metadata as Pattern,
    objectKey: rows[0].objectKey as string,
  };
}

async function canonicalPaperRecordsInTransaction(
  tx: any,
  userId: number,
): Promise<Trade[]> {
  const rows = await tx
    .select({ payload: tradingPaperTrades.payload })
    .from(tradingPaperTrades)
    .where(eq(tradingPaperTrades.userId, userId))
    .limit(MAX_DEPENDENCY_PREVIEW + 1);
  if (rows.length > MAX_DEPENDENCY_PREVIEW)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Paper history is too large for a safe deletion preview. Nothing was changed.",
    });
  return rows.map((row: { payload: unknown }) => row.payload as Trade);
}

/** Matches the canonical-history merge used by workspace reads without writing it. */
function withCanonicalPaperRecords(
  workspace: Workspace,
  records: readonly Trade[],
) {
  const trades = new Map(workspace.trades.map((trade) => [trade.id, trade]));
  for (const record of records)
    if (
      record.orderType ||
      (record.version || 1) > (trades.get(record.id)?.version || 1)
    )
      trades.set(record.id, record);
  return {
    ...workspace,
    trades: [...trades.values()].sort((a, b) => b.createdAt - a.createdAt),
  };
}

/** Owner-only read path for capacity UI; no persistence work occurs. */
export async function getWorkspaceToolsCapacity(userId: number) {
  const loaded = await loadWorkspace(userId);
  return {
    revision: loaded.revision,
    capacity: loaded.workspace
      ? workspaceCapacity(loaded.workspace)
      : undefined,
  };
}

/** Includes canonical DB paper history, never only the mutable local cache. */
export async function getArchivedStrategyRemovalPreview(
  userId: number,
  strategyId: string,
) {
  const loaded = await savedWorkspace(userId);
  const [trades, sources] = await Promise.all([
    canonicalPaperRecords(userId),
    ownerSourceDefinitions(userId),
  ]);
  const preview = previewArchivedStrategyRemoval(
    loaded.workspace,
    strategyId,
    trades,
    sources,
  );
  return {
    workspaceRevision: loaded.revision,
    preview,
    requiredSourceVersions: sourcesFromPreview(preview),
  };
}

/**
 * An archived-strategy removal detaches source metadata only. It never edits
 * paper records and never asks object storage to delete encrypted originals.
 */
export async function deleteArchivedStrategy(
  userId: number,
  input: {
    strategyId: string;
    expectedStrategyVersion: number;
    expectedWorkspaceRevision: number;
    confirmation: string;
    dependentSourceVersions: VersionedSource[];
  },
) {
  const db = await dbRequired();
  return db.transaction(async (tx) => {
    const loaded = await lockedWorkspace(
      tx,
      userId,
      input.expectedWorkspaceRevision,
    );
    const sources = await lockedOwnerSources(tx, userId);
    // Canonical paper history is read only. It remains deliberately untouched.
    const trades = await canonicalPaperRecordsInTransaction(tx, userId);
    const workspace = withCanonicalPaperRecords(loaded.workspace, trades);
    const preview = previewArchivedStrategyRemoval(
      workspace,
      input.strategyId,
      trades,
      sources,
    );
    const requiredSources = sourcesFromPreview(preview);
    assertExactSourceVersions(requiredSources, input.dependentSourceVersions);

    const sourcesById = new Map<string, Pattern>(
      sources.map((source): [string, Pattern] => [source.id, source]),
    );
    const authoritative = requiredSources.map((required) => {
      const source = sourcesById.get(required.id);
      if (!source || source.version !== required.version)
        conflict("A dependent source changed. Reopen the deletion preview.");
      return source;
    });
    const next = prepareArchivedStrategyRemoval(workspace, input);

    // Keep original encrypted bytes and the immutable visual index intact: only
    // the locked owner metadata is revised and a matching revision row is added.
    for (const source of authoritative) {
      const detached = {
        ...source,
        strategyId: DETACHED_STRATEGY_ID,
        version: source.version + 1,
      };
      const result = await tx
        .update(tradingSources)
        .set({ metadata: detached })
        .where(
          and(
            eq(tradingSources.id, source.id),
            eq(tradingSources.userId, userId),
            sql`JSON_EXTRACT(${tradingSources.metadata}, '$.version') = ${source.version}`,
          ),
        );
      if (result[0].affectedRows !== 1)
        conflict("A dependent source changed. Reopen the deletion preview.");
      await tx.insert(tradingReferenceVersions).values({
        id: `${userId}:${source.id}:v${detached.version}`,
        userId,
        patternId: source.id,
        version: detached.version,
        payload: detached,
      });
    }

    const saved = await tx
      .update(tradingWorkspaces)
      .set({ payload: next, revision: loaded.revision + 1 })
      .where(
        and(
          eq(tradingWorkspaces.userId, userId),
          eq(tradingWorkspaces.revision, loaded.revision),
        ),
      );
    if (saved[0].affectedRows !== 1)
      conflict("Workspace changed elsewhere. Reopen the removal preview.");
    return {
      revision: loaded.revision + 1,
      detachedSourceRecords: authoritative.length,
      removedAlerts: preview.dependentAlerts.length,
      retainedCanonicalPaperRecords: preview.canonicalPaperRecords.length,
      objectStorageDeleted: false,
    };
  });
}

export async function getLibraryRemovalPreview(
  userId: number,
  sourceId: string,
) {
  const loaded = await savedWorkspace(userId);
  const source = await getSourceDefinition(userId, sourceId);
  const indexedWorkspace = loaded.workspace.patterns.some(
    (pattern) => pattern.id === sourceId,
  )
    ? loaded.workspace
    : { ...loaded.workspace, patterns: [...loaded.workspace.patterns, source] };
  const preview = previewLibraryRemoval(indexedWorkspace, sourceId);
  // DB metadata is authoritative even if an old local workspace index differs.
  preview.source.version = source.version;
  return { workspaceRevision: loaded.revision, preview };
}

/**
 * Removes workspace references and authorized metadata/index rows as one CAS
 * transaction. The original encrypted object key is retained only in a durable,
 * server-only pending-cleanup runtime record; no storage-provider call occurs.
 */
export async function deleteLibraryRecord(
  userId: number,
  input: {
    sourceId: string;
    expectedSourceVersion: number;
    expectedWorkspaceRevision: number;
    confirmation: string;
  },
) {
  const db = await dbRequired();
  return db.transaction(async (tx) => {
    const loaded = await lockedWorkspace(
      tx,
      userId,
      input.expectedWorkspaceRevision,
    );
    const locked = await lockedOwnerSource(tx, userId, input.sourceId);
    const source = locked.metadata;
    if (source.version !== input.expectedSourceVersion)
      conflict(
        "Library record changed elsewhere. Reopen the deletion preview.",
      );
    const indexedWorkspace = loaded.workspace.patterns.some(
      (pattern) => pattern.id === input.sourceId,
    )
      ? loaded.workspace
      : {
          ...loaded.workspace,
          patterns: [...loaded.workspace.patterns, source],
        };
    const preview = previewLibraryRemoval(indexedWorkspace, input.sourceId);
    if (preview.confirmation !== input.confirmation)
      badRequest("Deletion confirmation did not match the library record.");
    const next = prepareLibraryRemoval(indexedWorkspace, {
      sourceId: input.sourceId,
      expectedSourceVersion: input.expectedSourceVersion,
      confirmation: input.confirmation,
    });

    const cleanup = pendingSourceCleanupRecord({
      ownerId: userId,
      sourceId: source.id,
      sourceVersion: source.version,
      originalEncryptedObjectKey: locked.objectKey,
    });
    const existingCleanup = await tx
      .select({ id: tradingRuntimeState.id })
      .from(tradingRuntimeState)
      .where(
        and(
          eq(tradingRuntimeState.id, cleanup.id),
          eq(tradingRuntimeState.userId, userId),
          eq(tradingRuntimeState.kind, cleanup.kind),
        ),
      )
      .limit(1)
      .for("update");
    if (existingCleanup[0])
      conflict(
        "A pending cleanup already exists for this source version. Nothing was deleted.",
      );

    // The current storage helper has no delete capability. Persist the original
    // locator before logical deletion so a future explicit cleanup worker has an
    // authoritative owner/source/version record without exposing it to the UI.
    await tx.insert(tradingRuntimeState).values(cleanup);

    const saved = await tx
      .update(tradingWorkspaces)
      .set({ payload: next, revision: loaded.revision + 1 })
      .where(
        and(
          eq(tradingWorkspaces.userId, userId),
          eq(tradingWorkspaces.revision, loaded.revision),
        ),
      );
    if (saved[0].affectedRows !== 1)
      conflict("Workspace changed elsewhere. Reopen the removal preview.");

    const result = await tx
      .delete(tradingSources)
      .where(
        and(
          eq(tradingSources.id, input.sourceId),
          eq(tradingSources.userId, userId),
          sql`JSON_EXTRACT(${tradingSources.metadata}, '$.version') = ${input.expectedSourceVersion}`,
        ),
      );
    if (result[0].affectedRows !== 1)
      conflict(
        "Library record changed while being removed. Original bytes remain protected.",
      );
    await tx
      .delete(tradingReferenceVersions)
      .where(
        and(
          eq(tradingReferenceVersions.userId, userId),
          eq(tradingReferenceVersions.patternId, input.sourceId),
        ),
      );
    await tx
      .delete(tradingVectors)
      .where(
        and(
          eq(tradingVectors.userId, userId),
          eq(tradingVectors.patternId, input.sourceId),
        ),
      );
    return {
      revision: loaded.revision + 1,
      removedWorkspaceReferences: preview.matchingWorkspaceRecords,
      ...logicalSourceDeletionResult(),
    };
  });
}

export type { LibraryRemovalPreview, StrategyRemovalPreview };
