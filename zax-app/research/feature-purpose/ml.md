# Quant Workbench — ML forward-return classification

**Scope.** This is a read-only audit of the ML computation in `lib/trading/quant-ml.ts` and its deterministic unit fixtures in `tests/trading/quant-ml.test.ts` (plus the settings/result contract in `lib/trading/quant-lab-types.ts`). It is not a device, browser, API, database, or live-market test. The screen placement below means the Quant Workbench's **ML family**; exact UI labels, wiring, and tap targets are outside this scoped source audit.

## What this capability is for

It studies whether a small, bounded classifier can label the next costed holding-period move as **long** or **short**, based on lagged OHLC-derived features. It is an exploratory research aid: it does not fetch data, produce calibrated probabilities, establish an edge, or place orders.

## Practical use and inputs

1. In the Quant Workbench, select/use the **ML** family and provide one or more timestamped candle series. Each series needs a symbol, supported timeframe, source/provenance, and candles with Unix-second timestamps plus valid OHLCV. The computation handles up to eight series independently; only the first eight supplied are processed.
2. Supply `now` as a finite Unix-millisecond timestamp. A bar is treated as closed only when `bar.time + timeframe duration <= now / 1000`. Open/future bars are discarded.
3. Set the model parameters below and run the research. The module does not choose or fetch the historical series itself. It uses each series separately; it does not pool provider and user-import bars into a shared model.
4. Read the data-quality reasons first, then the sample counts, walk-forward and untouched-holdout results, and any current direction score. Treat all results as research, not a trade instruction.

### ML-relevant parameter controls

| Setting | Purpose / how to use | Code requirements and defaults |
|---|---|---|
| `lookback` | How many trailing closed bars define features. | Integer **10–60**. Shared contract default: **60**. Warm-up reduces eligible examples. |
| `holdingBars` | Number of subsequent actual candle records in the outcome horizon. | Integer **1–20**. Shared contract default: **5**. Counts observations, not elapsed regular intervals; gaps are not filled. |
| `feeBps`, `slippageBps` | User-entered cost assumptions for each side of the round trip. | Both finite and non-negative. Shared defaults are **0 bps each**, so set realistic values yourself. Modeled deduction is `2 × (feeBps + slippageBps)` bps from either directional return. |
| `startingEquity` | Optional positive starting amount for the modeled holdout equity path. | Shared contract default: **100,000**. Only a finite positive value enables the path; otherwise it is empty and a reason is returned. This is not an account balance or broker state. |

The shared settings contract also contains `entryZ`, `exitZ`, `inventory`, `orderSize`, and `maxInventory`; **`runML` does not read those fields**. They are not ML classifier controls in this implementation. The ML tests pass those fields as part of the shared settings object, but assert no ML behavior from them.

### Data required to get a model/result

- At least **120 eligible costed outcomes per series** after warm-up and filtering. This is not a simple minimum number of candles: invalid, duplicate, open/future, and outcomes inside the modeled cost band can reduce the count.
- To fit the final model, the pre-holdout/purged training partition must have at least **60 rows**, both costed outcome directions, and a discriminative stump. Thus 120 eligible outcomes alone do not guarantee a model or signal.
- The result also reports a separate **100 aggregate untouched-holdout-outcome** gate. The code only adds a warning when aggregate holdout rows are below 100; it does not make `status` depend on that threshold.
- Each asset is capped at 5,000 retained bars; each fitted model is capped at 1,200 training rows. A maximum of six shallow stumps is used.
- Candles must have positive finite OHLC prices, nonnegative finite volume, internally consistent high/low bounds, and safe-integer positive Unix-second timestamps. The timeframe must be supported by the engine's `SECONDS` map.

The exact candle count needed to reach 120 eligible outcomes varies with lookback, horizon, costs, missing/malformed records, and actual costed directional outcomes. A practical starting configuration from the shared defaults is lookback 60, holding period 5, and user-specified nonzero realistic costs; then supply enough closed history to meet the per-series outcome and model-fit requirements.

## Feature-by-feature guide

### 1. Per-series historical OHLC intake and quality checks

