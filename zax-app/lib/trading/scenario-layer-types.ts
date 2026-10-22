import type { AIPriceForecast } from "./ai-forecast";
import type { ForecastScenario } from "./setup-model";
import type { Timeframe } from "./model";
import type { ScenarioStyle } from "./chart-types";

export const SCENARIO_TIMEFRAMES: readonly Timeframe[] = [
  "1m",
  "5m",
  "15m",
  "30m",
  "1h",
  "4h",
  "1d",
  "1w",
];
export const MAX_SAVED_SCENARIO_LAYERS = 12;
export const MAX_DRAWN_SCENARIO_LAYERS = 6;
export const SCENARIO_LAYER_COLORS = [
  "#8EC5FF",
  "#B8A2FF",
  "#F4C878",
  "#72E6BE",
  "#FF8A9A",
  "#D8F36A",
] as const;
export type ScenarioLayerBase = {
  id: string;
  label: string;
  market: string;
  sourceTimeframe: Timeframe;
  displayTimeframes: Timeframe[];
  enabled: boolean;
  style: ScenarioStyle;
  anchorMode: "follow" | "fixed";
  color: string;
  createdAt: number;
};
export type AIScenarioLayer = ScenarioLayerBase & {
  kind: "ai";
  forecast: AIPriceForecast;
};
export type HistoricalScenarioLayer = ScenarioLayerBase & {
  kind: "historical";
  scenario: ForecastScenario;
};
export type ScenarioLayer = AIScenarioLayer | HistoricalScenarioLayer;
export type ScenarioLayerPlot = {
  id: string;
  label: string;
  kind: "ai" | "historical";
  sourceTimeframe: Timeframe;
  style: ScenarioStyle;
  color: string;
  candles: import("./model").Candle[];
  line: { time: number; value: number }[];
  contextMode?: "current" | "last-available";
  note: string;
};
export type ScenarioLayerStatus = {
  id: string;
  visible: boolean;
  reason: string;
};
