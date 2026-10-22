import type { QuantBook } from "./quant-lab-types";

/**
 * Clean-room paper-research methods based on published quote formulas.
 *
 * These functions never create orders, fills, queue positions, executions, PnL,
 * or mutable inventory. Every output is a proposal or an educational scenario.
 */

const EPSILON = 1e-12;

export type PaperCostAssumptions = Readonly<{
  /** Explicit caller-supplied per-side fee assumption; no venue fee is inferred. */
  feeBps: number;
  /** Explicit caller-supplied per-side expected slippage assumption. */
  expectedSlippageBps: number;
}>;

export type PaperRiskBudget = Readonly<{
  /** Current supplied paper equity; this module never derives an account balance. */
  currentEquity: number;
  /** Positive notional cap, explicitly bounded by currentEquity. */
  equityRiskCap: number;
  /** Absolute base-inventory cap for a hypothetical one-side fill. */
  maxInventory: number;
}>;

export type MarketMakingBook = Readonly<
  Pick<
    QuantBook,
    "symbol" | "source" | "receivedAt" | "status" | "tickSize" | "lotSize"
  > & {
    bids: readonly (readonly [number, number])[];
    asks: readonly (readonly [number, number])[];
  }
>;

export type CurrentBook = Readonly<{
  symbol: string;
  source: string;
  receivedAt: number;
  ageMs: number;
  tickSize: number;
  lotSize: number;
  bestBid: number;
  bestAsk: number;
  bidSize: number;
  askSize: number;
  midpoint: number;
  displayedSpread: number;
  displayedSpreadBps: number;
}>;

export type CurrentBookCheck =
  | Readonly<{ valid: true; book: CurrentBook }>
  | Readonly<{ valid: false; reason: string }>;

export type PaperQuoteLevel = Readonly<{
  level: number;
  side: "bid" | "ask";
  price: number;
  quantity: number;
  notional: number;
  requestedQuantity: number;
}>;

export type PaperQuoteDiagnostics = Readonly<{
  model: "avellaneda-stoikov" | "pmm";
  source: string;
  receiptAt: number;
  ageMs: number;
  midpoint: number;
  displayedSpread: number;
  displayedSpreadBps: number;
  expectedSlippagePerSide: number;
  expectedOneWayCostBps: number;
  expectedTwoSidedCostBps: number;
  costSource: string;
  currentEquity: number;
  equityRiskCap: number;
  syntheticInventory: number;
  targetInventory: number;
}>;

export type PaperQuoteProposal = Readonly<{
  available: boolean;
  reason: string | null;
  reservationPrice: number | null;
  modelSpread: number | null;
  effectiveSpread: number | null;
  diagnostics: PaperQuoteDiagnostics | null;
  bidLevels: readonly PaperQuoteLevel[];
  askLevels: readonly PaperQuoteLevel[];
  limitations: readonly string[];
}>;

export type AvellanedaStoikovInput = Readonly<{
  book: MarketMakingBook;
  now: number;
  staleAfterMs: number;
  costs: PaperCostAssumptions;
  risk: PaperRiskBudget;
  /** Synthetic paper inventory only; it is never updated by this module. */
  syntheticInventory: number;
  targetInventory: number;
  gamma: number;
  /** Volatility in price units for the same time unit as tau. */
  volatility: number;
  /** Time remaining in the same units used for volatility. */
  tau: number;
  /** Positive exponential order-arrival decay calibration. */
  kappa: number;
  requestedOrderSize: number;
  /** Optional explicit minimum total quote width. */
  minimumSpreadBps: number;
}>;

export type PmmLevelInput = Readonly<{
  level: number;
  bidSpreadBps: number;
  askSpreadBps: number;
  amount: number;
}>;

