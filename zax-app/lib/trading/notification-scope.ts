import { MARKETS, type Timeframe } from "./model";

export const ALERT_NOTIFICATION_KINDS = [
  "above",
  "below",
  "fvg",
  "setup",
  "scenario-change",
  "scenario-direction",
  "confluence",
  "below-gate",
] as const;
export type AlertNotificationKind = (typeof ALERT_NOTIFICATION_KINDS)[number];
export type AlertDeliveryPreference = { sound: boolean; badge: boolean };
export type AlertNotificationPreferences = Partial<
  Record<AlertNotificationKind, Partial<AlertDeliveryPreference>>
>;

const DEFAULT_DELIVERY_PREFERENCE: AlertDeliveryPreference = {
  sound: true,
  badge: true,
};

export function isAlertNotificationKind(
  value: unknown,
): value is AlertNotificationKind {
  return (
    typeof value === "string" &&
    (ALERT_NOTIFICATION_KINDS as readonly string[]).includes(value)
  );
}

/** Defaults remain audible and badge-enabled until the owner explicitly changes a type. */
export function notificationDeliveryPreference(
  kind: unknown,
  preferences: unknown,
): AlertDeliveryPreference {
  if (!isAlertNotificationKind(kind) || !preferences || typeof preferences !== "object")
    return { ...DEFAULT_DELIVERY_PREFERENCE };
  const candidate = (preferences as AlertNotificationPreferences)[kind];
  return {
    sound: candidate?.sound !== false,
    badge: candidate?.badge !== false,
  };
}

export function alertNotificationChannelId(kind: unknown) {
  return `trading-alerts-${isAlertNotificationKind(kind) ? kind : "general"}`;
}

export function validNotificationScope(
  data: unknown,
): data is { alertId: string; market: string; timeframe: Timeframe } {
  if (!data || typeof data !== "object") return false;
  const value = data as Record<string, unknown>;
  return (
    typeof value.alertId === "string" &&
    /^[A-Za-z0-9_:-]{1,128}$/.test(value.alertId) &&
    typeof value.market === "string" &&
    (MARKETS.some((m) => m.id === value.market) ||
      /^TL:[0-9]{1,18}$/.test(value.market)) &&
    typeof value.timeframe === "string" &&
    ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"].includes(value.timeframe) &&
    (value.alertKind === undefined || isAlertNotificationKind(value.alertKind))
  );
}
