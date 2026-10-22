import { SECONDS } from "./engine";
import type { Timeframe } from "./model";

/** One quote policy for every live-data consumer: two minutes, no exceptions. */
export const QUOTE_STALE_AFTER_SECONDS = 120;
export const QUOTE_FUTURE_SKEW_SECONDS = 30;
export const MIN_CLOSED_BAR_FRESHNESS_SECONDS = 15 * 60;
export const DAILY_CLOSED_BAR_FRESHNESS_CAP_SECONDS = 24 * 60 * 60;
export const WEEKLY_CLOSED_BAR_FRESHNESS_CAP_SECONDS = 7 * 24 * 60 * 60;

export type CalendarState = "open" | "closed" | "unknown";

/**
 * Provider-declared session facts, not an inferred exchange calendar. A source
 * without these facts must not be used to fabricate a derived timeframe.
 */
export type SourceSessionMetadata = {
  coverage: "continuous" | "declared" | "unknown";
  timezone: string;
  /** UTC weekdays accepted as actual daily source periods (0 = Sunday). */
  expectedUtcWeekdays?: readonly number[];
  supportsUtc4hAggregation?: boolean;
  calendarState?: CalendarState;
  reason?: string;
};

export type QuoteFreshness = {
  status: "live" | "stale";
  ageSeconds: number;
  staleAfterSeconds: number;
  reason?: string;
};

export type ClosedBarFreshness = {
  status: "fresh" | "stale";
  timeframe: Timeframe;
  latestClosedBar: number;
  completedAt: number;
  closeAgeSeconds: number;
  sourceReceiptAgeSeconds?: number;
  sourceCadenceSeconds: number;
  staleAfterSeconds: number;
  calendarState: CalendarState;
  reason?: string;
  calendarNote?: string;
};

function finitePositive(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** Normalizes milliseconds or Unix seconds into Unix seconds for pure callers. */
export function unixSeconds(value: number): number {
  return value > 100_000_000_000 ? value / 1_000 : value;
}

export function quoteFreshnessAt(
  providerTimestamp: number,
  nowSeconds = Date.now() / 1_000,
): QuoteFreshness {
  if (!finitePositive(providerTimestamp))
    return {
      status: "stale",
      ageSeconds: Number.POSITIVE_INFINITY,
      staleAfterSeconds: QUOTE_STALE_AFTER_SECONDS,
      reason: "The provider did not include a usable source timestamp.",
    };
  const ageSeconds = nowSeconds - providerTimestamp;
  if (ageSeconds < -QUOTE_FUTURE_SKEW_SECONDS)
    return {
      status: "stale",
      ageSeconds,
      staleAfterSeconds: QUOTE_STALE_AFTER_SECONDS,
      reason: "The provider timestamp is too far in the future to trust.",
    };
  if (ageSeconds > QUOTE_STALE_AFTER_SECONDS)
    return {
      status: "stale",
      ageSeconds,
      staleAfterSeconds: QUOTE_STALE_AFTER_SECONDS,
      reason: `The source timestamp is older than the ${QUOTE_STALE_AFTER_SECONDS}-second quote policy.`,
    };
  return {
    status: "live",
    ageSeconds: Math.max(0, ageSeconds),
    staleAfterSeconds: QUOTE_STALE_AFTER_SECONDS,
  };
}

/** Kept as the compact status adapter used by existing Quote.status consumers. */
export function quoteStatusAt(
  providerTimestamp: number,
  nowSeconds = Date.now() / 1_000,
): "live" | "stale" {
  return quoteFreshnessAt(providerTimestamp, nowSeconds).status;
}

/**
 * A completed bar is fresh from its completion time, never its opening time.
 * Source receipt age is independently exposed so a freshly fetched old bar is
 * not mistaken for a current bar. The daily/weekly caps prevent a long period
 * from making an old close look fresh for days beyond the stated policy.
 */
export function closedBarStaleAfterSeconds(
  timeframe: Timeframe,
  sourceCadenceSeconds = SECONDS[timeframe],
): number {
  const period = SECONDS[timeframe];
  const cadence = finitePositive(sourceCadenceSeconds)
    ? sourceCadenceSeconds
    : period;
  const baseline = Math.max(
    period * 2,
    cadence * 2,
    MIN_CLOSED_BAR_FRESHNESS_SECONDS,
  );
  if (timeframe === "1d")
    return Math.min(baseline, DAILY_CLOSED_BAR_FRESHNESS_CAP_SECONDS);
  if (timeframe === "1w")
    return Math.min(baseline, WEEKLY_CLOSED_BAR_FRESHNESS_CAP_SECONDS);
  return baseline;
}

export function formatFreshnessDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "unavailable";
  if (seconds % (7 * 86_400) === 0)
    return `${seconds / (7 * 86_400)}w`;
  if (seconds % 86_400 === 0) return `${seconds / 86_400}d`;
  if (seconds % 3_600 === 0) return `${seconds / 3_600}h`;
  return `${Math.round(seconds / 60)}m`;
}

