# Trade journal, deep dive & performance review (`journal`)

**Audit basis:** read-only review of the requested source files plus directly referenced performance, screenshot, and learning-review UI and associated tests. No project code or data was changed, no app/browser/device was run, no owner database/API was queried, and no screenshot contents were opened. The statements below describe source-defined behavior, not a claim that the current build works on a device.

**Sources reviewed:** `app/(tabs)/trades.tsx`; `components/trading/stored-paper-history.tsx`; `lib/trading/paper-performance.ts`; `lib/trading/confluence-analytics.ts`; and the directly referenced `components/trading/performance-dashboard.tsx`, `components/trading/trade-screenshot-panel.tsx`, `components/trading/learning-dashboard.tsx`. Related tests inspected: `tests/trading/paper-performance.test.ts`, `confluence-analytics.test.ts`, `confluence-runtime.test.ts`, `trade-features.test.ts`, `paper-lifecycle.test.ts`, `paper-service.test.ts`, and `coach-ui-state.test.ts`. The tests use synthetic/unit fixtures; I did not run them as device or live-market tests.

## Feature guide

### 1. Paper balance and performance summary

- **Where:** Trades tab, at the top (`trades.tsx:147–163`; `performance-dashboard.tsx:8–15`).
- **Trader question:** What is the current recorded paper balance and how are recorded trades and open paper risk doing?
- **How to use:** Open **Trades**. Review the paper balance card and the six-cell performance panel. No controls are needed for ordinary viewing. The panel recalculates on a 15-second timer and obtains quotes for up to 40 distinct open-trade markets.
- **What it shows:** Starting paper balance plus recorded realized P/L; open P/L; open risk; mean planned R:R; realized P/L; UTC-day closed-trade peak drawdown; and the saved paper cap. Open P/L is marked with a current live quote (bid for longs, ask for shorts, falling back to price); if any open position lacks an acceptable quote, aggregate open P/L/equity is withheld as **Unknown**, with missing symbols listed.
- **Useful next action:** If open P/L is Unknown, wait for a fresh quote and refresh/return to the screen; review closed trades and the trade journal before making a human process decision.
- **Status:** Implemented in source as a paper-only summary; quote availability and runtime behavior were not verified on a device.
- **Limits/prerequisites:** This is recorded/simulated P/L, not brokerage balance or execution data; the panel explicitly excludes spreads, fees, and slippage and says its units are not broker lots. Daily drawdown is UTC-day **closed-trade** peak drawdown, not open-equity or live intraday drawdown. It needs valid recorded trade fields and fresh live quotes to mark open P/L. Source accepts a quote up to two minutes old; see confirmed issue below regarding future timestamps.

### 2. Optional paper daily drawdown cap

- **Where:** Trades tab directly below performance (`trades.tsx:165–183`).
- **Trader question:** What paper-only daily loss limit do I want recorded for this workspace?
- **How to use:** Enter a positive percentage up to 100 and tap **Save paper limit**; leave blank and save to unset. The screen displays a local-update message. The performance panel reflects the saved percentage and displays a warning when its known daily closed-trade drawdown is at/above the cap.
- **What it does:** Saves `dailyDrawdownLimitPct` through the local workspace update; it does not set broker risk controls. Related service fixture tests exercise blocking paper-order creation at a saved cap, but that is not broker enforcement.
- **Useful next action:** Treat the cap as a paper-workflow guardrail; if the cap is reached, stop creating paper orders and review the recorded loss sequence.
- **Status:** UI field/save and warning are implemented in source. No runtime/device/API verification was performed.
- **Limits/prerequisites:** Blank unsets; finite values must be `> 0` and `<= 100`. A zero value is rejected although the validation message says “0–100%”; see confirmed issue below. A drawdown value can be Unknown when closed timestamps/event timing is missing. No broker setting or order changes.

### 3. Pending / open / closed paper-trade lists and card actions

