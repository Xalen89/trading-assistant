import type { Candle, PaperTradeEvent, Trade } from "./model";

export type PaperObservation = {
  time: number;
  price: number;
  bid?: number;
  ask?: number;
  bar?: Candle;
  source: string;
};

type ExitLeg = "entry" | "exit";
type Reach = { hit: boolean; via?: "quote" | "bar" };

const finitePositive = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;
const finiteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const eventId = (trade: Trade, kind: PaperTradeEvent["kind"], at: number) =>
  `${trade.id}:${kind}:${at}`;

function hasValidBar(bar: Candle | undefined): bar is Candle {
  return Boolean(
    bar &&
    [bar.time, bar.open, bar.high, bar.low, bar.close, bar.volume].every(
      Number.isFinite,
    ) &&
    bar.time >= 0 &&
    bar.low > 0 &&
    bar.high >= bar.low &&
    bar.high >= Math.max(bar.open, bar.close) &&
    bar.low <= Math.min(bar.open, bar.close),
  );
}

function sidePrice(
  observation: PaperObservation,
  side: Trade["side"],
  leg: ExitLeg,
) {
  const value =
    leg === "entry"
      ? side === "long"
        ? observation.ask
        : observation.bid
      : side === "long"
        ? observation.bid
        : observation.ask;
  return finitePositive(value)
    ? { price: value, sided: true }
    : { price: observation.price, sided: false };
}

function barReaches(
  bar: Candle,
  side: Trade["side"],
  level: number,
  direction: "below" | "above",
) {
  if (direction === "below")
    return side === "long" ? bar.low <= level : bar.low <= level;
  return side === "long" ? bar.high >= level : bar.high >= level;
}

function reaches(
  observation: PaperObservation,
  side: Trade["side"],
  leg: ExitLeg,
  level: number,
  direction: "below" | "above",
): Reach {
  const quote = sidePrice(observation, side, leg);
  const quoteHit =
    direction === "below" ? quote.price <= level : quote.price >= level;
  if (quoteHit) return { hit: true, via: "quote" };
  if (
    hasValidBar(observation.bar) &&
    barReaches(observation.bar, side, level, direction)
  )
    return { hit: true, via: "bar" };
  return { hit: false };
}

function executionPrice(
  observation: PaperObservation,
  side: Trade["side"],
  leg: ExitLeg,
  level: number,
  reach: Reach,
) {
  const quote = sidePrice(observation, side, leg);
  // A bar proves a range was reached but supplies no executable bid/ask at that instant.
  // Use the explicit bracket/limit level rather than inventing a historical spread or path.
  if (reach.via === "bar")
    return {
      price: level,
      basis: "bar-range bracket level; no intrabar bid/ask history",
    };
  if (quote.sided)
    return {
      price: quote.price,
      basis: leg === "entry" ? "observed side quote" : "observed side quote",
    };
  return {
    price: quote.price,
    basis: "supplied price fallback; paper quote had no side bid/ask",
  };
}

function valueAt(trade: Trade, price: number) {
  const valuation = trade.valuationSymbol || trade.market;
  return valuation === "USDJPY" || valuation === "USDCAD"
    ? 1 / price
    : trade.pointValue;
}

function legPnl(trade: Trade, exit: number, quantity: number) {
  return (
    (exit - trade.entry) *
    (trade.side === "long" ? 1 : -1) *
    quantity *
    valueAt(trade, exit)
  );
}

function validPendingBracket(trade: Trade, entry: number) {
  return (
    finitePositive(entry) &&
    finitePositive(trade.stop) &&
    finitePositive(trade.target) &&
    (trade.side === "long"
      ? trade.stop < entry && entry < trade.target
      : trade.target < entry && entry < trade.stop)
  );
}

function validOpenBracket(trade: Trade) {
  return (
    finitePositive(trade.entry) &&
    finitePositive(trade.stop) &&
    finitePositive(trade.target) &&
    finitePositive(trade.quantity) &&
    (trade.side === "long"
      ? trade.stop < trade.target && trade.target > trade.entry
      : trade.target < trade.entry && trade.stop > trade.target)
  );
}

