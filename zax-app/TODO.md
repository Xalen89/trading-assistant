# StratDesk implementation outcomes

- [ ] Native paper-trading workspace: six main tabs Trading Chart, Markets, Trades (Open/Pending/Closed), Alerts, Strategies and My Library (Patterns + Styles). Native iOS/Android Expo components, one-handed portrait flows and distinct launcher/adaptive/splash icons. All orders/fills/balances simulated; no deposits or real-money order execution. A broker account may be connected for data-only quotes/history when expressly requested by the user.
- [ ] Market browser and read-only live data: Crypto, Forex, Metals/Commodities, Indices, Stocks/ETFs and Futures; searchable named instruments and favorites, live source/timestamp/freshness, connected/unavailable states. Real public live crypto integration; provider-key/entitlement activation for wider markets. NQ/ES futures cannot be substituted with cash indices. Sample bars only in explicitly selected Sample mode, never a silent fallback.
- [ ] Strategy Library: WR1 imported from shared PDF as a source-attributed reference, not user-authored. Add/edit/duplicate personal strategies, independently enable/disable chart visibility, select active analysis strategy, Strategy → Chart Apply and photo-based in-library strategy search. Preserve WR1 taxonomy, source pages, risk disclaimer and documented session times.
- [ ] Pattern Uploader, Trading Style Uploader and Learn From My Files: device Files import for compatible PNG/JPEG/WebP/PDF/TXT/Markdown/JSON sources, type/size validation and clear errors. Preserve source and label, searchable My Pattern Library (FVG, IFVG CE, Order Block CE, RDRB CE etc.) and Style Library; name/tags/market/timeframe/style links. User reviews extracted style rules before applying them.
- [ ] Custom Pattern Trainer and AI Learning Engine: real server-side multimodal extraction into structured descriptions/rules; versioned labeled positive/negative examples and Confirm/Reject/Correct feedback. Continuously update reference set and style rules from accepted uploads/corrections, not invented foundation-model fine-tuning. Track pending/failure/review/reference-ready/evaluation states. Show actual evidence and missing prerequisites.
- [ ] Live Pattern Overlay, Transparent Future Overlay, Pattern Match Confirmation and Pattern Source & Strategy Card: native candle coordinate mapping, source/style version links, visible AI vs deterministic vs manual markings, independent strategy/layer switches and chart jump to alert evidence. Future overlay dashed/low-opacity and explicitly scenario-based, not known future prices.
- [ ] Confluence Counter, Confluence Overlay (STDV, Turtle Soup, FVG, Order Blocks etc.), Success Probability Score and Confluence Breakdown: weighted met/missing/unknown factors with style adaptation, transparent provenance and no probability fabrication. Historical Pattern Engine imports supported OHLC data, evaluates stop/target outcomes chronologically with conservative same-bar handling and no lookahead. Probability remains uncalibrated without appropriate evaluation/history.
- [ ] Cycle Analysis, Market Rhythm Tracker, Quant + Hedge Fund Methods and Self-Evolving Engine: explicit lookback-based volatility/autocorrelation/momentum/correlation methods, historical analog matching and insufficient-data states. Versioned suggested refinements with evaluation and rollback; no proprietary-performance claims or silent strategy mutation.
- [ ] Smart Trade Alerts with app closed: saved market-specific rules (including XAUUSD), style filters, cooldown, server-side detection/deployed callback, deduplicated delivery outbox, token/receipt handling and native push opt-in. Clickable Pattern Alert → Chart Jump includes symbol/timeframe/source/strategy. Device build, feed, credentials and deployment activation remain explicit pending outcomes until verified; foreground-only checks do not complete this outcome.
- [ ] Market Context: Weekly Profile bullish/bearish at chart top, Previous Day High/Low markers, color-coded timezone clocks, manipulation sessions with DST-aware New York vs fixed EST options, economic calendar and dated COT report integration with unavailable/stale states and real sources instead of fictional events or positions.
- [ ] Journaling: detailed step-by-step Pre-Trade Thinking Journal, validated paper plan (entry/stop/targets/risk/R), simulated Pending/Open/Closed transitions, full history and closed-trade deep dive. Snapshot strategy/rules/evidence; actual computed paper outcomes, no invented performance. AI review cannot invent fills or prior reasoning.
- [ ] Durable workspace and protected uploads: real OAuth and owner-scoped cloud storage, local guest exploration kept distinct, versioned strategy/style/pattern/match/journal/alert records and explicit cloud sync errors/conflicts. Server credentials absent from client bundles. Upload sources access-controlled rather than merely unguessable public URLs.
- [ ] Validated deliverable: meaningful Metro/API preview, type/unit/export checks and one read-only implementation trace, corrected confirmed defects, canonical main checkpoint. Clearly distinguish native source/UI preview, signed Dashboard build artifacts and activated live/push capabilities.

## Evidence-backed status — first paper-trading build

Implemented: all six native tabs and identity assets; public Coinbase live quotes/candles/ticker; personal strategy/rule/weight editing, visibility and version rollback; compatible file imports, real extraction and reviewed styles; labeled corrections and durable source revisions; match/source snapshots and confirmation; regular FVG/CE/range/manual overlays and historical-analog scenarios; paper journals/plans/fills/exits/history/reviews; owner-scoped encrypted sources/cloud revisions; alert rule/outbox/evidence/native opt-in/scheduler source plumbing. See BUILD_NOTES.md for the exact boundary of each implementation.

Verified: TypeScript; server bundle; 35 focused regression/security tests; additive database migrations; actual BTC/ETH provider quotes, 300 real candles and WR1 chart-image extraction; local/public Preview/API HTTP 200; Android+iOS Hermes and web exports; no configured server secret values in client outputs; one read-only integration trace and targeted corrections.

Still open: FMP key/market entitlements and per-instrument verification; licensed futures/contract mapping; native signing/build artifacts and actual device behavior; published backend and real closed-app push delivery; full automatic WR1 discretionary detectors/SMT-C-SMT; seasonality and broad uploaded-rule historical validation; calibrated probability, robust out-of-sample refinement and any proprietary institutional-method claims. The complete criteria above are deliberately retained and are not checked off merely because a first source build exists.

## Selected personal TradeLocker feed

- [ ] Connect the specific account behind the user's active TradeLocker chart for current prices and historical candles. Obtain the correct Demo/Live environment and exact broker server through protected inputs; verify account authentication, supported instruments and actual data freshness. If more than one account is returned, the user must select the intended account. Account credentials/tokens remain on the backend; only the authenticated project owner may use the personal feed. Trading-capable authentication must not expose broker order/position operation routes: no placement, modification or closure of broker trades. StratDesk plans/fills/exits stay simulated. Preserve source and CFD/venue labels, and never silently replace exchange futures with broker index CFDs. Leave connection status pending until the selected account's actual feed is verified; no publication is requested by this connection.

### TradeLocker integration evidence

Account authentication and explicit account-ID match succeeded. The selected account returned 165 information-route instruments; real XAUUSD bid/ask and 300 recent five-minute BID bars were verified. Owner identity was confirmed through a protected app-sign-in email input because OWNER_OPEN_ID is not supplied in this runtime. Owner-gated catalog/quotes/candles, broker-source selection, searchable/paginated Markets, correct chart symbol/bar basis, received-time labeling and supported USD paper-unit valuation are implemented. Anonymous broker quote HTTP 403, 47 focused regression/security tests, TypeScript, backend build, Android/iOS/web bundle export and local/public HTTP 200 checks passed. Source credentials/IDs are excluded from client/source artifacts. User's actual app sign-in, native device behavior and full instrument/lot/session validation remain explicit follow-up checks; no publication or broker order was performed.

## Sign-in failure correction

- [ ] Preserve platform-owned cookies; validate only the app’s own project-scoped session. Complete a browser/native OAuth transaction once even if React rerenders/restarts effects; retain single-use nonce/signed native-state verification. A legitimate signed user with an empty display name must still be identified by verified appId/openId, not rejected for missing display metadata. Show actionable retry/error UI. Confirm the actual user login result before claiming the personal feed is accessible in their app session. No changes to TradeLocker credentials, no anonymous feed bypass, and no broker execution.

### Exact six-message Preview badge

Reproduced the six console errors on a fresh callback load: onStartShouldSetResponder, onResponderTerminationRequest, onResponderGrant, onResponderMove, onResponderRelease and onResponderTerminate. The expanded stack pointed to CandleChart's Svg onPress and the installed SVG web adapter, which forwarded native responder handlers to a DOM svg. Chart presses now use a native Pressable/View responder wrapper with measured chart coordinates; the SVG has no native touch handler. This preserves native inspection and avoids suppressing console errors. Callback contrast also uses an explicit dark native View rather than a theme class overriding the intended color. Recheck a fresh Preview load and actual chart inspection before marking the runtime badge fixed.

Runtime correction evidence: a fresh callback load no longer showed the six-message badge; the dark error/retry page completed correctly. Returning to the real Coinbase chart and clicking a candle moved the crosshair and changed the OHLC inspector, without recreating the warning badge. All eight current lint errors and twelve lint findings were corrected with rules still enabled. An additional quote-age unit mismatch was corrected: quote timestamps are Unix seconds, not milliseconds. The real user’s completed Manus sign-in is still required to verify owner-only TradeLocker access in their session.

## Embedded Preview sign-in follow-up

- [ ] Web Sign in must leave an embedded Preview iframe and start the real OAuth transaction in a standalone browser tab. If browser popups are blocked, show an explicit standalone-app link instead of failing silently. An authenticated tab must not be represented as an authenticated embedded frame when third-party cookies are blocked. Keep the existing Manus provider, cookie/nonce checks, native signed deep-link flow and owner-only TradeLocker checks. Verify browser-context opening independently; the user's exact remaining error/real login result is still needed.

Embedded handoff evidence: TypeScript, zero ESLint findings, server compilation and 82 runnable tests passed (one existing integration test skipped), including three standalone/embedded/blocked-popup cases. The standalone managed Preview returned HTTP 200. The user selected failure location 2: Manus login page opens but its sign-in option fails. No real user session has been confirmed; the application does not treat the popup opening as authentication or expose the private broker feed to a guest. An unresolved provider/account login is directed to https://help.manus.im rather than worked around by weakening authentication.

## Browser login confirmed

The user reported successful sign-in through their own browser on 2026-10-15. Preserve that real session; do not ask for another login or manufacture a Sandbox session. Check only the registered authorized-owner record and configured account feed without changing data or exposing identity/credentials. Make the browser-tab guidance visible before web sign-in, while retaining the existing authenticated/guest distinction and owner-only data access. Native device login and full personal-feed UI verification remain separate from this user-reported browser result.

- [x] Confirmed standalone browser login: user reported success; the real authorized-owner record and recent authenticated application activity were verified read-only. No fake session, account/role changes or credential disclosure. The selected broker account again returned 165 instruments, XAUUSD bid/ask and 300 current five-minute BID bars, with no broker orders. Added pre-login browser-tab guidance; TypeScript/lint/formatting passed. This resolves the browser-login milestone only; native-device login, the user's complete market UI journey and every instrument/session/lot mapping are not inferred from it.

## Resource-driven improvements

- [ ] OpenCV Pattern Uploader: supply a real reusable Python backend script; compatible image uploads get an owner/reference/version-specific normalized visual descriptor in a local SQLite vector database, with encrypted durable managed-DB mirroring. Preserve originals/aspect ratio; optional explicit ROI; reject unreadable/blank/oversized inputs; cap image dimensions, candidates, time/output and worker concurrency. Scope every vector/cache operation to authenticated ownership. Photo search and live chart matching return source-linked visual neighbors; reviewed rules/manual confirmations remain separate from cosine scores, semantic pattern certainty and success probability.
- [ ] Historical research: actual validated OHLC inputs, multi-asset experiments, bounded parameter sweeps, chronological walk-forward selection and evaluation, next-bar execution with fees/slippage, trade/drawdown/performance analytics and forward-label output. Show train/test ranges, source/strategy/version, baseline/assumptions and ambiguity/missing-data states. Default app engine must avoid adding a commercially problematic dependency; optional vectorbt private-research compatibility and Apache-2.0 QuantStats support are clearly documented. Do not claim vectorbt PRO, full uploaded-style/WR1 backtesting, calibrated future probability or real account performance.
- [ ] Specialized evidence discussion: fundamental/sentiment/technical, debate, trader and risk perspectives with bounded calls, disagreements and source IDs. Fundamental/sentiment abstain when real evidence is absent. Use the existing server LLM service; no fabricated data, success percentages, silently changed styles, fine-tuning claims or broker orders. Store owner-scoped job/source/strategy/result snapshots; interruption/failure is visible and never silently repeats model work.
- [ ] Native dashboard/context: keep the six requested tabs and Expo native stack; do not initialize a redundant Next.js replacement. Pin weekly Bullish/Bearish/Neutral profile above scrolling, color by actual/manual profile, put compact color-coded zone clocks beside it with selected source time basis, display confluence count/progress and an explicitly uncalibrated probability state. Preserve clean expandable paper trade/journal/deep-dive flows, real open P/L, risk/reward and closed-trade daily drawdown with optional initially unset paper limits. Calendar/COT formatting uses only actual source records with dates/impact/category provenance; no template data.
- [ ] Scenario/alerts: retain source-linked low-opacity historical scenario overlays, not forecasts. Add animated clickable foreground alert pills from real stored events and chart-evidence navigation. App-minimized/closed delivery remains gated by deployed scheduler/native push credentials/build/device permissions, not CSS or Tailwind. Do not claim that styling fulfills closed-app alerts.
- [ ] Integration quality and handoff: retain NativeWind/Tailwind versions and existing login/private data routes; protect secrets and user records; use additive migrations and portable bounded Python/API serving. Skip TradingView-Screener ingestion absent data rights, explaining scanner-vs-history and license limitations. Verify language/tests and actual real-image/real-OHLC worker behavior, use one read-only integrated trace, correct confirmed issues, save managed source without publishing, and deliver the requested script plus concise source/limitation documentation.

### Resource-improvement evidence

