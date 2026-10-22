import { z } from "zod";
import type { Candle, Quote, Timeframe } from "./model";
import type { SetupCandidate } from "./setup-model";

export const SESSION_STRATEGY_FAMILIES = [
  "london-breakout",
  "initial-balance",
  "pdc-continuation",
] as const;
export type SessionStrategyFamily = (typeof SESSION_STRATEGY_FAMILIES)[number];
export type SessionClock = "Etc/GMT+5" | "America/New_York";
const common = {
  version: z.literal(1),
  confirmed: z.boolean(),
  timezone: z.enum(["Etc/GMT+5", "America/New_York"]),
  /** Autofilled settings cannot silently follow a different selected instrument. */
  instrumentMarket: z.string().min(1).max(100).optional(),
};
const price = z.number().finite().positive();
const minute = z.number().int().min(0).max(1439);
export const londonConfigSchema = z
  .object({
    ...common,
    family: z.literal("london-breakout"),
    executionTimeframe: z.literal("15m"),
    stopMode: z.enum(["midpoint", "opposite-boundary"]),
    targetMode: z.enum(["1.5r", "2r", "range-height-from-entry"]),
  })
  .strict();
export const ibConfigSchema = z
  .object({
    ...common,
    family: z.literal("initial-balance"),
    executionTimeframe: z.enum(["15m", "30m"]),
    stopMode: z.enum(["midpoint", "inside-boundary"]),
    insideBoundaryTicks: z.number().int().min(1).max(10),
    priceTick: price.optional(),
    volumePolicy: z.enum(["venue-only", "broker-reported-proxy"]).optional(),
    volumeLookback: z.literal(20),
    volumeMultiplier: z.number().finite().min(1).max(5),
    entryEndMinute: z.number().int().min(631).max(960),
    targetMode: z.literal("one-range-beyond-boundary"),
  })
  .strict();
export const pivotConfigSchema = z
  .object({
    ...common,
    family: z.literal("pdc-continuation"),
    executionTimeframe: z.enum(["1m", "5m"]),
    trigger: z.literal("observed-quote-cross"),
    volumeRule: z.literal("last-completed-greater-than-previous"),
    pdcBasis: z.enum([
      "unselected",
      "provider-utc-day",
      "provider-utc-trading-day",
      "declared-session-close",
    ]),
    sessionCloseMinute: minute.optional(),
    priceTick: price.optional(),
    volumePolicy: z.enum(["venue-only", "broker-reported-proxy"]).optional(),
    targetMode: z.enum([
      "owner-key-levels",
      "declared-premarket-range",
      "previous-day-extremes",
    ]),
    longTargetPrice: price.optional(),
    shortTargetPrice: price.optional(),
    premarketStartMinute: z.number().int().min(0).max(569).optional(),
  })
  .strict();
export const sessionStrategyConfigSchema = z.discriminatedUnion("family", [
  londonConfigSchema,
  ibConfigSchema,
  pivotConfigSchema,
]);
export type SessionStrategyConfig = z.infer<typeof sessionStrategyConfigSchema>;
export type LondonConfig = z.infer<typeof londonConfigSchema>;
export type IbConfig = z.infer<typeof ibConfigSchema>;
export type PivotConfig = z.infer<typeof pivotConfigSchema>;

// Owner approved these labelled app rules at18:52:05 on18October2026. This is not auto/gate consent.
export const LONDON_DEFAULT_CONFIG: LondonConfig = {
  version: 1,
  confirmed: true,
  timezone: "Etc/GMT+5",
  family: "london-breakout",
  executionTimeframe: "15m",
  stopMode: "midpoint",
  targetMode: "2r",
};
export const IB_DEFAULT_CONFIG: IbConfig = {
  version: 1,
  confirmed: true,
  timezone: "Etc/GMT+5",
  family: "initial-balance",
  executionTimeframe: "15m",
  stopMode: "midpoint",
  insideBoundaryTicks: 1,
  volumeLookback: 20,
  volumeMultiplier: 1.5,
  entryEndMinute: 690,
  targetMode: "one-range-beyond-boundary",
};
export const PIVOT_DEFAULT_CONFIG: PivotConfig = {
  version: 1,
  confirmed: true,
  timezone: "Etc/GMT+5",
  family: "pdc-continuation",
  executionTimeframe: "1m",
  trigger: "observed-quote-cross",
  volumeRule: "last-completed-greater-than-previous",
  pdcBasis: "unselected",
  targetMode: "owner-key-levels",
};

