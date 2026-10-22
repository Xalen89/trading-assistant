import { scenarioLayersSchema } from "./scenario-layer-schema";
import { orbConfigSchema } from "../../lib/trading/orb-model";
import { orbAutoPaperSettingsSchema } from "../../lib/trading/orb-auto-types";
import { sessionStrategyConfigSchema } from "../../lib/trading/session-strategy-model";
import { sessionAutoSettingsSchema } from "../../lib/trading/session-auto-types";
import {
  validateNoCodeQuantRule,
  type NoCodeQuantRule,
} from "../../lib/trading/no-code-quant";
import { tradeScreenshotReviewSchema } from "../../lib/trading/trade-screenshot-types";
import { libraryBlueprintSchema } from "../../lib/trading/library-blueprint-types";
import { z } from "zod";
import {
  Workspace,
  Trade,
  Pattern,
  Strategy,
  MARKETS,
} from "../../lib/trading/model";
import { validatePlan } from "../../lib/trading/engine";
import { validateConfluenceConfig } from "../../lib/trading/confluence-contract";
import type { ConfluenceStrategyContract } from "../../lib/trading/confluence-contract";
import type { ConfluenceRuleConfig } from "../../lib/trading/confluence-runtime";
import type { TradeFeatureSnapshot } from "../../lib/trading/trade-features";
const id = z.string().min(1).max(100),
  note = z.string().max(10000),
  at = z.number().finite().nonnegative();
export const timeframe = z.enum([
  "1m",
  "5m",
  "15m",
  "30m",
  "1h",
  "4h",
  "1d",
  "1w",
]);
export const symbol = z
  .string()
  .refine(
    (v) => MARKETS.some((m) => m.id === v) || /^TL:[0-9]{1,18}$/.test(v),
    "Unknown instrument",
  );
