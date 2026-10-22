import type { Candle, Level, Market, Strategy } from "./model";
import {
  ORB_DEFAULT_CONFIG,
  ORB_CRITICAL_STEP_IDS,
  orbConfigSchema,
  type OrbConfig,
  type OrbContext,
  type OrbRange,
  type OrbSession,
} from "./orb-model";
import {
  resolveOrbMarketProfile,
  type OrbMarketProfile,
} from "./orb-market-profile";
import type {
  Direction,
  SetupCandidate,
  SetupInput,
  SetupStep,
  SetupZone,
} from "./setup-model";

const ONE_MINUTE = 60;
const FIFTEEN_MINUTES = 900;
const ONE_HOUR = 3600;
const MAX_BARS = 3000;
const MAX_SESSION_WINDOWS = 32;

type LocalDate = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};
type NormalizedBars = {
  bars: Candle[];
  invalid: number;
  duplicateConflict: boolean;
};
type SequencePoint = { bar: Candle; index: number };
type OrbSequence = {
  breakout?: SequencePoint;
  retest?: SequencePoint;
  confirmation?: SequencePoint;
  resets: number;
  gaps: number;
};
type SessionResult = {
  levels: OrbContext["sessionLevels"];
  displayLevels: Level[];
  missing: string[];
  status: SetupStep["status"];
  evidence: string;
};
type RangeResult = { range?: OrbRange; messages: string[] };

const step = (
  id: string,
  name: string,
  status: SetupStep["status"],
  evidence: string,
): SetupStep => ({ id, name, status, evidence });
const show = (value: number | undefined) =>
  value === undefined || !Number.isFinite(value)
    ? "unavailable"
    : Number(value.toFixed(6)).toString();
const asSeconds = (now: number) =>
  Number.isFinite(now) ? (now > 10_000_000_000 ? now / 1000 : now) : NaN;

const validOhlc = (bar: Candle) =>
  Number.isFinite(bar.time) &&
  bar.time > 0 &&
  Number.isFinite(bar.open) &&
  Number.isFinite(bar.high) &&
  Number.isFinite(bar.low) &&
  Number.isFinite(bar.close) &&
  bar.high >= bar.low &&
  bar.high >= Math.max(bar.open, bar.close) &&
  bar.low <= Math.min(bar.open, bar.close);

const sameOhlc = (a: Candle, b: Candle) =>
  a.time === b.time &&
  a.open === b.open &&
  a.high === b.high &&
  a.low === b.low &&
  a.close === b.close &&
  a.volume === b.volume;

/** Keeps only complete valid bars, collapsing exact duplicates and flagging conflicts. */
function normalizeBars(
  raw: Candle[] | undefined,
  duration: number,
  asOf: number,
): NormalizedBars {
  const unique = new Map<number, Candle>();
  let invalid = 0;
  let duplicateConflict = false;
  for (const bar of raw || []) {
    if (!validOhlc(bar) || bar.time + duration > asOf) {
      invalid += 1;
      continue;
    }
    const prior = unique.get(bar.time);
    if (prior && !sameOhlc(prior, bar)) {
      duplicateConflict = true;
      continue;
    }
    if (!prior) unique.set(bar.time, bar);
  }
  return {
    bars: [...unique.values()].sort((a, b) => a.time - b.time).slice(-MAX_BARS),
    invalid,
    duplicateConflict,
  };
}

function localParts(time: number, timezone: string): LocalDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(time * 1000));
  const value = (kind: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === kind)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
  };
}

