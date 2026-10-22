# Zax feature guide

> **Version:** 2.0.0
>
> **Reviewed:** 18 October 2026
>
> **Supersedes:** the undated StratDesk / Foundry feature-purpose guide
> **Generated from:** `lib/trading/feature-purpose-data.json` by `scripts/build-feature-guide.mjs`

Zax is an **owner-only learning, analysis and paper-practice workspace**. Its useful sequence is: **observe a sourced market, select rules, check confluence, act on paper, review your process**. Nothing here places brokerage orders. [Manus](#glossary-manus) is the workspace host and sign-in service used by the app; it is not a broker.

## How to use this guide

1. Start with a module in the generated index, then open its numbered feature entry.
2. Read **Where / how**, **You get**, and **Next action** in that order.
3. Keep the stated source, timestamp, source version, and current status together when comparing results.
4. Use the glossary for the compact terms that appear in chart, research, and paper-practice language.

The guide describes the current capability. A documented source control, a data response, a deployed delivery path, statistical qualification, and a physical-device check are different kinds of evidence.

## Status legend — 18 October 2026

| Status | Current meaning |
|---|---|
| **Operational** | A documented current service check exists for this specific capability. It is not a device or statistical-validation claim. |
| **Data required** | The capability needs current source, entitlement, owner record, or input data; absent data is shown as a boundary, not a result. |
| **Deployment required** | The documented delivery path needs deployed native/server configuration or a physical delivery check. |
| **Qualification required** | A research or decision output exists, but its edge, calibration, or predictive usefulness has not been qualified. |
| **Device test required** | The documented source path has no physical-device verification recorded in this guide. |

**Guide tags.** **[P]** Paper scope: records and simulations do not submit brokerage orders. **[Q]** Qualification: a calculated result is not a validated edge or predictive probability. **[S]** Scenario: a conditional scenario is not a forecast. **[D]** Data state: insufficient or unavailable input is not a hidden signal.

## Module index

| No. | Module | Features |
|---:|---|---:|
| 01 | [Chart, timeframe bias and market context](#module-chart) | 12 |
| 02 | [Markets and live source selection](#module-markets) | 8 |
| 03 | [Strategies, attached indicators, confluence gates, and Quant Lab](#module-strategies) | 20 |
| 04 | [Pattern/style Library upload and structured learning](#module-library) | 10 |
| 05 | [Trade screenshot evidence and retained review](#module-screenshots) | 8 |
| 06 | [Recent analogue scenario](#module-historical) | 5 |
| 07 | [AI scenario](#module-forecast) | 7 |
| 08 | [Built-in AI trading coach](#module-coach) | 8 |
| 09 | [Paper lifecycle](#module-paper) | 11 |
| 10 | [Trade journal, deep dive and performance review](#module-journal) | 6 |
| 11 | [Trading foundations and revenge-trading safeguards](#module-discipline) | 4 |
| 12 | [Trade/confluence/scenario alerts and delivery](#module-alerts) | 15 |
| 13 | [Quant pairs relative-value model](#module-pairs) | 6 |
| 14 | [Quant selected-universe momentum model](#module-momentum) | 8 |
| 15 | [Quant venue quote and inventory model](#module-making) | 6 |
| 16 | [Quant systematic trend / macro](#module-macro) | 6 |
| 17 | [Quant forward-return classification model](#module-ml) | 6 |
| 18 | [Private workspace and reliability tools](#module-private-workspace-tools) | 10 |

## Reviewed source references

| ID | Full name | Current guide surfaces |
|---|---|---|
| order-block-retest | Order Block Retest | Strategies source-reference catalog; chart setup analysis and overlays; applicable paper/alert context |
| stdv-vwap-reentry | STDV · VWAP Re-entry | Strategies source-reference catalog; chart layers; Quant Lab terminology |
| core-sequence | Core Sequence | Strategies source-reference catalog; closed-bar setup analysis; chart context |
| sma-crossover | SMA Crossover | Strategies source-reference catalog; chart indicators |
| macd-momentum | MACD Momentum | Strategies source-reference catalog; chart indicators |
| trend-following | Trend Following | Strategies source-reference catalog; chart indicators; Quant Lab context |
| breakout-momentum | Breakout Momentum | Strategies source-reference catalog; chart indicators |
| mean-reversion | Mean Reversion | Strategies source-reference catalog; chart indicators |
| orb-strategy | ORB Strategy | Uploaded-video source card; exact opening-range chart levels; owner-approved confluence; optional foreground automatic paper |
| london-breakout-reference | London Breakout | Exact Asian-range source;15m primary; source paper and setup alerts |
| initial-balance-reference | Initial Balance | Exact09:30–10:30source;15m/real derived30m; known venue-volume confirmation |
| pdc-continuation-reference | Red-to-Green / Green-to-Red | Explicit PDC/tick/target; observed-quote cross;1m/5m venue-volume evidence |

## Glossary

<a id="glossary-manus"></a>
**Manus.** The workspace host and sign-in service used by this app; it is not a broker or a market-data venue.

<a id="glossary-closed-bar"></a>
**closed bar.** A completed price interval. Its OHLC values no longer change; a forming bar can still change.

<a id="glossary-sample-mode"></a>
**Sample mode.** A clearly marked demonstration data setting, not a substitute for sourced market evidence.

<a id="glossary-source-version"></a>
**source version.** The specific revision of a strategy or source record that an observation, result, or paper action belongs to.

<a id="glossary-confluence"></a>
**confluence.** Several separately checked conditions considered together; it is not a probability or an order instruction.

<a id="glossary-fvg"></a>
**FVG.** Fair Value Gap: an app-defined three-bar price gap zone used as chart context.

<a id="glossary-ce"></a>
**CE.** Consequent Encroachment: the midpoint of an FVG or other defined range in this guide’s terminology.

<a id="glossary-ob"></a>
**OB.** Order Block: a rule-defined price zone in a strategy model, not a record of broker order flow.

<a id="glossary-mss"></a>
**MSS.** Market Structure Shift: a rule-defined change in swing structure used by supported setup analysis.

<a id="glossary-ote"></a>
**OTE.** Optimal Trade Entry: a labelled range-ratio convention in the chart overlay, not an execution signal.

<a id="glossary-pdh-pdl"></a>
**PDH/PDL.** Previous Day High / Previous Day Low from completed provider-day data.

<a id="glossary-stdv"></a>
**STDV.** Standard-deviation notation used for volatility bands or target conventions; it is not a guarantee of normal returns.

<a id="glossary-wr1"></a>
**WR1.** A bundled source-reference label and risk-disclaimer context, not a personal trading system.

<a id="glossary-silver-bullet"></a>
**Silver Bullet.** A named source setup whose session timing remains a manual check in the documented analysis.

<a id="glossary-mae"></a>
**MAE.** Maximum Adverse Excursion: the largest unfavourable move observed during a recorded paper trade.

<a id="glossary-mfe"></a>
**MFE.** Maximum Favourable Excursion: the largest favourable move observed during a recorded paper trade.

<a id="glossary-wilson-interval"></a>
**Wilson interval.** A confidence interval for an observed proportion; it describes the recorded sample and is not predictive probability.

<a id="glossary-cointegration"></a>
**cointegration.** A statistical relationship in which a combination of non-stationary series may be stable; it does not establish a tradable edge.

<a id="glossary-adf"></a>
**ADF.** Augmented Dickey–Fuller test, a residual-stationarity diagnostic used by the pairs model.

<a id="glossary-inverse-volatility"></a>
**inverse volatility.** A weighting method that gives relatively less weight to assets with higher measured volatility.

<a id="glossary-slippage"></a>
**slippage.** An entered cost assumption for the difference between a reference price and a hypothetical execution price.

<a id="glossary-purge"></a>
**purge.** Removing overlapping labelled observations around a validation split to reduce information leakage.

<a id="glossary-embargo"></a>
**embargo.** An exclusion interval after a validation segment that further reduces label overlap; this guide does not claim it is implemented unless stated.

<a id="glossary-cpcv"></a>
**CPCV.** Combinatorial Purged Cross-Validation, a financial validation method that evaluates multiple purged train/test paths.

<a id="glossary-oos"></a>
**OOS.** Out-of-sample: data held aside from model fitting for a separate evaluation.

## Feature inventory

<a id="module-chart"></a>
## 01. Chart, timeframe bias and market context

**Use this module:** Start with the selected symbol, source, age and completed bars. Expand one chart tool at a time, then compare its output with the displayed source and timestamp.

| No. | Feature | Purpose |
|---:|---|---|
| 01.01 | Selected market, feed status, quote and chart timeframe | Identify the current instrument/bar interval and distinguish quote freshness from historical candle data. |
| 01.02 | Candlestick canvas, inspection, navigation, details and renderer recovery | Inspect actual OHLC and navigate chart history without treating the display as an execution surface. |
| 01.03 | Chart overlays and named price annotations | View [FVG](#glossary-fvg)/[CE](#glossary-ce), range ratios, provider-day levels, manual levels and setup zones in price context. |
| 01.04 | Optional session background boxes | Make regional time-of-day activity windows easy to see behind actual candles without turning them into trade signals. |
| 01.05 | Closed-bar timeframe bias table | Answer whether completed bars on each interval meet a simple aligned trend rule, are mixed, or lack usable evidence. |
| 01.06 | Pinned historical profile, previous provider day and clocks | Show broad setup-analysis profile, prior provider-day high/low, session window and strategy/device clock context. |
| 01.07 | Economic calendar and COT context | Review dated macro schedules and reported positioning as context for the selected market. |
| 01.08 | Open context settings sheet | Make sample-data and strategy-clock assumptions explicit and provide deliberate workspace save/load actions. |
| 01.09 | Candle observations | Learn what the latest completed candle shape shows without treating morphology as an entry signal. |
| 01.10 | Reference picture / template | Compare an owner-reviewed original picture with the chart while preserving its original pixels and meaning. |
| 01.11 | Reference matching — geometry and reviewed-source AI | Retrieve candidate similarities to your reviewed references and expose what matched or is missing. |
| 01.12 | Manual confluence & overlays | Keep your own checklist confirmations separate from automatic source-bound setup evidence and chart visibility. |

### 01.01. Selected market, feed status, quote and chart timeframe

**Where / how:** Chart. Open Chart for the workspace-selected market (no market picker is in this audited screen); check provider/status and quote source/age; tap 1m, 5m, 15m, 1h, 4h, 1d or 1w. Use Open context → Explicit Sample chart only to explore marked demo bars, then turn it off for source analysis.

**You get:** Provider symbol/name, quote and historical candles/status where available. Source code requests up to 300 chart bars; Coinbase may stream a current tick into the forming chart candle.

**Next action:** Verify source and timestamps, then inspect actual bars or compare timeframe-bias rows.

**Limits / prerequisites:** Real bars require an accepted instrument and reachable/entitled feed; quote availability is separate. Sample bars are generated demonstrations, not evidence. Weekly support depends on source calendar; broker/non-crypto weekly paths can be refused where session calendars are undeclared. [D]

### 01.02. Candlestick canvas, inspection, navigation, details and renderer recovery

**Where / how:** Chart. Tap a candle/crosshair to inspect; drag/pinch to navigate; use − to show more candles, + to show fewer, Latest to reset, and Details for source, OHLC, levels and indicator names. If canvas fails, Retry chart or Use SVG fallback; Retry canvas returns from fallback.

**You get:** Candlesticks, source label, actual inspected OHLC and overlays. The primary chart uses an isolated Lightweight Charts surface; SVG fallback is explicitly labelled and display-only.

**Next action:** Check the inspected bar's timestamp/source and compare its price with relevant context.

**Limits / prerequisites:** Actual bars require source candles. Live quote does not mean historical bars are current; canvas timestamps use device time. SVG fallback lacks some canvas-only features, including AI forecast display.

### 01.03. Chart overlays and named price annotations

**Where / how:** Chart. Expand Chart tools & levels; toggle Regular FVG + CE zones, Range quarters + [OTE](#glossary-ote), Manual named levels, or Previous provider day [PDH/PDL](#glossary-pdh-pdl). Tap Add named level, enter a name and positive price, then Save manual level. Use Details to inspect supplied prices.

**You get:** Deterministic three-bar gaps/CE, visible-bar range ratios, enabled named/provider-day lines, and separate strategy-derived zones.

**Next action:** Compare a level with actual candles and source detail; disable overlays that obscure price.

**Limits / prerequisites:** Manual levels require a positive finite number and active strategy; visibility is strategy-scoped. PDH/PDL requires completed provider-day data. Sample-mode geometry is not market evidence. [D]

### 01.04. Optional session background boxes

**Where / how:** Chart → Sessions / Details → Session backgrounds. Tap Sessions below the chart to turn all boxes on/off. In Details, select Asia, London, New York and optional Sydney. Preferences save locally; Open context → Save to cloud syncs them explicitly.

**You get:** Subtle colored outlined time rectangles behind the price candles, with compact names; overlapping windows blend softly and follow regional IANA timezone/DST.

**Next action:** Use as timing context alongside your strategy; turn it off when you prefer a clean candle view.

**Limits / prerequisites:** Default regional clock references: Tokyo 09–18, London 08–17, New York 08–17, Sydney 08–17 local time. These are not exchange/broker opening hours or [WR1](#glossary-wr1) kill zones, and apply on crypto weekends. Intraday only through 4h; daily/weekly show no boxes. Up to 256 latest session windows are retained from at most 3,000 source bars. Only actual supplied history/current observed time is shaded; projection/replay future space and price scale are unchanged.

### 01.05. Closed-bar timeframe bias table

**Where / how:** Chart. Turn off [Sample mode](#glossary-sample-mode), then read the seven completed-bar rows. Refresh/pull to refresh and open Bias details for rule, source, as-of and warm-up. Sample mode is explicitly unavailable for real evidence, not an endless Checking state.

**You get:** Bullish only for close > EMA20 > EMA50 and rising EMA20 versus five completed bars ago; Bearish requires exact inverse; otherwise Mixed/neutral. Insufficient means no valid completed data, fewer than 55 completed bars, or incomplete EMA inputs. Stale exceeds the freshness threshold; Unavailable means fetch failure/timeout.

**Next action:** Compare timeframe alignment and verify source timestamps; wait for enough fresh bars or treat disagreement as context for further review.

**Limits / prerequisites:** Requires owner access allowed by server, supported market/feed and 55 eligible completed bars per frame. Forming/future, invalid and duplicate bars are excluded; gaps are warned, never filled. Freshness limit is max(3 bars, 15 minutes); fetch has three concurrent workers and 25-second budget. Coinbase crypto weekly uses up to 900 daily bars aggregated into exact Monday weeks. Operational classification is not calibrated/out-of-sample validation, recommendation, eligibility check or multi-leg/queued order functionality. [D]

### 01.06. Pinned historical profile, previous provider day and clocks

**Where / how:** Chart. Read pinned CLOSED BARS and PREVIOUS PROVIDER DAY; expand Historical profile & clocks for basis, source/as-of, day timestamps, London/New York/Tokyo and device clocks. Use Open context to choose New York (DST) or Fixed EST.

**You get:** Profile bias or Unknown, PDH/PDL or unavailable, source/timestamps, session window and clocks; clocks refresh every 15 seconds.

**Next action:** Verify time basis and provider source before interpreting session boundaries or day levels.

**Limits / prerequisites:** Profile/day values require completed provider/setup history; missing fields remain Unknown/unavailable. Clock preference changes strategy-clock interpretation, not source bar timestamps. [D]

### 01.07. Economic calendar and COT context

**Where / how:** Chart. Scroll to and expand Calendar & COT context; review event date/time-known, country, actual/expected/prior when supplied, impact and source; then review COT report date, commercial long/short, units and source.

**You get:** At most 10 displayed events and 6 COT rows. Without FMP key, public fallback is a finite US subset (BLS/BEA schedules, Fed FOMC dates) plus one verified CME Bitcoin futures COT record; it leaves forecast/actual/prior surprises unavailable. FMP key path uses FMP calendar/COT endpoints.

**Next action:** Check source, event time-known and report date/vintage; consult the named source for time-sensitive or instrument-specific decisions.

**Limits / prerequisites:** Requires backend access; FMP path needs read-only key/entitlement. Coverage may be partial and not instrument-specific. COT is dated weekly futures positioning, not spot holdings, all-market positioning, live flow or directional bias. [D]

### 01.08. Open context settings sheet

**Where / how:** Chart. Tap Open context; toggle Explicit Sample chart, select New York (DST) or Fixed EST, or deliberately tap Save to cloud/Load cloud and read the returned message.

**You get:** Workspace sample/timezone setting changes and explicit cloud action status.

**Next action:** Disable Sample before real-data analysis; verify provider access and cloud status.

**Limits / prerequisites:** Actual analysis requires source data; cloud operations require owner-authorized connectivity. This is not a provider-connection wizard. [D]

### 01.09. Candle observations

**Where / how:** Chart → Candle observations. Expand the panel, read each shape name/side and its explicit evidence; open the pattern catalog/uploads to study definitions.

**You get:** App-defined closed-bar morphology or an explicit no-supported-observation message.

**Next action:** Compare the candle with broader context and the strategy checklist; a shape alone does not approve a trade.

**Limits / prerequisites:** Not TA-Lib-equivalent thresholds, reviewed photo recognition, [confluence](#glossary-confluence) scoring, probability or a ready trade. Sample-mode observations remain demonstrative. [D]

### 01.10. Reference picture / template

**Where / how:** Chart → Reference picture / template. Upload/review a matching source in My Library, expand this panel and select an eligible image; No reference removes it. Read protected-source errors if access fails.

**You get:** An owner-authorized reference image/template; aspect ratio and source identity remain distinct from the actual price/time geometry.

**Next action:** Use it for visual study and inspect its source/rules, not as automatic price alignment or future evidence.

**Limits / prerequisites:** Requires an eligible reviewed same-market/timeframe image and actual owner source access. A template is not recognized price/time geometry, prediction or proof of a setup. [D]

### 01.11. Reference matching — geometry and reviewed-source AI

**Where / how:** Chart → Reference matching. With Sample mode off and actual candles available, tap Compare live chart geometry or AI compare reviewed sources. Inspect evidence/missing items; Confirm or Reject a candidate, or Source & trainer to review it.

**You get:** CV shape-neighbor or AI reference-match records with strategy/version/market/timeframe, evidence, missing conditions and explicitly labelled similarity when supplied.

**Next action:** Check the original and the independently sourced strategy conditions. Retain useful feedback or reject misleading resemblance.

**Limits / prerequisites:** Geometric cosine/rule similarity is not win probability, a general photo-trained detector, independent confluence or order permission. No reference or source failure can correctly produce no match; Sample mode disables real comparisons. [D]

### 01.12. Manual confluence & overlays

**Where / how:** Chart → Manual confluence & overlays. Expand the panel, Review manual factors and mark only what you independently checked. Toggle each strategy overlay to control drawings without selecting it for automatic analysis.

**You get:** Manual met/total count and earned/possible enabled weight, plus strategy visibility settings.

**Next action:** Use the checklist as a review aid; use the separate approved confluence gate for strategy-mode paper eligibility.

**Limits / prerequisites:** Manual confirmations do not change automatic setup evidence, calibrated probability or server gate/entry permission. Visibility does not select a strategy for analysis. [D]

<a id="module-markets"></a>
## 02. Markets and live source selection

**Use this module:** Confirm the owner session and feed state before filtering or choosing a symbol. A catalog row identifies a source path; it does not itself confirm a current quote.

| No. | Feature | Purpose |
|---:|---|---|
| 02.01 | Feed/account status | Check whether authorized private TradeLocker instruments are accessible and what source path is available before looking at quotes. |
| 02.02 | Account sign-in, refresh, sign-out | Identify the signed-in [Manus](#glossary-manus) identity and establish or refresh the session needed for private source access. |
| 02.03 | Feed switcher, search, category filters | Narrow the instrument universe to a provider/feed and instrument class, then find a symbol by identifier or name. |
| 02.04 | Instrument quote/source/age list and pagination | Assess whether a source returned an instrument quote, what source supplied it, and how old its timestamp is. |
| 02.05 | Favorite toggle | Mark instruments for later review. |
| 02.06 | Quick price-watch bell | Stage an above-price watch for an instrument without first leaving Markets. |
| 02.07 | Select instrument / Chart handoff | Choose the active market for subsequent chart/workbench review. |
| 02.08 | Market-data/timeframe boundaries | Understand which quote/history data and derived timeframes can support downstream chart analysis. |

### 02.01. Feed/account status

**Where / how:** Markets. Open Markets and read the status message and pill. If sign-in/connection is required, use the account panel below to sign in with the authorized Manus owner account, then recheck status. Coinbase public crypto can be viewed through All feeds without TradeLocker access.

**You get:** TradeLocker connected/required state and broker-market count when connected; a status message. The screen reports approximate quote/candle refresh intervals and says broker quote reception time is not a provider timestamp and broker orders are disabled.

**Next action:** If connected, filter to TradeLocker and search/select the intended instrument; if not, verify owner sign-in and the configured integration. For public Coinbase crypto, choose All feeds.

**Limits / prerequisites:** Private TradeLocker instruments require configured integration and authorized owner session/account. Status is an access/connection indication, not proof of a fresh price, execution quality, or strategy edge. Router status reports futures:false. [D]

### 02.02. Account sign-in, refresh, sign-out

**Where / how:** Markets. When signed out, tap Sign in and complete authorized Manus sign-in. On web Preview, if sign-in is blocked, tap Open app in browser tab, sign in there, and continue in that tab. When signed in, Refresh rechecks session; Sign out ends it.

**You get:** Guest/signed-in account identity, CONNECTED/SIGNED OUT state, sign-in/refresh errors; sign-out clears the client query cache.

**Next action:** After sign-in, recheck the Markets feed status. This panel does not configure TradeLocker credentials or select a broker account itself.

**Limits / prerequisites:** Private data remains owner-only. This only documents the shared account component as embedded on Markets; shared account/auth diagnostics are outside this audit.

### 02.03. Feed switcher, search, category filters

**Where / how:** Markets. Type part of an internal id, provider symbol, or name. Tap TradeLocker for private broker instruments or All feeds for the returned catalog. Filter by All, Crypto, Forex, Metals, Indices, Stocks, or Futures. Changing a filter/search resets to page one.

**You get:** Filtered matching-instrument count and list. Initial feed is TradeLocker. All feeds includes catalogs but does not mean every instrument has an entitled/working source.

**Next action:** Choose a result row or Chart. If a public crypto instrument is absent under TradeLocker, switch to All feeds; if the private broker list is absent, check connection state.

**Limits / prerequisites:** TradeLocker items require owner connection; FMP-backed symbols need FMP_API_KEY and relevant entitlement. Built-in futures data is not connected; a Futures category or broker contract type does not prove exchange-futures data. [D]

### 02.04. Instrument quote/source/age list and pagination

**Where / how:** Markets. Read the provider symbol/name, source and displayed age below the name, and price/change on the right. Use Previous/Next to move through 12 instruments per page. A dash for change means unavailable, not zero movement.

**You get:** Formatted quote, source label, age, optional percentage change, category, or explicit unavailable message. Quotes poll approximately every 15 seconds; the client requests at most 40 symbols, while this page shows 12 per page.

**Next action:** When the source, timestamp age, and symbol are appropriate, select the instrument and inspect its chart bars. If unavailable, verify feed credentials/entitlement/provider availability; missing data is not replaced by sample bars.

**Limits / prerequisites:** Coinbase is public REST data. FMP quotes require read-only FMP key and entitlement and may be delayed. Server freshness uses provider timestamps and marks stale after 120 seconds (or timestamps too far in the future). TradeLocker uses bid/ask midpoint and response-received time, not provider time or a fill. [D]

### 02.05. Favorite toggle

**Where / how:** Markets. Tap the outline star to add an instrument to workspace favorites; tap the filled star to remove it.

**You get:** Updated workspace favorite membership and star state.

**Next action:** Revisit the instrument from the app's separate favorites/workspace surfaces.

**Limits / prerequisites:** A favorite does not subscribe to a feed, pin a quote, or create an alert.

### 02.06. Quick price-watch bell

**Where / how:** Markets. Tap the bell. The handler saves a disabled alert using the current quote as the threshold when present, current workspace timeframe and active strategy, above condition, and 30-minute cooldown.

**You get:** A newly appended disabled alert definition named '<instrument> price watch'. If no quote is present, the initial threshold is 0.

**Next action:** Open the Alerts area, review/edit the threshold, and explicitly enable only after confirming the intended price and conditions.

**Limits / prerequisites:** The alert is disabled by default. A zero threshold when there is no quote is not a meaningful price target and needs review before activation. [D]

### 02.07. Select instrument / Chart handoff

**Where / how:** Markets. Tap a result card or Chart. Both actions set the selected workspace market and navigate to '/'.

**You get:** Selected market in workspace and handoff to the home/workbench screen; Chart is not a separate chart-only route.

**Next action:** On the destination, verify the symbol, source, and timeframe before interpreting its chart or invoking another capability.

**Limits / prerequisites:** Chart availability depends on source credentials, entitlements, sessions, and complete bars. A selected market does not establish a valid strategy signal. [D]

### 02.08. Market-data/timeframe boundaries

**Where / how:** Markets. Use the displayed selected source, then request bars through the destination chart. Treat returned bars as historical source data and inspect source/timezone/status before analysis.

**You get:** Coinbase or FMP historical bars, or selected-account TradeLocker bars; 4h can be UTC-aggregated from exact hourly bars. Weekly aggregation is restricted to 24/7 crypto daily bars with exact complete weeks.

**Next action:** If bars are insufficient, confirm the source supports the requested timeframe and wait for complete source bars or use a supported timeframe; do not fill gaps yourself as if they were observed data.

**Limits / prerequisites:** Broker native resolutions are 1m/5m/15m/1h/1d. 4h needs at least three closed complete buckets; weekly needs at least three completed Monday-to-Monday weeks, all seven daily bars, and is crypto-only. Current/incomplete buckets and gaps are omitted, not fabricated. Markets exposes no quant analyzer/backtest/optimizer/signal control; operational data availability is not strategy validation. No multi-leg or queue-order feature is claimed. [D]

<a id="module-strategies"></a>
## 03. Strategies, attached indicators, confluence gates, and Quant Lab

**Use this module:** Open one rulebook, inspect its versioned factors, then apply it to the chart. Keep manual checklist entries separate from source-bound analysis.

| No. | Feature | Purpose |
|---:|---|---|
| 03.01 | Search saved strategies and source references | Find a rulebook/style by name or description without scrolling the full library. |
| 03.02 | Photo-based search in My Library | Find an existing library item from the separate library workflow. |
| 03.03 | Reviewed style source-reference catalog | Add inspectable reference rulebooks instead of treating a source style as an already-proven personal system. |
| 03.04 | Create or edit personal strategy rules | Record a trader's own strategy scope and checklist rules as reviewable factors. |
| 03.05 | Apply strategy to chart | Choose which saved source rulebook informs chart analysis. |
| 03.06 | Independent strategy overlay visibility | Show or hide indicator layers without changing which strategy is active for analysis. |
| 03.07 | Duplicate source reference as personal strategy | Customize a read-only source reference while preserving the original. |
| 03.08 | Factor enable/weight controls | Maintain a personal checklist and its relative application weights. |
| 03.09 | Review-only weight refinement | Ask whether retained outcomes for this exact strategy version suggest a factor-weight change. |
| 03.10 | Version review and rollback | Inspect prior personal strategy snapshots and restore an earlier ruleset without erasing history. |
| 03.11 | Archive strategy profile | Retire a personal profile from active library/chart use while preserving its record. |
| 03.12 | Original WR1 risk disclaimers | Review the bundled original-source disclaimer text. |
| 03.13 | Native closed-bar setup analysis | Ask whether a supported source setup's ordered conditions are present on completed OHLC bars. |
| 03.14 | Strategy-attached chart indicators | See the numerical lines associated with the visible selected strategies. |
| 03.15 | Configure and approve sourced confluence gate | Answer whether a specific same-version candidate's explicit native closed-bar trigger and weighted conditions meet a review threshold. |
| 03.16 | AI Coach and workspace cloud save | Ask for an explanation or persist the current Strategies workspace using existing app routes/actions. |
| 03.17 | ORB Strategy from uploaded video | Apply a separate source-attributed opening-range strategy with exact video timing and owner-approved causal confirmation/stop rules. |
| 03.18 | London Breakout AI-assisted source | Detect a complete Asian-range 15m closed breakout with source stop/TP choices. |
| 03.19 | Initial Balance AI-assisted source | Detect the exact first-hour range then a 15m/30m closed break using the explicitly selected volume basis. |
| 03.20 | Red-to-Green / Green-to-Red AI-assisted source | Detect an observed same-source PDC quote cross with actual opening, selected relative-volume basis and complete morning risk. |

### 03.01. Search saved strategies and source references

**Where / how:** Strategies. Type a strategy, style, or rulebook term; revise or clear the text to change results.

**You get:** Filters non-archived saved strategies and the source-reference catalog by name/description.

**Next action:** Open a matching saved rulebook to inspect it, or add a matching source reference.

**Limits / prerequisites:** Search does not evaluate market data or validate a strategy.

### 03.02. Photo-based search in My Library

**Where / how:** Strategies. Tap the button to navigate to /library and use its search flow.

**You get:** Navigation only; Strategies itself does not process an image.

**Next action:** Continue the library workflow if needed.

**Limits / prerequisites:** No images were accessed in this read-only audit.

### 03.03. Reviewed style source-reference catalog

**Where / how:** Strategies. Tap Add [name] for one of eight missing references, or Add all missing source references.

**You get:** Adds separate read-only references for Order Block Retest, [STDV](#glossary-stdv) · VWAP Re-entry, Core Sequence, SMA Crossover, MACD Momentum, Trend Following, Breakout Momentum, and Mean Reversion; existing/archive records are preserved.

**Next action:** Open a reference, inspect its factors, then duplicate it before personal edits or apply it to the chart.

**Limits / prerequisites:** The screen warns that support varies. The legacy STDV Manipulation-Range Targets preset is separate from the eight current addable IDs. Workspace limit is 100 records including archives.

### 03.04. Create or edit personal strategy rules

**Where / how:** Strategies. Enter a name and scope/session/entry description, put one rule on each line, then Save strategy revision.

**You get:** Each nonempty line becomes an enabled factor; maximum 50 rules. New factors default to weight 10. Editing creates a new version and history snapshot.

**Next action:** Apply the profile for chart review, or inspect/adjust individual factors and weights.

**Limits / prerequisites:** Free text is not parsed into a detector. Only explicit supported indicator declarations can add recognized chart layers; manual prose is not automatically marked met or treated as entry permission.

### 03.05. Apply strategy to chart

**Where / how:** Strategies. Tap a saved card, then tap Apply to chart in the card or sheet.

**You get:** Marks the profile visible, sets activeStrategyId and analysisStrategyIds, and navigates to the chart for analysis/overlays.

**Next action:** Review closed-bar setup candidates and overlays on the chart.

**Limits / prerequisites:** No orders are submitted. Unsupported/custom definitions remain unknown rather than automatically evaluated.

### 03.06. Independent strategy overlay visibility

**Where / how:** Strategies. Open a saved strategy and switch Show chart overlays on or off.

**You get:** Visible, non-archived strategies contribute their declared layers to chart display; multiple visible strategies union their layers.

**Next action:** Compare the resulting chart lines with the strategy's explicit source rules.

**Limits / prerequisites:** Visibility only controls drawings; an overlay is not proof that the full source rule passed.

### 03.07. Duplicate source reference as personal strategy

**Where / how:** Strategies. Open a SOURCE REF and tap Duplicate as personal strategy; then edit the personal copy.

**You get:** Creates/selects a personal copy with independent identity/history and a source attribution string.

**Next action:** Review/edit its factors, then apply it to the chart.

**Limits / prerequisites:** The source reference remains unchanged; copying does not validate the rules.

### 03.08. Factor enable/weight controls

**Where / how:** Strategies. Toggle Include this factor and enter a weight from 0 to 100.

**You get:** Each change creates a strategy version snapshot.

**Next action:** Review the strategy revision or configure the distinct sourced confluence gate.

**Limits / prerequisites:** Legacy factor weights are checklist weights, not probabilities or the independently sourced gate. A saved zero weight remains zero when editing rules.

### 03.09. Review-only weight refinement

**Where / how:** Strategies. Review the message/limitations and any proposal's current/new weight, present/absent counts, and mean-R difference; tap Accept weight as new revision only if desired.

**You get:** Accepted proposal changes the factor weight as a new strategy version; no proposal may be available.

**Next action:** Continue review and inspect retained outcomes; treat the proposed weight as a hypothesis.

**Limits / prerequisites:** Requires retained outcomes for the exact version. Observed differences are not statistical proof, causal effect, or edge.

### 03.10. Version review and rollback

**Where / how:** Strategies. Tap Restore vN rules as a new revision for one of the recent history entries.

**You get:** Restores snapshot name, description, and factors as a new version.

**Next action:** Reapply/review the new revision and refresh any dependent paper proposal.

**Limits / prerequisites:** Rollback is not deletion or restoration of downstream records; source references are not editable through this path.

### 03.11. Archive strategy profile

**Where / how:** Strategies. Open a non-reference profile and tap Archive profile.

**You get:** Marks it archived and invisible; it disappears from the active saved-rulebook list.

**Next action:** Choose a remaining active strategy or create a replacement.

**Limits / prerequisites:** Archive is not delete and archived records count toward the 100-record workspace limit; references show no archive control.

### 03.12. Original WR1 risk disclaimers

**Where / how:** Strategies. Tap the button to open the disclaimer sheet.

**You get:** Displays the bundled title/source and quoted text.

**Next action:** Treat it as source context when reviewing the WR1 reference.

**Limits / prerequisites:** Quoted source, not app-authored advice; WR1 is not a personal trading system.

### 03.13. Native closed-bar setup analysis

**Where / how:** Strategies. Apply a supported model and inspect each candidate's side and step evidence on chart; refresh/review after new bars close.

**You get:** Core sequence checks hourly context, prior-swing sweep, displacement vs prior ATR, [MSS](#glossary-mss), FVG/[OB](#glossary-ob) CE and later CE retest. [Silver Bullet](#glossary-silver-bullet) requires FVG but session timing is manual; OB Retest requires OB. STDV manipulation-range targets are Fibonacci extensions, not sigma.

**Next action:** Use timestamps/statuses to identify missing prerequisites; do not infer an entry from a zone or overlay alone.

**Limits / prerequisites:** Still-forming/future bars are excluded; <8 execution bars produces a too-few message, 6 completed hourly bars are needed for hourly context, and readiness is limited to 1m–15m. At most three distinct selected source models are evaluated. Unsupported/custom prose and missing context remain unknown; outputs are not forecasts or calibrated probabilities. [D]

### 03.14. Strategy-attached chart indicators

**Where / how:** Strategies. Make a supported strategy visible, apply it, then review the line labels and chart; hide the strategy to remove its declared layers.

**You get:** Trend: EMA20/50 and 2×ATR14 guide; Mean Reversion: BB20 ±2σ and RSI14; SMA crossover: SMA20/50; MACD: 12/26/9 line/signal/histogram; Donchian: prior 20-bar high/low; Breakout: prior 10-bar high/low; VWAP STDV: rolling OHLCV VWAP20 ±2.5σ. Custom text only produces explicitly recognized periods.

**Next action:** Check each line against its explicit formula, closed-bar warm-up, source and strategy evidence.

**Limits / prerequisites:** Warm-ups are not zero-filled; EMA50 and five-bar slope need 55 closes, and VWAP requires valid volume windows. Non-Coinbase volume semantics are not established; VWAP is an OHLCV proxy, not tick/trade VWAP. Overlays do not attest full filters or order execution.

### 03.15. Configure and approve sourced confluence gate

**Where / how:** Strategies. Wait for current market/timeframe analysis; select a concrete candidate side when multiple; choose a native trigger; enable/weight other native steps; Normalize weights if needed; set threshold; check review acknowledgement; approve. Any subsequent edit returns configuration to draft.

**You get:** Versioned contract and evaluation snapshot containing trigger/checklist statuses, deterministic score, threshold, gateMet, strategyEntryEligible and blocked reasons. Score is sum of enabled met condition points; trigger is separate and must be met.

**Next action:** Inspect blocked reasons and refresh a paper proposal after saving; treat eligibility only as a paper-review signal.

**Limits / prerequisites:** Only allow-listed candidate-local native closed-OHLC steps qualify; session, clock, HTF metadata, news, quote, manual prose and order flow do not. Needs fresh point-in-time closed bars, matching strategy/version/side/bindings, owner approval, valid weights totaling 100 and at least one enabled met condition. Unknown/stale/pending active evidence blocks. Probability is always null; gate approval never creates order permission. [D]

### 03.16. AI Coach and workspace cloud save

**Where / how:** Strategies. Tap AI/Ask AI Coach for an explanation prompt, or tap Save current workspace to cloud.

**You get:** Navigation to Coach or invocation of the workspace save action; gate save attempts report local-retention/cloud-save status.

**Next action:** Verify explanations against source/data and confirm persistence through the app's normal workflow.

**Limits / prerequisites:** This audit did not perform API/database writes or diagnose shared UI/API availability. Coach output is not model validation; saving is not an order.

### 03.17. ORB Strategy from uploaded video

**Where / how:** Strategies → Video strategy · ORB → Configure ORB; Chart → Setup conditions. Add ORB once, apply to1m without changing market. Configure Native ES/NQ or the labelled NAS100 CFD mode; for NAS100 Detect tick and apply selected broker metadata locally. Save the revision/cloud and review the source gate.

**You get:** Exact completed08:00–08:15EST range; closed1m breakout → later midpoint retest → later current continuation; actual-mode wick-plus-tick stop and3R. NativeNQ50–150/ES20–40; app-added NAS10050–150CFD-price-point band.

**Next action:** Select the exact NAS100 broker instrument and confirmed tick/config, or connect native futures data. Review required source/gate/risk conditions before paper entry.

**Limits / prerequisites:** Native remains default. NAS100 uses actual market-bound broker tick, not CME0.25/display precision/futures equivalence. Explicit fixedEST/DST; no synthetic range, old confirmation, invented Gold/Asia anchor or validated edge. Out-of-band3R still blocks. [D]

### 03.18. London Breakout AI-assisted source

**Where / how:** Strategies → Session & pivot strategies → London. Add/apply 15m; configure midpoint/opposite stop and 1.5R/2R/range-height target; save/approve the source gate.

**You get:** Exact 00:00–03:00 fixed EST high/low/midpoint, post-03:00 close and source geometry.

**Next action:** Review source blockers before deliberately arming paper.

**Limits / prerequisites:** No coarse H1/H4 three-hour inference, missing bars, invented volume filter or predictive validation. [D]

### 03.19. Initial Balance AI-assisted source

**Where / how:** Strategies → Session & pivot strategies → Initial Balance. Choose 15m/30m; midpoint stop and one-range-height target beyond the broken edge. Detect instrument and fill missing verified settings; choose venue-only or explicitly labelled broker reported proxy. Approved volume≥1.5×prior20 and app11:30 cutoff.

**You get:** 09:30–10:30 fixed EST reference, truthful volume/clock/risk, actual tick when required, exact source levels and remaining blockers.

**Next action:** Save the source revision, approve the current same-direction gate, then deliberately arm paper if wanted.

**Limits / prerequisites:** Broker reported proxy is not exchange/venue volume and is never auto-selected. Missing/zero volume and incomplete30m periods remain blocked. No institutional/statistical edge claim. [D]

### 03.20. Red-to-Green / Green-to-Red AI-assisted source

**Where / how:** Strategies → Session & pivot strategies → R2G/G2R. Choose1m/5m; Detect instrument → Fill missing verified settings → Save. Supported price tick/provider-day PDC/dynamic actual PDH/PDL populate without freezing target prices. Personal session, tick and key-target overrides remain.

**You get:** One timestamped sampled crossing, transparent provider-day PDC, actual morning extreme plus true tick, dynamic/manual source targets and precise blockers.

**Next action:** Deliberately choose broker reported proxy only if desired; save/reapprove native source and arm paper separately.

**Limits / prerequisites:** Provider UTC trading-day close is not US RTH or settlement. No invented calendar/previous quote/key/premarket level, first-tick guarantee or stale crossing reuse. Actual source volume/tick/daily data must exist. [D]

<a id="module-library"></a>
## 04. Pattern/style Library upload and structured learning

**Use this module:** Search or open a retained record, then compare extracted notes with the original source available to the owner. Keep a record’s strategy and version visible while reviewing it.

| No. | Feature | Purpose |
|---:|---|---|
| 04.01 | Browse and search personal patterns/styles | Find an existing personal pattern reference or trading-style definition to review or use in a separate strategy workflow. |
| 04.02 | Upload a pattern/style source or save a manual definition | Create a personal reference from a chart picture or written source, or record a definition without sending a file for AI extraction. |
| 04.03 | Trainer: edit rules, label feedback, inspect source and versions | Resolve what a reference actually says, record positive/negative/correction feedback, and track the authoritative source revision. |
| 04.04 | Library AI structured blueprint and source-specific Coach handoff | Answer what trigger, confluences, indicators, entry/invalidation/targets/risk, required data, and ambiguities the uploaded source specifies. |
| 04.05 | Accept reviewed pattern/style or save an inactive AI review style | Explicitly convert a human-reviewed definition into a ready pattern reference or separate style proposal. |
| 04.06 | Photo-based personal-library retrieval and image re-indexing | Find saved references whose extracted terms resemble an owner-supplied chart image, or rebuild a stored image descriptor. |
| 04.07 | Pattern & style reference catalog | Look up definitions/prerequisites and add a review-only reference without an uploaded image. |
| 04.08 | Historical CSV/JSON descriptive statistics and nearest-shape study | Describe a supplied OHLC series and compare its latest 12-bar shape with older non-overlapping shapes and their subsequent outcomes, not issue a live signal. |
| 04.09 | Research laboratory: MA/FVG walk-forward baselines and analyst discussion | Run a simple historical baseline experiment over imported series, or request a separate role-based analyst discussion from the selected server feed. |
| 04.10 | Offline order-book label-classification experiment | Run a bounded offline classification experiment only when the owner has authorized real top-three depth snapshots. |

### 04.01. Browse and search personal patterns/styles

**Where / how:** My Library. Tap Patterns or Styles, search by name/tag/notes/description, then tap a result card to open its trainer sheet.

**You get:** Matching source/manual references with market, timeframe, filename, review status, tags, description, visual-index status, feedback count, and version.

**Next action:** Open the relevant record and inspect its original, rules, feedback, and status before accepting it.

**Limits / prerequisites:** A listed reference is not a signal or proof of edge. No upload, owner database/API operation, or source-image access was performed in this audit. [D]

### 04.02. Upload a pattern/style source or save a manual definition

**Where / how:** My Library. For a file: Files → Choose compatible file → choose Pattern picture or Trading style → enter a name and annotation/rules → review displayed strategy/market/timeframe → Upload & analyze source. For manual: omit file, enter a name and optional one-rule-per-line notes, then Save local manual definition.

**You get:** File flow creates an uploaded source and candidate description/rules/tags/limitations in review or failed state; a manual definition is a local, non-AI-analyzed record. File sources are retained in protected storage, associated to current market/timeframe/active strategy.

**Next action:** Open the record and compare extracted candidates to the source; edit rules and explicitly accept only after review.

**Limits / prerequisites:** File types: PNG, JPEG, WebP, PDF, TXT, Markdown, JSON. Needs a valid active strategy and owner-authorized session for cloud source actions; managed AI model availability is required for extraction. Text/PDF needs extractable text; scanned PDFs can fail. Blueprint scan has an 8 MiB byte limit. [D]

### 04.03. Trainer: edit rules, label feedback, inspect source and versions

**Where / how:** My Library. Open a record; edit Candidate rules one per line; optionally add correction notes; tap Positive, Negative, or Correction. For a file-backed record, use Open protected source; if a newer version is shown, use Load authoritative source vN. Uploaded images can preview; text/PDF source rendering is unavailable in this preview.

**You get:** Saved feedback labels and version counts; file-backed changes use a versioned source revision. Source versions, statuses, and label counts are displayed after source access.

**Next action:** Reconcile the displayed rules against the authoritative original and then choose the appropriate acceptance action.

**Limits / prerequisites:** Protected-source access and durable versions require a file-backed source and owner authorization. Manual definitions have no original file and feedback remains local. Feedback accompanies later comparisons; it is not foundation-model retraining or verified learning improvement. [D]

### 04.04. Library AI structured blueprint and source-specific Coach handoff

**Where / how:** My Library. Open a file-backed record → Scan strategy blueprint → expand Trigger & confluence blueprint and Missing inputs & ambiguities. Review each condition and source excerpt. Tap Ask AI about this source to open Coach with the source ID and a prefilled question. Manual definitions can be discussed but cannot be rescanned from an original file.

**You get:** Versioned unapproved proposal: summary, trigger, up to 24 conditions, indicators/parameters, markets/timeframes, entry, invalidation, targets, risk, required data, ambiguities, evidence excerpts, and weight provenance (source-stated/suggested/not-stated). It adds caution for discretionary, order-flow, quantitative, and ML references.

**Next action:** Check each claim against its excerpt, define missing data/rules yourself, and use Coach only for explanation. Treat missing or ambiguous requirements as review work, not as a no-trade forecast.

**Limits / prerequisites:** Requires an uploaded owner-protected source, available managed model, and successful extraction; maximum source size 8 MiB and analysis timeout 45 seconds. Text/PDF evidence is literal-quote checked; scanned PDF without text fails. Only an exact closed-bar EMA/close above/below comparison with literal period/comparison evidence can be marked supported, and that still does not create a scanner, alert, or order. Image evidence cannot receive a predicate spec. No performance/edge claim is established. [D]

### 04.05. Accept reviewed pattern/style or save an inactive AI review style

**Where / how:** My Library. After editing candidate rules, tap Accept reviewed pattern or Accept rules & apply style. Separately, an AI blueprint can be converted by tapping Accept as review style.

**You get:** Regular pattern acceptance marks the pattern ready without switching active strategy. Regular style acceptance creates/updates a style with one enabled weight-10 factor per entered rule and sets it as the active local workspace strategy. AI Accept as review style instead saves a hidden inactive style with disabled, weight-zero factors; it checks the 100-strategy limit and avoids replacing an existing source-version proposal.

**Next action:** Inspect the accepted style in Strategies, configure supported data and any required confluence gate, and separately establish paper-use readiness. Re-review after a source revision.

**Limits / prerequisites:** Acceptance is not statistical validation, model training, alerting, or order execution. AI proposal weights remain review prose. Regular style acceptance does make that style the active local strategy, but its use still requires separate configuration/review. [D]

### 04.06. Photo-based personal-library retrieval and image re-indexing

**Where / how:** My Library. Tap Photo-based search, choose PNG/JPEG/WebP, wait for the description/results, then tap a candidate. To rebuild a saved image index, open its trainer and tap Reindex protected image.

**You get:** Query description, matching Library record names/shared terms, and an explicit retrieval-not-detection limitation. Text retrieval requires at least two shared terms, sorts by shared-term count, and caps at eight. Optional visual-neighbor output displays [source version](#glossary-source-version) and cosine similarity.

**Next action:** Manually compare candidate source and rules; re-index only when geometric retrieval of uploaded images is useful.

**Limits / prerequisites:** Search is limited to the supplied personal Library. Term overlap or cosine similarity is not live pattern detection, calibrated confidence, or success probability. Catalog/manual references have no uploaded image vector. [D]

### 04.07. Pattern & style reference catalog

**Where / how:** My Library. Open the catalog, search, choose All/PD arrays/Candlesticks/Chart structure/Indicator styles, tap an entry for details, optionally open Read source / license, then Add review-only reference. Add all missing references for review is also available.

**You get:** Catalog definition, support caveat, source, and a local review record with notes/rules but no image/vector; indicator styles are typed as styles and other entries as patterns.

**Next action:** Open the added record, add source-specific conditions/anchors, review, and save workspace separately if cloud retention is wanted.

**Limits / prerequisites:** Catalog names do not imply a generic detector. Many entries are manual/source-specific and additions do not create probability or orders. Workspace limit is 500 records; full-catalog add can refuse if capacity is insufficient. [D]

### 04.08. Historical CSV/JSON descriptive statistics and nearest-shape study

**Where / how:** My Library. Import CSV with time,open,high,low,close,volume headers or JSON top-level candle array. Timestamps are Unix seconds. Select the actual interval from 1m/5m/15m/1h/4h/1d/1w. Defaults are LONG, hypothetical stop 0.5%, target 1%; change side/distances as desired. Imported history remains in component state.

**You get:** Parser accepts 3–10,000 positive OHLC bars with finite values, valid high/low bounds, nonnegative volume; it sorts by timestamp and rejects duplicates. At 31+ bars, stats show volatility per bar, lag-1 return autocorrelation, and lookback momentum. At 48+ bars, pure helper can show up to five non-overlapping 12-bar-shape analogs and their following 12-bar outcomes. Displays analog/resolved/win counts, dates, shape distances and win/loss/unresolved labels. Same-bar stop-and-target touch is conservatively loss/ambiguous.

**Next action:** Confirm source, interval, timestamps and sufficient history. Use analogs as a hypothesis to investigate independently, not as an entry instruction.

**Limits / prerequisites:** Fewer than 31 bars withholds descriptive stats; fewer than 48 bars yields no qualifying analog candidates. Empty/insufficient means data/sample cannot answer this comparison, not bearish/no-trade. Session gaps are not filled; interval is user-selected. No costs/[slippage](#glossary-slippage); probability is hardcoded null; not strategy backtesting or out-of-sample validation. [D]

### 04.09. Research laboratory: MA/FVG walk-forward baselines and analyst discussion

**Where / how:** My Library. Choose MA cross or 3-bar FVG, enter fees per side and slippage bps (both default 5), then tap Walk-forward test. Defaults are long, fast spans 5/10/15, slow 20/30, hold 12 bars, training 120 bars, test 40 bars, initial equity $10,000. Optional second imported series is separate asset input. Analyst discussion requires signed-in access and Sample mode off and uses server feed, not imported CSV.

**You get:** Walk-forward cards show per-asset return, drawdown, simulated trade count, hit rate/PF when available, source/bar count, fold train/test windows and selected MA parameters, labels, assumptions and limitations. Discussion shows role summaries, evidence IDs, missing inputs, review-long/short/wait and risk-veto status.

**Next action:** Inspect data coverage, fold dates, costs, assumptions, and limitations; compare only as a simulated baseline and seek independent validation.

**Limits / prerequisites:** Requires authenticated private research. Imported history must parse and be long enough for useful folds; component defaults imply 120-bar training and 40-bar tests but this UI does not specify a hard minimum. Discussion is disabled in Sample mode and uses server feed. No result/insufficient fold is not a signal. No execution or calibrated success probability. [D]

### 04.10. Offline order-book label-classification experiment

**Where / how:** My Library. Choose a JSON file <=8 MiB with instrument/source and 500–12,000 snapshots each containing numeric time plus exactly three bids and asks of price/quantity; confirm dataset permission, sign in, then Run bounded offline book comparison. Fixed defaults: 600s horizon, 1800s training, 10s test, one fold.

**You get:** If run returns, UI displays five classifier families/six fixed configurations, sample gaps, eligible/excluded rows, chronological train/test/purged counts, label accuracy vs majority baseline, balanced accuracy, precision/recall, confusion counts, and limitations.

**Next action:** Use authorized actual depth data only; inspect temporal coverage, class availability, purging and baselines before deciding whether the experiment is informative.

**Limits / prerequisites:** Requires authorized data, valid snapshot format, owner-authenticated access and sufficient coverage/classes. It is offline label classification; no stored/deployed model, HFT/DMA, queue position/fills, profit, paper/broker orders, or success score. No multi-leg or queue-order functionality is claimed. [D]

<a id="module-screenshots"></a>
## 05. Trade screenshot evidence and retained review

**Use this module:** Open the retained evidence, read its visible facts and uncertainty, and attach lessons to the matching strategy version. Treat the image as study material, not execution evidence.

| No. | Feature | Purpose |
|---:|---|---|
| 05.01 | Expand/collapse screenshot review | Open or hide the private screenshot coaching workflow without changing trade data. |
| 05.02 | Retained screenshot inventory and reopen | Find previously retained evidence and continue reviewing it without uploading a duplicate. |
| 05.03 | Stage selector and optional trade linkage | Capture whether the image represents before/during/after a trade (or unknown), and optionally associate it with an existing paper trade. |
| 05.04 | Owner-entered capture/trade time and timezone | Preserve timing context the trader knows when the screenshot itself lacks a legible timestamp. |
| 05.05 | Choose screenshot | Select a private image source for evidence retention and review. |
| 05.06 | Upload & analyze / retry analysis | Retain the original privately and request a structured, bounded coaching review; retry a retained original if analysis is unavailable or fails. |
| 05.07 | Review draft and evidence output | Separate visible facts from uncertainty and surface process/documentation observations without treating a screenshot as a signal or proof of results. |
| 05.08 | Confirm & retain review | Deliberately retain an approved coaching review as a protected source revision. |

### 05.01. Expand/collapse screenshot review

**Where / how:** Library or Trades → Screenshot review. Tap the Screenshot review heading. In a trade sheet the stage defaults to after for closed, during for open, or before otherwise; standalone Library mode defaults to unknown.

**You get:** Shows the screenshot evidence panel with controls, retained items (if any), and review content.

**Next action:** Choose a screenshot or reopen a retained source; use Library for general/standalone inventory and a trade sheet for evidence linked to that paper trade.

**Limits / prerequisites:** Owner-only paper-trading coaching/evidence, not an order-entry or canonical trade-editing feature. [D]

### 05.02. Retained screenshot inventory and reopen

**Where / how:** Library or Trades → Screenshot review. Tap a listed row; rows show name/version, stage, approval or original status, and a short summary.

**You get:** Loads source metadata and any retained review; restores stage and owner-entered time/timezone when a review exists. It does not display or fetch the original image to the client.

**Next action:** For an original without a review, choose context and tap Retry analysis. For a review, inspect the draft/retained review. Use the general Library list to find unlinked items when viewing a filtered trade sheet.

**Limits / prerequisites:** Owner service returns up to 100 newest items. The compact list starts with 20 and Show more reveals further retained rows up to 100; this is not server pagination. Trade-sheet lists remain trade-filtered. [D]

### 05.03. Stage selector and optional trade linkage

**Where / how:** Library or Trades → Screenshot review. Tap Before, During, After, or Unknown. In a trade sheet, the link checkbox starts checked; uncheck it to analyze as standalone. Library standalone mode has no link checkbox.

**You get:** Selected stage and standalone/owner-scoped linkage are included in the review. The server verifies linked-record ownership but does not send trade fields to the model.

**Next action:** Confirm context is accurate, then upload/analyze; an unlinked item can later be found from Library.

**Limits / prerequisites:** Linking only organizes evidence: it does not verify or modify fills, stops, targets, outcomes, or execute a trade. [D]

### 05.04. Owner-entered capture/trade time and timezone

**Where / how:** Library or Trades → Screenshot review. Optionally enter an ISO timestamp ending in Z or a numeric timezone offset, such as the displayed `2026-10-17T09:30:00-04:00`; optionally enter a timezone name. Leave unknown values blank.

**You get:** Owner time is separate from upload time and image-visible time. If the image time is unavailable, the review keeps it null and marks the visibility status; owner time is confirmed only when a timestamp is supplied.

**Next action:** Use supplied timing as owner context, not as independently verified capture time.

**Limits / prerequisites:** Nonblank timestamps without Z/offset or invalid timestamps block analysis. A timezone string alone is not proof of the capture timezone. [D]

### 05.05. Choose screenshot

**Where / how:** Library or Trades → Screenshot review. Tap, select a PNG, JPEG/JPG, or WebP image, then confirm the notice says it has not yet been uploaded. Selecting another replaces the unsent candidate and clears current local source/review state.

**You get:** A selected filename notice; no server-side source exists until upload begins.

**Next action:** Set stage/link/time context and tap Upload & analyze.

**Limits / prerequisites:** Maximum 8 MiB; server also checks image signature/MIME. Upload requires an owner session, workspace market/timeframe, and an active strategy (falling back to the first strategy). Image selection alone does not authenticate chart contents. [D]

### 05.06. Upload & analyze / retry analysis

**Where / how:** Library or Trades → Screenshot review. Select a supported image, ensure workspace strategy/market/timeframe are available, set optional context, and tap Upload & analyze. If upload succeeds but analysis fails, tap Retry analysis; retry reuses the retained original rather than reuploading it.

**You get:** Successful analysis creates an unapproved draft. Upload is retained before analysis; a failure notice leaves the original retained for retry.

**Next action:** Read the draft and explicitly confirm if it is useful. On source-version conflict, reload the current source before retrying.

**Limits / prerequisites:** Needs owner authorization, current source version, valid retained image and an available supported managed multimodal model; service timeout is 55 seconds. Schema/bounded-review checks reject malformed or unsafe claims. This is not a statistical validation. [D]

### 05.07. Review draft and evidence output

**Where / how:** Library or Trades → Screenshot review. Read summary, stage/time status, Visible facts, Textual evidence (location/certainty/unknowns), Confluences, Process lessons and Limits. Compare against independent records before confirming.

**You get:** Separate visible facts and readable text evidence with source location and uncertainty, bounded observations/lessons and explicitly unverified outcomes. A screenshot is not proof of execution.

**Next action:** Use observations only as prompts for manual checking and documentation; compare against independent records before drawing conclusions. Confirm to retain a useful review.

**Limits / prerequisites:** No screenshot can verify a fill, bracket state, strategy edge, or outcome; displayed P/L/order text is unverified. [D]

### 05.08. Confirm & retain review

**Where / how:** Library or Trades → Screenshot review. Read the draft and disclosure, then tap Confirm & retain review. Wait for confirmation; resolve a stale-version conflict by reloading/reanalyzing.

**You get:** Creates a new protected source revision with approved status and confirmation time; UI says no canonical trade fields changed.

**Next action:** Reopen it later from the retained list as coaching/documentation material.

**Limits / prerequisites:** Does not validate strategy, fill, bracket, or outcome; does not mutate a paper trade or place an order. [D]

<a id="module-historical"></a>
## 06. Recent analogue scenario

**Use this module:** Use this module to compare the current setup with the available recent analogue window. The current source window is capped at 3,000 bars, so the label does not claim deep history.

| No. | Feature | Purpose |
|---:|---|---|
| 06.01 | Recent analogue scenario — show/hide overlay | Answer what a similar prior 12-closed-bar price shape did over its next 12 bars; this is an analogue, not a forecast or trade signal. |
| 06.02 | Replay display style — Line / Ghost OHLC / Both | Choose the visual form of the same replay without changing its source or calculations. |
| 06.03 | Notify me when scenario direction flips — watch rule | Create or re-enable a locally scoped watch rule for a direction change on the selected market, timeframe and strategy IDs. |
| 06.04 | Show captured alert candles and scenario — route-specific evidence toggle | Inspect the setup/candles captured with a triggered alert; this is not a newly computed historical replay. |
| 06.05 | Recent analogue outcome profile — adjacent conditional-history readout | Show whether enough qualified compatible setup outcomes exist for a descriptive target-before-stop fraction. This is separate from context replay, which does not require a ready setup. |

### 06.01. Recent analogue scenario — show/hide overlay

**Where / how:** Chart → Historical scenario. Chart → Current historical replay keeps the original current-frame recent-analogue or captured source replay. For extra comparisons, Historical scenario layers lets you choose source timeframe and target chart frames, Add historical layer, then independently hide/remove, select line/ghost/both, color or follow/fixed anchor.

**You get:** Original current/captured replay plus independently saved colored historical continuations on selected chart frames. Source bars and gaps are retained; follow mode translates/scales only display geometry.

**Next action:** Review source bars, data gaps and setup evidence manually. If an eligible source continuation is absent, use no replay as a data-availability result—not as market direction or a failed setup.

**Limits / prerequisites:** Requires actual past continuation; no invented future may be labelled historical. Six additional visible comparison layers / twelve saved overall. Existing scenario direction watch remains on the original replay, not arbitrary display layers; switching chart frames does not delete saved comparisons. [D]

### 06.02. Replay display style — Line / Ghost OHLC / Both

**Where / how:** Chart → Historical scenario. With replay visible, tap Line, Ghost OHLC, or Both (default).

**You get:** Shows a projected close line, ghost candles, or both; the historical / not-a-forecast label remains when replay bars render.

**Next action:** Choose the presentation that best supports visual comparison; Both shows line and OHLC ranges.

**Limits / prerequisites:** Requires scenario bars and overlay visibility. This is presentation only; it does not recalculate the replay or create an AI forecast/trade plan. [D]

### 06.03. Notify me when scenario direction flips — watch rule

**Where / how:** Chart → Historical scenario. In real-data mode with at least one analysis strategy selected, tap the button. Then save rules in Alerts and activate the appropriate native-device/deployed scans. The UI says first observation seeds the baseline; local capacity is 100 rules.

**You get:** Creates or enables a local scenario-direction rule. Pure direction classification uses the final replay close versus anchor: over +0.01% up, under −0.01% down, within the band flat.

**Next action:** Save and separately activate the watch through Alerts; treat any notification as a prompt to review evidence, not an order instruction.

**Limits / prerequisites:** Disabled in Sample mode or with no selected strategy. Watches scenario direction, not entry/exit. No brokerage or order action. [D]

### 06.04. Show captured alert candles and scenario — route-specific evidence toggle

**Where / how:** Chart → Historical scenario. Open a triggered alert's Chart view and toggle Show captured alert candles and scenario when captured setup data is present.

**You get:** When shown, chart uses the alert's captured setup candles and attached scenario when available, independently of current live-chart candles.

**Next action:** Compare the capture with its recorded source, strategy version and evidence; distinguish it from current bars and the fresh historical replay.

**Limits / prerequisites:** Only appears for an alert route with captured setup data available. It displays the saved capture; it does not refresh it, create a new replay, or place a trade. [D]

### 06.05. Recent analogue outcome profile — adjacent conditional-history readout

**Where / how:** Chart → Historical scenario. Turn Sample mode off, select supported model(s) (up to three) and AND/OR, wait for completed real bars, inspect candidate/messages, and read a percentage only if displayed; otherwise UI reports insufficient eligible history.

**You get:** If threshold is met, shows wins/losses, eligible cases, 12-bar horizon, descriptive [Wilson interval](#glossary-wilson-interval) and cost limitations. Cases use qualifying closed-bar retest, next-bar-open hypothetical entry, 2R price-distance target and next 12 bars; same-bar stop/target resolves conservatively as loss. Maximum scan 600 anchor opportunities and 100 cases. Probability remains null by design.

**Next action:** Use it only as a prompt for costed walk-forward and untouched-holdout validation, never as a sizing input or claimed edge.

**Limits / prerequisites:** A percentage requires 100 resolved cases (the collector caps at 100 total) plus a single compatible current direction, executable supported model, sufficient completed history and qualified past entries. Withheld for inadequate/conflicting/unsupported cases; numerical/microstructure references do not have configured strategy-specific outcome evaluation. OHLC-only calculation excludes spread, commission, slippage, financing, fill queue and intrabar order path. Unit fixtures, counts, intervals or rates do not prove edge. No multi-leg or queue-order implementation is asserted. [D]

<a id="module-forecast"></a>
## 07. AI scenario

**Use this module:** Read the stated assumptions, direction and invalidation together. This module presents conditional scenarios from the available inputs; it does not turn them into a prediction.

| No. | Feature | Purpose |
|---:|---|---|
| 07.01 | Forecast panel disclosure | Open or collapse the conditional scenario tool and see whether a scenario is available. |
| 07.02 | Optional scenario question | Let the trader state a conditional question to guide the AI scenario discussion. |
| 07.03 | Generate / regenerate scenario | Create and compare independently selected source-timeframe AI hypotheses while preserving their connected line/ghost appearance. |
| 07.04 | Show AI forecast toggle | Compare separately labelled AI hypotheses from different source timeframes on the charts you choose while keeping the connected line/ghost look. |
| 07.05 | Line / candles / both style buttons | Choose the representation of the same scenario, not change its values. |
| 07.06 | Scenario detail and chart readout | Compare separately labelled AI hypotheses from different source timeframes on the charts you choose while keeping the connected line/ghost look. |
| 07.07 | Remove forecast | Clear the current generated scenario from panel/chart state. |

### 07.01. Forecast panel disclosure

**Where / how:** Chart → AI forecast scenario. Tap the ‘AI forecast scenario’ heading to open or collapse the panel; it is initially open.

**You get:** Shows the optional question and generation control, then generated scenario details and display controls; summary explicitly says conditional scenario, not prediction.

**Next action:** If connected actual market data is available, optionally add a question and generate; use results only for conditional planning.

**Limits / prerequisites:** Disabled in sample mode. Generation also requires live connected market context and the server prerequisites detailed in the report. [S] [Q]

### 07.02. Optional scenario question

**Where / how:** Chart → AI forecast scenario. Tap the field, enter a question of up to 800 characters, then tap Generate; leaving it blank is allowed.

**You get:** Text is passed with market data as untrusted scenario instructions; successful output appears as thesis, assumptions, invalidation, and a 12-step path.

**Next action:** Review assumptions and invalidation as things to monitor; revise the question and regenerate if useful.

**Limits / prerequisites:** Prompt text is not evidence, cannot supply replacement market data, and does not turn output into a validated forecast. [S] [Q]

### 07.03. Generate / regenerate scenario

**Where / how:** Chart → AI forecast scenario. Chart → AI scenario layers: select source timeframe and destination chart timeframes (or All), choose Current or explicitly Last available, and Generate AI layer. Each saved layer can be refreshed, hidden/removed and given its own line/ghost style, color and follow/fixed connection.

**You get:** Twelve-step AI hypotheses; up to six additional visible layers and twelve saved snapshots overall, with source time, age, expiry and no success probability.

**Next action:** Use the thesis, assumptions, and invalidation to frame manual observation; do not use the path to place or size a trade.

**Limits / prerequisites:** Current mode requires genuinely fresh source bars and quotes. Last available generates a clearly labelled old-history hypothesis without a current quote. Follow reconnects/scales only the drawing, not source analysis. Expired or wrong-market layers are withheld. Existing default historical replay remains independent. [S] [Q]

### 07.04. Show AI forecast toggle

**Where / how:** Chart → AI forecast scenario. Chart → AI scenario layers: choose the source timeframe, select target chart timeframes (or All), choose Current or explicitly Last available context, and Generate AI layer. Each saved snapshot has its own show/hide, line/ghost style, follow/fixed connection and color controls. Refresh expired snapshots rather than treating their old analysis as current.

**You get:** Up to six additional visible layers, with twelve saved owner-scoped snapshots overall. Source intervals, expiry and historical/current context are retained; hypothetical OHLC never joins actual chart/source/order data.

**Next action:** Keep visible to compare conditional path with actual chart context, or hide for a cleaner view; regenerate if expired or anchor changed.

**Limits / prerequisites:** Current mode still requires genuinely fresh completed bars and timestamped quotes. Last available is an explicit old-history hypothesis with no current quote claim. Display-only follow mode rescales/reconnects a saved shape; it does not refresh analysis or validate a prediction. Provider/model access and actual iPhone confirmation remain required. [S] [Q]

### 07.05. Line / candles / both style buttons

**Where / how:** Chart → AI forecast scenario. Tap line for the dashed projected close path, candles for OHLC candles, or both for both representations.

**You get:** A dashed blue line connects anchor and projected closes; translucent blue/purple candles show the 12 hypothetical OHLC steps; both overlays them together.

**Next action:** Choose the presentation that is easiest to compare with the actual chart.

**Limits / prerequisites:** Presentation only; does not change model output, scenario assumptions, or actual source bars. Projected volume is a zero/display placeholder, not volume forecast or flow. [S] [Q]

### 07.06. Scenario detail and chart readout

**Where / how:** Chart → AI forecast scenario. Inspect each saved layer card or Chart → Details → Timeframe scenario layers for source frame, target frames, source/expiry, visibility and connection mode. Tap the colored chart legend for details.

**You get:** Per-layer source/timeframe/color and AI thesis/assumptions/invalidation or historical continuation explanation. Actual candles, historical replay and AI hypothetical prices remain separate.

**Next action:** Use assumptions and falsifiable invalidation as manual observation questions; assess later actual data independently.

**Limits / prerequisites:** Current mode still requires genuinely fresh completed bars and timestamped quotes. Last available is an explicit old-history hypothesis with no current quote claim. Display-only follow mode rescales/reconnects a saved shape; it does not refresh analysis or validate a prediction. Provider/model access and actual iPhone confirmation remain required. [S] [Q]

### 07.07. Remove forecast

**Where / how:** Chart → AI forecast scenario. Tap ‘Remove forecast’; generate again if a fresh scenario is desired.

**You get:** Clears local scenario state and notifies parent that no forecast should be displayed; style selection remains.

**Next action:** Generate a new scenario only if useful and prerequisites still hold.

**Limits / prerequisites:** Not an order cancellation or database deletion; audited forecast route/service do not persist forecasts or create trades. [S] [Q]

<a id="module-coach"></a>
## 08. Built-in AI trading coach

**Use this module:** Ask a focused question in the active local conversation and inspect the visible turns before acting on an explanation. The current guide records no separate browseable prompt-history library.

| No. | Feature | Purpose |
|---:|---|---|
| 08.01 | Owner-only Trading Coach route and Back navigation | Open a private learning conversation for educational paper-trading questions, not live execution. |
| 08.02 | Coach availability status and Retry context | Show whether a live model catalog check reports the coach as available and provide a way to retry a failed status check. |
| 08.03 | Coach Details disclosure | Let the user inspect server-reported context and capability metadata instead of relying only on a compact readiness label. |
| 08.04 | Learning Prompts | Offer prepared questions for common learning problems: strategy explanation, confluence, comparing pairs, and trading discipline. |
| 08.05 | Question composer and Send | Ask a free-form educational trading question and, when available, get a grounded response. |
| 08.06 | Retry failed coach question | Recover from a timeout or failed request without retyping the question. |
| 08.07 | Clear private conversation | Remove the current local coach transcript and reset the visible session. |
| 08.08 | Selected-library-source coach scope | Ask about a protected library record while keeping its source ID separate from private file/image bytes. |

### 08.01. Owner-only Trading Coach route and Back navigation

**Where / how:** Trading Coach. Open /coach. Use Back to return to the prior screen. The route is wrapped in OwnerGate and server calls independently check the approved owner.

**You get:** Trading Coach page with private chat; service offers coach.status, coach.ask, and analytics endpoints.

**Next action:** Use the lesson library, a prompt suggestion, or compose a question. Treat replies as learning material and independently verify context.

**Limits / prerequisites:** Owner-only, educational and paper-only. No order entry, broker action, rule editing, guaranteed result, or validation of a setup.

### 08.02. Coach availability status and Retry context

**Where / how:** Trading Coach. Read Checking coach…, Coach ready, Coach unavailable, or the status-unavailable message. If the status query errors, tap Retry context. If service explicitly says unavailable, requests remain disabled until status changes.

**You get:** Availability, selected catalog-listed model when available, and an 8-second bounded catalog-check context status.

**Next action:** Retry a transient status-query error, or wait and retry later if the service reports unavailable.

**Limits / prerequisites:** A successful status check only shows a listed model, not that a real answer will succeed or be accurate. Status-query error and explicit unavailable are distinct states.

### 08.03. Coach Details disclosure

**Where / how:** Trading Coach. Tap Details to expand Context and Capabilities when those lists are present; tap Hide details to collapse.

**You get:** Up to eight sanitized labels per list from coach.status.

**Next action:** Use the labels to understand declared service scope; check each answer's context metadata for request-specific grounding.

**Limits / prerequisites:** Disclosure only; it does not fetch more context, alter settings, or validate facts.

### 08.04. Learning Prompts

**Where / how:** Trading Coach. Tap Explain strategy, Break down confluence, Compare pairs, or Trading discipline. The selected text is sent immediately. In library scope, a fifth source-specific prompt appears.

**You get:** A coach response to the prewritten question, with model, context-status, and source metadata when returned.

**Next action:** Review observations versus assumptions, inspect citations/context status, and ask a narrower follow-up if needed.

**Limits / prerequisites:** An answer or citation does not validate a setup; prompts do not create orders. Availability of current market context depends on the request's workspace inputs and server reads.

### 08.05. Question composer and Send

**Where / how:** Trading Coach. Type a nonblank question of up to 1,600 characters in the labeled field and tap the arrow. The request includes up to 14 prior turns and the current workspace market, timeframe, active strategy, plus an optional selected source ID. Wait for the pending state to finish.

**You get:** Assistant prose rendered with a limited safe Markdown subset; model name, context-status labels, and server-returned citations/source timestamps can accompany it. Failures show a notice and an unsent question.

**Next action:** Check returned context/source timestamps and unavailable/stale indications; verify claims against source material and use a manual paper checklist.

**Limits / prerequisites:** Requires approved owner and local conversation state loaded. Server/model/provider/context failure can prevent a reply. Not a trading signal or execution instruction.

### 08.06. Retry failed coach question

**Where / how:** Trading Coach. When an UNSENT QUESTION card appears, read the error and tap Retry question. It resubmits the same question when no request is pending.

**You get:** A new attempt; a successful result adds a completed user/assistant exchange, while another failure retains the retry state.

**Next action:** If repeated errors persist, check coach status/connectivity or shorten the question; do not infer a market conclusion from a failed request.

**Limits / prerequisites:** Retry may still fail due to catalog/provider, timeout, access, rate limit, or context errors. No incomplete exchange is treated as a completed answer.

### 08.07. Clear private conversation

**Where / how:** Trading Coach. Tap Clear when the current conversation contains turns or a failed/pending question. Confirm only by the deliberate tap; it clears this current storage key.

**You get:** Visible turns, failed and pending question states are cleared and the current owner/scope/source AsyncStorage item is removed.

**Next action:** Start a new question or prompt. Clearing is local to the current identity/scope/source conversation.

**Limits / prerequisites:** Does not clear the server's paper ledger, other scopes/source conversations, or independently prove secure device deletion.

### 08.08. Selected-library-source coach scope

**Where / how:** Trading Coach. Open the coach with scope=library and a sourceId supplied by a library entry point. Check the LIBRARY CONTEXT label and source-specific field/prompt, ask about the record, then inspect context/citations in the response.

**You get:** Compact transcript with selected source metadata grounded server-side; source can be reported unavailable. The source packet excludes fileKey, imageUri, visual index, source bytes and unknown fields.

**Next action:** Compare the response with the actual protected record in its own view and mark unsupported claims as unverified.

**Limits / prerequisites:** Source ID is not a source upload; file/image bytes are not sent by this coach pathway. Source statements and AI citations are not proof of a trade, fill, or edge.

<a id="module-paper"></a>
## 09. Paper lifecycle

**Use this module:** Choose a paper ticket mode, verify entry, stop, target, units and loss budget, then review each recorded lifecycle event. Paper records stay separate from broker execution.

| No. | Feature | Purpose |
|---:|---|---|
| 09.01 | Request or retry a paper proposal | Ask whether a chart-side Buy/Sell paper plan can be formed using current server quote and setup evidence; no local synthetic fallback is created. |
| 09.02 | Manual practice or gated strategy mode | Choose discretionary paper practice versus a strategy entry that is required to pass approved, fresh, same-direction confluence rules. |
| 09.03 | Discipline panel and risk templates | Review discipline context and choose percentage-risk sizing or fixed units before shaping the order. |
| 09.04 | Ticket: entry, stop, target/R:R and quantity | Answer what exact simulated bracket and size should be recorded, and whether it has valid directional geometry and positive risk/reward. |
| 09.05 | Restore server bracket and selected risk | Discard local ticket edits and return to the immutable proposal defaults. |
| 09.06 | Optional pre-trade thoughts | Record the trader's own reasoning before the simulated trade. |
| 09.07 | Advanced order style and paper bracket management | Choose immediate simulated market-style entry or observed pending limit entry and explicitly opt into automated simulated bracket handling. |
| 09.08 | Confirm paper order | Create a durable, owner-scoped simulated trade after the plan and server checks pass. |
| 09.09 | Pending/open/closed trade lifecycle, edit, review and close | Track a pending limit through observed entry, manage an open simulated position, or preserve a closed-trade review without changing the historical fill. |
| 09.10 | Optional automatic ORB paper entries | Place simulated source-gated ORB brackets when the owner deliberately arms bounded foreground automation. |
| 09.11 | Optional automatic session paper entries | Create one canonical source-bracket simulated trade per event under deliberate bounded consent. |

### 09.01. Request or retry a paper proposal

**Where / how:** Chart → Buy/Sell → Paper plan. From the chart request a Buy or Sell plan. If source history/proposal fails, read the shown error and tap Retry paper proposal when available. If no proposal is present, return to the chart and request one.

**You get:** An immutable proposal ID and, when available, direction, strategy snapshot count, and proposed bracket/size/risk context. The sheet waits for refresh before enabling confirmation.

**Next action:** Review paper mode, risk template and ticket; resolve quote, source or proposal blocker before confirming.

**Limits / prerequisites:** Requires an immutable proposal ID and current live quote (≤120 seconds old and not >30 seconds future). Market must support paper valuation; unsupported USD valuation is rejected. [P]

### 09.02. Manual practice or gated strategy mode

**Where / how:** Chart → Buy/Sell → Paper plan. Tap Manual practice for discretionary practice, or Gated strategy to request strategy-gated entry. In strategy mode inspect the per-strategy score/threshold/eligibility; if blocked, save an approved gate in Strategies and refresh the proposal, or switch to manual practice.

**You get:** Practice is explicitly not represented as a valid strategy signal. Strategy mode independently rechecks canonical approved rules; missing/pending evidence blocks entry rather than producing an invented score.

**Next action:** For gated use, ensure the approved gate and strategy configuration are saved/current and same direction, then refresh the proposal. Otherwise use practice mode.

**Limits / prerequisites:** Strategy mode requires canonical saved workspace, matching strategy versions/configuration and current eligible confluence. A gated pending limit may wait with a durable reason if current evidence is unavailable. See paper-gate.ts:16-43, 45-126; paper-service.ts:204-305, 714-741. [P]

### 09.03. Discipline panel and risk templates

**Where / how:** Chart → Buy/Sell → Paper plan. Review the displayed discipline panel and tap 1% risk, 2% risk, or Fixed units; wait for the fresh immutable proposal refresh to complete.

**You get:** Updated proposal bracket and size. For percentage templates, server may recompute unchanged default quantity against the actual fresh bracket; fixed-unit sizing is user-selected.

**Next action:** Review the refreshed entry, stop, target and quantity in the ticket; restore proposal defaults if needed.

**Limits / prerequisites:** The UI says fixed units may be below 0.5%, but server cap is 2%; non-fixed edited sizing has a 0.5% reference-risk floor and template-specific 1%/2% cap. Legacy unsupported sheet selections normalize to 1%. This is not broker margin or suitability analysis. See paper-plan-sheet.tsx:74-78, 283-311; paper-service.ts:407-429. [P]

### 09.04. Ticket: entry, stop, target/R:R and quantity

**Where / how:** Chart → Buy/Sell → Paper plan. Edit Entry, Stop / invalidation, Target price and Paper quantity / units. Choose 1R, 2R, 3R or enter positive Custom R:R; R:R mode recalculates target from entry/stop. Editing Target price switches to absolute-price mode and preserves that direct target. Review displayed actual R:R and any blocker.

**You get:** Locally parsed draft and actual R:R/geometry status. On submit, market-style entry uses fresh executable side quote (long ask, short bid); eligible unchanged default bracket may be recalculated for fresh entry while edited absolute target is retained and rejected if invalid.

**Next action:** Correct invalid values/geometry or restore the proposal defaults before confirming.

**Limits / prerequisites:** Requires positive finite entry, stop, target and quantity, valid side geometry and (in R:R mode) positive finite R. Not a broker executable quote, fees/slippage, liquidity or fill guarantee. See paper-plan-sheet.tsx:345-433; paper-service.ts:332-405. [P]

### 09.05. Restore server bracket and selected risk

**Where / how:** Chart → Buy/Sell → Paper plan. Tap Restore server bracket & selected risk; review the restored bracket before continuing.

**You get:** Restores proposal entry/stop/target/quantity, resets target mode to derived 2R, and clears the current message.

**Next action:** Review the restored values and confirm only if still appropriate.

**Limits / prerequisites:** A percentage-template quantity may still be resized against the actual fresh quote on the server; restoring does not guarantee final fill equals the stale draft. See paper-plan-sheet.tsx:157-166, 422-432; paper-service.ts:368-429. [P]

### 09.06. Optional pre-trade thoughts

**Where / how:** Chart → Buy/Sell → Paper plan. Type notes into Optional notes; leave blank if not needed.

**You get:** Trimmed text is sent in the pretradeThoughts journal field; blank input sends an empty journal object.

**Next action:** Use the note as a later journal/review reference.

**Limits / prerequisites:** Notes are not a gate, signal or proof of strategy quality. See paper-plan-sheet.tsx:71, 184-193; paper-service.ts:517-521. [P]

### 09.07. Advanced order style and paper bracket management

**Where / how:** Chart → Buy/Sell → Paper plan. Expand Advanced. Choose Market-style or Limit pending; optionally enable Paper bracket management. Confirm, then monitor open or pending status. Do not assume processing while the app is closed unless deployed scheduling is established.

**You get:** Market-style creates an open paper record at fresh side quote. Limit-style starts pending and may open only after eligible observed executable-side quote and evidence. Auto-management is separate from pending limit observation. Open positions can store changing observed [MAE](#glossary-mae)/[MFE](#glossary-mfe); opted-in brackets can take one 50% 2R partial, move remaining stop to break-even and close on stop/target.

**Next action:** Monitor status; review/edit bracket or close open positions through available trade controls. Verify scheduling operationally before relying on closed-app processing.

**Limits / prerequisites:** Limit entry uses long ask/short bid; quote/evidence and bracket must be valid. Manual open trades do not auto-advance bracket. Missed intrabar paths are not reconstructed; a bar touching both stop and target is treated stop-first; bar range has no intrabar bid/ask. Simulations exclude fees, slippage and invented spread. See paper-plan-sheet.tsx:444-475; paper-service.ts:714-780; paper-lifecycle.ts:84-108, 181-200, 294-421. [P]

### 09.08. Confirm paper order

**Where / how:** Chart → Buy/Sell → Paper plan. Resolve any displayed blocker, tap Confirm LONG/SHORT paper order and wait for Saving paper order…; on success the sheet reports the created trade through its callback and closes. On failure read the error and retry only after addressing it.

**You get:** A persisted paper trade: open for market-style, pending for limit-style, with risk/quantity, proposal and strategy snapshots, execution-source journal and created event.

**Next action:** Review the new open or pending paper record. Pending orders await eligible entry observation; open orders can be managed/closed using supported paper operations.

**Limits / prerequisites:** Requires proposal ID, fresh live quote, valid market valuation, geometry/risk/gate checks; configured daily drawdown cap/cooldown can block; active paper positions are capped at 100; proposal reuse in a different mode conflicts. See paper-plan-sheet.tsx:167-211, 483-495; paper-service.ts:307-323, 430-489, 493-560. [P]

### 09.09. Pending/open/closed trade lifecycle, edit, review and close

**Where / how:** Chart → Buy/Sell → Paper plan. A pending limit opens only when observed quote and applicable evidence satisfy entry rules. Open trades receive quote-sampled excursions; bracket auto-advance requires opt-in. For an open trade, the service supports version-checked bracket edit or fresh-quote simulated close. For a closed trade, save a review; bracket/fill is immutable.

**You get:** Versioned trade state, event/revision records, possible gate-wait reason, entry/exit side price, excursion extrema and review text. Manual close is long bid/short ask and explicitly leaves broker position unchanged.

**Next action:** Refresh conflicting versions; if pending, address gate/source/configuration wait or keep observing; if open, edit the bracket or close with a current quote; after closure, record a review.

**Limits / prerequisites:** Close needs a fresh quote and matching version; pending cannot be manually exited by closePaperTrade. Auto-management requires fresh observations. No claim of background scheduling, on-device behavior, multi-leg orders or order queueing. [P]

### 09.10. Optional automatic ORB paper entries

**Where / how:** Strategies → selected ORB → Automatic paper controls. Save/review current ORB source/gate; deliberately choose nativeNQ/ES or exact configuredNAS100TL instrument,1%/2%risk and1–3daily entries. Require positive drawdown limit and explicit canonical Arm<=24hours. Old futures consent is not remapped.

**You get:** Foreground-only source checks and precise blocked reasons, or one canonical simulated entry/SL/3RTP record per persisted signal identity.

**Next action:** Review resulting paper positions and discipline limits; turn Off to stop new checks.

**Limits / prerequisites:** Owner-only paper; foreground/visible checks, no closed-app24/7 or actual automatic fill claimed. Exact same-market source/metadata/clock/3R/discipline and shared-lock/durable dedup remain required. Off does not close existing positions or cancel an already-submitted request. [P] [D]

### 09.11. Optional automatic session paper entries

**Where / how:** Strategies → selected London/IB/PDC → Automatic paper. Save approved source/gate; choose1–2% realized-balance risk and1–3daily cap; arm<=24hours. Foreground default; closed-app permission is separate.

**You get:** Fresh source/quote checks, shared lock, durable signal/proposal/order ID, full-position source SL/TP and journal.

**Next action:** Review simulated positions or turn Off.

**Limits / prerequisites:** Paper-only; no LLM execution authority, real broker order, generic target substitution or practice fallback. Original ORB consent is not widened. [P] [D]

<a id="module-journal"></a>
## 10. Trade journal, deep dive and performance review

**Use this module:** Record the decision context before and after a paper trade, then compare the tagged review with the source version and actual paper trail.

| No. | Feature | Purpose |
|---:|---|---|
| 10.01 | Paper balance and performance summary | Answer what recorded paper balance, open exposure and paper outcomes currently show—not how a brokerage account is performing. |
| 10.02 | Optional paper daily drawdown cap | Set a paper-workflow guardrail for a maximum daily realized drawdown percentage. |
| 10.03 | Pending, open and closed trade lists/cards | Find plans and paper positions by status, inspect key trade fields, and navigate to chart or simulated close/review actions. |
| 10.04 | Trade deep dive, pre-trade journal and post-trade review | Compare the original plan/journal with the recorded outcome and capture a human post-trade note; optionally request an AI review of a closed record. |
| 10.05 | Full retained paper history and pagination | Find durable paper records beyond the current workspace list and inspect older pages. |
| 10.06 | Retained paper detail, bracket/review revisions and close | Inspect original risk and current paper state, trace record events/revisions, and optionally amend paper bracket/review or exit a paper position. |

### 10.01. Paper balance and performance summary

**Where / how:** Trades. Open Trades and review the balance card and performance cells. The panel refreshes its clock every 15 seconds and requests quotes for up to 40 open-trade markets; there are no viewing controls.

**You get:** Starting paper balance plus recorded realized P/L; open P/L, open risk, mean R:R, realized P/L, UTC-day closed-trade peak drawdown, and configured paper cap. Missing/unacceptable live quote for any open trade causes aggregate open P/L/equity to display Unknown and identifies missing symbols.

**Next action:** If open P/L is Unknown, wait for usable quotes; use the closed-trade deep dives to review the sequence and recorded context.

**Limits / prerequisites:** Paper arithmetic, not broker balance; open P/L requires a live quote no more than 120 seconds old and no more than 30 seconds ahead. UTC closed-trade drawdown is distinct from live equity drawdown. [P]

### 10.02. Optional paper daily drawdown cap

**Where / how:** Trades. Enter a positive percentage through 100 and tap Save paper limit; leave blank and save to unset. The saved value is displayed in the dashboard and warns when known daily closed-trade drawdown reaches it.

**You get:** Local workspace setting and confirmation message; no broker risk setting is changed. Associated service fixture tests cover paper-order creation being blocked at a saved cap, not broker enforcement.

**Next action:** If the cap is reached, stop creating paper orders and review the loss sequence before continuing.

**Limits / prerequisites:** Accepts a finite percentage greater than 0 and at most 100; blank unsets. Applies to paper creation, never broker risk settings. Unknown chronology can withhold drawdown. [P]

### 10.03. Pending, open and closed trade lists/cards

**Where / how:** Trades. Tap Pending, Open or Closed (each shows count). Review market, side, strategy/version, date, entry, risk and R:R; closed cards also show P/L. Tap Chart order/Create paper plan to navigate to chart. Pending legacy card opens for inspection; an open card tap navigates to chart. Tap Close at live quote on an open card and confirm to record a simulated exit.

**You get:** Status-filtered local paper records and counts. Manual close uses a live quote newer than two minutes—bid for longs, ask for shorts—records source/time, and otherwise reports that no synthetic fill was created.

**Next action:** Review closed records in their deep dive; inspect open records on chart. For new work use the validated chart order flow, not a legacy pending record.

**Limits / prerequisites:** Paper only. Legacy pending fill is explicitly archival/unavailable; create a validated paper order from Chart Buy/Sell. Manual close is simulated, not a broker close, and needs a fresh quote. [P]

### 10.04. Trade deep dive, pre-trade journal and post-trade review

**Where / how:** Trades. Open a pending/closed card or a legacy trade detail. Review strategy version, entry/stop/target/exit, outcome/R and Pre-trade journal snapshot (unfilled entries say Not recorded). Enter a note and tap Save my review. For a closed trade only, tap AI review closed record.

**You get:** The note is saved to local workspace with a message that cloud sync is explicit. AI response or error is displayed; response is stored on the record as aiReview. The sheet discloses that quote simulation excludes spread, fees and slippage.

**Next action:** Write a concrete process observation anchored to the recorded plan and outcome; treat AI text as a review prompt, not an execution instruction.

**Limits / prerequisites:** AI review requires a closed record and available service. Local save is not automatic cloud sync. Neither note nor AI response verifies a fill, result, or edge. [P]

### 10.05. Full retained paper history and pagination

**Where / how:** Trades. Tap a market/side/status/date row to open retained detail. Tap Earlier trades for the next cursor page; tap Latest to return to the first page.

**You get:** Paginated durable paper logs and immutable event snapshots, explicitly not broker account history. Empty and error states are represented. The empty-state copy says chart-created orders save immediately while manual local logs archive on explicit cloud save.

**Next action:** Open a row to review original journal, events, result and revision trail.

**Limits / prerequisites:** Requires retained records and a working history service. A local-only manual log may not yet be in durable history; this is not imported or broker account history. [P]

### 10.06. Retained paper detail, bracket/review revisions and close

**Where / how:** Trades. Open a history row or Details / working bracket / review action. Wait for detail data. For non-closed trades, edit Working stop/target, optionally toggle Opt-in paper bracket management, edit review, and tap Save bracket / review revision. For open trades tap Close paper at source quote. Inspect recorded events and version trail.

**You get:** Shows original stop/risk and remaining/initial units, closed net paper P/L/original R, journal, optional generated inspection guide, events and revisions. Save creates a new immutable paper revision; close reports source-quote paper exit and no broker-position change.

**Next action:** Use the event/version trail to compare original and amended plan; keep changes as traceable paper revisions.

**Limits / prerequisites:** Needs working paper detail/edit/close services. Auto-management toggle is paper-only source-quote observation; UI says minimized/closed operation requires deployed scheduling. Do not assume scheduler is running. No broker order, multi-leg execution, or queued broker order is implemented by these controls. [P]

<a id="module-discipline"></a>
## 11. Trading foundations and revenge-trading safeguards

**Use this module:** Read the current observations and saved thresholds before a paper action. The panel supports process review; it does not diagnose intent or replace a risk plan.

| No. | Feature | Purpose |
|---:|---|---|
| 11.01 | Trading foundations lessons and coach handoff | Short process-first education for risk planning, triggers versus confluence, costs, uncertainty, post-loss behavior, and honest review—problems that can lead to impulsive or poorly evidenced trading. |
| 11.02 | Discipline check / revenge-trading safeguards | Help a trader notice recorded patterns that may warrant slowing down—recent realized losses, a loss streak, high daily closed-trade count, or unusually elevated proposed risk—without diagnosing intent or recommending a trade. |
| 11.03 | Optional personal post-loss pause | Give the owner an operational boundary stronger than an advisory: after a canonical realized paper loss, the paper server can reject a new paper order while the configured pause window is active. |
| 11.04 | Learning review from paper records | Let a trader inspect descriptive outcomes across confluence-score buckets and see whether enough closed outcomes and point-in-time entry snapshots exist for a human review. |

### 11.01. Trading foundations lessons and coach handoff

**Where / how:** Library / paper ticket → learning and discipline. Expand Learn trading, choose a lesson, read its reflection, then Ask my AI coach. The sheet closes and the correct reflection is prefilled in Coach.

**You get:** Static lesson and reflection text covering risk/invalidation, independent evidence, costs/slippage, forming versus completed bars, loss-chasing behaviors, and review discipline. The coach handoff is a prompt, not an execution request.

**Next action:** Write down the invalidation, maximum planned loss, falsifying evidence, or process rule to review; use the coach for reflection rather than trade approval.

**Limits / prerequisites:** Not financial advice, profitability evidence, execution approval, or assurance of a maximum loss. Instrument point value and execution costs still need verification.

### 11.02. Discipline check / revenge-trading safeguards

**Where / how:** Library / paper ticket → learning and discipline. Open the paper-plan sheet. Read the verdict and UTC closed-record counts. In compact mode tap Show coaching evidence (n) to inspect flags/evidence/next steps or Hide coaching evidence (n) to collapse. Tap checklist rows to mark local reflection prompts, and tap Reflect with coach for a general reflection prompt.

**You get:** Record-based loss/pause, streak, trade-frequency and size-escalation observations with unknown evidence explicit. Defaults are 20 minutes and six closed trades per UTC day only when no saved override exists.

**Next action:** Review the evidence and data quality; state the setup, invalidation, and planned loss in neutral terms, then decide whether waiting is wiser. Complete canonical record fields when output is unknown instead of treating missing data as an all-clear.

**Limits / prerequisites:** Uses the saved cooldown and daily-trade thresholds. Loading/unavailable history is explicitly labelled rather than an all-clear. This is process coaching, not intent diagnosis or trade permission.

### 11.03. Optional personal post-loss pause

**Where / how:** Library / paper ticket → learning and discipline. Open the paper-plan sheet, tap Advanced, toggle Personal post-loss pause on or off, and wait for the save result. A success message confirms the cloud setting was saved; a failure message says the displayed permission is unchanged. If a paper order is later rejected, read the server's cooldown-until message.

**You get:** Saves enforceCooldown and retains cooldownMinutes (fallback 20) and maxTradesPerDay (fallback 6). At paper-order creation, server logic checks up to 100 closed records and returns PRECONDITION_FAILED if the evaluated cooldownUntil is still in the future. This is a paper-service rejection, not a brokerage action.

**Next action:** Confirm save success; during a pause, step away and revisit the written setup/risk after it expires. If save fails, resolve cloud/account/save status and do not assume enforcement changed.

**Limits / prerequisites:** Requires authorized owner cloud save and a canonical closed loss within the server's fetched history. This control has no duration editor; it keeps an existing workspace duration or defaults to 20 minutes. maxTradesPerDay is passed to evaluation, but server rejection is based only on cooldownUntil—not daily count, loss streak, or elevated risk. Does not alter broker permissions or guarantee prevention of every rapid-trading behavior.

### 11.04. Learning review from paper records

**Where / how:** Library / paper ticket → learning and discipline. Tap Learning review · your actual paper records to start the on-demand query. Wait for canonical records to load; if it errors, read the displayed error. Review eligible outcomes, entry-feature and confluence-snapshot counts, then the four fixed score buckets and up to four human-review-only proposals. Tap again to hide the review.

**You get:** PAPER DATA · DESCRIPTIVE ONLY label; eligible closed outcome and snapshot coverage counts; each 0–24, 25–49, 50–74, 75–100 score bucket's count and descriptive win rate/observed expectancy R where available; up to four human-rule proposal titles, basis and suggested review action; scope text. Server analyzes canonical closed paper records, bounded to 2,000; more history makes the scope explicitly incomplete.

**Next action:** Check snapshot coverage and records, document a hypothesis, and reserve untouched future data for later validation. Treat proposals as human review prompts; do not promote a rule from a favorable bucket alone.

**Limits / prerequisites:** Groups under 100 observations are insufficient-data; groups at or above 100 remain unconfirmed, not validated. Present-versus-absent comparisons need sufficient samples in both groups. Missing legacy snapshots are not backfilled and are counted as missing, not absent conditions. No live brokerage fills, execution evidence, causal inference, success probability, or execution signal is established.

<a id="module-alerts"></a>
## 12. Trade/confluence/scenario alerts and delivery

**Use this module:** Define one named condition with its market, strategy/version and delivery scope, then review its saved status and last known evidence. Closed-app delivery has separate deployment requirements.

| No. | Feature | Purpose |
|---:|---|---|
| 12.01 | Create a rule and choose scope | Define which market, timeframe, strategy, and kind of signal should be watched. |
| 12.02 | Price above / below | Answer whether a live quote has reached or crossed a chosen level. |
| 12.03 | FVG event | Watch for a recent deterministic fair-value-gap candidate in candle history. |
| 12.04 | Ready setup alert | Ask whether current analysis contains at least one ready setup candidate. |
| 12.05 | Scenario shape update | Notify when a historical-source scenario appears, disappears, changes side, or materially changes normalized path shape. |
| 12.06 | Historical scenario direction flip | Ask whether the drawn historical line/ghost endpoint reversed up/down relative to its anchor. |
| 12.07 | Weighted confluence alert | Ask whether an approved named trigger fired on sourced closed-bar evidence and enough weighted conditions met an alert threshold. |
| 12.08 | Below-entry-gate warning | Warn when an approved sourced trigger fires while weighted score is below the configured entry gate. |
| 12.09 | Enable or remove a rule | Manage whether a configured alert remains watched. |
| 12.10 | Save rules to cloud | Persist owner workspace as the canonical server-side rule set. |
| 12.11 | Test foreground scan | Check what currently saved cloud rules produce in one bounded scan. |
| 12.12 | Automatic foreground scan | Poll server-side saved rules while the app is active. |
| 12.13 | Mobile push enrollment and schedule activation | Enroll an iOS/Android device and schedule scans while the app is closed. |
| 12.14 | Alert history and open event | Review events actually emitted and return to their market context. |
| 12.15 | Published session monitoring and setup alerts | Monitor enabled source watches from the private published backend and expose actual callback/device states. |

### 12.01. Create a rule and choose scope

**Where / how:** Alerts. Tap New rule, optionally name it, choose a condition, search and select a market, select one non-archived strategy, choose a timeframe, then tap Save local alert rule. Save rules to cloud separately before expecting server scans to use it.

**You get:** A locally stored enabled rule; default cooldown is 30 minutes, except scenario-direction at 1 minute. New-rule UI selects one strategy; it does not offer multi-strategy selection.

**Next action:** Tap Save rules to cloud, then use Test foreground scan or leave the app active for polling.

**Limits / prerequisites:** Owner workspace is paper-only. Market/feed availability and a valid chosen strategy are needed. This capability places no orders and does not implement multi-leg or queued orders.

### 12.02. Price above / below

**Where / how:** Alerts. Choose ABOVE or BELOW, enter a finite positive threshold, set scope, save locally, cloud-save, and scan.

**You get:** An event when quote.price is at/above the threshold for ABOVE or at/below for BELOW; event records quote price, source/time basis, rule, and strategy version.

**Next action:** Review the event and tap its history card to open the market/timeframe chart context.

**Limits / prerequisites:** Stale/unavailable quotes do not trigger. The threshold field names the selected alert market. A price event is not probability or an order.

### 12.03. FVG event

**Where / how:** Alerts. Choose FVG event, market, strategy, and timeframe; save locally and to cloud; scan.

**You get:** If closed candles contain a gap candidate ending within the last two candle positions, an event includes gap side, bounds, CE midpoint, and bars.

**Next action:** Review source and candidate on the chart; independently confirm before any paper decision.

**Limits / prerequisites:** Requires usable candle history and a qualifying recent candidate. Fetch failure or no candidate produces no event; candidate requires confirmation and is not a proven edge or order.

### 12.04. Ready setup alert

**Where / how:** Alerts. Choose SETUP and scope, save locally and to cloud, then scan.

**You get:** An event when setupAnalysis returns a ready candidate, with aligned supported conditions and captured analysis/source evidence. Candidate identity is used to avoid repeated identical setup events.

**Next action:** Open the event’s chart context and review the captured evidence and source.

**Limits / prerequisites:** No ready candidate or unavailable analysis means no event. Ready is not validated profitability, calibrated success probability, or execution permission.

### 12.05. Scenario shape update

**Where / how:** Alerts. Choose the condition and scope, save locally and to cloud, then scan.

**You get:** A historical scenario changed event; the initial scenario can qualify when no previous setup exists. Later comparisons use presence, side, or normalized close-path distance.

**Next action:** Review the captured scenario and its source against current chart context.

**Limits / prerequisites:** Requires scenario/history data; no meaningful change means no event. This is not the same as a direction flip and says nothing about forecast accuracy.

### 12.06. Historical scenario direction flip

**Where / how:** Alerts. Choose the condition and scope, save locally and to cloud, then run a scan or wait for one. First successful observation establishes a baseline, not an alert.

**You get:** On reversal, an event captures previous → current direction, scenario/source context, and chart data. Comparison uses a 1-basis-point flat deadband; brief reversals are coalesced by the one-minute cooldown.

**Next action:** Tap the event and inspect its captured line/ghost source; treat it as replay change for review, not a price prediction.

**Limits / prerequisites:** Missing/flat history does not fabricate a flip. Source/version/context changes reseed; broker market rotation can add latency. The first scan is baseline-only.

### 12.07. Weighted confluence alert

**Where / how:** Alerts. First configure/review/approve a valid confluence contract on the chosen strategy. Then choose CONFLUENCE, set alert points (screen default 70, range 0–100) and met-condition count (default 2, integer 1–100), choose one strategy/market/timeframe, save locally and to cloud, and scan.

**You get:** A deterministic weighted score, met/total count, comparison to alert threshold and entry gate, and checklist evidence. Fires only with valid non-null score, approved config, met named trigger, no active pending source, score at least the alert threshold, enough enabled conditions met, and at least one met condition.

**Next action:** Inspect the captured decision/checklist and chart, address pending or unmet conditions, and evaluate performance separately with controlled validation.

**Limits / prerequisites:** Requires a valid contract bound to the exact strategy/version, approved status, enabled weights summing to 100, supported native closed-OHLC trigger/condition bindings, fresh same-timeframe closed bars, and a unique current same-version candidate. The score is points, not probability; no signal can reflect missing/stale/ambiguous evidence. No statistical edge or order is implied.

### 12.08. Below-entry-gate warning

**Where / how:** Alerts. Approve a sourced confluence strategy first; choose BELOW-GATE and market/strategy/timeframe, save locally and to cloud, then scan. This uses the approved strategy entry threshold—not independent alert points/count controls.

**You get:** A Trigger below entry gate event when prerequisites pass and gateMet is false; message reports score against the entry gate.

**Next action:** Review why the gate is unmet; do not interpret this as entry permission.

**Limits / prerequisites:** Requires approved, sourced trigger and usable nonpending evidence. It warns when entry gate is not met; it never grants entry or places an order.

### 12.09. Enable or remove a rule

**Where / how:** Alerts. Tap Enable rule to toggle ON/OFF or Remove rule to delete it, then tap Save rules to cloud to apply the change to canonical server scans.

**You get:** Rule card shows name, market, timeframe, condition/threshold, cooldown, and ON/OFF state.

**Next action:** Cloud-save changes, then scan or leave the app active.

**Limits / prerequisites:** Local edits alone do not update the server’s canonical cloud workspace; cloud-save failure leaves local data unchanged and unapplied to server scans.

### 12.10. Save rules to cloud

**Where / how:** Alerts. After adding, toggling, or removing rules, tap Save rules to cloud and wait for the status message. Manual scan also attempts this first and aborts if save fails.

**You get:** Success/failure message; success persists the workspace through the owner-protected save endpoint.

**Next action:** After success, test a scan or wait for foreground polling; continue mobile setup only if closed-app alerts are needed.

**Limits / prerequisites:** Local rule save is separate. Preview/source publication alone is not a deployed schedule.

### 12.11. Test foreground scan

**Where / how:** Alerts. Tap Test foreground scan; it saves first and reports failure without scanning if the save fails.

**You get:** Returned events merge into history and a message reports scan status, deferred broker markets/timeouts/unavailable rules, and push prerequisites. Server scan has a 45-second deadline and a 12-information-request broker budget including bootstrap reserve.

**Next action:** Review history; resolve source/configuration problems or wait for later rotated scans when markets were deferred.

**Limits / prerequisites:** No signal may mean no trigger, insufficient/stale data, invalid confluence setup, budget deferral, or deadline. Same-market broker reads can be reused, excess markets rotate. It is not a closed-app guarantee.

### 12.12. Automatic foreground scan

**Where / how:** Alerts. No separate button: with at least one local rule enabled, keep the app active; it scans on activation/resume and about every 60 seconds. Tap the displayed error banner to dismiss it.

**You get:** Calls scan mutation, merges returned events, and shows a dismissible error on failure.

**Next action:** Ensure rules are cloud-saved and resolve any error; use manual scan for an immediate deliberate check.

**Limits / prerequisites:** It is not a closed-app scheduler. Server scans read cloud rules, so locally enabled but unsaved rules are not canonical scan inputs.

### 12.13. Mobile push enrollment and schedule activation

**Where / how:** Alerts. Deploy backend handler; install a genuine iOS/Android development or release build with Expo project ID and APNs/FCM credentials; sign in as approved owner; grant OS permission; tap Enable mobile push; cloud-save rules; tap Activate deployed scans; verify a real trigger and device delivery.

**You get:** Device token enrollment and a once-per-minute owner-bound deployed schedule. Push tap fetches the owner-stored event and opens captured chart scope. Android channel is configured; notification sound and badge are disabled.

**Next action:** Verify a real trigger on the installed device; check OS permission, feed, schedule, and delivery if none arrives.

**Limits / prerequisites:** Web/Safari Preview and Expo Go are explicitly unsupported. Requires deployed backend, genuine native build, project/push credentials, permission, registered token, cloud rules, schedule, feed and OS/provider availability. Direction first scan only seeds baseline.

### 12.14. Alert history and open event

**Where / how:** Alerts. Tap a history card to set its market/timeframe, select captured strategy if still present, mark it read, and navigate to chart context.

**You get:** Cards show title/body, market, timeframe, and source; unread cards are highlighted. Empty history says it remains empty until a rule genuinely triggers.

**Next action:** Inspect captured chart/source evidence and decide independently what paper review is appropriate.

**Limits / prerequisites:** The list does not display every event field, including full evidence or delivery lifecycle. Empty history does not establish that a strategy has no edge; it may reflect no trigger or unmet data/scan prerequisites.

### 12.15. Published session monitoring and setup alerts

**Where / how:** Strategies → Watch this strategy; Alerts → Background strategy monitoring. Publish current handler; activate monitoring; verify completed mapped callback; register native device. Then separately arm Also when closed if wanted.

**You get:** Owner/taskUID mapping, deduplicated events, heartbeat/registration and bounded sampled scanning.

**Next action:** Receive a real device alert before claiming native delivery.

**Limits / prerequisites:** No development schedule created; publication/registration is not callback or push proof. Polling/rotation can miss fast moves; actual native build/permissions/device proof remain needed.

<a id="module-pairs"></a>
## 13. Quant pairs relative-value model

**Use this module:** Load a documented pair and inspect the relationship, diagnostic and costs together. A calculation result is research output that still needs qualification.

| No. | Feature | Purpose |
|---:|---|---|
| 13.01 | Two-asset and timeframe selection / source-quality gate | Answer whether two explicit price series have enough trustworthy, same-time observations for a pair calculation; the model does not discover assets or build a basket. |
| 13.02 | Pairs parameters / assumptions | Let the trader specify spread entry/exit thresholds, fit window, holding duration, generic costs, research equity scale, and left-leg quantity scale for the calculation and replay. |
| 13.03 | Rolling OLS spread and hedge diagnostics | Answer how far the latest matched-bar residual is from its recent fitted relationship and whether the estimated hedge ratio is changing between adjacent windows. |
| 13.04 | Engle–Granger residual-ADF diagnostic and rolling warning | Assess the specific null of no [cointegration](#glossary-cointegration) for the current price window and show whether a prior equal-size rejection is lost in the current window. |
| 13.05 | Lagged two-leg exploratory replay and equity path | Show a cost-assumption-based historical out-of-sample calculation of what the rules would have done after a training segment, rather than an executable or validated strategy. |
| 13.06 | Current two-leg candidate signals and paper-plan output | Expose a research-only candidate when a closed-bar spread threshold, current cointegration rejection, and no flagged loss-of-rejection all align; preserve the paired nature rather than suggesting a standalone leg. |

### 13.01. Two-asset and timeframe selection / source-quality gate

**Where / how:** Strategies → Quant Lab → Pairs. Open the family, Load real-data starter and Run model; use Edit model / markets / settings for changes. In the workbench, if exposed, select exactly two distinct symbols and the same supported timeframe; provide each series with OHLCV candles, source/provenance, fetchedAt, and current now. Recalculate. Inspect source labels, valid closed bars, synchronized bars, and limitations before interpreting later outputs.

**You get:** Status/reasons; source/provenance and supplied/closed-bar counts; exact synchronized-bar count and required minimum. Requirements are at least max(100, 2 × lookback) exact-matching valid closed bars. Candles use Unix seconds; now/fetchedAt use Unix milliseconds.

**Next action:** If insufficient, provide more overlapping closed history at the same timeframe. If unavailable, correct the pair, timeframe, timestamps, or settings. Review exclusions and source provenance; no missing bars are fetched or filled by this model.

**Limits / prerequisites:** Exactly two assets, same supported timeframe; latest 5,000 supplied bars per side are examined. Invalid OHLCV, unclosed/future bars, and conflicting duplicate timestamps are excluded; exact duplicates are deduplicated. Gaps are retained, not filled. No basket selection or data fetching. [Q]

### 13.02. Pairs parameters / assumptions

**Where / how:** Strategies → Quant Lab → Pairs. Open Edit model / markets / settings. Pair lookback is 30–400, entryZ greater than exitZ≥0, holding 1–100, positive equity/order size and nonnegative costs. The real-data starter uses 60/2/0.5/5/100,000 with 0 bps costs.

**You get:** Invalid values return unavailable with reasons. Accepted parameters drive OLS window, entry/exit behavior, replay holding horizon, generic two-leg modeled costs, initial equity and candidate quantities.

**Next action:** Choose predeclared parameters and defensible costs; rerun sensitivity checks. Zero costs means excluded assumptions, not free execution.

**Limits / prerequisites:** Generic bps costs are user assumptions, not live venue charges. Inventory/maxInventory do not affect pairs; formal cointegration needs at least 30 observations and is not win probability. [Q]

### 13.03. Rolling OLS spread and hedge diagnostics

**Where / how:** Strategies → Quant Lab → Pairs. Open the family, Load real-data starter and Run model; use Edit model / markets / settings for changes. After a ready run, inspect the OLS hedge ratio, latest residual spread, rolling z-score and residual standard deviation. Compare previous-window hedge ratio, hedge-ratio drift/stability, and residual lag-one autocorrelation; do not treat the 25% stability label as a statistical test.

**You get:** Hedge ratio beta for left = intercept + beta × right; latest residual and z-score; in-window residual standard deviation; lag-one residual autocorrelation; previous beta, drift and heuristic stability label.

**Next action:** Use z-score as a relative-value diagnostic alongside data quality and the separate cointegration result. If fit or beta is unavailable, resolve insufficient/degenerate input rather than inventing a hedge ratio.

**Limits / prerequisites:** Lag-one autocorrelation is descriptive, not a unit-root/cointegration test. Stability uses a simple 25% drift heuristic. Matched bars, not elapsed time, define windows when gaps exist. [Q]

### 13.04. Engle–Granger residual-ADF diagnostic and rolling warning

**Where / how:** Strategies → Quant Lab → Pairs. Open the family, Load real-data starter and Run model; use Edit model / markets / settings for changes. Run pairs with a valid lookback and enough exact aligned closed history; inspect diagnostic status, residual [ADF](#glossary-adf) t-statistic, MacKinnon p-value, decision, 5% critical value, and prior/current comparison. Read the p-value label and limitations before using the result.

**You get:** Present-window status, ADF statistic, approximate p-value, selected reject/fail-to-reject decision, 1/5/10% critical values internally (the pairs metrics surface 5%), plus prior-window comparison status and possible-break warning when prior rejection is lost.

**Next action:** Treat rejection only as a research screen under the model's assumptions; investigate data, stability, and validation separately. A fail-to-reject or unavailable result means the pair-signal gate is not met, not that the relationship is proven absent.

**Limits / prerequisites:** Null is no cointegration conditional on both series being I(1); integration order is not tested. P-value is not win probability. No multiple-testing correction; gap and structural-break limitations remain. Pair form/model now both require at least 30 lookback bars. [Q]

### 13.05. Lagged two-leg exploratory replay and equity path

**Where / how:** Strategies → Quant Lab → Pairs. Open the family, Load real-data starter and Run model; use Edit model / markets / settings for changes. On a ready result, inspect [OOS](#glossary-oos) boundary, train/test samples, modeled two-leg costs, supplied fee/slippage, equity series, and validation reasons. Compare runs with realistic alternative cost assumptions and inspect whether positions resolve within observed data.

**You get:** Exploratory equity values starting flat at the OOS boundary, modeled two-leg costs, OOS boundary, train/test counts, and count of resolved non-overlapping OOS pair outcomes. Decisions use only the decision bar and prior bars and are lagged to the next observed close.

**Next action:** Use as a sensitivity/research diagnostic only. Improve cost and market assumptions and seek independent out-of-sample validation before considering any operational action.

**Limits / prerequisites:** Costs are generic user-supplied bps, not exchange/broker/NBBO/L2 estimates. At least 100 resolved outcomes are cited as needed before any performance verdict, but this function does not validate a strategy. No newest untouched holdout, borrow/funding/FX/delisting/survivorship treatment, or forced close of an open pair without a later observed bar. [Q]

### 13.06. Current two-leg candidate signals and paper-plan output

**Where / how:** Strategies → Quant Lab → Pairs. Open the family, Load real-data starter and Run model; use Edit model / markets / settings for changes. After a ready calculation, check whether two signal records exist and inspect both directions, shared timestamp, strength and reason. If paperPlan exists, review both legs, quantities, and reference closes together. Do not submit an isolated leg based on this output.

**You get:** Either no signals or two records: positive z maps to short left/long right; negative z to long left/short right, with right quantity scaled by beta. Optional paperPlan has exactly two legs with symbol, side, quantity, and last observed reference close. Strength is capped at 1 and based on absolute z relative to entryZ.

**Next action:** A no-signal result calls for checking z-score, cointegration decision/comparison, data and limits—not treating it as a failure. A candidate can be reviewed as a pair for research/paper discussion only; this module offers no order action.

**Limits / prerequisites:** No brokerage or exchange execution, order queue, multi-leg atomic submission, live position tracking, fill verification, or single-leg substitute. A ready result can legitimately have no signal. Historical closes do not prove simultaneous executable prices, fills, spreads, borrow, or funding. [Q]

<a id="module-momentum"></a>
## 14. Quant selected-universe momentum model

**Use this module:** Choose the stated universe and lookback, run the documented calculation, then inspect ranks, turnover and the exact source window before comparing results.

| No. | Feature | Purpose |
|---:|---|---|
| 14.01 | Fixed-universe data input | Compare a small, fixed set of assets on the same bar horizon; answer which supplied assets lead or lag without inventing missing prices. |
| 14.02 | Momentum lookback parameter | Set the trailing bar horizon for momentum and realized-volatility calculations. |
| 14.03 | Holding/rebalance cadence | Set how often the hypothetical target weights are recalculated, addressing rebalance frequency and turnover. |
| 14.04 | Starting equity and fee/slippage assumptions | Estimate a hypothetical equity path using an explicit capital base and user-supplied turnover costs. |
| 14.05 | Latest ranks and signals | Answer which supplied assets are strongest/weakest under the rule and which have a nonzero hypothetical long/short target. |
| 14.06 | Exploratory portfolio/equity output | Answer what the simplified rule's historical close-to-close path and turnover costs calculate to on the supplied data. |
| 14.07 | Paper allocation preview | Show approximate quantities corresponding to the latest selected target weights and hypothetical ending equity. |
| 14.08 | Validation/status/limitations diagnostics | Clarify whether an output is merely calculable or empirically validated, and identify prerequisites for stronger claims. |

### 14.01. Fixed-universe data input

**Where / how:** Strategies → Quant Lab → Momentum. Open the family, Load real-data starter and Run model; use Edit model / markets / settings for changes. Supply 2–8 distinct symbols, each with source, provider/user-import provenance, the same supported timeframe, positive fetchedAt in milliseconds, and timestamped positive closes; set now in Unix milliseconds. Use closed bars.

**You get:** Uses exactly the supplied universe; outputs asset/timeframe, source/provenance counts, accepted bars and counts of excluded invalid, duplicate, and future/open bars. Uses exact shared timestamps only.

**Next action:** Check symbol membership and timestamp/source quality; fix malformed inputs and missing common timestamps before interpreting ranks.

**Limits / prerequisites:** At most 5,000 most-recent supplied entries per asset are inspected. No interpolation, forward-fill, point-in-time membership, delisting/survivorship correction, corporate-action verification, or total-return verification is implemented. [Q]

### 14.02. Momentum lookback parameter

**Where / how:** Strategies → Quant Lab → Momentum. In Edit settings choose an integer lookback 10–252, and enough closed source bars beyond that window. Default is 60. Pure-runner smaller windows are not an app control.

**You get:** Trailing momentum is current close divided by close lookback bars earlier minus one; volatility is population standard deviation of trailing log returns. Lookback also affects signal-strength scaling.

**Next action:** Use a predeclared horizon and compare alternatives only with chronological training and untouched holdout data.

**Limits / prerequisites:** Bar-based rather than calendar-normalized; irregular timestamps are reported. No edge is inferred from choosing a lookback. [Q]

### 14.03. Holding/rebalance cadence

**Where / how:** Strategies → Quant Lab → Momentum. In Edit settings choose an integer holding/rebalance cadence 1–100 common bars. Default 5. This does not schedule or submit an order.

**You get:** Changes scheduled rebalance points, turnover costs, actionable-rebalance count, and completed costed interval count.

**Next action:** Evaluate cadence only with non-overlapping outcomes and documented execution-cost assumptions.

**Limits / prerequisites:** Cadence is a count of shared bars, not elapsed calendar time. It does not schedule or submit orders. [Q]

### 14.04. Starting equity and fee/slippage assumptions

**Where / how:** Strategies → Quant Lab → Momentum. Open the family, Load real-data starter and Run model; use Edit model / markets / settings for changes. Set positive finite starting equity and finite nonnegative fee/slippage bps (the code does not require integer bps). Supply defensible assumptions; the runner adds the two rates.

**You get:** Exploratory final equity, net return, max drawdown, and supplied combined fee+slippage bps. Cost is applied to absolute target-weight turnover.

**Next action:** Replace generic costs with researched instrument/venue assumptions before paper evaluation; obtain execution-quality data for stronger analysis.

**Limits / prerequisites:** Only supplied fee/slippage is charged. Borrow, financing, tax, margin, liquidity, impact and fills are excluded; values are not validated performance evidence. [Q]

### 14.05. Latest ranks and signals

**Where / how:** Strategies → Quant Lab → Momentum. Open the family, Load real-data starter and Run model; use Edit model / markets / settings for changes. After a calculation, check each signal's as-of time, rank, direction, reason, and strength against its inputs. Treat `flat` as no latest selected target, not a recommendation.

**You get:** One latest-snapshot signal per asset: long, short, or flat; reason gives rank, trailing momentum and selection/weight. Strength is capped at 1 and volatility-scaled.

**Next action:** Verify the timestamp and source bars; use non-flat output only as a paper hypothesis pending independent validation.

**Limits / prerequisites:** Selects positive top-quintile and negative bottom-quintile candidates, inverse-volatility weights them, and sorts ties by symbol. A signal is not an investment recommendation or trade instruction. [Q]

### 14.06. Exploratory portfolio/equity output

**Where / how:** Strategies → Quant Lab → Momentum. Open the family, Load real-data starter and Run model; use Edit model / markets / settings for changes. Review status and data-quality fields first, then actionable rebalances, completed intervals, leader, final equity, return, drawdown, and equity points.

**You get:** A simplified close-to-close hypothetical equity series and metrics; supplied fee/slippage is charged at weight changes.

**Next action:** Treat as arithmetic only; test walk-forward and untouched holdout performance with realistic execution assumptions before drawing conclusions.

**Limits / prerequisites:** No fill, market-impact, borrow, financing, tax, margin, liquidity or liquidation model. The path may halt at zero; it does not demonstrate an edge. [Q]

### 14.07. Paper allocation preview

**Where / how:** Strategies → Quant Lab → Momentum. Open the family, Load real-data starter and Run model; use Edit model / markets / settings for changes. If present, inspect each symbol, side, reference close and quantity as a manual paper-review reference; check shortability and sizing separately.

**You get:** Optional paper-only allocation legs; quantity equals absolute weight times final equity divided by reference close.

**Next action:** Use only in a manual paper workflow after checking constraints and inputs; do not treat as a broker ticket.

**Limits / prerequisites:** No brokerage action, queued orders, fills, or multi-leg order execution is implemented by this calculation. [Q]

### 14.08. Validation/status/limitations diagnostics

**Where / how:** Strategies → Quant Lab → Momentum. Open the family, Load real-data starter and Run model; use Edit model / markets / settings for changes. Read status, validation reasons, sample count and limitations before using numeric outputs. For validation, obtain point-in-time membership/delisting/corporate-action data, at least 100 actual non-overlapping outcomes, walk-forward evaluation, sealed untouched holdout and execution-quality data.

**You get:** Ready/insufficient-data/unavailable status; validation is always unconfirmed in this implementation, with zero train/test samples and false walk-forward/holdout flags. Reasons explain missing prerequisites.

**Next action:** Collect the listed data and conduct independent chronological walk-forward and untouched-holdout validation; calculation success alone is not enough.

**Limits / prerequisites:** Unit fixtures use synthetic data expressly for arithmetic tests, not performance evidence; test passes are not device proof or a statistical edge. Entry/exit Z, inventory, order size and max inventory appear in the test input shape but are not consumed by this momentum runner. [Q]

<a id="module-making"></a>
## 15. Quant venue quote and inventory model

**Use this module:** Read the received venue book, cost assumptions and inventory settings together. The model produces research references from that book; it does not place or simulate queue fills.

| No. | Feature | Purpose |
|---:|---|---|
| 15.01 | Venue L2 snapshot | Answer whether there is usable single-venue depth and identify the current top levels plus the venue's price/size increments. |
| 15.02 | Fee and slippage assumptions / cost gate | Answer whether the displayed spread exceeds estimated two-sided fee and slippage costs. |
| 15.03 | Inventory-aware quote center and size controls | Answer how the supplied signed inventory should shift the quote center and how much size is available on each side under a cap. |
| 15.04 | Top-five depth metrics and passive paper quote targets | Answer what passive tick-grid bid/ask prices this simple rule would write down from the supplied snapshot. |
| 15.05 | Current-book-only scope — no candle backtest | Make clear why this venue-quote model uses an actual book, not a candle history or OHLC import. |
| 15.06 | Validation and no-plan/insufficient status | Answer whether the result is merely calculable or whether performance has actually been validated. |

### 15.01. Venue L2 snapshot

**Where / how:** Strategies → Quant Lab → Market making. Open the family, Load real-data starter and Run model; use Edit model / markets / settings for changes. In Quant Lab choose Market making, select a Coinbase-supported crypto product, request/load venue depth, check the returned symbol, source, delivery status, and age, then calculate using that book.

**You get:** A book with source label, `polled` or `streamed` status, receipt timestamp, bid/ask levels (up to 50 each), and product tick/lot increments. Streamed WebSocket is attempted first, with public REST fallback. It is single-venue depth, not consolidated NBBO.

**Next action:** If unsupported, empty, crossed, or stale, select a supported Coinbase crypto product or stop; do not substitute OHLC/midpoint data.

**Limits / prerequisites:** TradeLocker `TL:` and other non-Coinbase instruments are rejected. A usable uncrossed bid and ask book with valid actual tick/lot metadata is required.

### 15.02. Fee and slippage assumptions / cost gate

**Where / how:** Strategies → Quant Lab → Market making. Open the family, Load real-data starter and Run model; use Edit model / markets / settings for changes. Enter finite, non-negative `feeBps` and `slippageBps` assumptions in basis points, then calculate. Defaults are both zero, so replace those with credible assumptions before interpretation.

**You get:** Metrics for each supplied cost and a two-sided allowance of 2 × (feeBps + slippageBps). If spread bps is less than or equal to this allowance, result status is `ready` but there is no `paperPlan`; the result is flat with an explanation that costs consume the spread.

**Next action:** Use defensible product-specific cost assumptions. A no-plan cost-gate result is not a profitable trade or an instruction to loosen assumptions.

**Limits / prerequisites:** The calculation has no fee lookup, rebate model, latency cost estimate, or transaction execution. [Q]

### 15.03. Inventory-aware quote center and size controls

**Where / how:** Strategies → Quant Lab → Market making. Open the family, Load real-data starter and Run model; use Edit model / markets / settings for changes. Supply current signed `inventory`, positive `orderSize`, and positive `maxInventory` in units matching the book's base-asset quantity; recalculate. Defaults are inventory 0, order size 0.01, cap 0.1. Verify the position yourself; the module does not sync an account.

**You get:** A ratio clamped to −1…+1 shifts the quote center away from the inventory direction by up to a quarter spread. Bid capacity is max(0, cap − inventory); ask capacity is max(0, cap + inventory); quantities are capped by order size and rounded down to venue lots. Only sides with a positive full-lot quantity can appear in the plan.

**Next action:** Compare the assumed position with the real position outside the tool. If no side has one full lot of capacity, correct only erroneous inputs or accept that no quote is proposed.

**Limits / prerequisites:** Inventory and cap units must be consistent with the venue product. This is not account reconciliation or live exposure enforcement. [Q]

### 15.04. Top-five depth metrics and passive paper quote targets

**Where / how:** Strategies → Quant Lab → Market making. Open the family, Load real-data starter and Run model; use Edit model / markets / settings for changes. Provide a valid book, settings, positive-millisecond `now`, and `series` array (it may be empty); run family `making`; read the summary, metrics, validation, then check whether `paperPlan` exists.

**You get:** Best bid/ask, midpoint, spread and spread bps, up-to-five-level bid/ask depth and imbalance, adjusted center, and optionally `paperPlan.legs` containing symbol, long/short side, reference price, and quantity. Prices are tick-rounded; sizes are lot-rounded. `equity` remains empty. The signal is descriptive and flat, not directional alpha.

**Next action:** Use any legs only as paper worksheet targets for manual review. This module does not place, queue, refresh, cancel, or monitor orders; it does not simulate fills or returns.

**Limits / prerequisites:** Uses only supplied current L2 and top-five depth; no queue priority, partial-fill, cancellation, persistence, adverse-selection, PnL, or performance model. The cost gate and valid tick/lot/capacity checks must pass. [Q]

### 15.05. Current-book-only scope — no candle backtest

**Where / how:** Strategies → Quant Lab → Market making. Choose one supported Coinbase product and run. History/timeframe/import controls are intentionally hidden for this family; the service supplies no candle series.

**You get:** A received venue book and book/cost/inventory calculations. No making candle backtest or fill outcome is returned.

**Next action:** Use another family for OHLC research; queue/fill/adverse-selection research needs actual execution records, not reconstructed candle observations.

**Limits / prerequisites:** Internal runner candle-quality hooks are not exposed as a workbench capability. A real book still does not prove fills, queue priority or profitable quoting. [Q]

### 15.06. Validation and no-plan/insufficient status

**Where / how:** Strategies → Quant Lab → Market making. Open the family, Load real-data starter and Run model; use Edit model / markets / settings for changes. After calculation, inspect status, summary, validation reasons, data requirements, limitations, and whether a paper plan exists. Do not infer a quote from `ready` alone.

**You get:** Validation is always unconfirmed with 0 actual/train/test samples, no chronological walk-forward, and no untouched holdout. `ready` without a plan can mean the cost gate suppressed quotes; `insufficient-data` identifies a failed input/bound/book prerequisite; `unavailable` means no viable tick-grid pair or lot-compliant capacity could be emitted.

**Next action:** Fix a specifically named missing prerequisite or stop. Performance claims require at least 100 independent resolved quote outcomes with actual queue/fill/cancel/latency records, chronological walk-forward, and a one-use untouched OOS holdout.

**Limits / prerequisites:** A single snapshot cannot establish queue priority, fills, cancellations, latency, adverse selection, returns, or performance. Unit tests use explicitly synthetic fixtures and are not device/live-feed proof or statistical evidence. [Q]

<a id="module-macro"></a>
## 16. Quant systematic trend / macro

**Use this module:** Run the documented multi-asset trend calculation from its supplied price history. This module does not expose a macro release, revision-vintage or rate-differential model.

| No. | Feature | Purpose |
|---:|---|---|
| 16.01 | Asset OHLC histories and alignment | Assess slow trend direction across a small set of aligned markets using real, sourced, completed OHLC data. |
| 16.02 | Trend lookback control | Set the slow close-to-close horizon used to determine trend direction. |
| 16.03 | Inverse-volatility directional targets | Translate trend sign and relative realized volatility into long, short, or zero-weight research targets. |
| 16.04 | Historical equity and user cost inputs | Calculate how the delayed target-weight rule evolves over supplied close-to-close history after explicitly entered costs. |
| 16.05 | Metrics, provenance, and validation reporting | Show what data and assumptions were used, what the calculation produced, and whether independent evidence exists. |
| 16.06 | Macro release/vintage and rate-differential model | State the current boundary for questions about point-in-time economic releases, revisions, expectations, or policy/sovereign-rate differentials. |

### 16.01. Asset OHLC histories and alignment

**Where / how:** Strategies → Quant Lab → Multi-asset trend. Open the family, Load real-data starter and Run model; use Edit model / markets / settings for changes. Provide 2–8 distinct symbols, all on the same 1d or 1w timeframe, with non-empty source labels, provider/user-import provenance, fetchedAt in Unix milliseconds, and valid candles whose times are Unix seconds; pass finite now in Unix milliseconds. Supply up to 5,000 bars per asset and enough exact common completed timestamps. The runner excludes unfinished/future bars and omits invalid, duplicate, or non-common records without repair or filling.

**You get:** Either an insufficient-data result with reasons, or accepted aligned histories with source/provenance metadata and notes about omitted records.

**Next action:** Resolve every input reason, check source and timestamp conventions, and supply enough common bars before interpreting results.

**Limits / prerequisites:** Needs 2–8 usable assets and at least max(effective trend bars, volatility bars)+3 common completed bars. Only daily/weekly input; no resampling, gap filling, synthetic-bar repair, automatic total-return adjustment, FX conversion, or financing/roll adjustments. [Q]

### 16.02. Trend lookback control

**Where / how:** Strategies → Quant Lab → Multi-asset trend. In Edit settings choose an integer lookback 20–252. Default 60. The app does not accept arbitrary fractional settings; daily/weekly same-frame common histories are required.

**You get:** Effective trend lookback metric and a close-to-close trend for each asset at the prior completed common bar.

**Next action:** Select a horizon appropriate to the bar frequency and ensure histories meet the resulting common-bar requirement.

**Limits / prerequisites:** Lookback is observed common bars, not calendar time. No parameter optimization or claim of optimality. [Q]

### 16.03. Inverse-volatility directional targets

**Where / how:** Strategies → Quant Lab → Multi-asset trend. Open the family, Load real-data starter and Run model; use Edit model / markets / settings for changes. No separate control. For each period, trend and volatility use the prior completed common bar. The volatility window is clamp(floor(effective lookback/3), 10, 63); the runner calculates population standard deviation of observed close-to-close returns and inverse-volatility weights, normalized by gross absolute exposure.

**You get:** Per-asset timestamp, long/short/flat direction, capped strength score, and explanatory reason. Zero trend or effectively zero volatility receives zero weight rather than an invented volatility floor.

**Next action:** Inspect targets as research outputs against underlying data and independent validation; do not submit them as orders. Treat flat as zero assigned weight, not an order instruction.

**Limits / prerequisites:** No annualization across irregular intervals, execution/fill model, leverage/margin, liquidity, short availability, borrow, carry, or financing. Latest signals are next-bar targets and excluded from historical equity. [Q]

### 16.04. Historical equity and user cost inputs

**Where / how:** Strategies → Quant Lab → Multi-asset trend. Open the family, Load real-data starter and Run model; use Edit model / markets / settings for changes. Supply positive finite startingEquity and feeBps and slippageBps each between 0 and 1,000. Zero is permitted. The runner deducts user costs using target-weight turnover, then applies weighted close-to-close period returns.

**You get:** Equity series and starting/ending equity, net historical calculation return, close-to-close maximum drawdown, one-way turnover, entered fees/slippage, and user-cost deduction.

**Next action:** Use defensible instrument/venue-specific assumptions and account separately for omitted frictions; do not treat the result as a validated backtest or performance claim.

**Limits / prerequisites:** No venue/spread/impact estimate, financing, borrow, roll, dividends, FX, tax, intrabar fills, gap execution, or margin model. Nonpositive equity is stopped at zero. [Q]

### 16.05. Metrics, provenance, and validation reporting

**Where / how:** Strategies → Quant Lab → Multi-asset trend. Open the family, Load real-data starter and Run model; use Edit model / markets / settings for changes. For a ready result, review summary, source metric, metrics, dated equity, signal reasons, validation reasons, dataRequirements, and limitations. A ready status means inputs passed calculation gates, not model validation.

**You get:** Model and timeframe, asset count, effective windows, causal observation count, equity metrics, source/provenance, and signals. Validation is always unconfirmed: train/test samples 0, walk-forward false, untouched holdout false. The code calls 100 real independent OOS observations a minimum review gate and says no such process/holdout is supplied or claimed.

**Next action:** Use results to inspect data/assumptions and plan separate independent out-of-sample validation; do not interpret 100 observations alone as proof of an edge.

**Limits / prerequisites:** Synthetic unit fixtures test algorithm behavior only; they are not device proof, real-data evidence, or statistical-edge evidence. [Q]

### 16.06. Macro release/vintage and rate-differential model

**Where / how:** Strategies → Quant Lab → Multi-asset trend. This capability exposes no macro release/vintage or rate-differential model. Do not read its OHLC trend calculation as one.

**You get:** No macro release/vintage or rate-differential result is available in the current capability.

**Next action:** Use a separately documented research process with point-in-time releases, forecast/revision vintages, availability timestamps, rate curves or carry, return conventions and matched total-return prices.

**Limits / prerequisites:** Required point-in-time macro, rate and carry inputs are not inferred from OHLC. [D]

<a id="module-ml"></a>
## 17. Quant forward-return classification model

**Use this module:** Inspect source quality, label construction, chronological splits and held-out counts before reading a classifier output. Current results are bounded research diagnostics, not predictive probabilities.

| No. | Feature | Purpose |
|---:|---|---|
| 17.01 | Historical OHLC intake and quality checks | Test one selected market/timeframe series while filtering malformed/open/future records and showing data-quality exclusions. |
| 17.02 | ML parameter settings | Control feature lookback, outcome horizon, modeled fees/slippage and optional hypothetical holdout equity starting amount. |
| 17.03 | Costed forward-return labels and bounded classifier | Evaluate whether lagged OHLC features distinguish which side has positive modeled net return over the selected observation horizon. |
| 17.04 | Chronological walk-forward and untouched-holdout diagnostics | Provide chronology-aware direction-accuracy diagnostics rather than relying only on in-sample fit. |
| 17.05 | Latest per-series research direction | Show the final fitted model's direction for the latest closed OHLC-derived feature vector per series. |
| 17.06 | Optional modeled holdout equity path | Show a hypothetical compounded path for non-overlapping model-predicted holdout outcomes using user starting equity and modeled net returns. |

### 17.01. Historical OHLC intake and quality checks

**Where / how:** Strategies → Quant Lab → Forward-return classifier. The app classifier uses exactly one selected market. Load real-data starter (BTC daily 900 bars) or supply its actual source-labelled matching history, then inspect quality/outcome counts and exclusions.

**You get:** Per-series closed valid bar and eligible outcome counts, supplied source/provenance, and reasons for malformed records, duplicates, open/future bars and irregular gaps. Duplicate times retain the first supplied record; gaps are kept without filling.

**Next action:** Correct timestamps or malformed records and add closed history until outcome counts meet requirements; rerun and verify the intended series/source before interpreting model metrics.

**Limits / prerequisites:** App input is one market, requested history 60–1,800 bars or up to 5,000 valid imported bars. The internal pure runner can handle separate series, but the UI does not offer a combined ML portfolio. Gaps are retained; no data is invented. [Q]

### 17.02. ML parameter settings

**Where / how:** Strategies → Quant Lab → Forward-return classifier. Open the family, Load real-data starter and Run model; use Edit model / markets / settings for changes. Set lookback to an integer 10–60 (shared default 60), holdingBars to 1–20 (default 5), and finite nonnegative feeBps/slippageBps (both defaults 0). Enter positive startingEquity (default 100,000) only if you want an equity path. Use realistic costs rather than assuming zero-cost execution.

**You get:** Invalid settings return insufficient-data with a reason. A metric reports modeled round-trip costs; a valid positive startingEquity enables holdout equity points.

**Next action:** Choose settings that match the research question and user-supplied cost assumptions, then rerun and inspect the resulting sample counts and warnings.

**Limits / prerequisites:** App classifier is one selected market, lookback 10–60 and holding 1–20. Costs are entered assumptions; spread/impact/borrow/funding are not invented. Unused shared settings do not change this model. [Q]

### 17.03. Costed forward-return labels and bounded classifier

**Where / how:** Strategies → Quant Lab → Forward-return classifier. Open the family, Load real-data starter and Run model; use Edit model / markets / settings for changes. Provide valid history and ML settings, then run the ML computation. There is no separate user-selectable algorithm in this module. Long/short returns use entry open and horizon exit close, deduct modeled costs, and omit outcomes where neither side is net positive.

**You get:** A deterministic train-scaled ensemble of up to six shallow decision stumps. Six features are used: one-bar return, five-bar return, candle range/close, lookback close return, close position within trailing high-low range, and rolling standard deviation of one-bar returns.

**Next action:** Treat a produced direction as an exploratory research result; independently assess data, costs and robustness before using it in any paper-only decision process.

**Limits / prerequisites:** Strength is a normalized ensemble margin, not calibrated probability. No profitability or edge claim is established. Volume is not a classifier feature; no AI, fetch, retraining service or orders are invoked. [Q]

### 17.04. Chronological walk-forward and untouched-holdout diagnostics

**Where / how:** Strategies → Quant Lab → Forward-return classifier. Open the family, Load real-data starter and Run model; use Edit model / markets / settings for changes. Inspect walk-forward and holdout accuracy together with their sample counts and the data-requirement reasons. Do not interpret an accuracy without its count, and note that failed-to-fit folds contribute no scored rows.

**You get:** Three purged chronological development folds and a most-recent holdout; per-series holdout size is at least 20 rows or 20% of eligible rows, whichever is larger. Aggregate metrics report scored walk-forward and holdout direction accuracy and counts.

**Next action:** Use these as preliminary diagnostics only; seek independent validation across time periods, sources, assets and realistic costs before considering any action.

**Limits / prerequisites:** The 100 aggregate holdout-outcome threshold is a warning, not a gate on status or metrics. walkForward/untouchedHoldout indicate at least one scored row, not statistical acceptance. Unit fixture passes are not market evidence or device proof. [Q]

### 17.05. Latest per-series research direction

**Where / how:** Strategies → Quant Lab → Forward-return classifier. Open the family, Load real-data starter and Run model; use Edit model / markets / settings for changes. Inspect signal symbol, direction, timestamp, strength and source/provenance reason after confirming the latest bar is closed and the input series is intended. If no signal is returned, read the reasons; absence is not a neutral recommendation.

**You get:** At most one long/short research signal per processed series, timestamped at the latest closed-bar boundary, with an explicitly uncalibrated/unconfirmed margin explanation.

**Next action:** At most use it as an input to separate human-reviewed paper research; do not route directly to brokerage execution.

**Limits / prerequisites:** No flat signal, trade sizing, multi-leg plan, order queue or order placement is implemented. Insufficient-data/no signal is not a bearish, bullish or flat conclusion. [Q]

### 17.06. Optional modeled holdout equity path

**Where / how:** Strategies → Quant Lab → Forward-return classifier. Open the family, Load real-data starter and Run model; use Edit model / markets / settings for changes. Supply positive startingEquity, then inspect emitted points only as a diagnostic. Without a valid positive amount, the path is empty and a reason is reported.

**You get:** Time/value points after predicted holdout exits; trades are spaced so holding intervals do not overlap and values are floored at zero.

**Next action:** Validate assumptions and use an explicitly defined portfolio-level simulation if comparing multiple assets; do not treat the output as an account or realized performance curve.

**Limits / prerequisites:** Independent per-symbol paths retain symbol identity. A single series may expose its singular equity path; multiple series do not become an unlabeled combined portfolio. No fills or extra frictions are inferred. [Q]

<a id="module-private-workspace-tools"></a>
## 18. Private workspace and reliability tools

**Use this module:** Owner-only purpose and current boundaries for the 18 October repair. Operational means available code/function, not a universal device or statistical certification.

| No. | Feature | Purpose |
|---:|---|---|
| 18.01 | Automatic sync and conflict recovery | Preserve owner edits across reconnects without silently overwriting another revision. |
| 18.02 | Encrypted original preview and PDF evidence | Compare inferred rules against the authoritative retained file. |
| 18.03 | Durable source analysis and retry | Avoid losing an original because a long scan timed out or the phone closed. |
| 18.04 | Archive capacity and dependency-confirmed delete | Retire strategies without filling the active cap, and delete only after reviewing links. |
| 18.05 | Private ZIP/CSV/JSON import and export | Keep a portable owner copy of settings, rules, journal and structured paper data. |
| 18.06 | Personal AI request limits and countdown | Make overload protection predictable instead of appearing broken. |
| 18.07 | Optional local PIN and background privacy | Mask an already-authenticated workspace when leaving the app. |
| 18.08 | Visual quantitative rule drafts | Research a transparent condition/allocation graph instead of arbitrary code. |
| 18.09 | Clock selection and explicit personal guards | Separate regional time context from enforced versus advisory discipline. |
| 18.10 | Per-position server-processing evidence | Distinguish active-app observation from actual scheduled bracket management. |

### 18.01. Automatic sync and conflict recovery

**Where / how:** Library → Workspace tools. Watch sync status; resolve an explicit revision conflict before destructive actions.

**You get:** Local/confirmed-cloud status and last successful sync time.

**Next action:** Confirm reconnection and persistence on your phone.

**Limits / prerequisites:** A lost connection is not a confirmed cloud save; close-to-background edits still need device testing.

### 18.02. Encrypted original preview and PDF evidence

**Where / how:** My Library / Trades → Source preview. Open a retained source, navigate its pages, zoom/pan the preview and jump to the quoted evidence.

**You get:** Bounded private image/page beside text evidence.

**Next action:** Correct extracted rules before approval.

**Limits / prerequisites:** Original bytes stay owner-only; previews are rasterized/downscaled, not public share links.

### 18.03. Durable source analysis and retry

**Where / how:** My Library → Source analysis. Upload, watch the retained job phases, then reload or explicitly retry the same source version after a reported failure.

**You get:** Owner job ID, progress, failed recovery and an unapproved source proposal.

**Next action:** Review the source version and proposal.

**Limits / prerequisites:** A published durable worker is still needed for reliable unattended execution; interrupted work is not claimed completed.

### 18.04. Archive capacity and dependency-confirmed delete

**Where / how:** My Library → Workspace tools. Inspect active/archive capacity and the dependency preview before confirming a specific removal.

**You get:** Atomic removal or a revision conflict; canonical paper history retained.

**Next action:** Retry if edits changed after confirmation.

**Limits / prerequisites:** Hard deletion is destructive and explicitly confirmed; imports cannot silently activate strategies.

### 18.05. Private ZIP/CSV/JSON import and export

**Where / how:** My Library → Workspace tools. Export the local private ZIP; preview an import and confirm its exact merge.

**You get:** CSV/JSON files and a versioned metadata manifest.

**Next action:** Check counts and preserve the export securely.

**Limits / prerequisites:** Secrets, auth state and original encrypted file bytes are not included; no public hosted link is created.

### 18.06. Personal AI request limits and countdown

**Where / how:** My Library → AI request limits; Coach. Choose 1–60 requests per 10-minute window for Coach/Forecast and save; use the displayed reset countdown after rejection.

**You get:** Durable owner counters and confirmed private limits.

**Next action:** Wait for the shown reset or review your chosen limit.

**Limits / prerequisites:** These are internal workspace safeguards, not a service account balance; status checks do not consume asks.

### 18.07. Optional local PIN and background privacy

**Where / how:** My Library → Privacy controls. Opt in with a confirmed PIN, use Lock now, and verify inactive/background recovery; forgotten-PIN recovery returns through owner sign-in.

**You get:** Local lock and optional background mask.

**Next action:** Test on the actual phone before relying on it.

**Limits / prerequisites:** Server ownership remains mandatory; local masking alone cannot guarantee operating-system screenshot protection.

### 18.08. Visual quantitative rule drafts

**Where / how:** Strategies → Selected rulebook → No-code rules. Save a reviewed draft and run it on actual supported source history.

**You get:** Condition checks, rankings, inverse-volatility allocation and source limitations.

**Next action:** Review a separate confluence gate before any strategy paper entry.

**Limits / prerequisites:** A rule run neither places a trade nor replaces statistical validation; unavailable corporate-action/sector data is not invented.

### 18.09. Clock selection and explicit personal guards

**Where / how:** Chart → Timezone clocks; Paper lifecycle → Discipline. Choose the supported UTC/IANA/fixed-offset clock settings and explicitly configure each personal pause/count guard.

**You get:** DST-aware clocks, guard classifications and a duration value.

**Next action:** Check the display across a DST boundary on your phone.

**Limits / prerequisites:** Changing a display timezone does not change candle timestamps; broker risk controls remain server-owned.

### 18.10. Per-position server-processing evidence

**Where / how:** Trades → Paper detail. Read the badge and last scheduled update; opt into paper management only with understood limitations.

**You get:** Dated processing evidence for the actual managed position.

**Next action:** Provide failed-Publish logs before activation and force-quit testing.

**Limits / prerequisites:** Unpublished/stale/no-worker evidence remains Foreground only; no brokerage orders are sent.

## Evidence-status index

This is the single evidence-status table for the inventory. “Documented in source” identifies the audited source description only; it does not assert a passing test, live entitlement, deployment, or device result.

| Feature | Current status | Implemented in source | Unit fixture | Device-verified | Date |
|---|---|---|---|---|---|
| 01.01 Selected market, feed status, quote and chart timeframe | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 01.02 Candlestick canvas, inspection, navigation, details and renderer recovery | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 01.03 Chart overlays and named price annotations | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 01.04 Optional session background boxes | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 01.05 Closed-bar timeframe bias table | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 01.06 Pinned historical profile, previous provider day and clocks | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 01.07 Economic calendar and COT context | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 01.08 Open context settings sheet | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 01.09 Candle observations | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 01.10 Reference picture / template | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 01.11 Reference matching — geometry and reviewed-source AI | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 01.12 Manual confluence & overlays | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 02.01 Feed/account status | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 02.02 Account sign-in, refresh, sign-out | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 02.03 Feed switcher, search, category filters | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 02.04 Instrument quote/source/age list and pagination | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 02.05 Favorite toggle | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 02.06 Quick price-watch bell | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 02.07 Select instrument / Chart handoff | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 02.08 Market-data/timeframe boundaries | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 03.01 Search saved strategies and source references | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 03.02 Photo-based search in My Library | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 03.03 Reviewed style source-reference catalog | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 03.04 Create or edit personal strategy rules | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 03.05 Apply strategy to chart | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 03.06 Independent strategy overlay visibility | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 03.07 Duplicate source reference as personal strategy | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 03.08 Factor enable/weight controls | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 03.09 Review-only weight refinement | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 03.10 Version review and rollback | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 03.11 Archive strategy profile | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 03.12 Original WR1 risk disclaimers | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 03.13 Native closed-bar setup analysis | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 03.14 Strategy-attached chart indicators | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 03.15 Configure and approve sourced confluence gate | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 03.16 AI Coach and workspace cloud save | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 03.17 ORB Strategy from uploaded video | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 03.18 London Breakout AI-assisted source | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 03.19 Initial Balance AI-assisted source | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 03.20 Red-to-Green / Green-to-Red AI-assisted source | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 04.01 Browse and search personal patterns/styles | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 04.02 Upload a pattern/style source or save a manual definition | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 04.03 Trainer: edit rules, label feedback, inspect source and versions | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 04.04 Library AI structured blueprint and source-specific Coach handoff | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 04.05 Accept reviewed pattern/style or save an inactive AI review style | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 04.06 Photo-based personal-library retrieval and image re-indexing | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 04.07 Pattern & style reference catalog | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 04.08 Historical CSV/JSON descriptive statistics and nearest-shape study | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 04.09 Research laboratory: MA/FVG walk-forward baselines and analyst discussion | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 04.10 Offline order-book label-classification experiment | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 05.01 Expand/collapse screenshot review | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 05.02 Retained screenshot inventory and reopen | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 05.03 Stage selector and optional trade linkage | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 05.04 Owner-entered capture/trade time and timezone | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 05.05 Choose screenshot | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 05.06 Upload & analyze / retry analysis | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 05.07 Review draft and evidence output | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 05.08 Confirm & retain review | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 06.01 Recent analogue scenario — show/hide overlay | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 06.02 Replay display style — Line / Ghost OHLC / Both | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 06.03 Notify me when scenario direction flips — watch rule | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 06.04 Show captured alert candles and scenario — route-specific evidence toggle | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 06.05 Recent analogue outcome profile — adjacent conditional-history readout | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 07.01 Forecast panel disclosure | Qualification required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 07.02 Optional scenario question | Qualification required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 07.03 Generate / regenerate scenario | Qualification required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 07.04 Show AI forecast toggle | Qualification required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 07.05 Line / candles / both style buttons | Qualification required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 07.06 Scenario detail and chart readout | Qualification required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 07.07 Remove forecast | Qualification required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 08.01 Owner-only Trading Coach route and Back navigation | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 08.02 Coach availability status and Retry context | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 08.03 Coach Details disclosure | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 08.04 Learning Prompts | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 08.05 Question composer and Send | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 08.06 Retry failed coach question | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 08.07 Clear private conversation | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 08.08 Selected-library-source coach scope | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 09.01 Request or retry a paper proposal | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 09.02 Manual practice or gated strategy mode | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 09.03 Discipline panel and risk templates | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 09.04 Ticket: entry, stop, target/R:R and quantity | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 09.05 Restore server bracket and selected risk | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 09.06 Optional pre-trade thoughts | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 09.07 Advanced order style and paper bracket management | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 09.08 Confirm paper order | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 09.09 Pending/open/closed trade lifecycle, edit, review and close | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 09.10 Optional automatic ORB paper entries | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 09.11 Optional automatic session paper entries | Data required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 10.01 Paper balance and performance summary | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 10.02 Optional paper daily drawdown cap | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 10.03 Pending, open and closed trade lists/cards | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 10.04 Trade deep dive, pre-trade journal and post-trade review | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 10.05 Full retained paper history and pagination | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 10.06 Retained paper detail, bracket/review revisions and close | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 11.01 Trading foundations lessons and coach handoff | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 11.02 Discipline check / revenge-trading safeguards | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 11.03 Optional personal post-loss pause | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 11.04 Learning review from paper records | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 12.01 Create a rule and choose scope | Deployment required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 12.02 Price above / below | Deployment required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 12.03 FVG event | Deployment required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 12.04 Ready setup alert | Deployment required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 12.05 Scenario shape update | Deployment required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 12.06 Historical scenario direction flip | Deployment required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 12.07 Weighted confluence alert | Deployment required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 12.08 Below-entry-gate warning | Deployment required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 12.09 Enable or remove a rule | Deployment required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 12.10 Save rules to cloud | Deployment required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 12.11 Test foreground scan | Deployment required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 12.12 Automatic foreground scan | Deployment required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 12.13 Mobile push enrollment and schedule activation | Deployment required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 12.14 Alert history and open event | Deployment required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 12.15 Published session monitoring and setup alerts | Deployment required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 13.01 Two-asset and timeframe selection / source-quality gate | Qualification required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 13.02 Pairs parameters / assumptions | Qualification required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 13.03 Rolling OLS spread and hedge diagnostics | Qualification required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 13.04 Engle–Granger residual-ADF diagnostic and rolling warning | Qualification required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 13.05 Lagged two-leg exploratory replay and equity path | Qualification required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 13.06 Current two-leg candidate signals and paper-plan output | Qualification required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 14.01 Fixed-universe data input | Qualification required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 14.02 Momentum lookback parameter | Qualification required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 14.03 Holding/rebalance cadence | Qualification required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 14.04 Starting equity and fee/slippage assumptions | Qualification required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 14.05 Latest ranks and signals | Qualification required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 14.06 Exploratory portfolio/equity output | Qualification required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 14.07 Paper allocation preview | Qualification required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 14.08 Validation/status/limitations diagnostics | Qualification required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 15.01 Venue L2 snapshot | Operational | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 15.02 Fee and slippage assumptions / cost gate | Qualification required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 15.03 Inventory-aware quote center and size controls | Qualification required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 15.04 Top-five depth metrics and passive paper quote targets | Qualification required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 15.05 Current-book-only scope — no candle backtest | Qualification required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 15.06 Validation and no-plan/insufficient status | Qualification required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 16.01 Asset OHLC histories and alignment | Qualification required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 16.02 Trend lookback control | Qualification required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 16.03 Inverse-volatility directional targets | Qualification required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 16.04 Historical equity and user cost inputs | Qualification required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 16.05 Metrics, provenance, and validation reporting | Qualification required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 16.06 Macro release/vintage and rate-differential model | Data required | Not exposed | Not asserted per feature | Not recorded | 18 October 2026 |
| 17.01 Historical OHLC intake and quality checks | Qualification required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 17.02 ML parameter settings | Qualification required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 17.03 Costed forward-return labels and bounded classifier | Qualification required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 17.04 Chronological walk-forward and untouched-holdout diagnostics | Qualification required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 17.05 Latest per-series research direction | Qualification required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 17.06 Optional modeled holdout equity path | Qualification required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 18.01 Automatic sync and conflict recovery | Operational | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 18.02 Encrypted original preview and PDF evidence | Operational | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 18.03 Durable source analysis and retry | Operational | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 18.04 Archive capacity and dependency-confirmed delete | Operational | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 18.05 Private ZIP/CSV/JSON import and export | Operational | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 18.06 Personal AI request limits and countdown | Operational | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 18.07 Optional local PIN and background privacy | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 18.08 Visual quantitative rule drafts | Operational | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 18.09 Clock selection and explicit personal guards | Device test required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |
| 18.10 Per-position server-processing evidence | Deployment required | Documented in source | Not asserted per feature | Not recorded | 18 October 2026 |

## Changelog

- **2.0.0 — 18 October 2026:** renamed the visible guide for Zax; generated the module index from all 18 groups; added stable module anchors, numbered headings, glossary, source-reference index, current-state status legend, and the consolidated evidence-status index.
- **Current wording:** uses **Recent analogue scenario** for the documented 3,000-bar window and describes the active local Coach conversation without claiming a separate prompt-history library.

This guide is source-generated documentation for an owner-only paper-practice workspace. It does not modify retained raw research or user files.
