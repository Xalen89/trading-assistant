# StratDesk Library capability audit

**Capability:** Pattern/style Library upload and structured learning (`id: library`)  
**Scope:** Read-only review of the app Library tab, its directly embedded panels, source logic, pure imported-history calculations, and focused unit-test fixtures. No browser/device session, owner database/API operation, broker action, upload, or attached-image access was performed. No code was changed. This describes what the checked-in source offers—not proof that the current device/server integration works.

## At a glance

The Library is a personal reference and review workspace, not an automatic strategy trainer. It can store a chart/pattern or style reference, extract candidate descriptions/rules, create a structured source-grounded blueprint, capture human feedback, and let the owner explicitly accept a definition. A style accepted through the regular trainer can become the selected local strategy, but that does not make an edge validated or enable automatic foundation-model retraining. The distinct **Accept as review style** action creates an inactive proposal with every factor disabled and weight zero. Neither flow places a live or paper order by itself.

## Features and how to use them

### 1. Browse, search and switch between personal patterns and styles

- **Where:** Library tab, “Patterns” / “Styles” count buttons, search field, and the “Pattern references” / “Style sources” list (`app/(tabs)/library.tsx:461–481, 562–608`).
- **Purpose:** Find a previously saved chart pattern or personal trading-style source.
- **Steps:** Tap **Patterns** or **Styles**; type a term in the search box. Search checks each record’s name, tags, notes and description. Tap a result to open its trainer sheet.
- **Output:** Matching records show market/timeframe, uploaded filename or “Manual definition,” status, tags, description/notes, visual-index status, label count and reference version. Statuses distinguish uploaded, analyzing, review, ready and failed.
- **Next:** Open a result to inspect its evidence, correct it, leave feedback, re-index an image or explicitly accept a definition.
- **Status / limits:** Present in source; not device-verified. Library records are personal references and do not automatically change WR1 or prove profitability. The empty state suggests upload, review, then apply.

### 2. Upload a source or create a local manual definition

- **Where:** **Files** in the Library header; “Learn from my files” sheet (`library.tsx:443–459, 619–682`).
- **Purpose:** Turn a trader’s chart/pattern picture or written style notes into a labeled, reviewable library record—or save a rule without sending a file for extraction.
- **Steps (file):** Tap **Files** → **Choose compatible file** → choose **Pattern picture** or **Trading style** → edit the name and annotation/rules field → check the displayed active strategy, market and timeframe → **Upload & analyze source**. Supported picker types are PNG, JPEG, WebP, PDF, TXT, Markdown and JSON; the UI intends an 8 MiB cap, but its native fallback relies partly on optional picker size metadata/base64 length (see defects). The named active strategy is required by this flow.
- **Steps (manual):** Tap **Files** → choose kind → enter a name and optionally one rule per line in the annotation field → **Save local manual definition**. No file is sent and it is marked “Manual definition — not AI-analyzed.”
- **Output:** Uploaded files first produce a record with extracted description, candidate rules, tags and limitations, in review (or a failed/retry state). The source is retained in protected storage; the sheet tells the user original bytes are encrypted. Upload is associated with the current market/timeframe and active strategy. A manual record stays in the local workspace and has no uploaded original.
- **Next:** Open the record; verify/correct extracted rules against the source before accepting. A text-extraction failure on a scanned PDF is not evidence of a valid analysis—use a legible chart image or text-extractable PDF instead.
- **Status / exact prerequisites:** File path is implemented in source, but not device-verified. Cloud-source operations need the owner’s authorized session and a server-available managed AI model. Images are the visual route; text/PDF analysis needs extractable text. The blueprint analysis separately enforces an 8 MiB byte limit. No user-file upload was attempted in this audit.

### 3. Review and edit a selected source; add labeled feedback and inspect versions

