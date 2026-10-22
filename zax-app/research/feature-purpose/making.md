# Quant venue quote and inventory model — feature-purpose mini-guide

**Capability:** Quant Lab family `making` / “Market making” (`id: making`). This is a source-level audit of `lib/trading/quant-making.ts`, `server/trading/venue-depth.ts`, and `tests/trading/quant-making.test.ts`, with settings/output types checked in `lib/trading/quant-lab-types.ts`. It does not audit or prescribe the shared workbench UI/API implementation.

## What this capability is for

It answers a narrow, current-state question: **given a supported venue's supplied L2 book, tick/lot sizes, your own fee/slippage assumptions, and your signed inventory limits, what passive bid/ask prices and quantities could be written down as paper targets right now?** It also reports top-of-book/depth and input-quality diagnostics. It is not a strategy backtest, fill simulator, order manager, broker integration, or claim of trading edge.

## Features and how to use them

### 1. Get an actual single-venue L2 snapshot

- **Purpose / trader question:** “Do I have real venue depth, and what are the current top levels and venue increments?”
- **Location:** `server/trading/venue-depth.ts:175–249` (`venueDepth(symbol)`). The feed path supports Coinbase Exchange crypto products only. It tries the public `level2_batch` WebSocket stream, waits up to about four seconds, then falls back to a public REST level-2 snapshot. Stream results carry `status: streamed`; fallback results say `polled`. It returns up to 50 bid and ask levels and Coinbase product quote/base increments as `tickSize`/`lotSize`.
- **Practical use (field-level sequence):** In Quant Lab, choose the Market making family and a Coinbase-supported crypto product; request/load venue depth; confirm the returned symbol/source/status/book age; then run the calculation with that book. The code inspected defines no button label, picker flow, or device tap target, so use the workbench's actual labels rather than assuming a particular control name.
- **Actual output:** Source label, delivery mode, `receivedAt`, bids/asks, and tick/lot increments. A normal book must have both sides and best bid strictly below best ask. `TL:` broker symbols are expressly rejected; other non-Coinbase instruments fail with “no licensed venue L2 feed configured.” This is not consolidated NBBO.
- **Useful next action:** If depth is missing/empty/crossed or the symbol is unsupported, select a supported Coinbase crypto product or stop; do not substitute OHLC/midpoint data. Check the snapshot age and source before treating a paper target as current.
- **Status:** Implemented read-only public venue-depth acquisition in the server source; this audit does not prove a live venue request or device workflow works.

### 2. Supply fee and slippage assumptions; inspect the cost gate

- **Purpose / trader question:** “Does the displayed spread even exceed my estimated two-sided trading costs?”
- **Location:** Quant settings used at `lib/trading/quant-making.ts:241–269, 463–468, 607–630`; settings type/defaults in `lib/trading/quant-lab-types.ts:24–46`.
- **Practical use:** Enter finite, non-negative `feeBps` and `slippageBps` assumptions in basis points (bps), then calculate. The module does not fetch fees or rebates. Defaults in the type file are both zero, so replace them with credible assumptions before interpreting the result.
- **Actual output:** Metrics for each supplied cost and “User-supplied two-sided cost allowance” = `2 × (feeBps + slippageBps)`. If quoted spread in bps is less than or equal to that allowance, status is still `ready`, but there is **no** `paperPlan`; the signal is `flat` with a reason that the supplied cost allowance consumes the displayed spread.
- **Useful next action:** Use supported venue/product-specific cost assumptions from a reliable source; if the gate says no quote, do not infer that the model found a profitable trade. Re-evaluate only with defensible assumptions or a different valid snapshot.
- **Status:** Implemented as a user-input gate, not an inferred fee model.

### 3. Set inventory, order size, and inventory cap

- **Purpose / trader question:** “How should the proposed quote center respond to my current position, and how much room remains on each side?”
- **Location:** Inputs validated at `lib/trading/quant-making.ts:253–269`; inventory adjustment at `469–480`; side capacity and lot sizing at `492–501`. Defaults are `inventory: 0`, `orderSize: 0.01`, `maxInventory: 0.1` in `quant-lab-types.ts:36–46`.
- **Practical use:** Supply current **signed** inventory, a positive desired `orderSize`, and positive `maxInventory` in the same units as book quantity. Then recalculate. Ensure the position and cap units match the venue's base-asset lot size; code does not reconcile accounts or infer inventory.
- **Actual output:** `Capped inventory ratio` is clamped to −1…+1. The quote center shifts away from the current inventory direction by up to one quarter of the spread under this rule. Bid capacity is `maxInventory − inventory`; ask capacity is `maxInventory + inventory`; each quantity is the smaller of order size and side capacity, rounded down to whole venue lots. Only sides with at least one positive lot appear in the paper plan. Metrics show supplied inventory, cap, ratio, and per-side paper quantities when present.
- **Useful next action:** Compare the assumed position with your actual position outside this tool. If both side quantities are zero, correct inputs only if they were wrong; otherwise no paper quote is proposed. Do not treat the supplied position as an account-synced value.
- **Status:** Implemented as pure calculation; no inventory/account connector or order submission exists in this module.

### 4. Inspect top-five depth and compute passive paper quote targets

