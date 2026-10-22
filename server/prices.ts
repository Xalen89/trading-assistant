import { ApiError, seconds, type Candle, type Instrument, type PriceQuery, type Timeframe } from './types.js';
import type { Repository } from './repository.js';

export interface PriceResult {
  candles: Candle[]; instrument: Instrument; timeframe: Timeframe; source: 'demo' | 'oanda'; asOf: string;
}
export interface PriceProvider { readonly source: 'demo' | 'oanda'; get(query: PriceQuery, asOf?: Date): Promise<PriceResult> }
export interface OandaConfig {
  token: string; environment: 'practice' | 'live'; nas100: string; xauusd: string;
}
const granularity: Record<Timeframe, string> = { '5m': 'M5', '15m': 'M15', '1h': 'H1', '4h': 'H4', '1d': 'D' };
async function boundedBody(response: Response): Promise<string> {
  const limit = 2_000_000;
  if (Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel();
    throw new Error('Oversized response');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Missing provider response');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) throw new Error('Oversized response');
      chunks.push(chunk.value);
    }
    return Buffer.concat(chunks, size).toString('utf8');
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function completed(candles: Candle[], timeframe: Timeframe, asOf: Date): Candle[] {
  const cutoff = asOf.getTime() / 1000;
  return candles.filter(c => c.time + seconds[timeframe] <= cutoff);
}
// The waveform depends only on instrument and candle timestamp, never the request window.
export function demoCandles(query: PriceQuery, asOf: Date): Candle[] {
  const step = seconds[query.timeframe];
  const end = Math.floor(Math.min(asOf.getTime(), query.to ? Date.parse(query.to) : Infinity) / 1000 / step) * step;
  const start = Math.max(end - query.limit * step, query.from ? Math.ceil(Date.parse(query.from) / 1000 / step) * step : -Infinity);
  const base = query.instrument === 'NAS100' ? 19000 : 2300;
  const scale = query.instrument === 'NAS100' ? 60 : 8;
  const price = (time: number) => base + scale * (Math.sin(time / 36000) + Math.sin(time / 70100) * 0.6);
  const candles: Candle[] = [];
  for (let time = start; time < end; time += step) {
    const open = price(time); const close = price(time + step);
    const wick = scale * (0.1 + Math.abs(Math.sin(time / 15000)) * 0.2);
    candles.push({ time, open, close, high: Math.max(open, close) + wick, low: Math.min(open, close) - wick,
      volume: 100 + Math.floor(Math.abs(Math.sin(time / 1000)) * 900) });
  }
  return candles;
}
function parseOanda(value: unknown): Candle[] {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { candles?: unknown }).candles)) throw new Error('Invalid candle envelope');
  const rows = (value as { candles: unknown[] }).candles;
  if (rows.length > 1000) throw new Error('Too many candles');
  const candles: Candle[] = [];
  for (const item of rows) {
    if (!item || typeof item !== 'object') throw new Error('Invalid candle');
    const row = item as Record<string, unknown>;
    if (row.complete !== true) continue;
    const mid = row.mid as Record<string, unknown> | undefined;
    if (!mid || typeof row.time !== 'string' || typeof row.volume !== 'number') throw new Error('Invalid candle');
    const candle: Candle = { time: Date.parse(row.time) / 1000, open: Number(mid.o), high: Number(mid.h), low: Number(mid.l), close: Number(mid.c), volume: row.volume };
    if (!Number.isSafeInteger(candle.time) || candle.time < 0 || !Object.values(candle).every(Number.isFinite)
      || candle.low <= 0 || candle.volume < 0 || candle.high < Math.max(candle.open, candle.close)
      || candle.low > Math.min(candle.open, candle.close) || candle.low > candle.high) throw new Error('Invalid OHLCV');
    candles.push(candle);
  }
  return [...new Map(candles.map(c => [c.time, c])).values()].sort((a, b) => a.time - b.time);
}
export class PriceService implements PriceProvider {
  readonly source: 'demo' | 'oanda';
  constructor(private repository: Repository, private oanda?: OandaConfig, private fetcher: typeof fetch = fetch) {
    this.source = oanda ? 'oanda' : 'demo';
  }
  async get(query: PriceQuery, asOf = new Date()): Promise<PriceResult> {
    const effectiveAsOf = new Date(Math.min(asOf.getTime(), Date.now(), query.to ? Date.parse(query.to) : Infinity));
    let candles: Candle[];
    if (!this.oanda) candles = demoCandles(query, effectiveAsOf);
    else {
      const providerInstrument = query.instrument === 'NAS100' ? this.oanda.nas100 : this.oanda.xauusd;
      const host = this.oanda.environment === 'live' ? 'https://api-fxtrade.oanda.com' : 'https://api-fxpractice.oanda.com';
      const url = new URL(`/v3/instruments/${encodeURIComponent(providerInstrument)}/candles`, host);
      url.searchParams.set('granularity', granularity[query.timeframe]);
      url.searchParams.set('price', 'M');
      url.searchParams.set('count', String(query.limit));
      url.searchParams.set('to', effectiveAsOf.toISOString());
      // UTC alignment keeps D/H4 durations fixed across New York DST transitions.
      url.searchParams.set('dailyAlignment', '0');
      url.searchParams.set('alignmentTimezone', 'UTC');
      try {
        const response = await this.fetcher(url, { headers: { Authorization: 'Bearer ' + this.oanda.token }, signal: AbortSignal.timeout(10000), redirect: 'error' });
        if (!response.ok) { await response.body?.cancel(); throw new Error('Provider failure'); }
        const body = await boundedBody(response);
        candles = parseOanda(JSON.parse(body));
      } catch {
        throw new ApiError(502, 'Market data provider request failed.');
      }
    }
    candles = completed(candles, query.timeframe, effectiveAsOf)
      .filter(c => !query.from || c.time >= Date.parse(query.from) / 1000)
      .slice(-query.limit);
    const source = this.source;
    await this.repository.saveCandles(query.instrument, query.timeframe, source, candles);
    return { candles, instrument: query.instrument, timeframe: query.timeframe, source, asOf: effectiveAsOf.toISOString() };
  }
}
