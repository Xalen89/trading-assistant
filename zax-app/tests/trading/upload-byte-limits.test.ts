import { describe, expect, it } from "vitest";
import {
  MAX_PHOTO_SEARCH_BYTES,
  MAX_ENCODED_BASE64_BYTES,
  MAX_UPLOAD_BYTES,
  assertBase64PhotoSearchLimits,
  assertBase64UploadLimits,
  assertPhotoSearchByteLimit,
  assertUploadByteLimit,
  assertUtf8ByteLimit,
  decodedBase64ByteLength,
  utf8ByteLength,
} from "../../lib/trading/upload-byte-limits";

describe("upload byte limits", () => {
  it("counts standard Base64 after removing whitespace and respecting padding", () => {
    expect(decodedBase64ByteLength("T Q = =\n")).toBe(1);
    expect(decodedBase64ByteLength("TWE=")).toBe(2);
    expect(decodedBase64ByteLength("TWFu")).toBe(3);
    expect(decodedBase64ByteLength("TWE")).toBe(2);
  });

  it("rejects malformed Base64 rather than estimating its decoded size", () => {
    expect(() => decodedBase64ByteLength("A")).toThrow(
      "File content is not standard Base64.",
    );
    expect(() => decodedBase64ByteLength("T=WE")).toThrow(
      "File content is not standard Base64.",
    );
  });

  it("enforces both encoded transport and decoded native-file caps", () => {
    expect(() =>
      assertBase64UploadLimits("A".repeat(MAX_ENCODED_BASE64_BYTES + 4)),
    ).toThrow("Files are limited to 25 MiB.");
    const decodedOverLimit = "A".repeat(
      Math.ceil((MAX_UPLOAD_BYTES + 1) / 3) * 4,
    );
    expect(() => assertBase64UploadLimits(decodedOverLimit)).toThrow(
      "Files are limited to 25 MiB.",
    );
    expect(() => assertUploadByteLimit(MAX_UPLOAD_BYTES + 1)).toThrow(
      "Files are limited to 25 MiB.",
    );
  });

  it("uses a single decoded 8 MiB boundary for photo search before transport", () => {
    expect(assertPhotoSearchByteLimit(MAX_PHOTO_SEARCH_BYTES)).toBe(
      MAX_PHOTO_SEARCH_BYTES,
    );
    expect(() =>
      assertPhotoSearchByteLimit(MAX_PHOTO_SEARCH_BYTES + 1),
    ).toThrow("Photo search images are limited to 8 MiB.");
    expect(
      assertBase64PhotoSearchLimits(
        Buffer.alloc(MAX_PHOTO_SEARCH_BYTES).toString("base64"),
      ),
    ).toBe(MAX_PHOTO_SEARCH_BYTES);
    expect(() =>
      assertBase64PhotoSearchLimits(
        Buffer.alloc(MAX_PHOTO_SEARCH_BYTES + 1).toString("base64"),
      ),
    ).toThrow("Photo search images are limited to 8 MiB.");
  });

  it("uses actual UTF-8 byte length instead of JavaScript character length", () => {
    expect(utf8ByteLength("€")).toBe(3);
    expect(() =>
      assertUtf8ByteLimit(
        "€".repeat(Math.floor(MAX_UPLOAD_BYTES / 3) + 1),
        "History is too large.",
      ),
    ).toThrow("History is too large.");
  });
});
