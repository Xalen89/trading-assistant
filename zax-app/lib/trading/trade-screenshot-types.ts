import { z } from "zod";
import type { Timeframe, Trade } from "./model";
import {
  notesWithSourcePurpose,
  sourcePurposeFromNotes,
} from "./source-purpose";

const id = z.string().min(1).max(100);
const boundedText = (max: number) => z.string().trim().min(1).max(max);
const timestamp = z.number().finite().nonnegative();

/** The owner selects timing; the model never infers a lifecycle stage. */
export const screenshotStageSchema = z.enum([
  "before",
  "during",
  "after",
  "unknown",
]);
export type ScreenshotStage = z.infer<typeof screenshotStageSchema>;

export const TRADE_SCREENSHOT_SOURCE_PURPOSE = "trade-screenshot" as const;
const SOURCE_CONTEXT_MARKER_PREFIX = "[stratdesk:trade-screenshot-context=";
const SOURCE_CONTEXT_MARKER_PATTERN =
  /\[stratdesk:trade-screenshot-context=([^\]]+)\]\s*/g;
const MAX_SOURCE_CONTEXT_MARKER_LENGTH = 1_500;

const sourceContextMarket = z.string().trim().min(1).max(100);
const sourceContextTimeframe = z.enum([
  "1m",
  "5m",
  "15m",
  "30m",
  "1h",
  "4h",
  "1d",
  "1w",
]);

/**
 * Immutable source metadata retained at screenshot upload. It deliberately
 * excludes fills, brackets, outcomes, and any model-generated content.
 */
export const tradeScreenshotSourceContextSchema = z
  .object({
    canonicalTradeId: id.nullable(),
    linkage: z.enum(["standalone", "owner-scoped-canonical-record"]),
    market: sourceContextMarket,
    timeframe: sourceContextTimeframe,
    strategyId: id,
    strategyVersion: z.number().int().positive().nullable(),
  })
  .strict()
  .superRefine((value, issue) => {
    if (
      value.linkage === "owner-scoped-canonical-record" &&
      (!value.canonicalTradeId || value.strategyVersion === null)
    ) {
      issue.addIssue({
        code: "custom",
        message:
          "Canonical screenshot links require a trade ID and strategy revision.",
      });
    }
    if (value.linkage === "standalone" && value.canonicalTradeId !== null) {
      issue.addIssue({
        code: "custom",
        message: "Standalone screenshot context cannot name a canonical trade.",
      });
    }
  });
export type TradeScreenshotSourceContext = z.infer<
  typeof tradeScreenshotSourceContextSchema
>;

/** Additional upload options accepted by the review-only source path. */
export type TradeScreenshotSourceRetention = {
  reviewOnly: true;
  sourcePurpose: typeof TRADE_SCREENSHOT_SOURCE_PURPOSE;
};

/**
 * Keeps the immutable context in existing Pattern metadata (`notes`), alongside
 * the typed source-purpose marker. This avoids a Pattern/schema migration.
 */
export function notesWithTradeScreenshotSourceContext(
  notes: string,
  sourceContext: TradeScreenshotSourceContext,
): string {
  const encoded = encodeURIComponent(
    JSON.stringify(tradeScreenshotSourceContextSchema.parse(sourceContext)),
  );
  const marker = `${SOURCE_CONTEXT_MARKER_PREFIX}${encoded}]`;
  if (marker.length > MAX_SOURCE_CONTEXT_MARKER_LENGTH) {
    throw new Error(
      "Screenshot source context exceeds its bounded metadata size.",
    );
  }
  const ownerNotes = notes.replace(SOURCE_CONTEXT_MARKER_PATTERN, "").trim();
  return notesWithSourcePurpose(
    `${marker}${ownerNotes ? `\n${ownerNotes}` : ""}`,
    TRADE_SCREENSHOT_SOURCE_PURPOSE,
  );
}

