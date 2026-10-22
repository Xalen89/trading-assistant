import { SECONDS } from "./engine";
import type { Candle, Timeframe } from "./model";

export type SessionId = "asia" | "london" | "new-york" | "sydney";

export type SessionOverlayPrefs = {
  enabled: boolean;
  sessions: SessionId[];
};

type SessionDefinition = {
  id: SessionId;
  label: string;
  color: string;
  timezone: string;
  startHour: number;
  endHour: number;
  row: number;
};

/** Local analytical clocks, rather than exchange trading hours or killzones. */
export const SESSION_DEFINITIONS: readonly SessionDefinition[] = [
  {
    id: "asia",
    label: "Asia",
    color: "#B8A2FF",
    timezone: "Asia/Tokyo",
    startHour: 9,
    endHour: 18,
    row: 0,
  },
  {
    id: "london",
    label: "London",
    color: "#8EC5FF",
    timezone: "Europe/London",
    startHour: 8,
    endHour: 17,
    row: 1,
  },
  {
    id: "new-york",
    label: "New York",
    color: "#D8F36A",
    timezone: "America/New_York",
    startHour: 8,
    endHour: 17,
    row: 2,
  },
  {
    id: "sydney",
    label: "Sydney",
    color: "#F4C878",
    timezone: "Australia/Sydney",
    startHour: 8,
    endHour: 17,
    row: 3,
  },
];

export const DEFAULT_SESSION_OVERLAY: SessionOverlayPrefs = {
  enabled: true,
  sessions: ["asia", "london", "new-york"],
};

export type ChartSessionBox = {
  id: string;
  session: SessionId;
  label: string;
  timezone: string;
  from: number;
  to: number;
  color: string;
  row: number;
  startsAt: number;
  endsAt: number;
  clipped: boolean;
};

type LocalDate = { year: number; month: number; day: number };
type ObservedBar = { start: number; end: number };

const MAX_INPUT_CANDLES = 3_000;
const MAX_BOXES = 256;

function formatterFor(timezone: string): Intl.DateTimeFormat {
  // Created only when sessions are requested: no host-zone work at module import.
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    calendar: "iso8601",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
}

function localPartsAt(
  seconds: number,
  formatter: Intl.DateTimeFormat,
): LocalDate & { hour: number; minute: number; second: number } {
  const values: Record<string, number> = {};
  for (const part of formatter.formatToParts(new Date(seconds * 1_000)))
    if (part.type !== "literal") values[part.type] = Number(part.value);

  const { year, month, day, hour, minute, second } = values;
  if (![year, month, day, hour, minute, second].every(Number.isInteger))
    throw new RangeError("Could not read an IANA local date.");
  return { year, month, day, hour, minute, second };
}

/**
 * Converts a local IANA wall clock to Unix seconds using Intl's current zone
 * database. Session hours are daytime, so they never fall in a DST gap/fold.
 */
function localDateTimeToUtc(
  date: LocalDate,
  hour: number,
  formatter: Intl.DateTimeFormat,
): number {
  const wanted = Date.UTC(date.year, date.month - 1, date.day, hour) / 1_000;
  let candidate = wanted;

  // The first pass finds the zone offset at this wall clock. A second pass
  // accounts for dates on which the offset changes between guess and result.
  for (let attempt = 0; attempt < 4; attempt++) {
    const local = localPartsAt(candidate, formatter);
    const representedAsUtc =
      Date.UTC(
        local.year,
        local.month - 1,
        local.day,
        local.hour,
        local.minute,
        local.second,
      ) / 1_000;
    const adjustment = wanted - representedAsUtc;
    if (adjustment === 0) return candidate;
    candidate += adjustment;
  }
  return candidate;
}

function dateKey(date: LocalDate): string {
  return `${date.year}-${date.month}-${date.day}`;
}

function isSessionId(value: unknown): value is SessionId {
  return (
    value === "asia" ||
    value === "london" ||
    value === "new-york" ||
    value === "sydney"
  );
}

function actualTimestamps(
  candles: readonly Pick<Candle, "time">[],
  nowSeconds: number,
): number[] {
  const unique = new Set<number>();
  for (const candle of candles) {
    const time = (candle as { time?: unknown } | null)?.time;
    if (
      typeof time === "number" &&
      Number.isSafeInteger(time) &&
      time > 0 &&
      time <= nowSeconds
    )
      unique.add(time);
  }
  return [...unique]
    .sort((left, right) => left - right)
    .slice(-MAX_INPUT_CANDLES);
}

