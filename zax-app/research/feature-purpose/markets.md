# Markets and live source selection (id: `markets`)

**Scope.** This is a read-only source audit of the Markets capability in the fixed Expo RN/web StratDesk project. The page selects an instrument and displays quote/source state; it does not place orders. The application is owner-only and paper-only. No browser/device run, account/API writes, brokerage action, or test run was performed.

**Bottom line:** Markets is an instrument finder, live-data status surface, and handoff to the selected-market chart/workbench. Its usefulness depends on the selected feed being entitled and reachable. The screen does not itself contain a quant model, backtest, optimizer, signal generator, or strategy-validation control. A quote or candle is operational market data, not evidence of trading edge. No actual provider values were fetched for this audit.

## What is on the screen

### 1. Your account feed / live-source status

- **Where:** At the top of `Markets`, above the account panel and filters (`app/(tabs)/markets.tsx:23-25`).
- **Trader question:** “Can I see my private TradeLocker instruments, and which feeds are available?”
- **Use:** Open Markets and read the status message and pill. If the pill says **SIGN-IN / CONNECTION REQUIRED**, use the account panel immediately below to sign into the authorized Manus account; return to this status after the connection check. The page says quote polling is about every 15 seconds and candles every 20 seconds.
- **Output:** The status response reports the selected-account TradeLocker state/message and the screen displays the number of TradeLocker markets when connected. The UI also states that broker quote reception time is not a provider timestamp and that no broker orders are enabled.
- **Next:** If connected, select **TradeLocker** and search/filter the broker catalog. If not connected, use the account controls and verify that the intended owner account is signed in. For public Coinbase crypto, select **All feeds**; that source does not require a TradeLocker sign-in.
- **Status / prerequisites:** The status route is public at the router layer, but private TradeLocker data is owner-gated. TradeLocker catalog/status needs configured TradeLocker integration plus the authorized Manus owner session/account. The route reports `futures: false`. Status is a connection/access check, not proof of quote freshness, execution quality, or strategy profitability.
- **Source notes:** `server/trading/router.ts:27-31`; `server/trading/market.ts:10-18`; `server/trading/tradelocker.ts:61-72`.

### 2. Account sign-in, refresh, and sign-out

- **Where:** The Account card rendered directly beneath the feed status (`components/trading/account-controls.tsx:10-86`, included by `markets.tsx:25`).
- **Trader question:** “Which Manus identity is this workspace using, and can I establish or refresh the owner session required for private data?”
- **Use:** While signed out, tap **Sign in** and complete the authorized Manus sign-in. On web Preview, if the embedded Preview blocks sign-in, tap **Open app in browser tab**, sign in there, and continue in that tab. While signed in, tap **Refresh** to re-check the session; tap **Sign out** only to end it. The panel displays guest/signed-in identity and CONNECTED/SIGNED OUT state.
- **Output:** Account/session state and any sign-in/refresh error; sign-out clears the client query cache.
- **Next:** After sign-in, check the Markets feed status again. This only establishes the Manus session; it does not itself create or change TradeLocker credentials/account configuration.
- **Status / prerequisites:** Auth UI is implemented; a valid authorized owner session is necessary for private TradeLocker access. No sign-in was attempted in this audit. This shared account panel is documented only as it appears on Markets; shared account/auth implementation is not separately diagnosed here.

### 3. Feed switcher, text search, and category chips

- **Where:** Search input, **TradeLocker** / **All feeds** buttons, and category chips under the Account card (`markets.tsx:15-18,26-29`).
- **Trader question:** “Which supported instrument do I want to inspect, and should I restrict the list to my private broker catalog or include public/catalog feeds?”
- **Use:** Type a symbol/name fragment (for example `XAUUSD` or `NAS100`); search matches the internal id, provider symbol, or name, case-insensitively. Tap **TradeLocker** for the owner’s broker instruments or **All feeds** for the full returned catalog. Tap **All**, **Crypto**, **Forex**, **Metals**, **Indices**, **Stocks**, or **Futures** to narrow by category. Changing search/feed/category resets the page to page 1.
- **Output:** Matching-instrument count and current page, plus the filtered list. Initial feed is **TradeLocker**. `All feeds` does not mean all instruments are usable: each provider still needs entitlement/connectivity.
- **Next:** Select a row or use its **Chart** button. If no broker symbols appear, check account status; if searching a public crypto symbol, switch to **All feeds**.
- **Status / prerequisites:** Implemented local filters over the API catalog (or built-in catalog fallback). TradeLocker instruments appear only for the configured, connected owner feed. Built-in Coinbase crypto is public. Built-in FMP instruments require a read-only FMP key and applicable instrument entitlement. Built-in futures feed is not connected; category presence is not proof of an exchange-futures feed. `markets.tsx:11-18,26-32`; `market.ts:10-11,29-31`.

