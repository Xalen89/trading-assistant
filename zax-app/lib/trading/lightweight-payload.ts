import { rollingVwapStdv } from "./vwap-stdv";
import { usableForecast } from "./forecast-display";
import { projectScenarioLayers } from "./scenario-layers";
import type { CandleChartProps, ScenarioStyle } from "./chart-types";
import type { Candle, Timeframe } from "./model";
import type { IndicatorPoint } from "./indicators";
import { paperTradeChartLines } from "./trade-chart";
import type { TradeChartLineTone } from "./trade-chart";
import {
  buildSessionBoxes,
  DEFAULT_SESSION_OVERLAY,
  type ChartSessionBox,
} from "./chart-sessions";

export type PlotPoint = { time: number; value: number };
export type PlotLine = {
  id: string;
  label: string;
  color: string;
  pane: "price" | "rsi" | "macd";
  segments: PlotPoint[][];
  histogram?: boolean;
  dashed?: boolean;
};
export type PlotZone = {
  id: string;
  from: number;
  to: number;
  low: number;
  high: number;
  label: string;
  color: string;
  ce?: number;
};
export type PlotPriceLine = {
  id: string;
  price: number;
  label: string;
  color: string;
  dashed?: boolean;
  origin?: "paper" | "level" | "range";
  paperTone?: TradeChartLineTone;
};
export type FormingCandleMetadata = {
  time: number;
  expectedCloseAt: number;
  state: "quote-update";
  anchorAt?: number;
};
export type LightweightPayload = {
  key: string;
  precision: number;
  candles: Candle[];
  /** Last completed source-bar timestamp used for all scenario/forecast anchors. */
  closedAnchorAt?: number;
  /** A terminal quote-updated candle that remains explicitly non-closed. */
  formingCandle?: FormingCandleMetadata;
  lines: PlotLine[];
  zones: PlotZone[];
  priceLines: PlotPriceLine[];
  ghost: Candle[];
  ghostLine: PlotPoint[];
  forecastGhost?: Candle[];
  forecastLine?: PlotPoint[];
  forecastStyle?: ScenarioStyle;
  forecastLabel?: string;
  scenarioLayers?: import("./scenario-layer-types").ScenarioLayerPlot[];
  scenarioLayerStatus?: import("./scenario-layer-types").ScenarioLayerStatus[];
  scenarioStyle: ScenarioStyle;
  scenarioLabel?: string;
  sourceLabel: string;
  messages: string[];
  showSetupLabels?: boolean;
  sessionBoxes?: ChartSessionBox[];
  sessionInterval?: number;
  reference?: {
    uri: string;
    label: string;
    from: number;
    to: number;
    low: number;
    high: number;
  };
};
export const CHART_COLORS = {
  background: "#0B1017",
  grid: "#263447",
  text: "#E5EDF5",
  muted: "#97A5B7",
  green: "#72E6BE",
  red: "#FF8A9A",
  lime: "#D8F36A",
  blue: "#8EC5FF",
  amber: "#F4C878",
  purple: "#B8A2FF",
};
const CHART_INTERVAL_SECONDS: Record<Timeframe, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "30m": 1800,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
  "1w": 604800,
};
export const validChartCandle = (c: Candle): boolean =>
  Number.isInteger(c.time) &&
  c.time > 0 &&
  c.time < 10_000_000_000 &&
  [c.open, c.high, c.low, c.close, c.volume].every(Number.isFinite) &&
  Math.min(c.open, c.high, c.low, c.close) > 0 &&
  c.volume >= 0 &&
  c.low <= Math.min(c.open, c.close) &&
  c.high >= Math.max(c.open, c.close);
export function chartCandles(
  raw: Candle[],
  asOfSeconds = Date.now() / 1000,
): Candle[] {
  const byTime = new Map<number, Candle>();
  for (const c of raw)
    if (validChartCandle(c) && c.time <= asOfSeconds)
      byTime.set(c.time, { ...c });
  return [...byTime.values()].sort((a, b) => a.time - b.time).slice(-3000);
}
/**
 * Keeps actual bars separate from the one terminal provider bucket that can still
 * receive quote updates. No gaps are synthesized and incomplete source bars never
 * become an analysis or scenario anchor.
 */