The image index, native pinned/context/performance/foreground UI, protected visual/job routes, causal NumPy research, separate optional vectorbt adapter and bounded evidence discussion are implemented. TypeScript/ESLint passed; 94 runnable TS tests plus 18 Python tests passed, with one pre-existing integration skipped. Actual WR1 page9 image indexed/exact-neighbor cosine1, 300 actual closed Coinbase bars produced four walk-forward folds; QuantStats compounding/DD separately verified; four actual AI calls completed with fundamental/sentiment abstention and a risk-vetoed wait/probability null. Web/iOS/Android source exports succeeded; no signed/device release or publication. Source-index optimistic update and worker reservation-release issues were corrected in the parent trace. Python-capable Dockerfile/deployment health declaration prepared, not container-built. See INTEGRATION_NOTES.md for exact scope/limits. Full WR1/ML semantic detector/calibrated probability/news/fundamentals/closed-app push/native-device outcomes stay open.

Independent read-only integration review completed. Fixed durable match feedback when the source is not in the local workspace, and allowed real imported-history backtests independently of chart Sample mode. Rechecked the worker reservation finding against the corrected outer finally, which covers database/claim failures and unsuccessful claims. Added authoritative owner-only metadata lookup (no original-image decryption), stale-reference rejection and no status transition after a failed feedback write. 98 runnable TS tests now pass, with one existing integration skipped; Python remains 18 passing tests. Private broker boundary remained intact. Final affected native/web export and managed-source save are required before delivery.

Final resource milestone: frozen web/iOS/Android source exports succeeded after the metadata-cache correction. Implementation source was accepted on managed main as dff76c0; no structured recorded-checkpoint receipt was supplied, and MCP resources do not expose project Version history. Do not replay the source push to manufacture that receipt. Browser Preview/API are healthy, 98 TS and 18 Python tests passed, and the standalone backend kit is verified. Confirm Dashboard Version history before signed releases; no publication or broker order was performed.

## Uploaded setup execution and sharper UI

- [ ] Automatic daily/weekly context: remove manual weekly-bias choice; show source-derived Bullish/Bearish/Neutral/Unknown, formula/boundary/as-of and limitations. PDH/PDL use the previous completed provider daily bar on every supported chart, with clear unavailable states and no silently invented exchange session. Display current device timezone and color-coded strategy clocks/manipulation windows. Existing calendar/COT panels must use real dated records and retain disconnected-source messages.
- [ ] Source-attributed sequential setup library: add Core Sequence / Silver Bullet (15m context, 1m–5m execution), OB Retest and STDV targets as separate uploaded-reference presets. Evaluate HTF bias → sweep (prior swing/day/Asian range when known) → opposite displacement/MSS → FVG/OB POI retracement in chronological order. Mark CE/body/wick, sweep, FVG, OB, MSS and -2/-2.5/-4 manipulation-range extensions; unknown timing/HTF/volume cannot be invented. Explain where every pattern came from and the selected strategy simply.
- [ ] Selected and combined strategies govern historical scenarios: independent visibility and up to three selected analysis rulebooks, AND/OR combination, conflict and unsupported-definition messages. Preserve analog lines and add actual OHLC ghost candles to blank right-side space, source date/anchor/horizon, low opacity and scenario labeling. Include protected original/cropped reference-picture view or template overlay with preserved aspect ratio; only detector geometry may be shown as price/time-aligned recognition. FVG, IFVG CE, RDRB CE, OB CE and other uploaded names remain searchable in Strategies/My Library; do not treat every uploaded photo/prose rule as a trained detector.
- [ ] Confluences, historical percentage and refinement: automatic supported factors show names/count, missing/unknown and manual factors separately; retained historical outcomes include exact entry/SL/TP/horizon/cost/same-bar assumptions, sample count and uncertainty. Historical hit rate is not calibrated future probability; low data shows insufficient history. Cycle/rhythm/quant statistics and versioned correction/refinement proposals must not imply proprietary hedge-fund methods, automatic fine-tuning, guaranteed improvement or higher win rates merely by combining filters.
- [ ] Chart paper Buy/Sell: clicking either opens populated editable SL/TP/size with fresh selected-market bid/ask/source, historical/structural rationale, strategy/version and detailed pre-trade inspection checklist. Default reference risk 0.5%, selectable 0.5–1%, minimum 2R or 3R target; stop beyond swing/block and target opposing liquidity or named range extension when valid. Explain insufficient-history fallback rather than claiming best possible bracket. No broker orders. Permit bracket edits after fill without altering original risk/journal snapshots; pending/open/closed history remains clickable.
- [ ] Opt-in paper management and retained deep dives: pending limit-style fills, 50% partial at 2R/first pool, move stop to break-even, final SL/TP or manual exit, idempotent event records and conservative ambiguous-bar handling. Manual exits remain allowed when new-entry caps are reached. Append-only owner-scoped trade/market/context/scenario/review snapshots and paginated history retain records beyond the 2,000-trade working set. Generated “what to look for” guidance is distinguished from actual user thoughts. Unknown USD valuation cannot create automated sizing or pretend to be broker lots.
- [ ] Ready-setup and meaningful scenario-change alerts: enabled market-specific rules include exact aligned confluences/count and source/strategy/combined versions; alerts expose captured candle/shape evidence and tap through to the chart/transparent scenario. Recompute watched supported setups even off-app only through deployed authenticated scheduling, within 12 broker reads and 45 seconds with rotation/cooldowns/deduplication. Native build, deployment, push credentials/token/permission remain pending until activated; foreground pills do not satisfy this condition. Do not auto-publish while privacy choice is pending.
- [ ] Sharper native instrument UI and privacy: stronger chart contrast/height, tighter typography/border/radius hierarchy, grouped Buy/Sell and expandable secondary research, accessible thumb controls and existing six tabs. Preserve source/user edits/login/credentials. User is choosing entire-app owner-only access versus unpublished preview with guest charts; do not change access before their reply. Keep private feed/uploads owner-only, app unpublished and all trading simulated. Confirm additions with targeted tests, one read-only integration trace and source exports; no native signed/device or live-push claims without actual results.

Privacy decision: user chose Owner-only app. Gate all application data/actions and tab UI by the real approved owner predicate. Preserve real auth bootstrap/callback/logout and health; show login-only landing to guests and access-denied to other signed-in identities. No role changes, record deletion, fake session or anonymous data bypass. Keep app unpublished; relaxing this gate for public use is a future deliberate change.

### Owner-only setup milestone evidence

Implemented owner-only tab/data gating with OAuth callback preserved; sharper chart controls and real-source weekly context; up to three source definitions and supported combination logic; actual analog lines/ghost OHLC or no scenario when insufficient; canonical paper proposals/orders/history/edits/partial/BE management, immutable original risk/journal and optimistic concurrency; review-only exact-version refinements. New orders no longer use the parallel local form. Unknown custom rules are not recognized by name. Late Buy/Sell/risk responses cannot replace later intent. Local and saved daily drawdown limits remain enforced; paper-form 2R checks are USD-conversion aware.

The independent read-only trace's confirmed order-risk/edit/parallel-local-flow/request-race/historical-label issues were corrected. Its scheduler-cookie finding was rejected against the actual contract: platform cron callbacks intentionally use app_session_id, distinct from the application's scoped login cookie; a regression preserves that distinction and task-to-owner binding. No scheduler, fake app session or broker order was created.

At 2026-10-15T22:00Z, actual approved-owner XAUUSD BID data produced 200 closed execution bars, a source-labelled bearish weekly-to-date profile, previous completed provider-day levels and a pure 0.5%-reference/2R plan. Current candidates were waiting, qualified historical count was zero, scenario/rate were withheld and probability remained null. Actual requested history/snapshot persistence was exercised, not an invented paper order. 100 TS trading/security tests, TypeScript and ESLint pass; final affected native/web export is running. Full discretionary/institutional rules, universal session/15m/4h POI coverage, image-to-price anchors, calibrated probability, native-device and deployed closed-app push outcomes remain open.

Frozen owner-only milestone: 101 scoped TS trading/security tests, TypeScript and ESLint passed; iOS/Android/web source exports after the last cap/form correction succeeded. Public standalone Preview/API are healthy; guest application data is denied. No signed build, live push, public publication or broker order occurred. Retain incomplete criteria above: this is supported source geometry and paper management, not every uploaded discretionary style or calibrated institutional inference.

## Added strategy excerpt — Pasted_content_03.txt

- [ ] Source references: add three optional named rulebooks without changing personal styles/WR1 or active selection on import. Trend following (D/4H/W, days–months): EMA20/50, uptrend and first green touch/bounce at20, stop below swing or50, 2×ATR trailing guide. Breakout (1m/5m/15m, minutes–hours): consolidation/resistance/flag guidance, RVOL≥2 and news/fundamental catalyst, buy-stop-limit one–two real ticks above resistance, stop below consolidation/breakout, 2R/3R. Keep Level2/tape/volume-profile as unavailable unless real sources exist; source tick/catalyst cannot be guessed. Mean reversion (15m/1h/D, hours–days): BB20±2σ and RSI14>70/<30; attachment stops before entry/SL/TP, so context-only, not an inferred divergence/entry. Preserve source text/line attribution and read-only references with personal duplication.
- [ ] Indicator evidence and views: causal closed-candle EMA20/50 (SMA seed), ATR14 and RSI14 (Wilder), BB20±2 populationσ, prior20 same-frame volume ratio with insufficient-history/volume semantics. Show exact timeframe/source/as-of/formula, price curves on the candle coordinate scale and independent RSI0–100 pane; blank warm-up values, no unfinished-bar confirmation. Family readiness only on exact source definitions; no mirrored short triggers from long-only rules or silent generic SMC history/scenario attribution. Combined ALL with missing factors fails closed; ANY may expose independent qualifying supported entries. ATR trail is guide-only until explicitly configured, not replacement of existing paper partial/BE model.
- [ ] Analytical timeframes and compatibility: if existing sources have coverage, add UTC analytical4h/hourly and ISO UTC weekly/daily aggregation with closed buckets, full/known coverage checks and explicit provenance—not native broker/exchange session claims or invented volume. Keep source intervals in parsers/API/client storage compatible, old workspaces untouched and insufficient coverage unavailable. Apply to chart actually selects the strategy snapshot; independent strategy visibility and global indicator toggles work. Preserve owner-only/unpublished/paper-only state. Targeted numerical/causality/dispatch/frame regressions, integration trace and native/web exports must pass; no real orders, fake login or new calibration claims.

### Supplied continuation and additional catalog request

- [ ] Mean-reversion long bounce requires closed price back inside lowerBB AND RSI14 crossing above30; source SL fixed distance below recent extreme wick (distance unspecified), target SMA20. Preserve the literal rule, do not substitute2R for SMA as a faithful source target, or infer mirrored shorts/divergence. Scalping reference5s/15s/1m tick, seconds–minutes, real buyer wall/green tape entry at bid,2–5 tick stop and3–10 tick limit target remains inactive without actual DOM/tape/ticks/queue evidence; REST cadence is not a tick feed.
- [ ] Expand searchable named pattern/style references and a few GitHub-sourced strategies with exact source URLs, licenses, formula and supported/manual/missing status. Not every uploaded/coded pattern becomes a trained detector; no unlicensed bot execution, overwrite or automatic changes. Cover PD arrays, structure, candle/chart patterns and indicator styles in a bounded catalog; existing user definitions remain intact.
- [ ] Diagnose reported paper trade failure without minting sessions or creating test user trades. Fix reproduced disabled confirmation/invalid-input/rounding/state issues while keeping server geometry/risk/freshness checks. Expose exact blocker and retry guidance; user's error/symbol/frame may be needed to prove the remaining journey. Preserve editable/publishable yet owner-only gate; no publication requested.

## New source collections — public inventory then exact integration

- [ ] Inventory every accessible strategy/reference in paperswithbacktest.com and brainbrick-trades/The-Quant-Trading-Vault, plus all actual SGX full-order-book ML solutions; report exact source counts, coverage proof, missing access/rules/license/data rights. Do not bypass/pay for inaccessible content or execute third-party bots. Distinguish strategy, indicator, research paper and feature/model rather than calling them all ready trading systems.
- [ ] Deduplicate equivalent strategies across links and existing app by entry/exit/risk/data/timeframe/parameters, preserving all provenance/source aliases. Different parameter/logic variants remain distinct; unknown equivalence is review-only. Imports preserve user library, active selection and revisions; no double-use solely due different repository.
- [ ] Genuine full-order-book ML research cannot use polled OHLC as depth/tick data. Record actual feature/label/model/data dependencies and chronological evaluation requirements; offline/ref-only until real data/model/evaluation verified. No claimed HFT/DMA/live tick execution, calibration or proprietary success. All app actions owner-only, paper-only; publication only when user explicitly finishes additions and requests it.

### Current catalog / proposal evidence

Uploaded strategy continuation transcribed literally, separate source templates registered, numerical indicators/overlays and3 independently authored verified GitHub recipe references wired. Curated catalog has review-only source/support labels; catalog bulk add avoids existing tag/ID records and never claims picture-based training. Apply selects the actual analysis profile. Numerical/unknown source methods do not reuse SMC history or pretend ticks/catalysts were observed.

Screenshot was stuck before proposal, not a confirmed journal submission error. Fast proposalOnly analysis removes archival/history scans from critical path; server25s/UI35s limits and explicit Retry prevent endless spinner. Real approved-owner XAUUSD Buy/Sell diagnostic drafts returned in3178ms/52ms with valid geometry and retained draft IDs. No real/simulated trade, journal order, broker order or manufactured app session created. Real user Confirm still pending. Form exact2R floating tolerance/default-fresh-quote/invalid-draft checks tested synthetically; risk0.5–1% safeguards preserved. New collection inventory/dedup research is in progress, not all installed.

### Complete source metadata / offline book milestone

