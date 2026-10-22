import { TRPCError } from "@trpc/server";
import {
  MARKETS,
  type Candle,
  type Quote,
  type Timeframe,
} from "../../lib/trading/model";
import { SECONDS, validateCandles } from "../../lib/trading/engine";
import {
  recentCoinbaseWindow,
  parseRecentCoinbaseCandles,
} from "./coinbase-window";
import { beforeDeadline, requestTimeout } from "./scan-budget";
import { scheduledScanDeadline } from "./scheduled-scan-budget";
import {
  aggregateClosed30mFrom15m,
  aggregateClosed4hFromHourly,
  isDerivedTimeframe,
  utcMondayStart,
} from "../../lib/trading/timeframes";
import {
  quoteFreshnessAt,
  quoteStatusAt,
  type SourceSessionMetadata,
} from "../../lib/trading/freshness";
import {
  brokerQuote,
  brokerCandles,
  retryBrokerQuote,
  retryBrokerCandles,
  isBrokerMarket,
  requireBrokerOwner,
  type BrokerIdentity,
} from "./tradelocker";

const cache = new Map<string, { until: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

export type CandleFeed = {
  candles: Candle[];
  source: string;
  /** Stable source basis for equality checks; unlike the human provenance label. */
  sourceIdentity?: string;
  fetchedAt: number;
  requestedAt?: number;
  timezone: string;
  status: "live" | "historical";
  message?: string;
  sourceCadenceSeconds?: number;
  /** Declared only when the source confirms its reported volume is venue volume. */
  volumeBasis?: "venue" | "broker-reported" | "unknown";
  /** Declared only when the source confirms daily bars are continuous UTC days. */
  dailyPeriodBasis?:
    | "utc-continuous-24h"
    | "utc-provider-trading-days"
    | "unknown";
  session?: SourceSessionMetadata;
};

/** Quote provenance is optional only for unavailable/error results. */
export type MarketQuote = Quote;

const COINBASE_24_7_SESSION: SourceSessionMetadata = {
  coverage: "continuous",
  timezone: "UTC",
  expectedUtcWeekdays: [0, 1, 2, 3, 4, 5, 6],
  supportsUtc4hAggregation: true,
  calendarState: "open",
};

function unknownSession(
  reason: string,
  timezone: string,
): SourceSessionMetadata {
  return { coverage: "unknown", timezone, calendarState: "unknown", reason };
}

export async function cached<T>(
  key: string,
  ttl: number,
  work: () => Promise<T>,
): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.value as T;
  if (inflight.has(key)) return inflight.get(key) as Promise<T>;
  const task = work()
    .then((value) => {
      cache.set(key, { until: Date.now() + ttl, value });
      if (cache.size > 200) cache.delete(cache.keys().next().value!);
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, task);
  return task;
}

export async function jsonFetch(
  url: string,
  headers: Record<string, string> = {},
  deadline?: number,
) {
  deadline = scheduledScanDeadline(deadline);
  if (deadline !== undefined && deadline <= Date.now())
    throw new TRPCError({
      code: "TIMEOUT",
      message: "Market data request deadline exceeded.",
    });
  const response = await fetch(url, {
    headers: { Accept: "application/json", ...headers },
    signal: AbortSignal.timeout(
      deadline === undefined
        ? 15_000
        : Math.max(1, Math.min(15_000, deadline - Date.now())),
    ),
  });
  if (!response.ok)
    throw new Error(
      `Market provider returned HTTP ${response.status}. Check data entitlement or retry later.`,
    );
  const data = await response.json();
  if (data?.error || data?.["Error Message"] || data?.["Information"])
    throw new Error("Market provider returned an unavailable-data response.");
  return data;
}

export function fmpAvailable() {
  return Boolean(process.env.FMP_API_KEY);
}
export async function fmp(path: string, params: Record<string, string> = {}) {
  if (!fmpAvailable())
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "This market needs a read-only FMP data key and the relevant instrument entitlement. No trading account is needed.",
    });
  const url = new URL(`https://financialmodelingprep.com/stable/${path}`);
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, value);
  return jsonFetch(url.toString(), { apikey: process.env.FMP_API_KEY! });
}

export function marketById(id: string) {
  const market = MARKETS.find((candidate) => candidate.id === id);
  if (!market)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Unknown instrument.",
    });
  return market;
}

