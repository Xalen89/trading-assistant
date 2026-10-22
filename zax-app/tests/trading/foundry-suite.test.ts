import { describe, expect, it } from "vitest";
import {
  FOUNDRY_PRESETS,
  FOUNDRY_DATA_PREREQUISITES,
} from "../../lib/trading/foundry-suite";
import { normalizeConfluenceWeights } from "../../lib/trading/confluence-weights";
import type { ConfluenceCondition } from "../../lib/trading/confluence-contract";

describe("requested Foundry catalog/configuration — UNIT fixtures", () => {
  it("surfaces exactly the eight supplied source models and five quant research families", () => {
    expect(FOUNDRY_PRESETS.map((p) => p.id).sort()).toEqual(
      [
        "ob-retest",
        "vwap-stdv",
        "core-sequence",
        "sma-crossover",
        "macd-momentum",
        "trend-following",
        "breakout-momentum",
        "mean-reversion",
      ].sort(),
    );
    expect(FOUNDRY_DATA_PREREQUISITES).toHaveLength(5);
    expect(
      FOUNDRY_PRESETS.some((p) =>
        /pwb|vault|sgx|scalp|silver|donchian/i.test(p.id),
      ),
    ).toBe(false);
  });
  it("normalizes explicitly edited enabled weights while preserving user configuration and proportions", () => {
    const conditions: ConfluenceCondition[] = [3, 1].map((weight, i) => ({
      id: String(i),
      name: "UNIT",
      predicate: "UNIT falsifiable expression",
      weight,
      enabled: true,
      source: {
        id: "UNIT",
        name: "UNIT",
        required: true,
        freshness: { maxAgeMs: 1000 },
      },
    }));
    const normalized = normalizeConfluenceWeights(conditions);
    expect(normalized.reduce((sum, c) => sum + c.weight, 0)).toBeCloseTo(100);
    expect(normalized[0].weight / normalized[1].weight).toBeCloseTo(3);
    expect(conditions.map((c) => c.weight)).toEqual([3, 1]);
    expect(() =>
      normalizeConfluenceWeights(conditions.map((c) => ({ ...c, weight: 0 }))),
    ).toThrow();
    expect(() =>
      normalizeConfluenceWeights(
        conditions.map((c) => ({ ...c, weight: NaN })),
      ),
    ).toThrow();
  });
});
