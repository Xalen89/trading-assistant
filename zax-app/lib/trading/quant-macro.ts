import { SECONDS } from "./engine";
import type { Candle, Timeframe } from "./model";
import { ewmacForecast, mean } from "./quant-methods";
import {
  emptyQuantResult,
  type QuantLabInput,
  type QuantLabResult,
  type QuantMetric,
  type QuantSignal,
} from "./quant-lab-types";

/**
 * OHLC-only systematic trend implementation.
 *
 * Research scope: `research/foundry-audit/macro.md` explicitly distinguishes
 * trend/pullback hypotheses from point-in-time macro conditions and requires
 * closed-bar, no-look-ahead evaluation. This runner intentionally implements
 * only the former as a slow, multi-asset trend calculation; it does not call
 * it a macro-release or rate-differential signal.
 */
const MAX_ASSETS = 10;
const MIN_ASSETS = 2;
const MAX_BARS_PER_ASSET = 2_000;
const MIN_TREND_BARS = 20;
const MAX_TREND_BARS = 252;
const MIN_VOL_BARS = 10;
const MAX_VOL_BARS = 63;
const MIN_COMPUTED_OBSERVATIONS = 2;
const MIN_UNCONFIRMED_OBSERVATIONS = 100;
const MILLIS_FLOOR = 10_000_000_000;
const EPSILON = 1e-12;
const EWMAC_COMPONENTS = [
  [8, 32],
  [16, 64],
  [32, 128],
  [64, 256],
] as const;
const EWMAC_FORECAST_CAP = 20;

const SLOW_TIMEFRAMES: readonly Timeframe[] = ["1d", "1w"];

const MACRO_RELEASE_REQUIREMENTS =
  "Separate macro-release/vintage + rate-differential model: not available from OHLC. It requires predeclared economic release values, forecast and revision vintages, release/availability timestamps, point-in-time policy or sovereign-rate curves (or instrument-specific carry), currency and return conventions, financing/roll assumptions, and matched total-return price series.";

type PreparedSeries = {
  symbol: string;
  timeframe: Timeframe;
  source: string;
  provenance: "provider" | "user-import";
  adjustedTotalReturn: boolean;
  fetchedAt: number;
  bars: Candle[];
  notes: string[];
};

type WeightSet = {
  weights: number[];
  trends: number[];
  vols: number[];
  activeComponents: string[];
};

function finiteMillis(value: number): boolean {
  return Number.isFinite(value) && value >= MILLIS_FLOOR;
}

function validCandle(value: unknown): value is Candle {
  if (!value || typeof value !== "object") return false;
  const candle = value as Partial<Candle>;
  const fields = [
    candle.time,
    candle.open,
    candle.high,
    candle.low,
    candle.close,
    candle.volume,
  ];
  if (
    !fields.every(
      (field) => typeof field === "number" && Number.isFinite(field),
    )
  )
    return false;
  if (
    candle.time === undefined ||
    candle.open === undefined ||
    candle.high === undefined ||
    candle.low === undefined ||
    candle.close === undefined ||
    candle.volume === undefined
  )
    return false;
  return (
    candle.time > 0 &&
    candle.open > 0 &&
    candle.high > 0 &&
    candle.low > 0 &&
    candle.close > 0 &&
    candle.volume >= 0 &&
    candle.high >= candle.low &&
    candle.high >= Math.max(candle.open, candle.close) &&
    candle.low <= Math.min(candle.open, candle.close)
  );
}

/**
 * Retains real supplied closed OHLC records only. Invalid and duplicate records
 * are omitted rather than repaired; missing intervals are never filled.
 */
