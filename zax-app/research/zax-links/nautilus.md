**Decision — do not embed, port, or call Nautilus Trader in Zax.** Independently implement its published top-of-book imbalance *method* as a small, PAPER-only TypeScript research module, fed by Zax’s existing Coinbase book work. Nautilus is a Rust-native/Python event-driven trading engine aimed at unified research, simulation, and live execution. That is useful reference architecture, but it is the wrong runtime, feature scope, and legal surface for a private Expo/TypeScript analysis app with no brokerage execution. [1]

## What is verified

The repository is **public**, active, and neither archived nor disabled; GitHub currently reports its default branch as `develop`. Its actual `LICENSE` file is the **GNU Lesser General Public License, version 3** — this conclusion is from the text of `LICENSE`, not a repository badge. [2] [3]

There is a source-location wrinkle worth pinning: current stable docs describe `master` as the latest/stable documentation branch and `develop` as nightly, although GitHub’s default branch is `develop`. The current public tutorial resolves at `docs/tutorials/backtest_orderbook_binance.py` on `master`, while that file links to its `develop` source view. No login or other access restriction was encountered. Pin a commit SHA and the full path if a future review needs the exact example; do not rely on a floating branch URL. [4] [5]

Nautilus’s relevant tutorial is explicitly a deliberately simple top-of-book signal with “no edge,” not a production alpha. On each L2 update it computes:

```text
r = min(bestBidSize, bestAskSize) / max(bestBidSize, bestAskSize)
```

It signals only when the larger BBO size exceeds `trigger_min_size`, `r < trigger_imbalance_ratio`, the cooldown has elapsed, and no strategy order is inflight. If bid size is larger, it places a FOK buy at best ask; otherwise it places a FOK sell at best bid. Its published defaults are `trigger_min_size=100.0`, `trigger_imbalance_ratio=0.20`, `min_seconds_between_triggers=1.0`, and `book_type=L2_MBP`; the tutorial sets `max_trade_size="1.000"`. It also suggests `0.10` as a stricter ratio example. These are **Binance BTCUSDT example constants**, not Coinbase-ready parameters. [6] [7]

The tutorial uses user-supplied Binance depth archives, not a supplied Coinbase history. Its stated full BTCUSDT update file is about 12 GB / 110 million rows; its 100-row fallback sample is too short to trigger the strategy. Treat the public example as an algorithm and data-shape reference, not as a reusable data set or validated result. [7]

## Recommended Zax addition

Add one independently authored module, named by Zax rather than Nautilus, with these bounded responsibilities:

1. **L2 recorder and replay.** Subscribe to Coinbase’s public `level2` channel; persist the opening snapshot plus every update, connection/session ID, Coinbase event time, receipt time, and `sequence_num`. Apply `new_quantity` as an absolute price-level size and delete a level when it is zero. The level-2 reference says it supplies snapshot/update events, guarantees delivery, and exposes a per-connection sequence number specifically for dropped/out-of-order detection. On a sequence discontinuity or reconnect, terminate the segment and require a new snapshot before emitting features. [8]
2. **Feature and paper-scenario engine.** Calculate `r`, the signed variant `(bidSize - askSize) / (bidSize + askSize)`, spread in ticks, BBO depth, event rate, and a cooldown flag. Send these to Zax’s existing purged chronological classifier/stump workflow, and evaluate fixed forward horizons with strict chronological splits. Keep the original `r < 0.20` and one-second cooldown only as labelled baseline settings, then tune on earlier sessions and report performance only on later untouched sessions.
3. **Explicitly conservative PAPER outcome.** For each qualifying observation, record a hypothetical aggressive entry at the contemporaneous ask (buy) or bid (sell), constrained by `min(thinner BBO size, Zax paper risk cap)`. Deduct an explicitly configured taker fee and adverse fill buffer; do not call this an FOK fill and do not claim queue priority. Label it a **BBO-cross stress scenario**, then compare mid/BBO returns after fixed horizons. This complements Zax’s current inventory-quote research without adding broker orders or fabricated queue fills.

Use an asset-relative depth gate, not the tutorial’s `100.0` units. A defensible first experiment is a depth gate estimated from the formation window (for example, a high percentile of the larger BBO size), with the exact percentile pre-registered and frozen before the next test window. Keep ratio candidates `{0.10, 0.20}` and cooldown candidates `{1 s, 5 s}` as a small documented grid; include every tried setting in results. The quantity cap must be a Zax paper-risk input, not derived from visible liquidity alone. This is independent implementation of the mathematical decision rule: write fresh TypeScript, tests, names, and documentation; do not copy/translate Nautilus Python, configs, tutorial prose, or test data.

