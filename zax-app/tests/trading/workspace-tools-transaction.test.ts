import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  tradingPaperTrades,
  tradingReferenceVersions,
  tradingRuntimeState,
  tradingSources,
  tradingVectors,
  tradingWorkspaces,
} from "../../drizzle/schema";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  loadWorkspace: vi.fn(),
  getSourceDefinition: vi.fn(),
}));

vi.mock("../../server/db", () => ({ getDb: mocks.getDb }));
vi.mock("../../server/trading/repository", () => ({
  loadWorkspace: mocks.loadWorkspace,
  getSourceDefinition: mocks.getSourceDefinition,
}));

import {
  deleteArchivedStrategy,
  deleteLibraryRecord,
} from "../../server/trading/workspace-tools";

type SourceRow = {
  metadata: any;
  objectKey: string;
  mime: string;
  filename: string;
};

type MemoryState = {
  workspace: { payload: any; revision: number } | null;
  sources: SourceRow[];
  paperTrades: { payload: any }[];
  referenceVersions: any[];
  runtimeState: any[];
  vectors: any[];
  /** The mock models the service's exact current-version cleanup-record lookup. */
  cleanupLookupId?: string;
  workspaceCasFails?: boolean;
  failDelete?: "referenceVersions" | "vectors";
};

type Audit = { locks: string[]; operations: string[] };

function source(version = 4) {
  return {
    id: "source-1",
    name: "Retired setup notes",
    strategyId: "retired",
    filename: "setup.txt",
    mime: "text/plain",
    fileKey: "private-sources/7/source-1.enc",
    createdAt: 1_700_000_000_000,
    version,
    tags: [],
    notes: "private owner notes",
    visualIndex: { descriptor: "immutable-index" },
  };
}

function workspace(pattern = source()) {
  return {
    strategies: [
      { id: "retired", name: "Retired", version: 3, archived: true },
      { id: "active", name: "Active", version: 1, archived: false },
    ],
    alerts: [
      {
        id: "alert-1",
        name: "Retired alert",
        strategyId: "retired",
        enabled: true,
      },
    ],
    levels: [{ id: "level-1", strategyId: "retired" }],
    matches: [{ id: "match-1", strategyId: "retired", patternId: pattern.id }],
    patterns: [pattern],
    trades: [],
    activeStrategyId: "retired",
  } as any;
}

function tableName(table: unknown) {
  if (table === tradingWorkspaces) return "workspaces";
  if (table === tradingSources) return "sources";
  if (table === tradingPaperTrades) return "paperTrades";
  if (table === tradingReferenceVersions) return "referenceVersions";
  if (table === tradingRuntimeState) return "runtimeState";
  if (table === tradingVectors) return "vectors";
  return "unknown";
}

function cleanupId(version = 4) {
  return `source-cleanup:7:source-1:v${version}`;
}

/**
 * A transactional in-memory Drizzle double: draft changes commit only after the
 * callback resolves. It intentionally performs no network or database writes.
 */
