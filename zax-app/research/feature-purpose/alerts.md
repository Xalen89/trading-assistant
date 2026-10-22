# Alerts capability — feature purpose and use

**Capability:** Trade / confluence / scenario alerts and delivery (`alerts`)  
**Project:** `/home/ubuntu/stratdesk`  
**Scope:** Read-only source audit of the Alerts screen, notification controls/delivery, foreground sync, and relevant pure alert logic/tests. No project code was changed, no browser or live API/DB was used, and no device or delivery test was performed.

## What this capability is

Alerts are **paper-analysis notifications**, not trading instructions or orders. A user makes rules in the Alerts screen, saves them locally, and explicitly saves the workspace to the owner’s cloud workspace before the server can scan those rules. While the app is active, saved cloud rules can be scanned automatically about once a minute; a manual **Test foreground scan** is also available. Closed-app delivery is a separate setup path requiring a deployed backend, a genuine iOS/Android build, push credentials and permission, registered device, cloud-saved rules, and a deployed schedule.

The project is owner-only and paper-only. No alert rule submits a broker order; no multi-leg order or order queue is implemented by this capability.

## Screen controls and rule types

### 1. Create a rule — common setup

- **Where:** Alerts tab → **New rule** opens **Create alert rule** (`app/(tabs)/alerts.tsx:302–433`).
- **Purpose:** Define what market, timeframe, and strategy should be watched, and what kind of event is worth reviewing.
- **Tap-by-tap:** Tap **New rule**. Optionally enter a name. Choose one **Rule condition**. For above/below, enter a positive price. For confluence/below-gate, the screen shows the default 70 points and 2 conditions. Search the connected market catalog and tap a displayed market (up to six matches are shown), tap one non-archived strategy, choose a timeframe (1m, 5m, 15m, 1h, 4h, 1d, 1w), review the scope, then tap **Save local alert rule**.
- **What happens:** The rule is inserted at the front of the local workspace with `enabled: true`; default cooldown is 30 minutes except scenario-direction, which is 1 minute. The rule name defaults to `<market> <kind>`. This save is local, not cloud save. The feedback explicitly says that scanning applies to canonical foreground rules and closed-app delivery remains pending.
- **Next action:** Tap **Save rules to cloud** before expecting foreground scans to use the new rule; complete the separate mobile-push/schedule setup only if closed-app delivery is wanted.
- **Limits:** The create screen selects one strategy at a time and stores a single selected strategy in `combinedStrategyIds`; it does not provide multi-strategy selection. It does not place any trade.

### 2. Price above / below

- **Where:** New rule → **ABOVE** or **BELOW** (`alerts.tsx:314–351`); evaluated in `server/trading/notifications.ts:425–487`.
- **Purpose:** Ask “has the current live quote reached or crossed my chosen price?”
- **Tap-by-tap:** Choose ABOVE or BELOW; enter a finite positive threshold; set market/strategy/timeframe as above; save locally, then cloud-save. Leave the rule enabled. A manual scan or active-app polling evaluates it against a live quote.
- **Actual event:** For ABOVE, `quote.price >= rule.price`; for BELOW, `quote.price <= rule.price`. A successful event records price, quote source/time basis, rule, and strategy version. It is deduplicated by a cooldown time bucket. Stale/unavailable quotes do not count as a trigger.
- **Next action:** Review the event’s price and source; tap its history card to open the chart at that market/timeframe and mark the event read.
- **Limits:** A quote crossing is only the rule condition, not a calibrated success probability, entry recommendation, or order. A source timestamp can be unavailable (received time instead).

### 3. FVG event

- **Where:** New rule → **FVG event** (`alerts.tsx:314–341`); evaluation (`notifications.ts:431–455`).
- **Purpose:** Ask “is there a recent deterministic fair-value-gap candidate in the fetched candle history?”
- **Tap-by-tap:** Choose FVG event, market, strategy and timeframe; save locally and then to cloud. Keep enabled and scan.
- **Actual event:** Server fetches candles, excludes candles not yet closed, runs the deterministic gap finder and considers a candidate whose end is within the last two candle positions. Evidence identifies side, gap bounds, CE midpoint, and bars. If the fetch fails, or no candidate qualifies, no event is produced.
- **Next action:** Inspect the event and captured market/timeframe; independently review/confirm the candidate before any paper decision.
- **Limits:** The code calls it a candidate requiring confirmation. It is not a confirmed setup, predictive edge, or trade order.

