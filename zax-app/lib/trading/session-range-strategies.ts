import type { Candle, Strategy } from "./model";
import {
  IB_DEFAULT_CONFIG,
  LONDON_DEFAULT_CONFIG,
  SESSION_CRITICAL_IDS,
  sessionClockParts,
  sessionEntryWindowOpen,
  sessionInstant,
  sessionVolumeAllowed,
  sessionStrategyConfigSchema,
  type IbConfig,
  type LondonConfig,
  type SessionDetectorResult,
  type SessionRange,
  type SessionStrategyConfig,
} from "./session-strategy-model";
import type {
  Direction,
  SetupCandidate,
  SetupInput,
  SetupStep,
  SetupZone,
} from "./setup-model";

const FIFTEEN_MINUTES = 15 * 60;
const THIRTY_MINUTES = 30 * 60;
const PRIOR_VOLUME_BARS = 20;

type RangeFamily = "london-breakout" | "initial-balance";
type RangeConfig = LondonConfig | IbConfig;
type Window = { date: string; startAt: number; endAt: number; label: string };
type NormalizedBars = {
  bars: Candle[];
  invalid: number;
  duplicateConflict: boolean;
  latestRawTime?: number;
  latestProblemTime?: number;
};
type RangeResolution = {
  range?: SessionRange;
  missing: string[];
  window?: Window;
};
type Geometry = {
  entry: number;
  stop: number;
  target: number;
  evidence: string;
};
type VolumeCheck = {
  known: SetupStep["status"];
  high: SetupStep["status"];
  knownEvidence: string;
  highEvidence: string;
  label: string;
};
type VolumeBasis = "venue" | "broker-reported" | "unknown";

const step = (
  id: string,
  name: string,
  status: SetupStep["status"],
  evidence: string,
): SetupStep => ({ id, name, status, evidence });

const show = (value: number | undefined) =>
  value === undefined || !Number.isFinite(value)
    ? "unavailable"
    : Number(value.toFixed(8)).toString();

const asSeconds = (value: number) =>
  Number.isFinite(value)
    ? value > 10_000_000_000
      ? value / 1000
      : value
    : NaN;

const validCandle = (bar: Candle) =>
  Number.isFinite(bar.time) &&
  bar.time > 0 &&
  Number.isFinite(bar.open) &&
  Number.isFinite(bar.high) &&
  Number.isFinite(bar.low) &&
  Number.isFinite(bar.close) &&
  Number.isFinite(bar.volume) &&
  bar.open > 0 &&
  bar.high > 0 &&
  bar.low > 0 &&
  bar.close > 0 &&
  bar.volume >= 0 &&
  bar.high >= bar.low &&
  bar.high >= Math.max(bar.open, bar.close) &&
  bar.low <= Math.min(bar.open, bar.close);

const sameCandle = (left: Candle, right: Candle) =>
  left.time === right.time &&
  left.open === right.open &&
  left.high === right.high &&
  left.low === right.low &&
  left.close === right.close &&
  left.volume === right.volume;

/** Only completed, structurally valid bars are eligible for a decision or volume baseline. */
function normalizeBars(
  raw: Candle[] | undefined,
  duration: number,
  asOf: number,
): NormalizedBars {
  const unique = new Map<number, Candle>();
  let invalid = 0;
  let duplicateConflict = false;
  let latestRawTime: number | undefined;
  let latestProblemTime: number | undefined;

  for (const bar of raw || []) {
    if (Number.isFinite(bar.time) && bar.time > 0) {
      latestRawTime = Math.max(latestRawTime ?? -Infinity, bar.time);
    }
    if (!validCandle(bar) || bar.time + duration > asOf) {
      invalid += 1;
      if (Number.isFinite(bar.time) && bar.time > 0)
        latestProblemTime = Math.max(latestProblemTime ?? -Infinity, bar.time);
      continue;
    }
    const prior = unique.get(bar.time);
    if (prior && !sameCandle(prior, bar)) {
      duplicateConflict = true;
      latestProblemTime = Math.max(latestProblemTime ?? -Infinity, bar.time);
      continue;
    }
    if (!prior) unique.set(bar.time, bar);
  }

  return {
    bars: [...unique.values()].sort((left, right) => left.time - right.time),
    invalid,
    duplicateConflict,
    latestRawTime,
    latestProblemTime,
  };
}

