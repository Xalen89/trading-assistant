import type { Candle, Quote, Strategy } from "./model";
import { resolvePreviousProviderDay } from "./previous-provider-day";
import {
  PIVOT_DEFAULT_CONFIG,
  pivotConfigSchema,
  SESSION_CRITICAL_IDS,
  sessionVolumeAllowed,
  sessionClockParts,
  sessionInstant,
  type PivotConfig,
  type SessionDetectorResult,
} from "./session-strategy-model";
import type {
  Direction,
  SetupCandidate,
  SetupInput,
  SetupStep,
} from "./setup-model";

const ONE_MINUTE = 60;
const FIVE_MINUTES = 300;
const FIFTEEN_MINUTES = 900;
const ONE_HOUR = 3_600;
const ONE_DAY = 86_400;
const OPEN_MINUTE = 9 * 60 + 30;
const ENTRY_END_MINUTE = 10 * 60;
const MAX_QUOTE_AGE_SECONDS = 30;
const MAX_QUOTE_PAIR_SECONDS = 90;
const MAX_DECLARED_PDC_AGE_DAYS = 7;

type Status = SetupStep["status"];
type Resolution<T> = {
  value?: T;
  status: Status;
  evidence: string;
  missing: string[];
};
type QuoteProof = {
  observation?: SetupInput["quoteObservations"];
  observedAt?: number;
  entry?: number;
  status: Status;
  evidence: string;
  missing: string[];
};
type Pdc = {
  price: number;
  closeAt: number;
  source: string;
  sourceIdentity?: string;
  basis: PivotConfig["pdcBasis"];
  previousDaily?: Candle;
};
type Morning = {
  low: number;
  high: number;
  from: number;
  through: number;
  source: string;
};
type VolumeBasis = "venue" | "broker-reported" | "unknown";
type VolumePair = {
  current: Candle;
  previous: Candle;
  duration: number;
  basis: Exclude<VolumeBasis, "unknown">;
};
type PremarketRange = {
  high: number;
  low: number;
  startAt: number;
  endAt: number;
  source: string;
};

const step = (
  id: string,
  name: string,
  status: Status,
  evidence: string,
): SetupStep => ({ id, name, status, evidence });

const show = (value: number | undefined) =>
  value === undefined || !Number.isFinite(value)
    ? "unavailable"
    : Number(value.toFixed(8)).toString();

const bufferedPrice = (price: number, tick: number, direction: 1 | -1) =>
  Number((price + direction * tick).toFixed(10));

const asSeconds = (value: number) =>
  Number.isFinite(value)
    ? value > 10_000_000_000
      ? value / 1_000
      : value
    : NaN;

const validEpochSeconds = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value > 0 &&
  value < 10_000_000_000;

const validOhlc = (bar: Candle) =>
  validEpochSeconds(bar.time) &&
  Number.isInteger(bar.time) &&
  Number.isFinite(bar.open) &&
  Number.isFinite(bar.high) &&
  Number.isFinite(bar.low) &&
  Number.isFinite(bar.close) &&
  bar.open > 0 &&
  bar.high > 0 &&
  bar.low > 0 &&
  bar.close > 0 &&
  bar.high >= bar.low &&
  bar.high >= Math.max(bar.open, bar.close) &&
  bar.low <= Math.min(bar.open, bar.close);

const sameCandle = (a: Candle, b: Candle) =>
  a.time === b.time &&
  a.open === b.open &&
  a.high === b.high &&
  a.low === b.low &&
  a.close === b.close &&
  a.volume === b.volume;

const isPositiveFinite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

function exactClosedBar(
  raw: Candle[] | undefined,
  startAt: number,
  duration: number,
  observedAt: number,
): Resolution<Candle> {
  const atTime = (raw || []).filter((bar) => bar?.time === startAt);
  if (!atTime.length)
    return {
      status: "unknown",
      evidence: `The actual bar beginning ${new Date(startAt * 1_000).toISOString()} is absent; no neighbouring bar is substituted.`,
      missing: ["Required exact source bar is absent."],
    };
  if (atTime.some((bar) => !validOhlc(bar)))
    return {
      status: "unknown",
      evidence: `The exact source bar beginning ${new Date(startAt * 1_000).toISOString()} is malformed.`,
      missing: ["Required exact source bar is malformed."],
    };
  if (startAt + duration > observedAt)
    return {
      status: "unknown",
      evidence: `The exact source bar beginning ${new Date(startAt * 1_000).toISOString()} is still forming at the observed quote.`,
      missing: ["Required exact source bar is still forming."],
    };
  const first = atTime[0];
  if (atTime.some((bar) => !sameCandle(bar, first)))
    return {
      status: "unknown",
      evidence: `Conflicting duplicate source bars exist at ${new Date(startAt * 1_000).toISOString()}.`,
      missing: ["Required exact source bar has conflicting duplicates."],
    };
  return {
    value: first,
    status: "met",
    evidence: "Exact closed source bar is available.",
    missing: [],
  };
}