/** @deprecated Prefer quoteFreshnessAt for the reason and policy age. */
export function quoteFreshness(timestamp: number): "live" | "stale" {
  return quoteStatusAt(timestamp);
}

function quoteFailure(
  symbol: string,
  provider: string,
  error: unknown,
): MarketQuote {
  const detail = error instanceof Error ? error.message : "Data unavailable.";
  return {
    symbol,
    price: 0,
    change: 0,
    timestamp: 0,
    source: provider,
    status: "unavailable",
    message: `${detail} No candle close was used as a substitute quote; retry reads the provider again.`,
  };
}

function staleQuoteMessage(
  provider: "coinbase" | "fmp",
  timestamp: number,
  receivedAt: number,
): string | undefined {
  const freshness = quoteFreshnessAt(timestamp, receivedAt);
  if (freshness.status === "live") return undefined;
  const context =
    provider === "coinbase"
      ? "Coinbase spot is expected to trade continuously; retry the public REST quote or allow the ticker stream to resume."
      : "This can reflect a scheduled market closure, delayed entitlement, or provider latency; calendar closure does not make the quote live.";
  return `${freshness.reason} Provider timestamp ${new Date(timestamp * 1_000).toISOString()}; server receipt ${new Date(receivedAt * 1_000).toISOString()}. ${context} A candle close was not used as a substitute quote.`;
}

export async function getQuote(
  symbol: string,
  identity?: BrokerIdentity | null,
  deadline?: number,
): Promise<MarketQuote> {
  if (isBrokerMarket(symbol)) {
    requireBrokerOwner(identity);
    deadline = scheduledScanDeadline(deadline);
    requestTimeout(deadline);
    return brokerQuote(symbol, deadline);
  }
  deadline = scheduledScanDeadline(deadline);
  requestTimeout(deadline);
  const market = marketById(symbol);
  try {
    return await cached(`quote:${symbol}`, 10_000, async () => {
      if (market.provider === "pending")
        throw new Error(
          "Exchange futures quotes are broker-only until a licensed futures feed is connected. A cash index is not this contract.",
        );
      if (market.provider === "coinbase") {
        const [ticker, stats] = await Promise.all([
          jsonFetch(
            `https://api.exchange.coinbase.com/products/${market.providerSymbol}/ticker`,
            {},
            deadline,
          ),
          cached(`stats:${symbol}`, 60_000, () =>
            jsonFetch(
              `https://api.exchange.coinbase.com/products/${market.providerSymbol}/stats`,
              {},
              deadline,
            ),
          ),
        ]);
        const price = Number(ticker.price);
        const timestamp = Date.parse(ticker.time) / 1_000;
        const receivedAt = Date.now() / 1_000;
        if (
          !Number.isFinite(price) ||
          !Number.isFinite(timestamp) ||
          price <= 0
        )
          throw new Error(
            "Coinbase returned no valid price and source timestamp.",
          );
        const bid = Number(ticker.bid),
          ask = Number(ticker.ask);
        const spreadValid =
          Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask >= bid;
        return {
          symbol,
          price,
          bid: spreadValid ? bid : undefined,
          ask: spreadValid ? ask : undefined,
          timestampKind: "provider" as const,
          change: Number(stats.open)
            ? 100 * (price / Number(stats.open) - 1)
            : 0,
          timestamp,
          source: "Coinbase Exchange · public REST · provider timestamp",
          sourceIdentity: "coinbase-exchange-public-rest",
          status: quoteStatusAt(timestamp, receivedAt),
          message: staleQuoteMessage("coinbase", timestamp, receivedAt),
        };
      }
      const data = await fmp("quote", { symbol: market.providerSymbol });
      const quote = Array.isArray(data) ? data[0] : null;
      const price = Number(quote?.price),
        timestamp = Number(quote?.timestamp);
      const receivedAt = Date.now() / 1_000;
      if (
        !Number.isFinite(price) ||
        price <= 0 ||
        !Number.isFinite(timestamp) ||
        timestamp <= 0
      )
        throw new Error(
          "No timestamped quote for this instrument; verify provider symbol and entitlement.",
        );
      return {
        symbol,
        price,
        change: Number(quote.changesPercentage ?? quote.changePercentage ?? 0),
        timestamp,
        source: "FMP · provider quote (may be delayed)",
        sourceIdentity: "fmp",
        status: quoteStatusAt(timestamp, receivedAt),
        message: staleQuoteMessage("fmp", timestamp, receivedAt),
      };
    });
  } catch (error) {
    return quoteFailure(
      symbol,
      market.provider === "coinbase"
        ? "Coinbase Exchange"
        : market.provider === "fmp"
          ? "FMP"
          : "Futures feed pending",
      error,
    );
  }
}