- [x] Public inventory coverage:5546/5546PWB individual detail pages,5806uniqueQuantVaultdocument blobs+2indexrecords,20SGXmethod/context records. Complete owner-only paginated catalog has11374unique canonical record IDs; zero provedexact-identityduplicates; no sourcebotcode/dataimport.11source working presets/44curated pattern/style references also available. All11374inactive review imports pass strategySchema; stable-ID/provenance marker rejects repeatimports includingarchives/renames,100workingstrategycap preserved.
- [x] Independentlyauthoredofflinebook worker/API/UI:500–12000actualtop3snapshots,rightsconfirmation,8MiBUTF8limit,noOHLC;64causalfeatures/fulllookback,600/900sfull-horizonlabels,tail exclusion,purgedchronologicaltrain/test,5families/6fixedconfigs,noheldoutbest-modelselection,nullprobability. Parameters/fold reasons/scope/gaps/taildisclosuresretainedthroughNodevalidation/storage. No realbook supplied, so syntheticunit/bridgebehavior is not marketperformance evidence.
- [x] Focused readonly trace correctedmodelconfiguration/nesteddisclosureloss andUTF8byte-limitmismatch; existingprivatepaper/feedboundary remains intact.170TS tests(1existingintegrationskipped),26Python tests passed before targetedreviewpatches; affectedpaths rechecked. ActualXAUUSDBuy/Sell proposals3178ms/52msvalidandsaved,notorders; sourceonlyfastpath/deadlines/retry and nofullledgerreads fix theobservedstuckproposal.
- [ ] All-source complete executable strategy imports and semantic-equivalence deduplication: PWBfullcode/pseudocodegated;5804Vaultlocalrulesnotindividuallyreviewed. Metadata-name grouping isnotproof. Retainreferenceswithoutactivatingunsupporteddefinitions; requireauthorizedcompleteentry/exit/risk/data/timeframe/parametersandindividualcausalevaluation beforeclaimingallinstalled. Newreviewprofileszeroweight/inactiveavoidblinddoubleuse.
- [ ] Realuser browser/deviceConfirm paperorderstillpending; no testuserledgerorder ormanufacturedsession. Realorderbookstudy/liveHFT/DMA/queuefillsrequireactualauthorizeddata/feed/executionandout-of-samplevalidation,notOHLCpolling. Signeddevicebuilds,realclosed-app pushandpublicationremainunperformed.

Frozen reviewed collection milestone: backend compile and iOS/Android/web source exports succeeded after nestedconfiguration/scope/UTF8 corrections; allaffectedtests,TypeScriptandESLintpassed. Currentprimary/managedPreviewHTTP200,APIHTTP200;anonymousregistry401. Allsource/inactiveimportsvalidated; noownerkeysintendedsource. Sourceacceptance/checkpointreceiptremainseparate; no publication or signed/device build performed.

Implementation source accepted on managedmain as0398c39 after pre-pushremoteintegration(nochanges). No structuredrecorded-checkpointreceiptreturned; confirmDashboardVersionhistorybeforenativebuild. Don'trepeatimplementationpushforbookkeeping. App remainsunpublished. Finalhandoffdoc records actualacceptance/frozenexports,notcompleteduserConfirm/nativepush/fullcatalogexecution.

## Strategy-attached tools and always-available historical scenarios

- [ ] Selecting/applying a strategy automatically draws its declared EMA/bands/ATR/SMA/Donchian tools and aligned RSI/MACD pane, without separate indicator switches or old persisted switch overrides. Selected visible strategies determine tools; hiding the strategy hides them. Preserve price coordinates, warm-up/missing-value states, comparison, candle inspection and source formulas. Unknown indicator definitions are not guessed.
- [ ] Historical source line / ghost OHLC / both can be used with every strategy and supported chart timeframe without requiring a ready trade. Prefer an eligible strategy-matched historical case; otherwise show an explicitly labeled same-market/frame context replay, not proof that arbitrary rules were matched or backtested. Preserve actual source/anchor/horizon, future/query non-overlap and valid transformed OHLC. Keep manual visibility/style controls; show unavailable when real history is missing rather than inventing a path.
- [ ] Add a scenario-direction watch whose Up/Down/Flat is based on actual drawn path endpoint versus its anchor, not setup trade side. First observation/revised context seeds a baseline; same-direction shape changes do not notify; missing/flat data do not create a flip. Preserve last directional state through flat/unavailable data. Durable owner/rule/version/context baselines must be independent of chart snapshots and produce deduplicated captured old→new evidence even across restart. Keep existing generic shape-change rules distinct, scan budget, outbox, cooldown disclosure and owner authorization.
- [ ] Alerts explains how to receive notifications after publication: backend deployment + saved cloud rules + activated authenticated scheduler + a genuine native build/project/APNs-FCM credentials + device permission/token + real test delivery. Fix alert taps for private broker symbols without allowing arbitrary markets. Web/Safari Preview and Expo Go remain explicitly unsupported for this native remote-push path; do not claim publication alone or a foreground scan enables closed-app push. Do not publish, enroll a new device or place any order during this source update.
- [ ] Check new pure calculations, source-attachment logic, private-alert boundaries and actual real-history replay; use one read-only integration trace; correct confirmed defects and save reviewed native/backend source without publication. Preserve all existing owner-only/paper-only behavior and previous user strategy/library records.

### Strategy-attached replay / direction-watch evidence

Known declared tools now attach with strategy selection/Apply (including formerly hidden strategies); old independent tool switches no longer control the chart. Universal historical context replay needs 36 valid closed bars and a complete past continuation, uses a positively scaled actual twelve-bar continuation and preserves gaps/source dates. Real authorized XAUUSD 5m data (300 bars) produced full replay for all 13 tested selections: eleven current presets, custom metadata and a two-strategy combination; no session/event/order/device/schedule was created. Direction is anchor-to-final historical close, not trade side; first/flat/missing/version/provider contexts are handled distinctly. A durable row lock, atomic event/baseline update, cooldown coalescing and scan deadline guard were tested with isolated mocks. The initial whole suite passed 196 tests/1 existing integration skip; targeted review added provider-clock and cold-bootstrap regressions. Read-only integration findings were corrected: captured alert path cannot remain hidden, new provider context may reseed with an older source clock, cold account/catalog reads are reserved. Actual native phone push, signed builds, scheduler activation/publication and all-source-frame coverage remain unverified/open. SCENARIO_NOTIFICATIONS_UPDATE.md contains the operational guide.

Frozen strategy/replay update: 196 whole-suite tests passed before review; 21 focused corrected-path tests then passed, with clean TypeScript/ESLint, backend build and final web/iOS/Android source exports. Preview/API HTTP 200. No device enrolled, native credential changed, native release produced, server scheduler activated, push-delivery claim, broker order or publication. Official Expo activation references and full instructions are in SCENARIO_NOTIFICATIONS_UPDATE.md.

## On-chart working paper brackets and private publication

- [ ] After actual paper order confirmation, immediately display its saved entry, working SL and TP with price labels on the selected instrument's chart. Draw optional original SL/TP distinctly when changed, show long/short and pending/open/closed state, preserve current canonical revisions/partial/break-even changes, include bracket prices in the visible scale and never derive fake levels from a historical replay. Paper management remains opt-in; display its true on/off state.
- [ ] Clicking a trade in Open navigates to that exact paper trade's market/chart and highlights its entry/SL/TP. Keep an explicit working-bracket/deep-dive inspection action. Fetch owned current detail after deep link/reload, preserve user journal/strategy state, handle missing/inaccessible/wrong-market records clearly, and do not overlay a trade on another market or silently create an order. New confirmation focuses the returned canonical trade immediately.
- [ ] Publish the latest reviewed app/UI/API to a permanent URL but retain entire-app owner-only UI and server checks, precise real OAuth/cookie validation and server-only broker credentials. Auto-publish remains off. Confirm actual managed publish outcome and permanent app assets, health, auth bootstrap and guest data denial. Do not represent source bundles/publication as signed native builds or activated native push. No broker operation, user role/access relaxation, record deletion or fake authenticated test session.

Trade/private release review completed: saved entry/working SL/TP, source-only marker scaling, Open navigation and post-confirmation focus implemented. Fixed exact-detail polling/working-sync revision priority so SL/TP do not remain indefinitely old; stale lower-version responses cannot downgrade canonical records. Respect only previously explicitly saved auto-management default, still disclosed per order. Closed the legacy storage presign handler under actual owner auth and the out-of-tabs theme-lab UI under OwnerGate. Source originals are already AES-GCM ciphertext in object storage; actual plaintext remains behind owner-specific decrypt/getSource, so legacy redirect did not itself decrypt original files. Reserved platform storage routes remain platform-owned; encryption plus owner-bound retrieval protects originals. Isolated tests never create an authenticated browser session or an owner ledger order. Publication still pending actual managed outcome.

Frozen trade-chart/private release: 212 whole-suite tests passed/one existing auth integration skipped before the final navigation-seed change; 14 affected tests, TypeScript/lint and all source exports passed on the exact frozen source. Local anonymous storage and collection access return401/private-no-store; health200. Source contains saved entry/currentSL/TP, version-safe detail/sync refresh and Open→Chart navigation. User explicitly authorized publication with owner-only access retained; permanent deployment verification remains pending until actual tool completion. No push enrollment, automatic new management opt-in, owner paper test order or broker operation occurred.

Private publication attempt 68116009 failed during clean Expo static export: Metro SHA-1 missing for interop .cache/web.css. Dependency install completed. Targeted inspection found NativeWind's installed filesystem adapter omits a web placeholder at configuration time; project-only Metro correction creates that missing file before indexing, without modifying packages or overwriting existing Preview CSS. A fresh archived committed-source install/export is running as focused failure reproduction. Owner-only/private data and paper-only semantics unchanged; do not report a permanent live URL until a corrected managed publication succeeds.

Clean static failure reproduction succeeded on committed candidate9465ff4: fresh gitarchive, exact pinned dependency installation and declared Expo web command, nonempty web-dist/index.html. No node_modules/generated cache was copied from Preview. Targeted web-placeholder fix is validated; hosted corrected publication still pending. Preserve the owner-only app, private data and all paper-only permissions.

Private release remains OPEN: corrected pinned9e5ededa request68533960 ultimately failed 'deployment timed out'. One post-terminal infra snapshot explicitly says app_not_published, failed; system-log read returned owner_unavailable. Exact stalled build/startup/upload stage unknown. Do not blindly retry, change resource/residency/billing settings, claim a live URL, or weaken owner access. Need Dashboard detailed failed-Publish logs to continue evidence-based recovery. Trade markers/current brackets/navigation and clean static CSS fix are saved/validated; temporary Preview remains available.

## Preview API Unmatched Route correction — IMG_2780

- The screenshot shows8328 frontend `/api/oauth/start` reaching Expo's page router; resolve both actual Cloud8081 and8328 frontend origins to their paired3000 API.
- Keep published web API same-origin, native configured, real frontend `/oauth/callback`, nonce/state verification, secure cookies and owner-only data gates unchanged.
- Verify actual OAuth start302 to Manus provider and API healthJSON; don't invent a successful user sign-in, place a trade or publish again to test this route.
- Permanent private release remains blocked by the earlier deployment timeout; this screenshot is not its build/runtime log.

Preview routing evidence:8328 APIhealth/start returned404HTML, paired3000 returned200JSON/302Manus authorization. Corrected real browser Sign in button from the owner-only root reaches Manus provider with legitimate8328 callback rather than UnmatchedRoute;38 focused regressions, TypeScript/lint and web export passed. No credentials, fabricated session, order or new publication. Owner sign-in and previous permanent-deployment timeout remain separate unverified/pending outcomes.

## TradingView Lightweight Charts requested

- [ ] Replace the main chart with official pinned Lightweight Charts on web and a locally bundled isolated native WebView, retaining Expo/identifiers/six tabs/owner-only and paper-only scope. Required vendor LICENSE/NOTICE, TradingView attribution/link; no remote CDN chart code, new quote provider, broker execution or publication retry.
- [ ] Preserve automatic strategy-attached EMA20/50, SMA20/50, Bollinger20, ATR guide, Donchian20/prior10 range and source-aligned RSI/MACD panes. Preserve valid timestamp/price/precision/warm-up semantics, source timezone labels, candle inspection, responsive pan/pinch/zoom/reset and incremental real latest-candle updates without wiping the user's viewport on every refresh.
- [ ] FVG/CE, range, setup/IFVG/OB/sweep/MSS/STDV, manual levels/PDH/PDL and reference-template overlays use library time/price coordinates. Historical-source line/ghost OHLC/both stays available from the existing engine, preserves actual source gaps and anchor at future display positions, source/basis/direction labels and captured-alert visibility; never actual future data or fabricated probability.
- [ ] Saved canonical paper entry, working SL/TP, replaced original and recorded partial markers remain visible at exact prices, participate in scale bounds and follow current trade/version when opened from Trades→Open or after confirmation. Chart Buy/Sell uses existing protected review/create logic only. No local trade creation or undocumented management opt-in.
- [ ] Use typed/bounded payloads, native bridge/navigation isolation, cleanup/resize subscriptions and an explicit error fallback rather than silent SVG substitution. Validate conversions and real canvas integration without generating an owner session/order; read-only integrated trace, source diagnostics and native/web exports. Save intended source, deliver current Preview and clearly label native-device and publication/push gaps.

## Foundry scope files 04/05 — complete additions

- [ ] Keep Expo Go-compatible React Native architecture with current identifiers; locally bundled Lightweight Charts, advanced price/strategy/trade overlays, pull-to-refresh, visible latency/source connection status, and true streaming only where actual provider contracts support it. Real Level2/direct exchange/institutional flow/NBBO require genuine licensed data and no fabricated feed. Native device/voice/push must be verified separately.
- [ ] Streamlined paper Buy/Sell: risk presets including requested1%/2%/fixed units, entry/current or limit, directly editable stop/target and chosen RR, size computed from paper equity/risk, optional text/voice notes tagged to ledger. Exact saved entry/SL/TP and real available timestamp/P&L appear for pending/open/closed; NBBO/slippage not applicable/unavailable if reference/fill data absent. Preserve canonical fresh validation, idempotency and snapshots. Manual practice vs mandatory strategy-entry choice is pending.
- [ ] Remove PWB, Quant Vault and SGX reference UI; preserve users' files, uploads, source records, trades and licensing/research archives. Surface only OB, STDV, core, SMA, MACD, EMA, breakout/momentum, BB, pairs/stat-arb, cross-sectional/time-series momentum, market making, systematic macro/trend and ML. Each family uses required real historical data, causal logic and separate validation; missing prerequisites visible, not guessed.
- [ ] AI library scans compatible photo/file for structured trigger/confluences/weights/sources/indicators/thresholds/timeframes/regimes/execution/risk/data prerequisites, user review and corrections. No claimed fine-tuning/universal executable support. Suggest correctable per-trade setup/regime tags; broker historical fills/fees/times sync and CSV fallback require exact verified read-only paths and provenance.
- [ ] Confluence contract: explicit trigger + falsifiable named conditions, configurable weights normalized100%, mandatory gate. Checklist met/not-met/pending with actual source/as-of freshness and score/gate before entry. Trigger-below-gate alerts separate from entry-ready; stale/disconnected required source blocks auto entry. Record score and every condition at entry; never act on trigger alone.
- [ ] Owner chooses strategy/pair/minimum count or score for confluence alerts. Reuse bounded application-owned scans/stream events, durable outbox and private chart jumps; off-app notifications require deployment/native device setup, not foreground code. Weekly retuning rather than every new trade; no activation without actual application scheduling/deployment.
- [ ] Closed-loop ledger/tick/features (roughly40 explicit source features, absent values missing), enrichment, expectancy/R distribution/profit factor/execution quality, behavioral re-entry-after-loss/size escalation/overtrading/time decay, regime metrics, Kelly suggestion and correlation risk. Claims must cite sample counts/confidence, never pretend broker performance from synthetic tests or quote-only feeds.
- [ ] Condition analytics by score bucket and each present/absent/regime: win rate, expectancy, profit factor, MAE, contribution ranks, no/inverse edge flags, gate comparison. Alignment-based >0.9 condition correlations flag double counting. At least100 samples for confirmed verdict; train/walk-forward/recent untouched holdout and multiple-testing correction; failed OOS condition goes watch. Overfit score must be defined and evidence-derived, not a decorative number.
- [ ] Gradient-boosted, explainable win model and AI advisor querying only owner stats with sample/OOS citations. Every proposed add/remove/reweight names measured effect, stays versioned/reviewed, and no rules change without approval. Paper→live promotion unavailable without validated whole model; broker execution remains unauthorized. Optional TCA/factor attribution/risk matrix/Monte Carlo use real inputs and explicit modeling assumptions.
- [ ] Compact dark charcoal/deep-slate, high-density/crisp/low-radius UI with no clutter. Complete focused regressions, actual chart integration, one read-only integrated trace and honest per-feature status; save latest source/backup. Original full-app/push/publication/source-validation requirements remain open where not actually demonstrated.