export type PmmInput = Readonly<{
  book: MarketMakingBook;
  now: number;
  staleAfterMs: number;
  /** Explicit research-only snapshot mode; default still requires a current stream. */
  researchSnapshot?: boolean;
  costs: PaperCostAssumptions;
  risk: PaperRiskBudget;
  syntheticInventory: number;
  targetInventory: number;
  /** Hummingbot-style PMM may use mid or last; this caller supplies its reference explicitly. */
  referencePrice: number;
  minimumSpreadBps: number;
  levels: readonly PmmLevelInput[];
}>;

export type BboImbalance = Readonly<{
  ratio: number;
  signedImbalance: number;
  dominantSide: "bid" | "ask" | "balanced";
  largerSize: number;
  thinnerSize: number;
}>;

export type BboCrossScenarioInput = Readonly<{
  book: MarketMakingBook;
  now: number;
  staleAfterMs: number;
  /** The larger BBO size must strictly exceed this caller-supplied gate. */
  triggerMinimumSize: number;
  /** A signal requires min(BBO)/max(BBO) to be strictly below this ratio. */
  triggerImbalanceRatio: number;
  cooldownElapsed: boolean;
  /** Quantity cap for an educational BBO-cross stress scenario, not an order. */
  paperRiskCapQuantity: number;
}>;

export type EducationalBboCrossScenario = Readonly<{
  state: "filtered" | "educational-scenario";
  reasons: readonly string[];
  features: BboImbalance | null;
  scenario: Readonly<{
    label: "BBO-cross stress scenario";
    direction: "buy" | "sell";
    referencePrice: number;
    quantity: number;
    note: string;
  }> | null;
}>;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function positive(value: unknown): value is number {
  return finite(value) && value > 0;
}

function nonNegative(value: unknown): value is number {
  return finite(value) && value >= 0;
}

function stable(value: number): number {
  return Number(value.toPrecision(15));
}

function floorToTick(value: number, tickSize: number): number {
  return stable(Math.floor(value / tickSize + 1e-10) * tickSize);
}

function ceilToTick(value: number, tickSize: number): number {
  return stable(Math.ceil(value / tickSize - 1e-10) * tickSize);
}

function floorToLot(value: number, lotSize: number): number {
  return stable(Math.max(0, Math.floor(value / lotSize + 1e-10) * lotSize));
}

function unavailable(reason: string): PaperQuoteProposal {
  return {
    available: false,
    reason,
    reservationPrice: null,
    modelSpread: null,
    effectiveSpread: null,
    diagnostics: null,
    bidLevels: [],
    askLevels: [],
    limitations: [
      "Paper-only research output. No order, fill, queue position, execution, return, or PnL is created.",
    ],
  };
}

function validateCosts(costs: PaperCostAssumptions): string | null {
  if (
    !costs ||
    !nonNegative(costs.feeBps) ||
    !nonNegative(costs.expectedSlippageBps)
  )
    return "feeBps and expectedSlippageBps must be finite, non-negative caller-supplied assumptions.";
  return null;
}

function validateRisk(risk: PaperRiskBudget): string | null {
  if (!risk || !positive(risk.currentEquity))
    return "currentEquity must be a finite positive caller-supplied paper value.";
  if (!positive(risk.equityRiskCap) || risk.equityRiskCap > risk.currentEquity)
    return "equityRiskCap must be finite, positive, and no greater than currentEquity.";
  if (!positive(risk.maxInventory))
    return "maxInventory must be finite and positive.";
  return null;
}

/**
 * Rejects non-streamed, stale, future-dated, crossed, or malformed BBO data.
 * receivedAt is a local WebSocket receipt time, not an inferred exchange timestamp.
 */
export function validateCurrentWebsocketBook(
  book: MarketMakingBook,
  now: number,
  staleAfterMs: number,
): CurrentBookCheck {
  return validateBookReceipt(book, now, staleAfterMs, true);
}

/** A timestamped venue snapshot can support research, but is not a live quoting stream. */
export function validateResearchBookSnapshot(
  book: MarketMakingBook,
  now: number,
  staleAfterMs: number,
): CurrentBookCheck {
  return validateBookReceipt(book, now, staleAfterMs, false);
}

