import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { tradingResearchJobs, users } from "../../drizzle/schema";

const mocks = vi.hoisted(() => ({
  analyze: vi.fn(),
  definition: vi.fn(),
  source: vi.fn(),
  persist: vi.fn(),
  persistVisualIndex: vi.fn(),
  indexImage: vi.fn(),
  dbRequired: vi.fn(),
  quota: vi.fn(),
}));

vi.mock("../../server/trading/library-blueprint", () => ({
  analyzeLibraryBlueprint: mocks.analyze,
}));
vi.mock("../../server/trading/repository", () => ({
  dbRequired: mocks.dbRequired,
  getSourceDefinition: mocks.definition,
  getSource: mocks.source,
  persistSourceAnalysisResult: mocks.persist,
  updateSourceVisualIndexForActiveJob: mocks.persistVisualIndex,
}));
vi.mock("../../server/trading/vectors", () => ({
  indexImage: mocks.indexImage,
}));
vi.mock("../../server/trading/app-quota", () => ({
  consumeAppQuota: mocks.quota,
}));

import {
  cancelSourceAnalysis,
  retrySourceAnalysis,
  runSourceAnalysisJob,
  startSourceAnalysis,
} from "../../server/trading/source-analysis-jobs";

const blueprint = {
  version: 1,
  sourceId: "private-source",
  sourceVersion: 7,
  createdAt: 1_800_000_000_000,
  approved: false,
  summary: "A bounded review proposal.",
  trigger: {
    text: "Closed-bar review",
    sourceExcerpt: "Review only closed bars.",
  },
  conditions: [],
  indicators: [],
  markets: [],
  timeframes: [],
  entry: "Not stated in source.",
  invalidation: "Not stated in source.",
  targets: "Not stated in source.",
  risk: "Not stated in source.",
  requiredData: ["Not stated in source."],
  ambiguities: ["Human review remains required."],
};

function pattern(version = 7, mime = "text/plain") {
  return {
    id: "private-source",
    name: "Private source",
    kind: "pattern",
    strategyId: "strategy-unit",
    market: "BTC-USD",
    timeframe: "5m",
    filename: mime.startsWith("image/") ? "private.png" : "private.txt",
    mime,
    fileKey: "private-key-is-never-returned",
    createdAt: 1_700_000_000_000,
    version,
    tags: [],
    notes: "",
    status: "uploaded",
    feedback: [],
  } as any;
}

function queuedRow() {
  return {
    id: "source-job-1",
    userId: 42,
    kind: "source-blueprint",
    status: "queued",
    request: { sourceId: "private-source", expectedVersion: 7, attempts: 1 },
    result: { progressPhase: "queued" },
    error: null,
    createdAt: new Date(1_800_000_000_000),
    updatedAt: new Date(1_800_000_000_000),
  };
}

function resultRows(rows: any[]) {
  const query: any = {
    where: () => query,
    orderBy: () => query,
    for: () => query,
    limit: async () => rows,
    then: (
      resolve: (value: any[]) => unknown,
      reject: (error: unknown) => unknown,
    ) => Promise.resolve(rows).then(resolve, reject),
  };
  return query;
}

/** In-memory Drizzle double; it performs no database writes. */
function memoryDb(row: any, activeRows: any[] = []) {
  const db: any = {
    select() {
      return {
        from(table: unknown) {
          return resultRows(table === users ? [{ id: 42 }] : [row]);
        },
      };
    },
    update() {
      return {
        set(values: Record<string, unknown>) {
          return {
            async where() {
              Object.assign(row, values);
              return [{ affectedRows: 1 }];
            },
          };
        },
      };
    },
    transaction: async (callback: (tx: any) => Promise<unknown>) => {
      const tx = {
        select() {
          return {
            from(table: unknown) {
              return resultRows(table === users ? [{ id: 42 }] : activeRows);
            },
          };
        },
        insert() {
          return {
            async values() {
              return [{ affectedRows: 1 }];
            },
          };
        },
      };
      return callback(tx);
    },
  };
  return db;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.definition.mockResolvedValue(pattern());
  mocks.analyze.mockResolvedValue(blueprint);
  mocks.persist.mockResolvedValue({ ...pattern(), version: 8, blueprint });
  mocks.persistVisualIndex.mockImplementation(
    async (_owner: number, input: any) => input.pattern,
  );
  mocks.quota.mockResolvedValue(undefined);
});

