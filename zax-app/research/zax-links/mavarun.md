**Do not copy, port, wrap, or vendor Mavarun’s source.** `Mavarun/stat-arb-pairs` is currently public on GitHub, with `main` as the default branch, but its current tree has no `LICENSE`-named file, the GitHub repository metadata reports `license: null`, and its `pyproject.toml` has no license field. GitHub’s own guidance says that, without a license, default copyright applies and others may not reproduce, distribute, or create derivative works. The safe Zax decision is **independent clean-room implementation of the published statistical ideas only**, with no copied source, tests, prose, identifiers, or notebook material. This is an engineering recommendation, not legal advice. [1] [2] [3] [4]

**Fit for Zax.** The repository is an analysis/backtest research slice, not a live book: its baseline is daily KO/PEP adjusted-close Engle–Granger, z-score mean reversion, cost accounting, and a date-based walk-forward. It expressly disclaims live PnL. That matches Zax’s owner-only analysis and PAPER-only boundary, but Zax already has OLS/Engle–Granger pairs. The useful increment is therefore a **universe scanner and stricter paper-research protocol**, not a duplicate single-pair chart and never brokerage/order/queue-fill functionality. [1]

## Recommended Zax addition: Pairs Research v2

Add a local/PAPER workflow that accepts an owner-selected equity universe and an immutable daily adjusted-close snapshot. Align prices, retain provenance and the as-of timestamp, and require at least one formation-plus-trading sample before a result is eligible. Do not silently substitute synthetic data for a result labelled market data.

1. **Screen candidates in each formation window.** For every unordered pair, run Engle–Granger in both directions on price levels. Use the larger of the two p-values as the pair p-value, then apply Benjamini–Hochberg at `alpha = 0.05` across the whole universe. Present Johansen as a 95% trace-test confirmation badge only, not as a traded eigenvector or a claim that a VECM was used. The source uses `maxlag = 1` with no autolag by default for screening and `det_order = 0`, `k_ar_diff = 1` for Johansen; show all of these as visible, editable research parameters. Pair tests sharing a leg are dependent, so label FDR control as approximate rather than a guarantee. [5]

2. **Paper backtest selected pairs causally.** Start with static OLS because it is understandable and directly comparable to Zax’s existing pair module. Use `formation = 252`, `trading = 63`, frozen formation residual moments, `z_enter = 2.0`, `z_exit = 0.5`, a flat final bar, and next-bar PnL after the signal. The actual implementation advances the origin by 63 bars: trading blocks do not overlap, but the rolling 252-bar formation windows do. This corrects the uploaded shorthand that calls all 252/63 blocks non-overlapping. [6]

3. **Keep cost assumptions explicit.** The source defaults to 5 bps spread plus 5 bps slippage per leg and charges two legs on position changes: approximately 40 bps of gross notional for an entry-and-exit round trip. For a Zax paper result, make cost, borrow proxy, and timing assumptions required fields. Flag that this source has no borrow or locate, impact, taxes, cash-dividend treatment, or executable next-open/VWAP model; its close-derived signal makes the close execution assumption optimistic. [1] [6]

4. **Make dynamic hedge and nested tuning an Experimental comparison, not the default.** The published Kalman filter is a causal random-walk state `(alpha, beta)`, initialized by 60-bar OLS; it signals on the pre-update innovation z-score, then carries the filtered beta to the following bar. Its fixed defaults are `q_alpha = 1e-4`, `q_beta = 1e-6`; changing beta accrues a re-hedge charge. These scale-sensitive values must be recorded with the price units and not presented as universally portable constants. The optional nested version tunes only `q_beta` over `(1e-8, 1e-7, 1e-6, 1e-5, 1e-4)` within each outer formation window, using 84/21 inner windows and median window Sharpe; `q_alpha` remains fixed. [7] [8]

5. **Expose OU/ranking as diagnostics and risk controls.** The method estimates an AR(1) residual half-life and can use a three-half-life time stop. Its score is `-log(eg_p) / half_life` only within a 2–40 bar half-life band; candidates can be capped and equal-weighted. The repository’s own synthetic result says the time stop reduced net Sharpe in its tested setup, so leave it off by default and label it a risk-control experiment, not alpha. Note that the actual re-screen function defaults to ranking by `eg_p`, not the composite score. [1] [9]