function sessionDatesForBars(
  bars: readonly ObservedBar[],
  formatter: Intl.DateTimeFormat,
): Map<string, LocalDate> {
  const dates = new Map<string, LocalDate>();
  // At most4h bars need only each UTC day's observed endpoints to find all
  // relevant local dates. Avoid thousands of identical Intl conversions on a
  // normal quote update; observed interval checks below still preserve gaps.
  const dayExtents = new Map<number, ObservedBar>();
  for (const bar of bars) {
    const day = Math.floor(bar.start / 86_400);
    const prior = dayExtents.get(day);
    if (prior) {
      prior.start = Math.min(prior.start, bar.start);
      prior.end = Math.max(prior.end, bar.end);
    } else dayExtents.set(day, { ...bar });
  }
  for (const bar of dayExtents.values()) {
    const first = localPartsAt(bar.start, formatter);
    const last = localPartsAt(Math.max(bar.start, bar.end - 0.001), formatter);
    dates.set(dateKey(first), first);
    dates.set(dateKey(last), last);
  }
  return dates;
}

/**
 * Builds bounded, time-only chart background bands from actual supplied bars.
 * Session edges retain IANA/DST wall-clock meaning; no price or high/low data is
 * used, and missing chart intervals never create a synthetic session box.
 */
export function buildSessionBoxes(
  candles: readonly Pick<Candle, "time">[],
  timeframe: Timeframe,
  preferences: SessionOverlayPrefs = DEFAULT_SESSION_OVERLAY,
  nowSeconds: number = Date.now() / 1_000,
): ChartSessionBox[] {
  if (
    !Number.isFinite(nowSeconds) ||
    nowSeconds <= 0 ||
    !preferences ||
    preferences.enabled !== true ||
    !Array.isArray(preferences.sessions)
  )
    return [];

  const interval = (SECONDS as Record<string, number>)[timeframe];
  if (
    (timeframe !== "1m" &&
      timeframe !== "5m" &&
      timeframe !== "15m" &&
      timeframe !== "30m" &&
      timeframe !== "1h" &&
      timeframe !== "4h") ||
    !Number.isInteger(interval) ||
    interval <= 0
  )
    return [];

  const selected = new Set(preferences.sessions.filter(isSessionId));
  if (!selected.size) return [];

  const timestamps = actualTimestamps(candles, nowSeconds);
  if (!timestamps.length) return [];

  const chartStart = timestamps[0];
  const chartEnd = Math.min(timestamps.at(-1)! + interval, nowSeconds);
  if (chartEnd <= chartStart) return [];

  const observedBars = timestamps
    .map((start) => ({ start, end: Math.min(start + interval, nowSeconds) }))
    .filter((bar) => bar.end > bar.start);
  if (!observedBars.length) return [];

  const boxes: ChartSessionBox[] = [];
  for (const definition of SESSION_DEFINITIONS) {
    if (!selected.has(definition.id)) continue;

    const formatter = formatterFor(definition.timezone);
    const dates = sessionDatesForBars(observedBars, formatter);
    for (const date of dates.values()) {
      const startsAt = localDateTimeToUtc(
        date,
        definition.startHour,
        formatter,
      );
      const endsAt = localDateTimeToUtc(date, definition.endHour, formatter);
      if (endsAt <= startsAt) continue;

      // A calendar session is displayed only when an actual supplied candle's
      // interval touches it; this retains crypto weekends but leaves data gaps.
      if (!observedBars.some((bar) => startsAt < bar.end && endsAt > bar.start))
        continue;

      const from = Math.max(startsAt, chartStart);
      const to = Math.min(endsAt, chartEnd);
      if (to <= from) continue;

      boxes.push({
        id: `session:${definition.id}:${startsAt}`,
        session: definition.id,
        label: definition.label,
        timezone: definition.timezone,
        from,
        to,
        color: definition.color,
        row: definition.row,
        startsAt,
        endsAt,
        clipped: from !== startsAt || to !== endsAt,
      });
    }
  }

  return boxes
    .sort(
      (left, right) =>
        left.startsAt - right.startsAt ||
        left.row - right.row ||
        left.id.localeCompare(right.id),
    )
    .slice(-MAX_BOXES);
}
