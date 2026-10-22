import { TRPCError } from "@trpc/server";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ImageContent } from "../_core/llm";
import { getSource, getSourceDefinition } from "./repository";

const execFile = promisify(execFileCallback);

/** Private-source response limits. These are payload limits, not storage limits. */
export const SOURCE_PREVIEW_MAX_SOURCE_BYTES = 25 * 1024 * 1024;
export const SOURCE_PREVIEW_MAX_PAGES = 20;
export const SOURCE_PREVIEW_MAX_NAVIGABLE_PAGES = 2000;
export const SOURCE_PREVIEW_MAX_IMAGE_BYTES = 700 * 1024;
export const SOURCE_PREVIEW_MAX_TEXT_BYTES = 48 * 1024;
export const COACH_THUMBNAIL_MAX_DIMENSION = 768;
export const COACH_THUMBNAIL_MAX_BYTES = 200 * 1024;
export const SOURCE_PREVIEW_MAX_DECODED_PIXELS = 25_000_000;

const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);
const TEXT_MIMES = new Set(["text/plain", "application/json", "text/markdown"]);
const PDF_MIME = "application/pdf";
const COMMAND_TIMEOUT_MS = 15_000;
const COMMAND_MAX_BUFFER = 512 * 1024;
const PREVIEW_MAX_DIMENSION = 1_200;

// OpenCV is already installed in the production Python venv for visual search.
// The child has no network, reads only the private temporary file, strips source
// metadata by re-encoding JPEG, and exits before its containing temp directory is removed.
const OPEN_CV_JPEG_RENDERER = String.raw`
import cv2, sys
source, output, dimension, quality = sys.argv[1:]
image = cv2.imread(source, cv2.IMREAD_COLOR)
if image is None:
    raise ValueError("unsupported image")
height, width = image.shape[:2]
if width < 1 or height < 1 or width * height > 25000000:
    raise ValueError("unsafe image dimensions")
scale = min(1.0, int(dimension) / max(width, height))
if scale < 1.0:
    image = cv2.resize(image, (max(1, round(width * scale)), max(1, round(height * scale))), interpolation=cv2.INTER_AREA)
ok, encoded = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, int(quality)])
if not ok:
    raise ValueError("jpeg encode failed")
encoded.tofile(output)
`;

type SourceKind = "image" | "pdf" | "text" | "unsupported";

type OwnedSource = {
  id: string;
  version: number;
  filename: string | undefined;
  mime: string;
  bytes: Buffer;
};

export type SourcePreviewInfo = {
  sourceId: string;
  sourceVersion: number;
  filename?: string;
  mime: string;
  kind: SourceKind;
  pageCount: number;
  previewPageCount: number;
  evidencePage: number | null;
  evidenceFound: boolean;
  limits: {
    maxPreviewBytes: number;
    maxPreviewPages: number;
    maxTextBytes: number;
  };
  coachImage: {
    eligible: boolean;
    maxDimension: number;
    maxBytes: number;
  };
};

export type SourcePreviewPage = {
  sourceId: string;
  sourceVersion: number;
  page: number;
  pageCount: number;
  mime: "image/jpeg";
  base64: string;
  bytes: number;
  width: number;
  height: number;
};

export type SourcePreviewText = {
  sourceId: string;
  sourceVersion: number;
  page: number | null;
  pageCount: number;
  text: string;
  evidenceStart: number | null;
  evidenceEnd: number | null;
  evidenceFound: boolean;
  truncated: boolean;
};

export type CoachImageThumbnail = {
  mime: "image/jpeg";
  base64: string;
  bytes: number;
  width: number;
  height: number;
  maxDimension: number;
  maxBytes: number;
};

function ownerRequired(userId: number): void {
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Owner session required." });
  }
}

function sourceIdRequired(sourceId: string): void {
  if (!sourceId || sourceId.length > 100) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A valid private source id is required." });
  }
}

