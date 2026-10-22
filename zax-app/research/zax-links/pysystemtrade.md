Do **not** integrate pysystemtrade as a dependency, service, or connector in Zax. The useful result is an **independently written TypeScript implementation of the published EWMAC trend and portfolio-risk method**, run only against Zax’s approved historical data and producing paper research outputs. That extends Zax’s existing inverse-volatility slow trend without adding broker orders, queue/fill claims, credentials, or a Python runtime.

## Repository status and legal decision

The exact current repository is [`pst-group/pysystemtrade`](https://github.com/pst-group/pysystemtrade), not an old `robcarver17` path. Its README says it moved to the `pst-group` organisation in January 2026; the public GitHub metadata currently reports `develop` as the default branch, `archived: false`, and `private: false`. The public pages and raw files were reachable anonymously during this research; there was no observed repository-access restriction. It is not distributed on PyPI; upstream documents Git installation instead. [1] [3]

The actual `LICENSE` file was inspected. It is the **GNU General Public License, version 3 (GPL-3.0)**, not a permissive licence. GPLv3 permits private running and modification, but conveying a covered or derivative application brings source-availability and same-licence obligations. A private owner-only deployment may not be a conveyance, but that is not a dependable product architecture or a substitute for legal advice. Do not copy, translate/port, link against, or paste upstream Python into Zax. This is a conservative engineering decision for a private Expo/TypeScript application that could later be shared. [2]

The upstream project is explicitly a Python backtesting and **fully automated futures-trading** engine for Interactive Brokers. Its production guide includes broker price/account/fill functions, MongoDB and Parquet storage, and order-stack machinery. That scope is materially broader than Zax’s paper-only research remit, and its Python, database, broker, and operating requirements would add risk without providing a needed capability. [1] [8]

> **Reuse decision:** use the documented, general financial method as a research reference only; write a fresh TypeScript implementation and tests from the mathematical specification below. Do not reuse upstream source, configuration, data files, broker adapters, or production components.

## A useful Zax addition: volatility-normalised EWMAC trend

Upstream’s EWMAC rule is a compact addition to Zax’s existing slow trend. For a daily stitched/adjusted price series \(P_t\), calculate

```
raw_t = EWMA(P, span=Lfast)_t - EWMA(P, span=Lslow)_t
signal_t = raw_t / forwardFill(daily price-unit volatility_t)
```

The inspected implementation explicitly uses **daily price-unit volatility, not percentage volatility**, then applies forecast scaling/capping elsewhere. Its example configuration uses `Lfast/Lslow` pairs **8/32** and **16/64**, scales them by **5.3** and **7.5**, and caps the combined forecast at **21**. The general defaults instead use a cap of **20**. These are upstream example/default values, not validated Zax settings. [4] [5] [6]

For a first paper-only Zax Trend Lab, expose three selectable, independently implemented rule variants: **8/32, 16/64, and 32/128 business-day spans**. Start with 16/64 as the primary slow signal because it is an upstream example, and reserve 8/32 as a faster comparison. The backtesting guide itself shows 16/64, 32/128, and 64/256 as rule variations. Do not optimise spans on the full sample: choose the small family before testing, fit any scale only in training windows, and retain Zax’s chronological/purged evaluation discipline. [5] [7]

Use the exact output sequence below, which is sufficient for an auditable paper widget and deliberately avoids order generation:

1. Ingest a Zax-approved, timestamped daily close series. For futures, use a documented adjusted continuous series for the **signal**; retain underlying-contract/roll metadata rather than pretending the series is a tradable price.
2. Estimate daily price-unit volatility from returns. The upstream default is a 35-day mixed estimator with at least 10 observations, a 10-year slow component, and 30% slow-vol weight. Treat that as a disclosed baseline candidate, not a promised best estimator. If Zax estimates percentage-return volatility, convert consistently to price units before normalising the price-difference EWMAC numerator. [4] [6]
3. Compute each EWMAC signal from only information available at that timestamp. Multiply by a scale estimated from prior training data, then clip to a visibly disclosed cap; begin with a cap of 20 as an upstream-default sensitivity point. Show the unclipped signal, scaled signal, cap status, and warm-up/missing-data state.
4. Combine the selected rule forecasts with fixed equal weights for the first version. Record the spans, scale-training window, cap, volatility settings, data vintage, and rebalance calendar with every paper result. Avoid importing upstream forecast scalars or diversification multipliers as universal constants.
5. Keep Zax’s existing inverse-vol weighting, then add a portfolio-volatility view: preliminary weights proportional to \(1/\sigma_i\), a correlation-aware estimated portfolio volatility \(\sqrt{w^T\Sigma w}\), and a paper-only scale to a **user-selected** annual risk target. Report it as target exposure/weights and simulated turnover/P&L, never as orders, fills, leverage available, or executable inventory.

This is genuinely incremental over Zax’s present inverse-vol slow trend: it makes the trend signal volatility-normalised before the allocation stage, supports a predeclared speed family, distinguishes signal calibration from portfolio sizing, and makes correlation/diversification assumptions inspectable. Upstream’s configuration shows separate forecast combination, a 16% annual portfolio target, instrument weights, and diversification multipliers; it also contains optional estimators. Zax should initially use fixed, transparent choices and sensitivity plots rather than porting that full optimisation engine. [5] [6]

## Data, access, and cost reality

An independent Zax implementation does **not** require a brokerage account, IB Gateway, `ib_async`, MongoDB, Parquet, a GitHub token, or a pysystemtrade installation. It does require licensed historical data that Zax may store and use for research. At minimum this means daily timestamps and close/settlement prices; for a multi-asset risk view it also means aligned histories across instruments. Equities need an adjustment policy for splits/dividends. Futures need contract identifiers, multiplier/currency where notional reporting is desired, FX when reporting a common-currency portfolio, and a reproducible roll/adjustment methodology. The upstream data guide says users must obtain and store their own market data because of licensing, and notes that a roll calendar requires price data for both contracts on the roll date. [9]

Free end-of-day data can be sufficient for a clearly labelled prototype where its licence and corporate-action/roll quality meet Zax’s chosen universe. It is not automatically sufficient for futures-quality research. Upstream names Barchart Premier as a bulk-download route with up to 250 downloads per day and describes Norgate Data as a subscription source for adjusted continuous futures; these are **paid/provider-controlled options**, not data bundled with pysystemtrade. Norgate’s API is stated to require Windows. Zax should select a provider only after reviewing price, exchange coverage, redistribution/display rights, history depth, adjustment methodology, and API/CSV terms. No provider account was created and no user data was sent in this research. [9]

Interactive Brokers is intentionally out of scope. If it is ever considered solely as a data import, upstream requires a paper or live IB account, a running Gateway or TWS session, a trusted IP/socket configuration, unique client IDs, and account configuration; its own order method warning says it can actually trade. Do not include it in Zax’s paper product. [10]

The API-limit claims were checked rather than adopted from the uploaded scope. GitHub’s public REST documentation permits unauthenticated reads of public data at 60 requests/hour per originating IP (authenticated personal access has 5,000/hour); Zax has no reason to call GitHub at runtime. [13] IBKR’s current API docs state that exceeding pacing can cause error 100 and termination after three breaches when reject mode is enabled, but do **not** provide the old numeric historical-data schedule on that page. The older official historical-data page lists 6 same-contract requests/2 seconds and 60/10 minutes for small bars, but labels itself deprecated and says to use IBKR Campus. Therefore no fixed IB rate should be embedded without rechecking current documentation—and no such integration is recommended here. [11] [12]

## Explicit exclusions and acceptance criteria

Keep all `sysbrokers`, `sysexecution`, `sysproduction`, IB configuration, account values, order stacks, fill handling, and scheduled production processes out of Zax. Do not call it “live,” show broker connectivity, or imply executable results. The existing Coinbase order-book research remains a separate microstructure experiment; EWMAC here is daily/slow trend research and cannot substantiate queue position or fills.

Accept the integration only when a paper result displays: data source and vintage; adjusted-series/roll policy; the exact span pair; volatility estimator and lookback; calibration sample; cap; weight and correlation calculation; target-risk setting; transaction-cost/slippage assumption; timestamps; and an explicit **paper-only / no orders sent** label. Add deterministic test fixtures for no look-ahead, first-valid dates, missing-volatility handling, cap behavior, and reproducibility from the same input CSV. No app source was accessed or changed, and no vendor code was installed or run for this assessment.

## References

[1]: https://github.com/pst-group/pysystemtrade "pysystemtrade repository README"
[2]: https://raw.githubusercontent.com/pst-group/pysystemtrade/develop/LICENSE "pysystemtrade GNU General Public License version 3"
[3]: https://api.github.com/repos/pst-group/pysystemtrade "pysystemtrade public repository metadata"
[4]: https://raw.githubusercontent.com/pst-group/pysystemtrade/develop/systems/provided/rules/ewmac.py "pysystemtrade EWMAC rule source"
[5]: https://raw.githubusercontent.com/pst-group/pysystemtrade/develop/systems/provided/example/exampleconfig.yaml "pysystemtrade example EWMAC configuration"
[6]: https://raw.githubusercontent.com/pst-group/pysystemtrade/develop/sysdata/config/defaults.yaml "pysystemtrade default configuration"
[7]: https://github.com/pst-group/pysystemtrade/blob/develop/docs/backtesting.md "pysystemtrade backtesting guide"
[8]: https://github.com/pst-group/pysystemtrade/blob/develop/docs/production.md "pysystemtrade production guide"
[9]: https://github.com/pst-group/pysystemtrade/blob/develop/docs/data.md "pysystemtrade futures data guide"
[10]: https://github.com/pst-group/pysystemtrade/blob/develop/docs/IB.md "pysystemtrade Interactive Brokers guide"
[11]: https://www.interactivebrokers.com/docs/tws-api/doc/pacing-limitations/pacing-behavior "Interactive Brokers TWS API pacing behavior"
[12]: https://interactivebrokers.github.io/tws-api/historical_limitations.html "Interactive Brokers deprecated historical data limitations"
[13]: https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api "GitHub REST API rate limits"
