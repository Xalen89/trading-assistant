import { describe, expect, it } from "vitest";
import type { Candle, Market, Strategy } from "../../lib/trading/model";
import {
  ORB_DEFAULT_CONFIG,
  ORB_CRITICAL_STEP_IDS,
  type OrbConfig,
} from "../../lib/trading/orb-model";
import {
  isNas100CfdMarket,
  resolveOrbMarketProfile,
} from "../../lib/trading/orb-market-profile";
import { analyzeOrb, orbPaperGeometry } from "../../lib/trading/orb-strategy";
import type { SetupInput } from "../../lib/trading/setup-model";

const utc = (hour: number, minute = 0, month = 0, day = 15) =>
  Date.UTC(2026, month, day, hour, minute) / 1000;
const fixed = (hour: number, minute = 0, month = 0, day = 15) =>
  utc(hour + 5, minute, month, day); // Etc/GMT+5 = UTC−05:00
const candle = (
  time: number,
  open: number,
  high: number,
  low: number,
  close: number,
): Candle => ({ time, open, high, low, close, volume: 1 });
const nq: Market = {
  id: "NQ",
  name: "Synthetic NQ futures",
  category: "Futures",
  provider: "pending",
  providerSymbol: "NQ",
  precision: 2,
  pointValue: 20,
  paperSupported: true,
};
const es: Market = {
  id: "ES",
  name: "Synthetic ES futures",
  category: "Futures",
  provider: "pending",
  providerSymbol: "ES",
  precision: 2,
  pointValue: 50,
  paperSupported: true,
};
const nas100: Market = {
  id: "TL:3884",
  name: "Synthetic TradeLocker NAS100 CFD",
  category: "Indices",
  provider: "tradelocker",
  providerSymbol: "NAS100",
  precision: 2,
  pointValue: 1,
  paperSupported: true,
};
const nas100Metadata = {
  market: nas100.id,
  priceTick: 0.1,
  source: "UNIT same-provider source",
};

function strategy(config: Partial<OrbConfig> = {}): Strategy {
  return {
    id: "unit-orb",
    name: "Synthetic ORB",
    description: "Fixture only",
    color: "#fff",
    kind: "reference",
    visible: true,
    version: 1,
    setupFamily: "orb",
    source: "UNIT same-provider source",
    factors: [],
    orbConfig: {
      ...ORB_DEFAULT_CONFIG,
      ...config,
      sessions: config.sessions ?? ORB_DEFAULT_CONFIG.sessions,
    },
  };
}

function baseInput(overrides: Partial<SetupInput> = {}): SetupInput {
  const base: SetupInput = {
    market: nq,
    timeframe: "1m",
    candles: [],
    daily: [],
    hourly: [],
    strategies: [],
    patterns: [],
    combination: "any",
    timezone: "Etc/UTC",
    now: fixed(9, 2),
    source: "UNIT same-provider source",
    dailySource: "UNIT daily",
    hourlySource: "UNIT hourly",
  };
  return { ...base, ...overrides };
}

function exactRange(month = 0, day = 15, source = "UNIT same-provider source") {
  return {
    source,
    timeframe: "15m" as const,
    candles: [candle(fixed(8, 0, month, day), 90, 100, 80, 95)],
  };
}

function sequence(
  side: "long" | "short",
  confirmHour = 9,
  confirmMinute = 0,
  month = 0,
  day = 15,
): Candle[] {
  const start = fixed(8, 15, month, day);
  const end = fixed(confirmHour, confirmMinute, month, day);
  const bars: Candle[] = [];
  for (let time = start; time <= end; time += 60) {
    const minute = (time - fixed(8, 0, month, day)) / 60;
    if (minute === 30) {
      bars.push(
        side === "long"
          ? candle(time, 99, 102, 98, 101)
          : candle(time, 81, 82, 78, 79),
      );
    } else if (minute === 31) {
      bars.push(
        side === "long"
          ? candle(time, 94, 95, 90, 92)
          : candle(time, 87, 90, 85, 87),
      );
    } else if (time === end) {
      bars.push(
        side === "long"
          ? candle(time, 108, 111, 108, 110)
          : candle(time, 72, 74, 69, 70),
      );
    } else {
      bars.push(
        side === "long"
          ? candle(time, 92, 94, 91, 92)
          : candle(time, 87, 89, 86, 87),
      );
    }
  }
  return bars;
}

