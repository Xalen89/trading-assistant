import type { Candle, Timeframe } from "../../lib/trading/model";
import { SECONDS, validateCandles } from "../../lib/trading/engine";
import { isDerivedTimeframe } from "../../lib/trading/timeframes";

export const COINBASE_RECENT_BUCKET_LIMIT = 290;
export type RecentCoinbaseWindow = { url: string; from: number; to: number };

/** Native exchange resolutions only; derived frames use their own exact lower bars. */
export function recentCoinbaseWindow(
  product: string,
  timeframe: Timeframe,
  nowMilliseconds = Date.now(),
): RecentCoinbaseWindow {
  if (isDerivedTimeframe(timeframe))
    throw new Error(
      "Derived Coinbase frames must use actual lower-resolution bars.",
    );
  if (!/^[A-Z0-9]+-[A-Z0-9]+$/.test(product))
    throw new Error("Invalid Coinbase product.");
  if (!Number.isFinite(nowMilliseconds) || nowMilliseconds <= 0)
    throw new Error("Invalid request time.");
  const step = SECONDS[timeframe];
  const to = nowMilliseconds / 1_000;
  const from =
    Math.floor(to / step) * step - step * (COINBASE_RECENT_BUCKET_LIMIT - 1);
  const url = new URL(
    `https://api.exchange.coinbase.com/products/${product}/candles`,
  );
  url.searchParams.set("granularity", String(step));
  url.searchParams.set("start", new Date(from * 1_000).toISOString());
  url.searchParams.set("end", new Date(nowMilliseconds).toISOString());
  return { url: url.toString(), from, to };
}

/** Coinbase can include buckets preceding start. Ignore them; never fill missing periods. */
export function parseRecentCoinbaseCandles(
  raw: unknown,
  window: RecentCoinbaseWindow,
): Candle[] {
  if (!Array.isArray(raw))
    throw new Error("Coinbase returned no candle array.");
  const rows = raw.map((row: unknown) => {
    if (!Array.isArray(row) || row.length < 6)
      throw new Error("Coinbase returned an invalid candle row.");
    return {
      time: Number(row[0]),
      low: Number(row[1]),
      high: Number(row[2]),
      open: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
    };
  });
  const candles = validateCandles(rows).filter(
    (candle) => candle.time >= window.from && candle.time <= window.to,
  );
  if (candles.length < 3)
    throw new Error(
      "Coinbase returned fewer than three actual bars in the requested recent window. No old window or synthetic candles were substituted.",
    );
  return candles.slice(-COINBASE_RECENT_BUCKET_LIMIT);
}
