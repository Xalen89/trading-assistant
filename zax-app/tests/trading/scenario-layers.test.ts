import { sanitizeScenarioLayers } from "../../lib/trading/scenario-layer-storage";
import { describe, it, expect } from "vitest";
import { projectScenarioLayers } from "../../lib/trading/scenario-layers";
import { scenarioLayersSchema } from "../../server/trading/scenario-layer-schema";
import { workspaceSchema } from "../../server/trading/validation";
import { initialWorkspace, type Candle } from "../../lib/trading/model";
import type {
  AIScenarioLayer,
  HistoricalScenarioLayer,
} from "../../lib/trading/scenario-layer-types";
import { SCENARIO_TIMEFRAMES } from "../../lib/trading/scenario-layer-types";
import { buildLightweightPayload } from "../../lib/trading/lightweight-payload";
// Explicit synthetic unit fixtures: not actual market history or forecast evidence.
const now = 1_800_000_000_000,
  t = now / 1000 - 3600;
const c = (time: number, price = 100): Candle => ({
  time,
  open: price,
  high: price + 2,
  low: price - 2,
  close: price,
  volume: 0,
});
const ai = (): AIScenarioLayer => ({
  id: "ai-one",
  kind: "ai",
  label: "Conditional",
  market: "BTC-USD",
  sourceTimeframe: "1h",
  displayTimeframes: ["5m", "1h"],
  enabled: true,
  style: "both",
  anchorMode: "follow",
  color: "#8EC5FF",
  createdAt: now,
  forecast: {
    id: "f",
    kind: "ai-hypothetical",
    market: "BTC-USD",
    timeframe: "1h",
    model: "unit-model",
    generatedAt: now,
    expiresAt: now + 900000,
    anchorAt: t,
    anchorPrice: 100,
    sourceLastClosedAt: t - 3600,
    source: "unit-only",
    atr: 2,
    direction: "up",
    thesis: "Conditional fixture",
    assumptions: ["Fixture condition"],
    invalidation: "Fixture",
    candles: Array.from({ length: 12 }, (_, i) =>
      c(t + (i + 1) * 3600, 101 + i),
    ),
    probability: null,
    volumeMeaning: "display-placeholder-not-forecast",
  },
});
const hist = (): HistoricalScenarioLayer => ({
  id: "hist-one",
  kind: "historical",
  label: "Source replay",
  market: "BTC-USD",
  sourceTimeframe: "15m",
  displayTimeframes: ["5m"],
  enabled: true,
  style: "line",
  anchorMode: "follow",
  color: "#F4C878",
  createdAt: now,
  scenario: {
    id: "h",
    anchorAt: t,
    anchorPrice: 100,
    sourceAt: t - 100000,
    source: "unit historical fixture",
    strategyIds: ["unit-strategy"],
    strategyVersions: [1],
    combination: "any",
    distance: 0.1,
    explanation: "Actual-source type, synthetic fixture only",
    basis: "context-replay",
    candles: [c(t - 100000 + 900, 102), c(t - 100000 + 7200, 104)],
  },
});
describe("timeframe-scoped connected scenario layers", () => {
  it("projects AI and history on another frame while preserving source intervals and gaps", () => {
    const a = ai(),
      h = hist(),
      original = JSON.stringify([a, h]),
      anchor = c(t + 1800, 200);
    const out = projectScenarioLayers([a, h], "BTC-USD", "5m", anchor, now);
    expect(out.plots).toHaveLength(2);
    expect(out.plots[0].line[0]).toEqual({ time: anchor.time, value: 200 });
    expect(out.plots[0].candles[0].time).toBe(anchor.time + 3600);
    expect(out.plots[0].candles[0].close).toBe(202);
    expect(out.plots[1].candles[1].time - out.plots[1].candles[0].time).toBe(
      6300,
    );
    expect(JSON.stringify([a, h])).toBe(original);
    expect(out.plots[0].note).toMatch(/not refreshed analysis/i);
  });
  it("retains fixed anchors and selected-frame visibility independently", () => {
    const a = ai();
    a.anchorMode = "fixed";
    expect(
      projectScenarioLayers([a, hist()], "BTC-USD", "1h", c(t + 1800, 200), now)
        .plots,
    ).toHaveLength(1);
    expect(
      projectScenarioLayers([a], "BTC-USD", "1h", c(t + 1800, 200), now)
        .plots[0].line[0],
    ).toEqual({ time: t, value: 100 });
    a.enabled = false;
    expect(
      projectScenarioLayers([a], "BTC-USD", "5m", c(t), now).plots,
    ).toHaveLength(0);
  });
  it("hides expired/wrong-market/invalid-date AI and rejects future bars posing as history", () => {
    const a = ai();
    a.forecast.expiresAt = now - 1;
    expect(
      projectScenarioLayers([a], "BTC-USD", "5m", c(t), now).statuses[0].reason,
    ).toMatch(/expired/);
    expect(
      projectScenarioLayers([ai()], "ETH-USD", "5m", c(t), now).plots,
    ).toHaveLength(0);
    a.forecast.expiresAt = 1e100;
    expect(
      projectScenarioLayers([a], "BTC-USD", "5m", c(t), now).plots,
    ).toHaveLength(0);
    const h = hist();
    h.scenario.candles = [c(t + 60)];
    expect(
      projectScenarioLayers([h], "BTC-USD", "5m", c(t), now).plots,
    ).toHaveLength(0);
  });
  it("enforces six drawn layers with an explicit status and no duplicate draws", () => {
    const layers = Array.from({ length: 8 }, (_, i) => ({
      ...ai(),
      id: `a-${i}`,
    }));
    const out = projectScenarioLayers(layers, "BTC-USD", "5m", c(t), now);
    expect(out.plots).toHaveLength(6);
    expect(out.statuses[6].reason).toMatch(/Six/);
    expect(
      projectScenarioLayers([ai(), ai()], "BTC-USD", "5m", c(t), now).plots,
    ).toHaveLength(1);
  });
  it("round-trips owner settings, preserving old workspaces and rejecting identity/duplicate corruption", () => {
    const saved = initialWorkspace();
    saved.settings.scenarioLayers = [ai(), hist()];
    expect(workspaceSchema.parse(saved).settings.scenarioLayers).toEqual(
      saved.settings.scenarioLayers,
    );
    expect(workspaceSchema.safeParse(initialWorkspace()).success).toBe(true);
    expect(scenarioLayersSchema.safeParse([ai(), ai()]).success).toBe(false);
    const a = ai();
    a.sourceTimeframe = "15m";
    expect(scenarioLayersSchema.safeParse([a]).success).toBe(false);
  });
  it("round-trips, sanitizes, workspace-validates, and renders a layer on every shared display timeframe", () => {
    const savedAt = Date.now();
    const anchorAt = Math.floor(savedAt / 1000) - 604_900;
    const a = ai();
    a.createdAt = savedAt;
    a.displayTimeframes = [...SCENARIO_TIMEFRAMES];
    a.forecast.generatedAt = savedAt - 1_000;
    a.forecast.expiresAt = savedAt + 600_000;
    a.forecast.anchorAt = anchorAt;
    a.forecast.anchorPrice = 100;
    a.forecast.sourceLastClosedAt = anchorAt - 3600;
    a.forecast.candles = Array.from({ length: 12 }, (_, index) =>
      c(anchorAt + (index + 1) * 3600, 101 + index),
    );
    const workspace = initialWorkspace();
    workspace.settings.scenarioLayers = [a];
    const validated = workspaceSchema.parse(workspace);
    const sanitized = sanitizeScenarioLayers(validated.settings.scenarioLayers);

    expect(sanitized).toEqual({ layers: [a], invalidCount: 0 });
    const rendered = buildLightweightPayload(
      {
        market: "BTC-USD",
        timeframe: "1w",
        candles: [c(anchorAt)],
        precision: 2,
        showFvg: false,
        showRanges: false,
        showLevels: false,
        future: false,
        scenarioLayers: sanitized.layers,
      },
      savedAt / 1000,
    );
    expect(rendered.scenarioLayers).toHaveLength(1);
    expect(rendered.scenarioLayers?.[0].line[0]).toEqual({
      time: anchorAt,
      value: 100,
    });
    expect(rendered.scenarioLayerStatus).toEqual([
      expect.objectContaining({ id: a.id, visible: true }),
    ]);
  });
  it("never inserts projected candles into actual, old replay or forecast arrays", () => {
    const n = Date.now(),
      a = ai();
    a.createdAt = n;
    a.forecast.generatedAt = n;
    a.forecast.expiresAt = n + 900000;
    const actual = c(Math.floor(n / 1000) - 300);
    const payload = buildLightweightPayload({
      market: "BTC-USD",
      timeframe: "5m",
      candles: [actual],
      precision: 2,
      showFvg: false,
      showRanges: false,
      showLevels: false,
      future: false,
      scenarioLayers: [a],
    });
    expect(payload.candles).toEqual([actual]);
    expect(payload.ghost).toEqual([]);
    expect(payload.forecastGhost).toEqual([]);
    expect(payload.scenarioLayers).toHaveLength(1);
  });
});

