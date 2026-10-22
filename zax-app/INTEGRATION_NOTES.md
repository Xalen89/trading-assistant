# Resource-driven improvements — native StratDesk

## Implemented

| Proposed resource | Decision and result |
| --- | --- |
| [TradingAgents paper](https://arxiv.org/pdf/2412.20138) | Added a bounded evidence discussion: technical analysis, bull case, bear counterargument, trader and independent deterministic paper-risk veto. Fundamentals/sentiment explicitly abstain without real evidence. Four actual model calls were verified. This is architecture inspiration, not a reproduced performance claim. |
| [OpenCV](https://opencv.org) | Added the reusable `python/pattern_indexer.py`, automatic uploaded-image indexing, protected reindex, geometric photo neighbors and current-live-window matching. Private SQLite cache is reconstructed from encrypted managed-DB descriptors. Current owner, source version, market/timeframe and review status constrain retrieval. |
| [vectorbt](https://vectorbt.dev) | Added a separate private-research compatibility adapter, not a product dependency. The native app uses its own causal NumPy MA/FVG baseline research with two independent assets, bounded sweeps, chronological walk-forward, next-open execution, costs, trades, drawdown and offline forward labels. Actual QuantStats compounding/drawdown was verified against the same OOS equity series. No vectorbt PRO or complete WR1 backtest is implied. |
| [TradingView-Screener](https://shner-elmo.github.io/TradingView-Screener) | Did not add a new ingestion/scraping path. Scanner snapshots are not a reliable historical candle/execution feed; data-use/redistribution rights require verification. Existing private TradeLocker/public crypto data routes are retained. |
| [Next.js dashboard](https://nextjs-dashboard-olive.vercel.app) | Did not replace or duplicate the native Expo project. Applied useful dashboard structure using React Native components instead. |
| [Tailwind](https://tailwindcss.com/) | Kept installed NativeWind/Tailwind. Added pinned color-coded weekly profile/session clocks, confluence progress, paper open-P/L/risk/reward/drawdown cards, dated calendar/COT rows and animated real-event foreground pills. |

## Where to use it

- **My Library:** upload/review a compatible image; inspect its visual-index state; reindex protected originals; search another photo. CSV/JSON historical imports expose actual-interval selection and a second-asset experiment.
- **Trading Chart:** pinned manual weekly bias/session clocks; **Compare live chart geometry** produces reference-linked shape neighbors, never automatic confluence confirmations. **Research laboratory** runs a selected-feed baseline walk-forward test or evidence discussion.
- **Trades:** recorded-paper performance and fresh-quote coverage; optional initially unset UTC-day closed-drawdown cap. A configured cap blocks new paper plans/fills when reached or when required closure dates are missing; it never prevents simulated exits or changes broker settings.
- **Alerts:** foreground pills use actual recent stored events and jump to captured chart evidence. Background/closed-app delivery still requires the existing deployed scan/push/native-device prerequisites.

## Verified evidence

- TypeScript and ESLint clean; 98 runnable TypeScript tests passed, one existing integration test skipped; 18 Python tests passed.
- Shared WR1 PDF page 9 indexed to a normalized 3780-value HOG descriptor; the exact same image retrieved cosine 1 in an isolated offline cache. This proves vector plumbing, **not** semantic pattern recognition accuracy.
- 300 actual Coinbase closed bars produced four chronological baseline test folds and 288 offline forward labels. QuantStats and core compounding/drawdown agreed within numerical precision on a separate focused check. These tiny samples are smoke tests, not strategy validation.
- Actual evidence discussion completed its four model roles; missing fundamental/sentiment data abstained; risk returned `wait` with veto and `probability: null`.
- Web/iOS/Android source bundle exports succeeded. Public Preview/API responded successfully. No signed APK/AAB/TestFlight/device run or publication was performed.
- Parent integration trace corrected optimistic source-index revision updates, worker reservation release and paper-limit behavior. Independent read-only review found missing-local-source feedback and an imported-history Sample-mode guard; both were corrected. Its worker reservation finding was rechecked against the already-corrected outer-finally scope. Feedback now loads owner-only metadata without original-file decryption, requires the evaluated source revision and transitions only after a successful durable write. Three focused feedback regressions and a guest metadata authorization case pass.

## Important limitations

Visual similarity, confluence and historical hit rate are **different measurements**. No fabricated 87% success probability is shown. HOG is sensitive to crop, theme, axes and text; confirmation is manual. Upload corrections guide existing reviewed rules/reference analysis; no neural fine-tuning or autonomous self-evolution is claimed.

Only MA crossover and basic three-bar FVG baselines are backtested. No complete uploaded-style/WR1 discretionary engine, combined multi-asset allocation/covariance portfolio, live margin/lot accounting, intrabar stop/target resolution or calibrated success model is claimed. News/fundamental/COT/calendar content requires actual connected source records; empty providers remain empty.

The private selected TradeLocker feed, browser sign-in, six main tabs and all paper-only execution boundaries remain intact. The project has not been published.

## Backend delivery

Use `python/README.md` for CLI and JSON contracts, pinned dependencies, tests and license boundaries. `Dockerfile` plus the stored API health declaration prepare a Python-capable backend for a future deployment; the container was not built/published here. Local SQLite is rebuildable; encrypted managed MySQL records are the durable authority. Python receives no broker, database or model credential environment values.

## Source-save status

The implementation commit `dff76c0` was accepted on the managed canonical main branch. The frozen web/iOS/Android exports succeeded after the final cache correction. No structured recorded-checkpoint receipt was returned; the resource interface cannot expose Version history. Confirm Dashboard Version history before starting a signed native build. Later documentation/evidence commits do not change the tested implementation. Nothing was published.