Zax should show the selected universe, number of pair tests, both directional p-values, BH q-value, Johansen result, formation/trading dates, cost totals, turnover, drawdown, selected-pair count, and the full parameter snapshot. This makes the addition useful beside Zax’s current OLS/Engle–Granger functionality without implying live capability.

## Evidence limits and data requirements

The repository’s extended screen, Kalman, ranking, and nested-tuning results are seeded synthetic experiments. Its ordinary KO/PEP notebook tries Yahoo through `yfinance`, otherwise falls back to an explicitly synthetic CSV; no real-universe out-of-sample screen or bundled public tape is provided. Treat the method as a research design, not evidence of an equity edge. [1]

A credible Zax run needs **aligned, survivorship-aware daily price history with corporate-action treatment suitable for the chosen objective**, plus a stable symbol mapping and retained vendor/as-of metadata. It needs no broker, brokerage credential, order-routing API, or live book. An owner-provided/licensed CSV can support offline paper analysis without a Zax provider account. A provider-connected workflow requires that provider’s credentials and a plan/license covering Zax’s actual access, storage, and any display or redistribution; paid access is a market-data procurement issue, not an entitlement conveyed by this repository.

Do not adopt `yfinance`/Yahoo as the production data layer merely because the repository’s call has no API-key parameter. yfinance calls itself unaffiliated with Yahoo, intended for research/education, and says the Yahoo Finance API is for personal use only. Yahoo’s terms prohibit automated collection without prior permission and restrict commercial reuse. No durable Yahoo API rate-limit or production authorization is documented here, so do not promise one. [10] [11] The repository’s own loader requests `yfinance.download(..., auto_adjust=True)` and chooses adjusted close/close; it has no credential configuration. [12]

## Access and claim checks

The canonical checked repository location is `https://github.com/Mavarun/stat-arb-pairs` on `main`; it was public, unarchived, and enabled when checked on 2026-10-18. There is no current source-access restriction beyond GitHub’s public API controls: public data can be fetched unauthenticated, subject to 60 REST requests/hour per originating IP. That GitHub limit is only a source-inspection limit and has nothing to do with Zax market-data capacity. [2] [13]

One uploaded comparison claim is inaccurate: Composer’s current documentation says **all** API requests require a Key ID and Secret; most endpoints are limited to 25 requests per minute per API key and endpoint. Its listed 500 limit is for a specific portfolio-Symphony GET endpoint, not a public 500-requests-per-second backtest endpoint. Composer is not needed for this Zax integration. [14]

No vendor code was installed or run, no account/provider was registered, no user data was sent, and no Zax app source was touched during this research.

**References**

[1]: https://github.com/Mavarun/stat-arb-pairs "Mavarun stat-arb-pairs repository and README"
[2]: https://api.github.com/repos/Mavarun/stat-arb-pairs "GitHub REST repository metadata"
[3]: https://api.github.com/repos/Mavarun/stat-arb-pairs/git/trees/main?recursive=1 "GitHub REST main tree"
[4]: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository "GitHub licensing a repository guidance"
[5]: https://raw.githubusercontent.com/Mavarun/stat-arb-pairs/main/src/statarb/screening.py "Mavarun pair screening implementation"
[6]: https://raw.githubusercontent.com/Mavarun/stat-arb-pairs/main/src/statarb/formation.py "Mavarun formation backtest implementation"
[7]: https://raw.githubusercontent.com/Mavarun/stat-arb-pairs/main/src/statarb/kalman.py "Mavarun Kalman hedge implementation"
[8]: https://raw.githubusercontent.com/Mavarun/stat-arb-pairs/main/src/statarb/nested.py "Mavarun nested Kalman tuning implementation"
[9]: https://raw.githubusercontent.com/Mavarun/stat-arb-pairs/main/src/statarb/rank.py "Mavarun pair ranking implementation"
[10]: https://ranaroussi.github.io/yfinance/ "yfinance documentation and legal disclaimer"
[11]: https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html "Yahoo Terms of Service"
[12]: https://raw.githubusercontent.com/Mavarun/stat-arb-pairs/main/src/statarb/data.py "Mavarun price loader implementation"
[13]: https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api "GitHub REST API rate limits"
[14]: https://api.composer.trade/docs "Composer API documentation"

**Author:** Manus AI