## Why not integrate Nautilus itself

Nautilus can replay historical L2/L3, supports a matching engine, and has a Coinbase adapter whose book subscription is `level2`/`L2_MBP`. But importing a Rust/Python research-and-execution engine into an Expo client would add a separate runtime and credentials/execution-oriented adapter surface without improving Zax’s stated PAPER-only objective. [1] [9]

Its simulation is also not evidence of actual executable fills. The engine has configurable probabilistic fill and slippage assumptions, and its queue model requires trade execution plus L2/L3 data. Nautilus documents that historical data cannot reveal hidden orders or all venue-specific priority rules, and that each simulated order has an independent queue estimate. Zax currently has no broker orders or queue-fill model, so adding one here would manufacture more certainty than the data supports. [10] [11]

**License decision:** independent implementation is the legally safer route. Do not copy Nautilus source into TypeScript or ship a Nautilus-derived mobile component. LGPL-3.0 permits use under conditions, but copying or translating source can create a derivative-work and redistribution questions; a private owner-only deployment may reduce distribution exposure but is not a substitute for a licence review. If direct reuse is ever reconsidered, freeze the exact source revision, preserve notices and the licence, identify every modified library file, and obtain counsel’s distribution/relinking assessment before delivering the app to any other device or person. [2]

## Data, access, and cost reality

For the current **live** research feed, Coinbase documents `wss://advanced-trade-ws.coinbase.com` as public for spot/US-derivatives market data, including `level2`; JWT is not required (it is optional and recommended for connection reliability). The same documentation limits WebSocket connections and unauthenticated messages to **8 per second per IP**. That is a connection/control-message limit, not a claim that inbound market updates are capped at 8/s. Subscribe once per needed channel/product group, use heartbeats to keep idle subscriptions open, and back off reconnects. No Coinbase trading key, portfolio, or private user stream is needed for this public L2 recorder. [12] [13] [14]

For **historical** replay, do not assume free downloadable Coinbase L2 archives: the official sources reviewed here document the live stream but do not offer a historical L2 download endpoint. Zax needs either forward capture of the public stream after this feature is built, or a separately licensed historical depth archive. The latter may be paid and may impose redistribution/derived-data terms; provider availability, price, and rights were not verified because no provider was selected, registered, or contacted. Store raw data privately, record source terms with the dataset, and keep the app’s scenario results separate from any vendor data export.

**Author:** Manus AI

## References

[1]: https://github.com/nautechsystems/nautilus_trader "Nautilus Trader repository overview"
[2]: https://raw.githubusercontent.com/nautechsystems/nautilus_trader/develop/LICENSE "Nautilus Trader actual LGPL version 3 license text"
[3]: https://api.github.com/repos/nautechsystems/nautilus_trader "Nautilus Trader repository metadata"
[4]: https://nautilustrader.io/docs/latest/tutorials/ "Nautilus Trader tutorial branch guidance"
[5]: https://api.github.com/repos/nautechsystems/nautilus_trader/contents/docs/tutorials/backtest_orderbook_binance.py?ref=master "Current public order-book tutorial path"
[6]: https://nautilustrader.io/docs/latest/tutorials/orderbook_imbalance/ "Nautilus Trader order book imbalance strategy"
[7]: https://raw.githubusercontent.com/nautechsystems/nautilus_trader/master/docs/tutorials/backtest_orderbook_binance.py "Nautilus Trader Binance depth backtest tutorial source"
[8]: https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/websocket/level2 "Coinbase Advanced Trade Level 2 order book reference"
[9]: https://nautilustrader.io/docs/latest/integrations/coinbase/ "Nautilus Trader Coinbase integration guide"
[10]: https://nautilustrader.io/docs/latest/concepts/backtesting/fill-models/ "Nautilus Trader backtest fill models"
[11]: https://nautilustrader.io/docs/latest/concepts/backtesting/trade-execution/ "Nautilus Trader trade execution and queue tracking"
[12]: https://docs.cdp.coinbase.com/coinbase-app/advanced-trade-apis/websocket/websocket-endpoints "Coinbase Advanced Trade public WebSocket endpoints"
[13]: https://docs.cdp.coinbase.com/coinbase-app/advanced-trade-apis/websocket/websocket-rate-limits "Coinbase Advanced Trade WebSocket rate limits"
[14]: https://docs.cdp.coinbase.com/coinbase-app/advanced-trade-apis/websocket/websocket-overview "Coinbase Advanced Trade WebSocket overview"
