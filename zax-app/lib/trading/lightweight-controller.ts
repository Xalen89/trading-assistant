import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesPrimitive,
  type IPrimitivePaneView,
  type SeriesAttachedParameter,
  type Time,
} from "lightweight-charts";
import type { Candle } from "./model";
import type { ChartCommand, ChartSurfaceEvent } from "./chart-types";
import {
  CHART_COLORS,
  type LightweightPayload,
  type PlotLine,
  type PlotPoint,
  validChartCandle,
} from "./lightweight-payload";
import {
  chartLineCaption,
  compactChartTick,
  showChartLineBadge,
} from "./chart-presentation";
import {
  MAX_DRAWN_SCENARIO_LAYERS,
  type ScenarioLayerPlot,
} from "./scenario-layer-types";
import { SessionBackgroundPrimitive } from "./session-background-primitive";

type CandleSeries = ISeriesApi<"Candlestick", Time>;
type PlotSeries = ISeriesApi<"Line", Time> | ISeriesApi<"Histogram", Time>;
type ManagedPlot = {
  series: PlotSeries;
  pane: PlotLine["pane"];
  title: string;
};
type ManagedScenarioLayer = {
  candles?: CandleSeries;
  line?: ISeriesApi<"Line", Time>;
};
type PaneKind = Exclude<PlotLine["pane"], "price">;
type Zone = LightweightPayload["zones"][number];
type Reference = LightweightPayload["reference"];

const DATA_IMAGE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_VISIBLE_BARS = 60;
const FUTURE_BARS = 12;

function safeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sameCandle(a: Candle, b: Candle): boolean {
  return (
    a.time === b.time &&
    a.open === b.open &&
    a.high === b.high &&
    a.low === b.low &&
    a.close === b.close &&
    a.volume === b.volume
  );
}

