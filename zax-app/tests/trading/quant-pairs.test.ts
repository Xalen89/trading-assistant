import { describe, expect, it } from "vitest";
import type { Candle } from "../../lib/trading/model";
import type {
  QuantLabInput,
  QuantSeries,
} from "../../lib/trading/quant-lab-types";
import { runPairs } from "../../lib/trading/quant-pairs";

// These are deliberately synthetic algorithm fixtures, not market data or performance evidence.
const START = 1_700_000_000;
const TIMEFRAME_SECONDS = 60;

function candle(time: number, close: number): Candle {
  return {
    time,
    open: close,
    high: close + 0.25,
    low: close - 0.25,
    close,
    volume: 100,
  };
}

function syntheticPair(
  count = 160,
  rightProvenance: "provider" | "user-import" = "provider",
): QuantSeries[] {
  const left: Candle[] = [];
  const right: Candle[] = [];
  for (let index = 0; index < count; index += 1) {
    const rightClose = 100 + index * 0.2;
    let residual = Math.sin(index * 0.47) * 0.35;
    if (index % 17 === 0) residual += index % 34 === 0 ? 4 : -4;
    if (index === count - 1) residual = 8;
    right.push(candle(START + index * TIMEFRAME_SECONDS, rightClose));
    left.push(
      candle(
        START + index * TIMEFRAME_SECONDS,
        50 + 1.5 * rightClose + residual,
      ),
    );
  }
  const now = (START + count * TIMEFRAME_SECONDS) * 1_000;
  return [
    {
      symbol: "SYNTH-LEFT",
      timeframe: "1m",
      source: "Synthetic algorithm fixture — not performance evidence",
      candles: left,
      fetchedAt: now,
      provenance: "provider",
    },
    {
      symbol: "SYNTH-RIGHT",
      timeframe: "1m",
      source: "Synthetic algorithm fixture — not performance evidence",
      candles: right,
      fetchedAt: now,
      provenance: rightProvenance,
    },
  ];
}

function input(
  series = syntheticPair(),
  overrides: Partial<QuantLabInput["settings"]> = {},
): QuantLabInput {
  return {
    family: "pairs",
    series,
    now: (START + 160 * TIMEFRAME_SECONDS) * 1_000,
    settings: {
      lookback: 30,
      entryZ: 2,
      exitZ: 0.5,
      feeBps: 0,
      slippageBps: 0,
      holdingBars: 2,
      startingEquity: 10_000,
      inventory: 0,
      orderSize: 1,
      maxInventory: 1,
      ...overrides,
    },
  };
}

function metricValue(
  result: ReturnType<typeof runPairs>,
  key: string,
): number | string | null | undefined {
  return result.metrics.find((item) => item.key === key)?.value;
}

