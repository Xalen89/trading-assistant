# Paper orders and lifecycle — capability guide

**Scope:** owner-scoped, simulated paper trading only. This audit covers the paper plan sheet plus the paper order, gating, and lifecycle source named in the task. It does not audit the shared workbench UI/API, other strategy or quant tools, or brokerage execution.

## What this capability is for

Use this flow to turn a chart-side Buy/Sell paper proposal into a private simulated trade, then track an optional pending limit entry, an open position, and a closed position. It is for practicing and recording decisions against current quotes—not placing broker orders or establishing that a strategy has an edge.

The plan sheet is `components/trading/paper-plan-sheet.tsx` (the app imports it in `app/(tabs)/index.tsx`). Backend lifecycle operations are in `server/trading/paper-service.ts`; strategy gating is in `server/trading/paper-gate.ts`; deterministic bracket transitions are in `lib/trading/paper-lifecycle.ts`.

## Controls and practical use

### 1. Request/retry a Buy or Sell paper proposal
- **Trader question:** “Can I review a paper plan for this market and direction using current server-side evidence?”
- **Location/use:** From the chart, request a Buy or Sell plan; this opens the **Paper plan review** sheet. If its proposal request failed, read the displayed source-history/proposal error and use **Retry paper proposal** when shown. If no proposal exists and no request is in flight, the sheet says to request a Buy/Sell plan from the chart.
- **Output:** An immutable proposal ID, direction, strategy snapshot count, and proposed entry/stop/target/quantity/risk context when available. Refreshing is described as a fresh server quote/evidence request. No locally invented proposal or fill is substituted.
- **Next:** Review mode, sizing, and ticket; resolve any source/quote blocker before confirmation.
- **Status/limits:** Confirmation is disabled without a proposal ID, while proposal refresh is pending, or when availability, geometry, strategy-mode, or RR validation blocks it (`paper-plan-sheet.tsx:108-129, 204-211, 323-343`). The order service also requires a live quote no more than 120 seconds old and not more than 30 seconds in the future (`paper-service.ts:51-62`). A market must have paper valuation support; unsupported USD valuation is rejected rather than guessing broker lot values (`paper-service.ts:324-332`).

### 2. Manual practice vs. gated strategy mode
- **Trader question:** “Am I deliberately practicing discretion, or should entry require an approved strategy signal?”
- **Location/use:** In **Paper mode**, tap **Manual practice** or **Gated strategy**. For strategy mode, inspect the displayed per-strategy score/threshold/eligibility. Manual practice remains available if strategy gates are not approved/fresh; switch back to practice if you are intentionally recording discretionary practice.
- **Output:** Manual practice is explicitly labeled discretionary, not a valid strategy signal. Strategy mode requires approved, fresh, same-direction confluence and is rechecked server-side before saving; AI cannot bypass that check. Missing/pending gate evidence does not become an invented score (`paper-plan-sheet.tsx:242-275`; `paper-gate.ts:16-43, 45-126`).
- **Next:** To use strategy mode, save an approved gate in the canonical cloud workspace, then refresh the proposal and ensure its evidence is eligible; otherwise use practice mode.
- **Status/limits:** Strategy-mode creation requires a canonical saved workspace and matching strategy versions/configuration; stale or absent approval/configuration blocks it (`paper-gate.ts:56-105`). Pending strategy limits are rechecked at observed entry and wait if canonical strategy/configuration or current confluence evidence is unavailable (`paper-service.ts:204-305, 714-741`).

### 3. Discipline panel and risk templates
- **Trader question:** “What risk bracket am I reviewing, and can I select a sizing template?”
- **Location/use:** Review the **DisciplinePanel** shown in the sheet, then tap **1% risk**, **2% risk**, or **Fixed units** under **Risk template**. A selection requests a fresh immutable server proposal; wait for the refresh to finish before continuing.
- **Output:** Updated server proposal values for the bracket and sizing. For percentage templates, unchanged default quantity may be recalculated against the actual fresh bracket/entry; fixed units remain user-sized. The UI states the server caps risk at 2% and fixed units can be below 0.5% (`paper-plan-sheet.tsx:276-311`; `paper-service.ts:368-429`).
- **Next:** Review entry, stop, target and quantity in the ticket; use restore if you want the current proposal defaults back.
- **Status/limits:** Only the three displayed choices are selectable. The form normalizes legacy unsupported selections to 1% when opened (`paper-plan-sheet.tsx:35, 74-78`). Server accepts proposal templates 0, 0.5, 1, or 2, rejects unsupported templates, applies the 2% cap, and for non-fixed templates enforces a 0.5% reference-risk floor on edited sizing (`paper-service.ts:407-429`). This is a paper-risk calculation, not a broker margin or suitability check.

