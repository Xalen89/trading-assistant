# Offline Order-Book Research Worker

`orderbook_research.py` is an **independent, CPU-only offline research worker**. It consumes one typed order-book payload on standard input and writes exactly one JSON object on standard output. It is not a live signal, trading, paper-trading, HFT, DMA, reinforcement-learning, or model-serving component.

## Source and rights boundary

The local discovery record [`research/strategy-inventory/sgx-orderbook.json`](../research/strategy-inventory/sgx-orderbook.json) has **20 deduplicated entries**, including **5 implemented classifier candidate families** and **zero deployable live or paper-execution strategies**.

| Inventory finding | Worker treatment |
|---|---|
| Repository code license is absent/unlicensed | **No repository code is copied.** This worker independently implements only the high-level formulas catalogued in the inventory. |
| Repository data rights are unknown/unlicensed | **No repository data is downloaded, read, or used.** The caller must supply data and set `rightsConfirmed: true`. That assertion is recorded, not independently verified. |
| Source has no live/paper execution layer | This worker does not add one. It performs no feed connection, order routing, session access, journal access, or position/risk management. |

The worker writes no result artifact or model artifact: no pickle, model file, feature file, cache, or database is produced. It makes no external-network request, reads no environment variables, cookies, or credential data, and never emits individual feature values, predictions, or classifier probabilities.

## Command-line contract

```bash
python3 orderbook_research.py --json < request.json
```

Input is one UTF-8 JSON object, capped at **8 MiB** at the stdin boundary. Standard output is always a single JSON object: a success report or a structured error. Exit code is `0` on success, `2` for a contract/validation error, and `1` only for a sanitized unexpected worker failure.

### Required input

```json
{
  "instrument": "USER INSTRUMENT",
  "source": "caller-supplied source description",
  "rightsConfirmed": true,
  "snapshots": [
    {
      "time": 1735689600.25,
      "bids": [
        {"price": 99.90, "quantity": 30},
        {"price": 99.80, "quantity": 20},
        {"price": 99.70, "quantity": 10}
      ],
      "asks": [
        {"price": 100.10, "quantity": 35},
        {"price": 100.20, "quantity": 25},
        {"price": 100.30, "quantity": 15}
      ]
    }
  ],
  "spec": {
    "horizonSeconds": 600,
    "trainingSeconds": 1800,
    "testSeconds": 10,
    "maxFolds": 1
  }
}
```

Validation requires exactly the fields shown at each schema level:

- **500–12,000** snapshots and a maximum **8 MiB** encoded request.
- Finite, strictly increasing Unix-second timestamps; fractional seconds are supported.
- Exactly three levels per side; finite prices strictly greater than zero; quantities at least zero; positive aggregate depth on each side.
- Strictly descending bid prices, strictly ascending ask prices, and an un-crossed/unlocked top of book (`bestBid < bestAsk`).
- `rightsConfirmed` must be boolean `true`; `horizonSeconds` is `600` or `900`; training/test seconds are fixed at `1800`/`10`; `maxFolds` is an integer from `1` through `3`.
- OHLC/candle fields, missing books, book reconstruction, forward fill, and synthetic one-second rows are not accepted.
- Any zero weighted-bid denominator for the 17 depth triplets is rejected. It is not imputed, dropped, or repaired.

### Error status and stable error codes

A failed command still writes JSON, such as:

```json
{"kind":"orderbook-ml","status":"error","error":{"code":"chronology_error","message":"snapshot timestamps must be strictly increasing."}}
```

| Code | Meaning |
|---|---|
| `invalid_json`, `input_too_large`, `usage` | stdin/CLI contract failure |
| `invalid_schema`, `invalid_metadata`, `invalid_snapshot_count`, `invalid_spec` | typed payload failure |
| `rights_not_confirmed` | caller did not explicitly confirm supplied-data rights |
| `ohlc_not_accepted` | candle/OHLC input is forbidden |
| `chronology_error`, `invalid_number` | timestamps or numerical fields are invalid |
| `invalid_book_levels`, `book_invalid_order`, `crossed_book`, `invalid_book_depth` | invalid three-level book |
| `zero_quantity_denominator`, `feature_construction_error` | undefined or non-finite feature construction |

## Independent methodology and adaptations

