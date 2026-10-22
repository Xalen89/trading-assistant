import { SECONDS } from "./engine";
import {
  calculateBboImbalance,
  educationalBboCrossScenario,
  proposePmmPaperLevels,
  validateResearchBookSnapshot,
} from "./market-making-methods";
import type { Candle, Timeframe } from "./model";
import {
  emptyQuantResult,
  type QuantBook,
  type QuantLabInput,
  type QuantLabResult,
  type QuantMetric,
  type QuantSeries,
  type QuantSettings,
} from "./quant-lab-types";

const MAX_ASSETS = 8;
const MAX_BARS_PER_ASSET = 5_000;
const MAX_BOOK_LEVELS_PER_SIDE = 1_000;
const MILLIS_FLOOR = 10_000_000_000;
const IMBALANCE_CENTER_WEIGHT = 0.25;
const INVENTORY_CENTER_WEIGHT = 0.25;
const MIN_RESOLVED_OUTCOMES = 100;
const WEBSOCKET_STALE_AFTER_MS = 10_000;

type BookLevel = { price: number; quantity: number };
type LevelInspection = {
  levels: BookLevel[];
  excluded: number;
  omitted: number;
};
type BarInspection = {
  selectedAssets: number;
  omittedAssets: number;
  providerSeries: number;
  importedSeries: number;
  unknownProvenanceSeries: number;
  closedBars: number;
  excludedBars: number;
  duplicateBars: number;
  irregularGaps: number;
  futureFetchedSeries: number;
};
type ValidSettings = Pick<
  QuantSettings,
  | "feeBps"
  | "slippageBps"
  | "startingEquity"
  | "inventory"
  | "orderSize"
  | "maxInventory"
>;

const DATA_REQUIREMENTS = [
  "One supplied, uncrossed venue L2 snapshot for the planned symbol, with positive finite price/size levels and tick/lot metadata.",
  "User-supplied feeBps and slippageBps assumptions; no venue fee, rebate, or latency cost is inferred.",
  `For any performance claim: at least ${MIN_RESOLVED_OUTCOMES} independent resolved quote outcomes with actual queue/fill/cancel/latency records, chronological walk-forward, and a one-use untouched OOS holdout.`,
];

const LIMITATIONS = [
  "Paper quote plan only. This module neither sends nor simulates orders.",
  "A single L2 snapshot cannot establish queue priority, partial fills, cancellations, refresh latency, adverse selection, or quote persistence.",
  "No fill, return, PnL, equity curve, rebate, or performance statistic is inferred from this snapshot.",
  "Depth imbalance and the inventory center adjustment are unvalidated research rules, not predictive signals.",
  "Candle inputs are quality diagnostics only; they are never joined to L2 data or used to manufacture quote outcomes.",
  "QuantBook exposes a source label but no provider/user-import provenance field; the L2 source label is reported separately and never merged with series provenance.",
];

/**
 * Method citation: research/foundry-audit/making.md §§Data boundary, Unvalidated
 * candidates, and Gates. The local audit requires genuine L2 plus actual queue/fill
 * evidence before performance validation; therefore this snapshot-only calculation
 * stays paper-only and keeps its OOS status unconfirmed.
 */

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function positive(value: unknown): value is number {
  return finite(value) && value > 0;
}

function finiteMillis(value: unknown): value is number {
  return finite(value) && value >= MILLIS_FLOOR;
}

