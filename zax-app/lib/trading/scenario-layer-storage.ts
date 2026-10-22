import { z } from "zod";
import {
  SCENARIO_TIMEFRAMES,
  type ScenarioLayer,
} from "./scenario-layer-types";

const timeframe = z.enum(["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"]);
const stamp = z.number().int().positive().max(9_999_999_999);
const timeMs = z.number().finite().positive().max(10_000_000_000_000);
const identifier = z.string().min(1).max(160);
const candle = z
  .object({
    time: stamp,
    open: z.number().positive().finite(),
    high: z.number().positive().finite(),
    low: z.number().positive().finite(),
    close: z.number().positive().finite(),
    volume: z.number().nonnegative().finite(),
  })
  .strict()
  .refine(
    (c) =>
      c.low <= Math.min(c.open, c.close) && c.high >= Math.max(c.open, c.close),
    "Invalid scenario OHLC",
  );
const historical = z
  .object({
    id: identifier,
    anchorAt: stamp,
    sourceAt: stamp,
    source: z.string().max(500),
    strategyIds: z
      .array(identifier)
      .min(1)
      .max(3)
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Duplicate source strategy",
      ),
    strategyVersions: z.array(z.number().int().positive()).min(1).max(3),
    combination: z.enum(["all", "any"]),
    candles: z.array(candle).min(1).max(100),
    side: z.enum(["long", "short"]).optional(),
    distance: z.number().finite().nonnegative(),
    explanation: z.string().max(6000),
    referenceId: identifier.optional(),
    basis: z.enum(["strategy-matched", "context-replay"]).optional(),
    anchorPrice: z.number().positive().finite(),
    direction: z.enum(["up", "down", "flat"]).optional(),
    queryBars: z.number().int().positive().max(3000).optional(),
    sourceEndAt: stamp.optional(),
  })
  .strict()
  .refine(
    (s) =>
      s.strategyIds.length === s.strategyVersions.length &&
      (s.sourceEndAt === undefined ||
        s.sourceEndAt === s.candles.at(-1)?.time) &&
      s.candles.every(
        (c, i) =>
          c.time > s.sourceAt &&
          c.time < s.anchorAt &&
          (!i || c.time > s.candles[i - 1].time),
      ),
    "Historical source must be actual past continuation",
  );
const forecast = z
  .object({
    id: identifier,
    kind: z.literal("ai-hypothetical"),
    market: z.string().min(1).max(100),
    timeframe,
    model: z.string().min(1).max(100),
    generatedAt: timeMs,
    expiresAt: timeMs,
    anchorAt: stamp,
    anchorPrice: z.number().positive().finite(),
    sourceLastClosedAt: stamp,
    source: z.string().max(500),
    atr: z.number().positive().finite(),
    direction: z.enum(["up", "down", "range"]),
    thesis: z.string().min(1).max(1200),
    assumptions: z.array(z.string().min(1).max(300)).min(1).max(6),
    invalidation: z.string().min(1).max(600),
    candles: z.array(candle).length(12),
    probability: z.null(),
    volumeMeaning: z.literal("display-placeholder-not-forecast"),
    strategyId: identifier.optional(),
    strategyVersion: z.number().int().positive().optional(),
    contextMode: z.enum(["current", "last-available"]).optional(),
    requestedContextMode: z
      .enum(["auto", "current", "last-available"])
      .optional(),
    aiQuality: z.enum(["efficient", "deep"]).optional(),
    generationNotice: z.string().max(500).optional(),
    contextResolutionReason: z.string().max(2000).optional(),
    sourceFreshness: z
      .object({
        status: z.enum(["fresh", "stale"]),
        reason: z.string().max(1000).optional(),
        closedAt: stamp,
        ageSeconds: z.number().finite().nonnegative(),
        fetchedAt: timeMs.optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (f) =>
      f.expiresAt > f.generatedAt &&
      f.sourceLastClosedAt <= f.anchorAt &&
      f.candles.every(
        (c, i) => c.time > f.anchorAt && (!i || c.time > f.candles[i - 1].time),
      ),
    "Invalid AI source/expiry/time sequence",
  );
const base = {
  id: identifier,
  label: z.string().min(1).max(100),
  market: z.string().min(1).max(100),
  sourceTimeframe: timeframe,
  displayTimeframes: z
    .array(timeframe)
    .min(1)
    .max(SCENARIO_TIMEFRAMES.length)
    .refine((a) => new Set(a).size === a.length, "Duplicate display timeframe"),
  enabled: z.boolean(),
  style: z.enum(["line", "candles", "both"]),
  anchorMode: z.enum(["follow", "fixed"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  createdAt: timeMs,
};
export const scenarioLayerSchema = z
  .discriminatedUnion("kind", [
    z.object({ ...base, kind: z.literal("ai"), forecast }).strict(),
    z
      .object({ ...base, kind: z.literal("historical"), scenario: historical })
      .strict(),
  ])
  .refine(
    (l) =>
      l.kind !== "ai" ||
      (l.market === l.forecast.market &&
        l.sourceTimeframe === l.forecast.timeframe),
    "AI source identity mismatch",
  );
export const scenarioLayersSchema = z
  .array(scenarioLayerSchema)
  .max(12)
  .refine(
    (a) => new Set(a.map((l) => l.id)).size === a.length,
    "Duplicate scenario layer ID",
  );

/** Client-safe migration boundary: never pass malformed persisted preferences to chart UI. */
export function sanitizeScenarioLayers(value: unknown): {
  layers: ScenarioLayer[];
  invalidCount: number;
} {
  if (value === undefined) return { layers: [], invalidCount: 0 };
  if (!Array.isArray(value)) return { layers: [], invalidCount: 1 };
  const layers: ScenarioLayer[] = [];
  const ids = new Set<string>();
  let invalidCount = 0;
  for (const item of value) {
    const parsed = scenarioLayerSchema.safeParse(item);
    if (!parsed.success || ids.has(parsed.data.id) || layers.length >= 12) {
      invalidCount++;
      continue;
    }
    ids.add(parsed.data.id);
    layers.push(parsed.data as ScenarioLayer);
  }
  return { layers, invalidCount };
}