function kindForMime(mime: string): SourceKind {
  if (IMAGE_MIMES.has(mime)) return "image";
  if (mime === PDF_MIME) return "pdf";
  if (TEXT_MIMES.has(mime)) return "text";
  return "unsupported";
}

function inputSuffix(mime: string): string {
  if (mime === "image/png") return ".png";
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/webp") return ".webp";
  if (mime === PDF_MIME) return ".pdf";
  return ".txt";
}

function previewError(message: string): TRPCError {
  return new TRPCError({ code: "PRECONDITION_FAILED", message });
}

async function loadOwnedSource(userId: number, sourceId: string): Promise<OwnedSource> {
  ownerRequired(userId);
  sourceIdRequired(sourceId);

  // Check metadata first. Both repository reads bind the source ID to the owner.
  const definition = await getSourceDefinition(userId, sourceId);
  const source = await getSource(userId, sourceId);
  const bytes = Buffer.from(source.base64, "base64");
  if (!bytes.length || bytes.length > SOURCE_PREVIEW_MAX_SOURCE_BYTES) {
    throw previewError(
      "This private original is outside the 25 MiB preview limit. It remains retained unchanged.",
    );
  }
  if (source.metadata.id !== definition.id || source.metadata.version !== definition.version) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "This private source changed while it was loading. Reload before reviewing it.",
    });
  }
  return {
    id: source.metadata.id,
    version: source.metadata.version,
    filename: source.metadata.filename,
    mime: source.mime,
    bytes,
  };
}

async function withTemporarySource<T>(
  bytes: Buffer,
  suffix: string,
  work: (inputPath: string, directory: string) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "stratdesk-source-preview-"));
  const inputPath = join(directory, `source${suffix}`);
  try {
    await writeFile(inputPath, bytes, { mode: 0o600 });
    return await work(inputPath, directory);
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function runBinary(binary: string, args: string[]): Promise<string> {
  try {
    const result = await execFile(binary, args, {
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: COMMAND_MAX_BUFFER,
      windowsHide: true,
    });
    return typeof result.stdout === "string" ? result.stdout : "";
  } catch {
    // Never place command stderr in an RPC error: it may include private temp paths.
    throw previewError(
      "Private preview processing is unavailable on this server. The original remains retained.",
    );
  }
}

function pageCountFromPdfInfo(output: string): number {
  const match = output.match(/^Pages:\s*(\d+)\s*$/mi);
  const pages = match ? Number(match[1]) : NaN;
  if (
    !Number.isSafeInteger(pages) ||
    pages < 1 ||
    pages > SOURCE_PREVIEW_MAX_NAVIGABLE_PAGES
  ) {
    throw previewError("This PDF has no safely readable page count for preview.");
  }
  return pages;
}

async function pdfPageCount(bytes: Buffer): Promise<number> {
  return withTemporarySource(bytes, ".pdf", async (inputPath) =>
    pageCountFromPdfInfo(await runBinary("pdfinfo", [inputPath])),
  );
}

function jpegDimensions(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  for (let index = 2; index + 9 < bytes.length; ) {
    if (bytes[index] !== 0xff) {
      index += 1;
      continue;
    }
    while (bytes[index] === 0xff) index += 1;
    const marker = bytes[index++];
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (index + 1 >= bytes.length) return null;
    const length = bytes.readUInt16BE(index);
    if (length < 2 || index + length > bytes.length) return null;
    if (marker >= 0xc0 && marker <= 0xc3 && index + 7 < bytes.length) {
      return { width: bytes.readUInt16BE(index + 5), height: bytes.readUInt16BE(index + 3) };
    }
    index += length;
  }
  return null;
}

function imageDimensions(
  bytes: Buffer,
  mime: string,
): { width: number; height: number } | null {
  if (mime === "image/jpeg") return jpegDimensions(bytes);
  if (
    mime === "image/png" &&
    bytes.length >= 24 &&
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (
    mime === "image/webp" &&
    bytes.length >= 30 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    const chunk = bytes.subarray(12, 16).toString("ascii");
    if (chunk === "VP8X") {
      return {
        width: 1 + bytes.readUIntLE(24, 3),
        height: 1 + bytes.readUIntLE(27, 3),
      };
    }
    if (chunk === "VP8 ") {
      const marker = bytes.indexOf(Buffer.from([0x9d, 0x01, 0x2a]), 20);
      if (marker >= 0 && marker + 7 < bytes.length) {
        return {
          width: bytes.readUInt16LE(marker + 3) & 0x3fff,
          height: bytes.readUInt16LE(marker + 5) & 0x3fff,
        };
      }
    }
    if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
      const bits = bytes.readUInt32LE(21);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
      };
    }
  }
  return null;
}

