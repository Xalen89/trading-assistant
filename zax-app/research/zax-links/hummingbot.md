# Hummingbot: paper-only research fit for Zax

*Author: Manus AI · Reviewed 2026-10-18*

**Recommendation — implement the methods independently in TypeScript; do not integrate, run, or embed Hummingbot or Hummingbot API.** Hummingbot is an active, public Python trading-bot framework (`master`, not archived or disabled), but its current surface includes live exchange connectors, encrypted exchange credentials, order lifecycles, and a separately deployed execution API. That is materially broader than Zax’s owner-only Expo/TypeScript analysis and **PAPER-only** boundary. [1] [3] [9]

## What Zax can use

1. **A transparent PMM quote overlay.** Hummingbot’s current `simple_pmm` proposes a bid and ask around either the mid or last price, then refreshes them periodically: `bid = reference × (1 − bidSpread)` and `ask = reference × (1 + askSpread)`. Its explicit controls are `orderAmount`, asymmetric `bidSpread` / `askSpread`, `orderRefreshTime`, and `priceType`. [5] Zax can calculate and chart these as **suggested paper quotes** from its existing Coinbase book state. It should not send, cancel, or represent them as exchange orders.

2. **Inventory-aware paper quoting.** The legacy PMM strategy exposes target base allocation, a tolerable inventory range, multi-level spreads and amounts, refresh tolerance, price bands, minimum spread, and fee adjustment. [4] Put the useful subset behind a local paper configuration: `targetBasePct`, `inventoryRangeMultiplier`, `baseOrderSize`, `levels`, `levelSpreads`, `levelAmounts`, `minSpreadBps`, `feeBps`, `refreshSeconds`, and a stale-book cutoff. Apply skew only to Zax’s synthetic inventory and label every modeled fill with its rule; the current scope has no queue-position/fill engine, so it must not infer priority or executable P&L from L2 snapshots alone.

3. **An independent Avellaneda–Stoikov experiment.** The published finite-horizon approximation supplies a clear additional research module, not an order router: \(r=m-q\gamma\sigma^2\tau\) and \(D=\gamma\sigma^2\tau + 2\ln(1+\gamma/\kappa)/\gamma\), followed by paper quotes \(r-D/2\) and \(r+D/2\). Here `m` is mid, `q` inventory relative to target, `gamma` risk aversion, `sigma` price volatility, `tau` time remaining, and `kappa` the exponential arrival-rate decay. [7] Inputs should be visible and saved with a run: `gamma`, volatility lookback/annualization and units, `kappa` calibration window, `tau`, target inventory, order size, tick size, minimum spread, fees, and the fill model. Hummingbot’s version estimates `alpha` and `kappa` from book activity and uses a modified normalized-volatility calculation; treat that as a documented variant to compare against, not code to port. [6] [8]

These are useful additions because they turn Zax’s existing real-book inventory-quote research into reproducible **quote-generation and paper-evaluation** experiments. Show feed status, last update/sequence, stale state, synthetic inventory, assumption-based fill events, fees, and parameter version next to results. That is more honest and useful than hiding availability behind a generic “live quote unavailable” message.

## Data, access, and rate limits

No Hummingbot account, paid plan, exchange key, Hummingbot API server, Postgres/EMQX stack, or provider registration is needed for the recommended local method implementation. A fully offline replay needs only locally available historical L2/trade data. For an optional live Coinbase feed, the Advanced Trade public WebSocket offers `level2` snapshot/incremental book data and `market_trades` without a JWT; the public REST product book also needs no JWT but is cached for one second. [10] [11]

Use one public socket and subscribe normally; Coinbase currently limits both WebSocket connections and unauthenticated messages to **8 per second per IP**. [12] Do not adopt the current Hummingbot connector constants as a Coinbase entitlement: its code still declares 10 public REST/s, 30 private REST/s, and 750 WebSocket requests/s, while Coinbase’s official WebSocket limit is the current authority. [13] [12] The Hummingbot connector throttler is venue/endpoint-specific, not a universal Hummingbot rate limit. [14]

