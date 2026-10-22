import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CandleChartProps } from "../../lib/trading/chart-types";
import { buildLightweightPayload } from "../../lib/trading/lightweight-payload";
import { createLightweightController } from "../../lib/trading/lightweight-controller";

// Mock canvas API + synthetic unit fixtures: never validation or market evidence.
const mock = vi.hoisted(() => ({
  chart: undefined as any,
  series: [] as any[],
  primitive: undefined as any,
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
  close,
  low: close - 1,
  high: close + 1,
  volume: 1,
});
const props = (patch: Partial<CandleChartProps> = {}): CandleChartProps => ({
  candles: Array.from({ length: 80 }, (_, i) => candle(1000 + i * 300)),
  market: "BTC-USD",
  timeframe: "5m",
  precision: 2,
  showFvg: false,
  showRanges: false,
  showLevels: false,
  future: false,
  ...patch,
});

beforeEach(() => {
  mock.series = [];
  mock.primitive = undefined;
  const pane = (preserve: boolean) => ({
    preserve,
    setStretchFactor: vi.fn(),
    getHeight: () => 110,
  });
  const panes = [pane(true)];
  let range: any = null;
  const scale = {
    height: () => 28,
    getVisibleLogicalRange: () => range,
    setVisibleLogicalRange: vi.fn((r: any) => {
      range = { ...r };
    }),
    timeToCoordinate: (t: number) => t / 300,
  };
  mock.chart = {
    timeScale: () => scale,
    panes: () => panes,
    addPane: vi.fn((preserve: boolean) => {
      panes.push(pane(preserve));
    }),
    removePane: vi.fn((i: number) => {
      panes.splice(i, 1);
    }),
    addSeries: vi.fn((type: string, options: any, pane = 0) => {
      const s = {
        type,
        options,
        pane,
        removed: false,
        setData: vi.fn(),
        update: vi.fn(),
        applyOptions: vi.fn(),
        createPriceLine: vi.fn((line: any) => line),
        removePriceLine: vi.fn(),
        attachPrimitive: vi.fn((p: any) => {
          mock.primitive = p;
          p.attached({ chart: mock.chart, series: s, requestUpdate: vi.fn() });
        }),
        detachPrimitive: vi.fn((p: any) => p.detached()),
        priceToCoordinate: (p: number) => p,
      };
      mock.series.push(s);
      return s;
    }),
    removeSeries: vi.fn((s: any) => {
      s.removed = true;
    }),
    subscribeCrosshairMove: vi.fn((fn: any) => {
      mock.crosshair = fn;
    }),
    subscribeClick: vi.fn((fn: any) => {
      mock.click = fn;
    }),
    unsubscribeCrosshairMove: vi.fn(),
    unsubscribeClick: vi.fn(),
    applyOptions: vi.fn(),
    remove: vi.fn(),
  };
});

const root = () => ({ clientWidth: 400, clientHeight: 330 }) as HTMLElement;
describe("official chart controller lifecycle", () => {
  it("uses incremental last-bar updates and preserves viewport; new source resets to latest", () => {
    const c = createLightweightController(root(), vi.fn());
    const p = buildLightweightPayload(props());
    c.update(p);
    c.command("zoom-in");
    const viewport = mock.chart.timeScale().getVisibleLogicalRange();
    c.update({
      ...p,
      candles: p.candles.map((x, i) => (i === 79 ? candle(x.time, 101) : x)),
    });
    expect(mock.series[0].setData).toHaveBeenCalledTimes(1);
    expect(mock.series[0].update).toHaveBeenCalledTimes(1);
    expect(mock.chart.timeScale().getVisibleLogicalRange()).toEqual(viewport);
    c.update({ ...p, key: "OTHER:5m:UNIT", candles: p.candles.slice(0, 5) });
    expect(mock.chart.timeScale().getVisibleLogicalRange()).toEqual({
      from: 0,
      to: 16,
    });
  });
  it("owns pane removal and retains the remaining indicator across toggles", () => {
    const c = createLightweightController(root(), vi.fn());
    const p = buildLightweightPayload(props());
    const line = (id: string, pane: "rsi" | "macd") => ({
      id,
      pane,
      color: "#abcdef",
      label: id,
      segments: [[{ time: 1000, value: 50 }]],
    });
    c.update({ ...p, lines: [line("rsi", "rsi"), line("macd", "macd")] });
    expect(
      mock.chart.addPane.mock.calls.every((args: any[]) => args[0] === true),
    ).toBe(true);
    c.update({ ...p, lines: [line("macd", "macd")] });
    expect(c.diagnostics()).toMatchObject({
      paneCount: 2,
      lineTitles: ["macd"],
    });
    expect(
      mock.series.find(
        (s) =>
          s.type === "line" && s.options.color === "#abcdef" && s.pane === 2,
      )?.removed,
    ).toBe(false);
    c.update({ ...p, lines: [] });
    expect(c.diagnostics()).toMatchObject({ paneCount: 1 });
  });
  it("includes exact distant saved SL/TP in primitive autoscale and inspects only actual candles", () => {
    const emit = vi.fn();
    const c = createLightweightController(root(), emit);
    const p = buildLightweightPayload(props());
    c.update({
      ...p,
      priceLines: [
        {
          id: "sl",
          price: 50,
          label: "SAVED SL",
          color: "#ff0000",
          origin: "paper",
          paperTone: "stop",
        },
        {
          id: "tp",
          price: 200,
          label: "SAVED TP",
          color: "#00ff00",
          origin: "paper",
          paperTone: "target",
        },
      ],
      ghost: [candle(50000)],
    });
    expect(mock.primitive.autoscaleInfo()).toEqual({
      priceRange: { minValue: 50, maxValue: 200 },
    });
    mock.crosshair({ time: 50000 });
    expect(emit).toHaveBeenLastCalledWith({ type: "inspect", candle: null });
    mock.click({ time: 1000 });
    expect(emit).toHaveBeenLastCalledWith({
      type: "inspect",
      candle: candle(1000),
    });
    c.destroy();
    c.destroy();
    expect(mock.chart.remove).toHaveBeenCalledTimes(1);
    expect(mock.chart.unsubscribeCrosshairMove).toHaveBeenCalledTimes(1);
  });
  it("keeps one-bar pane guides unique rather than submitting duplicate timestamps", () => {
    const c = createLightweightController(root(), vi.fn());
    const p = buildLightweightPayload(props({ candles: [candle(1000)] }));
    c.update({
      ...p,
      lines: [
        {
          id: "rsi",
          pane: "rsi",
          label: "RSI",
          color: "#fff",
          segments: [[{ time: 1000, value: 50 }]],
        },
      ],
    });
    const guides = mock.series.find((s) => s.options.color === "rgba(0,0,0,0)");
    expect(guides.setData.mock.calls[0][0]).toHaveLength(1);
  });
  it("creates whitespace-only reference slots with no autoscale prices and removes them with the reference", () => {
    const c = createLightweightController(root(), vi.fn());
    const p = buildLightweightPayload(
      props({
        candles: [candle(1000)],
        referenceImage: { uri: "data:image/png;base64,AAAA", label: "UNIT" },
      }),
    );
    c.update(p);
    const carrier = mock.series.find(
      (s) => s.options.autoscaleInfoProvider?.() === null,
    );
    const slots = carrier.setData.mock.calls[0][0];
    expect(slots).toHaveLength(12);
    expect(slots.every((x: any) => Object.keys(x).join() === "time")).toBe(
      true,
    );
    c.update({ ...p, reference: undefined });
    expect(carrier.removed).toBe(true);
    c.destroy();
  });
  it("keeps all level lines while reserving compact badges and forced scale for paper brackets", () => {
    const c = createLightweightController(root(), vi.fn());
    const p = buildLightweightPayload(props());
    const priceLines = [
      {
        id: "setup",
        price: 10000,
        label: "A distant setup context level",
        color: "#abcdef",
        origin: "level" as const,
      },
      {
        id: "working-stop",
        price: 50,
        label: "WORKING SL · MANAGEMENT OFF",
        color: "#ff0000",
        origin: "paper" as const,
        paperTone: "stop" as const,
      },
    ];
    c.update({ ...p, priceLines });
    const created = mock.series[0].createPriceLine.mock.calls.map(
      (args: any[]) => args[0],
    );
    expect(created).toHaveLength(2);
    expect(created[0]).toMatchObject({
      price: 10000,
      lineVisible: true,
      axisLabelVisible: false,
      title: "",
    });
    expect(created[1]).toMatchObject({
      price: 50,
      axisLabelVisible: true,
      title: "SL",
    });
    expect(mock.primitive.autoscaleInfo()).toEqual({
      priceRange: { minValue: 50, maxValue: 50 },
    });
    c.command("zoom-in");
    const range = mock.chart.timeScale().getVisibleLogicalRange();
    c.update({ ...p, priceLines, showSetupLabels: true });
    expect(mock.chart.timeScale().getVisibleLogicalRange()).toEqual(range);
    expect(mock.series[0].createPriceLine.mock.calls.at(-2)[0]).toMatchObject({
      axisLabelVisible: true,
    });
    c.destroy();
  });
});

// Synthetic display fixture ONLY: no generated path is accepted as market history.
it("adds/removes separate hypothetical forecast series and inspects actual candles only", () => {
  const emit = vi.fn(),
    controller = createLightweightController(root(), emit),
    payload = buildLightweightPayload(props()),
    last = payload.candles.at(-1)!;
  const projected = Array.from({ length: 12 }, (_, i) =>
    candle(last.time + (i + 1) * 300, 100 + i),
  );
  controller.update({
    ...payload,
    forecastGhost: projected,
    forecastLine: [
      { time: last.time, value: last.close },
      ...projected.map((c) => ({ time: c.time, value: c.close })),
    ],
    forecastStyle: "both",
    forecastLabel: "SYNTHETIC HYPOTHETICAL TEST",
  });
  expect(controller.diagnostics()).toMatchObject({
    actualBars: 80,
    replayBars: 0,
    forecastBars: 12,
  });
  expect(mock.series[0].setData.mock.calls[0][0]).toHaveLength(80);
  mock.click({ time: projected[0].time });
  expect(emit).toHaveBeenLastCalledWith({ type: "inspect", candle: null });
  const forecastSeries = mock.series.slice(-2);
  controller.update(payload);
  expect(forecastSeries.every((s) => s.removed)).toBe(true);
  expect(controller.diagnostics()).toMatchObject({
    actualBars: 80,
    forecastBars: 0,
  });
  controller.destroy();
  expect(mock.chart.remove).toHaveBeenCalledTimes(1);
});

// Synthetic session display only: toggling does not change history or navigation.
it("toggles session backgrounds without resetting price data or visible range", () => {
  const controller = createLightweightController(root(), vi.fn());
  const payload = buildLightweightPayload(props());
  const session = {
    id: "UNIT",
    session: "asia" as const,
    label: "Asia",
    timezone: "Asia/Tokyo",
    from: 1000,
    to: 2000,
    startsAt: 1000,
    endsAt: 2000,
    color: "#B8A2FF",
    row: 0,
    clipped: false,
  };
  controller.update({ ...payload, sessionBoxes: [session] });
  controller.command("zoom-in");
  const range = mock.chart.timeScale().getVisibleLogicalRange();
  expect(controller.diagnostics()).toMatchObject({
    sessionBoxes: 1,
    actualBars: 80,
  });
  controller.update({ ...payload, sessionBoxes: [] });
  expect(controller.diagnostics()).toMatchObject({
    sessionBoxes: 0,
    actualBars: 80,
  });
  expect(mock.chart.timeScale().getVisibleLogicalRange()).toEqual(range);
  expect(mock.series[0].setData).toHaveBeenCalledTimes(1);
  controller.destroy();
});
