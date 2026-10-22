# Hudson & Thames `example-notebooks`: safe use in Zax

**Do not copy, port, translate, or run this repository's notebook code.** The target repository is publicly readable and its current default branch is `main`; the relevant Chapter 7 path is `Cross_validation/Chapter7_Cross_Validation.ipynb`. The `main` tree contains no `LICENSE`-named file, and the repository metadata reports no license. The old `master` branch is not the current canonical path. A public GitHub repository without a license remains subject to default copyright: viewing and forking on GitHub do not grant reproduction, distribution, or derivative-work rights. [1] [2] [3]

The safe decision is therefore **an independent TypeScript implementation of published ideas, designed from first principles and separately tested**, not code reuse. Treat published formulae and method names as research inputs rather than copying notebook expressions, comments, cell order, test data, or outputs. This is a practical licensing assessment, not legal advice. It also avoids a dependency on the paid `mlfinlab` package: the notebooks import it, while Hudson & Thames currently markets commercial licensing and subscriber access to documentation/tutorial notebooks. [4] [5]

## Most useful additions to the existing PAPER-only Zax app

1. **Make the existing purged chronological ML/stump validation event-aware.** Chapter 7 stores a label's end time in `t1` (`samples_info_sets`) and evaluates `PurgedKFold(n_splits=10, pct_embargo=0.01)` with sample weights. [5] In Zax, persist `eventStart`, `eventEnd`, feature-lookback start, label version, and optional uniqueness weight for every training row. For each fold, independently implement: chronological test slice; removal of every training event whose full information interval overlaps a test interval; then an embargo after the test interval. This is useful only if the current purger does not already operate on actual label end times.

   The notebook's **10 folds and 1% embargo are examples, not universal settings**. Surface them as a sensitivity grid and record the selected split/embargo in each PAPER result. Set the operational embargo at least as long as the longest forward label horizon and any feature lookback that could leak; a fixed percentage alone is not a substitute for interval purging. Keep the final untouched chronological holdout. This adds a validity check to the existing stump rather than a more complex model.

2. **Offer optional triple-barrier labels for the classifier, not trading instructions.** Chapter 3 uses a 50-observation daily-volatility lookback, a symmetric CUSUM event filter with threshold equal to mean volatility, a one-day vertical barrier, and symmetric `pt_sl=[1,1]`; it then emits labels via `get_bins`. [6] An independent Zax labeler can parameterize these as `volLookback=50`, `eventThreshold=meanVol`, `maxHolding=1 day`, `takeProfitVol=1`, and `stopLossVol=1`, while retaining the exact hit timestamp as `eventEnd` for the purger.

   These are tutorial starting points only. For 24/7 assets, make the one-day horizon an explicit elapsed-time or bar-count choice. Barrier order cannot be inferred correctly from close-only bars; require intrabar high/low or finer timestamps and state the bar-path convention. Feed the resulting class probabilities into an analysis/PAPER confidence panel, never into a broker or exchange order path.

3. **Add a probability-quality and selection-bias panel to the existing decision-stump research.** Chapter 9 uses purged folds, `neg_log_loss`, and both grid and randomized search; its illustration uses two folds, 25 log-uniform draws, and an SVC search range of `C`/`gamma` from `1e-2` to `1e2`. [7] Do **not** carry over the SVC or its search range to a stump. Do carry over the principle: evaluate any stump threshold, feature set, class weighting, and probability calibration with purged out-of-sample log loss as well as accuracy; keep an experiment count. The cited numerical search settings are a reproducible notebook example, not suitable default parameters for Zax.

4. **Standardize PAPER backtest evidence across pairs, quintile momentum, inverse-vol trend, and inventory-quote research.** Chapter 14 covers drawdown, time under water, concentration, Sharpe, probabilistic Sharpe ratio (PSR), and deflated Sharpe ratio (DSR). [8] Add independently derived metrics to each run: net return series after modeled costs, max/quantile drawdown, time under water, return concentration, ordinary Sharpe, PSR using observed sample count/skew/kurtosis, and DSR using the number and dispersion of all strategy variants actually tried. The notebook's illustrative DSR input `sr_estimates=[sqrt(0.5),100]` is not a permissible Zax default; the trial count must be your real number of tests.

   Chapter 15's precision/frequency/stop-loss/take-profit relationships are suitable only as a **scenario calculator** in a PAPER risk screen. Its worked example assumes a 60% hit rate, 52 annual bets, symmetric ±2% exits, and target Sharpe 2. [9] Make all four values user-visible assumptions and avoid describing the output as a forecast or recommendation.

## Data and access requirements

An independent implementation needs no Hudson & Thames account, package, or paid dataset. It does need owner-controlled historical data with stable timestamps. Triple barriers require adjusted price paths at enough resolution to identify the first upper/lower hit; event labels require `t0` and `t1`; purging additionally requires feature lookback boundaries. Validation should retain the raw and cost-adjusted PAPER return series plus immutable run metadata. The L2 inventory-quote research needs timestamped depth updates and an explicit PAPER fill/cost model; this repository does not remove that high-quality data requirement.

If Zax's existing data license permits only display, do not reuse it for model training or derived analytics without checking that license. For equity data, account for corporate actions; for crypto, record venue, market, clock, bar construction, and outages. Keep all processing local to the private owner-only app. No provider registration, user-data upload, brokerage linkage, order construction, or execution is needed for any recommendation above.

## Verification of the Composer claim in the uploaded scope

The scope's description of a **public, 500-requests/second backtest endpoint** is not safe to repeat. Composer's official API docs require a Key ID and Secret for all requests and say rate limits are per API key, per endpoint, per minute, with most endpoints at 25 requests/minute. [10] Its official help article also requires a Composer Pro account and credentials, but separately states 1 request/second for most endpoints and 500 requests/second for `POST /api/v0.1/symphonies/{symphony-id}/backtest`. [11] These official rate-limit descriptions conflict, and neither makes the endpoint public/unauthenticated. Do not integrate Composer into Zax's PAPER-only scope; in any later evaluation, obtain written current limits and keep credentials off the Expo client.

**References**

[1]: https://github.com/hudson-and-thames/example-notebooks "Hudson and Thames example notebooks repository"
[2]: https://api.github.com/repos/hudson-and-thames/example-notebooks/git/trees/main?recursive=1 "Repository main tree API"
[3]: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository "GitHub licensing a repository"
[4]: https://hudsonthames.org/mlfinlab/ "Hudson and Thames MlFinLab product page"
[5]: https://github.com/hudson-and-thames/example-notebooks/blob/main/Cross_validation/Chapter7_Cross_Validation.ipynb "Chapter 7 cross validation notebook"
[6]: https://github.com/hudson-and-thames/example-notebooks/blob/main/Labeling/Chapter3_Labeling.ipynb "Chapter 3 labeling notebook"
[7]: https://github.com/hudson-and-thames/example-notebooks/blob/main/Cross_validation/Chapter9_Hyperparameter_Tuning_with_CV.ipynb "Chapter 9 hyperparameter tuning notebook"
[8]: https://github.com/hudson-and-thames/example-notebooks/blob/main/Backtesting/Chapter14_Backtest_Statistics.ipynb "Chapter 14 backtest statistics notebook"
[9]: https://github.com/hudson-and-thames/example-notebooks/blob/main/Backtesting/Chapter15_Understanding_Strategy_Risk.ipynb "Chapter 15 strategy risk notebook"
[10]: https://api.composer.trade/docs/index.html "Composer API documentation"
[11]: https://help.composer.trade/article/236-getting-started-with-your-composer-api "Composer API getting started"
