# TradingAgents: paper-verified fit for StratDesk

**TradingAgents** is an arXiv framework that divides stock analysis into specialized agents, uses a bull/bear research debate, and then has a trader and a risk-management stage. The exact paper is *TradingAgents: Multi-Agents LLM Financial Trading Framework*, arXiv:2412.20138, by Yijia Xiao, Edward Sun, Di Luo, and Wei Wang. The live arXiv record identifies the current version as **v7 (3 June 2025)** and links the code below. [1]

## What to reuse—and what not to claim

The paper’s architecture is a useful **explainable research-workflow pattern**, not evidence that StratDesk will produce profitable or accurate signals. Its analyst layer contains a fundamental analyst (financial statements, valuation and red flags), sentiment analyst (social posts, sentiment scores, and insider sentiment), news analyst, and technical analyst (price/volume and indicators such as MACD and RSI). The bull and bear researchers then debate the analyst reports for a facilitator-chosen number of rounds. A trader turns the result into a trade proposal, and three risk perspectives—risk-seeking, neutral, and risk-conservative—debate adjustments before a fund manager updates the decision. The paper uses structured reports/global state for hand-offs; free-form dialogue is reserved for the debates. [1]

For StratDesk, retain the requested **fundamental → sentiment → technical → bull/bear debate → trader → risk** flow. Do **not** add the paper’s news role in the first implementation: there is no connected news feed, and a faux news report would be worse than an explicit gap. The paper’s “fund manager” maps cleanly to a non-LLM, reviewed-rule gate in the existing app rather than an additional autonomous agent.

### Required evidence contract

Every role must receive a server-built, timestamped evidence packet and return structured JSON with `status`, `as_of`, `evidence_ids`, `claims`, `unknowns`, `confidence`, and `reasoning_summary`. A role may only cite IDs present in its packet. It must return `status: "abstain_insufficient_evidence"` when its required inputs are absent, stale, malformed, or conflict without resolution.

This requirement is especially important now:

- **Fundamental:** accept only user-supplied/reviewed filings, statements, or approved extracted fields. With none, return an abstention such as “No approved financial-statement or valuation evidence supplied; no claim about revenue, P/E, earnings, intrinsic value, or financial health.” It must never infer or invent P/E, earnings, filings, or company facts.
- **Sentiment:** accept only approved, timestamped uploaded material or a future reviewed feed. With none, return an abstention such as “No approved news/social/insider-sentiment evidence supplied; market sentiment not assessed.” It must not invent headlines, posts, consensus, or event reactions.
- **Technical:** receive only real TradeLocker/CB OHLC data already available to the app plus server-calculated indicators. Its report must name the symbol, interval, lookback, last-bar timestamp, missing-bar policy, indicator inputs, and any data-quality limitation. This is an interpretation of supplied price history, not a price forecast.
- **Bull and bear:** may challenge each other only using the three reports and their evidence IDs. An abstention is evidence of an information gap, not permission to fill it with background knowledge.
- **Trader:** produce only a **paper proposal** (`hold`, `paper_long`, or `paper_short`, if those instruments/rules permit it), a rationale tied to evidence IDs, and an explicit “insufficient evidence” path. It may not call broker APIs or calculate invented quantities.
- **Risk:** apply deterministic reviewed constraints first: paper-only mode, data freshness, allowed symbols, max notional/position, exposure, drawdown, liquidity/session, and an abstention/risk veto. An LLM risk critique can explain a veto but cannot relax a deterministic limit. The final rule gate records `approved`, `modified`, or `rejected` and the exact rule IDs.

## Bounded server-side implementation

Keep this native Expo iOS/Android app as a client of the **existing server-side LLM API**. The mobile app sends a symbol, selected timeframe, an explicit analysis request, and identifiers for private approved uploads. The server reads the real OHLC and reviewed rules, constructs the evidence packet, calls the LLM, validates its JSON against a schema, persists the provenance record, and returns a display-only analysis. Provider credentials remain server-side; the mobile client never receives them. Private uploads should be scoped by user/workspace and only their approved excerpts should enter the model context.

A deliberately small first release is sufficient:

