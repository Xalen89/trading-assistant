# Zax — connected, multi-timeframe scenario layers

## What changed

The Chart now has separate **AI scenario layers** and **Historical scenario layers**. A layer has its own source timeframe and the chart timeframe(s) where it should appear. The existing current historical replay/captured-alert path remains available separately as **Current historical replay**.

| Control | What it does |
|---|---|
| Source timeframe | Uses actual source history from 1m, 5m, 15m, 1h, 4h, 1d or 1w to generate that layer. |
| Show on target frames / All | Chooses which chart timeframes display the saved snapshot. Switching chart timeframe does not erase it. |
| Generate AI / Add historical | Adds an independent snapshot; AI hypotheses and actual prior continuations remain different kinds of data. |
| Show/hide, remove and color | Changes only the addressed layer, not other layers or strategy indicators. |
| Line, ghost OHLC or both | Preserves the connected line/ghost-candle appearance. |
| Follow chart | Reconnects and scales the drawing to the latest actual chart candle while retaining source intervals/gaps. It does not refresh analysis. |
| Fixed source | Keeps the original source anchor for comparison. |
| Refresh layer | Regenerates from that layer's source timeframe and preserves its target frames/display preferences. |

The owner workspace saves at most **12 snapshots**, with **six additional comparison layers visible on a selected chart**. The original current historical replay is separate. The colored chart legend and Chart Details show each layer's source/frame and connection. Preferences use the existing local/cloud owner sync; no public sharing was added.

## AI stale-source recovery

**Auto is now the default.** It refreshes only your selected instrument/provider. Fresh completed bars plus a current quote produce a current-context hypothesis; if the source still supplies old bars or no current quote, Auto generates an explicitly dated **historical-context AI hypothesis, NOT CURRENT** from completed history. It never swaps accounts, switches your selected market or fabricates live bars.

**Current** stays strict: fresh completed source bars and a current quote are required. The retry now waits for and bypasses the exact same-provider quote and history caches, including underlying frames for eligible derived views. Coinbase history uses an explicit recent UTC request window instead of its unbounded default. A provider returning old bars still cannot pass current-data or paper-entry freshness checks.

**Last available** always uses at least 15 actual completed source bars, anchored at the last completed candle without a substitute live quote. No weekend/session closure is inferred from a symbol or date; provider-declared sessions are the calendar authority. Requested Auto and resolved current/history context are stored separately so regenerating an Auto layer keeps its Auto preference.

For the reported failure, read-only diagnosis confirmed the selected **NAS100, 5m, TradeLocker BID** history ended with a bar opening at **2026-10-18 08:15 UTC**, closing at **08:20 UTC**, while the request was after **16:12 UTC**. A real managed-AI Auto check on that source successfully generated 12 hypothetical steps with `probability: null`, correctly labelled historical context. No scenario, source or trade was written during this check.

An additional real output/save mismatch was fixed: internal model draft `steps` were accidentally included in the returned forecast, which the strict saved-layer schema rejected. The generator now returns only the declared forecast fields. A generation-to-persistence regression verifies that Auto layers retain source provenance, target frames and the null probability.

**On your iPhone:** reload Safari once, open **AI scenario layers**, leave **Auto** selected, and tap **Generate AI layer**. The independent timeframe/target selections and connected chart appearance remain. The mode button clears an earlier mode's error. If you deliberately choose Current while NAS100 still supplies those old bars, the correct stale-data refusal remains.

AI layers remain hypothetical and have no calibrated probability. Expired, wrong-market or malformed layers are not rendered. Historical layers require actual past source continuation. Neither drawing is used as actual chart candles, confluence evidence, paper-entry permission or backtest validation.

## Kept intact

The original historical replay, capture/direction-watch behavior, current strategy-attached indicators, saved paper entry/SL/TP markers, chart navigation and local web/native chart runtime are retained. Trading remains owner-only and paper-only.

## Verification boundary

