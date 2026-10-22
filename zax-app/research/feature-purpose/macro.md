# Quant systematic trend / macro (`macro`) — feature-purpose guide

**Scope:** Source-only audit of `lib/trading/quant-macro.ts` and its algorithm tests. The capability is a bounded, OHLC-only slow-trend calculation. Despite the family name, it does **not** implement macroeconomic release/vintage, central-bank rate-differential, or carry signals. This is not a browser/device audit, performance evaluation, or execution feature. The app context supplied for this audit is fixed Expo RN/web, API 3000 / Metro 8081, owner-only and paper-only; this module itself does not place orders.

## Where to find it

- **Workbench location:** Quant workbench → family/capability `macro` (systematic trend / macro). The audited implementation is `lib/trading/quant-macro.ts`, exported as `runMacroTrend`; type contracts are in `lib/trading/quant-lab-types.ts`.
- **UI caveat:** This audit intentionally did not inspect shared workbench UI or API code. Therefore exact screen layout, labels, and whether each input is currently exposed as a tappable control are not established here. The steps below describe the capability's actual input/output contract, not a claim about verified device navigation.

## Controls and subtools

### 1. Asset OHLC histories (required input)

- **Purpose / trader question:** “Across a small, aligned set of markets, which have a positive or negative slow price trend after scaling each by recent realized volatility?”
- **Location:** `macro` runner input `series[]` (`QuantSeries`); source/data field contract at `lib/trading/quant-lab-types.ts:4–12`; validation/preparation at `lib/trading/quant-macro.ts:101–202,317–429`.
- **How to use:** Supply 2–8 distinct assets. For each, provide symbol, one common timeframe (`1d` or `1w`), non-empty source label, provenance (`provider` or `user-import`), `fetchedAt` in Unix milliseconds, and candles with Unix-second timestamps plus finite, positive OHLC and finite, nonnegative volume. Use a finite `now` timestamp in Unix milliseconds. Provide genuinely completed bars only; the runner also excludes a bar unless `candle.time + timeframe duration <= now / 1000`. Keep each asset to at most 5,000 supplied bars. Give every asset the same timeframe and exact common candle timestamps. There is no merge, resampling, gap filling, interpolation, or synthetic-bar repair.
- **Output:** Validation either accepts the histories or returns `insufficient-data` with reasons. Invalid OHLC, duplicate timestamps, and unfinished/future bars are omitted and noted; non-common timestamps disappear from the aligned calculation. Accepted source/provenance, fetch time, and total-return-adjustment flag are echoed in the source metric.
- **Useful next action:** Resolve every input reason, verify source/timestamp and adjustment conventions, and supply sufficient common completed history before interpreting calculated values.
- **Status:** Implemented as input validation and series alignment. Provider/user-import data acquisition is not performed by this pure calculation.
- **Limits / exact prerequisites:** At least two usable assets must remain. Need at least `max(trendBars, volBars) + 3` common completed bars, where the effective trend window is 20–252 bars and volatility window is 10–63 bars. Gaps are preserved rather than filled; irregular bars are only used when timestamps match across all assets. Data are close-to-close price series, not automatically total-return, FX-converted, roll-adjusted, or financing-adjusted.

### 2. Slow trend lookback (`settings.lookback`)

- **Purpose / trader question:** “Over what slow horizon is each asset's close-to-close direction measured?”
- **Location:** `QuantSettings.lookback`, consumed at `lib/trading/quant-macro.ts:371–386`; shared type/default declaration at `lib/trading/quant-lab-types.ts:24–47`.
- **How to use:** Supply a finite positive lookback. The runner floors it to an integer and clamps it to 20–252 bars; it does not choose or optimize a strategy parameter. The shared type declares a default of 60, but `runMacroTrend` uses the value it receives and does not substitute a default.
- **Output:** Effective trend lookback, in bars, is shown in metrics; each asset's trend is `close[signal bar] / close[signal bar - lookback] - 1`.
- **Useful next action:** Check that the selected horizon fits the bar frequency and obtain enough common bars for that horizon plus the volatility window and two portfolio observations.
- **Status:** Implemented. No parameter search or evidence that this is an optimal setting.
- **Limits / exact prerequisites:** Positive finite input is required; values below 20 are raised to 20 and values above 252 reduced to 252. The lookback is in observed common bars, not calendar days.

### 3. Volatility scaling and directional targets (calculated subtool)

- **Purpose / trader question:** “How should trend direction be translated into relative long/short weights when recent observed-bar volatility differs?”
- **Location:** `delayedWeights` at `lib/trading/quant-macro.ts:223–272`; per-asset signal construction at `488–521`.
- **How to use:** No separate setting: this is calculated from accepted histories and the effective trend lookback. For each simulated period, target weights use the **prior** completed common bar. The code computes recent close-to-close returns over `volBars = clamp(floor(trendBars / 3), 10, 63)` and their population standard deviation. Trend sign determines long/short; allocation magnitude is proportional to inverse volatility, normalized across eligible assets.
- **Output:** A per-asset final target with direction `long`, `short`, or `flat`, normalized strength (capped at 1), timestamp, and a textual reason. Positive/negative eligible weights have total gross absolute exposure normalized to one. A zero-volatility asset, or one with effectively zero trend, receives zero weight instead of an invented volatility floor.
- **Useful next action:** Treat targets as research observations to inspect against the underlying source data and independent validation; do not send them as orders. A flat target means this model assigns that asset no weight under its current trend/volatility calculation.
- **Status:** Implemented as deterministic pure math only.
- **Limits / exact prerequisites:** Daily or weekly closed OHLC with enough common bars is required. Volatility is per observed bar, not annualized; uneven timestamp spacing is not normalized. No leverage, margin, liquidity, borrow, short availability, financing, carry, or executable fill model is present.