function validateBookReceipt(
  book: MarketMakingBook,
  now: number,
  staleAfterMs: number,
  requireStream: boolean,
): CurrentBookCheck {
  if (!finite(now) || now < 10_000_000_000)
    return {
      valid: false,
      reason: "now must be a finite Unix-millisecond timestamp.",
    };
  if (!finite(staleAfterMs) || staleAfterMs < 0)
    return {
      valid: false,
      reason: "staleAfterMs must be finite and non-negative.",
    };
  if (
    !book ||
    (requireStream
      ? book.status !== "streamed"
      : book.status !== "streamed" && book.status !== "polled")
  )
    return {
      valid: false,
      reason: requireStream
        ? "A streamed WebSocket book receipt is required for a current paper quote."
        : "A sourced streamed or polled venue snapshot is required for research.",
    };
  if (!finite(book.receivedAt) || book.receivedAt < 10_000_000_000)
    return {
      valid: false,
      reason:
        "The WebSocket book needs a finite Unix-millisecond receipt timestamp.",
    };
  if (book.receivedAt > now)
    return {
      valid: false,
      reason:
        "The WebSocket receipt is future-dated relative to now; no quote is proposed.",
    };
  const ageMs = now - book.receivedAt;
  if (ageMs > staleAfterMs)
    return {
      valid: false,
      reason:
        "The book receipt is stale; no current research quote is proposed.",
    };
  if (!positive(book.tickSize) || !positive(book.lotSize))
    return {
      valid: false,
      reason: "tickSize and lotSize must be finite positive values.",
    };
  if (!book.symbol?.trim() || !book.source?.trim())
    return {
      valid: false,
      reason: "The book needs non-empty symbol and source labels.",
    };

  const bid = book.bids?.[0];
  const ask = book.asks?.[0];
  if (
    !bid ||
    !ask ||
    !positive(bid[0]) ||
    !positive(bid[1]) ||
    !positive(ask[0]) ||
    !positive(ask[1])
  )
    return {
      valid: false,
      reason: "A positive finite best bid/size and best ask/size are required.",
    };
  if (bid[0] >= ask[0])
    return {
      valid: false,
      reason: "A crossed or locked BBO is not used for a paper quote.",
    };
  if (
    bid[0] / book.tickSize > Number.MAX_SAFE_INTEGER / 4 ||
    ask[0] / book.tickSize > Number.MAX_SAFE_INTEGER / 4
  )
    return {
      valid: false,
      reason: "Price/tick precision is unsafe for deterministic tick rounding.",
    };

  const midpoint = (bid[0] + ask[0]) / 2;
  const displayedSpread = ask[0] - bid[0];
  return {
    valid: true,
    book: {
      symbol: book.symbol,
      source: book.source,
      receivedAt: book.receivedAt,
      ageMs,
      tickSize: book.tickSize,
      lotSize: book.lotSize,
      bestBid: bid[0],
      bestAsk: ask[0],
      bidSize: bid[1],
      askSize: ask[1],
      midpoint,
      displayedSpread,
      displayedSpreadBps: (displayedSpread / midpoint) * 10_000,
    },
  };
}

function diagnostics(
  model: PaperQuoteDiagnostics["model"],
  current: CurrentBook,
  costs: PaperCostAssumptions,
  risk: PaperRiskBudget,
  syntheticInventory: number,
  targetInventory: number,
): PaperQuoteDiagnostics {
  const expectedOneWayCostBps = costs.feeBps + costs.expectedSlippageBps;
  return {
    model,
    source: current.source,
    receiptAt: current.receivedAt,
    ageMs: current.ageMs,
    midpoint: current.midpoint,
    displayedSpread: current.displayedSpread,
    displayedSpreadBps: current.displayedSpreadBps,
    expectedSlippagePerSide:
      (current.midpoint * costs.expectedSlippageBps) / 10_000,
    expectedOneWayCostBps,
    expectedTwoSidedCostBps: expectedOneWayCostBps * 2,
    costSource:
      "feeBps and expectedSlippageBps are explicit caller-supplied assumptions; venue fees, rebates, impact, and latency are not inferred.",
    currentEquity: risk.currentEquity,
    equityRiskCap: risk.equityRiskCap,
    syntheticInventory,
    targetInventory,
  };
}