function configuredFamily(strategy: Strategy): RangeFamily {
  const raw = strategy.sessionConfig as unknown;
  if (
    raw &&
    typeof raw === "object" &&
    (raw as { family?: unknown }).family === "initial-balance"
  )
    return "initial-balance";
  if (strategy.setupFamily === "initial-balance") return "initial-balance";
  return "london-breakout";
}

function resolveConfig(strategy: Strategy): {
  family: RangeFamily;
  config: RangeConfig;
  valid: boolean;
} {
  const family = configuredFamily(strategy);
  const parsed = sessionStrategyConfigSchema.safeParse(strategy.sessionConfig);
  if (
    parsed.success &&
    (parsed.data.family === "london-breakout" ||
      parsed.data.family === "initial-balance") &&
    parsed.data.family === family
  )
    return { family, config: parsed.data, valid: true };
  // A malformed/missing configuration is never silently approved. The owner-approved defaults
  // are retained only as display context; `valid: false` keeps this configuration gate failed.
  return {
    family,
    config:
      family === "london-breakout" ? LONDON_DEFAULT_CONFIG : IB_DEFAULT_CONFIG,
    valid: false,
  };
}

function windowFor(
  family: RangeFamily,
  timezone: RangeConfig["timezone"],
  asOf: number,
): { window?: Window; missing?: string } {
  try {
    const date = sessionClockParts(asOf, timezone).date;
    const startMinute = family === "london-breakout" ? 0 : 9 * 60 + 30;
    const endMinute = family === "london-breakout" ? 3 * 60 : 10 * 60 + 30;
    const startAt = sessionInstant(date, startMinute, timezone);
    const endAt = sessionInstant(date, endMinute, timezone);
    if (
      startAt === undefined ||
      endAt === undefined ||
      !Number.isFinite(startAt) ||
      !Number.isFinite(endAt) ||
      endAt <= startAt ||
      (endAt - startAt) % FIFTEEN_MINUTES !== 0
    )
      return {
        missing:
          "The explicitly configured local session boundary could not be represented as an exact 15m clock window; no DST approximation is used.",
      };
    return {
      window: {
        date,
        startAt,
        endAt,
        label:
          family === "london-breakout"
            ? "00:00–03:00 London range"
            : "09:30–10:30 Initial Balance",
      },
    };
  } catch {
    return {
      missing:
        "The configured session timezone is not available for an explicit local clock conversion.",
    };
  }
}

/**
 * Resolves exactly the declared 15m interval. It intentionally has no hourly/4h fallback and
 * rejects an off-grid, missing, malformed, forming, or conflicting member of that interval.
 */
function resolveExactRange(
  input: SetupInput,
  family: RangeFamily,
  config: RangeConfig,
  asOf: number,
): RangeResolution {
  const clock = windowFor(family, config.timezone, asOf);
  if (!clock.window)
    return { missing: [clock.missing || "Session clock is unavailable."] };
  const { window } = clock;
  const feed = input.sessionRangeFeed;
  const intervalDescription = `${window.label} on ${window.date} (${config.timezone})`;

  if (asOf < window.endAt)
    return {
      window,
      missing: [
        `${intervalDescription} is still forming; no current-date range is asserted before its exact end.`,
      ],
    };
  if (!feed)
    return {
      window,
      missing: [
        `No exact 15m session range feed was supplied for ${intervalDescription}; hourly/4h bars are never subdivided or inferred.`,
      ],
    };
  if (feed.timeframe !== "15m")
    return {
      window,
      missing: [
        `The supplied session range feed is ${feed.timeframe}, not exact 15m for ${intervalDescription}; it is not resampled.`,
      ],
    };
  if (
    (feed.sourceIdentity || feed.source) !==
    (input.sourceIdentity || input.source)
  )
    return {
      window,
      missing: [
        `The supplied session range feed identity ${feed.sourceIdentity || feed.source} does not exactly equal execution basis ${input.sourceIdentity || input.source}; sources are not mixed.`,
      ],
    };

  const expectedTimes: number[] = [];
  for (let time = window.startAt; time < window.endAt; time += FIFTEEN_MINUTES)
    expectedTimes.push(time);
  const expected = new Set(expectedTimes);
  const members = new Map<number, Candle>();
  for (const raw of feed.candles || []) {
    if (raw.time < window.startAt || raw.time >= window.endAt) continue;
    if (!expected.has(raw.time))
      return {
        window,
        missing: [
          `The 15m feed has an off-grid candle inside ${intervalDescription}; the exact range must contain only contiguous declared 15m periods.`,
        ],
      };
    if (!validCandle(raw) || raw.time + FIFTEEN_MINUTES > asOf)
      return {
        window,
        missing: [
          `A required 15m candle in ${intervalDescription} is malformed, forming, or future; no partial range is promoted.`,
        ],
      };
    const prior = members.get(raw.time);
    if (prior && !sameCandle(prior, raw))
      return {
        window,
        missing: [
          `Conflicting duplicate 15m candles exist in ${intervalDescription}; no range is selected.`,
        ],
      };
    if (!prior) members.set(raw.time, raw);
  }

  const bars: Candle[] = [];
  for (const time of expectedTimes) {
    const bar = members.get(time);
    if (!bar)
      return {
        window,
        missing: [
          `The exact 15m feed for ${intervalDescription} is missing a required boundary or contiguous period; no range is inferred.`,
        ],
      };
    bars.push(bar);
  }
  const high = Math.max(...bars.map((bar) => bar.high));
  const low = Math.min(...bars.map((bar) => bar.low));
  if (!(high > low))
    return {
      window,
      missing: [
        `${intervalDescription} has no positive completed range height; risk geometry remains unknown.`,
      ],
    };

  return {
    window,
    range: {
      high,
      low,
      midpoint: (high + low) / 2,
      startAt: window.startAt,
      endAt: window.endAt,
      source: feed.source,
      basis: "complete-15m-window",
    },
    missing: [],
  };
}

