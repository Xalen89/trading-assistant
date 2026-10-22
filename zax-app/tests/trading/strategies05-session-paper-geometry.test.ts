import { describe, expect, it } from "vitest";
import type { Candle, Market, Quote, Strategy } from "../../lib/trading/model";
import { detectPdcContinuation } from "../../lib/trading/pdc-continuation";
import { sessionPaperGeometry } from "../../lib/trading/session-paper-geometry";
import {
  PIVOT_DEFAULT_CONFIG,
  type PivotConfig,
} from "../../lib/trading/session-strategy-model";
import { SESSION_STRATEGY_PRESETS } from "../../lib/trading/session-strategy-presets";
import { analyzeSetups, proposePaper } from "../../lib/trading/setup-engine";
import type { SetupCandidate, SetupInput } from "../../lib/trading/setup-model";

// Pure software fixtures only: no provider, account, database, or paper-order call.
const utc = (hour: number, minute = 0, day = 15) =>
  Date.UTC(2026, 0, day, hour, minute) / 1_000;
const fixed = (hour: number, minute = 0, day = 15) =>
  utc(hour + 5, minute, day);
const SOURCE = "Unit provider provenance label";
const IDENTITY = "opaque:unit:account-route-a";
const market: Market = {
  id: "UNIT",
  name: "Unit fixture market",
  category: "Stocks",
  provider: "fmp",
  providerSymbol: "UNIT",
  precision: 2,
  pointValue: 1,
  paperSupported: true,
};

function candle(
  time: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume = 100,
): Candle {
  return { time, open, high, low, close, volume };
}

function quote(
  price: number,
  timestamp: number,
  source = SOURCE,
  sourceIdentity: string | null = IDENTITY,
): Quote {
  return {
    price,
    timestamp,
    source,
    ...(sourceIdentity === null ? {} : { sourceIdentity }),
    symbol: market.id,
    change: 0,
    status: "live",
  };
}

function strategy(overrides: Partial<PivotConfig> = {}): Strategy {
  return {
    ...structuredClone(SESSION_STRATEGY_PRESETS[2]),
    id: "strategies05-pdc",
    name: "Strategies 05 PDC",
    description: "Pure dynamic-target regression fixture",
    version: 1,
    source: SOURCE,
    sessionConfig: {
      ...PIVOT_DEFAULT_CONFIG,
      confirmed: true,
      pdcBasis: "provider-utc-day",
      priceTick: 0.01,
      targetMode: "previous-day-extremes",
      ...overrides,
    },
  };
}

function morning(): Candle[] {
  return [0, 1, 2, 3, 4].map((offset) =>
    candle(
      fixed(9, 30 + offset),
      99 + offset * 0.2,
      99.5 + offset * 0.2,
      98.5 + offset * 0.1,
      99.2 + offset * 0.2,
    ),
  );
}

function input(overrides: Partial<SetupInput> = {}): SetupInput {
  const now = fixed(9, 35);
  return {
    market,
    timeframe: "1m",
    candles: [
      candle(fixed(9, 33), 99.4, 100.1, 99.2, 99.8, 100),
      candle(fixed(9, 34), 99.8, 100.3, 99.7, 100.1, 200),
    ],
    daily: [candle(utc(0, 0, 14), 98, 105, 97, 100, 1_000)],
    hourly: [],
    strategies: [strategy()],
    patterns: [],
    combination: "any",
    timezone: "Etc/UTC",
    now,
    source: SOURCE,
    sourceIdentity: IDENTITY,
    dailySource: SOURCE,
    dailySourceIdentity: IDENTITY,
    hourlySource: SOURCE,
    dailyPeriodBasis: "utc-continuous-24h",
    volumeBasis: "venue",
    pivotMinuteFeed: {
      candles: morning(),
      source: SOURCE,
      sourceIdentity: IDENTITY,
      timeframe: "1m",
      volumeBasis: "venue",
    },
    quoteObservations: {
      previous: quote(99.9, fixed(9, 34) + 30),
      current: quote(100.2, now),
      observedAt: now,
      method: "owner-persisted-rest-observations",
    },
    ...overrides,
  };
}

function longCandidate(
  analysis: ReturnType<typeof analyzeSetups>,
): SetupCandidate & { entry: number; stop: number } {
  const candidate = analysis.candidates.find(
    (item) => item.family === "pdc-continuation" && item.side === "long",
  );
  if (!candidate?.entry || !candidate.stop) {
    throw new Error("Expected a complete synthetic PDC long candidate.");
  }
  return candidate as SetupCandidate & { entry: number; stop: number };
}