export const confluenceRuleSchema: z.ZodType<ConfluenceRuleConfig> = z.object({
  contract: z.custom<ConfluenceStrategyContract>(
    (v) => validateConfluenceConfig(v).valid,
  ),
  binding: z.object({
    triggerStepId: id,
    side: z.enum(["long", "short"]).optional(),
    conditions: z
      .array(z.object({ conditionId: id, stepId: id }))
      .min(1)
      .max(100),
  }),
});
const cfSource = z.object({
  id,
  name: z.string().min(1).max(1000),
  required: z.boolean(),
  freshness: z.object({ maxAgeMs: z.number().positive().finite() }),
});
const cfObserved = {
  sourceId: id.nullable(),
  providerStatus: z
    .enum(["ready", "pending", "stale", "disconnected", "future"])
    .nullable(),
  observedAt: at.nullable(),
  lastClosedBarAt: at.nullable(),
  bar: z.enum(["t-1", "t", "future", "unknown"]).nullable(),
  status: z.enum(["met", "not-met", "pending"]),
  reasons: z.array(note).max(100),
};
const cfSnapshot = z.object({
  timestampUnit: z.literal("unix-epoch-milliseconds"),
  evaluatedAt: at.nullable(),
  decisionBarOpenAt: at.nullable(),
  deterministicScore: z.number().min(0).max(100).nullable(),
  threshold: z.number().min(0).max(100).nullable(),
  gateMet: z.boolean(),
  strategyEntryEligible: z.boolean(),
  version: z
    .object({
      contractVersion: z.literal(1),
      strategyId: id,
      strategyVersion: z.number().int().positive(),
      configVersion: z.number().int().positive(),
    })
    .nullable(),
  approval: z
    .object({
      status: z.enum(["draft", "approved", "retired"]),
      approvedAt: at.nullable(),
      approvedBy: id.nullable(),
    })
    .nullable(),
  trigger: z
    .object({
      ...cfObserved,
      triggerId: id,
      name: note,
      predicate: note,
      source: cfSource,
    })
    .nullable(),
  checklist: z
    .array(
      z.object({
        ...cfObserved,
        conditionId: id,
        name: note,
        predicate: note,
        source: cfSource,
        enabled: z.boolean(),
        weight: z.number().nonnegative().finite(),
      }),
    )
    .max(100),
});
const featureSnapshot: z.ZodType<TradeFeatureSnapshot> = z.object({
  version: z.literal(1),
  asOf: at,
  source: note,
  values: z
    .record(z.string().max(100), z.number().finite().nullable())
    .refine((v) => Object.keys(v).length <= 100, "Too many features"),
  regime: z.enum(["trending", "choppy", "unknown"]),
  volatilityRegime: z.enum(["high", "low", "unknown"]),
  missing: z.array(note).max(100),
});
export const factorSchema = z.object({
  id,
  name: z.string().max(150),
  group: z.string().max(100),
  weight: z.number().min(0).max(100),
  enabled: z.boolean(),
  description: note,
  page: z.number().int().min(1).max(37).optional(),
});
export const strategySchema: z.ZodType<Strategy> = z.object({
  id,
  name: z.string().min(1).max(150),
  description: note,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  kind: z.enum(["reference", "strategy", "style"]),
  setupFamily: z
    .enum([
      "core-sequence",
      "silver-bullet",
      "ob-retest",
      "stdv",
      "vwap-stdv",
      "trend-following",
      "breakout-momentum",
      "mean-reversion",
      "scalping",
      "sma-crossover",
      "macd-momentum",
      "donchian-breakout",
      "orb",
      "london-breakout",
      "initial-balance",
      "pdc-continuation",
      "custom",
    ])
    .optional(),
  confluence: confluenceRuleSchema.optional(),
  quantRule: z
    .custom<NoCodeQuantRule>(
      (v) => validateNoCodeQuantRule(v).valid,
      "Invalid bounded no-code research draft",
    )
    .optional(),
  orbConfig: z
    .custom<
      import("../../lib/trading/orb-model").OrbConfig
    >((value) => orbConfigSchema.safeParse(value).success, "Invalid bounded ORB execution configuration")
    .optional(),
  sessionConfig: sessionStrategyConfigSchema.optional(),
  factors: z.array(factorSchema).max(100),
  visible: z.boolean(),
  version: z.number().int().min(1),
  source: note.optional(),
  archived: z.boolean().optional(),
  history: z
    .array(
      z.object({
        version: z.number().int().positive(),
        name: z.string().min(1).max(150),
        description: note,
        factors: z.array(factorSchema).max(100),
        orbConfig: orbConfigSchema.optional(),
        sessionConfig: sessionStrategyConfigSchema.optional(),
        at,
      }),
    )
    .max(20)
    .optional(),
});
export const patternSchema: z.ZodType<Pattern> = z.object({
  id,
  name: z.string().min(1).max(150),
  tags: z.array(z.string().max(100)).max(30),
  kind: z.enum(["pattern", "style"]),
  strategyId: id,
  market: symbol,
  timeframe,
  notes: note,
  filename: z.string().max(256).optional(),
  mime: z.string().max(100).optional(),
  fileKey: z.string().max(512).optional(),
  imageUri: z.string().max(1000).optional(),
  status: z.enum(["uploaded", "analyzing", "review", "ready", "failed"]),
  description: note.optional(),
  rules: z.array(note).max(50).optional(),
  createdAt: at,
  version: z.number().int().min(1),
  feedback: z
    .array(z.object({ label: z.string().max(150), note, at }))
    .max(100),
  tradeReview: tradeScreenshotReviewSchema
    .refine(
      (v) => JSON.stringify(v).length <= 45000,
      "Screenshot review exceeds source limit",
    )
    .optional(),
  blueprint: libraryBlueprintSchema
    .refine(
      (v) => JSON.stringify(v).length <= 60000,
      "Blueprint exceeds source-review limit",
    )
    .optional(),
  visualIndex: z
    .object({
      status: z.enum(["indexed", "failed", "not-applicable"]),
      descriptorVersion: z.string().max(100),
      sourceHash: z.string().max(64).optional(),
      indexedAt: at.optional(),
      message: note.optional(),
    })
    .optional(),
});
export const tradeSchema: z.ZodType<Trade> = z
  .object({
    id,
    market: symbol,
    valuationSymbol: z.enum(["USDJPY", "USDCAD"]).optional(),
    side: z.enum(["long", "short"]),
    status: z.enum(["pending", "open", "closed", "cancelled"]),
    entry: z.number(),
    stop: z.number(),
    target: z.number(),
    quantity: z.number(),
    pointValue: z.number(),
    strategyId: id,
    strategyName: z.string().max(150),
    strategyVersion: z.number().int().positive(),
    factors: z.array(z.string().max(150)).max(100),
    journal: z.record(z.string().max(100), note),
    createdAt: at,
    openedAt: at.optional(),
    closedAt: at.optional(),
    cancelledAt: at.optional(),
    exit: z.number().positive().finite().optional(),
    review: note.optional(),
    aiReview: note.optional(),
    version: z.number().int().positive().optional(),
    orderType: z.enum(["market", "limit"]).optional(),
    autoManage: z.boolean().optional(),
    initialRisk: z.number().positive().finite().optional(),
    initialQuantity: z.number().positive().finite().optional(),
    originalStop: z.number().positive().finite().optional(),
    originalTarget: z.number().positive().finite().optional(),
    partialAt: z.number().positive().finite().optional(),
    partialTaken: z.boolean().optional(),
    realizedPnl: z.number().finite().optional(),
    strategyIds: z.array(id).max(3).optional(),
    setupId: id.optional(),
    timeframe: timeframe.optional(),
    strategyVersions: z.array(z.number().int().positive()).max(3).optional(),
    combination: z.enum(["all", "any"]).optional(),
    snapshotPhase: z.enum(["entry", "placement", "unknown"]).optional(),
    gatePendingReason: note.optional(),
    excursion: z
      .object({
        maeR: z.number().nonnegative().finite(),
        mfeR: z.number().nonnegative().finite(),
        observedAt: at,
        samples: z.number().int().nonnegative(),
        method: z.literal("observed-quotes"),
        sampling: z.literal("foreground-sampled-not-full-tick-path").optional(),
      })
      .optional(),
    entryMode: z.enum(["practice", "strategy"]).optional(),
    confluenceSnapshots: z.array(cfSnapshot).max(3).optional(),
    entryFeatures: featureSnapshot.optional(),
    events: z
      .array(
        z.object({
          id,
          kind: z.enum([
            "created",
            "filled",
            "partial",
            "breakeven",
            "bracket-edit",
            "closed",
            "cancelled",
            "review",
          ]),
          at,
          price: z.number().positive().finite().optional(),
          quantity: z.number().positive().finite().optional(),
          pnl: z.number().finite().optional(),
          note,
        }),
      )
      .max(100)
      .optional(),
  })
  .refine(
    (t) =>
      t.status !== "pending" &&
      t.initialRisk &&
      (t.side === "long" ? t.stop < t.target : t.stop > t.target)
        ? [t.entry, t.stop, t.target, t.quantity, t.pointValue].every(
            (v) => v > 0 && Number.isFinite(v),
          ) && (t.side === "long" ? t.target > t.entry : t.target < t.entry)
        : !validatePlan(t),
    "Invalid paper-trade risk geometry",
  )
  .refine(
    (t) => t.status !== "closed" || t.exit !== undefined,
    "Closed paper trades require an exit price",
  );
