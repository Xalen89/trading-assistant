export type Category =
  | "Crypto"
  | "Forex"
  | "Metals"
  | "Indices"
  | "Stocks"
  | "Futures";
export type Timeframe = "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d" | "1w";
export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};
export type Market = {
  id: string;
  name: string;
  category: Category;
  provider: "coinbase" | "fmp" | "pending" | "tradelocker";
  providerSymbol: string;
  precision: number;
  pointValue: number;
  paperSupported?: boolean;
  valuationSymbol?: string;
};
export type Quote = {
  symbol: string;
  price: number;
  change: number;
  changeAvailable?: boolean;
  bid?: number;
  ask?: number;
  timestampKind?: "provider" | "received";
  timestamp: number;
  source: string;
  /** Opaque exact origin when a provider/account/route declares one. */
  sourceIdentity?: string;
  status: "live" | "stale" | "unavailable";
  message?: string;
};
export type Factor = {
  id: string;
  name: string;
  group: string;
  weight: number;
  enabled: boolean;
  description: string;
  page?: number;
};
export type Strategy = {
  id: string;
  name: string;
  description: string;
  color: string;
  kind: "reference" | "strategy" | "style";
  setupFamily?: import("./setup-model").SetupFamily;
  confluence?: import("./confluence-runtime").ConfluenceRuleConfig;
  quantRule?: import("./no-code-quant").NoCodeQuantRule;
  orbConfig?: import("./orb-model").OrbConfig;
  sessionConfig?: import("./session-strategy-model").SessionStrategyConfig;
  factors: Factor[];
  visible: boolean;
  version: number;
  source?: string;
  archived?: boolean;
  history?: {
    version: number;
    name: string;
    description: string;
    factors: Factor[];
    orbConfig?: import("./orb-model").OrbConfig;
    sessionConfig?: import("./session-strategy-model").SessionStrategyConfig;
    at: number;
  }[];
};
export type Pattern = {
  id: string;
  name: string;
  tags: string[];
  kind: "pattern" | "style";
  strategyId: string;
  market: string;
  timeframe: Timeframe;
  notes: string;
  filename?: string;
  mime?: string;
  fileKey?: string;
  imageUri?: string;
  status: "uploaded" | "analyzing" | "review" | "ready" | "failed";
  description?: string;
  rules?: string[];
  createdAt: number;
  version: number;
  feedback: { label: string; note: string; at: number }[];
  tradeReview?: import("./trade-screenshot-types").TradeScreenshotReview;
  blueprint?: import("./library-blueprint-types").LibraryBlueprint;
  visualIndex?: import("./research").VisualIndex;
};
export type ReferenceSnapshot = {
  id: string;
  name: string;
  version: number;
  description: string;
  rules: string[];
  filename?: string;
};
export type Match = {
  id: string;
  patternId?: string;
  reference?: ReferenceSnapshot;
  name: string;
  strategyId: string;
  strategyVersion: number;
  market: string;
  timeframe: Timeframe;
  evidence: string[];
  missing: string[];
  confidence?: number;
  method?: "ai-reference" | "opencv";
  status: "candidate" | "confirmed" | "rejected";
  createdAt: number;
  startIndex?: number;
  endIndex?: number;
};
export type Trade = {
  id: string;
  market: string;
  valuationSymbol?: string;
  side: "long" | "short";
  status: "pending" | "open" | "closed" | "cancelled";
  entry: number;
  stop: number;
  target: number;
  quantity: number;
  pointValue: number;
  strategyId: string;
  strategyName: string;
  strategyVersion: number;
  factors: string[];
  journal: Record<string, string>;
  createdAt: number;
  openedAt?: number;
  closedAt?: number;
  cancelledAt?: number;
  exit?: number;
  review?: string;
  aiReview?: string;
  version?: number;
  orderType?: "market" | "limit";
  autoManage?: boolean;
  initialRisk?: number;
  initialQuantity?: number;
  originalStop?: number;
  originalTarget?: number;
  partialAt?: number;
  partialTaken?: boolean;
  realizedPnl?: number;
  strategyIds?: string[];
  setupId?: string;
  timeframe?: Timeframe;
  strategyVersions?: number[];
  combination?: "all" | "any";
  snapshotPhase?: "entry" | "placement" | "unknown";
  gatePendingReason?: string;
  excursion?: {
    maeR: number;
    mfeR: number;
    observedAt: number;
    samples: number;
    method: "observed-quotes";
    sampling?: "foreground-sampled-not-full-tick-path";
  };
  entryMode?: "practice" | "strategy";
  confluenceSnapshots?: import("./confluence-contract").ConfluenceEvaluationSnapshot[];
  entryFeatures?: import("./trade-features").TradeFeatureSnapshot;
  events?: PaperTradeEvent[];
};
export type AlertRule = {
  id: string;
  name: string;
  market: string;
  timeframe: Timeframe;
  strategyId: string;
  kind:
    | "above"
    | "below"
    | "fvg"
    | "setup"
    | "scenario-change"
    | "scenario-direction"
    | "confluence"
    | "below-gate";
  minimumPoints?: number;
  minimumConditions?: number;
  combinedStrategyIds?: string[];
  price: number;
  enabled: boolean;
  cooldownMinutes: number;
  createdAt: number;
  lastTriggeredAt?: number;
  lastEvaluatedAt?: number;
  deferredCount?: number;
  priority?: "low" | "normal" | "high";
};
export type AlertEvent = {
  id: string;
  ruleId: string;
  market: string;
  timeframe: Timeframe;
  strategyId: string;
  strategyVersion?: number;
  evidence?: string[];
  providerTimestamp?: number;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
  price: number;
  source: string;
  delivery?: string;
  setup?: import("./setup-model").SetupAnalysis;
};
export type Level = {
  id: string;
  strategyId: string;
  market: string;
  name: string;
  price: number;
  color: string;
};
export type Workspace = {
  schemaVersion: 1;
  strategies: Strategy[];
  patterns: Pattern[];
  matches: Match[];
  trades: Trade[];
  alerts: AlertRule[];
  events: AlertEvent[];
  levels: Level[];
  activeStrategyId: string;
  market: string;
  timeframe: Timeframe;
  favorites: string[];
  confirmations: Record<string, boolean>;
  overlays: Record<string, boolean>;
  settings: {
    timezone: string;
    weeklyBias: "Bullish" | "Bearish" | "Neutral";
    sampleMode: boolean;
    futureOverlay: boolean;
    adaptation: boolean;
    dailyDrawdownLimitPct?: number;
    analysisStrategyIds?: string[];
    combination?: "all" | "any";
    scenarioStyle?: "line" | "candles" | "both";
    scenarioLayers?: import("./scenario-layer-types").ScenarioLayer[];
    paperRiskPct?: number;
    autoPaperManage?: boolean;
    orbAutoPaper?: import("./orb-auto-types").OrbAutoPaperSettings;
    sessionAutoPaper?: import("./session-auto-types").SessionAutoSettings;
    cooldownMinutes?: number;
    maxTradesPerDay?: number;
    enforceCooldown?: boolean;
    chartSessions?: import("./chart-sessions").SessionOverlayPrefs;
    clockTimezones?: string[];
    enforceOvertrading?: boolean;
    enforceRiskEscalation?: boolean;
    enforceLossStreak?: boolean;
    guardChangeReason?: string;
    autoCloudSave?: boolean;
    hideValuesOnBackground?: boolean;
    aiQuality?: import("./ai-quality").AIQuality;
    aiRateLimits?: Partial<
      Record<"coach" | "forecast" | "source-analysis", number>
    >;
    notificationPreferences?: Record<
      string,
      { sound: boolean; badge: boolean }
    >;
  };
  paperStartingBalance: number;
};

