import { describe, expect, it } from "vitest";
import type { Candle, Market, Quote, Strategy } from "../../lib/trading/model";
import {
  PIVOT_DEFAULT_CONFIG,
  SESSION_CRITICAL_IDS,
  SESSION_NATIVE_IDS,
  type PivotConfig,
} from "../../lib/trading/session-strategy-model";
import { detectPdcContinuation } from "../../lib/trading/pdc-continuation";
import type { SetupInput } from "../../lib/trading/setup-model";

const utc = (hour: number, minute = 0, day = 15) =>
  Date.UTC(2026, 0, day, hour, minute) / 1_000;
const fixed = (hour: number, minute = 0, day = 15) =>
  utc(hour + 5, minute, day);
const SOURCE = "UNIT provider";
const market: Market = {
  id: "UNIT",
  name: "Unit stock",
  category: "Stocks",
  provider: "fmp",
  providerSymbol: "UNIT",
  precision: 2,
  pointValue: 1,
  paperSupported: true,
};
const candle = (
  time: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume = 100,
): Candle => ({ time, open, high, low, close, volume });
type ExtendedSetupInput = SetupInput & {
  volumeBasis?: "venue" | "broker-reported" | "unknown";
  dailyPeriodBasis?:
    | "utc-continuous-24h"
    | "utc-provider-trading-days"
    | "unknown";
  dailySourceIdentity?: string;
};

function config(overrides: Partial<PivotConfig> = {}): PivotConfig {
  return {
    ...PIVOT_DEFAULT_CONFIG,
    confirmed: true,
    pdcBasis: "provider-utc-day",
    priceTick: 0.01,
    longTargetPrice: 105,
    shortTargetPrice: 95,
    ...overrides,
  };
}

function strategy(overrides: Partial<PivotConfig> = {}): Strategy {
  return {
    id: "unit-pdc",
    name: "Synthetic PDC",
    description: "Fixture only",
    color: "#fff",
    kind: "strategy",
    visible: true,
    version: 1,
    setupFamily: "pdc-continuation",
    source: SOURCE,
    factors: [],
    sessionConfig: config(overrides),
  };
}

function quote(
  price: number,
  timestamp: number,
  source = SOURCE,
  symbol = "UNIT",
  changes: Partial<Pick<Quote, "sourceIdentity">> = {},
): Quote {
  return {
    price,
    timestamp,
    source,
    symbol,
    change: 0,
    status: "live",
    ...changes,
  };
}

function morning(opening = 99, day = 15, source = SOURCE): Candle[] {
  return [
    candle(
      fixed(9, 30, day),
      opening,
      opening + 0.5,
      opening - 1,
      opening + 0.2,
    ),
    candle(
      fixed(9, 31, day),
      opening + 0.2,
      opening + 0.7,
      opening - 0.6,
      opening + 0.4,
    ),
    candle(
      fixed(9, 32, day),
      opening + 0.4,
      opening + 0.9,
      opening - 0.4,
      opening + 0.5,
    ),
    candle(
      fixed(9, 33, day),
      opening + 0.5,
      opening + 1.1,
      opening - 0.2,
      opening + 0.7,
    ),
    candle(
      fixed(9, 34, day),
      opening + 0.7,
      opening + 1.2,
      opening,
      opening + 0.8,
    ),
  ];
}

function baseInput(
  overrides: Partial<ExtendedSetupInput> = {},
): ExtendedSetupInput {
  const now = fixed(9, 35);
  const pivot = morning();
  const base: SetupInput = {
    market,
    timeframe: "1m",
    candles: [
      candle(fixed(9, 33), 99.4, 100.1, 99.2, 99.8, 100),
      candle(fixed(9, 34), 99.8, 100.3, 99.7, 100.1, 200),
    ],
    daily: [candle(utc(0, 0, 14), 98, 101, 97, 100, 1_000)],
    hourly: [],
    strategies: [],
    patterns: [],
    combination: "any",
    timezone: "Etc/UTC",
    now,
    source: SOURCE,
    dailySource: SOURCE,
    hourlySource: SOURCE,
    dailyPeriodBasis: "utc-continuous-24h",
    volumeBasis: "venue",
    pivotMinuteFeed: {
      candles: pivot,
      source: SOURCE,
      timeframe: "1m",
      volumeBasis: "venue",
    },
    quoteObservations: {
      previous: quote(99.9, fixed(9, 34) + 30),
      current: quote(100.2, now),
      observedAt: now,
      method: "owner-persisted-rest-observations",
    },
  };
  return { ...base, ...overrides };
}

