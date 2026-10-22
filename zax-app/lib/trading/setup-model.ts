import type {
  Candle,
  Level,
  Market,
  Pattern,
  Strategy,
  Timeframe,
} from "./model";
export type SetupFamily =
  | "core-sequence"
  | "silver-bullet"
  | "ob-retest"
  | "stdv"
  | "vwap-stdv"
  | "trend-following"
  | "breakout-momentum"
  | "mean-reversion"
  | "scalping"
  | "sma-crossover"
  | "macd-momentum"
  | "donchian-breakout"
  | "orb"
  | "london-breakout"
  | "initial-balance"
  | "pdc-continuation"
  | "custom";
export type Direction = "long" | "short";
export type HistoricalProfile = {
  bias: "Bullish" | "Bearish" | "Neutral" | "Unknown";
  source: string;
  basis: string;
  asOf?: number;
  explanation: string;
  priorWeekHigh?: number;
  priorWeekLow?: number;
  weeklyOpen?: number;
};
export type SetupStep = {
  id: string;
  name: string;
  status: "met" | "waiting" | "failed" | "unknown";
  evidence: string;
};
export type SetupZone = {
  id: string;
  kind:
    | "fvg"
    | "ob"
    | "sweep"
    | "mss"
    | "stdv"
    | "ifvg"
    | "orb"
    | "session-range";
  side: Direction;
  startTime: number;
  endTime: number;
  low: number;
  high: number;
  ce?: number;
  label: string;
  source: string;
  strategyId: string;
};
export type SetupCandidate = {
  id: string;
  family: SetupFamily;
  side: Direction;
  strategyId: string;
  strategyVersion: number;
  name: string;
  ready: boolean;
  steps: SetupStep[];
  zones: SetupZone[];
  entry?: number;
  stop?: number;
  target?: number;
  sourcePatternId?: string;
  source: string;
};
export type HistoricalEstimate = {
  rate: number | null;
  wins: number;
  losses: number;
  unresolved: number;
  ambiguous: number;
  samples: number;
  interval?: [number, number];
  from?: number;
  to?: number;
  horizon: number;
  costs: string;
  label: string;
  probability: null;
};
export type ForecastScenario = {
  id: string;
  anchorAt: number;
  sourceAt: number;
  source: string;
  strategyIds: string[];
  strategyVersions: number[];
  combination: "all" | "any";
  candles: Candle[];
  side?: Direction;
  distance: number;
  explanation: string;
  referenceId?: string;
  basis?: "strategy-matched" | "context-replay";
  anchorPrice?: number;
  direction?: "up" | "down" | "flat";
  queryBars?: number;
  sourceEndAt?: number;
};
export type SetupAnalysis = {
  market: string;
  timeframe: Timeframe;
  asOf: number;
  source: string;
  profile: HistoricalProfile;
  previousDay?: { high: number; low: number; at: number; source: string };
  candidates: SetupCandidate[];
  confluences: SetupStep[];
  levels: Level[];
  scenario?: ForecastScenario;
  estimate: HistoricalEstimate;
  rhythm: {
    volatility: number;
    autocorrelation: number;
    momentum: number;
    bars: number;
  } | null;
  messages: string[];
  selectedStrategyIds: string[];
  combination: "all" | "any";
  candles: Candle[];
  indicators?: import("./indicators").IndicatorSnapshot;
  attachedIndicators?: import("./strategy-indicators").StrategyIndicatorLayers;
  orbContexts?: import("./orb-model").OrbContext[];
  sessionContexts?: import("./session-strategy-model").SessionStrategyContext[];
  confluenceEvaluations?: Record<
    string,
    import("./confluence-contract").ConfluenceEvaluation
  >;
};
export type SetupInput = {
  market: Market;
  timeframe: Timeframe;
  candles: Candle[];
  daily: Candle[];
  hourly: Candle[];
  strategies: Strategy[];
  patterns: Pattern[];
  combination: "all" | "any";
  timezone: string;
  now: number;
  source: string;
  sourceIdentity?: string;
  dailySource: string;
  dailySourceIdentity?: string;
  hourlySource: string;
  skipHistorical?: boolean;
  orbRangeFeed?: import("./orb-model").OrbRangeFeed;
  orbInstrumentMetadata?: import("./orb-model").OrbInstrumentMetadata;
  sessionRangeFeed?: import("./session-strategy-model").SessionSupportFeed;
  pivotMinuteFeed?: import("./session-strategy-model").SessionSupportFeed;
  quoteObservations?: import("./session-strategy-model").QuoteObservationPair;
  volumeBasis?: "venue" | "broker-reported" | "unknown";
  dailyPeriodBasis?:
    | "utc-continuous-24h"
    | "utc-provider-trading-days"
    | "unknown";
};
export type PaperProposal = {
  id?: string;
  side: Direction;
  entry: number;
  stop: number;
  target: number;
  quantity: number;
  riskPct: number;
  effectiveRiskCapPct: number;
  rr: number;
  partialAt: number;
  initialRisk: number;
  strategyIds: string[];
  strategyVersions: number[];
  rationale: string[];
  checklist: Record<string, string>;
  analysis: SetupAnalysis;
};