### 4. Ready setup

- **Where:** New rule → **SETUP** (`alerts.tsx:314–341`); evaluated in `notifications.ts:314–423` and setup identity in `lib/trading/setup-alerts.ts:2–12`.
- **Purpose:** Ask “has the selected model produced a ready setup candidate in the current analysis?”
- **Tap-by-tap:** Choose SETUP, then market/strategy/timeframe; save locally and cloud-save; scan.
- **Actual event:** Fires when `setupAnalysis` has at least one candidate marked `ready`. Event text reports aligned supported conditions and selected model count, includes the estimate label/profile basis/messages as evidence, and captures a limited candle slice. A stable identity uses ready candidate strategy/version/side/zone IDs to avoid repeat events for the same setup identity.
- **Next action:** Open the alert’s chart context, review the saved source/evidence, and decide independently whether any paper workflow is appropriate.
- **Limits:** “Ready” is an engine state, not a validated strategy return or probability. No ready candidate means no event; analysis/source failure skips that rule.

### 5. Scenario shape update

- **Where:** New rule → **SCENARIO SHAPE UPDATE** (`alerts.tsx:314–341`); previous/current scenario comparison in `notifications.ts:323–423` and `lib/trading/setup-alerts.ts:14–43`.
- **Purpose:** Ask “has the historical-source scenario materially changed shape or side?”
- **Tap-by-tap:** Choose the scenario shape update condition, choose market/strategy/timeframe, save locally and to cloud, then scan.
- **Actual event:** With no previous setup, a present scenario qualifies as the initial change. Later, it detects presence/absence changes, a side change, or a sufficiently large difference between normalized scenario close paths. Event text says “Historical scenario changed”; its evidence includes estimate/profile basis and analysis messages.
- **Next action:** Open the captured analysis and compare the scenario source/shape with the latest chart context.
- **Limits:** A change is not a price-direction flip or forecast accuracy claim. If scenario/history is missing or no meaningful change is established, there is no event.

### 6. Historical scenario direction flip

- **Where:** New rule → **Scenario direction flip** (`alerts.tsx:314–341`); direction state in `server/trading/scenario-directions.ts` and pure transition logic in `lib/trading/scenario-direction.ts`.
- **Purpose:** Ask “did the endpoint of the drawn historical line/ghost move from up to down or down to up relative to its anchor?”
- **Tap-by-tap:** Choose Scenario direction flip, set market, strategy and timeframe; save locally and to cloud. Run a scan (or wait for the scheduled scan). The first successful scan establishes a baseline and is intentionally not an alert.
- **Actual event:** Compares the historical scenario’s final drawn close with its anchor using a 1-basis-point flat deadband. On a true reversal, the event title shows previous → current direction and the body points to captured scenario data. Flat/missing history does not manufacture a reversal. Strategy/version/source context changes reseed rather than count as a flip. The one-minute cooldown coalesces brief reversals; if still reversed after cooldown, a later scan can emit it.
- **Next action:** Tap the event to inspect the captured line/ghost and its source. Treat it as a replay change to review, not as a price prediction.
- **Limits:** Setup long/short labels are not used as the direction signal. First observation is baseline-only; a source/version/context change is a new baseline. Broker scan rotation can delay observation. Unit tests use synthetic fixtures and do not prove live-source or device behavior.

### 7. Weighted confluence alert