function mockedDatabase(state: MemoryState, audit: Audit) {
  function transactionClient(draft: MemoryState) {
    return {
      select() {
        return {
          from(table: unknown) {
            const rows =
              table === tradingWorkspaces
                ? draft.workspace
                  ? [draft.workspace]
                  : []
                : table === tradingSources
                  ? draft.sources
                  : table === tradingPaperTrades
                    ? draft.paperTrades
                    : table === tradingRuntimeState
                      ? draft.runtimeState.filter(
                          (record) => record.id === draft.cleanupLookupId,
                        )
                      : [];
            let limit = Number.POSITIVE_INFINITY;
            const query: any = {
              where() {
                return query;
              },
              limit(value: number) {
                limit = value;
                return query;
              },
              for() {
                audit.locks.push(tableName(table));
                return query;
              },
              then(
                resolve: (value: unknown) => unknown,
                reject: (error: unknown) => unknown,
              ) {
                return Promise.resolve(rows.slice(0, limit)).then(
                  resolve,
                  reject,
                );
              },
            };
            return query;
          },
        };
      },
      update(table: unknown) {
        return {
          set(values: Record<string, unknown>) {
            return {
              async where() {
                audit.operations.push(`update:${tableName(table)}`);
                if (table === tradingWorkspaces) {
                  if (draft.workspaceCasFails) return [{ affectedRows: 0 }];
                  if (!draft.workspace) return [{ affectedRows: 0 }];
                  draft.workspace = {
                    ...draft.workspace,
                    ...values,
                  } as MemoryState["workspace"];
                  return [{ affectedRows: 1 }];
                }
                if (table === tradingSources) {
                  const metadata = values.metadata as { id: string };
                  const row = draft.sources.find(
                    (candidate) => candidate.metadata.id === metadata.id,
                  );
                  if (!row) return [{ affectedRows: 0 }];
                  row.metadata = values.metadata;
                  return [{ affectedRows: 1 }];
                }
                return [{ affectedRows: 0 }];
              },
            };
          },
        };
      },
      insert(table: unknown) {
        return {
          async values(value: unknown) {
            audit.operations.push(`insert:${tableName(table)}`);
            if (table === tradingReferenceVersions)
              draft.referenceVersions.push(value);
            if (table === tradingRuntimeState) draft.runtimeState.push(value);
            return [{ affectedRows: 1 }];
          },
        };
      },
      delete(table: unknown) {
        return {
          async where() {
            audit.operations.push(`delete:${tableName(table)}`);
            if (
              (table === tradingReferenceVersions &&
                draft.failDelete === "referenceVersions") ||
              (table === tradingVectors && draft.failDelete === "vectors")
            )
              throw new Error(`simulated ${tableName(table)} delete failure`);
            if (table === tradingSources) {
              draft.sources = [];
              return [{ affectedRows: 1 }];
            }
            if (table === tradingReferenceVersions)
              draft.referenceVersions = [];
            if (table === tradingVectors) draft.vectors = [];
            return [{ affectedRows: 1 }];
          },
        };
      },
    };
  }

  return {
    transaction: vi.fn(async (callback: (tx: any) => Promise<unknown>) => {
      const draft = structuredClone(state);
      const result = await callback(transactionClient(draft));
      state.workspace = draft.workspace;
      state.sources = draft.sources;
      state.paperTrades = draft.paperTrades;
      state.referenceVersions = draft.referenceVersions;
      state.runtimeState = draft.runtimeState;
      state.vectors = draft.vectors;
      return result;
    }),
  };
}

