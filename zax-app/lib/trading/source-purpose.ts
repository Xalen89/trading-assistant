import type { Pattern } from "./model";

/**
 * Purpose is retained in existing source metadata (`notes`) so no schema
 * migration is needed. Keep this marker stable: it is an authorization boundary,
 * not presentation text.
 */
const PURPOSE_MARKER_PREFIX = "[stratdesk:source-purpose=";
const PURPOSE_MARKER_SUFFIX = "]";

export const sourcePurposeSchemaValues = ["trade-screenshot"] as const;
export type SourcePurpose = (typeof sourcePurposeSchemaValues)[number];

function markerFor(purpose: SourcePurpose): string {
  return `${PURPOSE_MARKER_PREFIX}${purpose}${PURPOSE_MARKER_SUFFIX}`;
}

function removePurposeMarkers(notes: string): string {
  return notes
    .replace(/\[stratdesk:source-purpose=(?:trade-screenshot)\]\s*/g, "")
    .trim();
}

/** Stores exactly one typed purpose marker while preserving the owner's notes. */
export function notesWithSourcePurpose(
  notes: string,
  purpose?: SourcePurpose,
): string {
  const ownerNotes = removePurposeMarkers(notes);
  return purpose
    ? `${markerFor(purpose)}${ownerNotes ? `\n${ownerNotes}` : ""}`
    : ownerNotes;
}

/** Returns no purpose for legacy/ordinary sources; unknown markers fail closed. */
export function sourcePurposeFromNotes(
  notes: string | undefined,
): SourcePurpose | undefined {
  if (!notes) return undefined;
  const match = notes.match(/\[stratdesk:source-purpose=([^\]]+)\]/);
  return match?.[1] === "trade-screenshot" ? "trade-screenshot" : undefined;
}

export function isReviewOnlySource(source: Pick<Pattern, "notes">): boolean {
  // An unknown marker must never accidentally grant generic indexing/model use.
  return /\[stratdesk:source-purpose=[^\]]+\]/.test(source.notes);
}

/** Generic source-library features must opt in only to ordinary references. */
export function isGenericLibrarySource(
  source: Pick<Pattern, "notes">,
): boolean {
  return !isReviewOnlySource(source);
}
