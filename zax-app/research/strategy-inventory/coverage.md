# Strategy Inventory Coverage — Discovery Synthesis

**Scope:** This is a synthesis of the three supplied discovery inventories only. It does not add research, retrieve source URLs, unlock accounts, download data, run notebooks/code, test algorithms, or approve/evaluate a strategy. “Accessible” below means the inventory records visible rules or code/pseudocode; it does **not** mean deployable, performance-validated, executable, or rights-cleared.

## Consolidated coverage

| Source inventory | Canonical entries | Accessible | Not accessible | Rule coverage and collection status |
|---|---:|---:|---:|---|
| Papers with Backtest (`paperswithbacktest.json`) | 5,546 | 0 | 5,546 | Complete public-sitemap capture of individual paper/strategy detail URLs. Publicly visible material supplied abstract/context, metadata, named dataset references and/or backtest metadata, but no publicly established complete executable rules/pseudocode. Collection is **paywall/account-unlock constrained**. |
| SGX Full OrderBook Tick Data Trading Strategy (`sgx-orderbook.json`) | 20 | 14 | 6 | Complete public master-tree notebook inventory. Accessible records are preprocessing, labels, features, offline model candidates, or an offline research pipeline; they are not a complete live/paper order-routing strategy. The P&L evaluator is internally incomplete. |
| The Quant Trading Vault (`quant-vault.json`) | 5,808 | 2 | 5,806 | Complete recursive-tree inventory: 5,806 local strategy documents plus 2 index-only context references. Only two individual documents have inventory-established rules. The other 5,804 local documents must not receive title-derived rules; the 2 index-only references have no corresponding local document. This is a **massive, incompletely rule-reviewed** collection. |
| **Total** | **11,374** | **16** | **11,358** | Counts are exact from the supplied machine-readable inventories. |

## Rights and data boundaries

| Source | Code/text rights | Data requirements and data-rights status | Use boundary |
|---|---|---|---|
| Papers with Backtest | Catalog Strategy Materials are not publicly open-licensed. Supplied terms describe unlocked materials as personal, non-exclusive, non-transferable, and non-sublicensable, with redistribution restrictions. `pwb-toolbox` being MIT does not license catalog strategy code. | Market Data Materials are subscription-term licensed. Public records identify datasets/backtest metadata but did not provide a rights-cleared download or complete rules. | Do not copy, redistribute, or reconstruct unlocked content. The supplied source report also records an unresolved conflict in terms/subscription documentation over post-cancellation strategy-material rights. |
| SGX repository | No declared repository licence: API licence is null, no licence path was in the full master tree, and the licence endpoint returned 404. Treat all repository code as **unlicensed**. | Raw event/book inputs require fields such as series, timestamp, side, price, order identifiers/position, signed quantity difference, and best-price/quantity fields; derived methods use best-three snapshots, level-1/3 book series, labels and features. Bundled CSV provenance, exchange/vendor rights, and redistribution rights are **unknown**. | No source execution was performed. The inventory read only the small transformed-book sample; three large CSVs were not downloaded. |
| Quant Trading Vault | The root README’s MIT claim is not verified: the tree had no `LICENSE` blob and GitHub metadata reported `license: null`. Linked FMZ code/text are **rights-unknown** pending a valid licence. | For the two accessible records: (1) SMA market making needs closes and inventory state; (2) momentum needs per-symbol last price, cash, stock, orders, and precision. For the 5,804 unreviewed local documents, data requirements are not stated in their inventory metadata. | Treat all code/text/data rights as unresolved; no strategy file beyond the two recorded items has rules inferred from its title. |

## Exact de-duplication and alias treatment

**Working unique-definitions estimate: 11,374 record-level definitions.** This is a count of currently distinct canonical inventory records after the source inventories’ exact-record controls, **not** a claim that 11,374 economically or semantically distinct strategies have been proved.