function originalRiskPrice(trade: Trade) {
  const originalStop = trade.originalStop;
  if (finitePositive(originalStop) && originalStop !== trade.entry)
    return Math.abs(trade.entry - originalStop);
  if (finitePositive(trade.initialRisk)) {
    const quantity = finitePositive(trade.initialQuantity)
      ? trade.initialQuantity
      : trade.quantity;
    const unitValue = valueAt(trade, trade.entry);
    if (finitePositive(quantity) && finitePositive(unitValue))
      return trade.initialRisk / (quantity * unitValue);
  }
  return Math.abs(trade.entry - trade.stop);
}

function partialLevel(trade: Trade) {
  if (
    finitePositive(trade.partialAt) &&
    (trade.side === "long"
      ? trade.partialAt > trade.entry
      : trade.partialAt < trade.entry)
  )
    return trade.partialAt;
  const riskDistance = originalRiskPrice(trade);
  if (!finitePositive(riskDistance)) return undefined;
  return trade.entry + (trade.side === "long" ? 1 : -1) * riskDistance * 2;
}

function note(observation: PaperObservation, action: string, basis: string) {
  return `${action} from ${observation.source || "unspecified source"} at observation ${observation.time}; ${basis}. Paper simulation only: no fees, slippage, or invented spread.`;
}

/**
 * Advances an opted-in local paper trade using one source-stamped observation.
 *
 * `observation.time` is an epoch-millisecond timestamp (the same basis as
 * `Trade.createdAt`/events). Quote observations use the supplied bid/ask when
 * present. A bar may establish a touched bracket only when the caller has
 * already confirmed that its source and price basis match the trade; bars do
 * not reconstruct an intrabar bid/ask path.
 */
