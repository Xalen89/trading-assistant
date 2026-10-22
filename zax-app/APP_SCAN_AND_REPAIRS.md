# Zax — application scan and repair report

**19 October 2026. Private owner-only, paper-only.** This report separates code and fixture evidence from actual model service, provider, phone and production behavior. No public release, broker execution, test paper order, live upload/deletion or new schedule was created by this work.

## Current result

The ten-area source scan identified and repaired concrete defects in AI error propagation/request lifecycle, chart/layer persistence and forming-bar anchors, source origin/history/acquisition cutoffs, canonical paper balance/lifecycle, PDC target geometry and strategy rollback, ORB concurrency and alert delivery, durable private upload/index/cancellation/DTO controls, quant duplicate-universe validation, portable consent/logout security, and canonical discipline/screenshot review linkage. The original Library deletion finding was corrected: a deletion path already existed; retained protected originals now have transactionally tracked pending cleanup and are not falsely described as physically deleted.

Final verification: **824 passed, zero failed, one pre-existing skipped authentication integration test** across141passed test files and one skipped file. Current TypeScript/lint, local chart build, backend build and web/iOS/Android source exports all passed. The installed local OpenCV decoder successfully parsed complete generated PNG/JPEG/WebP fixtures and rejected malformed image/PDF fixtures before retention. No owner test orders, proposals, uploads/deletions, newly armed automation or activated schedules were created by these checks.

One scoped read-only integration reviewer found no additional high-risk connection defect in the reviewed critical paths. The subsequent final full-suite pass exposed one remaining prior-day geometry identity-field mismatch; the parent corrected it and added dated/context regressions rather than loosening source checks. The final824-pass result is after that correction.

**Not established:** restored managed-AI inference (the sole actual current check returned terminal-unavailable), physical iPhone/iPad behavior, every live feed, calibrated predictive edge, signed native builds, native push display, deployed background callback or actual automatic paper fills. Protected original byte cleanup remains pending because the current storage helper has no verified delete capability. A local commit/source ZIP is not a remote checkpoint or publication; no public app release/link was created.

Final software result: **824 passed, 0 failed, 1 skipped**. The existing skipped authentication integration case is not presented as verified. Scope-specific reports below record their own checks; tests are not proof of every device or connected service.

## The screenshot's AI error

The one allowed current Deep-mode check used the live project catalog and existing server helper with a short non-trading prompt and no retry. It returned the safe kind **terminal-unavailable**. No raw service body, account balance or credential was retained in this report. Code changes improve classification, transport lifecycle and preserved-input behavior; they do not establish restored managed inference. For service-account assistance use https://help.manus.im. There was no alternate-provider bypass, second completion or invented AI scenario. Deterministic chart, historical replay and source-based ORB remain separate.

## Verification boundaries

This scan covered ten application areas and inspected source, mocked/pure regressions, current language diagnostics and builds/source exports. Physical iPhone/iPad, signed iOS/Android builds, restored managed inference, every live market feed, trained/calibrated edge, actual automatic paper fills and production callback/push display are not proven by this work. Existing data and consent were preserved; no automatic consent was enabled.

| Area | Read-only scan | Scoped repair record |
|---|---|---|
| AI Coach and scenarios | Completed | Included below; see remaining limits |
| Chart, layers and phone context | Completed | Included below; see remaining limits |
| Feeds, timeframe and source provenance | Completed | Included below; see remaining limits |
| Paper sizing and lifecycle | Completed | Included below; see remaining limits |
| Strategy rules and confluence | Completed | Included below; see remaining limits |
| Alerts and automatic paper | Completed | Included below; see remaining limits |
| Private Library and uploads | Completed | Included below; see remaining limits |
| Quant research and no-code rules | Completed | Included below; see remaining limits |
| Owner security and workspace portability | Completed | Included below; see remaining limits |
| Discipline, journals and trade screenshots | Completed | Included below; see remaining limits |

## AI Coach and scenarios

### Repair record

# AI failure, quota and request-lifecycle repair

The scoped repair adds an allow-listed LLM failure-kind contract to the tRPC formatter, preserves terminal causes through Coach and Forecast, and uses fixed terminal-specific UI copy instead of suggesting an immediate retry. No upstream body or credentials are serialized. Both scenario controls use a 52-second device-side epoch/timer: controls recover on a transport stall, existing questions/scenarios are kept, and late results cannot overwrite them. This local timeout does not cancel server/model work.

Forecast and Coach now reserve application usage under the owner lock and can release the exact reservation once for known terminal catalog/completion failures producing no usable output. The parent integration additionally retains a separate bounded request-attempt count that is not released, preventing repeated terminal requests from bypassing abuse protection. This is application admission accounting, not Manus billing or refund handling.

The repair worker's focused mocked run passed 38 tests across four files. The parent corrected two React useRef initializers reported by the combined compiler. Final integration and test results are recorded in the report header, not inferred from these earlier targeted checks.

The only real model check made in the original read-only scan returned terminal-unavailable. There was no further model, provider, account, database or device operation, no alternate-provider bypass and no restored-inference claim. Source freshness, structured output validation and display-only/no-probability semantics remain intact.

### Original read-only findings and evidence

# 01-ai — AI Coach and forecast failure-propagation audit

**Scope:** core managed-LLM transport/error handling, live model policy, forecast/coach services and tRPC routers, and native coach/scenario UI. Source baseline audited at **`c58be4d05657`**. This was read-only: no source, database, config, user record, schedule, port, or service was changed; no image attachment was opened.

## Why the screenshot says only “AI scenario unavailable / Try again later / Manus Help”

This is the intended sanitization path, but the UI currently loses useful **safe** failure semantics:

1. `server/_core/llm-errors.ts:68-89` classifies HTTP **412**, **403**, or a response/envelope **code 9** as `LLMServiceError("terminal-unavailable")`, deliberately retaining no upstream body text.
2. `server/_core/llm.ts:324-340,457-467` inspects a cloned error body only for that classification, avoids retrying a terminal result, and rejects HTTP-200 error envelopes before any `choices` are consumed.
3. `server/trading/forecast-router.ts:119-126` converts the thrown safe message into a `PRECONDITION_FAILED` tRPC error.
4. `components/trading/ai-forecast-panel.tsx:53-67,107-114` catches the mutation **without reading the error** and renders one hard-coded generic message plus the fixed `https://help.manus.im` link. Thus neither 412 nor code 9—and no provider body—is shown.
5. Coach follows the same privacy-safe presentation pattern: `components/trading/ai-coach.tsx:316-331` ignores the caught error and uses a generic retry notice; `:664-736` replaces unavailable status details with generic service text and Help.

## Bounded managed-AI probe

The live project catalog was read through the existing `listLLMModels()` helper. Its current **Deep** policy selection was **`gpt-5.5`** (`server/trading/ai-model-policy.ts:7-20`). One short non-trading completion was then attempted with the existing `invokeLLM()` helper, `maxRetries: 0`, and a 30-second abort signal. It ended with the already-sanitized safe result **`terminal-unavailable`**. No response text, provider body, credentials, account/balance inference, application quota call, database write, alternate provider, or second completion was made. The safe machine result is at [`01-ai-probe-safe.json`](01-ai-probe-safe.json); the probe source is [`01-ai-probe.ts`](01-ai-probe.ts).

This confirms the failure is currently upstream/service-side as far as the code can safely observe; code alone cannot restore managed inference access.

## Confirmed findings

| Severity | Finding | Evidence | Feasible small correction |
| --- | --- | --- | --- |
| **Medium** | **Forecast UI discards the safe terminal-vs-temporary classification, so a terminal 412/code-9 failure is indistinguishable from an ordinary retryable outage.** | Core has `LLMServiceError.kind` (`server/_core/llm-errors.ts:51-79`), but the forecast router only concatenates its generic safe message (`server/trading/forecast-router.ts:119-126`) and the UI has `catch {}` plus a fixed “Try again later” message (`components/trading/ai-forecast-panel.tsx:53-67,107-114`). The one permitted probe selected Deep `gpt-5.5` and returned `terminal-unavailable`, matching this rendered state. | Preserve only an **allow-listed** `terminal-unavailable` / `request-refused` / `temporarily-unavailable` kind through the tRPC error formatter (never an upstream message/body); have Forecast and Coach show distinct fixed copy. Terminal state should say the service cannot complete the request and direct to Help, rather than implying an immediate retry will resolve it. Keep existing scenario/question intact and do not add a fallback/provider retry. |
| **Medium** | **Forecast has no device-side timeout, so a dropped/stalled tRPC transport can leave “Building scenario…” disabled indefinitely before the server’s 48-second deadline ever begins.** | `FORECAST_REQUEST_TIMEOUT_MS` applies only after the server handler starts (`server/trading/forecast-router.ts:11,61`). In contrast to Coach’s local timer (`components/trading/ai-coach.tsx:383-424`), `AIForecastPanel.run` simply awaits `mutateAsync` (`components/trading/ai-forecast-panel.tsx:52-67`) and its action remains disabled while `generate.isPending` (`:92-101`). No client timer, request epoch, local timeout state, or mutation reset is present. | Add a local forecast request ID and bounded timer (slightly above the server budget). On expiry, restore controls and render a fixed connection/timeout message while retaining the question and existing scenario; reset the mutation and ignore any late result. This must be client-side cancellation only—do not claim it cancels the server/model request. |
| **Medium** | **Known terminal model/catalog failures consume an owner’s persistent Coach/Forecast quota before any usable answer or scenario exists; the generic retry UI can repeatedly spend that quota during the outage.** | Coach writes quota first (`server/trading/coach-service.ts:981-995`) and only reads the catalog at `:1431-1438`; Forecast writes quota at `server/trading/forecast-router.ts:61-65` before source/catalog/model work. `consumeAppQuota` performs insert/update and cleanup mutations (`server/trading/app-quota.ts:87-160`) and neither caller releases a failed terminal attempt. The terminal probe had no usable output. | Preserve abuse protection, but make the accounting semantics explicit and avoid charging a known `LLMServiceError.terminal`/catalog-terminal failure that produces no completion—e.g., use a request-scoped reservation with an atomic terminal-failure release, or delay the charge until successful model acceptance while retaining a separate non-persistent throttling guard. Add mocked regressions for terminal catalog/completion failure and manual retry. Do not loosen owner checks or add automatic retries. |

## Verified controls that are working in source

- **Safe core failure propagation:** terminal 412/403/code-9 responses, including HTTP-200 error envelopes, are classified before output consumption and do not expose their body (`server/_core/llm.ts:313-373,443-468`; `server/_core/llm-errors.ts:47-89`).
- **Model policy:** only runtime catalog IDs are selected; Deep priority is GPT-5.5 → GPT-5 → Gemini Pro, efficient tier is separate, and no cross-tier substitution occurs (`server/trading/ai-model-policy.ts:7-76`). Sparse catalog metadata is not treated as vision support (`:36-58`).
- **Bounded no-provider retry behavior:** Coach and Forecast use `maxRetries: 0` for catalog/completion paths (`server/trading/coach-service.ts:895-899,847-859`; `server/trading/forecast-service.ts:114-117,174-202`). Forecast permits only one same-model correction for local malformed/empty/direction-invalid output—not for transport/provider failure (`:253-293`). Coach permits one same-tier alternate only for empty/truncated output (`server/trading/coach-service.ts:1612-1655`).
- **Deadline and data boundaries:** Forecast has a 48-second end-to-end server deadline and source/model abort signals (`server/trading/forecast-router.ts:11-43,61-99`; `server/trading/forecast-service.ts:47-60,99-117,174-187`). Coach has one 45-second service deadline and refuses to begin a late completion (`server/trading/coach-service.ts:61-67,803-858,1001-1071`).
- **No fabricated trading output:** Forecast source preparation requires actual completed bars and strict current quote/freshness unless explicitly resolved to historical-only context (`server/trading/forecast-source.ts:98-180`); the generated path is display-only with `probability: null` (`lib/trading/ai-forecast.ts:88-150`); failed UI requests retain the existing scenario (`components/trading/ai-forecast-panel.tsx:62-67,107-115`). Coach’s prompt and output guards retain the paper-only/no-execution boundary (`server/trading/coach-service.ts:742-749,324-338`).
- **Owner scope and serialization:** both routers are `ownerProcedure`-protected (`server/trading/forecast-router.ts:46-60`; `server/trading/coach-router.ts:31-40`); client and server use `superjson` (`server/_core/trpc.ts:7-14`; `lib/trpc.ts:21-42`). No raw LLM provider payload is intentionally added to either tRPC route.
- **Focused mocked tests:** **73/73 passed** across 9 existing AI/forecast/coach unit-test files. They stub LLM/fetch/dependency adapters and do not use the production database or make real provider calls. They cover terminal HTTP 412/code-9 classification, no retry, strict tier policy, output recovery, deadline behavior, fallback boundaries, and preserved conversation state.

## Limits / follow-up validation

- The single permitted managed completion failed safely with `terminal-unavailable`; no code audit can determine or repair the managed service/account condition, and no balance/account diagnosis was attempted.
- The focused tests and source trace do **not** prove browser/native-device transport behavior, an actual owner session, production tRPC gateway behavior, or restored inference availability.
- The existing server deadlines abort model/catalog calls, but the Promise-race deadline wrappers cannot forcibly cancel every already-started database/metadata read; this is a resource-lifecycle limit to validate under real load, not a finding of a fabricated result or data-boundary bypass.


## Chart, layers and phone context

### Repair record

# 02-chart repair report

## Scope completed

- **All eight scenario display timeframes persist:** `scenario-layer-storage.ts` now imports the shared `SCENARIO_TIMEFRAMES` contract and caps `displayTimeframes` at `SCENARIO_TIMEFRAMES.length`, preserving the existing uniqueness, 12-saved-layer, and 6-drawn-layer safeguards.
- **Forming bars are explicit and cannot anchor analysis:** `lightweight-payload.ts` has a bounded `chartCandleState` split. It retains only completed bars plus an optional terminal forming quote-update candle, emits typed `formingCandle` / `closedAnchorAt` metadata, and uses the last completed bar for AI forecasts, saved scenario layers, historical replay anchors, indicators, FVG/range-derived display layers, and local-reference placement. No gap is invented or saved scenario re-anchored to the forming bar.
- **Native chart state is visible:** `CandleChart` displays `FORMING / QUOTE UPDATE · CURRENT BAR NOT CLOSED · SCENARIOS USE LAST COMPLETED BAR`, including in the explicit SVG fallback. The isolated local chart bridge, no-credential boundary, and paper-only controls were not changed.
- **Daily context language is honest and responsive:** `WeeklyContext` uses a bounded pure helper to show the supplied profile source/explanation when daily context is unavailable, or a fixed clear unavailable state otherwise. It does not invent a profile bias. `CLOSED BARS` and its value are single-line fitted text with a flexible narrow column, avoiding the fixed 84px split.