function currentDate(time: number, timezone: RangeConfig["timezone"]) {
  try {
    return sessionClockParts(time, timezone).date;
  } catch {
    return undefined;
  }
}

function clockText(
  time: number | undefined,
  timezone: RangeConfig["timezone"],
) {
  if (time === undefined) return "unavailable";
  try {
    const parts = sessionClockParts(time, timezone);
    return `${parts.date} ${String(Math.floor(parts.minute / 60)).padStart(2, "0")}:${String(parts.minute % 60).padStart(2, "0")} ${timezone}`;
  } catch {
    return "unavailable";
  }
}

function decisionIsFresh(
  decision: Candle | undefined,
  execution: NormalizedBars,
  duration: number,
  asOf: number,
) {
  if (
    !decision ||
    decision.time + duration > asOf ||
    execution.duplicateConflict
  )
    return false;
  if (execution.latestRawTime !== decision.time) return false;
  return (
    execution.latestProblemTime === undefined ||
    execution.latestProblemTime < decision.time
  );
}

/** A decision after the range cannot bridge absent or rejected execution periods. */
function contiguousFromRangeEnd(
  execution: NormalizedBars,
  range: SessionRange | undefined,
  decision: Candle | undefined,
  duration: number,
) {
  if (!range || !decision || decision.time < range.endAt) return false;
  const byTime = new Map(execution.bars.map((bar) => [bar.time, bar]));
  for (let time = range.endAt; time <= decision.time; time += duration)
    if (!byTime.has(time)) return false;
  return true;
}

function inConfiguredWindow(
  family: RangeFamily,
  config: RangeConfig,
  decision: Candle | undefined,
  today: string | undefined,
) {
  if (
    !decision ||
    !today ||
    currentDate(decision.time, config.timezone) !== today
  )
    return false;
  if (!sessionEntryWindowOpen(config, decision.time)) return false;
  if (family === "london-breakout") return true;
  // The configuration helper's nominal IB window starts at 09:30, but the range is still forming
  // until 10:30. A decision candle's open, rather than close, controls this restriction.
  try {
    return (
      sessionClockParts(decision.time, config.timezone).minute >= 10 * 60 + 30
    );
  } catch {
    return false;
  }
}

function clockStatus(
  family: RangeFamily,
  config: RangeConfig,
  decision: Candle | undefined,
  fresh: boolean,
  today: string | undefined,
): SetupStep["status"] {
  if (
    !decision ||
    !fresh ||
    !today ||
    currentDate(decision.time, config.timezone) !== today
  )
    return "unknown";
  try {
    const minute = sessionClockParts(decision.time, config.timezone).minute;
    if (family === "london-breakout") return minute >= 180 ? "met" : "waiting";
    if (minute < 630) return "waiting";
    return sessionEntryWindowOpen(config, decision.time) ? "met" : "failed";
  } catch {
    return "unknown";
  }
}

