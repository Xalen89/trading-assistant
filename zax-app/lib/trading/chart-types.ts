import type { AIPriceForecast } from "./ai-forecast";
import type { Candle, Level, Trade, Timeframe } from "./model";
import type { IndicatorSnapshot } from "./indicators";
import type { SetupAnalysis } from "./setup-model";
import type { StrategyIndicatorLayers } from "./strategy-indicators";
import type { SessionOverlayPrefs } from "./chart-sessions";

export type ChartReferenceImage = { uri: string; label: string };
export type ScenarioStyle = "line" | "candles" | "both";
export type IndicatorLayers = StrategyIndicatorLayers;

export type CandleChartProps = {
  candles: Candle[];
  market?: string;
  timeframe?: Timeframe;
  precision: number;
  /** Only text visibility; never disables attached indicators, zones or levels. */
  showSetupLabels?: boolean;
  /** Display-only regional clock backgrounds, independent of strategy signals. */
  sessionOverlay?: SessionOverlayPrefs;
  onSessionOverlayChange?: (preferences: SessionOverlayPrefs) => void;
  levels?: Level[];
  showFvg: boolean;
  showRanges: boolean;
  showLevels: boolean;
  future: boolean;
  analysis?: SetupAnalysis;
  scenarioStyle?: ScenarioStyle;
  aiForecast?: AIPriceForecast;
  aiForecastStyle?: ScenarioStyle;
  scenarioLayers?: import("./scenario-layer-types").ScenarioLayer[];
  referenceImage?: ChartReferenceImage;
  indicators?: IndicatorSnapshot;
  indicatorLayers?: IndicatorLayers;
  focusedTrade?: Trade;
  onBuy?: () => void;
  onSell?: () => void;
};

export type ChartSurfaceEvent =
  | { type: "ready" }
  | { type: "inspect"; candle: Candle | null }
  | { type: "error"; message: string }
  | { type: "attribution" };

export type ChartCommand = "zoom-in" | "zoom-out" | "reset";