function capacity(
  side: "bid" | "ask",
  requestedQuantity: number,
  price: number,
  inventory: number,
  risk: PaperRiskBudget,
  remainingNotionalBudget: number,
  lotSize: number,
): number {
  const inventoryCapacity =
    side === "bid"
      ? Math.max(0, risk.maxInventory - inventory)
      : Math.max(0, risk.maxInventory + inventory);
  const fundsCapacity = Math.max(0, remainingNotionalBudget) / price;
  return floorToLot(
    Math.min(requestedQuantity, inventoryCapacity, fundsCapacity),
    lotSize,
  );
}

function level(
  levelNumber: number,
  side: "bid" | "ask",
  price: number,
  requestedQuantity: number,
  inventory: number,
  risk: PaperRiskBudget,
  remainingNotionalBudget: number,
  lotSize: number,
): PaperQuoteLevel | null {
  const quantity = capacity(
    side,
    requestedQuantity,
    price,
    inventory,
    risk,
    remainingNotionalBudget,
    lotSize,
  );
  if (!positive(quantity)) return null;
  return {
    level: levelNumber,
    side,
    price,
    quantity,
    notional: stable(price * quantity),
    requestedQuantity,
  };
}

function quoteLimitations(): readonly string[] {
  return [
    "Synthetic inventory is an input only and is not changed because no fills are modeled.",
    "Historical L2 alone cannot prove queue priority, fill probability, partial fills, cancellations, latency, hidden liquidity, or adverse selection.",
    "Proposed levels are paper research targets, not canonical orders or execution instructions.",
  ];
}

/**
 * Published finite-horizon Avellaneda-Stoikov approximation:
 * r = m - q·gamma·sigma²·tau
 * D = gamma·sigma²·tau + 2·ln(1 + gamma/kappa)/gamma
 * where q is supplied synthetic inventory relative to its target.
 */