## Pure regression evidence

Pre-inspected the three selected test files: they contain synthetic fixtures only and no database/provider/account/order/network/write operations.

```text
pnpm exec vitest run tests/trading/scenario-layers.test.ts tests/trading/lightweight-chart.test.ts tests/trading/weekly-context-copy.test.ts

Test Files  3 passed (3)
Tests       23 passed (23)
```

The regressions cover:

1. all-eight-timeframe schema → workspace validation → sanitation → rendered scenario layer round trip;
2. a terminal forming quote candle rendered as explicit non-closed state while forecast and scenario-layer anchors remain on the preceding completed candle; and
3. actual daily-analysis reason versus the fixed unavailable copy, without asserting a directional bias.

`git diff --check` passed after formatting the scoped files.

## Integration boundaries and remaining verification

- **feed03 owns daily-profile acquisition.** This repair only renders its source/explanation if present and otherwise states the clear unavailable condition; it does not alter provider reads or acquisition policy.
- The generated local chart runtime was intentionally **not rebuilt**; parent integration should rebuild it after concurrent source work as directed. `lightweight-controller.ts`, `scenario-layers.ts`, `scenario-layer-manager.tsx`, `setup-service.ts`, provider parsers, schema/migrations, and configuration were not changed.
- No device/browser/Metro/API/build/export/full-suite run occurred. No real database, provider, broker/account, model/inference, order/proposal, upload, schedule, notification, or network operation was performed. This is source and pure-test evidence only.

### Original read-only findings and evidence

# 02-chart — Chart, scenario layers, replay and phone context audit

**Scope:** Chart/index UI, isolated Lightweight Charts bridge and payload, historical replay, saved multi-timeframe scenario layers, session overlays, and the phone historical-context strip.
**Baseline inspected:** local commit `c58be4d`. Read-only review; no source, workspace, database, owner record, schedule, configuration, service, port, account, AI, or network request was made. No image attachment was opened.

## Confirmed findings

| Severity | Finding | Evidence | Small feasible correction |
|---|---|---|---|
| **Medium** | **The UI offers all eight target timeframes, but scenario persistence rejects eight.** | `components/trading/scenario-layer-manager.tsx:151-175` defines the All control as the full `SCENARIO_TIMEFRAMES` list (eight supported frames). `lib/trading/scenario-layer-storage.ts:120-124` limits `displayTimeframes` to seven. The shared schema is re-exported by `server/trading/scenario-layer-schema.ts:1-4` and used by workspace validation, while `sanitizeScenarioLayers` drops an invalid saved layer (`scenario-layer-storage.ts:153-172`). A pure in-memory schema reproduction with all eight frames returned `persists:false` and `Too big: expected array to have <=7 items`. Thus a layer can be configured as “all target frames” in memory but fails cloud persistence and is discarded at later sanitation/reload. | Replace the magic `.max(7)` with `.max(SCENARIO_TIMEFRAMES.length)` (import the existing shared constant) and add a pure regression that creates, workspace-validates, sanitizes, and renders an eight-frame layer. Keep the existing uniqueness and 12-saved/6-drawn caps. |
| **Medium** | **A forming provider bucket can be rendered and used as the chart’s latest actual candle without an explicit forming state.** | `server/trading/coinbase-window.ts:22-32` bounds the request at wall-clock `to`; its parser retains any candle with `time <= window.to` (`:35-61`), rather than requiring `time + timeframe <= to`. The pure in-memory 5m reproduction retained a last bar ending after `windowTo` (`forming:true`). `lib/trading/lightweight-payload.ts:96-105` likewise only filters `c.time <= asOfSeconds`, and takes that trailing item as `last` at `:124-129`; `lib/trading/client.ts:161-171` also opens/updates a current bucket from ticker data. This does **not** contaminate server setup/gate analysis—`lib/trading/setup-engine.ts:1040-1044` explicitly filters closed bars—but it leaves the visual series and its display-only scenario-layer anchor unable to distinguish an incomplete source bar from a completed one. | Carry explicit closed/forming metadata (or a separate forming candle) from acquisition through the chart payload. Render the forming bar with a concise “forming / quote update” marker and keep the last **closed** candle as the anchor for historical/AI layer validation and source labels. If current-bar display is not required, the smaller alternative is to filter bars by `time + SECONDS[timeframe] <= asOf` before the payload. Do not relax setup-engine closed-bar filtering. |
| **Medium** | **Selecting only a London/IB session strategy deliberately skips daily context, producing the pinned `CLOSED BARS / UNKNOWN` state even if daily provider bars are available.** | In `server/trading/setup-service.ts:177-190`, daily candles are requested only for a legacy strategy or specified PDC modes; otherwise the call is `skipped("Daily profile")`. London breakout and initial-balance are session families (`lib/trading/session-strategy-model.ts:5-10,171-175`), so a session-only selection follows the skip branch. The existing isolated fixture proves this path: `tests/trading/session-source-acquisition.test.ts:77-87` selects `SESSION_STRATEGY_PRESETS[0]` and expects only `['15m','15m']`, not `1d`. `profileAndPreviousDay` returns `bias:"Unknown"` when daily history is absent (`lib/trading/setup-engine.ts:760-798`), and `WeeklyContext` directly renders `analysis?.profile?.bias ?? "Unknown"` (`components/trading/weekly-context.tsx:82-91,150-169`). | Fetch the 1d feed independently whenever the pinned profile/PDH/PDL strip is shown and the selected market supports it; retain the current completed-bar and provider-session guards. If the read fails or is unsupported, preserve `Unknown`/unavailable but state the actual acquisition reason rather than treating an intentionally skipped request as missing market context. Add a mocked session-only test asserting the daily context request and the resulting profile when valid daily fixtures exist. |

## Trace of the reported phone text

`CLOSED BARS` and its value are deliberately separate React Native `<Text>` elements (`components/trading/weekly-context.tsx:153-157`), inside a fixed 84px summary column (`:353-367`). Therefore the observed two-line **label/value** arrangement is not evidence of a word-wrap error or a derived “Closed bars UNKNOWN” string. The value is `UNKNOWN` because the profile is absent/unknown as described above; the session-only daily-fetch path is the concrete avoidable cause found. No device/screenshot inspection was performed, so physical-phone clipping or font-rendering behavior is not claimed.

## Checks completed

- Ran only existing **pure/mocked unit tests**, after confirming their source mocks market, repository, history, and Lightweight Charts APIs; no real database, provider, account, or order write path was available. Result: **5 files / 32 tests passed / 0 failed**:
  - `scenario-layers.test.ts`
  - `scenario-layer-controller.test.ts`
  - `lightweight-chart.test.ts`
  - `lightweight-controller.test.ts`
  - `session-source-acquisition.test.ts`
- Ran two in-memory TypeScript reproductions only: the Coinbase current-bucket parser reproduction and the eight-target scenario-schema reproduction. Neither made a network/account/AI request or wrote owner data.
- Verified positive safeguards in source and targeted tests:
  - Scenario rendering is display-only and keeps hypothetical/replay data out of `payload.candles` (`tests/trading/scenario-layers.test.ts:162-184`).
  - Malformed layers, duplicate layer IDs, duplicate historical strategy IDs, bad source endpoints, expiry, wrong market, invalid dates, and excess concurrent drawn layers are rejected/withheld (`scenario-layer-storage.ts:131-172`; `tests/trading/scenario-layers.test.ts:119-160,187-236`).
  - Historical replay preserves source intervals/gaps and rejects replay at/after its current anchor (`tests/trading/lightweight-chart.test.ts`, targeted pass).
  - Lightweight controller preserves a user viewport for incremental updates but resets for a changed source key; it removes obsolete layer/forecast series (`tests/trading/lightweight-controller.test.ts:107-154,285-320`).
  - Native bridge accepts bounded chart payload fields and command allowlists only (`lib/trading/native-chart-entry.ts:17-40`); the targeted chart tests passed local-document navigation and stripped/malformed event cases.
  - The routes named `publicProcedure` in `server/trading/router.ts` are aliases of `appProcedure`, not raw tRPC public routes (`router.ts:8-12`; `server/trading/access.ts:5-18`), so owner gating remains enforced for chart reads. Private broker reads additionally require the broker owner in `server/trading/market.ts:461-470`.

## Limits

- This is a source and synthetic-unit audit, not device/runtime proof. No browser, phone, screenshot, managed DB, provider, broker, AI, or authenticated account path was exercised.
- The targeted passing tests do not prove actual feed freshness, provider inclusion of an in-progress bucket, Canvas/WebView behavior on a physical phone, or persistence against a live owner workspace. The parser reproduction proves the code permits such a bucket if supplied.
- No claim is made about predictive value, actual-data availability, paper-order execution, background automation, notification delivery, public sharing, publication, or any real-money behavior. Paper-only/default-off automation and owner-only policy remain intact in the inspected paths.


## Feeds, timeframe and source provenance

### Repair record

# Repair 03 — Feeds, provenance, acquisition clocks

**Status:** Complete within the assigned feed/provenance scope. The implementation remains **owner-only** and **paper-only**. No live provider, account, database, model, upload, schedule, consent, migration, service, or Git operation was performed for this repair.

## Implemented controls

| Area | Completed behavior | Scoped implementation |
|---|---|---|
| Broker origin cache | TradeLocker resolves the currently configured selected account before reusing the instruments catalog; the account cache is keyed to the selected-account configuration and the catalog cache to the resolved account ID. Quote/bar cache and pending keys remain based on the opaque INFO/BID source fingerprint. | `server/trading/tradelocker.ts`, `server/trading/source-identity.ts` |
| Source contract and quote observation | `Quote` and `QuoteObservationPair` carry optional opaque `sourceIdentity`. Durable v2 observations preserve a declared identity, never synthesize one from the human label, and reject label-equal / identity-different records. Legacy quotes without identity remain label-only. | `lib/trading/model.ts`, `lib/trading/session-strategy-model.ts`, `server/trading/strategy-quote-observations.ts` |
| PDC origin equality | PDC now compares `Quote.sourceIdentity` exactly when the execution feed declares an identity. A legacy selected source accepts only identity-absent, same-label quotes. The previous/current quote pair follows the same boundary; no provider-prefix fallback exists. Prior-day target and rollback logic were left intact. | `lib/trading/pdc-continuation.ts` |
| Retained bars | Retained v2 bars use the opaque identity in capture keys, row IDs, row discriminator, payload validation, and selection. Corrected duplicate bars upsert both `payload` and `source`. Rows lacking v2/exact identity are unavailable rather than merged. | `server/trading/setup-history.ts` |
| Immutable source clocks | Setup base/daily/hourly and session auxiliary bars use acquisition cutoffs before retention and analysis. A deliberately skipped optional hourly feed is treated as empty rather than validated as source candles. Timeframe bias uses `min(global request start, feed.requestedAt/fetchedAt)` for completed-bar classification while receipt-time freshness continues to use the observed clock. | `server/trading/setup-service.ts`, `server/trading/bias-router.ts` |
| Daily acquisition | Setup analysis always requests `1d` source history and the session acquisition fixture now supplies valid daily bars. Existing missing/current-bar source guards remain asserted. | `server/trading/setup-service.ts`, `tests/trading/session-source-acquisition.test.ts` |
| Paper balance | Proposal sizing imports `loadCanonicalPaperBalance(userId)` and passes that complete-ledger result to `proposePaper`; the accepted client `balance` field is compatibility-only and not used as a fallback. | `server/trading/paper-balance.ts`, `server/trading/setup-service.ts` |

## Targeted validation

All checks below are source-only, pure, or fully mocked; they made no real network or database request.

| Command / tests | Status | Coverage added or confirmed |
|---|---:|---|
| `pnpm check` | Passed | TypeScript no-emit check |
| `tests/trading/broker-read-refresh.test.ts` | Passed (3) | Selected-account change forces account/catalog/quote origin resolution; opaque identities differ and contain no raw account ID |
| `tests/trading/setup-history-source-identity.test.ts` | Passed (2) | Exact v2 identity selection, legacy rejection, identity-scoped capture, corrected duplicate payload/source upsert using a fully mocked DB |
| `tests/trading/strategy-quote-observations.test.ts` | Passed (15) | Durable v2 opaque identity persistence, same-label identity substitution rejection, legacy no-synthetic-identity behavior |
| `tests/trading/pdc-continuation.test.ts` | Passed (17) | Exact declared quote identity, legacy label-only rejection when a quote declares an identity, PDC continuation guards |
| `tests/trading/timeframe-bias.test.ts` | Passed (10) | Slow response cannot promote a bar that was forming at immutable request cutoff; receipt freshness stays separate |
| `tests/trading/session-source-acquisition.test.ts` | Passed (3) | Always-`1d` acquisition, valid daily fixture, retained/current source-bar guards |
| `tests/trading/paper-balance.test.ts` | Passed (3) | Complete bounded durable ledger balance, invalid ledger fail-closed, pagination bound |
| `tests/trading/paper-proposal-canonical-balance.test.ts` | Passed (1) | Fully mocked proposal ignores a client `balance: 999999999` and receives canonical balance `12345` |
| **Combined targeted run** | **Passed: 8 files / 54 tests** | `pnpm exec vitest run` over the eight files listed above |

## Remaining cross-dependencies / handoff notes

1. The existing market/router owner gate remains the authorization boundary for broker adapter calls; keep it in place when integrating concurrent parent changes. The direct adapter exports continue to be server-internal read helpers.
2. No schema migration is required: retained-history uses the existing indexed `source` column only for the opaque discriminator and validates v2 payload identity before reuse. Existing legacy rows intentionally remain unavailable until recaptured.
3. Other concurrently modified areas still need the parent agent's later full-suite/integration pass. This repair intentionally ran only the requested targeted suite; it did not run the full suite.
4. No live freshness, entitlement, broker account selection, or database state was claimed or tested.

### Original read-only findings and evidence

# Audit 03 — Market feeds, timeframes, and provenance

**Baseline:** `c58be4d` (repository already contained unrelated owner changes/artifacts; none were edited).
**Method:** source/fixture and existing artifact review only. No live broker, Coinbase, FMP, AI, account, or database request was made.

## Confirmed findings