17 October implementation progress: main chart now uses official v5.2.1 canvas on web and the same locally bundled native WebView controller. The SVG renderer is only an explicit user-selected error fallback. Source-key viewport reset, incremental quote updates, exact saved bracket autoscale, distinct RSI/MACD panes, strategy-linked layers, local-reference time carriers, strict source-frame/replay guards, and visible TradingView attribution are implemented. Chromium fixture test confirms actual canvases, visible distant SL/TP, retained zoom, pane switching without errors, and corrected pane heights 110/109px; fixtures are not market history or edge evidence. Native device, signed-in owner chart, and actual paper-submit checks remain open.

All 13 requested strategy families were audited; eight existing source models are the default catalog and five unavailable quant families show exact prerequisites. PWB/Vault/SGX browser removed from UI; existing personal records and source/license archives preserved. EMA audit's incorrect timeframe-block claim was corrected from actual append order. STDV requested VWAP-band model differs from the existing range-target reference and remains unresolved/unimplemented.

New pure versioned confluence foundation includes configurable normalized weights, named source predicates, closed-bar/freshness guards, human approval, score/gate plus every condition in the audit snapshot, and no success probability. Every enabled pending source blocks its eligibility signal. Confirmation metadata requires100actual samples, passed walk-forward/untouched passed holdout and full multiple-testing correction. Configuration/order/alerts/ledger integration is not yet activated while the user's manual-practice vs mandatory-gate choice remains pending. Historical empirical rate now withheld below100resolved cases and labeled unconfirmed without OOS/holdout. New RR/risk ticket work is in progress, not marked complete.

Checkpoint transport currently cannot obtain its managed Git credentials while workspace recovery is unavailable. Preserve latest local source in a credential-free backup; no permanent URL/checkpoint claim until an actual accepted result. Do not replace remotes/helpers or retry publication blindly.


Final 17 October milestone: compact paper ticket implemented with1%/2%/fixed-unit templates, positive selectable/customRR and directTP preservation, optional pretrade thoughts, advanced paper-only management, fresh immutable proposals and server-selected risk/daily caps. Backward-compatible0.5% saved selections remain readable but updated UI requests1%. No owner paper order was submitted. Current complete source passedTypeScript, lint, wholeVitest suite (one pre-existing auth integration skip), backend build and all web/iOS/Android source exports. Fixed reference future-coordinate lifecycle and verified one-bar whitespace carriers with no future prices; actual Chromium pane/source/bracket checks passed. Source export does not close native-device/signing/push/permanent-publication or new confluence-to-order/alerts/ledger integration outcomes. See LATEST_FOUNDRY_UPDATE.md for exact handoff boundaries and FOUNDRY_STRATEGY_STATUS.md for13-family data/model prerequisites.

## Less crowded iPhone chart — 17 October 2026
- [ ] Historical profile/clock detail is expandable rather than permanently filling the upper phone screen; source/as-of and PDH/PDL remain accessible.
- [ ] Main screen emphasizes price, timeframe, chart, paper actions and selected strategy; supporting observations, reference tools and detailed evidence remain accessible in expandable sections instead of crowding the default view.
- [ ] Clean chart labels are the default. Canonical saved Entry/SL/TP stay visible; setup zones/lines and strategy-attached indicators are not deleted or independently disabled. Full setup names/prices and saved-bracket status remain available in details.
- [ ] Keep current candles and canonical paper brackets readable in autoscale rather than forcing every distant historical/manual setup level into the same range. Setup levels remain drawn when in range and listed in details.
- [ ] Time-axis tick labels no longer use overlapping full date/time text; full inspection timestamp remains available.
- [ ] Diagnose and address the reported `Cannot find single active touch.` iPhone web gesture warning without hiding console errors or modifying dependency vendor files; document remaining real-device verification.

17 October screenshot correction evidence: compact historical profile + expandable sources/clocks, chart-first market/header layout and default-collapsed supporting sections implemented. Clean label mode keeps canonical Entry/SL/TP badges and all source price/zone/indicator information in Details; setup curves/lines stay attached. Source-key/zoom behavior preserved, short device-time ticks and readable candle/working-bracket scale implemented. The shared-document gesture workaround failed the read-only mixed-touch trace and was removed. Final web uses the locally bundled display-only native runtime in an opaque-origin/no-network iframe with bounded sender-checked bridge. Chromium RNWeb fixture passed chart-first/page-first mixed touches, horizontal drag/pinch/tap with two actual-candle inspections, zero chart/browser errors, and105px outer-page vertical scrolling. Actual iPhone Safari/Home Screen retry, native install/signing and permanent deployment remain OPEN. No owner/order/strategy/risk permissions changed and no test trade submitted.

## Built-in AI, quantitative workbench, and learning/discipline scope
- [ ] Built-in owner-only conversational AI can answer strategy, confluence, instrument/pair and general trading-learning questions; use actual available strategy/source/OHLC/quote/paper context, cite sample sizes/as-of/OOS state, never invent prices or validated edge; no unrestricted capability or perfect-trader guarantee.
- [ ] AI accessible in Library as well as the chart/strategy flow; analyze/re-analyze original protected photos/files, preserve candidate excerpts/ambiguity, extract structured entry trigger/confluences/indicator parameters/data requirements/risk/targets, and let the owner review/approve versioned rules for later paper use. Never run arbitrary uploaded code or auto-change rules.
- [ ] Functional synchronized pairs model with spread/hedge/entry-exit calculations and honest costs/OOS state; fixed-universe cross-sectional and time-series momentum with rankings/scaling and explicit historical universe/total-return limitations; venue-depth inventory/quote research without invented queue fills; systematic trend model with genuinely separate macro missing-input status; causal ML training/features/chronological walk-forward/holdout results without claiming confirmed edge under100samples.
- [ ] Replace static disabled quantitative cards with reachable working inputs/run/results/retry flows. Real connected historical data or explicitly sourced user imports only; fees/slippage assumed only when user supplies them. Statistical qualification is distinct from operational code functionality.
- [ ] Trading education/strategy explanations, rule adherence, pre-trade discipline, rapid re-entry after losses, risk escalation and overtrading support; configurable warnings/cooldown with canonical trades, no hindsight invented intent and no unapproved change to paper access.
- [ ] Connect versioned confluence configuration, live met/not-met/pending/source checklist, normalized score/gate, causal closed-bar evidence and entry snapshots. User-selected strategy/pair/confluence-threshold alerts work while active; durable native closed-app delivery still requires publication/build/device/scheduler setup and testing.
- [ ] Keep all existing charts, strategy indicators, paper tickets/SLTP/details, private sources, owner authentication and clean phone layout working. Preserve source/backups and state precise data/device/deployment gaps rather than claim every feature complete prematurely.

Latest AI/Foundry implementation (supersedes earlier progress paragraphs): owner-only conversational coach is mounted in Chart/Strategies/Library with selected strategy/source/read-only market and canonical trade grounding, local owner-scoped conversation and retry. Automatic structured upload scan and source-specific reanalysis retain unapproved source blueprints; reviewed styles stay inactive. Five family workbenches are runnable on connected real history/imports and genuine public Coinbase venue L2; they do not produce institutional/queue fills or validated edge. The agreed practice + gated strategy modes are server-enforced, including fresh at-fill re-gating for strategy pending limits and immutable score/checklist/feature snapshots. Open paper trades, including management-off records, collect explicitly foreground-sampled quote excursions. Descriptive score/condition/regime analytics and human proposals remain insufficient below100samples per comparison and never self-promote. Learning foundations, source explanations, observed loss-chasing/size escalation/overtrading checks and a separately opt-in canonical personal post-loss pause are available. Foreground selected market/frame/strategy point/count/below-gate alerts are wired; off-app push and weekly unattended retuning are still unactivated until deployment/build/scheduler/device proof. Official US release schedules and dated CME Bitcoin futures COT fallback work with partial-coverage and non-spot limitations. Full global macro vintages/survivorship-free universes, trained/calibrated whole-strategy win model, tick-complete TCA/MAE and real multi-leg/queue execution remain OPEN rather than relabelled done.

## Forecast, screenshot reviews, timeframe matrix and coach recovery
- [x] Fix the user’s real “AI returned no usable coach response” failure; preserve retries, verify an actual comparable contextual reply, keep output uncertainty and no broker authority; coach status/capabilities fit the phone without overflowing pills.
- [x] Owner can generate/regenerate/show/hide a separate AI forecast line/ghost scenario from actual current source context. Clearly label hypothetical/AI-generated, source/anchor/as-of/expiry/assumptions/invalidation, keep historical replay separate and never feed generated OHLC into confluences/paper/statistical validation.
- [x] Import trade screenshots before/during/after or standalone; preserve originals privately, analyze visible trade data/time/timezone with unknowns/inference explicit, optional canonical trade linkage, versioned review/owner confirmation and future coaching retrieval. Upload/capture time is not asserted as trade time, screenshot-only values never overwrite immutable original entry/fills or establish calibrated outcomes.
- [x] Two-column Timeframe / Bullish-Bearish bias table covers all supported1m/5m/15m/1h/4h/1d/1w; actual closed-bar source/as-of, consistent definition, mixed/insufficient/stale/unavailable states and retry; no fabricated missing frame data.

Actual coach defect reproduced and repaired: `gpt-5-mini` with1,800 completion tokens consumed1,792 reasoning tokens and returned length/empty visible content. The minimal-reasoning request produced a real stop-completed reply. One bounded live-catalog alternate is used only for empty/truncated output; fatal/safety errors remain visible and no canned answer is fabricated. Timeframe table now derives all seven supported frames independently; real900daily Coinbase history supports Monday-UTC weekly EMA warmup. Source-specific rollingVWAP±2.5σ and formal Engle–Granger diagnostics are implemented, pending final integration checks; neither a hypothesis nor rejection p-value is a success probability.

Forecast/screenshot/bias milestone: implemented and integrated separate blue AI line/ghost candles, protected staged screenshot import/analysis/confirmation plus retained-source reopen in Library/full canonical history, bounded future-coach reference retrieval, all-seven-frame sourced bias table, exact VWAP±2.5σ strategy and attached bands, formal Engle–Granger diagnostics with current candidate withholding. Coach empty-output root cause repaired and genuine response verified. Full current tests (one pre-existing auth integration skip), diagnostics/lint, backend build and all-platform source export passed. Real managed Gemini generated a12-step hypothetical BTC5m path from actual public data with probability:null; controlled actual canvas measured80actual bars,12forecast bars,0replay bars and no errors, preserving their separation. No actual owner trade/source write or attached diagnostic-image reading was used in those tests. Actual iPhone upload/retention/paper-flow retry, genuine signed build/push, successful production publish and data-dependent statistical qualification remain open.

## Purpose and usable quantitative workbench — 17 October 2026
- [x] Quantitative model forms open and switch into valid family-specific asset counts/timeframes/settings; user can load an explicit real-source starting configuration without guessing inputs.
- [x] Every workbench family explains its purpose/question, required input, actual output, how to interpret it and its useful next action. Empty candidates, insufficient data, provider failures and validation limits have clear actionable explanations rather than implying success or displaying unexplained metrics.
- [x] Trace and repair confirmed failures on the actual form → owner API → provider/model → result/coach path. Preserve no-owner-record-write validation and separate real provider checks from synthetic unit fixtures and device proof.
- [x] Provide a complete source-grounded plain-English list of app features: what each does/is supposed to do, where/how to use it, current status, why it exists and remaining prerequisites. In-app help remains compact and reachable; unsupported tools are explicitly scoped, not presented as completed execution.

Purpose-first source corrections: all five families have explicit real Coinbase starter inputs and actionable purpose/output/next-step guidance; model switching resets valid inputs, current-book-only controls do not pretend to use OHLC, imported histories are per selected asset, shared schema/production service have bounded real-source history with complete derived buckets and 45-second deadlines. Actual production service starters returned model results for pairs/momentum/making/slow-trend/classifier. Source audit also repaired 100-strategy capacity and zero-weight preservation, lesson Coach question handoff, disabled Sample bias state, discipline loading/unavailable/saved-limit consistency, selected-alert price label and below-gate inputs, actual raw/UTF8/decoded upload caps, screenshot text evidence and retained-list Show more, pair diagnostic minimum, multi-series ML equity identity, and REST-depth original receipt age. None grants a broker action or validates edge. Complete user guide/in-app inventory is implemented; final browser/source/export checks and exact iPhone Run screenshot remain pending before closing their corresponding evidence boundaries.