function prepareSeries(
  input: QuantLabInput,
  nowSeconds: number,
): { series: PreparedSeries[]; reasons: string[] } {
  const reasons: string[] = [];
  const seenSymbols = new Set<string>();
  const prepared: PreparedSeries[] = [];

  for (const rawSeries of input.series) {
    if (
      !rawSeries ||
      typeof rawSeries.symbol !== "string" ||
      !rawSeries.symbol.trim()
    ) {
      reasons.push("Every asset needs a non-empty symbol.");
      continue;
    }
    if (seenSymbols.has(rawSeries.symbol)) {
      reasons.push(
        `Duplicate asset symbol ${rawSeries.symbol}; assets are not merged.`,
      );
      continue;
    }
    seenSymbols.add(rawSeries.symbol);

    if (!SLOW_TIMEFRAMES.includes(rawSeries.timeframe)) {
      reasons.push(
        `${rawSeries.symbol} uses ${String(rawSeries.timeframe)}; this slow trend calculation accepts only 1d or 1w completed OHLC.`,
      );
      continue;
    }
    if (!Array.isArray(rawSeries.candles)) {
      reasons.push(`${rawSeries.symbol} has no candle array.`);
      continue;
    }
    if (rawSeries.candles.length > MAX_BARS_PER_ASSET) {
      reasons.push(
        `${rawSeries.symbol} has ${rawSeries.candles.length} bars; the bounded runner accepts at most ${MAX_BARS_PER_ASSET} bars per asset.`,
      );
      continue;
    }
    if (typeof rawSeries.source !== "string" || !rawSeries.source.trim()) {
      reasons.push(`${rawSeries.symbol} needs an explicit source label.`);
      continue;
    }
    if (!finiteMillis(rawSeries.fetchedAt)) {
      reasons.push(
        `${rawSeries.symbol} needs a finite Unix-millisecond fetchedAt timestamp; it is provenance metadata, not a candle time.`,
      );
      continue;
    }

    let invalid = 0;
    let unfinishedOrFuture = 0;
    const candidate: { candle: Candle; originalIndex: number }[] = [];
    rawSeries.candles.forEach((candle, originalIndex) => {
      if (!validCandle(candle)) {
        invalid += 1;
        return;
      }
      // Candle timestamps are Unix seconds; `now` is Unix milliseconds.
      if (candle.time + SECONDS[rawSeries.timeframe] > nowSeconds) {
        unfinishedOrFuture += 1;
        return;
      }
      candidate.push({ candle, originalIndex });
    });
    candidate.sort(
      (left, right) =>
        left.candle.time - right.candle.time ||
        left.originalIndex - right.originalIndex,
    );

    const bars: Candle[] = [];
    let duplicates = 0;
    for (const item of candidate) {
      if (bars.at(-1)?.time === item.candle.time) {
        duplicates += 1;
        continue;
      }
      bars.push(item.candle);
    }

    const notes: string[] = [];
    if (invalid) notes.push(`${invalid} invalid OHLC record(s) omitted`);
    if (duplicates)
      notes.push(`${duplicates} duplicate timestamp record(s) omitted`);
    if (unfinishedOrFuture)
      notes.push(`${unfinishedOrFuture} unfinished/future record(s) omitted`);
    prepared.push({
      symbol: rawSeries.symbol,
      timeframe: rawSeries.timeframe,
      source: rawSeries.source,
      provenance: rawSeries.provenance,
      adjustedTotalReturn: rawSeries.adjustedTotalReturn === true,
      fetchedAt: rawSeries.fetchedAt,
      bars,
      notes,
    });
  }
  return { series: prepared, reasons };
}

function standardDeviation(values: number[]): number | undefined {
  if (!values.length || !values.every(Number.isFinite)) return undefined;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  if (!Number.isFinite(variance) || variance < 0) return undefined;
  const result = Math.sqrt(variance);
  return Number.isFinite(result) ? result : undefined;
}

function boundedInteger(
  value: number,
  minimum: number,
  maximum: number,
): number | undefined {
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return Math.max(minimum, Math.min(maximum, Math.floor(value)));
}

/**
 * Targets used during `periodIndex` were known at its prior common-bar close.
 * Each available EWMAC component is causal, volatility-normalized, and capped
 * before its normalized forecast enters inverse-volatility risk weighting.
 */
