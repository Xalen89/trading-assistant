import { describe, expect, it } from "vitest";
import type { Candle, Market, Strategy } from "../../lib/trading/model";
import {
  IB_DEFAULT_CONFIG,
  LONDON_DEFAULT_CONFIG,
  SESSION_CRITICAL_IDS,
  type IbConfig,
  type LondonConfig,
} from "../../lib/trading/session-strategy-model";
import { detectSessionRangeStrategy } from "../../lib/trading/session-range-strategies";
import type { SetupInput } from "../../lib/trading/setup-model";

const utc = (hour: number, minute = 0, month = 0, day = 15) =>
  Date.UTC(2026, month, day, hour, minute) / 1000;
const fixed = (hour: number, minute = 0, month = 0, day = 15) =>
  utc(hour + 5, minute, month, day); // Etc/GMT+5 is the explicitly fixed UTC−05:00 clock.
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
};

const market: Market = {
  id: "UNIT",
  name: "Unit fixture market",
  category: "Futures",
  provider: "pending",
  providerSymbol: "UNIT",
  precision: 2,
  pointValue: 1,
  paperSupported: true,
};

function londonStrategy(config: Partial<LondonConfig> = {}): Strategy {
  return {
    id: "unit-london",
    name: "Unit London",
    description: "Fixture-only closed-bar detector test",
    color: "#fff",
    kind: "strategy",
    visible: true,
    version: 1,
    setupFamily: "london-breakout",
    factors: [],
    sessionConfig: { ...LONDON_DEFAULT_CONFIG, ...config },
  };
}

function ibStrategy(config: Partial<IbConfig> = {}): Strategy {
  return {
    id: "unit-ib",
    name: "Unit IB",
    description: "Fixture-only closed-bar detector test",
    color: "#fff",
    kind: "strategy",
    visible: true,
    version: 1,
    setupFamily: "initial-balance",
    factors: [],
    sessionConfig: { ...IB_DEFAULT_CONFIG, ...config },
  };
}

function input(overrides: Partial<ExtendedSetupInput> = {}): ExtendedSetupInput {
  return {
    market,
    timeframe: "15m",
    candles: [],
    daily: [],
    hourly: [],
    strategies: [],
    patterns: [],
    combination: "any",
    timezone: "Etc/UTC",
    now: fixed(3, 16),
    source: "UNIT venue source",
    dailySource: "UNIT daily",
    hourlySource: "UNIT hourly",
    ...overrides,
  };
}

function londonRange(
  source = "UNIT venue source",
  month = 0,
  day = 15,
): Candle[] {
  return Array.from({ length: 12 }, (_, index) => {
    const minute = index * 15;
    return candle(
      fixed(Math.floor(minute / 60), minute % 60, month, day),
      100,
      index === 4 ? 110 : 108,
      index === 8 ? 90 : 92,
      100,
    );
  });
}

function ibRange(
  source = "UNIT venue source",
  month = 0,
  day = 15,
): Candle[] {
  void source;
  return [0, 15, 30, 45].map((offset, index) =>
    candle(
      fixed(9, 30 + offset, month, day),
      100,
      index === 1 ? 110 : 108,
      index === 2 ? 90 : 92,
      100,
    ),
  );
}

function rangeFeed(
  candles: Candle[],
  source = "UNIT venue source",
  volumeBasis: "venue" | "broker-reported" | "unknown" = "venue",
) {
  return { candles, source, timeframe: "15m" as const, volumeBasis };
}

const get = (
  result: ReturnType<typeof detectSessionRangeStrategy>,
  side: "long" | "short",
) => result.candidates.find((candidate) => candidate.side === side)!;
const status = (
  result: ReturnType<typeof detectSessionRangeStrategy>,
  side: "long" | "short",
  id: string,
) => get(result, side).steps.find((item) => item.id === id)?.status;

function ibExecution(
  decisionClose = 111,
  decisionVolume = 200,
  baselineVolume = 100,
): Candle[] {
  const decisionAt = fixed(10, 30);
  const prior = Array.from({ length: 20 }, (_, index) => {
    const time = decisionAt - (20 - index) * 30 * 60;
    return candle(time, 100, 105, 95, 100, baselineVolume);
  });
  return [
    ...prior,
    candle(decisionAt, 105, Math.max(decisionClose, 112), 102, decisionClose, decisionVolume),
  ];
}