| Severity | Finding | Evidence | Small feasible correction |
|---|---|---|---|
| High | **Daily/hourly setup evidence can cross its acquisition cutoff.** | `server/trading/setup-service.ts:223-227` correctly excludes a base bar that was still forming when its request began. In contrast, `:248-253` retains daily/hourly bars through the later `now`, `:303-304` passes their raw responses to analysis, and `:309` supplies a later wall-clock `now`. `lib/trading/setup-engine.ts:1041-1045` then treats bars closed by that later clock as eligible. A response that began before a 1h/1d boundary and returns after it can therefore promote that bar into profile/PDC/HTF evidence. | Derive `dailyCutoff` and `hourlyCutoff` with the existing `acquisitionCutoff(feed)` helper; filter each feed before both `retainBars` and `analyzeSetups`. Keep the later clock for quote receipt, rather than allowing it to reclassify already-requested candles. Add mocked slow-response boundary cases for 1h and 1d. |
| High | **TradeLocker’s declared identity is not specific to the selected account/instrument route, so caches and persisted quote/history provenance can bridge a source selection change.** | `server/trading/tradelocker.ts:117-120` keys quote/bars only as `quote:${symbol}` / `bars:${symbol}:${timeframe}` and returns constant `sourceIdentity: "tradelocker-selected-account"`; the quote label is also constant. However the actual read is account/INFO-route specific (`:73`, `:117`, `:119`). `server/trading/strategy-quote-observations.ts:251-263` keys durable quote observations by that non-specific source label; `lib/trading/pdc-continuation.ts:230-248` accepts a TradeLocker quote through a provider-prefix fallback rather than an exact opaque source identity. Thus an account/route/source-side change for the same `TL:<id>` can reuse a prior quote as the same-source PDC crossing or serve a short-lived cached read from the old selection. | Create a non-secret opaque broker-source fingerprint from selected account + instrument + INFO route + declared bar source. Resolve the instrument/account before broker cache lookup and include this fingerprint in quote/bar keys, feed identity, and durable observation key/payload. Require exact matching quote origin in PDC; do not rely on a `TradeLocker ·` prefix. Never expose raw account IDs or credentials. |
| High | **Retained setup candles have no source-identity filter and cannot refresh a duplicate bar’s payload/source.** | `server/trading/setup-history.ts:24-45` uses an ID of owner/market/timeframe/bar time (not source), and duplicate insertion updates only `userId`, leaving old `payload` and `source`. `:50-69` returns only payloads and filters only owner/market/timeframe. `server/trading/setup-service.ts:255-261` combines that unlabelled retained history with the current source. Consequently older bars from a prior selected broker source can be analysed and narrated as the current source; source corrections at an existing bar time also remain stored. | Persist/use the opaque source identity as the history source discriminator, include it in the in-process captured-batch key, query retained history for that identity, and upsert current `payload` plus identity/source. Existing unlabelled rows should be ignored (fail closed) until recaptured, not merged. |
| Medium | **Native timeframe-bias rows use response time, not the feed’s request cutoff, when deciding whether a bar is complete.** | `server/trading/bias-router.ts:191-205` sends `now()` after `getCandles` returns into `deriveTimeframeBias`; `lib/trading/timeframe-bias.ts:139-155` accepts a bar closed by that value. This ignores `CandleFeed.requestedAt` even though it is present (`server/trading/market.ts:39-55`) and native Coinbase/TradeLocker feeds populate it (`:546-560`; `server/trading/tradelocker.ts:119`). Derived feeds are safer because `market.ts:472-490` aggregates at `min(Date.now(), source.requestedAt/fetchedAt)`, but native rows remain vulnerable to a slow response crossing a boundary. | In `fetchTimeframeBias`, calculate the same per-feed cutoff (`min(request-start, feed.requestedAt ?? feed.fetchedAt) / 1000`) and pass it as the derivation clock; retain receipt-time freshness separately. Add a unit test where a 1m bar closes after request start but before response receipt. |

## Verified controls in scope

- **Owner gate before public broker cache paths:** `server/trading/market.ts:461-471` calls `requireBrokerOwner` before derived or native broker dispatch; `server/trading/router.ts:80-153` sends request identity to market calls and exposes the private catalog/status only after `brokerOwner`.
- **No implicit native broker 30m:** `server/trading/tradelocker.ts:119` rejects derived broker resolutions; `server/trading/market.ts:472-524` builds 30m from 15m and uses the lower feed’s request cutoff.
- **30m completeness/gaps:** `lib/trading/timeframes.ts:65-80` requires exactly two aligned, contiguous 15m periods and omits incomplete/current/duplicate buckets. Existing `tests/trading/timeframes.test.ts:30-63` covers valid, missing, current, off-grid, and duplicate cases.
- **Declared provider semantics:** Coinbase marks volume `venue`, daily period `utc-continuous-24h`, and a continuous UTC session (`server/trading/market.ts:554-567`). TradeLocker marks volume only `broker-reported` when raw values are safely numeric and otherwise `unknown`, and only declares UTC provider trading-day semantics for aligned 1D responses (`server/trading/tradelocker.ts:119`). Session rules require explicit broker-proxy opt-in (`lib/trading/session-strategy-model.ts:159-169`).
- **Gap/stale refusal:** aggregate helpers omit gaps; `lib/trading/freshness.ts:98-223` independently evaluates completed-bar and receipt age; PDC session logic requires exact bars and fails/withholds missing data (`lib/trading/pdc-continuation.ts:130-168`, `:601-700`).
- **Recent trace reviewed, not reopened/read live:** `artifacts/nas100-orb-live-check-final.txt:3-18` records an earlier read-only `TL:3884` / NAS100 BID-bar trace with a `0.01` instrument-details tick and exact-15m range. It also records zero database writes/orders/schedules/AI requests (`:143-147`). This supports only that prior trace, not current feed/device freshness.
- **Targeted existing unit/mocked regressions:** `pnpm exec vitest run` on `timeframes`, `market-retry`, `tradelocker`, `broker-read-refresh`, and `session-source-acquisition` completed **23/23 tests passed** across **5/5 files**. They were inspected first: pure or `vi`-stubbed fetch/dependency tests, with no real database/provider writes.

## Limits / unsupported feeds

- No live source read was performed; this audit does not establish current NAS100 availability, current quote/bar freshness, a device runtime, or broker entitlement.
- Exchange futures remain intentionally unsupported without a licensed connected feed (`server/trading/market.ts:536-541`); this is an explicit refusal, **not** a defect.
- FMP lacks declared session metadata and is deliberately refused for derived 4h/weekly use (`server/trading/market.ts:438-459`, `:596-612`); this is an explicit provenance limitation, **not** a defect.
- The supplied NAS100 trace does not prove an exchange-futures venue, volume type, predictive validity, real execution, or automatic paper consent. The app remains owner-only and paper-only; no public link or publication was created.


## Paper sizing and lifecycle

### Repair record

# Repair 04-paper — Canonical paper lifecycle

## Scope completed

Only the assigned paper lifecycle modules, two new typed helpers, and focused tests were changed. No plan/TODO/config/schema/migration/service/port/owner-record files were edited. No database, provider, account, model, network, order, proposal, upload, scheduler, or push operation was invoked.

## Implemented corrections

- **Canonical balance authority:** Added `server/trading/paper-balance.ts` with exported `loadCanonicalPaperBalance(userId): Promise<number>`.
  - Reads the canonical workspace starting balance and every current owner-scoped durable paper trade page (`20 × 100` maximum), then derives realised equity through the existing `paperPerformance` logic.
  - Fails closed with `PRECONDITION_FAILED` for missing/non-positive/non-finite starting equity; malformed, duplicate, non-finite, or closed-without-exit ledger records; invalid/repeated cursors; or an incomplete ledger beyond the bound.
  - Has no client balance argument and performs no writes.
  - `createPaperOrder` now sizes/risk-checks against this canonical balance rather than `proposal.initialRisk / capPct`. It re-reads the balance immediately before insert and fails closed if it changed while the order was being checked.
- **Conservative same-bar lifecycle:** After a **bar-based** partial moves the stop to break-even, a bar that also reaches that new stop closes the remainder at break-even before target credit. Long and short mocked regressions cover the ambiguous OHLC path.
- **Terminal immutability:** Closed and cancelled records permit only an exact-bracket, exact-management review revision. Any review request that changes stop, target, or explicit `autoManage` is rejected.
- **Duplicate insert race:** A duplicate-insert reread now requires both the original `setupId` and `entryMode`; a mismatched stored mode/evidence returns `CONFLICT` instead of returning the other mode's trade.
- **Idempotent cancellation:** An already-cancelled plan returns before optimistic-version comparison, allowing safe retry after a lost successful response without a second event.
- **Management assessment contract:** `managePaperTrades` now returns typed `PaperManagementResult` with the existing `trades` mutation array plus separate `checkedIds`. An ID is included only after its fresh quote has been successfully assessed, including no-transition checks.
- **0.5% ticket preservation:** Added pure `lib/trading/paper-risk-template.ts`; the sheet retains 0.5% and displays it as a selectable risk template. Unsupported selection normalizes to 0.5%, never 1%.

## Focused regression evidence

Command (all persistence/provider dependencies mocked, except the pure lifecycle function):

```sh
pnpm exec vitest run tests/trading/paper-lifecycle.test.ts tests/trading/paper-balance.test.ts tests/trading/paper-service.test.ts tests/trading/paper-plan-sheet.test.ts
```

Result: **4 files passed, 38 tests passed**.

`git diff --check` passed for the scoped files. No full suite, install, build/export, real integration, device, push, inference, or deployment check was run.

## Parent integration notes

1. **Feed03 proposal sizing:** import `loadCanonicalPaperBalance` directly from `server/trading/paper-balance` and use its returned number as the sole balance passed to proposal sizing. Do not add a client-balance fallback; its `PRECONDITION_FAILED` result is intentionally fail-closed.
2. **Alerts06 processing:** retain `paperUpdates.trades` for actual paper mutations. Use `paperUpdates.checkedIds` for the real set of fresh management assessments/processing heartbeat records; do not infer checks from `trades`.
3. **Parent-owned chart state:** the sheet now preserves/exposes 0.5%, but the parent still needs to change the owner `index.tsx` initial paper-risk state from 1 to 0.5 as assigned.
4. This remains paper-only. These source tests do not establish actual provider freshness, device behavior, closed-app scheduling/push, database runtime behavior, real account access, inference, or deployment.

### Original read-only findings and evidence

# 04-paper — Canonical manual and gated paper lifecycle audit

**Baseline inspected:** local `c58be4d` (working tree was already dirty before the audit: `plan.md`, `TODO.md`, and unrelated artifact/research paths; the scoped test run caused no additional status changes). **Mode:** read-only source audit; no application source, database, proposal, order, account, AI, network, scheduler, service, port, or owner data was changed/requested.

## Verified behavior

- **Owner-only canonical API:** all proposal/order/history/manage endpoints use `ownerProcedure` (`server/trading/setup-router.ts:49-123`). Canonical paper rows are owner-scoped and use an optimistic version predicate for updates (`server/trading/setup-history.ts:125-179`).
- **Manual versus gated entry:** the sheet labels manual practice separately from gated strategy execution (`components/trading/paper-plan-sheet.tsx:252-281`). Strategy mode rereads canonical strategies, reanalyses current source facts, checks same strategy/config/version/direction and rejects stale or missing approval (`server/trading/paper-gate.ts:45-126`). Manual practice retains an explicit unknown snapshot rather than claiming a signal.
- **Observed pricing:** market-style long entries use current ask and shorts bid; manual closes use long bid/short ask (`server/trading/paper-service.ts:415-420,854-890`). Pending limits open only when the executable side quote crosses the requested limit (long ask/short bid), never from price-only data (`lib/trading/paper-observations.ts:102-190`). Freshness rejects non-live, stale, and excessively future quotes (`server/trading/paper-service.ts:59-70`).
- **Source brackets:** session and ORB strategy fills require a current market-style entry and exact source stop/target geometry; a limit/manual override is rejected in strategy mode (`server/trading/paper-service.ts:555-670`). Generic paper plans explicitly retain editable bracket behavior.
- **Lifecycle and management:** cancellation needs a fresh quote and only applies to pending records; manual close only applies to open records. Automatic partial/BE/exit management is explicit `autoManage` opt-in; manual positions merely retain observed MAE/MFE and are not auto-closed (`server/trading/paper-service.ts:935-1058`, `lib/trading/paper-lifecycle.ts:190-425`). Session/ORB automation defaults off unless strict saved, enabled, armed, unexpired consent is present, uses strategy mode, and sets management off (`server/trading/session-auto-paper.ts:106-150,1442-1459`; `server/trading/orb-auto-paper.ts:118-165,1109-1126`).
- **P/L and drawdown:** closed plus partial realized P/L is separated from current marked remainder; missing/stale marks are withheld. Daily realized drawdown is derived from timestamped partial/close ledger entries (`lib/trading/paper-performance.ts:3-81`).
- **Focused safe test evidence:** 12 existing pure or fully mocked unit files passed, **83/83 tests**: paper form/gate/lifecycle/observations/performance/processing/service/pending gate/session fill/ORB fill/session automation/ORB automation. Their inspected fixtures mock persistence and quote/source operations or exercise pure helpers; no real database write or provider/AI/account request was made.

## Confirmed findings