export function chartCandleState(
  raw: Candle[],
  timeframe: Timeframe,
  asOfSeconds = Date.now() / 1000,
): {
  candles: Candle[];
  closed: Candle[];
  lastClosed?: Candle;
  formingCandle?: FormingCandleMetadata;
} {
  const asOf =
    Number.isFinite(asOfSeconds) &&
    asOfSeconds > 0 &&
    asOfSeconds < 10_000_000_000
      ? asOfSeconds
      : Date.now() / 1000;
  const source = chartCandles(raw, asOf);
  const interval = CHART_INTERVAL_SECONDS[timeframe];
  const closed = source.filter((candle) => candle.time + interval <= asOf);
  const terminal = source.at(-1);
  const forming =
    terminal && terminal.time + interval > asOf ? terminal : undefined;
  const candles = forming ? [...closed, forming] : closed;
  const lastClosed = closed.at(-1);
  return {
    candles,
    closed,
    lastClosed,
    ...(forming
      ? {
          formingCandle: {
            time: forming.time,
            expectedCloseAt: forming.time + interval,
            state: "quote-update" as const,
            ...(lastClosed ? { anchorAt: lastClosed.time } : {}),
          },
        }
      : {}),
  };
}
export function chartSegments(
  candles: Candle[],
  value: (time: number, index: number) => number | undefined,
  positive = false,
): PlotPoint[][] {
  const segments: PlotPoint[][] = [];
  let current: PlotPoint[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i],
      v = value(c.time, i);
    if (typeof v !== "number" || !Number.isFinite(v) || (positive && v <= 0)) {
      if (current.length) segments.push(current);
      current = [];
    } else current.push({ time: c.time, value: v });
  }
  if (current.length) segments.push(current);
  return segments;
}
export function buildLightweightPayload(
  props: CandleChartProps,
  asOfSeconds = Date.now() / 1000,
): LightweightPayload {
  const timeframe =
    props.timeframe ??
    props.analysis?.timeframe ??
    props.indicators?.timeframe ??
    "5m";
  const market = props.market ?? props.analysis?.market ?? "unspecified";
  const chartAsOf =
    Number.isFinite(asOfSeconds) &&
    asOfSeconds > 0 &&
    asOfSeconds < 10_000_000_000
      ? asOfSeconds
      : Date.now() / 1000;
  const asOfMilliseconds = Math.floor(chartAsOf * 1000);
  const candleState = chartCandleState(props.candles, timeframe, chartAsOf);
  const candles = candleState.candles;
  const lastClosed = candleState.lastClosed;
  const analysis =
    props.analysis &&
    (market === "unspecified" || props.analysis.market === market) &&
    props.analysis.timeframe === timeframe
      ? props.analysis
      : undefined;
  const indicators =
    props.indicators?.timeframe === timeframe ? props.indicators : undefined;
  const layers = props.indicatorLayers,
    points = new Map(indicators?.points.map((p) => [p.time, p]) ?? []);
  const lines: PlotLine[] = [],
    zones: PlotZone[] = [],
    priceLines: PlotPriceLine[] = [],
    messages: string[] = [];
  if (candleState.formingCandle)
    messages.push(
      "FORMING / QUOTE UPDATE — the current bar is not closed; scenarios, forecasts, and setup anchors use the last completed source candle.",
    );
  if (candles.length && !lastClosed)
    messages.push(
      "No completed source candle is available yet; scenario and forecast anchors are withheld.",
    );
  if (props.analysis && !analysis)
    messages.push(
      "Setup/replay source does not match this market/timeframe; overlays hidden.",
    );
  if (props.indicators && !indicators)
    messages.push(
      "Indicator source timeframe does not match this chart; curves hidden.",
    );
  const add = (
    id: string,
    label: string,
    color: string,
    pane: PlotLine["pane"],
    field: keyof IndicatorPoint,
    histogram = false,
    dashed = false,
  ) => {
    const segments = chartSegments(
      candleState.closed,
      (t) => points.get(t)?.[field],
      pane === "price",
    );
    if (segments.length > 48) {
      messages.push(
        `${label}: overly fragmented source; showing latest 48 segments.`,
      );
    }
    lines.push({
      id,
      label,
      color,
      pane,
      segments: segments.slice(-48),
      histogram,
      dashed,
    });
  };
  if (layers?.ema && layers.ema20 !== false)
    add("ema20", "EMA 20", CHART_COLORS.lime, "price", "ema20");
  if (layers?.ema && layers.ema50 !== false)
    add("ema50", "EMA 50", CHART_COLORS.blue, "price", "ema50");
  if (layers?.sma && layers.sma20 !== false)
    add("sma20", "SMA 20", CHART_COLORS.amber, "price", "sma20");
  if (layers?.sma && layers.sma50 !== false)
    add("sma50", "SMA 50", CHART_COLORS.purple, "price", "sma50");
  if (layers?.vwapStdv) {
    const curves = rollingVwapStdv(
      candleState.closed,
      timeframe,
      analysis?.source ?? indicators?.source ?? "Unspecified chart OHLCV",
      asOfMilliseconds,
    );
    const byTime = new Map(curves.points.map((p) => [p.time, p]));
    for (const [id, label, field, color] of [
      ["vwapStdv", "OHLCV VWAP20", "vwap", CHART_COLORS.blue],
      ["vwapStdvUpper", "VWAP+2.5σ", "upper", CHART_COLORS.purple],
      ["vwapStdvLower", "VWAP−2.5σ", "lower", CHART_COLORS.purple],
    ] as const)
      lines.push({
        id,
        label,
        color,
        pane: "price",
        segments: chartSegments(
          candleState.closed,
          (time) => byTime.get(time)?.[field],
          true,
        ),
      });
    if (!curves.source.knownVolume)
      messages.push(
        "VWAP bar proxy: source volume semantics are unknown; this is not an executable/validated venue signal.",
      );
  }
  if (layers?.bands) {
    add("bbUpper", "BB 20 upper", CHART_COLORS.purple, "price", "bbUpper");
    add(
      "bbMid",
      "BB 20 mid",
      CHART_COLORS.purple,
      "price",
      "bbMid",
      false,
      true,
    );
    add("bbLower", "BB 20 lower", CHART_COLORS.purple, "price", "bbLower");
  }
  if (layers?.trail)
    add(
      "atrTrail",
      "2 ATR guide",
      CHART_COLORS.amber,
      "price",
      "trail2Atr",
      false,
      true,
    );
  if (layers?.donchian) {
    add(
      "dcUpper",
      "Donchian 20 upper",
      CHART_COLORS.blue,
      "price",
      "donchianUpper",
      false,
      true,
    );
    add(
      "dcLower",
      "Donchian 20 lower",
      CHART_COLORS.blue,
      "price",
      "donchianLower",
      false,
      true,
    );
  }
  if (layers?.range10)
    for (const upper of [true, false])
      lines.push({
        id: upper ? "prior10High" : "prior10Low",
        label: upper ? "Prior 10 high" : "Prior 10 low",
        color: CHART_COLORS.amber,
        pane: "price",
        dashed: true,
        segments: chartSegments(
          candleState.closed,
          (_, i) =>
            i < 10
              ? undefined
              : upper
                ? Math.max(
                    ...candleState.closed.slice(i - 10, i).map((c) => c.high),
                  )
                : Math.min(
                    ...candleState.closed.slice(i - 10, i).map((c) => c.low),
                  ),
          true,
        ),
      });
  if (layers?.rsi) add("rsi14", "RSI 14", CHART_COLORS.lime, "rsi", "rsi14");
  if (layers?.macd) {
    add("macd", "MACD 12/26/9", CHART_COLORS.blue, "macd", "macd");
    add("macdSignal", "MACD signal", CHART_COLORS.amber, "macd", "macdSignal");
    add(
      "macdHistogram",
      "MACD histogram",
      CHART_COLORS.green,
      "macd",
      "macdHistogram",
      true,
    );
  }
  const source = indicators?.source ?? analysis?.source ?? "source chart bars";
  const scenario = props.future ? analysis?.scenario : undefined;
  const ghost: Candle[] = [],
    ghostLine: PlotPoint[] = [];
  const forecastState = usableForecast(
    props.aiForecast,
    market,
    timeframe,
    lastClosed,
    asOfMilliseconds,
  );
  const forecastGhost = forecastState.valid ? props.aiForecast!.candles : [];
  const forecastLine = forecastGhost.length
    ? [
        {
          time: props.aiForecast!.anchorAt,
          value: props.aiForecast!.anchorPrice,
        },
        ...forecastGhost.map((c) => ({ time: c.time, value: c.close })),
      ]
    : [];
  if (props.aiForecast && !forecastState.valid)
    messages.push(forecastState.reason);
  let scenarioLabel: string | undefined;
  if (scenario) {
    const anchor = candleState.closed.find((c) => c.time === scenario.anchorAt);
    const anchorPrice = scenario.anchorPrice ?? anchor?.close;
    if (
      typeof anchorPrice === "number" &&
      Number.isFinite(anchorPrice) &&
      anchorPrice > 0 &&
      Number.isInteger(scenario.anchorAt) &&
      Number.isInteger(scenario.sourceAt)
    ) {
      for (const c of chartCandles(
        scenario.candles,
        scenario.anchorAt - 1,
      ).slice(0, 100)) {
        const time = scenario.anchorAt + c.time - scenario.sourceAt;
        if (
          c.time > scenario.sourceAt &&
          time > scenario.anchorAt &&
          Number.isInteger(time) &&
          time < 10_000_000_000
        )
          ghost.push({ ...c, time });
      }
      if (ghost.length)
        ghostLine.push(
          { time: scenario.anchorAt, value: anchorPrice },
          ...ghost.map((c) => ({ time: c.time, value: c.close })),
        );
      scenarioLabel = `HISTORICAL REPLAY · ${scenario.basis ?? "strategy-matched"} · ${new Date(scenario.sourceAt * 1000).toISOString().slice(0, 10)} · ${ghost.length} SOURCE BARS · ${scenario.direction ?? "direction unavailable"} · NOT A FORECAST`;
    }
  }
  if (props.future && !ghost.length)
    messages.push(
      "Historical replay unavailable: need valid completed history and a full historical continuation.",
    );
  const firstClosed = candleState.closed[0];
  if (firstClosed && lastClosed) {
    if (props.showFvg)
      for (let i = 2; i < candleState.closed.length; i++) {
        const a = candleState.closed[i - 2],
          c = candleState.closed[i];
        if (c.low > a.high || c.high < a.low) {
          const up = c.low > a.high,
            low = up ? a.high : c.high,
            high = up ? c.low : a.low;
          zones.push({
            id: `fvg:${c.time}`,
            from: a.time,
            to: c.time,
            low,
            high,
            ce: (low + high) / 2,
            label: "FVG · CE",
            color: up ? CHART_COLORS.green : CHART_COLORS.red,
          });
        }
      }
    const seenOrbRanges = new Set<string>();
    for (const z of analysis?.candidates.flatMap((c) => c.zones) ?? []) {
      if (
        ![z.startTime, z.endTime, z.low, z.high].every(Number.isFinite) ||
        z.startTime > lastClosed.time ||
        z.endTime < firstClosed.time ||
        z.low <= 0 ||
        z.high < z.low
      )
        continue;
      if ((z.kind === "fvg" || z.kind === "ifvg") && !props.showFvg) continue;
      if (z.kind === "stdv" && !props.showRanges) continue;
      if (z.kind === "orb" || z.kind === "session-range") {
        const key = `${z.strategyId}:${z.startTime}:${z.endTime}:${z.low}:${z.high}`;
        if (seenOrbRanges.has(key)) continue;
        seenOrbRanges.add(key);
      }
      zones.push({
        id: z.id,
        from: z.startTime,
        to: Math.max(z.endTime, z.startTime + 1),
        low: z.low,
        high: z.high,
        ce: z.ce,
        label: z.label.slice(0, 100),
        color:
          z.kind === "session-range"
            ? z.strategyId.includes("london")
              ? CHART_COLORS.blue
              : CHART_COLORS.amber
            : z.kind === "stdv" || z.kind === "orb"
              ? CHART_COLORS.amber
              : z.kind === "mss"
                ? CHART_COLORS.blue
                : z.side === "long"
                  ? CHART_COLORS.green
                  : CHART_COLORS.red,
      });
    }
    if (props.showRanges) {
      const recent = candleState.closed.slice(-60),
        low = Math.min(...recent.map((c) => c.low)),
        high = Math.max(...recent.map((c) => c.high));
      for (const ratio of [0.25, 0.375, 0.5, 0.618, 0.625, 0.705, 0.75, 0.79])
        priceLines.push({
          id: `range:${ratio}`,
          price: low + (high - low) * ratio,
          label: `60 BAR RANGE ${(ratio * 100).toFixed(1)}%`,
          color: CHART_COLORS.muted,
          dashed: true,
          origin: "range",
        });
    }
    if (props.showLevels)
      for (const l of props.levels ?? [])
        if (
          Number.isFinite(l.price) &&
          l.price > 0 &&
          (market === "unspecified" || l.market === market)
        )
          priceLines.push({
            id: l.id,
            price: l.price,
            label: l.name.slice(0, 100),
            color: l.color || CHART_COLORS.amber,
            dashed: true,
            origin: "level",
          });
  }
  if (
    props.focusedTrade &&
    (market === "unspecified" || props.focusedTrade.market === market)
  )
    for (const l of paperTradeChartLines(props.focusedTrade))
      priceLines.push({
        ...l,
        origin: "paper",
        paperTone: l.tone,
        color:
          l.tone === "entry"
            ? CHART_COLORS.blue
            : l.tone === "stop"
              ? CHART_COLORS.red
              : l.tone === "target"
                ? CHART_COLORS.green
                : l.tone === "partial"
                  ? CHART_COLORS.amber
                  : CHART_COLORS.muted,
      });
  if (
    props.focusedTrade &&
    market !== "unspecified" &&
    props.focusedTrade.market !== market
  )
    messages.push(
      "Saved trade belongs to another market; bracket is not drawn here.",
    );
  let reference: LightweightPayload["reference"];
  if (props.referenceImage && lastClosed && firstClosed) {
    if (
      /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(
        props.referenceImage.uri,
      ) &&
      props.referenceImage.uri.length <= 12 * 1024 * 1024
    ) {
      const range = candleState.closed.slice(-60),
        low = Math.min(...range.map((c) => c.low)),
        high = Math.max(...range.map((c) => c.high));
      const dt =
        candleState.closed.length > 1
          ? Math.max(1, lastClosed.time - candleState.closed.at(-2)!.time)
          : 300;
      reference = {
        ...props.referenceImage,
        from: lastClosed.time + dt,
        to: lastClosed.time + dt * 12,
        low,
        high,
      };
    } else
      messages.push(
        "Reference template requires a compatible local image under 12 MiB; original remains available in My Library.",
      );
  }
  const extraScenarios = projectScenarioLayers(
    props.scenarioLayers,
    market,
    timeframe,
    lastClosed,
    asOfMilliseconds,
  );
  return {
    key: `${market}:${timeframe}:${source}`,
    precision: Math.max(0, Math.min(8, Math.floor(props.precision) || 0)),
    candles,
    closedAnchorAt: lastClosed?.time,
    formingCandle: candleState.formingCandle,
    lines,
    zones: zones.slice(-64),
    priceLines: priceLines.slice(-80),
    ghost,
    ghostLine,
    forecastGhost,
    forecastLine,
    forecastStyle: props.aiForecastStyle ?? "line",
    forecastLabel: forecastGhost.length
      ? `AI FORECAST · HYPOTHETICAL · ${props.aiForecast!.direction.toUpperCase()} · NOT VALIDATED`
      : undefined,
    scenarioLayers: extraScenarios.plots,
    scenarioLayerStatus: extraScenarios.statuses,
    scenarioStyle: props.scenarioStyle ?? "both",
    scenarioLabel,
    sourceLabel: `${market} · ${timeframe} · ${source} · ${candleState.formingCandle ? "FORMING / QUOTE UPDATE · LAYERS USE LAST COMPLETED BAR" : "COMPLETED SOURCE BARS"} · DEVICE TIME`,
    messages: [...new Set(messages)],
    showSetupLabels: props.showSetupLabels === true,
    sessionBoxes: buildSessionBoxes(
      candles,
      timeframe,
      props.sessionOverlay ?? DEFAULT_SESSION_OVERLAY,
    ),
    sessionInterval: CHART_INTERVAL_SECONDS[timeframe],
    reference,
  };
}
