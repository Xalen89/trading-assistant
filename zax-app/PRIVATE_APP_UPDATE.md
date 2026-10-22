# StratDesk — sharper owner-only setup workspace

## What changed

The existing Expo iOS/Android codebase remains intact. **Owner-only app access is now enforced on the server and all six tabs.** Guests can reach the login/callback and health endpoints, not market catalogs, personal files, setups, research or paper records. Your existing approved identity and data-only TradeLocker account are preserved; no new account credentials were requested and no broker trading method was added. Publication remains disabled. You can choose a public-app phase later, but that will be an explicit access decision, not an automatic switch.

### Chart and setup analysis

- Sharper price typography, higher-contrast candles, cleaner control rails and a pinned automatically derived weekly-to-date context strip. The weekly classification is descriptive: completed provider daily bars, ISO UTC reporting week, not a guaranteed discretionary WR1 profile or the broker's exact week/session.
- Up to three selected strategy snapshots, **ALL / ANY** combination, independently visible overlays. WR1 stays a reference, not your personal strategy.
- Separate source rulebooks for Core Sequence, Sweep + FVG / Silver Bullet, Order Block Retest and STDV manipulation-range targets. Closed OHLC detection traces confirmed prior swings, liquidity sweeps/rejections, displacement/MSS and later FVG/OB CE retests. Unknown/custom rules cannot be marked met simply because they have a familiar name; supported automatic recognition requires unchanged source factor definitions.
- Provider-day PDH/PDL, source-labelled zones, sequence evidence, and strategy-conditioned historical scenarios. **Line / ghost OHLC / both** are sourced from qualified past continuations; when no supported analog exists, no generic shape is invented.
- Source photographs preserve pixels/aspect ratio and can be shown as reference templates. They are not calibrated time/price anchors or proof of a live pattern; CV/AI comparison and source feedback remain separate from automatic setup evidence.

### Paper execution and journal

Use **Chart → Buy or Sell → Paper plan review → Confirm paper order**. Trades → Chart order directs you to the same path; the former parallel local new-order form is removed. Old local pending records remain archival/inspectable, and old manual open records can record an explicit simulated exit.

- Fresh actual selected-market side quotes when available, source-based structural stops with a display-precision buffer, named valid targets or an explicit fallback, at least **2R**, and reference initial risk **0.5–1%**.
- User edits are checked again on the server. Unedited default size/target may be recalculated for the fresh indication; this is recorded. No broker lot/margin convention is guessed. Pending/open target edits preserve two original R, not a misleading remaining-half-size R.
- A generated inspection checklist is distinct from the trader's optional own thoughts. Original strategy versions, proposal, source quote, fill, initial risk and journal are retained.
- Explicit opt-in paper observation can fill limit-style pending plans, take one 50% partial at 2R, move to break-even and close remaining size at observed stop/target. Original risk stays immutable, P/L does not double-count partial cash, repeated observations are idempotent and edits use optimistic versions. Missed intrabar paths are not reconstructed.
- Working managed records synchronize separately from personal style drafts. Durable trade history is paginated, with bracket edits, reviews, source inspection and deep dives; original records are not replaced by the local recent-trade list.
- Configured local drawdown limits are checked before submission; saved limits are also checked against a bounded complete paper ledger. Incomplete ledger/date evidence blocks a new order rather than fabricating a cap calculation. Exits remain available. These are paper controls, not broker risk settings.

### Alerts and refinement

Setup-ready and meaningful historical-scenario-change rules capture model versions, conditions and the actual trigger scenario. Clicking an event can view its captured chart evidence instead of silently swapping to today's shape. Foreground pills remain real-event-only.

Review-only refinement uses retained closed outcomes from the exact strategy version. It needs 30 outcomes, ten factor-present and ten factor-absent samples and a minimum observed mean-R difference before suggesting a five-weight-point change. **Nothing changes automatically.** Acceptance creates a new personal strategy revision; source references require duplication. Associations are confounded, not causal improvement, calibrated probability or neural retraining.

## Verification

- Real approved-owner XAUUSD BID feed, 200 closed execution bars, completed provider-day PDH/PDL and a bearish descriptive weekly-to-date profile were verified at 2026-10-15 22:00 UTC. A pure 0.5%-reference, 2R review plan was evaluated; no paper or broker order was inserted by the probe. Actual requested market history and a setup snapshot were retained.
- All current live candidates were waiting; qualified historical sample count was zero, so the empirical rate/scenario were withheld and **probability stayed null**.
- 101 TypeScript trading/security regressions pass, with TypeScript and ESLint clean. The independent read-only trace's confirmed paper-flow/risk/request-race defects were corrected. Its proposed scheduler-cookie replacement was rejected against the documented callback contract: platform cron credentials are intentionally distinct from the app login cookie.
- The owner gate was tested with guests and a different synthetic identity; a real anonymous catalog request returned HTTP 401. Frozen iOS/Android/web source exports succeeded after the final limit/form correction. Standalone Preview and API returned HTTP 200. These are not signed release or physical-device checks.

## Remaining boundaries

This is a paper-analysis app, **not a completed brokerage execution platform**. Optimal TP/SL, institutional activity, every WR1/session/15m/4h POI rule, arbitrary uploaded discretionary rule automation, full image-to-price anchoring and calibrated future success are not claimed. Historical target-before-stop fractions require at least 30 resolved non-overlapping cases and disclose missing costs/paths; they are not future probabilities.

Closed-app paper monitoring and push still need a published owner-protected backend, registered schedule, native development/release build, APNs/FCM credentials, device token and permissions. A Preview, styled notification pill or source export does not activate those. No publication, signed release, device journey or broker order was performed. Existing source/API licenses and futures/CFD/lot/session limits remain in the earlier integration notes.

## Saved-source and delivery status

The implementation source `4c2cbff` was accepted on the managed canonical main branch. Full repository checks returned **126 passing tests and one pre-existing skipped integration**; the 101 scoped trading/security tests are included in that full count. Frozen native/web exports succeeded after the final cap/form correction. The source-save hook did not provide a structured Version-history receipt, so source acceptance is verified while the Dashboard's recorded-checkpoint status must be confirmed before signed builds. No repeated push, publication or fake session was used to manufacture confirmation. Later documentation/package refreshes do not change the tested implementation.