function rangeZone(
  range: SessionRange,
  strategy: Strategy,
  side: Direction,
  family: RangeFamily,
): SetupZone {
  return {
    // The id deliberately does not include side: this is one neutral shared range for renderers to
    // de-duplicate while both directional candidates retain the same context.
    id: `session-range-${strategy.id}-${range.startAt}`,
    kind: "session-range",
    side,
    startTime: range.startAt,
    endTime: range.endAt,
    low: range.low,
    high: range.high,
    ce: range.midpoint,
    label:
      family === "london-breakout"
        ? "00:00–03:00 session range (neutral)"
        : "09:30–10:30 Initial Balance (neutral)",
    source: `Closed ${range.basis} · ${range.source}`,
    strategyId: strategy.id,
  };
}

function londonGeometry(
  config: LondonConfig,
  range: SessionRange,
  side: Direction,
  entry: number,
): Geometry | undefined {
  const stop =
    side === "long"
      ? config.stopMode === "midpoint"
        ? range.midpoint
        : range.low
      : config.stopMode === "midpoint"
        ? range.midpoint
        : range.high;
  const risk = Math.abs(entry - stop);
  if (
    !Number.isFinite(risk) ||
    risk <= 0 ||
    (side === "long" && stop >= entry) ||
    (side === "short" && stop <= entry)
  )
    return undefined;
  const target =
    config.targetMode === "range-height-from-entry"
      ? side === "long"
        ? entry + (range.high - range.low)
        : entry - (range.high - range.low)
      : side === "long"
        ? entry + risk * (config.targetMode === "1.5r" ? 1.5 : 2)
        : entry - risk * (config.targetMode === "1.5r" ? 1.5 : 2);
  if (
    !Number.isFinite(target) ||
    (side === "long" && target <= entry) ||
    (side === "short" && target >= entry)
  )
    return undefined;
  return {
    entry,
    stop,
    target,
    evidence: `Closed 15m entry ${show(entry)}; ${config.stopMode === "midpoint" ? "range midpoint" : "opposite range boundary"} stop ${show(stop)}; ${config.targetMode} target ${show(target)} are derived only from the completed range and actual closed price, without a quote substitution.`,
  };
}

function ibGeometry(
  config: IbConfig,
  range: SessionRange,
  side: Direction,
  entry: number,
): Geometry | undefined {
  let stop: number;
  if (config.stopMode === "midpoint") {
    stop = range.midpoint;
  } else {
    if (
      !config.priceTick ||
      !Number.isFinite(config.priceTick) ||
      config.priceTick <= 0
    )
      return undefined;
    stop =
      side === "long"
        ? range.high - config.insideBoundaryTicks * config.priceTick
        : range.low + config.insideBoundaryTicks * config.priceTick;
  }
  // This target is deliberately anchored to the broken range edge, never the entry close.
  const height = range.high - range.low;
  const target = side === "long" ? range.high + height : range.low - height;
  if (
    !Number.isFinite(stop) ||
    !Number.isFinite(target) ||
    (side === "long" && (stop >= entry || target <= entry)) ||
    (side === "short" && (stop <= entry || target >= entry))
  )
    return undefined;
  return {
    entry,
    stop,
    target,
    evidence: `Closed ${config.executionTimeframe} entry ${show(entry)}; ${config.stopMode === "midpoint" ? `range midpoint stop ${show(stop)}` : `${config.insideBoundaryTicks} configured true-price tick(s) inside the broken edge, stop ${show(stop)}`}; target ${show(target)} is exactly one completed range height beyond the broken boundary, not an entry-based projection.`,
  };
}

