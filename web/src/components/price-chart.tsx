"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  CandlestickSeries, ColorType, createChart, createSeriesMarkers, LineStyle,
  type IChartApi, type IPriceLine, type ISeriesApi, type ISeriesMarkersPluginApi, type Time, type UTCTimestamp,
} from "lightweight-charts";
import type { Analysis, Candle } from "../lib/types";

export function PriceChart({ candles, analysis, overlays }: { candles: Candle[]; analysis: Analysis | null; overlays: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const levelsRef = useRef<IPriceLine[]>([]);
  const previousTimes = useRef<number[]>([]);
  const fitted = useRef(false);
  const sorted = useMemo(() => [...new Map(candles.map((candle) => [candle.time, candle])).values()].sort((a, b) => a.time - b.time), [candles]);

  useEffect(() => {
    if (!container.current) return;
    const chart = createChart(container.current, {
      layout: { background: { type: ColorType.Solid, color: "#10151e" }, textColor: "#778397", fontFamily: "Arial, sans-serif", fontSize: 11, attributionLogo: true },
      grid: { vertLines: { color: "#1b223033" }, horzLines: { color: "#252d3b66" } },
      rightPriceScale: { borderColor: "#252d3b", scaleMargins: { top: 0.16, bottom: 0.12 } },
      timeScale: { borderColor: "#252d3b", timeVisible: true, secondsVisible: false, rightOffset: 6 },
      crosshair: { vertLine: { color: "#6b7a90", labelBackgroundColor: "#263347" }, horzLine: { color: "#6b7a90", labelBackgroundColor: "#263347" } },
      handleScroll: true, handleScale: true,
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#2dc7a0", downColor: "#ef7582", borderUpColor: "#2dc7a0", borderDownColor: "#ef7582",
      wickUpColor: "#2dc7a0", wickDownColor: "#ef7582", priceLineColor: "#2dc7a0",
    });
    chartRef.current = chart;
    seriesRef.current = series;
    markersRef.current = createSeriesMarkers(series, []);
    const observer = new ResizeObserver(([entry]) => {
      chart.applyOptions({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      markersRef.current?.detach();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      markersRef.current = null;
      levelsRef.current = [];
      previousTimes.current = [];
      fitted.current = false;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;
    const viewport = chart.timeScale().getVisibleLogicalRange();
    const indices = new Map(sorted.map((candle, index) => [candle.time, index]));
    const anchorIndex = previousTimes.current.findIndex((time) => indices.has(time));
    const shift = anchorIndex < 0 ? 0 : indices.get(previousTimes.current[anchorIndex])! - anchorIndex;
    series.setData(sorted.map((candle) => ({ ...candle, time: candle.time as UTCTimestamp })));
    if (!fitted.current && sorted.length) {
      chart.timeScale().fitContent();
      fitted.current = true;
    } else if (viewport) {
      // A rolling data window can remove leading bars; keep the same candles in view.
      chart.timeScale().setVisibleLogicalRange({ from: viewport.from + shift, to: viewport.to + shift });
    }
    previousTimes.current = sorted.map((candle) => candle.time);
  }, [sorted]);

  useEffect(() => {
    const series = seriesRef.current;
    const markers = markersRef.current;
    if (!series || !markers) return;
    levelsRef.current.forEach((level) => series.removePriceLine(level));
    levelsRef.current = [];
    markers.setMarkers([]);
    if (analysis && overlays) {
      levelsRef.current = analysis.levels.map((level, index) => series.createPriceLine({
        price: level.price, title: level.label, color: ["#a78bfa", "#e7b95f", "#5eb7f7"][index % 3],
        lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true,
      }));
      const timestamp = Math.floor(new Date(analysis.createdAt).getTime() / 1000);
      const anchor = sorted.findLast((candle) => candle.time <= timestamp);
      if (anchor) markers.setMarkers([{
        time: anchor.time as UTCTimestamp, position: analysis.direction === "wait" ? "inBar" : analysis.direction === "short" ? "aboveBar" : "belowBar",
        color: analysis.direction === "wait" ? "#94a3b8" : "#a78bfa",
        shape: analysis.direction === "wait" ? "circle" : analysis.direction === "short" ? "arrowDown" : "arrowUp",
        text: `Analysis · ${analysis.direction.toUpperCase()}`,
      }]);
    }
  }, [analysis, overlays, sorted]);
  return <div ref={container} className="price-chart" aria-label="Interactive candlestick price chart" role="img" />;
}
