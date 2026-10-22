# Composer and Composer API: fit for Zax

**Recommendation: keep Zax independent and PAPER-only.** Composer is a no-code strategy builder **and brokerage**: its product site says it builds, backtests, and executes algorithms, and the API includes deploy and direct-order operations alongside analysis features. That does not fit Zax’s owner-only, no-broker-order boundary. [1] [2]

A narrowly useful future option is an **off-by-default Composer reference mode**, not a trading integration. A server-side adapter could query `POST /api/v0.1/search/symphonies` and present public-symphony metadata and out-of-sample statistics as externally sourced research cards. The documented response supplies such fields as rebalancing frequency, node counts, and OOS return, drawdown, Sharpe, Sortino, turnover, and SPY-relative metrics. It does **not** establish a right to copy another user’s logic or redistribute strategies. Do not scrape community pages or infer a license from public sharing. [2]

This remains a security-sensitive optional feature. Composer says API access needs a Composer **Pro** account, a Key ID, and a bearer Secret; the visible documentation says the one active key is tied to, and has the same access as, its creating user. The same API documents account, deployment, liquidation, rebalancing, and direct-order routes. It does not document read-only keys or scopes. Never put the secret in Expo, logs, analytics, or a repository. If this mode is ever enabled, use a user-controlled backend secret store and a fixed allowlist containing only the discovery route; omit account, symphony-write, backtest, deploy, dry-run, report, and trading routes. Even then, compromise of the Composer key remains broker-account risk, so **do not enable it by default**. [2] [3]

## Verification of the uploaded API claim

The claim that there is a **public** backtest endpoint at **500 requests/second** is not supported. The current API documentation says all API requests require credentials and gives a baseline of **25 requests per minute per API key, per endpoint**. Its higher-rate table lists selected portfolio/symphony routes at 250–500 RPM and trade preview at 100 RPM; it does **not** list the symphony backtest route. Separately, Composer’s onboarding article says most routes are 1 request/second and names that backtest route as 500 requests/second. These official pages conflict. Until Composer confirms the deployed limit in writing, treat the authenticated backtest route as **25 RPM at most** and do not build batch research around it. [2] [3]

Pro is currently listed at **$384/year** ($32/month billed yearly) and includes API access to pull data, run backtests, and trade. The free editor/backtester is therefore not evidence of free API access. [4]

## Methods worth implementing independently

Composer’s published examples can inspire small, testable additions to Zax without copying Composer code or sending Zax data to Composer:

- **Conditional absolute momentum.** Add a declarative rule card equivalent to `if cumulativeReturn(SPY, 20 trading days) > 0.02 then SPY else BND`. Composer shows that exact illustration. Keep it PAPER-only and label it as an example rule, not a validated alpha. [1]
- **Rank-and-select cross-sectional momentum.** Extend Zax’s fixed-universe quintile module with `lookbackBars: 90`, `selection: topN`, and `topN: 3`; Composer’s public example ranks `SQ, SPOT, NFLX, AAPL, SHOP, TWLO` on 90-day cumulative return and selects the top three. Make the universe, calendar, return type, tie-breaking, and rebalance cadence explicit in Zax rather than claiming Composer-equivalent results. [1]
- **Weighting policy.** Preserve Zax’s inverse-volatility trend work but expose a strategy-DSL choice of `specified | equal | inverseVol | marketCap`; Composer publicly lists those four weighting categories. Implement inverse volatility independently as \(w_i=(1/\hat\sigma_i)/\sum_j(1/\hat\sigma_j)\), with a Zax-selected trailing daily-return window such as 20, 60, or 126 bars and a zero/insufficient-history exclusion. Composer does not publish its volatility estimator or lookback, so no parameter choice should be described as Composer-compatible. [1]
- **Cost-sensitive backtest controls.** Composer’s API makes a useful disclosure model: capital; start/end dates; benchmark tickers; `backtest_version` `v1|v2`; fee switches; subscription setting; `slippage_percent`; and `spread_markup`. Its documentation clarifies that `slippage_percent: 0.01` means 1%, while `spread_markup: 0.001` means 10 bp. Add equivalent, clearly local simulation parameters to Zax and retain its paper-only execution boundary. [2]

Composer does not replace Zax’s OLS/Engle–Granger pairs, purged chronological classifier, or Coinbase L2 inventory-quote research. The documented market-data surface lists options chains, option-contract data, and option overviews; it does not document historical equity OHLCV or L2 order-book data. Independent implementations therefore need Zax’s own permitted data source: adjusted daily bars and corporate-action/symbol handling for the momentum/weighting cards, and existing real Coinbase depth data for the L2 work. Exact Composer backtest replication would additionally require paid Pro API access and still cannot be established from the public docs because its data history, universe handling, signal timing, and unpublished indicator parameters are not specified. [2] [4]

## Reuse and access decision

**Do not reuse Composer platform code or the unofficial Python client.** The public Composer GitHub organization currently lists only `autoresearch` and `alpaca-docs-v1`, not the strategy editor, broker/API implementation, or an official TypeScript client. [5] The prominent `SolarWolf-Code/composer-trade-py` repository calls itself **unofficial** and its README includes deployment and direct-order support. Its actual `LICENSE` file is MIT, which permits code reuse subject to retaining its notice, but it is Python, broker-capable, and not a prudent dependency for Zax. [6] [7]

The related `composer-trade-common` repository’s visible top-level file listing contains no `LICENSE`; do not copy from it without an explicit license grant. [8] The safe route is an **independent implementation of the published rule ideas** above, with no Composer source code, strategy EDN, or community strategy logic copied into Zax.

Use the canonical documentation URL `https://api.composer.trade/docs/` for any later review. The unofficial SDK still links to older split `trading-api` and `backtest-api` documentation paths; text fetches of those two URLs returned HTTP 405, so treat them as stale/unreliable rather than integration targets. [2] [7] [9] [10]

The current Terms of Service URL rendered only footer/legal-disclosure text to the available text fetch, so substantive API/data-use terms were dynamically inaccessible in this research environment. Before any production reference mode, obtain and retain a readable current terms/API-use review and vendor confirmation of the intended read-only use; this report makes no unverified terms-permission claim. [11]

**Manus AI**

## References

[1]: https://www.composer.trade/ "Composer product page"
[2]: https://api.composer.trade/docs/index.html "Composer API documentation"
[3]: https://help.composer.trade/article/236-getting-started-with-your-composer-api "Getting started with your Composer API"
[4]: https://www.composer.trade/pricing "Composer pricing"
[5]: https://github.com/invest-composer "Composer GitHub organization"
[6]: https://raw.githubusercontent.com/SolarWolf-Code/composer-trade-py/main/LICENSE "composer-trade-py MIT license"
[7]: https://raw.githubusercontent.com/SolarWolf-Code/composer-trade-py/main/README.md "composer-trade-py README"
[8]: https://github.com/SolarWolf-Code/composer-trade-common "composer-trade-common repository"
[9]: https://trading-api.composer.trade/api/v1/api-docs/index.html "Legacy Composer Trading API response"
[10]: https://backtest-api.composer.trade/api/v1/api-docs/index.html "Legacy Composer Backtest API response"
[11]: https://www.composer.trade/terms-of-service "Composer Terms of Service"