function quoteProof(input: SetupInput, asOf: number): QuoteProof {
  const observation = input.quoteObservations;
  if (!observation)
    return {
      status: "waiting",
      evidence:
        "No timestamped quote-observation pair is supplied; a candle close is never substituted for a quote cross.",
      missing: [
        "A persisted previous/current quote-observation pair is required.",
      ],
    };

  const { previous, current, observedAt } = observation;
  if (observation.method !== "owner-persisted-rest-observations")
    return {
      observation,
      status: "failed",
      evidence: "Quote evidence uses an unsupported observation method.",
      missing: [
        "Quote observations must be owner-persisted REST observations.",
      ],
    };
  if (!validEpochSeconds(observedAt) || observedAt > asOf)
    return {
      observation,
      status: "failed",
      evidence:
        "observedAt must be an epoch-seconds observation time no later than the detector clock; future/millisecond observations are rejected.",
      missing: ["Quote observation time is invalid or future-dated."],
    };
  if (
    !current ||
    !validEpochSeconds(current.timestamp) ||
    current.timestamp > observedAt ||
    current.timestamp > asOf
  )
    return {
      observation,
      status: "failed",
      evidence:
        "The current quote timestamp is invalid, in milliseconds, or future-dated.",
      missing: ["Current quote has no valid causal epoch-seconds timestamp."],
    };
  if (
    current.status !== "live" ||
    !isPositiveFinite(current.price) ||
    asOf - current.timestamp > MAX_QUOTE_AGE_SECONDS ||
    observedAt - current.timestamp > MAX_QUOTE_AGE_SECONDS ||
    asOf - observedAt > MAX_QUOTE_AGE_SECONDS
  )
    return {
      observation,
      observedAt,
      status: "failed",
      evidence:
        "The current quote is unavailable, stale, non-positive, or was not observed within the 30-second freshness limit.",
      missing: ["A live current quote fresh within 30 seconds is required."],
    };

  const expectedSymbol = input.market.id;
  // An opaque identity is a strict equality boundary. Human provenance labels
  // are accepted only by legacy fixtures that declare no identity at all.
  const sourceMatches =
    current.symbol === expectedSymbol &&
    (input.sourceIdentity !== undefined
      ? current.sourceIdentity === input.sourceIdentity
      : current.sourceIdentity === undefined &&
        current.source === input.source);
  if (!sourceMatches)
    return {
      observation,
      observedAt,
      status: "failed",
      evidence:
        "The current quote source/basis and canonical market identity do not match the selected primary provider.",
      missing: [
        "Current quote source/symbol does not match the selected market feed.",
      ],
    };

  const entry =
    isPositiveFinite(current.bid) &&
    isPositiveFinite(current.ask) &&
    current.ask >= current.bid
      ? (current.bid + current.ask) / 2
      : current.price;
  if (!previous)
    return {
      observation,
      observedAt,
      entry,
      status: "waiting",
      evidence:
        "This is the first valid quote observation. No prior quote is fabricated, so no cross is asserted.",
      missing: [
        "A prior same-source/symbol quote observation is required to prove the cross.",
      ],
    };
  if (
    !validEpochSeconds(previous.timestamp) ||
    previous.timestamp > current.timestamp ||
    previous.timestamp > observedAt ||
    previous.timestamp > asOf ||
    !isPositiveFinite(previous.price) ||
    previous.status !== "live"
  )
    return {
      observation,
      observedAt,
      entry,
      status: "failed",
      evidence:
        "The prior quote has invalid/non-monotonic time or price, is not live, or is future-dated.",
      missing: ["Prior quote is not a valid causal live observation."],
    };
  if (
    previous.timestamp === current.timestamp ||
    current.timestamp - previous.timestamp > MAX_QUOTE_PAIR_SECONDS
  )
    return {
      observation,
      observedAt,
      entry,
      status: "failed",
      evidence:
        "The quote pair must have strictly increasing timestamps no more than 90 seconds apart.",
      missing: ["Quote pair timing is non-monotonic or exceeds 90 seconds."],
    };
  const pairSourceMatches =
    previous.symbol === current.symbol &&
    (current.sourceIdentity !== undefined ||
    previous.sourceIdentity !== undefined
      ? current.sourceIdentity !== undefined &&
        current.sourceIdentity === previous.sourceIdentity
      : previous.source === current.source);
  if (!pairSourceMatches)
    return {
      observation,
      observedAt,
      entry,
      status: "failed",
      evidence:
        "Previous and current quotes are not from the same source and symbol.",
      missing: ["Quote pair source/symbol mismatch."],
    };
  return {
    observation,
    observedAt,
    entry,
    status: "met",
    evidence: `Two live same-source/symbol observations are causal and fresh: ${previous.timestamp} → ${current.timestamp} seconds.`,
    missing: [],
  };
}

function sessionTimes(at: number, config: PivotConfig) {
  const local = sessionClockParts(at, config.timezone);
  const openingAt = sessionInstant(local.date, OPEN_MINUTE, config.timezone);
  const endAt = sessionInstant(local.date, ENTRY_END_MINUTE, config.timezone);
  return { local, openingAt, endAt };
}

