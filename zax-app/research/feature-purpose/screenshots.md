# Trade screenshot evidence & retained review

**Capability ID:** `screenshots`  
**Scope:** one owner-only, paper-trading coaching/evidence workflow. This guide describes the current source, not a device-tested claim. The audit read the panel, service, router, source-list implementation, type definitions, and associated synthetic unit tests. No browser, owner DB/API, brokerage action, source upload, or attached-image access was used.

## What it is for

Keep a private chart screenshot with an owner-selected lifecycle stage, optional owner-entered capture/trade time, and a bounded review of what appears visible versus uncertain. It is **not** a trade journal record, fill verifier, strategy validator, order-entry tool, or source of verified outcomes. Confirming retains a review as a protected source revision; it does not edit canonical paper-trade fields.

## Where to find it

- **Library tab:** compact “Screenshot review” panel in `app/(tabs)/library.tsx:516`; use this for standalone evidence or the general retained-screenshot inventory. It starts collapsed.
- **Per-trade deep dive:** the same compact panel in the paper-trade sheet in `app/(tabs)/trades.tsx:391-401` and `components/trading/stored-paper-history.tsx:180-190`. It receives that paper trade’s ID. Its initial stage is `after` for closed, `during` for open, and `before` otherwise.
- Tapping the **Screenshot review** heading expands/collapses the panel. The panel itself says “Private chart evidence, not a trade record.”

## Controls and features

### 1. Retained screenshots list and reopen

**Purpose:** Find a prior retained screenshot/review without uploading the same file again.  
**Location:** Expanded panel, “Retained screenshots” list; only shown when records are returned.  
**How to use:** Expand the panel and tap a row. Rows show name and source version, then stage, approval/original status, and a short summary.  
**Output:** The existing source definition and any retained review are loaded into the panel. If it has a review, its stage and owner-entered time/timezone are restored into the inputs; the message explicitly says the review is not a verified fill/outcome. If it has no review, the original source is selected so the trader can choose a stage and analyze it. The client fetches metadata/review definition; it does not retrieve or display the original image.  
**Next action:** For a source without a review, select/edit context and use **Retry analysis**. For an existing review, read the review shown. The current UI offers no re-analyze control once a review is loaded.  
**Status/limits:** Implemented as an owner-scoped metadata list and reopen action (`tradeScreenshot.list` / `definition`). Server list returns at most 100 records newest-first; this component renders at most the first 20 and provides no paging/search. In a linked trade sheet the list is filtered to that exact canonical trade ID; standalone/unlinked items are instead discoverable in the general Library list.

### 2. Stage selector: Before / During / After / Unknown

**Purpose:** Tell the reviewer what point in a trade lifecycle the owner intends the screenshot to represent, rather than asking the model to infer the lifecycle.  
**Location:** Four buttons below the retained list.  
**How to use:** Tap one stage before analysis. Per-trade sheets preselect a stage based on the paper trade’s current status; Library/standalone defaults to Unknown.  
**Output:** The selected stage is included in the review and displayed in its summary/status line.  
**Next action:** Check the stage is correct, then upload/analyze or retry.  
**Status/limits:** Implemented; the selection is owner-supplied. It does not prove when the screenshot was captured or that a trade occurred.

### 3. Optional canonical paper-trade link

**Purpose:** Associate coaching evidence with the currently open paper trade when useful, without allowing screenshot analysis to inspect or alter its fill/bracket/outcome.  
**Location:** Checkbox in a per-trade sheet, labelled “Link to this canonical paper trade (owner-scoped verification only).” In standalone Library mode, a message says no canonical trade is linked.  
**How to use:** It starts checked when a trade ID is provided; tap to unlink before analyzing if desired. In standalone mode there is no link checkbox.  
**Output:** The review identifies either the owner-scoped canonical record link or standalone linkage. The server verifies ownership/existence, but deliberately does not send that record’s fields to the model.  
**Next action:** Leave linked for organization or uncheck to make it standalone; proceed with upload/analyze.  
**Status/limits:** Implemented. This is linkage only—not fill verification, trade modification, or an order action. A linked source appears in that trade’s filtered list; an unlinked source can be found through Library.

### 4. Optional known capture/trade time and timezone

**Purpose:** Preserve timing context the owner actually knows, especially when it is absent or unclear in the screenshot.  
**Location:** “Known capture/trade time (optional)” and “Known timezone (optional)” inputs.  
**How to use:** Enter a known ISO date/time with `Z` or an explicit numeric offset (example shown: `2026-10-17T09:30:00-04:00`); timezone is a separate optional text value (example `America/New_York`). Leave blank when unknown.  
**Output:** Owner-entered time is recorded separately from source upload time and model-visible time; it is marked confirmed only when a capture/trade timestamp was provided. Model-visible date/time remains null when unreadable, and the review status distinguishes visible, obscured, not-visible, or ambiguous.  
**Next action:** Use known owner timing for later review/context; do not treat upload time or model interpretation as capture-time proof.  
**Status/limits:** Implemented. A nonblank time without `Z` or an offset, or an invalid date/time, prevents analysis with an explanatory notice. A timezone alone is accepted as context, not proof of the actual timezone at capture.

### 5. Choose screenshot

