import type { ChartSurfaceEvent } from "./chart-types";
import { validChartCandle } from "./lightweight-payload";
import type { Candle } from "./model";
export function parseChartSurfaceEvent(raw: string): ChartSurfaceEvent | null {
  if (raw.length > 4096) return null;
  try {
    const event = JSON.parse(raw) as Record<string, unknown>;
    if (event.type === "ready") return { type: "ready" };
    if (event.type === "attribution") return { type: "attribution" };
    if (event.type === "error")
      return {
        type: "error",
        message:
          "The local chart canvas reported a rendering error. Retry the chart.",
      };
    if (event.type === "inspect") {
      if (event.candle === null) return { type: "inspect", candle: null };
      const c = event.candle as Candle;
      if (c && validChartCandle(c))
        return {
          type: "inspect",
          candle: {
            time: c.time,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume,
          },
        };
    }
  } catch {
    return null;
  }
  return null;
}
export const CHART_DOCUMENT_ORIGIN = "https://local-chart.stratdesk.invalid/";
export function chartNavigation(url: string): "local" | "attribution" | "deny" {
  if (url === "about:blank" || url === CHART_DOCUMENT_ORIGIN) return "local";
  try {
    const u = new URL(url);
    return u.protocol === "https:" &&
      u.hostname === "www.tradingview.com" &&
      !u.username &&
      !u.password
      ? "attribution"
      : "deny";
  } catch {
    return "deny";
  }
}