- **Where:** Tap any personal record. The “Pattern trainer” sheet contains the description, **Candidate rules — edit one per line**, **Correction / positive or negative label notes**, feedback buttons, and source/version card (`library.tsx:683–887`).
- **Purpose:** Decide what the source actually says, capture a positive/negative/correction judgment and keep a revision trail rather than silently treating extraction as ground truth.
- **Steps:** Open the record; edit candidate rules one per line; enter an optional correction note; tap **Positive**, **Negative** or **Correction** to save that label. For an uploaded source, tap **Open protected source** to request the owner-authorized original; image files can show an in-sheet preview. For text/PDF, source verification is noted but full document rendering is unavailable. If the server copy has a newer version, tap **Load authoritative source vN** before editing. Durable reference versions and their statuses/label counts appear after the source is opened.
- **Output:** Feedback is appended with a timestamp and source version advances for a file-backed revision. The UI states accepted references and feedback accompany future comparisons; this is reference/context use, not foundation-model retraining. Corrections are not an independently verified training signal.
- **Next:** Resolve differences against the original and only then use the appropriate acceptance action below.
- **Status / limits:** Source controls and version behavior are present in code; not owner-session or device tested. A file-backed source is needed for protected-source fetch and durable server versions. Manual records can receive local feedback but have no original to reopen. Source-fetch errors or stale version conflicts must be resolved before treating the displayed definition as authoritative.

### 4. Library AI: structured trigger/confluence blueprint

- **Where:** Inside a selected record, **Library AI** card → **Scan strategy blueprint**; same card’s **Ask AI about this source** opens Coach with the source ID and a prefilled question (`components/trading/library-ai-panel.tsx:14–202`, `server/trading/library-blueprint.ts:278–356`). On successful upload, the Library also attempts an initial scan and retains it as an unapproved versioned revision (`library.tsx:223–258`).
- **Purpose:** Answer “What trigger, confirmations, indicators, entry/invalidation/targets/risk, required data and ambiguities does this original source actually specify?”
- **Steps:** Open a file-backed source → tap **Scan strategy blueprint** → expand **Trigger & confluence blueprint** and **Missing inputs & ambiguities**. Review each quoted source excerpt, condition, named data source, automation assessment and weight provenance. To discuss it, tap **Ask AI about this source**. A manual definition can be discussed with Coach but cannot be rescanned from an original file; its scan button is disabled.
- **Output:** A source-versioned, unapproved blueprint with summary, trigger, up to 24 conditions, indicators/parameters, stated markets/timeframes, entry, invalidation, targets, risk, required data and ambiguities. Weights remain `source-stated`, `suggested`, or `not-stated`; missing weights are not invented. Discretionary, order-flow, quantitative and ML mentions trigger caution text. Text/PDF excerpts are checked against literal source text (case/whitespace normalized); unsupported or unsafe model output fails closed without returning raw source text in the error. A structured PDF must have extractable text; image analyses do not receive an executable predicate spec. Model availability and 45-second timeout can prevent analysis.
- **Narrow automation boundary:** The type contract allows only an exact closed-bar EMA/close comparison (period 1–500; above/below) as `supported`, and the server additionally requires literal evidence for the EMA period/comparison/close. Even that status describes a narrow condition—not an active scanner, alert, order, or strategy. Other discretionary, order-flow, quantitative or ML conditions remain manual/missing-data review.
- **Next:** Check every claim against its excerpt and fill missing data/rule definitions yourself. Use Coach for explanation, or explicitly request a review-style proposal; do not treat the scan as backtesting or edge evidence.
- **Status / limits:** The endpoint is implemented as owner-scoped source reads and returns a draft without writing storage; the Library then explicitly persists a review revision for the upload flow. `tests/trading/library-blueprint.test.ts` contains mocked managed-AI fixtures for versioning, safety, literal evidence, ownership, size limits and disabled-style conversion; these are tests, not proof of live provider/device success. Tests were read, not run.

### 5. Explicitly accept a definition or save an inactive AI review style

There are two different acceptance buttons; do not confuse them.

- **Regular trainer acceptance — where/steps:** Edit the candidate rules, then tap **Accept reviewed pattern** (pattern) or **Accept rules & apply style** (style) at the bottom of the trainer (`library.tsx:328–401, 864–884`). The code trims blank lines and keeps at most 30. A file-backed acceptance creates a versioned source revision; manual definitions remain local. A style creates/replaces a linked style with one enabled factor per rule at weight 10 and makes that style the active workspace strategy. A pattern becomes a `ready` reference without changing the active strategy.
- **AI proposal acceptance — where/steps:** In Library AI, tap **Accept as review style** (`library-ai-panel.tsx:174–192`). The parent callback retains a style in the workspace, but checks a 100-strategy limit and avoids overwriting an existing source/version proposal (`library.tsx:697–714`).
- **Output / distinction:** The regular style action applies the manually reviewed rules as active local style factors; the AI proposal action creates a *hidden, inactive* style whose factors are disabled and weight zero (`library-blueprint-types.ts:220–295`). The AI proposal explicitly requires a separate user acceptance; its weight suggestions remain prose, not activated weights.
- **Next:** For an AI proposal, inspect/configure it separately in Strategies, and establish supported data plus any required confluence gate before paper use. For a regular accepted style, verify its factors and data/gate configuration before any paper workflow. Use **Open applied strategy** when offered for an accepted ready style.
- **Status / limits:** Both flows exist in source, not device-verified. Acceptance is not evidence of an edge, automatic model training, alerting, or execution. The source states no strategy is auto-approved/activated by the upload-time structured scan; only the separate user action changes the review state. The regular trainer applies an active style in the workspace, whereas “Accept as review style” deliberately saves an inactive proposal.

