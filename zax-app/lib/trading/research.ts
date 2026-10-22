import type {
  Candle,
  ReferenceSnapshot,
  Strategy,
  Timeframe,
  Trade,
} from "./model";
import type { OrderBookInput, OrderBookReport } from "./orderbook-model";

export const DESCRIPTOR_VERSION = "opencv-hog-128x64-v1";
export const DESCRIPTOR_DIMENSIONS = 3780;
export type VisualIndex = {
  status: "indexed" | "failed" | "not-applicable";
  descriptorVersion: string;
  sourceHash?: string;
  indexedAt?: number;
  message?: string;
};
export type VisualNeighbor = {
  patternId: string;
  name: string;
  strategyId: string;
  sourceVersion: number;
  reference: ReferenceSnapshot;
  similarity: number;
  descriptorVersion: string;
};
export type VisualSearch = {
  results: VisualNeighbor[];
  examined: number;
  limitations: string;
  source?: string;
  asOf?: number;
};
export type ResearchSeries = {
  symbol: string;
  timeframe: Timeframe;
  source: string;
  candles: Candle[];
};
export type BacktestSpec = {
  model: "ma-cross" | "fvg";
  side: "long" | "short";
  fast: number[];
  slow: number[];
  holdBars: number;
  trainingBars: number;
  testBars: number;
  feesBps: number;
  slippageBps: number;
  initialEquity: number;
};
export const DEFAULT_BACKTEST: BacktestSpec = {
  model: "ma-cross",
  side: "long",
  fast: [5, 10, 15],
  slow: [20, 30],
  holdBars: 12,
  trainingBars: 120,
  testBars: 40,
  feesBps: 5,
  slippageBps: 5,
  initialEquity: 10000,
};
export type BacktestMetrics = {
  returnPct: number;
  maxDrawdownPct: number;
  trades: number;
  wins: number;
  winRatePct: number | null;
  profitFactor: number | null;
};
export type BacktestTrade = {
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  returnPct: number;
  forcedExit: boolean;
};
export type BacktestFold = {
  trainStart: number;
  trainEnd: number;
  testStart: number;
  testEnd: number;
  selected: { fast: number; slow: number };
  trainingReturnPct: number;
  metrics: BacktestMetrics;
  trades: BacktestTrade[];
};
export type LabelRow = {
  time: number;
  labelEnd: number;
  forwardReturnPct: number;
  label: "positive" | "negative" | "flat";
};
export type AssetBacktest = {
  symbol: string;
  timeframe: Timeframe;
  source: string;
  bars: number;
  metrics: BacktestMetrics;
  folds: BacktestFold[];
  labels: LabelRow[];
  quantstats?: {
    cumulativeReturnPct: number;
    maxDrawdownPct: number;
    unit: string;
  };
};
export type BacktestReport = {
  engine: string;
  engineVersion: string;
  generatedAt: number;
  spec: BacktestSpec;
  assets: AssetBacktest[];
  assumptions: string[];
  limitations: string[];
  probability: null;
};
export type EvidenceRole = {
  role:
    | "fundamental"
    | "sentiment"
    | "technical"
    | "bull"
    | "bear"
    | "trader"
    | "risk";
  status: "complete" | "abstained";
  stance: "bullish" | "bearish" | "mixed" | "insufficient";
  summary: string;
  evidenceIds: string[];
  missing: string[];
};
export type DiscussionReport = {
  market: string;
  timeframe: Timeframe;
  source: string;
  candleAsOf: number;
  strategy: { id: string; name: string; version: number };
  model: string;
  roles: EvidenceRole[];
  disagreements: string[];
  decision: "review-long" | "review-short" | "wait";
  riskVeto: boolean;
  limitations: string[];
  probability: null;
};
export type ResearchStart = {
  kind: "backtest" | "discussion" | "orderbook";
  market: string;
  timeframe: Timeframe;
  strategy: Strategy;
  confirmations: Record<string, boolean>;
  weeklyBias: "Bullish" | "Bearish" | "Neutral";
  trades: Trade[];
  startingBalance: number;
  dailyDrawdownLimitPct?: number;
  spec?: BacktestSpec;
  series?: ResearchSeries[];
  book?: OrderBookInput;
};
export type ResearchJob = {
  id: string;
  kind: "backtest" | "discussion" | "orderbook";
  status: "queued" | "running" | "succeeded" | "failed";
  createdAt: number;
  updatedAt: number;
  strategy: { id: string; name: string; version: number };
  market: string;
  timeframe: Timeframe;
  error?: string;
  result?: BacktestReport | DiscussionReport | OrderBookReport;
};
