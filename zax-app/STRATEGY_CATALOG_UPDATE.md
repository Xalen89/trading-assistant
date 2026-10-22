# StratDesk — strategy collections and paper-plan recovery

## What you can use now

The existing Expo/React Native app remains **owner-only, paper-only and unpublished**. Your TradeLocker account remains a **data-only** connection. No broker execution methods, deposit flow, copied trading bot or manufactured login session were added.

### Your uploaded strategies and sharper chart

Four separate reference styles are available without replacing WR1 or your personal rules:

- **EMA20/50 Trend Following:** causal trend/bounce evidence, swing/EMA stop context and an ATR14-based 2×ATR visual guide. The guide is not an automatically managed EMA trailing stop.
- **Breakout / RVOL / Catalyst:** prior-range and supported volume evidence. Unverified broker-volume semantics, news catalysts, real instrument ticks and order-book evidence remain unknown rather than boosting confluence.
- **BB20 / RSI14 Mean Reversion:** the supplied long oversold bounce requires a completed close back inside the lower Bollinger Band and RSI crossing above30. The source target is SMA20; the source's fixed stop distance below the recent wick was not specified. No mirrored short or divergence rule was invented.
- **Level2 / Tape Scalping:** records your5s/15s/1m-tick, buyer-wall/green-tape,2–5-tick stop and3–10-tick target rules. It is reference-only without a genuine depth/tape feed, instrument ticks and fill/queue modeling. REST polling is not a tick feed.

Price indicator layers and a separate RSI pane use causal closed bars, blank warm-up values and explicit formulas/source/timeframe. Analytical4h bars require complete UTC hourly buckets. Weekly aggregation is limited to complete seven-day crypto UTC daily buckets; a broker's unverified venue week is not fabricated.

There are **11 source rulebooks** in the optional working catalog, including three independently authored GitHub-inspired numerical recipes: SMA20/50 crossover, MACD12/26/9 signal crossover and prior20-bar Donchian breakout/channel-exit review. These are not complete validated execution systems. Unrelated models do not inherit SMC historical success rates or ghost continuations.

**My Library → Browse pattern & style reference catalog** contains **44 curated references** with source/support labels. They preserve existing uploads and styles. Adding a definition is not image training; only supported app-defined closed-candle morphology is shown automatically. The app does not claim to detect every discretionary pattern.

## Your three newly linked collections

Open **Strategies → Browse all PWB / Quant Vault / SGX references**. Search names/categories, filter by source, paginate20items, open public sources, or add one **inactive review reference** to your working library.