function pdcFromUtcDaily(
  input: SetupInput,
  config: PivotConfig,
  sessionStart: number | undefined,
  asOf: number,
): Resolution<Pdc> {
  const identityDeclared =
    input.sourceIdentity !== undefined ||
    input.dailySourceIdentity !== undefined;
  const sameSource = identityDeclared
    ? Boolean(
        input.sourceIdentity &&
        input.dailySourceIdentity &&
        input.sourceIdentity === input.dailySourceIdentity,
      )
    : input.source === input.dailySource;
  if (!sameSource)
    return {
      status: "failed",
      evidence:
        "PDC daily prices do not match the selected execution/quote provider. Personal targets cannot bypass source integrity.",
      missing: ["Same-source daily PDC evidence is required."],
    };
  const expectedBasis =
    config.pdcBasis === "provider-utc-day"
      ? "utc-continuous-24h"
      : "utc-provider-trading-days";
  if (input.dailyPeriodBasis !== expectedBasis)
    return {
      status: "failed",
      evidence:
        config.pdcBasis === "provider-utc-day"
          ? "provider-utc-day was selected, but dailyPeriodBasis is not explicitly utc-continuous-24h. Unknown stock/broker session semantics are never called a US close."
          : "provider-utc-trading-day was selected, but dailyPeriodBasis is not explicitly utc-provider-trading-days. Provider rows are never relabelled as an exchange trading-calendar or RTH close.",
      missing: [`Daily period basis is not declared ${expectedBasis}.`],
    };
  if (!sessionStart)
    return {
      status: "unknown",
      evidence:
        "The selected local 09:30 instant cannot be represented, so the causal UTC-day cutoff is unknown.",
      missing: ["Session opening clock is unavailable."],
    };
  const source = input.dailySource || "Daily source unavailable";
  const sourceIdentity = input.dailySourceIdentity;
  // Before the configured source-clock 09:30 opening, the observed detector time is the
  // stricter cutoff; afterward, the daily selection remains pinned to that source clock.
  const cutoff = Math.min(sessionStart, asOf);
  const resolved = resolvePreviousProviderDay({
    candles: input.daily || [],
    basis: input.dailyPeriodBasis,
    cutoff,
    source,
  });
  if (!resolved.bar || !resolved.closeAt)
    return {
      status: "unknown",
      evidence:
        resolved.reason || "No causal actual provider daily row is available.",
      missing: ["No valid causal previous provider-day OHLC row is available."],
    };
  const ageDays =
    (Math.floor(cutoff / ONE_DAY) * ONE_DAY - resolved.bar.time) / ONE_DAY;
  const ageLabel =
    config.pdcBasis === "provider-utc-trading-day"
      ? ` The last observed completed UTC provider day is ${ageDays} day${ageDays === 1 ? "" : "s"} before the actual current UTC provider-day anchor; this is not an exchange trading-calendar/RTH claim.`
      : " It is not represented as a guaranteed exchange RTH close.";
  return {
    value: {
      price: resolved.bar.close,
      closeAt: resolved.closeAt,
      source,
      sourceIdentity,
      basis: config.pdcBasis,
      previousDaily: resolved.bar,
    },
    status: "met",
    evidence: `PDC is the close ${show(resolved.bar.close)} of the actual provider UTC daily period ending ${new Date(resolved.closeAt * 1_000).toISOString()}.${ageLabel}`,
    missing: [],
  };
}

function pdcFromDeclaredHourly(
  input: SetupInput,
  config: PivotConfig,
  localDate: string,
  asOf: number,
): Resolution<Pdc> {
  if (input.hourlySource !== input.source)
    return {
      status: "failed",
      evidence:
        "Declared session-close bars do not match the selected execution/quote provider.",
      missing: ["Same-source hourly PDC evidence is required."],
    };
  const closeMinute = config.sessionCloseMinute;
  if (closeMinute === undefined)
    return {
      status: "failed",
      evidence:
        "declared-session-close was selected without an owner-declared sessionCloseMinute.",
      missing: ["Owner must declare the session-close minute."],
    };
  if (closeMinute % 60 !== 0)
    return {
      status: "failed",
      evidence:
        "The owner-declared close is not an exact hourly boundary; no hourly bar is shifted or subdivided to manufacture it.",
      missing: [
        "Declared session close must land exactly on an hourly boundary.",
      ],
    };
  const [year, month, day] = localDate.split("-").map(Number);
  for (let age = 1; age <= MAX_DECLARED_PDC_AGE_DAYS; age += 1) {
    const date = new Date(Date.UTC(year, month - 1, day - age));
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
    const closeAt = sessionInstant(key, closeMinute, config.timezone);
    if (!closeAt) continue;
    const startAt = closeAt - ONE_HOUR;
    const raw = (input.hourly || []).filter((bar) => bar?.time === startAt);
    if (!raw.length) continue;
    const exact = exactClosedBar(input.hourly, startAt, ONE_HOUR, asOf);
    if (!exact.value)
      return {
        status: exact.status,
        evidence: `The most recent observed exact declared-close hourly bar cannot be used. ${exact.evidence}`,
        missing: exact.missing,
      };
    return {
      value: {
        price: exact.value.close,
        closeAt,
        source: input.hourlySource || "Hourly source unavailable",
        basis: config.pdcBasis,
      },
      status: "met",
      evidence: `PDC is the close ${show(exact.value.close)} of the exact completed hourly bar ending at the owner-declared clock ${new Date(closeAt * 1_000).toISOString()}. It is the most recent observed declared close, not a guaranteed exchange RTH close.`,
      missing: [],
    };
  }
  return {
    status: "unknown",
    evidence:
      "No exact completed hourly bar ending at the owner-declared close was observed on a prior local date within seven days; calendar/settlement values are not fabricated.",
    missing: ["No observed declared-session close within seven days."],
  };
}

