import type { Quote, Trade } from "./model";

/**
 * A foreground quote observation used for a paper-limit entry. `time` is epoch
 * milliseconds; a side quote is mandatory, so `price` is never used to invent
 * an executable entry.
 */
export type ObservedPaperQuote = {
  time: number;
  bid?: number;
  ask?: number;
  source: string;
};

/**
 * This is a retained-extrema count, not a feed tick count. It is deliberately
 * only incremented when a new MAE or MFE extreme is retained.
 */
export type ObservedPaperExcursion = {
  maeR: number;
  mfeR: number;
  observedAt: number;
  samples: number;
  method: "observed-quotes";
  sampling: "foreground-sampled-not-full-tick-path";
};

const finitePositive = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const finiteNonnegative = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

function originalQuantity(trade: Trade) {
  return finitePositive(trade.initialQuantity)
    ? trade.initialQuantity
    : finitePositive(trade.quantity)
      ? trade.quantity
      : undefined;
}

function originalStop(trade: Trade) {
  return finitePositive(trade.originalStop)
    ? trade.originalStop
    : finitePositive(trade.stop)
      ? trade.stop
      : undefined;
}

function originalTarget(trade: Trade) {
  return finitePositive(trade.originalTarget)
    ? trade.originalTarget
    : finitePositive(trade.target)
      ? trade.target
      : undefined;
}

function pointValueAt(trade: Trade, price: number) {
  const valuation = trade.valuationSymbol || trade.market;
  return valuation === "USDJPY" || valuation === "USDCAD"
    ? 1 / price
    : trade.pointValue;
}

function validBracket(
  trade: Trade,
  entry: number,
  stop: number,
  target: number,
  quantity: number,
) {
  return (
    finitePositive(entry) &&
    finitePositive(stop) &&
    finitePositive(target) &&
    finitePositive(quantity) &&
    finitePositive(trade.pointValue) &&
    (trade.side === "long"
      ? stop < entry && entry < target
      : target < entry && entry < stop)
  );
}

function latestEventAt(trade: Trade) {
  return Math.max(
    trade.createdAt,
    ...(trade.events || [])
      .map((event) => event.at)
      .filter((at) => Number.isFinite(at)),
  );
}

function validObservation(observation: ObservedPaperQuote, now: number) {
  return (
    Number.isFinite(observation.time) &&
    observation.time >= 0 &&
    observation.time <= now &&
    Boolean(observation.source?.trim())
  );
}

/**
 * True when a current executable side quote satisfies a limit-style paper
 * entry. It rejects price-only observations; no spread or side is inferred.
 */
export function observedLimitFillPrice(
  trade: Trade,
  observation: ObservedPaperQuote,
  now = Date.now(),
): number | undefined {
  if (
    trade.status !== "pending" ||
    trade.orderType !== "limit" ||
    !finitePositive(trade.entry) ||
    !validObservation(observation, now) ||
    observation.time < latestEventAt(trade)
  )
    return undefined;
  const sidePrice = trade.side === "long" ? observation.ask : observation.bid;
  if (!finitePositive(sidePrice)) return undefined;
  if (trade.side === "long" ? sidePrice > trade.entry : sidePrice < trade.entry)
    return undefined;
  return sidePrice;
}

/**
 * Opens a pending paper limit from one actually observed side quote. It has no
 * bracket-management side effect: `autoManage` remains exactly as selected by
 * the user, so stop/target/partial rules are still opt-in after this entry.
 */