Source/renderer/persistence regressions and public-data AI smoke checks are recorded separately from a real owner-device test. The user's iPhone/provider-specific retry is still needed before claiming the reported on-phone path is fully verified. No signed native build, push activation or successful new publication is implied.

## Source display and recovery refinements

AI cards now display the completed **close** time rather than treating a bar's opening timestamp as its close. Historical overlays are explicitly **rebased/scaled shapes and source times**, not original historical prices. Old-history AI layers carry **HISTORY CONTEXT / NOT CURRENT** directly in the chart legend. The persisted layer schema is shared by the client and server; invalid local entries are withheld before the controls render, with a notice rather than a Chart crash. Source strategy IDs/versions and any stored historical endpoint must match their actual continuation. Per-layer **Use available history** offers explicit recovery when a formerly current AI layer cannot regenerate from fresh sources.

A real public Coinbase + managed-AI current-mode check returned twelve hypothetical steps with `probability: null`. It did not access owner records, write a workspace or place a trade. This establishes the current generation service path, not predictive quality or the particular iPhone/broker feed shown in the user's screenshot.

Controlled browser evidence: the actual chart component at 390px showed AI 1h and historical 15m simultaneously on a 5m chart; hiding history repainted the chart, switching to a 15m target retained only its selected AI layer, returning to 5m restored both, and source/connection Details remained accessible with no horizontal overflow. This used labelled synthetic fixtures and a local display-only iframe, not owner data or a native/iPhone release. Source-schema/projection/controller tests cover concurrent layers, real source timestamp/close semantics, expiry and malformed saved entries.

Final recurring-failure repair: current TypeScript/lint, full current regression suite, backend build and web/iOS/Android source exports passed. The focused read-only safety trace found no new Current/order freshness override, account/provider substitution or save-schema mismatch. These checks do not create newer NAS100 bars or verify an installed iPhone app. The actual iPhone Safari reload/Auto generation remains the final user-device confirmation.

Final full-suite count: **550 passed, zero failed, one pre-existing authentication integration skip** (551 total). Actual provider bars remained old; the working Auto result is a historical-context hypothesis, not restored live history.

## Latest AI direction and chat repair — 18 October, 17:42

The reported direction error came from a model declaring one direction while its final generated close moved the other way. The pure validator still rejects that contradiction. The server now spells out the final-offset rules and can request **one corrected model output**, using the same source, ATR, anchor and selected model inside the original deadline. A successful correction is labelled in the saved card. Persistent contradictions, invalid prices, unsupported certainty/execution claims and timeouts still fail visibly; no price path is forced to fit a label.

The duplicate Coach-key bug was traced to a request counter resetting when the screen reopened. New conversations use UUID-backed exchange IDs; old duplicate IDs are repaired deterministically without deleting messages or changing their order. Long model/context/source metadata wraps on narrow screens rather than running off the card. Conversation privacy and cancel/retry/timeout boundaries are retained.

### How to choose a stronger AI

