# Historical source replay scenario (`historical`)

**Scope:** This is a read-only guide to the existing Chart/workbench replay capability, not a promise that the workbench is operational on a particular device. It covers the source replay and the tightly related historical outcome profile shown beside setup evidence. The replay is a historical analogue drawn as a chart overlay—not a forecast, recommendation, signal, execution simulator, or evidence of an edge.

## What the feature answers

> “What did a similar earlier 12-closed-bar price shape do over its following 12 bars?”

The replay does **not** answer “what will happen next?” or “did my strategy work?” unless the displayed basis explicitly says strategy-matched—and even then it is only a historical conditional case, not a validated prediction.

## Controls and subtools

### 1. Historical source scenario — show/hide overlay

- **Purpose:** View the selected market/timeframe’s historical continuation analogue on the chart. Strategy-matched historical outcome is used when the engine can produce one; otherwise the replay is explicitly a price-shape context replay.
- **Location:** Chart screen → **Historical scenario** disclosure → **Historical source scenario** toggle (`app/(tabs)/index.tsx`, lines 1167–1185). The display itself is on the Chart card under **Historical candles + zones** (lines 897–967). `lib/trading/setup-engine.ts` lines 1322–1348 selects and labels the replay; `lib/trading/historical-scenario.ts` lines 149–239 implements the context-replay fallback.
- **How to use:** 1) Be on the desired market in Chart. 2) Set the timeframe using the row above the chart (1m, 5m, 15m, 1h, 4h, 1d, or 1w). 3) Use real-data mode, not Sample mode. 4) In **Setup evidence & rulebooks**, select one to three rulebooks and choose AND/OR if desired. 5) Open **Historical scenario** and turn on **Historical source scenario**. 6) Read the basis/date/bar count/direction label on the chart and treat it only as a visual analogue.
- **Actual output:** The context fallback compares normalized log-close shape for the latest 12 completed bars with prior 12-bar close shapes, finds the nearest eligible earlier shape having a full 12-bar continuation before the current query window, and scales that actual continuation’s OHLC by a positive factor to meet the latest close. It retains source timestamps (including gaps) and volume. The chart shifts those replay bars to follow the current anchor and labels them `HISTORICAL REPLAY · context-replay` plus source date, source-bar count, direction, and `NOT A FORECAST`. If a qualified current strategy setup and eligible historical cases exist, the engine may instead show `strategy-matched` continuation; its source is the compatible selected setup model and the case continuation is likewise price-normalized. Selected strategy IDs/versions and AND/OR are retained as scenario metadata; that metadata alone does not mean the contextual fallback applied those strategy rules.
- **Useful next action:** Use the replay only to inspect a possible historical analogue alongside the closed-bar source and setup evidence. Verify current provider data, timestamps/gaps, and rulebook fit yourself. If comparing ideas, record the selected market/timeframe/rulebook and basis; do not turn this overlay into an order.
- **Status:** Implemented deterministic source replay and chart overlay in source. The related fixture test passes (12 tests; see Validation below). No evidence here establishes the reported device behavior or live-feed availability.
- **Limits / prerequisites:** The contextual fallback requires at least **36 valid, unique, completed positive-price OHLCV bars**: 12 current query bars, a prior 12-bar shape plus its full 12-bar continuation, all completed before the current query. Bars must have finite OHLCV, nonnegative volume, and internally consistent high/low; malformed input is withheld rather than repaired. The module sorts/deduplicates and caps its working history at 3,000 bars. The seven supported timeframes are listed above. It requires real completed source history; sample/demo bars do not create analysis or replay. Valid history alone does not guarantee a similar eligible continuation. If unavailable, no ghost bars are invented; the source can say `Historical source replay unavailable` / need at least 36 valid closed bars. No replay is not a bearish/bullish signal, and flat direction is not a no-trade signal. Context replay uses no setup factors, readiness, direction, or win-rate estimate. It is not a strategy backtest, forecast, calibrated probability, or statistical edge claim.

### 2. Replay display style — Line / Ghost OHLC / Both