### 4. Ticket: entry, invalidation stop, target/R:R, quantity
- **Trader question:** “What exact simulated entry/bracket/size am I asking to record, and does it still have valid direction and positive risk/reward?”
- **Location/use:** Under **Ticket**, edit **Entry**, **Stop / invalidation**, **Target price**, and **Paper quantity / units**. Tap **1R**, **2R**, or **3R**, or type a positive **Custom R:R**; R:R mode computes/recomputes target from entry and stop. Directly editing Target price switches to absolute-price mode and preserves that value instead of silently rewriting it. Watch the displayed actual R:R and validation/confirmation message.
- **Output:** Locally parsed numeric draft and calculated actual R:R/geometry status. At server confirmation, market-style entry uses the current executable side quote (long ask, short bid); an unchanged proposal bracket may be resized/recast to preserve selected risk, while edited absolute targets are retained and rejected if fresh geometry is invalid (`paper-plan-sheet.tsx:345-433`; `paper-service.ts:332-405`).
- **Next:** Correct any geometry/quantity error, or use the restore control if you want to discard ticket edits.
- **Status/limits:** Positive finite entry/stop/target/quantity and valid side geometry are required; R:R mode requires positive finite R. Server independently rechecks geometry, sizing, freshness, ownership, daily cap and idempotency. Fixed units can be below the percentage floor but still cannot exceed the cap. No guarantee of executable broker pricing, fees, slippage, or liquidity is implied.

### 5. Restore server bracket and selected risk
- **Trader question:** “How do I undo local ticket changes and return to the immutable proposal?”
- **Location/use:** Tap **Restore server bracket & selected risk** in the ticket.
- **Output:** Restores the proposal’s entry, stop, target, quantity, resets the local R:R selector to 2R/derived target mode, and clears the current message (`paper-plan-sheet.tsx:157-166, 422-432`).
- **Next:** Re-review the restored bracket and then confirm if it is still appropriate.
- **Status/limits:** Disabled during proposal refresh or order save. A percentage template’s unchanged quantity may still be resized server-side against the fresh quote; restore is not a promise the final fill will equal the stale draft.

### 6. Optional pre-trade thoughts
- **Trader question:** “What was my reasoning before this paper trade?”
- **Location/use:** Enter text in **Your optional pre-trade thoughts → Optional notes**.
- **Output:** Trimmed text is stored as the `pretradeThoughts` journal field; blank text sends an empty journal object (`paper-plan-sheet.tsx:71, 184-193`).
- **Next:** Use it later as a journal/review reference.
- **Status/limits:** Optional, not a gate or signal, and kept distinct from generated inspection guidance (`paper-service.ts:517-521`).

### 7. Advanced: order style, discipline guard, bracket auto-management
- **Trader question:** “Should this simulated plan fill at the current quote or wait for a limit observation, and should bracket rules advance automatically?”
- **Location/use:** Expand **Advanced**. Use the nested **DisciplineGuardControl** if needed; choose **Market-style** or **Limit pending**; optionally enable **Paper bracket management**.
- **Output:** Market-style starts as an open paper trade at the fresh side quote. Limit pending starts pending at the entered limit level, then can open only when the service observes an eligible executable-side quote and, for strategy mode, current evidence allows it. Auto-management is an explicit paper-only opt-in for bracket/partial/break-even behavior; pending limit entry observation is separate (`paper-plan-sheet.tsx:444-475`; `paper-service.ts:493-556, 714-765`).
- **Next:** Confirm the order, then monitor pending/open state. If app operation is not continuously scheduled, do not assume a pending limit or bracket will be processed while closed.
- **Status/limits:** Both order styles are paper-only and do not send a broker order. Limit observation uses long ask/short bid and valid bracket geometry; stale or unavailable quotes/evidence do not make a fill. Manual open trades can still accumulate changing observed MAE/MFE excursions but their stop/target/partial rules do not advance. Automatic management applies only when opted in; one observed candle touching both stop and target resolves stop-first. Partial handling is one 50% partial at the configured 2R level followed by moving the remaining stop to entry (`paper-lifecycle.ts:181-200, 294-421`). Bar ranges may establish a touch but do not reconstruct intrabar path or bid/ask; simulation excludes fees, slippage and invented spread (`paper-lifecycle.ts:84-108, 177-188`). Backend explicitly warns missed intrabar paths are not reconstructed and closed-app operation requires deployed scheduling (`paper-service.ts:777-780`); source inspection does not establish that such scheduling is deployed.