const dateKey = (date: Pick<LocalDate, "year" | "month" | "day">) =>
  `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;

function addCalendarDays(
  date: Pick<LocalDate, "year" | "month" | "day">,
  days: number,
) {
  const result = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: result.getUTCFullYear(),
    month: result.getUTCMonth() + 1,
    day: result.getUTCDate(),
  };
}

/** Resolves regular market-hour local clocks, including the New York DST override. */
function zonedEpoch(
  date: Pick<LocalDate, "year" | "month" | "day">,
  hour: number,
  minute: number,
  timezone: string,
) {
  const desired =
    Date.UTC(date.year, date.month - 1, date.day, hour, minute) / 1000;
  let candidate = desired;
  for (let pass = 0; pass < 3; pass += 1) {
    const seen = localParts(candidate, timezone);
    const observed =
      Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute) /
      1000;
    candidate += desired - observed;
  }
  return candidate;
}

function clockLabel(time: number | undefined, timezone: string) {
  if (time === undefined) return "unavailable";
  const local = localParts(time, timezone);
  return `${dateKey(local)} ${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")} ${timezone}`;
}

const inEntryWindow = (time: number, timezone: string) => {
  const local = localParts(time, timezone);
  const minute = local.hour * 60 + local.minute;
  return minute >= 540 && minute < 660;
};

const tickAligned = (price: number, tick: number) =>
  Number.isFinite(price) &&
  Number.isFinite(tick) &&
  tick > 0 &&
  Math.abs(price / tick - Math.round(price / tick)) < 1e-8;

/** Owner-approved native geometry or explicitly configured NAS100 CFD app adaptation. */
export function orbPaperGeometry(
  market: Market,
  side: Direction,
  entry: number,
  stop: number,
  config: OrbConfig = ORB_DEFAULT_CONFIG,
  metadata?: import("./orb-model").OrbInstrumentMetadata,
): { target: number; rr: number; targetPoints: number } {
  const profile = resolveOrbMarketProfile(market, config, metadata);
  if (
    !Number.isFinite(entry) ||
    !Number.isFinite(stop) ||
    entry <= 0 ||
    stop <= 0
  )
    throw new Error(
      "ORB geometry needs finite positive entry and stop prices.",
    );
  if ((side === "long" && stop >= entry) || (side === "short" && stop <= entry))
    throw new Error("ORB stop must be beyond entry in the loss direction.");
  if (!tickAligned(entry, profile.tick) || !tickAligned(stop, profile.tick))
    throw new Error(
      `ORB entry and stop must use verified ${profile.label} ${show(profile.tick)}-point price ticks.`,
    );
  const targetPoints = 3 * Math.abs(entry - stop);
  const target = side === "long" ? entry + targetPoints : entry - targetPoints;
  if (!tickAligned(target, profile.tick))
    throw new Error(
      `ORB canonical 3R target must use the verified ${profile.label} ${show(profile.tick)}-point price tick.`,
    );
  if (
    targetPoints < profile.minimumTargetPoints ||
    targetPoints > profile.maximumTargetPoints
  )
    throw new Error(
      `ORB 3R target ${show(targetPoints)} points is outside the ${profile.label} ${profile.minimumTargetPoints}–${profile.maximumTargetPoints} point band.`,
    );
  return {
    target,
    rr: 3,
    targetPoints,
  };
}

