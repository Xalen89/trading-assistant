# Zax Feature Specification — Current State

**Document type:** As-built feature specification  
**Snapshot:** 20 October 2026  
**Source baseline:** `8bea7ee2571645306b9b86e1ea1c8f3215b93b90`  
**Product posture:** Private, server-authorized owner workspace for analysis, education, research, and **paper-only** simulation.  
**Normative reading:** Must, requires, and blocks describe current source behavior unless explicitly marked **proposed**. They do not assert deployment, device test, provider availability, or statistical validation.

## Table of contents

- [1. Scope, evidence, and terminology](#1-scope-evidence-and-terminology)
- [2. Cross-cutting security, access, and workspace state](#2-cross-cutting-security-access-and-workspace-state)
- [3. Markets, charts, source provenance, and context](#3-markets-charts-source-provenance-and-context)
- [4. Strategies, confluence, and session-rule specifications](#4-strategies-confluence-and-session-rule-specifications)
- [5. Paper lifecycle, risk, discipline, and journal](#5-paper-lifecycle-risk-discipline-and-journal)
- [6. Coach, scenarios, historical layers, and direct provider path](#6-coach-scenarios-historical-layers-and-direct-provider-path)
- [7. Library, source evidence, screenshots, and learning](#7-library-source-evidence-screenshots-and-learning)
- [8. Quant Lab specifications](#8-quant-lab-specifications)
- [9. Alerts, automatic paper, background delivery, and notification state](#9-alerts-automatic-paper-background-delivery-and-notification-state)
- [10. Data model and API contract reference](#10-data-model-and-api-contract-reference)
- [11. Security, error lifecycle, and non-functional behavior](#11-security-error-lifecycle-and-non-functional-behavior)
- [12. Current-state acceptance cases](#12-current-state-acceptance-cases)
- [13. Service, device, publication, and qualification blockers](#13-service-device-publication-and-qualification-blockers)
- [14. Source traceability](#14-source-traceability)
- [Appendix: Complete current feature-guide inventory](#appendix-complete-current-feature-guide-inventory)

## 1. Scope, evidence, and terminology

This is current source behavior at `8bea7ee2571645306b9b86e1ea1c8f3215b93b90`, not a test, deployment, device, provider, model, or owner-data report. The appended 156-entry inventory is raw guide metadata, not proof of operation. Where old guide wording conflicts with current source, this specification uses current source behavior, including implemented 30m, unmounted external catalog, preview/deletion behavior, polling cadence, screenshot mismatch, and alert semantics.

Recorded evidence remains limited: the prior 851 passed, 0 failed, 1 pre-existing authentication integration skip milestone preceded production fix; eight later focused route/security tests are separate and not additive/full-suite evidence at this HEAD. Corrected permanent deployment timed out with `owner_unavailable` and last recorded public root on 19 October was `Cannot GET /`; temporary Metro/API 200 on 20 October is Preview/development recovery, not publication. Direct OpenAI input/transport/vault is source implemented but actual key/catalog/inference/phone behavior is unverified; it is separate from managed Coach/Library and AI4Trade is not connected.

| Term | Meaning |
|---|---|
| **Owner/canonical** | One allowlisted identity; server-owned record takes precedence over local cache. |
| **Completed bar/provenance** | Closed valid nonfuture period with source, as-of, identity/version/status/limitation. |
| **Sample/current/historical-only** | Demo data; fresh bars plus matching quote where required; or dated history never represented as live. |
| **Reference/candidate/gate** | Review source; observed evidence; exact-version weighted paper-eligibility contract. None is a recommendation/probability/order. |
| **Paper/ready** | Server-owned simulation; family calculation gate passed. Neither is broker fact, profitability, validation, or execution. |

Zax is private owner-only analysis, education, research, and paper simulation. It has six owner-gated tabs—Chart, Markets, Trades, Alerts, Strategies, My Library—plus Guide/Coach. It has no guest/team/public surface, real-money order path, calibrated predictive claim, institutional fill/queue claim, or autonomous model retraining.

## 2. Cross-cutting security, access, and workspace state

### 2.1 Owner authorization and shell

The server allowlist uses verified session identity. The predicate compares verified OpenID to configured owner OpenID; only when owner OpenID is absent does it compare verified owner email. Configured values are intentionally undisclosed. `users.role` is a platform account attribute and does not grant Zax use. Server `appProcedure` and `ownerProcedure` fail closed for unauthenticated or nonowner identity. Public `auth.access` may state `ownerOnly`, `allowed`, and `signedIn`, but does not expose configured identity.

Web authorization relies on server cookie verification; native reads bearer session state from Expo SecureStore. A cached user object is display-only. On missing verified native user, local native session state is cleared. Owner gates poll access every 15 seconds, do not retry access-query failure, and keep private children unmounted whenever access is absent, denied, or uncheckable. Root-level owner sidecars for notification, foreground alert sync, paper synchronization, and paper runner are also access gated.

| ID | Current requirement / behavior | Inputs and bounds | Outcome and failure behavior |
|---|---|---|---|
| **ZAX-SEC-001** | Verify private app access on server, not cached profile data. | Verified browser cookie or native bearer; configured owner predicate. | Signed-out, unauthorized, or unverifiable callers receive sign-in/denial/locked state; private children do not mount. |
| **ZAX-SEC-002** | Keep authorization identity confidential. | `auth.access` request. | Access state is returned without configured OpenID/email. |
| **ZAX-SEC-003** | Keep root providers and private navigation structurally gated. | Expo route/platform; verified access. | Owner sees six tabs plus gated Guide/Coach; private sidecars do not run for denied identity. |
| **ZAX-SEC-004** | Separate local privacy controls from authorization. | Local supported storage/crypto, optional PIN, app background state. | Local overlay never grants server access, alters workspace/server records, or claims OS screenshot prevention. |

### 2.2 Local privacy behavior

Browser PIN capability requires WebCrypto and localStorage. Verifier uses random salt plus PBKDF2-SHA-256 with 310,000 iterations. Allowed PIN length is 6–12 digits. Five failed attempts impose 30-second cooldown. On supported browser configuration, successful PIN entry dismisses local overlay only; background/inactive can relock. A separate default-on background privacy overlay hides balances, P/L, and source content while inactive.

Native SecureStore exists for session state, but default local-lock service does not supply native cryptographic derivation adapter. Therefore native PIN is currently **unavailable/off**, not merely untested. Forget-PIN recovery signs out, verifies old session state is gone, requires fresh owner authentication, and only then clears local verifier. None of these controls provide OS screenshot protection.

### 2.3 Workspace contents, local storage, and canonical state

Workspace schema version is 1. It covers strategies, pattern/source records, matches, local trade cache, alert rules/events, levels, selected strategy/market/timeframe, favorites, chart confirmation/overlay settings, settings, and paper starting balance. Initial values include WR1 reference strategy, BTC-USD, 5m, $100,000 paper starting balance, New York timezone, Neutral weekly bias, sample mode off, future overlay off, and adaptation on. Sample mode is live-view-only and forced off for persistence.

Core timeframes are exactly `1m`, `5m`, `15m`, `30m`, `1h`, `4h`, `1d`, and `1w`. Server symbol validation accepts built-in market IDs and `TL:` followed by 1–18 digits. Workspace JSON ceiling is under 2,000,000 characters. Bounds include 100 active strategies, 500 archived strategies, 500 library records, 100 alert rules, 1,000 matches/events, 2,000 local trade records, and 500 levels.

After authorization, local state uses AsyncStorage key `stratdesk.owner.workspace.v1`. If absent, legacy `stratdesk.guest.workspace.v1` may be copied privately without deletion. Envelope contains workspace, nonnegative cloud revision, dirty flag, and last acknowledged digest. FNV digest detects divergence but is not cryptographic. Local persistence occurs after 2,000 ms debounce and on background. Auto-save defaults on but cannot create first cloud workspace implicitly: owner must explicitly initialize it. Later auto sync needs acknowledged revision. Manual save submits latest snapshot/revision; edits racing submission remain dirty/queued.

Canonical authority is deliberately split. Paper rows/events and retained source metadata/original bytes are server-owned; local copies cannot replace newer canonical rows. Workspace cloud state is one owner row; source/version/job/alert/paper-history records are separately owned. Load may merge canonical paper/events and recover missing schema-valid source metadata through revision CAS. Stale revision is never merged or overwritten automatically. Clean local state may restore cloud automatically, while dirty, legacy, or diverged state remains local until owner confirms replacement. Local read/write errors are visible; failed local write can leave edits in memory only.

| ID | Current requirement / behavior | Inputs/defaults | State transition / boundary |
|---|---|---|---|
| **ZAX-WS-010** | Persist editable workspace locally before eligible cloud synchronization. | Schema-v1 workspace; 2,000 ms debounce; flush on background. | Local envelope updates; best-effort cloud action follows only when authority/revision conditions permit. |
| **ZAX-WS-011** | Require explicit first cloud creation and revision-aware later saves. | Owner access, snapshot, revision, auto-save setting. | Initial creation is deliberate; stale CAS is conflict, not merge. |
| **ZAX-WS-012** | Preserve canonical precedence for paper/source records. | Local cache plus server-owned rows. | Canonical paper/events and retained source state supersede local cache on load. |
| **ZAX-WS-013** | Surface divergence and persistence failure. | Dirty/legacy/digest/revision condition; local storage result. | No hidden replacement; failed local write may retain in-memory change only. |
| **ZAX-WS-014** | Keep sample mode nonpersistent as live demo state. | Explicit sample toggle. | Source analysis and paper proposal unavailable; persisted workspace forces sample off. |

### 2.4 Portability, capacity, removal, and analysis jobs

Portable workspace export/import uses `stratdesk-portable-v1` ZIP. Export maximum is 5 MiB total, 2 MiB per entry, and 16 approved entries. It can include manifest/README, JSON workspace/rules/journal/library metadata, and CSV trades/events. It excludes auth, secrets, internal URIs, original source bytes, and automatic-paper consent. Web downloads archive; native code writes to app documents then opens sharing, but actual device delivery remains unverified.

Import is data-only and requires exact confirmation `IMPORT PORTABLE WORKSPACE`. It accepts only closed trades, disables rules, omits originals, and does not restore automatic paper consent. Invalid archive, schema, capacity, or confirmation must leave records unchanged. Strategy hard delete is archive-only. Removal validates previewed versions, expected workspace revision, dependencies, and exact confirmation. It retains canonical paper history, detaches/version-bumps dependent source metadata, removes dependent alerts, and leaves encrypted original object bytes untouched. Previews reject more than 10,000 paper rows or 500 sources.

Normal source analysis accepts PNG/JPEG/WebP/PDF/UTF-8 TXT/Markdown/JSON from 1 byte through 25 MiB. Signature validation and encrypted retention occur before source-blueprint job work. Jobs are owner/source-version bound with states `queued`, `running`, `succeeded`, `failed`, or `cancelled`. One explicit retry is allowed, for at most two total attempts. UI polls every 1.25 seconds. Active job older than 360,000 ms fails without automatic retry. Job durability means row/status continuity, not durable always-on worker: execution is finite in process and reliable unattended processing needs deployed worker.

| ID | Current requirement / behavior | Bounds | Failure/authority behavior |
|---|---|---|---|
| **ZAX-WS-015** | Export safe structured owner data only. | 5 MiB archive; 2 MiB/entry; 16 entries. | Excludes credentials/originals/consent; does not prove native share delivery. |
| **ZAX-WS-016** | Make import confirmed non-destructive validation operation. | Exact phrase; approved schema/capacity. | Invalid input changes nothing; imported rules disabled and only closed trades accepted. |
| **ZAX-WS-017** | Use capacity and dependency checks for removal. | Active/archive strategies 100/500; Library 500; alerts 100. | CAS/dependency mismatch stops delete; physical source object deletion is not claimed. |
| **ZAX-WS-018** | Bind analysis jobs to retained source version and explicit recovery. | One active job/source; retry once; 360,000 ms stale lease. | Cancel/fail preserves original and cannot implicitly accept proposal. |

## 3. Markets, charts, source provenance, and context

### 3.1 Market selection and quote source semantics

Markets starts on TradeLocker feed and can switch to All feeds for available Coinbase crypto/FMP catalog items. Search matches ID, symbol, or name; category filtering resets pagination. Results paginate at 12 per page, expose account/feed status, favorites, quote/source/age when returned, quick price-watch bell, and Chart handoff. Bell creates disabled alert with current quote where available or zero otherwise; it needs owner review before activation. Futures status is true only when connected catalog exposes Futures item. Static ES/NQ references or cash indices are not exchange futures.

Chart has no market picker. It receives selected workspace market from Markets. It independently displays source/quote status and historical candle status. Quote timestamp is stale after 120 seconds, or when future skew exceeds 30 seconds. Coinbase REST returns provider time and may return bid/ask; Coinbase ticker stream with REST ticker recovery can update quote and forming candle. TradeLocker provides private broker bid/ask/midpoint but timestamp is REST response receipt, not provider event time or fill. FMP needs key/entitlement and may be delayed. Quote, historical close, and broker fill are distinct facts.

| ID | Current requirement / behavior | Inputs/defaults | Output / prohibition |
|---|---|---|---|
| **ZAX-MKT-020** | Discover and select available market instruments. | TradeLocker default; All feeds; 12/page; search/filter. | Sets workspace selection and navigates Chart; selection is not signal. |
| **ZAX-MKT-021** | Label quote source, age, and status independently of history. | Coinbase/FMP/TradeLocker/pending source; timestamp. | Stale/unavailable stays explicit; Chart never substitutes candle close for quote. |
| **ZAX-MKT-022** | Stage, not activate, market quick watch. | Selected instrument; quote can be absent. | Creates disabled watch; zero fallback is review input, not active price rule. |

### 3.2 Candle frames, forming bars, and aggregation

Initial Chart state is BTC-USD at 5m with sample mode off. Native source frames are 1m, 5m, 15m, 1h, and 1d; 30m is derived. UI exposes all eight supported intervals, including implemented 30m. Coinbase requests at most 290 recent buckets; FMP and TradeLocker retain up to 300; derived history retains up to 300. Chart renderer can display up to 3,000 bars, but that is renderer cap rather than provider-return promise. Public candle polling/cache is 60 seconds; TradeLocker polling is 20 seconds. Generic Markets copy stating all public candles are 20-second data is stale.

Coinbase ticker updates can create/update explicitly forming bucket at first observed trade. Newly created bucket starts with zero volume; no price carry-forward is invented. All analysis anchors use completed bars. 30m output is UTC half-hour periods and requires both exact contiguous 15m bars. 4h requires four exact hourly bars plus declared source calendar support. Weekly requires complete Monday-to-Monday UTC weeks and every source-declared daily period. Each derived request needs at least three complete output bars. Missing, incomplete, duplicate, or conflicting constituents are omitted rather than filled. Coinbase continuous seven-day crypto basis supports weekly; FMP/TradeLocker may lack sufficient declared session calendars for 4h/weekly and may be refused.

| ID | Current requirement / behavior | Exact condition | Result |
|---|---|---|---|
| **ZAX-MKT-023** | Expose eight frame controls without promising each feed supports every frame. | `1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w`. | Availability follows returned/derivable source history. |
| **ZAX-MKT-024** | Mark and limit forming candle use. | First observed ticker trade may update a bucket. | Forming bar visible but not analysis anchor; new volume remains zero. |
| **ZAX-MKT-025** | Aggregate only complete exact source periods. | 30m = two contiguous 15m; 4h = four exact 1h plus calendar; weekly = complete UTC week plus periods. | Gaps/conflicts omit/refuse output; at least three complete results required. |
| **ZAX-MKT-026** | Preserve source cadence/provenance. | Public source cache/poll 60s; TradeLocker 20s. | UI does not represent generic 20s public candle freshness. |

### 3.3 Chart presentation, sessions, profile, bias, and macro context

Locally bundled Lightweight Charts 5.2.1 renders web canvas in opaque sandboxed iframe/CSP with bounded sender-checked bridge and no network/session/storage. Native uses display-only restricted WebView. Controls include drag/pinch/crosshair, zoom, Latest, Sessions, Labels, Details, Retry, and explicit SVG fallback; SVG lacks some canvas behavior. Source/build evidence is not device proof. Visible nonarchived strategy layers can show EMA20/50, SMA20/50, Bollinger20 ±2σ, ATR14 2× guide, RSI14, MACD12/26/9, Donchian20, prior 10-bar range, or applicable VWAP20 ±2.5σ from completed bars. FVG/CE, ratios, zones and manual/provider-day levels are displays, not validation; volume provenance remains Coinbase venue, FMP unknown, TradeLocker broker/unknown.

Session boxes are local time context: Asia 09–18, London 08–17, New York 08–17, optional Sydney 08–17, default Asia/London/New York, intraday–4h only, maximum 256 observed boxes. They are not exchange hours/signals. New York is strategy-clock default; fixed EST UTC−5 is also available; source times stay unchanged. Profile uses UTC Monday weeks and requires completed current-week plus at least three prior-week observations; otherwise Unknown. PDH/PDL is last completed provider daily high/low. Bias runs three workers under 25s across eight frames; at least 55 completed bars; strict close/EMA20/EMA50 and five-bar EMA direction determine Bullish/Bearish, else Mixed. Base freshness is max three bars/15m with central cap 24h daily/7d weekly. It is descriptive only. Calendar/COT UI caps at 10 events/6 reports; fallback is bounded dated BLS/BEA/FOMC/CME context with null missing values, not instrument signal.

| ID | Current requirement / behavior | Bounds/defaults | Outcome / nonclaim |
|---|---|---|---|
| **ZAX-MKT-027** | Provide contained renderer recovery and source-bound overlays. | Canvas, explicit SVG fallback; completed-bar indicators. | Render failure offers recovery; overlay is display, not validation. |
| **ZAX-MKT-028** | Apply session boxes as time context only. | Asia/London/New York default; 256 cap; intraday–4h. | No daily/weekly boxes, exchange-hour claim, or signal. |
| **ZAX-MKT-029** | Compute descriptive profile and previous provider-day levels. | Completed current-week plus at least 3 prior observations. | Unknown/unavailable instead of inferred week/session. |
| **ZAX-MKT-030** | Classify completed-bar bias conservatively. | 55 bars; 3 workers; 25s; strict EMA logic. | Source/date/warnings shown; never probability/recommendation/gate. |
| **ZAX-MKT-031** | Present bounded calendar/COT source context. | UI 10 events/6 reports. | Missing/partial values remain null/unavailable; coverage is limited. |

## 4. Strategies, confluence, and session-rule specifications

### 4.1 Strategy records, references, and application

Source has 16 built-in preset IDs: seven indicator-oriented references, one ORB, three session/pivot, and five Core/Silver Bullet/OB/STDV. Foundry subset is deterministic eight-ID selection; WR1 is initial reference. Definitions are not runnable/qualified systems. Registry contains 11,374 references—5,546 PapersWithBacktest, 5,808 Quant Vault, 20 SGX order-book—with zero exact identity duplicates but incomplete semantic deduplication; they are not imported/executable rules. Its component/query is not mounted on current Strategies route. Forty-four pattern definitions are educational, not detectors.

Saved search filters nonarchived owner rulebooks by name/description. Personal record allows name 150 chars, description 10,000, 50 nonempty rule lines/factors named up to 140, default weight 10 editable 0–100, and 20 snapshots of which UI shows five. Restore creates revision; reference must duplicate before edit. Dedup uses stable/source identity or exact canonical rules. External import becomes inactive v1 reference/custom with enabled zero-weight prerequisite. Apply sets active/analysis ID/visible and returns Chart; max three IDs. ORB selects 1m, valid session config selects frame, ordinary profile retains frame. Visible layer is not full-rule approval.

| ID | Current requirement / behavior | Current bounds | Authority boundary |
|---|---|---|---|
| **ZAX-STR-040** | Keep presets, personal profiles, source references, and catalog definitions separate. | 16 preset IDs; registry 11,374 records; 44 definitions. | Counts do not equal validated/executable systems; unmounted registry is not route claim. |
| **ZAX-STR-041** | Create/revise personal rulebooks as versioned checklist content. | Name 150; description 10,000; 50 lines; factor 140; 20 snapshots. | Rule prose is not automatically detector evidence. |
| **ZAX-STR-042** | Deduplicate references without overwriting saved owner record. | Stable IDs/source identity/exact canonical rules. | Import stays inactive review reference; semantic dedup remains incomplete. |
| **ZAX-STR-043** | Apply no more than three profiles to analysis. | 1–3 distinct IDs. | Visibility/layers do not prove full source rules pass. |

### 4.2 Setup analysis and weighted confluence

`setup.analyze` is owner protected. It takes market, timeframe, one to three strategy IDs, `all` or `any`, valid IANA timezone up to 100 characters, and up to three strategy snapshots. It uses completed supplied bars only and rejects fewer than eight closed execution bars at service boundary. Duplicate IDs collapse; only first three distinct models run. It retains source-specific evidence through setup history. ALL requires every selected supported model qualify on same side; unsupported selected source withholds combined readiness. ANY exposes independently qualifying models. Long and short setup results are not silently blended. ALL/ANY is cross-model combination and must not be confused with weighted gate threshold logic.

Core/Silver Bullet/OB use closed OHLC for confirmed swing sweep, displacement/MSS, supported FVG/OB midpoint, and later retest. Core permits FVG or OB. Silver Bullet timing is manual/source connected. `stdv` is manipulation-range Fibonacci target geometry, not statistical sigma; `vwap-stdv` is distinct VWAP re-entry. Numeric references attach named close-bar indicators. Unavailable catalysts, real tick/orderflow, discretionary ICT prose, and unsupported source conditions remain unknown. Core-style readiness includes 30m, correcting stale 1m–15m-only wording.

No-code drafts are different from native gates. They use explicit closed-bar trend/RSI/return, top-N and inverse-volatility nodes; limits are eight assets, 2,000 bars/asset, 252-bar lookback, 12 schema nodes and six editor conditions. They are hypothetical research and cannot create orders. Pattern `Match` ties pattern, strategy/version, market/frame, and review state, but setup engine does not consume matching ready patterns to qualify candidate.

Native confluence gate uses allowlisted trigger, remaining native steps as conditions, equal initial weights, threshold 70, config v1, draft status, and required freshness of two chart frames. Threshold is 0–100. Conditions must be nonempty, have at least one enabled, nonnegative finite weights summing to 100 within epsilon 0.000001; explicit normalization is available. Review acknowledgement approves exact strategy version and increments config version. Any gate edit returns it to draft. Strategy edit can leave stored gate state, but runtime rejects version mismatch until owner reconfigures/reapproves and explicitly saves cloud state.

Score adds weights of enabled MET conditions only; trigger is mandatory and separate; threshold inclusive. Eligibility additionally requires valid config, exact candidate/version/side/source/frame, timely human approval, positive met points, and no blocker. WAITING/FAILED count not met; UNKNOWN, stale, missing, disconnected, future, invalid, or over-age evidence blocks. Native evidence must be closed t-1 and no older than two frames. Output is score, checklist, versions, eligibility, and reasons. `successProbability` is null. Separate observed target-before-stop display needs 100 resolved cases and caps at 500 samples/600 scans; costs absent and it is not future probability.

| ID | Current requirement / behavior | Exact condition | Result |
|---|---|---|---|
| **ZAX-STR-044** | Analyze selected strategies only from completed evidence. | 1–3 IDs; at least 8 closed execution bars; valid timezone ≤100 chars. | Source-specific analysis/history or explicit insufficiency; no blend of opposite sides. |
| **ZAX-STR-045** | Preserve unsupported/discretionary conditions as unknown. | Missing real ticks, catalyst/orderflow, incomplete rules, stale source. | Withhold readiness rather than invent source fact. |
| **ZAX-STR-046** | Distinguish no-code/pattern review from native candidate qualification. | 8 assets; 2,000 bars/asset; 252 lookback; 12 nodes. | Research draft/match does not alter setup-engine qualification or order authority. |
| **ZAX-STR-047** | Require exact-version reviewed weighted gate. | Threshold 0–100; valid weights total 100; source freshness two frames. | Approved score/points can support paper gate checks; it is not probability/order permission. |

### 4.3 Session strategy contract: ORB and NAS100 CFD

All session times use selected strategy clock. Source-authored EST is fixed UTC−5, represented by `Etc/GMT+5`, year round. `America/New_York` is explicit DST-aware owner override. Device time does not reinterpret bars. These windows are analytical rules, not verified exchange hours.

Native ORB requires exact 08:00–08:15 fixed-EST opening range, 1m execution, and entry window 09:00 inclusive to 11:00 exclusive. Sequence is closed breakout strictly outside range, later bar spanning opening-range 50% retest, then still-later close beyond retest high/low. Stop is one actual tick beyond opposite retest wick; exact target is 3R. Missing/legacy mode defaults `native-futures`; identity must be `category=Futures` with `id=providerSymbol=NQ` or `ES`. CME outright tick is 0.25. 3R risk band is 50–150 points for NQ and 20–40 for ES. Stop buffer integer is 1–10 actual ticks, default 1. CFD, crypto, cash index, alias, guessed tick, and invalid sequence fail.

NAS100 adaptation is deliberately separate and app-added, not video/NQ proof. It shares opening/time/1m chronological structure but permits only TradeLocker `providerSymbol=NAS100`, `TL:<numeric-id>`, and broker index/equity-index category, `Indices` or exact NAS100 `Stocks` label. It binds `instrumentMarket` to selected market. Positive `priceTick` must equal current same-market metadata; schema cap 1000. Dated read-only value 0.01 is not default. CFD 3R band is 50–150 price points. It rejects aliases US100, USTEC, NAS100.PRO; rejects NQ tick 0.25/display precision/cross-source tick; and blocks unavailable/mismatched metadata. Recorded dated 253.62-point 3R path is out-of-band example, not market default or performance fact.

### 4.4 Session strategy contract: London, Initial Balance, and PDC

London Breakout requires 00:00–03:00 fixed-EST Asian range composed of twelve contiguous same-source 15m bars. After 03:00, latest fresh contiguous completed 15m close must be strictly beyond range high/low. App execution is 15m even if source mentions optional 5m. Default stop midpoint; alternative opposite boundary. Default target 2R; alternatives 1.5R or one range height from entry. No hard cutoff supplied. No missing-bar fill, coarse interpolation, volume filter, or invented end time permitted.

Initial Balance requires exact 09:30–10:30 fixed-EST range of four contiguous 15m bars. Confirmation is completed 15m or 30m bar beginning at/after 10:30 and closing strictly outside. 30m is complete same-source 2×15m aggregation, never guessed period. Default frame 15m, optional 30m. Default high-volume rule is latest volume at least 1.5× mean of previous 20 contiguous positive completed same-frame bars, excluding latest. `volumeMultiplier` is 1–5, default 1.5; lookback fixed 20. Venue volume needed unless owner explicitly selects `broker-reported-proxy`, which remains nonvenue. Stop default midpoint, alternative inside broken boundary by 1–10 actual ticks default 1. Target is one IB range height beyond broken boundary, never entry-based. Default monitoring cutoff 11:30; configurable end minute 631–960, 10:31–16:00. Cutoff is app added, not source evidence of exchange session.

PDC continuation uses exact completed same-source 1m 09:30 opening bar. Open below PDC allows long R2G; open above PDC allows short G2R; equal allows neither. Quote crossing must be separately observed from 09:30 inclusive until 10:00 exclusive; it cannot be inferred from candle crossing. Execution/volume is 1m default or 5m selectable. PDC basis starts unselected; options provider UTC day, provider UTC trading day, or owner-declared session close. Owner needs positive actual `priceTick`. Long stop is complete observed 1m morning low minus tick; short high plus tick. Latest completed equal-frame volume must be strictly greater than immediately prior volume. Default target type owner levels with directional prices required; alternatives declared premarket range or previous-day extremes.

For quote cross, both quotes share symbol/source identity, nonfuture time, and current is within 30 seconds of detector/observation time. Timestamps strictly increase and differ by at most 90 seconds. Long is prior `price ≤ PDC`, current `price > PDC`, and current entry still above; short inverse. REST observation can miss cross/reversal and is not first-tick execution. PDC basis needs valid source daily/session anchor conditions; all daily/target facts share execution source identity. Gold/Asia source mention lacks exact opening anchor/clock/instrument/tick/executable model and remains reference-only.

| ID | Current requirement / behavior | Required geometry/evidence | Blockers/nonclaims |
|---|---|---|---|
| **ZAX-SES-050** | Keep five rule families separate. | Video ORB, NAS100 CFD adaptation, London, IB, PDC. | No cross-family alias/mode remap; Gold/Asia remains reference-only. |
| **ZAX-SES-051** | Enforce native ORB chronology and exact futures identity. | 08:00–08:15 range; 09:00–11:00; 1m; breakout/retest/continuation; NQ/ES; 0.25 tick. | In-band 3R required; real native futures feed availability unverified. |
| **ZAX-SES-052** | Bind NAS100 CFD to selected broker metadata. | Exact NAS100 TradeLocker identity; positive matching tick; 50–150-point 3R. | Alias/display/cross-source tick and out-of-band geometry block. |
| **ZAX-SES-053** | Derive London/IB from contiguous same-source 15m evidence. | London 12 bars; IB four bars; complete 30m if selected. | No interpolation/source gap fill; IB volume basis must be explicit. |
| **ZAX-SES-054** | Treat PDC quote observation and geometry as separate facts. | Opening bar, PDC basis, fresh quote pair, rising volume, tick, morning extreme, target. | Candle cross, stale/mismatched quote, unknown target, or zero volume blocks. |
| **ZAX-SES-055** | Keep instrument preparation read-only and nonauthoritative. | NAS100 20s; IB/PDC 25s bounded preparation. | Detection fills verified draft facts only; it does not approve gate or create paper record. |

## 5. Paper lifecycle, risk, discipline, and journal

### 5.1 Proposal and entry modes

Chart Buy/Sell creates paper-plan flow. `setup.propose` requires owner auth, selected market/timeframe/strategies, ALL/ANY, timezone, side, and risk percentage. It requires non-sample context, live quote, recent completed source bars, matching market, positive canonical balance, and supported valuation. It persists immutable owner-bound proposal lasting 15 minutes; client rendering does not create fill. Loading/blocked proposal disables confirmation.

`entryMode` defaults to **practice**. Practice still requires quote, geometry, sizing, drawdown, and discipline checks but makes no claim strategy evidence is valid. **Strategy** entry requires saved canonical workspace, matching strategy/configuration versions, fresh same-direction confluence, and server reanalysis. ALL requires every selected rule; ANY requires one. Pending strategy limit re-gates at observed fill against saved placement versions. Missing/changed evidence waits or blocks. Qualifying ORB/session entry adds stricter source/bracket rules.

| ID | Current requirement / behavior | Inputs/defaults | Canonical outcome |
|---|---|---|---|
| **ZAX-PPR-060** | Create immutable owner paper proposal only from usable source state. | Live quote; recent completed bars; valid valuation/balance; 15-minute life. | Owner-bound proposal or typed blocker; no local synthetic fallback. |
| **ZAX-PPR-061** | Separate discretionary practice from gated strategy entry. | `practice` default; `strategy` needs same-version same-side confluence. | Practice paper record is not signal; strategy rechecks at creation/fill. |
| **ZAX-PPR-062** | Reject unsafe proposal/order state rather than manufacturing entry. | Sample, stale source, unknown balance, invalid geometry/version, unsupported valuation. | Confirmation blocks and no canonical trade is created. |

### 5.2 Quote, bracket, target, valuation, and sizing

At order time quote must be live, no older than 120 seconds and no more than 30 seconds future. Long market entry uses ask where supplied, falling back to price only if side fields absent; short uses bid under same condition. Long bracket requires `stop < entry < target`; short requires `target < entry < stop`. Price, quantity, and R must be finite positive. Ticket begins at 2R. Presets are 1R/2R/3R and custom positive R; schema maximum 1000. Direct target price persists unchanged or fails geometry. USD valuation uses point value; USDJPY/USDCAD invert by price. Unsupported valuation blocks. Simulated price units exclude broker lot/margin/fees/slippage/fill guarantees.

Templates are 0.5%, 1%, 2%, and 0 for Fixed units. UI/default proposal is 0.5%. Proposal sizing floors quantity to six decimal places using canonical starting balance plus canonical realized paper P/L and risk per unit. Authoritative ledger fetches at most 20×100 records; missing/nonpositive balance, invalid/duplicate record, incomplete page, or unusable valuation blocks sizing. For percentage templates, unchanged default quantity recalculates against fresh bracket; edited quantity/bracket must meet 0.5%-of-balance reference floor and not exceed proposal percentage cap.

There is explicit current source/UI discrepancy. Fixed units starts from initial proposal sized at 2%, but `createPaperOrder` skips percentage floor/cap checks when `proposal.riskPct === 0`. Therefore edited fixed-unit quantity is **not** capped by that percentage-check path, despite UI wording suggesting server cap at displayed percent. Documented code behavior is authoritative; it does not establish acceptable risk-control outcome.

### 5.3 Discipline and lifecycle

Optional daily realized-drawdown cap accepts finite greater than zero and up to 100%; blank unsets. It uses UTC closed-trade peak drawdown and blocks creation at/above cap or when chronology/complete bounded ledger is unknown. Four opt-in owner guards are off by default: post-loss cooldown, daily closed-trade threshold, post-loss risk escalation, and loss streak. Defaults include 20 minutes and six closed trades UTC day. Escalation means greater than 1.5× median of up to five earlier original risks; streak warning starts at three. Server blocks only matching observed flag for enabled canonically saved guard. Advisory cannot diagnose revenge, emotion, or intent.

Statuses are `pending`, `open`, `closed`, and `cancelled`. Partial is event/quantity change while open. Default market style opens from fresh side quote. Limit fill needs observed long ask/short bid at or through entry plus applicable evidence; price-only cannot fill. Explicit opted-in management may take one 50% partial at 2R, move remaining stop to breakeven, then close at stop/target. Ambiguous same-bar stop/target resolves stop first. Excursions are sampled quote extrema rather than tick history. Close uses long bid/short ask; cancel needs fresh quote. Terminal record only allows review. Version conflict rejects overwrite.

`Trade` retains proposal/strategy versions, entry snapshot, quote source/time, original risk/quantity/bracket, order mode, and events. Proposal ID determines owner-scoped trade ID. Same-mode retry returns existing record; reuse with different mode conflicts. Transactional writes and version checks preserve revisions. Different proposals have no atomic aggregate-open-risk reservation. History pages at most 100. Local legacy logs do not constitute canonical chart orders.

Performance shows paper starting balance plus realized paper P/L, open P/L/risk, mean R:R, and UTC closed-trade peak drawdown/cap. Any missing/stale, over 120 seconds, or future, over 30 seconds, open quote makes aggregate open P/L/equity **Unknown**, not zero. Queries cover up to 40 markets; clock refreshes every 15 seconds. This is not broker account equity and does not separately model broker fees, slippage, margin, latency or execution guarantees; observed bid/ask-side prices can nevertheless reflect the quoted spread in simulated P/L. Learning reads at most 2,000 canonical closed records, shows coverage/four score buckets, and withholds comparison below 100/group. No legacy backfill or rule self-promotion occurs.

| ID | Current requirement / behavior | Exact boundary | Result |
|---|---|---|---|
| **ZAX-PPR-063** | Use side-aware fresh quote and directional bracket geometry. | Quote ≤120s, future ≤30s; long/short inequality; custom R ≤1000. | Invalid/stale price or unsupported valuation blocks simulated order. |
| **ZAX-PPR-064** | Size percentage templates from canonical paper ledger. | `riskPct ∈ {0,0.5,1,2}`; six-decimal floor; 20×100 ledger bound. | Missing/incomplete/unusable ledger blocks; fixed-unit cap exception is disclosed. |
| **ZAX-PPR-065** | Apply paper drawdown/discipline guard only when enabled. | Cap `0<pct≤100`; cooldown 20m; six-trade default; 1.5× escalation; streak 3. | Advisory/guard status is not emotion diagnosis or broker risk control. |
| **ZAX-PPR-066** | Preserve canonical simulated lifecycle and reprice/fill evidence. | Pending/open/closed/cancelled; observed bid/ask for limit; current version. | No synthetic price-only fill; stale revision cannot overwrite. |
| **ZAX-PPR-067** | Expose paper review without presenting performance as brokerage performance. | ≤40 market P/L query; ≤2,000 learning records; <100/group withheld. | Unknown remains Unknown; no edge/rule promotion. |

## 6. Coach, scenarios, historical layers, and direct provider path

### 6.1 Coach scope and request lifecycle

Coach route is owner gated. General scope covers lessons/dashboard/chat; Library scope carries protected `sourceId` but not source bytes. Owner uses prepared strategy/confluence/pair/discipline prompts or free-form question. Request carries up to 14 prior turns, workspace market/timeframe/active strategy, and optional source ID. Server retrieves available canonical workspace, paper, market, and source context; replies carry model/context/source-time metadata when available. It can cite up to eight sources. Response commits only when answer and model are nonempty.

Conversation state is local AsyncStorage keyed by owner, scope, and optional source. It retains at most 60 turns, sends at most 14 prior turns, uses UUID exchange IDs, normalizes legacy duplicates, and clears only current key. Pending/failed questions are UI state rather than durable conversation row. Client question cap is 1,600 chars; server accepts up to 7,000 chars with each prior turn up to 7,000. Model catalog check deadline is 8 seconds and cache five minutes. Server request deadline 45 seconds. Owner quota defaults 30 requests per 10 minutes with workspace override clamped 1–60; independent ceiling 60 attempts per 10 minutes. Status checks do not consume question quota. UI timeout is 80 seconds: it restores question and ignores late output. Client cancel does not abort server/model work.

Quality is `efficient|deep`; unknown resolves Efficient. Managed routing selects available model in selected tier and discloses model/fallback. Latest recorded managed-AI Deep probe was terminal-unavailable. Corrected error handling does not restore service access. Catalog status cannot prove successful completion.

### 6.2 Strict AI scenarios and historical layers

Forecast requires market/timeframe. `contextMode` defaults `auto`; question defaults blank/max 800; quality and strategy ID are optional, with strategy ID max 100. All eight frames can be source frames. At least 15 valid completed bars are required; at most 80 used. **Current** needs fresh completed bars plus matching current timestamped live quote. **Auto** refreshes selected source and resolves stale/missing quote to labelled historical-only context. **Last available** deliberately uses completed history without quote. Requested/resolved mode, close time, age, and provenance persist in result state. Quote update cannot make stale bars current.

Untrusted model draft must validate into strict display-only scenario: direction; 1–1,200 char thesis; 1–6 assumptions at max 300 each; invalidation max 600; exactly 12 steps. Close offsets are −4 to +4 ATR, wicks 0 to 1 ATR. Server derives ATR/anchor from actual completed source, produces positive OHLC at source-frame intervals, and sets display volume zero. Final offset must match up/down direction or stay within ±1 ATR for range. Certainty/execution claims fail validation. Final contract enforces `probability:null` and no draft steps leakage. Scenario drawings cannot feed actual chart data, confluence, paper entry, or orders.

Forecast server deadline is 48 seconds. One correction with same model/source/anchor is allowed only for empty/malformed/direction-inconsistent output if at least six seconds remain; provider/transport errors do not trigger correction. UI timeout is 52 seconds and invalidates request epoch so late output cannot mutate UI, but server/model work is not claimed cancelled. Terminal refusal uses fixed safe copy and no automatic provider bypass/retry. Terminal no-output releases request quota reservation but not independent attempt count. Sample mode disables compact forecast panel.

Historical replay is separate from AI. It requires actual past continuation and rejects empty/invalid evidence rather than synthesizing path. New historical layer requires one to three unique active local strategy snapshots, ALL/ANY, valid IANA timezone, source and one or more target frames. AI/historical source and target frames independently support all eight intervals. Layer defaults current timeframe, enabled, `both`, and Follow. Controls allow target, visibility, line/ghost/both, six colors, Follow or Fixed. Workspace caps saved layers at 12 across AI/historical and six visible layers per target chart. Malformed, expired, wrong-market, or mismatched layers withhold. Follow rebases display geometry only; it never changes original analysis/historical prices.

### 6.3 Direct OpenAI scenario provider

Chart scenario-layer setup can accept masked direct OpenAI key. UI validates trimmed `sk-` plus alphanumeric/underscore/hyphen, 32–1,024 chars. It clears field before request, on background/unmount, and resets key-bearing mutation state. Owner-only secure POST permits approved web origin or verified native bearer/local transport. Server checks fixed OpenAI `/models` catalog and saves only if supported scenario model exists. It encrypts key in owner-bound AES-256-GCM envelope authenticated with metadata/derived key in reserved runtime-state row. It does not return/save key in workspace or AsyncStorage. Failed proposal does not replace saved credential. Status reveals configured state and catalog models only.

`forecast.generate` is only consumer of saved direct credential. It uses fixed `/models` and `/responses`, `store:false`, strict JSON schema, no tools/conversation state, 500-KiB request/response caps, and shared deadline. Direct Efficient permits listed GPT-5 mini; Deep permits listed GPT-5. There is no silent model/provider fallback. Disconnect requires confirmation, deletes credential for future scenario calls, and routes future scenarios to managed path; it does not alter Coach, Library, paper, or automation. Catalog success remains insufficient proof of direct inference or device transport.

| ID | Current requirement / behavior | Bounds/defaults | Authority / failure boundary |
|---|---|---|---|
| **ZAX-AI-080** | Maintain owner-scoped local Coach conversation with bounded contextual request. | 60 local turns; 14 sent; 1,600 client/7,000 server question; 45s server/80s UI. | Failed/late/cancelled UI response does not become durable exchange or prove server cancellation. |
| **ZAX-AI-081** | Treat Coach availability as conditional. | 8s catalog check; 5m cache; 30/10m default quota; 60 attempts ceiling. | Terminal-unavailable, timeout, refusal, quota, and status are distinct; catalog is not inference. |
| **ZAX-AI-082** | Generate only strict hypothetical source-anchored scenario display. | ≥15/≤80 completed bars; thesis 1–1,200; 1–6 assumptions; 12 steps. | `probability:null`; malformed/uncertain data fails closed; output cannot reach paper/confluence. |
| **ZAX-AI-083** | Preserve explicit Auto/Current/Last context semantics. | Current requires fresh bars plus matching live quote. | Auto may use labelled dated history; Last available never claims live; quote cannot refresh stale bar. |
| **ZAX-AI-084** | Keep actual historical continuation separate from AI forecast. | 1–3 active strategies; at least 1 target; layer 12 total/six visible target. | No continuation means no layer; Follow changes visual geometry only. |
| **ZAX-AI-085** | Isolate direct scenario credential and model path. | `sk-` key 32–1,024; AES-256-GCM; 500 KiB caps; GPT-5 mini/GPT-5 allow-list. | Scenario-only; no key return/local workspace storage; catalog/connect does not prove inference. |

## 7. Library, source evidence, screenshots, and learning

### 7.1 Library source intake, retention, and structured review

My Library is personal pattern/style/source/screenshot/study storage, not broker interface, general interpreter, model trainer, or performance certificate. It holds at most 500 shared records, including screenshots. Search is active-kind, case-insensitive name/tag/note/description; filename is display only and screenshot-only source excludes generic matching.

Normal source accepts PNG/JPEG/WebP/PDF/UTF-8 TXT/Markdown/JSON through 25 MiB decoded bytes; UI transport allows 36 MiB. Server validates base64, signature/MIME, parseability, raster decodability ≤25,000,000 pixels, or readable 1–200-page PDF under 10s parser/decode bound. Header-only/unreadable files fail before retention. Image-only/scanned PDF can retain but cannot satisfy extractable-text AI review. Successful original is AES-256-GCM encrypted and owner scoped; DTOs omit storage locator. Expected-version revision applies. Logical deletion removes source/version/vector rows and frees capacity but physical encrypted object deletion remains pending/unsupported.

Upload creates version-bound `uploaded` source and at most one active job; poll/cancel or retry once; stale after six minutes fails; cancellation winning prevents result persistence; indexing failure nonfatal. Blueprint stays `approved:false`, up to 24 conditions/30 indicators. Literal text/PDF evidence is required. Only exact closed-bar cited EMA/close comparisons, period 1–500, can be supported; images/discretionary/order-flow/quant/ML stay manual/missing review. Manual definitions start review; human acceptance alone creates ready pattern or review style. Up to 30 accepted rules become weight-10 local factors; review style is hidden/inactive/zero-weight under 100 active strategy cap. No acceptance trains model, alerts, validates edge, or orders.

| ID | Current requirement / behavior | Exact bound | Failure/authority outcome |
|---|---|---|---|
| **ZAX-LIB-100** | Search/browse personal Library within shared capacity. | 500 records; source filename not search field. | Screenshot-only content excluded from generic matching/promotion. |
| **ZAX-LIB-101** | Validate normal source before protected retention. | 25 MiB decoded; 25M pixels; PDF 1–200 pages; 10s parser/decode. | Invalid signature/readability/content fails before retention. |
| **ZAX-LIB-102** | Encrypt and version retained original under owner scope. | AES-256-GCM; expected-version revision. | DTO hides storage key; logical delete frees capacity but leaves physical cleanup pending. |
| **ZAX-LIB-103** | Run bounded retained-source analysis without implicit acceptance. | One active job/source; retry once; six-minute stale failure; 24 conditions/30 indicators. | Job failure/cancel preserves original; blueprint remains unapproved/source-version bound. |
| **ZAX-LIB-104** | Convert review only through explicit human action. | Up to 30 manual lines; active strategy cap 100. | Acceptance produces review/style state, not detector, alert, retraining, or order. |

### 7.2 Protected preview and image retrieval

`sourcePreview.info/page/text` delivers bounded data only; it never returns object URL/key. Inputs are sources up to 25 MiB/25M pixels. Images/PDF pages render as JPEG up to 700 KiB per page, with 20 preview pages, navigation up to 2,000, dimensions 256–1,200 px, and text/evidence window up to 48 KiB. PDFs support image/text when extraction exists. Coach thumbnails at most 768 px/200 KiB. Version change requires reload.

Photo retrieval accepts PNG/JPEG/WebP through 8 MiB. It returns term overlaps of at least two shared terms, top eight, and visual cosine neighbors. Descriptor is `opencv-hog-128x64-v1` with 3,780 dimensions. Visual search scans at most 500 indexed generic ready images and returns five. Crops/theme/axes can dominate; similarity is not detection/probability. Ready references may enter versioned chart/strategy candidate flows: AI comparison at most three same-market/strategy references; chart visual search uses selected strategy/market/timeframe/recent bars. Candidates cannot self-confirm, alert, or order. Catalog additions are local review definitions without vectors/activation.

### 7.3 Screenshot evidence and local historical studies

Screenshot review is distinct immutable evidence flow. Stage default is `unknown`; owner can optionally link existing paper trade or leave standalone. Owner-entered time requires ISO Z/offset; timezone no more than 120 chars and is not proof. Model receives no trade fields. Draft separates visible facts, uncertainty, text, confluence, bounded process lessons, and limits; illegible time remains unknown and outcome unverified. Confirmation versions source only, leaving canonical trade unchanged. Inventory loads newest 100, initially shows 20 and adds 20. Retry uses retained original; reopen does not fetch bytes. Bounded review metadata may be Coach context, not fill/model weights.

Screenshot service deadline is 90 seconds and visible client deadline 100 seconds. Current picker allows 25 MiB general reader; transport caps base64 at 12 MiB; review service rejects decoded image above 8 MiB. Consequently some retained uploads cannot be analyzed, including approximately 8–9 MiB files that pass some client/transport paths; larger input can fail transport before retention. Retained original after successful upload remains retryable even if review analysis fails. This is real source/UI contract mismatch, not assumed resolved defect.

Historical dataset imports are component-local CSV/JSON candle data, not durable workspace archive. Valid set is 3–10,000 positive OHLC rows with unique Unix-second timestamps and nonnegative/default-zero volume; sort chronologically and preserve gaps. Owner selects eight-frame interval. At 31 bars, display volatility/autocorrelation/momentum; at 48, at most five nonoverlapping 12-bar analogs and next 12-bar outcomes. Defaults long, 0.5% stop, 1% target. Costs absent; same-bar stop/target resolves conservative loss; probability null. Optional two-series MA/FVG experiments are baseline walk-forward only. Actual paper learning remains descriptive and withholds comparison under 100 outcomes.

Order-book experiment permits owner-authorized JSON no larger than 8 MiB with 500–12,000 snapshots, Unix times, and exactly three bid/ask price-quantity levels. Defaults label horizon 600s, training 1,800s, test 10s, one fold. It can report five classifier families/six configurations plus chronological/purged rows and classification metrics. It stores/deploys no model and supplies neither fills nor profit.

| ID | Current requirement / behavior | Bound/default | Outcome / limit |
|---|---|---|---|
| **ZAX-LIB-105** | Preview protected source without exposing storage locator. | 20 pages; ≤700 KiB/page; 256–1,200 px; ≤48 KiB text. | Owner-scoped bounded preview; version mismatch needs reload. |
| **ZAX-LIB-106** | Retrieve visually/semantically similar approved references. | Query 8 MiB; 500 scan; top eight terms/five vectors; 3,780 descriptor. | Similarity is not detector/probability/self-confirmation. |
| **ZAX-LIB-107** | Retain screenshot as immutable evidence, not trade mutation. | Inventory 100; 20 plus 20; timezone ≤120. | Confirmation revises evidence only; outcome stays unverified. |
| **ZAX-LIB-108** | Report screenshot intake/review mismatch honestly. | 25 MiB picker; 12 MiB Base64 transport; 8 MiB service; 90s/100s deadlines. | Retention does not imply analyzability; failed review preserves retryable original if upload succeeded. |
| **ZAX-LIB-109** | Keep imported studies/classifiers exploratory and bounded. | OHLC 3–10,000; stats 31; analogs 48; order book 8 MiB/500–12,000. | Probability null/no costs where stated; no stored/deployed/retrained model. |

## 8. Quant Lab specifications

### 8.1 Shared workbench contract

Quantitative workbench in Strategies has Pairs, Cross/time-series momentum, Market making, Multi-asset trend research, and Forward-return classifier. MODEL OUTPUT AVAILABLE means calculated output, not profitability/validation. Owner chooses real-data starter or edits independent config; one 8 MiB CSV/JSON import, up to 5,000 parsed bars, can replace provider history for selected symbol. `quant.run` validates owner request, obtains history/book, runs pure model, and retains only minimal server-session summary.

Starters: BTC-USD for making/ML, BTC-USD plus ETH-USD otherwise; 1m making, 1h pairs, 1d otherwise; 60 requested bars making, 900 otherwise. Shared settings default lookback 60, entryZ 2, exitZ 0.5, fee/slippage 0, holding 5, equity 100000, inventory 0, order size 0.01, max inventory 0.1. Request permits 1–8 symbols, one frame, 60–1,800 bars; making/ML one, pairs two, trend 1d/1w. Malformed/unfinished/future bars exclude and gaps remain. Pairs/Momentum/Trend inspect maximum 2,000 bars/asset.

Result is `ready|insufficient-data|unavailable` with source/as-of, metrics/signals/equity, unconfirmed diagnostics/limitations, optional plan and at most 12 displayed signals. 45s deadline; 30 calls/in-memory user bucket/10m; client result plus maximum five latest-per-family server summaries for one hour lost on restart. No durable archive, sealed holdout registry, or paper/broker bridge exists.

### 8.2 Pairs / relative value

Pairs requires exactly two distinct symbols and one supported frame, with at least `max(100, 2 × formationWindow)` synchronized valid closed bars. Controls permit lookback 30–400, entry z score positive/API maximum 10, exit z score at least zero but below entry/API maximum 5, holding 1–100 bars, positive equity/size, and fee/slippage 0–1,000 bps. Method defaults rolling OLS, 252-bar formation, and 63-bar trading blocks. OLS fits left = intercept + beta × right. Output includes spread/z, beta/drift, residual/autocorrelation screens, formal residual ADF Engle–Granger/MacKinnon diagnostic, and rolling equal-window loss-of-rejection warning. Candidate needs current test reject no cointegration at 5%, no loss warning, and current two-leg position.

Replay uses fixed nonoverlapping formation/trading blocks where enough history/settings exist. Decisions use only current/prior closed bars and lag to next observed close. Generic bps charge paired notional. Open outcomes are not forcibly closed absent later bar. There is no untouched newest holdout. Model assumes both series I(1), does not test integration order/structural breaks, and has no multiple-testing correction. Its p-value is not win probability. Paper plan is exactly two reference legs or absent, never single-leg substitute.

### 8.3 Selected-universe momentum and systematic trend

Momentum uses explicit fixed universe two to eight symbols at common timeframe, exact shared closed timestamps, and at least lookback+1 usable bars. UI lookback 10–252; holding/rebalance 1–100 common bars; positive equity; nonnegative finite cost with app max 1,000 bps each. It uses trailing close momentum and population volatility of trailing log returns, deterministic rank, positive top quintile/negative bottom quintile, inverse-volatility weights gross one, and user cost on absolute target-weight turnover. It provides dated signals/metrics/simplified close-to-close equity and optional allocation preview. Retrospective forward-rank diagnostics are separate from rank-time signal. It always reports unconfirmed validation: zero train/test samples, no walk-forward, no untouched holdout. It lacks point-in-time membership, delisting/survivorship, corporate actions/total return, benchmark alignment, borrow, financing, impact, fill, or liquidation model.

Trend family implements daily/weekly multiasset OHLC trend, not macro release/vintage/rate expectation/differential/carry. It requires two to eight app-selected assets, pure runner cap ten, exact common closed timestamps, and 2,000 max source bars/asset. UI lookback 20–252; volatility window is `clamp(floor(lookback/3),10,63)`. Causal EWMAC 8/32, 16/64, 32/128, 64/256 averages, normalized forecast cap absolute 20, and inverse-vol scaling gross absolute weight one define output. Warm-up is governed by 32-bar slow component and volatility; gaps stay gaps. Historical equity uses prior completed common-bar targets, close-to-close returns, and cost turnover. Latest next-bar targets exclude from historical equity. Validation stays unconfirmed/no split/no holdout. At least 100 truly independent OOS observations is human review gate, not proof. Required macro vintages/rates/carry/total-return conventions are absent.

### 8.4 Venue market making and classifier

Market making is current-book-only calculation. It accepts supported Coinbase product depth with source, receipt time, status, tick, and lot increments; TradeLocker/non-Coinbase input rejects. Service tries `level2_batch` WebSocket then public REST fallback. Output is single-venue aggregated depth, not NBBO. Receipt freshness maximum is 10 seconds. Runner requires uncrossed positive bid/ask, removes invalid/duplicate levels, and uses top-five depth plus inventory/limits. Defaults zero inventory, 0.01 order size, 0.1 max inventory. Cost assumptions can be 0–1,000 bps. Center shifts midpoint by depth imbalance and inventory, each weighted 0.25 spread and clamped to BBO; prices/sizes obey tick/lot and inventory cap. If spread bps is no greater than twice fee plus slippage, status can remain ready with no plan. No fills, queue priority, persistence, cancellation, latency, adverse selection, P/L, return, equity, or validation samples are simulated. One hundred independent quote outcomes plus fill/cancel/latency records, chronological walk-forward, and untouched holdout are requirements for future evidence, not current output.

Classifier requires exactly one selected symbol at any supported frame and source history. UI lookback 10–60, holding horizon 1–20, nonnegative finite fee/slippage, optional positive starting equity. UI defaults validation to walk-forward with 1% embargo and 15 maximum fits; pure-runner fallback without mode is CPCV. Import/API history can reach 5,000 and runner caps at 5,000/series then 2,000 most-recent eligible rows for validation. Eligible label uses features through bar before entry, entry open, holding-horizon exit close; round-trip modeled cost is `2 × (feeBps + slippageBps)`. It chooses long/short only where net return positive; neither-positive outcomes exclude.

Six OHLC-only lagged features feed deterministic train-scaled ensemble of up to six shallow boosted stumps. At least 120 eligible costed outcomes per series required to attempt validation; folds need at least 60 training rows and both classes. Purged walk-forward or bounded CPCV folds plus separate most-recent holdout use overlap purging/embargo. Calibration/reliability, when fit, concerns positive costed forward-direction label only, not trade-win probability. Accuracy suppresses below 30 scored rows. Optional equity is per-symbol nonoverlapping holdout outcomes only. `ready` requires at least one signal and one scored holdout row, not satisfactory predictive performance. No AI service, direct inference, order, or true autonomous retraining participates.

| ID | Current requirement / behavior | Inputs/qualification | Output boundary |
|---|---|---|---|
| **ZAX-QLB-120** | Keep Quant Lab owner-run and bounded. | 1–8 symbols; 60–1,800 request; 8 MiB/5,000 import; 45s/30 per 10m. | Temporary result, at most five/family for one hour; no durable archive/order bridge. |
| **ZAX-QLB-121** | Evaluate pairs as synchronized two-leg exploratory calculation. | Exactly 2; ≥max(100,2×formation); 30–400 lookback; 1–100 holding. | Formal cointegration diagnostic is not probability; plan is paired or absent. |
| **ZAX-QLB-122** | Model selected-universe momentum without claiming portfolio validation. | 2–8 assets; exact timestamps; 10–252 lookback; 1–100 cadence. | Simplified costed historical equity/signal; validation always unconfirmed. |
| **ZAX-QLB-123** | Restrict trend implementation to OHLC trend, not macro data model. | 2–8 app assets; 1d/1w; 20–252 lookback; 2,000 bars/asset. | EWMAC targets/metrics only; macro vintages/carry/rates/holdout absent. |
| **ZAX-QLB-124** | Analyze current Coinbase book without execution simulation. | One Coinbase product; top five; receipt ≤10s; order 0.01/max 0.1 default. | BBO-constrained reference quotes/no plan; no queue/fill/PnL/validation. |
| **ZAX-QLB-125** | Run bounded chronology-aware forward-return classifier. | One symbol; lookback 10–60; horizon 1–20; ≥120 eligible; fold ≥60; score ≥30. | Direction/calibration diagnostic, not win probability or predictive approval. |

## 9. Alerts, automatic paper, background delivery, and notification state

### 9.1 Alert rule and scan contract

Alert scopes one market, one of eight frames, and one to three active strategies. Conditions: above, below, FVG, setup, scenario change/direction, confluence, and below-gate. New rule enabled with owner or market/kind name; 30-minute cooldown, direction one minute. Schema permits 100 rules, three IDs, nonnegative finite price, cooldown 1–10,080m; UI requires positive above/below price, points 0–100, count 1–3. Local rule becomes server scan input only after cloud save.

Above/below uses live quote; FVG uses closed bars; setup needs ready candidate. Scenario direction uses endpoint/anchor, 1bp flat band, baseline first observation, reseed and cooldown reversal. Confluence needs valid score, exact-version approval, named closed trigger, and no stale/pending evidence. Below-gate fires when configured points **or** count shortfall, separately reports entry gate. Score is not probability. Scans have 45s deadline and 12 attempted broker reads including bootstrap/auth, reuse cache/rotate priorities, and preserve deferral reason/count. Events retain owner scope/version/price/source/time/evidence and deduplicate by identity/unique insert/cooldown bucket.

Manual scan saves first and aborts on failure. Active app scans about every 60s with overlap suppression; server uses canonical cloud rules, never unsaved edits. Push tap fetches stored event, not trusted payload.

| ID | Current requirement / behavior | Bounds/defaults | Failure/authority behavior |
|---|---|---|---|
| **ZAX-ALR-140** | Author rule scope and predicate as locally editable workspace data. | 100 rules; 1–3 strategies; eight frames; cooldown 1–10,080m. | Canonical scan uses only explicitly cloud-saved rules. |
| **ZAX-ALR-141** | Evaluate price, setup, scenario, and confluence semantics conservatively. | Above/below positive UI price; points 0–100; count 1–3. | Baseline direction scan emits no event; below-gate is points **or** count shortfall. |
| **ZAX-ALR-142** | Bound source/broker work and retain deferral meaning. | 45s scan; 12 broker-read attempts. | Stale/unavailable/budget work is deferred/skipped, never invented. |
| **ZAX-ALR-143** | Persist owner event evidence and deduplicate. | Deterministic identity, unique insert, cooldown bucket. | Event is evidence record, not complete delivery proof or trade authority. |
| **ZAX-ALR-144** | Make foreground scanning canonical-save dependent. | Active-app about 60s; overlap suppressed. | Manual scan aborts on save fail; unsaved edits cannot silently drive server scan. |

### 9.2 Automatic paper consent and foreground runner

Automatic behavior creates only **paper** records. No LLM trigger, broker API call, generic fallback, or real-money execution is included. Consent is strict version 1, absent/off by default, and requires explicit arm. Risk is 1% or 2%; cap 1–3 entries/local day; expiry at most 24 hours. UI starts 1% and one entry and requires positive saved daily drawdown limit. Session consent scope is exact strategy/current market and `runWhenClosed:false`. ORB scope is exact strategy with NQ/ES or confirmed NAS100-CFD `TL:<digits>` instrument. Mode never remaps previous consent.

Runner requires canonical consent exactly matching local consent, current strategy/gate versions, and exact scope. Server rechecks owner, consent, source, complete supported evidence, current risk/drawdown/discipline, position/day cap, and performs relevant checks around awaited source work. Session accepts confirmed London/IB/PDC direction/config. ORB requires deterministic 1m closed-bar candidate, selected-market quote, and exact 3R/tick/band geometry. Durable signal claims/serialization defend concurrent duplicate placement. Failure is off, waiting, blocked, busy, duplicate, or placed status; only paper record can be written.

Root runners poll every 20 seconds only while owner/workspace ready, app active, document visible, and exact local/canonical consent/version match. ORB evaluates expiry explicitly. They suppress overlap and pause 60 seconds after mutation error with no retry. Turning off stops future eligible checks, but does not close open paper position or guarantee an already submitted lifecycle call is cancelled. A failed cloud confirmation can leave another device’s previous canonical arm intact, reinforcing canonical-state review.

### 9.3 Scheduled session monitoring and notification delivery

Session `runWhenClosed` is separately consented from publication/push. Arm/check requires production, owner task mapping, recent authenticated callback no older than three minutes, and canonical closed-app consent. ORB has **no** scheduled paper path. Production registration uses lock, rejects ambiguous mapping, verifies/creates once-per-minute `POST /api/scheduled/trading-scan` task, and saves task UID. Registration is not callback proof. Callback verifies signed platform cookie JWT, project/expiry/cron identity, task mapping, and approved owner; it never trusts schedule-body identity. It runs session auto check then alert scan under shared 45-second/12-broker-read budget and records heartbeat after completion. First callback cannot satisfy prior heartbeat needed to arm closed-app session paper.

Status distinguishes production, task mapping, recent completed heartbeat up to three minutes, registered device, and `deviceVerified:false`. Matching task ID/nonfuture heartbeat required. Task, heartbeat, token, or provider acceptance alone does not prove handset display. Outbox event begins pending; transactional conditional claim gives 20-second lease, up to three attempts and bounded lease recovery. Push targets at most ten owner devices and retains type preferences, hashed device IDs, tickets, and later receipts. Status can be `no-device`, pending, accepted, partial, rejected, error, or unknown. Provider acceptance is not receipt. Tap validates scope and loads stored owner event.

| ID | Current requirement / behavior | Bounds/defaults | Authority / verification boundary |
|---|---|---|---|
| **ZAX-ALR-145** | Require narrow explicit consent for automatic paper. | v1; 1%/2%; 1–3/day; ≤24h; session closed default false. | Exact scope/version/daily guard required; automation has paper-only authority. |
| **ZAX-ALR-146** | Run automatic paper only with fresh qualifying evidence and serialized claims. | Foreground poll 20s; mutation error pause 60s. | Off/waiting/blocked/busy/duplicate prevent or explain write; no broker/LLM fallback. |
| **ZAX-ALR-147** | Separate session closed-app consent from ORB and from push. | Production, task mapping, authenticated heartbeat ≤3m. | ORB remains foreground only; task registration cannot establish closed-app readiness. |
| **ZAX-ALR-148** | Authenticate scheduled callback before source/order work. | Once-per-minute task; shared 45s/12 reads. | Signed identity/project/cron/task/owner mismatch rejects; heartbeat follows completion. |
| **ZAX-ALR-149** | Track delivery state without claiming handset receipt. | 20s lease; up to 3 attempts; max 10 devices. | Token, task, callback, accepted push, or receipt state remains distinct from actual display proof. |

## 10. Data model and API contract reference

All listed private procedures require verified owner access in addition to UI gating. Client state is input only; it cannot override canonical owner rows, source provenance, revision checks, or server validation.

| Domain entity or surface | Authoritative behavior | Boundary |
|---|---|---|
| `Workspace` and envelope | Schema-v1 content plus cloud revision, dirty flag, acknowledged FNV digest. | Local cache is editable; cloud revision/CAS is authority. |
| Market/quote/candle/feed/timeframe | Provider/source, as-of/age, OHLCV, period/session metadata, cadence/status. | Read-only conditional facts; quote freshness cannot refresh history. |
| Strategy/factor/pattern/match and setup/confluence | Versioned rulebook/review, completed-bar evidence, candidate direction/checklist/gate. | Owner-scoped analysis; no broker/order authority. |
| `PaperProposal`, `Trade`, events/revisions | Proposal expiry, source/quote snapshot, risk/bracket, journal and lifecycle versions. | Canonical server lifecycle; local cache cannot replace row/event. |
| Protected source/version/job and preview | Encrypted metadata/original, source-version job, bounded preview, unapproved blueprint. | Owner scoped; no object locator; logical deletion is not physical erase. |
| Coach, forecast, layer, direct provider state | Local transcript, strict scenario display, historical/AI layer, isolated credential. | Owner routes; scenario-only credential; no direct paper mutation. |
| Alert/event/delivery and Quant request/result | Canonical saved rule/evidence/outbox; temporary research result. | Event is not display proof; Quant is research without durable archive/order bridge. |
| Release fingerprint | Schema-1 build-derived Zax identity. | Public identity endpoint never grants private action. |

| Action | Server validation | Success or refusal |
|---|---|---|
| Save workspace | Owner, schema, capacity, revision CAS. | Acknowledged revision or visible dirty/diverged/conflict state. |
| Upload or analyze source | Intake/encryption, owner/version, active-job and retry bounds. | Retained version/job or explicit invalid/duplicate/cancel/stale failure. |
| Analyze setup/gate | Closed bars, supported model, exact version/source/freshness. | Evidence/checklist or unknown/insufficient; never order. |
| Propose/create/manage paper | Non-sample, source/quote/valuation, geometry, risk, discipline, version. | Canonical simulation or typed blocker/conflict; never broker action. |
| Coach/scenario | Owner context, source mode, quota/deadline, strict draft validation. | Local reply/display layer or distinct error; no paper/confluence mutation. |
| Alert/automatic paper | Canonical save/consent/version/scope, budget/evidence/caps. | Event/outbox or paper-only record; defer/off/block/duplicate otherwise. |
| Quant run | Owner, family schema, data/symbol/frame/source limits. | Temporary provenance-bearing result or insufficient/unavailable/no plan. |

## 11. Security, error lifecycle, and non-functional behavior

Owner authorization is server verified and fail closed. Client gate, cache, local PIN, local background mask, secure-store session, preview state, and release fingerprint do not replace route-specific server checks. Retained sources are encrypted and owner scoped; DTOs omit storage locators. Direct scenario credential is separate owner-bound encrypted runtime state. Export omits secrets, auth, internal URIs, original bytes, and automatic-paper consent.

Local controls are privacy conveniences. Browser PIN needs WebCrypto/localStorage; native PIN is currently unavailable/off. Background masking does not establish screenshot prevention. Logical source deletion does not prove physical object erasure. Source provides no runtime security audit, key-custody, backup, device-compromise, or encryption-service assurance.

| ID | Current behavior | Unasserted quality target |
|---|---|---|
| **ZAX-NFR-160** | Owner procedures and gate fail closed. | Live owner auth across web/native. |
| **ZAX-NFR-161** | Encrypted sources, hidden locators, isolated direct key vault. | Runtime storage/key-management audit. |
| **ZAX-NFR-162** | Browser PBKDF2 local verifier/inactive overlay; no native adapter. | Native PIN, OS screenshot, compromised-device protection. |
| **ZAX-NFR-163** | Byte/page/pixel/read/deadline/quota/history bounds. | Production capacity, latency, uptime, throughput SLO. |

Error lifecycle stays typed: access failure locks private UI; stale/unavailable provider state retains provenance; incomplete derived period omits/refuses output; workspace conflict does not merge; failed source analysis preserves successful retained original; changed source requires reload/reanalysis. Coach/scenario separates source insufficiency, catalog/key/refusal/quota/transport/deadline/validation/UI-timeout cases. Alert preserves defer/budget/error meaning. Paper separates proposal/source/quote/valuation/geometry/gate/risk/discipline/version blockers. Quant distinguishes insufficient data from unavailable service and ready calculation from qualified performance.

## 12. Current-state acceptance cases

| Case | Given / when | Then |
|---|---|---|
| **AC-01 Access** | Caller is signed out, nonowner, or unverifiable and private tab renders. | Private children stay unmounted; sign-in/denial/locked state appears. |
| **AC-02 Sync** | Stale local revision saves after canonical change. | CAS rejects; neither side auto-merges or overwrites. |
| **AC-03 Market data** | Sample mode, stale quote, missing derivation constituent, or fewer than 55 bias bars. | No source-dependent analysis/proposal; quote remains distinct; aggregate omits/refuses; bias is Insufficient. |
| **AC-04 Gate/session** | Candidate is stale/wrong version/side/source/frame, or ORB/PDC lacks exact required evidence. | Eligibility/candidate blocks; candle cross cannot replace PDC quote pair; no alias/remap occurs. |
| **AC-05 Paper** | Strategy gate changed/noneligible, limit lacks observed side quote, or edit has obsolete version. | No trade, pending remains pending, or conflict prevents overwrite; practice record never claims gate pass. |
| **AC-06 Paper review** | Open quote is unavailable/stale/future or learning comparison has under 100/group. | Aggregate equity is Unknown; comparative learning remains withheld. |
| **AC-07 Library** | Job fails/cancels/stales or blueprint source version changed. | Successful retained original remains; no implicit acceptance; reload/reanalysis is required. |
| **AC-08 Screenshot** | Retained file exceeds decoded review limit. | Review fails visibly but retryable original remains if upload succeeded. |
| **AC-09 Scenario** | Current lacks fresh bars/matching quote, historical continuation missing, or direct connect fails. | Current blocks; Auto labels dated history; no historical layer is invented; saved key is not replaced. |
| **AC-10 Quant** | Family data/book fails count, alignment, or freshness constraints. | Insufficient/unavailable/no plan reports instead of synthetic data. |
| **AC-11 Alerts** | Rule unsaved or closed-app session lacks authenticated heartbeat. | Manual scan aborts on save fail; scheduled paper blocks before source/order work. |
| **AC-12 Delivery** | Push accepted without receipt or Preview recovers after production timeout. | Device remains unverified; publication remains unmet. |

## 13. Service, device, publication, and qualification blockers

Provider access is conditional: FMP needs entitlement, TradeLocker needs owner-authorized integration, and derived periods need complete source/calendar metadata. No universal feed/freshness, native NQ/ES feed, institutional depth, exchange-session truth, or execution-quality claim exists. NAS100 0.01 was a dated observation, not default.

Persistence and evidence paths depend on auth, database, private object storage, encryption configuration, OpenCV/vector/PDF workers, and service availability. Source jobs are finite in process; physical object cleanup remains pending; screenshot contracts mismatch; Quant history is temporary in-memory state. Managed AI had recorded terminal-unavailable Deep result. Direct OpenAI source implementation does not verify actual key/catalog/inference/phone transport.

Expo export/config is not a signed installed native app, device permission, picker/share/WebView/SecureStore proof, push enrollment, or handset receipt. Permanent publication is unconfirmed: deployment `68512095` timed out with `owner_unavailable` and the last recorded public root check on 19 October was `Cannot GET /`. Temporary 20 October API/Metro 200 is Preview/development recovery only. Documentation-time checks verified the existing source ZIP's baseline commit and all 683 source-file checksums against both its manifest and current source. That establishes source-backup parity only; it does not prove a remote checkpoint record, owner-data backup, native build, matching published binary, public release, or device behavior.

No source reference, AI display, model metric, paper outcome, historical rate, visual similarity, or alert validates predictive edge. Cost/fill/queue modeling, point-in-time data controls, robust holdouts, current coverage, execution evidence, and performance governance remain qualification needs. Any work toward edge claim is **proposed**, not delivered.

## 14. Source traceability

This document synthesizes the ten provided current-state module reports and inventory appendix at the stated source baseline. It does not require the reader to access internal report artifacts. The following source paths were identified by those reports as implementation traceability.

| Area | Representative implementation/source paths |
|---|---|
| Platform/workspace | `app/_layout.tsx`; `app/(tabs)/_layout.tsx`; `hooks/use-auth.ts`; `hooks/use-workspace.tsx`; `lib/trading/model.ts`; `lib/trading/workspace-sync.ts`; `server/trading/access.ts`; `server/trading/repository.ts`; `server/trading/workspace-tools.ts`; `drizzle/schema.ts` |
| Markets/chart | `app/(tabs)/index.tsx`; `app/(tabs)/markets.tsx`; `lib/trading/timeframes.ts`; `lib/trading/timeframe-bias.ts`; `lib/trading/freshness.ts`; `server/trading/market.ts`; `server/trading/bias-router.ts`; `server/trading/tradelocker.ts`; `components/trading/candle-chart.tsx` |
| Strategy/confluence | `app/(tabs)/strategies.tsx`; `lib/trading/setup-model.ts`; `lib/trading/setup-engine.ts`; `lib/trading/confluence-contract.ts`; `lib/trading/confluence-runtime.ts`; `server/trading/collections.ts`; `components/trading/confluence-editor.tsx` |
| Session rules | `lib/trading/orb-model.ts`; `lib/trading/orb-strategy.ts`; `lib/trading/session-range-strategies.ts`; `lib/trading/pdc-continuation.ts`; `server/trading/instrument-preparation.ts`; `server/trading/setup-service.ts` |
| Paper and journal | `server/trading/paper-service.ts`; `server/trading/paper-gate.ts`; `server/trading/setup-history.ts`; `lib/trading/paper-lifecycle.ts`; `lib/trading/trading-discipline.ts`; `components/trading/paper-plan-sheet.tsx`; `app/(tabs)/trades.tsx` |
| AI/scenarios | `app/coach.tsx`; `components/trading/ai-coach.tsx`; `components/trading/ai-forecast-panel.tsx`; `server/trading/coach-service.ts`; `server/trading/forecast-service.ts`; `server/trading/openai-scenario-client.ts`; `server/trading/scenario-provider-vault.ts`; `lib/trading/ai-forecast.ts` |
| Library/evidence | `app/(tabs)/library.tsx`; `server/trading/learning.ts`; `server/trading/library-blueprint.ts`; `server/trading/source-analysis-jobs.ts`; `server/trading/source-preview.ts`; `server/trading/trade-screenshot-service.ts`; `server/trading/vectors.ts` |
| Alerts/automation | `app/(tabs)/alerts.tsx`; `server/trading/notifications.ts`; `server/trading/session-auto-paper.ts`; `server/trading/orb-auto-paper.ts`; `server/trading/scheduled-scan-budget.ts`; `components/trading/foreground-alert-sync.tsx` |
| Quant Lab | `components/trading/quant-workbench.tsx`; `lib/trading/quant-pairs.ts`; `lib/trading/quant-momentum.ts`; `lib/trading/quant-making.ts`; `lib/trading/quant-macro.ts`; `lib/trading/quant-ml.ts`; `server/trading/quant-service.ts` |
| Delivery | `package.json`; `pnpm-lock.yaml`; `Dockerfile`; `app.config.ts`; `server/_core/index.ts`; `server/_core/web-app.ts`; `server/_core/trpc.ts`; `scripts/write-web-release.mjs`; `LATEST_FOUNDRY_UPDATE.md` |

The appendix below is deliberately raw inventory. It is retained exactly once for coverage/completeness and does not override source-grounded behavior, current dependency states, or verification gaps documented above.

# Appendix: Complete current feature-guide inventory

This is the 156-entry inventory authored in `lib/trading/feature-purpose-data.json` at source snapshot `8bea7ee2571645306b9b86e1ea1c8f3215b93b90`. Catalog statuses below are the guide's own labels, not proof of end-to-end operation. Current verified behavior, dependencies, corrections to older guide descriptions, and evidence levels are specified in the main document. An entry is a product surface or purpose, not a unique algorithm, a validated edge, or an independently passed test.

| ID | Area | Feature | Purpose | Catalog status |
|---|---|---|---|---|
| FEAT-001 | Chart, timeframe bias and market context | Selected market, feed status, quote and chart timeframe | Identify the current instrument/bar interval and distinguish quote freshness from historical candle data. | Data required |
| FEAT-002 | Chart, timeframe bias and market context | Candlestick canvas, inspection, navigation, details and renderer recovery | Inspect actual OHLC and navigate chart history without treating the display as an execution surface. | Device test required |
| FEAT-003 | Chart, timeframe bias and market context | Chart overlays and named price annotations | View FVG/CE, range ratios, provider-day levels, manual levels and setup zones in price context. | Data required |
| FEAT-004 | Chart, timeframe bias and market context | Optional session background boxes | Make regional time-of-day activity windows easy to see behind actual candles without turning them into trade signals. | Device test required |
| FEAT-005 | Chart, timeframe bias and market context | Closed-bar timeframe bias table | Answer whether completed bars on each interval meet a simple aligned trend rule, are mixed, or lack usable evidence. | Data required |
| FEAT-006 | Chart, timeframe bias and market context | Pinned historical profile, previous provider day and clocks | Show broad setup-analysis profile, prior provider-day high/low, session window and strategy/device clock context. | Data required |
| FEAT-007 | Chart, timeframe bias and market context | Economic calendar and COT context | Review dated macro schedules and reported positioning as context for the selected market. | Data required |
| FEAT-008 | Chart, timeframe bias and market context | Open context settings sheet | Make sample-data and strategy-clock assumptions explicit and provide deliberate workspace save/load actions. | Data required |
| FEAT-009 | Chart, timeframe bias and market context | Candle observations | Learn what the latest completed candle shape shows without treating morphology as an entry signal. | Data required |
| FEAT-010 | Chart, timeframe bias and market context | Reference picture / template | Compare an owner-reviewed original picture with the chart while preserving its original pixels and meaning. | Data required |
| FEAT-011 | Chart, timeframe bias and market context | Reference matching — geometry and reviewed-source AI | Retrieve candidate similarities to your reviewed references and expose what matched or is missing. | Data required |
| FEAT-012 | Chart, timeframe bias and market context | Manual confluence & overlays | Keep your own checklist confirmations separate from automatic source-bound setup evidence and chart visibility. | Data required |
| FEAT-013 | Markets and live source selection | Feed/account status | Check whether authorized private TradeLocker instruments are accessible and what source path is available before looking at quotes. | Data required |
| FEAT-014 | Markets and live source selection | Account sign-in, refresh, sign-out | Identify the signed-in Manus identity and establish or refresh the session needed for private source access. | Device test required |
| FEAT-015 | Markets and live source selection | Feed switcher, search, category filters | Narrow the instrument universe to a provider/feed and instrument class, then find a symbol by identifier or name. | Data required |
| FEAT-016 | Markets and live source selection | Instrument quote/source/age list and pagination | Assess whether a source returned an instrument quote, what source supplied it, and how old its timestamp is. | Data required |
| FEAT-017 | Markets and live source selection | Favorite toggle | Mark instruments for later review. | Device test required |
| FEAT-018 | Markets and live source selection | Quick price-watch bell | Stage an above-price watch for an instrument without first leaving Markets. | Data required |
| FEAT-019 | Markets and live source selection | Select instrument / Chart handoff | Choose the active market for subsequent chart/workbench review. | Data required |
| FEAT-020 | Markets and live source selection | Market-data/timeframe boundaries | Understand which quote/history data and derived timeframes can support downstream chart analysis. | Data required |
| FEAT-021 | Strategies, attached indicators, confluence gates, and Quant Lab | Search saved strategies and source references | Find a rulebook/style by name or description without scrolling the full library. | Device test required |
| FEAT-022 | Strategies, attached indicators, confluence gates, and Quant Lab | Photo-based search in My Library | Find an existing library item from the separate library workflow. | Device test required |
| FEAT-023 | Strategies, attached indicators, confluence gates, and Quant Lab | Reviewed style source-reference catalog | Add inspectable reference rulebooks instead of treating a source style as an already-proven personal system. | Device test required |
| FEAT-024 | Strategies, attached indicators, confluence gates, and Quant Lab | Create or edit personal strategy rules | Record a trader's own strategy scope and checklist rules as reviewable factors. | Device test required |
| FEAT-025 | Strategies, attached indicators, confluence gates, and Quant Lab | Apply strategy to chart | Choose which saved source rulebook informs chart analysis. | Device test required |
| FEAT-026 | Strategies, attached indicators, confluence gates, and Quant Lab | Independent strategy overlay visibility | Show or hide indicator layers without changing which strategy is active for analysis. | Device test required |
| FEAT-027 | Strategies, attached indicators, confluence gates, and Quant Lab | Duplicate source reference as personal strategy | Customize a read-only source reference while preserving the original. | Device test required |
| FEAT-028 | Strategies, attached indicators, confluence gates, and Quant Lab | Factor enable/weight controls | Maintain a personal checklist and its relative application weights. | Device test required |
| FEAT-029 | Strategies, attached indicators, confluence gates, and Quant Lab | Review-only weight refinement | Ask whether retained outcomes for this exact strategy version suggest a factor-weight change. | Device test required |
| FEAT-030 | Strategies, attached indicators, confluence gates, and Quant Lab | Version review and rollback | Inspect prior personal strategy snapshots and restore an earlier ruleset without erasing history. | Device test required |
| FEAT-031 | Strategies, attached indicators, confluence gates, and Quant Lab | Archive strategy profile | Retire a personal profile from active library/chart use while preserving its record. | Device test required |
| FEAT-032 | Strategies, attached indicators, confluence gates, and Quant Lab | Original WR1 risk disclaimers | Review the bundled original-source disclaimer text. | Device test required |
| FEAT-033 | Strategies, attached indicators, confluence gates, and Quant Lab | Native closed-bar setup analysis | Ask whether a supported source setup's ordered conditions are present on completed OHLC bars. | Data required |
| FEAT-034 | Strategies, attached indicators, confluence gates, and Quant Lab | Strategy-attached chart indicators | See the numerical lines associated with the visible selected strategies. | Device test required |
| FEAT-035 | Strategies, attached indicators, confluence gates, and Quant Lab | Configure and approve sourced confluence gate | Answer whether a specific same-version candidate's explicit native closed-bar trigger and weighted conditions meet a review threshold. | Data required |
| FEAT-036 | Strategies, attached indicators, confluence gates, and Quant Lab | AI Coach and workspace cloud save | Ask for an explanation or persist the current Strategies workspace using existing app routes/actions. | Device test required |
| FEAT-037 | Strategies, attached indicators, confluence gates, and Quant Lab | ORB Strategy from uploaded video | Apply a separate source-attributed opening-range strategy with exact video timing and owner-approved causal confirmation/stop rules. | Data required |
| FEAT-038 | Strategies, attached indicators, confluence gates, and Quant Lab | London Breakout AI-assisted source | Detect a complete Asian-range 15m closed breakout with source stop/TP choices. | Data required |
| FEAT-039 | Strategies, attached indicators, confluence gates, and Quant Lab | Initial Balance AI-assisted source | Detect the exact first-hour range then a 15m/30m closed break using the explicitly selected volume basis. | Data required |
| FEAT-040 | Strategies, attached indicators, confluence gates, and Quant Lab | Red-to-Green / Green-to-Red AI-assisted source | Detect an observed same-source PDC quote cross with actual opening, selected relative-volume basis and complete morning risk. | Data required |
| FEAT-041 | Pattern/style Library upload and structured learning | Browse and search personal patterns/styles | Find an existing personal pattern reference or trading-style definition to review or use in a separate strategy workflow. | Data required |
| FEAT-042 | Pattern/style Library upload and structured learning | Upload a pattern/style source or save a manual definition | Create a personal reference from a chart picture or written source, or record a definition without sending a file for AI extraction. | Data required |
| FEAT-043 | Pattern/style Library upload and structured learning | Trainer: edit rules, label feedback, inspect source and versions | Resolve what a reference actually says, record positive/negative/correction feedback, and track the authoritative source revision. | Data required |
| FEAT-044 | Pattern/style Library upload and structured learning | Library AI structured blueprint and source-specific Coach handoff | Answer what trigger, confluences, indicators, entry/invalidation/targets/risk, required data, and ambiguities the uploaded source specifies. | Data required |
| FEAT-045 | Pattern/style Library upload and structured learning | Accept reviewed pattern/style or save an inactive AI review style | Explicitly convert a human-reviewed definition into a ready pattern reference or separate style proposal. | Data required |
| FEAT-046 | Pattern/style Library upload and structured learning | Photo-based personal-library retrieval and image re-indexing | Find saved references whose extracted terms resemble an owner-supplied chart image, or rebuild a stored image descriptor. | Data required |
| FEAT-047 | Pattern/style Library upload and structured learning | Pattern & style reference catalog | Look up definitions/prerequisites and add a review-only reference without an uploaded image. | Data required |
| FEAT-048 | Pattern/style Library upload and structured learning | Historical CSV/JSON descriptive statistics and nearest-shape study | Describe a supplied OHLC series and compare its latest 12-bar shape with older non-overlapping shapes and their subsequent outcomes, not issue a live signal. | Data required |
| FEAT-049 | Pattern/style Library upload and structured learning | Research laboratory: MA/FVG walk-forward baselines and analyst discussion | Run a simple historical baseline experiment over imported series, or request a separate role-based analyst discussion from the selected server feed. | Data required |
| FEAT-050 | Pattern/style Library upload and structured learning | Offline order-book label-classification experiment | Run a bounded offline classification experiment only when the owner has authorized real top-three depth snapshots. | Data required |
| FEAT-051 | Trade screenshot evidence and retained review | Expand/collapse screenshot review | Open or hide the private screenshot coaching workflow without changing trade data. | Data required |
| FEAT-052 | Trade screenshot evidence and retained review | Retained screenshot inventory and reopen | Find previously retained evidence and continue reviewing it without uploading a duplicate. | Data required |
| FEAT-053 | Trade screenshot evidence and retained review | Stage selector and optional trade linkage | Capture whether the image represents before/during/after a trade (or unknown), and optionally associate it with an existing paper trade. | Data required |
| FEAT-054 | Trade screenshot evidence and retained review | Owner-entered capture/trade time and timezone | Preserve timing context the trader knows when the screenshot itself lacks a legible timestamp. | Data required |
| FEAT-055 | Trade screenshot evidence and retained review | Choose screenshot | Select a private image source for evidence retention and review. | Data required |
| FEAT-056 | Trade screenshot evidence and retained review | Upload & analyze / retry analysis | Retain the original privately and request a structured, bounded coaching review; retry a retained original if analysis is unavailable or fails. | Data required |
| FEAT-057 | Trade screenshot evidence and retained review | Review draft and evidence output | Separate visible facts from uncertainty and surface process/documentation observations without treating a screenshot as a signal or proof of results. | Data required |
| FEAT-058 | Trade screenshot evidence and retained review | Confirm & retain review | Deliberately retain an approved coaching review as a protected source revision. | Data required |
| FEAT-059 | Recent analogue scenario | Recent analogue scenario — show/hide overlay | Answer what a similar prior 12-closed-bar price shape did over its next 12 bars; this is an analogue, not a forecast or trade signal. | Data required |
| FEAT-060 | Recent analogue scenario | Replay display style — Line / Ghost OHLC / Both | Choose the visual form of the same replay without changing its source or calculations. | Data required |
| FEAT-061 | Recent analogue scenario | Notify me when scenario direction flips — watch rule | Create or re-enable a locally scoped watch rule for a direction change on the selected market, timeframe and strategy IDs. | Data required |
| FEAT-062 | Recent analogue scenario | Show captured alert candles and scenario — route-specific evidence toggle | Inspect the setup/candles captured with a triggered alert; this is not a newly computed historical replay. | Data required |
| FEAT-063 | Recent analogue scenario | Recent analogue outcome profile — adjacent conditional-history readout | Show whether enough qualified compatible setup outcomes exist for a descriptive target-before-stop fraction. This is separate from context replay, which does not require a ready setup. | Data required |
| FEAT-064 | AI scenario | Forecast panel disclosure | Open or collapse the conditional scenario tool and see whether a scenario is available. | Qualification required |
| FEAT-065 | AI scenario | Optional scenario question | Let the trader state a conditional question to guide the AI scenario discussion. | Qualification required |
| FEAT-066 | AI scenario | Generate / regenerate scenario | Create and compare independently selected source-timeframe AI hypotheses while preserving their connected line/ghost appearance. | Qualification required |
| FEAT-067 | AI scenario | Show AI forecast toggle | Compare separately labelled AI hypotheses from different source timeframes on the charts you choose while keeping the connected line/ghost look. | Qualification required |
| FEAT-068 | AI scenario | Line / candles / both style buttons | Choose the representation of the same scenario, not change its values. | Qualification required |
| FEAT-069 | AI scenario | Scenario detail and chart readout | Compare separately labelled AI hypotheses from different source timeframes on the charts you choose while keeping the connected line/ghost look. | Qualification required |
| FEAT-070 | AI scenario | Remove forecast | Clear the current generated scenario from panel/chart state. | Qualification required |
| FEAT-071 | Built-in AI trading coach | Owner-only Trading Coach route and Back navigation | Open a private learning conversation for educational paper-trading questions, not live execution. | Device test required |
| FEAT-072 | Built-in AI trading coach | Coach availability status and Retry context | Show whether a live model catalog check reports the coach as available and provide a way to retry a failed status check. | Device test required |
| FEAT-073 | Built-in AI trading coach | Coach Details disclosure | Let the user inspect server-reported context and capability metadata instead of relying only on a compact readiness label. | Device test required |
| FEAT-074 | Built-in AI trading coach | Learning Prompts | Offer prepared questions for common learning problems: strategy explanation, confluence, comparing pairs, and trading discipline. | Device test required |
| FEAT-075 | Built-in AI trading coach | Question composer and Send | Ask a free-form educational trading question and, when available, get a grounded response. | Device test required |
| FEAT-076 | Built-in AI trading coach | Retry failed coach question | Recover from a timeout or failed request without retyping the question. | Device test required |
| FEAT-077 | Built-in AI trading coach | Clear private conversation | Remove the current local coach transcript and reset the visible session. | Device test required |
| FEAT-078 | Built-in AI trading coach | Selected-library-source coach scope | Ask about a protected library record while keeping its source ID separate from private file/image bytes. | Device test required |
| FEAT-079 | Paper lifecycle | Request or retry a paper proposal | Ask whether a chart-side Buy/Sell paper plan can be formed using current server quote and setup evidence; no local synthetic fallback is created. | Device test required |
| FEAT-080 | Paper lifecycle | Manual practice or gated strategy mode | Choose discretionary paper practice versus a strategy entry that is required to pass approved, fresh, same-direction confluence rules. | Device test required |
| FEAT-081 | Paper lifecycle | Discipline panel and risk templates | Review discipline context and choose percentage-risk sizing or fixed units before shaping the order. | Device test required |
| FEAT-082 | Paper lifecycle | Ticket: entry, stop, target/R:R and quantity | Answer what exact simulated bracket and size should be recorded, and whether it has valid directional geometry and positive risk/reward. | Device test required |
| FEAT-083 | Paper lifecycle | Restore server bracket and selected risk | Discard local ticket edits and return to the immutable proposal defaults. | Device test required |
| FEAT-084 | Paper lifecycle | Optional pre-trade thoughts | Record the trader's own reasoning before the simulated trade. | Device test required |
| FEAT-085 | Paper lifecycle | Advanced order style and paper bracket management | Choose immediate simulated market-style entry or observed pending limit entry and explicitly opt into automated simulated bracket handling. | Device test required |
| FEAT-086 | Paper lifecycle | Confirm paper order | Create a durable, owner-scoped simulated trade after the plan and server checks pass. | Device test required |
| FEAT-087 | Paper lifecycle | Pending/open/closed trade lifecycle, edit, review and close | Track a pending limit through observed entry, manage an open simulated position, or preserve a closed-trade review without changing the historical fill. | Device test required |
| FEAT-088 | Paper lifecycle | Optional automatic ORB paper entries | Place simulated source-gated ORB brackets when the owner deliberately arms bounded foreground automation. | Data required |
| FEAT-089 | Paper lifecycle | Optional automatic session paper entries | Create one canonical source-bracket simulated trade per event under deliberate bounded consent. | Data required |
| FEAT-090 | Trade journal, deep dive and performance review | Paper balance and performance summary | Answer what recorded paper balance, open exposure and paper outcomes currently show—not how a brokerage account is performing. | Device test required |
| FEAT-091 | Trade journal, deep dive and performance review | Optional paper daily drawdown cap | Set a paper-workflow guardrail for a maximum daily realized drawdown percentage. | Device test required |
| FEAT-092 | Trade journal, deep dive and performance review | Pending, open and closed trade lists/cards | Find plans and paper positions by status, inspect key trade fields, and navigate to chart or simulated close/review actions. | Device test required |
| FEAT-093 | Trade journal, deep dive and performance review | Trade deep dive, pre-trade journal and post-trade review | Compare the original plan/journal with the recorded outcome and capture a human post-trade note; optionally request an AI review of a closed record. | Device test required |
| FEAT-094 | Trade journal, deep dive and performance review | Full retained paper history and pagination | Find durable paper records beyond the current workspace list and inspect older pages. | Device test required |
| FEAT-095 | Trade journal, deep dive and performance review | Retained paper detail, bracket/review revisions and close | Inspect original risk and current paper state, trace record events/revisions, and optionally amend paper bracket/review or exit a paper position. | Device test required |
| FEAT-096 | Trading foundations and revenge-trading safeguards | Trading foundations lessons and coach handoff | Short process-first education for risk planning, triggers versus confluence, costs, uncertainty, post-loss behavior, and honest review—problems that can lead to impulsive or poorly evidenced trading. | Device test required |
| FEAT-097 | Trading foundations and revenge-trading safeguards | Discipline check / revenge-trading safeguards | Help a trader notice recorded patterns that may warrant slowing down—recent realized losses, a loss streak, high daily closed-trade count, or unusually elevated proposed risk—without diagnosing intent or recommending a trade. | Device test required |
| FEAT-098 | Trading foundations and revenge-trading safeguards | Optional personal post-loss pause | Give the owner an operational boundary stronger than an advisory: after a canonical realized paper loss, the paper server can reject a new paper order while the configured pause window is active. | Device test required |
| FEAT-099 | Trading foundations and revenge-trading safeguards | Learning review from paper records | Let a trader inspect descriptive outcomes across confluence-score buckets and see whether enough closed outcomes and point-in-time entry snapshots exist for a human review. | Device test required |
| FEAT-100 | Trade/confluence/scenario alerts and delivery | Create a rule and choose scope | Define which market, timeframe, strategy, and kind of signal should be watched. | Deployment required |
| FEAT-101 | Trade/confluence/scenario alerts and delivery | Price above / below | Answer whether a live quote has reached or crossed a chosen level. | Deployment required |
| FEAT-102 | Trade/confluence/scenario alerts and delivery | FVG event | Watch for a recent deterministic fair-value-gap candidate in candle history. | Deployment required |
| FEAT-103 | Trade/confluence/scenario alerts and delivery | Ready setup alert | Ask whether current analysis contains at least one ready setup candidate. | Deployment required |
| FEAT-104 | Trade/confluence/scenario alerts and delivery | Scenario shape update | Notify when a historical-source scenario appears, disappears, changes side, or materially changes normalized path shape. | Deployment required |
| FEAT-105 | Trade/confluence/scenario alerts and delivery | Historical scenario direction flip | Ask whether the drawn historical line/ghost endpoint reversed up/down relative to its anchor. | Deployment required |
| FEAT-106 | Trade/confluence/scenario alerts and delivery | Weighted confluence alert | Ask whether an approved named trigger fired on sourced closed-bar evidence and enough weighted conditions met an alert threshold. | Deployment required |
| FEAT-107 | Trade/confluence/scenario alerts and delivery | Below-entry-gate warning | Warn when an approved sourced trigger fires while weighted score is below the configured entry gate. | Deployment required |
| FEAT-108 | Trade/confluence/scenario alerts and delivery | Enable or remove a rule | Manage whether a configured alert remains watched. | Deployment required |
| FEAT-109 | Trade/confluence/scenario alerts and delivery | Save rules to cloud | Persist owner workspace as the canonical server-side rule set. | Deployment required |
| FEAT-110 | Trade/confluence/scenario alerts and delivery | Test foreground scan | Check what currently saved cloud rules produce in one bounded scan. | Deployment required |
| FEAT-111 | Trade/confluence/scenario alerts and delivery | Automatic foreground scan | Poll server-side saved rules while the app is active. | Deployment required |
| FEAT-112 | Trade/confluence/scenario alerts and delivery | Mobile push enrollment and schedule activation | Enroll an iOS/Android device and schedule scans while the app is closed. | Deployment required |
| FEAT-113 | Trade/confluence/scenario alerts and delivery | Alert history and open event | Review events actually emitted and return to their market context. | Deployment required |
| FEAT-114 | Trade/confluence/scenario alerts and delivery | Published session monitoring and setup alerts | Monitor enabled source watches from the private published backend and expose actual callback/device states. | Deployment required |
| FEAT-115 | Quant pairs relative-value model | Two-asset and timeframe selection / source-quality gate | Answer whether two explicit price series have enough trustworthy, same-time observations for a pair calculation; the model does not discover assets or build a basket. | Qualification required |
| FEAT-116 | Quant pairs relative-value model | Pairs parameters / assumptions | Let the trader specify spread entry/exit thresholds, fit window, holding duration, generic costs, research equity scale, and left-leg quantity scale for the calculation and replay. | Qualification required |
| FEAT-117 | Quant pairs relative-value model | Rolling OLS spread and hedge diagnostics | Answer how far the latest matched-bar residual is from its recent fitted relationship and whether the estimated hedge ratio is changing between adjacent windows. | Qualification required |
| FEAT-118 | Quant pairs relative-value model | Engle–Granger residual-ADF diagnostic and rolling warning | Assess the specific null of no cointegration for the current price window and show whether a prior equal-size rejection is lost in the current window. | Qualification required |
| FEAT-119 | Quant pairs relative-value model | Lagged two-leg exploratory replay and equity path | Show a cost-assumption-based historical out-of-sample calculation of what the rules would have done after a training segment, rather than an executable or validated strategy. | Qualification required |
| FEAT-120 | Quant pairs relative-value model | Current two-leg candidate signals and paper-plan output | Expose a research-only candidate when a closed-bar spread threshold, current cointegration rejection, and no flagged loss-of-rejection all align; preserve the paired nature rather than suggesting a standalone leg. | Qualification required |
| FEAT-121 | Quant selected-universe momentum model | Fixed-universe data input | Compare a small, fixed set of assets on the same bar horizon; answer which supplied assets lead or lag without inventing missing prices. | Qualification required |
| FEAT-122 | Quant selected-universe momentum model | Momentum lookback parameter | Set the trailing bar horizon for momentum and realized-volatility calculations. | Qualification required |
| FEAT-123 | Quant selected-universe momentum model | Holding/rebalance cadence | Set how often the hypothetical target weights are recalculated, addressing rebalance frequency and turnover. | Qualification required |
| FEAT-124 | Quant selected-universe momentum model | Starting equity and fee/slippage assumptions | Estimate a hypothetical equity path using an explicit capital base and user-supplied turnover costs. | Qualification required |
| FEAT-125 | Quant selected-universe momentum model | Latest ranks and signals | Answer which supplied assets are strongest/weakest under the rule and which have a nonzero hypothetical long/short target. | Qualification required |
| FEAT-126 | Quant selected-universe momentum model | Exploratory portfolio/equity output | Answer what the simplified rule's historical close-to-close path and turnover costs calculate to on the supplied data. | Qualification required |
| FEAT-127 | Quant selected-universe momentum model | Paper allocation preview | Show approximate quantities corresponding to the latest selected target weights and hypothetical ending equity. | Qualification required |
| FEAT-128 | Quant selected-universe momentum model | Validation/status/limitations diagnostics | Clarify whether an output is merely calculable or empirically validated, and identify prerequisites for stronger claims. | Qualification required |
| FEAT-129 | Quant venue quote and inventory model | Venue L2 snapshot | Answer whether there is usable single-venue depth and identify the current top levels plus the venue's price/size increments. | Operational |
| FEAT-130 | Quant venue quote and inventory model | Fee and slippage assumptions / cost gate | Answer whether the displayed spread exceeds estimated two-sided fee and slippage costs. | Qualification required |
| FEAT-131 | Quant venue quote and inventory model | Inventory-aware quote center and size controls | Answer how the supplied signed inventory should shift the quote center and how much size is available on each side under a cap. | Qualification required |
| FEAT-132 | Quant venue quote and inventory model | Top-five depth metrics and passive paper quote targets | Answer what passive tick-grid bid/ask prices this simple rule would write down from the supplied snapshot. | Qualification required |
| FEAT-133 | Quant venue quote and inventory model | Current-book-only scope — no candle backtest | Make clear why this venue-quote model uses an actual book, not a candle history or OHLC import. | Qualification required |
| FEAT-134 | Quant venue quote and inventory model | Validation and no-plan/insufficient status | Answer whether the result is merely calculable or whether performance has actually been validated. | Qualification required |
| FEAT-135 | Quant systematic trend / macro | Asset OHLC histories and alignment | Assess slow trend direction across a small set of aligned markets using real, sourced, completed OHLC data. | Qualification required |
| FEAT-136 | Quant systematic trend / macro | Trend lookback control | Set the slow close-to-close horizon used to determine trend direction. | Qualification required |
| FEAT-137 | Quant systematic trend / macro | Inverse-volatility directional targets | Translate trend sign and relative realized volatility into long, short, or zero-weight research targets. | Qualification required |
| FEAT-138 | Quant systematic trend / macro | Historical equity and user cost inputs | Calculate how the delayed target-weight rule evolves over supplied close-to-close history after explicitly entered costs. | Qualification required |
| FEAT-139 | Quant systematic trend / macro | Metrics, provenance, and validation reporting | Show what data and assumptions were used, what the calculation produced, and whether independent evidence exists. | Qualification required |
| FEAT-140 | Quant systematic trend / macro | Macro release/vintage and rate-differential model | State the current boundary for questions about point-in-time economic releases, revisions, expectations, or policy/sovereign-rate differentials. | Data required |
| FEAT-141 | Quant forward-return classification model | Historical OHLC intake and quality checks | Test one selected market/timeframe series while filtering malformed/open/future records and showing data-quality exclusions. | Qualification required |
| FEAT-142 | Quant forward-return classification model | ML parameter settings | Control feature lookback, outcome horizon, modeled fees/slippage and optional hypothetical holdout equity starting amount. | Qualification required |
| FEAT-143 | Quant forward-return classification model | Costed forward-return labels and bounded classifier | Evaluate whether lagged OHLC features distinguish which side has positive modeled net return over the selected observation horizon. | Qualification required |
| FEAT-144 | Quant forward-return classification model | Chronological walk-forward and untouched-holdout diagnostics | Provide chronology-aware direction-accuracy diagnostics rather than relying only on in-sample fit. | Qualification required |
| FEAT-145 | Quant forward-return classification model | Latest per-series research direction | Show the final fitted model's direction for the latest closed OHLC-derived feature vector per series. | Qualification required |
| FEAT-146 | Quant forward-return classification model | Optional modeled holdout equity path | Show a hypothetical compounded path for non-overlapping model-predicted holdout outcomes using user starting equity and modeled net returns. | Qualification required |
| FEAT-147 | Private workspace and reliability tools | Automatic sync and conflict recovery | Preserve owner edits across reconnects without silently overwriting another revision. | Operational |
| FEAT-148 | Private workspace and reliability tools | Encrypted original preview and PDF evidence | Compare inferred rules against the authoritative retained file. | Operational |
| FEAT-149 | Private workspace and reliability tools | Durable source analysis and retry | Avoid losing an original because a long scan timed out or the phone closed. | Operational |
| FEAT-150 | Private workspace and reliability tools | Archive capacity and dependency-confirmed delete | Retire strategies without filling the active cap, and delete only after reviewing links. | Operational |
| FEAT-151 | Private workspace and reliability tools | Private ZIP/CSV/JSON import and export | Keep a portable owner copy of settings, rules, journal and structured paper data. | Operational |
| FEAT-152 | Private workspace and reliability tools | Personal AI request limits and countdown | Make overload protection predictable instead of appearing broken. | Operational |
| FEAT-153 | Private workspace and reliability tools | Optional local PIN and background privacy | Mask an already-authenticated workspace when leaving the app. | Device test required |
| FEAT-154 | Private workspace and reliability tools | Visual quantitative rule drafts | Research a transparent condition/allocation graph instead of arbitrary code. | Operational |
| FEAT-155 | Private workspace and reliability tools | Clock selection and explicit personal guards | Separate regional time context from enforced versus advisory discipline. | Device test required |
| FEAT-156 | Private workspace and reliability tools | Per-position server-processing evidence | Distinguish active-app observation from actual scheduled bracket management. | Deployment required |
