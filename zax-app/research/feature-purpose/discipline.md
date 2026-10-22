# Trading foundations & revenge-trading safeguards — feature guide

**Audit scope:** the trading-foundations lessons, retrospective discipline check, personal post-loss pause control, and paper-record learning review. This is a read-only source audit; no app/browser session, device run, owner database/API write, brokerage action, or statistical validation was performed. The app is configured as owner-only and paper-only. Source presence is not proof that a screen works on a device.

## At a glance

| Feature | Where to find it | What it actually does | State |
|---|---|---|---|
| Trading foundations | Library; also the general AI-coach view | Six short lessons with a reflection question and a coach handoff | Implemented in source; educational only |
| Discipline check | Compact card in the paper-plan sheet | Reviews canonical closed-paper history for behavioral risk flags; supplies local reflection prompts | Implemented in source; not an order approval or block |
| Personal post-loss pause | Paper-plan sheet → **Advanced** | Saves an optional workspace setting that the paper server checks before creating a new paper order | Client control and server check exist; actual save/enforcement not device-verified |
| Learning review | Library; also the general AI-coach view | Descriptive group summaries/proposals from canonical closed-paper records | Implemented in source; retrospective and paper-only |

---

## 1. Trading foundations lessons

**Location:** Library → **Learn trading · process before profit**. The same lesson card is mounted in the general AI-coach screen. Source: `components/trading/trading-lessons.tsx` (lines 6–115), mounted at `app/(tabs)/library.tsx:517` and `components/trading/ai-coach.tsx:486`.

**Trader problem it addresses:** provides brief decision-process education—planning risk, separating a setup trigger from contextual confluence, accounting for costs, describing uncertainty, responding to a loss without chasing, and reviewing process separately from outcome.

**Tap-by-tap:**
1. In Library (or the general coach view), tap **Learn trading · process before profit**. It expands a list of six lesson buttons.
2. Tap a topic: **Risk before entry**, **Trigger versus confluence**, **Price, costs and reward**, **Structure and uncertainty**, **After a loss**, or **Review without fooling yourself**.
3. Read the lesson and its highlighted **Reflection** question in the sheet.
4. Either close the sheet, or tap **Ask my AI coach**. The app closes the lesson and routes to `/coach` with a prompt based on the lesson and reflection question.

**Actual output:** static educational text and one reflection question per lesson. The lesson copy specifically cautions that planned risk is not guaranteed maximum loss, a checklist is not calibrated win probability, costs/slippage matter, paper statistics are not fills, patterns are testable descriptions rather than promises, a pause/AI reply does not certify readiness, and outcome review requires adequate samples and untouched future data.

**Useful next action:** write down the invalidation, risk, evidence that would falsify the setup, or the process rule to review; use the coach handoff for reflection—not to obtain execution approval.

**Status and limits:** lesson UI and coach navigation are implemented in source. Content is educational, not trading advice, profitability evidence, execution approval, or a substitute for a verified instrument point value. No device navigation was exercised in this audit.

---

## 2. Discipline check / revenge-trading safeguards

**Location:** compact **Discipline check · education** card in the paper-plan sheet, immediately after the practice-versus-gated-strategy card. Source: `components/trading/discipline-panel.tsx:62–267`; mounted in `components/trading/paper-plan-sheet.tsx:276–281`. The sheet supplies the proposal's initial risk, market and side when available.

**Trader problem it addresses:** helps notice behavior that can accompany loss-chasing—rapid re-entry after a recorded loss, repeated losses, a high number of closed trades that day, or proposed paper risk that is materially above recent sizing—without diagnosing intent or telling the trader to enter.

**Tap-by-tap:**
1. Open the paper-plan sheet. The discipline card queries the owner-gated canonical `paper.working` record when no trade list is explicitly passed. It refreshes every 15 seconds in this mode.
2. Read the verdict and provenance line: eligible closed trades today and trailing recorded losses, based on UTC closed-record history.
3. In compact mode, tap **Show coaching evidence (n)** to expand the flag list; tap **Hide coaching evidence (n)** to collapse it. Each flag has severity, recorded evidence and a suggested next step. With no flags, the card says no warning conditions are present in eligible records and warns that empty history says nothing about future outcomes.
4. Tap the pre-trade thought prompts to check/uncheck them. They are local reflection marks; the count is not persisted and does not unlock or approve anything.
5. Tap **Reflect with coach** to open `/coach` with a general reflection prompt about slowing down, evidence and rules.