- **Where:** Three status tabs and their cards on Trades (`trades.tsx:184–235`, `255–323`).
- **Trader question:** Which saved plans are pending, which paper positions are open, and what has been closed?
- **How to use:** Tap **Pending**, **Open**, or **Closed**; each shows a count. Inspect cards for market, side, strategy/version, date, entry, risk, R:R, and (closed only) P/L. Tap **Chart order** or the empty-state **Create paper plan** to go to the chart/order workflow.
- **Card behavior:** Pending legacy cards open their record for inspection. An open trade’s main card tap navigates to its chart. For an open trade, tap **Close at live quote** to request a simulated archive/exit; confirm the prompt. The code requires a live quote newer than two minutes, uses bid for a long and ask for a short, records the quote source/time, and otherwise reports that no synthetic fill was created. Closed cards open the ordinary trade deep dive.
- **Useful next action:** Open a closed card for post-trade review; open an open card’s chart to inspect the live context; create a validated plan from the chart rather than trying to fill a legacy pending entry.
- **Status:** Lists/cards and source-defined interactions are implemented. There is no device proof.
- **Limits/prerequisites:** All records are paper-only. The pending list’s legacy records are archival: the attempted fill path explicitly refuses to fill and says to create a validated paper order from Chart Buy/Sell. Manual close is quote-driven simulation, not a broker close; it excludes spread/fees/slippage in the deep-dive disclosure. A current usable quote is required.

### 4. Per-trade deep dive, pre-trade journal, and post-trade review

- **Where:** Select a pending/closed card, or choose the details action on a retained order; `trades.tsx:238–251`, `333–435`.
- **Trader question:** What did I plan, what was the recorded result, and what did I learn afterward?
- **How to use:** In a normal (legacy/local) trade deep dive, review market/side/strategy version, entry/stop/target/exit, recorded outcome and R, and every `JOURNAL_STEPS` entry. Missing journal entries display **Not recorded**. Enter a post-trade note and tap **Save my review**. For a closed record, optionally tap **AI review closed record** and wait for a response; the button is disabled while the record is open or the request is pending.
- **What it outputs:** Your note is saved in local workspace state with a message saying cloud sync is explicit. The optional AI review response is stored as `aiReview` and shown in the sheet; failures are displayed as a message. Outcome disclosure says quote simulation excludes spread, fees, and slippage.
- **Useful next action:** Write a concrete process observation against the recorded plan and outcome; use an AI response as a prompt for your own review, not as an execution decision.
- **Status:** Source implements local review saving and a closed-only review request. Tests inspected do not prove the screen/API works in a live app.
- **Limits/prerequisites:** AI review requires a closed record and a working review service. A saved local note is not itself cloud-synced. No AI output is a verified result, investment recommendation, or evidence of edge.

### 5. Trade screenshot review (optional evidence subtool)

- **Where:** Collapsible **Screenshot review** section within a trade deep dive; it is initialized to Before / During / After according to pending / open / closed status (`trades.tsx:391–401`; `trade-screenshot-panel.tsx:104–137`, `296–469`).
- **Trader question:** What is visibly present in a private chart screenshot, and what remains uncertain about the setup/process?
- **How to use:** Expand the section, select **Before**, **During**, **After**, or **Unknown**, optionally keep/uncheck the link to this paper trade, and optionally enter a known capture/trade time (ISO with `Z` or numeric offset) and timezone. Tap **Choose screenshot** and select PNG/JPEG/WebP (maximum 8 MiB), then **Upload & analyze**. Read the draft’s visible facts, confluence observations, bounded process lessons, and limitations. Tap **Confirm & retain review** only if you want to keep that review revision. A retained item can be tapped to reopen its review/source metadata; if no draft exists, use **Retry analysis**.
- **What it outputs:** A draft review with summary, evidence/certainty, visible-time status, limits/unknowns, and explicit “outcome: unverified from screenshot” messaging. Confirmation retains a protected source revision only; the component states canonical trade fields, fills, SL/TP, and outcomes do not change. It never reads an existing original image directly on the client; source says protected bytes are retrieved server-side by source ID.
- **Useful next action:** Use screenshot notes as evidence for a manual journal entry, keeping visual observations distinct from verified fills/outcomes.
- **Status:** Upload/analyze/confirm/reopen controls exist in source; no source image was inspected, no upload was made, and no runtime verification was done.
- **Limits/prerequisites:** A supported image <=8 MiB and working owner-scoped screenshot service are required. Known timestamps require an explicit timezone offset. A screenshot cannot verify execution or outcome; confirming a review does not validate a strategy or alter the canonical trade. In standalone mode no trade is linked.