| Severity | Finding | Evidence | Small feasible correction |
|---|---|---|---|
| **high** | **Manual proposal sizing trusts a client-provided balance instead of the canonical paper ledger.** | `proposalSchema` accepts arbitrary positive `balance` (`server/trading/setup-service.ts:65-69`), and `createProposalWithinBudget` passes it directly into `proposePaper` and persists the resulting proposal (`:466-508`). `proposePaper` derives quantity/initial risk from that balance (`lib/trading/setup-engine.ts:1693-1735`). At confirmation, `createPaperOrder` reconstructs balance from proposal `initialRisk / capPct`, rather than loading canonical starting balance and realized P/L (`server/trading/paper-service.ts:493-510`). The native caller also supplies a local workspace-derived balance (`app/(tabs)/index.tsx:624-636`). A stale or crafted client proposal can therefore authorize sizing/risk unrelated to the durable paper balance; the later drawdown check only blocks at the cap, not this sizing authority. | Remove `balance` as an authority input. In proposal construction, load the canonical workspace and complete bounded canonical paper ledger, derive balance with the existing performance logic, fail closed if it cannot be fully read, and use that server value for sizing. Recheck/derive against canonical state immediately before write as appropriate; keep client balance display-only. Add a mocked regression showing an inflated input balance cannot increase allowed quantity. |
| **medium** | **A same-bar partial followed by break-even can be credited as a full-target win despite the conservative ambiguous-bar policy.** | The manager checks only the original stop first (`lib/trading/paper-lifecycle.ts:336-355`). It then takes a partial and moves the remaining stop to entry (`:356-403`) before independently credits the target (`:405-421`), without testing whether the same OHLC bar also crossed the newly created break-even stop. Existing fixture `tests/trading/paper-lifecycle.test.ts:55-63` supplies long entry 100, partial 110, target 115, bar low 99/high 115, and asserts full target closure. If the high hit partial first then the low hit 100, the remaining half should have exited at break-even; the path is unknowable, so target credit is not conservative. | After a bar-based partial creates the BE stop, check whether that same valid bar reaches the new stop before allowing the remaining target. On both remaining-stop and target reach, close the remainder at BE (stop-first); retain the partial event. Add long/short ambiguous-bar regressions and adjust the current fixture expectation to partial gain plus BE remainder. |
| **medium** | **A cancelled plan’s supposedly immutable bracket can be altered by including any review text.** | The terminal guard throws only when a closed/cancelled trade has `review === undefined` (`server/trading/paper-service.ts:790-798`). A cancelled trade with a review proceeds into `if (old.status !== "closed")`, where it accepts and writes changed stop, target, and `autoManage` (`:799-852`). The owner endpoint schema allows all of those fields plus optional review (`server/trading/setup-router.ts:90-101`). This contradicts the method’s own immutable-cancelled-plan message and permits history mutation through a normal API call. | Treat both `closed` and `cancelled` as terminal before bracket mutation. Permit a review-only revision only when stop/target/management equal stored values (or ignore them server-side); otherwise return `BAD_REQUEST`. Add a mocked cancelled-with-review-and-changed-bracket rejection test. |
| **medium** | **Concurrent same-proposal practice/strategy requests can return an order created in the other mode.** | A pre-existing order is checked for `entryMode` mismatch before creation (`server/trading/paper-service.ts:393-404`). But when two requests both observe `NOT_FOUND`, the loser’s duplicate-insert handler blindly returns `paperTrade(user.id, id)` (`:762-770`) without checking the stored mode. Thus a racing strategy request can report success with a practice record (or vice versa), defeating the intended distinct manual/gated audit meaning even though only one row exists. | In the duplicate handler, reread then require the existing `setupId` and `entryMode` to match the request; return `CONFLICT` for a mode mismatch. Add a fully mocked interleaved duplicate-insert regression for practice-vs-strategy requests. |
| **low** | **Cancel replay is not idempotent after a successful cancel response is lost.** | `closePaperTrade` returns an already closed record before version validation (`server/trading/paper-service.ts:854-859`). `cancelPaperTrade` instead validates expected version first (`:898-908`), then sees only-pending status. A retry with the original version after successful cancellation produces `CONFLICT`, not the saved cancelled record, although it cannot safely create a second cancel event. | Mirror close behavior: if the owner-scoped record is already `cancelled`, return it before the version comparison; retain conflict behavior for open/pending competing transitions. Add a retry-after-response-loss mocked test. |
| **medium** | **The standard UI cannot retain the required 0.5% reference-risk default and silently promotes it to 1%.** | Project requirements retain default/reference 0.5% (`plan.md:198-202`, `TODO.md:78-79`). The chart defaults unset paper risk to `1` (`app/(tabs)/index.tsx:233`) and the ticket’s recognized choices are only `[0,1,2]`; opening with 0.5 invokes `onRiskPctChange(1)` (`components/trading/paper-plan-sheet.tsx:35,82-86`). Its visible buttons likewise expose only 1%, 2%, and fixed units (`:300-316`), while the backend still accepts 0.5 (`server/trading/setup-service.ts:57-64`). That doubles the configured default risk rather than preserving the approved reference option. | Default to `0.5`, include `0.5` in the ticket’s recognized/visible templates, and preserve it through proposal refresh. Keep server validation and exact cap math unchanged; add a component/unit regression that opening the ticket with 0.5% does not request 1%. |

## Limits

- This was a source and synthetic/mock-fixture audit only. It does **not** establish real provider quote freshness, TradeLocker instrument/valuation behavior, device UI behavior, actual browser/session access, managed-DB runtime behavior, deployed scheduler execution, or closed-app lifecycle operation.
- No full suite, install, build/export, runtime server, port, browser, external research, real order/proposal creation, database write, AI request, account request, or image attachment access occurred. The focused unit pass is useful regression evidence, not proof of device/runtime prerequisites.
- Existing history UI intentionally retains a legacy local archival path for old non-`orderType` records (`app/(tabs)/trades.tsx:94-140`); new Chart Buy/Sell records take the canonical durable route. This audit did not migrate or mutate legacy owner history.


## Strategy rules and confluence

### Repair record

# Repair 05 — Strategies

**Scope:** owner-only, paper-only Session/PDC source geometry and strategy revision rollback.  This repair made no provider, account, database, model, network, order/proposal, upload, schedule, push, or consent operation. No upload image was opened.

## Completed fixes

1. **PDC `previous-day-extremes` now has source-owned paper geometry.**
   - `SessionStrategyContext` carries `previousDay` only when the detector has already verified a causal daily provider row. It includes finite high/low, ISO provider-row date, close time, provenance label, and optional opaque source identity.
   - `sessionPaperGeometry` has an explicit `previous-day-extremes` branch: long uses verified prior-day high and short uses low. It refuses absent/non-finite/non-positive values, an at/behind target, a missing current quote, mixed origins, and forged source context. It does **not** fall back to a premarket range, owner key level, or generic R target.
   - PDC quote matching now requires the exact opaque identity whenever one is declared. Provider-prefix matching was removed. Legacy fixtures remain accepted only when no identity is declared and the quote/source labels are exactly identical.
   - Daily and execution source identities also fail closed if either side declares an identity but the other is missing or differs. Invalid PDC/quote evidence now makes the source risk guard failed rather than presenting an unknown safe-looking bracket.

2. **Restore-as-new-revision now restores source configuration faithfully.**
   - Added pure helper `lib/trading/strategies05-revision-restore.ts`.
   - Restores cloned `orbConfig` and `sessionConfig`, explicitly assigning `undefined` when the historical revision omitted either configuration.
   - Always clears `confluence` on rollback, preserving reapproval requirements for the newly incremented revision.
   - The Strategies history marker now also identifies stored ORB configuration.

## Regression coverage

All executed tests were inspected pure in-memory fixtures before invocation; they import no server routes and do not make provider/database/account/order/schedule calls.

```text
pnpm exec vitest run \
  tests/trading/pdc-continuation.test.ts \
  tests/trading/strategies05-session-paper-geometry.test.ts \
  tests/trading/strategies05-revision-restore.test.ts

3 files passed, 21 tests passed
```

New coverage proves:

- ready detector -> verified previous-day context -> paper-only proposal keeps the daily high target;
- a forged cross-origin current quote is rejected again by actual source geometry;
- a `TradeLocker · ...`-style provider label prefix cannot bypass an opaque identity, while identical legacy labels still pass;
- rollback clones both configurations, prevents mutation of historical snapshots, clears stale confluence, and explicitly restores missing configurations as `undefined`.

`prettier --check` passed for all scoped files and `git diff --check` passed.

## Integration notes / remaining dependency

- **Feed 03 integration is required for identity-declared production PDC:** `SetupInput.sourceIdentity` is already forwarded to the detector, but the current `Quote` shared contract exposes only `source`. Therefore the feed repair must persist/forward the same opaque broker fingerprint in `Quote.source` (or add a shared quote identity field and update this PDC contract together). Until then, a feed that declares a candle identity but supplies a human quote label is deliberately rejected; there is no provider-prefix bypass.
- `pnpm check --pretty false` was attempted after the scoped tests. It is blocked by concurrent, out-of-scope errors only:
  - `components/trading/ai-forecast-panel.tsx:67` and `components/trading/scenario-layer-manager.tsx:282` — hook/function expects one argument but receives zero;
  - `components/trading/source-analysis-job.tsx:32` — status label record lacks `cancelled` and `indexing-image`;
  - `server/trading/orb-auto-paper.ts:1114,1211` — `string | undefined` supplied where `string` is required.
  None originate in this scope; no out-of-scope edits were made.

## Boundaries retained

The change remains owner-authority preserving, paper-only, default-off for automation, strict about source clock/volume/risk evidence, probability-null, and does not claim broker execution, device behavior, deployment, push delivery, or inference.

## Parent integration correction

The feed finishing pass moved opaque quote origins into `Quote.sourceIdentity`, keeping human-readable provenance separate. The final integrated suite exposed that this scope's prior-day geometry and its older fixture still compared `Quote.source` to that fingerprint. The parent corrected the actual geometry comparison and fixture fields rather than relaxing source equality. Prior-day date, matching PDC close time, source chronology and a non-inverted range are also required. The initial corrected source/geometry run passed24tests across three files; the final report header records the later dated-context regression and full-suite result. The earlier cross-dependency/compiler notes above describe the worker's handoff state and are superseded by this correction and the final integrated checks.

### Original read-only findings and evidence

# Strategy adoption, native confluence, and source geometry — read-only audit

**Audit ID:** 05-strategies
**Baseline supplied:** `c58be4d`
**Method:** Static source/data-flow review plus one isolated pure-function reproduction. No source, owner data, database, configuration, git, schedule, consent, port/service, AI, account, or network operation was performed. No `/home/ubuntu/upload/*.PNG` attachment was opened.

## Confirmed findings

| Severity | Finding | Evidence | Feasible small correction |
|---|---|---|---|
| **high** | **A PDC strategy configured for valid dynamic `previous-day-extremes` cannot produce its source-owned paper geometry.** | `lib/trading/pdc-continuation.ts` deliberately supports the mode; the existing unit fixture proves a complete same-provider daily high produces `ready: true` and a dynamic target (`tests/trading/pdc-continuation.test.ts:594-623`). But `lib/trading/session-paper-geometry.ts:78-89` handles only `owner-key-levels`; every other PDC target mode requires a complete premarket range and `premarketStartMinute`. Thus the distinct dynamic-PDH/PDL mode always throws the premarket-range error before it can use its detected target. The isolated no-I/O reproducer at `artifacts/app-audit/05-strategies-pdc-dynamic-geometry.repro.ts` printed: `The explicitly declared complete premarket target range is unavailable.` | Add an explicit `previous-day-extremes` branch. Carry only the already-validated, same-source prior-day high/low needed for this source-owned bracket in `SessionStrategyContext`, then select high for long / low for short only when finite, current, and beyond entry. Keep the present rejection for unavailable/mixed/behind extremes; do not substitute a premarket range, owner target, or generic R target. |
| **medium** | **“Restore vN as a new revision” does not restore ORB source configuration, and can retain a stale confluence object.** | Strategy history is typed to retain both `orbConfig` and `sessionConfig` (`lib/trading/model.ts:66-74`), and ORB configuration saves snapshot the prior strategy (`app/(tabs)/strategies.tsx:726-735`). The restore handler copies name/description/factors and `sessionConfig`, but never assigns `orbConfig` (`app/(tabs)/strategies.tsx:1049-1062`), so an ORB rollback labels/restores an old rule revision while silently keeping the newer ORB market/tick/clock/risk config. It clears confluence only if the historical entry has `sessionConfig`; other restores retain `s.confluence` even though `change()` increments the strategy version (`app/(tabs)/strategies.tsx:285-301`). Current gate version checks prevent that retained contract from authorizing an entry, but it is stale state presented in an explicit source rollback flow. | In the restore recipe clone-and-assign `orbConfig` exactly as for `sessionConfig` (including setting it `undefined` when absent), and unconditionally set `confluence: undefined` for every restored source revision. Optionally display the existing `orbConfig` history marker alongside the session marker. This preserves fail-closed reapproval after any restored rule/config source changes. |

## Controls traced and found fail-closed in this scope

- **Adoption/versioning:** reference strategies cannot be directly edited; personal changes increment version and retain bounded snapshots (`app/(tabs)/strategies.tsx:285-301`). Canonical strategy paper evidence rejects missing/changed strategy versions and changed confluence config versions (`server/trading/paper-gate.ts:56-105`).
- **Independent overlays and source selection:** chart visibility is separate from selected analysis strategies (`components/trading/setup-panel.tsx:43-76`); the chart sanitizes archived configured IDs before analysis (`app/(tabs)/index.tsx:216-243`). AND/OR selection remains explicit in `setup-engine`/panel, and unsupported strategies are not silently passed under ALL (covered by `tests/trading/setup-engine.test.ts:55-74`).
- **Native confluence:** bindings are candidate-local native closed-OHLC steps with a fixed two-timeframe freshness policy (`lib/trading/confluence-runtime.ts:520-556`). Timing, unknown/stale/future/incomplete evidence blocks rather than passes; ORB and session families add non-removable current critical source/clock/risk guards (`lib/trading/confluence-runtime.ts:639-769`).
- **ORB/NAS100 source geometry:** NAS100 preparation accepts only an exact `TL:<id>` NAS100 CFD market and its returned broker increment (`server/trading/orb-instrument-preparation.ts:31-84`). Runtime requires confirmed matching market/tick metadata and rejects aliases/futures equivalence (`lib/trading/confluence-runtime.ts:659-675`; `server/trading/orb-auto-paper.ts:340-367`). No display-decimal/CME-tick fallback was found.
- **Session/PDC causality:** PDC enforces a two-observation, same-source, short-interval quote cross and disallows later volume from certifying an old cross (`lib/trading/confluence-runtime.ts:725-768`; `server/trading/strategy-quote-observations.ts:139-249`). Unknown or broker-reported volume remains blocked unless the labelled proxy policy is deliberately selected (`server/trading/instrument-preparation.ts:139-170`).
- **Paper automation:** absent/disabled automatic session and ORB settings are explicitly **off** (`server/trading/session-auto-paper.ts:106-156`; `server/trading/orb-auto-paper.ts:118-167`). The reviewed paths require canonical owner state, expiry, same-version approval, fresh source evidence, and paper-only order construction. No arm, check, schedule, or order was invoked.

## Checks performed

1. Read the task-referenced `plan.md` and `TODO.md`, then traced the Strategies screen, strategy model/presets/setup engine, confluence contract/runtime, setup/paper routers and service gates, ORB/NAS100 preparation/detector/auto controls, and London/IB/PDC detector/editor/auto paths.
2. Read existing mocked/unit-only test sources for setup/confluence, ORB NAS100, session strategy, PDC continuation, and source acquisition; did not run the full suite or any data-writing/integration test.
3. Ran only `artifacts/app-audit/05-strategies-pdc-dynamic-geometry.repro.ts` via the already-installed local TypeScript runner. It is a pure in-memory call with synthetic values; it made no API, AI, account, database, workspace, proposal/order, schedule, or service request.
4. Did not start or contact ports **8081** or **3000**. No public link or publication was created.

## Limits