export function openObservedPaperLimit(
  trade: Trade,
  observation: ObservedPaperQuote,
  now = Date.now(),
): Trade | undefined {
  const entry = observedLimitFillPrice(trade, observation, now);
  // These are the live user-reviewed brackets. Original values remain the
  // immutable risk baseline but must never overwrite a pending bracket edit.
  const stop = finitePositive(trade.stop) ? trade.stop : undefined;
  const target = finitePositive(trade.target) ? trade.target : undefined;
  const quantity = originalQuantity(trade);
  if (
    entry === undefined ||
    stop === undefined ||
    target === undefined ||
    quantity === undefined ||
    !validBracket(trade, entry, stop, target, quantity)
  )
    return undefined;

  const id = `${trade.id}:filled:${observation.time}`;
  if ((trade.events || []).some((event) => event.id === id)) return undefined;

  const unitValue = pointValueAt(trade, stop);
  const initialRisk = finitePositive(trade.initialRisk)
    ? trade.initialRisk
    : Math.abs(entry - stop) * quantity * unitValue;
  if (!finitePositive(unitValue) || !finitePositive(initialRisk))
    return undefined;

  const partialAt = finitePositive(trade.partialAt)
    ? trade.partialAt
    : entry + (trade.side === "long" ? 1 : -1) * Math.abs(entry - stop) * 2;
  return {
    ...trade,
    status: "open",
    entry,
    openedAt: observation.time,
    initialQuantity: quantity,
    initialRisk,
    originalStop: originalStop(trade) ?? stop,
    originalTarget: originalTarget(trade) ?? target,
    partialAt,
    partialTaken: Boolean(trade.partialTaken),
    realizedPnl: finiteNonnegative(trade.realizedPnl) ? trade.realizedPnl : 0,
    // Do not turn a manual/practice position into automatic bracket management.
    autoManage: trade.autoManage,
    version: (trade.version ?? 0) + 1,
    events: [
      ...(trade.events || []),
      {
        id,
        kind: "filled",
        at: observation.time,
        price: entry,
        quantity,
        note: `Filled limit order from observed ${trade.side === "long" ? "ask" : "bid"} quote from ${observation.source}. Paper simulation only; no broker order.`,
      },
    ],
  };
}

function existingExcursion(trade: Trade) {
  const previous = trade.excursion;
  if (
    !previous ||
    !finiteNonnegative(previous.maeR) ||
    !finiteNonnegative(previous.mfeR) ||
    !Number.isFinite(previous.observedAt) ||
    !Number.isSafeInteger(previous.samples) ||
    previous.samples < 0
  )
    return undefined;
  return previous;
}

/**
 * Computes retained MAE/MFE extrema from a single fresh executable exit-side
 * quote. It is intentionally not a tick path or intrabar reconstruction.
 * Undefined means the observation was invalid, pre-entry/future, or did not
 * change an extrema; callers must not write in that case.
 */
export function observePaperExcursion(
  trade: Trade,
  quote: Quote,
  now = Date.now(),
): ObservedPaperExcursion | undefined {
  if (trade.status !== "open" || quote.status !== "live") return undefined;
  const quoteAt = quote.timestamp * 1000;
  const openedAt = trade.openedAt ?? trade.createdAt;
  if (
    !Number.isFinite(quote.timestamp) ||
    quote.timestamp <= 0 ||
    !Number.isFinite(quoteAt) ||
    quoteAt > now ||
    quoteAt < openedAt ||
    !quote.source?.trim() ||
    !finitePositive(trade.entry)
  )
    return undefined;

  const exitSide = trade.side === "long" ? quote.bid : quote.ask;
  const quantity = originalQuantity(trade);
  if (!finitePositive(exitSide) || quantity === undefined) return undefined;

  const stop = originalStop(trade);
  const riskPerUnit = finitePositive(trade.initialRisk)
    ? trade.initialRisk / quantity
    : stop === undefined
      ? undefined
      : Math.abs(trade.entry - stop) * pointValueAt(trade, stop);
  const exitPointValue = pointValueAt(trade, exitSide);
  if (!finitePositive(riskPerUnit) || !finitePositive(exitPointValue))
    return undefined;

  const signedR =
    ((exitSide - trade.entry) *
      (trade.side === "long" ? 1 : -1) *
      exitPointValue) /
    riskPerUnit;
  if (!Number.isFinite(signedR)) return undefined;

  const previous = existingExcursion(trade);
  if (previous && quoteAt <= previous.observedAt) return undefined;
  const maeR = Math.max(previous?.maeR ?? 0, Math.max(0, -signedR));
  const mfeR = Math.max(previous?.mfeR ?? 0, Math.max(0, signedR));
  if (maeR === (previous?.maeR ?? 0) && mfeR === (previous?.mfeR ?? 0))
    return undefined;

  return {
    maeR,
    mfeR,
    observedAt: quoteAt,
    samples: (previous?.samples ?? 0) + 1,
    method: "observed-quotes",
    sampling: "foreground-sampled-not-full-tick-path",
  };
}