function strategyInput() {
  return {
    strategyId: "retired",
    expectedStrategyVersion: 3,
    expectedWorkspaceRevision: 9,
    confirmation: "DELETE ARCHIVED STRATEGY retired",
    dependentSourceVersions: [{ id: "source-1", version: 4 }],
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("workspace tool transactional removals", () => {
  it("rolls back locked source metadata and revision rows when the archived-strategy workspace CAS loses", async () => {
    const retainedSource = source();
    const state: MemoryState = {
      workspace: { payload: workspace(retainedSource), revision: 9 },
      sources: [
        {
          metadata: retainedSource,
          objectKey: "private-sources/7/source-1.enc",
          mime: "text/plain",
          filename: "setup.txt",
        },
      ],
      paperTrades: [],
      referenceVersions: [],
      runtimeState: [],
      vectors: [],
      workspaceCasFails: true,
    };
    const before = structuredClone(state);
    const audit: Audit = { locks: [], operations: [] };
    mocks.getDb.mockResolvedValue(mockedDatabase(state, audit));

    await expect(
      deleteArchivedStrategy(7, strategyInput()),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });

    expect(audit.locks).toEqual(
      expect.arrayContaining(["workspaces", "sources"]),
    );
    expect(audit.operations).toEqual([
      "update:sources",
      "insert:referenceVersions",
      "update:workspaces",
    ]);
    expect(state).toEqual(before);
  });

  it("commits archived strategy removal with only detached metadata and a revision row, retaining canonical history and source bytes", async () => {
    const retainedSource = source();
    const canonicalPaper = {
      id: "paper-1",
      strategyId: "retired",
      strategyVersion: 3,
      status: "closed",
      createdAt: 1_701_000_000_000,
      orderType: "manual",
      version: 1,
    };
    const state: MemoryState = {
      workspace: { payload: workspace(retainedSource), revision: 9 },
      sources: [
        {
          metadata: retainedSource,
          objectKey: "private-sources/7/source-1.enc",
          mime: "text/plain",
          filename: "setup.txt",
        },
      ],
      paperTrades: [{ payload: canonicalPaper }],
      referenceVersions: [],
      runtimeState: [],
      vectors: [{ id: "vector-1", patternId: "source-1", userId: 7 }],
    };
    const paperBefore = structuredClone(state.paperTrades);
    const audit: Audit = { locks: [], operations: [] };
    mocks.getDb.mockResolvedValue(mockedDatabase(state, audit));

    await expect(
      deleteArchivedStrategy(7, strategyInput()),
    ).resolves.toMatchObject({
      revision: 10,
      detachedSourceRecords: 1,
      retainedCanonicalPaperRecords: 1,
      objectStorageDeleted: false,
    });

    expect(state.workspace?.revision).toBe(10);
    expect(state.workspace?.payload.strategies).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "retired" })]),
    );
    expect(state.sources[0]).toMatchObject({
      objectKey: "private-sources/7/source-1.enc",
      mime: "text/plain",
      filename: "setup.txt",
      metadata: {
        strategyId: "__stratdesk_detached_strategy__",
        version: 5,
        visualIndex: { descriptor: "immutable-index" },
      },
    });
    expect(state.referenceVersions).toEqual([
      expect.objectContaining({ patternId: "source-1", version: 5 }),
    ]);
    expect(state.paperTrades).toEqual(paperBefore);
    expect(audit.operations).not.toContain("delete:paperTrades");
  });

  it("rolls back the workspace index and source record if library version/index removal fails", async () => {
    const retainedSource = source();
    const state: MemoryState = {
      workspace: { payload: workspace(retainedSource), revision: 9 },
      sources: [
        {
          metadata: retainedSource,
          objectKey: "private-sources/7/source-1.enc",
          mime: "text/plain",
          filename: "setup.txt",
        },
      ],
      paperTrades: [],
      referenceVersions: [
        { id: "7:source-1:v4", patternId: "source-1", userId: 7 },
      ],
      runtimeState: [],
      cleanupLookupId: cleanupId(),
      vectors: [{ id: "vector-1", patternId: "source-1", userId: 7 }],
      failDelete: "referenceVersions",
    };
    const before = structuredClone(state);
    const audit: Audit = { locks: [], operations: [] };
    mocks.getDb.mockResolvedValue(mockedDatabase(state, audit));

    await expect(
      deleteLibraryRecord(7, {
        sourceId: "source-1",
        expectedSourceVersion: 4,
        expectedWorkspaceRevision: 9,
        confirmation: "DELETE LIBRARY RECORD source-1",
      }),
    ).rejects.toThrow("simulated referenceVersions delete failure");

    expect(audit.locks).toEqual(
      expect.arrayContaining(["workspaces", "sources", "runtimeState"]),
    );
    expect(audit.operations).toEqual([
      "insert:runtimeState",
      "update:workspaces",
      "delete:sources",
      "delete:referenceVersions",
    ]);
    expect(state).toEqual(before);
  });

  it("validates the locked library source version before issuing any mutation", async () => {
    const retainedSource = source(5);
    const state: MemoryState = {
      workspace: { payload: workspace(retainedSource), revision: 9 },
      sources: [
        {
          metadata: retainedSource,
          objectKey: "private-sources/7/source-1.enc",
          mime: "text/plain",
          filename: "setup.txt",
        },
      ],
      paperTrades: [],
      referenceVersions: [],
      runtimeState: [],
      vectors: [],
    };
    const before = structuredClone(state);
    const audit: Audit = { locks: [], operations: [] };
    mocks.getDb.mockResolvedValue(mockedDatabase(state, audit));

    await expect(
      deleteLibraryRecord(7, {
        sourceId: "source-1",
        expectedSourceVersion: 4,
        expectedWorkspaceRevision: 9,
        confirmation: "DELETE LIBRARY RECORD source-1",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(audit.locks).toEqual(
      expect.arrayContaining(["workspaces", "sources"]),
    );
    expect(audit.operations).toEqual([]);
    expect(state).toEqual(before);
  });

  it("commits a durable pending cleanup with the server-only encrypted key and returns a UI-safe logical-deletion result", async () => {
    const retainedSource = source();
    const state: MemoryState = {
      workspace: { payload: workspace(retainedSource), revision: 9 },
      sources: [
        {
          metadata: retainedSource,
          objectKey: "private-sources/7/source-1.enc",
          mime: "text/plain",
          filename: "setup.txt",
        },
      ],
      paperTrades: [],
      referenceVersions: [
        { id: "7:source-1:v4", patternId: "source-1", userId: 7 },
      ],
      runtimeState: [],
      cleanupLookupId: cleanupId(),
      vectors: [{ id: "vector-1", patternId: "source-1", userId: 7 }],
    };
    const audit: Audit = { locks: [], operations: [] };
    mocks.getDb.mockResolvedValue(mockedDatabase(state, audit));

    const result = await deleteLibraryRecord(7, {
      sourceId: "source-1",
      expectedSourceVersion: 4,
      expectedWorkspaceRevision: 9,
      confirmation: "DELETE LIBRARY RECORD source-1",
    });

    expect(result).toMatchObject({
      revision: 10,
      removedWorkspaceReferences: 1,
      cleanupPending: true,
      capacityReclaimed: true,
      objectStorageDeleted: false,
    });
    expect(result.retainedOriginalNotice).toMatch(/logical deletion/i);
    expect(result.retainedOriginalNotice).toMatch(/capacity was reclaimed/i);
    expect(result.retainedOriginalNotice).toMatch(/still retained/i);
    expect(result).not.toHaveProperty("originalEncryptedObjectKey");
    expect(JSON.stringify(result)).not.toContain(
      "private-sources/7/source-1.enc",
    );
    expect(state.runtimeState).toEqual([
      expect.objectContaining({
        id: cleanupId(),
        userId: 7,
        kind: "source-cleanup",
        payload: expect.objectContaining({
          status: "pending",
          ownerId: 7,
          sourceId: "source-1",
          sourceVersion: 4,
          originalEncryptedObjectKey: "private-sources/7/source-1.enc",
          providerDelete: "unsupported",
        }),
      }),
    ]);
    expect(state.sources).toEqual([]);
    expect(state.referenceVersions).toEqual([]);
    expect(state.vectors).toEqual([]);
    expect(audit.operations).toEqual([
      "insert:runtimeState",
      "update:workspaces",
      "delete:sources",
      "delete:referenceVersions",
      "delete:vectors",
    ]);
  });

  it("rejects a duplicate current-version cleanup record before any logical deletion mutation", async () => {
    const retainedSource = source();
    const state: MemoryState = {
      workspace: { payload: workspace(retainedSource), revision: 9 },
      sources: [
        {
          metadata: retainedSource,
          objectKey: "private-sources/7/source-1.enc",
          mime: "text/plain",
          filename: "setup.txt",
        },
      ],
      paperTrades: [],
      referenceVersions: [],
      runtimeState: [
        {
          id: cleanupId(),
          userId: 7,
          kind: "source-cleanup",
          payload: { sourceVersion: 4, status: "pending" },
        },
      ],
      cleanupLookupId: cleanupId(),
      vectors: [],
    };
    const before = structuredClone(state);
    const audit: Audit = { locks: [], operations: [] };
    mocks.getDb.mockResolvedValue(mockedDatabase(state, audit));

    await expect(
      deleteLibraryRecord(7, {
        sourceId: "source-1",
        expectedSourceVersion: 4,
        expectedWorkspaceRevision: 9,
        confirmation: "DELETE LIBRARY RECORD source-1",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(audit.locks).toEqual(
      expect.arrayContaining(["workspaces", "sources", "runtimeState"]),
    );
    expect(audit.operations).toEqual([]);
    expect(state).toEqual(before);
  });

  it("does not mistake a stale-version cleanup record for the newly confirmed source version", async () => {
    const retainedSource = source();
    const staleRecord = {
      id: cleanupId(3),
      userId: 7,
      kind: "source-cleanup",
      payload: {
        status: "pending",
        sourceId: "source-1",
        sourceVersion: 3,
        originalEncryptedObjectKey: "private-sources/7/stale-source.enc",
      },
    };
    const state: MemoryState = {
      workspace: { payload: workspace(retainedSource), revision: 9 },
      sources: [
        {
          metadata: retainedSource,
          objectKey: "private-sources/7/source-1.enc",
          mime: "text/plain",
          filename: "setup.txt",
        },
      ],
      paperTrades: [],
      referenceVersions: [],
      runtimeState: [staleRecord],
      cleanupLookupId: cleanupId(4),
      vectors: [],
    };
    const audit: Audit = { locks: [], operations: [] };
    mocks.getDb.mockResolvedValue(mockedDatabase(state, audit));

    await expect(
      deleteLibraryRecord(7, {
        sourceId: "source-1",
        expectedSourceVersion: 4,
        expectedWorkspaceRevision: 9,
        confirmation: "DELETE LIBRARY RECORD source-1",
      }),
    ).resolves.toMatchObject({ cleanupPending: true, capacityReclaimed: true });

    expect(state.runtimeState).toEqual([
      staleRecord,
      expect.objectContaining({
        id: cleanupId(4),
        payload: expect.objectContaining({ sourceVersion: 4 }),
      }),
    ]);
  });
});
