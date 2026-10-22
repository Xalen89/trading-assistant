# Alphalens for Zax

**Build an independent TypeScript “Factor Diagnostics” module; do not embed, run, or port Alphalens code into the Expo app.** It is a research evaluator for whether a *cross-sectional* score predicts later returns, not an execution engine, broker connector, live-quote service, pairs trader, or L2 fill simulator. Its documented workflow takes a caller-supplied factor series and price matrix, then produces returns, information-coefficient, turnover, and grouped analysis. That is a strong addition to Zax’s fixed-universe momentum and can evaluate a ranked ML probability or cross-asset trend score, while remaining PAPER-only. [3] [4]

## Status and fit

The supplied repository is still public, accessible, not archived, and not disabled; its default branch is `master`. Its most recent repository commit is dated 2020-04-27, despite later GitHub metadata activity. Treat it as an old, readable reference rather than a maintained runtime dependency. Its package declaration targets Python 2.7 and Python 3.4/3.5-era environments and pulls a Python scientific/plotting stack, which is a poor fit for an Expo/TypeScript application. [1] [7] [8]

There is no repository relocation or login restriction at the supplied URL as checked on 2026-10-18. One path detail matters for durable references: the root readme is `README.rst`, not `README.md`; the current root listing includes `LICENSE`, `README.rst`, `alphalens/`, `docs/`, and `setup.py`. [9]

Alphalens does **not** supply market data, a quote endpoint, brokerage access, or an Alphalens API whose authentication or rate limit Zax must configure. The documented API is a local data transformation over supplied factor and pricing inputs, and its dependencies are local scientific libraries. Any key, rate limit, redistribution right, latency claim, or paid plan therefore belongs to the separate price-data provider that Zax selects—not to Alphalens. [3] [8]

## Recommended Zax feature

Add a saved, reproducible **Factor Diagnostics** research card. It should accept a timestamped score for every member of a declared universe and aligned historical prices. It should explicitly record `scoreKnownAt`, `entryPriceAt`, bar interval, universe membership, price field, and any group classification. A score calculated at a bar close must use a pre-declared executable next-bar price convention rather than silently using information unavailable at decision time. Alphalens documents the supplied price at the factor timestamp as the buy price, so Zax should make its timing convention more explicit than the reference interface. [4]

For each as-of timestamp, independently rank the available assets and assign **five** equal-count quantiles. Five matches Zax’s current quintile momentum and Alphalens’ documented example/default. Do not manufacture a ranking when fewer than five distinct usable scores exist; mark that date unscorable and expose the reason. Use forward-return horizons measured in the current bar interval: a sensible daily starting set is `[1, 5, 20]` bars; for hourly crypto data, `[1, 24, 168]` is an alternative. These are Zax recommendations, not universal economic constants. Alphalens’ own documented default is `(1, 5, 10)`. [3] [4]

Ship these outputs first:

- Mean forward return by quintile and horizon; the equal-weight **Q5 minus Q1** spread; coverage; observation count; and a clearly labelled cumulative research series.
- Per-date, per-horizon **Spearman rank information coefficient** between score and forward return, plus its distribution and rolling/period summaries. This is Alphalens’ IC definition. [5]
- Top- and bottom-quintile constituent turnover and factor-rank autocorrelation. These reveal signal decay and trading churn that a headline Q5–Q1 result hides. The reference tear sheet explicitly computes both. [6]
- Optional factor-weighted, gross-one, dollar-neutral diagnostic returns. Keep equal-weight Q5–Q1 as the primary view so the existing quintile strategy is interpretable. The reference implementation’s long/short weights demean factor values and normalise absolute weights; its optional group-neutral mode first forms equal group contributions. [5]

Set `quantiles=5`, `bins=null`, `binningByGroup=false`, and `groupNeutral=false` by default. Enable group-neutral ranking/returns only when Zax holds a point-in-time group mapping and the user chooses it; a present-day sector/category label applied to history can leak. Keep forward-return outlier filtering **off**. The documented `filter_zscore` option filters using the forward-return distribution and explicitly warns that it introduces look-ahead bias. Replace the reference’s permissive `max_loss=0.35` default with a visible Zax data-quality gate (for example, warn above 10% dropped observations and show missing-score, missing-price, and insufficient-bucket counts). [4]

Do not report ordinary independent-sample significance for overlapping 5/20-bar returns. Display the horizon, overlap status, sample count, and data-quality exclusions. Any later confidence interval should use an overlap-aware method and a chronological holdout; this remains separate from Zax’s existing purged chronological ML workflow.

The feature complements rather than replaces current modules. Feed fixed-universe momentum directly as the score matrix. A cross-asset slow-trend forecast or decision-stump probability can also be ranked on each date. Pair residuals and Engle–Granger diagnostics are primarily time-series/pair tests, so they need a deliberately defined cross-pair score before this module is meaningful. Existing Coinbase book/inventory-quote research should use future **mid-price** labels if evaluated here; this module cannot establish queue position, fills, adverse selection from execution, or broker performance.

## Data, access, and cost

Zax needs, at minimum, timestamped factor values; a point-in-time universe; aligned historical close/mid/other declared price series that extend through the largest forward horizon; and instrument identifiers. Optional group-neutral analysis adds a historical group map. For equities, use corporate-action-adjusted prices and point-in-time membership/classifications; for crypto, persist venue, product/pair, quote currency, price type, and bar construction. These inputs can be user-imported or obtained from any licensed provider.

Alphalens itself imposes **no paid-data requirement** and includes no data entitlement. Free or existing data may be sufficient for a small PAPER-only exploratory universe, but commercial-quality history, adjustment history, complete delisted-asset coverage, and taxonomy data can require paid licenses. Before enabling fetches, Zax must verify the chosen provider’s authentication method, request caps, historical depth, redistribution/storage permission, and whether the exact price field is available. No provider account, key, or live feed is required for the local import-first version.

## Reuse and license decision

Use the published **method**, implemented independently from the documented input/output contract; do not copy Python functions, notebooks, plots, or source into Zax. This is the lowest-maintenance route for TypeScript and avoids incorporating a dormant Python dependency or its code into a private mobile app.

The actual repository `LICENSE` is Apache License 2.0 with a 2018 Quantopian copyright notice. If Zax later copies, translates, or otherwise incorporates Alphalens source, Apache 2.0 permits that use but any distribution must include the license, retain applicable copyright/patent/attribution notices, mark modified files, and carry any applicable `NOTICE` content. The current root listing has no `NOTICE` file, but dependency notices and the exact copied revision still need a release review. This is implementation guidance, not legal advice. [2] [9]

**References**

[1]: https://api.github.com/repos/quantopian/alphalens "GitHub repository metadata for quantopian alphalens"
[2]: https://raw.githubusercontent.com/quantopian/alphalens/master/LICENSE "Alphalens Apache License 2.0"
[3]: https://raw.githubusercontent.com/quantopian/alphalens/master/README.rst "Alphalens readme"
[4]: https://quantopian.github.io/alphalens/alphalens.html "Alphalens API documentation"
[5]: https://raw.githubusercontent.com/quantopian/alphalens/master/alphalens/performance.py "Alphalens performance implementation"
[6]: https://raw.githubusercontent.com/quantopian/alphalens/master/alphalens/tears.py "Alphalens tear sheet implementation"
[7]: https://api.github.com/repos/quantopian/alphalens/commits?per_page=1 "Latest Alphalens repository commit"
[8]: https://raw.githubusercontent.com/quantopian/alphalens/master/setup.py "Alphalens package requirements"
[9]: https://api.github.com/repos/quantopian/alphalens/contents "Alphalens root repository contents"
