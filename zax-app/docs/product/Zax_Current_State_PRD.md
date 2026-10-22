# Zax Current-State Product Requirements Document

**Document type:** As-built current-state PRD  
**Snapshot:** 2026-10-20  
**Source baseline:** `8bea7ee2571645306b9b86e1ea1c8f3215b93b90`  
**Product boundary:** Private, **owner-only**, **paper-only** trading analysis, education, research, and simulated-trade workspace.  
**Status convention:** This document describes behavior found in source reports. It is **not** a production-release certificate, a performance study, a device test report, or a roadmap commitment.

## Table of contents

- [1. Document control and evidence taxonomy](#1-document-control-and-evidence-taxonomy)
- [2. Executive summary](#2-executive-summary)
- [3. Problem, goals, and non-goals](#3-problem-goals-and-non-goals)
- [4. Product positioning and actual scope](#4-product-positioning-and-actual-scope)
- [5. Owner persona and principal use cases](#5-owner-persona-and-principal-use-cases)
- [6. Information architecture and authority model](#6-information-architecture-and-authority-model)
- [7. End-to-end user journeys](#7-end-to-end-user-journeys)
- [8. Module scope and current-readiness matrix](#8-module-scope-and-current-readiness-matrix)
- [9. Product policies](#9-product-policies)
- [10. Qualitative acceptance and observability](#10-qualitative-acceptance-and-observability)
- [11. Dependencies and constraints](#11-dependencies-and-constraints)
- [12. Proposed readiness sequence and gap register](#12-proposed-readiness-sequence-and-gap-register)
- [13. Verification, deployment, and native limitations](#13-verification-deployment-and-native-limitations)
- [14. Source traceability](#14-source-traceability)

## 1. Document control and evidence taxonomy

Zax is the current visible product name for an application that retains **StratDesk** compatibility names in selected storage keys, file names, and older copy. Those legacy names do not create a second product. This PRD synthesizes ten source-grounded module reports at the stated commit. It deliberately distinguishes implemented source behavior from conditions that need live services, owner setup, qualification, deployment, or a physical device.

| Evidence class | Meaning in this PRD | What it does **not** establish |
|---|---|---|
| **Implemented source behavior** | A code path, schema, validation rule, user interface, or server contract was documented in the module reports. | That the path was executed in this task, is configured for the owner, or works on a device. |
| **Recorded prior evidence** | A dated handoff records an earlier check, diagnostic, source export, test milestone, or temporary service observation. | Current behavior at this HEAD unless separately demonstrated. |
| **External dependency** | A provider, entitlement, schedule, database, object store, model service, browser capability, or OS feature is required. | Availability, freshness, service level, or successful owner use. |
| **Qualification target** | A boundary such as sufficient samples, source completeness, human review, or rigorous validation is deliberately required before a stronger conclusion. | A validated edge, prediction, calibrated probability, or execution quality. |
| **Unverified outcome** | A real deployment, signed native build, device receipt, direct inference, owner record, or live provider outcome was not proven by the source review. | A negative claim about all future deployments; it remains a verification gap. |

The 156 raw catalog entries have Data, Device, Qualification, Deployment, or Operational labels. These are inventory metadata, not test results, availability assertions, or release approval; the count **does not mean 156 distinct functioning algorithms**.

## 2. Executive summary

Zax is a single-owner workbench for sourced market review, personal rulebooks/references, documented paper plans, simulated-outcome review, and bounded research. It integrates charts/markets, strategy and confluence configuration, five Quant Lab families, Library evidence, educational AI, alerting, and paper controls. It prefers provenance, explicit unknowns, owner consent, deterministic gates, and conservative failure behavior over silent inference.

The product is intentionally **not** a brokerage terminal. No feature submits a real-money order or modifies a brokerage position. A chart setup, weighted confluence score, historical analogue, catalog record, model output, or AI scenario is not proof of predictive edge or a recommendation. Paper records are simulations with explicit source, price, timing, sizing, and evidence limitations. Observed bid/ask-side prices can reflect quoted spread, but they do not establish actual broker fills, fees, slippage, margin, latency or execution guarantees. Particular research calculations may separately accept simplified cost assumptions.

The core current-state strength is a coherent analysis-to-paper workflow. Owner authorization is verified server-side and fails closed. Historical candles, quotes, derived timeframes, provider context, strategy evidence, source files, canonical paper records, alerts, and service states retain defined provenance or visible unavailable states. The app can preserve local edits, create an explicitly initialized cloud copy, protect canonical owner records, detect conflicts rather than merge them silently, and bound uploads, analysis jobs, model requests, and automated paper consent.

The core current-state limitation is that source implementation is ahead of operational proof. Permanent publication is not established: a corrected production deployment timed out with `owner_unavailable`, and the last recorded public root result on 19 October was `Cannot GET /`. Temporary Metro/API recovery with HTTP 200 on 20 October is a development/Preview recovery, not production success. Signed native builds, installed-device behavior, push receipt, owner live-provider coverage, managed Coach completion, direct OpenAI inference, and reliable closed-app processing are similarly unverified. The historical record of **851 passed, 0 failed, and 1 pre-existing authentication integration skip** preceded a production fix; eight later focused route/security tests are separate evidence and must not be added to or presented as a full suite at this HEAD.

## 3. Problem, goals, and non-goals

### Problem statement

A disciplined independent trader needs one private place to examine source-labelled market context, preserve rule provenance, distinguish a hypothesis from a fact, write a simulated plan with defensible geometry, and learn from recorded practice without allowing convenience features to imply certainty or execution authority. Fragmented charts, notes, screenshots, strategies, and paper records make it easy to lose source context, overwrite decisions, mistake a current quote for completed history, or conflate a visual signal with validated performance.

### Current-state goals

| Goal | Current product intent |
|---|---|
| **G-01: Maintain a private owner workspace** | Restrict private routes and actions to one configured owner through server-verified authorization, while supporting local state and explicit canonical synchronization. |
| **G-02: Preserve provenance and uncertainty** | Label quote versus candle sources, timestamps, freshness, sample data, source versions, provider limits, and unavailable states rather than manufacture data. |
| **G-03: Make rulebooks inspectable** | Store personal and source-reference strategies separately, version changes, attach only supported completed-bar logic, and preserve manual/discretionary content as such. |
| **G-04: Support deliberate paper practice** | Convert qualified chart evidence into owner-scoped simulated proposals and lifecycle records with repeat server checks, not real orders. |
| **G-05: Enable bounded learning and research** | Offer source review, historical studies, educational Coach requests, and transparent quantitative calculations while keeping outputs descriptive or hypothetical. |
| **G-06: Fail closed where authority, data, or consent is missing** | Block or disclose missing data, stale evidence, invalid geometry, changed version, absent consent, or unavailable service instead of guessing. |

### Non-goals and prohibited interpretations

Zax does not provide guest, team, household, or public workspaces. It does not provide brokerage-money execution, brokerage account control, fill guarantees, institutional market depth, queue position, or a validated trading edge. It does not assert a probability of success from a confluence score, historical hit rate, classifier metric, scenario, or visual similarity. AI is neither autonomous strategy retraining nor an order authority. The product does not certify a source reference as executable, legal to reproduce, profitable, or complete.

Zax does not currently establish permanent publication, physical source-object erasure, native PIN availability, OS-level screenshot prevention, closed-app reliability, push display, or a signed native release. A source archive, source commit, Preview, health response, static export, catalog check, or acceptance fixture is not a substitute for those outcomes.

## 4. Product positioning and actual scope

Zax is positioned as a **private analysis and paper-practice system**. It sits between a personal trading journal and a research workbench: markets and charts supply bounded source context; strategies convert owner-authored or source-attributed rulebooks into explainable analysis; paper trading records a simulated decision; Library preserves learning evidence; Quant Lab makes limited model mechanics inspectable; and AI tools communicate conditional explanations and display-only paths.

The product is not positioned as an automated execution platform. The word “automatic” applies only to limited, separately consented **paper** checks. Foreground alerts scan saved canonical rules while the app is active. ORB automatic paper is foreground only. Session automatic paper has a separate closed-app consent path, but it also requires a deployed authenticated schedule, task mapping, and fresh heartbeat; none is asserted active or production-proven. Notifications retain event/outbox state, but provider acceptance is not device display.

Three distinctions are fundamental throughout the product:

1. **Source evidence versus derived interpretation.** Quotes are distinct from historical candle closes. A forming candle is distinct from a completed bar. External calendars, COT, depth, and source-reference records are context rather than instrument-specific trade advice.
2. **Display or research output versus authority.** Overlays, model results, scenario layers, pattern matches, and Coach replies do not change a rule, approve a gate, or place a paper record unless a separate explicit action passes its own server checks.
3. **Local convenience versus canonical owner record.** Local workspace state and privacy settings may be edited on a device. Canonical paper rows, events, protected-source metadata/bytes, and cloud workspace revisions are server-owned and cannot be superseded by a stale cache.

## 5. Owner persona and principal use cases

### Persona: the authorized owner

The only product persona is the configured owner: an individual who signs in with the allowed identity and uses Zax privately for study, market inspection, strategy documentation, paper practice, and review. The owner can select sources, save local work, explicitly create or update a cloud copy, retain a protected reference, run a bounded research request, and arm limited paper automation. The owner is not modeled as a broker operator, professional advisory service, administrator of a multi-user tenancy, or recipient of a public signal stream.

The platform account field may contain `user` or `admin`, but product access is a separate allowlist predicate against verified OpenID or, if OpenID is absent, verified owner email. Cached profile data is display-only. The app does not disclose the configured identity. A signed-out, unauthorized, or unverifiable caller is kept outside private content.

### Primary use cases

| Use case | Owner objective | Zax current-state response |
|---|---|---|
| **Inspect a market** | Compare a selected instrument across source-labelled quote, chart, timeframe, and context views. | Shows availability/freshness and refuses to fill missing history or unknown session calendars. |
| **Document a rulebook** | Preserve a strategy’s provenance, conditions, versions, and supported analytical layers. | Separates references, personal rules, native closed-bar evidence, and manual factors. |
| **Review a source file or screenshot** | Keep a private original, receive a bounded structured proposal, and retain only human-approved conclusions. | Encrypts retained originals, versions proposals, and does not promote output into a signal or model weight. |
| **Practice a paper trade** | Record a simulated plan with risk geometry, journal context, and later review. | Uses canonical proposals/trades and practice versus gated strategy modes; never calls a broker. |
| **Ask for explanation or scenario context** | Learn from selected workspace context without granting AI operational authority. | Uses Coach or a strict, display-only scenario/layer contract with probability set to null. |
| **Explore a quantitative hypothesis** | Inspect data gates and simplified calculation output. | Runs one of five bounded research families, showing source, assumptions, insufficiency, and limitations. |
| **Watch or arm constrained paper automation** | Receive analysis events or consent to bounded paper-only checks. | Uses explicit cloud save, consent, expiry, caps, and failure-closed checks; delivery/closed-app proof remains open. |

## 6. Information architecture and authority model

### Navigation

Private navigation is gated under six primary destinations: **Chart**, **Markets**, **Trades**, **Alerts**, **Strategies**, and **My Library**. **Guide** is a separately gated explanatory route. The owner may also navigate to a private Coach route from Chart, Strategies, Library, and learning surfaces. Root initialization supplies theme, safe areas, client/API providers, and WorkspaceProvider; owner-only sidecars for notifications, foreground alerts, paper synchronization, and paper runner remain access-gated.

| Destination | Primary current-state responsibility |
|---|---|
| **Chart** | Candles, quote/status, timeframes, indicators/overlays, context, analysis evidence, scenario display, and paper-plan entry. |
| **Markets** | Source/feed account status, search/filter/pagination, favorites, quick watch staging, instrument selection, and Chart handoff. |
| **Trades** | Canonical paper proposal/trade lifecycle, balance/performance, journal/deep dive, management, and review. |
| **Alerts** | Rule authoring, foreground test/sync, event history, consent/status for delivery and automatic paper. |
| **Strategies** | Presets, owner rulebooks, revisions, confluence configuration, session settings, and Quantitative workbench. |
| **My Library** | Personal patterns/styles, protected source intake/preview/jobs, screenshot evidence, studies, learning, account, and workspace tools. |

### Data authority and persistence

The schema-v1 workspace includes strategy, pattern/source, match, trade cache, alert, level, selection, chart preference, settings, and paper-starting-balance state. Initial selection is BTC-USD and 5m; supported core intervals are `1m`, `5m`, `15m`, `30m`, `1h`, `4h`, `1d`, and `1w`. Workspace local state is stored in an envelope with cloud revision, dirty flag, and last acknowledged digest. It serializes locally after a 2,000 ms debounce and on background; cloud synchronization is best effort. First cloud creation is explicit. A revision compare-and-swap conflict is surfaced and never auto-merged or silently overwritten.

Canonical paper rows/events and retained-source metadata/originals are not local authority. A database workspace row is owner-scoped, while sources, versions, jobs, alerts, and paper history are distinct server records. Local caches may restore or display data but cannot win over newer canonical rows. This distinction enables the product to keep a pending paper record or source version coherent even if a device has unsaved local edits.

### Privacy posture

An optional browser local PIN is a privacy veil only. It requires WebCrypto/localStorage, uses PBKDF2-SHA-256 with 310,000 iterations and a 6–12 digit PIN, and cools down for 30 seconds after five failures. It neither authorizes server access nor proves screenshot protection. Native PIN is currently unavailable/off because the default native service does not supply the required crypto adapter. A default-on background overlay can conceal balances, P/L, and source content while inactive, but it is not an OS screenshot guarantee.

## 7. End-to-end user journeys

### Journey A — inspect source-labelled market context

The owner passes the server access check, opens Markets, selects an available source/instrument, and hands the selection to Chart. Chart independently presents historical candle status and quote status. The owner chooses one of eight frames, examines completed-bar bias and profile/context, and may enable session boxes or chart overlays. A source may be unavailable, delayed, stale, lacking a declared session calendar, or unable to provide a derived timeframe. In those cases Zax must keep the state explicit rather than use sample bars, a stale quote, or invented aggregates. Sample mode is labelled demonstration data and disables source-dependent analysis.

### Journey B — adopt a strategy and evaluate confluence

The owner searches visible strategy content, creates a personal rulebook or retains a source reference, and applies up to three profiles to Chart. Applying selects an active profile and optionally related frame behavior; it does not certify that every source rule is machine-readable. A native setup analysis uses completed supplied bars and preserves evidence. The owner can separately configure a same-version weighted confluence gate with native trigger, conditions, threshold, and human approval. **ALL/ANY** controls cross-profile setup combination; it is distinct from the weighted gate. Unknown, stale, unsupported, side-conflicting, or version-mismatched evidence blocks eligibility. A passing result produces points/checklist/evidence, not a probability or order permission.

### Journey C — form and review a paper plan

From Chart, the owner requests Buy/Sell. The server requires a usable quote, recent completed source bars, supported valuation, positive canonical balance, and a non-sample context before persisting a 15-minute proposal. The owner chooses **Manual practice** or **Gated strategy**. Manual practice applies paper risk/geometry/discipline checks but does not represent a strategy signal; gated strategy rechecks saved canonical strategy, confluence, side, and freshness. The owner selects a 0.5%, 1%, 2%, or fixed-unit template, edits a valid bracket, and confirms a market-style or observed limit simulation. Trade lifecycle transitions are durable, owner-scoped, and version-checked. Closing, cancelling, amending, partials, and optional simulated management remain paper-only. Learning reports descriptive canonical paper outcomes and withholds comparisons under 100 observations per group.

### Journey D — turn a private source into reviewable learning material

The owner selects a supported file type or a manual Library definition. Normal source intake validates file type, signature, raster/PDF/text readability, and limits before retention. A successful original is encrypted, owner-scoped, versioned, and may initiate a durable analysis job. The job can be polled, cancelled, or retried once after failure. A blueprint remains unapproved until explicit human review/acceptance. A changed source version invalidates a prior proposal. Logical deletion frees product capacity but physical object deletion is unsupported and remains pending cleanup. Screenshot evidence is separate: it is immutable review context, never modifies canonical trade fields, and has a real UI/server size mismatch that can retain an image that the review service cannot analyze.

### Journey E — use AI and historical scenarios safely

The owner may open Coach to ask a bounded question with workspace context and local transcript state. Managed Coach availability is not currently established by the recorded terminal-unavailable Deep request. A direct OpenAI credential can be connected only through masked, owner-scoped, encrypted setup for **scenario generation**; it is distinct from managed Coach and Library services, and AI4Trade is not connected. The scenario system requires actual completed source bars, validates a strict 12-step hypothetical output, uses `probability: null`, and never feeds paper entry, confluence, or actual candles. **Current** context fails closed without fresh bars and matching live quote; **Auto** may label dated historical-only context; **Last available** intentionally uses completed history without claiming live context. Historical layers require actual continuation and remain separate from AI layers.

### Journey F — alert and constrained paper automation

The owner creates a rule, explicitly saves it to cloud, then uses a foreground test or active-app scan. Server evaluation runs against canonical saved rules rather than unsaved local edits. Events retain scope/evidence and are deduplicated; a push tap fetches the stored event rather than trusting the payload. Separately, the owner may arm an exact, capped, expiring strategy scope for automatic **paper** entries. Runners recheck owner, consent, exact versions, evidence, risk, drawdown, discipline, active position, and day caps. ORB is foreground only. Session closed-app operation is only a prepared path needing production/task/heartbeat prerequisites; no production callback, native token, or device display is proven.

## 8. Module scope and current-readiness matrix

| Area | Implemented source scope | Readiness interpretation | Principal open dependency |
|---|---|---|---|
| Platform/workspace | Owner gate, tabs, local/cloud state, portability, capacity/removal, source-job scaffolding. | Source-defined; conflict and device behavior unverified. | Auth/session, DB/storage, native/browser platform. |
| Charts/markets | Source-labelled quotes/candles, eight frames, safe aggregation, overlays, bias, calendar/COT context. | Data conditional; no universal entitlement/freshness claim. | Coinbase/FMP/TradeLocker and declared calendar metadata. |
| Strategies/confluence | Presets, references, revisions, supported setup families, manual/no-code links, weighted gate. | Analysis behavior defined; no performance qualification. | Closed source bars, same-version evidence, human approval. |
| Session rules | Native ORB, NAS100 CFD adaptation, London, IB, PDC source geometries. | Exact rule contracts coded; feed and live-session proof absent. | Correct instrument metadata/tick/volume/quote evidence. |
| AI/scenarios | Coach, historical replay/layers, strict AI layer validation, direct scenario credential path. | Implemented contracts; live managed/direct inference unverified. | Model availability, owner key/entitlement, safe transport. |
| Library/evidence | Private upload, encrypted original, preview, job/review, search, dataset/screenshot study. | Boundaries defined; runtime storage/model/device behavior unverified. | Object storage, parsers, model service, picker. |
| Paper/journal | Proposal, canonical simulation, risk/discipline, lifecycle, performance, learning. | Paper only; source/UI fixed-unit cap discrepancy is known. | Source quote/candle/valuation, DB, scheduler for management. |
| Alerts/automation | Rules, scans, events/outbox, consented paper checks, callback design. | Foreground source path exists; background/push operational proof absent. | Deployed schedule, token, OS permission, provider. |
| Quant Lab | Pairs, momentum, making, trend, classifier models with diagnostics. | Exploratory research only; results temporary/in-memory. | Provider/import data, qualification protocol, depth. |
| Delivery | Web/API/static contracts, release fingerprint, Expo config and source identity. | Production and native release unmet. | Deployment environment, signed builds, public/device verification. |

## 9. Product policies

### Data, source, and freshness policy

Zax must distinguish a current quote from historical OHLC. Quotes can be stale after 120 seconds or if their timestamp is over 30 seconds in the future. Source candle age, completion, time basis, and aggregation rules are independent. The app must not create a bar by carrying forward price, fill a gap, average duplicates, assume an unknown session calendar, or convert unavailable data into zero. Derived 30m requires exact contiguous 15m constituents; 4h and weekly depend on complete source periods and declared calendar support. The 55-completed-bar EMA bias is descriptive, not a forecast, recommendation, or gate.

### Probability and performance policy

`successProbability` for native confluence is null. AI scenarios require `probability: null`. Historical analogue, observed target-before-stop, Quant Lab metrics, model calibration, source reference counts, visual similarity, paper performance, and Coach analytics are not prospective probabilities or validated edge. Comparative learning results are withheld below 100 eligible records per comparison group. Quant results expose validation status and limitations, and `ready` means a family’s calculation gates passed, not profitability or approval.

### AI authority policy

AI output may explain, summarize, or draw a conditional display hypothesis within bounded input/output schemas. It may not create a broker order, directly approve a confluence gate, alter canonical paper records, self-promote a rule, auto-train a model, or silently substitute provider/model data. Direct OpenAI scenario credentials are isolated in owner-bound encrypted runtime storage; they are not returned, saved in workspace/AsyncStorage, or reused by Coach, Library, paper trading, or automation. Catalog availability does not prove inference completion.

### Risk and automation policy

The only trade records are canonical paper simulations. Practice and strategy modes are deliberately distinct. Strategy mode needs current same-direction, same-version gate evidence; practice mode does not claim that evidence. A valid paper proposal must meet price/side geometry, fresh-source, valuation, balance, risk, discipline, drawdown, and lifecycle checks. Separate proposals do not reserve aggregate open risk atomically. Fixed-unit ticket copy must not be interpreted as a complete server cap: current `createPaperOrder` skips percentage floor/cap checks when `proposal.riskPct` is zero.

Automatic paper is opt-in, exact-scope, risk-bounded, capped, expiring, and failure closed. It is not autonomous trading. No LLM trigger is used. Alert signals and confluence points never authorize a broker order.

### Privacy and retention policy

Owner authorization is server verified and fail closed. Browser local lock and background mask are privacy aids only, not authorization, native lock proof, or screenshot protection. Sources are retained encrypted and owner scoped; previews avoid exposing object URLs/keys. Export excludes secrets, authentication, internal URIs, original bytes, and automatic-paper consent. Logical source deletion is not physical erasure: the product removes logical metadata/index/version/vector rows and records pending object cleanup.

## 10. Qualitative acceptance and observability

The following are current-state product acceptance qualities, not invented measured KPIs.

| Quality | Acceptance expectation | Observable evidence/state |
|---|---|---|
| **Access integrity** | A caller who is signed out, unauthorized, or cannot be verified cannot mount private children. | Owner-gate state and server unauthorized/forbidden response. |
| **Provenance integrity** | A quote, candle, derived period, source file, scenario, alert, and paper record identify applicable source/as-of/version/status or remain unavailable. | Quote/candle/source metadata, revision, warnings, event evidence. |
| **Conflict safety** | A stale local revision cannot overwrite canonical changes. | Dirty/revision/divergence state and CAS conflict response. |
| **Failure clarity** | Missing data, short history, model error, model refusal, provider limit, deadline, or unavailable schedule is visible rather than passed off as success. | Typed status/reason, retry/cancel/refresh affordance where allowed. |
| **Authority separation** | A display/research result does not silently create a paper record, enable automation, or change a rule. | Explicit owner confirmation, cloud save, consent, and server route checks. |
| **Paper traceability** | Every paper lifecycle operation is attributable to an owner-bound proposal/trade/event and preserves version history. | Canonical trade/event/revision detail and chart deep link. |
| **Delivery honesty** | Product documentation reports source, Preview, deployment, device, and inference evidence separately. | Release status, fingerprint contract, known failed deployment status. |

Useful operational measures, when an environment is later available, are not current results: access-denial/error rates; workspace conflict and local-write failures; source-job state/age/retry counts; provider freshness/unavailable rates; proposal blockers and version conflicts; alert scan deferrals/budget exhaustion; outbox attempts/receipts; scheduled callback heartbeats; model request outcomes; and native notification/device confirmations. These measures must retain owner privacy and must not be recast as trading-performance KPIs.

## 11. Dependencies and constraints

Zax depends on verified owner authentication; cloud database and object storage; encryption configuration; local/remote parsing tools; Expo/browser and device capabilities; provider contracts; optional FMP key/entitlement; owner-authorized TradeLocker integration; Coinbase public history/depth; managed AI service; optional direct OpenAI credential; Expo push and platform credentials; and a deployed scheduler for closed-app paths. Each dependency can render a feature unavailable without changing its source implementation.

Market data has explicit constraints. TradeLocker entitlement is conditional; FMP needs key/entitlement and can be delayed; Coinbase volume is venue-supplied but does not establish total market volume. Weekly/4h derivation is refused when session calendars are insufficient. Futures availability is only present when the connected catalog exposes the exact instrument. NAS100 CFD is a selected TradeLocker adaptation with metadata-bound tick, not NQ futures or a generic alias. Session strategy times use fixed EST by default (UTC−5) unless the owner deliberately selects the New York DST-aware override; device time does not reinterpret bars.

## 12. Proposed readiness sequence and gap register

> **This is a proposed remediation/verification sequence, not a delivered roadmap, release promise, or statement that work is scheduled.** It orders current gaps so later proof is not built on an unavailable environment.

| Priority | Proposed sequence | Why it precedes later claims | Current evidence boundary |
|---|---|---|---|
| **P0** | Diagnose and complete a permanent production deployment; verify root/static/API/release fingerprint and anonymous/private boundaries against the real environment. | Background delivery, public browser behavior, and durable services depend on it. | Corrected deployment timed out; last recorded public root was `Cannot GET /`. |
| **P0** | Validate owner login, canonical workspace/Paper/Library persistence, provider configuration, and encryption storage in the deployed environment. | Source routes do not prove owner-specific data/service operation. | No owner records, credentials, storage, or provider calls were used here. |
| **P1** | Produce signed native builds and execute physical iOS/Android workflows: login, chart render, privacy state, source picker/preview, native transport, and local storage. | Expo exports/config do not establish installed-device behavior. | No signed installation or device proof. |
| **P1** | Exercise end-to-end notification enrollment and receipt, then scheduled callback/heartbeat with separately consented session paper in a controlled paper-only environment. | Task registration, token registration, and provider acceptance are not receipt proof. | No schedule activation, callback, push send, or handset receipt verified. |
| **P1** | Verify managed Coach and direct scenario inference with permitted owner configuration; validate failure handling and logs without retaining credentials. | Catalog checks and source adapter do not establish successful inference. | Managed Deep was terminal-unavailable; direct key/model/inference unverified. |
| **P2** | Run source/version-specific regression and operational checks after environment recovery, separately recording exact commit and scope. | Older milestone counts cannot be applied to later source or deployment. | 851/1-skip and eight focused tests are distinct historical milestones. |
| **P2** | Close product-boundary defects: physical object deletion worker, screenshot size-contract alignment, native PIN adapter decision, fixed-unit risk-cap semantics, and durable worker architecture. | These affect privacy, predictability, and unattended reliability. | Each is a documented current-state gap, not silently solved. |
| **P3** | Establish disciplined research qualification protocols for any future predictive/performance claim. | More source data or a calculation result alone cannot validate an edge. | No validated edge, calibrated probability, or execution-quality evidence. |

## 13. Verification, deployment, and native limitations

No app code was implemented, modified, built, tested, published, or probed for this PRD. No owner rows, provider accounts, model requests, market data, uploaded attachments, or production runtime were accessed. Final document checks included source-path coverage, Markdown navigation, inventory completeness, a non-disclosing credential-value scan, and the existing source-only backup's manifest/checksums. No credential was displayed, changed or used for provider authentication. The document therefore makes no claim that any particular owner can sign in, that a provider currently returns a symbol, that a source upload succeeds, that a model completes, or that a device displays a notification.

Permanent publication remains unconfirmed. The reported deployment `68512095` timed out after a CSS JSX runtime repair, with platform logs reporting `owner_unavailable`; the root cause is unknown. The last reported public root browser response on 19 October was `Cannot GET /`. A temporary API/Metro HTTP 200 recorded on 20 October is explicitly a temporary development/Preview recovery, not a published release. Documentation-time checks verified that the existing credential-excluding source ZIP identifies the exact baseline commit and that all 683 archived source-file checksums match both its manifest and the current source files. This establishes source-backup parity, not a remote checkpoint record, an owner-data backup, a matching deployed/native binary, or successful publication.

Native and model limitations are equally separate. Expo export is not APK/AAB/IPA signing, install, permission grant, or push proof. Native SecureStore wiring is not proof of the unavailable default native PIN implementation. Direct OpenAI transport and encrypted vault code are not proof that an owner supplied a valid key or received inference. Managed Coach/Library dependence has a recorded terminal-unavailable observation, not a resolved-service assertion. No product evidence here should be used to market Zax as a live trading, predictive, autonomous, or published mobile service.

## 14. Source traceability

The synthesis used the following source-grounded module reports at the stated snapshot. Their underlying implementation paths are listed here for traceability; this document intentionally avoids inaccessible internal report links.

| Product area | Primary implementation/source paths referenced by the module reports |
|---|---|
| Platform and workspace | `app/_layout.tsx`; `app/(tabs)/_layout.tsx`; `hooks/use-auth.ts`; `hooks/use-workspace.tsx`; `lib/trading/model.ts`; `lib/trading/workspace-sync.ts`; `server/trading/access.ts`; `server/trading/repository.ts`; `server/trading/workspace-tools.ts`; `drizzle/schema.ts` |
| Charts and markets | `app/(tabs)/index.tsx`; `app/(tabs)/markets.tsx`; `lib/trading/timeframes.ts`; `lib/trading/timeframe-bias.ts`; `lib/trading/freshness.ts`; `server/trading/market.ts`; `server/trading/bias-router.ts`; `server/trading/tradelocker.ts`; `components/trading/candle-chart.tsx` |
| Strategies and confluence | `app/(tabs)/strategies.tsx`; `lib/trading/setup-model.ts`; `lib/trading/setup-engine.ts`; `lib/trading/confluence-contract.ts`; `lib/trading/confluence-runtime.ts`; `server/trading/collections.ts`; `components/trading/confluence-editor.tsx` |
| Session strategies | `lib/trading/orb-model.ts`; `lib/trading/orb-strategy.ts`; `lib/trading/session-range-strategies.ts`; `lib/trading/pdc-continuation.ts`; `server/trading/instrument-preparation.ts`; `server/trading/setup-service.ts` |
| AI and scenarios | `app/coach.tsx`; `components/trading/ai-coach.tsx`; `server/trading/coach-service.ts`; `server/trading/forecast-service.ts`; `server/trading/openai-scenario-client.ts`; `server/trading/scenario-provider-vault.ts`; `lib/trading/ai-forecast.ts` |
| Library and evidence | `app/(tabs)/library.tsx`; `server/trading/learning.ts`; `server/trading/library-blueprint.ts`; `server/trading/source-analysis-jobs.ts`; `server/trading/source-preview.ts`; `server/trading/trade-screenshot-service.ts`; `server/trading/vectors.ts` |
| Paper and journal | `server/trading/paper-service.ts`; `server/trading/paper-gate.ts`; `server/trading/setup-history.ts`; `lib/trading/paper-lifecycle.ts`; `lib/trading/trading-discipline.ts`; `components/trading/paper-plan-sheet.tsx`; `app/(tabs)/trades.tsx` |
| Alerts and automation | `app/(tabs)/alerts.tsx`; `server/trading/notifications.ts`; `server/trading/session-auto-paper.ts`; `server/trading/orb-auto-paper.ts`; `server/trading/scheduled-scan-budget.ts`; `components/trading/foreground-alert-sync.tsx` |
| Quant Lab | `components/trading/quant-workbench.tsx`; `lib/trading/quant-pairs.ts`; `lib/trading/quant-momentum.ts`; `lib/trading/quant-making.ts`; `lib/trading/quant-macro.ts`; `lib/trading/quant-ml.ts`; `server/trading/quant-service.ts` |
| Delivery/readiness | `package.json`; `pnpm-lock.yaml`; `Dockerfile`; `app.config.ts`; `server/_core/index.ts`; `server/_core/web-app.ts`; `server/_core/trpc.ts`; `scripts/write-web-release.mjs`; `LATEST_FOUNDRY_UPDATE.md` |

The raw 156-entry feature-guide inventory is preserved verbatim in the companion Feature Specification appendix. Its catalog labels remain raw inventory labels and do not override the current-state boundaries in this PRD.
