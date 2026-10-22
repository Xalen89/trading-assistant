## Recommendation

Use **an independent TypeScript implementation of the relevant published methods**, not the scikit-learn package or copied implementation code, for Zax. Scikit-learn is a Python module with Python, NumPy, SciPy, Narwhals, joblib, and threadpoolctl dependencies; it is not directly importable by an Expo/TypeScript app. A Python service or native bridge would add a second runtime and an owner-data processing boundary without addressing Zax's stated paper-only research need. [2]

The BSD 3-Clause license would permit selective source reuse, including modification, if redistributed source retains the copyright, conditions, and disclaimer, and neither scikit-learn's nor contributors' names are used to endorse Zax. The actual repository license is **`COPYING`**, not a badge-based inference; it currently says “BSD 3-Clause License.” [1] Independent implementation is still cleaner: retain a short method/provenance note, avoid a Python deployment, and avoid pulling owner data through a new service.

## Best fit with the supplied Zax scope

**1. Strengthen the existing purged chronological classifier validation; do not replace it with ordinary random CV.** Scikit-learn's `TimeSeriesSplit(n_splits=5, max_train_size=None, test_size=None, gap=0)` is an expanding, chronological splitter. It requires equally spaced samples for comparable folds, and `gap` excludes that number of samples from the end of every training fold. [4] Use its behavior as a UI/reference model, but preserve Zax's existing purging when forward labels overlap: a plain bar-count gap does not know each label's actual end time.

For every saved paper experiment, expose and persist `nSplits`, `testSize`, `maxTrainSize`, and `gap`. Set `gap` to at least the forward-label horizon in bars when labels are contiguous and equally spaced; also remove any training observation whose label interval overlaps a test interval. This produces a useful fold inspector—formation/train range, embargoed range, test range, sample counts—without introducing any orders, queues, or brokerage connection.

**2. Make the present decision stump a controlled benchmark rather than a black box.** Keep `maxDepth: 1`. Add independently implemented equivalents of `criterion: 'gini' | 'log_loss'`, `minSamplesLeaf`, a fixed `randomState`/seed for reproducibility, and optional balanced class weights. In scikit-learn, `class_weight='balanced'` weights classes inversely to their observed frequency; `min_samples_leaf` requires enough training cases on both sides of a split; and fixed `random_state` is necessary for deterministic fitting where tied splits occur. [3] Sweep these only inside chronological training folds, then report the threshold, direction, leaf support, class weights, and fold-by-fold out-of-sample result. Do not silently grow a deeper tree: unbounded defaults can create fully grown, potentially large trees. [3]

**3. Add out-of-fold probability calibration for the paper signal, not a trading trigger.** Use the `CalibratedClassifierCV` pattern as a method reference: generate predictions strictly from Zax's custom purged chronological folds, fit a two-parameter **sigmoid/Platt** calibrator on those out-of-fold scores, then refit the stump on the permitted prior window and transform only its displayed research probability. This is analogous to `method='sigmoid'`, `cv=<custom purged splitter>`, and `ensemble=False`; the latter uses cross-validated unbiased predictions for calibration and trains the base estimator on all supplied training data. [5] Do **not** accept the class default `cv=None`, because it selects 5-fold stratified CV for classification rather than Zax's time-aware splitter. [5] Avoid isotonic calibration when the calibration sample is far below 1,000; the official documentation says it tends to overfit then. [5]

This scope is additive. It does not replace Zax's OLS/Engle–Granger pairs, fixed-universe quintile momentum, inverse-volatility trend, or Coinbase-book inventory-quote research. It most directly upgrades the existing purged chronological ML/stump workflow with auditable split geometry, imbalance handling, and probability honesty.

## Data, cost, and access

Scikit-learn supplies algorithms, not market data, exchange connectivity, brokerage execution, or a hosted inference API. Zax needs locally controlled, time-indexed research data: feature values available at decision time, timestamp, instrument, binary/multiclass forward label, and each label's end time or horizon. For book-derived classification this means historical L2 snapshots/deltas sufficient to construct those features and labels; for bar models it means timestamped bars with the same fields. More coverage or depth may require a paid data vendor, but **no paid scikit-learn access, GitHub account, brokerage account, provider registration, or user-data upload is required** for the recommended independent implementation. [2]

The canonical repository URL and raw `main/COPYING` path were reachable during this review. Its README identifies `https://github.com/scikit-learn/scikit-learn` as the official source and publishes the standard Git clone URL. [2] Do not make Zax depend on live GitHub access: vendor neither code nor models at runtime. If an owner-only maintenance tool later reads GitHub's public REST API, authentication is optional for public data but the documented primary limit is **60 requests/hour per originating IP** unauthenticated and **5,000 requests/hour** for a personal access token; GitHub also imposes secondary limits. [6] No token, data upload, or runtime API call is needed for this recommendation.

## Reuse decision

**Decision: independent implementation of methods; no vendor-code execution and no direct source reuse by default.** The license makes narrow reuse legally possible with retained notices and disclaimer, but it is a poor technical fit for Expo/TypeScript. If a future non-Expo Python research worker is deliberately introduced, pin a reviewed release/commit, retain the complete BSD notice in distributions, document the version, and keep all market data and outputs owner-controlled. Keep the integration strictly analysis and PAPER-only: render research probabilities and validation results, never connect them to broker order placement.

**References**

[1]: https://raw.githubusercontent.com/scikit-learn/scikit-learn/main/COPYING "scikit-learn actual BSD 3-Clause license file"
[2]: https://raw.githubusercontent.com/scikit-learn/scikit-learn/main/README.rst "scikit-learn repository README and dependencies"
[3]: https://scikit-learn.org/stable/modules/generated/sklearn.tree.DecisionTreeClassifier.html "DecisionTreeClassifier parameters and behavior"
[4]: https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html "TimeSeriesSplit parameters and chronological folds"
[5]: https://scikit-learn.org/stable/modules/generated/sklearn.calibration.CalibratedClassifierCV.html "CalibratedClassifierCV methods and calibration cautions"
[6]: https://docs.github.com/rest/using-the-rest-api/rate-limits-for-the-rest-api "GitHub REST API rate limits"