describe("runPairs — synthetic algorithm fixtures only, never performance evidence", () => {
  it("builds a synchronized OLS two-leg exploratory diagnostic with an explicit OOS boundary", () => {
    const result = runPairs(input());

    expect(result.status).toBe("ready");
    expect(result.family).toBe("pairs");
    expect(result.asOf).toBe((START + 159 * TIMEFRAME_SECONDS) * 1_000);
    expect(metricValue(result, "synchronized-bars")).toBe(160);
    expect(String(metricValue(result, "cointegration-diagnostic"))).toContain(
      "p=",
    );
    const p = metricValue(result, "cointegration-p");
    expect(p === null || typeof p === "number").toBe(true);
    expect(result.validation).toMatchObject({
      status: "unconfirmed",
      trainSamples: 112,
      testSamples: 48,
      walkForward: true,
      untouchedHoldout: false,
    });
    expect(
      result.validation.reasons.some((reason) => reason.includes("100")),
    ).toBe(true);
    expect(result.equity[0]).toEqual({
      time: START + 112 * TIMEFRAME_SECONDS,
      value: 10_000,
    });
    expect(
      result.equity.every(
        (point) => Number.isFinite(point.time) && Number.isFinite(point.value),
      ),
    ).toBe(true);
    expect(metricValue(result, "hedge-ratio")).toBeTypeOf("number");
    expect([0, 2]).toContain(result.signals.length);
    if (result.signals.length)
      expect(metricValue(result, "cointegration-decision")).toBe(
        "reject-no-cointegration",
      );
    if (result.signals.length) expect(result.paperPlan?.legs).toHaveLength(2);
    else expect(result.paperPlan).toBeUndefined();
    expect(result.limitations.join(" ")).toContain(
      "Engle–Granger diagnostic requires at least 30 completed observations",
    );
  });

  it("filters future/unclosed data causally without changing the closed-bar result", () => {
    const baseline = runPairs(input());
    const contaminated = syntheticPair();
    const futureTime = START + 200 * TIMEFRAME_SECONDS;
    for (const series of contaminated)
      series.candles.push(candle(futureTime, 999));

    const result = runPairs(input(contaminated));
    expect(result.status).toBe("ready");
    expect(result.asOf).toBe(baseline.asOf);
    expect(result.signals).toEqual(baseline.signals);
    expect(result.equity).toEqual(baseline.equity);
    expect(
      result.limitations.some((item) =>
        item.includes("unclosed or future bars were excluded"),
      ),
    ).toBe(true);
  });

  it("does not select conflicting duplicate, zero-price, or irregular rows to manufacture a pair", () => {
    const series = syntheticPair();
    const duplicateAt = series[0].candles[40];
    series[0].candles.push({
      ...duplicateAt,
      close: duplicateAt.close + 2,
      high: duplicateAt.high + 2,
      low: duplicateAt.low + 2,
      open: duplicateAt.open + 2,
    });
    series[1].candles.push(candle(START + 80 * TIMEFRAME_SECONDS, 0));
    series[1].candles = series[1].candles.filter(
      (bar) => bar.time !== START + 90 * TIMEFRAME_SECONDS,
    );

    const result = runPairs(input(series));
    expect(result.status).toBe("ready");
    expect(metricValue(result, "synchronized-bars")).toBe(158);
    expect(
      result.limitations.some((item) =>
        item.includes("conflicting duplicate timestamps were excluded"),
      ),
    ).toBe(true);
    expect(
      result.limitations.some((item) =>
        item.includes("irregular synchronized timestamp gaps"),
      ),
    ).toBe(true);
  });

  it("keeps provider and user-import provenance distinct and never relabels an import", () => {
    const result = runPairs(input(syntheticPair(160, "user-import")));

    expect(result.status).toBe("ready");
    expect(metricValue(result, "left-source")).toContain("provider");
    expect(metricValue(result, "right-source")).toContain("user-import");
    expect(
      result.limitations.some((item) =>
        item.includes(
          "Provider and user-import provenance remain separately labelled",
        ),
      ),
    ).toBe(true);
  });

  it("uses only supplied generic fee/slippage assumptions in a lagged, costed two-leg equity path", () => {
    const noCost = runPairs(input());
    const costed = runPairs(
      input(syntheticPair(), { feeBps: 12, slippageBps: 8 }),
    );

    expect(costed.status).toBe("ready");
    expect(metricValue(noCost, "modeled-two-leg-costs")).toBe(0);
    expect(metricValue(costed, "modeled-two-leg-costs")).toBeTypeOf("number");
    expect(
      metricValue(costed, "modeled-two-leg-costs") as number,
    ).toBeGreaterThan(0);
    expect(costed.equity.at(-1)!.value).toBeLessThan(
      noCost.equity.at(-1)!.value,
    );
    expect(
      costed.validation.reasons.some((reason) =>
        reason.includes("user-supplied generic bps"),
      ),
    ).toBe(true);
  });

  it("rejects a lookback below the Engle–Granger minimum before running the pairs diagnostic", () => {
    const result = runPairs(input(syntheticPair(), { lookback: 29 }));

    expect(result.status).toBe("unavailable");
    expect(result.validation.reasons).toContain(
      "lookback must be an integer from 30 to 500; the present-window Engle–Granger diagnostic requires at least 30 completed observations.",
    );
  });

  it("requires sufficient synchronized history and rejects baskets rather than choosing a single leg", () => {
    const tooShort = runPairs(input(syntheticPair(80)));
    const series = syntheticPair();
    const basket = runPairs({
      ...input(series),
      series: [...series, ...series, ...series, ...series, ...series],
    });

    expect(tooShort.status).toBe("insufficient-data");
    expect(tooShort.dataRequirements.some((item) => item.includes("100"))).toBe(
      true,
    );
    expect(basket.status).toBe("unavailable");
    expect(basket.summary).toContain("Too many assets");
  });

  it("uses the 252/63 formation protocol when supplied history permits and keeps advanced diagnostics descriptive", () => {
    const longHistory = input(syntheticPair(900));
    longHistory.now = (START + 900 * TIMEFRAME_SECONDS) * 1_000;
    const settings = longHistory.settings as typeof longHistory.settings & {
      hedgeMethod?: "kalman";
    };
    settings.hedgeMethod = "kalman";
    const result = runPairs(longHistory);

    expect(result.status).toBe("ready");
    expect(metricValue(result, "formation-window")).toBe(252);
    expect(metricValue(result, "trading-window")).toBe(63);
    expect(metricValue(result, "formation-blocks")).toBe("enabled");
    expect(metricValue(result, "hedge-method")).toBe("kalman");
    expect(metricValue(result, "hurst-exponent")).toBeTypeOf("number");
    expect(metricValue(result, "johansen-trace-rank")).toBe("unsupported");
    expect(metricValue(result, "kelly-research-status")).toMatch(
      /available|unavailable/,
    );
    expect(result.validation.status).toBe("unconfirmed");
    expect(result.limitations.join(" ")).toContain("not a stationarity");
  });
});
