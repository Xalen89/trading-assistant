import type { AIPriceForecast } from "./ai-forecast";
import type { Candle, Timeframe } from "./model";
export function usableForecast(
  value: AIPriceForecast | undefined,
  market: string,
  timeframe: Timeframe,
  last: Candle | undefined,
  now = Date.now(),
) {
  if (!value || !last)
    return { valid: false, reason: "No AI forecast generated." };
  if (
    value.kind !== "ai-hypothetical" ||
    value.market !== market ||
    value.timeframe !== timeframe
  )
    return {
      valid: false,
      reason: "AI forecast source does not match this chart.",
    };
  if (value.generatedAt > now + 1000 || value.expiresAt <= now)
    return {
      valid: false,
      reason: "AI forecast expired; regenerate with current context.",
    };
  if (last.time !== value.anchorAt)
    return {
      valid: false,
      reason:
        "A new/source-mismatched bar replaced the AI forecast anchor; regenerate.",
    };
  if (
    value.candles.length !== 12 ||
    value.candles.some(
      (c) =>
        c.time <= last.time ||
        ![c.open, c.high, c.low, c.close].every(Number.isFinite) ||
        c.low <= 0 ||
        c.low > Math.min(c.open, c.close) ||
        c.high < Math.max(c.open, c.close),
    )
  )
    return { valid: false, reason: "AI forecast display data is invalid." };
  return {
    valid: true,
    reason:
      "AI-generated hypothetical scenario—not validated market prices or a probability.",
  };
}
