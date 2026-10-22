import type {
  SessionStrategyConfig,
  SessionStrategyContext,
} from "./session-strategy-model";
import type { Direction } from "./setup-model";
export function sessionPaperGeometry(
  config: SessionStrategyConfig,
  context: SessionStrategyContext,
  side: Direction,
  entry: number,
  expectedStop: number,
) {
  if (
    !config.confirmed ||
    config.family !== context.family ||
    context.strategyId.length === 0 ||
    !Number.isFinite(entry) ||
    entry <= 0 ||
    !Number.isFinite(expectedStop) ||
    expectedStop <= 0
  )
    throw new Error("Current approved session source geometry is unavailable.");
  const sign = side === "long" ? 1 : -1;
  if (sign * (entry - expectedStop) <= 0)
    throw new Error(
      "The source stop is no longer beyond the current paper entry.",
    );
  const riskDistance = Math.abs(entry - expectedStop);
  let target: number;
  if (
    config.family === "london-breakout" ||
    config.family === "initial-balance"
  ) {
    const range = context.range;
    if (
      !range ||
      !Number.isFinite(range.high) ||
      !Number.isFinite(range.low) ||
      range.high <= range.low
    )
      throw new Error("The complete source session range is missing.");
    const boundary = side === "long" ? range.high : range.low;
    if (sign * (entry - boundary) <= 0)
      throw new Error(
        "The current paper price is no longer outside the source range.",
      );
    let stop = range.midpoint;
    if (config.stopMode === "opposite-boundary")
      stop = side === "long" ? range.low : range.high;
    if (config.stopMode === "inside-boundary") {
      if (!config.priceTick || !Number.isFinite(config.priceTick))
        throw new Error(
          "The inside-boundary stop requires an explicitly chosen actual price tick.",
        );
      stop = boundary - sign * config.priceTick * config.insideBoundaryTicks;
      if (stop <= range.low || stop >= range.high)
        throw new Error(
          "The selected inside-boundary offset is outside this source range.",
        );
    }
    if (Math.abs(stop - expectedStop) > 1e-7)
      throw new Error(
        "The submitted stop differs from the current source stop.",
      );
    const height = range.high - range.low;
    target =
      config.family === "initial-balance"
        ? boundary + sign * height
        : config.targetMode === "range-height-from-entry"
          ? entry + sign * height
          : entry +
            sign * riskDistance * (config.targetMode === "1.5r" ? 1.5 : 2);
  } else {
    if (!context.pdc || sign * (entry - context.pdc.price) <= 0)
      throw new Error(
        "The current paper price is no longer on the crossed side of the declared PDC.",
      );
    if (config.targetMode === "owner-key-levels") {
      const value =
        side === "long" ? config.longTargetPrice : config.shortTargetPrice;
      if (value === undefined)
        throw new Error("Choose the explicit owner target for this direction.");
      target = value;
    } else if (config.targetMode === "previous-day-extremes") {
      const previousDay = context.previousDay;
      const currentQuote = context.quoteEvidence?.current;
      if (
        !previousDay ||
        !Number.isFinite(previousDay.high) ||
        !Number.isFinite(previousDay.low) ||
        previousDay.high <= 0 ||
        previousDay.low <= 0 ||
        previousDay.high <= previousDay.low ||
        !Number.isSafeInteger(previousDay.closeAt) ||
        previousDay.closeAt <= 86_400 ||
        previousDay.closeAt >= 10_000_000_000 ||
        previousDay.closeAt !== context.pdc.closeAt ||
        previousDay.date !==
          new Date((previousDay.closeAt - 86_400) * 1_000)
            .toISOString()
            .slice(0, 10) ||
        !currentQuote ||
        previousDay.closeAt > currentQuote.timestamp
      )
        throw new Error(
          "The verified previous-day high/low source target is unavailable.",
        );

      const identityDeclared =
        context.pdc.sourceIdentity !== undefined ||
        previousDay.sourceIdentity !== undefined;
      const sameSource = identityDeclared
        ? Boolean(
            context.pdc.sourceIdentity &&
            previousDay.sourceIdentity &&
            currentQuote &&
            context.pdc.sourceIdentity === previousDay.sourceIdentity &&
            currentQuote.sourceIdentity === context.pdc.sourceIdentity,
          )
        : Boolean(
            currentQuote &&
            currentQuote.sourceIdentity === undefined &&
            context.pdc.source === previousDay.source &&
            currentQuote.source === context.pdc.source,
          );
      if (!sameSource)
        throw new Error(
          "The current PDC quote and verified previous-day extremes must have one exact source identity.",
        );
      target = side === "long" ? previousDay.high : previousDay.low;
    } else {
      if (!context.range || config.premarketStartMinute === undefined)
        throw new Error(
          "The explicitly declared complete premarket target range is unavailable.",
        );
      target = side === "long" ? context.range.high : context.range.low;
    }
  }
  if (!Number.isFinite(target) || target <= 0 || sign * (target - entry) <= 0)
    throw new Error(
      "The source target is at/behind the current price; no late automatic paper entry is allowed.",
    );
  return {
    stop: expectedStop,
    target,
    riskDistance,
    rr: Math.abs(target - entry) / riskDistance,
  };
}
