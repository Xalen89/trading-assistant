import { describe, expect, it } from "vitest";
import type { Candle, Trade } from "../../lib/trading/model";
import type { CandleChartProps } from "../../lib/trading/chart-types";
import type { SetupAnalysis } from "../../lib/trading/setup-model";
import {
  buildLightweightPayload,
  chartCandles,
  chartSegments,
} from "../../lib/trading/lightweight-payload";
import {
  CHART_DOCUMENT_ORIGIN,
  chartNavigation,
  parseChartSurfaceEvent,
} from "../../lib/trading/chart-bridge";

// Synthetic unit fixtures only: not market history, outcomes, or evidence of edge.
const bar = (time: number, close = 100): Candle => ({
  time,
  open: close,
  high: close + 1,
  low: close - 1,
  close,
  volume: 1,
});
const base = (patch: Partial<CandleChartProps> = {}): CandleChartProps => ({
  candles: [bar(1000), bar(1300), bar(1600)],
  market: "BTC-USD",
  timeframe: "5m",
  precision: 2,
  showFvg: false,
  showRanges: false,
  showLevels: false,
  future: false,
  ...patch,
});
const analysis = (patch: Partial<SetupAnalysis> = {}): SetupAnalysis =>
  ({
    market: "BTC-USD",
    timeframe: "5m",
    source: "UNIT FIXTURE",
    profile: { source: "UNIT FIXTURE" },
    candidates: [],
    ...patch,
  }) as SetupAnalysis;
const trade: Trade = {
  id: "unit",
  market: "BTC-USD",
  side: "long",
  status: "open",
  entry: 100,
  stop: 90,
  target: 130,
  quantity: 1,
  pointValue: 1,
  strategyId: "unit",
  strategyName: "UNIT",
  strategyVersion: 1,
  factors: [],
  journal: {},
  createdAt: 1,
};

