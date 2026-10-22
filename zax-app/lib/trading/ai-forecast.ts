import { z } from "zod";
import type { Candle, Timeframe } from "./model";
import { SECONDS } from "./engine";

export const forecastDraftSchema = z
  .object({
    direction: z.enum(["up", "down", "range"]),
    thesis: z.string().min(1).max(1200),
    assumptions: z.array(z.string().min(1).max(300)).min(1).max(6),
    invalidation: z.string().min(1).max(600),
    steps: z
      .array(
        z
          .object({
            closeAtr: z.number().min(-4).max(4),
            upperWickAtr: z.number().min(0).max(1),
            lowerWickAtr: z.number().min(0).max(1),
          })
          .strict(),
      )
      .length(12),
  })
  .strict();
export type ForecastDraft = z.infer<typeof forecastDraftSchema>;
export class ForecastDirectionMismatchError extends Error {
  constructor() {
    super("AI direction does not agree with its hypothetical path.");
    this.name = "ForecastDirectionMismatchError";
  }
}
export type AIPriceForecast = {
  id: string;
  kind: "ai-hypothetical";
  market: string;
  timeframe: Timeframe;
  model: string;
  generatedAt: number;
  expiresAt: number;
  anchorAt: number;
  anchorPrice: number;
  sourceLastClosedAt: number;
  source: string;
  atr: number;
  direction: "up" | "down" | "range";
  thesis: string;
  assumptions: string[];
  invalidation: string;
  candles: Candle[];
  probability: null;
  volumeMeaning: "display-placeholder-not-forecast";
  strategyId?: string;
  strategyVersion?: number;
  contextMode?: "current" | "last-available";
  requestedContextMode?: "auto" | "current" | "last-available";
  aiQuality?: import("./ai-quality").AIQuality;
  generationNotice?: string;
  contextResolutionReason?: string;
  sourceFreshness?: {
    status: "fresh" | "stale";
    reason?: string;
    closedAt: number;
    ageSeconds: number;
    fetchedAt?: number;
  };
};
export const forecastDraftJsonSchema = z.toJSONSchema(forecastDraftSchema);

/** Actual closed OHLC alone determines volatility. Forecast steps NEVER enter this function. */
export function forecastATR(closed: Candle[], period = 14) {
  if (closed.length < period + 1)
    throw new Error(
      "At least15 actual completed bars are required for volatility context.",
    );
  const values = closed.slice(-period).map((c, i) => {
    const prev = closed[closed.length - period + i - 1];
    return Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close),
    );
  });
  const atr = values.reduce((sum, n) => sum + n, 0) / period;
  if (!Number.isFinite(atr) || atr <= 0)
    throw new Error("Actual source volatility is unavailable.");
  return atr;
}

/** Generated display OHLC is deliberately separate from candles used in any analysis or ledger. */
export function materializeForecast(
  draft: ForecastDraft,
  input: Omit<
    AIPriceForecast,
    | "kind"
    | "direction"
    | "thesis"
    | "assumptions"
    | "invalidation"
    | "candles"
    | "probability"
    | "volumeMeaning"
  >,
): AIPriceForecast {
  const checked = forecastDraftSchema.parse(draft);
  if (
    !Number.isFinite(input.anchorPrice) ||
    input.anchorPrice <= 0 ||
    !Number.isFinite(input.atr) ||
    input.atr <= 0 ||
    !Number.isInteger(input.anchorAt) ||
    input.anchorAt <= 0
  )
    throw new Error("Invalid actual forecast anchor.");
  let open = input.anchorPrice;
  const candles = checked.steps.map((step, index) => {
    const close = input.anchorPrice + step.closeAtr * input.atr,
      high = Math.max(open, close) + step.upperWickAtr * input.atr,
      low = Math.min(open, close) - step.lowerWickAtr * input.atr;
    if (low <= 0 || ![open, high, low, close].every(Number.isFinite))
      throw new Error(
        "AI hypothetical price path is outside valid display bounds.",
      );
    const candle = {
      time: input.anchorAt + SECONDS[input.timeframe] * (index + 1),
      open,
      high,
      low,
      close,
      volume: 0,
    };
    open = close;
    return candle;
  });
  const finalOffset = checked.steps.at(-1)!.closeAtr;
  if (
    (checked.direction === "up" && finalOffset <= 0) ||
    (checked.direction === "down" && finalOffset >= 0) ||
    (checked.direction === "range" && Math.abs(finalOffset) > 1)
  )
    throw new ForecastDirectionMismatchError();
  return {
    ...input,
    kind: "ai-hypothetical",
    direction: checked.direction,
    thesis: checked.thesis,
    assumptions: checked.assumptions,
    invalidation: checked.invalidation,
    candles,
    probability: null,
    volumeMeaning: "display-placeholder-not-forecast",
  };
}

export { usableForecast } from "./forecast-display";