- **Purpose / trader question:** “What tick-grid prices would this simple, inventory-adjusted rule write down from the current book?”
- **Location:** Book checks and quote math at `lib/trading/quant-making.ts:319–355, 430–501`; metrics and plan at `503–709`.
- **Practical use:** Provide a valid, uncrossed L2 snapshot, valid settings, and the required `series` array (it may be `[]`; candles do not drive quote math). Run `family: making`, then review the summary and metrics before looking at any targets.
- **Actual output:** Best bid/ask, midpoint, spread/spread bps, summed depth on up to five levels per side, top-five depth imbalance, inventory-adjusted center, and—only when the cost gate passes and tick/lot/capacity checks pass—optional `paperPlan.legs` with symbol, `side` (`long`/`short`), reference price, and quantity. Prices are tick-rounded, quantities lot-rounded; `equity` is always empty and there are no fill/return/PnL outputs. A valid calculation emits a `flat`-direction descriptive signal, not a directional alpha signal.
- **Rule summary:** Imbalance is `(top-five bid depth − top-five ask depth) / total top-five depth`. Center = midpoint + 0.25 × imbalance × spread − 0.25 × clamped inventory ratio × spread, clamped to the best bid/ask. Half-width is at least half the displayed spread and is widened as needed for the user-supplied per-side fee-plus-slippage allowance; prices are then constrained to passive sides and the tick grid.
- **Useful next action:** Treat the legs as a paper worksheet only. You can compare them manually with a later genuine book and independently decide whether to test the idea under a separately designed, timestamped paper/validation process. This output itself does not place, queue, refresh, cancel, or monitor orders.
- **Status:** Implemented pure math, deliberately paper-only. “Ready” means the calculation produced a structurally usable result, **not** a recommendation, fill likelihood, or evidence of edge.

### 5. Review series/bar-quality diagnostics (not a backtest)

- **Purpose / trader question:** “Were supplied candle series attributable and structurally clean?”
- **Location:** `lib/trading/quant-making.ts:129–203, 363–405, 457–458, 576–599`.
- **Practical use:** Supply `series` as an array. It may be empty for quoting. If supplied, use correctly labeled `provider` or `user-import` series, valid timeframe/fetched-at metadata, and closed candles; review the resulting counts.
- **Actual output:** Counts for provider/imported series, unique closed bars, duplicate bars excluded, irregular gaps, and invalid/duplicate book levels excluded. It excludes invalid, open/future, and conflicting duplicate bars; candle data is **never joined to L2 or used to invent quote outcomes**. Input bounds: at most 8 series and at most 5,000 bars per asset; over-limit input is rejected rather than silently truncated.
- **Useful next action:** Fix provenance/timestamp/duplicate/gap problems at the source if candle diagnostics matter to a separate analysis. Do not interpret clean candles as maker fill or profitability evidence.
- **Status:** Implemented data-quality diagnostics only; no candle-based making signal or backtest.

### 6. Read validation status and “no signal”/insufficient results correctly

- **Purpose / trader question:** “Is this operationally usable, or has a performance edge been demonstrated?”
- **Location:** Base validation and requirements at `lib/trading/quant-making.ts:44–56, 272–316`; result branches at `363–709`; result contract at `quant-lab-types.ts:68–96`.
- **Practical use:** After calculation, inspect status, summary, validation reasons, data requirements, limitations, and whether `paperPlan` actually exists. Do not infer a quote plan from `ready` alone.
- **Actual output:** Validation is always `unconfirmed`: 0 actual/train/test samples, no walk-forward, no untouched holdout. The stated performance gate requires at least 100 independent resolved quote outcomes with actual queue/fill/cancel/latency records, chronological walk-forward, and a one-use untouched OOS holdout. A single snapshot cannot provide these.
- **Interpretation / next action:** `ready` with no plan means specifically that the cost gate suppressed quotes. `insufficient-data` means a required input or bound/book check failed. `unavailable` means a viable passive tick-grid pair/capacity could not be emitted. Fix the named missing prerequisite or stop; never translate a flat/no-plan/insufficient result into an order.
- **Status:** Validation output is present, but no actual outcome evidence, backtest, OOS validation, or statistical edge is established by this source or its tests.

## Exact operational prerequisites

1. A supported Coinbase crypto product with a supplied single-venue L2 snapshot: nonempty symbol/source; finite positive Unix-millisecond `receivedAt` not later than `now`; `status` exactly `polled` or `streamed`; bid and ask arrays; positive finite tick and lot size; at least one unique positive finite level on each side; best bid strictly below best ask.
2. `now` is a positive finite Unix-millisecond value. `series` must be an array even if empty; max 8 series and 5,000 candles per series.
3. Finite non-negative user-supplied `feeBps` and `slippageBps`; finite inventory; positive finite order size and inventory cap. To get a paper leg, at least one side must have a full lot of remaining capacity, cost gate must pass, and tick rounding must yield distinct positive prices.
4. For any **performance** assertion (not required merely to calculate a paper target): 100+ independent resolved quote outcomes with actual queue/fill/cancel/latency records, chronological walk-forward, and untouched one-use OOS holdout. No such records are produced here.

## Operational output vs. validation evidence

The only actionable artifact is a pair (or one-sided subset) of **paper reference price/quantity targets**. There is no order API, queue priority model, multi-leg execution workflow, simulated queue/fill/cancel behavior, persistence, inventory sync, PnL/equity curve, or performance estimate. The unit tests exercise a synthetic algorithm fixture labeled explicitly as synthetic; passing those tests is not live-feed/device proof or statistical evidence. No synthetic result establishes a claim.

## Confirmed source defect

- `server/trading/venue-depth.ts:228–249` stamps the REST fallback book with `receivedAt: Date.now()` after `cached(..., 3000, ...)` returns raw L2. `cached()` returns the same cached value on a hit (`server/trading/market.ts:8`), so a cached snapshot can be reported as freshly received even though it was fetched up to three seconds earlier; the displayed book age is understated. **Minimal fix:** cache the REST payload together with its original fetch-receipt timestamp and return that timestamp on cache hits (or disable caching for this endpoint if accurate receipt time is required). This is a timestamp-fidelity issue, not evidence of an execution or alpha defect.