function exactRange(
  input: SetupInput,
  rangeStart: number,
  asOf: number,
): RangeResult {
  const feed = input.orbRangeFeed;
  if (!feed)
    return {
      messages: [
        "No exact 15m ORB range feed was supplied; checking only complete actual 1m input bars.",
      ],
    };
  if (feed.timeframe !== "15m")
    return {
      messages: [
        "The supplied ORB range feed is not explicitly 15m; it is not used or resampled.",
      ],
    };
  if (feed.source !== input.source)
    return {
      messages: [
        "The supplied 15m ORB range feed source does not exactly equal the execution source; it is not mixed with this setup.",
      ],
    };
  if (asOf < rangeStart + FIFTEEN_MINUTES)
    return {
      messages: [
        "The current local-date 08:00–08:15 ORB candle is still forming; no range or fallback is asserted.",
      ],
    };
  const targetRaw = (feed.candles || []).filter(
    (bar) => bar.time === rangeStart,
  );
  const validTarget = targetRaw.filter(validOhlc);
  const uniqueTarget = new Map<number, Candle>();
  let targetConflict = false;
  for (const bar of validTarget) {
    const prior = uniqueTarget.get(bar.time);
    if (prior && !sameOhlc(prior, bar)) targetConflict = true;
    else if (!prior) uniqueTarget.set(bar.time, bar);
  }
  if (
    !targetRaw.length ||
    validTarget.length !== targetRaw.length ||
    targetConflict ||
    uniqueTarget.size !== 1
  )
    return {
      messages: [
        "The exact current-date 08:00 15m candle is missing, malformed, or duplicated; no other date/bar is substituted.",
      ],
    };
  if (validTarget[0].time + FIFTEEN_MINUTES > asOf)
    return {
      messages: [
        "The exact current-date 08:00 15m candle has not closed by 08:15; no future range is used.",
      ],
    };
  const normalized = normalizeBars(feed.candles, FIFTEEN_MINUTES, asOf);
  if (normalized.duplicateConflict)
    return {
      messages: [
        "Conflicting duplicate 15m source candles were supplied; the ORB range remains unknown.",
      ],
    };
  const { high, low } = uniqueTarget.get(rangeStart)!;
  if (!(high > low))
    return {
      messages: [
        "The exact 08:00 15m candle has no positive opening range; midpoint execution is unknown.",
      ],
    };
  return {
    range: {
      startAt: rangeStart,
      endAt: rangeStart + FIFTEEN_MINUTES,
      high,
      low,
      midpoint: (high + low) / 2,
      source: feed.source,
      basis: "exact-15m",
    },
    messages: [],
  };
}

function oneMinuteRange(
  execution: NormalizedBars,
  input: SetupInput,
  rangeStart: number,
  asOf: number,
): RangeResult {
  if (asOf < rangeStart + FIFTEEN_MINUTES)
    return {
      messages: [
        "The current local-date 08:00–08:15 interval is still forming; 1m aggregation is not used.",
      ],
    };
  if (input.timeframe !== "1m")
    return {
      messages: [
        "No exact 15m range is available, and only actual input timeframe 1m bars may be aggregated; 5m/1h bars are never subdivided.",
      ],
    };
  if (execution.duplicateConflict)
    return {
      messages: [
        "Conflicting duplicate execution candles prevent a causal 1m ORB range aggregation.",
      ],
    };
  const byTime = new Map(execution.bars.map((bar) => [bar.time, bar]));
  const bars: Candle[] = [];
  for (let offset = 0; offset < 15; offset += 1) {
    const bar = byTime.get(rangeStart + offset * ONE_MINUTE);
    if (!bar)
      return {
        messages: [
          "The exact 08:00–08:14 1m range input is missing, gapped, malformed, future, or incomplete; no synthetic range is created.",
        ],
      };
    bars.push(bar);
  }
  const high = Math.max(...bars.map((bar) => bar.high));
  const low = Math.min(...bars.map((bar) => bar.low));
  if (!(high > low))
    return {
      messages: [
        "The complete 1m aggregation has no positive opening range; midpoint execution is unknown.",
      ],
    };
  return {
    range: {
      startAt: rangeStart,
      endAt: rangeStart + FIFTEEN_MINUTES,
      high,
      low,
      midpoint: (high + low) / 2,
      source: input.source,
      basis: "complete-1m-aggregation",
    },
    messages: [],
  };
}

function resolveRange(
  input: SetupInput,
  execution: NormalizedBars,
  rangeStart: number,
  asOf: number,
): RangeResult {
  const exact = exactRange(input, rangeStart, asOf);
  // A provided but mismatched, incomplete, malformed, or conflicting 15m source must fail
  // rather than being silently mixed with an execution feed. The 1m fallback is only for the
  // absence of an exact 15m feed.
  if (input.orbRangeFeed) return exact;
  const aggregate = oneMinuteRange(execution, input, rangeStart, asOf);
  return {
    range: aggregate.range,
    messages: [...exact.messages, ...aggregate.messages],
  };
}