### 6. Photo-based personal-library search and image re-indexing

- **Where:** Library row **Photo-based search**; image-source trainer card’s **Reindex protected image** (`library.tsx:494–501, 524–560, 794–831`).
- **Purpose:** Ask “Which of my own saved references uses terms resembling this chart?” or rebuild the geometric image descriptor for a saved image.
- **Steps:** Tap **Photo-based search**, choose a PNG/JPEG/WebP image (the common reader intends an 8 MiB cap; native fallback has the same metadata/base64-length caveat noted below), wait for its description, then tap a result to open its Library record. For a saved image, open its trainer and tap **Reindex protected image** if the visual-index status is not useful.
- **Output:** Text retrieval describes the query and compares extracted terms with names/tags/descriptions/notes in the personal Library; results need at least two shared terms, sort by shared-term count, and cap at eight. UI shows the shared terms and an explicit “not proof of live detection” limitation. An optional visual-neighbor payload can show source version and cosine similarity; this is a geometric descriptor, not a probability.
- **Next:** Open the candidate and compare it manually with the original and conditions. Re-index only if image evidence is intended for geometric retrieval.
- **Status / limits:** Search and re-index controls are present in source; no photo was supplied and no image/vector result was inspected. Only the supplied personal library is searched. Similarity/term overlap is retrieval evidence, not present-market detection or success probability; manual/catalog entries have no uploaded image vector.

### 7. Pattern & style reference catalog

- **Where:** **Browse pattern & style reference catalog** opens the catalog sheet (`library.tsx:509–515`, `components/trading/pattern-catalog.tsx:18–198`).
- **Purpose:** Look up a bounded glossary/reference definition and its stated prerequisites, then add it as a review checklist without uploading a picture.
- **Steps:** Open the catalog; optionally search; filter **All**, **PD arrays**, **Candlesticks**, **Chart structure** or **Indicator styles**; tap an entry for source and library action; optionally open **Read source / license** for entries with a URL; tap **Add review-only reference**. **Add all missing references for review** adds entries not already in this workspace.
- **Output:** Definition, support caveat and source; additions are local `review` records with rules/notes but no source image/vector. Indicator styles are typed as styles; other entries as patterns. The catalog does not run a detector or create an order.
- **Next:** Open an added entry, write the source-specific anchors/conditions, and accept only what is applicable. Save the workspace separately if you want cloud retention.
- **Status / limits:** Present in source; not device-tested. The catalog explicitly distinguishes automatic shape/context support from manual/source-specific concepts. Names are not proof a pattern has a generic detector. Workspace cap is 500 records; adding beyond capacity leaves the catalog browsable and does not overwrite records.

### 8. Historical CSV/JSON importer, descriptive math and nearest-shape study