- **Where:** New rule → **CONFLUENCE** (`alerts.tsx:314–371`); decision function `lib/trading/confluence-alerts.ts:3–52`; server evaluation `notifications.ts:302–312`.
- **Purpose:** Ask “has the named trigger fired on current supported closed-bar evidence, and do enough enabled weighted conditions meet my alert threshold?”
- **Tap-by-tap:** Before creating this alert, configure a valid confluence contract on the chosen strategy in the strategy/workbench workflow: explicitly review and approve it, map the trigger and conditions to supported native closed-OHLC steps, and ensure the selected market/timeframe has usable completed candles. In the alert sheet select CONFLUENCE, set alert points (default **70**, allowed 0–100) and condition count (default **2**, integer 1–100), choose one strategy/market/timeframe, save locally, then cloud-save and scan.
- **Actual output/decision:** Deterministic score is the sum of weights of enabled conditions marked met (0–100), not a probability. The alert requires valid config and non-null score, human approval, a met trigger, no active pending/stale checklist source, score at least the alert’s minimum points, and at least the minimum number of enabled met conditions (and at least one). Event body explains met/total, score vs alert threshold, and entry-gate status; evidence contains decision reasons and checklist statuses/weights.
- **Actionable default requirements:** The screen’s defaults are 70 alert points and 2 conditions. Separately, the strategy contract itself must have a valid 0–100 entry threshold and at least one enabled condition; enabled weights must sum to 100 (not auto-normalized); approval must be approved for the exact strategy/version; the trigger must be met from sourced closed `t-1` OHLC; source observations and bars must be named, ready, current/fresh, and same-timeframe-bound. The strategy must have exactly one current same-version candidate (or an explicit side binding resolving ambiguity). In this code’s native OHLC adapter, manual/context/news-only steps are not promoted into native conditions. For the built-in native source, freshness is capped at two explicit timeframe intervals.
- **Next action:** Read the stored decision snapshot/evidence, check which conditions were met and why others were pending/not met, then review the underlying chart. Separately validate any strategy statistically before making performance claims.
- **Limits / insufficient:** Invalid/unapproved config, no current same-version candidate, ambiguous candidate side, unsupported native steps, stale/missing/incomplete bars, pending source, un-met trigger, score below alert threshold, or too few met conditions means no alert. This is only deterministic operational rule evaluation: no success probability is computed and no execution side effect exists. Unit fixtures are synthetic state tests, not observed samples, statistical validation, or device proof.

### 8. Below-entry-gate warning

- **Where:** New rule → **BELOW-GATE** (`alerts.tsx:314–371`); same evaluator/decision helper as confluence (`confluence-alerts.ts:41–45`).
- **Purpose:** Ask “did the approved, sourced trigger fire while the weighted score remains below the configured entry gate?” This is a warning, not an entry alert.
- **Tap-by-tap:** Configure and approve a valid confluence strategy first. Select BELOW-GATE, choose one strategy/market/timeframe, then save locally, cloud-save, and scan. The form currently also displays point/count fields.
- **Actual output/decision:** Requires the same valid config, approved contract, met trigger and no pending active conditions. It fires exactly when `gateMet` is false. Event title says **Trigger below entry gate** and body reports score against the entry gate.
- **Next action:** Review the unmet gate and supporting snapshot; do not interpret this warning as entry permission.
- **Limits / insufficient:** The on-screen minimum-points and minimum-conditions values are stored but the below-gate branch returns before checking them; only the entry gate determines above/below gate after the prerequisites. No order is placed and no statistical claim is made. Missing/stale/ambiguous inputs prevent a warning.

## Managing saved rules

- **Where:** Alerts tab → **Rules** list (`alerts.tsx:224–275`).
- **Purpose:** Turn an existing watch on/off or remove it.
- **Tap-by-tap:** Tap **Enable rule** to toggle its local enabled state. Tap **Remove rule** to remove it from the local workspace. Use **Save rules to cloud** after a change if the server should adopt it.
- **Actual output:** Rule cards show name, market, timeframe, condition/threshold and cooldown, plus ON/OFF. The “saved cloud rules scan each minute while this app is active” detail is conditional on cloud save.
- **Next action:** Save to cloud; then allow the app to remain active or use the separate scan control.
- **Limits:** Local changes alone do not change the server’s canonical cloud workspace. A cloud-save failure leaves local data unchanged but does not apply it to server scans.

## Scanning and delivery controls

### 9. Save rules to cloud