- The supplied historical baseline result (753 passed / 0 failed / 1 existing auth skip and builds/exports) was not treated as runtime or device proof.
- Per audit constraints, real market/provider data, actual NAS100 broker metadata, managed production DB records, cloud workspace state, paper orders, automatic checks, schedules, and account/AI calls were not read or exercised. Consequently device behavior, deployed callbacks, entitlement availability, and real-time feed behavior remain unverified.
- This report covers only the assigned strategy adoption/confluence/source-geometry scope. Concurrent owner changes visible in repository status were not inspected or modified.


## Alerts and automatic paper

### Repair record

# Alerts and automatic-paper repair

The scoped implementation adds conditional pending outbox claims and bounded sending leases, records all device tickets/receipts in owner-scoped runtime state, retires invalid devices and aggregates delivery conservatively. Owner monitoring activation uses a same-connection advisory lock; ambiguous multiple mappings fail closed and failed local binding requests compensation of the newly created remote task. This introduces no live schema migration or activated schedule.

ORB now reloads canonical consent/revision and the complete paper ledger after source work, before a durable claim and immediately before the canonical order call. Risk, same-market occupancy, local-day cap, expiry and source clock are rechecked. The updated Off fixture expects no unused claim when consent is already off.

Paper management reports actual successful fresh assessments separately from mutations. The parent replaced the worker's guessed optional checkedTradeIds property with the real typed paperUpdates.checkedIds, retaining updatedTradeIds separately. A no-change assessment can therefore be shown as Server checked without claiming that any bracket changed or a phone received an alert.

The scoped pure/mocked run passed 20 tests across four files; final integrated evidence appears in the report header. No real push, schedule, database, paper trade, account, model or device operation occurred. Deployed callback, signed native build, permissions, credentials and physical-device delivery remain prerequisites, not completed outcomes.

### Original read-only findings and evidence

# 06 — Alerts, automatic paper, and published background path

**Scope:** notifications and Alerts UI; deployed scheduler/callback identity; ORB/session automatic-paper controls and runners; scan budget; paper-processing status.
**Baseline audited:** local commit `c58be4d` (source read only). No schedule, push, paper record, device enrollment, account, provider, or AI request was made.

## Outcome

The code has strong fail-closed building blocks: owner-only routers/UI, no automatic-paper settings in `initialWorkspace`, 24-hour explicit auto-paper arms, shared ORB/session advisory lock, immutable proposal IDs, authenticated task-to-owner callback mapping, 45-second/12-broker-read scheduled context, and a captured-event fetch before native push-tap chart navigation. The focused fixture/unit subset passed **56/56 tests in 9 files** with `--no-cache`; those tests mock persistence/providers or test pure code and did not make real writes.

The following defects are concrete implementation gaps.

| Severity | Finding | Evidence | Small correction |
| --- | --- | --- | --- |
| **high** | **ORB can create a second same-market automatic paper trade after its long source awaits.** | `checkOrbAutoPaper` performs ledger/risk/daily-cap/active-market checks only at `server/trading/orb-auto-paper.ts:889-920`, then awaits analysis and quote work (`922-1008`). Its only later reread is consent/config (`1090-1104`) before `createPaperOrder` (`1109`). A concurrent manual paper order is not protected by the auto lock; `createPaperOrder` only caps *total* active trades at 100 (`server/trading/paper-service.ts:686-692`), not same-market occupancy or the ORB daily cap. The session implementation correctly has later ledger/risk/cap/position rereads at `session-auto-paper.ts:1275-1321` and `1412-1439`. | Mirror the session path: after all source awaits and again immediately before `createPaperOrder`, reread the canonical workspace/ledger and rerun ORB risk/discipline, same-market pending/open, local-day cap, scope/version/expiry checks. Add a fixture that inserts a conflicting manual trade during source work and asserts no ORB claim/order. |
| **high** | **Concurrent monitoring activation can create multiple valid scheduled tasks for one owner.** | `tradingSchedules` permits many rows for a user because only `taskUid` is primary (`drizzle/schema.ts:63-67`). `activateSchedule` separately reads an existing row (`server/trading/notifications.ts:879-883`), creates the remote job (`911-921`), then inserts without an owner uniqueness/claim (`922`). Two devices/retried requests can both observe no row, create distinct tasks, and insert distinct valid mappings. The callback accepts either mapped `taskUid` (`1010-1032`), so both run the scan. | Add a unique `userId` constraint/migration and serialize activation with a transaction-bound per-owner claim/advisory lock. Create the remote task only for the successful claimant; on local insert conflict/failure, remove or safely reconcile the just-created remote task. Treat duplicate mappings as blocked rather than selecting arbitrary `limit(1)`. |
| **high** | **The alert outbox has no durable cross-process claim, so one event can be pushed twice.** | Each scan reads all `pending` events (`server/trading/notifications.ts:815-836`). `pushEvent` then unconditionally changes the row to `sending` (`248-270`) and posts it (`272-282`). Two server instances/callbacks can both select the same pending row before either update, both send it, and finally overwrite the same event delivery state. The process-local `running` map at `853-861` does not coordinate replicas or duplicate schedules. | Atomically claim one event with `UPDATE ... WHERE id=? AND userId=? AND delivery='pending'` (or a dedicated outbox row with a unique event key and lease); send only if `affectedRows === 1`. Store an attempt timestamp/lease and recover expired `sending` claims with a bounded policy so a process crash does not strand them forever. Add a two-worker fixture asserting a single transport invocation. |
| **medium** | **Receipt tracking is only for the first accepted device, not each device that received a ticket.** | One event has only one `receiptId` (`drizzle/schema.ts:53-60`). `pushEvent` sends to up to ten tokens (`notifications.ts:254-258`), but persists only `valid[0]?.id` (`299-305`). `checkReceipts` polls only that one ID and sets the whole event `provider-accepted` if it is OK (`313-355`). A second device can have a later receipt error while the event reports success. | Add an owner-scoped delivery table keyed by event and device/token (ticket ID, ticket state, receipt state, attempts); persist/poll every accepted ticket and retire tokens on ticket/receipt `DeviceNotRegistered`. Derive event-level status conservatively from all delivery rows. Keep device receipt distinct from actual display/tap proof. |
| **low** | **The paper badge can report “Foreground only” even after the scheduled worker successfully observed an opted-in bracket without changing it.** | `managePaperTrades` returns only changed trades (`server/trading/paper-service.ts:935-1058`), and `scan` records only changed auto-managed IDs (`server/trading/notifications.ts:802-814`). `verifiedPaperProcessing` requires the queried trade ID in `updatedTradeIds` (`server/trading/paper-processing.ts:11-34`), while the UI maps a failed match to **Foreground only** (`components/trading/stored-paper-history.tsx:312-316`). Thus a fresh scheduled quote that leaves the bracket unchanged is not represented as a verified scheduled observation. This is conservative (a false negative), not a false claim of background operation. | Have `managePaperTrades` separately return IDs with a fresh successful quote/assessment; record them as `checkedTradeIds` only after the scheduled path actually evaluates them. Use that field for a clearly worded “server checked” badge, retaining `updatedTradeIds` for mutations and never marking budget-deferred/failed positions as managed. |

## Verified safeguards and wiring

- **Default-off and scope:** `lib/trading/model.ts:648-672` creates no alerts, events, ORB auto-paper or session auto-paper settings. Both automatic controls require owner/cloud confirmation, explicit one-day expiry, market/strategy/risk/cap scope, and same-version approved gate (`components/trading/orb-auto-paper.tsx`, `components/trading/session-auto-paper.tsx`). ORB is foreground/visible only; session closed-app work separately requires `runWhenClosed` plus callback proof.
- **Owner/callback chain:** the callback verifies the platform cron cookie/JWT, app ID, expiry, cron identity, SDK task identity, DB task binding, and mapped approved owner before work (`server/trading/notifications.ts:995-1064`). It does not accept a body-supplied user/task ID. Event fetch is owner-scoped (`1088-1103`).
- **Budget and paper safety:** scheduled work is wrapped at 45 seconds and returns the consumed broker-read count (`notifications.ts:1033-1079`); targeted budget tests cover 12 reads and expired nested requests. Session automatic paper uses the shared owner lock and deterministic durable claim before paper lifecycle entry (`server/trading/session-auto-paper.ts:503-559, 1275-1469`).
- **Push/tap wiring:** payloads include bounded notification scope; foreground receipt/tap handlers validate it and fetch the canonical owned event before navigating (`components/trading/notification-controls.tsx:113-167`). Chart rendering uses fetched captured evidence only when it exists (`app/(tabs)/index.tsx:145-150, 246-250, 948-983`).
- **Scenario-direction dedup:** baseline/event update runs in an owner/rule transaction with `FOR UPDATE`, and the schema has a unique owner-rule index (`server/trading/scenario-directions.ts:44-160`; `drizzle/schema.ts:115-121`).

## Limits (not defects inferred from source)

- Source wiring and fixture tests do **not** prove a deployed scheduler, platform task execution, native signed build, physical-device permission/token registration, APNs/FCM configuration, push display/sound/badge, receipt, or tap behavior. Existing documentation labels these as separate activation/device evidence.
- A provider-accepted Expo ticket/receipt is not proof that a device displayed or tapped an alert. The code appropriately treats the device as unverified absent actual device evidence.
- This was a bounded read-only audit. No full suite/build/export, live endpoint probe, migration, schedule activation, port/service operation, or owner-data mutation was run. The pre-existing shared worktree had unrelated modified/untracked plan/TODO/artifact files; this audit did not modify source, data, configuration, Git, schedules, or services.


## Private Library and uploads

### Repair record

# Private Library and upload repair

The mounted and legacy scan paths now use durable source-analysis jobs with duplicate-source guards rather than synchronous model calls. Compatible image jobs include nonfatal visual indexing; originals and analysis survive index failures. Cancellation uses owner-scoped compare-and-swap and cancel-safe result persistence, so a started model call may finish but cannot save after successful cancellation.

Binary intake validates bounded decoding before retention. The installed local OpenCV decoder checks supported raster files with pixel limits; pdfinfo parses PDF page counts under a bound. Header-only/corrupt sources fail before storage. Photo search is consistently limited to 8 MiB before picker read and RPC transport.

A typed notes-backed purpose marker keeps trade screenshots review-only. These sources are excluded from generic extraction/indexing, keyword/visual matching, blueprint analysis, reindexing and promotion. Unknown purpose markers fail closed. The legacy full-original source procedure was removed; client source/workspace/version DTOs omit fileKey while protected preview and server revisions retain storage keys.

The original read-only finding that there was no deletion path was corrected by implementation inspection: the owner-confirmed workspace-tools deletion/reclaim path already exists. A scoped follow-up adds transactionally tracked pending cleanup for retained protected originals when the storage provider has no deletion method. Logical capacity reclamation is not falsely called physical object deletion.

The worker's focused mocked/pure run passed 42 tests across eight files. Final integrated diagnostics/results are recorded in the report header. No actual upload, deletion, model, storage, database, device, push or deployment operation was performed; the local image/PDF worker dependencies remain deployment requirements.

### Original read-only findings and evidence

# 07-library — Private Library uploads, learning, and source review audit

**Baseline inspected:** `c58be4d`
**Method:** read-only source trace plus five existing mocked/pure test files. No source, database, storage, configuration, Git, schedule, service, upload, account, network, or managed-AI action was performed. No `/home/ubuntu/upload/*.PNG` attachment was opened.

## Confirmed working safeguards

- Library's primary file path uses `sourceAnalysis.upload` (`app/(tabs)/library.tsx:188-229`), whose procedures are `ownerProcedure`-gated (`server/trading/source-analysis-router.ts:19-39`; `server/trading/access.ts:20-27`). Repository reads/revisions filter by `userId` and revisions use a compare-and-swap version condition (`server/trading/repository.ts:462-527`).
- Sources are AES-256-GCM encrypted before storage (`server/trading/repository.ts:385-436`). The newer `sourcePreview` path does owner-scoped source reads and returns bounded raster/text RPC data rather than a storage URL; it rasterizes PDFs and supports literal-evidence jumps (`server/trading/source-preview.ts:147-173, 349-403, 491-599`; `components/trading/source-preview.tsx:269-374`).
- The durable job route detects changed source versions, preserves failed originals, limits explicit retry to once, and does not auto-retry (`server/trading/source-analysis-jobs.ts:192-257, 343-385, 415-449`).
- Blueprint conversion correctly creates an **inactive** review style—`visible: false`, zero-weight disabled factors—with no strategy, alert, broker, fine-tuning, or executable-code authority (`lib/trading/library-blueprint-types.ts:220-294`). The model prompt/schema also forbid edge, probability, code execution, and fine-tuning claims (`server/trading/library-blueprint.ts:135-145, 221-259, 320-347`).
- The UI clearly separates keyword term overlap and HOG cosine output (`app/(tabs)/library.tsx:505-541`); vectors are owner-filtered and include explicit non-semantic/non-probability limitations (`server/trading/vectors.ts:36-50`).
- The inspected tests were unit-only: repository, DB, storage/fetch, and LLM boundaries are mocked where relevant; preview's synthetic raster test only writes a temporary private file. **23/23 tests passed** in 5 files: `source-analysis-jobs`, `source-preview`, `library-blueprint`, `upload-byte-limits`, and `storage-owner`.

## Confirmed findings