1. The server validates OHLC freshness and computes a small, deterministic indicator set (for example return windows, SMA/EMA, RSI, MACD, ATR, and volume measures). It creates deterministic abstention reports for fundamental and sentiment when no approved source exists; this avoids paying an LLM to manufacture a missing analysis.
2. Make **one technical call**, then **two isolated bull/bear calls** that see only the three role reports. Limit the debate to one response per side—no open-ended multi-round conversation.
3. Make **one trader call** that can propose paper-only `hold`/`paper_long`/`paper_short` and must preserve evidence IDs. Then run the deterministic risk gate; optionally make **one risk-explainer call** only after a proposed non-hold action. This bounds a normal run to four LLM calls, or five with the optional explanation.
4. Store the immutable run input hash, model/version, prompts/schema version, role outputs, evidence IDs, rule-gate result, and simulated result. Render cited evidence, abstentions, and rule vetoes in the app. A “paper trade” should be created only by the existing paper simulator after rule approval; analysis has no TradeLocker/CB order capability.

This is intentionally smaller than the paper’s multi-round setup. It preserves the useful separation of evidence, adversarial review, proposed action, and independent risk control while controlling latency, cost, and context growth. The paper itself distinguishes fast retrieval/summarisation models from more deliberative analysis/decision models and says the framework can use API-accessible backbones without a GPU. [1] Use the existing server API for both tiers if it supports them, but choose concrete latency/token caps and retries in server configuration rather than exposing provider implementation to Expo.

## Exact experimental evidence and caveats

The paper backtests from **1 January through 29 March 2024**. It says its multimodal dataset included OHLCV/adjusted close, daily news from Bloomberg, Yahoo, EODHD, FinnHub and Reddit, social posts and auxiliary-model sentiment, public insider information, financial statements, company profiles/history, and **60 technical indicators per asset**. It states that agents used information available up to each trading day and compared signals against buy-and-hold, MACD, KDJ+RSI, ZMR, and SMA. [1]

Table 1 reports three stocks: TradingAgents versus the listed baselines had cumulative return / annualized return / Sharpe / maximum drawdown of **26.62% / 30.50% / 8.21 / 0.91%** for AAPL, **24.36% / 27.58% / 6.39 / 1.69%** for GOOGL, and **23.21% / 24.90% / 5.60 / 2.11%** for AMZN. These are authors’ backtest results, not forward performance or a guarantee. [1]

The authors explicitly limit the benchmark to three months because each prediction used **11 LLM calls and more than 20 tool calls**. They flag the unusually high Sharpe values as outside their expected empirical range and attribute them to few pullbacks during that period; they say longer backtests were future work under limited budgets. [1] The published simulation/data descriptions also do not state commission, bid–ask spread, slippage, market impact, or borrow-cost assumptions. Therefore, StratDesk should not display or imply the paper’s return/Sharpe figures, reproduce them from OHLC alone, or label a paper result as economic performance. If it later reports simulator metrics, it should separately disclose its exact fill, cost, timing, and no-look-ahead rules.

This matters more here because the paper’s experiment had live-style fundamental, news, social, and insider inputs that StratDesk currently lacks. The architecture can safely expose those gaps through abstentions, but its experimental result is **not transferable** to a technical-OHLC-only deployment. Paper-only execution and reviewed-rule gating are appropriate product boundaries, not validation of any trading strategy.

## Official code and license

The arXiv record directly links **TauricResearch/TradingAgents** as the project repository. The repository describes an expanded implementation with analyst, researcher, trader, risk-management, and portfolio-manager components; it also says it is for research and not financial, investment, or trading advice. [1] [2]

The repository’s `LICENSE` is **Apache License 2.0**. It permits reuse and derivative works subject to its license, notice, modified-file, and any `NOTICE` obligations; it disclaims warranties and does not grant trademark rights. [3] This is a code-license observation, not legal advice. Before copying code rather than applying the higher-level pattern, pin the exact commit, audit dependencies and data-provider terms, preserve required notices, and confirm the repository version is suitable: the linked repository continues to evolve after the paper and is not a version-locked reproduction artifact. [2] [3]

**References**

[1]: https://arxiv.org/pdf/2412.20138 "TradingAgents: Multi-Agents LLM Financial Trading Framework (arXiv PDF)"

[2]: https://github.com/TauricResearch/TradingAgents "TauricResearch/TradingAgents official repository"

[3]: https://github.com/TauricResearch/TradingAgents/blob/main/LICENSE "TradingAgents Apache License 2.0"