function detectSequence(
  bars: Candle[],
  range: OrbRange,
  side: Direction,
): OrbSequence {
  let sequence: OrbSequence = { resets: 0, gaps: 0 };
  let prior: Candle | undefined;
  for (let index = 0; index < bars.length; index += 1) {
    const bar = bars[index];
    if (prior && sequence.breakout && bar.time !== prior.time + ONE_MINUTE)
      sequence = { resets: sequence.resets, gaps: sequence.gaps + 1 };
    const oppositeBreach =
      side === "long" ? bar.low < range.low : bar.high > range.high;
    if (oppositeBreach) {
      if (sequence.breakout)
        sequence = { resets: sequence.resets + 1, gaps: sequence.gaps };
      prior = bar;
      continue;
    }
    if (!sequence.breakout) {
      const broke =
        side === "long" ? bar.close > range.high : bar.close < range.low;
      if (broke) sequence.breakout = { bar, index };
    } else if (!sequence.retest) {
      if (bar.low <= range.midpoint && bar.high >= range.midpoint)
        sequence.retest = { bar, index };
    } else {
      const continues =
        side === "long"
          ? bar.close > sequence.retest.bar.high
          : bar.close < sequence.retest.bar.low;
      if (continues) sequence.confirmation = { bar, index };
    }
    prior = bar;
  }
  return sequence;
}

function rangeLevels(
  range: OrbRange,
  strategy: Strategy,
  market: Market,
): Level[] {
  const make = (
    id: string,
    name: string,
    price: number,
    color: string,
  ): Level => ({
    id: `orb-${id}-${strategy.id}-${range.startAt}`,
    strategyId: strategy.id,
    market: market.id,
    name,
    price,
    color,
  });
  // IDs bind these three values to the same closed source candle/date. OrbContext.range holds
  // source provenance because the shared Level contract has no source/date fields.
  return [
    make("high", "ORB High", range.high, "#F4C878"),
    make("low", "ORB Low", range.low, "#F87171"),
    make("50", "ORB 50%", range.midpoint, "#7DD3FC"),
  ];
}

function sessionWindow(
  date: Pick<LocalDate, "year" | "month" | "day">,
  session: OrbSession,
) {
  const endDate =
    session.endHour > session.startHour ? date : addCalendarDays(date, 1);
  return {
    startAt: zonedEpoch(
      date,
      session.startHour,
      0,
      session.timezone as OrbConfig["timezone"],
    ),
    endAt: zonedEpoch(
      endDate,
      session.endHour,
      0,
      session.timezone as OrbConfig["timezone"],
    ),
  };
}

