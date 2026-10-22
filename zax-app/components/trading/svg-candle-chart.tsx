import { useMemo, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from "react-native";
import Svg, {
  ClipPath,
  Defs,
  G,
  Image as SvgImage,
  Line,
  Path,
  Rect,
  Text as SvgText,
} from "react-native-svg";
import type { Candle, Level, Trade } from "@/lib/trading/model";
import {
  paperTradeChartLines,
  paperTradeChartSummary,
  type TradeChartLine,
} from "@/lib/trading/trade-chart";
import type {
  IndicatorPoint,
  IndicatorSnapshot,
} from "@/lib/trading/indicators";
import type { SetupAnalysis, SetupZone } from "@/lib/trading/setup-model";
import {
  attachedIndicatorNames,
  type StrategyIndicatorLayers,
} from "@/lib/trading/strategy-indicators";
import { gaps, rangeLevels } from "@/lib/trading/engine";
import { C, formatPrice, mono } from "./theme";

export type ChartReferenceImage = { uri: string; label: string };
export type ScenarioStyle = "line" | "candles" | "both";
export type IndicatorLayers = StrategyIndicatorLayers;

type CandleChartProps = {
  candles: Candle[];
  precision: number;
  levels?: Level[];
  showFvg: boolean;
  showRanges: boolean;
  showLevels: boolean;
  future: boolean;
  analysis?: SetupAnalysis;
  scenarioStyle?: ScenarioStyle;
  referenceImage?: ChartReferenceImage;
  indicators?: IndicatorSnapshot;
  indicatorLayers?: IndicatorLayers;
  focusedTrade?: Trade;
  onBuy?: () => void;
  onSell?: () => void;
};

const zoneColor = (zone: SetupZone) =>
  zone.kind === "stdv"
    ? C.amber
    : zone.kind === "mss"
      ? C.blue
      : zone.side === "long"
        ? C.mint
        : C.rose;
const zoneTag = (zone: SetupZone) =>
  zone.kind === "fvg" || zone.kind === "ifvg"
    ? `${zone.kind.toUpperCase()}${zone.ce ? " CE" : ""}`
    : zone.kind === "ob"
      ? `OB${zone.ce ? " CE" : ""}`
      : zone.kind.toUpperCase();
const BB_PURPLE = "#B8A2FF";
const isFiniteNumber = (value: number | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);
const tradeLineColor = (tone: TradeChartLine["tone"]) =>
  tone === "entry"
    ? C.blue
    : tone === "stop"
      ? C.rose
      : tone === "target"
        ? C.mint
        : tone === "partial"
          ? C.amber
          : C.muted;

type IndicatorCoordinate = { x: number; point?: IndicatorPoint };

const segmentedLinePaths = (
  coordinates: IndicatorCoordinate[],
  valueFor: (point: IndicatorPoint) => number | undefined,
  y: (value: number) => number,
  positiveOnly = false,
) => {
  const paths: string[] = [];
  let segment: string[] = [];
  coordinates.forEach(({ x, point }) => {
    const value = point ? valueFor(point) : undefined;
    if (!isFiniteNumber(value) || (positiveOnly && value <= 0)) {
      if (segment.length) paths.push(segment.join(" "));
      segment = [];
      return;
    }
    segment.push(`${segment.length ? "L" : "M"} ${x} ${y(value)}`);
  });
  if (segment.length) paths.push(segment.join(" "));
  return paths;
};

const segmentedBandPaths = (
  coordinates: IndicatorCoordinate[],
  y: (value: number) => number,
) => {
  const paths: string[] = [];
  let segment: { x: number; upper: number; lower: number }[] = [];
  const finish = () => {
    if (segment.length > 1) {
      const upper = segment.map(
        ({ x, upper: value }, index) => `${index ? "L" : "M"} ${x} ${y(value)}`,
      );
      const lower = [...segment]
        .reverse()
        .map(({ x, lower: value }) => `L ${x} ${y(value)}`);
      paths.push(`${upper.join(" ")} ${lower.join(" ")} Z`);
    }
    segment = [];
  };
  coordinates.forEach(({ x, point }) => {
    const upper = point?.bbUpper,
      lower = point?.bbLower;
    if (!isFiniteNumber(upper) || !isFiniteNumber(lower)) {
      finish();
      return;
    }
    segment.push({ x, upper, lower });
  });
  finish();
  return paths;
};

const axisLabel = (time: number, timeframe?: string) => {
  const date = new Date(time * 1000);
  return ["4h", "1d", "1w"].includes(timeframe ?? "")
    ? date.toLocaleDateString([], { month: "short", day: "numeric" })
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

/**
 * All interaction remains on the native Pressable wrapper. The SVG itself intentionally
 * has no responder props: react-native-svg's web adapter forwards those to DOM SVG.
 */
export function CandleChart({
  candles,
  precision,
  levels = [],
  showFvg,
  showRanges,
  showLevels,
  future,
  analysis,
  scenarioStyle = "both",
  referenceImage,
  indicators,
  indicatorLayers,
  focusedTrade,
  onBuy,
  onSell,
}: CandleChartProps) {
  const chartTouchRef = useRef<View>(null);
  const [width, setWidth] = useState(340);
  const [count, setCount] = useState(60);
  const [selected, setSelected] = useState<number | null>(null);
  const h = 322,
    left = 8,
    right = 58,
    top = 16,
    bottom = 29;
  const displayed = useMemo(() => candles.slice(-count), [candles, count]);
  const latest = displayed.at(-1);
  const scenario = future ? analysis?.scenario : undefined;
  const layers: IndicatorLayers = indicatorLayers ?? {
    ema: false,
    bands: false,
    trail: false,
    rsi: false,
    sma: false,
    donchian: false,
    macd: false,
    range10: false,
    ema20: false,
    ema50: false,
    sma20: false,
    sma50: false,
  };
  const pointsByCandleTime = new Map<number, IndicatorPoint>();
  indicators?.points.forEach((point) => {
    if (Number.isFinite(point.time)) pointsByCandleTime.set(point.time, point);
  });
  // Indicator values are only ever paired with a candle that has the exact same source time.
  const displayedIndicatorPoints = displayed.map((candle) =>
    pointsByCandleTime.get(candle.time),
  );
  // Breakout-momentum uses the actual chart's prior ten bars, never an indicator-series proxy.
  // The current bar is explicitly excluded, so this range remains causal at every plotted time.
  const priorRange10ByTime = useMemo(() => {
    const ranges = new Map<number, { upper: number; lower: number }>();
    if (!layers.range10) return ranges;
    displayed.forEach((candle, index) => {
      if (index < 10) return;
      const prior = displayed.slice(index - 10, index);
      const values = prior.flatMap((bar) => [bar.high, bar.low]);
      if (!values.length || !values.every((value) => Number.isFinite(value)))
        return;
      ranges.set(candle.time, {
        upper: Math.max(...prior.map((bar) => bar.high)),
        lower: Math.min(...prior.map((bar) => bar.low)),
      });
    });
    return ranges;
  }, [displayed, layers.range10]);
  const indicatorPriceValues = (
    field:
      | "ema20"
      | "ema50"
      | "sma20"
      | "sma50"
      | "bbMid"
      | "bbUpper"
      | "bbLower"
      | "donchianUpper"
      | "donchianLower"
      | "trail2Atr",
    positiveOnly = false,
  ) =>
    displayedIndicatorPoints.flatMap((point) => {
      const value = point?.[field];
      return isFiniteNumber(value) && (!positiveOnly || value > 0)
        ? [value]
        : [];
    });
  // The setup engine supplies transformed historical OHLC. Never synthesize a generic analog here.
  const projected = scenario?.candles ?? [];
  const hasExtension = projected.length > 0 || Boolean(referenceImage);
  const plotWidth = Math.max(160, width - left - right);
  const actualWidth = hasExtension ? plotWidth * 0.78 : plotWidth;
  const scenarioAnchorIndex = scenario
    ? displayed.findIndex((bar) => bar.time === scenario.anchorAt)
    : -1;
  const scenarioAnchorPrice = isFiniteNumber(scenario?.anchorPrice)
    ? scenario.anchorPrice
    : scenarioAnchorIndex >= 0
      ? displayed[scenarioAnchorIndex]?.close
      : undefined;
  const showEma20 = layers.ema && layers.ema20 !== false;
  const showEma50 = layers.ema && layers.ema50 !== false;
  const showSma20 = layers.sma && layers.sma20 !== false;
  const showSma50 = layers.sma && layers.sma50 !== false;
  const showRange10 = Boolean(layers.range10);
  const setupZones =
    analysis?.candidates
      .flatMap((candidate) => candidate.zones)
      .filter((zone) =>
        displayed.some(
          (bar) => bar.time >= zone.startTime && bar.time <= zone.endTime,
        ),
      ) ?? [];
  // These annotations are derived only from the selected canonical paper record.
  // They are deliberately separate from automatic setup/strategy levels.
  const tradeLines = focusedTrade ? paperTradeChartLines(focusedTrade) : [];
  const prices = [
    ...displayed.flatMap((c) => [c.low, c.high]),
    ...projected.flatMap((c) => [c.low, c.high]),
    ...setupZones.flatMap((zone) => [zone.low, zone.high]),
    ...levels.map((level) => level.price),
    ...tradeLines.map((line) => line.price),
    ...(isFiniteNumber(scenarioAnchorPrice) ? [scenarioAnchorPrice] : []),
    ...(showEma20 ? indicatorPriceValues("ema20") : []),
    ...(showEma50 ? indicatorPriceValues("ema50") : []),
    ...(showSma20 ? indicatorPriceValues("sma20") : []),
    ...(showSma50 ? indicatorPriceValues("sma50") : []),
    ...(layers.bands
      ? [
          ...indicatorPriceValues("bbMid"),
          ...indicatorPriceValues("bbUpper"),
          ...indicatorPriceValues("bbLower"),
        ]
      : []),
    ...(layers.donchian
      ? [
          ...indicatorPriceValues("donchianUpper"),
          ...indicatorPriceValues("donchianLower"),
        ]
      : []),
    ...(showRange10
      ? [...priorRange10ByTime.values()].flatMap((range) => [
          range.upper,
          range.lower,
        ])
      : []),
    ...(layers.trail ? indicatorPriceValues("trail2Atr", true) : []),
  ].filter(Number.isFinite);
  const rawLow = prices.length ? Math.min(...prices) : 0;
  const rawHigh = prices.length ? Math.max(...prices) : 1;
  const pad = displayed.length
    ? Math.max((rawHigh - rawLow) * 0.12, Math.abs(rawHigh) * 0.00025)
    : 0;
  const bounds = displayed.length
    ? { low: rawLow - pad, high: rawHigh + pad }
    : { low: 0, high: 1 };
  const range = Math.max(bounds.high - bounds.low, 0.000001);
  const step = actualWidth / Math.max(displayed.length, 1);
  const x = (index: number) => left + (index + 0.5) * step;
  const y = (price: number) =>
    top + ((bounds.high - price) / range) * (h - top - bottom);
  const renderedTradeLines = tradeLines.map((line, index) => {
    const coincident = tradeLines
      .slice(0, index)
      .filter(
        (prior) => Math.abs(prior.price - line.price) < range * 0.00001,
      ).length;
    return {
      ...line,
      labelY: Math.max(
        top + 8,
        Math.min(h - bottom - 2, y(line.price) - 3 + coincident * 9),
      ),
    };
  });
  const indicatorCoordinates = displayed.map((candle, index) => ({
    x: x(index),
    point: pointsByCandleTime.get(candle.time),
  }));
  const range10Coordinates: IndicatorCoordinate[] = displayed.map(
    (candle, index) => {
      const range10 = priorRange10ByTime.get(candle.time);
      return {
        x: x(index),
        point: range10
          ? {
              time: candle.time,
              donchianUpper: range10.upper,
              donchianLower: range10.lower,
            }
          : undefined,
      };
    },
  );
  const ema20Paths = showEma20
    ? segmentedLinePaths(indicatorCoordinates, (point) => point.ema20, y)
    : [];
  const ema50Paths = showEma50
    ? segmentedLinePaths(indicatorCoordinates, (point) => point.ema50, y)
    : [];
  const sma20Paths = showSma20
    ? segmentedLinePaths(indicatorCoordinates, (point) => point.sma20, y)
    : [];
  const sma50Paths = showSma50
    ? segmentedLinePaths(indicatorCoordinates, (point) => point.sma50, y)
    : [];
  const bbUpperPaths = layers.bands
    ? segmentedLinePaths(indicatorCoordinates, (point) => point.bbUpper, y)
    : [];
  const bbMidPaths = layers.bands
    ? segmentedLinePaths(indicatorCoordinates, (point) => point.bbMid, y)
    : [];
  const bbLowerPaths = layers.bands
    ? segmentedLinePaths(indicatorCoordinates, (point) => point.bbLower, y)
    : [];
  const bbBandPaths = layers.bands
    ? segmentedBandPaths(indicatorCoordinates, y)
    : [];
  const donchianUpperPaths = layers.donchian
    ? segmentedLinePaths(
        indicatorCoordinates,
        (point) => point.donchianUpper,
        y,
      )
    : [];
  const donchianLowerPaths = layers.donchian
    ? segmentedLinePaths(
        indicatorCoordinates,
        (point) => point.donchianLower,
        y,
      )
    : [];
  const range10UpperPaths = showRange10
    ? segmentedLinePaths(range10Coordinates, (point) => point.donchianUpper, y)
    : [];
  const range10LowerPaths = showRange10
    ? segmentedLinePaths(range10Coordinates, (point) => point.donchianLower, y)
    : [];
  const trailPaths = layers.trail
    ? segmentedLinePaths(
        indicatorCoordinates,
        (point) => point.trail2Atr,
        y,
        true,
      )
    : [];
  const hasRsiPane = layers.rsi && Boolean(indicators);
  const rsiH = 88,
    rsiTop = 9,
    rsiBottom = 17;
  const rsiY = (value: number) =>
    rsiTop + ((100 - value) / 100) * (rsiH - rsiTop - rsiBottom);
  const rsiPaths = hasRsiPane
    ? segmentedLinePaths(indicatorCoordinates, (point) => point.rsi14, rsiY)
    : [];
  const latestRsi = [...indicatorCoordinates]
    .reverse()
    .map(({ point }) => point?.rsi14)
    .find(isFiniteNumber);
  const hasMacdPane = layers.macd && Boolean(indicators);
  const macdH = 88,
    macdTop = 9,
    macdBottom = 17;
  const macdValues = hasMacdPane
    ? displayedIndicatorPoints.flatMap((point) =>
        [point?.macd, point?.macdSignal, point?.macdHistogram].filter(
          isFiniteNumber,
        ),
      )
    : [];
  const macdLow = Math.min(0, ...(macdValues.length ? macdValues : [0]));
  const macdHigh = Math.max(0, ...(macdValues.length ? macdValues : [0]));
  const macdSpan = Math.max(macdHigh - macdLow, 0.000001);
  const macdPad = Math.max(
    macdSpan * 0.14,
    Math.abs(macdHigh) * 0.00025,
    0.000001,
  );
  const macdBounds = { low: macdLow - macdPad, high: macdHigh + macdPad };
  const macdRange = Math.max(macdBounds.high - macdBounds.low, 0.000001);
  const macdY = (value: number) =>
    macdTop +
    ((macdBounds.high - value) / macdRange) * (macdH - macdTop - macdBottom);
  const macdPaths = hasMacdPane
    ? segmentedLinePaths(indicatorCoordinates, (point) => point.macd, macdY)
    : [];
  const macdSignalPaths = hasMacdPane
    ? segmentedLinePaths(
        indicatorCoordinates,
        (point) => point.macdSignal,
        macdY,
      )
    : [];
  const latestMacd = [...indicatorCoordinates]
    .reverse()
    .map(({ point }) => point?.macd)
    .find(isFiniteNumber);
  const latestMacdSignal = [...indicatorCoordinates]
    .reverse()
    .map(({ point }) => point?.macdSignal)
    .find(isFiniteNumber);
  const xForTime = (time: number) => {
    if (!displayed.length) return left;
    let closest = 0,
      distance = Math.abs(displayed[0].time - time);
    displayed.forEach((bar, index) => {
      const next = Math.abs(bar.time - time);
      if (next < distance) {
        closest = index;
        distance = next;
      }
    });
    return x(closest);
  };
  const fvg = gaps(displayed);
  const inspection =
    selected === null
      ? latest
      : displayed[Math.min(selected, displayed.length - 1)];
  const inspectCandle = (event: GestureResponderEvent) => {
    const pageX = event.nativeEvent.pageX;
    if (!Number.isFinite(pageX)) return;
    chartTouchRef.current?.measureInWindow((originX) => {
      const index = Math.max(
        0,
        Math.min(
          displayed.length - 1,
          Math.floor((pageX - originX - left) / step),
        ),
      );
      if (Number.isFinite(index)) setSelected(index);
    });
  };
  const scenarioWidth = Math.max(1, plotWidth - actualWidth);
  const scenarioX = (index: number) =>
    left +
    actualWidth +
    ((index + 1) * scenarioWidth) / Math.max(projected.length + 1, 2);
  const showScenarioLine =
    projected.length > 0 &&
    (scenarioStyle === "line" || scenarioStyle === "both");
  const showScenarioCandles =
    projected.length > 0 &&
    (scenarioStyle === "candles" || scenarioStyle === "both");
  const canJoinScenario =
    showScenarioLine &&
    scenarioAnchorIndex >= 0 &&
    isFiniteNumber(scenarioAnchorPrice);
  const scenarioBasis =
    scenario?.basis === "context-replay"
      ? "CONTEXT REPLAY"
      : scenario?.basis === "strategy-matched"
        ? "STRATEGY-MATCHED"
        : "BASIS NOT SUPPLIED";
  const scenarioDirection = scenario?.direction
    ? `PATH ${scenario.direction.toUpperCase()}`
    : undefined;
  const attachedNames = attachedIndicatorNames(layers);

  return (
    <View
      style={styles.wrap}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <View style={styles.controls}>
        <Text style={styles.detail}>
          {inspection
            ? `O ${formatPrice(inspection.open, precision)}  H ${formatPrice(inspection.high, precision)}\nL ${formatPrice(inspection.low, precision)}  C ${formatPrice(inspection.close, precision)}`
            : "No market candles"}
        </Text>
        <View style={styles.rightControls}>
          {onBuy || onSell ? (
            <View style={styles.tradeActions}>
              {onSell ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Create paper sell plan"
                  style={[styles.tradeButton, styles.sellButton]}
                  onPress={onSell}
                >
                  <Text style={styles.sellText}>SELL</Text>
                </Pressable>
              ) : null}
              {onBuy ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Create paper buy plan"
                  style={[styles.tradeButton, styles.buyButton]}
                  onPress={onBuy}
                >
                  <Text style={styles.buyText}>BUY</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          <View style={styles.zoom}>
            <Pressable
              accessibilityLabel="Show more candles"
              style={styles.zoomButton}
              onPress={() => {
                setCount(Math.min(140, count + 20));
                setSelected(null);
              }}
            >
              <Text style={styles.zoomText}>−</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Show fewer candles"
              style={styles.zoomButton}
              onPress={() => {
                setCount(Math.max(20, count - 20));
                setSelected(null);
              }}
            >
              <Text style={styles.zoomText}>+</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Reset chart to latest"
              style={styles.zoomButton}
              onPress={() => {
                setCount(60);
                setSelected(null);
              }}
            >
              <Text style={styles.zoomText}>↦</Text>
            </Pressable>
          </View>
        </View>
      </View>
      {focusedTrade ? (
        <Text style={styles.focusedTrade}>
          {paperTradeChartSummary(focusedTrade)} · SAVED BRACKETS
        </Text>
      ) : null}
      {!displayed.length ? (
        <View style={styles.blank}>
          <Text style={styles.blankText}>No server candles available</Text>
        </View>
      ) : (
        <Pressable
          ref={chartTouchRef}
          accessibilityLabel="Inspect chart candle"
          onPress={inspectCandle}
        >
          <>
            <Svg width="100%" height={h} viewBox={`0 0 ${width} ${h}`}>
              <Defs>
                {referenceImage ? (
                  <ClipPath id="reference-clip">
                    <Rect
                      x={left + actualWidth + 2}
                      y={top + 14}
                      width={Math.max(1, scenarioWidth - 5)}
                      height={Math.max(1, h - top - bottom - 18)}
                    />
                  </ClipPath>
                ) : null}
              </Defs>
              {[0.2, 0.4, 0.6, 0.8].map((value) => (
                <Line
                  key={value}
                  x1={left}
                  x2={left + plotWidth}
                  y1={top + (h - top - bottom) * value}
                  y2={top + (h - top - bottom) * value}
                  stroke={C.grid}
                  strokeWidth={1}
                />
              ))}
              {referenceImage ? (
                <G clipPath="url(#reference-clip)" opacity={0.2}>
                  <SvgImage
                    href={referenceImage.uri}
                    x={left + actualWidth + 2}
                    y={top + 14}
                    width={Math.max(1, scenarioWidth - 5)}
                    height={Math.max(1, h - top - bottom - 18)}
                    preserveAspectRatio="xMidYMid meet"
                  />
                </G>
              ) : null}
              {referenceImage && !scenario ? (
                <SvgText
                  x={left + actualWidth + 4}
                  y={top + 10}
                  fill={C.amber}
                  fontSize={7}
                  fontFamily={mono}
                >
                  REFERENCE · {referenceImage.label.slice(0, 18)}
                </SvgText>
              ) : null}
              {bbBandPaths.map((d, index) => (
                <Path
                  key={`bb-band-${index}`}
                  d={d}
                  fill={BB_PURPLE + "16"}
                  stroke="none"
                />
              ))}
              {bbUpperPaths.map((d, index) => (
                <Path
                  key={`bb-upper-${index}`}
                  d={d}
                  fill="none"
                  stroke={BB_PURPLE + "88"}
                  strokeWidth={0.85}
                />
              ))}
              {bbMidPaths.map((d, index) => (
                <Path
                  key={`bb-mid-${index}`}
                  d={d}
                  fill="none"
                  stroke={BB_PURPLE + "AA"}
                  strokeWidth={0.8}
                  strokeDasharray="2 3"
                />
              ))}
              {bbLowerPaths.map((d, index) => (
                <Path
                  key={`bb-lower-${index}`}
                  d={d}
                  fill="none"
                  stroke={BB_PURPLE + "88"}
                  strokeWidth={0.85}
                />
              ))}
              {showFvg &&
                fvg.map((gap) => (
                  <G key={`${gap.start}-${gap.end}`}>
                    <Rect
                      x={x(gap.start) - step / 2}
                      y={y(gap.high)}
                      width={Math.max(
                        step,
                        actualWidth - x(gap.start) + left + step / 2,
                      )}
                      height={Math.max(2, y(gap.low) - y(gap.high))}
                      fill={
                        gap.side === "bullish" ? C.mint + "18" : C.rose + "18"
                      }
                      stroke={
                        gap.side === "bullish" ? C.mint + "77" : C.rose + "77"
                      }
                      strokeDasharray="3 3"
                    />
                    <Line
                      x1={x(gap.start)}
                      x2={left + actualWidth}
                      y1={y(gap.ce)}
                      y2={y(gap.ce)}
                      stroke={gap.side === "bullish" ? C.mint : C.rose}
                      strokeDasharray="2 4"
                      strokeWidth={0.7}
                    />
                  </G>
                ))}
              {showRanges &&
                rangeLevels(displayed).map((level) => (
                  <G key={level.ratio}>
                    <Line
                      x1={left}
                      x2={left + actualWidth}
                      y1={y(level.price)}
                      y2={y(level.price)}
                      stroke={C.blue + "66"}
                      strokeDasharray="4 4"
                    />
                    <SvgText
                      x={left + 2}
                      y={y(level.price) - 3}
                      fill={C.blue}
                      fontSize={8}
                    >
                      {(level.ratio * 100).toFixed(1)}%
                    </SvgText>
                  </G>
                ))}
              {showLevels &&
                levels
                  .filter(
                    (level) =>
                      level.price >= bounds.low && level.price <= bounds.high,
                  )
                  .map((level) => (
                    <G key={level.id}>
                      <Line
                        x1={left}
                        x2={left + actualWidth}
                        y1={y(level.price)}
                        y2={y(level.price)}
                        stroke={level.color}
                      />
                      <SvgText
                        x={left + 4}
                        y={y(level.price) - 4}
                        fill={level.color}
                        fontSize={9}
                      >
                        {level.name}
                      </SvgText>
                    </G>
                  ))}
              {setupZones.slice(-16).map((zone) => {
                const color = zoneColor(zone),
                  x1 = xForTime(zone.startTime) - step / 2,
                  x2 = xForTime(zone.endTime) + step / 2,
                  upper = y(Math.max(zone.low, zone.high)),
                  lower = y(Math.min(zone.low, zone.high));
                return (
                  <G key={`setup-${zone.id}`}>
                    <Rect
                      x={Math.max(left, x1)}
                      y={upper}
                      width={Math.max(
                        2,
                        Math.min(left + actualWidth, x2) - Math.max(left, x1),
                      )}
                      height={Math.max(2, lower - upper)}
                      fill={color + "20"}
                      stroke={color + "B3"}
                      strokeWidth={1}
                      strokeDasharray={zone.kind === "stdv" ? "2 2" : undefined}
                    />
                    {zone.ce !== undefined ? (
                      <Line
                        x1={Math.max(left, x1)}
                        x2={Math.min(left + actualWidth, x2)}
                        y1={y(zone.ce)}
                        y2={y(zone.ce)}
                        stroke={color}
                        strokeWidth={1}
                        strokeDasharray="2 3"
                      />
                    ) : null}
                    <SvgText
                      x={Math.max(left + 2, x1 + 2)}
                      y={Math.max(top + 9, upper + 9)}
                      fill={color}
                      fontSize={7}
                      fontFamily={mono}
                    >
                      {zoneTag(zone)}
                    </SvgText>
                  </G>
                );
              })}
              {displayed.map((candle, index) => {
                const color = candle.close >= candle.open ? C.mint : C.rose;
                return (
                  <G key={candle.time}>
                    <Line
                      x1={x(index)}
                      x2={x(index)}
                      y1={y(candle.high)}
                      y2={y(candle.low)}
                      stroke={color}
                      strokeWidth={1.1}
                    />
                    <Rect
                      x={x(index) - Math.max(1, step * 0.27)}
                      y={y(Math.max(candle.open, candle.close))}
                      width={Math.max(2, step * 0.54)}
                      height={Math.max(
                        1,
                        y(Math.min(candle.open, candle.close)) -
                          y(Math.max(candle.open, candle.close)),
                      )}
                      fill={color}
                    />
                  </G>
                );
              })}
              {ema20Paths.map((d, index) => (
                <Path
                  key={`ema20-${index}`}
                  d={d}
                  fill="none"
                  stroke={C.blue}
                  strokeWidth={1.35}
                />
              ))}
              {ema50Paths.map((d, index) => (
                <Path
                  key={`ema50-${index}`}
                  d={d}
                  fill="none"
                  stroke={C.amber}
                  strokeWidth={1.35}
                />
              ))}
              {sma20Paths.map((d, index) => (
                <Path
                  key={`sma20-${index}`}
                  d={d}
                  fill="none"
                  stroke={C.lime}
                  strokeWidth={1.1}
                  strokeDasharray="5 2"
                />
              ))}
              {sma50Paths.map((d, index) => (
                <Path
                  key={`sma50-${index}`}
                  d={d}
                  fill="none"
                  stroke={C.rose}
                  strokeWidth={1.1}
                  strokeDasharray="5 2"
                />
              ))}
              {donchianUpperPaths.map((d, index) => (
                <Path
                  key={`donchian-upper-${index}`}
                  d={d}
                  fill="none"
                  stroke={C.mint}
                  strokeWidth={0.95}
                  strokeDasharray="2 3"
                />
              ))}
              {donchianLowerPaths.map((d, index) => (
                <Path
                  key={`donchian-lower-${index}`}
                  d={d}
                  fill="none"
                  stroke={C.rose}
                  strokeWidth={0.95}
                  strokeDasharray="2 3"
                />
              ))}
              {range10UpperPaths.map((d, index) => (
                <Path
                  key={`range10-upper-${index}`}
                  d={d}
                  fill="none"
                  stroke={C.amber}
                  strokeWidth={0.9}
                  strokeDasharray="1 3"
                />
              ))}
              {range10LowerPaths.map((d, index) => (
                <Path
                  key={`range10-lower-${index}`}
                  d={d}
                  fill="none"
                  stroke={C.amber}
                  strokeWidth={0.9}
                  strokeDasharray="1 3"
                />
              ))}
              {trailPaths.map((d, index) => (
                <Path
                  key={`trail-2atr-${index}`}
                  d={d}
                  fill="none"
                  stroke={C.muted}
                  strokeWidth={1}
                  strokeDasharray="4 4"
                  opacity={0.9}
                />
              ))}
              {renderedTradeLines.map((line) => {
                const color = tradeLineColor(line.tone);
                const labelWidth = Math.min(
                  actualWidth - 5,
                  Math.max(54, line.label.length * 4.25 + 8),
                );
                return (
                  <G key={`paper-trade-${line.id}`}>
                    <Line
                      x1={left}
                      x2={left + actualWidth}
                      y1={y(line.price)}
                      y2={y(line.price)}
                      stroke={color}
                      strokeWidth={line.tone === "entry" ? 1.4 : 1.1}
                      strokeDasharray={line.dashed ? "4 3" : undefined}
                    />
                    <Rect
                      x={left + 2}
                      y={line.labelY - 8}
                      width={labelWidth}
                      height={10}
                      rx={2}
                      fill={C.black + "E8"}
                    />
                    <SvgText
                      x={left + 5}
                      y={line.labelY}
                      fill={color}
                      fontSize={6.8}
                      fontFamily={mono}
                    >
                      {line.label}
                    </SvgText>
                  </G>
                );
              })}
              {selected !== null && inspection ? (
                <Line
                  x1={x(selected)}
                  x2={x(selected)}
                  y1={top}
                  y2={h - bottom}
                  stroke={C.text + "77"}
                  strokeDasharray="2 3"
                />
              ) : null}
              {hasExtension ? (
                <Line
                  x1={left + actualWidth}
                  x2={left + actualWidth}
                  y1={top}
                  y2={h - bottom}
                  stroke={C.amber + "99"}
                  strokeDasharray="3 4"
                />
              ) : null}
              {showScenarioCandles
                ? projected.map((candle, index) => {
                    const color = candle.close >= candle.open ? C.mint : C.rose,
                      cx = scenarioX(index),
                      ghostWidth = Math.max(
                        2,
                        (scenarioWidth / Math.max(projected.length + 2, 3)) *
                          0.52,
                      );
                    return (
                      <G
                        key={`scenario-${candle.time}-${index}`}
                        opacity={0.38}
                      >
                        <Line
                          x1={cx}
                          x2={cx}
                          y1={y(candle.high)}
                          y2={y(candle.low)}
                          stroke={color}
                        />
                        <Rect
                          x={cx - ghostWidth / 2}
                          y={y(Math.max(candle.open, candle.close))}
                          width={ghostWidth}
                          height={Math.max(
                            1,
                            y(Math.min(candle.open, candle.close)) -
                              y(Math.max(candle.open, candle.close)),
                          )}
                          fill={color}
                        />
                      </G>
                    );
                  })
                : null}
              {canJoinScenario ? (
                <Path
                  d={`M ${x(scenarioAnchorIndex)} ${y(scenarioAnchorPrice)} ${projected.map((candle, index) => `L ${scenarioX(index)} ${y(candle.close)}`).join(" ")}`}
                  stroke={C.amber}
                  strokeWidth={1.6}
                  strokeDasharray="5 4"
                  fill="none"
                  opacity={0.72}
                />
              ) : null}
              {attachedNames.length ? (
                <SvgText
                  x={left + 3}
                  y={top + 10}
                  fill={C.muted}
                  fontSize={7}
                  fontFamily={mono}
                >
                  ATTACHED · {attachedNames.join(" · ")}
                </SvgText>
              ) : null}
              {scenario ? (
                <>
                  <SvgText
                    x={left + actualWidth + 4}
                    y={top + 10}
                    fill={C.amber}
                    fontSize={7}
                    fontFamily={mono}
                  >
                    HISTORICAL · {scenarioBasis}
                  </SvgText>
                  <SvgText
                    x={left + actualWidth + 4}
                    y={top + 20}
                    fill={C.muted}
                    fontSize={6.5}
                    fontFamily={mono}
                  >
                    SOURCE · {scenario.source.slice(0, 42)}
                  </SvgText>
                </>
              ) : referenceImage ? (
                <SvgText
                  x={left + actualWidth + 4}
                  y={top + 10}
                  fill={C.amber}
                  fontSize={7}
                  fontFamily={mono}
                >
                  REFERENCE · {referenceImage.label.slice(0, 18)}
                </SvgText>
              ) : null}
              {[0, 0.5, 1].map((value) => (
                <SvgText
                  key={value}
                  x={left + plotWidth + 5}
                  y={top + (h - top - bottom) * value + 3}
                  fill={C.price}
                  fontSize={10}
                  fontFamily={mono}
                >
                  {formatPrice(bounds.high - range * value, precision)}
                </SvgText>
              ))}
              {[
                ...new Set([
                  0,
                  Math.floor(displayed.length / 2),
                  displayed.length - 1,
                ]),
              ].map((index) => (
                <SvgText
                  key={index}
                  x={x(index)}
                  y={h - 7}
                  fill={C.muted}
                  fontSize={8}
                  textAnchor="middle"
                >
                  {axisLabel(
                    displayed[index].time,
                    indicators?.timeframe as string | undefined,
                  )}
                </SvgText>
              ))}
            </Svg>
            {hasRsiPane ? (
              <Svg width="100%" height={rsiH} viewBox={`0 0 ${width} ${rsiH}`}>
                <Rect
                  x={left}
                  y={rsiTop}
                  width={actualWidth}
                  height={rsiH - rsiTop - rsiBottom}
                  fill={C.black + "33"}
                  stroke={C.grid}
                  strokeWidth={1}
                />
                {[30, 70].map((level) => (
                  <Line
                    key={level}
                    x1={left}
                    x2={left + actualWidth}
                    y1={rsiY(level)}
                    y2={rsiY(level)}
                    stroke={C.muted + "77"}
                    strokeWidth={0.8}
                    strokeDasharray="3 3"
                  />
                ))}
                {rsiPaths.map((d, index) => (
                  <Path
                    key={`rsi-${index}`}
                    d={d}
                    fill="none"
                    stroke={C.lime}
                    strokeWidth={1.35}
                  />
                ))}
                <SvgText
                  x={left + 4}
                  y={rsiTop + 10}
                  fill={C.muted}
                  fontSize={8}
                  fontFamily={mono}
                >
                  ATTACHED · RSI 14
                </SvgText>
                {isFiniteNumber(latestRsi) ? (
                  <SvgText
                    x={left + actualWidth - 4}
                    y={rsiTop + 10}
                    fill={C.lime}
                    fontSize={8}
                    fontFamily={mono}
                    textAnchor="end"
                  >
                    {latestRsi.toFixed(1)}
                  </SvgText>
                ) : (
                  <SvgText
                    x={left + actualWidth - 4}
                    y={rsiTop + 10}
                    fill={C.muted}
                    fontSize={8}
                    fontFamily={mono}
                    textAnchor="end"
                  >
                    —
                  </SvgText>
                )}
                {[100, 70, 30, 0].map((level) => (
                  <SvgText
                    key={level}
                    x={left + actualWidth + 5}
                    y={rsiY(level) + 3}
                    fill={C.muted}
                    fontSize={8}
                    fontFamily={mono}
                  >
                    {level}
                  </SvgText>
                ))}
              </Svg>
            ) : null}
            {hasMacdPane ? (
              <Svg
                width="100%"
                height={macdH}
                viewBox={`0 0 ${width} ${macdH}`}
              >
                <Rect
                  x={left}
                  y={macdTop}
                  width={actualWidth}
                  height={macdH - macdTop - macdBottom}
                  fill={C.black + "33"}
                  stroke={C.grid}
                  strokeWidth={1}
                />
                <Line
                  x1={left}
                  x2={left + actualWidth}
                  y1={macdY(0)}
                  y2={macdY(0)}
                  stroke={C.muted + "77"}
                  strokeWidth={0.8}
                  strokeDasharray="3 3"
                />
                {indicatorCoordinates.map(({ x: barX, point }, index) => {
                  const histogram = point?.macdHistogram;
                  if (!isFiniteNumber(histogram)) return null;
                  const zeroY = macdY(0);
                  const histogramY = macdY(histogram);
                  return (
                    <Rect
                      key={`macd-hist-${index}`}
                      x={barX - Math.max(1, step * 0.22)}
                      y={Math.min(zeroY, histogramY)}
                      width={Math.max(2, step * 0.44)}
                      height={Math.max(0.65, Math.abs(histogramY - zeroY))}
                      fill={histogram >= 0 ? C.mint + "A8" : C.rose + "A8"}
                    />
                  );
                })}
                {macdPaths.map((d, index) => (
                  <Path
                    key={`macd-${index}`}
                    d={d}
                    fill="none"
                    stroke={C.blue}
                    strokeWidth={1.25}
                  />
                ))}
                {macdSignalPaths.map((d, index) => (
                  <Path
                    key={`macd-signal-${index}`}
                    d={d}
                    fill="none"
                    stroke={C.amber}
                    strokeWidth={1.15}
                  />
                ))}
                <SvgText
                  x={left + 4}
                  y={macdTop + 10}
                  fill={C.muted}
                  fontSize={8}
                  fontFamily={mono}
                >
                  ATTACHED · MACD 12/26/9
                </SvgText>
                <SvgText
                  x={left + actualWidth - 4}
                  y={macdTop + 10}
                  fill={isFiniteNumber(latestMacd) ? C.blue : C.muted}
                  fontSize={8}
                  fontFamily={mono}
                  textAnchor="end"
                >
                  {isFiniteNumber(latestMacd)
                    ? `${latestMacd.toFixed(2)} / ${isFiniteNumber(latestMacdSignal) ? latestMacdSignal.toFixed(2) : "—"}`
                    : "—"}
                </SvgText>
                {[macdBounds.high, 0, macdBounds.low].map((value, index) => (
                  <SvgText
                    key={`macd-axis-${index}`}
                    x={left + actualWidth + 5}
                    y={macdY(value) + 3}
                    fill={C.muted}
                    fontSize={8}
                    fontFamily={mono}
                  >
                    {formatPrice(value, Math.min(8, precision + 2))}
                  </SvgText>
                ))}
              </Svg>
            ) : null}
          </>
        </Pressable>
      )}
      {future ? (
        <Text style={styles.scenario}>
          {scenario
            ? `HISTORICAL SCENARIO · ${scenarioBasis} · ${new Date(scenario.sourceAt * 1000).toLocaleDateString()} · ${scenario.candles.length} SOURCE BARS${scenarioDirection ? ` · ${scenarioDirection}` : ""} · NOT A FORECAST${canJoinScenario ? "" : " · ANCHOR BAR NOT IN VIEW; OUTCOME LEFT UNJOINED"}`
            : analysis
              ? "NO HISTORICAL SCENARIO · NEED 36 VALID CLOSED BARS INCLUDING A FULL PAST CONTINUATION; PROVIDER GAPS ARE PRESERVED"
              : "SETUP ANALYSIS UNAVAILABLE · NO HISTORICAL OVERLAY DRAWN"}
        </Text>
      ) : (
        <Text style={styles.hint}>
          Tap a candle to inspect · setup zones use the same time/price
          coordinates · chart times use your device timezone
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { minHeight: 322, overflow: "hidden" },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 5,
    paddingHorizontal: 5,
    paddingBottom: 4,
  },
  detail: { color: C.muted, fontFamily: mono, fontSize: 9, lineHeight: 14 },
  rightControls: { alignItems: "flex-end", gap: 5 },
  tradeActions: { flexDirection: "row", gap: 5 },
  focusedTrade: {
    color: C.amber,
    fontFamily: mono,
    fontSize: 8,
    fontWeight: "800",
    paddingHorizontal: 6,
    paddingBottom: 4,
  },
  tradeButton: {
    minHeight: 27,
    minWidth: 48,
    borderRadius: 7,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  buyButton: { backgroundColor: C.lime, borderColor: C.lime },
  sellButton: { backgroundColor: C.rose + "20", borderColor: C.rose + "99" },
  buyText: {
    color: C.black,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  sellText: {
    color: C.rose,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  zoom: { flexDirection: "row", gap: 5 },
  zoomButton: {
    height: 29,
    width: 29,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  zoomText: { color: C.text, fontSize: 16 },
  blank: { height: 294, alignItems: "center", justifyContent: "center" },
  blankText: { color: C.muted, fontSize: 13 },
  scenario: {
    color: C.amber,
    fontSize: 9,
    lineHeight: 14,
    paddingHorizontal: 8,
    fontWeight: "700",
  },
  hint: { color: C.muted, fontSize: 9, paddingHorizontal: 8 },
});
