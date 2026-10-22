import { SECONDS, tradeMetrics } from "./engine";
import type { Candle, Quote, Trade } from "./model";
import type { SetupAnalysis } from "./setup-model";

/**
 * Immutable-by-value, entry-time inputs only. `asOf` is always Unix epoch
 * milliseconds here, even though SetupAnalysis stores its cutoff in seconds.
 */
export type TradeFeatureSnapshot = {
  version: 1;
  asOf: number;
  source: string;
  values: Record<string, number | null>;
  regime: "trending" | "choppy" | "unknown";
  volatilityRegime: "high" | "low" | "unknown";
  missing: string[];
};

const MINUTE_EPOCH_MS = 10_000_000_000;

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const positive = (value: unknown): value is number =>
  finite(value) && value > 0;

function analysisSeconds(asOf: number): number | null {
  if (!positive(asOf)) return null;
  // SetupAnalysis is documented in Unix seconds. This branch is intentional
  // defensive normalization for callers that pass a millisecond cutoff.
  return asOf > MINUTE_EPOCH_MS ? asOf / 1000 : asOf;
}

function epochMilliseconds(timestamp: number): number | null {
  if (!positive(timestamp)) return null;
  return timestamp > MINUTE_EPOCH_MS ? timestamp : timestamp * 1000;
}

function validCandle(candle: Candle): boolean {
  return (
    finite(candle.time) &&
    candle.time > 0 &&
    positive(candle.open) &&
    positive(candle.high) &&
    positive(candle.low) &&
    positive(candle.close) &&
    finite(candle.volume) &&
    candle.volume >= 0 &&
    candle.high >= candle.low &&
    candle.high >= Math.max(candle.open, candle.close) &&
    candle.low <= Math.min(candle.open, candle.close)
  );
}

/** Only bars whose full declared timeframe ended by the analysis cutoff. */
function completedBars(
  analysis: SetupAnalysis,
  cutoff: number | null,
): Candle[] {
  if (cutoff === null) return [];
  const seconds = SECONDS[analysis.timeframe];
  if (!finite(seconds) || seconds <= 0 || !Array.isArray(analysis.candles))
    return [];
  const unique = new Map<number, Candle>();
  for (const candle of analysis.candles) {
    if (validCandle(candle) && candle.time + seconds <= cutoff)
      unique.set(candle.time, candle);
  }
  return [...unique.values()].sort((left, right) => left.time - right.time);
}

function mean(values: readonly number[]): number | null {
  return values.length && values.every(finite)
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function populationDeviation(values: readonly number[]): number | null {
  const average = mean(values);
  if (average === null || !values.length) return null;
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
      values.length,
  );
}

function returns(bars: readonly Candle[], periods: number): number[] | null {
  if (bars.length < periods + 1) return null;
  const selected = bars.slice(-(periods + 1));
  if (selected.some((bar) => !positive(bar.close))) return null;
  const result: number[] = [];
  for (let index = 1; index < selected.length; index += 1)
    result.push(Math.log(selected[index].close / selected[index - 1].close));
  return result;
}

function trueRangeAverage(
  bars: readonly Candle[],
  periods: number,
): number | null {
  if (bars.length < periods + 1) return null;
  const selected = bars.slice(-(periods + 1));
  const ranges: number[] = [];
  for (let index = 1; index < selected.length; index += 1) {
    const bar = selected[index];
    const prior = selected[index - 1];
    ranges.push(
      Math.max(
        bar.high - bar.low,
        Math.abs(bar.high - prior.close),
        Math.abs(bar.low - prior.close),
      ),
    );
  }
  return mean(ranges);
}

/** Kaufman-style directional efficiency, using only `periods` completed moves. */
function trendEfficiency(
  bars: readonly Candle[],
  periods: number,
): number | null {
  if (bars.length < periods + 1) return null;
  const selected = bars.slice(-(periods + 1));
  const net = Math.abs(selected.at(-1)!.close - selected[0].close);
  let path = 0;
  for (let index = 1; index < selected.length; index += 1)
    path += Math.abs(selected[index].close - selected[index - 1].close);
  return path > 0 ? net / path : null;
}