function delayedWeights(
  aligned: readonly Candle[][],
  periodIndex: number,
  volBars: number,
): WeightSet | undefined {
  const signalIndex = periodIndex - 1;
  if (signalIndex < 0 || signalIndex - volBars < 0) return undefined;

  const rawRiskWeights: number[] = [];
  const trends: number[] = [];
  const vols: number[] = [];
  let activeComponents: string[] | undefined;
  for (const bars of aligned) {
    const closes = bars.slice(0, signalIndex + 1).map((bar) => bar.close);
    const forecasts: NonNullable<ReturnType<typeof ewmacForecast>>[] = [];
    const labels: string[] = [];
    for (const [fast, slow] of EWMAC_COMPONENTS) {
      const forecast = ewmacForecast(
        closes,
        fast,
        slow,
        volBars,
        EWMAC_FORECAST_CAP,
      );
      if (forecast) {
        forecasts.push(forecast);
        labels.push(`${fast}/${slow}`);
      }
    }
    if (!forecasts.length) return undefined;
    const normalizedForecast = mean(forecasts.map((forecast) => forecast.normalized));
    const volatility = forecasts[0].volatility;
    if (
      normalizedForecast === null ||
      !Number.isFinite(normalizedForecast) ||
      !Number.isFinite(volatility) ||
      volatility <= EPSILON
    )
      return undefined;
    trends.push(normalizedForecast);
    vols.push(volatility);
    // A zero forecast gets zero exposure. No volatility floor is manufactured.
    rawRiskWeights.push(normalizedForecast / volatility);
    if (!activeComponents) activeComponents = labels;
    else if (activeComponents.join(",") !== labels.join(",")) return undefined;
  }

  const gross = rawRiskWeights.reduce((sum, value) => sum + Math.abs(value), 0);
  const weights = rawRiskWeights.map((value) =>
    gross > EPSILON ? value / gross : 0,
  );
  return { weights, trends, vols, activeComponents: activeComponents ?? [] };
}

function maxDrawdown(equity: readonly { value: number }[]): number {
  let peak = 0;
  let maximum = 0;
  for (const point of equity) {
    if (!Number.isFinite(point.value)) continue;
    peak = Math.max(peak, point.value);
    if (peak > 0) maximum = Math.max(maximum, 1 - point.value / peak);
  }
  return maximum;
}

function sourceDescriptor(series: readonly PreparedSeries[]): string {
  return series
    .map(
      (asset) =>
        `${asset.symbol}: ${asset.provenance} · ${asset.source} · fetchedAt=${asset.fetchedAt}ms · ${asset.adjustedTotalReturn ? "total-return-adjusted" : "price-return basis not confirmed"}`,
    )
    .join(" | ");
}

function insufficient(
  summary: string,
  reasons: string[],
  limitations: string[] = [],
): QuantLabResult {
  const result = emptyQuantResult(
    "macro",
    "Slow trend / volatility scale",
    summary,
    reasons,
  );
  result.metrics = [
    {
      key: "macro_release_rate_model",
      label: "Macro release/vintage + rate-differential model",
      value: "not available",
    },
  ];
  result.dataRequirements = [...reasons, MACRO_RELEASE_REQUIREMENTS];
  result.limitations = limitations;
  return result;
}

