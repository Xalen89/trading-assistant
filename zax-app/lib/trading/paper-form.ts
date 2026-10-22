import { tradeMetrics } from "./engine";
import type { Market } from "./model";
import { targetAtR } from "./setup-engine";
import type { Direction } from "./setup-model";

/** The ticket starts at 2R, but the trader may explicitly choose any positive R. */
export const PAPER_DEFAULT_R = 2;
/** @deprecated Legacy comparator; the paper ticket no longer uses a minimum R. */
export const PAPER_RR_RELATIVE_TOLERANCE = 128 * Number.EPSILON;

export type PaperFormValues = {
  entry: number;
  stop: number;
  target: number;
  quantity: number;
};

type PaperFormText = Record<keyof PaperFormValues, string | number>;
type PaperFormDefaults = Pick<PaperFormValues, keyof PaperFormValues>;

type PaperBracket = Pick<PaperFormValues, "entry" | "stop"> & {
  market: Market;
  side?: Direction;
};

const positiveFinite = (value: number) =>
  Number.isFinite(value) && value > 0;

const validStop = (side: Direction, entry: number, stop: number) =>
  side === "long" ? stop < entry : stop > entry;

export function parsePaperFormValues(values: PaperFormText): PaperFormValues {
  return {
    entry: Number(values.entry),
    stop: Number(values.stop),
    target: Number(values.target),
    quantity: Number(values.quantity),
  };
}

export function samePaperProposalForm(
  values: PaperFormValues,
  defaults: PaperFormDefaults,
) {
  return (
    values.entry === defaults.entry &&
    values.stop === defaults.stop &&
    values.target === defaults.target &&
    values.quantity === defaults.quantity
  );
}

export function paperTargetAtR({
  market,
  side,
  entry,
  stop,
  rr = PAPER_DEFAULT_R,
}: PaperBracket & { rr?: number }): number | undefined {
  if (
    !side ||
    !positiveFinite(entry) ||
    !positiveFinite(stop) ||
    !positiveFinite(rr) ||
    !validStop(side, entry, stop)
  )
    return undefined;
  try {
    return targetAtR(market, side, entry, stop, rr);
  } catch {
    return undefined;
  }
}

/** @deprecated Prefer paperTargetAtR with an explicit selected R. */
export const minimumPaperTarget = (bracket: PaperBracket) =>
  paperTargetAtR({ ...bracket, rr: PAPER_DEFAULT_R });

/** @deprecated Legacy helper retained for callers that explicitly require a threshold. */
export function meetsMinimumPaperR(
  rr: number,
  requiredR = PAPER_DEFAULT_R,
) {
  if (!Number.isFinite(rr) || !Number.isFinite(requiredR)) return false;
  const tolerance =
    PAPER_RR_RELATIVE_TOLERANCE *
    Math.max(1, Math.abs(rr), Math.abs(requiredR));
  return rr >= requiredR - tolerance;
}

export function paperFormRiskReward({
  market,
  side,
  entry,
  stop,
  target,
  quantity,
}: PaperFormValues & { market: Market; side?: Direction }): number | undefined {
  if (
    !side ||
    ![entry, stop, target, quantity].every(positiveFinite) ||
    !validStop(side, entry, stop) ||
    (side === "long" ? target <= entry : target >= entry)
  )
    return undefined;
  const rr = tradeMetrics({
    entry,
    stop,
    target,
    quantity,
    side,
    pointValue: market.pointValue,
    market: market.id,
    valuationSymbol: market.valuationSymbol,
  }).rr;
  return Number.isFinite(rr) && rr > 0 ? rr : undefined;
}

export function paperFormGeometryError({
  market,
  side,
  entry,
  stop,
  target,
  quantity,
}: PaperFormValues & { market: Market; side?: Direction }): string | null {
  if (![entry, stop, target, quantity].every(positiveFinite))
    return "Enter positive finite entry, stop, target and size values.";
  if (!side) return "Choose a Buy or Sell paper proposal before confirming.";
  if (!validStop(side, entry, stop) || (side === "long" ? target <= entry : target >= entry))
    return side === "long"
      ? "For a long plan, stop < entry < target."
      : "For a short plan, target < entry < stop.";
  if (!paperFormRiskReward({ market, side, entry, stop, target, quantity }))
    return "This bracket cannot form a positive risk-to-reward value for the selected market.";
  return null;
}