Purpose milestone evidence: controlled375pxRNWeb actual component → local schema-parsed production service used only real publicBTC/ETH and returned ready results for allfivefamilies; actual60barMLprobe returned insufficient-data with visible requirements and no candidate. Ask AI closed the real sheet and passed its explanatory question to the mocked navigation boundary; zero browser exceptions. This fixture explicitly mocks owner/auth/querytransport and is NOT an actual owner iPhone test or order. Full current407tests passed/onepre-existingauthskip, TypeScript/lint/backend/allplatformsourceexport passed before final three scoped audit corrections. The corrections add four reachable Chart guide records, align app-bound rather than runner-only parameters and reject direct market-making requests exceeding absolute inventory cap. Final affected checks/export are running. Exact actual phone failure screenshot, signedbuild/nativepush and real data-dependent validation remain open.

Final purpose milestone: 138features/controls across17groups are documented in the searchable private Guide and FEATURE_PURPOSE_GUIDE.md. Four missing reachable Chart controls were added. All five actual RNWeb form starters completed with actual public data, deliberate60barMLinsufficient path and AskCoachclosed/question handoff; zero browsererrors. Final affected16tests/TypeScript/lint/APIbuild and web/iOS/Android sourceexports passed. Actual owneriPhone/authtransport/order test, successful permanent publication, signedinstall/push and statistical qualification remain OPEN, not inferred from fixture success. Source archive is refreshed without credentials or owner database/private objects.

## Optional session background boxes — 17 October 2026
- [x] Chart shows subtle color-coded rectangular time-window backgrounds behind candles for Asia, London and New York, with optional Sydney and small unobtrusive labels.
- [x] One-tap Sessions on/off and individual session selection work without hiding strategy indicators/levels/brackets or resetting chart navigation. Preferences survive owner workspace saves/loads.
- [x] Regional timezone/DST schedules are explicit; windows are analytical clock references, not assertions of broker/exchange opening or kill-zone rules. Daily/weekly cannot masquerade as accurate intraday coverage; future scenario space stays unshaded and actual OHLC is unchanged.
- [x] Session backgrounds do not alter autoscale, confluences, paper gates or trading authority. Same local native/web runtime, clipped bounded drawing, cleanup, unit/source exports and focused actual-canvas evidence; actual iPhone behavior remains a separate verification.

Session milestone: optional background primitive, regional timezone/DST calculation, master/individual controls, saved-workspace validation and guide are implemented.41 affected tests, current TypeScript/lint/backend build and web/iOS/Android source exports passed. Controlled375px actual-chart UI confirmed master off/on changes the chart region and restores its original image, no page overflow, and reachable individual schedules in Details. Source-only/synthetic/browser evidence does not replace actual owner iPhone confirmation. No paper/order/source-price behavior or publication was changed.

## Zax scope 06/07 — 18 October 2026

- [ ] Use Zax as the visible app name; preserve existing app identifiers until an explicitly approved migration. Symbol will be supplied later.
- [ ] Diagnose frequent quote unavailability, reconnect genuinely available feeds, and distinguish closed/stale/unavailable states with a recovery action; never label old data live.
- [ ] Integrate useful linked research methods only with verified licenses/provenance and usable inputs/results; keep execution paper-only.

- [ ] C1 · Pending paper orders have no cancel
  CRITICAL
  effort S
  PAPER LIFECYCLE
  Problem — "Pending cannot be manually exited by closePaperTrade." A limit that has not opened is unreachable — you place it, the setup invalidates, and you watch it.
  Fix — Add cancelPaperTrade(id) mirroring close: require matching version plus a fresh quote, set terminal state "cancelled", emit a lifecycle event into the trade trail. Surface as a swipe on the pending row and a Cancel button in detail. → test: place a limit, cancel it, drive price through the level, confirm no fill can occur.

- [ ] C2 · No delete, and archives consume the cap
  CRITICAL
  effort M
  STRATEGIES
  Problem — "Archive is not delete and archived records count toward the 100-record workspace limit." Fill it with retired strategies and you are permanently locked out.
  Fix — Two changes: (1) hard-delete for archived records, with a confirm sheet listing dependent alerts, paper trades and screenshots and how each will be detached; (2) move archives to a separate allowance so archiving actually frees capacity. → test: archive 100, delete 10, create 10 new.

- [ ] C3 · You cannot see the source you are reviewing
  CRITICAL
  effort L
  SCREENSHOT / LIBRARY
  Problem — Retained screenshots are never rendered to the client, and text/PDF preview is "unavailable in this preview". The Trainer tells you to reconcile against the authoritative original — which you cannot open.
  Fix — Serve a short-lived signed URL for the original and render it beside the extracted rules, with zoom and pan. For PDFs use page rasterisation rather than text-only. Add "jump to quote" that scrolls the source to the evidence span. → test: open a retained screenshot from the Trainer and see the image.

- [ ] C4 · Closed-app brackets rest on unverified scheduling
  CRITICAL
  effort L
  PAPER LIFECYCLE
  Problem — "Do not assume processing while the app is closed unless deployed scheduling is established." A paper stop may silently never fire.
  Fix — Ship a real scheduled worker that polls open positions and evaluates brackets server-side, then verify it and replace the caveat with a dated confirmation. Add a per-position badge: "Server-managed" or "Foreground only". → test: place a bracket, force-quit, move price through the stop, confirm the fill exists on reopen.

- [ ] C5 · Notifications ship silent and badge-less
  CRITICAL
  effort S
  ALERTS
  Problem — "Android channel is configured; notification sound and badge are disabled." In an alerting app, the alert is easy to miss.
  Fix — Enable sound and badge on both platforms, set the channel to high importance so it heads-up, and add per-alert-type toggles for sound. → test: trigger a rule on a physical device; expect a heads-up banner, audible tone and an app badge.

- [ ] C6 · Unsaved paper history is loseable, and there is no export
  CRITICAL
  effort M
  TRADES / DATA SAFETY
  Problem — Cloud sync is explicit-only; manual local logs are not durable. No autosave and no CSV/JSON export anywhere.
  Fix — Autosave locally on every state transition (debounce ~2s) and push to cloud on a longer debounce rather than only on explicit save. Add export: CSV for trades and events, JSON for strategies, rules and journal. Add a "last synced" indicator. → test: kill the app mid-trade, reopen, trade intact.

- [ ] H1 · Below-gate warning ignores its own settings
  HIGH
  effort S
  CHART / ENTRY GATE
  Problem — Its visible minimum-points and count controls "do not affect this branch". Dead UI.
  Fix — Wire the settings into the branch rather than hiding them — they exist because the threshold matters. If wiring is impractical, hide the controls while the branch is active. → test: change min-points, observe the warning threshold move.

- [ ] H2 · Risk template UI contradicts the server cap
  HIGH
  effort S
  PAPER ORDER
  Problem — "The UI says fixed units may be below 0.5%, but server cap is 2%." Two different truths on one screen.
  Fix — Have the server return the effective cap and render it inline: "Fixed units — any size; server caps at 2% of equity." Reword the 0.5% copy so it describes a recommendation, not a limit.

- [ ] H3 · Post-loss pause cannot be configured
  HIGH
  effort S
  DISCIPLINE
  Problem — Enforcement can be toggled on, but "this control has no duration editor" — it silently keeps a stale value or defaults to 20 minutes.
  Fix — Add a duration stepper (5/10/20/30/60/custom) beside the toggle, persisted per workspace, and show remaining cooldown on the discipline panel.

- [ ] H4 · The panel enforces one of the four things it flags
  HIGH
  effort M
  DISCIPLINE
  Problem — Server rejection keys only on cooldownUntil — not daily count, loss streak, or elevated risk. Three of four flags are decoration, presented identically to the enforced one.
  Fix — Split the panel into "Enforced — blocks orders" and "Advisory — display only", move each flag to the right group, and add a one-line note on how to promote an advisory flag. Best fix: add per-flag enforcement toggles.

- [ ] H5 · Silent fallback to the first strategy
  HIGH
  effort S
  SCREENSHOT EVIDENCE
  Problem — When the workspace strategy is missing, upload "falls back to the first strategy". Evidence can attach to the wrong rulebook with no signal.
  Fix — Return strategyResolution: "explicit" | "fallback", render a banner "Attached to (fallback — no active strategy)", and offer a one-tap reassign.

- [ ] H6 · Two incompatible definitions of "stale"
  HIGH
  effort M
  FRESHNESS
  Problem — Quotes go stale after 120 seconds; forecast bars tolerate "2 timeframe periods" — two weeks on a 1w chart. Same app, wildly different freshness.
  Fix — Centralise one staleness config keyed by timeframe: quotes 120s; bars = max(2 x period, 15 min), capped at 24h daily and 7d weekly. Surface the rule in the UI as "stale after X" on each panel.

- [ ] H7 · Per-section "not run" contradicts "407 tests passed"
  HIGH
  effort M
  EVIDENCE / DOC
  Problem — Dozens of features say fixtures "were read, not run"; the closing section says the full suite passed. One of the two is stale.
  Fix — Run the suite, capture a dated result, delete every per-section "not run" line, and reference a single evidence table. Where a feature genuinely has no coverage, write "no dedicated fixture" instead.

- [ ] H8 · Client waits 30 seconds longer than the service
  HIGH
  effort S
  AI COACH
  Problem — Client timeout is 75s; the service bound is 45s. After 45s the wait is guaranteed dead.
  Fix — Set the client timeout to service bound plus network margin (50s), or raise the service bound to 75s. Add a visible progress state so the wait is legible either way.

- [ ] H9 · Alert rules allow one strategy, other surfaces allow three
  HIGH
  effort M
  ALERTS
  Problem — Scenario and setup surfaces accept up to three models; alert rules select one. Unexplained asymmetry.
  Fix — Bring alerts to parity with 1–3 strategies. If the restriction is deliberate for scan cost, say so in one line next to the control.

- [ ] H10 · Scan rotation can silently starve a rule
  HIGH
  effort M
  ALERTS
  Problem — A 12-request broker budget forces market rotation. With many rules, some go unevaluated for an unbounded time, with no visible signal.
  Fix — Show "last evaluated" and a deferred count per rule in the alerts list, and let users pin priority rules so rotation cannot skip them. Consider raising the budget or batching.

- [ ] H11 · No UTC, and "Fixed EST" is mislabelled
  HIGH
  effort S
  CLOCKS
  Problem — Only "New York (DST)" or "Fixed EST". No UTC or fixed-offset option, and the fixed label ignores EDT.
  Fix — Add "UTC" and "Fixed offset (UTC−12 to UTC+14)". Relabel to "Fixed UTC−5" and add a "Fixed UTC−4" option. Display the resolved offset beside each clock so it is never ambiguous.

- [ ] H12 · No export or backup
  HIGH
  effort M
  DATA PORTABILITY
  Problem — Journal, paper history and library have no CSV or JSON escape hatch. Competitors ship this as a selling point.
  Fix — See C6. Add a "Export everything" action producing a zip of CSV plus JSON, and a documented import path.

- [ ] M1 · "Historical" scenario is really "recent"
  MEDIUM
  effort M
  HISTORICAL SCENARIO
  Problem — Analogue search is capped at 3,000 bars. On a 1m chart that is roughly two days of history.
  Fix — Do both: give the scenario surface its own deeper fetch (target 20k bars) and, until that lands, rename to "Recent analogue scenario". → test: on 1m, confirm the nearest analogue can be weeks old.

- [ ] M2 · "Photo-based search" is term matching wearing vector language
  MEDIUM
  effort M
  LIBRARY SEARCH
  Problem — Retrieval requires two shared terms and sorts by term count — but the same feature says "visual index", "re-index" and "cosine similarity". Two mental models, one name.
  Fix — Split into two named modes: "Find by keyword" (term overlap) and "Find by visual similarity" (embedding cosine), and label which mode produced each result. If no embedding index exists yet, drop the vector language until it does.

- [ ] M3 · "Ask AI about this source" excludes the source bytes
  MEDIUM
  effort M
  LIBRARY / AI
  Problem — The coach packet excludes the image and file bytes. You ask about a picture the model cannot see.
  Fix — Attach a downscaled JPEG (768px, under 200KB) to the coach packet and mark it as attached in the UI. Keep the exclusion of fileKey and internal URIs.

- [ ] M4 · "Probability is always null" beside a displayed percentage
  MEDIUM
  effort S
  SEMANTICS
  Problem — The outcome profile renders a rate with a Wilson interval while the gate insists probability is always null. Both are defensible; together they read as a bug.
  Fix — Fix the vocabulary. Reserve "probability" for the gate. Label the profile number "observed rate (95% CI)" with "descriptive, not predictive" in the same block, and add a tooltip contrasting the two.

- [ ] M5 · Calendar and COT are near-empty by default
  MEDIUM
  effort M
  MARKET CONTEXT
  Problem — Without an FMP key the COT fallback is a single CME record and events cap at 10. A headline feature renders nearly blank with no explanation.
  Fix — Add a free fallback source or expand the bundled subset, and render an explicit banner: "Limited calendar — no FMP key configured." Never show an empty panel without a reason.

- [ ] M6 · Futures filter offered while futures data is not connected
  MEDIUM
  effort S
  MARKETS
  Problem — "Built-in futures data is not connected" and router status reports futures:false, yet the category is selectable.
  Fix — Label it "Futures (broker only)" and grey it out when no broker is linked, or hide it until a source is wired.

- [ ] M7 · Structural holes: weekly, 4h, and session boxes
  MEDIUM
  effort M
  TIMEFRAMES
  Problem — Weekly is crypto-only, 4h requires exact hourly bars, and session boxes vanish on daily and weekly — so session context disappears exactly where swing traders need it.
  Fix — Aggregate weekly from daily wherever sessions are declared; allow 4h from 1h universally; project session ranges onto daily and weekly bars. Document only genuine refusals.

- [ ] M8 · One toggle disables six features and persists
  MEDIUM
  effort S
  SAMPLE MODE
  Problem — Sample mode silently kills forecast, reference matching, historical scenario, alert conditions and photo search, persists to cloud, and looks like an ordinary setting.
  Fix — Show a persistent high-contrast banner whenever Sample is on, listing exactly what is disabled, with a one-tap exit. Do not persist Sample by default; if persisted, require re-confirmation on next launch.

- [ ] M9 · Rate limits live in process memory
  MEDIUM
  effort M
  INFRASTRUCTURE
  Problem — 6 forecast and 12 coach requests per 10 minutes, held in process memory — so a redeploy silently resets them. Both are low for a learning loop.
  Fix — Move counters to Redis or the database with a TTL. Raise to roughly 20 forecast and 30 coach per 10 minutes, and make them configurable per feature.

