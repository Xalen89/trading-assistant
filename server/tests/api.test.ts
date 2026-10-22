import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { AIService, validateAI } from '../ai.js';
import { createApp } from '../app.js';
import { MemoryRepository } from '../repository.js';
import { PriceService, demoCandles, completed, type PriceProvider, type PriceResult } from '../prices.js';
import { TradingService, assertNoLookahead, metrics } from '../services.js';
import { type Candle, type PriceQuery, type Trade } from '../types.js';
import { dateRange, iso, priceInput, strategyInput, tradeInput } from '../validation.js';

const entry = {
  strategyId: 'OTE', instrument: 'NAS100' as const, timeframe: '5m' as const, direction: 'long' as const,
  entry: 100, exit: 110, quantity: 2, entryTime: '2025-01-03T10:00:00.000Z',
  exitTime: '2025-01-03T11:00:00.000Z', notes: 'A journal record.',
};
async function fixture(apiToken?: string) {
  const repository = new MemoryRepository();
  const prices = new PriceService(repository);
  const ai = new AIService();
  const server = createApp({ repository, prices, ai, mode: 'demo', apiToken }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    repository,
    request: async (path: string, body?: unknown, token?: string) => {
      const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST',
        headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: response.status, data: await response.json() as Record<string, any> };
    },
    close: () => new Promise<void>((resolve, reject) => { server.closeAllConnections(); server.close(error => error ? reject(error) : resolve()); }),
    base,
  };
}
test('validation rejects malformed, unbounded and nonfinite input', () => {
  for (const limit of ['0', '1001', '-1', 'NaN', '3.2', ['300']]) {
    assert.throws(() => priceInput({ instrument: 'NAS100', timeframe: '5m', limit }));
  }
  assert.throws(() => priceInput({ instrument: 'EURUSD', timeframe: '5m' }));
  assert.throws(() => priceInput({ instrument: 'NAS100', timeframe: '1m' }));
  assert.throws(() => priceInput({ instrument: ['NAS100'], timeframe: '5m' }));
  assert.throws(() => iso('2025-02-30T00:00:00Z', 'from'));
  assert.throws(() => iso('2025-01-01', 'from'));
  assert.throws(() => dateRange('2025-01-01T00:00:00Z', '2024-01-01T00:00:00Z'));
  assert.throws(() => dateRange('2020-01-01T00:00:00Z', '2025-01-01T00:00:00Z'));
  assert.throws(() => tradeInput({ ...entry, quantity: NaN }));
  assert.throws(() => tradeInput({ ...entry, exitTime: '2024-01-01T00:00:00Z' }));
  assert.throws(() => tradeInput({ ...entry, exitTime: '2099-01-01T00:00:00Z' }));
  assert.throws(() => tradeInput({ ...entry, stopLoss: 101 }));
  assert.throws(() => strategyInput({ name: 'Test', description: '', rules: [], parameters: { multiplier: Infinity } }));
  assert.equal(iso('2025-01-01T02:00:00+02:00', 'from'), '2025-01-01T00:00:00.000Z');
  assert.equal(tradeInput({ ...entry, stopLoss: 95, takeProfit: 115, riskAmount: 10 }).riskAmount, 10);
});
test('demo endpoints expose honest mode, configurable strategies, journal and analyses', async () => {
  const api = await fixture();
  try {
    assert.deepEqual((await api.request('/api/health')).data, { mode: 'demo', aiConfigured: false });
    const seeds = (await api.request('/api/strategies')).data.strategies;
    assert.deepEqual(seeds.map((s: { id: string }) => s.id), ['WR1', 'OTE']);
    assert.match(seeds[0].description, /not known or verified/);
    const updated = await api.request('/api/strategies', { id: 'WR1', name: 'My WR1', description: 'User rules', rules: ['User-provided rule'], parameters: { verified: false } });
    assert.equal(updated.status, 201);
    assert.equal(updated.data.strategy.id, 'WR1');
    const created = await api.request('/api/trades', entry);
    assert.equal(created.status, 201);
    assert.equal(created.data.trade.quantity, 2);
    assert.equal((await api.request('/api/trades?instrument=NAS100&strategyId=OTE')).data.trades.length, 1);
    assert.equal((await api.request('/api/trades?instrument=XAUUSD')).data.trades.length, 0);
    const prices = await api.request('/api/price-data?instrument=NAS100&timeframe=5m&limit=12');
    assert.equal(prices.status, 200);
    assert.equal(prices.data.source, 'demo');
    assert.equal(prices.data.candles.length, 12);
    for (const candle of prices.data.candles) assert.ok(candle.time + 300 <= Date.parse(prices.data.asOf) / 1000);
    const analyzed = await api.request('/api/analyze', { instrument: 'NAS100', timeframe: '5m', strategyId: 'OTE' });
    assert.equal(analyzed.status, 200);
    assert.equal(analyzed.data.analysis.source, 'demo');
    assert.equal(analyzed.data.analysis.direction, 'wait');
    assert.equal(analyzed.data.analysis.confidence, 0);
    assert.match(analyzed.data.analysis.summary, /Demonstration only/);
    assert.equal(analyzed.data.analysis.sampleSize, 1);
    assert.equal(analyzed.data.analysis.historicalWinRate, 100);
    assert.equal((await api.request('/api/analyses?instrument=NAS100&timeframe=5m')).data.analyses.length, 1);
    assert.equal((await api.request('/api/analyses?instrument=XAUUSD')).data.analyses.length, 0);
    assert.equal((await api.request('/api/analyze', { instrument: 'NAS100', timeframe: '5m', strategyId: 'unknown' })).status, 404);
    assert.equal((await api.request('/api/trades', { ...entry, strategyId: 'unknown' })).status, 404);
    assert.equal((await api.request('/api/price-data?instrument=NAS100&timeframe=5m&limit=1001')).status, 400);
    assert.equal((await api.request('/api/price-data?instrument=NAS100&instrument=XAUUSD&timeframe=5m')).status, 400);
    assert.equal((await api.request('/api/trades', { ...entry, entry: -1 })).status, 400);
    assert.equal((await api.request('/api/unknown')).status, 404);
  } finally { await api.close(); }
});
test('all API routes including health require configured bearer authentication', async () => {
  const api = await fixture('test-shared-token');
  try {
    for (const route of ['/api/health', '/api/strategies', '/api/trades', '/api/analyses', '/api/unknown']) {
      assert.equal((await api.request(route)).status, 401);
      assert.equal((await api.request(route, undefined, 'wrong')).status, 401);
    }
    assert.equal((await api.request('/api/analyze', {}, 'wrong')).status, 401);
    assert.equal((await api.request('/api/health', undefined, 'test-shared-token')).status, 200);
    const badJson = await fetch(api.base + '/api/trades', { method: 'POST', headers: { Authorization: 'Bearer ' + 'test-shared-token', 'Content-Type': 'application/json' }, body: '{"secret"' });
    assert.equal(badJson.status, 400);
    assert.deepEqual(await badJson.json(), { error: 'Invalid JSON body.' });
    const big = await api.request('/api/trades', { notes: 'x'.repeat(70000) }, 'test-shared-token');
    assert.equal(big.status, 413);
    assert.ok(!JSON.stringify(big.data).includes('xxxxx'));
  } finally { await api.close(); }
});
test('demo candles are deterministic across overlapping windows and completed only', () => {
  const now = new Date('2025-01-01T12:02:00Z');
  for (const timeframe of ['5m', '15m', '1h', '4h', '1d'] as const) {
    const query: PriceQuery = { instrument: 'XAUUSD', timeframe, limit: 20 };
    const full = demoCandles(query, now);
    const tail = demoCandles({ ...query, limit: 5 }, now);
    assert.deepEqual(full.slice(-5), tail);
    assert.equal(completed(full, timeframe, now).length, full.length);
    assert.ok(full.every(c => c.low <= Math.min(c.open, c.close) && c.high >= Math.max(c.open, c.close)));
    const bounded = demoCandles({ ...query, from: new Date((full.at(-3)!.time) * 1000).toISOString() }, now);
    assert.equal(bounded.length, 3);
  }
});
test('backtest uses only matching logged closed trades and computes gross metrics including breakevens', async () => {
  const api = await fixture();
  try {
    await api.repository.saveTrade(entry);
    await api.repository.saveTrade({ ...entry, direction: 'short', entry: 100, exit: 110, quantity: 1 });
    await api.repository.saveTrade({ ...entry, exit: 100 });
    await api.repository.saveTrade({ ...entry, instrument: 'XAUUSD' });
    await api.repository.saveTrade({ ...entry, strategyId: 'WR1' });
    await api.repository.saveTrade({ ...entry, timeframe: '1h' });
    await api.repository.saveTrade({ ...entry, entryTime: '2024-12-31T23:00:00Z' });
    await api.repository.saveTrade({ ...entry, exitTime: '2025-02-02T11:00:00Z' });
    const request = { instrument: 'NAS100', timeframe: '5m', strategyId: 'OTE', from: '2025-01-01T00:00:00Z', to: '2025-02-01T00:00:00Z' };
    const response = await api.request('/api/backtest', request);
    assert.equal(response.status, 200);
    assert.equal(response.data.totalTrades, 3);
    assert.equal(response.data.wins, 1);
    assert.equal(response.data.losses, 1);
    assert.ok(Math.abs(response.data.winRate - 100 / 3) < 1e-10);
    assert.equal(response.data.netPnl, 10);
    assert.deepEqual(response.data.patterns, []);
    assert.equal(response.data.source, 'demo');
    assert.ok(response.data.limitations.some((s: string) => s.includes('not a predictive probability')));
    const empty = await api.request('/api/backtest', { ...request, from: '2025-02-01T00:00:00Z', to: '2025-02-02T00:00:00Z' });
    assert.equal(empty.data.winRate, null);
    assert.equal(empty.data.totalTrades, 0);
    assert.equal((await api.request('/api/backtest', { ...request, to: '2024-01-01T00:00:00Z' })).status, 400);
  } finally { await api.close(); }
});
test('historical pattern extraction is bounded and candle windows end at entry, not exit', async () => {
  const repository = new MemoryRepository();
  for (let i = 0; i < 8; i++) await repository.saveTrade({ ...entry, notes: 'untrusted instruction to fabricate results' });
  const requests: { query: PriceQuery; asOf?: Date }[] = [];
  const prices: PriceProvider = {
    source: 'demo',
    async get(query, asOf = new Date()) {
      requests.push({ query, asOf });
      return { candles: demoCandles(query, asOf), source: 'demo', instrument: query.instrument, timeframe: query.timeframe, asOf: asOf.toISOString() };
    },
  };
  let received: any;
  const ai = new AIService({ transport: async prompt => {
    received = JSON.parse(prompt);
    return JSON.stringify({ patterns: ['Descriptive sample observation, not a predictive signal.'], summary: 'Historical journal observation only.' });
  } });
  const service = new TradingService(repository, prices, ai);
  const result = await service.backtest('NAS100', '5m', 'OTE', '2025-01-01T00:00:00Z', '2025-01-04T00:00:00Z');
  assert.equal(result.totalTrades, 8);
  assert.equal(requests.length, 5);
  assert.equal(received.successfulEntries.length, 5);
  for (const sample of received.successfulEntries) {
    assert.equal(sample.entryTime, entry.entryTime);
    assert.ok(sample.candles.every((c: Candle) => c.time + 300 <= Date.parse(sample.entryTime) / 1000));
    assert.ok(!JSON.stringify(sample).includes('notes'));
    assert.equal(sample.candles.length, 60);
  }
  assert.ok(requests.every(r => r.query.to === entry.entryTime && r.asOf?.toISOString() === entry.entryTime));
});
test('lookahead guard rejects provider windows with candles after the entry boundary', async () => {
  const repository = new MemoryRepository();
  await repository.saveTrade(entry);
  const prices: PriceProvider = { source: 'oanda', async get(query, asOf = new Date()): Promise<PriceResult> {
    return { instrument: query.instrument, timeframe: query.timeframe, source: 'oanda', asOf: asOf.toISOString(),
      candles: [{ time: asOf.getTime() / 1000, open: 100, high: 101, low: 99, close: 100, volume: 1 }] };
  } };
  const ai = new AIService({ transport: async () => { throw new Error('Should not be called'); } });
  const service = new TradingService(repository, prices, ai);
  await assert.rejects(() => service.backtest('NAS100', '5m', 'OTE', '2025-01-01T00:00:00Z', '2025-01-04T00:00:00Z'), /completed-candle boundary/);
  await assert.rejects(() => service.analyze('NAS100', '5m', 'OTE'), /completed-candle boundary/);
  assert.throws(() => assertNoLookahead([{ time: 1000, open: 1, high: 1, low: 1, close: 1, volume: 0 }], '5m', new Date(1200 * 1000).toISOString()));
});
test('analysis historical metrics exclude journal exits after the last completed candle', async () => {
  const repository = new MemoryRepository();
  const asOf = new Date('2025-01-03T10:00:00Z');
  await repository.saveTrade({ ...entry, entryTime: '2025-01-03T09:00:00Z', exitTime: '2025-01-03T09:59:00Z' });
  await repository.saveTrade(entry); // Exit is 11:00, unavailable at 10:00.
  const prices: PriceProvider = { source: 'demo', async get(query) {
    return { candles: demoCandles(query, asOf), source: 'demo', instrument: query.instrument, timeframe: query.timeframe, asOf: asOf.toISOString() };
  } };
  const analysis = await new TradingService(repository, prices, new AIService()).analyze('NAS100', '5m', 'OTE');
  assert.equal(analysis.sampleSize, 1);
  assert.equal(analysis.historicalWinRate, 100);
});
test('AI structured JSON validates types, bounds and observed price provenance', async () => {
  const candles = [{ time: 1000, open: 100, high: 105, low: 95, close: 103, volume: 10 }];
  const valid = { summary: 'Educational observation, not a probability.', confidence: 30, direction: 'wait', patterns: [], levels: [{ label: 'Observed high', price: 105 }] };
  assert.equal(validateAI(valid, candles).levels[0].price, 105);
  for (const invalid of [
    { ...valid, confidence: 101 }, { ...valid, confidence: '30' }, { ...valid, confidence: NaN },
    { ...valid, direction: 'buy' }, { ...valid, summary: 'x'.repeat(4001) }, { ...valid, patterns: Array(21).fill('pattern') },
    { ...valid, levels: [{ label: 'Fabricated', price: 104 }] }, { ...valid, levels: [{ label: 'Invalid', price: Infinity }] },
  ]) assert.throws(() => validateAI(invalid, candles));
  for (const transport of [async () => 'not json', async () => JSON.stringify({ ...valid, confidence: 120 }), async () => { throw new Error('private upstream token'); }]) {
    const ai = new AIService({ transport });
    await assert.rejects(() => ai.analyze({ strategy: { id: 'OTE', name: 'OTE', description: '', rules: [], parameters: {} }, candles,
      asOf: '2025-01-01T00:00:00Z', successfulEntries: [], sampleSize: 0, historicalWinRate: null, marketSource: 'oanda' }), error => {
      assert.equal((error as { status: number }).status, 502);
      assert.ok(!(error as Error).message.includes('private')); return true;
    });
  }
});
test('configured AI failures return sanitized 502 via Express without silent demo fallback', async () => {
  const repository = new MemoryRepository();
  const ai = new AIService({ transport: async () => { throw new Error('secret-provider-detail'); } });
  const app = createApp({ repository, prices: new PriceService(repository), ai, mode: 'demo' });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instrument: 'NAS100', timeframe: '5m', strategyId: 'OTE' }) });
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: 'AI provider returned an unavailable or invalid analysis.' });
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
test('OANDA uses mapped instruments and only provider-complete bounded candles, with no fake fallback', async () => {
  const repository = new MemoryRepository();
  const now = new Date('2025-01-01T12:00:00Z');
  let request: URL | undefined;
  const fetcher: typeof fetch = async input => {
    request = new URL(String(input));
    return new Response(JSON.stringify({ candles: [
      { time: '2025-01-01T11:50:00Z', complete: true, mid: { o: '100', h: '105', l: '95', c: '103' }, volume: 20 },
      { time: '2025-01-01T11:55:00Z', complete: false, mid: { o: '103', h: '105', l: '95', c: '100' }, volume: 2 },
      { time: '2025-01-01T12:00:00Z', complete: true, mid: { o: '100', h: '105', l: '95', c: '103' }, volume: 20 },
    ] }));
  };
  const service = new PriceService(repository, { token: 'test-only', environment: 'practice', nas100: 'CUSTOM_NAS', xauusd: 'XAU_USD' }, fetcher);
  const result = await service.get({ instrument: 'NAS100', timeframe: '5m', limit: 10 }, now);
  assert.equal(result.source, 'oanda');
  assert.equal(result.candles.length, 1);
  assert.match(request!.pathname, /CUSTOM_NAS/);
  assert.equal(request!.searchParams.get('to'), now.toISOString());
  assert.equal(request!.searchParams.get('count'), '10');
  assert.equal(request!.searchParams.get('granularity'), 'M5');
  assert.equal(request!.searchParams.get('dailyAlignment'), '0');
  assert.equal(request!.searchParams.get('alignmentTimezone'), 'UTC');
  const broken = new PriceService(repository, { token: 'private-token', environment: 'practice', nas100: 'NAS100_USD', xauusd: 'XAU_USD' },
    async () => new Response('private raw provider error', { status: 401 }));
  await assert.rejects(() => broken.get({ instrument: 'NAS100', timeframe: '5m', limit: 10 }, now), error => {
    assert.equal((error as { status: number }).status, 502);
    assert.equal((error as Error).message, 'Market data provider request failed.'); return true;
  });
  assert.equal((await new PriceService(repository).get({ instrument: 'NAS100', timeframe: '5m', limit: 10 })).source, 'demo');
});
test('empty statistics do not invent outcomes or divide by zero', () => {
  assert.deepEqual(metrics([]), { totalTrades: 0, wins: 0, losses: 0, winRate: null, netPnl: 0 });
  const trade = { ...entry, id: 'test', direction: 'short', entry: 110, exit: 100, quantity: 3 } as Trade;
  assert.equal(metrics([trade]).netPnl, 30);
});
test('review endpoints share six-per-minute and thirty-per-hour budgets independently of normal reads', async t => {
  let clock = Date.now();
  const initial = clock;
  t.mock.method(Date, 'now', () => clock);
  const api = await fixture();
  const body = { instrument: 'NAS100', timeframe: '5m', strategyId: 'OTE', from: '2025-01-01T00:00:00Z', to: '2025-02-01T00:00:00Z' };
  try {
    for (let minute = 0; minute < 5; minute++) {
      for (let i = 0; i < 6; i++) assert.equal((await api.request('/api/backtest', body)).status, 200);
      assert.equal((await api.request('/api/analyze', body)).status, 429);
      assert.equal((await api.request('/api/health')).status, 200);
      clock += 60001;
    }
    const hourly = await fetch(api.base + '/api/backtest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(hourly.status, 429);
    assert.ok(Number(hourly.headers.get('retry-after')) > 3000);
    clock = initial + 3600001;
    assert.equal((await api.request('/api/backtest', body)).status, 200);
  } finally { await api.close(); t.mock.restoreAll(); }
});
test('concurrency cap remains occupied after a client aborts until provider work finishes', async () => {
  const repository = new MemoryRepository();
  let release!: () => void; let ready!: () => void; let calls = 0;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { ready = resolve; });
  const ai = new AIService({ transport: async () => {
    if (++calls === 3) ready();
    await gate;
    return JSON.stringify({ summary: 'Demonstration only.', confidence: 0, direction: 'wait', patterns: [], levels: [] });
  } });
  const server = createApp({ repository, prices: new PriceService(repository), ai, mode: 'demo' }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/analyze`;
  const controller = new AbortController();
  const request = (signal?: AbortSignal) => fetch(url, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instrument: 'NAS100', timeframe: '5m', strategyId: 'OTE' }) });
  const pending = [request(controller.signal).catch(() => undefined), request(), request()];
  try {
    await started;
    controller.abort();
    const denied = await request();
    assert.equal(denied.status, 429);
    assert.equal(calls, 3);
    release();
    const results = await Promise.all(pending);
    assert.ok(results.slice(1).every(r => r?.status === 200));
    assert.equal((await request()).status, 200);
  } finally {
    release(); await Promise.allSettled(pending);
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
test('market provider response memory is bounded and upstream requests carry an abort signal', async () => {
  const repository = new MemoryRepository();
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(1_000_000));
      controller.enqueue(new Uint8Array(1_000_001));
    },
    cancel() { cancelled = true; },
  });
  const fetcher: typeof fetch = async (_input, init) => {
    assert.ok(init?.signal instanceof AbortSignal);
    assert.equal(init?.redirect, 'error');
    return new Response(body);
  };
  const prices = new PriceService(repository, {
    token: 'test-only', environment: 'practice', nas100: 'NAS100_USD', xauusd: 'XAU_USD',
  }, fetcher);
  await assert.rejects(() => prices.get({ instrument: 'NAS100', timeframe: '5m', limit: 10 }), error => {
    assert.equal((error as { status: number }).status, 502); return true;
  });
  assert.equal(cancelled, true);
});
test('market source is independent of health storage mode for all four configurations', async () => {
  for (const storageMode of ['demo', 'live'] as const) {
    for (const configured of [false, true]) {
      const repository = new MemoryRepository();
      const oanda = configured ? { token: 'test-only', environment: 'practice' as const, nas100: 'NAS100_USD', xauusd: 'XAU_USD' } : undefined;
      const prices = new PriceService(repository, oanda, async () => new Response(JSON.stringify({ candles: [
        { time: '2025-01-01T11:50:00Z', complete: true, mid: { o: '100', h: '105', l: '95', c: '103' }, volume: 20 },
      ] })));
      const server = createApp({ repository, prices, ai: new AIService(), mode: storageMode }).listen(0, '127.0.0.1');
      await once(server, 'listening');
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      try {
        assert.equal((await (await fetch(base + '/api/health')).json()).mode, storageMode);
        const result = await (await fetch(base + '/api/price-data?instrument=NAS100&timeframe=5m&limit=1')).json();
        assert.equal(result.source, configured ? 'oanda' : 'demo');
        assert.equal(result.candles.length, 1);
      } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
    }
  }
});
test('OANDA D/H4 requests use UTC midnight alignment and fixed completion boundaries on DST days', async () => {
  const repository = new MemoryRepository();
  for (const day of ['2025-03-09', '2025-11-02']) {
    for (const timeframe of ['1d', '4h'] as const) {
      const start = Date.parse(`${day}T00:00:00Z`);
      const duration = timeframe === '1d' ? 86400000 : 14400000;
      const prices = new PriceService(repository, {
        token: 'test-only', environment: 'practice', nas100: 'NAS100_USD', xauusd: 'XAU_USD',
      }, async input => {
        const url = new URL(String(input));
        assert.equal(url.searchParams.get('dailyAlignment'), '0');
        assert.equal(url.searchParams.get('alignmentTimezone'), 'UTC');
        assert.equal(url.searchParams.get('granularity'), timeframe === '1d' ? 'D' : 'H4');
        return new Response(JSON.stringify({ candles: [
          { time: `${day}T00:00:00Z`, complete: true, mid: { o: '100', h: '105', l: '95', c: '103' }, volume: 20 },
        ] }));
      });
      assert.equal((await prices.get({ instrument: 'NAS100', timeframe, limit: 1 }, new Date(start + duration - 1000))).candles.length, 0);
      assert.equal((await prices.get({ instrument: 'NAS100', timeframe, limit: 1 }, new Date(start + duration))).candles.length, 1);
    }
  }
});
