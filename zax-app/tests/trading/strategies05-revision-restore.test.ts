import { describe, expect, it } from "vitest";
import type { Strategy } from "../../lib/trading/model";
import { ORB_DEFAULT_CONFIG } from "../../lib/trading/orb-model";
import { PIVOT_DEFAULT_CONFIG } from "../../lib/trading/session-strategy-model";
import { restoreStrategyRevision } from "../../lib/trading/strategies05-revision-restore";

const factor = {
  id: "rule",
  name: "Source rule",
  group: "Entry",
  weight: 100,
  enabled: true,
  description: "Fixture only",
};

const historical: NonNullable<Strategy["history"]>[number] = {
  version: 3,
  name: "Restored source revision",
  description: "Historical rule/config source",
  factors: [factor],
  orbConfig: {
    ...ORB_DEFAULT_CONFIG,
    stopBufferTicks: 2,
    sessions: [
      {
        id: "london",
        timezone: "Etc/GMT+5",
        startHour: 2,
        endHour: 4,
      },
    ],
  },
  sessionConfig: {
    ...PIVOT_DEFAULT_CONFIG,
    confirmed: true,
    pdcBasis: "provider-utc-day",
    priceTick: 0.25,
    targetMode: "previous-day-extremes",
  },
  at: 1,
};

const current: Strategy = {
  id: "strategies05-revision",
  name: "Current revision",
  description: "Current source",
  color: "#FFFFFF",
  kind: "strategy",
  visible: true,
  version: 4,
  factors: [{ ...factor, weight: 50 }],
  orbConfig: { ...ORB_DEFAULT_CONFIG, stopBufferTicks: 7 },
  sessionConfig: { ...PIVOT_DEFAULT_CONFIG, confirmed: false },
  confluence: {} as NonNullable<Strategy["confluence"]>,
  history: [historical],
};

describe("strategies05 source revision restore — pure state", () => {
  it("clones restored ORB/session configuration and clears stale confluence for every rollback", () => {
    const restored = restoreStrategyRevision(current, historical);

    expect(restored).toMatchObject({
      name: historical.name,
      description: historical.description,
      orbConfig: historical.orbConfig,
      sessionConfig: historical.sessionConfig,
      confluence: undefined,
    });
    expect(restored.orbConfig).not.toBe(historical.orbConfig);
    expect(restored.sessionConfig).not.toBe(historical.sessionConfig);
    expect(restored.factors).not.toBe(historical.factors);

    if (!restored.orbConfig || !restored.sessionConfig) {
      throw new Error("Expected cloned historical configuration.");
    }
    restored.orbConfig.stopBufferTicks = 9;
    restored.sessionConfig.instrumentMarket = "RESTORED-ONLY";
    expect(historical.orbConfig?.stopBufferTicks).toBe(2);
    expect(historical.sessionConfig?.instrumentMarket).toBeUndefined();
  });

  it("restores absent configurations as explicit undefined and still clears confluence", () => {
    const restored = restoreStrategyRevision(current, {
      ...historical,
      orbConfig: undefined,
      sessionConfig: undefined,
    });

    expect(restored.orbConfig).toBeUndefined();
    expect(restored.sessionConfig).toBeUndefined();
    expect(restored.confluence).toBeUndefined();
  });
});