- **Location:** Quant Workbench → ML input/data path; implementation `lib/trading/quant-ml.ts:70–153, 721–748`.
- **Purpose:** Research one supplied asset/timeframe history at a time, while making malformed or stale inputs visible rather than silently fabricating bars.
- **How to use:** Provide each history as its own series with its source and provenance; use candle times in seconds and `now` in milliseconds. Check returned reasons for malformed records, duplicates, open/future bars, irregular gaps, and unsupported requirements. For more than eight series, reorder/select the eight you intend to analyze because only the first eight are processed.
- **Output:** Per-series source/provenance, closed-valid-bar and eligible-outcome metrics; reasons identify skipped input and gaps. Duplicate timestamps keep the first supplied record after chronological sorting. Gaps are retained, not repaired or filled.
- **Useful next action:** Correct source data/time units, remove unintended duplicates, or supply more closed history; rerun and confirm counts before interpreting model metrics.
- **Status:** Implemented in the pure computation; whether/how the app exposes data selection/import controls is not verified here.
- **Limits:** No data fetching/import operation is performed by this module. `fetchedAt` and `adjustedTotalReturn` do not drive this ML calculation. Irregular intervals remain as supplied, and holding periods count records.

### 2. Lookback, outcome horizon, and user-cost assumptions

- **Location:** Quant Workbench → ML settings; computation and validation `quant-ml.ts:673–745`; shared defaults `quant-lab-types.ts:24–47`.
- **Purpose:** Set the feature history, number of observations held, and a transparent transaction-cost assumption so labels are costed rather than based on gross direction alone.
- **How to use:** Choose integer `lookback` 10–60 and `holdingBars` 1–20; enter nonnegative finite fee/slippage bps. Use the shared defaults (60/5) only as starting parameter values, not as evidence they are suitable. Set positive `startingEquity` only if you want a modeled holdout path.
- **Output:** Invalid parameters yield `insufficient-data` with a reason. A metric exposes the modeled round-trip cost in bps; starting equity controls only whether the equity points are emitted.
- **Useful next action:** Re-run with realistic costs and a horizon matching the research question; compare parameter choices as separate research runs rather than assuming a parameter is optimized.
- **Status:** Parameter bounds, cost calculation, defaults, and optional path behavior are implemented. App control labels/wiring are not audited.
- **Limits:** The module does not invent fees or slippage. Spread, market impact, borrow, funding, and venue-specific charges are not modeled. Shared defaults of zero fees/slippage can make an unedited run materially optimistic.

### 3. Costed forward-return labels and bounded classifier

- **Location:** `quant-ml.ts:159–245, 249–411`.
- **Purpose:** Ask whether lagged OHLC features distinguish which side would have positive modeled net return over the selected holding horizon.
- **How to use:** There is no separate classifier button or user-selected algorithm in this module; supply valid history and the settings, then run ML. For each eligible decision, the long net return is `exit.close / entry.open - 1 - cost`, and the short net return is `entry.open / exit.close - 1 - cost`. A row is labeled by a side with positive net return; if neither side is positive, the in-cost-band outcome is omitted.
- **Output:** A deterministic, train-scaled, AdaBoost-style ensemble of up to six decision stumps; model name and modeled cost are metrics. Its six lagged features are one-bar return, five-bar return, current candle range/close, lookback-period close return, current close position within trailing high-low span, and rolling standard deviation of one-bar returns. Volume is not a model feature.
- **Useful next action:** Treat the direction score as a prompt for further independent validation; inspect source, costs, timeframe, and outcome counts before using it in any paper-only process.
- **Status:** The bounded classifier and costed labels are implemented.
- **Limits:** The score strength is a normalized ensemble margin, **not a probability**. No edge, profitability, or expected return claim follows from producing a model. No AI, automatic retraining service, or order logic is called.

### 4. Chronological walk-forward and latest untouched-holdout metrics

- **Location:** `quant-ml.ts:499–557, 810–851, 888–919`.
- **Purpose:** Give a chronology-aware diagnostic of direction classification rather than only reporting in-sample fit.
- **How to use:** After running ML, inspect eligible/train/walk-forward/holdout sample counts alongside both accuracies. If no model could be fitted for a fold, its rows are not included; require nonzero counts before reading an accuracy.
- **Output:** Three purged chronological development folds and a most-recent holdout (at least 20 rows or 20% of eligible rows per series, whichever is larger). Metrics aggregate correct/total scored rows into walk-forward and holdout direction accuracy. Holdout rows are not used to fit the final model; rows whose holding horizon would overlap a test boundary are excluded from training candidates.
- **Useful next action:** Treat these as preliminary diagnostics only. Seek broader/out-of-sample validation and check robustness across sources, time periods, costs, and assets before making any decision.
- **Status:** The code implements train-only scaling, purged chronological folds, and a latest holdout, and labels validation `unconfirmed`.
- **Limits:** `validation.walkForward` and `untouchedHoldout` mean that at least one corresponding row was scored, not that a statistical acceptance test passed. The 100-holdout-outcome threshold is reported as a reason but does not gate the returned `ready` status. Unit-fixture success is not device proof or statistical evidence.