### 8. Confirm paper order
- **Trader question:** “Can I create this as a durable owner-only simulated trade under the current checks?”
- **Location/use:** Tap **Confirm LONG/SHORT paper order**. If disabled, resolve the visible blocker. Wait for **Saving paper order…**; on success the sheet calls the trade-created callback and closes; on failure it displays the error and creates no local fill (`paper-plan-sheet.tsx:167-211, 483-495`).
- **Output:** A backend-persisted owner-scoped trade record: market-style is `open`; limit-style is `pending`. It records initial risk/quantity, proposal/strategy snapshots, paper-only execution source, and a created event (`paper-service.ts:493-560`).
- **Next:** For open trades, review/optionally edit or close; for pending limits, wait for observed eligible entry or update the plan through available paper-trade controls.
- **Status/limits:** In addition to proposal/quote/geometry/risk/gate checks, service checks saved daily realized-drawdown cap and cooldown when configured, refuses an unverifiable oversized bounded ledger, and caps active positions at 100 (`paper-service.ts:430-489`). An immutable proposal is idempotent; reuse with a different mode conflicts and asks for a fresh proposal (`paper-service.ts:307-323`). Confirmation is paper-only; no broker order or position modification is made.

### 9. Pending → open → closed lifecycle (server capability)
- **Pending:** A limit-style paper record remains pending until observed side-quote criteria and valid current evidence permit opening. Strategy pending may record a durable gate-wait reason; practice wait may remain silent. It does not become filled merely because a synthetic test says so (`paper-service.ts:714-741`; `tests/trading/pending-paper-gate.test.ts` is explicitly synthetic/mocked).
- **Open:** Market-style records open at creation; pending limit can open later at observed entry. Open trades can receive changing excursion extrema from observed quotes. Only opted-in trades auto-advance stop/target/partial/break-even (`paper-service.ts:743-765`; `paper-observations.test.ts` uses synthetic fixtures).
- **Edit:** `editPaperTrade` uses a version check. For non-closed trades it validates and saves stop/target and optionally autoManage; it preserves original bracket/risk reference in event history. For a closed trade, bracket edits are rejected and only a review can be saved (`paper-service.ts:570-645`).
- **Close:** `closePaperTrade` is available only for an open record, requires matching version and fresh current quote, then closes at the exit side (long bid/short ask), writes a closed event, and explicitly leaves any broker position unchanged (`paper-service.ts:647-684`). Pending records cannot be manually exited by this operation.
- **User-facing location caveat:** The inspected plan sheet shows creation controls; this audit did not verify which trade-list/detail controls expose edit/review/close in the app. The server service supports those operations, but do not infer a particular visible button or device interaction from the backend alone.

## Operational use versus validation

These operations answer “what paper record and state transition did the service create from the available quote/evidence?” They do **not** answer “does this strategy have statistically significant predictive value?” The lifecycle fixtures test deterministic mechanics only. In particular, `tests/trading/paper-lifecycle.test.ts`, `paper-form.test.ts`, `paper-service.test.ts`, `paper-gate.test.ts`, `pending-paper-gate.test.ts`, and `paper-observations.test.ts` use unit/synthetic/mocked inputs (the service quote fixture itself says “Synthetic unit quote”). Passing fixtures are not Expo/device proof, live market validation, backtest results, or evidence of strategy edge. No simulated fixture establishes any trading claim.

## Quant-family scope note

The four requested paper files expose order creation, proposal/gate prerequisites, and lifecycle mechanics; they do not implement a distinct quant-family math tool, signal-generation control, or “no signal/insufficient” quant output. Accordingly, no quant-family default-data or parameter requirement is claimed here. A blocked paper proposal/gate is an operational prerequisite state, not a quant signal and not a validation verdict. No multi-leg order or queued-order capability is confirmed by this audit.

## Confirmed defects

**None identified** in the inspected paper-plan, service, gate, lifecycle, and directly relevant tests. This is source inspection only; it does not certify runtime/device behavior.
