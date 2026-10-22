# Trading API

Local-first educational journal, not a trading execution engine or financial advice.
No account integration, order execution, or verified/proprietary WR1 definition is provided.

## Run

From the repository root (Node 22+ and the existing root dependencies):

```sh
npx tsx server/index.ts
npx tsc --project server/tsconfig.json
npx tsx --test server/tests/*.test.ts
```

The API defaults to `http://127.0.0.1:3001`. It loads **server/.env**; copy
`server/.env.example` or supply environment variables. No extra packages are needed.
Frontend development should proxy `/api` to the backend; no permissive CORS is enabled.
Polling `/api/price-data` is supported. There is no WebSocket endpoint in this MVP.

### Environment and modes

- `DATABASE_URL` unset: **demo**, deterministic synthetic OHLCV, bounded in-memory
  journal, and all data lost on restart. Synthetic data is never labeled OANDA.
- `DATABASE_URL` set: **live**, PostgreSQL persists strategies, journal trades,
  source-labeled completed candles and analyses. The app applies the idempotent
  `server/schema.sql` at startup; the database user needs schema creation rights.
  There is no fallback to in-memory storage after a database failure.
- `OANDA_API_TOKEN`: required for market prices in live mode. `OANDA_ENVIRONMENT`
  is `practice` (default) or `live`. Defaults map `NAS100` → `NAS100_USD` and
  `XAUUSD` → `XAU_USD`; override with `OANDA_NAS100_INSTRUMENT` /
  `OANDA_XAUUSD_INSTRUMENT` for your account/region.
- `ANTHROPIC_API_KEY`: optional. Without it, AI output explicitly says
  demonstration only and produces no recommendations or fabricated patterns.
  `ANTHROPIC_MODEL` defaults to `claude-sonnet-4-5`; choose a model available
  to your account. Configured AI failures/invalid JSON return **502**, not demo.
  Synthetic market data remains a demonstration even when Claude is enabled.
- `API_TOKEN`: optional shared token. If configured, **every** `/api` request,
  including health, must send an `Authorization` header with the `Bearer` prefix
  followed by the configured token. Never send it as
  a query string. Users are a future schema placeholder, not multi-user auth.
- `HOST` defaults to `127.0.0.1`; `PORT` defaults to `3001`. Before exposing
  remotely, set a strong API token and terminate HTTPS in a trusted proxy.
  Do not place provider keys in frontend configuration.

## Contract

Instruments: `NAS100`, `XAUUSD`. Timeframes: `5m`, `15m`, `1h`, `4h`, `1d`.
Candle time is UNIX **seconds**; journal and analysis times are timezone-qualified ISO timestamps.

- `GET /api/health` → `{ mode: 'demo'|'live', aiConfigured: boolean }`
- `GET /api/strategies` → `{ strategies }`
- `POST /api/strategies` with `{ id?, name, description, rules: string[], parameters }`
  → `{ strategy }`, HTTP 201. Supplied existing ID updates that strategy.
  WR1 is explicitly unverified; OTE is a configurable educational retracement study.
- `GET /api/trades?instrument=&strategyId=` → `{ trades }` (up to 5,000).
- `POST /api/trades` with `{ strategyId, instrument, timeframe, direction: 'long'|'short',
  entry, exit, quantity, entryTime, exitTime, notes }` → `{ trade }`, HTTP 201.
  Closed trades only. Optional positive `stopLoss`, `takeProfit`, `riskAmount`
  are persisted; stops/targets must be on the appropriate side of entry.
  PostgreSQL also derives gross `pnl` and `outcome` (`win`, `loss`, `breakeven`).
- `GET /api/price-data?instrument=NAS100&timeframe=5m&limit=300&from=ISO&to=ISO`
  → `{ candles, instrument, timeframe, source: 'demo'|'oanda', asOf }`.
  Limit is 1–1,000. Only completed candles are returned, in chronological order.
  `from`/`to` are optional, nonfuture, positive windows up to 366 days.
  Returns the **latest bounded page** ending by `to`; not an unlimited history export.
  No provider fallback or AI-generated price feed. `asOf` is the observation cutoff,
  not a claim that the most recent market session has candles at that exact time.
- `POST /api/analyze` with `{ instrument, timeframe, strategyId }` → `{ analysis }`.
  Server loads up to 150 completed candles and linked closed journal trades
  known by the final candle boundary, never client-supplied prices.
  Confidence is subjective evidence quality, **not** a calibrated win probability.
  Every AI level must exactly copy an observed candle OHLC value.
- `GET /api/analyses?instrument=&timeframe=` → `{ analyses }` (up to 100).
- `POST /api/backtest` with `{ instrument, timeframe, strategyId, from, to }`
  → `{ totalTrades, wins, losses, winRate, netPnl, patterns, summary, source, limitations }`.

Errors are sanitized `{ error: string }` with 400 (invalid input), 401, 404, 409,
413, 422 (insufficient data/too much journal history), 429 (bounded capacity),
502 (upstream failure/invalid data), 503 (live price provider unconfigured), or 500.
There is a process-wide 240 API requests/minute bound and at most three concurrent
price requests or AI/journal reviews. Shared-token auth and in-memory bounds are not a production
distributed rate limiter.

## Honest historical review

“Backtest” means **review of actually logged, closed trades**, not simulated
execution or an inferred strategy profitability test. Instrument, timeframe,
strategy and both entry/exit within the requested date window must match.
Win rate is historical wins / all included trades (breakevens are neither wins
nor losses). Empty samples return `null`, not an invented probability.

Gross P&L is `(exit - entry) × quantity × direction`; fees, currency conversion,
slippage, financing, and contract multipliers are excluded. Quantity therefore
represents user-normalized price units, not necessarily broker lots.

Claude extracts descriptive observations from at most the five most recent
successful entries, each using at most 60 candles **completed by entry time**.
No candles from the trade's exit or subsequent period enter pattern extraction.
Entry samples unavailable from the provider are omitted; provider failures return
502 instead of fabricating data. Journal sample size is not the pattern-sample
count. Successful-only selection has survivorship bias and cannot establish
predictive probabilities. User rules must be independently defined and tested.

Tests use `node:test` through the existing `tsx`, local ephemeral HTTP servers,
deterministic data, and injected provider transports; they do not require network
access, a paid API key, or PostgreSQL. Live database integration requires your
own PostgreSQL service; it is not implied by the demo tests.
