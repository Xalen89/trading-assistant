import {
  aggregateClosed30mFrom15m,
  aggregateClosed4hFromHourly,
  aggregateClosedWeeklyFromDaily,
} from "../../lib/trading/timeframes";
import { TRPCError } from "@trpc/server";
import type { User } from "../../drizzle/schema";
import type { Candle, Timeframe } from "../../lib/trading/model";
import type { QuantSeries } from "../../lib/trading/quant-lab-types";
import { SECONDS, validateCandles } from "../../lib/trading/engine";
import { cached, getCandles, jsonFetch, marketById } from "./market";
import { isBrokerMarket, requireBrokerOwner } from "./tradelocker";

/** Official provider windows, no synthetic bar/volume gap filling. */
function sameCandle(left: Candle, right: Candle) {
  return (
    left.time === right.time &&
    left.open === right.open &&
    left.high === right.high &&
    left.low === right.low &&
    left.close === right.close &&
    left.volume === right.volume
  );
}

export async function quantHistory(
  symbol: string,
  timeframe: Timeframe,
  user: User,
  requested = 900,
  deadline?: number,
): Promise<QuantSeries> {
  if (isBrokerMarket(symbol)) requireBrokerOwner(user);
  const limit = Math.min(1800, Math.max(60, Math.floor(requested)));
  const market = isBrokerMarket(symbol) ? undefined : marketById(symbol);
  if (
    market?.provider === "coinbase" &&
    (timeframe === "30m" || timeframe === "4h" || timeframe === "1w")
  ) {
    const lower = timeframe === "30m" ? "15m" : timeframe === "4h" ? "1h" : "1d";
    const multiplier = timeframe === "30m" ? 2 : timeframe === "4h" ? 4 : 7;
    const base = await quantHistory(
      symbol,
      lower,
      user,
      Math.min(1800, limit * multiplier),
      deadline,
    );
    const now = Date.now() / 1000;
    const candles =
      timeframe === "30m"
        ? aggregateClosed30mFrom15m(base.candles, now)
        : timeframe === "4h"
        ? aggregateClosed4hFromHourly(base.candles, now)
        : aggregateClosedWeeklyFromDaily(base.candles, now);
    return {
      symbol,
      timeframe,
      source: `${base.source}; closed UTC ${timeframe} aggregation only from complete ${timeframe === "30m" ? "contiguous 15m periods" : lower + " buckets"}; source cap 1800 bars, actual aggregate count disclosed`,
      candles: candles.slice(-limit),
      fetchedAt: base.fetchedAt,
      provenance: "provider",
      adjustedTotalReturn: false,
    };
  }
  if (
    !market ||
    market.provider !== "coinbase" ||
    timeframe === "30m" ||
    timeframe === "4h" ||
    timeframe === "1w"
  ) {
    const feed = await getCandles(symbol, timeframe, user, deadline);
    const now = Date.now() / 1000;
    return {
      symbol,
      timeframe,
      source: `${feed.source}; bounded provider history; ${feed.message || ""}`,
      candles: feed.candles
        .filter((c) => c.time + SECONDS[timeframe] <= now)
        .slice(-limit),
      fetchedAt: feed.fetchedAt,
      provenance: "provider",
      adjustedTotalReturn: false,
    };
  }
  return cached(
    `quant-history:${symbol}:${timeframe}:${limit}`,
    300000,
    async () => {
      const now = Date.now(),
        step = SECONDS[timeframe];
      let end = Math.floor(now / 1000 / step) * step;
      const values = new Map<number, Candle>();
      const conflictingTimes = new Set<number>();
      for (let page = 0; page < Math.ceil(limit / 290); page++) {
        const start = end - step * 290;
        const url = new URL(
          `https://api.exchange.coinbase.com/products/${market.providerSymbol}/candles`,
        );
        url.searchParams.set("granularity", String(step));
        url.searchParams.set("start", new Date(start * 1000).toISOString());
        url.searchParams.set("end", new Date(end * 1000).toISOString());
        const raw = await jsonFetch(url.toString(), {}, deadline);
        if (!Array.isArray(raw))
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Provider returned no candle array.",
          });
        if (!raw.length) break;
        const mapped = raw.map((r: number[]) => ({
          time: Number(r[0]),
          low: Number(r[1]),
          high: Number(r[2]),
          open: Number(r[3]),
          close: Number(r[4]),
          volume: Number(r[5]),
        }));
        const unique = new Map<number, Candle>();
        for (const candle of mapped) {
          if (conflictingTimes.has(candle.time)) continue;
          const previous = unique.get(candle.time);
          if (previous && !sameCandle(previous, candle)) {
            unique.delete(candle.time);
            conflictingTimes.add(candle.time);
          } else if (!previous) {
            unique.set(candle.time, candle);
          }
        }
        const rows = [...unique.values()];
        const sparseValid = rows.every(
          (c) =>
            [c.time, c.low, c.high, c.open, c.close, c.volume].every(
              Number.isFinite,
            ) &&
            c.time > 0 &&
            c.time < 1e11 &&
            c.low > 0 &&
            c.open > 0 &&
            c.close > 0 &&
            c.volume >= 0 &&
            c.high >= Math.max(c.open, c.close, c.low) &&
            c.low <= Math.min(c.open, c.close, c.high),
        );
        if (!sparseValid)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Invalid OHLC in actual provider window.",
          });
        const parsed = rows.length >= 3 ? validateCandles(rows) : rows;
        for (const candle of parsed)
          if (
            candle.time >= start &&
            candle.time < end &&
            candle.time + step <= now / 1000
          ) {
            if (conflictingTimes.has(candle.time)) continue;
            const previous = values.get(candle.time);
            if (previous && !sameCandle(previous, candle)) {
              values.delete(candle.time);
              conflictingTimes.add(candle.time);
            } else if (!previous) {
              values.set(candle.time, candle);
            }
          }
        end = start;
        if (!raw.length) break;
      }
      const candles = [...values.values()]
        .sort((a, b) => a.time - b.time)
        .slice(-limit);
      return {
        symbol,
        timeframe,
        source:
          "Coinbase Exchange official historical API; bounded paged windows; no-tick gaps retained; price returns not adjusted total returns",
        candles,
        fetchedAt: Date.now(),
        provenance: "provider" as const,
        adjustedTotalReturn: false,
      };
    },
  );
}