| Check | Result | Treatment |
|---|---|---|
| Papers with Backtest canonical identity | 5,546 unique canonical detail URLs; zero duplicate IDs reported. | Retain every source record. Full-rule semantic comparison is impossible while rules/pseudocode are gated. |
| Quant Vault byte identity | Zero byte-identical documents reported. | No documents were merged. Keep all 5,806 local-document records and both index-only context references. |
| Quant Vault index ambiguity | 127 ambiguous title/link associations are preserved in the inventory. | **Needs review**; do not guess an alias, target document, or rule set from title/link proximity. |
| SGX rules and parameters | All 20 stored rule arrays are distinct. In particular, the 600-second and 900-second forward-cross labels remain separate because their parameters and stated use differ. | No SGX records were merged. Keep preprocessing, features, labels, models, evaluation logic, and context records as separate source aliases/records. |
| Cross-source comparison | No complete rule-and-parameter match is established across the three collections. | No cross-source merge. Similar names, model families, or topic labels are insufficient. |
| Existing app reference labels | `WR1`, `Core Sequence/SilverBullet/OB/STDV`, `EMA20/50 pullback`, `Breakout RVOLnews`, `BB20RSI14 rebound`, `scalp unknown`, `SMA20/50closecross`, `MACD12/26/9closecross`, and `Donchian20priorrange` were supplied as labels, without complete rule/parameter specifications. | **Needs review**; do not de-duplicate any inventory item against these name-only references. |

All source aliases/URLs remain in their source JSON files. No record was removed merely for a similar name. A merge would require an exact, complete match of actionable rules **and** parameters; unresolved equivalence remains explicitly unmerged.

## Interpretation limits by collection

- **Papers with Backtest:** all 5,546 records are unavailable for complete-rule analysis in this inventory. It would be inaccurate to select any of them for a dedicated rule/performance review until lawful access and use rights are established.
- **SGX:** 14 records have accessible notebook logic, but the collection is chiefly an offline order-book research workflow—not 14 deployable strategies. Its forward labels use future data; the active model loop evaluates only one 10-row test block; and the P&L cell references columns absent from the shown feature builder. None should be represented as a ready trading strategy.
- **Quant Vault:** only two of 5,808 entries have documented rules here. The scale is too large for silent inclusion of all items. The remaining 5,806 entries require staged, per-document review with licence verification; no title-level inference is valid.

## Next-phase scope

**Dedicated per-item analysis now: 2 items.** These are the only records in the consolidated inventory with accessible, specific trading rules and no known exact duplicate. A dedicated analysis would still be conditional on resolving repository/FMZ rights and data/venue assumptions; it would not be an approval or a backtest result.

| Priority | Name | Source | URL | Rationale |
|---:|---|---|---|---|
| 1 | Dynamic-Spread-Market-Making-Strategy | Quant Vault / FMZ PineScript | https://github.com/brainbrick-trades/The-Quant-Trading-Vault/blob/main/strategies/Dynamic-Spread-Market-Making-Strategy.md | Specific parameters and full entry/exit/inventory logic are recorded (SMA 14, 0.1% spread, 0.01 offset, 100 inventory limit). It is not a proven duplicate of an existing app reference label. Review should first resolve unverified licensing and model fill/fee/latency assumptions. |
| 2 | Python version multi-asset momentum strategy tutorial | Quant Vault / FMZ Python | https://github.com/brainbrick-trades/The-Quant-Trading-Vault/blob/main/strategies/Python-Version-Multi-Asset-Momentum-Strategy-Tutorial.md | Specific multi-asset buy/sell, sizing, reset, and order-cancel logic is recorded (default 5% threshold; 1-minute BTC_USDT/ETH_USDT/LTC_USDT header). It is distinct from the supplied name-only app references. Review should first resolve unverified licensing, exchange/data rights, and execution-cost assumptions. |

### Proposed staged follow-on (not added to current analysis scope)

1. **Rights/access gate:** obtain lawful access and a clear use/redistribution basis before any Papers with Backtest full-rule extraction; reconcile the documented post-cancellation terms conflict.
2. **Quant Vault document triage:** review the 5,804 unreviewed local documents in explicit bounded batches, retaining their links and marking each as actionable, context-only, duplicate by exact rules/parameters, or needs review. Do not claim all 5,806 are added before that work is completed.
3. **SGX feasibility audit:** if desired, separately audit the data lineage, look-ahead labels, feature/P&L column mismatch, execution model, and legal data rights. Treat it as research-workflow remediation rather than a strategy onboarding queue.
4. **Reference-method normalization:** obtain complete rules and parameters for the existing app labels before performing any equivalence merge.

## Source artifacts

- `/home/ubuntu/stratdesk/research/strategy-inventory/paperswithbacktest.json`
- `/home/ubuntu/stratdesk/research/strategy-inventory/sgx-orderbook.json`
- `/home/ubuntu/stratdesk/research/strategy-inventory/quant-vault.json`

This report deliberately preserves collection-scale, paywall, incompleteness, licensing, data-rights, and de-duplication limitations rather than filling gaps with inferred strategy logic.
