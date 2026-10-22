import { SECONDS, validateCandles } from "../../lib/trading/engine";
import type {
  Candle,
  Quote,
  Strategy,
  Timeframe,
} from "../../lib/trading/model";
import {
  closedBarFreshness,
  quoteFreshnessAt,
  type SourceSessionMetadata,
} from "../../lib/trading/freshness";

export type ForecastContextMode = "current" | "last-available";
export type ForecastRequestContextMode = ForecastContextMode | "auto";

export type ForecastSourceInput = {
  market: string;
  timeframe: Timeframe;
  /** Defaults to strict current data. Historical context is explicitly opt-in. */
  contextMode?: ForecastRequestContextMode;
  feed: {
    candles: Candle[];
    source: string;
    fetchedAt?: number;
    sourceCadenceSeconds?: number;
    session?: SourceSessionMetadata;
  };
  /** Required only for strict current context; never substituted from a candle. */
  quote?: Quote;
  strategy?: Strategy;
  instructions?: string;
};

export type ForecastSourceFreshness = {
  status: "fresh" | "stale";
  reason?: string;
  /** Unix seconds at which the most recent completed source bar closed. */
  closedAt: number;
  /** Age from completed-bar close, not the source fetch time. */
  ageSeconds: number;
  /** Original provider/server receipt time, in its supplied units. */
  fetchedAt?: number;
};

export type PreparedForecastSource = {
  contextMode: ForecastContextMode;
  closed: Candle[];
  /** Current context may use the observed in-progress anchor; historical context never does. */
  anchor: Candle;
  currentQuote?: Quote;
  sourceFreshness: ForecastSourceFreshness;
  contextResolutionReason?: string;
};

function elapsed(seconds: number) {
  if (!Number.isFinite(seconds)) return "an unavailable age";
  const value = Math.max(0, Math.round(seconds));
  if (value < 60) return `${value}s`;
  const minutes = Math.floor(value / 60);
  if (minutes < 60) return `${minutes}m ${value % 60}s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function closeDescription(closedAt: number, ageSeconds: number) {
  const at =
    Number.isFinite(closedAt) && closedAt > 0
      ? new Date(closedAt * 1_000).toISOString()
      : "an unavailable time";
  return `Last completed bar closed at ${at}; age ${elapsed(ageSeconds)}.`;
}

function availableHistoryRoute() {
  return 'Refresh the source and retry current mode, or use available-history mode (contextMode: "last-available") for an explicitly historical hypothetical path.';
}

function quoteProblem(input: ForecastSourceInput, nowSeconds: number) {
  const quote = input.quote;
  if (!quote) return "No timestamped quote was returned.";
  if (quote.symbol !== input.market)
    return "The quote market does not match the requested market.";
  if (quote.status !== "live")
    return `The quote source reported status ${quote.status}.`;
  if (!Number.isFinite(quote.price) || quote.price <= 0)
    return "The quote has no positive price.";
  const freshness = quoteFreshnessAt(quote.timestamp, nowSeconds);
  if (freshness.status !== "live")
    return freshness.reason ?? "The quote timestamp is not current.";
  return undefined;
}

/**
 * Makes provenance and safety decisions without market, LLM, storage or order side effects.
 * Provider-declared session state is passed to the shared policy; no closure is inferred here.
 */
export function prepareForecastSource(
  input: ForecastSourceInput,
  nowMilliseconds = Date.now(),
): PreparedForecastSource {
  const requestedMode = input.contextMode ?? "current";
  const nowSeconds = nowMilliseconds / 1_000;
  const observed = validateCandles(input.feed.candles).filter(
    (candle) => candle.time <= nowSeconds,
  );
  const closed = observed
    .filter((candle) => candle.time + SECONDS[input.timeframe] <= nowSeconds)
    .slice(-80);
  const lastClosed = closed.at(-1);

  if (!lastClosed || closed.length < 15)
    throw new Error(
      "AI forecast needs at least 15 valid completed source bars. No sample history or synthetic anchor is used.",
    );

  const freshness = closedBarFreshness({
    timeframe: input.timeframe,
    latestClosedBar: lastClosed.time,
    sourceReceivedAt: input.feed.fetchedAt,
    sourceCadenceSeconds: input.feed.sourceCadenceSeconds,
    calendarState: input.feed.session?.calendarState,
    nowSeconds,
  });
  const sourceFreshness: ForecastSourceFreshness = {
    status: freshness.status,
    ...(freshness.reason ? { reason: freshness.reason } : {}),
    closedAt: freshness.completedAt,
    ageSeconds: freshness.closeAgeSeconds,
    ...(typeof input.feed.fetchedAt === "number" &&
    Number.isFinite(input.feed.fetchedAt)
      ? { fetchedAt: input.feed.fetchedAt }
      : {}),
  };
  const sourceAge = closeDescription(
    sourceFreshness.closedAt,
    sourceFreshness.ageSeconds,
  );
  const problem =
    requestedMode === "last-available"
      ? undefined
      : quoteProblem(input, nowSeconds);
  const useHistorical =
    requestedMode === "last-available" ||
    (requestedMode === "auto" &&
      (freshness.status !== "fresh" || Boolean(problem)));
  const contextMode: ForecastContextMode = useHistorical
    ? "last-available"
    : "current";

  if (contextMode === "last-available")
    return {
      contextMode,
      closed,
      anchor: lastClosed,
      sourceFreshness,
      ...(requestedMode === "auto"
        ? {
            contextResolutionReason: `Auto used historical-only completed context from ${input.feed.source}: ${freshness.status !== "fresh" ? freshness.reason : problem} ${sourceAge} This is not a current-market scenario.`,
          }
        : {}),
    };

  if (freshness.status !== "fresh")
    throw new Error(
      `Completed source bars are stale: ${freshness.reason ?? "The completed-bar policy was not met."} ${sourceAge} ${availableHistoryRoute()}`,
    );

  if (problem)
    throw new Error(
      `AI forecast needs a current timestamped live quote: ${problem} No candle close was used as a substitute quote. ${sourceAge} ${availableHistoryRoute()}`,
    );

  return {
    contextMode,
    closed,
    anchor: observed.at(-1)!,
    currentQuote: input.quote,
    sourceFreshness,
  };
}