In **Coach** (also the Library's Coach) or **AI scenario layers**, select **AI quality → Deep analysis** before your next question or generation. This is one shared workspace preference. Efficient stays the default; switching quality does not call a model or regenerate old snapshots. Use your normal **Save to cloud** action to carry the preference to another device unless workspace auto-sync is enabled.

**Efficient** uses available GPT-5 mini or Gemini Flash. **Deep** prioritizes available GPT-5.5, then GPT-5, then Gemini Pro, with stronger reasoning settings. The server rechecks the live catalog; unavailable models are skipped and a missing tier is reported rather than silently upgraded/downgraded. Replies and scenario cards identify the actual selected model. A permitted Coach output fallback stays in its selected tier and is disclosed. Deep can take longer and use more model resources; existing request limits, deadlines and completion caps remain in place. No model price is inferred from sparse catalog metadata.

A stronger model can help explain strategies, compare supplied evidence and follow structured instructions. It cannot make stale TradeLocker candles current, create verified order-book/tape data, train itself from a screenshot, or turn a hypothetical path into a proven predictive edge. Success probability stays null; owner-only/paper-only boundaries are unchanged. Separate Library upload/review workers keep their existing model policy; this selector governs Coach and AI scenarios only.

**On iPhone:** reload your existing private preview, reopen Coach to restore repaired messages, then test a question. For a scenario, leave Auto selected, optionally choose Deep analysis, and Generate AI layer. Old saved snapshots are not silently regenerated. Actual iPhone execution and Deep-tier live inference have not yet been verified by this update; no signed native build or publication is claimed.

Real transport check at 2026-10-18 22:41:30 UTC: public Coinbase BTC-USD 5m plus managed GPT-5 mini returned a current-context 12-candle hypothesis with valid display OHLC, probability null and no internal draft fields. No owner records, layers, sources or paper orders were written. This is service wiring evidence, not forecast accuracy or the owner's broker/device verification.

Final validation for this newer AI repair: **583 passed, zero failed, one pre-existing authentication integration skip** (584 total). TypeScript, lint, backend build and web/iOS/Android source exports passed, with Metro/API HTTP200. The full-suite command was corrected to invoke Vitest directly after a pnpm flag error; no application test failed. The source-only backup excludes credentials, owner data and export artifacts. Canonical checkpoint/publication remains blocked by managed recovery/remote credentials; no publication was attempted.

##19October: terminal service refusal

The screenshot's HTTP412/code9 is a managed-AI service refusal, not an ORB/chart calculation error. The app now sanitizes terminal failures, including HTTP200 error envelopes, preserves saved layers and the question, stops pending UI, and provides a user-initiated Manus Help link. Terminal code9/refusal bodies are recognized before retry scheduling even under otherwise-transient HTTP statuses; there is no automatic model/provider bypass or fabricated candle fallback. Ordinary genuinely transient retry behavior remains bounded.

This repairs app error handling, **not service access**. For service-account support use https://help.manus.im; no account balance or remediation was inspected, estimated or promised. Efficient is not offered as a bypass. Deterministic historical replay and ORB—including the explicitly selected NAS100 CFD mode in `ORB_STRATEGY_UPDATE.md`—remain separate from managed AI availability. Actual inference has not been retested during this repair.

Final19October source result:753software tests passed/0failed/1pre-existing auth skip; TypeScript/lint/backend/local chart and all-platform source exports passed, with API/MetroHTTP200. Nine terminal-error cases and seven retained feature-guide tests passed. The613-file source backup excludes credentials, owner data and exports. These checks do not establish restored inference, actual iPhone behavior, device alerts, a remote checkpoint or production publication.

##19October — comprehensive scan corrections

The latest scenario controls preserve an allow-listed AI failure kind through tRPC. A terminal service refusal now uses fixed clear copy instead of suggesting an immediate retry; no raw provider body is exposed. Both AI scenario controls use a52-second device-only timeout and request epoch, restore usable controls after a connection stall, retain the question/saved layers and ignore late results. This does not cancel already-started server/model work. Known terminal no-output failures release only their own application usage reservation; an independent60-attempt/10-minute ceiling is not released. This is not Manus billing/refund handling.

All eight selected display timeframes now pass strict persistence, while duplicate targets and12-saved/6-drawn caps remain enforced. The chart can show an explicitly labelled forming quote-update candle, but scenario/indicator/source anchors use the last completed candle. Pinned daily profile acquisition is independent of selected strategy, and narrow status text no longer splits Unknown into separate lines. Current source data remains required; unavailable/old provider history does not become live.

The scan's one actual Deep-model check still returned terminal-unavailable. No second completion/provider bypass was performed. Code fixes do not establish restored managed inference; service-account assistance belongs at https://help.manus.im. Final software checks and complete ten-area evidence are recorded in APP_SCAN_AND_REPAIRS.md. Earlier inference successes above are dated history, not proof of current service access.