function assertSafeDecodedImage(bytes: Buffer, mime: string): void {
  const dimensions = imageDimensions(bytes, mime);
  if (
    !dimensions ||
    !Number.isSafeInteger(dimensions.width) ||
    !Number.isSafeInteger(dimensions.height) ||
    dimensions.width < 1 ||
    dimensions.height < 1 ||
    dimensions.width * dimensions.height > SOURCE_PREVIEW_MAX_DECODED_PIXELS
  ) {
    throw previewError(
      "This image exceeds the 25-million-pixel private preview safety limit.",
    );
  }
}

async function renderJpeg(
  bytes: Buffer,
  mime: string,
  maxDimension: number,
  maxBytes: number,
): Promise<{ bytes: Buffer; width: number; height: number }> {
  assertSafeDecodedImage(bytes, mime);
  const boundedDimension = Math.max(
    256,
    Math.min(PREVIEW_MAX_DIMENSION, Math.floor(maxDimension)),
  );
  return withTemporarySource(bytes, inputSuffix(mime), async (inputPath, directory) => {
    const attempts = [
      { dimension: boundedDimension, quality: 82 },
      { dimension: Math.min(boundedDimension, 960), quality: 72 },
      { dimension: Math.min(boundedDimension, 768), quality: 62 },
      { dimension: Math.min(boundedDimension, 640), quality: 52 },
    ];
    for (let index = 0; index < attempts.length; index += 1) {
      const attempt = attempts[index];
      const outputPath = join(directory, `image-${index}.jpg`);
      await runBinary(process.env.PYTHON_EXECUTABLE || "python3", [
        "-c",
        OPEN_CV_JPEG_RENDERER,
        inputPath,
        outputPath,
        String(attempt.dimension),
        String(attempt.quality),
      ]);
      const rendered = await readFile(outputPath);
      const dimensions = jpegDimensions(rendered);
      if (!dimensions || !dimensions.width || !dimensions.height) continue;
      if (rendered.length <= maxBytes) return { bytes: rendered, ...dimensions };
    }
    throw previewError(
      "This original cannot be reduced to the private preview size limit. It remains retained unchanged.",
    );
  });
}

async function renderPdfPage(
  bytes: Buffer,
  page: number,
): Promise<{ bytes: Buffer; width: number; height: number }> {
  return withTemporarySource(bytes, ".pdf", async (inputPath, directory) => {
    const attempts = [
      { dimension: PREVIEW_MAX_DIMENSION, quality: 72 },
      { dimension: 1_000, quality: 62 },
      { dimension: 900, quality: 52 },
      { dimension: 720, quality: 42 },
    ];
    for (let index = 0; index < attempts.length; index += 1) {
      const attempt = attempts[index];
      const prefix = join(directory, `page-${index}`);
      await runBinary("pdftoppm", [
        "-f",
        String(page),
        "-l",
        String(page),
        "-singlefile",
        "-jpeg",
        "-jpegopt",
        `quality=${attempt.quality}`,
        "-scale-to",
        String(attempt.dimension),
        inputPath,
        prefix,
      ]);
      const rendered = await readFile(`${prefix}.jpg`);
      const dimensions = jpegDimensions(rendered);
      if (!dimensions || !dimensions.width || !dimensions.height) continue;
      if (rendered.length <= SOURCE_PREVIEW_MAX_IMAGE_BYTES) {
        return { bytes: rendered, ...dimensions };
      }
    }
    throw previewError(
      "This PDF page cannot be reduced to the private preview size limit. It remains retained unchanged.",
    );
  });
}