export function standaloneTradeScreenshotSourceContext(input: {
  market: string;
  timeframe: Timeframe;
  strategyId: string;
  strategyVersion?: number;
}): TradeScreenshotSourceContext {
  return tradeScreenshotSourceContextSchema.parse({
    canonicalTradeId: null,
    linkage: "standalone",
    market: input.market,
    timeframe: input.timeframe,
    strategyId: input.strategyId,
    strategyVersion: input.strategyVersion ?? null,
  });
}

export function canonicalTradeScreenshotSourceContext(
  trade: Pick<
    Trade,
    "id" | "market" | "timeframe" | "strategyId" | "strategyVersion"
  >,
): TradeScreenshotSourceContext {
  return tradeScreenshotSourceContextSchema.parse({
    canonicalTradeId: trade.id,
    linkage: "owner-scoped-canonical-record",
    market: trade.market,
    timeframe: trade.timeframe,
    strategyId: trade.strategyId,
    strategyVersion: trade.strategyVersion,
  });
}

/**
 * Reads only the explicit review-only metadata. Legacy sources remain readable
 * but cannot be mistaken for a newly retained immutable source context.
 */
export function readTradeScreenshotSourceContext(
  metadata: unknown,
): TradeScreenshotSourceContext | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const record = metadata as Record<string, unknown>;
  if (
    typeof record.notes !== "string" ||
    sourcePurposeFromNotes(record.notes) !== TRADE_SCREENSHOT_SOURCE_PURPOSE
  )
    return undefined;
  const marker = record.notes.match(SOURCE_CONTEXT_MARKER_PATTERN);
  if (!marker?.[0]) {
    throw new Error(
      "Review-only screenshot source is missing immutable context.",
    );
  }
  const encoded = marker[0]
    .replace(SOURCE_CONTEXT_MARKER_PREFIX, "")
    .replace(/\]\s*$/, "");
  return tradeScreenshotSourceContextSchema.parse(
    JSON.parse(decodeURIComponent(encoded)),
  );
}

export const screenshotVisibleTimeSchema = z
  .object({
    date: z.string().trim().max(120).nullable(),
    time: z.string().trim().max(120).nullable(),
    timezone: z.string().trim().max(120).nullable(),
    status: z.enum(["visible", "obscured", "not-visible", "ambiguous"]),
    uncertainty: boundedText(600),
  })
  .strict();

const evidenceSchema = z
  .object({
    observation: boundedText(900),
    evidence: boundedText(900),
    certainty: z.enum(["visible", "inferred", "unknown"]),
    uncertainty: boundedText(600),
  })
  .strict();

const textualEvidenceSchema = z
  .object({
    text: boundedText(500),
    location: boundedText(240),
    certainty: z.enum(["visible", "partial", "uncertain"]),
    uncertainty: boundedText(500),
  })
  .strict();

const confluenceSchema = z
  .object({
    observation: boundedText(900),
    evidence: boundedText(900),
    certainty: z.enum(["visible", "inferred", "unknown"]),
    missing: boundedText(600),
  })
  .strict();

const processLessonSchema = z
  .object({
    lesson: boundedText(700),
    evidence: boundedText(700),
    boundary: boundedText(500),
  })
  .strict();

/**
 * The only fields generated by the vision model. All relationships, timestamps,
 * owner assertions, and approval metadata are server-derived afterwards.
 */
export const tradeScreenshotAnalysisSchema = z
  .object({
    summary: boundedText(1_200),
    visibleFacts: z.array(evidenceSchema).max(12),
    textualEvidence: z.array(textualEvidenceSchema).max(12),
    visibleTime: screenshotVisibleTimeSchema,
    confluences: z.array(confluenceSchema).max(10),
    processLessons: z.array(processLessonSchema).max(5),
    limitations: z.array(boundedText(700)).min(1).max(12),
  })
  .strict();
export type TradeScreenshotAnalysis = z.infer<
  typeof tradeScreenshotAnalysisSchema
>;

