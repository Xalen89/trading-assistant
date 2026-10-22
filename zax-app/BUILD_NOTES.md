# StratDesk — first native paper-trading build

## Product boundary

StratDesk is an Expo/React Native application for **iOS and Android**, with an interactive web Preview of the same native UI. It uses real market prices where an authorized data feed is available. **Every trade, pending plan, fill, exit and balance is simulated.** A personal TradeLocker account now supplies data only; there is no deposit flow or real-money order endpoint.

WR1 is one source-attributed reference profile from the shared **wr1 PDF.pdf (37 pages)**. It is not represented as your personal strategy. Source rules are read-only; personal copies, new strategies and accepted styles can coexist. Original disclaimers are available in Strategies. Application confluence weights are illustrative application settings, not authored WR1 probabilities.

## Implemented in this build

| Area | Working implementation |
| --- | --- |
| Native workspace | Six tabs: Trading Chart, Markets, Trades, Alerts, Strategies, My Library; portrait sheets, native SVG chart inspection/zoom, distinct launcher/adaptive/splash icons. |
| Live markets | Public Coinbase quote/candle adapter and ticker stream with REST fallback. Broad curated browser for crypto, forex, metals/commodities, cash indices, US stocks/ETFs and futures. Source and timestamp are visible. Unavailable/stale data is explicit. Sample bars appear only after selecting Sample mode. |
| Strategies/styles | Create personal rulebooks, duplicate WR1, edit rules/weights, independently toggle overlays, apply a strategy to the chart, snapshot versions and explicitly restore prior rules as a new revision. Confirmations are tied to the exact strategy version. |
| Pattern/style files | Files imports for PNG, JPEG, WebP, text-based PDF, UTF-8 TXT/Markdown and JSON, up to 8 MiB. Real server-side vision/text extraction, review/edit/accept, named/tags search, positive/negative/correction labels, protected original-image viewing and photo-based personal-library retrieval. |
| Learning provenance | Accepted definitions and feedback have owner-scoped immutable source revisions. Pattern matches retain the evaluated pattern name/version/description/rules and strategy version. Re-analysis preserves other strategies and confirmed/rejected history. Learning means reviewed references and feedback guide subsequent comparisons; it is not automatic foundation-model retraining. |
| Chart/evidence | Regular FVG/CE detection, selected range quarters/OTE, manual named PD-array/other levels, independently visible strategy levels and confirmed/rejected AI reference-match cards. Prior-day markers use an explicitly defined UTC crypto venue day only when history covers it. |
| Transparent scenarios | A low-opacity dashed historical-analog shape beyond actual bars, separately toggled and labeled as a scenario, not known future prices or a forecast. |
| Confluence/history | Version-bound manual weighted confluence and factor breakdown. CSV/JSON OHLC import, descriptive volatility/momentum/lag-1 rhythm, nearest historical shapes and conservative chronological stop/target outcomes. **Success probability remains uncalibrated.** |
| Paper trade journal | Nine pre-trade reasoning steps, captured rule/confirmation snapshot, validated risk/target geometry, pending → explicit live-quote paper fill → explicit close, computed point-value/USD paper results, full recorded history, independently saved post-trade notes and grounded AI review. No spread, fees, slippage or actual execution is assumed. |
| Alerts | Local market-specific threshold/FVG rules; authenticated cloud scans; durable deduplication/outbox, native permission/token registration, Expo ticket/receipt handling and authenticated deployed scheduler callback. Stored trigger evidence is retrieved on an alert tap before chart navigation. |
| Context | Manual weekly bias, DST-aware New York versus fixed source EST clocks and WR1 session windows. Economic-calendar/COT adapters and dated record display exist but require provider access. A COT report is weekly context, not live order flow or necessarily applicable to the selected crypto asset. |
| Private data | Actual Manus OAuth with browser nonce binding, signed native transactions and project-scoped session verification. Local exploration is separate from explicit cloud save/load. Cloud saves use optimistic revisions; original sources are AES-GCM encrypted and decrypted only after owner checks. |