- [ ] M10 · Metrics can render on 20 observations
  MEDIUM
  effort M
  STATISTICS
  Problem — The outcome profile caps at 100 cases; the classifier holdout floor is 20 rows. A rate with a confidence interval on n=20 invites over-reading.
  Fix — Show n beside every metric. Below n=30, show "insufficient" instead of a rate. Raise the profile cap to 500 cases via a batched scan.

- [ ] M11 · Four live "legacy" code paths in the UI
  MEDIUM
  effort L
  TECHNICAL DEBT
  Problem — Legacy pending cards, the legacy STDV preset, legacy factor weights and legacy sheet normalisation are all still visible to users.
  Fix — One migration pass: normalise legacy weights into current factors, retire the STDV preset into the eight current IDs, convert legacy pending cards, drop the legacy sheet path. Then delete the word "legacy" from user-facing copy.

- [ ] M12 · Strictly single-tenant, no sharing
  MEDIUM
  effort M
  SHARING
  Problem — Owner-gated throughout. You cannot send a rulebook to another person.
  Fix — v1: a read-only share link for a strategy version — signed URL resolving to a version snapshot. Later: real multi-user.

- [ ] M13 · Classifier has purging but no embargo or CPCV
  MEDIUM
  effort L
  METHOD
  Problem — Three purged chronological folds exist, which is good. There is no embargo after test folds and no combinatorial path distribution, so the reported metric is a single point estimate.
  Fix — Add an embargo of N bars after each test fold, then implement combinatorial purged CV and report the distribution of accuracy or Sharpe across paths rather than one number. Follow the mlfinlab definitions.

- [ ] M14 · 8 MiB ceiling and a 45-second deadline on PDF scans
  MEDIUM
  effort M
  LIBRARY SCAN
  Problem — A large PDF must extract, chunk and analyse inside 45 seconds, or fail. Tight for anything substantial.
  Fix — Make analysis asynchronous (job id plus polling) so it cannot time out, and raise the source ceiling to ~25 MiB. Show page count and a progress bar.

- [ ] M15 · 55-second analysis deadline
  MEDIUM
  effort S
  SCREENSHOT
  Problem — A single image analysis is bounded at 55 seconds with no async path.
  Fix — Raise to 90 seconds and keep the existing retry-reuses-original behaviour (that part is already correct). Consider async for consistency with M14.

- [ ] M16 · 500-record cap with no delete
  MEDIUM
  effort S
  LIBRARY
  Problem — The catalog can refuse a full add when capacity is insufficient, and there is no delete path.
  Fix — Add delete for library records and catalog references, and show usage as a progress figure such as "412 / 500".

- [ ] M17 · No app lock for a self-described private workspace
  MEDIUM
  effort S
  PRIVACY
  Problem — Nothing gates the workspace on resume; the app is "private" by policy only.
  Fix — Add optional biometric or PIN unlock on resume, and at minimum a "hide values on background" option for balances and P/L.

- [ ] M18 · Sign-out clears only the query cache
  MEDIUM
  effort S
  PRIVACY
  Problem — What is destroyed and what survives a sign-out is undocumented, which matters when local records are unsaved.
  Fix — Document precisely what sign-out clears, and add a separate explicit "Clear local data" action with a warning about unsaved records.

- [ ] M19 · Every limit is "100" and scattered
  MEDIUM
  effort M
  LIMITS UX
  Problem — Strategies, alerts, screenshots and others all cap at or near 100, described in four different places with four different phrasings.
  Fix — One "Workspace capacity" panel listing each pool with a usage bar and its true limit. Reference it from anywhere a limit is enforced.

- [ ] M20 · Clock preference semantics are unexplained
  MEDIUM
  effort S
  CLOCKS
  Problem — Changing the clock "changes strategy-clock interpretation, not source bar timestamps" — a subtle distinction left for the user to infer.
  Fix — One line under the control: "Changes how sessions are labelled and evaluated. Source bar timestamps are unchanged."

- [ ] M21 · Bare "unavailable" with no route out
  MEDIUM
  effort S
  SAMPLE MODE
  Problem — In Sample mode the bias table reads "explicitly unavailable" with no path back.
  Fix — Render "Unavailable in Sample mode — exit Sample to compute" with an inline exit button, matching the pattern used elsewhere.

- [ ] M22 · Any unknown blocks eligibility with no triage
  MEDIUM
  effort M
  CONFLUENCE GATE
  Problem — Unknown, stale and pending active evidence all block the gate. Combined with a 100-weight requirement, false negatives are easy and the cause is not obvious.
  Fix — Return a blockedReason array with stable codes and plain-language labels, and a "why blocked" sheet that deep-links to the single offending item. Consider an explicit override that records an acknowledgement.

- [ ] M23 · No prompt history
  MEDIUM
  effort M
  AI COACH
  Problem — The schema already has conversations and a "Clear private conversation" action, but prior turns are not displayed.
  Fix — Persist and render the last N turns per conversation, with the same retention rule as the rest of the workspace.

- [ ] M24 · One 3,000-bar cap for everything
  MEDIUM
  effort M
  HISTORY DEPTH
  Problem — Replay, analogue search and chart all share a 3,000-bar window, which is thin on low timeframes.
  Fix — Make the cap per-surface: chart stays at 3,000, replay and analogue get a deeper fetch. Coordinate with M1.

- [ ] M25 · Weights must total exactly 100
  MEDIUM
  effort S
  CONFLUENCE GATE
  Problem — Rejecting an entire rulebook because weights sum to 99.6 is brittle.
  Fix — Auto-normalise on save with a visible note, or accept a ±0.5 tolerance. Never block approval over rounding.

- [ ] M26 · New-rule UI allows one strategy, scenario allows three
  MEDIUM
  effort S
  RULE CREATION
  Problem — Same asymmetry as H9, on the authoring side.
  Fix — Bring to parity with the 1–3 selection used elsewhere.

- [ ] E1 · The opening paragraph is grammatically broken
  EDITORIAL
  effort S
  OPENING
  Problem — "…workspace sequence is: observe a sourced market → select rules → → review your process." Missing words and a doubled arrow.
  Fix — Rewrite: "StratDesk is a private learning, analysis and paper-practice workspace. Its one useful sequence is: observe a sourced market, select rules, check confluence, act on paper, review your process. Nothing here places brokerage orders."

- [ ] E2 · The table of contents does not match the body
  EDITORIAL
  effort S
  STRUCTURE
  Problem — It omits screenshot evidence and the entire quant studio, and introduces "Foundry" — a term that appears exactly once and is never defined.
  Fix — Generate the TOC from the real headings rather than hand-writing it. Add the missing sections. Either define Foundry in one line or delete it.

- [ ] E3 · Headings split mid-word
  EDITORIAL
  effort S
  TYPOGRAPHY
  Problem — "Historical sourc", "Trade journal, deep dive and performanc", "rate-di" plus "fferential model", "Offline order-book label-classification" plus "experiment".
  Fix — Rebuild the heading text and prevent mid-word wrapping with nowrap on headings, or widen the heading column.

- [ ] E4 · Numbers jammed against words, everywhere
  EDITORIAL
  effort S
  TYPOGRAPHY
  Problem — "up to100", "at most3000", "lookback10–252", "holding1–100", "than30", "first20". Systematic, not isolated.
  Fix — Global pass with an explicit rule: insert a space between a lowercase letter and a following digit. Decide separately for units (keep "4h", "1w") and apply consistently. Re-read for collateral damage.

- [ ] E5 · Stray fragments in the market-making section
  EDITORIAL
  effort S
  TEXT CORRUPTION
  Problem — Orphaned "w", "ries", "perPlan.legs", "run family making", "positive-millisecond no".
  Fix — Rebuild that section from source and repair: "paperPlan.legs", "run Market making", and reconstruct the truncated sentence.

- [ ] E6 · Purpose text has bled into the Feature column
  EDITORIAL
  effort M
  TABLES
  Problem — Several feature tables have collapsed cells, with purpose prose jammed into the feature name and running on.
  Fix — Rebuild the affected tables, then add a check that every row has an identical cell count before publishing.

- [ ] E7 · "Manus" is never defined
  EDITORIAL
  effort S
  TERMINOLOGY
  Problem — It appears in the sign-in flow as if the reader knows it.
  Fix — Define on first use — state what it actually is (identity provider, broker, or host) and link to it.

- [ ] E8 · No glossary
  EDITORIAL
  effort M
  TERMINOLOGY
  Problem — CE, MSS, OB, FVG, STDV, WR1, Silver Bullet, OTE, PDH/PDL, MAE/MFE, Wilson interval, purge, embargo, CPCV, OOS are all used with partial or no definition.
  Fix — Add a glossary of roughly 25 terms with one-line definitions, and link the first use of each term in the body to its entry.

- [ ] E9 · Source file and line references appear on a handful of features only
  EDITORIAL
  effort M
  CITATIONS
  Problem — paper-service.ts:407-429, tests/trading/…, forecast.md show up inconsistently, so the reader cannot tell when evidence is being cited.
  Fix — Move every reference to a consistent "Evidence" line under each feature, same format, and keep the prose clean.

- [ ] E10 · ~1,900 words of duplicated scope boilerplate
  EDITORIAL
  effort M
  LENGTH
  Problem — Near-identical "Scope: Implemented in source…" paragraphs repeat across the document, plus around 25 repeats of "not statistical qualification or actual iPhone proof".
  Fix — One evidence-status table with columns: Feature, Implemented in source, Unit fixture, Device-verified, Date. Delete the per-section scope paragraphs, keeping only genuine exceptions. Define the disclaimer once in a legend.

- [ ] E11 · Naming drift across surfaces
  EDITORIAL
  effort S
  NAMING
  Problem — "AI scenario" vs "AI conditional forecast scenario"; "Paper ticket" vs "Paper order lifecycle"; "loss budget" vs "risk templates"; and three names for one screen — workbench, Quant Lab, Quant model studio.
  Fix — Pick canonical names and find-replace. For the quant screen choose one — "Quant Lab" is shortest and already appears in a user-facing instruction.

- [ ] E12 · No version number and no date
  EDITORIAL
  effort S
  METADATA
  Problem — An audit-grade document with no revision identity, so nothing can be cited or superseded.
  Fix — Add a header block: version, date, supersedes, and a short changelog at the foot.

- [ ] E13 · An audit wearing a user guide's clothes
  EDITORIAL
  effort S
  FRAMING
  Problem — The document is titled a Feature and Purpose Guide but is structured as a verification log. The reader meets hedges before they meet the product.
  Fix — Add a one-page "How to use this guide" and a status legend up front so the reader knows what "implemented in source" means before encountering it twenty times.

- [ ] E14 · The eight source references are never indexed
  EDITORIAL
  effort S
  COMPLETENESS
  Problem — They are referred to throughout but never listed together.
  Fix — Add an index of the eight references with ID, full name, and every surface that uses each one.

- [ ] E15 · The same three disclaimers repeat in near-identical wording
  EDITORIAL
  effort S
  REPETITION
  Problem — "Ready is not validated", "not a forecast", and the insufficient-data caveat appear dozens of times in slightly different phrasing.
  Fix — Define each once in the legend with a stable short tag, then use the tag inline.


Scope safety: M12 sharing awaits explicit privacy choice. Cancellation/deletion/export operate only on owner records after actual user review. No stale quote execution or eligibility override is silently enabled. Data, sample and deployment requirements remain explicit; fixtures never establish profitability or physical-device proof.


18 October final integration evidence: current TypeScript/lint/backend build and web/iOS/Android source exports passed; the whole regression run passed 519 tests plus one existing authentication skip. Source retry parsing, 25 MiB checks, coach whole-request deadline and polled-snapshot research-only guards were corrected rather than hidden. An additive owner runtime-state table was verified. New private controls are mounted in actual Library/Strategies/Trades screens; guide inventory now includes the reliability tools. Real Quant Lab market-making recovery returned ready from actual Coinbase REST L2 at 15:10:28 UTC, explicitly polled/not streamed, with no fills or order writes. This does not complete C4/H10 deployed force-quit/push proof, physical PIN/sync/source-preview tests, M11 full legacy source-specific migration, or institutional/statistical/data qualification. Owner-only/no public sharing remains the explicit user decision.

## Multiple timeframe-scoped scenario layers — 18 October
- [ ] Diagnose/fix the AI scenario stale-source blocker with actual refresh and actionable source/age information. Do not loosen current quote/bar freshness or call old data live; an explicit last-available-history generation option is separate and labeled.
- [ ] AI and historical scenarios each allow selecting source timeframe and the chart timeframe(s) on which to display, including all supported frames; preferences/layers survive chart switches and owner saves.
- [ ] Add multiple concurrent layers, independent on/off/remove/style/color, bounded saved/drawn counts, with visible source timeframe/age/provenance and expired/wrong-market/no-data states.
- [ ] Preserve the current connected line/ghost OHLC look; display-only reanchoring keeps actual historical gaps/source identity and clearly distinguishes generated hypothetical data from actual historical replay. Never feed layers into actual OHLC, confluences, paper gates or validation.
- [ ] Existing default historical replay, captured scenarios, direction-watch alerts, attached indicators, saved brackets and viewport remain usable. Same local native/web runtime and owner-only/paper-only privacy; no new public/provider/broker action.

Scenario layer milestone: separate AI/historical managers now choose all supported source/target chart timeframes, retain independently colored/hidden/removed/refreshed line/ghost snapshots and preserve the original connected replay/captured path. Functional updater writes preserve concurrent additions. Current AI generation refreshes the quote but still refuses old bars; explicit Last available and per-layer Use available history create correctly labelled old-history hypotheses. Shared storage validation rejects inconsistent source identities/endpoints and malformed local entries are withheld with a notice. AI close-time and rebased-history provenance and primary-chart old-context labels corrected. Controlled actual chart component at 390px displayed two source frames concurrently, hiding repainted pixels, target-frame switch showed only one selected layer, returning restored both, and Details remained reachable without horizontal overflow. Public Coinbase + actual managed-AI current generation returned 12 steps with probability null. Twenty-six affected regressions and TypeScript/lint passed; backend and web/iOS/Android source exports passed. No user records, orders, source uploads or database were written during these checks. Actual owner iPhone/provider retry remains open.

