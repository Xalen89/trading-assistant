# Zax — London, Initial Balance and PDC continuation

**Source:** your 18 October 2026 message and `research/session-strategies/Pasted_content_08.txt`. You approved the labelled app rules at 18:52:05. These are separate **AI-assisted rule strategies**, not trained or historically validated predictive models. ORB and WR1 stay separate. All execution remains owner-only and paper-only.

## What each strategy does

| Strategy | Execution | Exact reference and trigger | Stop and target |
|---|---|---|---|
| London Breakout | 15m | Complete 00:00–03:00 fixed-EST Asian range, then a completed 15m close outside its high/low. | Midpoint or opposite-boundary stop. Approved default: midpoint + 2R. Source 1.5R and one-range-height-from-entry alternatives remain selectable. |
| Initial Balance (IB) | 15m or 30m | Exact 09:30–10:30 fixed-EST range. Confirmation candle **starts at/after 10:30** and closes outside. | Approved midpoint stop; optional inside-boundary stop using your actual tick. Target: **one range height beyond the broken boundary**, not from entry. |
| Red-to-Green / Green-to-Red | 1m or 5m | Actual 09:30 opening side against declared previous-day close (PDC); two observed timestamped quotes cross it during 09:30–10:00. | Complete observed morning extreme plus your actual minimum price increment; explicit directional key target or complete declared premarket range. No generic 2R target is invented. |

London’s **15m** primary follows your latest message, not the attachment’s optional 5m. H1/H4 can show reference context, but cannot isolate a three-hour range without exact underlying bars. London monitoring is same-source-local-date after 03:00; no hard end cutoff was supplied.

IB’s approved, **app-added** high-volume definition is **at least 1.5× the prior 20 positive, contiguous, completed same-timeframe volume bars**, excluding the latest bar from the baseline. Venue volume is the default required basis. An explicit **Broker reported proxy** selection can use actual broker-reported relative volume without calling it venue/exchange volume. The 10:30–11:30 monitoring cutoff is also app-added. Narrative institutional/frequency claims are not measured results.

Pivot’s approved relative-volume rule is **latest completed 1m/5m volume greater than the immediately prior equal period**, with the same default-venue or explicitly selected broker-proxy policy. Its quote cross is separate from closed-bar/t−1 OHLC. One sampled cross is one event, not a new event when a later volume bar closes. REST sampling can miss a cross-and-reversal; it is not first-tick execution.

Fixed EST/UTC−5 is the supplied clock. New York/DST is a visibly selected personal override, not a silent substitution. These are analytical windows unless the selected instrument’s exchange session/calendar is verified.

## Automatic instrument setup — fewer manual prerequisites

In the IB or pivot editor, choose **Detect instrument**, review actual facts and remaining source choices, then **Fill missing verified settings**. Detection reads data only; filling changes the local draft only. **Save execution settings** remains explicit and clears obsolete gate approval. It does not arm automatic paper, activate alerts or overwrite your personal settings. A late response for another market/config is rejected.

For the current TradeLocker feed, deliberately choose **Broker reported proxy** if you want its relative-volume rule, then detect/fill/save. This is an opt-in non-exchange-volume basis, not a prerequisite the app can silently consent to for you. After saving, approve the current same-direction native gate before separately arming automatic paper.

The app reads the actual minimum price increment from TradeLocker instrument-details `tickSize` bands or Coinbase product `quote_increment`—never chart decimals, lot size or an NQ tick copied to a CFD. Uniform valid schedules are supported, including one reported increment with an unstated optional/null lower bound; no numerical bound is invented. Conflicting or restricted schedules remain explicit. The actual selected Gold response reported0.01 with a null bound, which our former parser wrongly rejected; that decoding is repaired. The current TradeLocker guide assigns the metadata-only GET its instrument-settings route identifier; quotes/history stay on INFO, and broker order paths remain disabled.

Supported missing pivot defaults are filled with a transparent PDC basis and **Dynamic PDH/PDL** targets from actual same-source daily bars. These key levels refresh at native evaluation rather than storing stale numerical targets. Existing manual tick, session-close, targets or premarket choices are preserved. Detected settings are bound to their instrument and cannot silently follow a different market.

Coinbase uses exact continuous UTC provider days and requires the immediate previous day. TradeLocker’s documented daily timestamps are 00:00 UTC; a distinct **provider UTC trading-day** mode uses the last actual completed reported day with a current-day anchor, bounded prior age, actual OHLC and duplicate/source checks. It is **not** a verified exchange calendar, US regular close or settlement. Personal hourly-aligned session close remains an override.

Broker `v` is now explicitly **broker-reported**, not unknown merely because it is non-venue. Its underlying volume type is not established by the API. Keep venue-only or deliberately select **Broker reported proxy**; this is never selected automatically. Missing/zero/invalid readings still cannot qualify. Incomplete windows/opening/morning data, stale/nonmonotonic quotes, wrong frame, absent true tick/target and expired clocks still block execution. Valid incomplete settings can now be saved as a draft rather than trapping the editor.

No arbitrary 04:00 premarket window, exchange-session calendar, minimum tick or price level is invented. Detection/fill is configuration preparation, not a ready signal or source validation edge.

## Where to use them

Open **Strategies → Session & pivot strategies**. Add/configure each source without duplicating an existing record. Apply selects its primary timeframe without changing market or unrelated scenarios. Source high/low/50% and PDC lines stay linked to the strategy.