**Purpose:** Select the private chart image to preserve and review.  
**Location:** **Choose screenshot** button (changes to **Choose another** after a file is selected).  
**How to use:** Tap, choose a PNG, JPEG/JPG, or WebP file, then check the notice naming it. Choosing another replaces the unsent candidate and clears any current local source/review draft.  
**Output:** The panel reports “Selected [filename]. It has not been uploaded yet.” No server record is created until Upload & analyze is used.  
**Next action:** Set stage/link/time context, then upload/analyze.  
**Status/limits:** Implemented. Maximum size is 8 MiB; the server also validates the file signature/MIME and accepts only PNG/JPEG/WebP. An active workspace strategy is required for upload: the code chooses the active strategy, falling back to the first strategy. A valid workspace market/timeframe and owner session are also needed. The source does not establish that a selected file is a chart or that its displayed data is authentic.

### 6. Upload & analyze

**Purpose:** Retain the private original and request a structured coaching/evidence draft.  
**Location:** **Upload & analyze** action beside the file picker.  
**How to use:** Select a valid image, confirm workspace context/strategy is available, set optional stage/link/time details, and tap. Wait for upload and analysis; notices expose progress and errors. Upload and analysis happen sequentially.  
**Output:** A screenshot source is stored through the existing protected source pipeline, then the server reads that owner-scoped image and requests structured multimodal analysis. Successful output becomes a **draft**, not automatically an approved review. If analysis fails after upload, the original remains retained and the panel exposes **Retry analysis**.  
**Next action:** Read the draft carefully; confirm only if appropriate. If analysis is temporarily unavailable or the response fails checks, retry the retained source instead of uploading another copy.  
**Status/limits:** Source workflow implemented; the live model/backend availability is an operational prerequisite, not proven by unit fixtures. The server requires the owner session, current source version, supported image bytes/MIME, and a currently available supported managed multimodal model; analysis has a 55-second timeout. Model output is schema-checked and rejected if it includes bounded-forbidden claims such as guaranteed profit, win rate, execution directions, or omits a screenshot/visibility/unknown limitation. No model response establishes a statistical edge.

### 7. Review draft and evidence sections

**Purpose:** Separate visible observations from inferences and expose what the image cannot establish, for process coaching rather than execution.  
**Location:** Review card beneath the status notice after analysis or reopening.  
**How to use:** Read the summary and stage/visible-time-status/unverified-outcome line, then inspect each populated section. The UI displays up to five entries each for **Visible facts**, **Confluence observations**, **Bounded process lessons**, and **Limits / unknowns**.  
**Output:** The service schema also contains visible/partial/uncertain **textual evidence**, separate owner and image-visible time, source/version metadata, model/time metadata, linked-trade status, and an outcome fixed to “unverified from screenshot.” The currently rendered card shows only the four evidence lists named above plus summary/status; it does not render the textual-evidence list or the details of visible time.  
**Next action:** Treat findings as hypotheses/checklist prompts; compare against the actual trade records and independent market data before drawing conclusions. Confirm to retain a useful review.  
**Status/limits:** Draft and schema behavior implemented. **Confirmed UI omission:** `textualEvidence` is generated/validated by the schema but never displayed by `ReviewDraft` (panel lines 501-521 render other lists only). Minimal fix: add an `EvidenceList` for `review.textualEvidence`, formatting text/location/certainty/uncertainty. The screenshot alone cannot establish a true timestamp, fill, stop/target state, or outcome; a displayed P/L or order label is not verification.

### 8. Confirm & retain review

**Purpose:** Deliberately approve a draft for future private coaching/reference.  
**Location:** **Confirm & retain review** button on an unapproved review card.  
**How to use:** Read the draft and disclosure, then tap the button. Wait for confirmation; if the source version changed elsewhere, reload/reanalyze rather than assuming it saved.  
**Output:** The protected source gets a new version/revision containing the review with approved status and confirmation time. The panel displays **RETAINED REVIEW / APPROVED** and a notice that it is coaching material only; no canonical trade fields changed.  
**Next action:** Reopen it from the retained list later. Use it as documentation/process material, not as a validated trading result.  
**Status/limits:** Implemented as an owner-scoped expected-version revision with stale-version conflict checks. Confirmation does not validate a strategy, fill, bracket, or outcome and does not write any paper trade.

## Operational prerequisites and truthfulness

- Fixed private owner session/owner authorization is required for every API procedure. The router uses `ownerProcedure`; service operations check a positive owner ID and all source/trade lookups are owner-scoped.
- Upload needs an active strategy (or first strategy fallback), workspace market/timeframe, and an accepted image no larger than 8 MiB. Analysis additionally needs a retained current-version image and managed multimodal model availability. A linked trade, if requested, must be an owner-owned paper record.
- This capability is evidence retention/review only. It does not place/cancel orders, implement multi-leg or queue orders, mutate canonical trade fields, verify actual fills, or establish realized/expected results.
- Associated tests (`tests/trading/trade-screenshot-service.test.ts`, `tests/trading/trade-screenshot-types.test.ts`) use mocked storage/model calls and synthetic fixtures. They cover owner-scoped failure handling, source-version conflicts, strict structured evidence, unknown-time handling, unverified outcomes, and source-revision confirmation. Fixture passes are **not device proof**, live-model proof, persisted-user-data proof, or statistical edge validation.

## Confirmed source defect

1. **Extracted textual evidence is hidden from the user.** `TradeScreenshotReview` and model schema retain `textualEvidence` (`lib/trading/trade-screenshot-types.ts:35-42, 65-75`), but `components/trading/trade-screenshot-panel.tsx:501-521` renders only visible facts, confluences, lessons, and limitations. Add a rendered evidence section showing the text and its location/certainty/uncertainty. This report did not identify another concrete source defect in the audited capability files.