- **Where:** **Historical CSV / JSON** → “Historical pattern laboratory” (`library.tsx:503–507, 422–439, 900–1068`; pure functions in `lib/trading/engine.ts:33–66`).
- **Purpose:** Use a user-supplied OHLC series to describe past price rhythm and retrieve earlier, similar 12-bar closes with their subsequent outcomes—not to generate a live signal.
- **Steps/data:** Import a CSV with `time,open,high,low,close,volume` columns or a JSON top-level candle array. Timestamps are Unix seconds; bars need finite positive OHLC, valid high/low bounds and nonnegative volume. The parser accepts 3–10,000 bars, sorts by time and rejects duplicate timestamps. Choose the actual interval from 1m/5m/15m/1h/4h/1d/1w. Defaults are LONG, 0.5% hypothetical stop and 1% target; edit direction/percentages to examine a different hypothetical. This imported history remains in component/device state.
- **Output:** At 31+ bars, descriptive volatility (% per bar), lag-1 return autocorrelation and total lookback momentum. At 48+ bars the pure analog helper can find up to five non-overlapping close-shape neighbors: it compares the latest 12 bars with older windows and evaluates each neighbor’s next 12 bars, all before the current query window. The sheet reports analog count, resolved count, wins/targets-first, each analog’s timestamp, shape distance and win/loss/unresolved outcome. If stop and target are touched in the same OHLC bar, the code conservatively counts a loss and marks ambiguity. Unresolved outcomes are not counted in “resolved.”
- **What “no signal/insufficient” means:** Fewer than 31 bars means descriptive stats are withheld; fewer than 48 means no eligible nearest-analog candidates (the UI has no separate direction signal). An empty/insufficient result means the sample cannot answer this exploratory comparison, not “no trade,” bearishness, or a forecast. Invalid/missing/duplicate data causes parse failure. Session gaps are not filled; the displayed interval is user-selected, not inferred from timestamps.
- **Next:** Confirm symbols, timestamps and interval; collect a longer clean series if descriptive/analog counts are insufficient. Use the examples only to formulate a hypothesis for independent validation.
- **Status / limits:** Pure math is in source and `tests/trading/engine.test.ts` has fixture assertions for CSV parsing, insufficient data, past-only windows and conservative same-bar loss. Test fixtures are not device proof or empirical edge. `historicalStudy` hardcodes `probability: null`, omits costs/slippage and warns it is not strategy backtesting or out-of-sample validation. No simulated/test-generated data was used to make a trading claim here.

### 9. Research laboratory: imported-series MA/FVG walk-forward and analyst discussion

- **Where:** Embedded below the history sheet content when an imported series is present (`components/trading/research-panel.tsx:18–175`).
- **Purpose:** Compare simple baseline experiments over imported history, or request a separate analyst discussion using the selected server feed. The panel itself says these are MA/FVG baselines, not full discretionary WR1 or uploaded-style backtests.
- **Steps:** With the history sheet open, choose **MA cross** or **3-bar FVG**; enter fees per side and slippage in bps (defaults 5 and 5); tap **Walk-forward test**. The source defaults are long side, fast spans 5/10/15, slow spans 20/30, 12-bar holding, 120 training bars, 40 test bars and $10,000 initial equity (`lib/trading/research.ts:41–64`). A second CSV/JSON can be added and replaces the second asset; both series use the selected interval and are passed as separate series, described by the UI as an independent-asset experiment—not as a multi-leg strategy. Use **Analyst discussion** only with authenticated access and Sample mode off; that branch uses the selected server feed, not the imported CSV series.
- **Output:** Walk-forward report cards show per-asset return, max drawdown, completed simulated trade count, hit rate/PF when available, data source/bar count, train/test dates and selected MA parameters per fold, label counts, assumptions and limitations. Discussion shows a role-by-role analyst report, evidence IDs, missing inputs and a review-long/review-short/wait decision/risk-veto label. The UI says four LLM calls for discussion and abstention where fundamentals/sentiment are absent.
- **Prerequisites / insufficient:** Sign in for private research. The imported series must parse and contain sufficient history for the chosen experiment; the UI defaults imply 120-bar training and 40-bar test windows but does not expose a hard minimum in this component. Short/irregular data may produce no useful fold or an error. The discussion button is disabled in Sample mode. The timeframe is the owner-selected label and must match the data interval.
- **Next:** Inspect fold dates, assumptions and limitations; treat returns as simulated historical model output, not a forecast. If no fold/report is available, improve data coverage or use the visible error; do not interpret “no result” as a signal.
- **Status / limits:** Controls and result rendering exist in source; no service call or device run was performed. Reports are not evidence that the selected strategy was tested: the component selects MA/FVG baseline model and states it is not a full WR1/uploaded-style backtest. No order is sent. No performance probability is claimed; the report component explicitly says probability is not calibrated.

### 10. Bounded offline order-book classification (separate from OHLC study)