## Verified evidence

The source compiles with TypeScript, the server bundles, additive database migrations applied successfully, and focused regression/security tests pass. The test suite covers source isolation, scoring revisions, valid OHLC, DST timestamps, paper risk/futures point values/FX conversion, historical lookahead and same-bar ambiguity, file validation, private API authorization and encrypted-source tampering.

Actual external checks verified **BTC-USD and ETH-USD provider quotes**, **300 real Coinbase 5-minute candles**, and a real multimodal extraction of the WR1 FVG chart source page. Results are recorded in `artifacts/live-ai-smoke.json`; those quote values are dated validation evidence, not a fixed price in the UI. Expo export produced Android and iOS Hermes bundles plus web routes. Public/local Metro and API health checks returned HTTP 200.

A read-only integration review identified and corrected cross-strategy match deletion, mutable reference provenance, stale manual confirmations, missing durable source revisions and incomplete alert-evidence navigation. No real account order, test user inserted into the app, production trade fill, or claimed push delivery was used to validate this build.

## Activation prerequisites and deliberate limits

**Broader live feeds:** the server-only FMP adapter awaits `FMP_API_KEY` with the relevant instrument/endpoint entitlement. Providing this is read-only market-data access, not trading-account access. Each instrument must be verified after activation. Missing data is not silently replaced. Provider timestamps can be delayed/stale; unzoned FMP historical strings use the configured `FMP_CHART_TIMEZONE` (initial assumption: America/New_York), which must be verified for each feed before session-sensitive analysis.

**Futures:** NQ/ES/MNQ/MES/GC remain labeled feed-pending. Cash NDX/SPX or commodity spot/proxy quotes are not substituted for a licensed futures contract. An actual futures vendor and contract/roll/session mapping are still needed.

**Closed-app alerts:** native development/release build, real Expo project UUID, APNs/FCM configuration, opt-in enrolled physical device, deployed API backend and enabled one-minute schedule are required. Source plumbing and a foreground scan do not prove background delivery. An actual device must verify foreground/background/terminated delivery and tap behavior before alerts are relied upon. The app remains honest about this pending state.

**Native release:** native/web bundle exports are not signed APK/AAB, an installed iOS binary or a TestFlight release. The native source is prepared for the Dashboard build workflow and Expo/device setup, but signing/build results have not been produced or claimed. Git accepted the source on managed main; the returned tools did not supply a recorded-checkpoint receipt, so confirm Version history before starting a signed Dashboard build. No repeated push or publication was used to manufacture that confirmation. A persistent published backend must replace temporary Preview addresses for a release build.

**Advanced analysis:** full automatic detection of every WR1 discretionary concept (RDRB, multi-FVG, IFVG, order-block choice, STDV manipulation-leg selection, SMT/C-SMT), historical evaluation of every uploaded visual rule, calibrated probabilities, seasonality, robust out-of-sample style improvement and proprietary institutional methods are not complete. Those concepts can be stored/reviewed as rules and manual annotations; regular FVG and descriptive/analog statistics are the implemented deterministic foundations. No win rate, hedge-fund methodology or guaranteed detection accuracy is asserted.

**Data/ownership:** explicit cloud load replaces the local working copy by user action. Keep/export unsynced changes before loading another workspace. Source encryption uses project-scoped server key material; any future key rotation must retain/migrate the prior encryption key before changing it. Device-only file selection, permissions, storage and OAuth still need a real iOS/Android device check; Web Preview is not that check.

## Build workflow

### Personal TradeLocker connection update

The selected account authenticated successfully and the supplied account ID matched an authorized account; no other account was silently selected. Its catalog returned **165 information-route instruments**. Real **XAUUSD bid/ask** and **300 five-minute broker BID candles** were verified, including a bar in the then-current five-minute interval. This verifies that instrument/interval, not every endpoint or all 165 markets. The credentials and account ID are not in these notes, client bundles or source commits.

