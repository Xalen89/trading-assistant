# Statistical-Arbitrage-Pairs-Trading → Zax

**Decision: independently implement the useful research method in TypeScript; do not port this Python repository or use its bundled data/results as Zax evidence.** Zax already has OLS/Engle–Granger pairs work. The worthwhile addition is a paper-only, out-of-sample **Pairs Research** layer: formation/trading blocks, multiple-testing control, optional Johansen confirmation, dynamic-hedge experiments, and frank diagnostics. It should not add brokerage, orders, queue fills, or execution claims.

**Repository status and access.** At the 2026-10-18 snapshot, `nirajneupane17/Statistical-Arbitrage-Pairs-Trading` resolves at the requested URL. GitHub reports it as public, unarchived, not disabled, on `main`; the current tree is commit `4fc9c98d80394c249c83b504f245de88e863de4f`, pushed 2026-06-14. The full tree contains three Python source files at `src/`, five small notebooks, bundled CSVs, and images; it has no downloader, provider configuration, credentials, or dependency manifest. The latest commit only adds a dashboard image. This establishes the current paths and absence of an observed access restriction, but cannot establish a change relative to an unstated prior snapshot. [1] [2] [3] [14]

The actual `LICENSE` is MIT, copyright 2026 Niraj Neupane. It permits copying, modification, distribution, sublicensing and sale, provided the copyright and permission notice accompany all copies or substantial portions; it disclaims warranties. If any vendor code is copied, retain that full notice with the copied portion. An independent implementation of the published statistical ideas is cleaner for an Expo/TypeScript product and avoids copying the Python expression, notebooks, charts, and unprovenanced data. This is engineering guidance, not legal advice. [4] [5]

## What the repository actually implements

Its `engle_granger_test` logs no prices itself; callers supply series. It fits OLS with an intercept, defines `spread = y − βx`, then runs `adfuller` on residuals with `autolag='AIC'`; it marks `p < 0.05` cointegrated. `screen_pairs` first filters **log-price** correlation at 0.80, then the residual ADF result, and then retains `0 <` AR(1) half-life `≤ 60` trading days. The pair-selection notebook overrides the correlation screen to 0.85. Z-score normalization uses a 60-bar rolling mean and standard deviation. [6] [7]

The signal module holds a position after a z-score breach: long spread below −2, short above +2, exit at −0.5/+0.5 respectively, and flatten above absolute 4. It also provides a 60-bar rolling OLS beta and a scalar Kalman beta with `delta=1e-5`, `Ve=0.001`, initialized at zero. Those are usable *research baselines*, not validated production defaults. [8]

The repository does **not** implement the Johansen test despite advertising it: the source has no Johansen call and the cointegration notebook only calls `engle_granger_test` for four hard-coded pairs. It imports `statsmodels.coint` but does not invoke it. This distinction matters: Statsmodels’ `coint` is the augmented Engle–Granger test whose null is no cointegration and whose p-value is MacKinnon-based; the repository instead applies an ordinary residual ADF p-value. Zax should label the latter as a residual-stationarity diagnostic, not silently substitute it for the documented `coint` result. [6] [7] [9]

The backtest is daily-close arithmetic, not an execution simulator: return is `r1 − βr2`, prior-day signal is applied, and cost is `0.0005 × abs(signal change)` with a static hedge ratio and $1m default notional. It has no two-leg bid/ask model, borrow, availability, corporate-action/data validation, partial fill, venue, or queue model. The public result claims also conflict: the README lists Sharpe 0.82 and max drawdown −9.4%, while checked-in `key_results.json` gives 0.9766 and −3.98%. Do not import either as a Zax performance claim. [10] [1] [11]

## Recommended Zax addition

Build an owner-only **Pairs Research card**, fed by Zax’s existing historical-bar/import path, not by this repository. For every formation cohort, persist the precise input IDs and show: asset pair, aligned-observation count and gaps, adjusted-price provenance, formation/trading dates, OLS intercept and beta, Engle–Granger statistic/p-value, residual ADF diagnostic, half-life, current beta, z-score, position state, both-leg cost assumptions, and a clear paper-only label.

Use these initial **configurable, frozen-before-OOS** parameters:

