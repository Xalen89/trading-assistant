The public recursive tree contains **5,806 local Markdown documents** under `strategies/` and no non-Markdown source/data files. The owner’s index contains **5,810 distinct FMZ detail links**: JavaScript 362, Python 132, C++ 3, MyLanguage 27, and PineScript 5,286. The tree response states `truncated: false`, so this is coverage proof for every repository blob at the captured `main` tree, not a claim based on the landing-page headline. [1] [2] [3]

| Inventory result | Count | Treatment |
| --- | ---: | --- |
| Local `strategies/*.md` documents, excluding the index | 5,806 | Every file is a canonical JSON entry with a GitHub source URL, blob SHA, size, source provenance, and any resolvable FMZ link. |
| FMZ links in `strategies/README.md` | 5,810 | Every link is represented by a resolved link, a candidate-link set where titles collide, or a preserved index-only reference. |
| Direct local-file ↔ index matches | 5,679 | 249 matched by stable trailing FMZ ID and 5,430 by a unique normalized title. |
| Local docs with ambiguous/absent index title | 127 | Retained separately; no FMZ URL is guessed when duplicate titles make the association ambiguous. |
| Index-only references with no matching local file name/ID | 2 | Preserved as `index_only_context_reference`, `accessible: false`. |
| Exact duplicate local documents | 0 | All 5,806 files have distinct public git blob SHA-1s. |

**Categories.** The index has one collection, **FMZ - Financial Magic Zone**, split into the five source-language headings above. These are source/index categories, not independently inferred trading styles. The JSON keeps unresolved associations explicit rather than imposing a language or rule classification from a similar name. [3]

**Rules and accessibility.** The repository README claims that each strategy file has a name/author, strategy description and math, arguments/parameters, source block, and detail URL. That is useful catalog metadata but is not a per-file completeness guarantee. For discovery integrity, 5,804 local entries have empty `rules` and `accessible: false`: their public files are linked but their complete rule semantics were not individually reviewed. This prevents title-derived or fabricated logic. [1]

Two directly read local entries are marked `accessible: true` with their stated rules/parameters in the JSON. `Python-Version-Multi-Asset-Momentum-Strategy-Tutorial` uses a 5% (`arrRatio`) price movement from a per-symbol base price to buy/sell a 5% account fraction, with a 0.01 minimum-stock threshold and five-minute order cancellation; its backtest header names 1-minute BTC/ETH/LTC pairs on OKEX. [4] `Dynamic-Spread-Market-Making-Strategy` uses SMA(14) by default, a 0.1% spread, 0.01 offset, and inventory cap of 100; it buys/sells one unit at the stated SMA-derived thresholds. It is a complete local rule set, not a bare theory reference. The README’s marketing command calls this file “Avellaneda-Stoikov,” but the fetched document itself specifies the simplified SMA/spread/inventory rules described here; the JSON records that distinction rather than relabeling it as the Avellaneda–Stoikov paper/model. [1] [5]

**Deduplication.** No names were merged. Identical titles occur in the index with different FMZ URLs, so name-based merging would violate a full-rule-semantic standard. Public blob SHA establishes that there are no byte-identical local documents. Semantic equivalence beyond identical documents remains **unknown** because the bulk rule bodies were not read; the JSON therefore retains every local artifact and labels this limitation instead of claiming semantic deduplication.

**License and rights.** The root README asserts **MIT**, but no `LICENSE` blob appears in the complete tree, the public repository metadata has `license: null`, and direct public `LICENSE` retrieval returned no content. This is an **unverified claim, not a readable license grant**. Treat the repository text/embedded code and third-party FMZ-linked material as rights-unknown/unlicensed for redistribution or embedding until a valid license and source-specific rights are supplied. There are no standalone data files in the tree; a data license was not identified. [1] [2] [6]

**Limitations.** This is discovery inventory only: it does not run, backtest, modify, or import any repository code; it does not download market data; it does not execute a bot or use a broker, account, subscription, login, or user session. `accessible: false` means “rules not individually validated in this pass,” not “the public GitHub URL cannot be opened.”

**References**

[1]: https://raw.githubusercontent.com/brainbrick-trades/The-Quant-Trading-Vault/main/README.md "The Quant Trading Vault root README"
[2]: https://api.github.com/repos/brainbrick-trades/The-Quant-Trading-Vault/git/trees/main?recursive=1 "GitHub recursive tree for The-Quant-Trading-Vault"
[3]: https://raw.githubusercontent.com/brainbrick-trades/The-Quant-Trading-Vault/main/strategies/README.md "The Quant Trading Vault strategies index"
[4]: https://raw.githubusercontent.com/brainbrick-trades/The-Quant-Trading-Vault/main/strategies/Python-Version-Multi-Asset-Momentum-Strategy-Tutorial.md "Python Version Multi Asset Momentum Strategy Tutorial"
[5]: https://raw.githubusercontent.com/brainbrick-trades/The-Quant-Trading-Vault/main/strategies/Dynamic-Spread-Market-Making-Strategy.md "Dynamic Spread Market Making Strategy"
[6]: https://api.github.com/repos/brainbrick-trades/The-Quant-Trading-Vault "GitHub repository metadata for The Quant Trading Vault"