A 30m chart is built from exactly two complete same-source 15m periods, preserving identity and real gaps. No guessed Coinbase 1800-second granularity, raw broker 30m resolution, missing-bar fill or partial promotion is used. Original acquisition timestamps prevent cached/slow still-forming candles from becoming current evidence after their wall-clock end; retained history cannot replace a missing native tail.

Saving execution settings creates a revision, preserves history and clears obsolete confluence approval. Approve the exact same-direction native gate before automatic paper can be armed. Coach receives current source/configuration and can explain blockers. AI prose and forecast candles cannot arm execution or bypass checks. Independent historical/AI scenarios do not validate these rules.

**Watch this strategy** creates/re-enables a scoped setup alert for current market/frame/source. It does not create a production schedule or prove push delivery.

## Automatic paper — off until you arm it

One saved source strategy, direction and market are scoped to **1% or 2% of realized current paper balance**, **1–3 entries per source-local day**, and **up to 24 hours**. A positive saved drawdown limit, normal discipline checks, no conflicting pending/open position, current actual source/quote and the same approved source/gate revision are mandatory.

The source SL/TP remains exact at the observed paper fill. No generic ATR/2R or extra display-unit buffer replaces it. Untouched market proposals follow chosen source geometry at actual bid/ask; edited source stops/targets are rejected. Pending limits belong to manual practice, not faithful immediate execution of these triggers. Automatic management uses full-position SL/TP, not invented partial/break-even conventions.

Canonical cloud consent, a shared owner lock and durable collision-resistant signal/proposal/order IDs protect against repeated entries from tabs, restarts and retries. Off/background/expiry stops new foreground requests, **not existing positions or already-submitted requests**. Unsaved local source/gate revisions pause the runner. No automatic consent, owner order or schedule was enabled in development.

## After successful private publication

Background work runs on the **published backend**, not an indefinitely running iPhone timer. In Alerts, explicitly activate deployed monitoring. The existing one-minute scheduler validates project/expiry-signed JWT, authenticated taskUID and its mapped owner before bounded work. Callback-body IDs cannot choose an owner.

Status distinguishes production, task registration, recent completed authenticated callback and native device registration. **Actual device delivery is unverified until a real alert is received.** Publishing alone does not enable background paper permission. After completed-callback proof is visible, separately choose **Also when closed** and arm the strategy. Foreground-only remains default; background consent shares expiry/risk/cap limits. Original ORB consent is not widened.

The server independently requires prior recent completed-callback proof before background paper source/order work. A raw saved boolean or callback-start timestamp cannot bypass this. The first unproven callback can establish monitoring proof, not trade automatically.

Scheduled paper/alert source work shares a **45-second network/source deadline** and **12 actual broker-attempt cap**, including authorization/bootstrap requests. Public/cached source paths inherit the deadline; exhausted work is deferred. One-minute sampling/provider rotation cannot capture every tick or promise instant pivot alerts. Registration, authentication and source exports are not deployment or native push proof.

## Verification and remaining boundaries

Actual read-only setup checks on19OctoberUTC (18October owner-local date) returned Gold/XAUUSD tick0.01, provider-day PDC and actual dynamic daily high/low targets, plus positive broker-reported relative-volume readings. The only remaining preparation choice on that source is explicit venue-only versus labelled broker proxy; it was not changed automatically. The supported Coinbase path returned its verified product tick, continuous provider-day PDC, dynamic day targets and positive venue volume. Neither trace saved owner settings, created an order nor activated a schedule.

**Current instrument repair:726tests passed,0failed,1pre-existing auth integration skip(727total).** Current TypeScript/lint/backend/local chart build and web/iOS/Android source exports passed; API/Metro returnedHTTP200. Metadata, nullable/omitted bounds, true provider-day/source/cutoff/age checks, dynamic targets, explicit broker proxy, zero/missing data, personal overrides and every-target-mode PDC source integrity have fixture coverage. The read-only integration reviewer’s one concrete cross-source PDC defect was fixed, with added regressions. The synchronized156-feature guide passed7focused tests and all-platform re-export. The605-file credential-excluding source ZIP passed file/ZIP/checksum verification; final local commit is recorded in its manifest. These checks do not prove actual iPhone behavior, production callbacks/device alerts or automatic fills.

**Earlier three-strategy milestone: 700 tests passed, zero failed, one pre-existing authentication integration skip (701 total).** Those TypeScript, lint, backend/local chart build and web/iOS/Android source exports completed successfully. Fixture-only actual-function checks covered source acquisition/cached partials/retained tails, ALL family integration, actual paper-fill geometry, completed-callback authorization, identity/dedup, quotas and deadline scope—including zero-network expiry at nested public/cache source entrypoints. API and temporary Metro Preview returned HTTP 200. The first six-second Metro health check timed out during initial compilation; the inspected listening service then returned successfully without restart. No configured private credential values were detected in117earlier export files. No owner records/orders or schedules were created. The earlier596-file ZIP was verified. Current instrument-autofill results are recorded separately after final validation and refreshed archive.

No successful production callback, native push receipt, physical iPhone flow, real automatic paper fill or predictive edge is inferred from these source/software-unit checks. A new integration fixture caught the ALL accounting bug; the scoped read-only review caught the server callback-precondition gap. Both were repaired. The obsolete early-heartbeat fixture was corrected, not used to weaken completed-callback proof.

Genuine futures feeds and the incomplete ORB gold/Asia variant remain separate prerequisites. The private source ZIP is a backup—not a recorded Manus checkpoint, owner-data backup or published release.
