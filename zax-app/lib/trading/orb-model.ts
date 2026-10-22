import { z } from "zod";
import type { Candle } from "./model";

export const orbSessionSchema = z
  .object({
    id: z.enum(["asia", "london", "new-york"]),
    timezone: z
      .string()
      .min(1)
      .max(100)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat("en-US", { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }, "Invalid session timezone"),
    startHour: z.number().int().min(0).max(23),
    endHour: z.number().int().min(0).max(23),
  })
  .strict()
  .refine(
    (v) => v.startHour !== v.endHour,
    "Session needs distinct start/end hours",
  );
export const orbConfigSchema = z
  .object({
    version: z.literal(1),
    confirmed: z.boolean(),
    timezone: z.enum(["Etc/GMT+5", "America/New_York"]),
    midpoint: z.literal("opening-range-50"),
    executionTimeframe: z.literal("1m"),
    breakout: z.literal("closed-outside-range"),
    confirmation: z.literal("close-beyond-retest"),
    stop: z.literal("retest-wick-plus-tick"),
    stopBufferTicks: z.number().int().min(1).max(10),
    marketMode: z.enum(["native-futures", "nas100-cfd"]).optional(),
    instrumentMarket: z
      .string()
      .regex(/^TL:\d{1,18}$/)
      .optional(),
    priceTick: z.number().finite().positive().max(1000).optional(),
    sessions: z
      .array(orbSessionSchema)
      .max(3)
      .refine(
        (items) => new Set(items.map((s) => s.id)).size === items.length,
        "Duplicate session definition",
      ),
  })
  .strict();
export type OrbConfig = z.infer<typeof orbConfigSchema>;
export type OrbSession = z.infer<typeof orbSessionSchema>;

/** Current same-selected-instrument metadata from the owner server, never a client model assertion. */
export type OrbInstrumentMetadata = {
  market: string;
  priceTick: number;
  source: string;
  executionSource?: string;
};

/** Owner explicitly approved these app-added execution conventions on 18 October 2026. */
export const ORB_DEFAULT_CONFIG: OrbConfig = {
  version: 1,
  confirmed: true,
  timezone: "Etc/GMT+5",
  midpoint: "opening-range-50",
  executionTimeframe: "1m",
  breakout: "closed-outside-range",
  confirmation: "close-beyond-retest",
  stop: "retest-wick-plus-tick",
  stopBufferTicks: 1,
  // Session clocks were not supplied in the video. These can be chosen explicitly in the editor.
  sessions: [],
};

export type OrbRangeFeed = {
  candles: Candle[];
  source: string;
  timeframe: "15m";
};
export type OrbRange = {
  startAt: number;
  endAt: number;
  high: number;
  low: number;
  midpoint: number;
  source: string;
  basis: "exact-15m" | "complete-1m-aggregation";
};
export type OrbContext = {
  strategyId: string;
  timezone: OrbConfig["timezone"];
  config?: OrbConfig;
  instrumentMetadata?: OrbInstrumentMetadata;
  range?: OrbRange;
  sessionLevels: {
    id: string;
    session: OrbSession["id"];
    side: "high" | "low";
    price: number;
    startAt: number;
    endAt: number;
    source: string;
  }[];
  missing: string[];
};

export const ORB_CRITICAL_STEP_IDS = [
  "orb-market",
  "orb-timeframe",
  "orb-clock",
  "orb-config",
  "orb-range",
  "orb-breakout",
  "orb-midpoint-retest",
  "orb-continuation",
  "orb-risk-band",
] as const;

/** Source09:00 inclusive to11:00 exclusive; input is actual Unix seconds, not a candle open. */
export function orbEntryWindowOpen(
  seconds: number,
  timezone: OrbConfig["timezone"],
): boolean {
  if (
    !Number.isFinite(seconds) ||
    seconds <= 0 ||
    !["Etc/GMT+5", "America/New_York"].includes(timezone)
  )
    return false;
  try {
    const hour = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(new Date(seconds * 1000))
        .find((part) => part.type === "hour")?.value,
    );
    return hour >= 9 && hour < 11;
  } catch {
    return false;
  }
}