async function pdfPageText(bytes: Buffer, page: number): Promise<string> {
  return withTemporarySource(bytes, ".pdf", async (inputPath) => {
    const output = await runBinary("pdftotext", [
      "-f",
      String(page),
      "-l",
      String(page),
      "-layout",
      inputPath,
      "-",
    ]);
    return output.replace(/\u0000/g, "");
  });
}

function evidencePattern(evidence: string): RegExp | null {
  const words = evidence
    .normalize("NFKC")
    .trim()
    .match(/\S+/g)
    ?.slice(0, 160);
  if (!words?.length) return null;
  const escaped = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(escaped.join("\\s+"), "i");
}

/** Finds a literal-ish evidence quote while allowing whitespace differences. */
export function findEvidenceRange(
  sourceText: string,
  evidence?: string,
): { start: number; end: number } | null {
  if (!evidence?.trim()) return null;
  const pattern = evidencePattern(evidence.slice(0, 2_000));
  const match = pattern?.exec(sourceText);
  if (!match || match.index === undefined) return null;
  return { start: match.index, end: match.index + match[0].length };
}

function truncateUtf8(text: string, maxBytes: number): { text: string; truncated: boolean } {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return { text, truncated: false };
  let result = "";
  for (const character of text) {
    if (Buffer.byteLength(result + character + "…", "utf8") > maxBytes) break;
    result += character;
  }
  return { text: result + "…", truncated: true };
}

/**
 * Returns a bounded original-text window with highlight offsets relative to that
 * window. The quote is centred when present, which is the native equivalent of
 * a scroll-to-evidence jump without exposing the whole decrypted document.
 */
export function boundedTextEvidence(
  sourceText: string,
  evidence?: string,
  maxBytes = SOURCE_PREVIEW_MAX_TEXT_BYTES,
): {
  text: string;
  evidenceStart: number | null;
  evidenceEnd: number | null;
  evidenceFound: boolean;
  truncated: boolean;
} {
  const range = findEvidenceRange(sourceText, evidence);
  const rawStart = range ? Math.max(0, range.start - 1_500) : 0;
  const rawEnd = range ? Math.min(sourceText.length, range.end + 24_000) : sourceText.length;
  const before = rawStart > 0 ? "…\n" : "";
  const candidate = `${before}${sourceText.slice(rawStart, rawEnd)}${rawEnd < sourceText.length ? "\n…" : ""}`;
  const clipped = truncateUtf8(candidate, maxBytes);
  if (!range) {
    return {
      text: clipped.text,
      evidenceStart: null,
      evidenceEnd: null,
      evidenceFound: false,
      truncated: clipped.truncated || rawStart > 0 || rawEnd < sourceText.length,
    };
  }
  const start = range.start - rawStart + before.length;
  const end = range.end - rawStart + before.length;
  const visible = end <= clipped.text.length;
  return {
    text: clipped.text,
    evidenceStart: visible ? start : null,
    evidenceEnd: visible ? end : null,
    evidenceFound: visible,
    truncated: clipped.truncated || rawStart > 0 || rawEnd < sourceText.length,
  };
}

async function evidencePdfPage(bytes: Buffer, pageCount: number, evidence?: string): Promise<number | null> {
  if (!evidence?.trim()) return null;
  const maxPage = Math.min(pageCount, SOURCE_PREVIEW_MAX_PAGES);
  for (let page = 1; page <= maxPage; page += 1) {
    const text = await pdfPageText(bytes, page);
    if (findEvidenceRange(text, evidence)) return page;
  }
  return null;
}

