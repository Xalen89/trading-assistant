import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));

vi.mock("../../server/db", () => ({ getDb: mocks.getDb }));
vi.mock("../../server/storage", () => ({
  storageGetSignedUrl: vi.fn(),
  storagePut: vi.fn(),
}));

import {
  initialWorkspace,
  type Pattern,
  type Workspace,
} from "../../lib/trading/model";
import {
  tradingAlertEvents,
  tradingPaperTrades,
  tradingSources,
  tradingWorkspaces,
} from "../../drizzle/schema";
import {
  loadWorkspace,
  reconcileWorkspaceSourceIndex,
} from "../../server/trading/repository";

function source(
  id: string,
  version = 1,
  status: Pattern["status"] = "uploaded",
): Pattern {
  return {
    id,
    name: `Private ${id}`,
    tags: [],
    kind: "pattern",
    strategyId: "wr1",
    market: "BTC-USD",
    timeframe: "5m",
    notes: "Owner-only reference metadata.",
    filename: `${id}.txt`,
    mime: "text/plain",
    fileKey: `private-sources/42/${id}.enc`,
    status,
    createdAt: 1_700_000_000_000 + version,
    version,
    feedback: [],
  };
}

function containsParam(
  value: unknown,
  expected: number,
  seen = new Set<unknown>(),
): boolean {
  if (value === expected) return true;
  if (!value || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  return Object.values(value).some((item) =>
    containsParam(item, expected, seen),
  );
}

function memoryDb(
  workspace: Workspace,
  sourceRows: { id: string; metadata: unknown }[],
) {
  const workspaceRow = { userId: 42, payload: workspace, revision: 7 };
  const writes: Record<string, unknown>[] = [];
  const whereCalls: { table: unknown; condition: unknown }[] = [];

  const db = {
    select() {
      return {
        from(table: unknown) {
          const rows =
            table === tradingWorkspaces
              ? [workspaceRow]
              : table === tradingSources
                ? sourceRows
                : [];
          return {
            where(condition: unknown) {
              whereCalls.push({ table, condition });
              return {
                async limit() {
                  return rows;
                },
                orderBy() {
                  return {
                    async limit() {
                      return rows;
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
    update(table: unknown) {
      expect(table).toBe(tradingWorkspaces);
      return {
        set(values: Record<string, unknown>) {
          writes.push(values);
          return {
            async where() {
              workspaceRow.payload = values.payload as Workspace;
              workspaceRow.revision = values.revision as number;
              return [{ affectedRows: 1 }];
            },
          };
        },
      };
    },
  };

  return { db, writes, whereCalls, workspaceRow };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("source index recovery", () => {
  it("adds only valid missing owner metadata and preserves both an owner edit and the current canonical version", () => {
    const editedWorkspaceRecord = {
      ...source("edited", 3, "review"),
      name: "Owner workspace edit wins",
      notes: "Do not replace this local/cloud owner edit.",
    };
    const currentCanonicalSource = source("edited", 9, "ready");
    const queuedCanonicalSource = source("queued", 8, "uploaded");
    const workspace = {
      ...initialWorkspace(),
      patterns: [editedWorkspaceRecord],
    };

    const recovered = reconcileWorkspaceSourceIndex(workspace, [
      { id: "edited", metadata: currentCanonicalSource },
      { id: "queued", metadata: queuedCanonicalSource },
      {
        id: "invalid-row",
        metadata: { ...source("wrong-id"), id: "wrong-id" },
      },
      { id: "malformed-row", metadata: { id: "malformed-row" } },
    ]);

    expect(recovered.sourceIndexRecovery).toEqual({
      status: "recovered",
      recoveredSourceIds: ["queued"],
      invalidSourceCount: 2,
      skippedSourceCount: 0,
    });
    expect(recovered.workspace.patterns).toEqual([
      editedWorkspaceRecord,
      queuedCanonicalSource,
    ]);
    expect(recovered.workspace.patterns[1]).toMatchObject({
      version: 8,
      status: "uploaded",
    });
    expect(recovered.workspace.patterns[1].status).not.toBe("ready");
  });

  it("never indexes a source row that no longer exists and does not write the workspace", async () => {
    const workspace = initialWorkspace();
    const memory = memoryDb(workspace, []);
    mocks.getDb.mockResolvedValue(memory.db);

    const loaded = await loadWorkspace(42);

    expect(loaded).toMatchObject({
      revision: 7,
      workspace: { patterns: [] },
      sourceIndexRecovery: {
        status: "not-needed",
        recoveredSourceIds: [],
      },
    });
    expect(memory.writes).toEqual([]);
  });

  it("persists a recovered durable upload with a new workspace revision and keeps the source query owner-scoped", async () => {
    const workspace = initialWorkspace();
    const durableSource = source("durable-upload", 8, "uploaded");
    const memory = memoryDb(workspace, [
      { id: durableSource.id, metadata: durableSource },
    ]);
    mocks.getDb.mockResolvedValue(memory.db);

    const loaded = await loadWorkspace(42);

    expect(loaded.revision).toBe(8);
    const publicSource = { ...durableSource };
    delete publicSource.fileKey;
    expect(loaded.workspace?.patterns).toEqual([publicSource]);
    expect(loaded.workspace?.patterns[0]).not.toHaveProperty("fileKey");
    expect(loaded.sourceIndexRecovery).toEqual({
      status: "recovered",
      recoveredSourceIds: ["durable-upload"],
      invalidSourceCount: 0,
      skippedSourceCount: 0,
    });
    expect(memory.writes).toHaveLength(1);
    expect(memory.writes[0]).toMatchObject({
      revision: 8,
      payload: { patterns: [durableSource] },
    });
    const sourceScope = memory.whereCalls.find(
      (call) => call.table === tradingSources,
    );
    expect(sourceScope).toBeDefined();
    expect(containsParam(sourceScope?.condition, 42)).toBe(true);
    expect(
      memory.whereCalls.some((call) => call.table === tradingPaperTrades),
    ).toBe(true);
    expect(
      memory.whereCalls.some((call) => call.table === tradingAlertEvents),
    ).toBe(true);
  });

  it("does not exceed the 500-record workspace/source safety bounds", () => {
    const fullWorkspace = {
      ...initialWorkspace(),
      patterns: Array.from({ length: 500 }, (_, index) =>
        source(`indexed-${index}`),
      ),
    };
    const missing = source("missing-at-capacity");

    const workspaceBound = reconcileWorkspaceSourceIndex(fullWorkspace, [
      { id: missing.id, metadata: missing },
    ]);
    expect(workspaceBound.workspace).toBe(fullWorkspace);
    expect(workspaceBound.sourceIndexRecovery).toEqual({
      status: "capacity-limited",
      recoveredSourceIds: [],
      invalidSourceCount: 0,
      skippedSourceCount: 1,
    });

    const sourceBound = reconcileWorkspaceSourceIndex(
      initialWorkspace(),
      Array.from({ length: 501 }, (_, index) => {
        const item = source(`source-${index}`);
        return { id: item.id, metadata: item };
      }),
    );
    expect(sourceBound.workspace.patterns).toEqual([]);
    expect(sourceBound.sourceIndexRecovery).toEqual({
      status: "source-capacity-exceeded",
      recoveredSourceIds: [],
      invalidSourceCount: 0,
      skippedSourceCount: 501,
    });
  });
});