export function proposeAvellanedaStoikovPaperQuotes(
  input: AvellanedaStoikovInput,
): PaperQuoteProposal {
  const currentCheck = validateCurrentWebsocketBook(
    input.book,
    input.now,
    input.staleAfterMs,
  );
  if (!currentCheck.valid) return unavailable(currentCheck.reason);
  const costError = validateCosts(input.costs);
  if (costError) return unavailable(costError);
  const riskError = validateRisk(input.risk);
  if (riskError) return unavailable(riskError);
  if (!finite(input.syntheticInventory) || !finite(input.targetInventory))
    return unavailable(
      "syntheticInventory and targetInventory must be finite paper inputs.",
    );
  if (Math.abs(input.syntheticInventory) > input.risk.maxInventory + EPSILON)
    return unavailable(
      "syntheticInventory already exceeds maxInventory; no proposal is created.",
    );
  if (
    !positive(input.gamma) ||
    !positive(input.volatility) ||
    !positive(input.tau) ||
    !positive(input.kappa) ||
    !positive(input.requestedOrderSize) ||
    !nonNegative(input.minimumSpreadBps)
  )
    return unavailable(
      "gamma, volatility, tau, kappa, requestedOrderSize, and minimumSpreadBps must be finite valid paper-model inputs.",
    );

  const current = currentCheck.book;
  const q = input.syntheticInventory - input.targetInventory;
  const varianceTime = input.volatility ** 2 * input.tau;
  const reservationPrice = current.midpoint - q * input.gamma * varianceTime;
  const modelSpread =
    input.gamma * varianceTime +
    (2 * Math.log(1 + input.gamma / input.kappa)) / input.gamma;
  const quoteDiagnostics = diagnostics(
    "avellaneda-stoikov",
    current,
    input.costs,
    input.risk,
    input.syntheticInventory,
    input.targetInventory,
  );
  const minimumSpread =
    (current.midpoint *
      Math.max(
        input.minimumSpreadBps,
        quoteDiagnostics.expectedTwoSidedCostBps,
      )) /
    10_000;
  const effectiveSpread = Math.max(modelSpread, minimumSpread);
  if (
    ![reservationPrice, modelSpread, effectiveSpread].every(positive) ||
    !finite(effectiveSpread)
  )
    return unavailable(
      "The supplied parameters produced a non-positive or non-finite paper quote.",
    );

  const bidPrice = floorToTick(
    Math.min(
      reservationPrice - effectiveSpread / 2,
      current.bestAsk - current.tickSize,
    ),
    current.tickSize,
  );
  const askPrice = ceilToTick(
    Math.max(
      reservationPrice + effectiveSpread / 2,
      current.bestBid + current.tickSize,
    ),
    current.tickSize,
  );
  if (!positive(bidPrice) || !positive(askPrice) || bidPrice >= askPrice)
    return unavailable(
      "Tick rounding did not leave a positive uncrossed paper quote pair.",
    );

  const bid = level(
    1,
    "bid",
    bidPrice,
    input.requestedOrderSize,
    input.syntheticInventory,
    input.risk,
    input.risk.equityRiskCap,
    current.lotSize,
  );
  const ask = level(
    1,
    "ask",
    askPrice,
    input.requestedOrderSize,
    input.syntheticInventory,
    input.risk,
    input.risk.equityRiskCap - (bid?.notional ?? 0),
    current.lotSize,
  );
  if (!bid && !ask)
    return unavailable(
      "The requested size has no lot-compliant inventory or equity-risk capacity.",
    );

  return {
    available: true,
    reason: null,
    reservationPrice,
    modelSpread,
    effectiveSpread,
    diagnostics: quoteDiagnostics,
    bidLevels: bid ? [bid] : [],
    askLevels: ask ? [ask] : [],
    limitations: quoteLimitations(),
  };
}

/**
 * Produces multi-level pure-market-making proposals around an explicit reference.
 * It applies per-side inventory and one shared current-equity notional cap
 * cumulatively, rounds down sizes to the supplied lot, and returns bids high-to-low
 * and asks low-to-high.
 */
