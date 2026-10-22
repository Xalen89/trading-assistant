import { describe, expect, it } from "vitest";
import {
  canonicalTradeScreenshotSourceContext,
  notesWithTradeScreenshotSourceContext,
  readTradeScreenshotSourceContext,
  tradeScreenshotAnalysisSchema,
  tradeScreenshotReviewSchema,
} from "../../lib/trading/trade-screenshot-types";

const analysis = {
  summary: "Synthetic review only.",
  visibleFacts: [],
  textualEvidence: [],
  visibleTime: {
    date: null,
    time: null,
    timezone: null,
    status: "not-visible",
    uncertainty: "No time is visible in this synthetic fixture.",
  },
  confluences: [],
  processLessons: [],
  limitations: ["A screenshot cannot establish a fill or an outcome."],
};

const review = {
  version: 1,
  stage: "unknown",
  source: {
    id: "synthetic-source",
    sourceVersion: 1,
    reviewRevision: null,
    uploadedAt: 1_800_000_000_000,
    filename: "synthetic.png",
    mime: "image/png",
  },
  linkedTrade: { canonicalTradeId: null, linkage: "standalone" },
  ownerTime: { captureOrTradeAt: null, timezone: null, confirmed: false },
  analyzedAt: 1_800_000_000_100,
  model: "synthetic-model",
  ...analysis,
  outcome: {
    status: "unverified-from-screenshot",
    evidence:
      "A screenshot alone cannot verify a fill, bracket state, or trade outcome.",
  },
  approval: {
    status: "draft",
    confirmedAt: null,
    note: "Approved review is not a validated strategy, fill, bracket, or outcome.",
  },
};

describe("trade screenshot schemas", () => {
  it("permits explicit unknown visual time while keeping owner timing separate", () => {
    const parsed = tradeScreenshotReviewSchema.parse(review);
    expect(parsed.visibleTime).toMatchObject({
      date: null,
      time: null,
      timezone: null,
      status: "not-visible",
    });
    expect(parsed.ownerTime).toEqual({
      captureOrTradeAt: null,
      timezone: null,
      confirmed: false,
    });
    expect(parsed.source).toMatchObject({
      id: "synthetic-source",
      sourceVersion: 1,
      reviewRevision: null,
    });
  });

  it("rejects unknown fields and any attempt to change screenshot-only outcome status", () => {
    expect(() =>
      tradeScreenshotAnalysisSchema.parse({ ...analysis, injected: true }),
    ).toThrow();
    expect(() =>
      tradeScreenshotReviewSchema.parse({
        ...review,
        outcome: { ...review.outcome, status: "verified" },
      }),
    ).toThrow();
    expect(() =>
      tradeScreenshotReviewSchema.parse({ ...review, canonicalFill: 123.45 }),
    ).toThrow();
  });

  it("bounds lessons and facts to evidence-oriented structures", () => {
    expect(() =>
      tradeScreenshotReviewSchema.parse({
        ...review,
        processLessons: [
          {
            lesson: "Buy now",
            evidence: "none",
            boundary: "none",
            extra: "no",
          },
        ],
      }),
    ).toThrow();
  });

  it("retains a bounded canonical source context without fills, brackets, or outcomes", () => {
    const sourceContext = canonicalTradeScreenshotSourceContext({
      id: "paper-source-context",
      market: "BTC-USD",
      timeframe: "15m",
      strategyId: "strategy-context",
      strategyVersion: 3,
    });
    const retained = readTradeScreenshotSourceContext({
      notes: notesWithTradeScreenshotSourceContext(
        "Private evidence only.",
        sourceContext,
      ),
      entry: 100,
      outcome: "untrusted-extra-metadata",
    });

    expect(retained).toEqual({
      canonicalTradeId: "paper-source-context",
      linkage: "owner-scoped-canonical-record",
      market: "BTC-USD",
      timeframe: "15m",
      strategyId: "strategy-context",
      strategyVersion: 3,
    });
    expect(retained).not.toHaveProperty("entry");
    expect(retained).not.toHaveProperty("outcome");
  });
});