function leastSquaresSlope(values: readonly number[]): number | null {
  if (values.length < 2 || values.some((value) => !finite(value))) return null;
  const xMean = (values.length - 1) / 2;
  const yMean = mean(values);
  if (yMean === null) return null;
  let numerator = 0;
  let denominator = 0;
  values.forEach((value, index) => {
    const delta = index - xMean;
    numerator += delta * (value - yMean);
    denominator += delta * delta;
  });
  return denominator > 0 ? numerator / denominator : null;
}

function originalPlanMetrics(trade: Trade) {
  const quantity = positive(trade.initialQuantity)
    ? trade.initialQuantity
    : trade.quantity;
  const stop = positive(trade.originalStop) ? trade.originalStop : trade.stop;
  const target = positive(trade.originalTarget)
    ? trade.originalTarget
    : trade.target;
  const geometryValid =
    positive(trade.entry) &&
    positive(stop) &&
    positive(target) &&
    positive(quantity) &&
    positive(trade.pointValue) &&
    (trade.side === "long"
      ? stop < trade.entry && target > trade.entry
      : stop > trade.entry && target < trade.entry);
  if (!geometryValid)
    return {
      quantity: null,
      stop: null,
      target: null,
      risk: null,
      rr: null,
    };
  // `initialRisk` is explicitly unset so a legacy fallback is calculated from
  // the original bracket and entry quantity rather than a later managed stop.
  const metrics = tradeMetrics({
    ...trade,
    quantity,
    stop,
    target,
    initialRisk: undefined,
  });
  return {
    quantity,
    stop,
    target,
    risk: positive(trade.initialRisk)
      ? trade.initialRisk
      : positive(metrics.risk)
        ? metrics.risk
        : null,
    rr: positive(metrics.risk) && finite(metrics.rr) ? metrics.rr : null,
  };
}

function addMissing(missing: string[], key: string, reason: string) {
  const item = `${key}: ${reason}`;
  if (!missing.includes(item)) missing.push(item);
}

function setUnavailable(
  values: Record<string, number | null>,
  missing: string[],
  key: string,
  reason: string,
) {
  values[key] = null;
  addMissing(missing, key, reason);
}

function asPercentOf(value: number | null, base: number): number | null {
  return value !== null && positive(base) ? value / base : null;
}

/**
 * Produces approximately sixty named, falsifiable values from a supplied setup
 * analysis and planned trade. It deliberately never reads exit/P&L/outcome
 * fields. OHLC values use only completed bars: `bar.time + timeframeSeconds <=
 * analysis.asOf`. Raw OHLC volume is retained exactly as supplied; it can be a
 * broker/provider proxy and is not asserted to be venue VWAP, NBBO, or order
 * flow.
 */
