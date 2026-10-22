import { SECONDS } from "./engine";
import type { Candle, Timeframe } from "./model";
import type {
  ScenarioLayer,
  ScenarioLayerPlot,
  ScenarioLayerStatus,
} from "./scenario-layer-types";
import {
  MAX_SAVED_SCENARIO_LAYERS,
  MAX_DRAWN_SCENARIO_LAYERS,
  SCENARIO_TIMEFRAMES,
} from "./scenario-layer-types";

function validCandle(c: Candle): boolean {
  return (
    Number.isInteger(c.time) &&
    c.time > 0 &&
    c.time < 10_000_000_000 &&
    [c.open, c.high, c.low, c.close, c.volume].every(Number.isFinite) &&
    Math.min(c.open, c.high, c.low, c.close) > 0 &&
    c.volume >= 0 &&
    c.low <= Math.min(c.open, c.close) &&
    c.high >= Math.max(c.open, c.close)
  );
}

/** Display-only positive scaling/time translation. Source snapshots are never mutated or reclassified as actual candles. */
export function projectScenarioLayers(
  layers: readonly ScenarioLayer[] | undefined,
  market: string,
  timeframe: Timeframe,
  last: Candle | undefined,
  now = Date.now(),
): { plots: ScenarioLayerPlot[]; statuses: ScenarioLayerStatus[] } {
  const plots: ScenarioLayerPlot[] = [],
    statuses: ScenarioLayerStatus[] = [];
  const seen = new Set<string>();
  const savedLayers: readonly ScenarioLayer[] = Array.isArray(layers)
    ? layers
    : [];
  for (const layer of savedLayers.slice(0, MAX_SAVED_SCENARIO_LAYERS)) {
    if (!layer || typeof layer !== "object") continue;
    const fail = (reason: string) =>
      statuses.push({ id: layer.id, visible: false, reason });
    if (!layer.enabled) {
      fail("Layer is switched off.");
      continue;
    }
    if (layer.market !== market) {
      fail("Saved for another market.");
      continue;
    }
    if (
      !Array.isArray(layer.displayTimeframes) ||
      !layer.displayTimeframes.includes(timeframe)
    ) {
      fail(`Not selected for the ${timeframe} chart.`);
      continue;
    }
    if (seen.has(layer.id)) {
      fail("Duplicate layer ID was not drawn twice.");
      continue;
    }
    seen.add(layer.id);
    if (!last || !validCandle(last)) {
      fail("No actual chart anchor is available.");
      continue;
    }
    if (
      !SCENARIO_TIMEFRAMES.includes(layer.sourceTimeframe) ||
      !["line", "candles", "both"].includes(layer.style) ||
      !["follow", "fixed"].includes(layer.anchorMode) ||
      !/^#[0-9a-fA-F]{6}$/.test(layer.color) ||
      !Number.isFinite(layer.createdAt) ||
      layer.createdAt > now + 1000
    ) {
      fail("Layer display settings are invalid.");
      continue;
    }
    let sourceCandles: readonly Candle[],
      sourceAnchorAt: number,
      sourceAnchorPrice: number,
      offsetOrigin: number,
      note: string;
    if (layer.kind === "ai") {
      const f = layer.forecast;
      if (
        !f ||
        !Array.isArray(f.candles) ||
        f.kind !== "ai-hypothetical" ||
        f.market !== market ||
        f.timeframe !== layer.sourceTimeframe ||
        f.probability !== null
      ) {
        fail("AI source identity does not match this layer.");
        continue;
      }
      if (
        !Number.isFinite(f.generatedAt) ||
        f.generatedAt > now + 1000 ||
        !Number.isFinite(f.expiresAt) ||
        f.expiresAt >= 10_000_000_000_000 ||
        f.expiresAt <= now
      ) {
        fail(
          "AI scenario expired; refresh this layer from its source timeframe.",
        );
        continue;
      }
      if (
        f.candles.length !== 12 ||
        !Number.isInteger(f.anchorAt) ||
        f.anchorAt <= 0 ||
        f.anchorAt >= 10_000_000_000 ||
        !Number.isInteger(f.sourceLastClosedAt) ||
        f.sourceLastClosedAt <= 0 ||
        f.sourceLastClosedAt > f.anchorAt
      ) {
        fail("AI source/step data is invalid.");
        continue;
      }
      sourceCandles = f.candles;
      sourceAnchorAt = f.anchorAt;
      sourceAnchorPrice = f.anchorPrice;
      offsetOrigin = f.anchorAt;
      note = `AI-generated hypothesis · ${f.contextMode === "last-available" ? "LAST AVAILABLE HISTORY, NOT CURRENT" : "source-context snapshot"} · source ${new Date((f.sourceFreshness?.closedAt ?? f.sourceLastClosedAt + SECONDS[layer.sourceTimeframe]) * 1000).toISOString()} · expires ${new Date(f.expiresAt).toISOString()} · not a probability`;
    } else {
      const s = layer.scenario;
      if (
        !s ||
        !Array.isArray(s.candles) ||
        !Number.isInteger(s.sourceAt) ||
        s.sourceAt <= 0 ||
        s.sourceAt >= 10_000_000_000
      ) {
        fail("Historical source metadata is invalid.");
        continue;
      }
      sourceCandles = s.candles;
      sourceAnchorAt = s.anchorAt;
      sourceAnchorPrice = s.anchorPrice ?? NaN;
      offsetOrigin = s.sourceAt;
      if (
        !Number.isInteger(s.sourceAt) ||
        s.sourceAt <= 0 ||
        s.candles.length < 1 ||
        s.candles.length > 100 ||
        s.candles.some(
          (c) => c.time >= s.anchorAt || c.time > layer.createdAt / 1000,
        )
      ) {
        fail("Historical continuation must contain only past source bars.");
        continue;
      }
      note = `Rebased/scaled historical continuation shape and timestamps · ${s.basis ?? "strategy-matched"} · source ${new Date(s.sourceAt * 1000).toISOString()} · not a forecast`;
    }
    if (
      !Number.isInteger(sourceAnchorAt) ||
      sourceAnchorAt <= 0 ||
      sourceAnchorAt >= 10_000_000_000 ||
      !Number.isFinite(sourceAnchorPrice) ||
      sourceAnchorPrice <= 0 ||
      sourceCandles.some(
        (c, i) =>
          !validCandle(c) ||
          c.time <= offsetOrigin ||
          (i > 0 && c.time <= sourceCandles[i - 1].time),
      )
    ) {
      fail("Scenario source geometry/timestamps are invalid.");
      continue;
    }
    const anchorAt = layer.anchorMode === "follow" ? last.time : sourceAnchorAt;
    const anchorPrice =
      layer.anchorMode === "follow" ? last.close : sourceAnchorPrice;
    const scale = anchorPrice / sourceAnchorPrice;
    const candles = sourceCandles.map((c) => ({
      ...c,
      time: anchorAt + c.time - offsetOrigin,
      open: c.open * scale,
      high: c.high * scale,
      low: c.low * scale,
      close: c.close * scale,
    }));
    if (candles.some((c) => !validCandle(c) || c.time <= anchorAt)) {
      fail("Projected display geometry is invalid.");
      continue;
    }
    if (plots.length >= MAX_DRAWN_SCENARIO_LAYERS) {
      fail(
        "Six visible layers maximum; turn off another layer to draw this one.",
      );
      continue;
    }
    const connection =
      layer.anchorMode === "follow"
        ? "Connected to latest actual chart candle; display-only scaling, not refreshed analysis."
        : "Original fixed source anchor; not refreshed analysis.";
    plots.push({
      id: layer.id,
      label: `${layer.kind === "ai" ? "AI" : "HISTORY"} ${layer.sourceTimeframe} · ${layer.label}`,
      kind: layer.kind,
      sourceTimeframe: layer.sourceTimeframe,
      ...(layer.kind === "ai"
        ? { contextMode: layer.forecast.contextMode ?? "current" }
        : {}),
      style: layer.style,
      color: layer.color,
      candles,
      line: [
        { time: anchorAt, value: anchorPrice },
        ...candles.map((c) => ({ time: c.time, value: c.close })),
      ],
      note: `${note}. ${connection}`,
    });
    statuses.push({ id: layer.id, visible: true, reason: connection });
  }
  return { plots, statuses };
}