| Severity | Finding | Evidence | Feasible small correction |
|---|---|---|---|
| **high** | **The mounted Library UI retains a synchronous, non-durable AI scan that bypasses the source-job workflow.** | `components/trading/library-ai-panel.tsx:27-43, 68-76` calls `trpc.learning.blueprint.mutateAsync()` directly. `server/trading/router.ts:167-173` directly awaits `analyzeLibraryBlueprint`, whose default is 45 seconds (`server/trading/library-blueprint.ts:20-22, 284-288, 313-315`), without a job row, phase, stale recovery, or single retry. The legacy `learning.upload` API remains live and also calls synchronous `uploadReference` (`server/trading/router.ts:185-190`; `server/trading/learning.ts:24-27`). This bypass can coexist with the durable job started by the primary upload path and is contrary to the intended async/polling source scan (TODO M14). | Replace the mounted blueprint mutation with the existing `sourceAnalysis.start/job/retry` lifecycle; make any remaining legacy upload/blueprint procedure delegate to that lifecycle or remove it. Preserve the owner/version guard and return a job ID, not model output, from the client-triggered scan. Add a regression proving a second scan while an active job exists cannot start another model call. |
| **medium** | **Primary image uploads never automatically get a visual descriptor.** | The primary Library path invokes `sourceAnalysis.upload` (`library.tsx:188-220`), which calls `uploadReference(...deferAnalysis:true)` (`source-analysis-router.ts:20`). In `uploadReference`, that branch persists and returns at `learning.ts:24-25`; `indexImage` is only below that return at line 26. The source-job runner only analyzes/revises (`source-analysis-jobs.ts:200-241`). The sole primary-path vector action is the manual **Reindex protected image** control (`library.tsx:767-796`). Thus a compatible upload is initially `not indexed`, despite the visual-search feature. | After retention, enqueue a bounded non-fatal owner-scoped `reindexSource`/index step (or add it to the durable job) and persist `indexed`/`failed` metadata. Keep AI analysis and the original source successful if indexing fails; retain the manual reindex button as recovery. Add a mocked primary-upload test asserting one index attempt for an image. |
| **medium** | **Server upload validation accepts header-only/corrupt binary files as real images/PDFs, then stores them and may send them to analysis.** | `validateFile` treats only a PNG 8-byte prefix, JPEG `FF D8 FF`, RIFF/WEBP header, or `%PDF-` prefix as sufficient (`server/trading/learning.ts:14-21`). For example, Base64 `/9j/` decodes to only `FF D8 FF`, passes the JPEG branch and the size check, and proceeds to `storeSource` (`learning.ts:24-25`); it cannot be a decodable JPEG. Text/JSON have UTF-8/JSON parsing, but image/PDF files have no equivalent decode/parser check before retention/analysis. This conflicts with the stated requirement to reject unreadable files clearly. | Before `storeSource`, safely decode each image (with declared decoded-pixel bounds) and run a bounded PDF parser/page-count check; reject malformed/truncated content with a clear `BAD_REQUEST`. Keep the existing MIME comparison and byte cap. Add fixtures for header-only PNG/JPEG/WebP/PDF and a valid minimal file for each accepted type. |
| **medium** | **Source-analysis jobs have no cancellation state, procedure, or UI action.** | Job statuses are only `queued`, `running`, `succeeded`, `failed` (`lib/trading/source-analysis-job-types.ts:10-15`). The router exposes only upload/start/job/retry (`server/trading/source-analysis-router.ts:19-39`); the active UI merely polls and displays text (`components/trading/source-analysis-job.tsx:88-94, 208-235`). A queued or running upload-triggered analysis cannot be stopped by its owner. | Add owner-scoped `cancel` with a terminal `cancelled` status and compare-and-swap update; suppress queued execution and have the worker check cancellation before model selection, before invoke, and before revision persistence. Wire a visible Cancel button with an honest “current model call may finish but its result will not be saved” state, and test queued/running cancellation plus no revision after cancellation. |
| **medium** | **Photo search's accepted-size contract is internally inconsistent and can reject a valid Library-selected image after it has been read.** | Shared `readAsset` admits up to 25 MiB (`library.tsx:72-103`), and photo search reuses it (`library.tsx:373-384`). Yet `learning.search` limits the Base64 string to 12 MiB (`server/trading/router.ts:191-201`, roughly 9 MiB decoded), while the Python visual worker independently rejects source images above 8 MiB (`python/pattern_indexer.py:23-31`). An image in the 9–25 MiB advertised general upload range is rejected at the tRPC boundary; an 8–9 MiB image can reach semantic analysis then produce no visual result. | Declare and enforce one photo-search limit before reading/sending (8 MiB unless the worker is deliberately raised), using decoded byte count; show a specific message and do not make the semantic request when the visual query cannot run. Alternatively support bounded local/server resizing and align all three limits with tests at the exact boundary. |
| **medium** | **An unused legacy API still delivers full decrypted original bytes and `fileKey` metadata to any owner-authenticated app client, bypassing the new bounded preview design.** | `learning.source` calls `getSource` and returns `base64: source.base64` plus the unfiltered metadata (`server/trading/router.ts:278-287`). `getSource` decrypts the original (`server/trading/repository.ts:544-565`), and `Pattern` metadata contains `fileKey` (`server/trading/learning.ts:24`; `server/trading/validation.ts:200-242`). The current Library preview instead uses the bounded `sourcePreview` RPC. Owner gating prevents an anonymous/non-owner read, so this is not evidence of cross-owner disclosure in the current owner-only deployment; it is nevertheless a data-minimization bypass and contradicts the preview's explicit no-key/no-original response boundary. | Retire `learning.source` (no current UI caller was found), strip `fileKey` from all client-facing pattern DTOs, and retain `sourcePreview` as the only original-review path. If a true download is required later, add a separate explicit owner download procedure with a narrow response contract and audit it independently. |
| **medium** | **The 500-record Library cap remains non-reclaimable: no owner delete path exists.** | `workspaceSchema` caps `patterns` at 500 (`server/trading/validation.ts:380-397`), while the Library list/trainer exposes upload, feedback, acceptance, and reindex but no removal action (`app/(tabs)/library.tsx:543-589, 666-852`). The router/repository source APIs expose store/update/revise/read/versions, not source delete (`server/trading/router.ts:182-300`; `server/trading/repository.ts:415-597`). This is the still-open TODO M16. | Add an owner-only confirmed delete that reports affected versions/vectors/matches, removes the workspace index and DB rows transactionally, and schedules protected object cleanup; do not delete a source on a stale-version conflict. Display usage such as `412 / 500` and add capacity-recovery fixtures. |

## Adoption, privacy, and boundary notes

- The **AI proposal** path is safe by default: its explicit acceptance retains an inactive style. The separate regular **Accept rules & apply style** control intentionally writes `visible: true` and `activeStrategyId: styleId` (`app/(tabs)/library.tsx:298-363, 830-850`). That is user-labelled as an apply action, not automatic activation by upload; it should remain a distinct deliberate action if retained.
- Protected preview, source revisions, and vector queries use owner-scoped repository predicates. The global storage proxy also checks the approved owner before presigning (`server/_core/storageProxy.ts:6-63`). No public link, source publication, paper/real order, model fine-tuning, or generated executable authority was found in this scope.

## Limits

- This audit did not perform an upload, model/vision request, storage download, database read/write, owner-session flow, native device test, browser test, or service startup. It therefore does not establish configured storage/LLM availability, device picker behavior, PDF renderer availability in deployment, or real model output quality.
- The focused passing tests use mocks/pure fixtures and do not cover the synchronous legacy API, primary-upload auto-indexing, malformed binary admission, analysis cancellation, photo size mismatch, raw-source legacy endpoint, or source deletion.
- No full suite, package installation, configuration change, Git operation, schedule, port/service, or external research was performed.


## Quant research and no-code rules

### Repair record

# Repair 08 — No-code quant fixed-universe duplicates

## Scope and result

Fixed the confirmed configuration defect in `lib/trading/no-code-quant.ts` only. A `topN` or `inverseVolWeight` node now rejects repeated symbols **within that same node** after trimming and case normalization. The validation failure occurs before the owner-only router's `quantHistory` loop, so it cannot fetch a source for an invalid repeated-universe draft.

The shared typed `canonicalSymbol(symbol: string)` helper normalizes identifiers consistently for:

- validation and the bounded `assetSymbols` fetch list;
- supplied pure-series matching and duplicate-source detection;
- condition, ranking, and allocation result symbols.

Independent condition nodes remain allowed to reuse a symbol used by a selection or weighting node. The existing editor already derives save eligibility from `validateNoCodeQuantRule`, so no editor change was necessary.

## Regression coverage

Added `tests/trading/no-code-quant.test.ts`, using only in-memory synthetic closed bars:

1. Validates and evaluates mixed-case/space-padded symbols against canonical supplied sources, while an independent condition reuses `BTC-USD`.
2. Confirms `topN` and `inverseVolWeight` each fail closed when their own child lists repeat a symbol through case/whitespace variants; evaluator returns no selections/allocations and `researchReady: false`.

## Checks run

```sh
pnpm vitest run tests/trading/no-code-quant.test.ts
pnpm exec prettier --check tests/trading/no-code-quant.test.ts
git diff --check -- lib/trading/no-code-quant.ts tests/trading/no-code-quant.test.ts
```

Result: **1 test file / 2 tests passed**; test-file formatting and patch whitespace passed. The Vitest fixture imports only the pure quant module and creates no database, provider, account, network, order, proposal, upload, schedule, or other application write.

## Boundaries retained

- Owner-only router authority is unchanged.
- Evaluation remains bounded, pure, hypothetical, paper-only, with `autoExecution: false`.
- No source fetch, model/AI inference, database/provider/account/device/push operation, migration, configuration, service, or editor change was made.
- No material design, migration, or provider capability is required for this repair.

## Files changed

- `lib/trading/no-code-quant.ts`
- `tests/trading/no-code-quant.test.ts`
- `artifacts/app-audit/repair-08-quant.md`

### Original read-only findings and evidence

# 08 — Quant research, no-code rules, and historical replay audit

**Baseline:** local `c58be4d`; scoped source tree was clean before this report/reproduction artifact. This was a source and deterministic-unit audit only: no owner records, database, configuration, services, ports, account/provider requests, AI requests, or attachments were accessed.

## Confirmed finding

| Severity | Finding | Evidence | Small correction |
|---|---|---|---|
| Medium | **No-code `topN` and inverse-volatility universe accepts the same symbol multiple times.** This produces duplicate ranks/selections (and can duplicate a weight), contradicting the UI’s “fixed universe” representation and making the hypothetical output misleading. It cannot place an order or enable automation. | `lib/trading/no-code-quant.ts:271-318` checks unique node/asset IDs and caps *distinct* symbols but never rejects repeated symbols in a `topN`/`inverseVolWeight` node. The evaluator then maps every child through the same `bySymbol` value (`:515-531`, `:535-558`). The owner-only route deduplicates fetches via `validation.assetSymbols` (`server/trading/quant-rules-router.ts:13-52`), so one source series supplies both duplicated children. The editor allows entering the same uppercased symbol in every asset field (`components/trading/quant-rule-editor.tsx:228-305`). Pure local reproduction `artifacts/app-audit/08-quant-repro-no-code-duplicates.ts` returned `valid: true`, then two identical `BTC-USD` ranked/selected entries. | In `validateNoCodeQuantRule`, for each `topN` and `inverseVolWeight` node, normalize its child symbols with the same trim/canonicalization used by evaluation and add an issue if that node’s set is smaller than its child count. Preserve legitimate reuse in a separate condition node. Add regression cases for duplicate `topN` selection and duplicate inverse-vol weights; the tRPC custom validator will then reject the rule before source fetch. |

## Runnable paths and causality verified

- **Quant Lab:** `quant.run` is an `ownerProcedure` and dispatches pairs, momentum, making, macro, or ML research through `runQuantResearch` (`server/trading/quant-router.ts:25-42`, `server/trading/quant-service.ts:33-126`). The service retrieves selected history or a declared owner import; imports must match the requested timeframe and are parsed with `validateCandles`, while still-open bars are removed (`quant-service.ts:49-69`). It is explicitly read-only; it neither writes a trade nor submits an order. Market making alone requires a current Coinbase L2 book and is still only a paper plan/diagnostic.
- **No-code rules:** the owner-only `quantRules.evaluate` route accepts only a bounded draft tree, fetches exactly its declared assets, and invokes a pure evaluator (`server/trading/quant-rules-router.ts:13-52`). Raw invalid/open/future and duplicate source rows are excluded—not filled—and `autoExecution` is hard-coded `false` (`lib/trading/no-code-quant.ts:329-372`, `:477-503`). The confirmed duplicate-*configuration* defect above is distinct from duplicate input-candle handling.
- **Historical replay:** the actual UI action is `ScenarioLayerManager` → `scenarios.historical` with active local strategy snapshots (`components/trading/scenario-layer-manager.tsx:422-455`; `server/trading/scenario-router.ts:118-137`). It uses owner-authenticated `setupAnalysis`; that service validates actual chart OHLC and filters base bars at the acquisition cutoff before analysis (`server/trading/setup-service.ts:218-231`). Normal interactive use retains owner setup/history evidence through the existing setup service; this audit did **not** invoke it.
- **Replay state:** a strategy-matched continuation may only use historical cases whose outcome ends before the final 12-bar query window, enters at the next bar’s open, and calls a same-bar stop/target tie a loss (`lib/trading/setup-engine.ts:879-956`). If unavailable, `contextualScenario` uses only a nearest prior 12-bar **price-shape** continuation, preserves gaps/timestamps, rescales prices solely for display, and explicitly does not infer strategy rules, side, or success probability (`lib/trading/historical-scenario.ts:150-240`). Scenario persistence additionally requires source continuation candles strictly after `sourceAt` and strictly before `anchorAt` (`lib/trading/scenario-layer-storage.ts:23-63`). Ghost paths remain chart-only, not source OHLC or paper input.
- **ML research:** features stop at `decisionIndex - 1`; labels begin at the next bar’s open and use a costed forward horizon (`lib/trading/quant-ml.ts:272-315`). The implementation removes label/feature interval overlap with purge/embargo logic, holds out the newest partition from fitting/scaling/calibration/validation planning, and scores it separately (`quant-ml.ts:738-874`). The displayed score is a bounded classifier margin, **not** a probability; reliability/Brier data, where possible, concern the positive costed-direction label only (`quant-ml.ts:464-481`, `:1299-1305`).

## Metric definitions and implemented limits

- Indicator ATR14 is explicitly **Wilder**: first 14 true ranges (prior close required), then `((prior ATR × 13) + TR) / 14`; EMA seeding, RSI, BB population deviation, prior-only RVOL, MACD, and Donchian formulas are disclosed in `lib/trading/indicators.ts:31-32, 81-154`. Existing indicators tests assert the Wilder flat/up/down cases and absent warm-up values (`tests/trading/indicators.test.ts:13-20`).
- The legacy core-sequence displacement/fallback helper is instead an explicit arithmetic average of up to the preceding 14 true ranges (minimum five), not the indicator module’s Wilder ATR14 (`lib/trading/setup-engine.ts:109-129, 350-361, 1626-1633`). It is causal; consumers should not equate that helper with the separately disclosed `atr14` indicator.
- Strategy-specific outcome evaluation is deliberately unavailable for indicator, microstructure, ORB, and VWAP references; those can use only a labeled contextual replay, never a backtest of their rules (`setup-engine.ts:1311-1316`). Breakout/scalp prerequisites such as catalyst, tape/queue/DMA and real tick/order type remain unavailable rather than fabricated (`lib/trading/indicator-presets.ts:70-121, 180-215`).
- Quant outputs remain `unconfirmed`/exploratory. No path establishes predictive probability, validated edge, execution/fill quality, comprehensive costs, point-in-time universe, borrow/funding, macro release vintages, or actual-device/provider behavior. Quant service rejects any unexpected “confirmed” qualification (`quant-service.ts:104-115`).