function resolvePdc(
  input: SetupInput,
  config: PivotConfig,
  localDate: string,
  sessionStart: number | undefined,
  asOf: number,
): Resolution<Pdc> {
  if (config.pdcBasis === "unselected")
    return {
      status: "failed",
      evidence:
        "No PDC basis is selected. A previous close is not inferred from stock, broker, weekday, settlement, or display data.",
      missing: ["Owner must select an explicit PDC basis."],
    };
  return config.pdcBasis === "provider-utc-day" ||
    config.pdcBasis === "provider-utc-trading-day"
    ? pdcFromUtcDaily(input, config, sessionStart, asOf)
    : pdcFromDeclaredHourly(input, config, localDate, asOf);
}

function resolveOpening(
  input: SetupInput,
  openingAt: number | undefined,
  observedAt: number | undefined,
): Resolution<Candle> {
  const feed = input.pivotMinuteFeed;
  if (!feed)
    return {
      status: "unknown",
      evidence:
        "No pivotMinuteFeed was supplied; the 09:30 opening is not inferred from a selected 5m bar or quote.",
      missing: ["Actual 09:30 1m pivot feed is unavailable."],
    };
  if (feed.timeframe !== "1m")
    return {
      status: "failed",
      evidence:
        "pivotMinuteFeed is not explicitly actual 1m data; no lower timeframe is derived.",
      missing: ["pivotMinuteFeed must be actual 1m data."],
    };
  if (!input.source || feed.source !== input.source)
    return {
      status: "failed",
      evidence:
        "The 09:30 pivotMinuteFeed source does not exactly match the selected primary provider basis.",
      missing: ["09:30 pivot feed has a source/basis mismatch."],
    };
  if (!openingAt || !observedAt)
    return {
      status: "unknown",
      evidence:
        "No valid causal quote-observation time is available to establish that the 09:30 bar has closed.",
      missing: [
        "Causal quote observation time is unavailable for the opening bar.",
      ],
    };
  return exactClosedBar(feed.candles, openingAt, ONE_MINUTE, observedAt);
}

function resolveMorning(
  input: SetupInput,
  openingAt: number | undefined,
  observedAt: number | undefined,
): Resolution<Morning> {
  const feed = input.pivotMinuteFeed;
  if (
    !feed ||
    feed.timeframe !== "1m" ||
    !input.source ||
    feed.source !== input.source
  )
    return {
      status: "unknown",
      evidence:
        "A same-provider actual 1m pivotMinuteFeed is required for the morning extreme; it is never reconstructed from 5m/15m data.",
      missing: ["Same-provider actual 1m morning feed is unavailable."],
    };
  if (!openingAt || !observedAt)
    return {
      status: "unknown",
      evidence:
        "A causal observed quote time is required to establish the latest completed morning minute.",
      missing: [
        "Causal quote observation time is unavailable for the morning stop.",
      ],
    };
  const latestStart =
    Math.floor(observedAt / ONE_MINUTE) * ONE_MINUTE - ONE_MINUTE;
  if (latestStart < openingAt)
    return {
      status: "waiting",
      evidence:
        "No complete 09:30-or-later 1m bar exists yet at the observed quote; no morning extreme is asserted.",
      missing: ["Morning 1m coverage has not completed its first bar."],
    };
  const bars: Candle[] = [];
  for (let time = openingAt; time <= latestStart; time += ONE_MINUTE) {
    const exact = exactClosedBar(feed.candles, time, ONE_MINUTE, observedAt);
    if (!exact.value)
      return {
        status: exact.status,
        evidence: `Morning 1m coverage is not complete from 09:30 through the latest completed minute. ${exact.evidence}`,
        missing: [
          "Morning 1m coverage is incomplete, gapped, malformed, future, or forming.",
          ...exact.missing,
        ],
      };
    bars.push(exact.value);
  }
  return {
    value: {
      low: Math.min(...bars.map((bar) => bar.low)),
      high: Math.max(...bars.map((bar) => bar.high)),
      from: openingAt,
      through: latestStart,
      source: feed.source,
    },
    status: "met",
    evidence: `Complete actual 1m coverage runs from ${new Date(openingAt * 1_000).toISOString()} through ${new Date((latestStart + ONE_MINUTE) * 1_000).toISOString()}.`,
    missing: [],
  };
}

