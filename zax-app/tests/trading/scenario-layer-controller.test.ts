import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LightweightPayload } from "../../lib/trading/lightweight-payload";
import type { ScenarioLayerPlot } from "../../lib/trading/scenario-layer-types";
import { createLightweightController } from "../../lib/trading/lightweight-controller";

// Synthetic rendering fixtures only: projection points are never chart history.
const mock = vi.hoisted(() => ({
  chart: undefined as any,
  series: [] as any[],
  crosshair: undefined as any,
  click: undefined as any,
}));

vi.mock("lightweight-charts", () => ({
  CandlestickSeries: "candles",
  LineSeries: "line",
  HistogramSeries: "histogram",
  ColorType: { Solid: "solid" },
  LineStyle: { Dashed: 2, Solid: 0 },
  createChart: () => mock.chart,
}));

const candle = (time: number, close = 100) => ({
  time,
  open: close,
  high: close + 1,
  low: close - 1,
  close,
  volume: 1,
});

const actual = Array.from({ length: 80 }, (_, index) =>
  candle(1_000 + index * 300, 100 + index),
);
const root = () => ({ clientWidth: 500, clientHeight: 360 }) as HTMLElement;
const payload = (): LightweightPayload => ({
  key: "BTC-USD:5m:SYNTHETIC",
  precision: 2,
  candles: actual,
  lines: [],
  zones: [],
  priceLines: [],
  ghost: [],
  ghostLine: [],
  scenarioStyle: "both",
  sourceLabel: "Synthetic test display",
  messages: [],
});

beforeEach(() => {
  mock.series = [];
  let range: any = null;
  const pane = { setStretchFactor: vi.fn(), getHeight: () => 110 };
  const panes = [pane];
  const scale = {
    height: () => 28,
    getVisibleLogicalRange: () => range,
    setVisibleLogicalRange: vi.fn((next: any) => {
      range = { ...next };
    }),
    timeToCoordinate: (time: number) => time / 300,
  };
  mock.chart = {
    timeScale: () => scale,
    panes: () => panes,
    addPane: vi.fn(),
    removePane: vi.fn(),
    addSeries: vi.fn((type: string, options: any, paneIndex = 0) => {
      const series = {
        type,
        options,
        pane: paneIndex,
        removed: false,
        setData: vi.fn(),
        update: vi.fn(),
        applyOptions: vi.fn(),
        createPriceLine: vi.fn((line: any) => line),
        removePriceLine: vi.fn(),
        attachPrimitive: vi.fn((primitive: any) =>
          primitive.attached({
            chart: mock.chart,
            series,
            requestUpdate: vi.fn(),
          }),
        ),
        detachPrimitive: vi.fn((primitive: any) => primitive.detached()),
        priceToCoordinate: (price: number) => price,
      };
      mock.series.push(series);
      return series;
    }),
    removeSeries: vi.fn((series: any) => {
      series.removed = true;
    }),
    subscribeCrosshairMove: vi.fn((callback: any) => {
      mock.crosshair = callback;
    }),
    subscribeClick: vi.fn((callback: any) => {
      mock.click = callback;
    }),
    unsubscribeCrosshairMove: vi.fn(),
    unsubscribeClick: vi.fn(),
    applyOptions: vi.fn(),
    remove: vi.fn(),
  };
});

