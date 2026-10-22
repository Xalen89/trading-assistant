"use client";

import { useEffect, useRef } from "react";
import { CandlestickSeries, ColorType, createChart, createSeriesMarkers, LineStyle, type UTCTimestamp } from "lightweight-charts";
import type { Analysis, Candle } from "../lib/types";

export function PriceChart({ candles, analysis, overlays }: { candles: Candle[]; analysis: Analysis | null; overlays: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!container.current || !candles.length) return;
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
    const sorted = [...new Map(candles.map((candle) => [candle.time, candle])).values()].sort((a, b) => a.time - b.time);
    series.setData(sorted.map((candle) => ({ ...candle, time: candle.time as UTCTimestamp })));
    if (analysis && overlays) {
      analysis.levels.forEach((level, index) => series.createPriceLine({
        price: level.price, title: level.label, color: ["#a78bfa", "#e7b95f", "#5eb7f7"][index % 3],
        lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true,
      }));
      const timestamp = Math.floor(new Date(analysis.createdAt).getTime() / 1000);
      const anchor = sorted.findLast((candle) => candle.time <= timestamp);
      if (anchor) createSeriesMarkers(series, [{
        time: anchor.time as UTCTimestamp, position: analysis.direction === "short" ? "aboveBar" : "belowBar",
        color: "#a78bfa", shape: analysis.direction === "short" ? "arrowDown" : "arrowUp",
        text: `Analysis · ${analysis.direction.toUpperCase()}`,
      }]);
    }
    chart.timeScale().fitContent();
    const observer = new ResizeObserver(([entry]) => {
      chart.applyOptions({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(container.current);
    return () => { observer.disconnect(); chart.remove(); };
  }, [candles, analysis, overlays]);
  return <div ref={container} className="price-chart" aria-label="Interactive candlestick price chart" role="img" />;
}
