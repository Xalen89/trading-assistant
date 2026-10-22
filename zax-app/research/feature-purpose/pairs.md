# Quant pairs relative-value model (`pairs`)

**Scope and confidence.** This is a read-only audit of `lib/trading/quant-pairs.ts`, its `cointegration.ts` dependency, the supplied `tests/trading/quant-pairs.test.ts`, and the settings/result type definition. It documents what this model actually computes—not proof that a screen is wired correctly or that a trade has an edge. The audited model is a pure calculation: it accepts candles and settings, and returns a result object. The inspected files do not establish the exact visible screen layout, labels, API wiring, or a tap target in the app. The practical steps below therefore describe the inputs a user would need to provide through whatever workbench controls the app exposes; they do not claim those controls are currently working.

## What this capability is for

The pairs model addresses: **“Given two explicitly selected price series, do their closed-bar relative prices show a rolling spread deviation, and what would a lagged, cost-assumed two-leg paper replay look like?”** It estimates a rolling linear hedge relationship, residual spread and z-score; computes a separate present-window Engle–Granger residual-ADF diagnostic; and, when gates pass, may return a two-leg paper *candidate*. It does not discover pairs, fetch market data, route or queue orders, place trades, or establish profitability.

**Location:** capability/model function `runPairs` in `lib/trading/quant-pairs.ts:586–1003`; the cointegration diagnostic is in `lib/trading/cointegration.ts:518–665`. These source files do not identify an app route or screen position. `tests/trading/quant-pairs.test.ts` contains synthetic algorithm fixtures, not app/device tests or market evidence.

## Inputs and controls the model consumes

| Input/control | Purpose | Accepted values / default in shared type |
|---|---|---|
| Left and right asset series | Define the one pair; order matters because the regression is **left = intercept + beta × right**. | Exactly two distinct symbols, same supported timeframe. There is no basket or automatic pair selection. |
| Timeframe | Determines bar-close checks and expected interval. | `1m`, `5m`, `15m`, `1h`, `4h`, `1d`, `1w`. Both sides must match. |
| `lookback` | Number of matched bars for latest rolling OLS and (separately) the cointegration window. | Integer 20–500 in `runPairs`; shared default 60. **Caveat:** cointegration itself requires 30–4,000 observations, so lookbacks 20–29 pass pair settings validation but cannot produce a formal current cointegration decision or pair signal (see confirmed defect below). |
| `entryZ` | Absolute residual z-score threshold for a new model position. | Finite and >0; shared default 2. |
| `exitZ` | Absolute z-score level at or below which an intended model position exits. | Finite, >=0, and below `entryZ`; shared default 0.5. |
| `holdingBars` | Maximum number of matched-bar intervals an intended position is held before the model exits it. | Integer 1–500; shared default 5. This counts observed matched bars, not elapsed calendar time if there are gaps. |
| `feeBps`, `slippageBps` | Generic assumed costs applied to two-leg notional changes in the exploratory replay. | Each 0–100,000 bps; shared defaults both 0. These are user-supplied assumptions, not quotes or venue measurements. |
| `startingEquity` | Initial value for the displayed out-of-sample replay path. | Finite and >0; shared default 100,000. It does not establish a currency denomination or capital requirement. |
| `orderSize` | Left-leg quantity scale; right-leg quantity is scaled by beta. | Finite and >0; shared default 0.01. This is a research quantity, not an order instruction. |
| `inventory`, `maxInventory` | Present in shared `QuantSettings`. | Defaults are 0 and 0.1 respectively. **Not read by `runPairs`; they do not affect this model.** |
| `now` and series metadata | Used to filter observed closed bars and report source/fetch metadata. | `now`/`fetchedAt` are Unix milliseconds; candle timestamps are Unix seconds. `source` and `provenance` are reported separately. |

Defaults above come from `lib/trading/quant-lab-types.ts:24–46`; actual runtime values may be supplied/overridden elsewhere. The settings test fixture uses different `startingEquity`, `holdingBars`, and `orderSize` values, so fixture values should not be mistaken for app defaults.

## Practical use, step by step

