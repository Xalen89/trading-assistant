import { describe, expect, it } from "vitest";
import { INDICATOR_PRESETS } from "../../lib/trading/indicator-presets";
import {
  strategyIndicatorLayers,
  attachedIndicatorNames,
} from "../../lib/trading/strategy-indicators";
import {
  observeScenarioDirection,
  scenarioDirectionContext,
} from "../../lib/trading/scenario-direction";
import type { ForecastScenario } from "../../lib/trading/setup-model";
import { WR1, type Strategy } from "../../lib/trading/model";
import { validNotificationScope } from "../../lib/trading/notification-scope";
import { planBrokerScan } from "../../server/trading/scan-budget";

const preset = (id: string): Strategy =>
  JSON.parse(JSON.stringify(INDICATOR_PRESETS.find((s) => s.id === id)!));
// Unit-only fabricated OHLC. These are not live data or a market/evaluation claim.
const scenario = (
  close: number,
  side: "long" | "short" = "short",
): ForecastScenario => ({
  id: "unit",
  anchorAt: 100,
  anchorPrice: 100,
  sourceAt: 20,
  source: "unit fixture",
  strategyIds: ["custom"],
  strategyVersions: [1],
  combination: "all",
  basis: "context-replay",
  distance: 0.1,
  side,
  explanation: "unit-only",
  candles: [
    {
      time: 25,
      open: 100,
      high: Math.max(100, close),
      low: Math.min(100, close),
      close,
      volume: 1,
    },
  ],
});
describe("strategy-attached source tools", () => {
  it("attaches EMA20/50 and ATR automatically, not old switch preferences", () => {
    const result = strategyIndicatorLayers([preset("trend-following")]);
    expect(result).toMatchObject({
      ema: true,
      ema20: true,
      ema50: true,
      trail: true,
      bands: false,
      rsi: false,
    });
  });
  it("hiding a strategy hides tools and comparisons union only selected source declarations", () => {
    const hidden = { ...preset("trend-following"), visible: false };
    expect(strategyIndicatorLayers([hidden]).ema).toBe(false);
    expect(
      strategyIndicatorLayers([
        preset("mean-reversion"),
        preset("macd-momentum"),
      ]),
    ).toMatchObject({ bands: true, rsi: true, macd: true, ema: false });
  });
  it("does not draw SMA/EMA periods not explicitly declared by a custom source", () => {
    const custom: Strategy = {
      ...WR1,
      id: "custom",
      factors: [
        {
          id: "e",
          name: "EMA20",
          group: "Price",
          description: "Only EMA20, not an invented second period",
          weight: 1,
          enabled: true,
        },
      ],
    };
    expect(strategyIndicatorLayers([custom])).toMatchObject({
      ema: true,
      ema20: true,
      ema50: false,
    });
    expect(attachedIndicatorNames(strategyIndicatorLayers([WR1]))).toEqual([]);
  });
  it("uses the source breakout's10-bar range, not an unrelated20-bar channel", () => {
    expect(
      strategyIndicatorLayers([preset("breakout-momentum")]),
    ).toMatchObject({ range10: true, donchian: false });
  });
});
describe("direction-only observations", () => {
  it("seeds without notification, ignores setup side, then flips exactly once", () => {
    const first = observeScenarioDirection(undefined, {
      context: "a",
      asOf: 100,
      scenario: scenario(102, "short"),
    });
    expect(first.change).toBeUndefined();
    expect(first.state.lastDirection).toBe("up");
    const flip = observeScenarioDirection(first.state, {
      context: "a",
      asOf: 101,
      scenario: scenario(98, "long"),
    });
    expect(flip.change).toMatchObject({
      previous: "up",
      current: "down",
      sequence: 1,
    });
    expect(
      observeScenarioDirection(flip.state, {
        context: "a",
        asOf: 101,
        scenario: scenario(97),
      }).change,
    ).toBeUndefined();
  });
  it("same-direction source/shape changes do not notify and missing/flat preserve direction", () => {
    const first = observeScenarioDirection(undefined, {
      context: "a",
      asOf: 100,
      scenario: scenario(102),
    }).state;
    const other = observeScenarioDirection(first, {
      context: "a",
      asOf: 101,
      scenario: scenario(104),
    });
    expect(other.change).toBeUndefined();
    const flat = observeScenarioDirection(other.state, {
      context: "a",
      asOf: 102,
      scenario: scenario(100),
    });
    expect(flat.state.lastDirection).toBe("up");
    const missing = observeScenarioDirection(flat.state, {
      context: "unavailable",
      asOf: 103,
    });
    expect(missing.state.lastDirection).toBe("up");
    expect(
      observeScenarioDirection(missing.state, {
        context: "a",
        asOf: 104,
        scenario: scenario(98),
      }).change?.current,
    ).toBe("down");
  });
  it("revised context re-seeds and older observations cannot reverse a newer state", () => {
    const first = observeScenarioDirection(undefined, {
      context: "a",
      asOf: 100,
      scenario: scenario(102),
    }).state;
    expect(
      observeScenarioDirection(first, {
        context: "v2",
        asOf: 101,
        scenario: scenario(98),
      }).change,
    ).toBeUndefined();
    expect(
      observeScenarioDirection(first, {
        context: "a",
        asOf: 99,
        scenario: scenario(98),
      }).state,
    ).toEqual(first);
  });
  it("context follows real versions/frame/provider/mode, not transient path direction", () => {
    const analysis = {
      market: "BTC-USD",
      timeframe: "5m" as const,
      combination: "all" as const,
      source: "Unit",
      selectedStrategyIds: ["custom"],
      scenario: scenario(102),
    };
    const first = scenarioDirectionContext(analysis, [
      { ...WR1, id: "custom" },
    ]);
    expect(
      scenarioDirectionContext({ ...analysis, scenario: scenario(98) }, [
        { ...WR1, id: "custom" },
      ]),
    ).toBe(first);
    expect(
      scenarioDirectionContext(
        {
          ...analysis,
          scenario: { ...scenario(98), basis: "strategy-matched" },
        },
        [{ ...WR1, id: "custom" }],
      ),
    ).toBe(first);
    expect(
      scenarioDirectionContext({ ...analysis, timeframe: "15m" }, [
        { ...WR1, id: "custom" },
      ]),
    ).not.toBe(first);
    expect(
      scenarioDirectionContext(
        { ...analysis, scenario: { ...scenario(102), strategyVersions: [2] } },
        [{ ...WR1, id: "custom" }],
      ),
    ).not.toBe(first);
  });
});
describe("native direction watch boundaries", () => {
  it("accepts broker routing syntax but not arbitrary markets/frame/ids", () => {
    expect(
      validNotificationScope({
        alertId: "alert_unit",
        market: "TL:123",
        timeframe: "5m",
      }),
    ).toBe(true);
    expect(
      validNotificationScope({
        alertId: "alert_unit",
        market: "other:123",
        timeframe: "5m",
      }),
    ).toBe(false);
    expect(
      validNotificationScope({
        alertId: "alert_unit",
        market: "TL:123",
        timeframe: "5s",
      }),
    ).toBe(false);
    expect(
      validNotificationScope({
        alertId: "../attack",
        market: "BTC-USD",
        timeframe: "5m",
      }),
    ).toBe(false);
  });
  it("charges direction watches for the execution, daily and hourly reads", () => {
    const rule = {
      id: "unit",
      name: "unit",
      market: "TL:123",
      timeframe: "5m" as const,
      strategyId: "custom",
      kind: "scenario-direction" as const,
      price: 0,
      enabled: true,
      cooldownMinutes: 1,
      createdAt: 1,
    };
    expect(planBrokerScan([rule]).requestBudget).toBe(4);
  });
});