export async function sourcePreviewInfo(
  userId: number,
  input: { sourceId: string; evidence?: string },
): Promise<SourcePreviewInfo> {
  const source = await loadOwnedSource(userId, input.sourceId);
  const kind = kindForMime(source.mime);
  const pageCount = kind === "pdf" ? await pdfPageCount(source.bytes) : 1;
  const previewPageCount = kind === "pdf" ? Math.min(pageCount, SOURCE_PREVIEW_MAX_NAVIGABLE_PAGES) : 1;
  const evidencePage = kind === "pdf" ? await evidencePdfPage(source.bytes, pageCount, input.evidence) : null;
  return {
    sourceId: source.id,
    sourceVersion: source.version,
    ...(source.filename ? { filename: source.filename } : {}),
    mime: source.mime,
    kind,
    pageCount,
    previewPageCount,
    evidencePage,
    evidenceFound:
      kind === "pdf"
        ? evidencePage !== null
        : kind === "text"
          ? Boolean(findEvidenceRange(source.bytes.toString("utf8"), input.evidence))
          : false,
    limits: {
      maxPreviewBytes: SOURCE_PREVIEW_MAX_IMAGE_BYTES,
      maxPreviewPages: SOURCE_PREVIEW_MAX_PAGES,
      maxTextBytes: SOURCE_PREVIEW_MAX_TEXT_BYTES,
    },
    coachImage: {
      eligible: kind === "image",
      maxDimension: COACH_THUMBNAIL_MAX_DIMENSION,
      maxBytes: COACH_THUMBNAIL_MAX_BYTES,
    },
  };
}

export async function sourcePreviewPage(
  userId: number,
  input: { sourceId: string; page?: number; maxDimension?: number },
): Promise<SourcePreviewPage> {
  const source = await loadOwnedSource(userId, input.sourceId);
  const kind = kindForMime(source.mime);
  if (kind !== "image" && kind !== "pdf") {
    throw previewError("Only retained PNG, JPEG, WebP, and PDF sources have an image preview.");
  }
  const pageCount = kind === "pdf" ? await pdfPageCount(source.bytes) : 1;
  const page = input.page ?? 1;
  if (!Number.isSafeInteger(page) || page < 1 || page > Math.min(pageCount, SOURCE_PREVIEW_MAX_NAVIGABLE_PAGES)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Choose a preview page between 1 and ${Math.min(pageCount, SOURCE_PREVIEW_MAX_NAVIGABLE_PAGES)}.`,
    });
  }
  const rendered =
    kind === "pdf"
      ? await renderPdfPage(source.bytes, page)
      : await renderJpeg(
          source.bytes,
          source.mime,
          input.maxDimension ?? PREVIEW_MAX_DIMENSION,
          (input.maxDimension ?? PREVIEW_MAX_DIMENSION) <= COACH_THUMBNAIL_MAX_DIMENSION
            ? COACH_THUMBNAIL_MAX_BYTES
            : SOURCE_PREVIEW_MAX_IMAGE_BYTES,
        );
  return {
    sourceId: source.id,
    sourceVersion: source.version,
    page,
    pageCount,
    mime: "image/jpeg",
    base64: rendered.bytes.toString("base64"),
    bytes: rendered.bytes.length,
    width: rendered.width,
    height: rendered.height,
  };
}

export async function sourcePreviewText(
  userId: number,
  input: { sourceId: string; page?: number; evidence?: string },
): Promise<SourcePreviewText> {
  const source = await loadOwnedSource(userId, input.sourceId);
  const kind = kindForMime(source.mime);
  if (kind === "unsupported" || kind === "image") {
    throw previewError("This private source has no text layer for evidence jumping.");
  }
  if (kind === "text") {
    const bounded = boundedTextEvidence(source.bytes.toString("utf8"), input.evidence);
    return {
      sourceId: source.id,
      sourceVersion: source.version,
      page: null,
      pageCount: 1,
      ...bounded,
    };
  }
  const pageCount = await pdfPageCount(source.bytes);
  const matchedPage = input.evidence ? await evidencePdfPage(source.bytes, pageCount, input.evidence) : null;
  const page = input.page ?? matchedPage ?? 1;
  if (!Number.isSafeInteger(page) || page < 1 || page > Math.min(pageCount, SOURCE_PREVIEW_MAX_NAVIGABLE_PAGES)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Choose a text page between 1 and ${Math.min(pageCount, SOURCE_PREVIEW_MAX_NAVIGABLE_PAGES)}.`,
    });
  }
  const bounded = boundedTextEvidence(await pdfPageText(source.bytes, page), input.evidence);
  return { sourceId: source.id, sourceVersion: source.version, page, pageCount, ...bounded };
}