function sessionContext(
  input: SetupInput,
  strategy: Strategy,
  config: OrbConfig,
  asOf: number,
  localToday: Pick<LocalDate, "year" | "month" | "day">,
): SessionResult {
  if (!config.sessions.length) {
    return {
      levels: [],
      displayLevels: [],
      missing: [
        "No owner-chosen hourly session windows are configured; session context is unknown and not a trade gate.",
      ],
      status: "unknown",
      evidence:
        "No session clocks were supplied/selected. No default Asia, London, or New York windows are invented; this non-trade context is unknown.",
    };
  }
  const normalized = normalizeBars(input.hourly, ONE_HOUR, asOf);
  const byTime = new Map(normalized.bars.map((bar) => [bar.time, bar]));
  const levels: OrbContext["sessionLevels"] = [];
  const displayLevels: Level[] = [];
  const missing: string[] = [];
  const source = input.hourlySource || input.source;
  let completeCount = 0;

  for (const session of config.sessions) {
    let latest: { startAt: number; endAt: number } | undefined;
    for (let offset = 0; offset < MAX_SESSION_WINDOWS; offset += 1) {
      const window = sessionWindow(
        addCalendarDays(localToday, -offset),
        session,
      );
      if (window.endAt <= asOf) {
        latest = window;
        break;
      }
    }
    if (!latest) {
      missing.push(
        `${session.id}: no completed owner-chosen session window exists yet at this clock.`,
      );
      continue;
    }
    const bars: Candle[] = [];
    for (let time = latest.startAt; time < latest.endAt; time += ONE_HOUR) {
      const bar = byTime.get(time);
      if (!bar) break;
      bars.push(bar);
    }
    const expected = Math.round((latest.endAt - latest.startAt) / ONE_HOUR);
    if (bars.length !== expected || normalized.duplicateConflict) {
      missing.push(
        `${session.id}: latest completed session window is partial, gapped, malformed, or has conflicting hourly duplicates; no session level is inferred.`,
      );
      continue;
    }
    completeCount += 1;
    const high = Math.max(...bars.map((bar) => bar.high));
    const low = Math.min(...bars.map((bar) => bar.low));
    const later = normalized.bars.filter((bar) => bar.time >= latest.endAt);
    const highTapped = later.some((bar) => bar.high >= high);
    const lowTapped = later.some((bar) => bar.low <= low);
    const add = (side: "high" | "low", price: number) => {
      const item = {
        id: `orb-session-${session.id}-${side}-${latest!.startAt}`,
        session: session.id,
        side,
        price,
        startAt: latest!.startAt,
        endAt: latest!.endAt,
        source,
      };
      levels.push(item);
      displayLevels.push({
        id: item.id,
        strategyId: strategy.id,
        market: input.market.id,
        name: `${session.id} ${side} (untapped)`,
        price,
        color: side === "high" ? "#C4B5FD" : "#818CF8",
      });
    };
    if (!highTapped) add("high", high);
    if (!lowTapped) add("low", low);
  }

  if (!completeCount) {
    return {
      levels,
      displayLevels,
      missing,
      status: "unknown",
      evidence:
        "No complete latest owner-chosen hourly session could be verified from loaded history. Partial sessions are not promoted to levels.",
    };
  }
  return {
    levels,
    displayLevels,
    missing,
    status: missing.length ? "unknown" : "met",
    evidence: `Verified ${completeCount}/${config.sessions.length} latest completed owner-chosen session window(s). ${missing.length ? "At least one configured session remains unknown; no missing context is promoted to certainty." : ""} Untapped means no later completed loaded hourly high reached a session high or low reached a session low; it is context only, not a direction or entry filter.`,
  };
}

function rangeZone(
  range: OrbRange,
  strategy: Strategy,
  side: Direction,
): SetupZone {
  return {
    id: `orb-range-${strategy.id}-${side}-${range.startAt}`,
    kind: "orb",
    side,
    startTime: range.startAt,
    endTime: range.endAt,
    low: range.low,
    high: range.high,
    ce: range.midpoint,
    label: "08:00–08:15 ORB range",
    source: `Closed ${range.basis} source candle(s) · ${range.source}`,
    strategyId: strategy.id,
  };
}

/**
 * Closed-bar-only ORB analysis. Hourly session levels are optional preparation context and never
 * a directional gate; source narration did not specify a higher-timeframe bias filter.
 */