describe("reviewed direction scope and cold scan reserves", () => {
  it("reseeds a changed provider context even when its source clock is behind", () => {
    const previous = {
      context: "provider-A",
      lastDirection: "up" as const,
      lastAsOf: 200,
      sequence: 4,
    };
    const changed = observeScenarioDirection(previous, {
      context: "provider-B",
      asOf: 199,
      scenario: scenario(98),
    });
    expect(changed.change).toBeUndefined();
    expect(changed.state.context).toBe("provider-B");
    expect(changed.state.lastDirection).toBe("down");
    expect(
      observeScenarioDirection(previous, {
        context: "provider-A",
        asOf: 199,
        scenario: scenario(98),
      }).state,
    ).toEqual(previous);
  });
  it("defers a third cold four-read market before account/catalog reads exceed twelve", () => {
    const rules = [1, 2, 3].map((n) => ({
      id: `cold-${n}`,
      name: "unit",
      market: `TL:${n}`,
      timeframe: "5m" as const,
      kind: "scenario-direction" as const,
      enabled: true,
      strategyId: "wr1",
      price: 0,
      cooldownMinutes: 1,
      createdAt: 1,
    }));
    const cold = planBrokerScan(rules, 0, 12, 2);
    expect(cold.requestBudget).toBe(10);
    expect(cold.bootstrapReserve).toBe(2);
    expect(cold.deferredMarkets).toBe(1);
    expect(cold.rules).toHaveLength(2);
    expect(planBrokerScan(rules, 0, 12, 0).rules).toHaveLength(3);
  });
});
