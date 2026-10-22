# MlFinLab for Zax

**Decision — do not reuse MlFinLab code or make it a Zax runtime dependency.** Use a clean-room, TypeScript-friendly implementation of the published *methods* below for Zax’s private PAPER research workflow, with legal review if needed. The current official GitHub repository is public, on `master`, and not archived, but its README says it exists solely for issues. The publicly visible cross-validation, labeling, sampling, filtering, fractional-differentiation, and codependence files expose interfaces and docstrings but contain `pass` bodies rather than runnable implementations. It is therefore neither an open-source codebase nor a usable free fork. [1] [2] [5] [6] [7] [8] [9] [10]

This is a useful **research design reference**, especially for Zax’s purged chronological ML/stump and Coinbase-book classifier research. It is not a replacement for the existing OLS/Engle–Granger pairs work, fixed-universe quintile momentum, inverse-volatility trend logic, real-book analysis, or the explicit no-broker/no-order policy.

## What to adopt first

1. **Interval-aware Purged K-Fold for all forward-labelled classifiers.** MlFinLab’s `PurgedKFold` interface requires `n_splits`, `samples_info_sets`, and `pct_embargo`; the interval series indexes information-start times and stores information-end times. It is designed to remove training observations whose intervals overlap a contiguous test interval. [5]

   For Zax, make every research row carry `featureStartTs`, `decisionTs`, `infoEndTs`, `symbol`, `featureVersion`, and `labelVersion`. `infoEndTs` must be the first exit/barrier time or final horizon, not merely the decision timestamp. Purge any overlap across this full interval and embargo the first post-test observations that can still share information. Start with **5 chronological folds** only when each fold has adequate events; otherwise use **3**, which is MlFinLab’s documented default. Do not shuffle. Do not leave embargo at the documented default of `0`; derive it from the longest remaining dependency, expressed transparently as `embargoBars / eligibleRows`. Save the effective bar/time embargo in each result.

   This directly upgrades Zax’s existing purged chronological evaluation. It does **not** turn the decision stump into a better model; it makes the out-of-sample claim harder to leak. For multi-symbol research, apply the same interval rule across every symbol feature set rather than concatenating rows and assuming timestamps alone prevent leakage. MlFinLab describes stacked versions for multi-asset data, but Zax can implement the same split contract independently. [5]

2. **Triple-barrier labels for the forward-return and L2 classifiers.** The public interface specifies event times, an ex-ante `target` series, `pt_sl=[profitTargetMultiple, stopLossMultiple]`, `min_ret`, optional `vertical_barrier_times`, and optional `side_prediction`. It returns the first barrier time `t1`; with a supplied side, bins become the binary meta-label “take/pass,” otherwise the outcome can be −1/0/+1. [7]

   Use this only as an alternative label profile, not a retroactive rewrite of prior Zax results. Every profile should expose: `eventFilter`, `targetVolLookback`, `ptMultiple`, `slMultiple`, `minRet`, `verticalHorizonBars`, `feeBps`, `slippageBps`, and `sideSource`. Compute target volatility and all inputs using data available at `decisionTs` only. A sensible neutral initial sensitivity test is `pt_sl=[1,1]`; it is a test point, not a recommended production setting. The vertical horizon must match the bar/book horizon under study, so no universal minute or bar count is justified before the symbol and cadence are supplied.

   For the Coinbase-book classifier, label the **mid-price outcome after the decision snapshot** and preserve the raw snapshot/event timestamp. The technique helps evaluate imbalance features without pretending to model queue priority, fills, or exchange orders. It remains PAPER-only.

3. **CUSUM event sampling, then uniqueness weights or sequential bootstrap.** The symmetric CUSUM interface accepts a close or other time series and either a fixed or time-varying `threshold`; it avoids repeated triggers while a series hovers near a threshold. [8] Use `threshold = k × causal volatility` as a *profile parameter* and validate `k` only inside the training fold. The same source set describes label concurrency, average uniqueness, an indicator matrix derived from event intervals and price bars, and sequential-bootstrap controls `sample_length`, `warmup_samples`, and deterministic `random_state`. [9]

   This is appropriate after triple-barrier events exist. Weight model fitting and score aggregation by average uniqueness, or sample with sequential bootstrap, so a dense cluster of overlapping labels does not count as many independent observations. Keep the original event IDs and report unweighted as well as weighted scores.

4. **Use CPCV as a robustness report, not the default loop.** `CombinatorialPurgedKFold` adds `n_test_splits` to `n_splits`, interval data, and embargo. [6] After the baseline has passed ordinary Purged K-Fold, a practical research candidate is **CPCV(6,2)**: it has 15 test-fold combinations, so it is materially costlier but remains understandable. Treat the distribution of path/fold outcomes as the result; never select the best path. Do not use CPCV on a small event sample simply to manufacture more backtests.

5. **Apply the remaining methods selectively.** Fractionally differentiated features have a differencing order `d` and a cutoff `thresh`; the fixed-width version is explicitly offered for efficiency. [10] For price-level features, select the smallest `d` from a predeclared grid that meets a training-fold stationarity rule, then freeze it for the test fold. Do not fractionally differentiate returns merely because the tool exists.

   For pair-universe exploration, mutual information and variation of information offer `n_bins`, normalization, and estimator choices including `standard`, `standard_copula`, and `copula_entropy`. [11] Use normalized mutual information only as a **nonlinear dependence shortlist** before the existing Engle–Granger test; it does not establish cointegration and should not replace OLS hedge-ratio, ADF, or multiple-testing controls.

   For the already parameterized trend/momentum/pairs research, add a robustness card rather than another signal: the documented probabilistic and deflated Sharpe functions take observed Sharpe, number of returns, skewness, kurtosis, and, for DSR, Sharpe estimates across the actually tried variants. The documented 0.95 and `alpha=0.05` conventions are reasonable display thresholds if precommitted. [12] Record every trial before choosing a winner; otherwise DSR inputs are incomplete.