export function analyzeOrb(
  input: SetupInput,
  strategy: Strategy,
): {
  candidates: SetupCandidate[];
  levels: Level[];
  context: OrbContext;
  messages: string[];
} {
  const asOf = asSeconds(input.now);
  const parsedConfig = orbConfigSchema.safeParse(strategy.orbConfig);
  // An invalid/missing config must not become executable. The approved default is used only to
  // display conservative fixed-EST context while the explicit config step remains failed.
  const config = parsedConfig.success ? parsedConfig.data : ORB_DEFAULT_CONFIG;
  let marketProfile: OrbMarketProfile | undefined;
  let marketProfileError: string | undefined;
  try {
    marketProfile = resolveOrbMarketProfile(
      input.market,
      config,
      input.orbInstrumentMetadata,
    );
    if (
      marketProfile.mode === "nas100-cfd" &&
      (input.orbInstrumentMetadata?.executionSource ??
        input.orbInstrumentMetadata?.source) !== input.source
    )
      throw new Error(
        "NAS100 CFD mode is blocked: metadata.source must exactly equal the execution source unless the owner server supplies a matching executionSource binding; different provider data cannot prove the CFD price tick.",
      );
  } catch (error) {
    marketProfile = undefined;
    marketProfileError =
      error instanceof Error
        ? error.message
        : "ORB market profile is unavailable.";
  }
  const verifiedInstrumentMetadata =
    marketProfile?.mode === "nas100-cfd"
      ? input.orbInstrumentMetadata
      : undefined;
  const execution = normalizeBars(input.candles, ONE_MINUTE, asOf);
  const messages: string[] = [];
  if (execution.invalid)
    messages.push(
      `${execution.invalid} invalid, forming, or future execution candle(s) were excluded.`,
    );
  if (execution.duplicateConflict)
    messages.push(
      "Conflicting duplicate execution candles were excluded from causal ORB analysis.",
    );

  const localNow = localParts(asOf, config.timezone);
  const currentDate = {
    year: localNow.year,
    month: localNow.month,
    day: localNow.day,
  };
  const rangeStart = zonedEpoch(currentDate, 8, 0, config.timezone);
  const rangeResult = resolveRange(input, execution, rangeStart, asOf);
  const range = rangeResult.range;
  messages.push(...rangeResult.messages);

  const session = sessionContext(input, strategy, config, asOf, currentDate);
  const context: OrbContext = {
    strategyId: strategy.id,
    timezone: config.timezone,
    config,
    ...(verifiedInstrumentMetadata
      ? { instrumentMetadata: verifiedInstrumentMetadata }
      : {}),
    ...(range ? { range } : {}),
    sessionLevels: session.levels,
    missing: [...session.missing],
  };
  if (session.missing.length) messages.push(...session.missing);
  messages.push(
    "The source supplied no further setup-specific risk invalidation rule beyond the opposite-opening-range sequence reset and configured retest-wick stop; no additional rule is inferred.",
  );

  const decision = execution.bars.at(-1);
  const latestOnCurrentDate = Boolean(
    decision &&
    dateKey(localParts(decision.time, config.timezone)) ===
      dateKey(currentDate),
  );
  const stageBars = range
    ? execution.bars.filter(
        (bar) =>
          bar.time >= range.endAt &&
          dateKey(localParts(bar.time, config.timezone)) ===
            dateKey(currentDate),
      )
    : [];
  const levels = range
    ? [...rangeLevels(range, strategy, input.market), ...session.displayLevels]
    : [...session.displayLevels];
  const candidates: SetupCandidate[] = [];

  for (const side of ["long", "short"] as const) {
    const sequence = range
      ? detectSequence(stageBars, range, side)
      : { resets: 0, gaps: 0 };
    const freshContinuation = Boolean(
      sequence.confirmation &&
      decision &&
      latestOnCurrentDate &&
      sequence.confirmation.bar.time === decision.time &&
      inEntryWindow(decision.time, config.timezone),
    );
    const marketOk = Boolean(marketProfile);
    const timeframeOk = input.timeframe === "1m";
    const configStatus: SetupStep["status"] = parsedConfig.success
      ? parsedConfig.data.confirmed
        ? "met"
        : "failed"
      : "failed";
    const clockStatus: SetupStep["status"] =
      !decision || !latestOnCurrentDate
        ? "unknown"
        : inEntryWindow(decision.time, config.timezone)
          ? "met"
          : localParts(decision.time, config.timezone).hour < 9
            ? "waiting"
            : "failed";
    const rangeStatus: SetupStep["status"] = range ? "met" : "unknown";
    const breakoutStatus: SetupStep["status"] = !range
      ? "unknown"
      : sequence.breakout
        ? "met"
        : "waiting";
    const retestStatus: SetupStep["status"] = !range
      ? "unknown"
      : !sequence.breakout
        ? "waiting"
        : sequence.retest
          ? "met"
          : "waiting";
    const continuationStatus: SetupStep["status"] = freshContinuation
      ? "met"
      : !range
        ? "unknown"
        : "waiting";

    let geometry:
      | { target: number; rr: number; targetPoints: number }
      | undefined;
    let riskStatus: SetupStep["status"] = freshContinuation
      ? "failed"
      : continuationStatus === "unknown"
        ? "unknown"
        : "waiting";
    let riskEvidence =
      "A fresh newest closed 1m continuation confirmation is required before the exact retest-wick stop and 3R band are evaluated.";
    if (freshContinuation && sequence.retest && decision && marketProfile) {
      const wick =
        side === "long" ? sequence.retest.bar.low : sequence.retest.bar.high;
      const stop =
        side === "long"
          ? wick - config.stopBufferTicks * marketProfile.tick
          : wick + config.stopBufferTicks * marketProfile.tick;
      if (
        !tickAligned(wick, marketProfile.tick) ||
        !tickAligned(decision.close, marketProfile.tick) ||
        !tickAligned(stop, marketProfile.tick)
      ) {
        riskEvidence = `Retest wick ${show(wick)}, latest close ${show(decision.close)}, or stop ${show(stop)} is not aligned to the verified ${marketProfile.label} ${show(marketProfile.tick)}-point price tick.`;
      } else {
        try {
          geometry = orbPaperGeometry(
            input.market,
            side,
            decision.close,
            stop,
            config,
            verifiedInstrumentMetadata,
          );
          riskStatus = "met";
          riskEvidence = `Stop ${show(stop)} is ${config.stopBufferTicks} verified ${show(marketProfile.tick)}-point ${marketProfile.label} tick(s) beyond opposite retest wick ${show(wick)}; canonical 3R target ${show(geometry.target)} is ${show(geometry.targetPoints)} points inside the ${marketProfile.minimumTargetPoints}–${marketProfile.maximumTargetPoints} point band.${marketProfile.mode === "nas100-cfd" ? " NAS100 is an owner-approved CFD price-point app adaptation, not NQ equivalence, source-video evidence, or a validated trading edge." : ""}`;
        } catch (error) {
          riskEvidence =
            error instanceof Error
              ? error.message
              : "ORB risk geometry is unavailable.";
        }
      }
    } else if (freshContinuation && !marketOk) {
      riskEvidence = marketProfileError || "ORB market profile is unavailable.";
    }

    const steps: SetupStep[] = [
      step(
        "orb-market",
        "Verified native futures or configured NAS100 CFD market",
        marketOk ? "met" : "failed",
        marketOk
          ? marketProfile!.mode === "nas100-cfd"
            ? `${input.market.id}/${input.market.providerSymbol} is the configured NAS100 CFD. Current same-instrument metadata source ${verifiedInstrumentMetadata!.source} verifies its ${show(marketProfile!.tick)}-point price tick. NAS100 uses an owner-approved 50–150 CFD-price-point 3R app adaptation, not NQ equivalence, source-video evidence, or a validated trading edge.`
            : `${input.market.id}/${input.market.providerSymbol} is an allowed ${marketProfile!.label} identity with verified ${show(marketProfile!.tick)}-point CME outright ticks.`
          : marketProfileError ||
              "ORB market profile is unavailable; no instrument or tick is inferred.",
      ),
      step(
        "orb-timeframe",
        "Actual 1m execution timeframe",
        timeframeOk ? "met" : "failed",
        timeframeOk
          ? "Input execution timeframe is actual 1m."
          : `Input timeframe ${input.timeframe} is not 1m; no 5m/15m/1h execution inference is made.`,
      ),
      step(
        "orb-clock",
        "Latest decision bar inside 09:00–11:00 entry window",
        clockStatus,
        decision && latestOnCurrentDate
          ? `Latest completed execution bar is ${clockLabel(decision.time, config.timezone)}; entries require 09:00 inclusive and 11:00 exclusive.`
          : "No latest completed execution bar from the current local ORB date is available for an entry-clock decision.",
      ),
      step(
        "orb-config",
        "Owner-confirmed ORB execution configuration",
        configStatus,
        parsedConfig.success
          ? parsedConfig.data.confirmed
            ? `Version ${parsedConfig.data.version} configuration is owner-confirmed; ${parsedConfig.data.timezone} is the active fixed/DST clock choice.`
            : "ORB configuration exists but owner confirmation is false; no executable setup is asserted."
          : "ORB configuration is missing or invalid; default context is not approval.",
      ),
      step(
        "orb-session-context",
        "Untested hourly session context (non-trade metadata)",
        session.status,
        session.evidence,
      ),
      step(
        "orb-range",
        "Closed current-date 08:00–08:15 opening range",
        rangeStatus,
        range
          ? `${range.basis} from ${range.source}: high ${show(range.high)}, low ${show(range.low)}, 50% ${show(range.midpoint)}; only current local date ${dateKey(currentDate)} is used.`
          : "Exact current-local-date 08:00 range is unknown; no prior/future bar or inferred session range is substituted.",
      ),
      step(
        "orb-breakout",
        `${side === "long" ? "Upside" : "Downside"} closed breakout after range`,
        breakoutStatus,
        sequence.breakout && range
          ? `Closed 1m ${side} breakout at ${clockLabel(sequence.breakout.bar.time, config.timezone)}: close ${show(sequence.breakout.bar.close)} is strictly beyond ORB ${side === "long" ? "high" : "low"} ${show(side === "long" ? range.high : range.low)}.${sequence.resets || sequence.gaps ? ` ${sequence.resets} opposite-range reset(s) and ${sequence.gaps} causal gap reset(s) preceded the retained sequence.` : ""}`
          : "No retained closed breakout strictly beyond the opening range; opposite-range breaches and 1m gaps reset an unfinished sequence.",
      ),
      step(
        "orb-midpoint-retest",
        "Strictly later opening-range 50% retest",
        retestStatus,
        sequence.retest && range
          ? `Closed 1m retest at ${clockLabel(sequence.retest.bar.time, config.timezone)} spans opening-range 50% ${show(range.midpoint)} after the breakout.`
          : "Await a strictly later completed 1m bar spanning the opening-range midpoint; no same-bar order is inferred.",
      ),
      step(
        "orb-continuation",
        "Fresh closed continuation beyond retest wick",
        continuationStatus,
        freshContinuation && sequence.confirmation && sequence.retest
          ? `Newest completed 1m bar at ${clockLabel(sequence.confirmation.bar.time, config.timezone)} closes ${show(sequence.confirmation.bar.close)} beyond retest ${side === "long" ? "high" : "low"} ${show(side === "long" ? sequence.retest.bar.high : sequence.retest.bar.low)}.`
          : sequence.confirmation
            ? `A continuation condition occurred at ${clockLabel(sequence.confirmation.bar.time, config.timezone)}, but only the newest completed confirmation inside 09:00–11:00 is a trigger; no stale/pre-window entry is reused.`
            : "Await a strictly later completed 1m close beyond the retest wick; pre-window and old confirmations are not reused.",
      ),
      step(
        "orb-risk-band",
        "Verified retest-wick + tick stop and exact 3R source band",
        riskStatus,
        riskEvidence,
      ),
    ];
    // The shared critical list is deliberately asserted at construction time: this protects the
    // integration boundary if a future refactor changes the candidate step ordering.
    const ready = ORB_CRITICAL_STEP_IDS.every((id) =>
      steps.some((item) => item.id === id && item.status === "met"),
    );
    candidates.push({
      id: `orb-${strategy.id}-${side}-${decision?.time || range?.endAt || rangeStart}`,
      family: "orb",
      side,
      strategyId: strategy.id,
      strategyVersion: strategy.version,
      name: strategy.name,
      ready,
      steps,
      zones: range ? [rangeZone(range, strategy, side)] : [],
      ...(ready && decision && sequence.retest && geometry && marketProfile
        ? {
            entry: decision.close,
            stop:
              side === "long"
                ? sequence.retest.bar.low -
                  config.stopBufferTicks * marketProfile.tick
                : sequence.retest.bar.high +
                  config.stopBufferTicks * marketProfile.tick,
            target: geometry.target,
          }
        : {}),
      source: strategy.source || "Owner-approved ORB source configuration",
    });
  }
  return { candidates, levels, context, messages };
}
