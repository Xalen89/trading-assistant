# StratDesk image index and research workers

## Install

Python 3.11+ is supported. Use a virtual environment for standalone work:

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r python/requirements.txt
python -m unittest discover -s python -p 'test_*.py'
```

## Image indexing

```bash
python python/pattern_indexer.py index --image setup.png --owner my-local-library --db .cache/vectors.sqlite --id fvg-example --version 1
python python/pattern_indexer.py query --image current-chart.png --owner my-local-library --db .cache/vectors.sqlite --top-k 5
```

Optional `--roi 0.1,0.1,0.9,0.8` is an explicitly selected normalized crop. The app currently indexes the complete uploaded image; there is no mobile crop editor. Original source bytes are never modified. CLI vector output is sensitive library metadata: do not publish it.

The native app calls `--json` through the existing authenticated TypeScript server, not a public Python listener. The server supplies the owner from its verified session and restricts candidate versions to current reviewed source records. SQLite is a private rebuildable vector cache; the authoritative 3780-dimensional normalized HOG descriptor is encrypted in managed MySQL. Source images remain encrypted in existing storage. Runtime files are not a substitute for durable storage.

This is HOG/cosine retrieval, **not** a trained semantic detector. It is sensitive to chart theme, crop, axes and text. Live OHLC is deterministically rasterized internally for a geometric query; it is not substituted into the displayed market chart. Neighbors require manual confirmation. The geometric lane does not increment strategy confluence or generate probability percentages.

## Causal research

`research_engine.py --json` accepts `{series:[{symbol,timeframe,source,candles}],spec}`. OHLC keys: `time,open,high,low,close,volume`; timestamps are Unix seconds, positive, unique and chronological. A spec contains `model` (`ma-cross` or `fvg`), `side`, arrays `fast`/`slow`, `holdBars`, `trainingBars`, `testBars`, `feesBps`, `slippageBps`, `initialEquity`.

Caps: two assets, 5000 bars per asset, 24 MA pairs. Signal at closed bar t executes at t+1 open. Fee/slippage apply on entry and exit. Each chronological fold optimizes only prior training, freezes its parameters, starts flat and forcibly closes at the final test close. Open equity at observed closes enters drawdown. Metrics use normalized capital allocation, not broker lot/USD margin accounting. Assets are independent experiments, not a combined portfolio. Basic FVG holds for the configured number of bars; no discretionary WR1 stop/target system is implied.

QuantStats computes compounding and drawdown from the same dated out-of-sample return series. No annualized Sharpe or assumed bar frequency is invented. Offline forward labels include `labelEnd`; ML training consumers must exclude targets ending after the training cutoff. Labels are not used for fitting these baselines.

## Optional vectorbt

`vectorbt_adapter.py input.json --private-research` is a separate opt-in MA-baseline compatibility adapter, not the application engine. Install vectorbt only in a separately reviewed compatible/private environment. Its exact license/distribution terms must be reviewed before any product embedding. No vectorbt PRO/walk-forward/ML feature is claimed by that adapter; the causal NumPy engine implements the app's own walk-forward loops. Do not blindly install the adapter into the application image.

## Dashboard and AI choices

The existing Expo/React Native six-tab stack remains intact. NativeWind/Tailwind is already installed; Next.js would be a redundant web replacement, not an improvement to this native build. TradingView-Screener is not a historical/live execution feed, and no new scraping or redistribution path is enabled without appropriate data rights.

The evidence discussion uses four bounded model calls: technical, conditional bull, bear counterargument and trader. Fundamentals/sentiment abstain without connected evidence. Deterministic paper risk can veto the result; no broker order route exists. The architecture is inspired by [TradingAgents](https://arxiv.org/pdf/2412.20138), not a reproduction of its performance.

Foreground animated pills render real recent stored events. Closed/minimized app notifications still require the already documented published scan/native push/device prerequisites. Pinned weekly bias remains manually set; colors update from that actual state, not invented AI bias.

## Limits

Neither historical hit rates, visual cosine nor confluence scores are calibrated future success probabilities. Full uploaded-rule/WR1 backtesting, semantic detection training, seasonality, validated institutional methods, native device release testing and closed-app delivery remain separate work.