export function tradeFeatureSnapshot(
  analysis: SetupAnalysis,
  trade: Trade,
  quote?: Quote,
): TradeFeatureSnapshot {
  const missing: string[] = [];
  const cutoffSeconds = analysisSeconds(analysis.asOf);
  const asOf = cutoffSeconds === null ? 0 : cutoffSeconds * 1000;
  if (cutoffSeconds === null)
    addMissing(
      missing,
      "analysis_as_of_ms",
      "analysis.asOf must be a positive finite Unix-second or Unix-millisecond timestamp.",
    );

  const bars = completedBars(analysis, cutoffSeconds);
  const timeframeSeconds = SECONDS[analysis.timeframe];
  if (!bars.length)
    addMissing(
      missing,
      "closed_bar_count",
      "no valid candle satisfies candle.time + timeframeSeconds <= analysis.asOf.",
    );

  const values: Record<string, number | null> = {
    feature_schema_version: 1,
    analysis_as_of_ms: cutoffSeconds === null ? null : asOf,
    timeframe_seconds: finite(timeframeSeconds) ? timeframeSeconds : null,
    closed_bar_count: bars.length,
    side_sign: trade.side === "long" ? 1 : -1,
    bar_open_t1: null,
    bar_high_t1: null,
    bar_low_t1: null,
    bar_close_t1: null,
    bar_volume_t1: null,
    bar_range_t1: null,
    bar_range_pct_t1: null,
    bar_body_t1: null,
    bar_body_pct_range_t1: null,
    bar_upper_wick_pct_range_t1: null,
    bar_lower_wick_pct_range_t1: null,
    bar_close_location_t1: null,
    close_return_1: null,
    close_return_5: null,
    close_return_10: null,
    close_return_20: null,
    atr_14: null,
    atr_14_pct: null,
    realized_volatility_10: null,
    realized_volatility_20: null,
    volatility_ratio_10_to_20: null,
    trend_efficiency_10: null,
    trend_efficiency_20: null,
    close_sma_5: null,
    close_sma_20: null,
    close_vs_sma_5_pct: null,
    close_vs_sma_20_pct: null,
    sma_5_minus_sma_20_pct: null,
    high_low_range_20: null,
    close_position_in_range_20: null,
    volume_sma_20: null,
    relative_volume_20: null,
    volume_cv_20: null,
    volume_slope_10: null,
    volume_share_20: null,
    entry_price: positive(trade.entry) ? trade.entry : null,
    original_stop_price: null,
    original_target_price: null,
    entry_quantity: null,
    current_quantity: positive(trade.quantity) ? trade.quantity : null,
    point_value: positive(trade.pointValue) ? trade.pointValue : null,
    stop_distance_price: null,
    stop_distance_pct: null,
    target_distance_price: null,
    target_distance_pct: null,
    planned_initial_risk: null,
    planned_reward_to_risk: null,
    trade_entry_at_ms: null,
    analysis_minus_entry_ms: null,
    quote_price: null,
    quote_timestamp_ms: null,
    quote_age_ms: null,
    quote_bid: null,
    quote_ask: null,
    quote_mid: null,
    quote_spread: null,
    quote_spread_pct_mid: null,
    quote_vs_close_pct: null,
    venue_vwap: null,
    nbbo_bid: null,
    nbbo_ask: null,
    nbbo_mid: null,
    order_flow_imbalance: null,
    benchmark_return_correlation_20: null,
  };

  if (!analysis.source?.trim())
    addMissing(missing, "analysis_source", "analysis.source is empty.");

  const latest = bars.at(-1);
  if (!latest) {
    [
      "bar_open_t1",
      "bar_high_t1",
      "bar_low_t1",
      "bar_close_t1",
      "bar_volume_t1",
      "bar_range_t1",
      "bar_range_pct_t1",
      "bar_body_t1",
      "bar_body_pct_range_t1",
      "bar_upper_wick_pct_range_t1",
      "bar_lower_wick_pct_range_t1",
      "bar_close_location_t1",
    ].forEach((key) =>
      addMissing(
        missing,
        key,
        "requires at least one valid completed OHLC bar.",
      ),
    );
  } else {
    const range = latest.high - latest.low;
    const upperWick = latest.high - Math.max(latest.open, latest.close);
    const lowerWick = Math.min(latest.open, latest.close) - latest.low;
    values.bar_open_t1 = latest.open;
    values.bar_high_t1 = latest.high;
    values.bar_low_t1 = latest.low;
    values.bar_close_t1 = latest.close;
    values.bar_volume_t1 = latest.volume;
    values.bar_range_t1 = range;
    values.bar_range_pct_t1 = range / latest.close;
    values.bar_body_t1 = latest.close - latest.open;
    if (range > 0) {
      values.bar_body_pct_range_t1 =
        Math.abs(latest.close - latest.open) / range;
      values.bar_upper_wick_pct_range_t1 = upperWick / range;
      values.bar_lower_wick_pct_range_t1 = lowerWick / range;
      values.bar_close_location_t1 = (latest.close - latest.low) / range;
    } else {
      [
        "bar_body_pct_range_t1",
        "bar_upper_wick_pct_range_t1",
        "bar_lower_wick_pct_range_t1",
        "bar_close_location_t1",
      ].forEach((key) =>
        addMissing(
          missing,
          key,
          "latest completed bar has zero high-low range.",
        ),
      );
    }
  }

  for (const period of [1, 5, 10, 20]) {
    const key = `close_return_${period}`;
    if (bars.length < period + 1) {
      addMissing(missing, key, `requires ${period + 1} completed closes.`);
      continue;
    }
    const prior = bars.at(-(period + 1))!;
    values[key] =
      latest && positive(prior.close) ? latest.close / prior.close - 1 : null;
  }

  const atr14 = trueRangeAverage(bars, 14);
  values.atr_14 = atr14;
  values.atr_14_pct = latest ? asPercentOf(atr14, latest.close) : null;
  if (atr14 === null)
    ["atr_14", "atr_14_pct"].forEach((key) =>
      addMissing(
        missing,
        key,
        "requires 15 completed bars for 14 true ranges.",
      ),
    );

  const volatility10 = returns(bars, 10);
  const volatility20 = returns(bars, 20);
  values.realized_volatility_10 = volatility10
    ? populationDeviation(volatility10)
    : null;
  values.realized_volatility_20 = volatility20
    ? populationDeviation(volatility20)
    : null;
  if (volatility10 === null)
    addMissing(
      missing,
      "realized_volatility_10",
      "requires 11 completed positive closes; value is unannualized log-return population deviation.",
    );
  if (volatility20 === null)
    addMissing(
      missing,
      "realized_volatility_20",
      "requires 21 completed positive closes; value is unannualized log-return population deviation.",
    );
  if (
    values.realized_volatility_10 !== null &&
    values.realized_volatility_20 !== null &&
    values.realized_volatility_20 > 0
  )
    values.volatility_ratio_10_to_20 =
      values.realized_volatility_10 / values.realized_volatility_20;
  else
    addMissing(
      missing,
      "volatility_ratio_10_to_20",
      "requires nonzero 20-bar realized volatility and both 10/20-bar completed return series.",
    );

  for (const period of [10, 20]) {
    const key = `trend_efficiency_${period}`;
    values[key] = trendEfficiency(bars, period);
    if (values[key] === null)
      addMissing(
        missing,
        key,
        `requires ${period + 1} completed closes with nonzero cumulative absolute movement.`,
      );
  }

  const closeSma5 = mean(bars.slice(-5).map((bar) => bar.close));
  const closeSma20 = mean(bars.slice(-20).map((bar) => bar.close));
  if (bars.length >= 5) values.close_sma_5 = closeSma5;
  else addMissing(missing, "close_sma_5", "requires five completed closes.");
  if (bars.length >= 20) values.close_sma_20 = closeSma20;
  else addMissing(missing, "close_sma_20", "requires 20 completed closes.");
  if (latest && closeSma5 !== null && positive(closeSma5))
    values.close_vs_sma_5_pct = latest.close / closeSma5 - 1;
  else
    addMissing(
      missing,
      "close_vs_sma_5_pct",
      "requires latest close and nonzero five-bar close SMA.",
    );
  if (latest && closeSma20 !== null && positive(closeSma20))
    values.close_vs_sma_20_pct = latest.close / closeSma20 - 1;
  else
    addMissing(
      missing,
      "close_vs_sma_20_pct",
      "requires latest close and nonzero 20-bar close SMA.",
    );
  if (closeSma5 !== null && closeSma20 !== null && positive(closeSma20))
    values.sma_5_minus_sma_20_pct = closeSma5 / closeSma20 - 1;
  else
    addMissing(
      missing,
      "sma_5_minus_sma_20_pct",
      "requires nonzero five-bar and 20-bar completed-close SMAs.",
    );

  if (bars.length >= 20 && latest) {
    const window = bars.slice(-20);
    const highest = Math.max(...window.map((bar) => bar.high));
    const lowest = Math.min(...window.map((bar) => bar.low));
    const range = highest - lowest;
    values.high_low_range_20 = range;
    if (range > 0)
      values.close_position_in_range_20 = (latest.close - lowest) / range;
    else
      addMissing(
        missing,
        "close_position_in_range_20",
        "the 20-bar high-low range is zero.",
      );
  } else {
    ["high_low_range_20", "close_position_in_range_20"].forEach((key) =>
      addMissing(missing, key, "requires 20 completed OHLC bars."),
    );
  }

  if (bars.length >= 20) {
    const volumes = bars.slice(-20).map((bar) => bar.volume);
    const volumeMean = mean(volumes);
    values.volume_sma_20 = volumeMean;
    values.volume_cv_20 =
      volumeMean !== null && volumeMean > 0
        ? populationDeviation(volumes)! / volumeMean
        : null;
    values.volume_share_20 =
      latest && volumeMean !== null && volumeMean > 0
        ? latest.volume / (volumeMean * 20)
        : null;
    if (volumeMean === null || volumeMean <= 0)
      ["volume_cv_20", "volume_share_20"].forEach((key) =>
        addMissing(
          missing,
          key,
          "requires a positive mean of supplied raw 20-bar OHLC volume.",
        ),
      );
  } else {
    ["volume_sma_20", "volume_cv_20", "volume_share_20"].forEach((key) =>
      addMissing(
        missing,
        key,
        "requires 20 completed bars of supplied OHLC volume.",
      ),
    );
  }
  if (bars.length >= 21 && latest) {
    const priorVolumes = bars.slice(-21, -1).map((bar) => bar.volume);
    const priorMean = mean(priorVolumes);
    values.relative_volume_20 =
      priorMean !== null && priorMean > 0 ? latest.volume / priorMean : null;
    if (values.relative_volume_20 === null)
      addMissing(
        missing,
        "relative_volume_20",
        "requires a positive mean of the preceding 20 supplied raw OHLC volumes.",
      );
  } else
    addMissing(
      missing,
      "relative_volume_20",
      "requires the latest plus 20 preceding completed raw-volume bars.",
    );
  values.volume_slope_10 = leastSquaresSlope(
    bars.slice(-10).map((bar) => bar.volume),
  );
  if (values.volume_slope_10 === null)
    addMissing(
      missing,
      "volume_slope_10",
      "requires ten completed finite supplied raw-volume bars.",
    );

  const plan = originalPlanMetrics(trade);
  values.original_stop_price = plan.stop;
  values.original_target_price = plan.target;
  values.entry_quantity = plan.quantity;
  values.planned_initial_risk = plan.risk;
  values.planned_reward_to_risk = plan.rr;
  if (plan.stop !== null && positive(trade.entry)) {
    const distance = Math.abs(trade.entry - plan.stop);
    values.stop_distance_price = distance;
    values.stop_distance_pct = distance / trade.entry;
  }
  if (plan.target !== null && positive(trade.entry)) {
    const distance = Math.abs(plan.target - trade.entry);
    values.target_distance_price = distance;
    values.target_distance_pct = distance / trade.entry;
  }
  if (plan.risk === null)
    [
      "original_stop_price",
      "original_target_price",
      "entry_quantity",
      "stop_distance_price",
      "stop_distance_pct",
      "target_distance_price",
      "target_distance_pct",
      "planned_initial_risk",
      "planned_reward_to_risk",
    ].forEach((key) =>
      addMissing(
        missing,
        key,
        "original entry/stop/target/quantity/point-value geometry is invalid or unavailable.",
      ),
    );
  if (!positive(trade.entry))
    addMissing(
      missing,
      "entry_price",
      "trade.entry must be a positive finite price.",
    );
  if (!positive(trade.quantity))
    addMissing(
      missing,
      "current_quantity",
      "trade.quantity must be a positive finite value.",
    );
  if (!positive(trade.pointValue))
    addMissing(
      missing,
      "point_value",
      "trade.pointValue must be a positive finite value.",
    );

  const entryAt = epochMilliseconds(trade.openedAt ?? trade.createdAt);
  values.trade_entry_at_ms = entryAt;
  values.analysis_minus_entry_ms =
    entryAt !== null && cutoffSeconds !== null ? asOf - entryAt : null;
  if (entryAt === null)
    ["trade_entry_at_ms", "analysis_minus_entry_ms"].forEach((key) =>
      addMissing(
        missing,
        key,
        "trade.openedAt or trade.createdAt must be a positive finite epoch timestamp.",
      ),
    );

  const quoteAt = quote ? epochMilliseconds(quote.timestamp) : null;
  const quoteUsableAtPointInTime =
    quote !== undefined &&
    quoteAt !== null &&
    cutoffSeconds !== null &&
    quoteAt <= asOf;
  if (quoteUsableAtPointInTime && quote) {
    values.quote_timestamp_ms = quoteAt;
    values.quote_age_ms = asOf - quoteAt;
    if (positive(quote.price)) values.quote_price = quote.price;
    else
      addMissing(
        missing,
        "quote_price",
        "supplied quote price is not a positive finite number.",
      );
    if (positive(quote.bid)) values.quote_bid = quote.bid;
    else
      addMissing(
        missing,
        "quote_bid",
        "no positive bid was supplied with the quote.",
      );
    if (positive(quote.ask)) values.quote_ask = quote.ask;
    else
      addMissing(
        missing,
        "quote_ask",
        "no positive ask was supplied with the quote.",
      );
    if (positive(quote.bid) && positive(quote.ask)) {
      const mid = (quote.bid + quote.ask) / 2;
      values.quote_mid = mid;
      values.quote_spread = quote.ask - quote.bid;
      values.quote_spread_pct_mid =
        mid > 0 ? (quote.ask - quote.bid) / mid : null;
    } else
      ["quote_mid", "quote_spread", "quote_spread_pct_mid"].forEach((key) =>
        addMissing(
          missing,
          key,
          "requires both supplied positive bid and ask values.",
        ),
      );
    if (latest && positive(quote.price))
      values.quote_vs_close_pct = quote.price / latest.close - 1;
    else
      addMissing(
        missing,
        "quote_vs_close_pct",
        "requires a positive point-in-time quote price and latest completed close.",
      );
  } else {
    const reason = !quote
      ? "no quote was supplied."
      : quoteAt === null
        ? "quote.timestamp must be a positive finite epoch timestamp."
        : cutoffSeconds === null
          ? "analysis.asOf is unavailable, so quote point-in-time eligibility cannot be checked."
          : "quote timestamp is after analysis.asOf and is excluded as future information.";
    [
      "quote_price",
      "quote_timestamp_ms",
      "quote_age_ms",
      "quote_bid",
      "quote_ask",
      "quote_mid",
      "quote_spread",
      "quote_spread_pct_mid",
      "quote_vs_close_pct",
    ].forEach((key) => addMissing(missing, key, reason));
  }

  // No supplied field establishes these market-microstructure inputs. They
  // remain null rather than being reconstructed from OHLC or a single quote.
  setUnavailable(
    values,
    missing,
    "venue_vwap",
    "venue-specific trade volume and aggregation inputs were not supplied.",
  );
  setUnavailable(
    values,
    missing,
    "nbbo_bid",
    "no consolidated NBBO feed was supplied; a single quote is not NBBO.",
  );
  setUnavailable(
    values,
    missing,
    "nbbo_ask",
    "no consolidated NBBO feed was supplied; a single quote is not NBBO.",
  );
  setUnavailable(
    values,
    missing,
    "nbbo_mid",
    "no consolidated NBBO feed was supplied; a single quote is not NBBO.",
  );
  setUnavailable(
    values,
    missing,
    "order_flow_imbalance",
    "no timestamped trades, depth, or aggressor-side order-flow feed was supplied.",
  );
  setUnavailable(
    values,
    missing,
    "benchmark_return_correlation_20",
    "no synchronized benchmark closed-return series was supplied.",
  );

  const efficiency20 = values.trend_efficiency_20;
  const regime: TradeFeatureSnapshot["regime"] =
    efficiency20 === null
      ? "unknown"
      : efficiency20 >= 0.35
        ? "trending"
        : efficiency20 <= 0.2
          ? "choppy"
          : "unknown";
  const volatilityRatio = values.volatility_ratio_10_to_20;
  const volatilityRegime: TradeFeatureSnapshot["volatilityRegime"] =
    volatilityRatio === null
      ? "unknown"
      : volatilityRatio >= 1.25
        ? "high"
        : volatilityRatio <= 0.75
          ? "low"
          : "unknown";

  const source = `${analysis.source?.trim() || "Unspecified analysis source"} · point-in-time closed OHLC only; analysis.asOf=${cutoffSeconds === null ? "invalid" : `${cutoffSeconds}s / ${asOf}ms`}; timeframe=${analysis.timeframe}; quote=${quote?.source?.trim() || "not supplied"}. Raw OHLC volume is retained as supplied and may be a broker/provider proxy, not verified venue VWAP, NBBO, or order flow.`;
  return {
    version: 1,
    asOf,
    source,
    values,
    regime,
    volatilityRegime,
    missing,
  };
}