function resolveVolume(
  input: SetupInput,
  config: PivotConfig,
  observedAt: number | undefined,
): Resolution<VolumePair> {
  if (input.timeframe !== config.executionTimeframe)
    return {
      status: "unknown",
      evidence: `The selected ${config.executionTimeframe} volume rule cannot use input timeframe ${input.timeframe}; no resampling is performed.`,
      missing: [
        "Selected execution timeframe is unavailable for volume validation.",
      ],
    };
  const volumeBasis =
    (input as SetupInput & { volumeBasis?: VolumeBasis }).volumeBasis ||
    "unknown";
  if (!sessionVolumeAllowed(config, volumeBasis))
    return {
      status: "failed",
      evidence:
        volumeBasis === "broker-reported"
          ? "Broker-reported volume is an unverified proxy and requires explicit owner selection of broker-reported-proxy; it is never called venue volume."
          : "Volume basis is unknown. Volume confirmation requires actual venue volume, not a display proxy.",
      missing: ["Allowed volume basis is not declared by the configuration."],
    };
  const allowedVolumeBasis = volumeBasis as Exclude<VolumeBasis, "unknown">;
  const volumeLabel =
    allowedVolumeBasis === "broker-reported"
      ? "broker-reported proxy (unverified volume type)"
      : "venue volume";
  if (!observedAt)
    return {
      status: "unknown",
      evidence:
        "A causal quote-observation time is required to select the latest completed volume bar.",
      missing: ["Causal quote observation time is unavailable for volume."],
    };
  const duration =
    config.executionTimeframe === "1m" ? ONE_MINUTE : FIVE_MINUTES;
  if (
    input.candles.some(
      (bar) =>
        validEpochSeconds(bar.time) &&
        bar.time + duration <= input.now &&
        bar.time + duration > observedAt,
    )
  )
    return {
      status: "unknown",
      evidence:
        "A newer completed native volume bar exists after this cached crossing observation. It cannot supply t−1 volume evidence for the old event.",
      missing: [
        "Crossing observation predates the latest native completed bar.",
      ],
    };
  const latestStart = Math.floor(observedAt / duration) * duration - duration;
  const priorStart = latestStart - duration;
  const current = exactClosedBar(
    input.candles,
    latestStart,
    duration,
    observedAt,
  );
  const previous = exactClosedBar(
    input.candles,
    priorStart,
    duration,
    observedAt,
  );
  if (!current.value || !previous.value)
    return {
      status: "unknown",
      evidence: `The latest completed ${config.executionTimeframe} bar and its immediately prior equal period must both be actual, closed, and adjacent. ${!current.value ? current.evidence : previous.evidence}`,
      missing: [
        "Latest completed volume pair is missing, gapped, malformed, future, or forming.",
        ...current.missing,
        ...previous.missing,
      ],
    };
  if (
    !isPositiveFinite(current.value.volume) ||
    !isPositiveFinite(previous.value.volume)
  )
    return {
      status: "failed",
      evidence:
        "Latest or immediately prior actual volume is zero/unknown; a rising-volume claim fails closed.",
      missing: ["Latest volume pair has zero or unknown actual volume."],
    };
  return {
    value: {
      current: current.value,
      previous: previous.value,
      duration,
      basis: allowedVolumeBasis,
    },
    status: "met",
    evidence: `${volumeLabel} is reported on actual adjacent completed ${config.executionTimeframe} periods: ${show(previous.value.volume)} → ${show(current.value.volume)}.`,
    missing: [],
  };
}

function resolvePremarketRange(
  input: SetupInput,
  config: PivotConfig,
  openingAt: number | undefined,
  observedAt: number | undefined,
): Resolution<PremarketRange> {
  const startMinute = config.premarketStartMinute;
  if (startMinute === undefined)
    return {
      status: "failed",
      evidence:
        "declared-premarket-range requires an owner-chosen premarketStartMinute; no 04:00 default is invented.",
      missing: ["Owner must choose the premarket range start."],
    };
  if (startMinute % 15 !== 0)
    return {
      status: "failed",
      evidence:
        "The owner-chosen premarket start cannot form an exact 15m window to 09:30; bars are not shifted or resampled.",
      missing: ["Premarket start must align to complete exact 15m bars."],
    };
  const feed = input.sessionRangeFeed;
  if (
    !feed ||
    feed.timeframe !== "15m" ||
    !input.source ||
    feed.source !== input.source
  )
    return {
      status: "unknown",
      evidence:
        "A same-provider explicit 15m sessionRangeFeed is required; premarket highs/lows are never inferred from another feed.",
      missing: ["Same-provider exact 15m premarket range feed is unavailable."],
    };
  if (!openingAt || !observedAt)
    return {
      status: "unknown",
      evidence:
        "A causal quote-observation time is required to verify completion of the premarket range.",
      missing: [
        "Causal quote observation time is unavailable for the premarket range.",
      ],
    };
  const localDate = sessionClockParts(openingAt, config.timezone).date;
  const startAt = sessionInstant(localDate, startMinute, config.timezone);
  if (!startAt || startAt >= openingAt)
    return {
      status: "failed",
      evidence:
        "The declared premarket start does not precede today’s 09:30 opening.",
      missing: ["Premarket start must precede 09:30."],
    };
  const bars: Candle[] = [];
  for (let time = startAt; time < openingAt; time += FIFTEEN_MINUTES) {
    const exact = exactClosedBar(
      feed.candles,
      time,
      FIFTEEN_MINUTES,
      observedAt,
    );
    if (!exact.value)
      return {
        status: exact.status,
        evidence: `The owner-declared premarket 15m range is incomplete. ${exact.evidence}`,
        missing: [
          "Declared premarket 15m range is incomplete, gapped, malformed, future, or forming.",
          ...exact.missing,
        ],
      };
    bars.push(exact.value);
  }
  return {
    value: {
      high: Math.max(...bars.map((bar) => bar.high)),
      low: Math.min(...bars.map((bar) => bar.low)),
      startAt,
      endAt: openingAt,
      source: feed.source,
    },
    status: "met",
    evidence: `Complete exact 15m owner-declared premarket range is available from ${new Date(startAt * 1_000).toISOString()} to 09:30.`,
    missing: [],
  };
}

