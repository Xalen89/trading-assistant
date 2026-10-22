export const DEFAULT_CLOCK_TIMEZONES = [
  "Europe/London",
  "America/New_York",
  "Asia/Tokyo",
] as const;

export const CLOCK_TIMEZONE_COUNT = 3;

export type TimeZoneClock = {
  timeZone: string;
  label: string;
  time: string;
  abbreviation: string;
  utcOffset: string;
  offsetMinutes: number;
};

function numberPart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
) {
  const value = parts.find((part) => part.type === type)?.value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function friendlyTimeZoneName(timeZone: string) {
  const specialNames: Record<string, string> = {
    "Europe/London": "London",
    "America/New_York": "New York",
    "Asia/Tokyo": "Tokyo",
  };
  if (specialNames[timeZone]) return specialNames[timeZone];
  return timeZone.replace(/_/g, " ").split("/").at(-1) ?? timeZone;
}

/**
 * Validates a zone using this runtime's Intl implementation. The formatter is
 * authoritative instead of `supportedValuesOf`: it supports valid UTC and
 * `Etc/GMT±N` fixed-offset identifiers that are omitted by some canonical-list
 * implementations. This remains separate from strategy-time policy.
 */
export function isSupportedTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim())
    return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

/** True only for three Intl-supported zones; it does not silently coerce input. */
export function isClockTimezoneConfiguration(
  value: unknown,
): value is [string, string, string] {
  return (
    Array.isArray(value) &&
    value.length === CLOCK_TIMEZONE_COUNT &&
    value.every(isSupportedTimeZone)
  );
}

/**
 * Keeps rendering safe when reading a legacy/local workspace. Persistence
 * validation belongs to the workspace schema; invalid values are never written
 * back from this helper.
 */
export function clockTimezonesOrDefault(
  value: unknown,
): [string, string, string] {
  return isClockTimezoneConfiguration(value)
    ? [value[0], value[1], value[2]]
    : [...DEFAULT_CLOCK_TIMEZONES];
}

/** Maps an integer UTC offset to the IANA fixed-offset identifier Intl accepts. */
export function fixedOffsetTimeZone(offsetHours: number) {
  if (!Number.isInteger(offsetHours) || offsetHours < -12 || offsetHours > 14)
    return undefined;
  if (offsetHours === 0) return "UTC";
  // IANA's Etc/GMT signs are intentionally inverted from the displayed UTC
  // offset: Etc/GMT+5 means fixed UTC−05:00.
  return offsetHours < 0
    ? `Etc/GMT+${Math.abs(offsetHours)}`
    : `Etc/GMT-${offsetHours}`;
}

/** Returns a fixed whole-hour offset when the zone is UTC or Etc/GMT±N. */
export function fixedOffsetHours(timeZone: string) {
  if (timeZone === "UTC") return 0;
  const match = /^Etc\/GMT([+-])(\d{1,2})$/.exec(timeZone);
  if (!match) return undefined;
  const magnitude = Number(match[2]);
  if (magnitude > 14) return undefined;
  const offset = match[1] === "+" ? -magnitude : magnitude;
  return offset >= -12 && offset <= 14 ? offset : undefined;
}

function offsetMinutesAt(timeZone: string, at: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
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
  const parts = formatter.formatToParts(at);
  const year = numberPart(parts, "year");
  const month = numberPart(parts, "month");
  const day = numberPart(parts, "day");
  const hour = numberPart(parts, "hour");
  const minute = numberPart(parts, "minute");
  const second = numberPart(parts, "second");
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined ||
    second === undefined
  )
    throw new Error(`Could not determine UTC offset for ${timeZone}.`);

  const localWallClockAsUtc = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
    second,
  );
  const instantToSecond = Math.floor(at.getTime() / 1000) * 1000;
  return Math.round((localWallClockAsUtc - instantToSecond) / 60_000);
}

function formatUtcOffset(offsetMinutes: number) {
  const sign = offsetMinutes < 0 ? "−" : "+";
  const absolute = Math.abs(offsetMinutes);
  return `UTC${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(
    absolute % 60,
  ).padStart(2, "0")}`;
}

function actualAbbreviation(timeZone: string, at: Date, offsetMinutes: number) {
  // Intl gives EST/EDT in the supplied locale but may return GMT+1 for London
  // or GMT+9 for Tokyo. The canonical clock defaults get their commonly used,
  // date-accurate abbreviations while arbitrary IANA zones retain Intl output.
  if (timeZone === "Europe/London") return offsetMinutes === 0 ? "GMT" : "BST";
  if (timeZone === "Asia/Tokyo") return "JST";

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  return (
    parts.find((part) => part.type === "timeZoneName")?.value ??
    formatUtcOffset(offsetMinutes)
  );
}

/** Formats one user-configured display clock at a real instant, including DST. */
export function getTimeZoneClock(
  timeZone: string,
  at = new Date(),
): TimeZoneClock {
  if (!isSupportedTimeZone(timeZone))
    throw new Error(`Unsupported IANA timezone: ${timeZone}`);
  if (!Number.isFinite(at.getTime()))
    throw new Error("Clock time must be valid.");

  const time = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
  const offsetMinutes = offsetMinutesAt(timeZone, at);
  return {
    timeZone,
    label: friendlyTimeZoneName(timeZone),
    time,
    abbreviation: actualAbbreviation(timeZone, at, offsetMinutes),
    utcOffset: formatUtcOffset(offsetMinutes),
    offsetMinutes,
  };
}

export function getTimeZoneClocks(
  timeZones: unknown,
  at = new Date(),
): TimeZoneClock[] {
  return clockTimezonesOrDefault(timeZones).map((timeZone) =>
    getTimeZoneClock(timeZone, at),
  );
}
