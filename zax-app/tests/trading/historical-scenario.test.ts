import { describe, expect, it } from "vitest";
import type { Candle, Strategy, Timeframe } from "../../lib/trading/model";
import type { ForecastScenario } from "../../lib/trading/setup-model";
import {
  contextualScenario,
  scenarioDirection,
} from "../../lib/trading/historical-scenario";

// Synthetic deterministic unit fixtures only; these are not market data or data claims.
const UNIT_EPOCH = 1_800_000_000;
const SECONDS: Record<Timeframe, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "30m": 1_800,
  "1h": 3_600,
  "4h": 14_400,
  "1d": 86_400,
  "1w": 604_800,
};

const strategy = (
  id: string,
  version: number,
  setupFamily: Strategy["setupFamily"],
): Strategy => ({
  id,
  name: `UNIT ${id}`,
  description: "Synthetic fixture metadata only.",
  color: "#000000",
  kind: "strategy",
  setupFamily,
  factors: [],
  visible: true,
  version,
});

const generic = strategy("generic", 2, "trend-following");
const numerical = strategy("numerical", 7, "sma-crossover");
const custom = strategy("custom", 11, "custom");

function replayFixture(timeframe: Timeframe): Candle[] {
  const sourceQuery = [100, 101, 99, 102, 101, 103, 102, 104, 103, 105, 104, 106];
  const sourceContinuation = [107, 108, 107, 109, 110, 108, 111, 112, 110, 113, 114, 115];
  const filler = Array.from({ length: 24 }, (_, index) => 160 - index * 1.25);
  const currentQuery = sourceQuery.map((close) => close * 2);
  const closes = [...sourceQuery, ...sourceContinuation, ...filler, ...currentQuery];

  return closes.map((close, index) => {
    const open = index === 0 ? close * 0.995 : closes[index - 1];
    // The gap intentionally falls in the continuation. It must be retained, not filled.
    const time = UNIT_EPOCH + (index + (index >= 18 ? 2 : 0)) * SECONDS[timeframe];
    return {
      time,
      open,
      high: Math.max(open, close) * 1.004,
      low: Math.min(open, close) * 0.996,
      close,
      volume: 100 + index,
    };
  });
}

function scenarioFor(
  timeframe: Timeframe = "5m",
  combination: "all" | "any" = "all",
): ForecastScenario {
  const scenario = contextualScenario(
    replayFixture(timeframe),
    "UNIT-REPLAY",
    timeframe,
    [generic, numerical, custom],
    combination,
    "UNIT supplied closed candles",
  );
  expect(scenario).toBeDefined();
  return scenario!;
}

