import { describe, expect, it } from "vitest";
import type { Candle } from "../../lib/trading/model";
import {
  analyzeVwapStdv,
  rollingVwapStdv,
  VWAP_STDV_DEFAULTS,
} from "../../lib/trading/vwap-stdv";

const start = 1_700_000_000;
const source = "Coinbase Exchange · synthetic single-venue OHLCV fixture";
const strategy = {
  id: "vwap-stdv-unit",
  name: "VWAP ±2.5σ mean reversion",
  version: 1,
  source: "Foundry scope 04 line 137",
};

function candle(
  index: number,
  close: number,
  volume = 100,
  high = close + 1,
  low = close - 1,
): Candle {
  return {
    time: start + index * 60,
    open: close,
    high,
    low,
    close,
    volume,
  };
}

const atClose = (bars: Candle[]) => start + bars.length * 60;
const candidate = (
  bars: Candle[],
  side: "long" | "short",
  dataSource = source,
) =>
  analyzeVwapStdv(
    strategy,
    bars,
    "1m",
    dataSource,
    atClose(bars),
  ).candidates.find((item) => item.side === side)!;

function lowerReentry(): Candle[] {
  return [
    ...Array.from({ length: 19 }, (_, index) => candle(index, 100)),
    candle(19, 50, 100, 101, 49),
    candle(20, 90, 100, 91, 89),
  ];
}

function upperReentry(): Candle[] {
  return [
    ...Array.from({ length: 19 }, (_, index) => candle(index, 100)),
    candle(19, 150, 100, 151, 99),
    candle(20, 110, 100, 111, 109),
  ];
}

describe("rolling VWAP ±2.5σ", () => {
  it("excludes forming/future bars and is prefix-causal", () => {
    const prefix = Array.from({ length: 21 }, (_, index) =>
      candle(index, 100 + index),
    );
    const future = candle(99, 9_999, 10_000, 10_000, 9_998);
    const now = atClose(prefix);
    const withFuture = rollingVwapStdv([...prefix, future], "1m", source, now);
    const withoutFuture = rollingVwapStdv(prefix, "1m", source, now);

    expect(withFuture.sourceBars).toEqual(prefix);
    expect(withFuture.points).toEqual(withoutFuture.points);
    expect(withFuture.sourceAsOf).toBe(prefix.at(-1)?.time);
    expect(withFuture.sourceCloseAsOf).toBe(now);
  });

  it("rolls off the oldest bar rather than retaining a cumulative VWAP", () => {
    const bars = Array.from({ length: 21 }, (_, index) =>
      candle(index, index + 1, 1, index + 1, index + 1),
    );
    const curves = rollingVwapStdv(bars, "1m", source, atClose(bars));

    expect(curves.points[18].vwap).toBeUndefined();
    expect(curves.points[19].vwap).toBeCloseTo(10.5, 12);
    expect(curves.points[20].vwap).toBeCloseTo(11.5, 12);
    expect(curves.points[20].sigma).toBeCloseTo(Math.sqrt(33.25), 12);
    expect(curves.points[20].upper).toBeCloseTo(
      11.5 + VWAP_STDV_DEFAULTS.sigmaMultiplier * Math.sqrt(33.25),
      12,
    );
  });

  it("does not synthesize volume: a zero-volume bar has zero weight and all-zero windows are unavailable", () => {
    const zeroWeight = [
      ...Array.from({ length: 19 }, (_, index) =>
        candle(index, 100, 100, 100, 100),
      ),
      candle(19, 10_000, 0, 10_000, 10_000),
    ];
    const curves = rollingVwapStdv(
      zeroWeight,
      "1m",
      source,
      atClose(zeroWeight),
    );
    const point = curves.points.at(-1)!;
    expect(point.volumeState).toBe("zero");
    expect(point.windowState).toBe("ready");
    expect(point.windowVolume).toBe(1_900);
    expect(point.vwap).toBe(100);
    expect(point.sigma).toBe(0);
    expect(curves.messages.join(" ")).toContain("exactly zero weight");

    const allZero = Array.from({ length: 20 }, (_, index) =>
      candle(index, 100, 0),
    );
    const unavailable = rollingVwapStdv(
      allZero,
      "1m",
      source,
      atClose(allZero),
    ).points.at(-1)!;
    expect(unavailable.windowState).toBe("zero-total-volume");
    expect(unavailable.vwap).toBeUndefined();
    expect(unavailable.sigma).toBeUndefined();
  });

  it("keeps a missing volume observation in its rolling window and never imputes it", () => {
    const bars = Array.from({ length: 20 }, (_, index) => candle(index, 100));
    bars[11] = { ...bars[11], volume: Number.NaN };
    const curves = rollingVwapStdv(bars, "1m", source, atClose(bars));
    const latest = curves.points.at(-1)!;

    expect(curves.sourceBars).toHaveLength(20);
    expect(curves.points[11].volumeState).toBe("missing");
    expect(latest.windowState).toBe("missing-volume");
    expect(latest.vwap).toBeUndefined();
    expect(curves.messages.join(" ")).toContain("volume is never imputed");
  });

  it("keeps a broker/proxy volume source non-ready even when price re-entry is met", () => {
    const setup = candidate(lowerReentry(), "long", "TradeLocker broker OHLCV");

    expect(setup.sourceKnownVolume).toBe(false);
    expect(
      setup.steps.find((item) => item.id === "vwap-stdv-known-volume")?.status,
    ).toBe("unknown");
    expect(
      setup.steps.find((item) => item.id === "vwap-stdv-prior-outside")?.status,
    ).toBe("met");
    expect(
      setup.steps.find((item) => item.id === "vwap-stdv-reentry")?.status,
    ).toBe("met");
    expect(setup.ready).toBe(false);
  });

  it("forms a closed-bar lower-band re-entry with an app-authored recent-low stop and VWAP target", () => {
    const bars = lowerReentry();
    const setup = candidate(bars, "long");

    expect(setup.declaredFamily).toBe("vwap-stdv");
    expect(setup.sourceKnownVolume).toBe(true);
    expect(setup.ready).toBe(true);
    expect(setup.entry).toBe(90);
    expect(setup.stop).toBe(49);
    expect(setup.target).toBeGreaterThan(setup.entry!);
    expect(setup.steps.map((item) => item.id)).toEqual([
      "vwap-stdv-source-bars",
      "vwap-stdv-known-volume",
      "vwap-stdv-window",
      "vwap-stdv-prior-outside",
      "vwap-stdv-reentry",
      "vwap-stdv-stop-extreme",
      "vwap-stdv-target-vwap",
    ]);
    expect(
      setup.steps.find((item) => item.id === "vwap-stdv-stop-extreme")
        ?.evidence,
    ).toContain("app-authored");
    expect(
      setup.steps.find((item) => item.id === "vwap-stdv-target-vwap")?.evidence,
    ).toContain("app-authored");
  });

  it("forms the mirrored closed-bar upper-band re-entry with a recent-high stop", () => {
    const setup = candidate(upperReentry(), "short");

    expect(setup.ready).toBe(true);
    expect(setup.entry).toBe(110);
    expect(setup.stop).toBe(151);
    expect(setup.target).toBeLessThan(setup.entry!);
    expect(
      setup.steps.find((item) => item.id === "vwap-stdv-prior-outside")?.status,
    ).toBe("met");
    expect(
      setup.steps.find((item) => item.id === "vwap-stdv-reentry")?.status,
    ).toBe("met");
  });
});