### 5. Latest per-series research direction signal

- **Location:** `quant-ml.ts:557–594, 773–776`.
- **Purpose:** Surface what direction the final fitted model assigns to the latest closed OHLC feature vector for each processable series.
- **How to use:** Read the signal's symbol, direction, `at` time, strength, and reason only after checking that it is based on the intended source and a completed candle. If the output says insufficient/no signal, do not infer a neutral or flat recommendation; investigate the returned data/training reasons.
- **Output:** At most one long/short research signal per processed series, timestamped at the end boundary of its latest closed bar. The reason identifies supplied source/provenance and warns that the margin is not calibrated or confirmed.
- **Useful next action:** Use it, at most, as an input to a separately authorized human paper-review workflow; do not route it directly to brokerage execution.
- **Status:** Signal generation is implemented when final model and latest features exist. Overall `ready` means only that at least one signal and at least one scored holdout row exist.
- **Limits:** No `flat` signal is generated by this model path. No confidence probability, trade sizing, multi-leg plan, order queue, or order placement is implemented here. `insufficient-data`/no signal means no usable research output—not a bearish/bullish/flat conclusion.

### 6. Optional modeled holdout equity path

- **Location:** `quant-ml.ts:596–610, 777–779`; output contract `quant-lab-types.ts:68–76`.
- **Purpose:** Show a hypothetical compounded path for non-overlapping model-predicted outcomes on the holdout, using the chosen starting amount and modeled side-specific net returns.
- **How to use:** Supply a positive `startingEquity`, then inspect the emitted points only as a diagnostic. Without it, the path is empty and the result explains why.
- **Output:** Time/value points emitted after predicted holdout exits; a decision is skipped until the prior simulated holding interval ends, and value is floored at zero.
- **Useful next action:** Validate accounting and assumptions before relying on a chart; compare against a properly defined benchmark and a portfolio-level simulation if evaluating multiple assets.
- **Status:** A per-series calculation is implemented; the aggregate output has a confirmed identity/aggregation defect noted below.
- **Limits:** It is not a realized account curve, does not model additional trading frictions or execution, and is not an order or brokerage record. The current aggregate result does not preserve asset identity.

## Reading statuses honestly

- **`insufficient-data`** means inputs or usable training/test rows did not meet the computation's requirements, or no latest signal/holdout score could be generated. Read the specific reasons; it is not a direction.
- **`ready`** is a narrow operational flag: at least one current signal and at least one scored holdout row exist. It does **not** mean the 100-holdout-outcome advisory threshold was met, validation passed, or an edge is established.
- **Validation is always `unconfirmed`** in this ML path. An accuracy number can be computed even when sample counts are small; the result adds a warning below 100 aggregate holdout outcomes but does not suppress all such metrics.
- The tests use deterministic synthetic UNIT candles specifically as algorithm fixtures. Passing those tests confirms only those fixture expectations; it is not real market evidence, a device test, or proof of statistical edge.

## Confirmed source defect

- **Unlabeled multi-asset equity points are flattened into one series.** In `lib/trading/quant-ml.ts:596–610`, each asset independently compounds from the same `startingEquity`; then lines `777–779` concatenate all per-asset points and sort only by time. The public result contract `lib/trading/quant-lab-types.ts:76` contains only `{time, value}`, with no symbol/series identity. A consumer therefore cannot distinguish independent per-asset equity paths, and presenting the flattened points as one portfolio curve would be misleading. **Minimal fix:** preserve a per-series identifier/curve in the result contract and output, or compute one explicitly defined portfolio-level path with shared capital/allocation assumptions instead of concatenating independent paths.

## Source files reviewed

- `lib/trading/quant-ml.ts`
- `tests/trading/quant-ml.test.ts`
- `lib/trading/quant-lab-types.ts` (contract/defaults context only)
