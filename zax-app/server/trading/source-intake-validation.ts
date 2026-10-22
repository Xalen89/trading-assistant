import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

export const MAX_SOURCE_IMAGE_PIXELS = 25_000_000;
export const MAX_SOURCE_PDF_PAGES = 200;

const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);
const VALIDATION_TIMEOUT_MS = 10_000;
const VALIDATION_MAX_BUFFER = 8 * 1024;

export class SourceIntakeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceIntakeValidationError";
  }
}

function imageDimensions(
  bytes: Buffer,
  mime: string,
): { width: number; height: number } | null {
  if (
    mime === "image/png" &&
    bytes.length >= 24 &&
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    bytes.subarray(12, 16).toString("ascii") === "IHDR"
  ) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }

  if (
    mime === "image/jpeg" &&
    bytes.length >= 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8
  ) {
    for (let index = 2; index + 9 < bytes.length; ) {
      if (bytes[index] !== 0xff) {
        index += 1;
        continue;
      }
      while (bytes[index] === 0xff) index += 1;
      const marker = bytes[index++];
      if (
        marker === 0xd8 ||
        marker === 0xd9 ||
        marker === 0x01 ||
        (marker >= 0xd0 && marker <= 0xd7)
      )
        continue;
      if (index + 1 >= bytes.length) return null;
      const length = bytes.readUInt16BE(index);
      if (length < 2 || index + length > bytes.length) return null;
      if (marker >= 0xc0 && marker <= 0xc3 && index + 7 < bytes.length) {
        return {
          width: bytes.readUInt16BE(index + 5),
          height: bytes.readUInt16BE(index + 3),
        };
      }
      index += length;
    }
    return null;
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

function assertImageBounds(bytes: Buffer, mime: string): void {
  const dimensions = imageDimensions(bytes, mime);
  if (
    !dimensions ||
    !Number.isSafeInteger(dimensions.width) ||
    !Number.isSafeInteger(dimensions.height) ||
    dimensions.width < 1 ||
    dimensions.height < 1 ||
    dimensions.width * dimensions.height > MAX_SOURCE_IMAGE_PIXELS
  ) {
    throw new SourceIntakeValidationError(
      "This image is unreadable or exceeds the 25-million-pixel safety limit.",
    );
  }
}

async function withTemporaryFile<T>(
  bytes: Buffer,
  suffix: string,
  work: (path: string) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "stratdesk-source-intake-"));
  const path = join(directory, `input${suffix}`);
  try {
    await writeFile(path, bytes, { mode: 0o600 });
    return await work(path);
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(
      () => undefined,
    );
  }
}

/**
 * OpenCV is already the deployed visual-index decoder. Decode after the cheap
 * dimension check, rather than treating a signature/header as a valid image.
 */
async function decodeImage(path: string): Promise<void> {
  const script = [
    "import cv2, sys",
    "image = cv2.imread(sys.argv[1], cv2.IMREAD_UNCHANGED)",
    "if image is None: raise ValueError('unreadable image')",
    "height, width = image.shape[:2]",
    `if width < 1 or height < 1 or width * height > ${MAX_SOURCE_IMAGE_PIXELS}: raise ValueError('unsafe image dimensions')`,
  ].join("\n");
  try {
    await execFile(
      process.env.PYTHON_EXECUTABLE || "python3",
      ["-c", script, path],
      {
        timeout: VALIDATION_TIMEOUT_MS,
        maxBuffer: VALIDATION_MAX_BUFFER,
        windowsHide: true,
      },
    );
  } catch {
    throw new SourceIntakeValidationError(
      "This image could not be decoded safely. Choose a complete PNG, JPEG, or WebP image.",
    );
  }
}

async function validateImage(bytes: Buffer, mime: string): Promise<void> {
  assertImageBounds(bytes, mime);
  const suffix =
    mime === "image/png" ? ".png" : mime === "image/jpeg" ? ".jpg" : ".webp";
  await withTemporaryFile(bytes, suffix, decodeImage);
}

async function validatePdf(bytes: Buffer): Promise<void> {
  await withTemporaryFile(bytes, ".pdf", async (path) => {
    let output = "";
    try {
      const result = await execFile("pdfinfo", [path], {
        timeout: VALIDATION_TIMEOUT_MS,
        maxBuffer: VALIDATION_MAX_BUFFER,
        windowsHide: true,
      });
      output = typeof result.stdout === "string" ? result.stdout : "";
    } catch {
      throw new SourceIntakeValidationError(
        "This PDF could not be parsed safely. Choose a complete, readable PDF.",
      );
    }
    const match = output.match(/^Pages:\s*(\d+)\s*$/im);
    const pages = match ? Number(match[1]) : NaN;
    if (
      !Number.isSafeInteger(pages) ||
      pages < 1 ||
      pages > MAX_SOURCE_PDF_PAGES
    ) {
      throw new SourceIntakeValidationError(
        `This PDF must have between 1 and ${MAX_SOURCE_PDF_PAGES} readable pages.`,
      );
    }
  });
}

/** No-op for UTF-8/JSON sources, which `validateFile` parses synchronously. */
export async function validateRetainedSourceBytes(
  bytes: Buffer,
  mime: string,
): Promise<void> {
  if (IMAGE_MIMES.has(mime)) return validateImage(bytes, mime);
  if (mime === "application/pdf") return validatePdf(bytes);
}