/**
 * Retained with optional root Pattern.tradeReview. It is evidence-oriented
 * learning material, never a canonical fill, bracket, outcome, or strategy.
 */
export const tradeScreenshotReviewSchema = z
  .object({
    version: z.literal(1),
    stage: screenshotStageSchema,
    source: z
      .object({
        id,
        /** Immutable source definition version that was analyzed. */
        sourceVersion: z.number().int().positive(),
        /** New protected source revision that retained approval, if any. */
        reviewRevision: z.number().int().positive().nullable(),
        uploadedAt: timestamp,
        filename: boundedText(256),
        mime: z.enum(["image/png", "image/jpeg", "image/webp"]),
      })
      .strict(),
    linkedTrade: z
      .object({
        canonicalTradeId: id.nullable(),
        linkage: z.enum(["standalone", "owner-scoped-canonical-record"]),
      })
      .strict(),
    /** Owner-entered capture/trade time is deliberately distinct from upload time. */
    ownerTime: z
      .object({
        captureOrTradeAt: timestamp.nullable(),
        timezone: z.string().trim().max(120).nullable(),
        confirmed: z.boolean(),
      })
      .strict(),
    analyzedAt: timestamp,
    model: boundedText(160),
    summary: boundedText(1_200),
    visibleFacts: z.array(evidenceSchema).max(12),
    textualEvidence: z.array(textualEvidenceSchema).max(12),
    visibleTime: screenshotVisibleTimeSchema,
    confluences: z.array(confluenceSchema).max(10),
    processLessons: z.array(processLessonSchema).max(5),
    limitations: z.array(boundedText(700)).min(1).max(12),
    /** A screenshot can display a claim but cannot verify an outcome. */
    outcome: z
      .object({
        status: z.literal("unverified-from-screenshot"),
        evidence: boundedText(600),
      })
      .strict(),
    approval: z
      .object({
        status: z.enum(["draft", "approved"]),
        confirmedAt: timestamp.nullable(),
        note: z.literal(
          "Approved review is not a validated strategy, fill, bracket, or outcome.",
        ),
      })
      .strict(),
  })
  .strict();
export type TradeScreenshotReview = z.infer<typeof tradeScreenshotReviewSchema>;

/** Strict JSON Schema sent to the managed multimodal model. Zod parses again. */
export const tradeScreenshotAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    visibleFacts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          observation: { type: "string" },
          evidence: { type: "string" },
          certainty: { enum: ["visible", "inferred", "unknown"] },
          uncertainty: { type: "string" },
        },
        required: ["observation", "evidence", "certainty", "uncertainty"],
      },
    },
    textualEvidence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: { type: "string" },
          location: { type: "string" },
          certainty: { enum: ["visible", "partial", "uncertain"] },
          uncertainty: { type: "string" },
        },
        required: ["text", "location", "certainty", "uncertainty"],
      },
    },
    visibleTime: {
      type: "object",
      additionalProperties: false,
      properties: {
        date: { type: ["string", "null"] },
        time: { type: ["string", "null"] },
        timezone: { type: ["string", "null"] },
        status: {
          enum: ["visible", "obscured", "not-visible", "ambiguous"],
        },
        uncertainty: { type: "string" },
      },
      required: ["date", "time", "timezone", "status", "uncertainty"],
    },
    confluences: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          observation: { type: "string" },
          evidence: { type: "string" },
          certainty: { enum: ["visible", "inferred", "unknown"] },
          missing: { type: "string" },
        },
        required: ["observation", "evidence", "certainty", "missing"],
      },
    },
    processLessons: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          lesson: { type: "string" },
          evidence: { type: "string" },
          boundary: { type: "string" },
        },
        required: ["lesson", "evidence", "boundary"],
      },
    },
    limitations: { type: "array", items: { type: "string" } },
  },
  required: [
    "summary",
    "visibleFacts",
    "textualEvidence",
    "visibleTime",
    "confluences",
    "processLessons",
    "limitations",
  ],
} as const;