**Actual logic/output:** `lib/trading/trading-discipline.ts:139–407` evaluates only closed records with usable timestamps no later than the current time. It derives closed P/L (including retained partial realizations) and original risk where possible. It can show informational flags for unusable chronology, future timestamps, unknown outcomes or unavailable original risk. It can show warnings for:

- A suggested pause after a known negative realized P/L within the configured/default **20 minutes**.
- Reaching the default **6 closed trades in the current UTC day**.
- **3 or more** latest chronological, known, negative closed outcomes.
- A supplied proposed risk greater than **1.5×** the median of up to five earlier available original-risk records before the latest loss. In this paper-plan mount, proposal risk is supplied only when available.

The count is *closed* trades, not open trades. `ready` means only that the evaluator found no warning/block flags in the available input. The component's copy explicitly says it is not a diagnosis, prediction, trade/strategy approval or execution restriction. The base reflection checklist asks what rule is present/invalidation, what maximum planned loss is, and when waiting is better; it adds an independence-from-last-outcome question when a pause/loss context applies and a risk-rule question when escalation is flagged.

**Useful next action:** inspect the evidence and its data quality, state the setup/invalidation and maximum planned loss neutrally, and decide whether waiting is wiser. If an outcome or original-risk field is unknown, repair/complete the canonical paper record rather than treating missing data as an all-clear.

**Status and limits:** retrospective evaluator and UI are implemented in source; focused pure-logic tests exist in `tests/trading/trading-discipline.test.ts` for partial-inclusive P/L, UTC day boundaries, thresholds/streaks, a suggested pause, risk escalation, future timestamps and missing P/L. Those tests are source fixtures—not device proof, real-user evidence, or a statistical edge. The panel itself is display-only and uses a client query; it never saves a paper record or blocks an order. Its default thresholds are 20 minutes and six closed trades per UTC day unless passed explicit input; the current panel call passes `now`, proposed risk, market and side, but not the workspace threshold settings (see confirmed defect below).

**Exact prerequisites for meaningful history-based output:** canonical closed-paper records must be available; valid `closedAt` timestamps are required for chronology/UTC day counts; finite final P/L (including partials) is required to classify wins/losses and streaks; retained original risk or original bracket/quantity fields are needed for sizing comparisons; a proposed risk must be supplied for proposed-size comparison. Missing/invalid evidence produces unknown/informational output or is excluded, not proof that a pattern is absent. A query error produces prompt-only language rather than a history-based conclusion.

---

## 3. Optional personal post-loss pause (server-enforced for paper orders)

**Location:** paper-plan sheet → tap **Advanced** → **Personal post-loss pause** toggle. Source: `components/trading/paper-plan-sheet.tsx:443–453` and `components/trading/discipline-guard-control.tsx:6–59`.

**Trader problem it addresses:** allows the owner to set a stronger operational boundary than the display-only coaching pause: after a canonical realized paper loss, the paper server can reject a new paper order during the configured pause window.

**Tap-by-tap:**
1. Open the paper-plan sheet and tap **Advanced**.
2. Toggle **Personal post-loss pause** on or off.
3. Wait for the save message. A successful save updates local workspace state and reports that the paper server will enforce the pause on new orders; a failed save says the setting was not saved and leaves the displayed permission unchanged.
4. If enabled and a new paper order is rejected, read the server's returned active-cooldown-until message; do not treat a rejection as brokerage execution or as an assessment of readiness.

**Actual output/operation:** the control saves workspace settings with `enforceCooldown` plus the existing `cooldownMinutes` (or **20** if falsy) and `maxTradesPerDay` (or **6** if falsy). `server/trading/paper-service.ts:468–483` checks the setting at paper-order creation, evaluates closed history (bounded fetch of up to 100 records), and rejects with `PRECONDITION_FAILED` only when `cooldownUntil` is still in the future. The history-based cooldown is based on recorded realized loss. The check is on the paper service; it does not send a brokerage order.

**Useful next action:** confirm the save-success message, then respect the pause and revisit the written setup/risk after it expires. If save fails, check the app's cloud/account/save status and do not assume the server guard changed.

