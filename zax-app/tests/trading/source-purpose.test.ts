import { describe, expect, it } from "vitest";
import {
  isGenericLibrarySource,
  isReviewOnlySource,
  notesWithSourcePurpose,
  sourcePurposeFromNotes,
} from "../../lib/trading/source-purpose";

describe("source purpose metadata", () => {
  it("round-trips the bounded screenshot purpose in existing notes metadata", () => {
    const notes = notesWithSourcePurpose(
      "Owner-entered screenshot context.",
      "trade-screenshot",
    );
    expect(sourcePurposeFromNotes(notes)).toBe("trade-screenshot");
    expect(isReviewOnlySource({ notes } as any)).toBe(true);
    expect(isGenericLibrarySource({ notes } as any)).toBe(false);
  });

  it("fails closed for an unknown purpose marker instead of treating it as an ordinary reference", () => {
    const notes =
      "[stratdesk:source-purpose=future-purpose]\nSynthetic fixture";
    expect(sourcePurposeFromNotes(notes)).toBeUndefined();
    expect(isReviewOnlySource({ notes } as any)).toBe(true);
    expect(isGenericLibrarySource({ notes } as any)).toBe(false);
  });

  it("leaves unmarked legacy references eligible for generic library flows", () => {
    expect(isGenericLibrarySource({ notes: "Legacy owner note" } as any)).toBe(
      true,
    );
  });
});