function targetFor(
  side: Direction,
  config: PivotConfig,
  range: Resolution<PremarketRange> | undefined,
  pdc: Resolution<Pdc>,
  executionSourceIdentity: string | undefined,
  executionSource: string | undefined,
  entry: number | undefined,
): Resolution<number> {
  if (!entry)
    return {
      status: "unknown",
      evidence:
        "A valid current quote entry is required before target direction can be checked.",
      missing: ["Current quote entry is unavailable for target validation."],
    };
  let target: number | undefined;
  let evidence: string;
  if (config.targetMode === "owner-key-levels") {
    target = side === "long" ? config.longTargetPrice : config.shortTargetPrice;
    evidence = `Owner-declared ${side} key level`;
    if (!isPositiveFinite(target))
      return {
        status: "failed",
        evidence: `${evidence} is absent or invalid; no generic R-multiple target is substituted.`,
        missing: [`Explicit ${side} owner key-level target is required.`],
      };
  } else if (config.targetMode === "previous-day-extremes") {
    const previousPdc = pdc.value;
    const daily = previousPdc?.previousDaily;
    if (!daily || !previousPdc)
      return {
        status: pdc.status === "failed" ? "failed" : "unknown",
        evidence: `Previous-day-extremes requires a verified actual provider daily-basis row. ${pdc.evidence}`,
        missing: [
          "Verified previous provider-day OHLC is unavailable for target.",
        ],
      };
    const identityDeclared =
      previousPdc.sourceIdentity !== undefined ||
      executionSourceIdentity !== undefined;
    const sameProvider = identityDeclared
      ? Boolean(
          previousPdc.sourceIdentity &&
          executionSourceIdentity &&
          previousPdc.sourceIdentity === executionSourceIdentity,
        )
      : Boolean(executionSource && previousPdc.source === executionSource);
    if (!sameProvider)
      return {
        status: "failed",
        evidence:
          "Previous-day-extremes daily source identity does not exactly match the selected execution/quote provider basis; sources are not mixed.",
        missing: [
          "Previous-day target daily source identity must match execution/quote source identity.",
        ],
      };
    target = side === "long" ? daily.high : daily.low;
    evidence = `Actual same-provider previous-day ${side === "long" ? "high" : "low"}`;
  } else {
    if (!range?.value)
      return {
        status: range?.status || "unknown",
        evidence:
          range?.evidence || "Declared premarket target range is unavailable.",
        missing: range?.missing || [
          "Declared premarket target range is unavailable.",
        ],
      };
    target = side === "long" ? range.value.high : range.value.low;
    evidence = `Owner-declared premarket ${side === "long" ? "high" : "low"}`;
  }
  const correctSide = side === "long" ? target > entry : target < entry;
  if (!correctSide)
    return {
      status: "failed",
      evidence: `${evidence} ${show(target)} is already behind/current to entry ${show(entry)}; it cannot be used as a profit target.`,
      missing: [`${side} target is already behind the entry.`],
    };
  return {
    value: target,
    status: "met",
    evidence: `${evidence} ${show(target)} is directionally beyond entry ${show(entry)}.`,
    missing: [],
  };
}

/**
 * Red-to-green / green-to-red continuation from a strictly observed quote cross.
 * It intentionally emits blocked candidates and context: an observed quote is never relabelled as OHLC.
 */