export function closedBarFreshness(input: {
  timeframe: Timeframe;
  latestClosedBar: number;
  /** Server receipt time in milliseconds or Unix seconds, if known. */
  sourceReceivedAt?: number;
  sourceCadenceSeconds?: number;
  calendarState?: CalendarState;
  nowSeconds?: number;
}): ClosedBarFreshness {
  const now = input.nowSeconds ?? Date.now() / 1_000;
  const period = SECONDS[input.timeframe];
  const sourceCadence = finitePositive(input.sourceCadenceSeconds)
    ? input.sourceCadenceSeconds
    : period;
  const staleAfterSeconds = closedBarStaleAfterSeconds(
    input.timeframe,
    sourceCadence,
  );
  const completedAt = input.latestClosedBar + period;
  const closeAgeSeconds = now - completedAt;
  const sourceReceiptAgeSeconds = finitePositive(input.sourceReceivedAt)
    ? now - unixSeconds(input.sourceReceivedAt)
    : undefined;
  const calendarState = input.calendarState ?? "unknown";
  const calendarNote =
    calendarState === "closed"
      ? "A declared calendar closure is shown separately; it never turns an old completed bar into a live one."
      : calendarState === "unknown"
        ? "The source did not declare its calendar state, so closures are not assumed."
        : undefined;

  if (!finitePositive(input.latestClosedBar))
    return {
      status: "stale",
      timeframe: input.timeframe,
      latestClosedBar: input.latestClosedBar,
      completedAt,
      closeAgeSeconds: Number.POSITIVE_INFINITY,
      sourceReceiptAgeSeconds,
      sourceCadenceSeconds: sourceCadence,
      staleAfterSeconds,
      calendarState,
      calendarNote,
      reason: "No valid completed source bar is available.",
    };
  if (closeAgeSeconds > staleAfterSeconds)
    return {
      status: "stale",
      timeframe: input.timeframe,
      latestClosedBar: input.latestClosedBar,
      completedAt,
      closeAgeSeconds,
      sourceReceiptAgeSeconds,
      sourceCadenceSeconds: sourceCadence,
      staleAfterSeconds,
      calendarState,
      calendarNote,
      reason: `The completed-bar close is older than the ${formatFreshnessDuration(staleAfterSeconds)} policy.`,
    };
  if (
    sourceReceiptAgeSeconds !== undefined &&
    sourceReceiptAgeSeconds > staleAfterSeconds
  )
    return {
      status: "stale",
      timeframe: input.timeframe,
      latestClosedBar: input.latestClosedBar,
      completedAt,
      closeAgeSeconds,
      sourceReceiptAgeSeconds,
      sourceCadenceSeconds: sourceCadence,
      staleAfterSeconds,
      calendarState,
      calendarNote,
      reason: `The source receipt is older than the ${formatFreshnessDuration(staleAfterSeconds)} policy even though the bar close may be newer.`,
    };
  return {
    status: "fresh",
    timeframe: input.timeframe,
    latestClosedBar: input.latestClosedBar,
    completedAt,
    closeAgeSeconds: Math.max(0, closeAgeSeconds),
    sourceReceiptAgeSeconds:
      sourceReceiptAgeSeconds === undefined
        ? undefined
        : Math.max(0, sourceReceiptAgeSeconds),
    sourceCadenceSeconds: sourceCadence,
    staleAfterSeconds,
    calendarState,
    calendarNote,
  };
}

export function freshnessPolicyLabel(timeframe: Timeframe): string {
  return `Stale after ${formatFreshnessDuration(closedBarStaleAfterSeconds(timeframe))} from completed-bar close.`;
}
