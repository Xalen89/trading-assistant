# ORB Strategy — native futures and NAS100 CFD

Updated 19 October 2026. The uploaded video remains one separate **ORB Strategy**, not a replacement for WR1 or Breakout Momentum. Its futures source, your approved precision rules and the new explicitly selected NAS100 CFD adaptation remain distinct.

## Use your configuration on NAS100

Select your actual **TradeLocker NAS100** market, then open **Strategies → ORB → Configure ORB**. Choose **NAS100 CFD**, press **Detect NAS100 tick**, review the returned instrument/source, and apply the verified tick to the local draft. Confirm the app convention and **Save ORB app configuration**. Applying ORB selects the 1-minute execution chart without changing your market.

Detection is read-only: it does not save a workspace, create a paper proposal/order, approve a gate or arm automatic trading. Saving creates a new strategy revision, preserves earlier settings in history and clears old confluence approval. Use **Save to cloud** explicitly to carry it to another device. Incomplete drafts can be saved but cannot qualify for source execution.

Existing configurations still default to **Native ES/NQ**. Neither changing your chart to NAS100 nor selecting CFD mode silently reuses an old NQ/ES automatic consent.

## What remains from the video

Prepare on **1-hour ES/NQ futures** and mark untested Asia, London and New York session highs/lows. The source opening candle is **08:00–08:15 EST**, not the generic 09:30 range. Entries are **09:00 inclusive to 11:00 exclusive EST**. The narrator specifies **50–150 NQ points** or **20–40 ES points**, at **3R**.

Fixed EST is UTC−5 year-round. The optional New York/DST setting is a personal override; device time does not reinterpret source bars. The 11:00 cutoff stops new entries, not existing positions. The source omits exact hourly analytical session clocks and the gold/Asia opening anchor; no missing clock, extra HTF bias or gold entry model is invented. Analytical levels use only complete loaded windows; “untapped” means no **later loaded completed bar** reached the level, not all-time untouched.

The narrator’s 40–60% remark is not measured performance and is not a validated win probability.

## Your approved causal execution

On 18 October you approved app-added precision rules: use the opening candle’s 50% midpoint, a completed 1-minute continuation beyond the retest high/low, and a stop one true instrument tick beyond the opposite retest wick. The sequence is:

1. A completed 1-minute close above the opening high or below its low.
2. A **later** completed candle spanning the opening range’s 50% midpoint.
3. Another **later** completed candle closing beyond the retest high for a long or low for a short.
4. A current eligible confirmation, valid wick-plus-tick stop and exact 3R target inside the chosen mode’s point band.

No same-bar ordering is guessed. Missing/gapped/forming/future bars, old confirmations or malformed duplicates do not manufacture a setup. The range comes from the exact completed same-source 08:00 15-minute candle, or a disclosed fallback using all **15 contiguous actual 1-minute bars** only when that exact feed is absent. A source request that began before the opening candle ended cannot be promoted to a completed range later merely because its response was slow.

## What changes for NAS100

This is an **app-added CFD adaptation**, not a claim that NAS100 is NQ futures or that its results are validated. It retains the clock/sequence and uses **50–150 CFD price points at 3R**. CFD points are raw price differences, not CME contract economics.

The actual selected-account NAS100 instrument is **TL:3884**. Its broker catalog reports an equity-index under the Stocks label; the strict resolver accepts this label only for the exact TradeLocker NAS100 symbol and instrument. NAS100.PRO, US100/USTEC aliases, Gold, crypto, ordinary equities and other CFDs are not silently substituted.

The 19 October 14:46 UTC read-only source check returned **0.01** from the selected broker’s `tickSize` metadata. It is **not** inferred from chart decimals, lot size, price-unit display or NQ’s 0.25 CME tick. Your configuration is bound to that instrument and the server rechecks current metadata; missing, changed or mismatched increments block qualification. Tick metadata retains its actual source label and is separately bound to the selected BID candle feed, rather than falsely relabelled as candle data.

Native NQ/ES keep their **0.25-point** outright tick and original source point bands [1] [2]. Stops do not receive a second generic display-unit buffer. Actual paper entry repricing retains the source stop and exact 3R; a move outside the band still blocks a source entry.

The real NAS100 check found the correct completed range (high **29,593.23**, low **29,542.69**, midpoint **29,567.96**) and recognized its closed breakout/retest/continuation. That particular path’s **253.62-point 3R target** was outside the 50–150 adaptation band, so it correctly remained blocked. This is source behavior, not a rejected NAS100 configuration or a performance claim. No order was created.

