# Purged cross-validation for Zax

**Implement a small, independently written TypeScript splitter for the supervised forward-return classifier; do not import or wrap this Python package in Expo.** It strengthens Zax's existing purged chronological ML/stump research by making each fold explicit, auditable, and consistent with a paper-only research workflow. It does not add brokerage execution, order routing, queue-fill modelling, or a data-provider dependency.

## Repository and license status

The requested path, `danielfzhang-clearmind/purged-cross-validation`, was reachable and public when checked on **2026-10-18**. It is on `main`, is not archived, and has no observed path redirect or access restriction. Its history contains only an initial commit and a release commit on 2026-09-25.[1] [2]

Treat it as a **stale, non-fork snapshot rather than the upstream supply-chain source**. Its manifest names **Evgenii Lazarev** as author, version `0.1.7`, and points its homepage, repository, documentation, and issues to `eslazarev/purged-cross-validation`.[3] The cited repository's README also links its CI, documentation, examples, and package pages to that same owner. The canonical public repository was updated later, and PyPI lists `purgedcv 0.1.11` released on 2026-10-16.[4] [5]

The **actual `LICENSE` file** in the requested repository is MIT, with `Copyright (c) 2026 Evgenii Lazarev`—not merely an MIT badge. It permits use, modification, distribution, sublicensing, and sale, provided the copyright and permission notice accompany all copies or substantial portions.[6] This supports reuse, but does not make the stale snapshot the preferred origin. This is an engineering recommendation, not legal advice.

## Applicable method and Zax design

Purging removes a candidate training row when its information interval overlaps a held-out row's interval. An overlapping forward-return label can otherwise put part of the same future outcome in train and test. An embargo is a separate post-test buffer for remaining serial dependence; it is a design choice, not a proof of independence.[7]

For Zax, apply this **first to the forward-return decision-stump/classifier**, and later only to other modules if they tune or learn against overlapping forward returns. It is not a replacement for Engle-Granger/OLS pair formation, fixed-universe quintile momentum, inverse-vol trend construction, or the paper-only Coinbase inventory-quote research. Keep the final paper simulation separate from validation and do not reuse its holdout for model or threshold selection.[7]

Use the following narrow contract for every labelled classifier row:

- `featureStart`: earliest bar used by any feature in the row, including the longest lookback.
- `decisionTime`: timestamp at which the paper signal would be known.
- `labelEnd`: timestamp at which the forward-return label is fully known.
- Treat the information interval as **`[featureStart, labelEnd)`**. Remove every candidate training row whose interval intersects a test interval. This follows the package's example, which supplies the first feature day as the interval start and uses half-open label horizons.[5]

**First Zax configuration.** On the pre-holdout development history, use an expanding walk-forward splitter with `nSplits = 5`, `testSize` equal to the intended retraining/deployment block (for a daily experiment, start with 20 trading bars), `predictionTimes = featureStart`, and `evaluationTimes = labelEnd`. The final latest block of the same size remains an untouched chronological holdout. With full information intervals already represented, use no extra symmetric padding initially (`purgeHorizon = 0` in a parameterized implementation); record the actual lookback and forward horizon with every result. Re-run with one additional padding equal to the forward-label horizon as a robustness sensitivity, rather than claiming a universal embargo length.

This is deliberately **walk-forward**, not ordinary `KFold`: its training data are strictly earlier than each test fold, which matches a model trained only on information available then. The upstream API documents that a post-test embargo is a no-op in this layout, so Zax should not expose a misleading embargo control for this mode.[8] For a sliding regime, retain the same rules but require an explicit `trainSize` and show it in the experiment metadata.

A secondary, clearly labelled robustness view may use Purged K-Fold with `nSplits = 5`. It has contiguous test blocks but trains on both sides of an interior test block, so it is not the primary production-like score. If used, expose exactly one embargo mode (`embargo` in time, `embargoObservations`, or `embargoFraction`) and evaluate a predeclared sensitivity set of **0, 1H, and 2H** observations, where `H` is the label horizon. Do not select the best-looking embargo after seeing results. The package documents those modes as mutually exclusive.[5] [8]

Defer CPCV until Zax genuinely searches many feature/threshold/model variants and has enough data per block. A bounded diagnostic configuration is `nSplits = 6`, `nTestGroups = 2`, which creates `C(6,2) = 15` test combinations; it should report the distribution across paths, not describe those paths as independent trials. CPCV is useful for research robustness but is more complex than the immediate classifier fix.[7] [8]

## Safe implementation and verification

Write the interval-overlap splitter and a fold-audit in TypeScript from the published method, with no copied Python source. The audit should persist fold boundaries, kept/purged row counts, `featureStart`/`labelEnd`, selected parameters, and assertions that no retained training interval intersects a test interval. Add deterministic fixtures for: boundary-touching half-open intervals, overlapping labels, feature lookbacks, empty/purged folds, and strictly chronological walk-forward folds. This is a clean implementation approach, avoids bringing a Python/NumPy/pandas/scikit-learn runtime into Expo, and avoids relying on the cited snapshot. The package itself declares Python 3.10+ and those scientific Python dependencies.[3]

If Zax later copies any material code or tests, use the canonical upstream at a pinned commit or release, preserve the full MIT notice and Lazarev copyright, record the source/version in the repository's third-party notices, and check the upstream license again at upgrade time. Do not claim that tests against the package establish trading performance; purging cannot repair future-aware features, preprocessing fitted before a fold, or a reused holdout.[7]

## Data, access, and cost requirements

No `purgedcv` account, provider registration, API key, paid plan, or user-data upload is required for the recommended local implementation. It needs only Zax's already available, time-ordered historical inputs plus the per-row feature start and label end. Missing/out-of-order bars, undefined labels at the end of a dataset, and features that accidentally use future values must be rejected before splitting.

The validation code makes **no network requests at runtime**. If Zax separately refreshes Coinbase public market data, Coinbase documents public REST limits of **10 requests/second per IP** with bursts to **15**, while private endpoints are authenticated and are unnecessary for this paper-only feature.[9] [10] The uploaded claim about a different service's 500 req/s endpoint was not relied upon. If a build process checks GitHub metadata, public unauthenticated REST access is 60 requests/hour per IP; authenticated access is 5,000/hour, but no GitHub authentication is needed by the feature.[11]

**References**

[1]: https://api.github.com/repos/danielfzhang-clearmind/purged-cross-validation "GitHub repository metadata for requested path"
[2]: https://api.github.com/repos/danielfzhang-clearmind/purged-cross-validation/commits?per_page=10 "GitHub commit history for requested path"
[3]: https://raw.githubusercontent.com/danielfzhang-clearmind/purged-cross-validation/main/pyproject.toml "Requested repository package manifest"
[4]: https://api.github.com/repos/eslazarev/purged-cross-validation "Canonical repository metadata"
[5]: https://pypi.org/project/purgedcv/ "Purgedcv package index project page"
[6]: https://raw.githubusercontent.com/danielfzhang-clearmind/purged-cross-validation/main/LICENSE "Requested repository MIT license file"
[7]: https://eslazarev.github.io/purged-cross-validation/methodology/ "Purgedcv methodology"
[8]: https://eslazarev.github.io/purged-cross-validation/api/splitters/ "Purgedcv splitter API"
[9]: https://docs.cdp.coinbase.com/exchange/rest-api/rate-limits "Coinbase Exchange REST rate limits"
[10]: https://docs.cdp.coinbase.com/exchange/rest-api/authentication "Coinbase Exchange REST authentication"
[11]: https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api "GitHub REST API rate limits"