## Checks performed

1. Read `plan.md` and `TODO.md` quant/replay requirements; traced owner routes, UI triggers, service data acquisition, core replay, setup/historical outcome engine, indicators, ML/purge/calibration paths, Python research engine, and scenario storage/projector.
2. Ran only existing deterministic, local fixture tests that import pure modules: **55 Vitest assertions passed** across `historical-scenario`, `indicators`, `quant-ml`, `quant-pairs`, `quant-momentum`, `quant-making`, and `quant-macro`. **8 Python `research_engine` tests passed** when run from its required `python/` module directory. No full suite was run. (The initial chained root command could not import `research_engine` due to that test’s cwd-dependent import; the rerun passed unchanged.)
3. Ran the one local TypeScript reproduction above. It makes no provider, AI, account, DB, or network request and creates no application data.

## Limits

- Unit fixtures validate deterministic arithmetic and guards, not live mobile rendering, real providers/imports, shared production database behavior, actual historical coverage, fills, profitability, or predictive performance.
- No server mutation was invoked; in particular, no `quant.run`, `quantRules.evaluate`, `scenarios.historical`, research job, provider/book request, or AI route was called.
- No full test/build/export run, installation, service startup, browser/device check, or external research was performed; parent-level evidence remains required for those scopes.


## Owner security and workspace portability

### Repair record

# Repair 09-auth — Owner authentication, portable workspace consent

## Confirmed fixes

1. **Portable automatic-paper consent cannot cross the export/import boundary.**
   - `lib/trading/workspace-portability.ts` now removes `settings.orbAutoPaper` and `settings.sessionAutoPaper` before portable export, while preserving other static preferences.
   - Preview sanitizes forged/raw archive settings identically, retains imported alerts as disabled, and tells the user that automatic-paper settings must be explicitly re-armed.
   - `applyPortableImport` repeats the removal so a caller cannot bypass preview by supplying a crafted `PortableImportPreview`. The omitted optional settings are the existing strict-schema, default-off form: no `armedAt`, `expiresAt`, or `runWhenClosed` can survive.
   - No broker endpoint, paper order, provider, workspace save, or cloud operation was invoked by this repair.

2. **Cookie logout is no longer cross-site-form logoutable.**
   - `server/_core/cors.ts` exports `isAllowedCorsOrigin`, the existing exact credentialed-CORS policy including its constrained loopback rule; middleware behavior is refactored to reuse it unchanged.
   - New pure helper `server/_core/auth-security.ts` classifies a logout request as either an exact CORS-allowlisted browser origin or a no-Origin bearer candidate. Cookie-only/no-Origin requests and all unallowlisted origins fail closed.
   - `server/_core/oauth.ts` now clears the session cookie only after an allowlisted browser origin, or after `sdk.verifySession` validates a no-Origin bearer token. Cron-prefixed identities are rejected on that native-only path. Existing session-cookie scope/options, OAuth callback flow, owner/tRPC boundaries, and logout response shape are unchanged.

## Regression evidence

- Added `tests/auth-audit-09.test.ts`, an isolated no-I/O test file:
  - creates a pure portable archive carrying armed ORB and session settings, then verifies export, forged raw preview, and final application remove both settings while the enabled imported alert remains disabled;
  - uses mocked `server/db`, mocked SDK module, injected bearer verification, and mock Express request/response objects to reject an attacker form, accept an allowlisted Preview origin, accept a verified native bearer, and reject an invalid bearer without clearing a cookie.
- Command run:

  ```sh
  pnpm exec vitest run tests/auth-audit-09.test.ts
  ```

  Result: **1 test file passed, 2 tests passed**.
- Scoped `git diff --check` passed for all five changed source/test files. Source was formatted with Prettier for those files only.

## Boundaries and integration notes

- Tests did **not** start Express, make HTTP requests, access real cookies, authenticate a user, read/write any DB, contact a provider, submit paper/broker activity, run inference, or alter a workspace.
- This is source/mock evidence only; it does not claim real browser iframe behavior, device-native bearer handling, OAuth login, deployment, push delivery, or a signed build.
- No schema, migration, config, service, port, plan/TODO, documentation, package, or Git metadata was changed. No global/full suite, install, build/export, or concurrent parent integration was run.

### Original read-only findings and evidence

# 09-auth — Owner authentication, workspace persistence, and security audit

**Baseline inspected:** local `c58be4d056577db39d849f0fe483d599942f9965`. **Mode:** read-only source audit. No application source, owner data, environment/secret value, database, account, OAuth session, scheduler, port/service, Git state, or attachment was changed or requested. No network, provider, AI, or account request was made.

## Scope and verified controls

- **Owner-only UI and API:** the tab layout is wrapped by `OwnerGate` (`app/(tabs)/_layout.tsx:1-18`); standalone application pages also use it (`app/features.tsx:17-19`, `app/coach.tsx:30-58`, `app/dev/theme-lab.tsx:40-45`). The server predicate requires the verified approved identity (`server/trading/access.ts:5-27`), and the application routers use `appProcedure`/`ownerProcedure`, while bootstrap/access/logout remain separate (`server/routers.ts:24-61`, `server/trading/router.ts:80-378`, `server/trading/setup-router.ts:35-123`). Guest calls tested in existing source fixtures are rejected before data routes (`tests/trading/owner-setup.test.ts:8-13`, `tests/trading/security.test.ts:6-14`).
- **Authentication and iframe-aware cookies:** sessions are app-ID-bound signed JWTs and verified before user lookup (`server/_core/sdk.ts:258-352`); cookies are host-only, `HttpOnly`, `Secure`, and `SameSite=None` on HTTPS (`server/_core/cookies.ts:19-28,50-79`). The web transaction cookie is one-use before exchange and binds nonce plus exact allowlisted redirect origin (`server/_core/oauth.ts:87-152,234-285`); native state is signed, expiring, and matched to SecureStore (`server/_core/oauth.ts:287-327`, `app/oauth/callback.tsx:22-42`). CORS permits only configured Preview origins with credentials and rejects unpaired origins (`server/_core/cors.ts:34-153`; mocked tests `tests/cors.test.ts:62-279`). Embedded Preview opens OAuth in a standalone tab without copying a token (`lib/_core/web-login.ts:8-25`).
- **Credentials and protected source mediation:** Expo serializes only portal/API/app-ID values; JWT/API/Forge secrets are intentionally excluded (`app.config.ts:41-60`). Encrypted originals derive an AES-GCM key server-side and source queries bind both ID and user ID (`server/trading/repository.ts:385-436,462-581`). The storage redirect authenticates and applies the owner predicate before presigning, with `private, no-store` (`server/_core/storageProxy.ts:6-63`); its existing fixture is fully mocked (`tests/trading/storage-owner.test.ts:1-73`).
- **Local/cloud workspace behavior:** local persistence waits for owner authorization and hydration; it serializes writes, clears in-memory data on access loss, never automatically replaces dirty/legacy local state, and requires explicit replacement confirmation (`hooks/use-workspace.tsx:135-181,197-285,416-499,591-684`). Server save uses an owner-scoped revision CAS (`server/trading/repository.ts:342-383`); source revisions and destructive workspace tools use owner conditions, row locks/CAS, exact confirmation, and retain encrypted originals where promised (`server/trading/repository.ts:462-527`, `server/trading/workspace-tools.ts:122-463`).
- **Local privacy and paper boundaries:** optional local PIN stays unsupported/off in the current native adapter absent deliberately supplied crypto (`lib/trading/local-lock.ts:256-283,313-337`), and background masking/reauth recovery never grants server authority (`components/trading/owner-privacy-boundary.tsx:24-53`). Automatic paper runners are owner-only and require saved canonical consent, current strategy/gate state, foreground visibility, and expiry (`components/trading/orb-auto-paper.tsx:449-622`, `components/trading/session-auto-paper.tsx:519-690`; server validation `server/trading/orb-auto-paper.ts:118-165,753-815`, `server/trading/session-auto-paper.ts:106-156,868-955`). No broker order routes were found; TradeLocker transport is allowlisted to information endpoints (`server/trading/tradelocker.ts:27-47`).

## Confirmed findings

| Severity | Finding | Evidence | Small feasible correction |
|---|---|---|---|
| **medium** | **Portable import can restore still-valid automatic-paper consent as enabled, contradicting the import/default-off guarantee.** | The export sanitizer removes only secret-shaped keys, so `settings.orbAutoPaper` and `settings.sessionAutoPaper` survive (`lib/trading/workspace-portability.ts:34-83,380-394`). Import explicitly disables alert rules (`:585-594`) but accepts raw `settings` (`:623-642`) and then assigns them wholesale to the live workspace (`:650-709`). `OwnedWorkspaceTools` saves that imported workspace to the canonical cloud copy (`components/trading/owned-workspace-tools.tsx:95-100`); root-mounted runners can then call the owner-only auto-check once enabled settings match canonical status (`components/trading/orb-auto-paper.tsx:497-518,546-622`; `components/trading/session-auto-paper.tsx:562-581,613-690`). A deterministic, local-only reproduction at `artifacts/app-audit/09-auth-auto-import.repro.ts` produced `{"orbAutoPaperEnabled":true,"sessionAutoPaperEnabled":true,"importedAlertRulesEnabled":false}`. Existing `workspace-portability` coverage checks alerts and pending trades but not auto-consent (`tests/trading/workspace-portability.test.ts:103-124`). An imported prior export can therefore resume a fresh, otherwise eligible **paper** automation without a new arm action. | In `previewPortableImport` or immediately before `applyPortableImport`, strip `orbAutoPaper` and `sessionAutoPaper` from imported settings (preferred), or rewrite both to a strict disabled object with no `armedAt`, `expiresAt`, or `runWhenClosed`. Preserve other non-execution preferences. Add a pure regression asserting enabled/unexpired exported auto settings become disabled/absent after preview+apply and that imported alerts remain disabled. |
| **low** | **The direct cookie logout endpoint is CSRF-able in the `SameSite=None` iframe-compatible configuration.** | HTTPS sessions must use `SameSite=None` to support the Preview arrangement (`server/_core/cookies.ts:19-28`). `POST /api/auth/logout` unconditionally clears that session cookie and performs no Origin/CSRF or bearer distinction (`server/_core/oauth.ts:330-336`); a cross-site HTML form is not protected by CORS. CORS restricts scripted credentialed calls (`server/_core/cors.ts:114-153`) but does not block form navigation/posts. Impact is forced logout only—no application data read, modification, or broker action. The only direct logout regression is currently skipped (`tests/auth.logout.test.ts:44-63`). | For cookie-authenticated browser logout, require an allowlisted `Origin`/CSRF token; accept no-Origin logout only after verifying an Authorization bearer token for native clients (or expose a native-specific bearer logout path). Add a mocked HTTP/form-origin rejection regression plus allowed Preview-origin and native-bearer cases. |

## Checks performed

1. Read `plan.md` and `TODO.md` requirements covering private owner access, server-validated ownership, protected storage, cloud conflicts, explicit automation, and no public release.
2. Traced root/app route gates, all registered tRPC router families, server context/session verification, OAuth web/native flows, cookie attributes, CORS, direct storage route, source repository, local lock, workspace sync, portable import/export, scheduler boundary, and all exposed destructive workspace operations.
3. Inspected existing unit fixtures to confirm the reviewed storage/workspace transaction fixtures use mocks rather than a managed database or provider. Did **not** run the full suite. The supplied baseline record reports **753 passed, 0 failed, 1 existing auth skip** (`artifacts/app-audit/baseline-tests.json`).
4. Ran only the new deterministic local reproduction above. It imports pure local workspace modules and performed no network, account, AI, DB, or application-data write.

## Limits

- This is source plus deterministic local reproduction evidence, not a real OAuth/browser/iframe/device session test. It does not prove third-party-cookie behavior, native SecureStore behavior, or popup behavior in a user browser.
- Managed-DB transaction behavior, object storage, real owner authorization, encrypted-source retrieval, deployed scheduler callbacks, and actual device/background lifecycle were not contacted. Existing unit/mock evidence does not replace those runtime checks.
- No environment values or credentials were read, and no source/runtime export, full suite, install, service, port, migration, account action, or schedule change occurred.
- The finding is limited to **simulated paper** automation; no broker trade-placement endpoint was exercised or identified.


## Discipline, journals and trade screenshots

### Repair record

# Repair 10-journal — Discipline & screenshot evidence

**Scope:** Owner-only, paper-only Expo Router / TypeScript screenshot-review and discipline-control fixes. This repair made no provider, account, database, storage, upload, device, model, network, order, proposal, schedule, push, configuration, or Git operation. No image attachment was opened.

## Fixed

1. **Acknowledged discipline enforcement**
   - Added `lib/trading/discipline-guard-ack.ts`, a pure typed helper that applies the local optional guard value then waits for the existing `saveCloud` canonical acknowledgement.
   - `DisciplineGuardControl` now says a guard is enabled/disabled only after that acknowledgement. A failed or unavailable save retains the local value but explicitly says **server enforcement is unchanged**.
   - The optional legacy `onGuardChange` is now a post-acknowledgement observer; it cannot be the basis for an enforcement claim.
   - Default-off behavior and advisory-only treatment of non-canonical/self-reported conditions remain unchanged.

2. **Review-only screenshot retention**
   - `uploadTradeScreenshot` calls the Library-owned `uploadReference` review-only contract with `reviewOnly: true` and `sourcePurpose: "trade-screenshot"`. That contract skips generic extraction/indexing and Library promotion/matching paths.
   - Linked uploads load the canonical owner-scoped paper trade before retention and derive `market`, `timeframe`, `strategyId`, and `strategyVersion` from it. Stale current-workspace context is ignored for linked records.
   - The client now sends `canonicalTradeId` at upload (not only at analysis), plus the current strategy revision only for standalone context.

3. **Durable immutable screenshot context and remount recovery**
   - Added bounded Zod-backed source-context helpers in `lib/trading/trade-screenshot-types.ts`; the immutable context contains only canonical ID/linkage and market/timeframe/strategy revision—**never fills, brackets, outcomes, or model output**.
   - Context is encoded in the existing, Library-owned review-only Pattern `notes` metadata alongside the source-purpose marker. No Pattern-model, schema, migration, or database change was made.
   - The service verifies that the uploaded source actually retained the exact context and fails closed otherwise.
   - Analysis and confirmation use that retained context, reject a forged different `canonicalTradeId` before protected-source bytes/model invocation, re-check owner-scoped canonical ownership, and continue withholding all trade fields from the model.
   - The screenshot router now resolves bounded metadata-only definitions for the 100-item screenshot inventory and filters by the immutable link. Thus a source linked at retention reappears after remount even if dedicated analysis failed and no `tradeReview` draft exists.
   - The panel restores context when reopening a source and does not silently re-link a retained standalone source.