1. In the quant workbench, if the pairs capability is available, choose **two different assets** and a **shared timeframe**. The model cannot choose the pair for you. The inspected capability source does not confirm the screen control names or location.
2. Supply each selected series with closed OHLCV candles, source/provenance and fetch timestamp, plus a trustworthy current `now` in milliseconds. Prefer complete, synchronized observations. A user-import series stays labelled as `user-import`; the model does not convert it to provider data.
3. Set `lookback`, `entryZ`, `exitZ`, fee/slippage assumptions, `holdingBars`, `startingEquity`, and `orderSize` within the ranges above. For an Engle–Granger result, use `lookback >= 30` as well as enough synchronized history. The documented shared defaults (`60 / 2 / 0.5 / 0 / 0 / 5 / 100000 / 0.01`) satisfy the ordinary input bounds, but zero costs mean no fee/slippage cushion is being modeled.
4. Run/recalculate the pairs analysis. The model validates, cleans, and exact-timestamp matches the input series; it does not fetch missing bars or fill gaps.
5. Read `status`, summary, source/data metrics and limitations first. If `insufficient-data` or `unavailable`, address the stated problem and rerun; do not interpret blank metrics as a neutral signal.
6. If `ready`, inspect the OLS/cointegration metrics and validation panel. A returned `signals` pair and optional `paperPlan` are **research-only, two-leg candidates**. Inspect both legs together and the assumed costs before deciding what to do outside this calculation. There is no submit/queue/execute action in this model.

## Data requirements, cleaning, and synchronization

- Exactly two distinct symbols, same supported timeframe, valid pair settings. Unsupported timeframes, malformed settings, same symbol or wrong series count return `unavailable` with reasons (`quant-pairs.ts:590–638`).
- Requires at least `max(100, 2 × lookback)` **exactly synchronized, valid, closed bars** (`:640–673`). E.g. lookback 60 requires at least 120 matches; lookback 500 requires 1,000. This is a minimum for calculation, not evidence that the sample is statistically sufficient for a conclusion.
- At most the latest 5,000 supplied bars per asset are examined. Invalid/non-finite/zero-or-negative OHLC, negative volume, invalid OHLC ranges, unclosed/future bars and conflicting duplicate timestamps are excluded. Exact duplicate candles are deduplicated (`:85–175`, `:248–275`).
- Matching is by exact Unix-second timestamp. No interpolation or synthetic candles are added. Irregular gaps remain in the series; lookback and holding period count matched rows, not elapsed time (`:277–301`, `:708–712`).
- `fetchedAt` is checked for malformed/future values and surfaced as a limitation, but is not substituted for candle timestamps. Source/provenance are surfaced; no source authenticity is independently verified.

## Outputs and what they mean

### Status and source evidence

- **`ready`** means this bounded calculation completed, not that there is a signal or validated edge.
- **`insufficient-data`** means minimum synchronized history was not met, a latest OLS window could not be fit, or arithmetic failed. The result has no signals/equity in the ordinary insufficient path and gives reasons/data requirements (`:530–584`, `:665–690`, `:804–815`).
- **`unavailable`** means the input family, timestamps, series count, settings, symbol/timeframe combination, or other required input was invalid (`:530–554`, `:590–638`).
- Source metrics include left/right source labels, supplied and valid-closed bar counts, fetch times, exact synchronized bar count, and minimum required count (`:178–246`). Limitations enumerate exclusions and assumptions.

### Rolling OLS spread and stability diagnostics

The latest lookback fits OLS `left = intercept + beta × right`; the residual is the latest left close minus fitted value, and the z-score standardizes that residual against the in-window residual mean and sample standard deviation (`:303–373`, `:675–690`). Returned metrics include hedge ratio, residual spread, spread z-score, residual standard deviation, lag-one residual autocorrelation, previous-window hedge ratio, relative hedge-ratio drift and its **25% heuristic** label (`:693–712`, `:887–923`). Lag-one autocorrelation is descriptive only, not a cointegration test. Hedge drift is unavailable if a valid prior fit or non-negligible prior beta is unavailable; the 25% threshold is explicitly a heuristic, not a significance test.

### Engle–Granger diagnostic

`cointegration.ts` uses a two-step Engle–Granger procedure: OLS with intercept, then residual ADF without deterministic terms; a fixed Schwert-style lag based only on window length; MacKinnon 1994 asymptotic p-value and MacKinnon 2010 finite-sample critical values for N=2 with intercept (`cointegration.ts:140–141`, `:177–185`, `:348–362`). The model reports present-window status, residual ADF statistic, p-value, selected decision, 5% critical value, plus an equal-size prior/current comparison when two windows are available (`quant-pairs.ts:817–858`).