- Form on 252 completed daily bars and paper-trade the next 63 bars without overlapping cohorts. Screen economic/sector peers, not merely high price correlation. For a universe scan, use augmented Engle–Granger with an intercept and AIC lag selection at 5%, then Benjamini–Hochberg correction across the pairs tested in that formation cohort. With a single owner-chosen pair, display raw p-value and omit FDR rather than pretending a family was tested. [9]
- Treat the repository’s 60-bar z-score, entry `±2`, exit `±0.5`, and stop `±4` as editable baseline scenarios. Place the paper position at the next bar, never on the bar used to calculate its z-score. Keep the repository’s half-life formula as one diagnostic; use a 5–60 bar eligibility/warning range rather than calling the observed thresholds universal.
- Offer static formation beta and 60-bar rolling OLS first. Put the Kalman variant behind an **experimental** toggle: calibrate process and observation variances on preceding formation data and show its intercept assumption and beta path. Its `1e-5`/`0.001` values are scale-dependent, so they must not become hidden universal defaults. [8]
- Add optional Johansen as a confirmation panel, not a substitute for pair-specific Engle–Granger. Record `det_order` and `k_ar_diff`; Statsmodels defines `det_order` −1/0/1 as no deterministic terms/constant/linear trend and returns trace and max-eigen statistics. Select lags before the trading block. [12]
- Paper P&L must charge both legs with owner-editable spread, commission, slippage, financing/borrow and hard-to-borrow scenarios. Flag missing bars, stale bars, splits/dividends, currency mismatches, unstable beta, and stop events. No broker connection, order ticket, trade queue, or fill claim belongs in this scope.

## Data, paid access, and API reality

No new API account or paid data plan is required to implement the module if Zax already accepts an owner-provided, legally usable CSV/history. The minimum input is two timestamp-aligned, corporate-action-adjusted daily price series plus instrument metadata and paper cost/borrow assumptions. A broader recurring equity universe needs an appropriately licensed source that can supply adjusted history; point-in-time constituents and delisting-aware history may require a paid entitlement. That is a data-policy choice for Zax, not a capability furnished by this repository.

The repository’s CSV is a fixed 20-US-equity, 2019–2024 demonstration set according to its README; the tree provides no acquisition script or source/provenance metadata. It cannot update a symbol later and should not be redistributed or treated as a licensed live feed. There is therefore **no repo market-data API authentication or rate-limit claim to repeat or verify**. If Zax ever calls the GitHub REST API only to inspect this public repository, GitHub documents an unauthenticated primary limit of 60 requests/hour per originating IP; Zax should not call GitHub at runtime for the strategy. [1] [2] [13] [14]

**Reuse boundary.** Preserve the source URL and MIT notice only if copying substantial vendor material. Preferred path: independently implement the methods above, cite the repository as inspiration in internal research notes, and do not copy the data, results, visual assets, or Python modules. This keeps the integration private, owner-only and PAPER-only while producing stronger evidence than a static example repository.

**References**

[1]: https://github.com/nirajneupane17/Statistical-Arbitrage-Pairs-Trading "Repository README and project overview"
[2]: https://api.github.com/repos/nirajneupane17/Statistical-Arbitrage-Pairs-Trading "GitHub repository metadata"
[3]: https://api.github.com/repos/nirajneupane17/Statistical-Arbitrage-Pairs-Trading/commits?per_page=10 "GitHub commit history"
[4]: https://raw.githubusercontent.com/nirajneupane17/Statistical-Arbitrage-Pairs-Trading/main/LICENSE "Repository MIT license file"
[5]: https://spdx.org/licenses/MIT.html "SPDX MIT license text"
[6]: https://raw.githubusercontent.com/nirajneupane17/Statistical-Arbitrage-Pairs-Trading/main/src/cointegration.py "Repository cointegration implementation"
[7]: https://raw.githubusercontent.com/nirajneupane17/Statistical-Arbitrage-Pairs-Trading/main/notebooks/02_cointegration_testing.ipynb "Repository cointegration notebook"
[8]: https://raw.githubusercontent.com/nirajneupane17/Statistical-Arbitrage-Pairs-Trading/main/src/signals.py "Repository signal implementation"
[9]: https://www.statsmodels.org/stable/generated/statsmodels.tsa.stattools.coint.html "Statsmodels augmented Engle Granger cointegration test"
[10]: https://raw.githubusercontent.com/nirajneupane17/Statistical-Arbitrage-Pairs-Trading/main/src/backtest.py "Repository backtest implementation"
[11]: https://raw.githubusercontent.com/nirajneupane17/Statistical-Arbitrage-Pairs-Trading/main/results/key_results.json "Repository checked in result summary"
[12]: https://www.statsmodels.org/stable/generated/statsmodels.tsa.vector_ar.vecm.coint_johansen.html "Statsmodels Johansen cointegration test"
[13]: https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api "GitHub REST API rate limits"
[14]: https://api.github.com/repos/nirajneupane17/Statistical-Arbitrage-Pairs-Trading/git/trees/main?recursive=1 "GitHub complete default branch tree"