### 4. Instrument list, quote/source/age, and pagination

- **Where:** Result cards and **Previous** / **Next** buttons (`markets.tsx:30-34`). Each card includes provider symbol, friendly name, source/age or unavailable message, formatted price, percentage change when available, and category.
- **Trader question:** “Is there a usable current quote for this instrument, which source supplied it, and how old is the timestamp?”
- **Use:** Inspect the result row. Read the source and age below the name; read the displayed price/change on the right. Scroll through 12 entries per page using **Next** / **Previous**. A blank/— change means the source does not provide a change value (not zero movement).
- **Output:** Quote price, provider/source label, time age, status/error message, and change when available. Quote query polling is every 15 seconds and is capped at 40 requested symbols; this screen displays at most 12 per page. Quote ages are meaningful only with the displayed timestamp/source semantics.
- **Next:** When data looks current and the instrument is the intended contract, tap the card or **Chart** to inspect its bars. If unavailable, use the displayed reason and verify connection/key/entitlement; do not treat missing data as a substitute sample.
- **Status / prerequisites:** Coinbase quotes use public read-only exchange REST data. FMP quote calls require `FMP_API_KEY` and entitlement; FMP may be delayed. Coinbase and FMP quote timestamps are provider timestamps and the server marks data stale if it is older than 120 seconds (or too far in the future). TradeLocker price is the bid/ask midpoint; its timestamp is when the REST response was received, not a provider timestamp and not a fill. If the source is unavailable, the screen shows its message rather than silently substituting sample bars. `markets.tsx:19,23-24,30-34`; `market.ts:13-19`; `tradelocker.ts:70`.

### 5. Favorite toggle

- **Where:** Star icon at the bottom of each result card (`markets.tsx:21,31`).
- **Trader question:** “Which instruments do I want to keep marked for later?”
- **Use:** Tap the outline star to add the instrument to favorites; tap the filled star to remove it. The icon reflects the current workspace favorites list.
- **Output:** Updated favorite membership in the workspace; the star changes state. It does not subscribe to a data feed, pin a quote, or create an alert.
- **Next:** Use the app’s separate favorites/workspace surfaces if you want to revisit the saved instrument.
- **Status / prerequisites:** Implemented through workspace state update. Account/workspace persistence depends on the authenticated workspace context; this source audit did not test persistence on device. `markets.tsx:14,21,31`.

### 6. Quick price-watch bell

- **Where:** Bell icon in each result card (`markets.tsx:22,31`).
- **Trader question:** “Can I stage a watch on this instrument without leaving Markets?”
- **Use:** Tap the bell. The handler appends an alert named `<instrument> price watch`, using the current workspace timeframe and active strategy, condition **above**, current quote as the threshold when present, a 30-minute cooldown, and `enabled: false`.
- **Output:** A newly saved, initially disabled alert definition. If there is no quote, its initial threshold is `0`; that is not a usable interpreted price target and should be reviewed before activation.
- **Next:** Go to the app’s Alerts area, inspect/edit the threshold, and explicitly enable it only after confirming the intended price and conditions.
- **Status / prerequisites:** Alert creation is wired to workspace update, but this tap does not activate/scan the alert and does not guarantee notification delivery. A current quote is useful for the default threshold. The disabled initial state is explicit in the source (`markets.tsx:22`); no alert activation was performed.

### 7. Select market / Chart handoff

- **Where:** Tap the main body of an instrument card or tap its **Chart** button (`markets.tsx:20,31`).
- **Trader question:** “Which market should the chart/workbench inspect?”
- **Use:** Tap the instrument row or **Chart**. Both actions set that market as the workspace market and navigate to `/`.
- **Output:** The selected market becomes the workspace’s current market; the user is handed off to the home/workbench view. **Chart** is not a separate chart-only workflow; it invokes the same selection/navigation behavior as the row.
- **Next:** On the destination, verify the selected symbol and chosen timeframe/source before interpreting its chart or using another capability.
- **Status / prerequisites:** Navigation and selection are implemented. Chart/bar availability still depends on source credentials, entitlement, market session, and complete bars. No chart was opened or device behavior verified in this audit.

