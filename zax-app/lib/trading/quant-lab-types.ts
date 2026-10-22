import type { Candle, Timeframe } from "./model";

export type QuantFamily = "pairs" | "momentum" | "making" | "macro" | "ml";
export interface QuantSeries {
  symbol: string;
  timeframe: Timeframe;
  source: string;
  candles: Candle[];
  fetchedAt: number;
  provenance: "provider" | "user-import";
  adjustedTotalReturn?: boolean;
}
export interface QuantBook {
  symbol: string;
  source: string;
  receivedAt: number;
  sequence?: number;
  bids: [number, number][];
  asks: [number, number][];
  tickSize: number;
  lotSize: number;
  status: "polled" | "streamed";
}
export interface QuantSettings {
  lookback: number;
  entryZ: number;
  exitZ: number;
  feeBps: number;
  slippageBps: number;
  holdingBars: number;
  startingEquity: number;
  inventory: number;
  orderSize: number;
  maxInventory: number;
  validationMode?: "walk-forward" | "cpcv";
  embargoPct?: number;
  maxFolds?: number;
  formationWindow?: number;
  tradingWindow?: number;
  hedgeMethod?: "rolling-ols" | "kalman";
}
export const DEFAULT_QUANT_SETTINGS: QuantSettings = {
  lookback: 60,
  entryZ: 2,
  exitZ: 0.5,
  feeBps: 0,
  slippageBps: 0,
  holdingBars: 5,
  startingEquity: 100000,
  inventory: 0,
  orderSize: 0.01,
  maxInventory: 0.1,
};
export interface QuantLabInput {
  family: QuantFamily;
  series: QuantSeries[];
  settings: QuantSettings;
  book?: QuantBook;
  now: number;
}
export interface QuantMetric {
  key: string;
  label: string;
  value: number | string | null;
  unit?: string;
}
export interface QuantSignal {
  at: number;
  symbol: string;
  direction: "long" | "short" | "flat";
  strength: number;
  reason: string;
}
export interface QuantLabResult {
  family: QuantFamily;
  status: "ready" | "insufficient-data" | "unavailable";
  title: string;
  summary: string;
  asOf: number;
  metrics: QuantMetric[];
  signals: QuantSignal[];
  equity: { time: number; value: number }[];
  equityBySymbol?: { symbol: string; points: { time: number; value: number }[] }[];
  validation: {
    status: "exploratory" | "unconfirmed";
    actualSamples: number;
    trainSamples: number;
    testSamples: number;
    walkForward: boolean;
    untouchedHoldout: boolean;
    reasons: string[];
  };
  dataRequirements: string[];
  limitations: string[];
  mlValidation?: import("./quant-ml").MLRunValidationDiagnostics;
  paperPlan?: {
    description: string;
    legs: {
      symbol: string;
      side: "long" | "short";
      referencePrice: number;
      quantity: number;
    }[];
  };
}
export function emptyQuantResult(
  family: QuantFamily,
  title: string,
  summary: string,
  reasons: string[] = [],
): QuantLabResult {
  return {
    family,
    title,
    status: "insufficient-data",
    summary,
    asOf: 0,
    metrics: [],
    signals: [],
    equity: [],
    validation: {
      status: "unconfirmed",
      actualSamples: 0,
      trainSamples: 0,
      testSamples: 0,
      walkForward: false,
      untouchedHoldout: false,
      reasons,
    },
    dataRequirements: reasons,
    limitations: [],
  };
}
