import { z } from "zod";
import type { Factor, Strategy } from "./model";

/**
 * A deliberately small declarative subset.  It is a description for a future
 * scanner implementation, not an interpreter and never an order instruction.
 * A source gets this only when it literally specifies the indicator, period,
 * comparison, and a closed-bar basis.
 */
export const predicateSpecSchema = z
  .object({
    kind: z.literal("ema-close"),
    period: z.number().int().min(1).max(500),
    comparison: z.enum(["above", "below"]),
    bar: z.literal("closed"),
  })
  .strict();

export type PredicateSpec = z.infer<typeof predicateSpecSchema>;

/** A missing source weight remains missing; it is never filled or normalized. */
export const blueprintWeightSchema = z.discriminatedUnion("provenance", [
  z
    .object({
      value: z.number().finite().min(0).max(100),
      provenance: z.literal("source-stated"),
    })
    .strict(),
  z
    .object({
      value: z.number().finite().min(0).max(100),
      provenance: z.literal("suggested"),
    })
    .strict(),
  z.object({ value: z.null(), provenance: z.literal("not-stated") }).strict(),
]);

export type BlueprintWeight = z.infer<typeof blueprintWeightSchema>;

export const blueprintConditionSchema = z
  .object({
    id: z
      .string()
      .trim()
      .regex(/^condition-[a-z0-9][a-z0-9-]{0,62}$/),
    name: z.string().trim().min(1).max(180),
    /** Human-review wording. It is not a general-purpose expression language. */
    predicate: z.string().trim().min(1).max(1_200),
    weight: blueprintWeightSchema,
    dataSource: z.string().trim().min(1).max(300),
    /** A short literal quote for text sources, or careful visual evidence for an image. */
    sourceExcerpt: z.string().trim().min(1).max(600),
    automation: z.enum(["supported", "manual", "missing-data"]),
    /** Null is explicit when a condition is not safely reducible to the narrow DSL. */
    predicateSpec: predicateSpecSchema.nullable(),
  })
  .strict()
  .superRefine((condition, context) => {
    if (condition.predicateSpec && condition.automation !== "supported") {
      context.addIssue({
        code: "custom",
        message: "predicateSpec requires automation to be supported.",
        path: ["automation"],
      });
    }
    if (!condition.predicateSpec && condition.automation === "supported") {
      context.addIssue({
        code: "custom",
        message: "supported automation requires a narrow predicateSpec.",
        path: ["predicateSpec"],
      });
    }
  });

