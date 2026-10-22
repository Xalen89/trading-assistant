# AI4Trade assessment for StratDesk / Foundry

Checked 17 October 2026. Author: Manus AI.

AI4Trade is relevant to AI trading, but it is **not the service powering the app’s current AI forecast scenario**. The existing `server/trading/forecast-service.ts` uses a supported model from the app’s managed model catalog, independently sourced market candles and a timestamped quote. It creates a distinctly labelled hypothetical scenario. AI4Trade has not been registered, connected, or given the owner’s account, screenshots, journal or strategy files.

The linked site is AI-Trader: a public platform for agent and human discussions, strategy/operation signals, copy trading and competitions. Its main agent guide documents registration, public signal feeds and position operations. The published API specification also describes marketplace listings, including model-access listings, but the reviewed documentation does not establish a ready-to-use price-path forecast or general chat-completion service equivalent to the app’s current model integration. A public ranking or posted signal does not establish forecasting accuracy for the owner’s instruments and timeframes. [1] [2] [3]

Its separate market-intelligence service is more directly relevant as a possible **read-only context source**. It documents financial-news, macro snapshots and estimated BTC ETF flows. The guide explicitly says backend jobs refresh snapshots and a read request does not trigger live news collection. Estimated flows and community views must remain distinguishable from exchange observations and independently confirmed strategy conditions. [4]

However, the actual public overview and crypto-news responses inspected on 17 October 2026 both reported `last_updated_at: 2026-07-24T06:24:06.429300Z`. The crypto items returned were dated 23 July 2026. The endpoint’s `available: true` flag therefore does not establish current context. Feeding those records into an October intraday scenario as current news would reduce its usefulness rather than improve it. This finding concerns the particular snapshots returned, not a claim that every part of the platform is stale. [5] [6]

**Decision: do not replace or directly connect the app’s forecast or coach to AI4Trade on the present evidence.** Retain the current owner-only, paper-only system and its actual source/time checks. No account creation, heartbeat, public post, trade sync, copy trading, purchase or recurring process was performed. Do not transmit private trade screenshots or journals to a public community. A future read-only news integration would need fresh responses, clear original-source provenance, suitable reuse/privacy terms and explicit stale-data rejection. A claim of improved forecasting would require a timestamped, cost-aware out-of-sample comparison rather than marketing or leaderboard results.

The project’s discussion/challenge approach is a useful design reference for comparing competing hypotheses and reviewing mistakes. Those ideas can inform private scenario review without joining its public exchange or copying its code. Its README links a root `LICENSE`, but that exact raw URL returned HTTP 404 at this check; permission to reuse code has not been established. [1] [7]

## References

[1]: https://github.com/HKUDS/AI-Trader "Official AI-Trader repository and product README"
[2]: https://ai4trade.ai/SKILL.md "Official agent integration and public trading platform documentation"
[3]: https://raw.githubusercontent.com/HKUDS/AI-Trader/main/docs/api/openapi.yaml "Published API specification: marketplace and signals"
[4]: https://ai4trade.ai/skill/market-intel "Official read-only market-intelligence snapshot documentation"
[5]: https://ai4trade.ai/api/market-intel/overview "Public overview response with snapshot update timestamp"
[6]: https://ai4trade.ai/api/market-intel/news?category=crypto&limit=3 "Public crypto-news response and item publication dates"
[7]: https://raw.githubusercontent.com/HKUDS/AI-Trader/main/LICENSE "README-linked license URL: HTTP 404 observed on 17 October 2026"
