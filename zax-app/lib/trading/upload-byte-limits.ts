/** Limits shared by client-side source and screenshot readers. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_ENCODED_BASE64_BYTES = 36 * 1024 * 1024;
/** The OpenCV visual-query worker is intentionally stricter than source retention. */
export const MAX_PHOTO_SEARCH_BYTES = 8 * 1024 * 1024;
export const MAX_PHOTO_SEARCH_BASE64_BYTES =
  Math.ceil(MAX_PHOTO_SEARCH_BYTES / 3) * 4;

function compactStandardBase64(value: string): string {
  const compact = value.replace(/\s/g, "");
  if (!compact) return compact;
  // Avoid a nested quantifier here: it overflows V8's stack on valid 8 MiB
  // photo-search payloads. Validate body and optional tail independently.
  const firstPadding = compact.indexOf("=");
  const body = firstPadding === -1 ? compact : compact.slice(0, firstPadding);
  const padding = firstPadding === -1 ? "" : compact.slice(firstPadding);
  const padded =
    (padding === "=" && body.length % 4 === 3) ||
    (padding === "==" && body.length % 4 === 2);
  const unpadded =
    !padding &&
    (body.length % 4 === 0 || body.length % 4 === 2 || body.length % 4 === 3);
  if (!/^[A-Za-z0-9+/]+$/.test(body) || (!padded && !unpadded)) {
    throw new Error("File content is not standard Base64.");
  }
  return compact;
}

/** Counts decoded bytes without materializing a second binary copy. */
export function decodedBase64ByteLength(value: string): number {
  const compact = compactStandardBase64(value);
  if (!compact) return 0;
  const padding = compact.endsWith("==") ? 2 : compact.endsWith("=") ? 1 : 0;
  const unpaddedLength = compact.length - padding;
  const remainder = unpaddedLength % 4;
  return (
    Math.floor(unpaddedLength / 4) * 3 +
    (remainder === 2 ? 1 : remainder === 3 ? 2 : 0)
  );
}

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function assertUploadByteLimit(
  byteLength: number,
  message = "Files are limited to 25 MiB.",
): number {
  if (
    !Number.isSafeInteger(byteLength) ||
    byteLength < 0 ||
    byteLength > MAX_UPLOAD_BYTES
  ) {
    throw new Error(message);
  }
  return byteLength;
}

export function assertPhotoSearchByteLimit(
  byteLength: number,
  message = "Photo search images are limited to 8 MiB.",
): number {
  if (
    !Number.isSafeInteger(byteLength) ||
    byteLength < 0 ||
    byteLength > MAX_PHOTO_SEARCH_BYTES
  ) {
    throw new Error(message);
  }
  return byteLength;
}

/** Enforces the transport cap and the actual decoded/native-file cap. */
export function assertBase64UploadLimits(
  value: string,
  message = "Files are limited to 25 MiB.",
): number {
  let compact: string;
  try {
    compact = compactStandardBase64(value);
  } catch {
    throw new Error(message);
  }
  if (compact.length > MAX_ENCODED_BASE64_BYTES) throw new Error(message);
  return assertUploadByteLimit(decodedBase64ByteLength(compact), message);
}

/** Enforces the visual-worker limit before a native picker reads or sends a query. */
export function assertBase64PhotoSearchLimits(
  value: string,
  message = "Photo search images are limited to 8 MiB.",
): number {
  let compact: string;
  try {
    compact = compactStandardBase64(value);
  } catch {
    throw new Error(message);
  }
  if (compact.length > MAX_PHOTO_SEARCH_BASE64_BYTES) throw new Error(message);
  return assertPhotoSearchByteLimit(decodedBase64ByteLength(compact), message);
}

export function assertUtf8ByteLimit(
  value: string,
  message = "Files are limited to 25 MiB.",
): number {
  return assertUploadByteLimit(utf8ByteLength(value), message);
}
