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