## Current AI stale-source recurrence — 18 October, 11:00
- [ ] Resolve the screenshot’s actual selected source and last completed bar without owner workspace/order writes.
- [ ] Current generation requests bounded UTC trailing candles and bypasses the appropriate candle/quote read caches, including lower-frame caches for derived charts.
- [ ] Refresh waits for prior in-flight reads so an old response cannot silently repopulate the newly cleared cache; selected provider/account/instrument remain unchanged.
- [ ] New acquisition regressions retain original timestamps, real gaps, and strict current quote/completed-bar checks; a fresh receipt never repairs an old bar.
- [ ] Verify the production current-source/current-AI path, and disclose any genuine upstream stale/closed/unavailable feed rather than claiming it was made live.
18 October recurring-failure resolution: canonical owner read-only diagnosis identified NAS100 TL:3884 5m BID bars closing08:20Z atrequest16:12Z. Real Auto generation returned12 hypothetical steps, probabilitynull, explicitly historical context; no source, layer or trade was written. Matching broker/public refresh caches and explicit recent Coinbase windows were repaired; the internal-draft `steps` output leak that prevented strict layer saving was fixed.32 initial affected tests and final full suite (550 passed, zero failed, one pre-existing auth skip), current diagnostics/backend/all-platform source exports passed; scoped safety trace found no confirmed defect. Actual iPhone reload/Auto retry remains open. Fresh provider bars, strict Current acceptance with stale bars, predictive qualification, publication and native proof are not claimed.

## Latest AI direction/Coach fixes and optional stronger AI — 18 October, 17:35
- [x] Fix reported AI direction inconsistency with at most one bounded output correction, unchanged actual source context and full final validation; preserve Current freshness, valid display OHLC, probability null and visible failures. Disclose corrected output; never feed hypothetical candles into evidence or paper orders.
- [x] Fix persisted duplicate Coach IDs and remount collisions at the identity/storage root, preserving conversation chronology and owner/source isolation plus cancel/retry/timeout behavior. Long phone metadata wraps without hiding source/error information.
- [x] Add a working optional shared Efficient/Deep selector in Coach (including Library Coach) and AI scenarios. Efficient remains default; Deep requires deliberate owner selection. Server checks the live tier and exposes actual model/fallback. Keep bounded enum/tokens/existing quotas/deadlines, local persistence and existing explicit cloud-save policy. No client arbitrary model ID, silent premium upgrade, predictive edge or public sharing.
- [x] Validate changed source with TypeScript/lint/regressions/backend/all-platform source export, then refresh credential-excluding backup. A local commit is not a recorded checkpoint or publication.
- [ ] Actual owner iPhone reload/chat/scenario retry remains separately unverified; native build, push and publication remain open.

Source-level evidence: 583 passed/zero failed/one pre-existing auth skip; current TypeScript/lint/backend and all-platform source exports passed. The one real Efficient-AI/public-source request returned 12 valid hypothetical candles with null probability and no writes. A scoped read-only trace found no functional/security blocker. No configured private credential values were detected in source exports. The required 557-file source archive passed file/checksum/ZIP verification, excluding private data, credentials and export artifacts. This does not establish actual phone behavior, paid Deep-tier inference, predictive edge or remote checkpoint/publication.

## ORB Strategy from uploaded video — 18 October 18:12

- [x] Add a separate strategy named ORB Strategy, preserving original-video provenance and exact source rules: ES/NQ,1h untested Asia/London/New York highs/lows,08:00–08:15EST reference candle, breakout→midpoint retest→continuation,09:00–11:00EST entry window,NQ50–150points/ES20–40points and3R. Do not assert the video's40–60% remark as measured probability or replace it with generic09:30 ORB rules.
- [x] Implement the owner-approved app rules (18:11:58): opening-candle50%,1m completed continuation close past the retest high/low, stop one verified outright tick beyond the retest opposite wick,3R accepted only within the source point band. Range comes from exact completed same-source15m or all15 contiguous1m bars; no missing-bar fill, same-bar causal guess or still-forming confirmation. FixedEST default and optional New York/DST override must be distinct.
- [x] Apply linked high/low/midpoint and labelled completed-hourly untapped session context to actual chart; show source/app conventions, chronological conditions and precise blocked reasons. Existing scenarios/indicators/trade markers remain independent. Applying ORB selects1m execution without changing market. No duplicate strategies or overwritten owner styles.
- [x] Enforce exact futures identity,1m/current clock/source/range/approved execution/risk conditions in the server-authoritative confluence and ready ORB paper bracket; no NAS100CFD-as-NQ, generic2R or extra display-unit stop buffer. Preserve manual practice vs gated mode, owner-only access and no broker orders.
- [x] Validate changed source, regression tests, build/source exports and refresh credential-excluding source backup. Physical owner iPhone/genuine NQ/ES feed remains separately unverified; publication not requested.
- [ ] Gold/Asia variant remains reference-only pending the source's missing exact Asian opening window/instrument; don't silently invent it.
- [x] Add a default-off owner automatic PAPER switch scoped to one saved/approved ORB strategy and NQ/ES,1–2%risk,1–3entries perlocalday,<=24hexpiry and existing positive daily-drawdown/discipline limits. Require fresh native confirmation, canonical gate and quote; no pending/openposition on the instrument. Persist deterministic signal/proposal/order identity and shared DB lock so multiple tabs/restarts cannot duplicate a signal. AI scenarios/prose cannot enable execution or bypass gates.
- [x] Automatic paper checks operate only while the owner app is foreground/visible. Off/background/expiry stops new checks, not existing positions or already-submitted requests. No closed-app/24-7 worker, public publication, real-money order or actual live automatic fill is claimed.

Source evidence:622passed/0failed/1pre-existing auth integration skip; current TypeScript/lint, backend/local chart and all-platform source exports passed; API/Metro HTTP200. Nine source,15integration,9safety and6actual-wrapper fixture tests cover the new paths. Canonical active status, committed proposal visibility, same-signal duplicate protection, Off/expiry/future-arm and realized-balance risk were checked without an owner order. A real DB advisory-lock+separate-read check wrote zero records/orders. No configured private credential values were detected in117exported files. Gold/Asia, genuine futures feed, actual iPhone/automatic fills and publication remain separate open outcomes.

The refreshed572-file source ZIP passed required-file/ZIP/checksum verification with credentials, owner data and export artifacts excluded. The final local source commit is recorded in its manifest; it is not a recorded Manus checkpoint or published release. Extracted video provenance/transcript/analysis are preserved; the original uploaded video was not publicly shared.

## London/IB/Red-to-Green AI-assisted strategies and future background alerts —18October18:44

- [x] Add three independent, duplicate-free source strategies from latest text plus Pasted_content_08.txt, not renames/duplicates of ORB/WR1: London15m, IB15m/30m, R2G/G2R1m/5m. Keep source rule provenance, uploaded text, chosen stop/TP alternatives, declared timezone and app-added conventions visible. AI explains source/current blockers but cannot train itself into predictive edge, turn on consent or override paper gates.
- [x] London uses exact complete00:00–03:00EST Asian range and a current15m close outside it after03:00. Reference1h/4h views must not invent a3h range from coarse candles. Source stop midpoint/opposite boundary and TP1.5R/2R/range-height alternatives are selectable.
- [x] IB uses exact complete09:30–10:30EST window,15m or30m post-window close above/below it, actual known-volume rule and source midpoint/inside-boundary stop with1×range target beyond the broken edge. The labelled app high-volume definition and10:30–11:30cutoff were explicitly approved18:52:05, not presented as statistical edge. Genuine30m preserves complete2×15m periods, gaps, timestamps and original provider.
- [x] R2G/G2R uses exact declared PDC basis, real opening side, observed timestamped quote crossing in09:30–10:00EST, actual known rising venue volume, complete observed morning extreme+owner-declared true tick and owner-selected key target/premarket window. Never silently use provider midnight as US regular close, broker numeric volume as venue volume, closed-bar cross as first-tick execution, missing calendar/target/tick as ready, or a synthetic prior quote. Approved app rules remain labelled; pivot basis/tick/targets and execution permission stay separately required.
- [x] Link source range/PDC/SL/TP and causal conditions to existing chart and proper primary timeframe; source/gate revision changes invalidate approval/history retains config. Historical/AI scenarios remain independent non-predictive display paths. Canonical gated paper fills retain the new source bracket rather than generic2R/ATR and enforce all mandatory quote/clock/frame/data/config/risk guards.
- [x] Add default-off, owner-scoped, cloud-saved automatic PAPER controls for the new strategies, with1–2%risk/1–3local-day cap/<=24hexpiry, approved same-direction gate, current real source/quote, no conflicting position, shared lock+durable signal/order dedup and normal discipline/drawdown checks. Preserve original ORB consent without silently widening it.
- [x] Wire strategy alerts to the existing authenticated published app scheduler, owner/taskUID mapping and durable dedup/push status. Prepare separately consented background paper mode, not an indefinite iPhone timer. Distinguish source wiring, successful production publication/registration, recent authenticated callback and actual device push receipt. No schedule/auto order is enabled in development; one-minute sampling/provider rotation is explicit.
- [x] Recheck changed diagnostics/regressions/build/all-platform source export, scoped read-only integration trace and credential-excluding final archive. Physical iPhone, deployed callbacks/device alerts, genuine source requirements and publication remain separate unverified outcomes until proven.
- [ ] Verify actual private production publication and owner monitoring registration, completed authenticated callbacks, a real native-device alert and owner iPhone/automatic-paper flows with genuine required feeds. No current source/unit/registration result substitutes for these proofs.

Final source evidence:700passed/0failed/1pre-existing auth skip(701total); TypeScript/lint/backend/local chart and all-platform source exports passed; final API/MetroHTTP200. No configured private credential values were detected in117final export files. Causal range/pivot/30m acquisition, cached-partial/retained-tail protection, canonical source fills and auth/auto/budget fixtures are wired. A new integration fixture found/fixed omitted ALL source counting; the scoped reviewer found/fixed missing server completed-callback enforcement. Early callback-start/foreign-task markers cannot authorize background entries. One cross has one durable identity independent of display bars. The required596-file credential-excluding archive passed file/ZIP/checksum checks; final local source commit is in its manifest. No owner order/record or schedule activation, predictive edge, native receipt, remote checkpoint or publication is claimed.

## Fix avoidable IB/pivot instrument prerequisites — 18 October19:46

- [x] Read verified selected-instrument price increments automatically from official broker details or Coinbase product data, not decimals/lot size/CME fallback for CFD. Use owner authorization before private cache reads, selected account/documented instrument-settings route and bounded read-only GET transport; quote/history remain on INFO. Missing/conflicting/variable tick metadata stays explicit; no broker order path or raw credentials exposed.
- [x] Automatically prepare supported PDC and actual daily high/low targets with transparent provider basis, no provider-close-as-US-RTH, current-day/complete prior-day/source/duplicate/age guards. Dynamic levels refresh by actual source day, not stale frozen autofill. Preserve manual choices and require market-binding of detected settings. No invented premarket start/calendar/synthetic candle.
- [x] Keep verified-venue default. Offer deliberate labelled broker-reported relative-volume proxy only, never silently call it venue/exchange volume. Zero/missing/invalid source readings still fail closed. New policy applies consistently to detector/native gates and canonical auto checks, with normal source revision/gate invalidation and no auto-consent widening.
- [x] Add a compact Prepare instrument/Use detected defaults flow, actual source/values/warnings and remaining choices, while retaining personal overrides. Allow valid incomplete draft save; block execution, not configuration editing. Correct obsolete PDC-not-implemented wording. Late responses cannot overwrite changed market/config or switch on auto paper.
- [x] Verify source regressions/current diagnostics/build/all-platform export plus one bounded actual read-only public/selected-broker preparation trace, then final credential-excluding backup/local commit. Actual iPhone, private production, push and owner automatic fills remain unverified until proven.

Actual selected Gold metadata returned tick0.01 with a null optional lower band; parser repaired without inventing a bound. Current official guide's settings GET route replaces the old INFO assumption while quotes/history remain INFO; no broker order endpoint enabled. Final read-only selected-source trace returned automatic provider-day PDC and dynamic daily high/low targets, positive broker readings and only the explicit volume-policy choice remaining. Coinbase returned verified product tick/provider-day/dynamic targets/venue volume. Detection/fill has no database/order/schedule writes. The scoped reviewer found and we fixed PDC source integrity across personal/premarket as well as dynamic targets; added regressions preserve strict guards. Current UI/compiler/lint and31focused fixtures passed; final full source/export/archive evidence follows separately.

Final source evidence:726passed/0failed/1pre-existing auth skip(727total); TypeScript/lint/backend/local chart and all-platform source exports passed. The synchronized156-feature guide passed7focused regressions and re-export. API/MetroHTTP200.605required source files passed archive/file/checksum verification excluding credentials, owner data and exported artifacts; final local source commit is recorded in the regenerated manifest. Source backup is not a recorded remote checkpoint or published release. No physical iPhone/device receipt, actual production callback or owner automatic fill is asserted.

##19October09:34: AI service refusal and NAS100 ORB configuration

- [x] Handle observed412and equivalent200error envelopes as sanitized terminal AI-service failures, with clear support guidance, no quota/balance speculation, rawJSON, automatic retries/model/provider bypass or invented AI candle fallback. Preserve existing layers/input; deterministic chart/ORB/historical functions remain independent. Restored actual inference remains unverified unless service accepts it.
- [x] Add an explicit NAS100 CFD ORB mode to the existing strategy configuration, old/missing mode defaultnative NQ/ES. NAS100 is exactselected TradeLocker NAS100, not futures/crypto/Gold/cash aliases. Read and market-bind its actual instrument tick, preserve fixedEST/DST choice and08:00–08:15range→1m breakout→later midpoint retest→later closed continuation09:00–11:00. Label50–150CFD-price-point3R band as app-added adaptation, not source video/CME tick/validated edge.
- [x] Wire compact mode/detect/local draft/save UI and exact detector/chart/native confluence/canonical paper stop/target guards. Wrong market, missing/mismatched broker tick, missing/gapped/stale source, unsupported timeframe/clock/confirmation still block. Save changes source revision/clears gate; source files/scenarios/owner overrides remain independent.
- [x] Allow deliberate NAS100 automatic PAPER scope only for this saved approved variant and exact broker instrument, preserving existing default-off expiry/risk/day-cap/discipline/shared-lock/durable dedup. Do not remap or widen old NQ/ES consent, arm/write orders or publish during this task.
- [x] Recheck current diagnostics/affected/full regressions/build/all-platform source export and scoped read-only integration trace, verify credential-excluding latest source archive/local commit. AI service account support, physical iPhone, native alert/deployed callback, actual auto fill and publication remain separate limitations.