describe("scenario persistence and provenance negatives", () => {
  it("ignores malformed local layer values while preserving valid snapshots", () => {
    expect(sanitizeScenarioLayers({ bad: true })).toEqual({
      layers: [],
      invalidCount: 1,
    });
    const a = ai();
    const h = hist();
    const out = sanitizeScenarioLayers([
      null,
      a,
      { displayTimeframes: null },
      h,
      a,
    ]);
    expect(out.layers.map((l) => l.id)).toEqual([a.id, h.id]);
    expect(out.invalidCount).toBe(3);
  });
  it("rejects empty/duplicate historical strategy IDs, missing versions and falsified source endpoints", () => {
    const h = hist();
    h.scenario.strategyIds = [];
    h.scenario.strategyVersions = [];
    expect(scenarioLayersSchema.safeParse([h]).success).toBe(false);
    const d = hist();
    d.scenario.strategyIds = ["x", "x"];
    d.scenario.strategyVersions = [1, 1];
    expect(scenarioLayersSchema.safeParse([d]).success).toBe(false);
    const m = hist();
    m.scenario.strategyVersions = [];
    expect(scenarioLayersSchema.safeParse([m]).success).toBe(false);
    const e = hist();
    e.scenario.sourceEndAt = t;
    expect(scenarioLayersSchema.safeParse([e]).success).toBe(false);
    e.scenario.sourceEndAt = e.scenario.candles.at(-1)!.time;
    expect(scenarioLayersSchema.safeParse([e]).success).toBe(true);
  });
  it("labels transformed history and old-context hypotheses while using the true completed close time", () => {
    const a = ai();
    a.forecast.contextMode = "last-available";
    a.forecast.sourceFreshness = {
      status: "stale",
      closedAt: t,
      ageSeconds: 3600,
    };
    const out = projectScenarioLayers([a, hist()], "BTC-USD", "5m", c(t), now);
    expect(out.plots[0].contextMode).toBe("last-available");
    expect(out.plots[0].note).toContain(new Date(t * 1000).toISOString());
    expect(out.plots[0].note).toMatch(/NOT CURRENT/);
    expect(out.plots[1].note).toMatch(/Rebased\/scaled/);
  });
});
