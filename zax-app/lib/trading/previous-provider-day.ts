import type { Candle } from "./model";

const ONE_DAY = 86_400;
const MAX_PROVIDER_TRADING_DAY_AGE_DAYS = 7;

type PreviousProviderDayInput = {
  candles: Candle[];
  basis?: string;
  /** Causal epoch-seconds cutoff; a current UTC daily row is only an anchor, never a close. */
  cutoff: number;
  source: string;
};

type PreviousProviderDayResult = {
  bar?: Candle;
  closeAt?: number;
  reason?: string;
};

const validEpochSeconds = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  Number.isInteger(value) &&
  value > 0 &&
  value < 10_000_000_000;

/** Query/as-of observations may carry sub-second precision; daily bar starts may not. */
const validCutoffSeconds = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value > 0 &&
  value < 10_000_000_000;

/** Daily-price validation deliberately does not inspect volume. */
const validDailyOhlc = (
  bar: Partial<Candle> | null | undefined,
): bar is Candle => {
  if (!bar) return false;
  const { time, open, high, low, close } = bar;
  return (
    validEpochSeconds(time) &&
    time % ONE_DAY === 0 &&
    typeof open === "number" &&
    typeof high === "number" &&
    typeof low === "number" &&
    typeof close === "number" &&
    Number.isFinite(open) &&
    Number.isFinite(high) &&
    Number.isFinite(low) &&
    Number.isFinite(close) &&
    open > 0 &&
    high > 0 &&
    low > 0 &&
    close > 0 &&
    high >= low &&
    high >= Math.max(open, close) &&
    low <= Math.min(open, close)
  );
};

/** Volume is deliberately omitted: it has no bearing on an OHLC daily price proof. */
const sameDailyPriceBar = (left: Candle, right: Candle) =>
  left.time === right.time &&
  left.open === right.open &&
  left.high === right.high &&
  left.low === right.low &&
  left.close === right.close;

const failed = (reason: string): PreviousProviderDayResult => ({ reason });

/**
 * Resolves a provider's actual prior UTC daily OHLC row without inventing a market calendar.
 *
 * `utc-continuous-24h` requires the exact immediately preceding UTC day. For
 * `utc-provider-trading-days`, an observed current UTC-day row is an anchor proving the
 * provider has emitted today's period; the selected prior completed row may be up to seven
 * days old. That anchor's OHLC is never considered a completed close.
 */
export function resolvePreviousProviderDay(
  input: PreviousProviderDayInput,
): PreviousProviderDayResult {
  if (!validCutoffSeconds(input.cutoff))
    return failed("Provider-day cutoff must be a valid epoch-seconds instant.");
  if (!input.source || !input.source.trim())
    return failed("Daily provider source identity is unavailable.");

  const basis = input.basis;
  const continuous =
    basis === "utc-continuous-24h" || basis === "provider-utc-day";
  const providerTradingDays =
    basis === "utc-provider-trading-days" || basis === "provider-utc-trading-day";
  if (!continuous && !providerTradingDays)
    return failed("Daily period basis is not an explicit supported UTC provider-day basis.");

  const currentStart = Math.floor(input.cutoff / ONE_DAY) * ONE_DAY;
  const byTime = new Map<number, Candle>();
  for (const raw of input.candles || []) {
    if (!validDailyOhlc(raw))
      return failed(
        "Daily provider rows must be real UTC-midnight, positive finite OHLC periods; malformed/off-grid rows are rejected.",
      );
    if (raw.time > currentStart)
      return failed(
        "A future UTC daily provider row is present; future periods are never used as previous-day evidence.",
      );
    const prior = byTime.get(raw.time);
    if (prior && !sameDailyPriceBar(prior, raw))
      return failed(
        "Conflicting duplicate UTC daily provider rows prevent selecting a previous close.",
      );
    if (!prior) byTime.set(raw.time, raw);
  }

  if (continuous) {
    const expectedStart = currentStart - ONE_DAY;
    const previous = byTime.get(expectedStart);
    if (!previous)
      return failed(
        "The exact immediately previous completed UTC provider day is absent; an older row is not relabelled as the previous day.",
      );
    // The expected row must have completed by the causal cutoff even if callers later change
    // cutoff semantics away from a post-midnight session clock.
    if (previous.time + ONE_DAY > input.cutoff)
      return failed(
        "The candidate UTC daily provider row is still forming at the causal cutoff.",
      );
    return { bar: previous, closeAt: previous.time + ONE_DAY };
  }

  const currentAnchor = byTime.get(currentStart);
  if (!currentAnchor)
    return failed(
      "utc-provider-trading-days requires an actual current UTC provider-day anchor in returned data; no exchange calendar, RTH close, or holiday is inferred.",
    );

  const completed = [...byTime.values()]
    .filter((bar) => bar.time < currentStart && bar.time + ONE_DAY <= input.cutoff)
    .sort((left, right) => right.time - left.time)[0];
  if (!completed)
    return failed(
      "No completed prior UTC provider-day row is present before the current provider-day anchor.",
    );
  const ageDays = (currentStart - completed.time) / ONE_DAY;
  if (ageDays > MAX_PROVIDER_TRADING_DAY_AGE_DAYS)
    return failed(
      "The last observed completed UTC provider day is older than seven days; no missing trading days are invented.",
    );
  return { bar: completed, closeAt: completed.time + ONE_DAY };
}
