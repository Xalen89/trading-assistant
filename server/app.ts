import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { AIService } from './ai.js';
import type { PriceProvider } from './prices.js';
import type { Repository } from './repository.js';
import { TradingService } from './services.js';
import { ApiError } from './types.js';
import { dateRange, identifier, instrument, priceInput, record, strategyInput, timeframe, tradeInput } from './validation.js';

interface AppOptions { repository: Repository; prices: PriceProvider; ai: AIService; mode: 'demo' | 'live'; apiToken?: string }
export function createApp(options: AppOptions) {
  const { repository, prices, ai, mode } = options;
  const app = express();
  app.disable('x-powered-by');
  app.set('query parser', 'simple');
  const trading = new TradingService(repository, prices, ai);
  const tokenHash = options.apiToken ? createHash('sha256').update(options.apiToken).digest() : undefined;
  app.use('/api', (req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    if (tokenHash) {
      const authorization = req.get('authorization') ?? '';
      const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
      if (!timingSafeEqual(tokenHash, createHash('sha256').update(supplied).digest())) {
        res.status(401).json({ error: 'Unauthorized.' }); return;
      }
    }
    next();
  });
  // Process-wide bounds are intentional for a single-user, local-first MVP.
  let windowStart = Date.now(); let requests = 0; let expensiveRequests = 0;
  app.use('/api', (_req, res, next) => {
    if (Date.now() - windowStart >= 60000) { windowStart = Date.now(); requests = 0; }
    if (++requests > 240) { res.set('Retry-After', '60').status(429).json({ error: 'Request limit reached; retry shortly.' }); return; }
    next();
  });
  const bounded = (handler: RequestHandler): RequestHandler => async (req, res, next) => {
    if (expensiveRequests >= 3) { res.set('Retry-After', '5').status(429).json({ error: 'Analysis capacity reached; retry shortly.' }); return; }
    expensiveRequests++;
    try { await handler(req, res, next); }
    finally { expensiveRequests--; }
  };
  app.use('/api', express.json({ limit: '64kb', strict: true }));
  app.get('/api/health', (_req, res) => { res.json({ mode, aiConfigured: ai.configured }); });
  app.get('/api/strategies', async (_req, res) => { res.json({ strategies: await repository.strategies() }); });
  app.post('/api/strategies', async (req, res) => {
    const strategy = await repository.saveStrategy(strategyInput(req.body));
    res.status(201).json({ strategy });
  });
  app.get('/api/trades', async (req, res) => {
    const filter = {
      ...(req.query.instrument === undefined ? {} : { instrument: instrument(req.query.instrument) }),
      ...(req.query.strategyId === undefined ? {} : { strategyId: identifier(req.query.strategyId) }),
    };
    res.json({ trades: (await repository.trades(filter)).slice(0, 5000) });
  });
  app.post('/api/trades', async (req, res) => {
    const data = tradeInput(req.body);
    if (!await repository.strategy(data.strategyId)) throw new ApiError(404, 'Strategy not found.');
    res.status(201).json({ trade: await repository.saveTrade(data) });
  });
  app.get('/api/price-data', bounded(async (req, res) => { res.json(await prices.get(priceInput(req.query))); }));
  app.post('/api/analyze', bounded(async (req, res) => {
    const data = record(req.body);
    const analysis = await trading.analyze(instrument(data.instrument), timeframe(data.timeframe), identifier(data.strategyId));
    res.json({ analysis });
  }));
  app.get('/api/analyses', async (req, res) => {
    res.json({ analyses: await repository.analyses(
      req.query.instrument === undefined ? undefined : instrument(req.query.instrument),
      req.query.timeframe === undefined ? undefined : timeframe(req.query.timeframe)) });
  });
  app.post('/api/backtest', bounded(async (req, res) => {
    const data = record(req.body);
    const range = dateRange(data.from, data.to);
    res.json(await trading.backtest(instrument(data.instrument), timeframe(data.timeframe), identifier(data.strategyId), range.from, range.to));
  }));
  app.use((_req, res) => { res.status(404).json({ error: 'Route not found.' }); });
  const onError: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof ApiError) { res.status(error.status).json({ error: error.message }); return; }
    const err = error as { type?: string; code?: string };
    if (err?.type === 'entity.too.large') { res.status(413).json({ error: 'Request body is too large.' }); return; }
    if (err?.type === 'entity.parse.failed') { res.status(400).json({ error: 'Invalid JSON body.' }); return; }
    if (err?.code === '23503') { res.status(409).json({ error: 'Referenced record is not available.' }); return; }
    // Do not log provider responses, SQL errors, prompts, tokens, or request bodies.
    res.status(500).json({ error: 'An internal error occurred.' });
  };
  app.use(onError);
  return app;
}