/** Deterministic software fixture, not NAS100 history or a validated edge. */
function nas100Sequence(): Candle[] {
  const start = fixed(8, 15);
  const end = fixed(9, 0);
  const bars: Candle[] = [];
  for (let time = start; time <= end; time += 60) {
    const minute = (time - fixed(8, 0)) / 60;
    if (minute === 30) bars.push(candle(time, 19999, 20006, 19999, 20005));
    else if (minute === 31) bars.push(candle(time, 19995, 19996, 19989, 19992));
    else if (time === end) bars.push(candle(time, 20000, 20011, 20000, 20010));
    else bars.push(candle(time, 19994, 19995, 19992, 19994));
  }
  return bars;
}

function nas100Range() {
  return {
    source: nas100Metadata.source,
    timeframe: "15m" as const,
    candles: [candle(fixed(8, 0), 19990, 20000, 19980, 19990)],
  };
}

const candidate = (
  out: ReturnType<typeof analyzeOrb>,
  side: "long" | "short",
) => out.candidates.find((item) => item.side === side)!;
const status = (
  out: ReturnType<typeof analyzeOrb>,
  side: "long" | "short",
  id: string,
) => candidate(out, side).steps.find((item) => item.id === id)?.status;

describe("ORB strategy — deterministic synthetic fixtures", () => {
  it("uses the exact current-date 15m feed and emits three linked ORB levels", () => {
    const out = analyzeOrb(
      baseInput({ orbRangeFeed: exactRange(), candles: sequence("long") }),
      strategy(),
    );
    expect(out.context.range).toMatchObject({
      basis: "exact-15m",
      high: 100,
      low: 80,
      midpoint: 90,
      source: "UNIT same-provider source",
    });
    expect(out.levels.slice(0, 3).map((level) => level.name)).toEqual([
      "ORB High",
      "ORB Low",
      "ORB 50%",
    ]);
    expect(out.levels.slice(0, 3).map((level) => level.price)).toEqual([
      100, 80, 90,
    ]);
    expect(
      ORB_CRITICAL_STEP_IDS.every((id) =>
        candidate(out, "long").steps.some((item) => item.id === id),
      ),
    ).toBe(true);
  });

  it("discloses the sole complete actual-1m aggregation fallback and rejects 5m/1h guessing", () => {
    const opening = Array.from({ length: 15 }, (_, index) =>
      candle(fixed(8, index), 90, 100 + (index === 3 ? 1 : 0), 80, 90),
    );
    const aggregate = analyzeOrb(
      baseInput({ now: fixed(8, 20), candles: opening }),
      strategy(),
    );
    expect(aggregate.context.range).toMatchObject({
      basis: "complete-1m-aggregation",
      high: 101,
      low: 80,
    });
    const fiveMinute = analyzeOrb(
      baseInput({
        now: fixed(8, 20),
        timeframe: "5m",
        candles: opening.filter((_, index) => index % 5 === 0),
      }),
      strategy(),
    );
    expect(fiveMinute.context.range).toBeUndefined();
    expect(fiveMinute.messages.join(" ")).toContain("5m/1h");
  });

  it("does not form a range from a still-forming, missing/gapped, or mismatched-source 08:00 candle", () => {
    const forming = analyzeOrb(
      baseInput({ now: fixed(8, 10), orbRangeFeed: exactRange(), candles: [] }),
      strategy(),
    );
    expect(forming.context.range).toBeUndefined();
    const missing = Array.from({ length: 15 }, (_, index) =>
      candle(fixed(8, index), 90, 100, 80, 90),
    ).filter((bar) => bar.time !== fixed(8, 7));
    const gapped = analyzeOrb(
      baseInput({ now: fixed(8, 20), candles: missing }),
      strategy(),
    );
    expect(gapped.context.range).toBeUndefined();
    const mismatch = analyzeOrb(
      baseInput({
        now: fixed(9, 2),
        orbRangeFeed: exactRange(0, 15, "OTHER provider"),
        candles: sequence("long"),
      }),
      strategy(),
    );
    expect(mismatch.context.range).toBeUndefined();
    expect(mismatch.messages.join(" ")).toContain("does not exactly equal");
  });

  it("recognizes chronological long and short sequences, emits only a fresh bracket, and uses a 0.25 stop tick", () => {
    const long = analyzeOrb(
      baseInput({ orbRangeFeed: exactRange(), candles: sequence("long") }),
      strategy(),
    );
    const longCandidate = candidate(long, "long");
    expect(longCandidate.ready).toBe(true);
    expect(longCandidate).toMatchObject({
      entry: 110,
      stop: 89.75,
      target: 170.75,
    });
    expect(longCandidate.zones).toHaveLength(1);
    expect(longCandidate.zones[0].kind).toBe("orb");

    const short = analyzeOrb(
      baseInput({ orbRangeFeed: exactRange(), candles: sequence("short") }),
      strategy(),
    );
    expect(candidate(short, "short")).toMatchObject({
      ready: true,
      entry: 70,
      stop: 90.25,
      target: 9.25,
    });
    expect(status(short, "short", "orb-breakout")).toBe("met");
    expect(status(short, "short", "orb-midpoint-retest")).toBe("met");
    expect(status(short, "short", "orb-continuation")).toBe("met");
  });

  it("enforces native-market 3R source bands and stop direction in the pure geometry helper", () => {
    expect(orbPaperGeometry(nq, "long", 110, 89.75)).toEqual({
      target: 170.75,
      rr: 3,
      targetPoints: 60.75,
    });
    expect(orbPaperGeometry(es, "short", 5000, 5010)).toEqual({
      target: 4970,
      rr: 3,
      targetPoints: 30,
    });
    expect(() => orbPaperGeometry(nq, "long", 100, 100)).toThrow(/stop/i);
    expect(() => orbPaperGeometry(es, "long", 5000, 4995)).toThrow(/outside/i);
  });

  it("strictly recognizes only TradeLocker NAS100 CFDs and validates their server-proven tick profile", () => {
    const nasConfig: OrbConfig = {
      ...ORB_DEFAULT_CONFIG,
      marketMode: "nas100-cfd",
      instrumentMarket: nas100.id,
      priceTick: 0.1,
    };
    expect(isNas100CfdMarket(nas100)).toBe(true);
    for (const denied of [
      { ...nas100, id: "NAS100" },
      { ...nas100, providerSymbol: "USTEC" },
      { ...nas100, provider: "pending" as const },
      { ...nas100, category: "Futures" as const },
      { ...nas100, providerSymbol: "XAUUSD" },
      { ...nas100, category: "Crypto" as const, providerSymbol: "BTCUSD" },
    ])
      expect(isNas100CfdMarket(denied)).toBe(false);

    expect(resolveOrbMarketProfile(nas100, nasConfig, nas100Metadata)).toEqual({
      mode: "nas100-cfd",
      label: "NAS100 CFD app adaptation",
      tick: 0.1,
      minimumTargetPoints: 50,
      maximumTargetPoints: 150,
    });
    expect(() => resolveOrbMarketProfile(nas100, nasConfig)).toThrow(
      /metadata is missing.*no price tick is inferred/i,
    );
    expect(() =>
      resolveOrbMarketProfile(
        nas100,
        { ...nasConfig, instrumentMarket: "TL:999" },
        nas100Metadata,
      ),
    ).toThrow(/instrumentMarket/i);
    expect(() =>
      resolveOrbMarketProfile(
        nas100,
        { ...nasConfig, priceTick: 0.25 },
        nas100Metadata,
      ),
    ).toThrow(/priceTick.*exactly match/i);
    expect(() =>
      resolveOrbMarketProfile(nas100, nasConfig, {
        ...nas100Metadata,
        source: "",
      }),
    ).toThrow(/non-empty source/i);
    expect(() =>
      resolveOrbMarketProfile(nas100, ORB_DEFAULT_CONFIG, nas100Metadata),
    ).toThrow(/Native-futures/i);
  });

  it("emits a configured NAS100 CFD paper bracket only from same-source server tick metadata", () => {
    const nasConfig: Partial<OrbConfig> = {
      marketMode: "nas100-cfd",
      instrumentMarket: nas100.id,
      priceTick: nas100Metadata.priceTick,
    };
    const out = analyzeOrb(
      baseInput({
        market: nas100,
        orbRangeFeed: nas100Range(),
        orbInstrumentMetadata: nas100Metadata,
        candles: nas100Sequence(),
      }),
      strategy(nasConfig),
    );
    const long = candidate(out, "long");
    expect(long.ready).toBe(true);
    expect(long.entry).toBe(20010);
    expect(long.stop).toBeCloseTo(19988.9, 8);
    expect(long.target).toBeCloseTo(20073.3, 8);
    expect(
      long.steps.find((item) => item.id === "orb-market")?.evidence,
    ).toMatch(
      /not NQ equivalence.*source-video evidence.*validated trading edge/i,
    );
    expect(out.context.config).toMatchObject(nasConfig);
    expect(out.context.instrumentMetadata).toEqual(nas100Metadata);
    const geometry = orbPaperGeometry(
      nas100,
      "long",
      20010,
      19988.9,
      { ...ORB_DEFAULT_CONFIG, ...nasConfig },
      nas100Metadata,
    );
    expect(geometry.rr).toBe(3);
    expect(geometry.targetPoints).toBeCloseTo(63.3, 8);
    expect(geometry.target).toBeCloseTo(20073.3, 8);

    const blocked = analyzeOrb(
      baseInput({
        market: nas100,
        orbRangeFeed: nas100Range(),
        candles: nas100Sequence(),
      }),
      strategy(nasConfig),
    );
    expect(candidate(blocked, "long").ready).toBe(false);
    expect(
      candidate(blocked, "long").steps.find((item) => item.id === "orb-market")
        ?.evidence,
    ).toMatch(/metadata is missing.*no price tick is inferred/i);

    const wrongSource = analyzeOrb(
      baseInput({
        market: nas100,
        orbRangeFeed: nas100Range(),
        orbInstrumentMetadata: { ...nas100Metadata, source: "OTHER source" },
        candles: nas100Sequence(),
      }),
      strategy(nasConfig),
    );
    expect(candidate(wrongSource, "long").ready).toBe(false);
    expect(wrongSource.context.instrumentMetadata).toBeUndefined();
    expect(
      candidate(wrongSource, "long").steps.find(
        (item) => item.id === "orb-market",
      )?.evidence,
    ).toMatch(/metadata.source must exactly equal the execution source/i);
  });

  it("will not reuse stale/pre-window confirmation or infer across a one-minute gap", () => {
    const staleBars = [
      ...sequence("long"),
      candle(fixed(9, 1), 92, 94, 91, 92),
    ];
    const stale = analyzeOrb(
      baseInput({
        now: fixed(9, 2),
        orbRangeFeed: exactRange(),
        candles: staleBars,
      }),
      strategy(),
    );
    expect(candidate(stale, "long").ready).toBe(false);
    expect(candidate(stale, "long").entry).toBeUndefined();
    expect(status(stale, "long", "orb-continuation")).toBe("waiting");

    const preWindow = analyzeOrb(
      baseInput({
        now: fixed(8, 34),
        orbRangeFeed: exactRange(),
        candles: sequence("long", 8, 32),
      }),
      strategy(),
    );
    expect(candidate(preWindow, "long").ready).toBe(false);
    expect(status(preWindow, "long", "orb-clock")).toBe("waiting");

    const gapBars = sequence("long").filter((bar) => bar.time !== fixed(8, 40));
    const gap = analyzeOrb(
      baseInput({ orbRangeFeed: exactRange(), candles: gapBars }),
      strategy(),
    );
    expect(candidate(gap, "long").ready).toBe(false);
    expect(candidate(gap, "long").entry).toBeUndefined();
  });

  it("treats 11:00 as excluded and preserves fixed EST versus the explicit New York DST override", () => {
    const atEleven = analyzeOrb(
      baseInput({
        now: fixed(11, 2),
        orbRangeFeed: exactRange(),
        candles: sequence("long", 11, 0),
      }),
      strategy(),
    );
    expect(status(atEleven, "long", "orb-clock")).toBe("failed");
    expect(candidate(atEleven, "long").ready).toBe(false);

    const summerNow = utc(13, 2, 6, 15); // 09:02 EDT, 08:02 fixed EST
    const clockBar = candle(utc(13, 0, 6, 15), 100, 101, 99, 100);
    const fixedClock = analyzeOrb(
      baseInput({ now: summerNow, candles: [clockBar] }),
      strategy(),
    );
    const dstClock = analyzeOrb(
      baseInput({ now: summerNow, candles: [clockBar] }),
      strategy({ timezone: "America/New_York" }),
    );
    expect(status(fixedClock, "long", "orb-clock")).toBe("waiting");
    expect(status(dstClock, "long", "orb-clock")).toBe("met");
  });

  it("denies CFD-like market identity and unconfirmed configuration without emitting a signal", () => {
    const cfdLike: Market = { ...nq, category: "Indices", name: "NQ CFD" };
    const wrongMarket = analyzeOrb(
      baseInput({
        market: cfdLike,
        orbRangeFeed: exactRange(),
        candles: sequence("long"),
      }),
      strategy(),
    );
    expect(status(wrongMarket, "long", "orb-market")).toBe("failed");
    expect(candidate(wrongMarket, "long").ready).toBe(false);
    expect(candidate(wrongMarket, "long").target).toBeUndefined();

    const notConfirmed = analyzeOrb(
      baseInput({ orbRangeFeed: exactRange(), candles: sequence("long") }),
      strategy({ confirmed: false }),
    );
    expect(status(notConfirmed, "long", "orb-config")).toBe("failed");
    expect(candidate(notConfirmed, "long").ready).toBe(false);
  });

  it("keeps explicitly chosen complete hourly session levels only while untapped and marks partial context unknown", () => {
    const sessions: OrbConfig["sessions"] = [
      { id: "asia", timezone: "America/New_York", startHour: 0, endHour: 2 },
    ];
    const hourly = [
      candle(utc(5), 90, 101, 89, 95),
      candle(utc(6), 95, 102, 90, 96),
    ];
    const complete = analyzeOrb(
      baseInput({
        orbRangeFeed: exactRange(),
        candles: sequence("long"),
        hourly,
      }),
      strategy({ sessions }),
    );
    expect(
      complete.context.sessionLevels.map((item) => item.side).sort(),
    ).toEqual(["high", "low"]);
    expect(
      complete.levels.some((item) => item.name === "asia high (untapped)"),
    ).toBe(true);
    expect(status(complete, "long", "orb-session-context")).toBe("met");

    const tapped = analyzeOrb(
      baseInput({
        orbRangeFeed: exactRange(),
        candles: sequence("long"),
        hourly: [...hourly, candle(utc(7), 96, 103, 88, 97)],
      }),
      strategy({ sessions }),
    );
    expect(tapped.context.sessionLevels).toEqual([]);

    const partial = analyzeOrb(
      baseInput({
        orbRangeFeed: exactRange(),
        candles: sequence("long"),
        hourly: [hourly[0]],
      }),
      strategy({ sessions }),
    );
    expect(partial.context.sessionLevels).toEqual([]);
    expect(status(partial, "long", "orb-session-context")).toBe("unknown");
  });
});