/** Let an old in-flight response finish before invalidation, so it cannot repopulate the cache. */
async function invalidateRead(key: string, deadline?: number) {
  const pending = inflight.get(key);
  if (pending)
    await beforeDeadline(
      pending.catch(() => undefined),
      deadline,
    );
  cache.delete(key);
}

/** Re-reads the same provider/instrument, never another account or a candle substitute. */
export async function retryQuote(
  symbol: string,
  identity?: BrokerIdentity | null,
  deadline?: number,
): Promise<MarketQuote> {
  if (isBrokerMarket(symbol)) {
    requireBrokerOwner(identity);
    return retryBrokerQuote(symbol, deadline);
  }
  await invalidateRead(`quote:${symbol}`, deadline);
  return getQuote(symbol, identity, deadline);
}

/** Explicit source refresh for user-invoked analysis; ordinary chart polling stays cached. */
export async function retryCandles(
  symbol: string,
  timeframe: Timeframe,
  identity?: BrokerIdentity | null,
  deadline?: number,
): Promise<CandleFeed> {
  if (isBrokerMarket(symbol)) requireBrokerOwner(identity);
  const key = `candles:${symbol}:${timeframe}`;
  await invalidateRead(key, deadline);
  if (isDerivedTimeframe(timeframe)) {
    await retryCandles(
      symbol,
      timeframe === "30m" ? "15m" : timeframe === "4h" ? "1h" : "1d",
      identity,
      deadline,
    );
    // A concurrent derived read during the lower refresh may have completed; discard it too.
    await invalidateRead(key, deadline);
    return getCandles(symbol, timeframe, identity, deadline);
  }
  if (isBrokerMarket(symbol))
    return retryBrokerCandles(symbol, timeframe, deadline);
  return getCandles(symbol, timeframe, identity, deadline);
}

export async function getQuotes(
  symbols: string[],
  identity?: BrokerIdentity | null,
): Promise<MarketQuote[]> {
  if (symbols.some(isBrokerMarket)) requireBrokerOwner(identity);
  const result: MarketQuote[] = [];
  for (let index = 0; index < symbols.length; index += 3) {
    result.push(
      ...(await Promise.all(
        symbols
          .slice(index, index + 3)
          .map((symbol) =>
            getQuote(symbol, identity).catch((error) =>
              quoteFailure(
                symbol,
                isBrokerMarket(symbol)
                  ? "TradeLocker · private account"
                  : "Market data",
                error,
              ),
            ),
          ),
      )),
    );
  }
  return result;
}

export function zonedTimestamp(date: string, timezone: string) {
  if (/Z$|[+-]\d\d:\d\d$/.test(date)) return Date.parse(date) / 1_000;
  const naive = Date.parse(date.replace(" ", "T") + "Z");
  if (!Number.isFinite(naive)) return NaN;
  let guess = naive;
  for (let index = 0; index < 3; index++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(guess));
    const values = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    );
    const shown = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second),
    );
    guess += naive - shown;
  }
  return guess / 1_000;
}

/**
 * Builds Monday UTC weeks only from a provider-declared set of daily periods.
 * A five-day FX session and seven-day crypto session use the same no-fill rule.
 */
export function aggregateClosedWeeklyFromDeclaredDaily(
  daily: Candle[],
  now: number,
  expectedUtcWeekdays: readonly number[],
): Candle[] {
  const weekdays = new Set(expectedUtcWeekdays);
  if (
    !weekdays.size ||
    [...weekdays].some((day) => !Number.isInteger(day) || day < 0 || day > 6)
  )
    return [];
  const byTime = new Map(
    daily
      .filter((bar) => bar.time % 86_400 === 0)
      .map((bar) => [bar.time, bar]),
  );
  const starts = new Set([...byTime.keys()].map(utcMondayStart));
  const week = 7 * 86_400;
  const output: Candle[] = [];
  for (const start of starts) {
    if (start + week > now) continue;
    const bars: Candle[] = [];
    for (let day = 0; day < 7; day++) {
      const time = start + day * 86_400;
      if (weekdays.has(new Date(time * 1_000).getUTCDay())) {
        const bar = byTime.get(time);
        if (!bar) break;
        bars.push(bar);
      }
    }
    if (bars.length !== weekdays.size) continue;
    output.push({
      time: start,
      open: bars[0].open,
      high: Math.max(...bars.map((bar) => bar.high)),
      low: Math.min(...bars.map((bar) => bar.low)),
      close: bars.at(-1)!.close,
      volume: bars.reduce((total, bar) => total + bar.volume, 0),
    });
  }
  return output.sort((left, right) => left.time - right.time);
}