describe("scenario layer chart controller", () => {
  it("renders simultaneous source-timeframe layers display-only, preserves the viewport, and cleans them up", () => {
    const emit = vi.fn();
    const controller = createLightweightController(root(), emit);
    const last = actual.at(-1)!;
    const historical: ScenarioLayerPlot = {
      id: "history-1h",
      label: "Historical 1h",
      kind: "historical",
      sourceTimeframe: "1h",
      style: "both",
      color: "#8EC5FF",
      candles: [candle(last.time + 600, 181), candle(last.time + 1_200, 182)],
      line: [
        { time: last.time, value: last.close },
        { time: last.time + 600, value: 181 },
        { time: last.time + 1_200, value: 182 },
      ],
      note: "Synthetic historical projection",
    };
    const ai: ScenarioLayerPlot = {
      id: "ai-1m",
      label: "AI 1m",
      kind: "ai",
      sourceTimeframe: "1m",
      style: "line",
      color: "#B8A2FF",
      candles: [],
      line: Array.from({ length: 20 }, (_, index) => ({
        time: last.time + index * 60,
        value: last.close + index,
      })),
      note: "Synthetic AI projection",
    };

    controller.update({ ...payload(), scenarioLayers: [historical, ai] });

    const historicalCandles = mock.series.find(
      (series) => series.options.upColor === "rgba(142,197,255,0.3)",
    );
    const historicalLine = mock.series.find(
      (series) => series.options.color === "rgba(142,197,255,0.72)",
    );
    const aiLine = mock.series.find(
      (series) => series.options.color === "rgba(184,162,255,0.72)",
    );
    expect(historicalCandles.setData).toHaveBeenCalledWith([
      expect.objectContaining({ time: last.time + 600, close: 181 }),
      expect.objectContaining({ time: last.time + 1_200, close: 182 }),
    ]);
    expect(historicalLine.setData).toHaveBeenCalledWith(
      expect.arrayContaining([{ time: last.time, value: last.close }]),
    );
    expect([historicalCandles, historicalLine, aiLine]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          options: expect.objectContaining({
            lastValueVisible: false,
            priceLineVisible: false,
          }),
        }),
      ]),
    );
    expect(controller.diagnostics()).toMatchObject({
      actualBars: 80,
      scenarioLayers: 2,
      visibleLogicalRange: { from: 20, to: 99 },
    });
    expect(mock.series[0].setData.mock.calls[0][0]).toHaveLength(80);

    // Projected source bars and paths cannot be inspected as live chart candles.
    mock.crosshair({ time: historical.candles[0].time });
    expect(emit).toHaveBeenLastCalledWith({ type: "inspect", candle: null });
    mock.click({ time: ai.line[2].time });
    expect(emit).toHaveBeenLastCalledWith({ type: "inspect", candle: null });

    controller.command("zoom-in");
    const viewport = mock.chart.timeScale().getVisibleLogicalRange();
    controller.update({
      ...payload(),
      scenarioLayers: [{ ...historical, style: "line", color: "#F4C878" }],
    });
    expect(mock.chart.timeScale().getVisibleLogicalRange()).toEqual(viewport);
    expect(historicalCandles.removed).toBe(true);
    expect(aiLine.removed).toBe(true);
    expect(historicalLine.applyOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ color: "rgba(244,200,120,0.72)" }),
    );
    expect(controller.diagnostics()).toMatchObject({ scenarioLayers: 1 });
    expect(mock.chart.addPane).not.toHaveBeenCalled();
    expect(mock.chart.removePane).not.toHaveBeenCalled();

    controller.update({ ...payload(), scenarioLayers: [] });
    expect(historicalLine.removed).toBe(true);
    expect(controller.diagnostics()).toMatchObject({ scenarioLayers: 0 });
    expect(mock.chart.removePane).not.toHaveBeenCalled();
    controller.destroy();
    controller.destroy();
    expect(mock.chart.remove).toHaveBeenCalledTimes(1);
  });

  it("bounds the extra layer map to six source-labelled display layers and refits them on reset", () => {
    const controller = createLightweightController(root(), vi.fn());
    const last = actual.at(-1)!;
    const layers = Array.from(
      { length: 7 },
      (_, index): ScenarioLayerPlot => ({
        id: `source-${index}`,
        label: `Source ${index}`,
        kind: index % 2 ? "ai" : "historical",
        sourceTimeframe: index % 2 ? "1m" : "4h",
        style: "line",
        color: "#72E6BE",
        candles: [],
        line: [
          { time: last.time, value: last.close },
          { time: last.time + (index + 1) * 300, value: last.close + index },
        ],
        note: "Synthetic bounded source",
      }),
    );
    controller.update({ ...payload(), scenarioLayers: layers });
    expect(controller.diagnostics()).toMatchObject({ scenarioLayers: 6 });
    controller.command("reset");
    expect(controller.diagnostics()).toMatchObject({
      visibleLogicalRange: { from: 20, to: 91 },
    });
    controller.destroy();
  });
});