function nonNegative(value: unknown): value is number {
  return finite(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toStableNumber(value: number): number {
  return Number(value.toPrecision(15));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function floorToTick(price: number, tickSize: number): number {
  return toStableNumber(Math.floor(price / tickSize + 1e-10) * tickSize);
}

function ceilToTick(price: number, tickSize: number): number {
  return toStableNumber(Math.ceil(price / tickSize - 1e-10) * tickSize);
}

function floorToLot(
  requested: number,
  remainingCapacity: number,
  lotSize: number,
): number {
  const requestedLots = Math.floor(requested / lotSize + 1e-10);
  const capacityLots = Math.floor(remainingCapacity / lotSize + 1e-10);
  return toStableNumber(
    Math.max(0, Math.min(requestedLots, capacityLots)) * lotSize,
  );
}

function validCandle(value: unknown): value is Candle {
  if (!isRecord(value)) return false;
  const candle = value as Partial<Candle>;
  return (
    positive(candle.time) &&
    positive(candle.open) &&
    positive(candle.high) &&
    positive(candle.low) &&
    positive(candle.close) &&
    nonNegative(candle.volume) &&
    candle.high >= Math.max(candle.open, candle.close) &&
    candle.low <= Math.min(candle.open, candle.close)
  );
}

function inspectClosedBars(series: unknown, now: number): BarInspection {
  const inputSeries = Array.isArray(series) ? series : [];
  const selected = inputSeries.slice(0, MAX_ASSETS);
  const inspection: BarInspection = {
    selectedAssets: selected.length,
    omittedAssets: Math.max(0, inputSeries.length - selected.length),
    providerSeries: 0,
    importedSeries: 0,
    unknownProvenanceSeries: 0,
    closedBars: 0,
    excludedBars: 0,
    duplicateBars: 0,
    irregularGaps: 0,
    futureFetchedSeries: 0,
  };

  for (const candidate of selected) {
    if (!isRecord(candidate)) {
      inspection.unknownProvenanceSeries += 1;
      continue;
    }
    const item = candidate as Partial<QuantSeries>;
    if (item.provenance === "provider") inspection.providerSeries += 1;
    else if (item.provenance === "user-import") inspection.importedSeries += 1;
    else inspection.unknownProvenanceSeries += 1;

    const seconds =
      typeof item.timeframe === "string"
        ? SECONDS[item.timeframe as Timeframe]
        : undefined;
    if (!seconds || !finiteMillis(item.fetchedAt) || item.fetchedAt > now) {
      inspection.futureFetchedSeries += 1;
      continue;
    }

    const rawBars = Array.isArray(item.candles)
      ? item.candles.slice(-MAX_BARS_PER_ASSET)
      : [];
    const unique = new Map<number, Candle>();
    const duplicateTimes = new Set<number>();
    for (const rawBar of rawBars) {
      if (!validCandle(rawBar)) {
        inspection.excludedBars += 1;
        continue;
      }
      if (rawBar.time + seconds > now / 1_000) {
        inspection.excludedBars += 1;
        continue;
      }
      if (duplicateTimes.has(rawBar.time)) {
        inspection.duplicateBars += 1;
        continue;
      }
      if (unique.has(rawBar.time)) {
        // Do not choose or merge conflicting versions of one bar.
        unique.delete(rawBar.time);
        duplicateTimes.add(rawBar.time);
        inspection.duplicateBars += 2;
        continue;
      }
      unique.set(rawBar.time, rawBar);
    }

    const bars = [...unique.values()].sort(
      (left, right) => left.time - right.time,
    );
    inspection.closedBars += bars.length;
    for (let index = 1; index < bars.length; index += 1) {
      if (bars[index].time - bars[index - 1].time !== seconds) {
        inspection.irregularGaps += 1;
      }
    }
  }
  return inspection;
}

function inspectLevels(raw: unknown, side: "bid" | "ask"): LevelInspection {
  const input = Array.isArray(raw) ? raw : [];
  const bounded = input.slice(0, MAX_BOOK_LEVELS_PER_SIDE);
  const candidates: BookLevel[] = [];
  let excluded = 0;
  const occurrences = new Map<number, number>();

  for (const level of bounded) {
    if (
      !Array.isArray(level) ||
      level.length < 2 ||
      !positive(level[0]) ||
      !positive(level[1])
    ) {
      excluded += 1;
      continue;
    }
    const parsed = { price: level[0], quantity: level[1] };
    candidates.push(parsed);
    occurrences.set(parsed.price, (occurrences.get(parsed.price) || 0) + 1);
  }

  // Duplicate price levels are excluded, rather than summed or arbitrarily selected.
  const levels = candidates
    .filter((level) => occurrences.get(level.price) === 1)
    .sort((left, right) =>
      side === "bid" ? right.price - left.price : left.price - right.price,
    );
  excluded += candidates.length - levels.length;
  return {
    levels,
    excluded,
    omitted: Math.max(0, input.length - bounded.length),
  };
}

function readSettings(settings: unknown): {
  value?: ValidSettings;
  reason?: string;
} {
  if (!isRecord(settings)) return { reason: "Quant settings are missing." };
  const candidate = settings as Partial<QuantSettings>;
  if (!nonNegative(candidate.feeBps) || !nonNegative(candidate.slippageBps)) {
    return {
      reason:
        "feeBps and slippageBps must be finite, non-negative user-supplied values.",
    };
  }
  if (!finite(candidate.inventory)) {
    return { reason: "Inventory must be finite." };
  }
  if (
    !positive(candidate.startingEquity) ||
    !positive(candidate.orderSize) ||
    !positive(candidate.maxInventory)
  ) {
    return {
      reason:
        "startingEquity, orderSize, and maxInventory must be finite positive values.",
    };
  }
  return {
    value: {
      feeBps: candidate.feeBps,
      slippageBps: candidate.slippageBps,
      startingEquity: candidate.startingEquity,
      inventory: candidate.inventory,
      orderSize: candidate.orderSize,
      maxInventory: candidate.maxInventory,
    },
  };
}

function baseValidation(): QuantLabResult["validation"] {
  return {
    status: "unconfirmed",
    actualSamples: 0,
    trainSamples: 0,
    testSamples: 0,
    walkForward: false,
    untouchedHoldout: false,
    reasons: [
      `0 independent resolved quote outcomes were supplied; minimum is ${MIN_RESOLVED_OUTCOMES}.`,
      "A single snapshot cannot provide chronological walk-forward or a one-use untouched OOS holdout.",
      "No actual queue, fill, partial-fill, cancel, latency, or adverse-selection records were supplied.",
    ],
  };
}

function insufficient(summary: string, reasons: string[]): QuantLabResult {
  const result = emptyQuantResult("making", "Market making", summary, reasons);
  return {
    ...result,
    dataRequirements: [...DATA_REQUIREMENTS, ...reasons],
    limitations: LIMITATIONS,
    validation: baseValidation(),
  };
}

function unavailable(
  summary: string,
  reasons: string[],
  metrics: QuantMetric[] = [],
  asOf = 0,
): QuantLabResult {
  return {
    family: "making",
    status: "unavailable",
    title: "Market making",
    summary,
    asOf,
    metrics,
    signals: [],
    equity: [],
    validation: baseValidation(),
    dataRequirements: [...DATA_REQUIREMENTS, ...reasons],
    limitations: LIMITATIONS,
  };
}

function bookFields(book: unknown): {
  value?: QuantBook;
  reason?: string;
} {
  if (!isRecord(book))
    return {
      reason:
        "A venue L2 book is required; OHLC or midpoint quotes are not a substitute.",
    };
  const candidate = book as Partial<QuantBook>;
  if (typeof candidate.symbol !== "string" || !candidate.symbol.trim()) {
    return { reason: "The L2 book must identify its symbol." };
  }
  if (typeof candidate.source !== "string" || !candidate.source.trim()) {
    return { reason: "The L2 book must retain its source label." };
  }
  if (!finiteMillis(candidate.receivedAt)) {
    return {
      reason:
        "The L2 book receivedAt timestamp must be a positive Unix-millisecond value.",
    };
  }
  if (!positive(candidate.tickSize) || !positive(candidate.lotSize)) {
    return {
      reason:
        "Positive finite tickSize and lotSize are required for a constrained paper quote.",
    };
  }
  if (candidate.status !== "polled" && candidate.status !== "streamed") {
    return {
      reason: "The L2 book must disclose whether it was polled or streamed.",
    };
  }
  if (!Array.isArray(candidate.bids) || !Array.isArray(candidate.asks)) {
    return { reason: "The L2 book must supply bid and ask depth arrays." };
  }
  return { value: candidate as QuantBook };
}

/**
 * Builds a current, tick/lot-constrained paper quote plan from one supplied L2
 * snapshot. It deliberately has no network, AI, persistence, order, fill, queue,
 * PnL, return, or backtest behavior.
 */
export function runMarketMaking(input: QuantLabInput): QuantLabResult {
  if (!isRecord(input) || input.family !== "making") {
    return unavailable(
      "Market-making analysis accepts only a Quant Lab input with family 'making'.",
      ["The supplied family is not 'making'."],
    );
  }
  if (!finiteMillis(input.now)) {
    return unavailable(
      "A finite Unix-millisecond now timestamp is required; no current snapshot can be evaluated without it.",
      ["now must be a positive finite Unix-millisecond timestamp."],
    );
  }
  if (!Array.isArray(input.series)) {
    return insufficient(
      "Series diagnostics must be an array even when the current L2 snapshot is the only input used for quoting.",
      ["series must be an array; no bar data is synthesized."],
    );
  }
  if (input.series.length > MAX_ASSETS) {
    return insufficient(
      "The market-making runner is deliberately bounded for mobile/server use.",
      [
        `Limit the input to at most ${MAX_ASSETS} assets; no assets were silently dropped.`,
      ],
    );
  }
  const oversized = input.series.find(
    (series) =>
      isRecord(series) &&
      Array.isArray(series.candles) &&
      series.candles.length > MAX_BARS_PER_ASSET,
  );
  if (oversized) {
    const symbol =
      typeof oversized.symbol === "string" ? oversized.symbol : "An asset";
    return insufficient(
      "The market-making runner does not truncate supplied history before diagnostics.",
      [
        `${symbol} has more than ${MAX_BARS_PER_ASSET} bars; provide at most ${MAX_BARS_PER_ASSET} bars per asset.`,
      ],
    );
  }

  const settings = readSettings(input.settings);
  if (!settings.value) {
    return insufficient(
      "The paper quote plan cannot be calculated from invalid settings.",
      [settings.reason!],
    );
  }

  const bookInput = bookFields(input.book);
  if (!bookInput.value) {
    return insufficient(
      "No usable venue L2 snapshot is available for a paper quote plan.",
      [bookInput.reason!],
    );
  }
  const book = bookInput.value;
  if (book.receivedAt > input.now) {
    return insufficient(
      "The L2 snapshot is timestamped after now and is excluded rather than treated as current data.",
      ["Book receivedAt is in the future relative to now."],
    );
  }

  const bids = inspectLevels(book.bids, "bid");
  const asks = inspectLevels(book.asks, "ask");
  if (!bids.levels.length || !asks.levels.length) {
    return insufficient(
      "The L2 snapshot has no usable positive bid and ask depth after invalid and duplicate levels are excluded.",
      ["At least one unique, positive finite bid and ask level is required."],
    );
  }

  const cleanStreamedBook = {
    ...book,
    bids: bids.levels.map((level): [number, number] => [
      level.price,
      level.quantity,
    ]),
    asks: asks.levels.map((level): [number, number] => [
      level.price,
      level.quantity,
    ]),
  };
  const currentBook = validateResearchBookSnapshot(
    cleanStreamedBook,
    input.now,
    WEBSOCKET_STALE_AFTER_MS,
  );
  if (!currentBook.valid) {
    return insufficient(
      "No current paper quote is produced because the venue snapshot receipt is not valid at now.",
      [currentBook.reason],
    );
  }

  const bestBid = bids.levels[0].price;
  const bestAsk = asks.levels[0].price;
  if (bestBid >= bestAsk) {
    return insufficient(
      "The supplied L2 snapshot is crossed or locked and is not used to construct a paper quote.",
      ["Best bid must be strictly below best ask."],
    );
  }
  if (
    bestAsk / book.tickSize > Number.MAX_SAFE_INTEGER / 4 ||
    bestBid / book.tickSize > Number.MAX_SAFE_INTEGER / 4
  ) {
    return insufficient(
      "The supplied price/tick ratio cannot be rounded safely in JavaScript, so no tick-constrained quote is emitted.",
      ["Price divided by tickSize exceeds the safe integer precision bound."],
    );
  }

  const bars = inspectClosedBars(input.series, input.now);
  const topBids = bids.levels.slice(0, 5);
  const topAsks = asks.levels.slice(0, 5);
  const bidDepth = topBids.reduce((sum, level) => sum + level.quantity, 0);
  const askDepth = topAsks.reduce((sum, level) => sum + level.quantity, 0);
  const depthImbalance = (bidDepth - askDepth) / (bidDepth + askDepth);
  const spread = bestAsk - bestBid;
  const mid = (bestBid + bestAsk) / 2;
  const spreadBps = (spread / mid) * 10_000;
  const bboImbalance = calculateBboImbalance(
    bids.levels[0].quantity,
    asks.levels[0].quantity,
  );
  // Positive best-level quantities have already been validated above.
  if (!bboImbalance)
    return unavailable(
      "The current BBO has no finite positive size pair for an educational imbalance diagnostic.",
      ["Positive best-bid and best-ask sizes are required."],
      [],
      book.receivedAt,
    );
  const perSideCostBps = settings.value.feeBps + settings.value.slippageBps;
  const twoSidedCostBps = perSideCostBps * 2;
  const costAllowance = (mid * perSideCostBps) / 10_000;
  const inventoryRatio = clamp(
    settings.value.inventory / settings.value.maxInventory,
    -1,
    1,
  );
  const imbalanceShift = depthImbalance * spread * IMBALANCE_CENTER_WEIGHT;
  const inventoryShift = inventoryRatio * spread * INVENTORY_CENTER_WEIGHT;
  const quoteCenter = clamp(
    mid + imbalanceShift - inventoryShift,
    bestBid,
    bestAsk,
  );
  const bboScenario = educationalBboCrossScenario({
    book: cleanStreamedBook,
    now: input.now,
    staleAfterMs: WEBSOCKET_STALE_AFTER_MS,
    triggerMinimumSize: 0,
    triggerImbalanceRatio: 0.2,
    cooldownElapsed: true,
    paperRiskCapQuantity: settings.value.maxInventory,
  });

  const metrics: QuantMetric[] = [
    { key: "l2-source", label: "L2 source label", value: book.source },
    { key: "l2-status", label: "L2 delivery", value: book.status },
    {
      key: "book-age-ms",
      label: "Book age at now",
      value: input.now - book.receivedAt,
      unit: "ms",
    },
    { key: "best-bid", label: "Best bid", value: bestBid },
    { key: "best-ask", label: "Best ask", value: bestAsk },
    { key: "mid", label: "Midpoint", value: mid },
    { key: "spread", label: "Quoted spread", value: spread },
    {
      key: "spread-bps",
      label: "Quoted spread",
      value: spreadBps,
      unit: "bps",
    },
    {
      key: "bid-depth-5",
      label: "Bid depth (up to five levels)",
      value: bidDepth,
    },
    {
      key: "ask-depth-5",
      label: "Ask depth (up to five levels)",
      value: askDepth,
    },
    {
      key: "depth-imbalance",
      label: "Top-five depth imbalance",
      value: depthImbalance,
    },
    {
      key: "bbo-size-ratio",
      label: "BBO min/max size ratio",
      value: bboImbalance.ratio,
    },
    {
      key: "bbo-signed-imbalance",
      label: "BBO signed imbalance",
      value: bboImbalance.signedImbalance,
    },
    {
      key: "websocket-receipt-age-ms",
      label: `Venue receipt age (${book.status}; research only)`,
      value: currentBook.book.ageMs,
      unit: "ms",
    },
    {
      key: "inventory",
      label: "Supplied inventory",
      value: settings.value.inventory,
    },
    {
      key: "inventory-cap",
      label: "Inventory cap",
      value: settings.value.maxInventory,
    },
    {
      key: "inventory-ratio",
      label: "Capped inventory ratio",
      value: inventoryRatio,
    },
    {
      key: "quote-center",
      label: "Inventory-adjusted quote center",
      value: quoteCenter,
    },
    {
      key: "fee-bps",
      label: "User-supplied fee allowance",
      value: settings.value.feeBps,
      unit: "bps",
    },
    {
      key: "slippage-bps",
      label: "User-supplied slippage allowance",
      value: settings.value.slippageBps,
      unit: "bps",
    },
    {
      key: "expected-slippage-per-side",
      label: "Expected slippage per side",
      value: (mid * settings.value.slippageBps) / 10_000,
      unit: "price units",
    },
    {
      key: "cost-source",
      label: "Cost source",
      value:
        "feeBps and slippageBps are user-supplied assumptions; no venue fee, rebate, impact, or latency cost is inferred.",
    },
    {
      key: "two-sided-cost-bps",
      label: "User-supplied two-sided cost allowance",
      value: twoSidedCostBps,
      unit: "bps",
    },
    {
      key: "provider-series",
      label: "Provider series inspected separately",
      value: bars.providerSeries,
    },
    {
      key: "imported-series",
      label: "User-import series inspected separately",
      value: bars.importedSeries,
    },
    {
      key: "closed-bars-diagnostic",
      label: "Unique closed bars (diagnostic only)",
      value: bars.closedBars,
    },
    {
      key: "duplicate-bars-excluded",
      label: "Duplicate bars excluded",
      value: bars.duplicateBars,
    },
    {
      key: "irregular-bar-gaps",
      label: "Irregular bar gaps observed",
      value: bars.irregularGaps,
    },
    {
      key: "book-levels-excluded",
      label: "Invalid or duplicate book levels excluded",
      value: bids.excluded + asks.excluded,
    },
    {
      key: "bbo-cross-education",
      label: "BBO-cross education filter",
      value:
        bboScenario.state === "educational-scenario"
          ? "Educational BBO-cross stress scenario only; never an execution or fill claim."
          : `Filtered: ${bboScenario.reasons.join(" ")}`,
    },
  ];

  if (spreadBps <= twoSidedCostBps) {
    return {
      family: "making",
      status: "ready",
      title: "Market making",
      summary:
        "The current L2 snapshot is descriptive only: its quoted spread does not exceed the supplied two-sided fee and slippage allowance, so no paper quote is proposed.",
      asOf: book.receivedAt,
      metrics,
      signals: [
        {
          at: Math.floor(book.receivedAt / 1_000),
          symbol: book.symbol,
          direction: "flat",
          strength: Math.abs(depthImbalance),
          reason:
            "No paper quote: the user-supplied two-sided cost allowance consumes the displayed spread.",
        },
      ],
      equity: [],
      validation: baseValidation(),
      dataRequirements: DATA_REQUIREMENTS,
      limitations: LIMITATIONS,
    };
  }

  const pmmProposal = proposePmmPaperLevels({
    researchSnapshot: true,
    book: cleanStreamedBook,
    now: input.now,
    staleAfterMs: WEBSOCKET_STALE_AFTER_MS,
    costs: {
      feeBps: settings.value.feeBps,
      expectedSlippageBps: settings.value.slippageBps,
    },
    risk: {
      currentEquity: settings.value.startingEquity,
      equityRiskCap: settings.value.startingEquity,
      maxInventory: settings.value.maxInventory,
    },
    syntheticInventory: settings.value.inventory,
    targetInventory: 0,
    referencePrice: quoteCenter,
    minimumSpreadBps: Math.max(spreadBps, twoSidedCostBps),
    levels: [
      {
        level: 1,
        bidSpreadBps: spreadBps / 2,
        askSpreadBps: spreadBps / 2,
        amount: settings.value.orderSize,
      },
    ],
  });
  if (!pmmProposal.available) {
    return unavailable(
      "The current L2 snapshot did not produce a validated PMM paper proposal.",
      [pmmProposal.reason ?? "No PMM proposal is available."],
      metrics,
      book.receivedAt,
    );
  }

  const legs: NonNullable<QuantLabResult["paperPlan"]>["legs"] = [
    ...pmmProposal.bidLevels.map((level) => ({
      symbol: book.symbol,
      side: "long" as const,
      referencePrice: level.price,
      quantity: level.quantity,
    })),
    ...pmmProposal.askLevels.map((level) => ({
      symbol: book.symbol,
      side: "short" as const,
      referencePrice: level.price,
      quantity: level.quantity,
    })),
  ];
  const paperBid = pmmProposal.bidLevels[0];
  const paperAsk = pmmProposal.askLevels[0];
  metrics.push(
    {
      key: "paper-bid",
      label: "PMM paper bid target",
      value: paperBid?.price ?? null,
    },
    {
      key: "paper-ask",
      label: "PMM paper ask target",
      value: paperAsk?.price ?? null,
    },
    {
      key: "paper-bid-quantity",
      label: "Paper bid quantity",
      value: paperBid?.quantity ?? null,
    },
    {
      key: "paper-ask-quantity",
      label: "Paper ask quantity",
      value: paperAsk?.quantity ?? null,
    },
    {
      key: "pmm-proposed-levels",
      label: "Readonly PMM proposed levels",
      value: `${pmmProposal.bidLevels.length} bid / ${pmmProposal.askLevels.length} ask; tick, lot, inventory, and current-equity caps validated.`,
    },
  );

  if (!legs.length) {
    return unavailable(
      "The supplied order size has no positive lot-compliant capacity within the inventory cap, so no paper quote is proposed.",
      ["At least one side needs one full lot of remaining inventory capacity."],
      metrics,
      book.receivedAt,
    );
  }

  return {
    family: "making",
    status: "ready",
    title: "Market making",
    summary: `${book.source} L2 snapshot produced ${legs.length} tick/lot-constrained paper quote${legs.length === 1 ? "" : "s"}; no fills, returns, or performance outcomes are simulated.`,
    asOf: book.receivedAt,
    metrics,
    signals: [
      {
        at: Math.floor(book.receivedAt / 1_000),
        symbol: book.symbol,
        direction: "flat",
        strength: Math.abs(depthImbalance),
        reason:
          "Current top-five L2 depth and inventory-adjusted center produced a paper-only passive quote plan.",
      },
    ],
    equity: [],
    validation: baseValidation(),
    dataRequirements: DATA_REQUIREMENTS,
    limitations: LIMITATIONS,
    paperPlan: {
      description:
        "Tick/lot-constrained passive paper quote targets only. No order is sent and no fill, queue, return, or PnL is assumed.",
      legs,
    },
  };
}