### 6. Full retained paper history and pagination

- **Where:** **Full retained paper history** card below the workspace trade list (`trades.tsx:237`; `stored-paper-history.tsx:26–81`).
- **Trader question:** Where can I find older durable paper records beyond the current local list?
- **How to use:** Tap a listed market/side/status/date row to open its retained-trade detail. Tap **Earlier trades** to fetch the next cursor page, then **Latest** to return to the first page.
- **What it outputs:** The UI describes this as paginated durable logs and immutable event snapshots, explicitly **not broker account history**. Empty, loading/error conditions have text paths. Its empty state says chart-created orders save immediately; manual local logs archive on explicit cloud save.
- **Useful next action:** Open a record to inspect its immutable events, revision trail, original journal, and paper result.
- **Status:** Source defines history query, row selection, and cursor controls. Server/API availability and owner data were not checked.
- **Limits/prerequisites:** Requires retained paper records and a working history service. Local-only records may not yet be present in durable history. This is not account history or an imported broker ledger.

### 7. Retained trade details, bracket/review revisions, and paper close

- **Where:** Open a history row or a trade card labeled **Details / working bracket / review**; `stored-paper-history.tsx:83–310`.
- **Trader question:** What is the canonical paper record’s current/original risk state, event history, and revision history—and do I need to adjust its simulated bracket or review?
- **How to use:** Wait for detail data, inspect entry, original stop/risk, remaining versus initial units, (closed only) net paper P/L and original R, original journal, optional generated inspection guide, event list, and version trail. For a non-closed trade, edit **Working stop** and/or **Working target**, optionally toggle **Opt-in paper bracket management**, edit **Post-trade review**, then tap **Save bracket / review revision**. For an open trade, tap **Close paper at source quote** to request a paper exit. Save updates use the current version and show a conflict/service error if rejected.
- **What it outputs:** Save creates a new immutable paper revision; code says original risk and user journal are unchanged. Close reports that it used the actual source quote and did not change broker positions. Events and versions provide a record of changes.
- **Useful next action:** Use revisions to preserve a traceable paper history; use the event/version trail to compare original and amended plans.
- **Status:** Source implements the details/revision/close UI and mutations. The detail save button is disabled until detail data exists; no runtime test was done.
- **Limits/prerequisites:** Needs detail data and a functioning paper detail/edit/close service. The bracket-management toggle is explicitly paper-only/source-quote observation; its own UI says minimized/closed operation requires deployed scheduling. Do not assume always-on monitoring is running. No broker orders, multi-leg execution, or queued broker orders are represented here.

### 8. Learning review / descriptive paper analytics (quant-family view)