- Null: **no cointegration**, conditional on both price series being I(1); this implementation does not establish that integration order.
- `reject-no-cointegration` is evidence against that null under this test/model, not a success probability. The metric explicitly labels the p-value “NOT win probability.” `fail-to-reject-no-cointegration` is not proof of no relationship.
- `possible-break` is only a rolling warning when the prior window rejected no-cointegration and the current window fails to reject; it is not a formal structural-break test (`cointegration.ts:639–663`).
- Gaps are validated as ordered timestamps but are not filled or modeled. The test has no multiple-testing correction and does not account for borrow, funding, FX conversion, delisting or survivorship (`cointegration.ts:550–559`; `quant-pairs.ts:943–949`).

### Signals and optional two-leg paper plan

A z-score at or above `entryZ` (absolute value) starts an intended model position if none is held: positive z means short left/long right; negative z means long left/short right, with right quantity scaled by `beta` (`quant-pairs.ts:433–450`, `:730–768`). An intended position remains until `abs(z) <= exitZ` or its holding-bar limit is reached. The replay uses closed bars causally: decision at a close can only be filled at the next observed close (`:770–802`). A valid current signal is emitted only if the current model position is non-flat **and** the present-window Engle–Granger decision rejects no-cointegration **and** the rolling comparison is not flagged (`:859–885`). When emitted, the two signal records share timestamp, strength and reason; strength is capped at 1 and scales `abs(z)/entryZ` (`:859–884`).

The optional `paperPlan` contains exactly two legs (symbol, side, quantity and last observed reference close) and describes a candidate only (`:950–974`). It is not a broker instruction. The module explicitly disclaims brokerage execution, venue routing and a single-leg substitute (`:586–589`, `:653–658`). No multi-leg order submission, queueing, atomic execution, fill checking or live position tracking is implemented here.

**A `ready` result with no signal is normal.** Possible code-level reasons include: the current z-score never crossed entry; the model is flat after exit/holding expiry; beta is zero/invalid for constructing both legs; cointegration does not reject the null; the prior rejection was lost (flagged possible break); or cointegration is unavailable. Check status, z-score, cointegration decision/comparison, and limitations rather than treating empty `signals` as a calculation failure.

### Equity path and validation state

The function splits matched history into training and a later replay: training count is `max(lookback, floor(0.7 × matched-bars))`; the remaining rows are test/OOS. The returned equity path starts flat at the OOS boundary with the supplied starting equity, uses rolling fits that see no future rows, lags decisions to the next observed close, and subtracts user-supplied generic fee + slippage assumptions from two-leg notional changes (`quant-pairs.ts:714–815`, `:925–949`). It reports modeled costs and the OOS boundary. An open pair is not forced closed without a subsequent observed bar (`:995–1000`).

The result always labels validation **`unconfirmed`**, reports resolved non-overlapping OOS outcomes as `actualSamples`, marks `walkForward: true`, and marks `untouchedHoldout: false` (`:943–993`). The source says at least 100 resolved outcomes are required before any performance verdict; it does not itself promote the status to validated. The newest closed bar is used for the current diagnostic, so there is no untouched newest holdout. A present-window cointegration result is not retrospective qualification of replay performance. **Operational/replay output (what this code calculated under supplied assumptions) is distinct from validation (whether a robust edge has been established); this model does not establish the latter.**

## Concrete confirmed source defect

- **Lookback 20–29 is accepted but cannot yield a usable Engle–Granger decision or pairs signal.** `quant-pairs.ts:36–37, 483–492` accepts lookback down to 20 and `:817–825` passes that value as the Engle–Granger window. `cointegration.ts:40–41, 525–530` rejects windows below 30, returning `invalid-input`/unavailable; `runPairs` then gates every signal on the cointegration decision at `quant-pairs.ts:865–885`. So these accepted settings can produce a `ready` exploratory replay but not a formal diagnostic or signal. **Minimal fix:** make the pairs lookback minimum 30 consistently (including validation, requirements/messages/tests), or decouple the cointegration window and validate/report its separate value. No other concrete defects were confirmed in the requested source/test scope.

## Test evidence and caveat

The supplied Vitest file explicitly labels its data “synthetic algorithm fixtures—not market data or performance evidence” (`tests/trading/quant-pairs.test.ts:9–10`). It exercises synchronized OLS/OOS outputs, future-bar filtering, duplicate/invalid/gapped input handling, provenance labels, generic fee/slippage cost effects, insufficient-history and basket rejection (`:95–237`). Passing these unit fixtures would support only those algorithm behaviors under synthetic inputs; it is **not device/browser/API integration proof, evidence of live/provider data quality, or evidence of statistical edge**. No test execution, device test, API write, database access or brokerage action was performed as part of this read-only audit.