export function advancePaperTrade(
  trade: Trade,
  observation: PaperObservation,
): Trade {
  // Manual trades, terminal closures/cancellations, and non-limit pending orders
  // are deliberately untouched. The explicit cancellation guard protects direct
  // lifecycle callers as well as the active-trade database query.
  if (
    !trade.autoManage ||
    trade.status === "closed" ||
    trade.status === "cancelled" ||
    (trade.status === "pending" && trade.orderType !== "limit")
  )
    return trade;
  if (
    !finitePositive(observation.price) ||
    !Number.isFinite(observation.time) ||
    observation.time < 0 ||
    !observation.source?.trim()
  )
    return trade;
  if (observation.time > Date.now()) return trade;

  const stateStartedAt =
    trade.status === "open"
      ? (trade.openedAt ?? trade.createdAt)
      : trade.createdAt;
  if (observation.time < stateStartedAt) return trade;
  const latestEventAt = Math.max(
    -Infinity,
    ...(trade.events ?? []).map((event) => event.at),
  );
  if (observation.time < latestEventAt) return trade;

  let next = trade;
  let changed = false;
  const hasEvent = (kind: PaperTradeEvent["kind"]) =>
    (next.events ?? []).some(
      (event) => event.id === eventId(next, kind, observation.time),
    );
  const mutate = (patch: Partial<Trade>) => {
    next = { ...next, ...patch };
    changed = true;
  };
  const append = (
    kind: PaperTradeEvent["kind"],
    price: number | undefined,
    quantity: number | undefined,
    pnl: number | undefined,
    eventNote: string,
  ) => {
    if (hasEvent(kind)) return false;
    const event: PaperTradeEvent = {
      id: eventId(next, kind, observation.time),
      kind,
      at: observation.time,
      ...(price === undefined ? {} : { price }),
      ...(quantity === undefined ? {} : { quantity }),
      ...(pnl === undefined ? {} : { pnl }),
      note: eventNote,
    };
    mutate({ events: [...(next.events ?? []), event] });
    return true;
  };
  const originalFields = (
    entry = next.entry,
    stop = next.originalStop ?? next.stop,
  ) => {
    const initialQuantity = finitePositive(next.initialQuantity)
      ? next.initialQuantity
      : next.quantity;
    const computedRisk =
      Math.abs(entry - stop) * initialQuantity * valueAt(next, stop);
    return {
      initialQuantity,
      originalStop: finitePositive(next.originalStop)
        ? next.originalStop
        : stop,
      originalTarget: finitePositive(next.originalTarget)
        ? next.originalTarget
        : next.target,
      ...(finitePositive(next.initialRisk)
        ? { initialRisk: next.initialRisk }
        : finitePositive(computedRisk)
          ? { initialRisk: computedRisk }
          : {}),
    };
  };
  const close = (price: number, basis: string) => {
    if (hasEvent("closed")) return;
    const fields = originalFields();
    const pnl = legPnl(next, price, next.quantity);
    mutate({
      ...fields,
      status: "closed",
      exit: price,
      closedAt: observation.time,
    });
    append(
      "closed",
      price,
      next.quantity,
      pnl,
      note(observation, "Closed remaining position", basis),
    );
  };

  if (next.status === "pending") {
    const direction = next.side === "long" ? "below" : "above";
    const reached = reaches(
      observation,
      next.side,
      "entry",
      next.entry,
      direction,
    );
    if (!reached.hit || hasEvent("filled")) return trade;
    const fill = executionPrice(
      observation,
      next.side,
      "entry",
      next.entry,
      reached,
    );
    if (!validPendingBracket(next, fill.price)) return trade;
    const fields = originalFields(fill.price, next.stop);
    mutate({
      ...fields,
      status: "open",
      entry: fill.price,
      openedAt: observation.time,
    });
    append(
      "filled",
      fill.price,
      next.quantity,
      undefined,
      note(observation, "Filled limit order", fill.basis),
    );
  }

  if (next.status !== "open" || !validOpenBracket(next)) {
    if (!changed) return trade;
    return { ...next, version: (trade.version ?? 0) + 1 };
  }

  // A candle that touches both bracket boundaries is intentionally treated as a stop first.
  const stopDirection = next.side === "long" ? "below" : "above";
  const targetDirection = next.side === "long" ? "above" : "below";
  const stopped = reaches(
    observation,
    next.side,
    "exit",
    next.stop,
    stopDirection,
  );
  if (stopped.hit) {
    const execution = executionPrice(
      observation,
      next.side,
      "exit",
      next.stop,
      stopped,
    );
    close(execution.price, execution.basis);
  } else {
    const partial = !next.partialTaken ? partialLevel(next) : undefined;
    const partialReached =
      partial === undefined
        ? { hit: false }
        : reaches(observation, next.side, "exit", partial, targetDirection);
    if (partial !== undefined && partialReached.hit && !hasEvent("partial")) {
      const execution = executionPrice(
        observation,
        next.side,
        "exit",
        partial,
        partialReached,
      );
      const quantity = next.quantity / 2;
      const pnl = legPnl(next, execution.price, quantity);
      const fields = originalFields();
      mutate({
        ...fields,
        quantity: next.quantity - quantity,
        partialAt: partial,
        partialTaken: true,
        realizedPnl:
          (finiteNumber(next.realizedPnl) ? next.realizedPnl : 0) + pnl,
        stop: next.entry,
      });
      append(
        "partial",
        execution.price,
        quantity,
        pnl,
        note(
          observation,
          "Took 50% partial at the configured 2R/partial level",
          execution.basis,
        ),
      );
      append(
        "breakeven",
        next.entry,
        undefined,
        undefined,
        note(
          observation,
          "Moved remaining stop to entry after partial",
          "deterministic post-partial rule",
        ),
      );
    }

    const breakevenAlsoReached =
      partialReached.via === "bar" &&
      hasValidBar(observation.bar) &&
      barReaches(observation.bar, next.side, next.stop, stopDirection);
    if (breakevenAlsoReached) {
      // OHLC establishes neither high/low ordering nor a side-quote path. Once
      // a bar-created partial moves the stop to entry, an ambiguous same bar
      // that also reaches that new stop exits the remainder at break-even
      // before any target credit.
      const execution = executionPrice(
        observation,
        next.side,
        "exit",
        next.stop,
        { hit: true, via: "bar" },
      );
      close(execution.price, execution.basis);
    } else {
      const targeted = reaches(
        observation,
        next.side,
        "exit",
        next.target,
        targetDirection,
      );
      if (targeted.hit) {
        const execution = executionPrice(
          observation,
          next.side,
          "exit",
          next.target,
          targeted,
        );
        close(execution.price, execution.basis);
      }
    }
  }

  return changed ? { ...next, version: (trade.version ?? 0) + 1 } : trade;
}