describe("historical context replay — deterministic synthetic UNIT fixtures", () => {
  it.each(["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"] as const)(
    "works for supported %s context without interpreting generic, numerical, or custom rules",
    (timeframe) => {
      const scenario = scenarioFor(timeframe);
      expect(scenario.basis).toBe("context-replay");
      expect(scenario.combination).toBe("all");
      expect(scenario.strategyIds).toEqual(["generic", "numerical", "custom"]);
      expect(scenario.strategyVersions).toEqual([2, 7, 11]);
      expect(scenario.queryBars).toBe(12);
      expect(scenario.candles).toHaveLength(12);
      expect(scenario.explanation).toContain("No strategy rules");
      expect(scenario.explanation).toContain("success probability");
    },
  );

  it("uses a wholly past continuation, retains its source timestamps and positively scales actual OHLC", () => {
    const input = replayFixture("5m");
    const scenario = scenarioFor();
    const historicalAnchor = input[11].close;
    const scale = input.at(-1)!.close / historicalAnchor;

    expect(scenario.anchorAt).toBe(input.at(-1)!.time);
    expect(scenario.anchorPrice).toBe(input.at(-1)!.close);
    expect(scenario.sourceAt).toBe(input[11].time);
    expect(scenario.sourceEndAt).toBe(input[23].time);
    expect(scenario.sourceEndAt).toBeLessThan(input.at(-12)!.time);
    expect(scenario.candles.map((bar) => bar.time)).toEqual(
      input.slice(12, 24).map((bar) => bar.time),
    );
    expect(scenario.candles.some((bar, index) => index > 0 && bar.time - scenario.candles[index - 1].time > SECONDS["5m"])).toBe(true);

    scenario.candles.forEach((bar, index) => {
      const raw = input[12 + index];
      expect(bar.open).toBeCloseTo(raw.open * scale);
      expect(bar.high).toBeCloseTo(raw.high * scale);
      expect(bar.low).toBeCloseTo(raw.low * scale);
      expect(bar.close).toBeCloseTo(raw.close * scale);
      expect(bar.volume).toBe(raw.volume);
      expect([bar.open, bar.high, bar.low, bar.close].every(Number.isFinite)).toBe(true);
      expect(bar.low).toBeGreaterThan(0);
    });
  });

  it("sorts and deduplicates valid input, returns sorted source bars, and is stable", () => {
    const input = replayFixture("5m");
    const raw = [...input].reverse();
    raw.push({ ...input[10] });
    const first = contextualScenario(
      raw,
      "UNIT-REPLAY",
      "5m",
      [generic, numerical, custom],
      "any",
      "UNIT supplied closed candles",
    );
    const second = contextualScenario(
      raw,
      "UNIT-REPLAY",
      "5m",
      [generic, numerical, custom],
      "any",
      "UNIT supplied closed candles",
    );

    expect(first).toEqual(second);
    expect(first?.id).toBe(
      `context-replay:UNIT-REPLAY:5m:UNIT supplied closed candles:${input.at(-1)!.time}`,
    );
    expect(first?.candles.every((bar, index, bars) => index === 0 || bar.time > bars[index - 1].time)).toBe(true);
  });

  it("withholds incomplete or malformed raw input instead of manufacturing bars", () => {
    const input = replayFixture("5m");
    expect(
      contextualScenario(
        input.slice(0, 35),
        "UNIT-REPLAY",
        "5m",
        [generic],
        "any",
        "UNIT supplied closed candles",
      ),
    ).toBeUndefined();
    expect(
      contextualScenario(
        [{ ...input[0], close: Number.NaN }] as Candle[],
        "UNIT-REPLAY",
        "5m",
        [generic],
        "any",
        "UNIT supplied closed candles",
      ),
    ).toBeUndefined();
  });

  it("classifies only final drawn close versus anchor, ignoring declared setup side and direction", () => {
    const scenario = scenarioFor();
    const contradictory: ForecastScenario = {
      ...scenario,
      side: "short",
      direction: "down",
    };
    expect(scenarioDirection(contradictory)).toBe("up");
    expect(scenario.direction).toBe("up");
  });

  it("uses a one-basis-point relative flat band and the supplied fallback only when anchorPrice is absent", () => {
    const scenario = scenarioFor();
    const finalBar = scenario.candles.at(-1)!;
    const atOneBasisPoint: ForecastScenario = {
      ...scenario,
      anchorPrice: 10_000,
      side: "long",
      candles: [{ ...finalBar, close: 10_001 }],
    };
    expect(scenarioDirection(atOneBasisPoint)).toBe("flat");
    expect(
      scenarioDirection({ ...atOneBasisPoint, candles: [{ ...finalBar, close: 10_001.1 }] }),
    ).toBe("up");
    expect(
      scenarioDirection({ ...atOneBasisPoint, candles: [{ ...finalBar, close: 9_998.9 }] }),
    ).toBe("down");
    expect(scenarioDirection({ ...atOneBasisPoint, anchorPrice: undefined }, 10_000)).toBe("flat");
    expect(scenarioDirection({ ...atOneBasisPoint, anchorPrice: undefined })).toBeUndefined();
  });
});