export const MARKETS: Market[] = [
  {
    id: "BTC-USD",
    name: "Bitcoin",
    category: "Crypto",
    provider: "coinbase",
    providerSymbol: "BTC-USD",
    precision: 2,
    pointValue: 1,
  },
  {
    id: "ETH-USD",
    name: "Ethereum",
    category: "Crypto",
    provider: "coinbase",
    providerSymbol: "ETH-USD",
    precision: 2,
    pointValue: 1,
  },
  {
    id: "SOL-USD",
    name: "Solana",
    category: "Crypto",
    provider: "coinbase",
    providerSymbol: "SOL-USD",
    precision: 2,
    pointValue: 1,
  },
  {
    id: "XRP-USD",
    name: "XRP",
    category: "Crypto",
    provider: "coinbase",
    providerSymbol: "XRP-USD",
    precision: 4,
    pointValue: 1,
  },
  {
    id: "ADA-USD",
    name: "Cardano",
    category: "Crypto",
    provider: "coinbase",
    providerSymbol: "ADA-USD",
    precision: 4,
    pointValue: 1,
  },
  {
    id: "DOGE-USD",
    name: "Dogecoin",
    category: "Crypto",
    provider: "coinbase",
    providerSymbol: "DOGE-USD",
    precision: 5,
    pointValue: 1,
  },
  {
    id: "EURUSD",
    name: "Euro / US Dollar",
    category: "Forex",
    provider: "fmp",
    providerSymbol: "EURUSD",
    precision: 5,
    pointValue: 1,
  },
  {
    id: "GBPUSD",
    name: "British Pound / US Dollar",
    category: "Forex",
    provider: "fmp",
    providerSymbol: "GBPUSD",
    precision: 5,
    pointValue: 1,
  },
  {
    id: "USDJPY",
    name: "US Dollar / Japanese Yen",
    category: "Forex",
    provider: "fmp",
    providerSymbol: "USDJPY",
    precision: 3,
    pointValue: 1,
  },
  {
    id: "AUDUSD",
    name: "Australian Dollar / US Dollar",
    category: "Forex",
    provider: "fmp",
    providerSymbol: "AUDUSD",
    precision: 5,
    pointValue: 1,
  },
  {
    id: "USDCAD",
    name: "US Dollar / Canadian Dollar",
    category: "Forex",
    provider: "fmp",
    providerSymbol: "USDCAD",
    precision: 5,
    pointValue: 1,
  },
  {
    id: "XAUUSD",
    name: "Gold / US Dollar",
    category: "Metals",
    provider: "fmp",
    providerSymbol: "XAUUSD",
    precision: 2,
    pointValue: 1,
  },
  {
    id: "XAGUSD",
    name: "Silver / US Dollar",
    category: "Metals",
    provider: "fmp",
    providerSymbol: "XAGUSD",
    precision: 3,
    pointValue: 1,
  },
  {
    id: "WTI",
    name: "WTI Crude Oil (commodity)",
    category: "Metals",
    provider: "fmp",
    providerSymbol: "CLUSD",
    precision: 2,
    pointValue: 1,
  },
  {
    id: "SPX",
    name: "S&P 500 Cash Index",
    category: "Indices",
    provider: "fmp",
    providerSymbol: "^GSPC",
    precision: 2,
    pointValue: 1,
  },
  {
    id: "NDX",
    name: "Nasdaq 100 Cash Index",
    category: "Indices",
    provider: "fmp",
    providerSymbol: "^NDX",
    precision: 2,
    pointValue: 1,
  },
  {
    id: "DJI",
    name: "Dow Jones Cash Index",
    category: "Indices",
    provider: "fmp",
    providerSymbol: "^DJI",
    precision: 2,
    pointValue: 1,
  },
  {
    id: "VIX",
    name: "CBOE Volatility Index",
    category: "Indices",
    provider: "fmp",
    providerSymbol: "^VIX",
    precision: 2,
    pointValue: 1,
  },
  ...[
    ["AAPL", "Apple"],
    ["MSFT", "Microsoft"],
    ["NVDA", "NVIDIA"],
    ["TSLA", "Tesla"],
    ["AMZN", "Amazon"],
    ["GOOGL", "Alphabet"],
    ["META", "Meta"],
    ["SPY", "SPDR S&P 500 ETF"],
    ["QQQ", "Invesco Nasdaq 100 ETF"],
  ].map(([id, name]) => ({
    id,
    name,
    category: "Stocks" as const,
    provider: "fmp" as const,
    providerSymbol: id,
    precision: 2,
    pointValue: 1,
  })),
  {
    id: "NQ",
    name: "E-mini Nasdaq 100 Futures",
    category: "Futures",
    provider: "pending",
    providerSymbol: "NQ",
    precision: 2,
    pointValue: 20,
  },
  {
    id: "ES",
    name: "E-mini S&P 500 Futures",
    category: "Futures",
    provider: "pending",
    providerSymbol: "ES",
    precision: 2,
    pointValue: 50,
  },
  {
    id: "MNQ",
    name: "Micro E-mini Nasdaq Futures",
    category: "Futures",
    provider: "pending",
    providerSymbol: "MNQ",
    precision: 2,
    pointValue: 2,
  },
  {
    id: "MES",
    name: "Micro E-mini S&P Futures",
    category: "Futures",
    provider: "pending",
    providerSymbol: "MES",
    precision: 2,
    pointValue: 5,
  },
  {
    id: "GC",
    name: "COMEX Gold Futures",
    category: "Futures",
    provider: "pending",
    providerSymbol: "GC",
    precision: 2,
    pointValue: 100,
  },
];
const factor = (
  id: string,
  name: string,
  group: string,
  description: string,
  page: number,
  weight = 10,
): Factor => ({ id, name, group, description, page, weight, enabled: true });
export const WR1: Strategy = {
  id: "wr1",
  name: "WR1 Positioning",
  description:
    "A source-attributed reference strategy. Align higher-timeframe bias, positioning levels and session timing, then refine the entry. Not your personal rulebook.",
  color: "#D8F36A",
  kind: "reference",
  visible: true,
  version: 1,
  source: "wr1 PDF.pdf · 37 pages",
  factors: [
    factor(
      "structure",
      "HTF directional bias",
      "Market Structure",
      "Monthly → weekly → daily bias; follow source trend framework.",
      25,
      15,
    ),
    factor(
      "quarters",
      "Range quarters + OTE",
      "Premium / Discount",
      "25/37.5/50/62.5/75% quarters (p18); OTE 0.618, 0.705, 0.79 (p19) of the selected swing/candle range.",
      18,
      15,
    ),
    factor(
      "session",
      "Manipulation / session timing",
      "Time & Price",
      "London 02:00–03:15 and 04:00–04:45; NY 09:30–11:15. Source time basis EST.",
      5,
      10,
    ),
    factor(
      "fvg",
      "FVG / IFVG CE",
      "PD Arrays",
      "CE is midpoint. Regular FVG uses three-candle non-overlap; inverse and multi-FVG definitions require context.",
      9,
      15,
    ),
    factor(
      "soup",
      "Turtle Soup liquidity sweep",
      "Market Structure",
      "Sweep a prior high/low, interact with a directional PD array, then distribute oppositely.",
      8,
      10,
    ),
    factor(
      "ob",
      "Order Block CE / body",
      "PD Arrays",
      "Use the midpoint or body of a user-confirmed order block.",
      14,
      10,
    ),
    factor(
      "stdv",
      "STDV extensions",
      "Key Levels",
      "Manipulation-leg projections -1/-1.5, -2/-2.5, -4/-4.5; chiefly targets.",
      17,
      10,
    ),
    factor(
      "smt",
      "SMT / C-SMT confirmation",
      "Market Structure",
      "NQ versus ES; EURUSD versus GBPUSD. C-SMT: NQ versus broker NAS100 CFD, not a cash index substitute. Minimum 5m confirmation; correlated sources required.",
      20,
      10,
    ),
    factor(
      "mop",
      "MOP / prior-day liquidity",
      "Key Levels",
      "Midnight open; prior day/session highs/lows; recent MOP alignment (source suggests max one month).",
      22,
      5,
    ),
    factor(
      "timing",
      "X0 / X1 / X5 / X6 / X8",
      "Time & Price",
      "Source minute-digit confluence, not a measured predictive guarantee.",
      23,
      5,
    ),
    factor(
      "rdrb",
      "RDRB / overlap / wick CE",
      "PD Arrays",
      "User-annotated redelivery/rebalance, overlapping wick and wick midpoints.",
      12,
      10,
    ),
    factor(
      "accumulation",
      "HTF accumulation candle",
      "PD Arrays",
      "Stubby candle with two long wicks; source uses 15m–daily.",
      16,
      5,
    ),
    factor(
      "context",
      "News / COT / weekly profile",
      "Key Levels",
      "Dated economic context, commercial COT changes and weekly profile; unknown when unconnected.",
      27,
      10,
    ),
  ],
};
export const JOURNAL_STEPS = [
  "Higher-timeframe bias",
  "Liquidity objective",
  "Positioning & confluences",
  "Session & news context",
  "Entry trigger",
  "Invalidation",
  "Target rationale",
  "Risk & emotional state",
  "Final reasoning",
];
export function initialWorkspace(): Workspace {
  return {
    schemaVersion: 1,
    strategies: [JSON.parse(JSON.stringify(WR1))],
    patterns: [],
    matches: [],
    trades: [],
    alerts: [],
    events: [],
    levels: [],
    activeStrategyId: "wr1",
    market: "BTC-USD",
    timeframe: "5m",
    favorites: ["BTC-USD", "ETH-USD", "XAUUSD", "NQ", "EURUSD", "AAPL"],
    confirmations: {},
    overlays: { fvg: true, ranges: false, levels: true, pdh: false },
    settings: {
      timezone: "America/New_York",
      weeklyBias: "Neutral",
      sampleMode: false,
      futureOverlay: false,
      adaptation: true,
    },
    paperStartingBalance: 100000,
  };
}
export function uid(prefix = "item") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
export const DISCLAIMER =
  "Paper trading only. Educational analysis, not financial advice. Markets carry substantial risk. Past results, visual similarity and confluence are not a guarantee of future performance. No real-money orders are placed.";

export type PaperTradeEvent = {
  id: string;
  kind:
    | "created"
    | "filled"
    | "partial"
    | "breakeven"
    | "bracket-edit"
    | "closed"
    | "cancelled"
    | "review";
  at: number;
  price?: number;
  quantity?: number;
  pnl?: number;
  note: string;
};