function ibVolumeCheck(
  execution: NormalizedBars,
  decision: Candle | undefined,
  duration: number,
  config: IbConfig,
  volumeBasis: VolumeBasis,
): VolumeCheck {
  const label =
    volumeBasis === "broker-reported"
      ? "broker-reported proxy (unverified volume type)"
      : "venue volume";
  if (!sessionVolumeAllowed(config, volumeBasis))
    return {
      known: "failed",
      high: "unknown",
      knownEvidence:
        volumeBasis === "broker-reported"
          ? "Execution reports a broker-reported proxy (unverified volume type), but configuration did not explicitly opt into broker-reported-proxy."
          : "Execution volume basis is unknown. Positive numeric provider/broker volume is not treated as verified venue volume.",
      highEvidence:
        volumeBasis === "broker-reported"
          ? "High-volume qualification is unavailable until the broker-reported proxy (unverified volume type) is explicitly opted in."
          : "High-volume qualification is unavailable until the execution volume basis is explicitly venue.",
      label,
    };
  if (!decision)
    return {
      known: "unknown",
      high: "unknown",
      knownEvidence:
        `No completed latest execution candle supplies ${label} evidence.`,
      highEvidence:
        "A completed latest candle and 20 prior contiguous same-frame candles are required.",
      label,
    };
  if (!Number.isFinite(decision.volume) || decision.volume <= 0)
    return {
      known: "failed",
      high: "unknown",
      knownEvidence: `The latest completed candle has zero, missing, or malformed ${label}.`,
      highEvidence: "Zero, missing, or malformed current volume cannot qualify as high volume.",
      label,
    };

  const byTime = new Map(execution.bars.map((bar) => [bar.time, bar]));
  const prior: Candle[] = [];
  for (let index = PRIOR_VOLUME_BARS; index >= 1; index -= 1) {
    const bar = byTime.get(decision.time - index * duration);
    if (!bar)
      return {
        known: "met",
        high: "unknown",
        knownEvidence: `Latest completed ${duration / 60}m candle reports explicit ${label} ${show(decision.volume)}.`,
        highEvidence: `Need exactly ${PRIOR_VOLUME_BARS} contiguous completed prior ${duration / 60}m candles; a gap means no baseline is manufactured.`,
        label,
      };
    prior.push(bar);
  }
  if (prior.some((bar) => !Number.isFinite(bar.volume) || bar.volume <= 0))
    return {
        known: "met",
        high: "unknown",
        knownEvidence: `Latest completed ${duration / 60}m candle reports explicit ${label} ${show(decision.volume)}.`,
        highEvidence:
          `The prior-only 20-candle ${label} baseline contains zero or invalid volume, so no ratio is manufactured.`,
        label,
      };
  const baseline =
    prior.reduce((total, bar) => total + bar.volume, 0) / prior.length;
  if (!Number.isFinite(baseline) || baseline <= 0)
    return {
        known: "met",
        high: "unknown",
        knownEvidence: `Latest completed ${duration / 60}m candle reports explicit ${label} ${show(decision.volume)}.`,
        highEvidence:
          `The prior-only ${label} baseline is not positive and finite.`,
        label,
      };
  // Caller adds the configured multiplier to this deterministic baseline result.
  return {
      known: "met",
      high: "waiting",
      knownEvidence: `Latest completed ${duration / 60}m candle reports explicit ${label} ${show(decision.volume)}.`,
      highEvidence: `Prior-only contiguous ${PRIOR_VOLUME_BARS}-bar ${label} baseline is ${show(baseline)}; the latest candle is excluded from that baseline.`,
      label,
  };
}

function highVolumeStatus(
  check: VolumeCheck,
  execution: NormalizedBars,
  decision: Candle | undefined,
  duration: number,
  multiplier: number,
): Pick<VolumeCheck, "high" | "highEvidence"> {
  if (check.high !== "waiting" || !decision)
    return { high: check.high, highEvidence: check.highEvidence };
  const byTime = new Map(execution.bars.map((bar) => [bar.time, bar]));
  const prior = Array.from({ length: PRIOR_VOLUME_BARS }, (_, offset) =>
    byTime.get(decision.time - (offset + 1) * duration),
  ) as Candle[];
  const baseline =
    prior.reduce((total, bar) => total + bar.volume, 0) / prior.length;
  const high = decision.volume >= baseline * multiplier;
  return {
    high: high ? "met" : "waiting",
    highEvidence: `Latest ${check.label} ${show(decision.volume)} is ${high ? "at least" : "below"} ${show(multiplier)}× prior-only contiguous 20-bar baseline ${show(baseline)}; latest volume is excluded from the baseline.`,
  };
}

/**
 * Detects only the owner-configured London Breakout and Initial Balance families. This is causal
 * paper-app setup evidence: it validates current source candles and does not offer performance,
 * historical-rate, prior-inside-bar, or higher-timeframe-volume assertions.
 */