describe("bounded official chart payload", () => {
  it("sorts/deduplicates supplied OHLC without inventing future bars", () => {
    expect(
      chartCandles(
        [
          bar(1300),
          bar(1000),
          bar(1300, 110),
          bar(1900),
          { ...bar(1200), low: 200 },
        ],
        1600,
      ),
    ).toEqual([bar(1000), bar(1300, 110)]);
    expect(
      chartCandles(
        Array.from({ length: 3100 }, (_, i) => bar(i + 1)),
        4000,
      ),
    ).toHaveLength(3000);
  });
  it("marks a terminal quote-updated candle as forming while layers and forecasts anchor to the last completed bar", () => {
    const asOf = 2_000_000_150;
    const now = asOf * 1000;
    const closed = bar(1_999_999_700, 100);
    const forming = bar(2_000_000_000, 101);
    const forecast = {
      id: "forming-forecast",
      kind: "ai-hypothetical" as const,
      market: "BTC-USD",
      timeframe: "5m" as const,
      model: "unit-model",
      generatedAt: now - 1000,
      expiresAt: now + 600_000,
      anchorAt: closed.time,
      anchorPrice: closed.close,
      sourceLastClosedAt: closed.time - 300,
      source: "UNIT closed source",
      atr: 1,
      direction: "up" as const,
      thesis: "Synthetic display regression only",
      assumptions: ["A completed anchor is required"],
      invalidation: "Synthetic fixture",
      candles: Array.from({ length: 12 }, (_, index) =>
        bar(closed.time + (index + 1) * 300, 102 + index),
      ),
      probability: null,
      volumeMeaning: "display-placeholder-not-forecast" as const,
    };
    const payload = buildLightweightPayload(
      base({
        candles: [closed, forming],
        aiForecast: forecast,
        scenarioLayers: [
          {
            id: "forming-layer",
            kind: "ai",
            label: "Synthetic layer",
            market: "BTC-USD",
            sourceTimeframe: "5m",
            displayTimeframes: ["5m"],
            enabled: true,
            style: "line",
            anchorMode: "follow",
            color: "#8EC5FF",
            createdAt: now - 2_000,
            forecast,
          },
        ],
      }),
      asOf,
    );

    expect(payload.candles).toEqual([closed, forming]);
    expect(payload.formingCandle).toEqual({
      time: forming.time,
      expectedCloseAt: forming.time + 300,
      state: "quote-update",
      anchorAt: closed.time,
    });
    expect(payload.closedAnchorAt).toBe(closed.time);
    expect(payload.forecastLine?.[0]).toEqual({
      time: closed.time,
      value: closed.close,
    });
    expect(payload.scenarioLayers?.[0].line[0]).toEqual({
      time: closed.time,
      value: closed.close,
    });
    expect(payload.sourceLabel).toContain("FORMING / QUOTE UPDATE");
  });
  it("preserves undefined/invalid warmup gaps instead of joining indicator curves", () => {
    const values = [100, undefined, 110, NaN, 120];
    expect(
      chartSegments(
        [1, 2, 3, 4, 5].map((t) => bar(t)),
        (_, i) => values[i],
      ),
    ).toEqual([
      [{ time: 1, value: 100 }],
      [{ time: 3, value: 110 }],
      [{ time: 5, value: 120 }],
    ]);
  });
  it("attaches strategy curves and distinct RSI/MACD panes only from exact timestamp points", () => {
    const p = buildLightweightPayload(
      base({
        indicatorLayers: {
          ema: true,
          ema20: true,
          ema50: false,
          rsi: true,
          macd: true,
        } as any,
        indicators: {
          timeframe: "5m",
          source: "UNIT",
          points: [
            { time: 1000 },
            {
              time: 1300,
              ema20: 100,
              rsi14: 25,
              macd: -1,
              macdSignal: 0,
              macdHistogram: -1,
            },
            {
              time: 1600,
              ema20: 101,
              rsi14: 35,
              macd: 1,
              macdSignal: 0,
              macdHistogram: 1,
            },
          ],
        } as any,
      }),
    );
    expect(p.lines.map((l) => [l.id, l.pane])).toEqual([
      ["ema20", "price"],
      ["rsi14", "rsi"],
      ["macd", "macd"],
      ["macdSignal", "macd"],
      ["macdHistogram", "macd"],
    ]);
    expect(p.lines[0].segments[0].map((x) => x.time)).toEqual([1300, 1600]);
  });
  it("maps actual historical continuation gaps relative to its source anchor, not a fabricated forecast grid", () => {
    const p = buildLightweightPayload(
      base({
        future: true,
        analysis: analysis({
          scenario: {
            anchorAt: 1600,
            anchorPrice: 100,
            sourceAt: 100,
            source: "UNIT",
            candles: [bar(400), bar(1000)],
            basis: "context-replay",
            direction: "up",
          } as any,
        }),
      }),
    );
    expect(p.ghost.map((c) => c.time)).toEqual([1900, 2500]);
    expect(p.ghostLine[0]).toEqual({ time: 1600, value: 100 });
    expect(p.scenarioLabel).toContain("NOT A FORECAST");
  });
  it("rejects a continuation at/after the current anchor and mismatched replay sources", () => {
    const scenario = {
      anchorAt: 1600,
      anchorPrice: 100,
      sourceAt: 100,
      candles: [bar(1600)],
    } as any;
    expect(
      buildLightweightPayload(
        base({ future: true, analysis: analysis({ scenario }) }),
      ).ghost,
    ).toEqual([]);
    const wrong = buildLightweightPayload(
      base({
        future: true,
        analysis: analysis({ market: "ETH-USD", scenario }),
      }),
    );
    expect(wrong.ghost).toEqual([]);
    expect(wrong.messages.join(" ")).toContain("does not match");
  });
  it("draws saved canonical brackets, never another market's bracket", () => {
    expect(
      buildLightweightPayload(base({ focusedTrade: trade })).priceLines.map(
        (l) => l.price,
      ),
    ).toEqual([100, 90, 130]);
    const wrong = buildLightweightPayload(
      base({ focusedTrade: { ...trade, market: "ETH-USD" } }),
    );
    expect(wrong.priceLines).toEqual([]);
    expect(wrong.messages.join(" ")).toContain("another market");
  });
  it("keeps strategy OB zones when independent manual levels are absent", () => {
    const p = buildLightweightPayload(
      base({
        analysis: analysis({
          candidates: [
            {
              zones: [
                {
                  id: "ob",
                  kind: "ob",
                  side: "long",
                  startTime: 1000,
                  endTime: 1300,
                  low: 95,
                  high: 105,
                  ce: 100,
                  label: "OB CE",
                },
              ],
            },
          ] as any,
        }),
      }),
    );
    expect(p.zones[0]).toMatchObject({ id: "ob", ce: 100 });
  });
  it("accepts only local data-image references and does not ship credentials/order state", () => {
    const p = buildLightweightPayload(
      base({
        focusedTrade: { ...trade, journal: { secret: "NEVER_SHIP" } },
        referenceImage: {
          uri: "https://example.com/private.png",
          label: "UNIT",
        },
      }),
    );
    expect(p.reference).toBeUndefined();
    expect(JSON.stringify(p)).not.toContain("NEVER_SHIP");
    expect(
      buildLightweightPayload(
        base({
          referenceImage: { uri: "data:image/png;base64,AAAA", label: "UNIT" },
        }),
      ).reference?.from,
    ).toBe(1900);
  });
});

describe("isolated native display bridge", () => {
  it("permits only local document and exact TradingView attribution navigation", () => {
    expect(chartNavigation(CHART_DOCUMENT_ORIGIN)).toBe("local");
    expect(chartNavigation("about:blank")).toBe("local");
    expect(
      chartNavigation("https://www.tradingview.com/?utm_source=unit"),
    ).toBe("attribution");
    for (const url of [
      "http://www.tradingview.com/",
      "https://www.tradingview.com.evil.test/",
      "https://user:pass@www.tradingview.com/",
      "https://api.tradelocker.com/",
      "javascript:alert(1)",
    ])
      expect(chartNavigation(url)).toBe("deny");
  });
  it("rejects malformed/oversized/order events and strips arbitrary fields from inspection", () => {
    expect(parseChartSurfaceEvent("null")).toBeNull();
    expect(parseChartSurfaceEvent("x".repeat(5000))).toBeNull();
    expect(
      parseChartSurfaceEvent('{"type":"placeOrder","quantity":10}'),
    ).toBeNull();
    expect(
      parseChartSurfaceEvent(
        JSON.stringify({
          type: "inspect",
          candle: { ...bar(1000), account: "PRIVATE" },
        }),
      ),
    ).toEqual({ type: "inspect", candle: bar(1000) });
    expect(
      parseChartSurfaceEvent(
        '{"type":"error","message":"private session token"}',
      ),
    ).toEqual({
      type: "error",
      message:
        "The local chart canvas reported a rendering error. Retry the chart.",
    });
  });
});