- **Purpose:** Choose how to see the same replay, not change its source or math.
- **Location:** **Historical scenario** disclosure, visible when the scenario overlay is enabled (`app/(tabs)/index.tsx`, lines 1196–1222; chart payload in `lib/trading/lightweight-payload.ts`, lines 311–345 and 497–499).
- **How to use:** With replay visible, tap **Line**, **Ghost OHLC**, or **Both**. The default is **Both**. These controls save the chosen chart style in workspace settings.
- **Actual output:** A projected close line, ghost candlesticks, or both; the chart retains a visible historical-replay / not-a-forecast label when it has replay bars. It is a presentation switch only.
- **Useful next action:** Pick whichever makes the replay/current-history comparison easiest to inspect; switch back to **Both** to see both close path and OHLC ranges.
- **Status:** Implemented as three style choices wired to chart rendering.
- **Limits / prerequisites:** Requires replay bars to exist and the overlay to be enabled. It neither reruns the scenario nor converts it to an AI forecast or a trade plan. Source gaps may remain visible as temporal gaps.

### 3. “Notify me when scenario direction flips” — direction watch rule

- **Purpose:** Create or re-enable a local watch rule scoped to current market, timeframe, and selected strategy IDs for a later scenario-direction flip observation.
- **Location:** **Historical scenario** disclosure (`app/(tabs)/index.tsx`, lines 1187–1195; creation/enable handling at lines 471–523).
- **How to use:** In real-data mode, ensure at least one analysis strategy is selected, then tap **Notify me when scenario direction flips**. The confirmation says the rule is enabled locally. Continue to **Alerts** to save rules to cloud and activate the appropriate native-device/deployed scans; the first observation seeds a baseline. If the 100-rule local capacity is reached, remove an unused rule in Alerts before retrying.
- **Actual output:** Creates an enabled local `scenario-direction` rule (or enables a matching existing one) with current market/timeframe and selected strategy IDs. The direction used by the pure replay helper compares the last replay close with its anchor: above +0.01% is `up`, below −0.01% is `down`, and within the ±0.01% deadband is `flat` (`lib/trading/historical-scenario.ts`, lines 242–273). The first-observation-baseline notice is explicit.
- **Useful next action:** Save the rule in Alerts and separately activate its scan channel; use the alert only as a prompt to review the source chart and evidence.
- **Status:** Local rule creation/reactivation and guidance are present in the UI. This button alone does not demonstrate that a cloud/native/deployed scan is saved, activated, executing, or delivering a notification.
- **Limits / prerequisites:** Button is disabled in Sample mode or when no strategy is selected. It watches direction changes, not a specific trade entry/exit. Direction is descriptive, not a signal or probability. No order or brokerage action is created.

### 4. Show captured alert candles and scenario — evidence toggle, not a new replay

- **Purpose:** Inspect the captured chart/setup attached to a triggered alert rather than replace it with a newly calculated live-history replay.
- **Location:** A Chart opened with an alert ID shows **TRIGGERED ALERT · CAPTURED EVIDENCE** and, when the captured setup is available, the **Show captured alert candles and scenario** toggle (`app/(tabs)/index.tsx`, lines 762–795). It feeds the chart’s captured candle data and scenario visibility (lines 364–368 and 918–951).
- **How to use:** Open a triggered alert’s Chart view, inspect the captured source/evidence and timestamp, then switch the captured-candles/scenario toggle on or off. The normal historical scenario visibility setting is separate; turning it off through the scenario control also hides captured scenario evidence.
- **Actual output:** On, the chart uses the alert’s captured setup candles and attached scenario when present; the card says captured evidence/shape can be viewed independently of the live chart. Off, the captured setup is no longer substituted for live chart candles.
- **Useful next action:** Compare the capture to its displayed source, strategy version and recorded evidence. Treat this as an evidence snapshot, not proof that current candles, a replay, or a trade outcome match it.
- **Status:** The route-specific evidence control and chart substitution are present. This is distinct from the newly computed historical continuation replay.
- **Limits / prerequisites:** Appears only when opened with an alert ID; the toggle is shown only if captured alert setup data exists. It depends on that owner-authorized captured alert record being available. It neither refreshes/corrects the captured data nor makes a new replay or broker action.

### 5. Historical outcome profile — adjacent conditional-history readout