describe("session range strategies — deterministic fixture evidence only", () => {
  it("builds London only from the exact current-date 12-candle 15m range and a fresh closed 15m break", () => {
    const result = detectSessionRangeStrategy(
      input({
        sessionRangeFeed: rangeFeed(londonRange()),
        candles: [candle(fixed(3), 105, 112, 104, 111)],
      }),
      londonStrategy({ confirmed: true }),
    );
    const long = get(result, "long");
    expect(result.context.range).toMatchObject({
      high: 110,
      low: 90,
      midpoint: 100,
      basis: "complete-15m-window",
      source: "UNIT venue source",
    });
    expect(long).toMatchObject({ ready: true, entry: 111, stop: 100, target: 133 });
    expect(long.zones).toHaveLength(1);
    expect(long.zones[0]).toMatchObject({ kind: "session-range", label: expect.stringContaining("neutral") });
    expect(
      SESSION_CRITICAL_IDS["london-breakout"].every((id) =>
        long.steps.some((item) => item.id === id),
      ),
    ).toBe(true);
    expect(status(result, "short", "session-breakout")).toBe("waiting");
  });

  it("does not promote a forming/future latest 15m London candle, and does not reuse the old closed break", () => {
    const result = detectSessionRangeStrategy(
      input({
        now: fixed(3, 10),
        sessionRangeFeed: rangeFeed(londonRange()),
        candles: [candle(fixed(3), 105, 112, 104, 111)],
      }),
      londonStrategy({ confirmed: true }),
    );
    expect(get(result, "long").ready).toBe(false);
    expect(status(result, "long", "session-breakout")).toBe("unknown");
    expect(get(result, "long").entry).toBeUndefined();
  });

  it("requires every exact contiguous range period and rejects malformed, wrong-source, and incomplete windows", () => {
    const missing = londonRange().filter((bar) => bar.time !== fixed(1, 30));
    const missingResult = detectSessionRangeStrategy(
      input({ sessionRangeFeed: rangeFeed(missing) }),
      londonStrategy({ confirmed: true }),
    );
    expect(missingResult.context.range).toBeUndefined();
    expect(status(missingResult, "long", "session-range")).toBe("unknown");

    const malformed = londonRange();
    malformed[3] = { ...malformed[3], low: 120 };
    const malformedResult = detectSessionRangeStrategy(
      input({ sessionRangeFeed: rangeFeed(malformed) }),
      londonStrategy({ confirmed: true }),
    );
    expect(malformedResult.context.range).toBeUndefined();

    const wrongSource = detectSessionRangeStrategy(
      input({ sessionRangeFeed: rangeFeed(londonRange(), "OTHER source") }),
      londonStrategy({ confirmed: true }),
    );
    expect(wrongSource.context.range).toBeUndefined();
    expect(wrongSource.context.missing.join(" ")).toContain("does not exactly equal");

    const formingRange = detectSessionRangeStrategy(
      input({ now: fixed(2, 59), sessionRangeFeed: rangeFeed(londonRange()) }),
      londonStrategy({ confirmed: true }),
    );
    expect(formingRange.context.range).toBeUndefined();
  });

  it("keeps a valid range context on a wrong display frame but never makes it executable", () => {
    const result = detectSessionRangeStrategy(
      input({
        timeframe: "1h",
        sessionRangeFeed: rangeFeed(londonRange()),
        candles: [candle(fixed(3), 105, 112, 104, 111)],
      }),
      londonStrategy({ confirmed: true }),
    );
    expect(result.context.range).toBeDefined();
    expect(status(result, "long", "session-frame")).toBe("failed");
    expect(get(result, "long").ready).toBe(false);
  });

  it("uses the declared New York DST clock rather than assuming fixed EST", () => {
    const dateMonth = 6;
    const dateDay = 15;
    // 07:16 UTC is 03:16 EDT but 02:16 in fixed Etc/GMT+5.
    const nyRange = Array.from({ length: 12 }, (_, index) => {
      const minute = index * 15;
      return candle(
        utc(4 + Math.floor(minute / 60), minute % 60, dateMonth, dateDay),
        100,
        index === 3 ? 110 : 108,
        index === 8 ? 90 : 92,
        100,
      );
    });
    const overrides = {
      now: utc(7, 16, dateMonth, dateDay),
      sessionRangeFeed: rangeFeed(nyRange),
      candles: [candle(utc(7, 0, dateMonth, dateDay), 105, 112, 104, 111)],
    };
    const ny = detectSessionRangeStrategy(
      input(overrides),
      londonStrategy({ confirmed: true, timezone: "America/New_York" }),
    );
    const fixedClock = detectSessionRangeStrategy(
      input(overrides),
      londonStrategy({ confirmed: true, timezone: "Etc/GMT+5" }),
    );
    expect(get(ny, "long").ready).toBe(true);
    expect(fixedClock.context.range).toBeUndefined();
  });

  it("supports 30m IB decisions only after the exact 09:30–10:30 range and anchors TP one range beyond the boundary", () => {
    const result = detectSessionRangeStrategy(
      input({
        timeframe: "30m",
        now: fixed(11, 1),
        sessionRangeFeed: rangeFeed(ibRange()),
        candles: ibExecution(),
      }),
      ibStrategy({ confirmed: true, executionTimeframe: "30m" }),
    );
    const long = get(result, "long");
    expect(long).toMatchObject({ ready: true, entry: 111, stop: 100, target: 130 });
    expect(status(result, "long", "session-clock")).toBe("met");
    expect(status(result, "long", "session-known-volume")).toBe("met");
    expect(status(result, "long", "session-high-volume")).toBe("met");
    expect(
      SESSION_CRITICAL_IDS["initial-balance"].every((id) =>
        long.steps.some((item) => item.id === id),
      ),
    ).toBe(true);

    const premature = detectSessionRangeStrategy(
      input({
        now: fixed(10, 31),
        sessionRangeFeed: rangeFeed(ibRange()),
        candles: [candle(fixed(9, 30), 105, 112, 104, 111)],
      }),
      ibStrategy({ confirmed: true }),
    );
    expect(status(premature, "long", "session-clock")).toBe("waiting");
    expect(get(premature, "long").ready).toBe(false);
  });

  it("requires explicitly venue-qualified volume and an all-positive contiguous prior-only 20-bar baseline", () => {
    const common = {
      timeframe: "30m" as const,
      now: fixed(11, 1),
      sessionRangeFeed: rangeFeed(ibRange()),
      candles: ibExecution(),
    };
    const unknown = detectSessionRangeStrategy(
      input({ ...common, volumeBasis: "unknown" }),
      ibStrategy({ confirmed: true, executionTimeframe: "30m" }),
    );
    expect(status(unknown, "long", "session-known-volume")).toBe("failed");
    expect(get(unknown, "long").ready).toBe(false);

    const zeroBaseline = ibExecution();
    zeroBaseline[4] = { ...zeroBaseline[4], volume: 0 };
    const zero = detectSessionRangeStrategy(
      input({ ...common, candles: zeroBaseline }),
      ibStrategy({ confirmed: true, executionTimeframe: "30m" }),
    );
    expect(status(zero, "long", "session-high-volume")).toBe("unknown");
    expect(get(zero, "long").ready).toBe(false);

    const gapped = ibExecution().filter((bar) => bar.time !== fixed(6, 0));
    const gap = detectSessionRangeStrategy(
      input({ ...common, candles: gapped }),
      ibStrategy({ confirmed: true, executionTimeframe: "30m" }),
    );
    expect(status(gap, "long", "session-high-volume")).toBe("unknown");
  });

  it("permits broker-reported proxy volume only after explicit IB opt-in and never with zero volume", () => {
    const common = {
      timeframe: "30m" as const,
      now: fixed(11, 1),
      sessionRangeFeed: rangeFeed(ibRange()),
      candles: ibExecution(),
      volumeBasis: "broker-reported" as const,
    };
    const blocked = detectSessionRangeStrategy(
      input(common),
      ibStrategy({ confirmed: true, executionTimeframe: "30m" }),
    );
    expect(status(blocked, "long", "session-known-volume")).toBe("failed");

    const allowed = detectSessionRangeStrategy(
      input(common),
      ibStrategy({
        confirmed: true,
        executionTimeframe: "30m",
        volumePolicy: "broker-reported-proxy",
      }),
    );
    expect(status(allowed, "long", "session-known-volume")).toBe("met");
    expect(
      get(allowed, "long").steps.find((item) => item.id === "session-high-volume")
        ?.evidence,
    ).toContain("broker-reported proxy (unverified volume type)");

    const zero = ibExecution();
    zero[zero.length - 1] = { ...zero.at(-1)!, volume: 0 };
    const blockedZero = detectSessionRangeStrategy(
      input({ ...common, candles: zero }),
      ibStrategy({
        confirmed: true,
        executionTimeframe: "30m",
        volumePolicy: "broker-reported-proxy",
      }),
    );
    expect(status(blockedZero, "long", "session-known-volume")).toBe("failed");
  });

  it("uses closed-price London geometry, honors target modes, and rejects IB targets already behind the entry", () => {
    const london = detectSessionRangeStrategy(
      input({
        sessionRangeFeed: rangeFeed(londonRange()),
        candles: [candle(fixed(3), 105, 112, 104, 111)],
      }),
      londonStrategy({ confirmed: true, stopMode: "opposite-boundary", targetMode: "1.5r" }),
    );
    expect(get(london, "long")).toMatchObject({ ready: true, entry: 111, stop: 90, target: 142.5 });
    expect(get(london, "long").steps.find((item) => item.id === "session-risk")?.evidence).toContain("without a quote");

    const ibBehind = detectSessionRangeStrategy(
      input({
        timeframe: "30m",
        now: fixed(11, 1),
        sessionRangeFeed: rangeFeed(ibRange()),
        candles: ibExecution(131),
      }),
      ibStrategy({ confirmed: true, executionTimeframe: "30m" }),
    );
    expect(status(ibBehind, "long", "session-breakout")).toBe("met");
    expect(status(ibBehind, "long", "session-risk")).toBe("failed");
    expect(get(ibBehind, "long").ready).toBe(false);

    const insideTick = detectSessionRangeStrategy(
      input({
        timeframe: "30m",
        now: fixed(11, 1),
        sessionRangeFeed: rangeFeed(ibRange()),
        candles: ibExecution(),
      }),
      ibStrategy({
        confirmed: true,
        executionTimeframe: "30m",
        stopMode: "inside-boundary",
        insideBoundaryTicks: 1,
        priceTick: 0.5,
      }),
    );
    expect(get(insideTick, "long")).toMatchObject({ ready: true, stop: 109.5, target: 130 });
  });

  it("uses the owner-approved labelled default while strict-schema extras remain non-executable", () => {
    const approvedDefault = detectSessionRangeStrategy(
      input({
        sessionRangeFeed: rangeFeed(londonRange()),
        candles: [candle(fixed(3), 105, 112, 104, 111)],
      }),
      londonStrategy(),
    );
    expect(status(approvedDefault, "long", "session-config")).toBe("met");
    expect(get(approvedDefault, "long").ready).toBe(true);

    const malformed: Strategy = {
      ...londonStrategy({ confirmed: true }),
      sessionConfig: {
        ...(londonStrategy({ confirmed: true }).sessionConfig as LondonConfig),
        unexpected: true,
      } as unknown as LondonConfig,
    };
    const invalid = detectSessionRangeStrategy(
      input({
        sessionRangeFeed: rangeFeed(londonRange()),
        candles: [candle(fixed(3), 105, 112, 104, 111)],
      }),
      malformed,
    );
    expect(status(invalid, "long", "session-config")).toBe("failed");
    expect(get(invalid, "long").ready).toBe(false);
  });

  it("fails the critical session configuration when autofilled market metadata is stale", () => {
    const staleMarket = detectSessionRangeStrategy(
      input({
        sessionRangeFeed: rangeFeed(londonRange()),
        candles: [candle(fixed(3), 105, 112, 104, 111)],
      }),
      londonStrategy({ confirmed: true, instrumentMarket: "OTHER" }),
    );
    expect(status(staleMarket, "long", "session-config")).toBe("failed");
    expect(get(staleMarket, "long").ready).toBe(false);
  });
});