**Status and exact limits/prerequisites:** the setting control, cloud-save path, and paper-server check are present in source. The explicit save depends on a signed-in/authorized owner cloud workspace and successful save; local state alone is not server enforcement. A valid, canonical closed loss must be present in the history read by the paper service for the cooldown to be active. The server fetch is capped at 100 closed records. The control does **not** display a duration editor; it retains an existing workspace value or falls back to 20 minutes. Although `maxTradesPerDay` is passed into the evaluator, the order service only rejects on `cooldownUntil`; it does not reject orders for the daily-count warning, loss streak, or elevated-risk warning. This is a paper-order guard, not a brokerage permission or a guarantee that all forms of rapid trading are prevented. Save and enforcement were not exercised against a live owner account in this audit.

---

## 4. Learning review from actual paper records

**Location:** Library → **Learning review · your actual paper records**; also mounted in the general AI-coach view. Source: `components/trading/learning-dashboard.tsx:6–81`; mounts at `app/(tabs)/library.tsx:518` and `components/trading/ai-coach.tsx:487`.

**Trader problem it addresses:** helps review whether recorded paper outcomes differ descriptively across deterministic confluence-score buckets and presents a few human-review-only prompts, while showing how much usable history and entry-time evidence exists.

**Tap-by-tap:**
1. Tap **Learning review · your actual paper records**. Opening the panel triggers `coach.analytics`; closing/reopening stops/restarts the on-demand query.
2. Wait for **Reading canonical paper records…** to finish. If the query errors, the panel displays the error text.
3. Review eligible closed outcome, entry-feature snapshot and confluence-snapshot counts; then read the fixed score buckets (**0–24**, **25–49**, **50–74**, **75–100**) and up to four human rule proposals.
4. Treat any proposal as a prompt for a documented human review; the component has no action to promote a rule automatically.

**Actual output:** a **PAPER DATA · DESCRIPTIVE ONLY** label, counts, and per-bucket count plus descriptive win rate and observed expectancy in R when available. It displays “rate withheld” or “expectancy withheld” for null values, human rule proposal title/basis/action, and the source-scope text. Server source `server/trading/coach-analytics.ts:5–23` reads canonical closed paper records, up to 2,000; if more exist, the returned scope says the analysis is incomplete. The pure analytics implementation (`lib/trading/confluence-analytics.ts`) also computes other outputs, but this UI does not show them all.

**Useful next action:** verify records have entry-time feature and confluence snapshots, document a hypothesis, and reserve untouched future data for a later validation. Do not promote a rule because a bucket looks favorable; the UI explicitly says there is no automatic promotion and legacy snapshots are not backfilled.

**Status and limits:** source, owner-procedure endpoint and analytics math/tests exist. Source tests in `tests/trading/confluence-analytics.test.ts` use deterministic synthetic paper-ledger fixtures. Fixture success is not device proof or evidence of a real statistical edge. Analytics labels a group under 100 observations **insufficient-data**; at 100+ it remains **unconfirmed**, not validated. Condition comparisons require both present and absent groups to meet the minimum; the UI's visible score buckets can still display raw descriptive values below that threshold, so heed its warning that fewer than 100 outcomes per comparison is insufficient. Source is explicitly paper-only (`realMoney: false`, `executionData: false`); no live fills, causal conclusion, success probability, validation, or execution signal is established. No missing legacy entry snapshot is backfilled. Exact data requirements are canonical closed outcomes and usable P/L/original-risk/closure chronology for eligibility, plus valid point-in-time entry features or confluence snapshots for those subgroup views; missing snapshots are counted as missing, not as an absent condition.

---

## Confirmed source defects (minimal fixes)

1. **Discipline card ignores saved non-default thresholds.** `components/trading/discipline-panel.tsx:85–93` calls `evaluateDiscipline` without `workspace.settings.cooldownMinutes` or `maxTradesPerDay`, so its visible countdown/day-review threshold uses 20 minutes/six trades even if the paper server uses different saved settings (`server/trading/paper-service.ts:468–475`). **Minimal fix:** supply those workspace values to the panel evaluator so advisory display and server behavior share the same settings.
2. **Readiness badge can look positive before history is known.** `components/trading/discipline-panel.tsx:104–131` computes the verdict with loading/unavailable caveats but sets the badge solely from `report.ready`; while the query is loading or has errored, the empty fallback can yield `REFLECT` even though the text says no history-based conclusion is available. **Minimal fix:** prioritize loading/unavailable state in the badge label/tone (for example, “LOADING”/“HISTORY UNAVAILABLE”) before using `report.ready`.

## Audit boundary

This mini-guide covers only the assigned trading-foundations, discipline and learning-review capability. It does not diagnose shared workbench UI/API behavior or audit the quant workbench. No code, plan/TODO, common files, database, or API state was changed.