### 4. Historical equity, turnover, and user-entered costs

- **Purpose / trader question:** “What would this simple delayed target-weight rule have calculated on supplied historical close-to-close bars after the explicitly supplied fee/slippage assumptions?”
- **Location:** Cost settings validated at `lib/trading/quant-macro.ts:345–369`; equity loop at `431–478`; output metrics at `546–617`.
- **How to use:** Enter positive finite `startingEquity`; enter finite nonnegative `feeBps` and `slippageBps` whose sum is less than 10,000 bps. Zero is allowed, but is not an estimate of actual costs. The runner charges `(feeBps + slippageBps) / 10,000` times equity and one-way absolute target-weight turnover, then applies the weighted close-to-close return for that period.
- **Output:** Causal equity points and metrics for starting/ending equity, net historical calculation return, close-to-close maximum drawdown, one-way turnover, the entered fee/slippage, and calculated user-cost deduction. A bankrupt/nonpositive equity path is set to zero and stopped.
- **Useful next action:** Replace assumptions with defensible instrument/venue-specific costs before any research interpretation; compare output with properly independent validation and account for omitted real-world frictions.
- **Status:** Implemented historical calculation, not a validated backtest and not performance evidence.
- **Limits / exact prerequisites:** There is no automatic venue, spread, impact, financing, borrow, roll, dividend, FX, or tax estimate. It models close-to-close returns, not fills, intrabar/gap execution, margin or actual trades. The most recent displayed targets are next-bar targets and are excluded from the reported equity history.

### 5. Metrics, provenance, signals, and validation status

- **Purpose / trader question:** “What did the calculation use and produce, how many causal observations exist, and is there independent evidence?”
- **Location:** Result assembly at `lib/trading/quant-macro.ts:488–656`; result contract at `lib/trading/quant-lab-types.ts:55–97`.
- **How to use:** After a `ready` result, review the summary and source metric, then inspect the metrics, dated equity series, and per-asset signal reasons. Read `validation.reasons`, `dataRequirements`, and `limitations` before acting on any interpretation.
- **Output:** Model name, macro-release/rate model marked “not available,” asset count, common timeframe, effective trend/vol windows, causal observation count, equity and return metrics, costs/turnover, source/provenance, and latest per-asset target signals. Validation is always `unconfirmed`; training/test samples are zero, walk-forward and untouched holdout are false. The result explicitly says at least 100 real independent out-of-sample observations are a minimum review gate, and says no such process/holdout is supplied or claimed.
- **Useful next action:** Use the result to identify data/assumption issues and formulate a separate out-of-sample validation plan. Do not treat `ready` as evidence of an edge or as a recommendation.
- **Status:** Implemented reporting; validation is explicitly absent/unconfirmed.
- **Limits / exact prerequisites:** Fewer than 100 computed observations is explicitly below the review gate; even 100 observations alone would not establish validity. The latest signal is available only after the last completed bar and is a next-bar target, not included in reported equity.

### 6. Macro release/vintage and rate-differential model (unavailable)

- **Purpose / trader question:** “How do point-in-time economic releases, revisions, expectations, or policy/sovereign-rate differentials affect an asset or currency?”
- **Location:** Explicit unavailable metric and requirements in `lib/trading/quant-macro.ts:34–35,294–315,553–556,638–655`.
- **How to use:** There is no control to run this model in the audited capability. Do not interpret OHLC trend outputs as macro-release or rate-differential signals.
- **Output:** `macro_release_rate_model` is “not available”; the runner states the separate model is unavailable from OHLC.
- **Useful next action:** None within this capability; prerequisites for a distinct model are predeclared economic release values, forecast and revision vintages, release/availability timestamps, point-in-time policy or sovereign-rate curves (or instrument-specific carry), currency and return conventions, financing/roll assumptions, and matched total-return price series.
- **Status:** Not implemented.
- **Limits / exact prerequisites:** The required point-in-time macro/rate/carry data are not fields of the supplied OHLC series and are not inferred.

## Interpreting “no signal” and “insufficient data”

- `insufficient-data` means a required input or calculation gate failed; the empty result has no equity or signals. Check the returned reason(s) and `dataRequirements`, correct the inputs, then recalculate.
- A `ready` result may contain a per-asset `flat` signal: the target weight is zero because trend is effectively flat or trailing volatility is zero/unavailable. This is not an instruction to enter or close an order.
- A missing final target would produce no final signals, but with a usable result the input-history gates are intended to permit a final delayed target. Do not confuse an empty insufficient result with a model recommendation to stay flat.

## Operational output versus strategy validation

`ready` only means the supplied data passed the calculation's gates. It means neither operational availability of a provider nor model validation. The result is a historical OHLC calculation, has no walk-forward or untouched holdout, and remains marked unconfirmed. The 100-observation line is a minimum review gate, not a performance claim. The unit tests use synthetic fixtures solely to exercise causal timing, costs, validation flags, and data rejection; their passing is **not** device proof, real-data proof, or evidence of statistical edge.

The module returns calculations, signals, and equity points. It contains no queue, multi-leg order construction, brokerage action, or order submission for this family. In the stated owner-only, paper-only app context, outputs should be used for review/research only—not treated as executable orders.

## Confirmed source defects

No concrete defect confirmed in the audited macro implementation/tests. No fixes made. This is limited to the specified capability files; shared workbench UI/API behavior was intentionally not audited here.
