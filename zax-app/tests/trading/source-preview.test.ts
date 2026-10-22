import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSourceDefinition: vi.fn(),
  getSource: vi.fn(),
}));

vi.mock("../../server/trading/repository", () => ({
  getSourceDefinition: mocks.getSourceDefinition,
  getSource: mocks.getSource,
}));

import {
  COACH_THUMBNAIL_MAX_BYTES,
  COACH_THUMBNAIL_MAX_DIMENSION,
  boundedTextEvidence,
  coachThumbnailMessage,
  coachThumbnailMetadata,
  createCoachImageThumbnail,
  findEvidenceRange,
  getSourcePreview,
  sourcePreviewInfo,
  sourcePreviewText,
} from "../../server/trading/source-preview";

const OWNER_ID = 42;
const SOURCE_ID = "synthetic-owner-source";
const PRIVATE_MARKER = "PRIVATE_SOURCE_MARKER_MUST_NOT_BE_STORAGE_METADATA";
const TEXT_FIXTURE = [
  "Synthetic source heading",
  PRIVATE_MARKER,
  "Wait for a close above the 20 EMA before manual review.",
  "No outcome or performance claim is present.",
].join("\n");
const PIXEL_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAE0lEQVQIHWNk2MIAAYwMWxggAAASegFrs7lxGwAAAABJRU5ErkJggg==";

function definition(mime = "text/plain") {
  return {
    id: SOURCE_ID,
    version: 7,
    filename: mime.startsWith("image/") ? "synthetic-chart.png" : "synthetic-rules.txt",
    mime,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSourceDefinition.mockResolvedValue(definition());
  mocks.getSource.mockResolvedValue({
    mime: "text/plain",
    base64: Buffer.from(TEXT_FIXTURE, "utf8").toString("base64"),
    metadata: definition(),
  });
});

describe("source preview — labelled synthetic private fixtures", () => {
  it("finds whitespace-tolerant literal evidence and returns a bounded highlighted window", () => {
    const range = findEvidenceRange(
      TEXT_FIXTURE,
      "close above the 20 EMA   before manual review.",
    );
    expect(range).not.toBeNull();
    const bounded = boundedTextEvidence(
      `${"prefix ".repeat(10_000)}${TEXT_FIXTURE}${" suffix".repeat(10_000)}`,
      "close above the 20 EMA before manual review.",
      2_000,
    );
    expect(bounded.evidenceFound).toBe(true);
    expect(bounded.evidenceStart).not.toBeNull();
    expect(bounded.text.slice(bounded.evidenceStart!, bounded.evidenceEnd!)).toContain("20 EMA");
    expect(Buffer.byteLength(bounded.text, "utf8")).toBeLessThanOrEqual(2_000);
  });

  it("uses owner-scoped reads and returns text-only review data without a storage URL, key, cookie, or model call", async () => {
    const info = await sourcePreviewInfo(OWNER_ID, {
      sourceId: SOURCE_ID,
      evidence: "close above the 20 EMA before manual review.",
    });
    const text = await sourcePreviewText(OWNER_ID, {
      sourceId: SOURCE_ID,
      evidence: "close above the 20 EMA before manual review.",
    });

    expect(mocks.getSourceDefinition).toHaveBeenCalledWith(OWNER_ID, SOURCE_ID);
    expect(mocks.getSource).toHaveBeenCalledWith(OWNER_ID, SOURCE_ID);
    expect(info).toMatchObject({
      sourceId: SOURCE_ID,
      sourceVersion: 7,
      kind: "text",
      evidenceFound: true,
    });
    expect(text).toMatchObject({
      sourceId: SOURCE_ID,
      sourceVersion: 7,
      evidenceFound: true,
    });
    for (const value of [info, text]) {
      expect(value).not.toHaveProperty("fileKey");
      expect(value).not.toHaveProperty("objectKey");
      expect(value).not.toHaveProperty("storageUrl");
      expect(value).not.toHaveProperty("signedUrl");
      expect(value).not.toHaveProperty("cookie");
      expect(value).not.toHaveProperty("token");
    }
  });

  it("keeps coach attachment metadata-only until a parent-owned coach request explicitly asks for an image", () => {
    const image = coachThumbnailMetadata("image/png");
    const text = coachThumbnailMetadata("text/plain");
    expect(image).toEqual({
      eligible: true,
      maxDimension: COACH_THUMBNAIL_MAX_DIMENSION,
      maxBytes: COACH_THUMBNAIL_MAX_BYTES,
      attached: false,
    });
    expect(text.eligible).toBe(false);
    expect(JSON.stringify(image)).not.toContain("base64");
  });

  it("creates a transient bounded JPEG thumbnail from a labelled synthetic image without writing an owner source", async () => {
    mocks.getSourceDefinition.mockResolvedValue(definition("image/png"));
    mocks.getSource.mockResolvedValue({
      mime: "image/png",
      base64: PIXEL_PNG,
      metadata: definition("image/png"),
    });

    const thumbnail = await createCoachImageThumbnail(OWNER_ID, SOURCE_ID);
    const preview = await getSourcePreview(OWNER_ID, SOURCE_ID);
    const content = coachThumbnailMessage(thumbnail);

    expect(thumbnail.mime).toBe("image/jpeg");
    expect(thumbnail.bytes).toBeLessThanOrEqual(COACH_THUMBNAIL_MAX_BYTES);
    expect(thumbnail.width).toBeLessThanOrEqual(COACH_THUMBNAIL_MAX_DIMENSION);
    expect(thumbnail.height).toBeLessThanOrEqual(COACH_THUMBNAIL_MAX_DIMENSION);
    expect(content.image_url.url.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(content.image_url.url).not.toContain(PRIVATE_MARKER);
    expect(preview).toMatchObject({
      sourceId: SOURCE_ID,
      mime: "image/jpeg",
      bytes: expect.any(Number),
      imageUri: expect.stringMatching(/^data:image\/jpeg;base64,/),
    });
    expect(preview.bytes).toBeLessThanOrEqual(COACH_THUMBNAIL_MAX_BYTES);
    expect(Object.keys(preview)).not.toContain("base64");
    expect(mocks.getSource).toHaveBeenCalledWith(OWNER_ID, SOURCE_ID);
  });
});