- **Where:** **ORDER-BOOK ML · OFFLINE ONLY** card in the embedded Research laboratory (`components/trading/orderbook-research.tsx:17–163`).
- **Purpose:** If the owner already has licensed real depth snapshots, run a bounded offline label-classification experiment—not a live trading or queue-fill tool.
- **Steps/data:** Choose a JSON file ≤8 MiB shaped as `{instrument,source,snapshots:[{time,bids:[{price,quantity}×3],asks:[{price,quantity}×3}]}` with 500–12,000 actual snapshots; the UI checks numeric times and exactly three bid/ask levels per snapshot, and states the server/worker additionally validates timestamps/book geometry. Confirm **I have permission to use this actual order-book dataset**, sign in, then tap **Run bounded offline book comparison**. The control fixes the horizon to 600 seconds, training window 1,800 seconds, test 10 seconds and one fold. It explicitly rejects OHLC/tape substitution.
- **Output:** If a run returns, the UI renders five classifier families/six fixed configurations, actual sample gap disclosure, eligible/omitted row counts, chronological training/test/purged counts, label accuracy vs majority baseline, balanced accuracy, precision/recall, confusion counts and limitations. No best model is selected or stored.
- **Next:** Use only authorized actual depth data; assess class balance, coverage, purging and baselines before deciding whether the dataset is informative. An unavailable fold/class is an insufficient experiment, not a market direction.
- **Status / limits:** UI controls/output are present in source; not run or validated here. The app describes this as offline label classification only—no fitted model storage/deployment, HFT/DMA, queue position, queue fills, profits, success score, paper order or broker order. **No multi-leg or queue-order capability is claimed.** This audit did not inspect the shared research service/worker implementation.

### 11. Screenshot review embedded on the Library page

- **Where:** Compact **Screenshot review** panel (`library.tsx:516`, `components/trading/trade-screenshot-panel.tsx:29–39, 108–471`). This is separate from the Pattern/Style source upload flow.
- **Purpose:** Preserve a chart screenshot as coaching evidence around a paper trade, distinguishing visible facts from unknowns.
- **Steps:** Expand the panel; choose **Before**, **During**, **After** or **Unknown**; optionally enter known capture/trade time with `Z` or UTC offset and a timezone; tap **Choose screenshot**, then **Upload & analyze**. In the Library it is standalone: no `tradeId` is passed, so canonical paper-trade linking is unavailable here. Review the draft and tap **Confirm & retain review** to make a protected revision.
- **Output:** Visible facts/evidence/certainty, confluence observations, bounded process lessons, limitations, stage and visible-time status. Confirming retains a source revision only; it does not change canonical fill, SL/TP or outcome. Existing retained screenshots may be reopened if owner-scoped records are available.
- **Prerequisites / limits:** PNG/JPEG/WebP up to 8 MiB and an active strategy; owner-authorized source operations. Capture time, timezone and trade link are optional/unavailable in Library as described. A screenshot does not verify a fill or outcome. Not device-tested; no image was uploaded or inspected during this audit.

### 12. Trading foundations lessons

- **Where:** **Learn trading · process before profit** (`components/trading/trading-lessons.tsx:44–116`).
- **Purpose:** Short educational reminders about risk-first planning, trigger vs confluence, costs/reward, structure/uncertainty, post-loss process and non-self-deceptive review.
- **Steps:** Expand; tap a lesson; read its reflection prompt. Optionally choose **Ask my AI coach** to pass that prompt to Coach.
- **Output:** Lesson text and a reflection question; educational practice only.
- **Next:** Write down the falsifiable condition, missing evidence, cost assumption or review question relevant to the trade; use Coach only for explanation.
- **Status / limits:** Static lesson content and control are present in source; not device-tested. It neither reads a live market nor approves an entry.

### 13. Learning review of actual paper records

- **Where:** **Learning review · your actual paper records** accordion (`components/trading/learning-dashboard.tsx:6–81`).
- **Purpose:** Ask what existing closed paper outcomes and snapshots can descriptively say about confluence/score buckets, without automatically modifying a rule.
- **Steps:** Tap to expand; wait for the private analytics query; review eligible outcome/feature/snapshot coverage, score buckets and any human-rule proposals.
- **Output:** Counts for eligible closed outcomes, entry-feature and confluence snapshots; descriptive win/expectancy buckets where coverage permits; up to four human-review proposals. API errors are displayed rather than silently replaced with invented analytics.
- **Meaning of insufficient:** The UI states fewer than 100 outcomes per comparison is insufficient. A larger paper sample still does not prove live edge; there is no automatic rule promotion or legacy snapshot backfill.
- **Next:** Treat proposals as questions to inspect against journal/source evidence; collect valid forward paper records and independent validation before changing a rule.
- **Status / limits:** Query/rendering is present but requires authenticated, actual paper records; not queried in this audit. “PAPER DATA · DESCRIPTIVE ONLY”; no synthetic data or claim of performance improvement.