export const matchSchema = z.object({
  id,
  patternId: id.optional(),
  reference: z
    .object({
      id,
      name: z.string().max(150),
      version: z.number().int().positive(),
      description: note,
      rules: z.array(note).max(50),
      filename: z.string().max(256).optional(),
    })
    .optional(),
  name: z.string().max(150),
  strategyId: id,
  strategyVersion: z.number().int().positive(),
  market: symbol,
  timeframe,
  evidence: z.array(note).max(50),
  missing: z.array(note).max(50),
  confidence: z.number().min(0).max(100).optional(),
  method: z.enum(["ai-reference", "opencv"]).optional(),
  status: z.enum(["candidate", "confirmed", "rejected"]),
  createdAt: at,
  startIndex: z.number().int().nonnegative().optional(),
  endIndex: z.number().int().nonnegative().optional(),
});
export const eventSchema = z.object({
  id,
  ruleId: id,
  market: symbol,
  timeframe,
  strategyId: id,
  strategyVersion: z.number().int().positive().optional(),
  evidence: z.array(note).max(30).optional(),
  providerTimestamp: at.optional(),
  title: note,
  body: note,
  createdAt: at,
  read: z.boolean(),
  price: z.number().positive().finite(),
  source: note,
  delivery: z.string().max(100).optional(),
});
export const workspaceSchema: z.ZodType<Workspace> = z
  .object({
    schemaVersion: z.literal(1),
    strategies: z
      .array(strategySchema)
      .min(1)
      .max(600)
      .refine(
        (v) => v.filter((s) => !s.archived).length <= 100,
        "Active strategy limit is 100",
      )
      .refine(
        (v) => v.filter((s) => s.archived).length <= 500,
        "Archive strategy limit is 500",
      ),
    patterns: z.array(patternSchema).max(500),
    matches: z.array(matchSchema).max(1000),
    trades: z.array(tradeSchema).max(2000),
    alerts: z
      .array(
        z.object({
          id,
          name: z.string().min(1).max(150),
          market: symbol,
          timeframe,
          strategyId: id,
          kind: z.enum([
            "above",
            "below",
            "fvg",
            "setup",
            "scenario-change",
            "scenario-direction",
            "confluence",
            "below-gate",
          ]),
          minimumPoints: z.number().min(0).max(100).optional(),
          minimumConditions: z.number().int().min(1).max(100).optional(),
          combinedStrategyIds: z.array(id).max(3).optional(),
          price: z.number().finite().nonnegative(),
          enabled: z.boolean(),
          cooldownMinutes: z.number().int().min(1).max(10080),
          createdAt: at,
          lastTriggeredAt: at.optional(),
          lastEvaluatedAt: at.optional(),
          deferredCount: z.number().int().nonnegative().optional(),
          priority: z.enum(["low", "normal", "high"]).optional(),
        }),
      )
      .max(100),
    events: z.array(eventSchema).max(1000),
    levels: z
      .array(
        z.object({
          id,
          strategyId: id,
          market: symbol,
          name: z.string().max(100),
          price: z.number().positive().finite(),
          color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        }),
      )
      .max(500),
    activeStrategyId: id,
    market: symbol,
    timeframe,
    favorites: z.array(symbol).max(100),
    confirmations: z.record(z.string().max(200), z.boolean()),
    overlays: z.record(z.string().max(100), z.boolean()),
    settings: z.object({
      timezone: z
        .string()
        .max(100)
        .refine((v) => {
          try {
            new Intl.DateTimeFormat("en-US", { timeZone: v });
            return true;
          } catch {
            return false;
          }
        }, "Invalid IANA timezone"),
      weeklyBias: z.enum(["Bullish", "Bearish", "Neutral"]),
      sampleMode: z.boolean(),
      futureOverlay: z.boolean(),
      adaptation: z.boolean(),
      dailyDrawdownLimitPct: z.number().positive().max(100).optional(),
      analysisStrategyIds: z.array(id).max(3).optional(),
      combination: z.enum(["all", "any"]).optional(),
      scenarioStyle: z.enum(["line", "candles", "both"]).optional(),
      scenarioLayers: scenarioLayersSchema.optional(),
      paperRiskPct: z
        .union([z.literal(0), z.literal(0.5), z.literal(1), z.literal(2)])
        .optional(),
      autoPaperManage: z.boolean().optional(),
      orbAutoPaper: orbAutoPaperSettingsSchema.optional(),
      sessionAutoPaper: sessionAutoSettingsSchema.optional(),
      cooldownMinutes: z.number().int().min(1).max(1440).optional(),
      maxTradesPerDay: z.number().int().min(1).max(100).optional(),
      enforceCooldown: z.boolean().optional(),
      enforceOvertrading: z.boolean().optional(),
      enforceRiskEscalation: z.boolean().optional(),
      enforceLossStreak: z.boolean().optional(),
      guardChangeReason: z.string().max(1000).optional(),
      autoCloudSave: z.boolean().optional(),
      hideValuesOnBackground: z.boolean().optional(),
      aiQuality: z.enum(["efficient", "deep"]).optional(),
      aiRateLimits: z
        .object({
          coach: z.number().int().min(1).max(60).optional(),
          forecast: z.number().int().min(1).max(60).optional(),
          "source-analysis": z.number().int().min(1).max(60).optional(),
        })
        .optional(),
      notificationPreferences: z
        .record(
          z.string().max(100),
          z.object({ sound: z.boolean(), badge: z.boolean() }),
        )
        .refine(
          (v) => Object.keys(v).length <= 16,
          "Too many delivery preference types",
        )
        .optional(),
      clockTimezones: z
        .array(
          z
            .string()
            .max(100)
            .refine((v) => {
              try {
                new Intl.DateTimeFormat("en-US", { timeZone: v });
                return true;
              } catch {
                return false;
              }
            }, "Invalid IANA timezone"),
        )
        .length(3)
        .optional(),
      chartSessions: z
        .object({
          enabled: z.boolean(),
          sessions: z
            .array(z.enum(["asia", "london", "new-york", "sydney"]))
            .max(4)
            .refine(
              (ids) => new Set(ids).size === ids.length,
              "Duplicate session selection",
            ),
        })
        .optional(),
    }),
    paperStartingBalance: z.number().positive().finite(),
  })
  .refine(
    (w) => w.strategies.some((s) => s.id === w.activeStrategyId),
    "Active strategy must exist",
  )
  .refine(
    (w) => new Set(w.strategies.map((s) => s.id)).size === w.strategies.length,
    "Duplicate strategy IDs",
  )
  .refine((w) => JSON.stringify(w).length < 2000000, "Workspace too large");
export const uploadSchema = z.object({
  name: z.string().min(1).max(150),
  kind: z.enum(["pattern", "style"]),
  strategyId: id,
  market: symbol,
  timeframe,
  notes: note,
  filename: z.string().min(1).max(256),
  mime: z.string().max(100),
  base64: z
    .string()
    .min(1)
    .max(36 * 1024 * 1024),
});
