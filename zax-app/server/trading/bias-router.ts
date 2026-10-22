import { z } from "zod";
import {
  TIMEFRAME_BIAS_DEFINITION,
  TIMEFRAME_BIAS_TIMEFRAMES,
  deriveTimeframeBias,
  unavailableTimeframeBias,
  type TimeframeBiasRow,
} from "../../lib/trading/timeframe-bias";
import { MARKETS, type Timeframe } from "../../lib/trading/model";
import { aggregateClosedWeeklyFromDaily } from "../../lib/trading/timeframes";
import { closedBarFreshness } from "../../lib/trading/freshness";
import type { User } from "../../drizzle/schema";
import { router } from "../_core/trpc";
import { ownerProcedure } from "./access";
import { getCandles } from "./market";
import { quantHistory as getQuantHistory } from "./quant-data";
import { isBrokerMarket } from "./tradelocker";
import { symbol } from "./validation";

export const TIMEFRAME_BIAS_TIMEOUT_MS = 25_000;
export const TIMEFRAME_BIAS_CONCURRENCY = 3;

type CandleFeed = Awaited<ReturnType<typeof getCandles>>;
type CandleFetcher = (
  market: string,
  timeframe: Timeframe,
  identity?: User | null,
  deadline?: number,
) => Promise<CandleFeed>;

type TimeframeBiasOptions = {
  now?: () => number;
  getCandlesFor?: CandleFetcher;
};

function applyCentralFreshness(
  row: TimeframeBiasRow,
  feed: CandleFeed,
  now: number,
): TimeframeBiasRow {
  if (!row.latestClosedBar) return row;
  const freshness = closedBarFreshness({
    timeframe: row.timeframe,
    latestClosedBar: row.latestClosedBar,
    sourceReceivedAt: feed.fetchedAt,
    sourceCadenceSeconds: feed.sourceCadenceSeconds,
    calendarState: feed.session?.calendarState,
    nowSeconds: now,
  });
  const warnings = [
    ...row.warnings,
    ...(freshness.calendarNote ? [freshness.calendarNote] : []),
  ];
  if (freshness.status === "fresh") return { ...row, warnings };
  return {
    ...row,
    status: "stale",
    values: undefined,
    warnings: [...warnings, freshness.reason!],
  };
}

function acquisitionCutoffSeconds(requestStartedAt: number, feed: CandleFeed) {
  const feedStartedAt = Number.isFinite(feed.requestedAt)
    ? feed.requestedAt!
    : Number.isFinite(feed.fetchedAt)
      ? feed.fetchedAt
      : requestStartedAt;
  return Math.min(requestStartedAt, feedStartedAt) / 1_000;
}

function providerForMarket(market: string): string {
  const known = MARKETS.find((candidate) => candidate.id === market);
  if (known) return known.provider;
  if (isBrokerMarket(market)) return "tradelocker";
  return "unknown provider";
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Historical candles are unavailable for this timeframe.";
}

function timeoutRow(
  timeframe: (typeof TIMEFRAME_BIAS_TIMEFRAMES)[number],
  provider: string,
  now: number,
): TimeframeBiasRow {
  return unavailableTimeframeBias({
    timeframe,
    provider,
    source: "market.getCandles",
    asOf: now,
    message:
      "The 25 second timeframe-bias refresh budget elapsed before this frame completed. No direction was inferred.",
  });
}

