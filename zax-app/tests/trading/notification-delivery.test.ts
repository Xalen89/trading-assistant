import { describe, expect, it } from "vitest";
import type { AlertRule } from "../../lib/trading/model";
import {
  notificationDeliveryPreference,
  validNotificationScope,
} from "../../lib/trading/notification-scope";
import {
  alertPredicate,
  buildExpoPushPayloads,
  planAlertScan,
} from "../../server/trading/notifications";

function rule(
  id: string,
  options: Partial<AlertRule> = {},
): AlertRule {
  return {
    id,
    name: id,
    market: `TL:${id.replace(/\D/g, "") || "1"}`,
    timeframe: "5m",
    strategyId: "strategy-a",
    kind: "above",
    price: 100,
    enabled: true,
    cooldownMinutes: 5,
    createdAt: 1_800_000_000_000,
    ...options,
  };
}

describe("notification source predicates, rotation, and payload fixtures", () => {
  it("accepts only bounded owned notification scope and deterministic source predicates", () => {
    expect(
      validNotificationScope({
        alertId: "alert_123",
        market: "BTC-USD",
        timeframe: "5m",
        alertKind: "confluence",
      }),
    ).toBe(true);
    expect(
      validNotificationScope({
        alertId: "../../not-owned",
        market: "BTC-USD",
        timeframe: "5m",
      }),
    ).toBe(false);
    expect(
      validNotificationScope({
        alertId: "alert_123",
        market: "BTC-USD",
        timeframe: "5m",
        alertKind: "not-a-real-kind",
      }),
    ).toBe(false);
    expect(alertPredicate(rule("one"), 100, false)).toBe(true);
    expect(alertPredicate(rule("two", { kind: "below" }), 101, false)).toBe(false);
    expect(alertPredicate(rule("three", { kind: "fvg" }), 0, true)).toBe(true);
  });

  it("allocates high-priority broker markets first but exposes over-budget priority rotation", () => {
    const high = rule("1", { priority: "high" });
    const normal = rule("2");
    const selected = planAlertScan([high, normal], 0, 0, 2, 0);
    expect(selected.requestBudget).toBe(2);
    expect(selected.rules.map((item) => item.id)).toEqual(["1", "2"]);

    const overflow = planAlertScan(
      [
        rule("1", { priority: "high" }),
        rule("2", { priority: "high" }),
        rule("3", { priority: "high" }),
      ],
      0,
      0,
      2,
      0,
    );
    expect(overflow.requestBudget).toBe(2);
    expect(overflow.deferredPriorityMarkets).toBe(1);
    expect(overflow.rules).toHaveLength(2);
  });

  it("builds delivery payloads from per-type sound and badge preferences without transport", () => {
    const muted = notificationDeliveryPreference("below-gate", {
      "below-gate": { sound: false, badge: false },
    });
    const payloads = buildExpoPushPayloads(
      [{ token: "ExpoPushToken[unit-device]" }],
      {
        id: "alert_unit",
        ruleId: "rule_unit",
        market: "BTC-USD",
        timeframe: "5m",
        strategyId: "strategy-a",
        title: "Unit alert",
        body: "Synthetic only",
        createdAt: 1_800_000_000_000,
        read: false,
        price: 100,
        source: "UNIT",
        alertKind: "below-gate",
      },
      muted,
    );
    expect(payloads).toEqual([
      expect.objectContaining({
        to: "ExpoPushToken[unit-device]",
        sound: null,
        channelId: "trading-alerts-below-gate",
        data: expect.objectContaining({
          alertId: "alert_unit",
          alertKind: "below-gate",
        }),
      }),
    ]);
    expect(payloads[0]).not.toHaveProperty("badge");
  });
});