export function proposePmmPaperLevels(input: PmmInput): PaperQuoteProposal {
  const currentCheck = (
    input.researchSnapshot
      ? validateResearchBookSnapshot
      : validateCurrentWebsocketBook
  )(input.book, input.now, input.staleAfterMs);
  if (!currentCheck.valid) return unavailable(currentCheck.reason);
  const costError = validateCosts(input.costs);
  if (costError) return unavailable(costError);
  const riskError = validateRisk(input.risk);
  if (riskError) return unavailable(riskError);
  if (
    !finite(input.syntheticInventory) ||
    !finite(input.targetInventory) ||
    !positive(input.referencePrice) ||
    !nonNegative(input.minimumSpreadBps) ||
    !Array.isArray(input.levels) ||
    !input.levels.length
  )
    return unavailable(
      "A finite synthetic inventory/target/reference, non-negative minimum spread, and at least one PMM level are required.",
    );
  if (Math.abs(input.syntheticInventory) > input.risk.maxInventory + EPSILON)
    return unavailable(
      "syntheticInventory already exceeds maxInventory; no proposal is created.",
    );
  if (input.levels.length > 50)
    return unavailable(
      "At most 50 PMM levels are accepted; no levels were silently discarded.",
    );
  if (
    input.levels.some(
      (item) =>
        !Number.isInteger(item.level) ||
        item.level < 1 ||
        !nonNegative(item.bidSpreadBps) ||
        !nonNegative(item.askSpreadBps) ||
        !positive(item.amount),
    )
  )
    return unavailable(
      "Each PMM level needs a positive integer level plus finite non-negative side spreads and positive amount.",
    );

  const current = currentCheck.book;
  const quoteDiagnostics = diagnostics(
    "pmm",
    current,
    input.costs,
    input.risk,
    input.syntheticInventory,
    input.targetInventory,
  );
  const minimumSideSpreadBps = Math.max(
    input.minimumSpreadBps / 2,
    quoteDiagnostics.expectedOneWayCostBps,
  );
  const sorted = [...input.levels].sort(
    (left, right) => left.level - right.level,
  );
  const uniqueLevels = new Set<number>();
  for (const item of sorted) {
    if (uniqueLevels.has(item.level))
      return unavailable(
        "PMM level numbers must be unique; no ambiguous proposal is created.",
      );
    uniqueLevels.add(item.level);
  }

  const bidLevels: PaperQuoteLevel[] = [];
  const askLevels: PaperQuoteLevel[] = [];
  let bidInventory = input.syntheticInventory;
  let askInventory = input.syntheticInventory;
  let grossNotionalRemaining = input.risk.equityRiskCap;
  const usedBidPrices = new Set<number>();
  const usedAskPrices = new Set<number>();

  for (const item of sorted) {
    const bidSpreadBps = Math.max(item.bidSpreadBps, minimumSideSpreadBps);
    const askSpreadBps = Math.max(item.askSpreadBps, minimumSideSpreadBps);
    const bidPrice = floorToTick(
      Math.min(
        input.referencePrice * (1 - bidSpreadBps / 10_000),
        current.bestAsk - current.tickSize,
      ),
      current.tickSize,
    );
    const askPrice = ceilToTick(
      Math.max(
        input.referencePrice * (1 + askSpreadBps / 10_000),
        current.bestBid + current.tickSize,
      ),
      current.tickSize,
    );

    if (positive(bidPrice) && !usedBidPrices.has(bidPrice)) {
      const inventoryCapacity = Math.max(
        0,
        input.risk.maxInventory - bidInventory,
      );
      const fundsCapacity = grossNotionalRemaining / bidPrice;
      const quantity = floorToLot(
        Math.min(item.amount, inventoryCapacity, fundsCapacity),
        current.lotSize,
      );
      if (positive(quantity)) {
        const proposed: PaperQuoteLevel = {
          level: item.level,
          side: "bid",
          price: bidPrice,
          quantity,
          notional: stable(bidPrice * quantity),
          requestedQuantity: item.amount,
        };
        bidLevels.push(proposed);
        usedBidPrices.add(bidPrice);
        bidInventory += quantity;
        grossNotionalRemaining -= proposed.notional;
      }
    }

    if (positive(askPrice) && !usedAskPrices.has(askPrice)) {
      const inventoryCapacity = Math.max(
        0,
        input.risk.maxInventory + askInventory,
      );
      const fundsCapacity = grossNotionalRemaining / askPrice;
      const quantity = floorToLot(
        Math.min(item.amount, inventoryCapacity, fundsCapacity),
        current.lotSize,
      );
      if (positive(quantity)) {
        const proposed: PaperQuoteLevel = {
          level: item.level,
          side: "ask",
          price: askPrice,
          quantity,
          notional: stable(askPrice * quantity),
          requestedQuantity: item.amount,
        };
        askLevels.push(proposed);
        usedAskPrices.add(askPrice);
        askInventory -= quantity;
        grossNotionalRemaining -= proposed.notional;
      }
    }
  }

  const orderedBids = bidLevels.sort(
    (left, right) => right.price - left.price || left.level - right.level,
  );
  const orderedAsks = askLevels.sort(
    (left, right) => left.price - right.price || left.level - right.level,
  );
  if (!orderedBids.length && !orderedAsks.length)
    return unavailable(
      "No PMM level remained after tick, lot, synthetic-inventory, and current-equity risk-cap validation.",
    );

  return {
    available: true,
    reason: null,
    reservationPrice: input.referencePrice,
    modelSpread: null,
    effectiveSpread: null,
    diagnostics: quoteDiagnostics,
    bidLevels: orderedBids,
    askLevels: orderedAsks,
    limitations: quoteLimitations(),
  };
}