- **Where:** Historical scenario direction watch card → **Save rules to cloud** (`alerts.tsx:177–199`), also cloud save is attempted automatically before manual scan (`102–121`).
- **Purpose:** Persist the owner workspace as the canonical input to server-side scanning.
- **Tap-by-tap:** After creating, toggling, or removing rules, tap **Save rules to cloud** and wait for the displayed `cloudMessage`. The manual scan attempts this save first and stops without scanning if it fails.
- **Actual output:** Success message says it saved to the cloud workspace; failure message says cloud save failed and local workspace is unchanged. Save uses the owner-protected workspace endpoint.
- **Next action:** If successful, manually test or leave the app active for foreground scans. For closed-app alerts, continue with mobile enrollment and schedule activation.
- **Limits:** Cloud save is explicit, not implied by local rule save. Publication/source preview is not a deployed scheduler.

### 10. Test foreground scan

- **Where:** Alerts tab → **Test foreground scan** (`alerts.tsx:208–223`), invokes owner-protected `notifications.scan` (`server/trading/router.ts:52–57`).
- **Purpose:** Ask “what do the currently saved cloud rules produce in one bounded server scan?”
- **Tap-by-tap:** Tap **Test foreground scan**. It first saves the current workspace; if that fails, it reports that no scan was run against stale rules. Wait for scan completion.
- **Actual output:** New events are inserted into local history and a message reports the bounded read-only scan, any deferred broker markets/timeouts/unavailable rules, and push prerequisites. The scan has a 45-second deadline and a 12-information-request broker budget including bootstrap reserve; same-market work can reuse quote/candle reads, and excess broker markets rotate to future scans.
- **Next action:** Review new history items; fix the reported source/configuration issue or wait for a later rotating scan if deferred.
- **Limits:** This is a foreground test, not proof of closed-app push. No signal means no qualifying event was emitted in this scan; it does not prove a strategy ineffective. Missing/stale quote/feed, insufficient history, no rule match, broker budget deferral, deadline, or invalid confluence evidence can all yield no event.

### 11. Automatic foreground scanning

- **Where:** App-level `ForegroundAlertSync` mounted in `app/_layout.tsx:100`; behavior in `components/trading/foreground-alert-sync.tsx:7–83`.
- **Purpose:** Keep saved rules checked while the owner’s app is open without requiring repeated manual taps.
- **Tap-by-tap:** No separate control. Enable at least one local rule and keep the app active; sync checks immediately on activation/resume and then roughly every 60 seconds. Errors appear as a dismissible “Alert scan” banner; tap it to dismiss.
- **Actual output:** Calls the same server scan mutation, merges newly returned events into workspace history, and suppresses duplicate event IDs. It avoids concurrent scans in this component.
- **Next action:** Resolve any visible error and confirm the rule is cloud-saved; use Test foreground scan when a deliberate immediate check is needed.
- **Limits:** App-active polling only. It calls server scans against saved cloud rules, so a locally enabled but unsaved rule is not a canonical scan rule. It is not a background/closed-app scheduler and does not guarantee timely detection or push.

### 12. Mobile push enrollment and deployed schedule

- **Where:** Alerts tab → **Notifications after publication** card → **Enable mobile push** and **Activate deployed scans** (`components/trading/notification-controls.tsx:139–242`). The closed-app activation badge is at `alerts.tsx:154–175`.
- **Purpose:** Enroll this device and schedule server scans while the app is closed.
- **Tap-by-tap:** Prerequisites: deploy the backend containing the schedule handler; install a genuine iOS/Android development or release build with a valid Expo project ID plus APNs/FCM build credentials; sign in as the approved owner; grant OS notification permission; tap **Enable mobile push** and confirm enrollment message. Save rules to cloud, then tap **Activate deployed scans**. Finally verify a genuine rule trigger and device delivery.
- **Actual output:** Enrollment obtains an Expo push token and registers it to the owner. Activation requests a once-per-minute deployed heartbeat job bound to the owner’s workspace. Backend writes event, sends Expo push, and can later inspect receipts; a push tap fetches the owner-stored event and routes to the captured market/timeframe/strategy. Android gets a `trading-alerts` channel. Notification display is silent (no sound or badge configured).
- **Next action:** Verify a real trigger from a genuine installed build; review device OS settings and provider/scheduler status if delivery does not arrive.
- **Limits / status:** Web/Safari Preview and Expo Go are explicitly unsupported. The badge reports **CONFIGURED** only if the backend status says project ID configured and a schedule is registered; this does not prove device permission, token validity, feed availability, or actual delivery. Push provider acceptance is not the same as device receipt. A missing token is recorded as no-device; rejected/unknown/receipt-error are possible delivery outcomes. A first direction scan seeds its baseline, so schedule activation alone will not create a direction-flip event. No app control guarantees availability against feed, scheduler, OS, network, or push-provider failure.