The private catalog appears after **Sign in** with the Manus account identity approved through the protected form. The backend requires that verified identity; guests/other users cannot retrieve the personal catalog, quotes or bars, including cached data. An actual anonymous broker quote request returned **HTTP 403**. Because this runtime does not supply OWNER_OPEN_ID, the approved server-only owner email is matched against the real Manus-authenticated identity; it is never taken from a request field or a display-only cached user. Sign-out clears query caches. Actual user sign-in and physical-device use must still be exercised by the user; no fake authenticated Preview user was created.

Use **Markets → TradeLocker → search XAUUSD (or another broker symbol) → Chart**. Broker IDs remain distinct from public/spot instruments and exchange futures. The chart preserves the provider's BID/ASK bar basis. The separate header price is the bid/ask midpoint, not a broker fill. REST quote polling is approximately 15 seconds and historical candles refresh approximately 20 seconds; this is not a broker tick WebSocket. TradeLocker quotes do not supply a provider timestamp in this API: the UI labels response reception time, and unavailable daily-change percentages are shown as a dash rather than fabricated zero returns.

Only fixed HTTPS TradeLocker API hosts and allowlisted information GETs are used. The sole POST is account authentication. **Broker placement, order modification and position-close routes are absent and blocked.** Standard JWT authentication is trading-capable, not a verified read-only token; backend route restrictions enforce the data-only design. Broker account balances/positions are not used for the simulated balance.

Paper size is **price units, not broker lots**. USD-base FX conversions retain their valuation-symbol snapshot. Instruments without a supported USD paper valuation can be charted but cannot create a paper plan. Licensed futures contract/roll/session mapping and full lot/currency metadata remain separate work; broker CFDs are not substituted for NQ/ES.

This update passed TypeScript, **47 focused trading/security regressions**, backend compilation and Android/iOS/web bundle export. Preview and API were restarted to load the protected backend inputs and returned HTTP 200. Closed-app push activation, signed native releases and provider-specific session/PDH/PDL definitions still have the earlier prerequisites. FMP remains an optional unactivated separate provider for other data/context; it is not required for this personal broker feed.

Use the installed starter and pinned lockfile. `pnpm check`, `pnpm exec vitest run tests/trading`, `pnpm build`, and finite `expo export --platform all` validate source/bundles. `pnpm db:push` is only needed for changed additive migrations. Preview needs both Metro 8081 and API 3000. Native signed builds are started through the Dashboard from an accepted checkpoint, not a Sandbox Expo/EAS release-build command. The native/backend publication, data-vendor and push prerequisites above must be completed and verified separately.

### Scan-budget correction

The integration review found that an allowed 100-market broker alert configuration could exceed a one-minute scan. Scans now coalesce quote/candle work, use a 12-information-request broker budget, rotate unprocessed markets fairly, enforce a 45-second deadline on queued reads/delivery, and report deferred work. This means a large watchlist can wait multiple minutes between checks; the scheduler cadence is not a promise that every market is examined each minute. Alerts displays that limitation. Four bounded-planner/deadline regression cases were added. No production scan or push-delivery claim was used to validate the change.

### Sign-in and six-message Preview correction

The exact six-message badge was reproduced and traced to SVG's web touch adapter forwarding native responder handlers to a DOM svg. The chart now uses a native Pressable wrapper and measured coordinates; the SVG itself has no native touch props. A fresh callback/Chart load had no badge, and a real chart click changed the OHLC inspector/crosshair. The explicit dark callback error/retry screen also rendered correctly.

App sign-in corrections: stop clearing the platform-owned parent cookie on app requests; share one OAuth completion across repeated React effect subscriptions rather than cancelling the only callback; accept empty display metadata on an otherwise valid signed app/user session; retain browser nonce, signed native state, project identity and owner-only broker checks. No anonymous-feed shortcut, fake authenticated Preview user, broker credential change or broker order was used.