- **Purpose:** Ask whether the engine has enough *qualified, compatible setup cases* to display a descriptive target-before-stop fraction for the current selected source model(s). This is separate from contextual replay: a context replay can be drawn without any ready setup or outcome sample.
- **Location:** Chart → **Setup evidence & rulebooks** → **Historical outcome profile**, directly below the strategy selector and candidate evidence (`app/(tabs)/index.tsx`, lines 1024–1039; `components/trading/setup-panel.tsx`, lines 260–289; math in `lib/trading/setup-engine.ts`, lines 871–975 and 1032–1348).
- **How to use:** 1) Turn Sample mode off. 2) Select supported source model(s) (up to three) and AND/OR. 3) Wait for completed real bars and inspect setup messages/candidate evidence. 4) Read the profile only if the UI actually shows a percentage; otherwise it explicitly says insufficient eligible completed history.
- **Actual output:** When displayed, the percentage is wins divided by resolved qualified cases, with wins/losses, eligible cases, 12-bar horizon, descriptive Wilson interval, and disclosed costs/assumptions. Cases use a qualifying closed-bar retest, next-bar-open hypothetical entry, 2R price-distance target, and next 12 bars; same-bar stop and target is counted conservatively as a loss, unresolved cases remain unresolved. Only non-overlapping cases are accepted. The engine scans at most 600 anchor opportunities and retains at most 100 cases. Historical `probability` is always `null` by design. Strategy-matched replay can use the nearest qualifying historical case; the displayed percentage is not its direction forecast.
- **Useful next action:** Treat any displayed value as a prompt for independent costed walk-forward/untouched-holdout validation, not as an edge or sizing input. Use the evidence and missing-evidence messages to decide whether a manual paper review is even appropriate.
- **Status:** The pure deterministic calculation and UI presentation are implemented. The source explicitly labels any rate unconfirmed and not calibrated as future probability.
- **Limits / prerequisites:** A percentage requires **100 resolved cases** (`estimateFor` withholds the rate below 100 resolved; the collector caps at 100 total cases), plus a single compatible current setup direction, an executable supported selected model, adequate historical closed bars and matching historical qualified entries. It is withheld for conflicting directions, no compatible setup, unsupported/custom ALL input, numerical/microstructure-specific history not configured, or other missing conditions. For automatic supported setup retrieval the engine names Core Sequence, Sweep + FVG/Silver Bullet, Order Block Retest, and STDV; STDV alone is not an entry model. The history is OHLC-only: no spread, commission, slippage, financing, fill queue, or intrabar order-path data; no costed walk-forward or untouched holdout is established. A fixture, case count, interval, or percentage does not prove a real-market edge. No multi-leg or queue-order implementation is asserted.

## What “no signal” / “insufficient” means here

The replay itself is not a signal-generation tool. **No replay** means the engine could not construct an eligible source continuation from available completed bars (or analysis/replay is disabled, e.g. Sample mode); it does not mean the market is flat or that a strategy failed. **Insufficient history** in the adjacent outcome profile means its qualified resolved-case threshold or setup/data prerequisites were not met; no percentage is shown. **Flat** is only the replay’s final-close comparison within its 1 bp deadband. None of these states means buy, sell, hold, or no trade.

## Tests and operational-versus-validation distinction

`tests/trading/historical-scenario.test.ts` contains synthetic deterministic `UNIT` fixtures. The targeted command `pnpm vitest run tests/trading/historical-scenario.test.ts` passed **12/12 tests** in this sandbox. Those tests check supported timeframes, nearest-shape replay/scaling, timestamp gaps, stable sort/deduplication, malformed/incomplete withholding, and the ±1 bp direction band. The test source expressly says its data are synthetic fixtures only. This proves only those unit assertions against the pure function; it is **not** device/Expo/Web rendering proof, not proof a live provider supplies suitable completed data, not alert delivery proof, and not a statistical/financial edge. A live capability can be operational while wholly unvalidated; here validation remains unestablished.

## Confirmed source defects

No concrete defect in the inspected historical-replay logic/control wiring was confirmed. This is a bounded source audit, not a general workbench or shared UI/API diagnosis.

## Source locations inspected

- `lib/trading/historical-scenario.ts` — context replay, input validation, 12-bar shape distance, scaling, direction classification.
- `lib/trading/setup-engine.ts` — qualified historical cases, estimate threshold, strategy-matched scenario and context fallback.
- `app/(tabs)/index.tsx` — Chart-level timeframe, setup selection, replay toggle/style and direction-watch controls.
- `lib/trading/setup-model.ts` — scenario and historical-estimate fields.
- `lib/trading/lightweight-payload.ts` — chart replay labels/render payload.
- `components/trading/setup-panel.tsx` — user-visible setup/history state.
- `tests/trading/historical-scenario.test.ts` — synthetic pure-function unit fixture coverage.