describe("strategies05 previous-day PDC paper geometry — pure fixtures", () => {
  it("carries verified prior-day evidence through a ready detector into a paper-only proposal", () => {
    const analysis = analyzeSetups(input({ skipHistorical: true }));
    const candidate = longCandidate(analysis);
    const context = analysis.sessionContexts?.find(
      (item) => item.strategyId === candidate.strategyId,
    );

    expect(candidate).toMatchObject({
      ready: true,
      entry: 100.2,
      stop: 98.49,
      target: 105,
    });
    expect(context?.previousDay).toEqual({
      high: 105,
      low: 97,
      date: "2026-01-14",
      closeAt: utc(0, 0, 15),
      source: SOURCE,
      sourceIdentity: IDENTITY,
    });
    expect(analysis.estimate.probability).toBeNull();

    const proposal = proposePaper(
      analysis,
      market,
      "long",
      candidate.entry,
      10_000,
      1,
    );
    expect(proposal).toMatchObject({
      entry: candidate.entry,
      stop: candidate.stop,
      target: 105,
    });
  });

  it("rejects a forged cross-origin quote at source geometry even after a ready detector result", () => {
    const analysis = analyzeSetups(input({ skipHistorical: true }));
    const candidate = longCandidate(analysis);
    const context = analysis.sessionContexts?.find(
      (item) => item.strategyId === candidate.strategyId,
    );
    if (!context) {
      throw new Error("Expected a synthetic PDC context.");
    }
    const quoteEvidence = context.quoteEvidence;
    if (!quoteEvidence) {
      throw new Error("Expected a persisted synthetic quote pair.");
    }

    expect(() =>
      sessionPaperGeometry(
        context.config,
        {
          ...context,
          quoteEvidence: {
            ...quoteEvidence,
            current: {
              ...quoteEvidence.current,
              sourceIdentity: "opaque:other-route",
            },
          },
        },
        "long",
        candidate.entry,
        candidate.stop,
      ),
    ).toThrow(/exact source identity/i);
  });

  it("rejects a mismatched prior-day date, close or inverted range", () => {
    const analysis = analyzeSetups(input({ skipHistorical: true }));
    const candidate = longCandidate(analysis);
    const context = analysis.sessionContexts?.find(
      (item) => item.strategyId === candidate.strategyId,
    );
    if (!context?.previousDay)
      throw new Error("Expected verified day context.");
    for (const change of [
      { date: "2026-01-13" },
      { closeAt: context.previousDay.closeAt - 86_400 },
      { high: 96, low: 97 },
    ]) {
      expect(() =>
        sessionPaperGeometry(
          context.config,
          { ...context, previousDay: { ...context.previousDay!, ...change } },
          "long",
          candidate.entry,
          candidate.stop,
        ),
      ).toThrow(/previous-day high\/low source target/);
    }
  });

  it("rejects a provider-label prefix when an opaque identity is declared, while exact legacy labels remain supported", () => {
    const brokerLabel = "TradeLocker · selected account · bar source";
    const prefixedQuote = "TradeLocker · another account · bid/ask";
    const prefixed = detectPdcContinuation(
      input({
        market: { ...market, provider: "tradelocker" },
        source: brokerLabel,
        dailySource: brokerLabel,
        pivotMinuteFeed: {
          candles: morning(),
          source: brokerLabel,
          sourceIdentity: IDENTITY,
          timeframe: "1m",
          volumeBasis: "venue",
        },
        quoteObservations: {
          previous: quote(99.9, fixed(9, 34) + 30, prefixedQuote, null),
          current: quote(100.2, fixed(9, 35), prefixedQuote, null),
          observedAt: fixed(9, 35),
          method: "owner-persisted-rest-observations",
        },
      }),
      strategy(),
    );
    const rejected = prefixed.candidates.find((item) => item.side === "long")!;
    expect(rejected.ready).toBe(false);
    expect(
      rejected.steps.find((item) => item.id === "pivot-quote-cross")?.status,
    ).toBe("failed");

    const legacy = detectPdcContinuation(
      input({
        sourceIdentity: undefined,
        dailySourceIdentity: undefined,
        quoteObservations: {
          previous: quote(99.9, fixed(9, 34) + 30, SOURCE, null),
          current: quote(100.2, fixed(9, 35), SOURCE, null),
          observedAt: fixed(9, 35),
          method: "owner-persisted-rest-observations",
        },
      }),
      strategy(),
    );
    expect(legacy.candidates.find((item) => item.side === "long")?.ready).toBe(
      true,
    );
  });
});