Eight current lint errors and twelve findings were corrected without disabling rules. The final source passes **TypeScript, zero ESLint findings, 79 tests (one pre-existing integration test skipped), server bundle and whitespace checks**. Web/iOS/Android exports cover the callback/SVG corrections; the subsequent pure Unix-second quote-age formatter fix is additionally covered by three deterministic tests. Exports are not signed builds or physical-device verification. Package-manager/config-loader advisories in tool output are distinct from the six runtime console errors.

**Remaining verification:** the actual user must complete Manus sign-in, then the app can verify that its authenticated identity matches the owner authorized for the TradeLocker feed. A functioning login launch and callback regression coverage alone do not establish a completed real-user session. The personal broker remains data-only and all trades remain simulated; no publication was requested.

### Embedded login follow-up

The user clarified that the remaining failure occurs on the Manus authorization/login page, rather than the broker feed or returned StratDesk callback. The app previously navigated its embedded web frame to that login page. Web sign-in now opens a detached standalone tab before starting the existing OAuth flow, reports blocked popups, and provides an explicit standalone-app link. Native signed deep-link login is unchanged. No provider credential handling, session token transfer, cookie bypass or owner-access relaxation was added. Browser cookie restrictions can still leave the embedded frame signed out, so the app tells users to continue in the authenticated standalone tab.

This handoff change is not proof that the user's Manus account/provider login succeeds. If the authorization page still fails in a regular standalone browser, Manus account support is handled at https://help.manus.im. The app continues to require a real authenticated owner before exposing the personal TradeLocker feed.

### Browser login resolved — 2026-10-15

The user confirmed successful sign-in through their own browser. A read-only check found the registered authorized owner and recent authenticated application activity at 05:26 UTC. No app session was minted for testing, no user/role/database data was changed, and no stored identity or credentials were printed. This confirms the authorized browser-login milestone; the user's browser session was not copied into the Sandbox.

A fresh read-only check of the selected TradeLocker account returned **165 instruments**, a valid **XAUUSD bid/ask**, and **300 real five-minute BID candles**, with the latest bar at 05:25 UTC. This verifies that broker symbol/interval, not all instruments or native-device behavior. The API quote remains reception-time labeled rather than claiming a provider quote timestamp. Broker order calls: zero. App login guidance now explains the browser-tab path before a web sign-in attempt. TypeScript/lint and source formatting checks passed after this copy-only improvement.

Continue in the signed-in browser tab: **Markets → TradeLocker → search a broker symbol → Chart**. The embedded Preview may still be signed out because it is a separate cookie context. All trades remain paper-only; no publication, signing or push activation was performed. Earlier notes stating that a real browser login was unconfirmed are superseded by this milestone; physical-device login and end-to-end viewing of every broker market are still separate checks.

## 2026-10-15 — resource-driven native improvements

The selected additions are implemented and documented in INTEGRATION_NOTES.md and python/README.md: protected OpenCV HOG/SQLite image indexing with encrypted durable descriptors, geometric photo/live-window neighbors, owner-scoped persistent research jobs, causal two-asset MA/FVG walk-forward with costs/trades/DD/labels and working QuantStats, four-call evidence discussion with abstention/risk veto, native pinned profile/clocks, confluence progress, paper performance/optional closed-DD caps, real calendar/COT formatting and real foreground alert pills. Existing native framework, browser-login path and data-only private TradeLocker feed were retained; no Next.js replacement or unlicensed screener ingestion was added.

Verified: 98 runnable TS tests (one existing integration skipped), 18 Python tests, clean types/lint/server compilation, actual shared-page image and 300 real candles, real AI role outputs, separate actual QuantStats check and web/iOS/Android source exports. No session or user record was fabricated for testing; smoke checks made no production-data writes. Docker/deployment declarations prepare a portable future API; no container, signed native device release, closed-app push delivery or publication is claimed. Calibrated probability, full WR1/uploaded-rule backtesting and semantic classifier training remain open.

## Owner-only setup/paper milestone