function requireAggregationMetadata(
  timeframe: "4h" | "1w",
  session?: SourceSessionMetadata,
) {
  if (!session || session.coverage === "unknown")
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `${timeframe} aggregation was refused: the source has no declared session metadata. ${session?.reason || "No session closure or missing period was assumed."}`,
    });
  if (timeframe === "4h" && !session.supportsUtc4hAggregation)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "4h aggregation was refused: this declared source does not support complete UTC hourly bucket coverage. No hourly gap was filled.",
    });
  if (timeframe === "1w" && !session.expectedUtcWeekdays?.length)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Weekly aggregation was refused: the declared source did not provide its actual UTC daily session periods. No calendar closure was guessed.",
    });
}

export async function getCandles(
  symbol: string,
  timeframe: Timeframe,
  identity?: BrokerIdentity | null,
  deadline?: number,
): Promise<CandleFeed> {
  // Authorization must precede every branch, including a derived-frame cache
  // hit. Private aggregate bars are never kept in this shared cache.
  if (isBrokerMarket(symbol)) requireBrokerOwner(identity);
  deadline = scheduledScanDeadline(deadline);
  requestTimeout(deadline);
  if (isDerivedTimeframe(timeframe)) {
    const derive = async (): Promise<CandleFeed> => {
      const sourceFrame =
        timeframe === "30m" ? "15m" : timeframe === "4h" ? "1h" : "1d";
      const source = await getCandles(symbol, sourceFrame, identity, deadline);
      if (timeframe !== "30m")
        requireAggregationMetadata(timeframe, source.session);
      const now =
        Math.min(Date.now(), source.requestedAt ?? source.fetchedAt) / 1_000;
      const candles =
        timeframe === "30m"
          ? aggregateClosed30mFrom15m(source.candles, now)
          : timeframe === "4h"
            ? aggregateClosed4hFromHourly(source.candles, now)
            : aggregateClosedWeeklyFromDeclaredDaily(
                source.candles,
                now,
                source.session!.expectedUtcWeekdays!,
              );
      if (candles.length < 3)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            timeframe === "30m"
              ? "30m aggregation needs at least three closed UTC buckets with both exact contiguous 15m source periods. Incomplete/current buckets, missing periods, and duplicate/conflicting periods are omitted, never filled."
              : timeframe === "4h"
                ? "4h aggregation needs at least three closed UTC buckets with all four exact hourly source bars. Incomplete/current buckets and genuine missing hours are omitted, never filled."
                : "Weekly aggregation needs at least three completed Monday-to-Monday buckets with every declared daily source period. Incomplete weeks and calendar gaps are omitted, never filled.",
        });
      return {
        candles: candles.slice(-300),
        source: `${source.source} · ${timeframe === "30m" ? "30m UTC aggregate from exact contiguous 15m periods" : timeframe === "4h" ? "4h UTC aggregate from exact 1h periods" : "1w Monday UTC aggregate from declared daily periods"}`,
        sourceIdentity: source.sourceIdentity,
        requestedAt: source.requestedAt ?? source.fetchedAt,
        fetchedAt: source.fetchedAt,
        timezone:
          timeframe === "30m"
            ? `UTC 30-minute analytical buckets; source basis: ${source.timezone}`
            : timeframe === "4h"
              ? `UTC 4-hour analytical buckets; source basis: ${source.timezone}`
              : `UTC Monday 00:00 analytical weeks; source basis: ${source.timezone}`,
        status: "historical" as const,
        sourceCadenceSeconds: SECONDS[timeframe],
        volumeBasis: source.volumeBasis,
        dailyPeriodBasis: source.dailyPeriodBasis,
        session: source.session,
        message:
          timeframe === "30m"
            ? "Closed aggregate only: both exact contiguous 15-minute source periods are required in each UTC half-hour. A missing or duplicate source period is a genuine gap, never a carry-forward candle."
            : timeframe === "4h"
              ? "Closed aggregate only: all four exact hourly source periods are required. A missing hour is a genuine gap, not a carry-forward candle."
              : "Closed aggregate only: every declared daily source period is required for each Monday-to-Monday week. Calendar closures are included only when the source declared them.",
      };
    };
    // The broker lower-frame read owns the private cache identity. Do not put a
    // derived broker result in this process-wide symbol cache.
    return isBrokerMarket(symbol)
      ? derive()
      : cached(`candles:${symbol}:${timeframe}`, 60_000, derive);
  }
  if (isBrokerMarket(symbol)) {
    return brokerCandles(symbol, timeframe, deadline);
  }
  const market = marketById(symbol);
  if (market.provider === "pending")
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Exchange futures are broker-only until a licensed futures source is connected. Select a connected broker instrument or Sample mode to explore clearly labelled demo data.",
    });
  return cached(
    `candles:${symbol}:${timeframe}`,
    60_000,
    async (): Promise<CandleFeed> => {
      const requestedAt = Date.now();
      if (market.provider === "coinbase") {
        const window = recentCoinbaseWindow(market.providerSymbol, timeframe);
        const raw = await jsonFetch(
          window.url,
          { "Cache-Control": "no-cache" },
          deadline,
        );
        const candles = parseRecentCoinbaseCandles(raw, window);
        return {
          candles,
          source: "Coinbase Exchange",
          sourceIdentity: "coinbase-exchange-public-rest",
          fetchedAt: Date.now(),
          requestedAt,
          timezone: "UTC (24/7 crypto)",
          status: "historical",
          sourceCadenceSeconds: SECONDS[timeframe],
          volumeBasis: "venue",
          dailyPeriodBasis: "utc-continuous-24h",
          session: COINBASE_24_7_SESSION,
          message: `Explicit recent UTC window ${new Date(window.from * 1_000).toISOString()} to ${new Date(window.to * 1_000).toISOString()}. Returned bar times and real no-trade gaps are retained; a recent fetch does not make an old completed bar current. Price updates use only timestamped quotes.`,
        };
      }
      const interval = {
        "1m": "1min",
        "5m": "5min",
        "15m": "15min",
        "1h": "1hour",
        "1d": "1day",
      }[timeframe];
      const raw = await fmp(
        timeframe === "1d"
          ? "historical-price-eod/full"
          : `historical-chart/${interval}`,
        { symbol: market.providerSymbol },
      );
      const timezone = process.env.FMP_CHART_TIMEZONE || "America/New_York";
      const candles = validateCandles(
        (Array.isArray(raw) ? raw : raw.historical || []).map((row: any) => ({
          time: row.timestamp
            ? Number(row.timestamp)
            : zonedTimestamp(row.date, timezone),
          open: row.open,
          high: row.high,
          low: row.low,
          close: row.close,
          volume: row.volume || 0,
        })),
      ).slice(-300);
      return {
        candles,
        source: "FMP",
        sourceIdentity: "fmp",
        fetchedAt: Date.now(),
        requestedAt,
        timezone,
        status: "historical",
        sourceCadenceSeconds: SECONDS[timeframe],
        volumeBasis: "unknown",
        dailyPeriodBasis: "unknown",
        session: unknownSession(
          "FMP response does not declare the instrument's session calendar or guaranteed UTC source periods.",
          timezone,
        ),
        message: `Provider historical bars. Unzoned date strings use configured ${timezone}; session closure and source-period coverage are not declared, so derived 4h/weekly bars are refused rather than fabricated.`,
      };
    },
  );
}

export async function marketContext() {
  if (!fmpAvailable())
    return (await import("./public-context")).getPublicContext();
  const results = await Promise.allSettled([
    cached("economic", 300_000, () => fmp("economic-calendar")),
    cached("cot", 3_600_000, () => fmp("commitment-of-traders-report")),
  ]);
  return {
    events:
      results[0].status === "fulfilled" ? results[0].value.slice(0, 50) : [],
    cot: results[1].status === "fulfilled" ? results[1].value.slice(0, 12) : [],
    message: results.some((result) => result.status === "rejected")
      ? "Some context endpoints are unavailable; check data access."
      : "FMP published context; check each event/report date.",
  };
}