export const libraryBlueprintAnalysisSchema = z
  .object({
    summary: z.string().trim().min(1).max(1_600),
    trigger: z
      .object({
        text: z.string().trim().min(1).max(1_200),
        sourceExcerpt: z.string().trim().min(1).max(600),
      })
      .strict(),
    conditions: z.array(blueprintConditionSchema).max(24),
    indicators: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(160),
            /** Exact source parameters only; an empty list means none were stated. */
            parameters: z.array(z.string().trim().min(1).max(160)).max(20),
          })
          .strict(),
      )
      .max(30),
    markets: z.array(z.string().trim().min(1).max(120)).max(30),
    timeframes: z.array(z.string().trim().min(1).max(120)).max(30),
    entry: z.string().trim().min(1).max(1_400),
    invalidation: z.string().trim().min(1).max(1_400),
    targets: z.string().trim().min(1).max(1_400),
    risk: z.string().trim().min(1).max(1_400),
    requiredData: z.array(z.string().trim().min(1).max(300)).max(40),
    ambiguities: z.array(z.string().trim().min(1).max(700)).max(40),
  })
  .strict()
  .superRefine((analysis, context) => {
    const ids = new Set<string>();
    analysis.conditions.forEach((condition, index) => {
      if (ids.has(condition.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate condition id ${condition.id}.`,
          path: ["conditions", index, "id"],
        });
      }
      ids.add(condition.id);
    });
  });

export type LibraryBlueprintAnalysis = z.infer<
  typeof libraryBlueprintAnalysisSchema
>;

export const libraryBlueprintSchema = libraryBlueprintAnalysisSchema
  .safeExtend({
    version: z.literal(1),
    sourceId: z.string().trim().min(1).max(100),
    sourceVersion: z.number().int().positive(),
    createdAt: z.number().int().nonnegative(),
    approved: z.literal(false),
  })
  .strict();

export type LibraryBlueprint = z.infer<typeof libraryBlueprintSchema>;

export type LibraryBlueprintDraftInput = LibraryBlueprintAnalysis & {
  sourceId: string;
  sourceVersion: number;
  /** Injected by the caller so this helper remains pure and reproducible. */
  createdAt: number;
};

/**
 * Pure validation boundary for an already-formed proposal. It deliberately
 * rejects unknown fields and a true approval flag rather than correcting them.
 */
export function validateLibraryBlueprint(value: unknown): LibraryBlueprint {
  return libraryBlueprintSchema.parse(value);
}

/** Creates an unapproved, versioned proposal without reading storage or time. */
export function createLibraryBlueprintDraft(
  input: LibraryBlueprintDraftInput,
): LibraryBlueprint {
  return validateLibraryBlueprint({
    version: 1,
    sourceId: input.sourceId,
    sourceVersion: input.sourceVersion,
    createdAt: input.createdAt,
    summary: input.summary,
    trigger: input.trigger,
    conditions: input.conditions,
    indicators: input.indicators,
    markets: input.markets,
    timeframes: input.timeframes,
    entry: input.entry,
    invalidation: input.invalidation,
    targets: input.targets,
    risk: input.risk,
    requiredData: input.requiredData,
    ambiguities: input.ambiguities,
    approved: false,
  });
}

/**
 * A conversion candidate is intentionally distinct from Strategy. The caller
 * must collect an explicit user acceptance before using its embedded style.
 */
export type ProposedStrategy = {
  strategy: Strategy;
  sourceId: string;
  sourceVersion: number;
  blueprintVersion: 1;
  createdAt: number;
  requiresExplicitUserAcceptance: true;
  accepted: false;
  reviewNotice: string;
};

export type ReviewedStyleOptions = {
  id?: string;
  color?: string;
};

const noEvidence = (text: string) =>
  /^not stated in source\.?$/i.test(text.trim());

const reviewWeight = (weight: BlueprintWeight): string => {
  if (weight.provenance === "not-stated") return "No source weight was stated.";
  const label =
    weight.provenance === "suggested" ? "Source-suggested" : "Source-stated";
  return `${label} weight: ${weight.value}. It is not activated or normalized.`;
};

const reviewExcerpt = (excerpt: string): string =>
  noEvidence(excerpt)
    ? "No literal evidence was located."
    : `Evidence: “${excerpt}”`;

const proposalId = (sourceId: string, sourceVersion: number): string => {
  const slug = sourceId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
  return `proposal-${slug || "source"}-v${sourceVersion}`;
};

/**
 * Converts an unapproved blueprint into disabled review prose only. It does
 * not make a confluence gate, a scanner, an alert, or any broker action ready.
 */
export function blueprintToReviewedStyle(
  blueprint: LibraryBlueprint,
  name: string,
  options: ReviewedStyleOptions = {},
): ProposedStrategy {
  const checked = validateLibraryBlueprint(blueprint);
  const reviewedName = z.string().trim().min(1).max(150).parse(name);
  const id = z
    .string()
    .trim()
    .min(1)
    .max(100)
    .parse(options.id ?? proposalId(checked.sourceId, checked.sourceVersion));
  const color = z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .parse(options.color ?? "#94A3B8");

  const factors: Factor[] = [
    {
      id: "review-trigger",
      name: "Trigger — human review only",
      group: "Review proposal",
      weight: 0,
      enabled: false,
      description: `Candidate trigger: ${checked.trigger.text}\n${reviewExcerpt(checked.trigger.sourceExcerpt)}\nThis is review prose, not an active gate.`,
    },
    ...checked.conditions.map(
      (condition): Factor => ({
        id: `review-${condition.id}`.slice(0, 100),
        name: condition.name,
        group: "Review proposal",
        weight: 0,
        enabled: false,
        description: [
          `Candidate condition: ${condition.predicate}`,
          reviewWeight(condition.weight),
          `Data noted by source: ${condition.dataSource}.`,
          reviewExcerpt(condition.sourceExcerpt),
          `Automation assessment: ${condition.automation}; no scanner or broker action is activated.`,
        ].join("\n"),
      }),
    ),
  ];

  return {
    sourceId: checked.sourceId,
    sourceVersion: checked.sourceVersion,
    blueprintVersion: checked.version,
    createdAt: checked.createdAt,
    requiresExplicitUserAcceptance: true,
    accepted: false,
    reviewNotice:
      "Unapproved source-derived review proposal. Explicit user acceptance is required before any separate strategy configuration is created.",
    strategy: {
      id,
      name: reviewedName,
      description: [
        checked.summary,
        "Source-derived review proposal only. It does not activate a confluence gate, scanner, alert, or broker action.",
        `Source ${checked.sourceId}, version ${checked.sourceVersion}; re-review after source revision.`,
      ].join("\n\n"),
      color,
      kind: "style",
      setupFamily: "custom",
      factors,
      visible: false,
      version: 1,
      source: `Private library source ${checked.sourceId} v${checked.sourceVersion}.`,
    },
  };
}

/** Strict JSON Schema sent to the managed model; keep in sync with Zod above. */
const stringSchema = (maxLength: number) => ({
  type: "string",
  minLength: 1,
  maxLength,
});

const weightJsonSchema = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      properties: {
        value: { type: "number", minimum: 0, maximum: 100 },
        provenance: { const: "source-stated" },
      },
      required: ["value", "provenance"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        value: { type: "number", minimum: 0, maximum: 100 },
        provenance: { const: "suggested" },
      },
      required: ["value", "provenance"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        value: { type: "null" },
        provenance: { const: "not-stated" },
      },
      required: ["value", "provenance"],
    },
  ],
};

const predicateSpecJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: { const: "ema-close" },
    period: { type: "integer", minimum: 1, maximum: 500 },
    comparison: { enum: ["above", "below"] },
    bar: { const: "closed" },
  },
  required: ["kind", "period", "comparison", "bar"],
};

const conditionJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string", pattern: "^condition-[a-z0-9][a-z0-9-]{0,62}$" },
    name: stringSchema(180),
    predicate: stringSchema(1_200),
    weight: weightJsonSchema,
    dataSource: stringSchema(300),
    sourceExcerpt: stringSchema(600),
    automation: { enum: ["supported", "manual", "missing-data"] },
    predicateSpec: { anyOf: [predicateSpecJsonSchema, { type: "null" }] },
  },
  required: [
    "id",
    "name",
    "predicate",
    "weight",
    "dataSource",
    "sourceExcerpt",
    "automation",
    "predicateSpec",
  ],
};

/**
 * The extraction response excludes source/version/timestamp fields. The server
 * supplies those trusted values after Zod validation rather than asking a model
 * to echo them.
 */
export const libraryBlueprintAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: stringSchema(1_600),
    trigger: {
      type: "object",
      additionalProperties: false,
      properties: {
        text: stringSchema(1_200),
        sourceExcerpt: stringSchema(600),
      },
      required: ["text", "sourceExcerpt"],
    },
    conditions: { type: "array", maxItems: 24, items: conditionJsonSchema },
    indicators: {
      type: "array",
      maxItems: 30,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: stringSchema(160),
          parameters: { type: "array", maxItems: 20, items: stringSchema(160) },
        },
        required: ["name", "parameters"],
      },
    },
    markets: { type: "array", maxItems: 30, items: stringSchema(120) },
    timeframes: { type: "array", maxItems: 30, items: stringSchema(120) },
    entry: stringSchema(1_400),
    invalidation: stringSchema(1_400),
    targets: stringSchema(1_400),
    risk: stringSchema(1_400),
    requiredData: { type: "array", maxItems: 40, items: stringSchema(300) },
    ambiguities: { type: "array", maxItems: 40, items: stringSchema(700) },
  },
  required: [
    "summary",
    "trigger",
    "conditions",
    "indicators",
    "markets",
    "timeframes",
    "entry",
    "invalidation",
    "targets",
    "risk",
    "requiredData",
    "ambiguities",
  ],
} as const;