/**
 * Generates a transient, data-URI-safe visual attachment for an optional coach
 * request. It deliberately returns no file key, storage URL, owner identity,
 * cookie, or original bytes. The caller decides whether to include it in a
 * model request; this module never invokes a model.
 */
export async function createCoachImageThumbnail(
  userId: number,
  sourceId: string,
): Promise<CoachImageThumbnail> {
  const source = await loadOwnedSource(userId, sourceId);
  if (kindForMime(source.mime) !== "image") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Only retained image sources can be attached as a coach thumbnail.",
    });
  }
  const rendered = await renderJpeg(
    source.bytes,
    source.mime,
    COACH_THUMBNAIL_MAX_DIMENSION,
    COACH_THUMBNAIL_MAX_BYTES,
  );
  return {
    mime: "image/jpeg",
    base64: rendered.bytes.toString("base64"),
    bytes: rendered.bytes.length,
    width: rendered.width,
    height: rendered.height,
    maxDimension: COACH_THUMBNAIL_MAX_DIMENSION,
    maxBytes: COACH_THUMBNAIL_MAX_BYTES,
  };
}

/**
 * Parent-owned coach code calls this only for an explicitly selected image
 * source. `imageUri` is an opaque inline reduced JPEG; it is never a signed
 * storage URL and no original bytes, object key, cookie, or encryption value
 * accompanies it.
 */
export async function getSourcePreview(userId: number, sourceId: string) {
  const thumbnail = await createCoachImageThumbnail(userId, sourceId);
  return {
    sourceId,
    imageUri: `data:${thumbnail.mime};base64,${thumbnail.base64}`,
    mime: thumbnail.mime,
    bytes: thumbnail.bytes,
    width: thumbnail.width,
    height: thumbnail.height,
  };
}

/** Parent-owned coach service can call this only while constructing an image-enabled request. */
export function coachThumbnailMessage(thumbnail: CoachImageThumbnail): ImageContent {
  if (
    thumbnail.bytes > COACH_THUMBNAIL_MAX_BYTES ||
    thumbnail.width > COACH_THUMBNAIL_MAX_DIMENSION ||
    thumbnail.height > COACH_THUMBNAIL_MAX_DIMENSION
  ) {
    throw new Error("Coach thumbnail exceeds its mandatory image safety bounds.");
  }
  return {
    type: "image_url",
    image_url: {
      url: `data:${thumbnail.mime};base64,${thumbnail.base64}`,
      detail: "low",
    },
  };
}

/** Safe UI-only metadata; no thumbnail/base64 is returned from this helper. */
export function coachThumbnailMetadata(mime: string) {
  return {
    eligible: IMAGE_MIMES.has(mime),
    maxDimension: COACH_THUMBNAIL_MAX_DIMENSION,
    maxBytes: COACH_THUMBNAIL_MAX_BYTES,
    attached: false,
  } as const;
}