export function detectSessionRangeStrategy(
  input: SetupInput,
  strategy: Strategy,
): SessionDetectorResult {
  const asOf = asSeconds(input.now);
  const { family, config, valid: configValid } = resolveConfig(strategy);
  const duration =
    config.executionTimeframe === "30m" ? THIRTY_MINUTES : FIFTEEN_MINUTES;
  const execution = normalizeBars(input.candles, duration, asOf);
  const decision = execution.bars.at(-1);
  const rangeResolution = resolveExactRange(input, family, config, asOf);
  const range = rangeResolution.range;
  const today = Number.isFinite(asOf)
    ? currentDate(asOf, config.timezone)
    : undefined;
  const fresh = decisionIsFresh(decision, execution, duration, asOf);
  const contiguous = contiguousFromRangeEnd(
    execution,
    range,
    decision,
    duration,
  );
  const frameOk = input.timeframe === config.executionTimeframe;
  const clockOpen = inConfiguredWindow(family, config, decision, today);
  const clock = clockStatus(family, config, decision, fresh, today);
  const currentDecision = Boolean(
    fresh && contiguous && frameOk && clockOpen && decision,
  );
  const configuredVolumeBasis =
    input.volumeBasis ?? input.sessionRangeFeed?.volumeBasis ?? "unknown";
  const configMarketMatches =
    !config.instrumentMarket || config.instrumentMarket === input.market.id;
  const context = {
    strategyId: strategy.id,
    family,
    timezone: config.timezone,
    config: config as SessionStrategyConfig,
    ...(range ? { range } : {}),
    volumeBasis: configuredVolumeBasis,
    missing: [...rangeResolution.missing],
  };
  const candidates: SetupCandidate[] = [];

  for (const side of ["long", "short"] as const) {
    const breakout = Boolean(
      range &&
      currentDecision &&
      (side === "long"
        ? decision!.close > range.high
        : decision!.close < range.low),
    );
    const breakoutStatus: SetupStep["status"] = !range
      ? "unknown"
      : !frameOk ||
          !fresh ||
          !contiguous ||
          !decision ||
          !today ||
          currentDate(decision.time, config.timezone) !== today
        ? "unknown"
        : breakout
          ? "met"
          : "waiting";
    const volume =
      family === "initial-balance"
        ? ibVolumeCheck(
            execution,
            decision,
            duration,
            config as IbConfig,
            configuredVolumeBasis,
          )
        : undefined;
    const volumeHigh =
      family === "initial-balance" && volume
        ? highVolumeStatus(
            volume,
            execution,
            decision,
            duration,
            (config as IbConfig).volumeMultiplier,
          )
        : undefined;
    const geometry =
      breakout && range && decision
        ? family === "london-breakout"
          ? londonGeometry(config as LondonConfig, range, side, decision.close)
          : ibGeometry(config as IbConfig, range, side, decision.close)
        : undefined;
    const riskStatus: SetupStep["status"] = geometry
      ? "met"
      : breakout
        ? "failed"
        : breakoutStatus === "unknown"
          ? "unknown"
          : "waiting";
    const configStatus: SetupStep["status"] =
      configValid && config.confirmed && configMarketMatches ? "met" : "failed";
    const rangeEvidence = range
      ? `${range.basis} from exact 15m source ${range.source}: high ${show(range.high)}, low ${show(range.low)}, midpoint ${show(range.midpoint)} for current local date ${today ?? "unavailable"}.`
      : rangeResolution.missing.join(" ");
    const breakoutEvidence =
      breakout && range && decision
        ? `Latest completed ${config.executionTimeframe} candle opened ${clockText(decision.time, config.timezone)} and closed ${show(decision.close)}, strictly ${side === "long" ? "above" : "below"} range ${side === "long" ? "high" : "low"} ${show(side === "long" ? range.high : range.low)}.`
        : !decision || !fresh
          ? "No fresh latest completed execution candle is available; forming, future, malformed, or conflicting latest data cannot trigger a setup."
          : !contiguous
            ? "A required execution period from the completed range end through the latest decision is missing, malformed, forming, future, or conflicting; no breakout is bridged across a data gap."
            : !frameOk
              ? `Input execution timeframe ${input.timeframe} is not configured ${config.executionTimeframe}; range context may be displayed but no breakout is inferred from another frame.`
              : !clockOpen
                ? `Latest completed decision candle at ${clockText(decision.time, config.timezone)} is outside the configured current-date entry clock.`
                : "Latest completed execution close is not strictly outside the completed range boundary.";

    const steps: SetupStep[] = [
      step(
        "session-config",
        "Owner-confirmed strict session configuration",
        configStatus,
        configValid
          ? !configMarketMatches
            ? `Autofilled instrument market ${config.instrumentMarket} does not match selected market ${input.market.id}; configuration must be reconfirmed for this instrument.`
            : config.confirmed
              ? `Strict version ${config.version} ${family} configuration is owner-confirmed with ${config.timezone} as the explicit fixed/DST clock.`
            : "Configuration is structurally valid but owner confirmation is false; default/proposed settings are not approval."
          : "Configuration is missing, malformed, mismatched, or contains unrecognized fields; conservative default context remains unconfirmed.",
      ),
      step(
        "session-frame",
        `Actual ${config.executionTimeframe} execution timeframe`,
        frameOk ? "met" : "failed",
        frameOk
          ? `Input execution timeframe is exactly configured ${config.executionTimeframe}.`
          : `Input execution timeframe ${input.timeframe} does not equal configured ${config.executionTimeframe}; no display-frame resampling is used.`,
      ),
      step(
        "session-clock",
        family === "london-breakout"
          ? "Current-date execution after 03:00 declared session clock"
          : `Decision candle opens 10:30 through configured ${String(Math.floor((config as IbConfig).entryEndMinute / 60)).padStart(2, "0")}:${String((config as IbConfig).entryEndMinute % 60).padStart(2, "0")} session clock`,
        clock,
        !decision || !fresh
          ? "A fresh latest fully completed decision candle is required; no older completed signal is reused when a newer candle is forming, future, malformed, or conflicting."
          : family === "london-breakout"
            ? `Latest decision opens ${clockText(decision.time, config.timezone)}; London execution is allowed after 03:00 only on the same current local date, with no additional hard cutoff invented.`
            : `Latest decision opens ${clockText(decision.time, config.timezone)}; Initial Balance decisions must open at or after 10:30 and before the configured entry end.`,
      ),
      step(
        "session-range",
        family === "london-breakout"
          ? "Exact completed 00:00–03:00 15m range"
          : "Exact completed 09:30–10:30 15m Initial Balance",
        range ? "met" : "unknown",
        rangeEvidence || "Exact current-date session range is unavailable.",
      ),
      step(
        "session-breakout",
        `${side === "long" ? "Upside" : "Downside"} latest closed breakout`,
        breakoutStatus,
        breakoutEvidence,
      ),
      ...(family === "initial-balance" && volume && volumeHigh
        ? [
            step(
              "session-known-volume",
              volume.label === "broker-reported proxy (unverified volume type)"
                ? "Explicit broker-reported proxy volume basis"
                : "Explicit venue-volume basis",
              volume.known,
              volume.knownEvidence,
            ),
            step(
              "session-high-volume",
              volume.label === "broker-reported proxy (unverified volume type)"
                ? "High broker-reported proxy volume versus prior 20 completed same-frame bars"
                : "High venue volume versus prior 20 completed same-frame bars",
              volumeHigh.high,
              volumeHigh.highEvidence,
            ),
          ]
        : []),
      step(
        "session-risk",
        family === "london-breakout"
          ? "Closed-price range stop and target geometry"
          : "Range-edge target and configured stop geometry",
        riskStatus,
        geometry
          ? geometry.evidence
          : breakout
            ? family === "initial-balance" &&
              (config as IbConfig).stopMode === "inside-boundary" &&
              !(config as IbConfig).priceTick
              ? "Inside-boundary risk requires an explicit finite configured true priceTick; none is supplied."
              : "Closed breakout geometry is invalid: stop must be beyond entry in the loss direction and target must remain ahead of entry/current price."
            : "Risk geometry is evaluated only from a fresh latest closed breakout and a completed exact range.",
      ),
    ];

    const ready = SESSION_CRITICAL_IDS[family].every((id) =>
      steps.some((item) => item.id === id && item.status === "met"),
    );
    candidates.push({
      id: `session-${family}-${strategy.id}-${side}-${decision?.time || range?.endAt || rangeResolution.window?.endAt || 0}`,
      family,
      side,
      strategyId: strategy.id,
      strategyVersion: strategy.version,
      name: strategy.name,
      ready,
      steps,
      zones: range ? [rangeZone(range, strategy, side, family)] : [],
      ...(ready && geometry
        ? {
            entry: geometry.entry,
            stop: geometry.stop,
            target: geometry.target,
          }
        : {}),
      source: input.source,
    });
  }

  return { candidates, context };
}