| Source | Catalog records | Verified coverage | Actual readiness |
| --- | ---: | --- | --- |
| [PapersWithBacktest](https://paperswithbacktest.com) |5,546|5,546/5,546 sitemap-listed individual public detail pages retrieved|Full runnable code/pseudocode is gated; public summaries/backtest sections are not StratDesk implementations or tests. |
| [The Quant Trading Vault](https://github.com/brainbrick-trades/The-Quant-Trading-Vault)|5,808|5,806 unique local Markdown documents plus2index-only records; complete public recursive tree|Only2individual rule bodies were verified during discovery. The remaining rule semantics are unreviewed, not invented from titles. |
| [SGX order-book research](https://github.com/rorysroes/SGX-Full-OrderBook-Tick-Data-Trading-Strategy)|20|Complete public tree; distinct feature, label, classifier, preprocessing and context methods|Research methods, not20deployable HFT strategies. |
| **Total source references** | **11,374** |Complete discovered record coverage|**Not11,374 runnable or semantically unique trading strategies.** |

The registry is served through an **owner-authenticated backend query**, not bundled as11,374active strategies in the phone. Its full metadata is retained in `server/trading/data/strategy-collections.json`; the compact count/coverage manifest is in `research/strategy-inventory/coverage-manifest.json`. Raw36MB discovery JSON is excluded from application checkpoints; no large abstracts, source bot code or upstream market dataset are embedded in the app catalog.

### No accidental duplicate use

- Stable canonical identities prevent importing the same reference twice, including an archived or renamed working reference.
- When exact canonical rules/parameters are known, equivalent definitions can merge and retain source aliases; parameter variants stay separate.
- Names and broad indicator families alone do **not** establish equivalence. Different SGX methods in one notebook are preserved separately.
- The actual discovered registry has **zero proven exact-identity duplicates**. Complete cross-source **semantic deduplication remains pending**: gated or unreviewed entry/exit/risk/data/parameter rules cannot be honestly declared equivalent.
- New imports are inactive, custom, zero-weight prerequisite references. They do not automatically run, double-count confluence, change active analysis or create trained-pattern records. The existing100-record working-rulebook limit is respected; all11,374catalog references remain browsable.

PWB's [Terms](https://paperswithbacktest.com/terms) and [access documentation](https://paperswithbacktest.com/docs/subscription/) distinguish public summaries from unlocked implementations/data. The Vault README claims MIT but no license file/grant was retrieved; SGX likewise has no established code/data license. **No purchase, unlock or redistribution permission is assumed.** Turning the entire catalog into executable app models still requires authorized complete rules, individual semantic review, appropriate data and causal validation. That outcome is not marked complete.

## Offline full-order-book ML — implemented separately

In the chart's **Research Laboratory**, choose the **Order-book ML / offline** mode and import your own authorized top-three book snapshot JSON. Confirm dataset-use permission explicitly.

The reusable independently authored worker is `python/orderbook_research.py`; `python/ORDERBOOK_README.md` specifies the format. It accepts500–12,000actual, strictly chronological, uncrossed three-level bid/ask snapshots, at most8MiBUTF-8, with600/900-second offline label horizons and up to3bounded folds. It does **not** accept OHLC candles or reconstruct a fictional order book from polled prices.

Implemented:64causal event-time features; full lookback; incomplete-label-tail exclusion; chronological1800-second prior training windows; future-label purge before10-second outer holdouts; majority baseline and confusion/precision/recall/label-accuracy metrics. Five classifier families produce six fixed configurations: Random Forest, ExtraTrees, AdaBoost tree, GradientBoosting, SVC-RBF and SVC-linear. Configuration parameters, skipped-fold reasons, time ranges, gap/label-tail disclosures and model-selection limitations survive the Python→Node→stored-result boundary.

**No best model is selected from outer test results.** No fitted-model artifact, live model, probability, profit, HFT/DMA execution, tick feed or queue-fill claim is produced. The worker's `probability` remains `null`. Synthetic unit/bridge fixtures verify software behavior only; you have not supplied actual order-book data for a real ML study.

## Paper Buy/Sell recovery

Your screenshot showed a stall **before confirmation**: Awaiting proposal / Refreshing bracket. The critical path now uses fast source-only analysis rather than retained-history research/archival scans, with a25-second server deadline,35-second UI deadline and visible **Retry**. An expired attempt releases its single-flight key; later side/risk/context choices cannot receive an earlier draft.

An authorized-owner, actual-feed XAUUSD check on2026-10-15 returned:

| Diagnostic draft | Duration | Saved draft ID | Editable form validation | Order created by check |
| --- | ---: | --- | --- | --- |
|Buy|3,178ms|Yes|Passed|No |
|Sell|52ms|Yes|Passed|No |

The test used actual connected broker candles/quotes and saved diagnostic proposals only. It did not create a paper/broker order or journal trade. Successful market-order persistence is covered separately by **isolated synthetic mocks**, not a fake app login or your production ledger.

**Your final browser/device “Confirm paper order” outcome remains unverified.** Refresh the same browser where you already signed in; choose the intended market, tap Buy/Sell, review entry/stop/target/quantity, then confirm only the simulated order you want. The generic paper risk/2R/partial/break-even template is separate from source-specific SMA20 targets or EMA trailing rules; it is not portrayed as an identical implementation of every source strategy.

## Privacy, editing and publication

You can keep editing after publication. The current server-enforced approved-owner boundary can remain in place: visitors can reach a login screen but not your protected feed, files, strategies, research, alerts or trade records. Client assets/login URLs are not themselves secret. Changing to public multi-user use is a separate deliberate access change.

**Nothing was published here**; automatic publication is off. Native iOS/Android release updates require Dashboard builds/distribution, not merely a web/backend publication. No signed APK/TestFlight build, physical-device check, activated closed-app push or live HFT feed is claimed.

## Verification

- Complete current TS suite:170passing tests,1pre-existing integration skipped;26Python tests passed.
- All11,374reference imports mechanically validated against the working strategy schema; no invalid rulebooks.
- Node/Python bridge on an explicitly synthetic book:64features,6fixed configurations, purged folds, retained settings/disclosures and null probability; no account/trade writes.
- Actual XAUUSD Buy/Sell draft/form check above; user submission still pending.
- TypeScript/ESLint checks, backend compilation, owner-only API denial and current native/web source exports are checked separately from release/device execution.
- Independent read-only integration trace; confirmed settings/disclosure loss and inconsistent character-vs-UTF-8 size checks corrected. No secret values exposed or broker operations added.

Source-save/checkpoint receipt and the final frozen export are recorded in the tracker once actually complete; no publication is inferred from a Git push.

### Final saved-source evidence

Reviewed backend and web/iOS/Android source exports completed successfully. The implementation was accepted on managed `main` as **0398c39**. The tools returned Git acceptance, not a structured recorded-checkpoint receipt; confirm Dashboard Version history before a signed native build. Nothing was published, and no repeated implementation push was used to manufacture that receipt. This documentation update does not change the verified application source.
