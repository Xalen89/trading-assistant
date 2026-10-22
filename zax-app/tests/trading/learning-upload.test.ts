import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";

const mocks = vi.hoisted(() => ({
  storeSource: vi.fn(),
  updateSource: vi.fn(),
  publicSourcePattern: vi.fn((pattern) => {
    const { fileKey: _fileKey, ...safe } = pattern;
    return safe;
  }),
  indexImage: vi.fn(),
  validateRetainedSourceBytes: vi.fn(),
  invokeLLM: vi.fn(),
  listLLMModels: vi.fn(),
}));

vi.mock("../../server/trading/repository", () => ({
  storeSource: mocks.storeSource,
  updateSource: mocks.updateSource,
  publicSourcePattern: mocks.publicSourcePattern,
  getSource: vi.fn(),
}));
vi.mock("../../server/trading/vectors", () => ({
  indexImage: mocks.indexImage,
}));
vi.mock("../../server/trading/source-intake-validation", () => ({
  SourceIntakeValidationError: class SourceIntakeValidationError extends Error {},
  validateRetainedSourceBytes: mocks.validateRetainedSourceBytes,
}));
vi.mock("../../server/_core/llm", () => ({
  invokeLLM: mocks.invokeLLM,
  listLLMModels: mocks.listLLMModels,
}));

import { uploadReference } from "../../server/trading/learning";

const PNG_HEADER = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString(
  "base64",
);

function input() {
  return {
    name: "Synthetic screenshot",
    kind: "pattern" as const,
    strategyId: "strategy-unit",
    market: "BTC-USD",
    timeframe: "5m",
    notes: "Synthetic owner fixture only.",
    filename: "synthetic.png",
    mime: "image/png",
    base64: PNG_HEADER,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.storeSource.mockResolvedValue("private-sources/42/unit.enc");
  mocks.updateSource.mockResolvedValue(undefined);
  mocks.publicSourcePattern.mockImplementation((pattern) => {
    const { fileKey: _fileKey, ...safe } = pattern;
    return safe;
  });
  mocks.validateRetainedSourceBytes.mockResolvedValue(undefined);
});

describe("learning upload retention — mocked binary/model boundaries", () => {
  it("stores a typed review-only screenshot but never calls generic indexing or extraction", async () => {
    const retained = await uploadReference(42, {
      ...input(),
      reviewOnly: true,
      sourcePurpose: "trade-screenshot",
    });

    expect(mocks.validateRetainedSourceBytes).toHaveBeenCalledTimes(1);
    expect(mocks.storeSource).toHaveBeenCalledTimes(1);
    expect(mocks.updateSource).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        notes: expect.stringContaining(
          "[stratdesk:source-purpose=trade-screenshot]",
        ),
        status: "uploaded",
      }),
    );
    expect(mocks.indexImage).not.toHaveBeenCalled();
    expect(mocks.invokeLLM).not.toHaveBeenCalled();
    expect(retained).not.toHaveProperty("fileKey");
  });

  it("rejects a signature-only image before storage when bounded decoding fails", async () => {
    mocks.validateRetainedSourceBytes.mockRejectedValue(
      new Error("synthetic corrupt header"),
    );

    await expect(uploadReference(42, input())).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(mocks.storeSource).not.toHaveBeenCalled();
    expect(mocks.indexImage).not.toHaveBeenCalled();
    expect(mocks.invokeLLM).not.toHaveBeenCalled();
  });

  it("fails closed when a caller supplies a purpose without review-only retention", async () => {
    await expect(
      uploadReference(42, { ...input(), sourcePurpose: "trade-screenshot" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.storeSource).not.toHaveBeenCalled();
  });
});