/** Sorts/deduplicates only real supplied points; it never fills data gaps. */
function cleanCandles(candles: Candle[]): Candle[] {
  const byTime = new Map<number, Candle>();
  for (const candle of candles)
    if (validChartCandle(candle)) byTime.set(candle.time, { ...candle });
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

function cleanPoints(points: PlotPoint[]): PlotPoint[] {
  const byTime = new Map<number, PlotPoint>();
  for (const point of points) {
    if (
      Number.isInteger(point.time) &&
      point.time > 0 &&
      safeNumber(point.value)
    ) {
      byTime.set(point.time, { time: point.time, value: point.value });
    }
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

function priceFormat(precision: number) {
  const digits = Math.max(0, Math.min(8, Math.floor(precision) || 0));
  return {
    type: "price" as const,
    precision: digits,
    minMove: 1 / 10 ** digits,
  };
}

function translucentColor(color: string, alpha: number): string {
  const match = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(color);
  if (!match) return color;
  const hex =
    match[1].length === 3
      ? [...match[1]].map((part) => `${part}${part}`).join("")
      : match[1];
  return `rgba(${parseInt(hex.slice(0, 2), 16)},${parseInt(
    hex.slice(2, 4),
    16,
  )},${parseInt(hex.slice(4, 6), 16)},${alpha})`;
}

function deviceTime(time: Time): string {
  const value = typeof time === "number" ? time : NaN;
  if (!Number.isFinite(value)) return "";
  return new Date(value * 1000).toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Canvas primitive for zones and the optional local reference image. It relies on
 * lightweight-charts' time/price conversion APIs rather than viewport arithmetic.
 */
class PriceOverlayPrimitive implements ISeriesPrimitive<Time> {
  private attachedParams:
    | SeriesAttachedParameter<Time, "Candlestick">
    | undefined;
  private zones: Zone[] = [];
  private lines: LightweightPayload["priceLines"] = [];
  private reference: Reference;
  private times: number[] = [];
  private image: HTMLImageElement | undefined;
  private imageUri: string | undefined;
  private readonly view: IPrimitivePaneView;
  private showSetupLabels = false;

  constructor() {
    this.view = {
      zOrder: () => "normal",
      renderer: () => ({ draw: (target: any) => this.draw(target) }),
    };
  }

  attached(params: SeriesAttachedParameter<Time, "Candlestick">): void {
    this.attachedParams = params;
  }

  detached(): void {
    if (this.image) {
      this.image.onload = null;
      this.image.onerror = null;
    }
    this.image = undefined;
    this.imageUri = undefined;
    this.attachedParams = undefined;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.view];
  }

  updateAllViews(): void {
    // Coordinates are calculated at paint time, so a scroll/resize needs no cache.
  }

  autoscaleInfo() {
    const prices = [
      // The base candle/indicator series own their visible-range scale. Distant
      // setup/context levels stay drawn when in range and available in details;
      // only canonical saved paper brackets must always expand that scale.
      ...this.lines
        .filter((line) => line.origin === "paper")
        .map((line) => line.price),
      ...(this.reference ? [this.reference.low, this.reference.high] : []),
    ].filter(safeNumber);
    if (!prices.length) return null;
    return {
      priceRange: {
        minValue: Math.min(...prices),
        maxValue: Math.max(...prices),
      },
    };
  }

  set(
    payload: Pick<
      LightweightPayload,
      "zones" | "priceLines" | "reference" | "showSetupLabels"
    >,
    candles: Candle[],
    displayTimes: number[],
  ): void {
    this.showSetupLabels = payload.showSetupLabels === true;
    this.zones = payload.zones.filter((zone) =>
      [zone.from, zone.to, zone.low, zone.high].every(safeNumber),
    );
    this.lines = payload.priceLines.filter((line) => safeNumber(line.price));
    this.reference =
      payload.reference &&
      payload.reference.uri.length <= 12 * 1024 * 1024 &&
      DATA_IMAGE.test(payload.reference.uri)
        ? payload.reference
        : undefined;
    this.times = [
      ...new Set([...candles.map((candle) => candle.time), ...displayTimes]),
    ]
      .filter(safeNumber)
      .sort((a, b) => a - b);
    this.loadImage();
    this.attachedParams?.requestUpdate();
  }

  private loadImage(): void {
    if (!this.reference) {
      if (this.image) {
        this.image.onload = null;
        this.image.onerror = null;
      }
      this.image = undefined;
      this.imageUri = undefined;
      return;
    }
    if (this.imageUri === this.reference.uri) return;
    if (this.image) {
      this.image.onload = null;
      this.image.onerror = null;
    }
    this.image = undefined;
    this.imageUri = this.reference.uri;
    if (typeof Image === "undefined") return;
    const image = new Image();
    image.onload = () => this.attachedParams?.requestUpdate();
    image.onerror = () => this.attachedParams?.requestUpdate();
    image.src = this.reference.uri;
    this.image = image;
  }

  private xForTime(time: number): number | null {
    const scale = this.attachedParams?.chart.timeScale();
    if (!scale || !safeNumber(time)) return null;
    const direct = scale.timeToCoordinate(time as Time);
    if (direct !== null) return direct as number;
    if (this.times.length < 2) return null;

    let high = this.times.findIndex((candidate) => candidate > time);
    if (high < 0) high = this.times.length - 1;
    const low = high > 0 ? high - 1 : 0;
    const leftTime = this.times[low];
    const rightTime = this.times[high];
    const leftX = scale.timeToCoordinate(leftTime as Time);
    const rightX = scale.timeToCoordinate(rightTime as Time);
    if (leftX === null || rightX === null || leftTime === rightTime)
      return null;
    return (
      Number(leftX) +
      ((time - leftTime) * (Number(rightX) - Number(leftX))) /
        (rightTime - leftTime)
    );
  }

  private yForPrice(price: number): number | null {
    const coordinate = this.attachedParams?.series.priceToCoordinate(price);
    return coordinate === null || coordinate === undefined
      ? null
      : Number(coordinate);
  }

  private draw(target: any): void {
    if (!this.attachedParams) return;
    target.useBitmapCoordinateSpace((scope: any) => {
      const context = scope.context as CanvasRenderingContext2D;
      const xRatio = scope.horizontalPixelRatio || 1;
      const yRatio = scope.verticalPixelRatio || 1;
      context.save();
      context.scale(xRatio, yRatio);
      for (const zone of this.zones) this.drawZone(context, zone);
      this.drawReference(context);
      context.restore();
    });
  }

  private drawZone(context: CanvasRenderingContext2D, zone: Zone): void {
    const x1 = this.xForTime(zone.from),
      x2 = this.xForTime(zone.to);
    const yHigh = this.yForPrice(zone.high),
      yLow = this.yForPrice(zone.low);
    if ([x1, x2, yHigh, yLow].some((value) => value === null)) return;
    const left = Math.min(x1!, x2!),
      width = Math.max(1, Math.abs(x2! - x1!));
    const top = Math.min(yHigh!, yLow!),
      height = Math.max(1, Math.abs(yLow! - yHigh!));
    context.save();
    context.fillStyle = `${zone.color}20`;
    context.strokeStyle = `${zone.color}A8`;
    context.lineWidth = 1;
    context.fillRect(left, top, width, height);
    context.strokeRect(left + 0.5, top + 0.5, width - 1, height - 1);
    if (safeNumber(zone.ce)) {
      const ce = this.yForPrice(zone.ce);
      if (ce !== null) {
        context.setLineDash([4, 3]);
        context.beginPath();
        context.moveTo(left, ce);
        context.lineTo(left + width, ce);
        context.stroke();
        context.setLineDash([]);
      }
    }
    if (this.showSetupLabels && zone.label && width > 44 && height > 15) {
      context.fillStyle = CHART_COLORS.text;
      context.font = "10px system-ui, sans-serif";
      context.fillText(
        zone.label.slice(0, 30),
        left + 4,
        top + 12,
        Math.max(20, width - 8),
      );
    }
    context.restore();
  }

  private drawReference(context: CanvasRenderingContext2D): void {
    if (
      !this.reference ||
      !this.image ||
      !this.image.naturalWidth ||
      !this.image.naturalHeight
    )
      return;
    const x1 = this.xForTime(this.reference.from),
      x2 = this.xForTime(this.reference.to);
    const yHigh = this.yForPrice(this.reference.high),
      yLow = this.yForPrice(this.reference.low);
    if ([x1, x2, yHigh, yLow].some((value) => value === null)) return;
    const boxWidth = Math.abs(x2! - x1!),
      boxHeight = Math.abs(yLow! - yHigh!);
    if (!boxWidth || !boxHeight) return;
    const scale = Math.min(
      boxWidth / this.image.naturalWidth,
      boxHeight / this.image.naturalHeight,
    );
    const width = this.image.naturalWidth * scale,
      height = this.image.naturalHeight * scale;
    const left = Math.min(x1!, x2!) + (boxWidth - width) / 2;
    const top = Math.min(yHigh!, yLow!) + (boxHeight - height) / 2;
    context.save();
    context.globalAlpha = 0.2;
    context.drawImage(this.image, left, top, width, height);
    context.restore();
  }
}

export function createLightweightController(
  container: HTMLElement,
  emit: (event: ChartSurfaceEvent) => void,
): {
  update(payload: LightweightPayload): void;
  command(command: ChartCommand): void;
  destroy(): void;
  diagnostics(): object;
} {
  let destroyed = false;
  let chart: IChartApi | undefined;
  let candleSeries: CandleSeries | undefined;
  let overlay: PriceOverlayPrimitive | undefined;
  let sessionBackground: SessionBackgroundPrimitive | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let currentKey = "";
  let actual: Candle[] = [];
  let replay: Candle[] = [];
  let initializedView = false;
  let rsiPane: number | undefined;
  let macdPane: number | undefined;
  let rsiBounds: ISeriesApi<"Line", Time> | undefined;
  let macdBounds: ISeriesApi<"Line", Time> | undefined;
  let ghostCandles: CandleSeries | undefined;
  let ghostLine: ISeriesApi<"Line", Time> | undefined;
  let forecastCandles: CandleSeries | undefined;
  let forecastLine: ISeriesApi<"Line", Time> | undefined;
  let forecast: Candle[] = [];
  let referenceTimes: ISeriesApi<"Line", Time> | undefined;
  const plots = new Map<string, ManagedPlot>();
  const scenarioLayers = new Map<string, ManagedScenarioLayer>();
  let scenarioLayerTimes: number[] = [];
  const priceLines: IPriceLine[] = [];
  let lineTitles: string[] = [];

  const safeEmit = (event: ChartSurfaceEvent) => {
    try {
      emit(event);
    } catch {
      /* A host callback must not break the surface. */
    }
  };
  const report = () =>
    safeEmit({
      type: "error",
      message: "Chart surface could not apply this update.",
    });

  const removeSeries = (series: ISeriesApi<any, Time> | undefined) => {
    if (!series || !chart) return;
    try {
      chart.removeSeries(series);
    } catch {
      /* Already removed with a pane. */
    }
  };
  const clearPriceLines = () => {
    if (!candleSeries) return;
    for (const line of priceLines.splice(0)) {
      try {
        candleSeries.removePriceLine(line);
      } catch {
        /* Chart teardown is idempotent. */
      }
    }
  };
  const paneIndex = (kind: PaneKind) => (kind === "rsi" ? rsiPane : macdPane);
  const setPaneHeight = (index: number | undefined) => {
    if (index === undefined || !chart) return;
    const pane = chart.panes()[index] as
      | { setStretchFactor?: (factor: number) => void }
      | undefined;
    pane?.setStretchFactor?.(110);
  };
  const layoutPanes = () => {
    if (!chart) return;
    const count =
      Number(rsiPane !== undefined) + Number(macdPane !== undefined);
    const axisHeight = chart.timeScale().height();
    const priceHeight = Math.max(
      140,
      (container.clientHeight || 360) - axisHeight - count * 110,
    );
    chart.panes()[0]?.setStretchFactor(priceHeight);
    setPaneHeight(rsiPane);
    setPaneHeight(macdPane);
  };
  const removePane = (kind: PaneKind) => {
    if (!chart) return;
    const index = paneIndex(kind);
    if (index === undefined) return;
    for (const [id, item] of [...plots])
      if (item.pane === kind) {
        removeSeries(item.series);
        plots.delete(id);
      }
    if (kind === "rsi") {
      removeSeries(rsiBounds);
      rsiBounds = undefined;
    } else {
      removeSeries(macdBounds);
      macdBounds = undefined;
    }
    try {
      chart.removePane(index);
    } catch {
      /* Nothing left to remove. */
    }
    if (kind === "rsi") {
      rsiPane = undefined;
      if (macdPane !== undefined && macdPane > index) macdPane--;
    } else macdPane = undefined;
  };
  const addPane = (kind: PaneKind) => {
    if (!chart || paneIndex(kind) !== undefined) return;
    const index = chart.panes().length;
    // Explicit removal owns pane indices; removing the last series must not
    // silently delete this pane and shift/remove another strategy's pane.
    chart.addPane(true);
    if (kind === "rsi") rsiPane = index;
    else macdPane = index;
    setPaneHeight(index);
  };
  const syncPanes = (lines: PlotLine[]) => {
    const wantsRsi = lines.some((line) => line.pane === "rsi");
    const wantsMacd = lines.some((line) => line.pane === "macd");
    if (!wantsRsi) removePane("rsi");
    if (!wantsMacd) removePane("macd");
    if (wantsRsi) addPane("rsi");
    if (wantsMacd) addPane("macd");
  };
  const updateBounds = () => {
    if (!chart || !actual.length) return;
    const first = actual[0].time as Time,
      last = actual[actual.length - 1].time as Time;
    if (rsiPane !== undefined) {
      if (!rsiBounds) {
        rsiBounds = chart.addSeries(
          LineSeries,
          {
            color: "rgba(0,0,0,0)",
            lineWidth: 1,
            lastValueVisible: false,
            priceLineVisible: false,
            crosshairMarkerVisible: false,
            priceFormat: { type: "price", precision: 0, minMove: 1 },
            autoscaleInfoProvider: () => ({
              priceRange: { minValue: 0, maxValue: 100 },
            }),
          },
          rsiPane,
        );
        rsiBounds.createPriceLine({
          price: 30,
          color: CHART_COLORS.muted,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          lineVisible: true,
          axisLabelVisible: true,
          title: "RSI 30",
        });
        rsiBounds.createPriceLine({
          price: 70,
          color: CHART_COLORS.muted,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          lineVisible: true,
          axisLabelVisible: true,
          title: "RSI 70",
        });
      }
      rsiBounds.setData([
        { time: first, value: 0 },
        ...(last === first ? [] : [{ time: last, value: 100 }]),
      ]);
      setPaneHeight(rsiPane);
    }
    if (macdPane !== undefined) {
      if (!macdBounds) {
        macdBounds = chart.addSeries(
          LineSeries,
          {
            color: "rgba(0,0,0,0)",
            lineWidth: 1,
            lastValueVisible: false,
            priceLineVisible: false,
            crosshairMarkerVisible: false,
          },
          macdPane,
        );
        macdBounds.createPriceLine({
          price: 0,
          color: CHART_COLORS.muted,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          lineVisible: true,
          axisLabelVisible: true,
          title: "MACD 0",
        });
      }
      macdBounds.setData([
        { time: first, value: 0 },
        ...(last === first ? [] : [{ time: last, value: 0 }]),
      ]);
      setPaneHeight(macdPane);
    }
  };
  const updatePlots = (lines: PlotLine[], precision: number) => {
    if (!chart) return;
    syncPanes(lines);
    const wanted = new Map<string, { line: PlotLine; segment: PlotPoint[] }>();
    for (const line of lines)
      for (let index = 0; index < line.segments.length; index++) {
        const segment = cleanPoints(line.segments[index]);
        if (segment.length)
          wanted.set(`${line.id}:${index}`, { line, segment });
      }
    for (const [id, item] of [...plots])
      if (!wanted.has(id)) {
        removeSeries(item.series);
        plots.delete(id);
      }
    for (const [id, item] of wanted) {
      const targetPane =
        item.line.pane === "price" ? 0 : paneIndex(item.line.pane);
      if (targetPane === undefined) continue;
      let managed = plots.get(id);
      if (!managed || managed.pane !== item.line.pane) {
        if (managed) removeSeries(managed.series);
        const options = {
          color: item.line.color,
          lineWidth: 2 as const,
          lineStyle: item.line.dashed ? LineStyle.Dashed : LineStyle.Solid,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
          priceFormat:
            item.line.pane === "rsi"
              ? { type: "price" as const, precision: 1, minMove: 0.1 }
              : priceFormat(precision),
        };
        const series = item.line.histogram
          ? chart.addSeries(
              HistogramSeries,
              { ...options, base: 0 },
              targetPane,
            )
          : chart.addSeries(LineSeries, options, targetPane);
        managed = { series, pane: item.line.pane, title: item.line.label };
        plots.set(id, managed);
      } else {
        managed.series.applyOptions({
          color: item.line.color,
          lineStyle: item.line.dashed ? LineStyle.Dashed : LineStyle.Solid,
          priceFormat:
            item.line.pane === "rsi"
              ? { type: "price", precision: 1, minMove: 0.1 }
              : priceFormat(precision),
        });
      }
      const data = item.segment.map((point) =>
        item.line.histogram
          ? {
              time: point.time as Time,
              value: point.value,
              color: point.value >= 0 ? CHART_COLORS.green : CHART_COLORS.red,
            }
          : { time: point.time as Time, value: point.value },
      );
      managed.series.setData(data);
    }
    lineTitles = [...new Set(lines.map((line) => line.label))];
    updateBounds();
  };
  const updateGhost = (payload: LightweightPayload, precision: number) => {
    if (!chart) return;
    const showCandles =
      (payload.scenarioStyle === "candles" ||
        payload.scenarioStyle === "both") &&
      replay.length > 0;
    if (showCandles) {
      if (!ghostCandles)
        ghostCandles = chart.addSeries(
          CandlestickSeries,
          {
            upColor: "rgba(114,230,190,.36)",
            downColor: "rgba(255,138,154,.36)",
            wickUpColor: "rgba(114,230,190,.36)",
            wickDownColor: "rgba(255,138,154,.36)",
            borderUpColor: "rgba(114,230,190,.36)",
            borderDownColor: "rgba(255,138,154,.36)",
            priceFormat: priceFormat(precision),
            lastValueVisible: false,
            priceLineVisible: false,
          },
          0,
        );
      else ghostCandles.applyOptions({ priceFormat: priceFormat(precision) });
      ghostCandles.setData(
        replay.map((candle) => ({
          time: candle.time as Time,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
        })),
      );
    } else if (ghostCandles) {
      removeSeries(ghostCandles);
      ghostCandles = undefined;
    }
    const connector = cleanPoints(payload.ghostLine);
    const showLine =
      (payload.scenarioStyle === "line" || payload.scenarioStyle === "both") &&
      connector.length > 0;
    if (showLine) {
      if (!ghostLine)
        ghostLine = chart.addSeries(
          LineSeries,
          {
            color: "rgba(216,243,106,.72)",
            lineWidth: 2,
            lineStyle: LineStyle.Dashed,
            lastValueVisible: false,
            priceLineVisible: false,
            crosshairMarkerVisible: false,
            priceFormat: priceFormat(precision),
          },
          0,
        );
      else ghostLine.applyOptions({ priceFormat: priceFormat(precision) });
      ghostLine.setData(
        connector.map((point) => ({
          time: point.time as Time,
          value: point.value,
        })),
      );
    } else if (ghostLine) {
      removeSeries(ghostLine);
      ghostLine = undefined;
    }
  };
  const updateForecast = (payload: LightweightPayload, precision: number) => {
    if (!chart) return;
    const showCandles =
      (payload.forecastStyle === "candles" ||
        payload.forecastStyle === "both") &&
      forecast.length > 0;
    if (showCandles) {
      if (!forecastCandles)
        forecastCandles = chart.addSeries(
          CandlestickSeries,
          {
            upColor: "rgba(142,197,255,.30)",
            downColor: "rgba(184,162,255,.30)",
            wickUpColor: "rgba(142,197,255,.30)",
            wickDownColor: "rgba(184,162,255,.30)",
            borderUpColor: "rgba(142,197,255,.30)",
            borderDownColor: "rgba(184,162,255,.30)",
            priceFormat: priceFormat(precision),
            lastValueVisible: false,
            priceLineVisible: false,
          },
          0,
        );
      else
        forecastCandles.applyOptions({ priceFormat: priceFormat(precision) });
      forecastCandles.setData(
        forecast.map((candle) => ({
          time: candle.time as Time,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
        })),
      );
    } else if (forecastCandles) {
      removeSeries(forecastCandles);
      forecastCandles = undefined;
    }
    const connector = cleanPoints(payload.forecastLine ?? []);
    const showLine =
      (payload.forecastStyle === "line" || payload.forecastStyle === "both") &&
      connector.length > 0;
    if (showLine) {
      if (!forecastLine)
        forecastLine = chart.addSeries(
          LineSeries,
          {
            color: "rgba(142,197,255,.85)",
            lineWidth: 2,
            lineStyle: LineStyle.Dashed,
            lastValueVisible: false,
            priceLineVisible: false,
            crosshairMarkerVisible: false,
            priceFormat: priceFormat(precision),
          },
          0,
        );
      else forecastLine.applyOptions({ priceFormat: priceFormat(precision) });
      forecastLine.setData(
        connector.map((point) => ({
          time: point.time as Time,
          value: point.value,
        })),
      );
    } else if (forecastLine) {
      removeSeries(forecastLine);
      forecastLine = undefined;
    }
  };
  const updateScenarioLayers = (
    layers: LightweightPayload["scenarioLayers"],
    precision: number,
  ) => {
    if (!chart) return;
    const wanted = new Map<string, ScenarioLayerPlot>();
    for (const layer of layers ?? []) {
      if (
        wanted.size >= MAX_DRAWN_SCENARIO_LAYERS ||
        !layer ||
        !layer.id.trim() ||
        wanted.has(layer.id)
      )
        continue;
      wanted.set(layer.id, layer);
    }
    for (const [id, managed] of [...scenarioLayers])
      if (!wanted.has(id)) {
        removeSeries(managed.candles);
        removeSeries(managed.line);
        scenarioLayers.delete(id);
      }

    const displayTimes: number[] = [];
    for (const [id, layer] of wanted) {
      const candles = cleanCandles(layer.candles);
      const line = cleanPoints(layer.line);
      const showCandles =
        (layer.style === "candles" || layer.style === "both") &&
        candles.length > 0;
      const showLine =
        (layer.style === "line" || layer.style === "both") && line.length > 0;
      let managed = scenarioLayers.get(id);
      if (!managed) {
        managed = {};
        scenarioLayers.set(id, managed);
      }

      if (showCandles) {
        const color = translucentColor(layer.color, 0.3);
        if (!managed.candles)
          managed.candles = chart.addSeries(
            CandlestickSeries,
            {
              upColor: color,
              downColor: color,
              wickUpColor: color,
              wickDownColor: color,
              borderUpColor: color,
              borderDownColor: color,
              priceFormat: priceFormat(precision),
              lastValueVisible: false,
              priceLineVisible: false,
            },
            0,
          );
        else
          managed.candles.applyOptions({
            upColor: color,
            downColor: color,
            wickUpColor: color,
            wickDownColor: color,
            borderUpColor: color,
            borderDownColor: color,
            priceFormat: priceFormat(precision),
          });
        managed.candles.setData(
          candles.map((candle) => ({
            time: candle.time as Time,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
          })),
        );
        displayTimes.push(...candles.map((candle) => candle.time));
      } else if (managed.candles) {
        removeSeries(managed.candles);
        managed.candles = undefined;
      }

      if (showLine) {
        const color = translucentColor(layer.color, 0.72);
        if (!managed.line)
          managed.line = chart.addSeries(
            LineSeries,
            {
              color,
              lineWidth: 2,
              lineStyle: LineStyle.Dashed,
              lastValueVisible: false,
              priceLineVisible: false,
              crosshairMarkerVisible: false,
              priceFormat: priceFormat(precision),
            },
            0,
          );
        else
          managed.line.applyOptions({
            color,
            priceFormat: priceFormat(precision),
          });
        managed.line.setData(
          line.map((point) => ({
            time: point.time as Time,
            value: point.value,
          })),
        );
        displayTimes.push(...line.map((point) => point.time));
      } else if (managed.line) {
        removeSeries(managed.line);
        managed.line = undefined;
      }

      if (!managed.candles && !managed.line) scenarioLayers.delete(id);
    }
    scenarioLayerTimes = [...new Set(displayTimes)].sort((a, b) => a - b);
  };
  const updateReferenceTimes = (reference: Reference) => {
    if (!chart) return;
    if (!reference) {
      removeSeries(referenceTimes);
      referenceTimes = undefined;
      return;
    }
    if (!referenceTimes)
      referenceTimes = chart.addSeries(
        LineSeries,
        {
          color: "rgba(0,0,0,0)",
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
          autoscaleInfoProvider: () => null,
        },
        0,
      );
    // Whitespace supplies display-time positions only, never future prices.
    const step = (reference.to - reference.from) / 11;
    const times = [
      ...new Set(
        Array.from({ length: 12 }, (_, i) =>
          Math.round(reference.from + step * i),
        ),
      ),
    ].sort((a, b) => a - b);
    referenceTimes.setData(times.map((time) => ({ time: time as Time })));
  };
  const setPriceLines = (
    lines: LightweightPayload["priceLines"],
    showSetupLabels: boolean,
  ) => {
    if (!candleSeries) return;
    clearPriceLines();
    for (const line of lines)
      if (safeNumber(line.price)) {
        priceLines.push(
          candleSeries.createPriceLine({
            id: line.id,
            price: line.price,
            color: line.color,
            lineWidth: 1,
            lineStyle: line.dashed ? LineStyle.Dashed : LineStyle.Solid,
            lineVisible: true,
            axisLabelVisible: showChartLineBadge(line, showSetupLabels),
            title: chartLineCaption(line, showSetupLabels),
            axisLabelColor: line.color,
            axisLabelTextColor: CHART_COLORS.background,
          }),
        );
      }
  };
  const showInitialRange = () => {
    if (!chart || !actual.length) return;
    const last = actual.length - 1;
    const scenarioHorizon = new Set(
      scenarioLayerTimes.filter((time) => time > actual[last].time),
    ).size;
    chart.timeScale().setVisibleLogicalRange({
      from: Math.max(0, last - (MAX_VISIBLE_BARS - 1)),
      to: last + Math.max(FUTURE_BARS, scenarioHorizon),
    });
  };
  const applyActual = (next: Candle[], key: string) => {
    if (!candleSeries || !chart) return;
    const priorRange = chart.timeScale().getVisibleLogicalRange();
    const reset =
      key !== currentKey || !actual.length || next.length < actual.length;
    let prefix = 0;
    while (
      prefix < actual.length &&
      prefix < next.length &&
      sameCandle(actual[prefix], next[prefix])
    )
      prefix++;
    if (reset || prefix < Math.max(0, actual.length - 1)) {
      candleSeries.setData(
        next.map((candle) => ({
          time: candle.time as Time,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
        })),
      );
      if (priorRange && initializedView)
        chart.timeScale().setVisibleLogicalRange(priorRange);
    } else {
      for (let index = prefix; index < next.length; index++) {
        const candle = next[index];
        candleSeries.update({
          time: candle.time as Time,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
        });
      }
    }
    actual = next;
    currentKey = key;
  };

  try {
    chart = createChart(container, {
      width: Math.max(1, container.clientWidth || 1),
      height: Math.max(180, container.clientHeight || 360),
      layout: {
        background: { type: ColorType.Solid, color: CHART_COLORS.background },
        textColor: CHART_COLORS.text,
        attributionLogo: true,
        fontSize: container.clientWidth < 600 ? 11 : 12,
      },
      grid: {
        vertLines: { color: CHART_COLORS.grid },
        horzLines: { color: CHART_COLORS.grid },
      },
      handleScroll: {
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      crosshair: {
        vertLine: { color: CHART_COLORS.muted },
        horzLine: { color: CHART_COLORS.muted },
      },
      rightPriceScale: { borderColor: CHART_COLORS.grid },
      timeScale: {
        borderColor: CHART_COLORS.grid,
        timeVisible: true,
        secondsVisible: false,
        tickMarkMaxCharacterLength: 8,
        tickMarkFormatter: compactChartTick,
      },
      localization: { timeFormatter: (time: Time) => deviceTime(time) },
    });
    candleSeries = chart.addSeries(
      CandlestickSeries,
      {
        upColor: CHART_COLORS.green,
        downColor: CHART_COLORS.red,
        wickUpColor: CHART_COLORS.green,
        wickDownColor: CHART_COLORS.red,
        borderUpColor: CHART_COLORS.green,
        borderDownColor: CHART_COLORS.red,
        priceFormat: priceFormat(2),
      },
      0,
    );
    sessionBackground = new SessionBackgroundPrimitive();
    candleSeries.attachPrimitive(sessionBackground);
    overlay = new PriceOverlayPrimitive();
    candleSeries.attachPrimitive(overlay);

    const inspect = (param: { time?: Time }) => {
      const time = typeof param.time === "number" ? param.time : undefined;
      safeEmit({
        type: "inspect",
        candle:
          time === undefined
            ? null
            : (actual.find((candle) => candle.time === time) ?? null),
      });
    };
    chart.subscribeCrosshairMove(inspect);
    chart.subscribeClick(inspect);
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver((entries) => {
        const box = entries[0]?.contentRect;
        if (!box || destroyed || !chart) return;
        chart.applyOptions({
          width: Math.max(1, Math.floor(box.width)),
          height: Math.max(180, Math.floor(box.height)),
          layout: { fontSize: box.width < 600 ? 11 : 12 },
        });
        layoutPanes();
        overlay?.updateAllViews();
        sessionBackground?.updateAllViews();
      });
      resizeObserver.observe(container);
    }

    safeEmit({ type: "ready" });
    return {
      update(payload) {
        if (destroyed || !chart || !candleSeries || !overlay) return;
        try {
          const next = cleanCandles(payload.candles);
          const nextReplay = cleanCandles(payload.ghost);
          if (payload.key !== currentKey || !next.length)
            initializedView = false;
          candleSeries.applyOptions({
            priceFormat: priceFormat(payload.precision),
          });
          applyActual(next, payload.key);
          replay = nextReplay;
          updatePlots(payload.lines, payload.precision);
          updateGhost(payload, payload.precision);
          forecast = cleanCandles(payload.forecastGhost ?? [])
            .filter((c) => c.time > (actual.at(-1)?.time ?? 0))
            .slice(0, 12);
          updateForecast(payload, payload.precision);
          updateScenarioLayers(payload.scenarioLayers, payload.precision);
          updateReferenceTimes(payload.reference);
          setPriceLines(payload.priceLines, payload.showSetupLabels === true);
          overlay.set(payload, actual, [
            ...replay.map((candle) => candle.time),
            ...forecast.map((candle) => candle.time),
            ...scenarioLayerTimes,
          ]);
          sessionBackground?.set(
            payload.sessionBoxes,
            actual,
            payload.sessionInterval ?? 300,
          );
          layoutPanes();
          if (!initializedView && actual.length) {
            initializedView = true;
            showInitialRange();
          }
        } catch {
          report();
        }
      },
      command(command) {
        if (destroyed || !chart) return;
        try {
          if (command === "reset") {
            showInitialRange();
            return;
          }
          const range = chart.timeScale().getVisibleLogicalRange();
          if (!range) return;
          const midpoint = (range.from + range.to) / 2;
          const span = Math.max(4, range.to - range.from);
          const nextSpan =
            command === "zoom-in"
              ? Math.max(4, span * 0.72)
              : Math.min(10_000, span / 0.72);
          chart.timeScale().setVisibleLogicalRange({
            from: midpoint - nextSpan / 2,
            to: midpoint + nextSpan / 2,
          });
        } catch {
          report();
        }
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        resizeObserver?.disconnect();
        try {
          if (sessionBackground)
            candleSeries?.detachPrimitive(sessionBackground);
        } catch {
          /* Safe after partial setup. */
        }
        try {
          candleSeries?.detachPrimitive(overlay!);
        } catch {
          /* Safe after partial setup. */
        }
        try {
          chart?.unsubscribeCrosshairMove(inspect);
          chart?.unsubscribeClick(inspect);
        } catch {
          /* Safe after chart removal. */
        }
        try {
          chart?.remove();
        } catch {
          /* Safe after host teardown. */
        }
        plots.clear();
        scenarioLayers.clear();
        scenarioLayerTimes = [];
        priceLines.length = 0;
        chart = undefined;
      },
      diagnostics() {
        const visible = chart?.timeScale().getVisibleLogicalRange() ?? null;
        return {
          chartSeriesCount:
            1 +
            plots.size +
            (ghostCandles ? 1 : 0) +
            (ghostLine ? 1 : 0) +
            (forecastCandles ? 1 : 0) +
            (forecastLine ? 1 : 0) +
            [...scenarioLayers.values()].reduce(
              (count, layer) =>
                count +
                Number(Boolean(layer.candles)) +
                Number(Boolean(layer.line)),
              0,
            ) +
            (referenceTimes ? 1 : 0) +
            (rsiBounds ? 1 : 0) +
            (macdBounds ? 1 : 0),
          lineTitles: [...lineTitles],
          paneCount: chart?.panes().length ?? 0,
          paneHeights: chart?.panes().map((pane) => pane.getHeight()) ?? [],
          visibleLogicalRange: visible
            ? { from: visible.from, to: visible.to }
            : null,
          actualBars: actual.length,
          replayBars: replay.length,
          forecastBars: forecast.length,
          scenarioLayers: scenarioLayers.size,
          sessionBoxes: sessionBackground?.count ?? 0,
        };
      },
    };
  } catch {
    resizeObserver?.disconnect();
    overlay?.detached();
    sessionBackground?.detached();
    try {
      chart?.remove();
    } catch {
      /* Partial initialization cleanup. */
    }
    chart = undefined;
    report();
    return {
      update() {},
      command() {},
      destroy() {
        destroyed = true;
      },
      diagnostics: () => ({
        chartSeriesCount: 0,
        lineTitles: [],
        paneCount: 0,
        visibleLogicalRange: null,
        actualBars: 0,
        replayBars: 0,
      }),
    };
  }
}