### 14. Cloud learning account controls

- **Where:** “Cloud learning account” section at the bottom of Library (`library.tsx:609–610`, `components/trading/account-controls.tsx:10–99`).
- **Purpose:** Associate private workspace/source operations with an account and see/refresh session state.
- **Steps:** Signed out: **Sign in**; in an embedded web Preview that blocks cookies, use **Open app in browser tab** and continue there. Signed in: **Refresh** or **Sign out**.
- **Output:** Guest/signed-in state and account label; sign-out clears the client query cache.
- **Next:** Sign in in the real browser tab before owner-protected upload/research; retry only after resolving an explicit auth/source error.
- **Status / limits:** Controls exist in source; no sign-in was attempted. Account association is not a profitability or model-training status. The page separately says versions/feedback guide subsequent analysis but are not automatic foundation-model retraining or verified profitability improvements (`library.tsx:611–617`).

## Verified limitations and concrete source defects

- **No live proof:** Source and fixtures were inspected only. Blueprint tests mock source storage and the managed model; engine tests use local fixtures, including synthetic candle generation. Tests were not run here. A passing unit fixture would not establish Expo/device/browser behavior, a valid live model response, data availability, statistical edge, or profitability.
- **No order path in this capability:** Nothing in the Library source, blueprint conversion or historical math places a paper or brokerage order. Blueprint suggestions are unapproved; accepted-style behavior remains a separate user review/configuration step. Do not infer multi-leg or queue orders from labels/research controls.
- **Confirmed source defect — oversized primary history import:** `app/(tabs)/library.tsx:430–435` checks only the picker-reported `asset.size` before reading the first CSV/JSON file; it does not enforce a size limit on the actual text after reading it. Missing/zero/unreliable reported size can bypass the stated 8 MiB cap and feed oversized text to `parseHistory`. The second-asset importer already checks `text.length` at lines 920–925. **Minimal fix:** after reading the first file’s text at line 434, reject text exceeding the documented limit before calling `parseHistory` (prefer UTF-8 byte length if the cap is in bytes).
- **Confirmed source defect — native source/photo reader can accept >8 MiB:** `app/(tabs)/library.tsx:72–85` checks optional picker `asset.size`, then in the native `File.base64()` branch only rejects encoded strings above 12 MiB; it does not check decoded byte length. When `asset.size` is absent or understated, an input between 8 and about 9 MiB can pass the client check and be sent before the server’s own validation. **Minimal fix:** measure decoded bytes (or the underlying file byte length) in the native branch and reject above 8 MiB, rather than using the 12 MiB encoded-string limit as a proxy.
- **Confirmed source defect — native screenshot size cap has the same gap:** `components/trading/trade-screenshot-panel.tsx:66–84` checks optional `asset.size`; the actual `arrayBuffer` length is checked only in the browser branch, while the native base64 path accepts up to 12 MiB of encoded text (roughly 9 MiB decoded). With absent/understated picker size, a screenshot over the advertised 8 MiB limit can pass the client check. **Minimal fix:** check decoded byte length or native file byte length against `MAX_BYTES` in the fallback path.

## Source/test map

- UI and primary flows: `app/(tabs)/library.tsx`
- Blueprint panel and conversion trigger: `components/trading/library-ai-panel.tsx`
- Owner-scoped structured scan: `server/trading/library-blueprint.ts`
- Upload/extraction, file parsing and term retrieval: `server/trading/learning.ts`
- Blueprint type/safety boundary and disabled review style: `lib/trading/library-blueprint-types.ts`
- Mocked blueprint tests: `tests/trading/library-blueprint.test.ts`
- Pure OHLC math and analog study: `lib/trading/engine.ts`; fixtures in `tests/trading/engine.test.ts`
- Embedded panels: `components/trading/{research-panel,orderbook-research,trade-screenshot-panel,learning-dashboard,trading-lessons,pattern-catalog,account-controls}.tsx`
- Research default parameters and report types: `lib/trading/research.ts`