## Actual source/data boundaries

- **Public Coinbase:** Built-in catalog includes BTC-USD, ETH-USD, SOL-USD, XRP-USD, ADA-USD, and DOGE-USD. Quotes are public REST reads; historical bars are provider bars. A chart may separately use the Coinbase ticker WebSocket hook, but the Markets list itself uses the quote polling query. Public market access does not establish a strategy edge.
- **FMP:** The built-in catalog maps supported non-crypto symbols to FMP. A read-only `FMP_API_KEY` and relevant instrument entitlement are required. Quote timestamp and bar/session basis should be checked; intraday unzoned dates use configured `FMP_CHART_TIMEZONE` (default `America/New_York`). Missing key produces a clear precondition error; entitlement/provider failures remain unavailable, not synthesized.
- **TradeLocker:** Connected owner feed dynamically lists instruments on the selected account. Quotes are bid/ask midpoints with response-received time; historical bars are provider/broker-defined, polled REST data, not a broker exchange WebSocket. Broker CFD labels/types are retained. A CFD is not NQ/ES exchange futures. Broker order operations are disabled; this app is for paper-only use.
- **Futures:** `market.status` explicitly returns `futures: false`; built-in pending futures quotes/bars are unavailable. A category chip or broker instrument typed FUTURES does not establish a licensed exchange futures feed. Broker futures also have `paperSupported: false` in catalog conversion.
- **Bars/timeframes:** Native broker bars are mapped only for 1m, 5m, 15m, 1h, and 1d. 4h is a UTC aggregation from exact hourly bars and requires at least three closed complete buckets; missing/current buckets are omitted. 1w is only allowed for 24/7 crypto daily data, aggregating complete Monday-to-Monday weeks with all seven daily bars and at least three completed weeks. No gaps/current buckets are filled or fabricated. Bars are historical; a fetched historical series is not itself a validated backtest.
- **Paper/planning boundary:** Markets notes that paper quantity is price units, not broker lots; instruments without supported USD valuation can be charted but paper planning is disabled. No live brokerage orders are exposed.

## Quant-workbench and validation boundary

No quant family control or analysis result is rendered on this Markets screen. Its actual output is catalog/quote/source/age plus a market-selection handoff. In particular, “connected,” a fresh-looking quote, or historical bars are **operational/data-availability** observations, not strategy validation, a signal, a probability of profit, or a measured edge. Markets itself has no **no signal** state; unavailable/insufficient source data means the feed, quote, bars, or entitlement are missing—not that a strategy has been tested and rejected. Quant algorithms and their default input requirements are outside this single-capability audit, so no parameter defaults, multi-leg/queue-order functionality, or validation claims are made here.

## Tests and evidence caveat

Relevant tests inspected include `tests/trading/owner-setup.test.ts` (guest access is denied, including catalog access) and `tests/trading/timeframes.test.ts` (pure UTC 4h/weekly aggregation handles complete/closed-bar requirements). `tests/trading/quote-age.test.ts` checks Unix-second age formatting. These are unit fixtures only: they are not device/browser proof, real-feed entitlement proof, live-price verification, brokerage execution proof, or statistical evidence of edge. No test was run as part of this audit.

## Confirmed source defects

**None confirmed in the in-scope Markets screen/source-selection path.** The disabled quick-watch’s zero threshold when no quote exists is explicitly described above as a limitation requiring user review, not represented as a confirmed malfunction. No code was changed.

## Source map

- `app/(tabs)/markets.tsx`: page controls, filtering, quote rendering, favorites, quick alert, market selection.
- `server/trading/market.ts`: quote/candle source selection, freshness/error behavior, historical aggregation.
- `lib/trading/client.ts`: catalog/status/quote/candle query cadence, selected-market lookup, Coinbase ticker helper.
- `server/trading/router.ts`: market catalog/status/quotes/candles route behavior.
- `lib/trading/model.ts`: category/timeframe/market types and built-in catalog.
- `server/trading/tradelocker.ts`: owner-account instruments and quote/bar source semantics.
- `components/trading/account-controls.tsx`: sign-in/session controls embedded in this screen.
