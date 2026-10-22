import { describe, expect, it } from "vitest";
import {
  logicalSourceDeletionResult,
  pendingSourceCleanupId,
  pendingSourceCleanupRecord,
} from "../../lib/trading/source-cleanup";

describe("source cleanup record contracts", () => {
  it("uses an owner/source/version-specific durable ID and retains the encrypted locator only in the server record", () => {
    const record = pendingSourceCleanupRecord({
      ownerId: 42,
      sourceId: "source-unit",
      sourceVersion: 7,
      originalEncryptedObjectKey: "private-sources/42/source-unit_a1b2c3d4.enc",
    });

    expect(record).toEqual({
      id: pendingSourceCleanupId({
        ownerId: 42,
        sourceId: "source-unit",
        sourceVersion: 7,
      }),
      userId: 42,
      kind: "source-cleanup",
      payload: {
        schemaVersion: 1,
        status: "pending",
        ownerId: 42,
        sourceId: "source-unit",
        sourceVersion: 7,
        originalEncryptedObjectKey:
          "private-sources/42/source-unit_a1b2c3d4.enc",
        providerDelete: "unsupported",
      },
    });
    expect(record.id).not.toBe(
      pendingSourceCleanupId({
        ownerId: 42,
        sourceId: "source-unit",
        sourceVersion: 8,
      }),
    );
  });

  it("reports logical deletion, reclaimed capacity, and pending cleanup without exposing an object key", () => {
    const result = logicalSourceDeletionResult();

    expect(result).toMatchObject({
      cleanupPending: true,
      capacityReclaimed: true,
      objectStorageDeleted: false,
    });
    expect(result.retainedOriginalNotice).toMatch(/logical deletion/i);
    expect(result.retainedOriginalNotice).toMatch(/capacity was reclaimed/i);
    expect(result.retainedOriginalNotice).toMatch(/still retained/i);
    expect(result).not.toHaveProperty("originalEncryptedObjectKey");
    expect(JSON.stringify(result)).not.toContain("private-sources/");
  });
});