## Alert history and opening an alert

- **Where:** Alerts tab → **Alert history** (`alerts.tsx:276–301`).
- **Purpose:** Review actual events rather than just configured rules.
- **Tap-by-tap:** Tap an event card. The app sets its market/timeframe, selects the captured strategy when it still exists, marks that event read, and navigates to the chart with its alert ID (`alerts.tsx:123–139`). Push response handling also fetches the owner-stored event rather than trusting push payload details (`notification-controls.tsx:37–82`).
- **Actual output:** History cards show event title/body, market, timeframe, and source; unread cards have a highlighted border. Empty state says no delivered events until a rule genuinely triggers.
- **Next action:** Inspect captured chart context and source/evidence before deciding what to do. If no alert exists, review rule enablement, cloud-save status, scan feedback, data freshness, and type-specific prerequisites.
- **Limits:** The list itself does not expose every field such as full evidence/delivery lifecycle status. An empty list is not evidence that a strategy has no edge; it can simply mean no rule triggered or scanning/data prerequisites were not met.

## Interpretation and verification boundaries

- **No signal / insufficient evidence** means the rule’s code path did not establish the required condition in that scan. It may reflect no match, lack of a current candidate, incomplete/stale/missing bars, pending source, unavailable quote, first direction baseline, scan rotation/deadline, or an unapproved/invalid configuration. It is not a negative forecast.
- **Operational alert behavior is not strategy validation.** The confluence score is deterministic weighted condition points. The contract explicitly provides no success probability. A passing pure-function fixture tests only the supplied fixture states; it does not establish actual-market samples, edge, profitability, device push, or app behavior.
- **What a user can do with output:** inspect the captured alert and market context, correct setup/source/approval gaps, adjust rule thresholds/counts or timeframe, observe paper behavior, and separately conduct appropriately controlled historical/out-of-sample validation. Alerts do not open, queue, combine, or manage broker orders.

## Relevant tests inspected

- `tests/trading/confluence-alerts.test.ts` labels its cases **synthetic state fixtures only**. It checks below-entry-gate warning vs no execution, minimum condition count, trigger/approval requirements, pending condition blocking, and below-gate clearing when the gate is met.
- `tests/trading/scenario-direction-store.test.ts` uses isolated mocks/synthetic analyses to check baseline, reversal, cooldown, context reseeding, deduplication and pending outbox state.
- `tests/trading/scan-budget.test.ts` checks broker request budgets, coalescing, frame costs, rotation and deadline helpers.

These are source-level unit tests; no claim is made here that they were run, that a physical device was tested, or that a live push/feed worked.

## Confirmed source defects in this capability

1. **Price rule’s threshold label can name the wrong market.** `app/(tabs)/alerts.tsx:344–350` labels the field with `workspace.market` even though the form’s selected watch market is `alertMarket`. After choosing another market, the input heading still names the workspace’s current market. Minimal fix: render `alertMarket` in the label.
2. **Below-gate form shows criteria that the decision ignores.** `app/(tabs)/alerts.tsx:353–371` displays and validates “Minimum confluence points” and “Minimum conditions” for both kinds; `lib/trading/confluence-alerts.ts:41–45` returns from the `below-gate` branch before those values are checked. Minimal fix: hide/label those fields as confluence-only when `kind === "confluence"` (or explicitly wire them into below-gate semantics). The present behavior is that below-gate fires when its approved trigger/prerequisites pass and `gateMet` is false, regardless of those displayed values.