Source evidence: actual14:46UTC selected-account NAS100TL:3884 has its genuine0.01tick, completed same-source opening range and current1m sequence; this particular3R path was correctly outside the50–150CFD-point band and created no order/proposal/workspace/schedule or AI request. Real catalog'sStocks/EQUITY label is allowed only for the exactNAS100 symbol, not NAS100.PRO/US100/USTEC/equities/Gold. Metadata's true tick-source label is preserved and separately bound to the price feed after market/provider-symbol checks. The new fixtures cover preparation, real registry shape, causal/native gates, canonical bid/ask repricing and deliberate auto scope. The scoped reviewer found one remaining terminal-body-before-backoff issue, now fixed with cloned-body classification and three non412code9 regressions; genuine transient retry policy remains unchanged.613source files passed preliminary archive verification; final current results/commit follow separately.

Final proof:753passed/0failed/1pre-existing auth skip; current TypeScript/lint/backend/local chart and all-platform source exports passed.156-feature guide/error cases passed16focused tests; API/MetroHTTP200. Zero configured private credential values detected in117exported files.613-file source ZIP verified required files/ZIP/checksums and excludes credentials/owner data/artifacts, with the final local source commit recorded after regeneration. No remote checkpoint/publication, restored managed-AI inference, actual iPhone/device notification/background callback or owner automatic fill is asserted.

##19October10:26 — fix remaining AI failure and scan everything else

- [x] Trace current scenario error through core/service/tRPC/UI; correct lost error classification, misleading retry/help state and confirmed code causes. Keep questions/layers and source guards. At most one bounded current managed-AI probe; no terminal retry/provider bypass, balance speculation, raw credentials or invented hypothesis. Clearly distinguish code repair from unavailable service access.
- [x] Complete ten-area read-only source audit covering AI, chart/scenarios/phone metadata, feeds/timeframes, paper lifecycle, strategy/confluence, automatic-paper/alerts/background, Library/uploads, quant/replay, owner/auth/workspace, journal/discipline/navigation. Each area reports evidence, concrete defects and remaining external/device/data requirements; no generic all-working claim from unit tests.
- [x] Repair confirmed app defects without weakening owner-only/paper-only, real source/volume/clock/risk/consent validation. Preserve NAS1000.01/independent futures, strategy revisions, multiple scenarios and user-owned state. No DB test records, auto Arm, schedule creation, publication or reopening image attachments.
- [x] Recheck affected regressions, current TypeScript/lint/full software suite/backend/local chart/all-platform source exports and service health; produce complete readable scan report and fresh credential-excluding source ZIP/local commit. Device/native push/private production/inference/actual auto fills remain explicit unverified limitations until independently proven.

### Confirmed scan repair outcomes

- [x] AI safe failure kind survives tRPC into Coach and both scenario controls; terminal refusal does not suggest automatic retry/provider bypass. Client forecast deadline restores controls and suppresses late results. Terminal no-output attempt does not permanently consume usable-output quota; abuse throttle remains bounded.
- [x] Chart preserves all eight selectable target frames; forming bars are explicit and are not completed scenario anchors; pinned daily profile shows available daily data or actual unavailable reason, not deliberate strategy-dependent skip or broken status wrapping.
- [x] Market/route/account/BID origin is opaque and exact across broker caches, quote observations and PDC. Retained history is same-origin and corrected timestamps upsert actual payload. Daily/hourly/bias completion cutoffs remain acquisition-time even after slow response.
- [x] Proposal/fill risk uses canonical complete paper balance; same-bar partial→BE ambiguity is conservative; cancelled/closed review cannot rewrite brackets; duplicate proposal mode race conflicts; cancel replay is idempotent; manual ticket preserves0.5%default.
- [x] Dynamic PDC prior-day extremes produce exact same-source dated geometry or fail closed, and strategy rollback restores ORB/session configs and clears old gate.
- [x] ORB rechecks canonical risk/occupancy/day cap after source awaits; monitoring activation is serialized per owner; outbox has a cross-process claim and all accepted device receipts are accounted for; no-change scheduled management is honestly assessed separately from mutation.
- [x] Library has one durable scan path, nonfatal automatic image indexing, safe binary decode, job cancellation/no-late-save, aligned8MiBphoto search, no legacy full-original/fileKey DTO side door and an owner-confirmed capacity-reclaim delete path. No actual source upload/delete or AI/DB test write is performed.
- [x] Quant ranked/weighted universes reject duplicate canonical symbols; portability import disables inherited automation consent; cookie logout enforces origin/native-bearer boundaries.
- [x] Discipline control reports server enforcement only after cloud acknowledgement; trade screenshots are review-only and durably linked at upload to canonical context, never generic pattern extraction/indexing or unreviewed promotion.

Source proof:824passed/0failed/1existing auth integration skip; current TypeScript/lint, backend/local chart and web/iOS/Android source exports passed. API/MetroHTTP200 and117export files contained no configured private credential values. The complete10-area report and local generated-image decoder tests are included. The prior-day identity-field integration failure was fixed without relaxing origin/date guards. Existing source deletion was confirmed and retained protected originals now have durable pending cleanup, not a physical-deletion claim. The sole current Deep probe remained terminal-unavailable; no further inference/account/provider retry, owner data change, trade/consent/schedule action, image reopening or publication occurred. The669-file source archive passed ZIP/required-file/hash/private-value checks and is regenerated with the final local source commit. Managed recovery/remote checkpoint remain unavailable; the source ZIP is not publication.

## Independent AI scenario provider —19October2026

- [x] Verify AI4Trade against current official homepage, live agent guide and published API contract; no documented private NAS100 price-path inference endpoint established. Do not register, share private bars/screenshots/journals, publicly post signals, copy trade or relabel community outputs as owner forecasts.
- [x] Offer independent owner API choices through the connection card; OpenAI was accepted and Gemini rejected. Verify the actual OpenAI endpoint before using credentials: the existing environment still resolves to the managed proxy, not an independent OpenAI account. Do not forward its credential to api.openai.com.
- [ ] Securely obtain a separately supplied app-only OpenAI key and verify actual supported model/structured response access. Add a scenario-only server adapter with truthful provider disclosure, owner/source/time/ATR/direction/schema guards, bounded deadlines/quotas and no silent fallback. Keep Coach/Library and paper execution unchanged. No independent forecast, production secret binding, publication or device proof is claimed before actual evidence.

### Simple private OpenAI paste field

- [x] Provide an actual masked `OpenAI API key` text-entry field directly in Chart → AI scenario layers with `Save & connect`, safe connection feedback and `Disconnect`; no more connector-menu/button-only instructions. Key never enters chat, persisted client state, workspace exports, logs or responses; only the authenticated owner may submit and read safe status.
- [x] Verify the proposed key against the fixed direct OpenAI models endpoint before storing an owner/app-bound AES-GCM encrypted envelope. Reject placeholders, empty/malformed keys, unauthorized/insecure-origin requests, tampering and cross-owner envelopes; unsuccessful replacement retains the prior working key. No live records or test credentials are written during checks.
- [x] Use the owner-saved key only for bounded direct OpenAI scenario generation, preserving actual source/ATR/timeframe, strict 12-step/direction validation, hypothetical/null probability and existing app quotas/deadlines. No silent provider fallback, Coach/Library changes, automation enablement, account claims, publication or fabricated successful inference.

Source evidence: 851 passed, 0 failed, 1 pre-existing authentication integration skip (852 total); TypeScript/lint/backend and web/iOS/Android source exports passed. Zero configured private credential matches in 117 export files; API/Metro 200. A scoped review found native raw forwarded-protocol trust; it was fixed with loopback-only Express proxy trust, actual peer-local checks and spoofed-header rejection. Browser inspection encountered the real owner sign-in boundary; no auth bypass, key submission, live model request or owner data write was performed. Actual iPhone paste/save and direct inference remain pending owner key entry; source export is not a native release or publication.

## Latest working owner app link — 19 October14:23

- [ ] Fix confirmed production Cannot GET / by shipping current Expo web output and API together without changing owner-only/paper-only execution or development ports. Preserve secure credential endpoints and same-origin public sign-in; unknown API/assets remain errors, not fake page successes.
- [ ] Save latest functional source as a real canonical checkpoint, explicitly publish it once and compare deployed source fingerprint with current source. Do not treat the old deployed SHA, local commit, build or Preview as latest publication proof. Keep auto-publish off; no owner records/orders/schedules/roles are changed.
- [ ] Return only the verified current published app link after real browser landing/assets/API/owner-boundary checks. State any remaining provider/owner-device limitations accurately; do not send a failed old address or guess phone Preview controls again.

Release evidence at15:24: current canonical checkpoint699313dae9fecf06b8c5d83db30080af9cddcdd9 includes the complete Expo web serving fix, exact CSS runtime0.2.1 and copied hoisted install policy. TypeScript/lint/backend, eight focused local route/security tests and current web export passed. The production entry point with the committed data directories returns health/root/release200 and private provider status401 without owner/provider/schedule writes. First hosted attempt0f8bc44 failed on the specific missing JSX runtime; that defect was repaired. The corrected deployment68512095 ended `deployment timed out`; console/system log requests returned `owner_unavailable`. Browser still shows `Cannot GET /` on the public address. Canonical saving is confirmed but successful public release/source fingerprint/owner iPhone remain unverified. Do not send the old address as a working latest link or blindly repeat publication without new diagnostic evidence. Current temporary API/Metro remain200.

## Private GitHub export with two-way sync on request — 20 October 2026

- [x] Create a new private owner GitHub repository containing the latest source-only snapshot and dated PRD/feature specification. Exclude API keys, credentials, private account/runtime records, untracked logs, build output and historical generated artifacts; do not publish the app or expose the repository publicly.
- [x] Preserve the Manus-managed mobile repository/origin and its native-build eligibility. Establish a separate GitHub working copy and a portable on-request source-baseline manifest/helper supporting outbound updates and inbound reviewed changes, without always-on automation or GitHub-canonical switching.
- [x] Two-way reconciliation preserves disjoint edits, rejects conflicts/unsafe paths/known secrets before writes, refuses dirty tracked state, and never force-pushes or silently discards either side. Imported changes remain reviewable; source checks and canonical save precede any claim that imported code is a Manus checkpoint.
- [x] Verify repository privacy, exported source parity and mocked bidirectional/conflict safeguards; return the exact private repository link and simple on-request sync instructions. Do not claim automatic synchronization, owner-data backup, successful publication or native installation.

Private export status: GitHub connection was enabled with owner confirmation and authenticated as Xalen89. Canonical source refresh succeeded; the current filtered snapshot contains 683 source files with zero configured credential-value matches. The proposed new repository name was available, but GitHub explicitly rejected `CreateRepository` for insufficient permissions. No repository was created, no code was uploaded, and no sync helper or background automation was installed. Do not retry repository creation through another transport to bypass the denied scope. Await an owner-created empty private repository with authorized write access, or a genuinely updated creation authorization; preserve all pending export criteria.

The owner supplied https://github.com/Xalen89/zax-trading-app. The connected account cannot currently resolve that private repository: authenticated GitHub GraphQL and REST reads return not found, so privacy, write permissions and emptiness cannot be verified. This does not prove that the repository is absent; it may not be included in the current GitHub authorization. No upload or repository modification was attempted. Await verified access to the owner-provided destination before continuing.

Phone permission guidance correction: the owner's latest visible screenshot is the GitHub iPhone app Home/My Work screen, not GitHub's web account settings. Official GitHub documentation places installed-app repository selection and authorized OAuth review under web Settings → Applications, with different tabs. The current connection's exact app type has not been established, so do not assume Manus appears under Installed GitHub Apps or instruct revocation. Ask the owner to open https://github.com/settings/applications in Safari while signed in as Xalen89 and guide from the actual resulting screen. Sources: https://docs.github.com/en/apps/using-github-apps/reviewing-and-modifying-installed-github-apps and https://docs.github.com/en/apps/oauth-apps/using-oauth-apps/reviewing-your-authorized-oauth-apps . Empty repositories are valid export destinations; authorization remains the unresolved blocker, and no code has been uploaded.

Authorization recovery: the owner approved the GitHub CLI device flow as Xalen89. The new isolated profile verified Xalen89/zax-trading-app is private, empty (zero branches), and permits push. It is outside both source worktrees with directory mode700/files600; no token is copied into source. The first sync-helper run passed11 isolated local Git fixtures. Python diagnostics were fixed with an explicit module-spec/loader guard; strict export entry and manifest symlink guards were added. Actual upload, final source parity and no-op inbound verification remain pending.

Final helper source evidence before upload:18 local Git fixture tests passed, Python compilation passed, TypeScript and lint passed. A scoped review identified editable-export baseline authority, archive-attribute substitutions and incomplete credential-name coverage. These were fixed with source-local trusted state plus a managed-only recoverable anchor, ancestor checks, raw Git blob reads, blocked credential stores and expanded configured-secret/npm-auth checks. Added forged-baseline, export-attribute, trusted-state recovery and credential regressions passed. The verified target is still private and empty; no application records, trades, schedules or publication were changed.

FINAL PRIVATE EXPORT STATUS — the preceding permission failures are historical. The owner-created private destination is now populated: https://github.com/Xalen89/zax-trading-app , branch main. Initial upload commit ea5d227bc37fead6a4e2319c90b2635c63d698e3 contained690 files:686 exact source files plus the repo-only manifest/landing guide and the two dated PRD/spec documents. Current authenticated repository metadata and main-commit reads verified private:true, owner push access and that exact uploaded SHA. Source/hash/mode parity passed, a real inbound dry run proposed zero writes, and both directional status lists were empty.18 isolated conflict/privacy fixtures and Python compilation passed; TypeScript/lint passed. The trusted recoverable baseline is retained only in the original managed repository, not GitHub. No broker/account data, Library uploads, runtime credentials, original development history, live inference, trades, unattended jobs, app publication or canonical-provider switch was part of this export. Completion metadata is synchronized normally after this status record, preserving the same source-only scope.