- **Where:** Tap **Learning review · your actual paper records** in the general AI Coach (inside its scroll content) or in the Library page (`components/trading/ai-coach.tsx:476–489`; `app/(tabs)/library.tsx:516–518`; widget `components/trading/learning-dashboard.tsx:6–79`). This is not shown in the Trades tab itself.
- **Trader question:** How much eligible paper outcome data and point-in-time context has been collected, and do coarse confluence-score buckets merit human review?
- **How to use:** Open the general AI Coach or Library, tap **Learning review · your actual paper records**, and inspect the eligible closed outcome / entry-feature / confluence-snapshot counts and each fixed score band (0–24, 25–49, 50–74, 75–100). Read any human-review/watch proposal and its basis/action. Tap **Hide learning review** to collapse it.
- **What the visible UI outputs:** Eligible closed outcomes and snapshot coverage; per-score-band outcome counts, descriptive win rate and observed expectancy R (or “rate/expectancy withheld” when absent); up to four human-only proposals; data scope. It explicitly labels the data paper-only/descriptive, says fewer than 100 outcomes per comparison is insufficient, and warns that even larger paper data does not prove live edge. The visible component does **not** render all values computed by the pure analytics module: e.g. condition present-vs-absent table, correlation pairs/diagnostics, regime breakdown, or exploratory chronological gate are not displayed by this widget.
- **Useful next action:** Improve prospective paper-ledger coverage and preserve valid entry-time feature/confluence snapshots; review the data quality and predeclare any later human test. Do not promote a rule or change thresholds from this display.
- **Status:** UI is wired to request `coach.analytics` when expanded and presents descriptive results if returned; this audit did not query that endpoint or verify rendering on a device. `confluence-analytics.ts` is pure calculation, not proof of a trading signal.
- **Exact data/parameter requirements from the math:** Eligible comparisons require canonical **closed** records with finite positive closed time no later than the analysis cutoff, finite final P/L, and recoverable positive **original** risk. R is final P/L divided by original risk (including recorded partial P/L through `tradeMetrics`). Entry feature snapshots must be version 1, valid and not later than entry; confluence evaluation snapshots must also be valid and no later than entry (the latest eligible snapshot is used). Missing/invalid snapshots are counted as missing/invalid—not imputed as “condition absent.” A condition’s present-minus-absent expectancy difference/rank is withheld until there are at least **100 observed outcomes in each group**; even then status is **unconfirmed**, not validated. The score buckets are fixed. Comparisons/correlations use at most the first **2,000 eligible outcomes** chronologically and at most the lexical first **100 condition keys**; overall descriptive outcome metrics use the full eligible set. Correlations are binary met/not-met Pearson associations, only surfaced by the math when absolute correlation exceeds 0.9; constant series produce null, not zero. The exploratory split is chronological 70% training / 30% holdout and requires 100 present plus 100 absent training outcomes; code explicitly says no formal out-of-sample ledger metadata and no automatic rule change.
- **Operational vs validation:** The paper list/quote mark/close are operational simulations of recorded paper plans. Learning review is descriptive retrospective analysis. A returned “candidate,” a high score, a positive expectancy, or a large synthetic fixture is not a verified edge, validation result, probability calibration, execution-quality measure, or permission to place a real order. Tests with 200 generated fixture trades only test deterministic calculation contracts; they do not demonstrate actual market performance or device/API correctness.

## Confirmed source defects (minimal fixes)

1. **Future-dated live quote can be counted as fresh for open P/L.** `lib/trading/paper-performance.ts:23–29` rejects stale quotes but has no upper bound on `q.timestamp * 1000`; a quote timestamp arbitrarily in the future passes the freshness predicate. Minimal fix: require the quote timestamp to be no later than `now + 30_000` (or an explicitly chosen clock-skew allowance), consistent with the analytics freshness conventions, and add a future-quote test.
2. **Drawdown-cap validation copy contradicts validation.** `app/(tabs)/trades.tsx:48–54` says “0–100%” while `value <= 0` rejects zero. Minimal fix: change the message to “greater than 0 and at most 100%, or blank to unset” (or alter validation if zero is intended to be allowed).

## Evidence and caveats

- `paper-performance.test.ts` covers supplied quote marking, missing/stale quote withholding, USD conversion, UTC-day drawdown, and partial/final P/L accounting using synthetic fixtures. It currently has no future-dated quote case.
- `confluence-analytics.test.ts` is explicitly labeled synthetic paper-ledger math fixtures; it tests coverage exclusions, partial-inclusive R and descriptive status, and undefined zero-variance correlation. `confluence-runtime.test.ts` and `trade-features.test.ts` also use native/unit synthetic inputs, not app/provider/broker evidence.
- `paper-lifecycle.test.ts` covers fixture transitions such as quote fill, conservative stop-first bar handling, partials, and opt-in management; it does not establish a running scheduler or live deployment.
- No tests or source reviewed establish device operation, profitable results, statistical significance, real-money applicability, broker integrations, multi-leg/queue-order execution, or actual scheduling availability.
