import { z } from "zod";
import { symbol, timeframe } from "./validation";
export const quantSettingsSchema = z.object({
  lookback: z.number().int().min(10).max(400),
  entryZ: z.number().positive().max(10),
  exitZ: z.number().nonnegative().max(5),
  feeBps: z.number().nonnegative().max(1000),
  slippageBps: z.number().nonnegative().max(1000),
  holdingBars: z.number().int().min(1).max(100),
  startingEquity: z.number().positive().max(1e12),
  inventory: z.number().finite().min(-1e9).max(1e9),
  orderSize: z.number().positive().max(1e9),
  maxInventory: z.number().positive().max(1e9),
  validationMode: z.enum(["walk-forward","cpcv"]).optional(),
  embargoPct: z.number().min(0).max(.25).optional(),
  maxFolds: z.number().int().min(4).max(15).optional(),
  formationWindow: z.number().int().min(30).max(400).optional(),
  tradingWindow: z.number().int().min(1).max(400).optional(),
  hedgeMethod: z.enum(["rolling-ols","kalman"]).optional(),
});
const candle = z.object({
  time: z.number().positive().finite(),
  open: z.number().positive().finite(),
  high: z.number().positive().finite(),
  low: z.number().positive().finite(),
  close: z.number().positive().finite(),
  volume: z.number().nonnegative().finite(),
});
export const quantRequestSchema = z
  .object({
    family: z.enum(["pairs", "momentum", "making", "macro", "ml"]),
    symbols: z
      .array(symbol)
      .min(1)
      .max(8)
      .refine(
        (v) => new Set(v).size === v.length,
        "Duplicate instruments are not independent assets.",
      ),
    timeframe,
    bars: z.number().int().min(60).max(1800).default(900),
    settings: quantSettingsSchema,
    imports: z
      .array(
        z.object({
          symbol,
          timeframe,
          source: z.string().max(500),
          candles: z.array(candle).min(10).max(5000),
          fetchedAt: z.number().finite(),
          provenance: z.enum(["provider", "user-import"]).optional(),
          adjustedTotalReturn: z.boolean().optional(),
        }),
      )
      .max(8)
      .optional(),
  })
  .superRefine((v, ctx) => {
    const min = v.family === "pairs" ? 30 : v.family === "macro" ? 20 : 10;
    const max =
      v.family === "ml"
        ? 60
        : v.family === "momentum" || v.family === "macro"
          ? 252
          : 400;
    if (v.settings.lookback < min || v.settings.lookback > max)
      ctx.addIssue({
        code: "custom",
        path: ["settings", "lookback"],
        message: `${v.family} lookback must be between ${min} and ${max} bars.`,
      });
    if (v.family === "ml" && v.settings.holdingBars > 20)
      ctx.addIssue({
        code: "custom",
        path: ["settings", "holdingBars"],
        message: "Classifier horizon is limited to 20 bars.",
      });
    if (
      v.family === "making" &&
      Math.abs(v.settings.inventory) > v.settings.maxInventory
    )
      ctx.addIssue({
        code: "custom",
        path: ["settings", "inventory"],
        message:
          "Starting inventory cannot exceed the maximum absolute inventory.",
      });
    if (v.family === "pairs" && v.symbols.length !== 2)
      ctx.addIssue({
        code: "custom",
        path: ["symbols"],
        message: "Pairs research requires exactly two selected instruments.",
      });
    if ((v.family === "making" || v.family === "ml") && v.symbols.length !== 1)
      ctx.addIssue({
        code: "custom",
        path: ["symbols"],
        message: "This research model uses exactly one selected product.",
      });
    if (
      (v.family === "momentum" || v.family === "macro") &&
      v.symbols.length < 2
    )
      ctx.addIssue({
        code: "custom",
        path: ["symbols"],
        message: "Multi-asset research requires at least two instruments.",
      });
    if (v.family === "macro" && !["1d", "1w"].includes(v.timeframe))
      ctx.addIssue({
        code: "custom",
        path: ["timeframe"],
        message: "Slow trend research requires daily or weekly data.",
      });
    if (v.settings.lookback > v.bars)
      ctx.addIssue({
        code: "custom",
        path: ["settings", "lookback"],
        message: "Lookback must not exceed the requested bar count.",
      });
    if (v.settings.exitZ >= v.settings.entryZ)
      ctx.addIssue({
        code: "custom",
        path: ["settings", "exitZ"],
        message: "Exit z-score must be less than entry z-score.",
      });
  });
export type QuantResearchRequest = z.infer<typeof quantRequestSchema>;