export function runMacroTrend(input: QuantLabInput): QuantLabResult {
  if (!input || input.family !== "macro")
    return insufficient(
      "The slow trend runner accepts only the macro family route.",
      ["Call runMacroTrend with family: 'macro'."],
    );
  if (!finiteMillis(input.now))
    return insufficient(
      "A finite Unix-millisecond now timestamp is required before closed bars can be identified.",
      ["now must be Unix milliseconds; candle time remains Unix seconds."],
    );
  if (!Array.isArray(input.series) || input.series.length < MIN_ASSETS) {
    return insufficient(
      "Systematic multi-asset trend needs at least two supplied asset histories.",
      [
        `Provide ${MIN_ASSETS}–${MAX_ASSETS} distinct assets with real sourced OHLC.`,
      ],
    );
  }
  if (input.series.length > MAX_ASSETS) {
    return insufficient(
      "The slow trend runner is deliberately bounded for mobile/server use.",
      [
        `Limit the input to at most ${MAX_ASSETS} assets; no assets were silently dropped.`,
      ],
    );
  }
  if (
    !input.settings ||
    !Number.isFinite(input.settings.startingEquity) ||
    input.settings.startingEquity <= 0
  ) {
    return insufficient(
      "Starting equity must be a positive finite user-supplied amount.",
      [
        "Provide a positive finite startingEquity; no default equity was substituted.",
      ],
    );
  }
  if (
    !Number.isFinite(input.settings.feeBps) ||
    !Number.isFinite(input.settings.slippageBps) ||
    input.settings.feeBps < 0 ||
    input.settings.slippageBps < 0 ||
    input.settings.feeBps + input.settings.slippageBps >= 10_000
  ) {
    return insufficient(
      "Finite, non-negative user fee and slippage inputs are required for transaction-cost research.",
      [
        "feeBps and slippageBps must be finite, non-negative, and sum to less than 10,000 bps; no exchange cost estimate was substituted.",
      ],
    );
  }

  const trendBars = boundedInteger(
    input.settings.lookback,
    MIN_TREND_BARS,
    MAX_TREND_BARS,
  );
  if (trendBars === undefined)
    return insufficient(
      "A positive finite lookback is required for slow trend calculation.",
      [
        "Provide a positive finite lookback; the runner does not infer strategy parameters.",
      ],
    );
  const volBars = Math.max(
    MIN_VOL_BARS,
    Math.min(MAX_VOL_BARS, Math.floor(trendBars / 3)),
  );
  const nowSeconds = input.now / 1000;
  const preparedResult = prepareSeries(input, nowSeconds);
  if (preparedResult.reasons.length)
    return insufficient(
      "Input histories did not meet the closed, bounded multi-asset OHLC requirements.",
      preparedResult.reasons,
    );
  const assets = preparedResult.series;
  if (assets.length < MIN_ASSETS)
    return insufficient(
      "Fewer than two usable sourced asset histories remained after validation.",
      [
        `Provide ${MIN_ASSETS}–${MAX_ASSETS} assets with valid, completed daily or weekly OHLC.`,
      ],
    );
  const timeframe = assets[0].timeframe;
  if (!assets.every((asset) => asset.timeframe === timeframe))
    return insufficient(
      "A common daily or weekly timeframe is required; bars are never resampled here.",
      [
        "Supply all assets at the same 1d or 1w timeframe with their original source labels.",
      ],
    );

  const byTime = assets.map(
    (asset) => new Map(asset.bars.map((bar) => [bar.time, bar])),
  );
  const commonTimes = assets[0].bars
    .map((bar) => bar.time)
    .filter((time) => byTime.every((asset) => asset.has(time)));
  const aligned = byTime.map((asset) =>
    commonTimes.map((time) => asset.get(time)!),
  );
  const shortestSlowSpan = EWMAC_COMPONENTS[0][1];
  const requiredBars =
    Math.max(shortestSlowSpan, volBars) + 1 + MIN_COMPUTED_OBSERVATIONS;
  if (commonTimes.length < requiredBars)
    return insufficient(
      "There are too few exact common completed timestamps after preserving gaps and source bars.",
      [
        `Need at least ${requiredBars} common completed ${timeframe} bars for the shortest causal EWMAC 8/32 component and a ${volBars}-bar volatility estimate; received ${commonTimes.length}.`,
        "Missing timestamps are omitted rather than forward-filled, interpolated, or synthesized.",
      ],
    );

  const costRate =
    (input.settings.feeBps + input.settings.slippageBps) / 10_000;
  const equity: { time: number; value: number }[] = [];
  let currentEquity = input.settings.startingEquity;
  let previousWeights = assets.map(() => 0);
  let totalTurnover = 0;
  let totalCosts = 0;
  let bankrupt = false;

  for (
    let periodIndex = Math.max(shortestSlowSpan, volBars) + 1;
    periodIndex < commonTimes.length;
    periodIndex += 1
  ) {
    const target = delayedWeights(aligned, periodIndex, volBars);
    if (!target) continue;
    const turnover = target.weights.reduce(
      (sum, weight, index) => sum + Math.abs(weight - previousWeights[index]),
      0,
    );
    const cost = currentEquity * turnover * costRate;
    const periodReturn = target.weights.reduce((sum, weight, index) => {
      const prior = aligned[index][periodIndex - 1].close;
      const current = aligned[index][periodIndex].close;
      return sum + weight * (current / prior - 1);
    }, 0);
    if (
      !Number.isFinite(turnover) ||
      !Number.isFinite(cost) ||
      !Number.isFinite(periodReturn)
    )
      continue;

    totalTurnover += turnover;
    totalCosts += cost;
    currentEquity = (currentEquity - cost) * (1 + periodReturn);
    if (!Number.isFinite(currentEquity) || currentEquity <= 0) {
      currentEquity = 0;
      bankrupt = true;
    }
    // Report the end of a genuinely supplied closed bar in Unix seconds.
    equity.push({
      time: commonTimes[periodIndex] + SECONDS[timeframe],
      value: currentEquity,
    });
    previousWeights = target.weights;
    if (bankrupt) break;
  }

  if (equity.length < MIN_COMPUTED_OBSERVATIONS)
    return insufficient(
      "The supplied histories cannot produce two finite causal portfolio observations.",
      [
        "Need valid delayed signals, positive realized volatility, and two subsequent common completed bars.",
      ],
    );

  const finalSignalIndex = commonTimes.length - 1;
  const finalTarget = delayedWeights(
    aligned,
    finalSignalIndex + 1,
    volBars,
  );
  const signals: QuantSignal[] = finalTarget
    ? assets.map((asset, index) => {
        const trend = finalTarget.trends[index];
        const volatility = finalTarget.vols[index];
        const direction =
          finalTarget.weights[index] > EPSILON
            ? "long"
            : finalTarget.weights[index] < -EPSILON
              ? "short"
              : "flat";
        const score =
          Math.min(1, Math.abs(trend));
        return {
          // This signal is known only once the final completed candle has closed.
          at: commonTimes[finalSignalIndex] + SECONDS[timeframe],
          symbol: asset.symbol,
          direction,
          strength: Number.isFinite(score) ? score : 0,
          reason:
            direction === "flat"
              ? `No target: capped normalized EWMAC forecast is flat or trailing ${volBars}-bar realized volatility is zero/unavailable. Not executed in reported equity.`
              : `Capped normalized EWMAC forecast ${(trend * 100).toFixed(2)}% from available ${finalTarget.activeComponents.join(", ")} component(s); inverse trailing ${volBars}-bar realized volatility ${(volatility * 100).toFixed(2)}% per observed bar. Next-bar target only; not included in reported equity.`,
        };
      })
    : [];

  const observations = equity.length;
  const endingEquity = equity.at(-1)!.value;
  const netReturn = endingEquity / input.settings.startingEquity - 1;
  const totalReturnAdjusted = assets.every(
    (asset) => asset.adjustedTotalReturn,
  );
  const notes = assets.flatMap((asset) =>
    asset.notes.map((note) => `${asset.symbol}: ${note}.`),
  );
  const validationReasons = [
    `Historical calculation has ${observations} causal common-bar portfolio observation(s); ${MIN_UNCONFIRMED_OBSERVATIONS} real, independent OOS observations are the minimum review gate.`,
    "No walk-forward process or untouched holdout is supplied or claimed (trainSamples=0, testSamples=0).",
    "The latest displayed targets are next-bar targets and are excluded from historical equity.",
  ];
  if (observations < MIN_UNCONFIRMED_OBSERVATIONS)
    validationReasons.push(
      `Below the ${MIN_UNCONFIRMED_OBSERVATIONS}-observation minimum; this is explicitly unconfirmed.`,
    );
  if (bankrupt)
    validationReasons.push(
      "Equity reached zero under the stated OHLC close-to-close model; the calculation stopped rather than extending a negative balance.",
    );

  const metrics: QuantMetric[] = [
    {
      key: "model",
      label: "OHLC model",
      value: "Causal EWMAC / capped forecast / inverse-volatility scale",
    },
    {
      key: "macro_release_rate_model",
      label: "Macro release/vintage + rate-differential model",
      value: "not available",
    },
    { key: "assets", label: "Assets", value: assets.length },
    { key: "timeframe", label: "Common timeframe", value: timeframe },
    {
      key: "trend_bars",
      label: "Legacy volatility-control lookback input",
      value: trendBars,
      unit: "bars",
    },
    {
      key: "ewmac_components",
      label: "EWMAC components available at latest signal",
      value: finalTarget?.activeComponents.join(", ") || "none",
    },
    {
      key: "ewmac_forecast_cap",
      label: "Absolute normalized forecast cap",
      value: EWMAC_FORECAST_CAP,
    },
    {
      key: "volatility_bars",
      label: "Volatility lookback",
      value: volBars,
      unit: "bars",
    },
    {
      key: "observations",
      label: "Causal portfolio observations",
      value: observations,
    },
    {
      key: "starting_equity",
      label: "Starting equity",
      value: input.settings.startingEquity,
    },
    {
      key: "ending_equity",
      label: "Ending equity after user costs",
      value: endingEquity,
    },
    {
      key: "net_return",
      label: "Net historical calculation",
      value: netReturn * 100,
      unit: "%",
    },
    {
      key: "max_drawdown",
      label: "Close-to-close maximum drawdown",
      value: maxDrawdown(equity) * 100,
      unit: "%",
    },
    { key: "turnover", label: "One-way turnover", value: totalTurnover },
    {
      key: "fee_bps",
      label: "User fee",
      value: input.settings.feeBps,
      unit: "bps",
    },
    {
      key: "slippage_bps",
      label: "User slippage",
      value: input.settings.slippageBps,
      unit: "bps",
    },
    { key: "estimated_costs", label: "User-cost deduction", value: totalCosts },
    {
      key: "sources",
      label: "Asset source / provenance",
      value: sourceDescriptor(assets),
    },
  ];

  return {
    family: "macro",
    status: "ready",
    title: "Causal EWMAC / volatility scale",
    summary:
      "OHLC-only systematic multi-asset EWMAC calculation. Positions for each reported bar use only the prior completed common bar, available 8/32, 16/64, 32/128 and 64/256 capped normalized forecasts, inverse realized-volatility scaling, and supplied fee/slippage on target-weight turnover. It is not a macro-release/vintage or rate-differential model, and it is not performance evidence.",
    asOf: equity.at(-1)!.time,
    metrics,
    signals,
    equity,
    validation: {
      status: "unconfirmed",
      actualSamples: observations,
      trainSamples: 0,
      testSamples: 0,
      walkForward: false,
      untouchedHoldout: false,
      reasons: validationReasons,
    },
    dataRequirements: [
      "2–10 distinct assets with source-labelled provider or user-import daily/weekly OHLC; each candle must have Unix-second time and valid positive OHLC.",
      `At most ${MAX_BARS_PER_ASSET} supplied bars per asset; only bars where time + SECONDS[timeframe] <= now / 1000 enter the model.`,
      "Exact common timestamps across assets; gaps, invalid records and duplicate records are omitted without interpolation or synthetic bars.",
      "A finite Unix-millisecond fetchedAt is retained as source provenance and never treated as a candle timestamp.",
      "User-supplied finite feeBps and slippageBps; no venue, spread, financing, carry, borrow, roll, dividend or tax estimate is invented.",
      MACRO_RELEASE_REQUIREMENTS,
    ],
    limitations: [
      "Returns are close-to-close price returns on supplied common timestamps. Intrabar fills, gap execution, market impact, leverage/margin, borrow constraints and liquidity are not modeled.",
      "Irregular timestamps are retained only when common across all assets. The volatility measure is per observed bar and is not annualized across uneven intervals.",
      "Available EWMAC 8/32, 16/64, 32/128 and 64/256 components are capped at an absolute normalized forecast of 20, averaged without outcome-fitted forecast scalars, then inverse-volatility risk weighted to gross absolute exposure one. A zero-volatility asset receives zero weight rather than an invented volatility floor.",
      "No total-return, FX conversion, distributions, contract-roll or financing adjustment is inferred from OHLC." +
        (totalReturnAdjusted
          ? " All supplied series are marked adjustedTotalReturn, but adjustment methodology remains provider/import supplied."
          : " One or more supplied series is not marked adjustedTotalReturn."),
      "The result is an unconfirmed historical calculation, not a forecast, recommendation, validated backtest, or performance claim.",
      MACRO_RELEASE_REQUIREMENTS,
      ...notes,
    ],
  };
}