## Files changed

- `components/trading/discipline-guard-control.tsx`
- `components/trading/trade-screenshot-panel.tsx`
- `lib/trading/discipline-guard-ack.ts` (new)
- `lib/trading/trade-screenshot-types.ts`
- `server/trading/trade-screenshot-router.ts`
- `server/trading/trade-screenshot-service.ts`
- `tests/trading/discipline-guard-ack.test.ts` (new)
- `tests/trading/trade-screenshot-router.test.ts` (new)
- `tests/trading/trade-screenshot-service.test.ts`
- `tests/trading/trade-screenshot-types.test.ts`

## Verification

The following focused test command used only pure/in-memory or mocked boundaries; repository, source bytes, LLM/provider, storage, and paper-trade dependencies were mocked where invoked:

```text
pnpm vitest run \
  tests/trading/discipline-guard-ack.test.ts \
  tests/trading/discipline-policy.test.ts \
  tests/trading/trade-screenshot-types.test.ts \
  tests/trading/trade-screenshot-service.test.ts \
  tests/trading/trade-screenshot-router.test.ts --reporter=verbose

5 files passed; 18 tests passed; 0 failed
```

Regression coverage includes:

- enable → immediate simulated canonical order request remains unblocked until cloud acknowledgement;
- failed guard save stays local-only/default-off on the canonical snapshot;
- review-only purpose/options and zero direct generic-model calls from the screenshot service;
- canonical rather than stale-workspace market/timeframe/strategy metadata;
- failed dedicated review retaining remount-visible linked context;
- forged analysis link rejection before protected source bytes/model use;
- immutable source-context schema boundaries (no fills/outcomes);
- router filtering of an unreviewed retained source by immutable canonical context.

Scoped Prettier check and `git diff --check` passed for all owned files.

## Integration / remaining

- The repair depends on the concurrently owned Library `uploadReference` review-only/source-purpose contract. At the time of verification, that contract was present and stores the source-purpose marker in existing Pattern notes while skipping generic indexing/extraction. No Library/repository/model/schema file was edited by this repair.
- `pnpm check` was run once as a check-only diagnostic and reports **five unrelated, pre-existing/concurrent errors** outside this scope: `components/trading/ai-forecast-panel.tsx` (1), `components/trading/scenario-layer-manager.tsx` (1), `components/trading/source-analysis-job.tsx` (1), and `server/trading/orb-auto-paper.ts` (2). No owned 10-journal path was named. Parent integration should resolve/recheck those owner modules rather than changing them here.
- No full suite, installation, build/export, service startup, actual database/storage/provider/model/device/push action, native deployment, or broker execution was performed or claimed.

### Original read-only findings and evidence

# Journal, discipline, navigation & learning audit

**Audit ID:** 10-journal
**Baseline inspected:** `c58be4d056577db39d849f0fe483d599942f9965` (the shared checkout also contained pre-existing modified/untracked owner artifacts; none were changed).
**Mode:** Read-only source audit. No app/browser/device, account, network, AI request, owner data, upload, database, configuration, git, service, port, or attachment was accessed. In particular, no `/home/ubuntu/upload/*.PNG` was opened.

## Scope trace and verified behavior

- **Navigation/access:** the native six-tab bar exposes Chart, Markets, Trades, Alerts, Strategies, and My Library, wrapped by `OwnerGate` (`app/(tabs)/_layout.tsx:8-18`). Coach and Feature Guide routes apply the same gate (`app/coach.tsx:30-58`, `app/features.tsx:16-20`). This preserves owner-only, paper-only navigation; no public link is introduced.
- **Trade lifecycle/deep dive:** paper order, edit, close, cancel, retained history, immutable revisions and source-quote disclosures are wired through `paperRouter` owner procedures (`server/trading/setup-router.ts:49-123`) and the Trades/history UI (`app/(tabs)/trades.tsx:141-301`, `components/trading/stored-paper-history.tsx:27-423`). Cancel requires a fresh quote and never manufactures a fill (`server/trading/paper-service.ts:893-934`). Retry/error UX exists for proposal, revision, cancellation and screenshot analysis.
- **Discipline:** evaluation is based on canonical closed-paper records, excludes unusable/future chronology, and detects recent realized loss, UTC-day count, loss streak, and risk escalation without inferring intent (`lib/trading/trading-discipline.ts:139-407`). All guards are default-off (`components/trading/discipline-guard-control.tsx:127-140`; `lib/trading/discipline-policy.ts:88-117`). The server independently applies enabled guards to new orders and pending limit fills (`server/trading/paper-service.ts:123-143, 672-684, 990-1017`).
- **Journal/thinking:** `JOURNAL_STEPS` retains the fuller journal vocabulary (`lib/trading/model.ts:637-647`), while the current paper ticket deliberately exposes an **optional** single `pretradeThoughts` note (`components/trading/paper-plan-sheet.tsx:446-454, 193-202`). This agrees with the later scoped plan wording that streamlined the ticket to optional pre-trade notes (`plan.md:276-279`); it is not reported as a defect.
- **Learning:** `coach.analytics` reads bounded canonical closed paper records and returns descriptive-only analytics; the client labels it paper/descriptive, with no automatic promotion (`server/trading/coach-analytics.ts:5-23`, `components/trading/learning-dashboard.tsx:6-80`). Lessons/coach handoff are educational and owner-gated (`components/trading/trading-lessons.tsx:44-115`).
- **Screenshots:** the dedicated review schema keeps owner-entered time separate from upload and image-visible time, marks outcome unverified, and requires owner-scoped links (`lib/trading/trade-screenshot-types.ts:80-141`; `server/trading/trade-screenshot-service.ts:282-371`). The UI renders textual evidence, visible facts, limitations, retry and explicit confirmation (`components/trading/trade-screenshot-panel.tsx:487-650`).

## Confirmed findings

### 1. High — Toggling an enforced discipline guard can falsely report enforcement before the canonical server setting changes

**Evidence.** `DisciplineGuardControl` has no supplied persistence callback in the paper sheet (`components/trading/paper-plan-sheet.tsx:462-465`). Its fallback only calls local `update` and immediately says the guard “is enabled” and “blocks a new paper order” (`components/trading/discipline-guard-control.tsx:81-98`). `update` marks local state dirty and schedules persistence (`hooks/use-workspace.tsx:501-520`), whereas `createPaperOrder` checks `loadWorkspace(...).settings` from the canonical server record (`server/trading/paper-service.ts:511-513, 672-684`). Therefore an owner can enable a guard and immediately submit an order while the server still sees the old default-off setting (or, before an initial cloud save, may never receive it).

**Small correction.** Make the guard-change path explicitly save the changed workspace to cloud and await its acknowledgement before showing “enabled/disabled”; if saving fails, retain the local value but state that server enforcement is unchanged. Alternatively pass a `PaperPlanSheet` callback that performs that acknowledged save. Add a mocked client/integration regression covering enable → immediate paper-order attempt and failed save. Preserve default-off behavior.

### 2. High — A screenshot review upload is also sent through the generic pattern-extraction/indexing pipeline

**Evidence.** The screen promises a private evidence review (`components/trading/trade-screenshot-panel.tsx:356-360`) but the screenshot service calls `uploadReference` as `kind: "pattern"` without a review-only/defer flag (`server/trading/trade-screenshot-service.ts:172-205`). `uploadReference` then indexes images and calls generic `extractSource`, which asks the LLM for pattern descriptions and trading rules (`server/trading/learning.ts:23-27`). The dedicated screenshot review performs a second, correctly bounded analysis afterward (`server/trading/trade-screenshot-service.ts:282-371`). This conflates screenshot coaching evidence with generic pattern-learning and can create rule/tag outputs before the owner has confirmed the review.

**Small correction.** Add an explicit persisted `sourcePurpose: "trade-screenshot-review"`/review-only path to `uploadReference` that stores the protected source but skips generic indexing/extraction and excludes such sources from generic matching, blueprint, and pattern-promotion routes. Retain only the dedicated screenshot review, its owner confirmation and future coaching retrieval; do not turn the source into a pattern reference automatically. Add mocked tests asserting zero generic `extractSource`/index calls for screenshot upload.

### 3. Medium — Trade-linked screenshot context/linkage is not durable until analysis succeeds and is attributed from the current workspace instead of the trade snapshot

**Evidence.** In a trade deep dive, the checkbox derives `linkedTradeId` (`components/trading/trade-screenshot-panel.tsx:159-185`), but `upload` sends only `workspace.market`, `workspace.timeframe`, and current `activeStrategy.id` (`:235-266`). The intended canonical trade ID is sent only later to `analyze` (`:208-220`) and is written into `review.linkedTrade` only after a successful model response (`server/trading/trade-screenshot-service.ts:282-287, 341-371`). Per-trade inventory filters by that review linkage (`server/trading/repository.ts:600-610`). Thus, if analysis fails after upload, a retained source cannot reappear under the originating trade after remount; and a historic trade screenshot can be stored with unrelated currently selected market/timeframe/strategy metadata.

**Small correction.** Include an optional requested canonical trade ID at upload, owner-verify it server-side, and persist a typed screenshot context/link at source creation. For a linked record, derive/validate market, timeframe and strategy/version from the canonical trade snapshot rather than from current workspace state. Let retry/reopen retain the source’s immutable requested linkage even with no review draft; continue withholding trade fill/outcome fields from the model.

### 4. Medium — A cancelled plan can have its bracket/auto-management fields changed when saving a post-trade review

**Evidence.** The router accepts `stop`, `target`, optional `autoManage`, and optional `review` (`server/trading/setup-router.ts:90-101`). `editPaperTrade` correctly refuses a cancelled plan only when `review` is absent (`server/trading/paper-service.ts:790-798`), but the subsequent condition is `old.status !== "closed"` (`:804-836`). A cancelled plan with a review therefore receives submitted stop/target/autoManage fields before the revision is written, although the event note says the review changed no fill/risk/journal (`:837-852`). This contradicts the endpoint’s own terminal-immutability message and corrupts the current terminal bracket snapshot.

**Small correction.** Restrict bracket/autoManage assignment and validation to `old.status === "open" || old.status === "pending"`; for both `closed` and `cancelled`, accept only the review field and preserve every lifecycle/bracket value. Add a mocked `editPaperTrade` cancellation-plus-review regression asserting the saved stop/target/autoManage equal the original.

## Focused verification

After confirming the tests fully mock repository, market and model dependencies (`tests/trading/paper-service.test.ts:37-70`; `tests/trading/trade-screenshot-service.test.ts:15-30`), I ran only existing unit tests:

```text
pnpm vitest run tests/trading/paper-service.test.ts \
  tests/trading/trading-discipline.test.ts \
  tests/trading/discipline-policy.test.ts \
  tests/trading/trade-screenshot-service.test.ts --reporter=verbose

4 files passed; 34 tests passed; 0 failed (1.50 s)
```

Those tests confirm pure/default-off discipline selection, synthetic paper lifecycle/cancellation, mocked screenshot owner/version/unknown-time handling, and deterministic discipline calculations. They do **not** exercise physical-device navigation, a real owner session, a database write, a real source upload, model availability, or a real market/broker path. They also do not cover the four source paths above.

## Limits

- This audit intentionally did not run the full suite, install packages, start services, bind ports, inspect owner records, or make AI/network/account requests.
- Existing baseline builds/exports/tests do not establish runtime/device behavior; this report makes no such claim.
- No source edits were made. The owner-only, paper-only boundary, actual-data causality, explicit default-off automation, and no-publication/no-public-link constraints remain intact in the reviewed source.


## Protected original cleanup boundary

# Source deletion cleanup repair

**Scope:** `deleteLibraryRecord` only. This repair preserves the already-existing owner confirmation, source/workspace compare-and-swap checks, capacity reclamation, workspace-match removal, source-version-index removal, and visual-vector removal. It does not change archive/strategy deletion, repository public DTOs, source jobs, routers, models, schema, migrations, services, or library-purpose notes.

## Implemented behavior

After the confirmed library-removal path has locked the workspace and source, verified the expected source version, verified the exact confirmation text, and computed the existing dependency-removal plan:

1. It reads the authoritative encrypted object key from the locked `trading_sources` row.
2. It creates a version-specific `trading_runtime_state` record with kind `source-cleanup` **inside the same database transaction**. Its private payload includes the owner ID, source ID, source version, and original encrypted object key, with `status: "pending"`.
3. It refuses a duplicate cleanup record for the same owner/source/version before changing workspace, source, version-index, or vector records.
4. It retains the existing CAS update plus source/version/vector deletion sequence. Transaction failure rolls back the pending cleanup record together with the logical deletion.
5. It returns a UI-safe result: **logical deletion completed**, **source-library capacity reclaimed**, `cleanupPending: true`, and `objectStorageDeleted: false`. The encrypted object key is never part of this result or other public DTOs.

The cleanup ID includes the source version, so a stale cleanup record from an older source version does not mask the currently confirmed version.

## Storage capability finding

`server/storage.ts` exposes `storagePut`, `storageGet`, and `storageGetSignedUrl`; it has **no safe provider-delete capability**. Therefore this repair intentionally makes **no provider/network call** and does not invent a deletion service. Logical deletion can reclaim the source-library record capacity, while the encrypted original remains retained and durably marked `cleanupPending`.

## Validation performed

- `pnpm vitest run tests/trading/source-cleanup.test.ts tests/trading/workspace-tools-transaction.test.ts` — **9 tests passed**.
  - Includes rollback of cleanup plus logical removal, duplicate pending-record rejection, stale-version record handling, no key in the UI result, and exact retained private runtime payload.
- `pnpm vitest run tests/trading/workspace-removal.test.ts tests/trading/workspace-capacity.test.ts tests/trading/source-public-dto.test.ts tests/trading/workspace-tools-router.test.ts` — **8 tests passed**.
- `git diff --check` — **passed**.
- `pnpm check` remains blocked by unrelated existing type errors in `tests/trading/ai-forecast.test.ts` and `tests/trading/pdc-continuation.test.ts`; no errors were reported in this repair's files.

## Explicitly remaining external work

1. A separately authorized cleanup worker/process and a verified storage-provider delete capability are required to physically delete the encrypted bytes.
2. That future worker must consume only the durable pending record, call the provider explicitly, and record a terminal outcome without exposing the object key.
3. No owner deletion, database mutation, provider operation, account/network action, migration, service operation, or Git mutation was executed for this repair; all persistence coverage used in-memory transaction mocks.


## Final scoped integration review

# Final Integration Review

## Confirmed high/integration bugs

**None confirmed.**
