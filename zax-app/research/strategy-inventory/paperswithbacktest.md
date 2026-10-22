# Papers With Backtest — public strategy/paper inventory

The public sitemap declares **5,546 individual strategy/paper detail URLs** after excluding three non-item catalog/statistics routes and **32** `/strategies/awaiting-data/` category index routes. It is the coverage source: the site’s robots file explicitly points to this sitemap. [1] [2]

This run directly retrieved **5,546/5,546** of those canonical public detail URLs. Coverage is therefore **complete**; the JSON keeps every sitemap candidate even if a retrieval failed. The site’s own corpus statistics page reports **4,312 papers with runnable Python** and **5,213 series**, which is not the same measure as the sitemap’s public detail-URL count. [3]

## Entry interpretation and categories

Every entry below represents one distinct canonical public detail URL. **No title/slug similarity was used to merge entries.** The requested full-rule semantic deduplication cannot be truthfully performed here because complete pseudo-code and runnable Python are not made available to an unauthenticated visitor; PWB says code is for Backtester subscribers and an unlock supplies runnable code, assumptions, full results and dataset references. [4] [6] Each `accessible` value is consequently **false**, even where the public page has a descriptive abstract, rebalance frequency, market label, a named PWB dataset, performance metrics or current positions. Those facts are retained as **context/reference**, not complete rules.

| Public-page classification | Count |
| --- | ---: |
| Sitemap individual strategy/paper detail URLs | 5,546 |
| Detail pages retrieved | 5,546 |
| Detail pages not retrieved | 0 |
| Detail pages with a visible “Results from the backtest” section | 4,312 |
| Detail pages with an awaiting-data signal | 1,160 |
| Entries with publicly established complete executable rules/pseudocode | 0 |

The public market labels below are direct page labels, not independently inferred strategy categories. The 12 most frequent raw labels are shown; every raw label and count is in the JSON:

| Public market label | Entries |
| --- | ---: |
| Equities | 3,090 |
| Derivatives, Equities | 224 |
| not publicly parsed | 217 |
| Equities, Bonds | 196 |
| Bonds, Equities | 195 |
| Equities, Derivatives | 186 |
| Derivatives | 160 |
| Bonds | 155 |
| Currencies | 90 |
| Cryptocurrencies | 84 |
| Bonds, Commodities, Derivatives, Equities | 62 |
| Commodities, Derivatives | 56 |
| Other raw market-label combinations (full list in JSON) | 831 |

## Rule, code and data rights

PWB’s Terms call code, pseudocode, assumptions, results and research notes that are **unlocked** “Strategy Materials.” They are licensed personally, non-exclusively and non-transferably, and cannot be published or redistributed outside the account; they are not an open-code grant for this owner-only app. [5] PWB’s own statistics page describes `pseudoCode` and `code` as record fields, while the public subscription documentation says they are delivered through an unlock. [3] [4]

The public `pwb-toolbox` repository is **MIT licensed**, but that is the supporting toolbox, not a licence to the catalog’s strategy implementations. [9] The official statistics page links a purported corpus repository, but the linked public GitHub URL returned **404** when directly checked; no code, PDFs or other repository data were downloaded. [3] [10]

No market data, code, paper PDF, repository or strategy program was downloaded, imported, run or modified. The data specification makes the access distinction clear: it describes public table metadata but says the table repos are gated and its toolbox/API paths use a key. [8] The Terms say Data Materials are licensed only for the subscription term and must be deleted when that licence ends. [5]

One documentation caveat matters: Terms §5.4(a) says unlocked Strategy Materials remain usable after subscription end (subject to redistribution restrictions), while the subscription document has a conflicting statement that the licence does not survive cancellation. This inventory does not adjudicate that conflict. [4] [5]

## Files and provenance

The full machine-readable entry set, per-page public metadata, source URL and access basis is at [`paperswithbacktest.json`](./paperswithbacktest.json). The source field of every retrieved entry identifies both the public sitemap and exact public detail page. The extraction used no account, payment, subscription, API, MCP connector, broker/order session or private endpoint.

**References**

[1]: https://paperswithbacktest.com/robots.txt "Papers With Backtest robots.txt"
[2]: https://paperswithbacktest.com/sitemap.xml "Papers With Backtest XML sitemap"
[3]: https://paperswithbacktest.com/strategies/dataset "The strategy dataset — Papers With Backtest"
[4]: https://paperswithbacktest.com/docs/subscription/ "Subscription & Access — Papers With Backtest"
[5]: https://paperswithbacktest.com/terms "Terms of Service — Papers With Backtest"
[6]: https://paperswithbacktest.com/docs/strategies/ "Strategy Library — Papers With Backtest"
[7]: https://paperswithbacktest.com/strategies/self-imposed-limits-to-arbitrage "Self-Imposed Limits to Arbitrage — Papers With Backtest"
[8]: https://paperswithbacktest.com/datasets/spec "Market data, to the column — Papers With Backtest"
[9]: https://github.com/paperswithbacktest/pwb-toolbox "paperswithbacktest/pwb-toolbox"
[10]: https://github.com/paperswithbacktest/papers "Official corpus link referenced by PWB"