The user's owner-only choice is implemented in tab entry and all app data/action routers using the existing approved real identity. Authentication bootstrap/callback/logout and health remain reachable; guest catalog HTTP 401 was verified. No roles or broker credentials changed. Source-attributed setup presets, combined supported models, provider daily/weekly context, ghost OHLC/analog scenarios, sharper native controls, canonical paper Buy/Sell/edit/partial/BE/history and observational refinement were added. PRIVATE_APP_UPDATE.md supersedes the earlier manual-weekly/legacy-new-order descriptions and details incomplete discretionary/session/image-anchor/calibration/native-push boundaries.

100 TS trading/security regressions passed, TypeScript/ESLint are clean, and actual approved-owner XAUUSD data/history/profile with a pure 0.5%/2R proposal were verified; no test paper/broker order or user session was created. The independent trace's confirmed paper-flow/risk/request-race issues were fixed; its scheduler-cookie suggestion was rejected against the documented platform cron transport. Configured local/saved drawdown caps remain checked in the canonical path, and 2R form validation is conversion-aware. Source builds/exports are not signed release/device verification; publication remains disabled. Final source acceptance and frozen export results are recorded in the milestone notes.

## Strategy collections / proposal recovery — 2026-10-15

Current additions: 11 optional source rulebooks, 44 source-labeled pattern/style references, causal numerical indicators/RSI and analytical frames with unsupported coverage disclosed. Screenshot's stuck pre-confirmation proposal now has a fast source-only path, deadline, cache-expiry and Retry. Actual connected XAUUSD Buy/Sell saved drafts/form validation took 3178ms/52ms; no paper/broker order created, real user confirmation still pending.

All 11,374 discovered collection references (5,546 PWB, 5,808 Quant Vault, 20 distinct SGX methods) are browsable through owner-only, paginated server queries. They are not thousands of installed execution systems. All inactive reference imports validate; IDs/provenance prevent repeat imports, unknown rules remain zero-weight/custom. Complete semantic de-duplication is **not established**: PWB full code/pseudocode gated; most Vault rule bodies unreviewed. No name-based merging or collapsing different methods in one notebook, no source bot/data execution.

Independently authored offline top-three order-book ML worker/UI/API: authorized snapshot JSON only, 8 MiB UTF-8, 500–12,000 rows, causal 64-feature event-time adaptation, 600/900-second offline labels, full-lookback/tail exclusions, purged chronological folds, 5 classifier families / 6 fixed configurations. Settings/fold scopes/reasons/gaps survive storage; no outer-test best-model selection, trained live artifact, future probability, HFT/DMA/queue-fill/real-data performance claim. Only synthetic unit/bridge data exercised this new book mode.

Whole current TS suite 170 passing / 1 existing integration skipped; Python 26 passing. Targeted review corrections passed, TypeScript/ESLint clean; all 11,374 reference imports mechanically validated, anonymous collection endpoint HTTP 401. Frozen reviewed iOS/Android/web source exports and backend compilation succeeded; preview/API healthy. App remains owner-only, paper-only, unpublished; no signing/release/device/push/HFT activation.

See STRATEGY_CATALOG_UPDATE.md for navigation, precise coverage, remaining blockers and publication/editing guidance.

## Strategy-attached tools / universal source replay / geometric direction watch

SCENARIO_NOTIFICATIONS_UPDATE.md supersedes earlier independent numerical-layer toggles and ready-only scenario restrictions. Selected visible strategies declare on-chart price/oscillator layers; Apply reveals the selected strategy. A real historical twelve-bar context continuation is available regardless of setup readiness when sufficient valid history exists, without strategy-performance/probability claims. Direction-only rules use atomic owned baselines/events rather than chart-view history; they handle geometric reversals, cooldown, missing/flat observations, source/version changes, captured source-layer taps and cold broker bootstrap budget. Native receipt handlers fetch owned evidence and can show push banners; Safari/browser native Expo push remains unsupported. No native enrollment, signed build, actual push delivery or publication was performed. Real XAUUSD replay probe verified thirteen selections with 300 actual BID bars and no event/order/session writes; final source diagnostic/export evidence is separate from real device delivery.
