import { describe, expect, it, vi } from "vitest";

vi.mock("../../server/db", () => ({ getDb: vi.fn() }));
vi.mock("../../server/storage", () => ({
  storageGetSignedUrl: vi.fn(),
  storagePut: vi.fn(),
}));
vi.mock("../../server/_core/env", () => ({
  ENV: { cookieSecret: "unit-only-secret", appId: "unit-app" },
}));

import { publicSourcePattern } from "../../server/trading/repository";

describe("public source DTO", () => {
  it("strips only the encrypted-object key while preserving a source revision for owner UI", () => {
    const safe = publicSourcePattern({
      id: "source-unit",
      name: "Synthetic source",
      kind: "pattern",
      strategyId: "strategy-unit",
      market: "BTC-USD",
      timeframe: "5m",
      notes: "Synthetic owner fixture.",
      filename: "unit.txt",
      mime: "text/plain",
      fileKey: "private-sources/42/source-unit.enc",
      status: "review",
      tags: [],
      createdAt: 1_800_000_000_000,
      version: 3,
      feedback: [],
    } as any);

    expect(safe).not.toHaveProperty("fileKey");
    expect(safe).toMatchObject({
      id: "source-unit",
      version: 3,
      status: "review",
    });
  });
});
