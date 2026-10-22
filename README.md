# Trading Assistant

A secondary analysis workspace for **NAS100** and **XAUUSD**: Next.js/React/TypeScript, Express, PostgreSQL, TradingView Lightweight Charts, Zustand, and Anthropic Claude.

## Quick start

Requires Node.js 24+ and npm.

```sh
npm ci
npm --prefix web ci
cp .env.example .env
cp web/.env.example web/.env.local
npm run dev
```

In a second terminal:

```sh
npm run dev:web
```

Open http://localhost:3000. No credentials are required for demo mode. **Demo candles are synthetic, demo analysis is illustrative, and in-memory data disappears when the API restarts.** They must not be used to make trading decisions.

## Configure real data and persistence

Configure the root `.env`:

- `DATABASE_URL`: PostgreSQL connection string. Run `npm run db:migrate` before starting the API. Without it, storage is in memory.
- `OANDA_API_KEY`, `OANDA_ACCOUNT_ID`: OANDA credentials with access to the requested instruments. `OANDA_ENV=practice` is the default; use `live` for the live endpoint. Instrument availability depends on your account/jurisdiction. Override `OANDA_NAS100_INSTRUMENT` and `OANDA_XAUUSD_INSTRUMENT` if needed.
- `ANTHROPIC_API_KEY`: enables Claude analysis. `CLAUDE_MODEL` selects a model available to your account. Claude interprets price data; it is **not** a market-data source.
- `API_TOKEN`: optional shared bearer token protecting the Express API. Set the same value in `web/.env.local`. Never use a `NEXT_PUBLIC_` variable for secrets.

The API binds to `127.0.0.1:4000` and the web server to `127.0.0.1:3000` by default. The browser uses a same-origin Next.js proxy; credentials remain server-side. Set `API_URL` in `web/.env.local` if the backend is elsewhere. Set `APP_PASSWORD` to protect web API access before sharing the app, and deploy behind HTTPS. This is a single-user MVP, not a multi-tenant authentication system. Do not expose an unprotected proxy or API: analysis incurs provider costs and the journal contains private information. The users table reserves space for future multi-user support; row-level access control is not implemented.

Provider failures are shown as errors rather than silently replaced with demo results. Data source and AI source are labeled separately: supplying a Claude key alone does not make synthetic prices real.

## Workflow

1. Choose instrument, timeframe, and strategy. Charts refresh by polling; WebSocket streaming is a future enhancement. Only completed candles are used, so this is not a tick-by-tick trading terminal.
2. Edit strategy rules and parameters before analysis. **WR1 is an unverified template**, not an authoritative implementation of a proprietary strategy. Supply your actual WR1 rules. OTE is also customizable; its retracement settings are a starting point, not a trading guarantee.
3. Log closed historical trades with their strategy, direction, timestamps, prices, quantity, and reasons. Journal data is entered manually; broker trade import is not implemented.
4. Request Claude analysis and toggle chart scenario overlays. Saved analyses can be revisited. Confidence is an AI assessment, **not a calibrated probability of profit**.
5. Select a historical date window to review logged trades and extract winning-pattern observations. Backtesting reports the observed results of your journal, not simulated orders or an automatically executed strategy. Entry-time candle windows exclude future price data.

Trade P&L is raw price movement × quantity, signed by direction. It excludes spreads, fees, swaps, slippage, currency conversion, and instrument-specific contract multipliers; it is not account-currency broker P&L. Historical success rates need adequate representative samples and do not predict future performance. No order placement or broker execution is provided.

## API

All routes are under `/api`. If configured, send your `API_TOKEN` as a bearer authorization header directly to Express. Frontend clients should use the Next.js proxy.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/health` | Storage mode and AI configuration status |
| GET / POST | `/strategies` | List or create/update rules and parameters |
| GET / POST | `/trades` | List or log closed trades |
| GET | `/price-data` | Completed OHLCV candles, source, and timestamp |
| POST | `/analyze` | Analyze current server-loaded candles and save result |
| GET | `/analyses` | Retrieve saved analysis history |
| POST | `/backtest` | Review historical journal results and winning patterns |

Instruments: `NAS100`, `XAUUSD`. Timeframes: `5m`, `15m`, `1h`, `4h`, `1d`. Price requests accept `instrument`, `timeframe`, `limit`, and optional ISO `from`/`to`. Analysis requests accept `instrument`, `timeframe`, `strategyId`; backtests also require ISO `from`/`to`.

```sh
curl 'http://127.0.0.1:4000/api/price-data?instrument=NAS100&timeframe=15m&limit=100'
curl http://127.0.0.1:4000/api/strategies
```

PostgreSQL tables cover users, strategies, historical trades, Claude analyses, and OHLCV data. Schema and migration logic live in `server/`.

## Validation and production

```sh
npm test
npm run typecheck
npm run lint
npm run build
# After building, run these in separate processes:
npm start
npm run start:web
```

Install both package lockfiles with `npm ci`. The frontend build needs no external fonts. Runtime provider credentials are only required for live integrations.

Known dependency advisory: the scaffold's development-only lint chain (`eslint-config-next` → `fast-glob` → `micromatch` → `braces`) currently reports a stack-exhaustion denial-of-service advisory for `braces <=3.0.3`. No patched `braces` release was available at implementation time. Do not lint untrusted glob input; monitor upstream updates. Production dependencies should be audited separately with `npm audit --omit=dev` in both the root and `web/`.

Charts use [TradingView Lightweight Charts](https://www.tradingview.com/lightweight-charts/). This tool provides decision support only, not financial advice. Always verify prices, risk, and execution conditions in your primary trading platform.