export type SessionSupportFeed = {
  candles: Candle[];
  source: string;
  sourceIdentity?: string;
  timeframe: "15m" | "1m";
  volumeBasis: "venue" | "broker-reported" | "unknown";
};
export type QuoteObservationPair = {
  previous?: Quote;
  current: Quote;
  /** Opaque exact origin shared by the pair when the feed declares one. */
  sourceIdentity?: string;
  observedAt: number;
  method: "owner-persisted-rest-observations";
};
export type SessionRange = {
  high: number;
  low: number;
  midpoint: number;
  startAt: number;
  endAt: number;
  source: string;
  basis: "complete-15m-window";
};
export type SessionStrategyContext = {
  strategyId: string;
  family: SessionStrategyFamily;
  timezone: SessionClock;
  config: SessionStrategyConfig;
  range?: SessionRange;
  pdc?: {
    price: number;
    closeAt: number;
    source: string;
    sourceIdentity?: string;
    basis: PivotConfig["pdcBasis"];
  };
  /**
   * Present only when the PDC detector verified a causal provider daily row.
   * These values remain evidence for source-owned paper geometry, not a
   * substitute for a current quote, PDC cross, or source identity check.
   */
  previousDay?: {
    high: number;
    low: number;
    /** ISO UTC date of the verified provider daily row, not a broker-session claim. */
    date: string;
    closeAt: number;
    source: string;
    sourceIdentity?: string;
  };
  openingPrice?: number;
  quoteEvidence?: QuoteObservationPair;
  volumeBasis: "venue" | "broker-reported" | "unknown";
  missing: string[];
};
export type SessionDetectorResult = {
  candidates: SetupCandidate[];
  context: SessionStrategyContext;
};
/** A broker raw-volume proxy must be chosen explicitly; it is never called venue volume. */
export function sessionVolumeAllowed(
  config: SessionStrategyConfig,
  basis?: string,
): boolean {
  if (basis === "venue") return true;
  return (
    config.family !== "london-breakout" &&
    config.volumePolicy === "broker-reported-proxy" &&
    basis === "broker-reported"
  );
}
export function isSessionStrategyFamily(
  value: unknown,
): value is SessionStrategyFamily {
  return SESSION_STRATEGY_FAMILIES.includes(value as SessionStrategyFamily);
}
export const SESSION_CRITICAL_IDS: Record<
  SessionStrategyFamily,
  readonly string[]
> = {
  "london-breakout": [
    "session-config",
    "session-frame",
    "session-clock",
    "session-range",
    "session-breakout",
    "session-risk",
  ],
  "initial-balance": [
    "session-config",
    "session-frame",
    "session-clock",
    "session-range",
    "session-breakout",
    "session-known-volume",
    "session-high-volume",
    "session-risk",
  ],
  "pdc-continuation": [
    "session-config",
    "session-frame",
    "session-clock",
    "pivot-pdc",
    "pivot-opening-side",
    "pivot-quote-cross",
    "pivot-known-volume",
    "pivot-rising-volume",
    "pivot-morning-stop",
    "session-risk",
  ],
};
export const SESSION_NATIVE_IDS: Record<
  SessionStrategyFamily,
  readonly string[]
> = {
  "london-breakout": ["session-breakout", "session-risk"],
  "initial-balance": [
    "session-breakout",
    "session-known-volume",
    "session-high-volume",
  ],
  // A quote cross is NOT relabelled closed OHLC. It is a separately timestamped mandatory guard.
  "pdc-continuation": ["pivot-known-volume", "pivot-rising-volume"],
};
export const SESSION_TRIGGER_IDS: Record<
  SessionStrategyFamily,
  readonly string[]
> = {
  "london-breakout": ["session-breakout"],
  "initial-balance": ["session-breakout"],
  "pdc-continuation": ["pivot-rising-volume"],
};
export function sessionClockParts(seconds: number, timezone: SessionClock) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(seconds * 1000))
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    minute: Number(values.hour) * 60 + Number(values.minute),
    second: Number(values.second),
  };
}
/** Epoch seconds for an explicitly declared clock, rejecting unrepresentable local instants. */
export function sessionInstant(
  date: string,
  localMinute: number,
  timezone: SessionClock,
): number | undefined {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isInteger(localMinute) ||
    localMinute < 0 ||
    localMinute > 1440
  )
    return undefined;
  const [year, month, day] = date.split("-").map(Number);
  const wanted = Date.UTC(
    year,
    month - 1,
    day,
    Math.floor(localMinute / 60),
    localMinute % 60,
  );
  let candidate = wanted;
  for (let i = 0; i < 4; i++) {
    const parts = sessionClockParts(candidate / 1000, timezone);
    const [y, m, d] = parts.date.split("-").map(Number);
    const actual = Date.UTC(y, m - 1, d, 0, parts.minute, parts.second);
    const delta = wanted - actual;
    candidate += delta;
    if (!delta) return candidate / 1000;
  }
  return undefined;
}
export function sessionEntryWindowOpen(
  config: SessionStrategyConfig,
  seconds: number,
): boolean {
  if (!Number.isFinite(seconds) || seconds <= 0) return false;
  try {
    const minute = sessionClockParts(seconds, config.timezone).minute;
    if (config.family === "london-breakout") return minute >= 180;
    if (config.family === "initial-balance")
      return minute >= 630 && minute < config.entryEndMinute;
    return minute >= 570 && minute < 600;
  } catch {
    return false;
  }
}
export function sessionExecutionTimeframe(
  config: SessionStrategyConfig,
): Timeframe {
  return config.executionTimeframe as Timeframe;
}