export function detectPdcContinuation(
  input: SetupInput,
  strategy: Strategy,
): SessionDetectorResult {
  const asOf = asSeconds(input.now);
  const parsed = pivotConfigSchema.safeParse(strategy.sessionConfig);
  const config = parsed.success ? parsed.data : PIVOT_DEFAULT_CONFIG;
  const missing: string[] = [];
  const addMissing = (items: string[]) => {
    for (const item of items) if (!missing.includes(item)) missing.push(item);
  };
  if (!Number.isFinite(asOf) || asOf <= 0)
    addMissing(["Detector clock is invalid."]);

  const proof =
    Number.isFinite(asOf) && asOf > 0
      ? quoteProof(input, asOf)
      : ({
          status: "unknown",
          evidence: "Detector clock is invalid.",
          missing: ["Detector clock is invalid."],
        } as QuoteProof);
  addMissing(proof.missing);
  const clockAt =
    proof.observedAt && proof.observedAt <= asOf ? proof.observedAt : asOf;
  let timing:
    | {
        local: ReturnType<typeof sessionClockParts>;
        openingAt?: number;
        endAt?: number;
      }
    | undefined;
  try {
    if (Number.isFinite(clockAt) && clockAt > 0)
      timing = sessionTimes(clockAt, config);
  } catch {
    addMissing(["Session clock cannot resolve the detector timestamp."]);
  }
  let pdcTiming: typeof timing;
  try {
    if (Number.isFinite(asOf) && asOf > 0)
      pdcTiming = sessionTimes(asOf, config);
  } catch {
    addMissing(["PDC source clock cannot resolve the detector timestamp."]);
  }
  const openingAt = timing?.openingAt;
  const pdc = resolvePdc(
    input,
    config,
    pdcTiming?.local.date || "",
    pdcTiming?.openingAt,
    asOf,
  );
  const opening = resolveOpening(input, openingAt, proof.observedAt);
  const morning = resolveMorning(input, openingAt, proof.observedAt);
  const volume = resolveVolume(input, config, proof.observedAt);
  const premarket =
    config.targetMode === "declared-premarket-range"
      ? resolvePremarketRange(input, config, openingAt, proof.observedAt)
      : undefined;
  addMissing(pdc.missing);
  addMissing(opening.missing);
  addMissing(morning.missing);
  addMissing(volume.missing);
  if (premarket) addMissing(premarket.missing);

  const configMarketMatches =
    !config.instrumentMarket || config.instrumentMarket === input.market.id;
  const configStatus: Status =
    parsed.success && parsed.data.confirmed && configMarketMatches
      ? "met"
      : "failed";
  const frameStatus: Status =
    input.timeframe === config.executionTimeframe ? "met" : "failed";
  const clockMinute = timing?.local.minute;
  const clockStatus: Status =
    clockMinute === undefined
      ? "unknown"
      : clockMinute < OPEN_MINUTE
        ? "waiting"
        : clockMinute >= ENTRY_END_MINUTE
          ? "failed"
          : "met";
  const openingPrice = opening.value?.open;

  const candidates: SetupCandidate[] = (["long", "short"] as const).map(
    (side) => {
      const openingSide: Resolution<true> =
        !pdc.value || openingPrice === undefined
          ? {
              status:
                pdc.value || opening.value
                  ? "unknown"
                  : pdc.status === "failed"
                    ? "failed"
                    : "unknown",
              evidence:
                "Both a verified PDC and a closed actual 09:30 1m opening are required to classify red/green opening side.",
              missing: [],
            }
          : (
                side === "long"
                  ? openingPrice < pdc.value.price
                  : openingPrice > pdc.value.price
              )
            ? {
                value: true,
                status: "met",
                evidence: `${side === "long" ? "R2G" : "G2R"} opening is verified: 09:30 open ${show(openingPrice)} is ${side === "long" ? "below" : "above"} PDC ${show(pdc.value.price)}.`,
                missing: [],
              }
            : {
                status: "failed",
                evidence: `09:30 open ${show(openingPrice)} is not ${side === "long" ? "below" : "above"} PDC ${show(pdc.value.price)}.`,
                missing: [],
              };

      const previous = proof.observation?.previous;
      const current = proof.observation?.current;
      const quoteCross: Resolution<true> =
        proof.status !== "met" || !previous || !current || !pdc.value
          ? {
              status:
                proof.status === "failed" || pdc.status === "failed"
                  ? "failed"
                  : proof.status,
              evidence:
                proof.status === "met"
                  ? "PDC is unavailable for quote-cross evaluation."
                  : proof.evidence,
              missing: [],
            }
          : (
                side === "long"
                  ? previous.price <= pdc.value.price &&
                    current.price > pdc.value.price &&
                    proof.entry !== undefined &&
                    proof.entry > pdc.value.price
                  : previous.price >= pdc.value.price &&
                    current.price < pdc.value.price &&
                    proof.entry !== undefined &&
                    proof.entry < pdc.value.price
              )
            ? {
                value: true,
                status: "met",
                evidence: `Observed live ${side} quote cross: ${show(previous.price)} → ${show(current.price)} across PDC ${show(pdc.value.price)}. This is a two-observation REST proof, not a closed-bar label or a tick-tape delivery promise.`,
                missing: [],
              }
            : {
                status: "waiting",
                evidence: `The observed quote pair ${show(previous.price)} → ${show(current.price)} and current ${proof.entry === undefined ? "entry" : `entry ${show(proof.entry)}`} do not remain across PDC ${show(pdc.value.price)} in the ${side} direction.`,
                missing: [],
              };

      const rising: Resolution<true> = !volume.value
        ? { status: volume.status, evidence: volume.evidence, missing: [] }
        : volume.value.current.volume > volume.value.previous.volume
          ? {
              value: true,
              status: "met",
              evidence: `Latest completed ${config.executionTimeframe} ${volume.value.basis === "broker-reported" ? "broker-reported proxy (unverified volume type)" : "venue volume"} ${show(volume.value.current.volume)} is greater than immediately prior equal-period actual volume ${show(volume.value.previous.volume)}.`,
              missing: [],
            }
          : {
              status: "failed",
              evidence: `Latest completed ${config.executionTimeframe} ${volume.value.basis === "broker-reported" ? "broker-reported proxy (unverified volume type)" : "venue volume"} ${show(volume.value.current.volume)} is not greater than immediately prior equal-period actual volume ${show(volume.value.previous.volume)}.`,
              missing: [],
            };

      const target = targetFor(
        side,
        config,
        premarket,
        pdc,
        input.sourceIdentity,
        input.source,
        proof.entry,
      );
      addMissing(target.missing);
      let stop: number | undefined;
      let riskStatus: Status = "unknown";
      let riskEvidence =
        "A valid current quote, complete morning extreme, owner price tick, and source target are required for brackets.";
      if (!isPositiveFinite(config.priceTick)) {
        riskStatus = "failed";
        riskEvidence =
          "Owner-declared priceTick is required for the morning-extreme stop buffer; market display precision is never used as a tick.";
        addMissing([
          "Owner-declared priceTick is required for stop buffering.",
        ]);
      } else if (!proof.entry || !morning.value || !target.value) {
        riskStatus =
          proof.status === "failed" ||
          pdc.status === "failed" ||
          target.status === "failed"
            ? "failed"
            : "unknown";
        riskEvidence =
          `${!proof.entry ? "Current quote entry is unavailable. " : ""}${!morning.value ? morning.evidence + " " : ""}${!target.value ? target.evidence : ""}`.trim();
      } else {
        stop =
          side === "long"
            ? bufferedPrice(morning.value.low, config.priceTick, -1)
            : bufferedPrice(morning.value.high, config.priceTick, 1);
        const lossSide =
          side === "long" ? stop < proof.entry : stop > proof.entry;
        if (!lossSide) {
          riskStatus = "failed";
          riskEvidence = `Morning-extreme stop ${show(stop)} is not beyond current ${side} entry ${show(proof.entry)} in the loss direction.`;
          addMissing([
            "Morning-extreme stop is not beyond entry in the loss direction.",
          ]);
        } else {
          riskStatus = "met";
          riskEvidence = `Stop ${show(stop)} is one owner-declared tick ${show(config.priceTick)} beyond complete-morning ${side === "long" ? "low" : "high"} ${show(side === "long" ? morning.value.low : morning.value.high)}; target ${show(target.value)} comes from ${config.targetMode === "owner-key-levels" ? "the owner key level" : config.targetMode === "previous-day-extremes" ? "the actual same-provider previous-day extreme" : "the declared premarket range"}.`;
        }
      }

      const steps: SetupStep[] = [
        step(
          "session-config",
          "Owner-confirmed PDC continuation configuration",
          configStatus,
          parsed.success
            ? !configMarketMatches
              ? `Autofilled instrument market ${config.instrumentMarket} does not match selected market ${input.market.id}; configuration must be reconfirmed for this instrument.`
              : parsed.data.confirmed
                ? `Version ${parsed.data.version} PDC configuration is owner-confirmed; ${parsed.data.timezone} is the active clock.`
                : "PDC configuration is proposed but confirmed is false; proposed rules do not authorize a paper setup."
            : "PDC configuration is missing or invalid; the displayed default is unconfirmed context, not approval.",
        ),
        step(
          "session-frame",
          "Actual selected 1m/5m execution timeframe",
          frameStatus,
          frameStatus === "met"
            ? `Input candles are actual selected ${config.executionTimeframe} data.`
            : `Input timeframe ${input.timeframe} does not equal selected ${config.executionTimeframe}; no timeframe conversion is used.`,
        ),
        step(
          "session-clock",
          "Observed quote inside 09:30–10:00 configured session clock",
          clockStatus,
          clockMinute === undefined
            ? "Session clock is unavailable."
            : `Observation clock is ${timing!.local.date} ${String(Math.floor(clockMinute / 60)).padStart(2, "0")}:${String(clockMinute % 60).padStart(2, "0")} ${config.timezone}; entry window is 09:30 inclusive to 10:00 exclusive.`,
        ),
        step(
          "pivot-pdc",
          "Explicit causal previous-close basis",
          pdc.status,
          pdc.evidence,
        ),
        step(
          "pivot-opening-side",
          `${side === "long" ? "R2G" : "G2R"} actual 09:30 opening side`,
          openingSide.status,
          openingSide.evidence,
        ),
        step(
          "pivot-quote-cross",
          `Observed ${side} quote cross of PDC`,
          quoteCross.status,
          quoteCross.evidence,
        ),
        step(
          "pivot-known-volume",
          volume.value?.basis === "broker-reported"
            ? "Known broker-reported proxy volume on adjacent completed periods"
            : "Known venue volume on adjacent completed periods",
          volume.status,
          volume.evidence,
        ),
        step(
          "pivot-rising-volume",
          volume.value?.basis === "broker-reported"
            ? "Rising actual completed broker-reported proxy volume"
            : "Rising actual completed venue volume",
          rising.status,
          rising.evidence,
        ),
        step(
          "pivot-morning-stop",
          "Complete 1m morning extreme through quote",
          morning.status,
          morning.evidence,
        ),
        step(
          "session-risk",
          "Owner-ticked morning stop and source target brackets",
          riskStatus,
          riskEvidence,
        ),
      ];
      const ready = SESSION_CRITICAL_IDS["pdc-continuation"].every((id) =>
        steps.some((item) => item.id === id && item.status === "met"),
      );
      return {
        id: `pdc-continuation-${strategy.id}-${side}-${proof.observedAt || openingAt || Math.floor(asOf) || "unknown"}`,
        family: "pdc-continuation",
        side,
        strategyId: strategy.id,
        strategyVersion: strategy.version,
        name: strategy.name,
        ready,
        steps,
        zones: [],
        ...(ready && proof.entry && stop !== undefined && target.value
          ? { entry: proof.entry, stop, target: target.value }
          : {}),
        source: strategy.source || "Owner-configured PDC continuation",
      };
    },
  );

  const resolvedPdc = pdc.value;
  const previousDay = resolvedPdc?.previousDaily;
  const verifiedPreviousDay =
    resolvedPdc && previousDay && validOhlc(previousDay)
      ? {
          high: previousDay.high,
          low: previousDay.low,
          date: new Date(previousDay.time * 1_000).toISOString().slice(0, 10),
          closeAt: resolvedPdc.closeAt,
          source: resolvedPdc.source,
          ...(resolvedPdc.sourceIdentity === undefined
            ? {}
            : { sourceIdentity: resolvedPdc.sourceIdentity }),
        }
      : undefined;

  return {
    candidates,
    context: {
      strategyId: strategy.id,
      family: "pdc-continuation",
      timezone: config.timezone,
      config,
      ...(pdc.value ? { pdc: pdc.value } : {}),
      ...(verifiedPreviousDay ? { previousDay: verifiedPreviousDay } : {}),
      ...(openingPrice !== undefined ? { openingPrice } : {}),
      ...(proof.observation ? { quoteEvidence: proof.observation } : {}),
      ...(premarket?.value
        ? {
            range: {
              high: premarket.value.high,
              low: premarket.value.low,
              midpoint: (premarket.value.high + premarket.value.low) / 2,
              startAt: premarket.value.startAt,
              endAt: premarket.value.endAt,
              source: premarket.value.source,
              basis: "complete-15m-window" as const,
            },
          }
        : {}),
      volumeBasis: input.volumeBasis || "unknown",
      missing,
    },
  };
}
