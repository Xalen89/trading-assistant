import { describe, expect, it } from "vitest";
import { ORB_STRATEGY } from "../../lib/trading/orb-presets";
import { ORB_DEFAULT_CONFIG } from "../../lib/trading/orb-model";
import { analyzeSetups, proposePaper } from "../../lib/trading/setup-engine";
import {
  draftConfluence,
  evaluateSetupConfluence,
} from "../../lib/trading/confluence-runtime";
import type { Market, Candle } from "../../lib/trading/model";
import type { SetupInput } from "../../lib/trading/setup-model";
const opening = Date.UTC(2026, 9, 19, 13) / 1000;
const breakout = opening + 3600;
const now = (breakout + 185) * 1000;
const market = {
  id: "TL:3884",
  providerSymbol: "NAS100",
  category: "Indices",
  provider: "tradelocker",
  name: "NAS100 CFD",
  pointValue: 1,
  precision: 2,
  paperSupported: true,
} as Market;
const bar = (
  time: number,
  open = 100,
  high = 101,
  low = 99,
  close = 100,
): Candle => ({ time, open, high, low, close, volume: 100 });
function input(): SetupInput {
  const candles = Array.from({ length: 45 }, (_, i) =>
    bar(opening + 900 + i * 60),
  );
  candles.push(
    bar(breakout, 119, 123, 118, 122),
    bar(breakout + 60, 122, 124, 97, 110),
    bar(breakout + 120, 110, 127, 109, 125),
  );
  return {
    market,
    timeframe: "1m",
    candles,
    daily: [],
    hourly: [],
    patterns: [],
    combination: "all",
    timezone: "Etc/GMT+5",
    now: now / 1000,
    source: "UNIT selected NAS100",
    hourlySource: "UNIT no HTF",
    dailySource: "UNIT no daily",
    strategies: [
      {
        ...ORB_STRATEGY,
        orbConfig: {
          ...ORB_DEFAULT_CONFIG,
          marketMode: "nas100-cfd",
          instrumentMarket: market.id,
          priceTick: 0.1,
        },
      },
    ],
    orbRangeFeed: {
      candles: [bar(opening, 100, 120, 80, 101)],
      source: "UNIT selected NAS100",
      timeframe: "15m",
    },
    orbInstrumentMetadata: {
      market: market.id,
      priceTick: 0.1,
      source: "UNIT actual broker minimum increment",
      executionSource: "UNIT selected NAS100",
    },
  };
}
function gate(
  analysis: ReturnType<typeof analyzeSetups>,
  source: SetupInput["strategies"][number],
) {
  const candidate = analysis.candidates.find(
    (c) => c.family === "orb" && c.side === "long",
  )!;
  const config = draftConfluence(source, candidate, "1m");
  config.contract.approval = {
    status: "approved",
    approvedAt: now - 1,
    approvedBy: "UNIT_OWNER",
  };
  return { candidate, config };
}
describe("NAS100 ORB end-to-end source fixtures — not predictive validation", () => {
  it("uses the same strategy/range identity, actual broker tick once, and exact3R in the proposal", () => {
    const source = input();
    const analysis = analyzeSetups(source);
    const { candidate, config } = gate(analysis, source.strategies[0]);
    expect(candidate.ready).toBe(true);
    expect(candidate.stop).toBeCloseTo(97 - 0.1, 8);
    expect(
      analysis.levels
        .filter((l) => l.strategyId === ORB_STRATEGY.id)
        .map((l) => l.price),
    ).toEqual(expect.arrayContaining([120, 80, 100]));
    expect(
      evaluateSetupConfluence(config, analysis, candidate, now)
        .strategyEntryEligible,
    ).toBe(true);
    const proposal = proposePaper(analysis, market, "long", 125, 100000, 1);
    expect(proposal.stop).toBe(candidate.stop);
    expect(proposal.target).toBeCloseTo(125 + 3 * (125 - candidate.stop!), 8);
    expect(proposal.rr).toBeCloseTo(3, 8);
    expect(analysis.estimate.probability).toBeNull();
    expect(analysis.estimate.rate).toBeNull();
  });
  it("rejects missing/mismatched tick and wrong selected market despite forged ready step labels", () => {
    const source = input();
    for (const change of [
      undefined,
      { market: "TL:1", priceTick: 0.1, source: "UNIT" },
      { market: market.id, priceTick: 0.25, source: "UNIT" },
    ]) {
      const analysis = analyzeSetups(source);
      const { candidate, config } = gate(analysis, source.strategies[0]);
      analysis.orbContexts![0].instrumentMetadata = change;
      expect(
        evaluateSetupConfluence(config, analysis, candidate, now)
          .strategyEntryEligible,
      ).toBe(false);
    }
    const analysis = analyzeSetups(source);
    const { candidate, config } = gate(analysis, source.strategies[0]);
    analysis.market = "TL:3366";
    expect(
      evaluateSetupConfluence(config, analysis, candidate, now)
        .strategyEntryEligible,
    ).toBe(false);
  });
  it("still blocks unconfirmed variants, wrong frame, stale continuation and missing exact source range", () => {
    for (const change of [
      (s: SetupInput) => {
        s.strategies[0].orbConfig!.confirmed = false;
      },
      (s: SetupInput) => {
        s.timeframe = "5m";
      },
      (s: SetupInput) => {
        s.candles.push(bar(breakout + 180));
        s.now += 60;
      },
      (s: SetupInput) => {
        s.orbRangeFeed!.candles = [];
      },
    ]) {
      const source = input();
      change(source);
      const analysis = analyzeSetups(source);
      expect(
        analysis.candidates.some((c) => c.family === "orb" && c.ready),
      ).toBe(false);
    }
  });
});