## Access, licensing, and integration constraints

MlFinLab is **proprietary, all rights reserved**. Its actual `LICENSE.txt` grants a non-exclusive license for use inside the licensee’s internal business environment but prohibits sharing/distribution and restricts API/data/forecast services outside sole internal activity without written authorization. A private owner-only Zax deployment does not make the GitHub code open source. [3]

The official sales page currently lists a Business tier at **£100 plus VAT per month per user**, says that a commercial-use license and documentation/tutorial notebooks are unlocked by subscription, and lists a broader Enterprise option. [4] The actual license text has a material naming defect: several definitions call the agreement and licensed material **ArbitrageLab**, not MlFinLab. Obtain written Hudson & Thames confirmation that the current MlFinLab SKU, deployment model, permitted users/devices, and any internal backend/API are covered before paying or integrating. This is a commercial/legal diligence point, not legal advice. [3]

A paid vendor route would also be architecturally awkward. The public package metadata declares Python, requires Python `>=3.6,<3.9`, and pulls a Python scientific stack rather than TypeScript/Expo dependencies. [13] It cannot run in the Expo client. A Python worker behind Zax would be a separate licensed deployment, and the license’s API limitation must be cleared in writing even if the endpoint is owner-only.

Do not assert an MlFinLab hosted API authentication scheme or request-rate limit: the authoritative materials reviewed describe a local Python package and subscription access, not a public hosted market-data or execution API. They also do not describe brokerage connectors, order submission, queue/fill simulation, or a market-data entitlement. The public license does state that vendor webhooks verify user/authentication, installation, daily usage, function calls, and source modifications; it says no proprietary licensee data passes through those events. That claim was not runtime-tested because no package was installed. Under Zax’s no-user-data/no-vendor-code constraint, do not install the package or permit outbound telemetry without a separate approved review. [3] [4] [13]

The public package metadata says version 1.3.0, while the current product page calls the product version 1.7.1. Combined with the issue-only README and stubbed source paths, that mismatch is another reason to treat the public repository as a tracker/reference rather than a distribution channel. [2] [4] [13]

## Recommended Zax path and requirements

Implement the interval contract, triple-barrier label profile, purged evaluation, and cost-aware PAPER scorecard independently. Keep all computations local to Zax’s existing private analysis environment. Use the original publications/mathematical descriptions and independently written tests; do not copy repository code, comments, tests, or notebook material. Have counsel assess the clean-room plan in the relevant jurisdiction before release, especially because a technique may be published while particular code, documentation, branding, and commercial terms remain protected.

The independent path needs no MlFinLab subscription, account, API key, provider registration, or paid market-data entitlement. It does need Zax-held, time-ordered data: point-in-time OHLCV or mid-price bars for the chosen symbol; retained L2 snapshots/events for book features; an auditable fee/slippage profile; and enough history that each chronological test fold contains meaningful events. Data must preserve exchange timestamps and gaps. Parameters such as barrier multipliers, CUSUM threshold multiplier, horizon, fractional `d`, fold count, and embargo must be selected within training data or nested validation, then reported alongside the final holdout. No brokerage execution, order-routing code, queue-fill claims, or provider/user data transfer is required or recommended.

The premium documentation endpoint was not anonymously readable through the permitted text-fetch path during this review. The official product page nevertheless says subscription unlocks its documentation and notebooks; therefore no unavailable premium example was treated as evidence. [4]

**Author:** Manus AI  
**Research date:** 2026-10-18

## References

[1]: https://api.github.com/repos/hudson-and-thames/mlfinlab "GitHub repository metadata"
[2]: https://raw.githubusercontent.com/hudson-and-thames/mlfinlab/master/README.md "MlFinLab repository README"
[3]: https://raw.githubusercontent.com/hudson-and-thames/mlfinlab/master/LICENSE.txt "MlFinLab actual license text"
[4]: https://hudsonthames.org/mlfinlab/ "Hudson and Thames MlFinLab product page"
[5]: https://raw.githubusercontent.com/hudson-and-thames/mlfinlab/master/mlfinlab/cross_validation/cross_validation.py "Public PurgedKFold interface"
[6]: https://raw.githubusercontent.com/hudson-and-thames/mlfinlab/master/mlfinlab/cross_validation/combinatorial.py "Public combinatorial cross-validation interface"
[7]: https://raw.githubusercontent.com/hudson-and-thames/mlfinlab/master/mlfinlab/labeling/labeling.py "Public triple-barrier labeling interface"
[8]: https://raw.githubusercontent.com/hudson-and-thames/mlfinlab/master/mlfinlab/filters/filters.py "Public event-filter interface"
[9]: https://raw.githubusercontent.com/hudson-and-thames/mlfinlab/master/mlfinlab/sampling/bootstrapping.py "Public sequential-bootstrap interface"
[10]: https://raw.githubusercontent.com/hudson-and-thames/mlfinlab/master/mlfinlab/features/fracdiff.py "Public fractional-differentiation interface"
[11]: https://raw.githubusercontent.com/hudson-and-thames/mlfinlab/master/mlfinlab/codependence/information.py "Public information-theory codependence interface"
[12]: https://raw.githubusercontent.com/hudson-and-thames/mlfinlab/master/mlfinlab/backtest_statistics/statistics.py "Public backtest-statistics interface"
[13]: https://raw.githubusercontent.com/hudson-and-thames/mlfinlab/master/setup.cfg "Public package configuration"