The formulas are independently written from the local inventory descriptions. They retain the inventory’s research feature families while correcting unsafe data handling:

1. **Event-time adaptation.** The worker evaluates a row only at an actual supplied event; it does not construct a one-second grid. It exposes min/median/max observed timestamp gaps in the report. For a lag boundary on an irregular stream, it uses the latest *actual* snapshot at or before that boundary. This is a causal historical reference, not a filled snapshot.
2. **64 causal features.** Rows require the full 1,230-second lookback. The first 30 values are `100 × (Ask1(t) − Ask1(reference at or before t−lag)) / Ask1(reference)` for lags **360, 390, …, 1230 seconds**. The remaining 34 are 17 weighted `ask/bid` depth ratios and 17 `(ask−bid)/(ask+bid)` depth imbalances for weight triplets `100,010,001,910,820,730,640,550,721,532,111,190,280,370,460,127,235`.
3. **No global imputation or future leakage.** Feature construction has no global mean, forward fill, backward fill, synthetic snapshot, or future lookup. Rows without full lookback are excluded and counted.
4. **Full-window future label only.** For 600 or 900 seconds, label `1` means the current best bid is greater than the minimum *actual future* best ask in `(t, t+horizon]`. A label is omitted unless observations continue through its endpoint. There is no final-ask fallback and no incomplete-tail label.
5. **Chronological offline folds.** Test windows are actual event-time rows in a 10-second window. Training candidates are from the prior 1,800 seconds; every training row whose `labelEnd >= firstTestTime` is purged. Training is deterministically capped at 2,500 chronologically spaced rows, never random sampled.
6. **No optimal-model claim.** The worker has no allocated inner, purged chronological selection fold. It reports fixed candidate comparisons but selects **no best model** from an outer test. Outer heldout results never choose a model.

## Models and metrics

When scikit-learn is available, the worker evaluates five inventory candidate families under fixed, bounded settings and deterministic seed `0`: Random Forest, Extra Trees, AdaBoost with bounded decision tree, Gradient Boosting, and SVC. The SVC family is rendered as `svc-rbf` and `svc-linear`, so the report has **six fixed configurations across five source families**. Tree ensembles use at most 10 estimators and depth 10; `n_jobs=1`; training is bounded to 2,500 rows. No grid search is performed.

Every model has chronological fold entries containing training/test time ranges and counts, purged rows, confusion matrix, precision, recall, balanced accuracy, ordinary label accuracy, and an outer-train majority baseline accuracy. These are **offline binary-label metrics only**:

> They are not trade accuracy, P&L, fill quality, win rate, calibrated probability, or a claim about the source’s “next 10 seconds.”

`probability` is always JSON `null`. Individual predictions and probabilities are deliberately absent.

## Success report fields

The parent-facing required fields are always present on success:

```text
kind, engine, instrument, source, generatedAt, snapshots, featureRows,
features, horizonSeconds, models, limitations, probability
```

`kind` is `orderbook-ml`, `features` is `64`, and `probability` is `null`. Additional fields disclose validation status, caller-rights status, source inventory rights/deployment findings, feature schema names (not values), gap statistics, label-tail exclusions, model-selection status, and methodological limits.

## Public functions

| Function | Contract |
|---|---|
| `validate_payload(payload)` | Returns normalized snapshots and metadata or raises `ContractError`. |
| `build_feature_rows(snapshots)` | Returns only full-lookback, causal 64-feature event-time rows. |
| `attach_future_labels(feature_rows, snapshots, horizon)` | Adds full-window offline labels; omits tail rows. |
| `build_outer_folds(rows, spec)` | Makes chronological 1,800s/10s folds and purges overlapping future labels. |
| `evaluate_fold(fold)` | Fits fixed candidates on outer train only and reports label metrics. |
| `run(payload)` | Returns the complete non-persistent JSON-ready report. |
| `main()` | Implements `--json` stdin/stdout transport. |

## Tests

```bash
cd /home/ubuntu/stratdesk/python
python3 -m unittest -v test_orderbook_research.py
```

Tests use an explicit **artificial unit-only book fixture**. They are not an analysis of real data or performance evidence. Coverage includes feature-prefix causality, future-label tail exclusion, invalid book order, strict chronology, no global feature imputation, heldout purge/no-leak partitioning, mandatory report fields, and OHLC rejection.