function withinDeadline<T>(promise: Promise<T>, deadline: number): Promise<T> {
  const remaining = deadline - Date.now();
  if (remaining <= 0)
    return Promise.reject(new Error("Timeframe-bias refresh budget elapsed."));
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Timeframe-bias refresh budget elapsed.")),
      remaining,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function fetchFrame(
  market: string,
  timeframe: Timeframe,
  user: User,
  deadline: number,
  getCandlesFor: CandleFetcher,
  useRuntimeWeeklyHistory: boolean,
): Promise<CandleFeed> {
  const knownMarket = MARKETS.find((candidate) => candidate.id === market);
  // getCandles' normal 1w route has only its 300-daily-bar window. For the
  // Coinbase 24/7 markets where the existing weekly aggregation is defined,
  // obtain 900 actual daily provider bars and use that exact same helper.
  if (
    useRuntimeWeeklyHistory &&
    timeframe === "1w" &&
    knownMarket?.provider === "coinbase"
  ) {
    const history = await getQuantHistory(market, "1d", user, 900);
    const candles = aggregateClosedWeeklyFromDaily(
      history.candles,
      Date.now() / 1000,
    );
    return {
      candles,
      source: `${history.source}; 1w Monday UTC aggregate from 900 requested real daily bars`,
      fetchedAt: history.fetchedAt,
      timezone: "UTC Monday 00:00 analytical weeks · 24/7 Coinbase crypto only",
      status: "historical",
      sourceCadenceSeconds: 7 * 86_400,
      session: {
        coverage: "continuous",
        timezone: "UTC",
        expectedUtcWeekdays: [0, 1, 2, 3, 4, 5, 6],
        supportsUtc4hAggregation: true,
        calendarState: "open",
      },
      message:
        "Closed aggregate only: seven exact UTC daily source bars are required for each Monday-to-Monday week; no weeks are filled.",
    };
  }
  return getCandlesFor(market, timeframe, user, deadline);
}

/**
 * Fetches every supported interval for one selected market. A failed/slow frame
 * becomes an explicit row; it cannot prevent the remaining frames from returning.
 * The only live input is getCandles (no quote is fetched or retained).
 */
export async function fetchTimeframeBias(
  market: string,
  user: User,
  options: TimeframeBiasOptions = {},
) {
  const now = options.now ?? Date.now;
  const requestedAt = now();
  const deadline = requestedAt + TIMEFRAME_BIAS_TIMEOUT_MS;
  const provider = providerForMarket(market);
  const getCandlesFor = options.getCandlesFor ?? getCandles;
  const useRuntimeWeeklyHistory = !options.getCandlesFor;
  const rows = new Map<Timeframe, TimeframeBiasRow>();
  let cursor = 0;

  const worker = async () => {
    while (Date.now() < deadline) {
      const timeframe = TIMEFRAME_BIAS_TIMEFRAMES[cursor++];
      if (!timeframe) return;
      try {
        const feed = await withinDeadline(
          fetchFrame(
            market,
            timeframe,
            user,
            deadline,
            getCandlesFor,
            useRuntimeWeeklyHistory,
          ),
          deadline,
        );
        // Completion is immutable at the earlier request cutoff. Receipt-time
        // freshness remains independently evaluated against observedAt below.
        const observedAt = now() / 1000;
        const cutoff = acquisitionCutoffSeconds(requestedAt, feed);
        rows.set(
          timeframe,
          applyCentralFreshness(
            deriveTimeframeBias({
              timeframe,
              candles: feed.candles,
              provider,
              source: feed.source,
              asOf: feed.fetchedAt,
              now: cutoff,
            }),
            feed,
            observedAt,
          ),
        );
      } catch (error) {
        rows.set(
          timeframe,
          unavailableTimeframeBias({
            timeframe,
            provider,
            source: "market.getCandles",
            asOf: now(),
            message: errorMessage(error),
          }),
        );
      }
    }
  };

  const workers = Array.from(
    {
      length: Math.min(
        TIMEFRAME_BIAS_CONCURRENCY,
        TIMEFRAME_BIAS_TIMEFRAMES.length,
      ),
    },
    () => worker(),
  );
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.all(workers),
      new Promise<void>((resolve) => {
        const remaining = Math.max(0, deadline - Date.now());
        deadlineTimer = setTimeout(resolve, remaining);
      }),
    ]);
  } finally {
    if (deadlineTimer) clearTimeout(deadlineTimer);
  }

  const finishedAt = now();
  for (const timeframe of TIMEFRAME_BIAS_TIMEFRAMES) {
    if (!rows.has(timeframe))
      rows.set(timeframe, timeoutRow(timeframe, provider, finishedAt));
  }

  return {
    market,
    asOf: finishedAt,
    definition: TIMEFRAME_BIAS_DEFINITION,
    rows: TIMEFRAME_BIAS_TIMEFRAMES.map((timeframe) => rows.get(timeframe)!),
  };
}

/** ownerProcedure is both authenticated and constrained by mayUseApp. */
export const biasRouter = router({
  timeframes: ownerProcedure
    .input(z.object({ market: symbol }))
    .query(({ ctx, input }) => fetchTimeframeBias(input.market, ctx.user)),
});