const candidate = (
  output: ReturnType<typeof detectPdcContinuation>,
  side: "long" | "short",
) => output.candidates.find((item) => item.side === side)!;
const status = (
  output: ReturnType<typeof detectPdcContinuation>,
  side: "long" | "short",
  id: string,
) => candidate(output, side).steps.find((item) => item.id === id)?.status;

describe("PDC continuation — observed quotes and causal session evidence", () => {
  it("rejects daily PDC source mixing even with owner key-level targets", () => {
    const input = baseInput({ dailySource: "Different provider" });
    const output = detectPdcContinuation(input, strategy());
    expect(candidate(output, "long").ready).toBe(false);
    expect(
      candidate(output, "long").steps.find((s) => s.id === "pivot-pdc")
        ?.evidence,
    ).toMatch(/provider|source/);
  });
  it("rejects mismatched opaque provider identities despite identical labels and personal targets", () => {
    const output = detectPdcContinuation(
      baseInput({
        sourceIdentity: "provider-A",
        dailySourceIdentity: "provider-B",
      }),
      strategy(),
    );
    expect(candidate(output, "long").ready).toBe(false);
  });
  it("requires exact declared quote identities while retaining label-only legacy matching", () => {
    const withIdentity = {
      sourceIdentity: "opaque-execution-A",
      dailySourceIdentity: "opaque-execution-A",
    };
    const wrongIdentity = detectPdcContinuation(
      baseInput({
        ...withIdentity,
        quoteObservations: {
          previous: quote(99.9, fixed(9, 34) + 30, SOURCE, "UNIT", {
            sourceIdentity: "opaque-execution-B",
          }),
          current: quote(100.2, fixed(9, 35), SOURCE, "UNIT", {
            sourceIdentity: "opaque-execution-B",
          }),
          sourceIdentity: "opaque-execution-B",
          observedAt: fixed(9, 35),
          method: "owner-persisted-rest-observations",
        },
      }),
      strategy(),
    );
    expect(status(wrongIdentity, "long", "pivot-quote-cross")).toBe("failed");

    const exactIdentity = detectPdcContinuation(
      baseInput({
        ...withIdentity,
        quoteObservations: {
          previous: quote(99.9, fixed(9, 34) + 30, SOURCE, "UNIT", {
            sourceIdentity: "opaque-execution-A",
          }),
          current: quote(100.2, fixed(9, 35), SOURCE, "UNIT", {
            sourceIdentity: "opaque-execution-A",
          }),
          sourceIdentity: "opaque-execution-A",
          observedAt: fixed(9, 35),
          method: "owner-persisted-rest-observations",
        },
      }),
      strategy(),
    );
    expect(status(exactIdentity, "long", "pivot-quote-cross")).toBe("met");

    const identityOnLegacyInput = detectPdcContinuation(
      baseInput({
        quoteObservations: {
          previous: quote(99.9, fixed(9, 34) + 30, SOURCE, "UNIT", {
            sourceIdentity: "opaque-execution-A",
          }),
          current: quote(100.2, fixed(9, 35), SOURCE, "UNIT", {
            sourceIdentity: "opaque-execution-A",
          }),
          sourceIdentity: "opaque-execution-A",
          observedAt: fixed(9, 35),
          method: "owner-persisted-rest-observations",
        },
      }),
      strategy(),
    );
    expect(status(identityOnLegacyInput, "long", "pivot-quote-cross")).toBe(
      "failed",
    );
  });

  it("rejects mixed-source declared session-close data independently of target mode", () => {
    const output = detectPdcContinuation(
      baseInput({ hourlySource: "Different provider" }),
      strategy({ pdcBasis: "declared-session-close", sessionCloseMinute: 960 }),
    );
    expect(candidate(output, "long").ready).toBe(false);
  });
  it("does not relabel an older UTC daily candle as the immediately previous day", () => {
    const input = baseInput();
    input.daily[0].time -= 86400;
    expect(
      candidate(detectPdcContinuation(input, strategy()), "long").ready,
    ).toBe(false);
  });
  it("never uses later completed native volume to revive a cached old quote crossing", () => {
    const input = baseInput();
    input.now += 60;
    input.candles.push(candle(fixed(9, 35), 100.1, 100.4, 100, 100.2, 300));
    const output = detectPdcContinuation(input, strategy());
    expect(candidate(output, "long").ready).toBe(false);
    expect(status(output, "long", "pivot-rising-volume")).not.toBe("met");
  });
  it("creates a correct R2G long only from the observed quote cross, venue volume, and sourced brackets", () => {
    const output = detectPdcContinuation(baseInput(), strategy());
    const long = candidate(output, "long");
    expect(long).toMatchObject({
      ready: true,
      entry: 100.2,
      stop: 97.99,
      target: 105,
    });
    expect(candidate(output, "short").ready).toBe(false);
    expect(output.context).toMatchObject({
      openingPrice: 99,
      volumeBasis: "venue",
      pdc: { price: 100, basis: "provider-utc-day", source: SOURCE },
    });
    expect(
      SESSION_CRITICAL_IDS["pdc-continuation"].every((id) =>
        long.steps.some((item) => item.id === id),
      ),
    ).toBe(true);
    expect(SESSION_NATIVE_IDS["pdc-continuation"]).toEqual([
      "pivot-known-volume",
      "pivot-rising-volume",
    ]);
    expect(
      long.steps.find((item) => item.id === "pivot-quote-cross")?.evidence,
    ).toMatch(/two-observation REST proof/i);
  });

  it("creates a correct G2R short, taking a valid bid/ask mid as the actual entry", () => {
    const now = fixed(9, 35);
    const output = detectPdcContinuation(
      baseInput({
        pivotMinuteFeed: {
          candles: morning(101),
          source: SOURCE,
          timeframe: "1m",
          volumeBasis: "venue",
        },
        quoteObservations: {
          previous: quote(100.1, fixed(9, 34) + 30),
          current: { ...quote(99.6, now), bid: 99.5, ask: 99.7 },
          observedAt: now,
          method: "owner-persisted-rest-observations",
        },
      }),
      strategy(),
    );
    expect(candidate(output, "short")).toMatchObject({
      ready: true,
      entry: 99.6,
      stop: 102.21,
      target: 95,
    });
    expect(status(output, "short", "pivot-opening-side")).toBe("met");
    expect(status(output, "short", "pivot-quote-cross")).toBe("met");
  });

  it("never upgrades a closed candle crossing PDC into a quote-cross proof", () => {
    const now = fixed(9, 35);
    const output = detectPdcContinuation(
      baseInput({
        candles: [
          candle(fixed(9, 33), 99, 99.5, 98.9, 99.4, 100),
          candle(fixed(9, 34), 99.4, 101, 99.3, 100.8, 200),
        ],
        quoteObservations: {
          previous: quote(99.7, fixed(9, 34) + 30),
          current: quote(99.9, now),
          observedAt: now,
          method: "owner-persisted-rest-observations",
        },
      }),
      strategy(),
    );
    expect(status(output, "long", "pivot-quote-cross")).toBe("waiting");
    expect(candidate(output, "long").ready).toBe(false);
    expect(candidate(output, "long").entry).toBeUndefined();
  });

  it("keeps blocked critical steps visible for a first observation and rejects non-monotonic, future, stale, and source-mismatched quotes", () => {
    const first = detectPdcContinuation(
      baseInput({
        quoteObservations: {
          current: quote(100.2, fixed(9, 35)),
          observedAt: fixed(9, 35),
          method: "owner-persisted-rest-observations",
        },
      }),
      strategy(),
    );
    expect(status(first, "long", "pivot-quote-cross")).toBe("waiting");
    expect(candidate(first, "long").steps).toHaveLength(10);

    const nonMonotonic = detectPdcContinuation(
      baseInput({
        quoteObservations: {
          previous: quote(99.9, fixed(9, 35)),
          current: quote(100.2, fixed(9, 34) + 59),
          observedAt: fixed(9, 35),
          method: "owner-persisted-rest-observations",
        },
      }),
      strategy(),
    );
    expect(status(nonMonotonic, "long", "pivot-quote-cross")).toBe("failed");

    const future = detectPdcContinuation(
      baseInput({
        quoteObservations: {
          previous: quote(99.9, fixed(9, 34) + 30),
          current: quote(100.2, fixed(9, 35) + 1),
          observedAt: fixed(9, 35) + 1,
          method: "owner-persisted-rest-observations",
        },
      }),
      strategy(),
    );
    expect(status(future, "long", "pivot-quote-cross")).toBe("failed");

    const stale = detectPdcContinuation(
      baseInput({
        quoteObservations: {
          previous: quote(99.9, fixed(9, 33)),
          current: quote(100.2, fixed(9, 34)),
          observedAt: fixed(9, 34),
          method: "owner-persisted-rest-observations",
        },
      }),
      strategy(),
    );
    expect(status(stale, "long", "pivot-quote-cross")).toBe("failed");

    const mismatched = detectPdcContinuation(
      baseInput({
        quoteObservations: {
          previous: quote(99.9, fixed(9, 34) + 30, "OTHER"),
          current: quote(100.2, fixed(9, 35)),
          observedAt: fixed(9, 35),
          method: "owner-persisted-rest-observations",
        },
      }),
      strategy(),
    );
    expect(status(mismatched, "long", "pivot-quote-cross")).toBe("failed");
  });

  it("requires a venue basis and exact contiguous actual selected-timeframe volume pair", () => {
    const unknownBasis = detectPdcContinuation(
      baseInput({ volumeBasis: "unknown" }),
      strategy(),
    );
    expect(status(unknownBasis, "long", "pivot-known-volume")).toBe("failed");
    expect(candidate(unknownBasis, "long").ready).toBe(false);

    const gap = detectPdcContinuation(
      baseInput({
        candles: [candle(fixed(9, 34), 99.8, 100.3, 99.7, 100.1, 200)],
      }),
      strategy(),
    );
    expect(status(gap, "long", "pivot-known-volume")).toBe("unknown");

    const flat = detectPdcContinuation(
      baseInput({
        candles: [
          candle(fixed(9, 33), 99.4, 100.1, 99.2, 99.8, 200),
          candle(fixed(9, 34), 99.8, 100.3, 99.7, 100.1, 100),
        ],
      }),
      strategy(),
    );
    expect(status(flat, "long", "pivot-rising-volume")).toBe("failed");
  });

  it("does not guess PDC semantics, but permits an observed Friday declared close without inventing a weekend close", () => {
    const unselected = detectPdcContinuation(
      baseInput(),
      strategy({ pdcBasis: "unselected" }),
    );
    expect(status(unselected, "long", "pivot-pdc")).toBe("failed");
    expect(unselected.context.pdc).toBeUndefined();

    const mondayNow = fixed(9, 35, 19);
    const fridayCloseBar = candle(fixed(15, 0, 16), 99, 101, 98, 100, 500);
    const declared = detectPdcContinuation(
      baseInput({
        now: mondayNow,
        hourly: [fridayCloseBar],
        quoteObservations: {
          previous: quote(99.9, fixed(9, 34, 19) + 30),
          current: quote(100.2, mondayNow),
          observedAt: mondayNow,
          method: "owner-persisted-rest-observations",
        },
        pivotMinuteFeed: {
          candles: morning(99, 19),
          source: SOURCE,
          timeframe: "1m",
          volumeBasis: "venue",
        },
        candles: [
          candle(fixed(9, 33, 19), 99.4, 100.1, 99.2, 99.8, 100),
          candle(fixed(9, 34, 19), 99.8, 100.3, 99.7, 100.1, 200),
        ],
      }),
      strategy({ pdcBasis: "declared-session-close", sessionCloseMinute: 960 }),
    );
    expect(declared.context.pdc).toMatchObject({
      price: 100,
      closeAt: fixed(16, 0, 16),
      basis: "declared-session-close",
    });
    expect(status(declared, "long", "pivot-pdc")).toBe("met");

    const missingDeclared = detectPdcContinuation(
      baseInput({ now: mondayNow, dailyPeriodBasis: "unknown" }),
      strategy({ pdcBasis: "declared-session-close", sessionCloseMinute: 960 }),
    );
    expect(status(missingDeclared, "long", "pivot-pdc")).toBe("unknown");
  });

  it("enforces timing, a declared price tick, owner targets, and complete non-future morning data", () => {
    const atTen = detectPdcContinuation(
      baseInput({
        now: fixed(10),
        quoteObservations: {
          previous: quote(99.9, fixed(9, 59) + 30),
          current: quote(100.2, fixed(10)),
          observedAt: fixed(10),
          method: "owner-persisted-rest-observations",
        },
      }),
      strategy(),
    );
    expect(status(atTen, "long", "session-clock")).toBe("failed");

    const noTick = detectPdcContinuation(
      baseInput(),
      strategy({ priceTick: undefined }),
    );
    expect(status(noTick, "long", "session-risk")).toBe("failed");

    const noTarget = detectPdcContinuation(
      baseInput(),
      strategy({ longTargetPrice: undefined }),
    );
    expect(status(noTarget, "long", "session-risk")).toBe("failed");

    const gappedMorning = detectPdcContinuation(
      baseInput({
        pivotMinuteFeed: {
          candles: morning().filter((bar) => bar.time !== fixed(9, 32)),
          source: SOURCE,
          timeframe: "1m",
          volumeBasis: "venue",
        },
      }),
      strategy(),
    );
    expect(status(gappedMorning, "long", "pivot-morning-stop")).toBe("unknown");

    const formingMorning = detectPdcContinuation(
      baseInput({
        quoteObservations: {
          previous: quote(99.9, fixed(9, 30) + 10),
          current: quote(100.2, fixed(9, 30) + 20),
          observedAt: fixed(9, 30) + 20,
          method: "owner-persisted-rest-observations",
        },
        now: fixed(9, 30) + 20,
      }),
      strategy(),
    );
    expect(status(formingMorning, "long", "pivot-morning-stop")).not.toBe(
      "met",
    );
    expect(candidate(formingMorning, "long").ready).toBe(false);
  });

  it("uses only a complete owner-declared exact 15m premarket range target and rejects a target already behind entry", () => {
    const pm = [
      candle(fixed(9, 0), 97, 101, 96, 100),
      candle(fixed(9, 15), 100, 104, 99, 102),
    ];
    const output = detectPdcContinuation(
      baseInput({
        sessionRangeFeed: {
          candles: pm,
          source: SOURCE,
          timeframe: "15m",
          volumeBasis: "venue",
        },
      }),
      strategy({
        targetMode: "declared-premarket-range",
        premarketStartMinute: 540,
      }),
    );
    expect(candidate(output, "long")).toMatchObject({
      ready: true,
      target: 104,
    });
    expect(output.context.range).toMatchObject({
      high: 104,
      low: 96,
      startAt: fixed(9),
      endAt: fixed(9, 30),
      basis: "complete-15m-window",
    });

    const gapped = detectPdcContinuation(
      baseInput({
        sessionRangeFeed: {
          candles: [pm[0]],
          source: SOURCE,
          timeframe: "15m",
          volumeBasis: "venue",
        },
      }),
      strategy({
        targetMode: "declared-premarket-range",
        premarketStartMinute: 540,
      }),
    );
    expect(status(gapped, "long", "session-risk")).toBe("unknown");

    const behind = detectPdcContinuation(
      baseInput(),
      strategy({ longTargetPrice: 99 }),
    );
    expect(status(behind, "long", "session-risk")).toBe("failed");
  });

  it("labels an anchored Friday provider trading-day close on Monday without claiming an exchange calendar", () => {
    const mondayNow = fixed(9, 35, 19);
    const output = detectPdcContinuation(
      baseInput({
        now: mondayNow,
        dailyPeriodBasis: "utc-provider-trading-days",
        daily: [
          candle(utc(0, 0, 16), 98, 105, 97, 100, 0),
          candle(utc(0, 0, 19), 100, 101, 99, 100.5, 0),
        ],
        pivotMinuteFeed: {
          candles: morning(99, 19),
          source: SOURCE,
          timeframe: "1m",
          volumeBasis: "venue",
        },
        candles: [
          candle(fixed(9, 33, 19), 99.4, 100.1, 99.2, 99.8, 100),
          candle(fixed(9, 34, 19), 99.8, 100.3, 99.7, 100.1, 200),
        ],
        quoteObservations: {
          previous: quote(99.9, fixed(9, 34, 19) + 30),
          current: quote(100.2, mondayNow),
          observedAt: mondayNow,
          method: "owner-persisted-rest-observations",
        },
      }),
      strategy({ pdcBasis: "provider-utc-trading-day" }),
    );
    expect(status(output, "long", "pivot-pdc")).toBe("met");
    expect(output.context.pdc).toMatchObject({
      price: 100,
      closeAt: utc(0, 0, 17),
    });
    expect(
      candidate(output, "long").steps.find((item) => item.id === "pivot-pdc")
        ?.evidence,
    ).toMatch(/3 days.*not an exchange trading-calendar\/RTH claim/i);
  });

  it("rerolls actual same-provider previous-day extreme targets and blocks behind or mixed-source extrema", () => {
    const dynamic = (high: number, dailySource = SOURCE) =>
      detectPdcContinuation(
        baseInput({
          daily: [candle(utc(0, 0, 14), 98, high, 97, 100, 0)],
          dailySource,
        }),
        strategy({ targetMode: "previous-day-extremes" }),
      );
    expect(candidate(dynamic(105), "long")).toMatchObject({
      ready: true,
      target: 105,
    });
    expect(candidate(dynamic(107), "long")).toMatchObject({
      ready: true,
      target: 107,
    });
    expect(status(dynamic(100), "long", "session-risk")).toBe("failed");
    expect(status(dynamic(105, "OTHER daily"), "long", "session-risk")).toBe(
      "failed",
    );
    const identityMismatch = detectPdcContinuation(
      baseInput({
        daily: [candle(utc(0, 0, 14), 98, 105, 97, 100, 0)],
        dailySourceIdentity: "daily-provider-id",
        sourceIdentity: "execution-provider-id",
      }),
      strategy({ targetMode: "previous-day-extremes" }),
    );
    expect(status(identityMismatch, "long", "session-risk")).toBe("failed");
  });

  it("fails the critical config for a stale autofilled market and keeps broker proxy volume opt-in explicit", () => {
    const staleMarket = detectPdcContinuation(
      baseInput(),
      strategy({ instrumentMarket: "OTHER" }),
    );
    expect(status(staleMarket, "long", "session-config")).toBe("failed");
    expect(candidate(staleMarket, "long").ready).toBe(false);

    const blockedProxy = detectPdcContinuation(
      baseInput({ volumeBasis: "broker-reported" }),
      strategy(),
    );
    expect(status(blockedProxy, "long", "pivot-known-volume")).toBe("failed");

    const allowedProxy = detectPdcContinuation(
      baseInput({ volumeBasis: "broker-reported" }),
      strategy({ volumePolicy: "broker-reported-proxy" }),
    );
    expect(status(allowedProxy, "long", "pivot-known-volume")).toBe("met");
    expect(
      candidate(allowedProxy, "long").steps.find(
        (item) => item.id === "pivot-rising-volume",
      )?.evidence,
    ).toContain("broker-reported proxy (unverified volume type)");

    const zeroProxy = detectPdcContinuation(
      baseInput({
        volumeBasis: "broker-reported",
        candles: [
          candle(fixed(9, 33), 99.4, 100.1, 99.2, 99.8, 0),
          candle(fixed(9, 34), 99.8, 100.3, 99.7, 100.1, 200),
        ],
      }),
      strategy({ volumePolicy: "broker-reported-proxy" }),
    );
    expect(status(zeroProxy, "long", "pivot-known-volume")).toBe("failed");
  });
});
