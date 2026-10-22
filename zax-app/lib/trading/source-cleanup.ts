export const SOURCE_CLEANUP_RUNTIME_KIND = "source-cleanup" as const;

export type PendingSourceCleanupPayload = Readonly<{
  schemaVersion: 1;
  status: "pending";
  ownerId: number;
  sourceId: string;
  sourceVersion: number;
  /** Server-only object-storage locator; never place this in a public DTO. */
  originalEncryptedObjectKey: string;
  providerDelete: "unsupported";
}>;

export type PendingSourceCleanupRecord = Readonly<{
  id: string;
  userId: number;
  kind: typeof SOURCE_CLEANUP_RUNTIME_KIND;
  payload: PendingSourceCleanupPayload;
}>;

export type SourceLogicalDeletionResult = Readonly<{
  cleanupPending: true;
  capacityReclaimed: true;
  objectStorageDeleted: false;
  retainedOriginalNotice: string;
}>;

export type PendingSourceCleanupInput = Readonly<{
  ownerId: number;
  sourceId: string;
  sourceVersion: number;
  originalEncryptedObjectKey: string;
}>;

function assertCleanupInput(input: PendingSourceCleanupInput) {
  if (!Number.isSafeInteger(input.ownerId) || input.ownerId <= 0)
    throw new Error("A verified owner is required for source cleanup.");
  if (!input.sourceId || input.sourceId.length > 100)
    throw new Error("Source cleanup requires a bounded source ID.");
  if (!Number.isSafeInteger(input.sourceVersion) || input.sourceVersion <= 0)
    throw new Error("Source cleanup requires a positive source version.");
  if (
    !input.originalEncryptedObjectKey ||
    input.originalEncryptedObjectKey.length > 512
  )
    throw new Error(
      "Source cleanup requires the original encrypted object key.",
    );
}

/** A version-specific ID prevents an older pending cleanup from masking a new source revision. */
export function pendingSourceCleanupId(
  input: Pick<
    PendingSourceCleanupInput,
    "ownerId" | "sourceId" | "sourceVersion"
  >,
) {
  return `source-cleanup:${input.ownerId}:${input.sourceId}:v${input.sourceVersion}`;
}

/**
 * Builds the sole durable, server-only cleanup record for an explicitly removed
 * source. The caller must insert it in the same transaction as the metadata and
 * index removal; this helper deliberately performs no provider operation.
 */
export function pendingSourceCleanupRecord(
  input: PendingSourceCleanupInput,
): PendingSourceCleanupRecord {
  assertCleanupInput(input);
  return {
    id: pendingSourceCleanupId(input),
    userId: input.ownerId,
    kind: SOURCE_CLEANUP_RUNTIME_KIND,
    payload: {
      schemaVersion: 1,
      status: "pending",
      ownerId: input.ownerId,
      sourceId: input.sourceId,
      sourceVersion: input.sourceVersion,
      originalEncryptedObjectKey: input.originalEncryptedObjectKey,
      providerDelete: "unsupported",
    },
  };
}

/**
 * Public result for the existing owner UI. It intentionally reports logical
 * deletion and reclaimed library capacity without leaking the storage locator.
 */
export function logicalSourceDeletionResult(): SourceLogicalDeletionResult {
  return {
    cleanupPending: true,
    capacityReclaimed: true,
    objectStorageDeleted: false,
    retainedOriginalNotice:
      "Logical deletion completed and source-library capacity was reclaimed. The encrypted original is still retained because this storage provider does not support deletion; cleanup is pending.",
  };
}