## Optional automatic paper

Automatic ORB is **paper-only and off by default**. AI may explain rules or blockers, but an AI scenario, screenshot resemblance or free-form answer cannot enable it or override deterministic gates.

After saving/reviewing the selected mode and approving a fresh same-direction confluence gate, deliberately choose the exact **NAS100 TL instrument** in Automatic paper and Arm it with **1% or 2% risk**, **1–3 automatic entries per source-local day** and expiry within **24 hours**. Native NQ/ES remain separate scope choices. A positive daily-drawdown limit, canonical realized-balance sizing and the existing discipline checks remain required.

Every entry checks current source/clock/1m confirmation/range, metadata, actual quote, stop/3R band, current source/gate revisions and existing positions. A shared DB advisory lock plus durable deterministic signal/proposal/order IDs prevent duplicate checks across tabs/restarts. Claims are committed before the normal paper lifecycle reads them on a separate pooled connection. An unsupported lock fails closed. Entry/SL/TP remain visible in the existing paper lifecycle; no source-invented partial or break-even rule is added.

The runner checks while the owner app is **foreground and visible**. It is not a verified closed-app/24/7 worker. Off/background/expiry stop new checks, not existing positions or already-submitted requests. Confirm Off in cloud if another device may retain earlier consent. Genuine futures feeds remain necessary for native ES/NQ; the NAS100 adaptation uses its own broker feed, never an invented futures feed.

## AI error in the screenshot

The screenshot’s HTTP412 is a managed-AI service refusal, not an ORB calculation or chart bug. The app now handles that and equivalent HTTP200 error envelopes as terminal safe failures: no raw provider JSON, repeated request, automatic model/provider bypass or invented scenario. Saved layers, your question and deterministic historical/chart/ORB features remain independent.

**This code change does not restore service access.** For service-account help use https://help.manus.im. Switching to Efficient is not presented as a bypass. No account balance was inspected or estimated and no live AI request was made for this repair.

## Verification and limits

The new paths have targeted software-fixture coverage for metadata preparation, actual broker equity-index identity, causal/source/risk gates, canonical bid/ask repricing, explicit auto scope and sanitized terminal AI errors. The actual NAS100 metadata/source trace made **zero workspace, proposal, order, schedule or AI writes/requests**. Final current full-suite/build/export evidence is recorded in the latest handoff after completion.

Final current validation: **753 passed, zero failed, one pre-existing authentication integration skip (754 total)**. TypeScript, lint, backend/local chart build and web/iOS/Android source exports passed. The synchronized156-feature guide and terminal-error cases passed16focused tests. API/Metro returned HTTP200; no configured private credential values were detected in117export files. The613-file credential-excluding source archive passed required-file/ZIP/checksum verification and is regenerated with the final local source commit.

Fixtures and exports are not trading performance, restored AI inference, physical iPhone proof, native push receipt, signed native builds, a deployed callback or an actual automatic paper fill. The latest source backup excludes owner data and credentials; a local commit/ZIP is not a recorded remote checkpoint or published release. No public app link or publication is being created.

## Official native tick references

[1]: https://www.cmegroup.com/markets/equities/nasdaq/e-mini-nasdaq-100.contractSpecs.html "CME E-mini Nasdaq-100 contract specifications"
[2]: https://www.cmegroup.com/markets/equities/sp/e-mini-sandp500.contractSpecs.html "CME E-mini S&P500 contract specifications"

##19October — comprehensive scan follow-up

ORB automatic paper now rechecks saved consent/revision, clock/expiry, complete canonical ledger/risk, same-market pending/open occupancy and local-day cap after source work, before its durable claim and again before the canonical order attempt. An Off change received during source work blocks before creating an unused claim. These remain explicit opt-in paper controls; neither the scan nor the source changes arm automation or place an owner order.

Paper proposals/fills now use the complete canonical realized ledger balance, not a client balance or a balance reconstructed from old proposal risk. Cancelled/closed review cannot rewrite bracket/management fields, duplicate proposal mode races conflict, cancellation retries are idempotent and ambiguous same-bar partial→break-even behavior uses conservative stop-first treatment. Manual tickets preserve the0.5%default. Source rollback restores ORB and session configuration and clears the old gate. NAS100 remains the explicitly selected exact TradeLocker instrument with verified market-bound tick; no futures equivalence, fake volume, new permission or live broker execution was introduced.

See APP_SCAN_AND_REPAIRS.md for current software checks and remaining device/feed/production limitations. Previous753-test results above refer to the earlier NAS100 milestone, not this later scan.