/** Exact published BBO features: r=min(bidSize, askSize)/max(...), plus signed imbalance. */
export function calculateBboImbalance(
  bidSize: number,
  askSize: number,
): BboImbalance | null {
  if (!positive(bidSize) || !positive(askSize)) return null;
  const largerSize = Math.max(bidSize, askSize);
  const thinnerSize = Math.min(bidSize, askSize);
  const ratio = thinnerSize / largerSize;
  const signedImbalance = (bidSize - askSize) / (bidSize + askSize);
  if (!finite(ratio) || !finite(signedImbalance)) return null;
  return {
    ratio,
    signedImbalance,
    dominantSide:
      bidSize > askSize ? "bid" : askSize > bidSize ? "ask" : "balanced",
    largerSize,
    thinnerSize,
  };
}

/**
 * Filters a teaching-only BBO-cross stress scenario. It deliberately describes a
 * contemporaneous bid/ask reference rather than placing, simulating, or claiming
 * any FOK/queue fill.
 */
export function educationalBboCrossScenario(
  input: BboCrossScenarioInput,
): EducationalBboCrossScenario {
  const currentCheck = validateCurrentWebsocketBook(
    input.book,
    input.now,
    input.staleAfterMs,
  );
  if (!currentCheck.valid)
    return {
      state: "filtered",
      reasons: [currentCheck.reason],
      features: null,
      scenario: null,
    };
  if (
    !nonNegative(input.triggerMinimumSize) ||
    !finite(input.triggerImbalanceRatio) ||
    input.triggerImbalanceRatio <= 0 ||
    input.triggerImbalanceRatio > 1 ||
    !positive(input.paperRiskCapQuantity)
  )
    return {
      state: "filtered",
      reasons: [
        "triggerMinimumSize, triggerImbalanceRatio in (0, 1], and paperRiskCapQuantity must be valid caller-supplied values.",
      ],
      features: null,
      scenario: null,
    };

  const current = currentCheck.book;
  const features = calculateBboImbalance(current.bidSize, current.askSize);
  if (!features)
    return {
      state: "filtered",
      reasons: ["Positive BBO sizes are required."],
      features: null,
      scenario: null,
    };

  const reasons: string[] = [];
  if (!input.cooldownElapsed) reasons.push("Cooldown has not elapsed.");
  if (features.largerSize <= input.triggerMinimumSize)
    reasons.push(
      "Larger BBO size does not strictly exceed the caller-supplied trigger minimum.",
    );
  if (features.ratio >= input.triggerImbalanceRatio)
    reasons.push(
      "BBO min/max ratio is not strictly below the caller-supplied imbalance trigger.",
    );
  if (features.dominantSide === "balanced")
    reasons.push("BBO sizes are balanced.");
  const quantity = floorToLot(
    Math.min(features.thinnerSize, input.paperRiskCapQuantity),
    current.lotSize,
  );
  if (!positive(quantity))
    reasons.push("No lot-compliant quantity remains under the paper risk cap.");
  if (reasons.length)
    return { state: "filtered", reasons, features, scenario: null };

  const buy = features.dominantSide === "bid";
  return {
    state: "educational-scenario",
    reasons: [
      "Filtered BBO condition met; this is an educational contemporaneous-cross stress scenario only, not an actual execution or fill claim.",
    ],
    features,
    scenario: {
      label: "BBO-cross stress scenario",
      direction: buy ? "buy" : "sell",
      referencePrice: buy ? current.bestAsk : current.bestBid,
      quantity,
      note: "Reference only. No order, FOK assertion, queue position, fill, PnL, or executable result is modeled.",
    },
  };
}