describe("persisted source analysis jobs — mocked durable boundaries", () => {
  it("claims one queued job, invokes only owner-scoped analysis, and atomically requests the unapproved saved result", async () => {
    const row = queuedRow();
    mocks.dbRequired.mockResolvedValue(memoryDb(row));

    await expect(runSourceAnalysisJob(42, row.id)).resolves.toBe(true);

    expect(mocks.definition).toHaveBeenCalledWith(42, "private-source");
    expect(mocks.analyze).toHaveBeenCalledWith(
      42,
      "private-source",
      180_000,
      expect.any(Function),
    );
    expect(mocks.persist).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        jobId: row.id,
        sourceId: "private-source",
        expectedVersion: 7,
        blueprint: expect.objectContaining({
          approved: false,
          sourceVersion: 7,
        }),
      }),
    );
  });

  it("never starts a second model call while a same-source queued/running job exists", async () => {
    const active = {
      ...queuedRow(),
      id: "already-active",
      status: "running",
    };
    mocks.dbRequired.mockResolvedValue(memoryDb(queuedRow(), [active]));

    await expect(
      startSourceAnalysis(42, {
        sourceId: "private-source",
        expectedVersion: 7,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.quota).not.toHaveBeenCalled();
    expect(mocks.analyze).not.toHaveBeenCalled();
  });

  it("cancels a queued job before it can be claimed or invoke a model", async () => {
    const row = queuedRow();
    mocks.dbRequired.mockResolvedValue(memoryDb(row));

    await expect(
      cancelSourceAnalysis(42, { id: row.id, sourceId: "private-source" }),
    ).resolves.toEqual({ id: row.id });
    await expect(runSourceAnalysisJob(42, row.id)).resolves.toBe(false);
    expect(row.status).toBe("cancelled");
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(mocks.persist).not.toHaveBeenCalled();
  });

  it("does not persist an already-started model result after a running job is cancelled", async () => {
    const row = queuedRow();
    mocks.dbRequired.mockResolvedValue(memoryDb(row));
    let release!: () => void;
    mocks.analyze.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(blueprint);
        }),
    );

    const running = runSourceAnalysisJob(42, row.id);
    await vi.waitFor(() => expect(mocks.analyze).toHaveBeenCalledTimes(1));
    await cancelSourceAnalysis(42, { id: row.id, sourceId: "private-source" });
    release();
    await expect(running).resolves.toBe(true);

    expect(row.status).toBe("cancelled");
    expect(mocks.persist).not.toHaveBeenCalled();
  });

  it("attempts image indexing once and preserves the source-analysis path when indexing fails", async () => {
    const row = queuedRow();
    const image = pattern(7, "image/png");
    mocks.definition.mockResolvedValue(image);
    mocks.source.mockResolvedValue({
      metadata: image,
      base64: Buffer.from("synthetic-image", "utf8").toString("base64"),
    });
    mocks.indexImage.mockRejectedValue(new Error("synthetic index failure"));
    mocks.persistVisualIndex.mockImplementation(
      async (_owner: number, input: any) => input.pattern,
    );
    mocks.dbRequired.mockResolvedValue(memoryDb(row));

    await expect(runSourceAnalysisJob(42, row.id)).resolves.toBe(true);

    expect(mocks.indexImage).toHaveBeenCalledTimes(1);
    expect(mocks.persistVisualIndex).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        jobId: row.id,
        pattern: expect.objectContaining({
          visualIndex: expect.objectContaining({ status: "failed" }),
        }),
      }),
    );
    expect(mocks.analyze).toHaveBeenCalledTimes(1);
    expect(mocks.persist).toHaveBeenCalledTimes(1);
  });

  it("does not lease an uncharged retry after durable quota consumption failed", async () => {
    const row = {
      ...queuedRow(),
      status: "failed",
      error:
        "Analysis could not start because the durable quota check was unavailable or exhausted. No source analysis was run.",
      result: { progressPhase: "failed", retryable: false },
    };
    mocks.dbRequired.mockResolvedValue(memoryDb(row));

    await expect(
      retrySourceAnalysis(42, {
        id: row.id,
        sourceId: "private-source",
        expectedVersion: 7,
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    expect(mocks.definition).not.toHaveBeenCalled();
    expect(mocks.analyze).not.toHaveBeenCalled();
  });
});