Avoid Coinbase private endpoints and all Hummingbot API endpoints. Coinbase private REST requires a CDP JWT and carries account/order capabilities. [10] Hummingbot API was renamed from `backend-api` to `hummingbot-api`; it requires HTTP Basic authentication on REST routes other than `GET /`, stores trading data and credentials, and exposes execution and bot-deployment operations. [9] It is therefore out of scope even with paper intentions.

## Repository, path, and reuse decision

The useful code is not a TypeScript library. The current repository classifies V1 Pure Market Making and Avellaneda strategies as **classic legacy** strategies at `hummingbot/strategy/...`; its current architecture also has Python scripts, V2 controllers, and executors. [3] The documented PMM path remains `hummingbot/strategy/pure_market_making`, while the short current example is `scripts/simple_pmm.py`. [4] [5] These paths and the separate renamed API are important changes from treating “Hummingbot” as one stable, drop-in SDK.

The actual root `LICENSE` on `master` is **Apache License 2.0**, copyright 2023 Hummingbot Foundation; this conclusion comes from the license text, not a repository badge. [2] Apache-2.0 permits reuse and derivative distribution, but distributed copies require the license, retained applicable notices, prominent notices for modified files, and any required `NOTICE` material; it does not grant trademark permission. [2] [15]

**Decision: clean-room implementation of the published PMM/Avellaneda–Stoikov methods, with no Hummingbot source copied or bundled.** This avoids Python/Cython/runtime dependencies, prevents any execution pathway, and avoids derivative-code attribution work in Zax. If a future release copies even a small Hummingbot file, preserve its license/attributions and review all imported dependencies and notices before distribution; obtain legal advice for a public/commercial release.

> **Fetch-access note:** the repository, license, README, source files, and primary/API documents above were accessible by text fetch. The dedicated `https://hummingbot.org/client/paper-trade/` page returned no extract in this environment, so this report does not rely on it and no browser was used.

## References

[1]: https://api.github.com/repos/hummingbot/hummingbot "Live Hummingbot repository metadata"
[2]: https://raw.githubusercontent.com/hummingbot/hummingbot/master/LICENSE "Hummingbot actual Apache License 2.0 text"
[3]: https://raw.githubusercontent.com/hummingbot/hummingbot/master/README.md "Hummingbot current README and architecture"
[4]: https://hummingbot.org/strategies/v1-strategies/pure-market-making/ "Hummingbot Pure Market Making documentation"
[5]: https://raw.githubusercontent.com/hummingbot/hummingbot/master/scripts/simple_pmm.py "Hummingbot current Simple PMM source"
[6]: https://hummingbot.org/strategies/v1-strategies/avellaneda-market-making/ "Hummingbot Avellaneda Market Making documentation"
[7]: https://people.orie.cornell.edu/sfs33/LimitOrderBook.pdf "Avellaneda and Stoikov High-frequency Trading in a Limit Order Book"
[8]: https://raw.githubusercontent.com/hummingbot/hummingbot/master/hummingbot/strategy/avellaneda_market_making/avellaneda_market_making.pyx "Hummingbot Avellaneda strategy implementation"
[9]: https://hummingbot.org/hummingbot-api/ "Hummingbot API overview and authentication"
[10]: https://docs.cdp.coinbase.com/coinbase-app/advanced-trade-apis/rest-api "Coinbase Advanced Trade REST endpoints"
[11]: https://docs.cdp.coinbase.com/coinbase-app/advanced-trade-apis/websocket/websocket-endpoints "Coinbase Advanced Trade WebSocket endpoints"
[12]: https://docs.cdp.coinbase.com/coinbase-app/advanced-trade-apis/websocket/websocket-rate-limits "Coinbase Advanced Trade WebSocket rate limits"
[13]: https://raw.githubusercontent.com/hummingbot/hummingbot/master/hummingbot/connector/exchange/coinbase_advanced_trade/coinbase_advanced_trade_constants.py "Hummingbot Coinbase connector constants"
[14]: https://hummingbot.org/connectors/connectors/api_throttler/ "Hummingbot connector API throttler documentation"
[15]: https://www.apache.org/licenses/LICENSE-2.0 "Apache License 2.0 redistribution terms"
