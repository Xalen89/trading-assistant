# Zax — private integration and reliability update

Version: 18 October 2026. Supersedes the 17 October source handoff for current implementation status. The permanent app identity and six-tab Expo architecture remain unchanged. The visible brand is now **Zax**; your future symbol/logo has not been invented.

## What the links actually improve

The linked projects were reviewed for current purpose, licensing and data needs. Zax uses independently implemented public mathematical methods rather than copying restricted source or adding live brokerage engines. QuantConnect, the pairs repositories, Alphalens, pysystemtrade, financial cross-validation references, scikit-learn, Hummingbot, Nautilus and Composer are indexed in `research/zax-links/`.

- **Pairs:** formation/trading blocks, hedge-ratio options, Engle–Granger/ADF diagnostics, Johansen cross-check and multiple-pair false-discovery controls where the required synchronized input exists.
- **Momentum:** cross-sectional ranking with quantile, turnover and factor diagnostic output. Point-in-time universe membership and sector labels are still data requirements, not invented inputs.
- **Trend:** independent EWMAC trend/risk calculations, not pysystemtrade’s live futures order engine.
- **Machine learning:** label-aware purging, embargo, CPCV distribution diagnostics and retained holdout checks. Scores are not validated trading-win probabilities.
- **Market making/order book:** venue-specific snapshot/stream research remains paper-only; real orders, institutional L3/queue history and live broker execution were not added.
- **No-code research rules:** typed condition and allocation drafts can be explicitly saved and evaluated against sourced history. This is not an arbitrary-code execution surface or a confluence bypass.

## Reliability changes

Original uploads retain their encrypted bytes before analysis. The 25 MiB limit is checked as decoded bytes; PDF pages and images render as bounded authenticated previews, not public links. Source-specific AI receives a separate stripped, downscaled JPEG when available. Longer analysis has a durable job ID, observed progress phases, failed-job recovery and one explicit retry without re-uploading the original.

Workspace autosave, revision conflict handling, private CSV/JSON export/import, archive capacity, dependency previews and transactional delete paths preserve canonical paper history. Retained sources missed during phone shutdown are recovered into the owner index. A deletion confirmation does not authorize discarding edits made afterward.

Pending paper orders can be cancelled with version/source checks; cancelled is terminal. Entry mode remains **manual practice + gated strategy trades**. The server’s actual risk cap is displayed, and personal discipline checks are classified as enforced or advisory with separate controls and a duration editor.

Quotes reconnect with bounded REST recovery and instrument-keyed updates. Shared source-freshness rules, source-limited calendar/COT messages, Sample-mode escape controls, selectable UTC/IANA/fixed-offset clocks, deeper recent-analogue fetches and session projection remain explicit about genuine gaps.

Owner-specific AI rate limits are durable in the database and configurable. Optional local PIN, native crypto and background-value masking do not replace server owner authorization. Sign-out behavior and an independently confirmed Clear local data action are documented in the guide.

## What is still needed

Everything remains owner-only: **no public strategy links** were created. Private local export is owner-controlled, not a hosted share link. No third-party API credentials or broker-execution permissions were requested merely to reuse mathematical methods.

A successful private deployment, authenticated scheduler and actual force-quit bracket test are required before a position can honestly be marked Server-managed. Native APNs/FCM/Expo registration, permission and physical sound/badge delivery tests remain required. PIN/SecureStore/background transitions must also be tested on the actual phone. Licensed institutional depth, point-in-time universes, macro vintages and sufficient untouched outcomes cannot be replaced with generated data.

Canonical version saving/publication was previously blocked; this note does not claim that transport or permanent publication has recovered. The complete original-clause repair tracker is `ZAX_FIX_TRACKER.md`.

## Verification

Current diagnostics, final regression results, source exports and actual public-data checks will be recorded below only after their tools finish. Unit fixtures do not establish historical edge or physical-device behavior.

### Completed verification — 18 October 2026

The current whole regression run passed **519 tests**, with **one existing authentication integration skip** and no failed tests. TypeScript and lint passed. The backend built, the local TradingView runtime regenerated, and web/iOS/Android source exports passed. These are source/bundle checks, not signed app installations or physical-device proof. The subsequent guide-count update is separately checked below.

The canonical source-retry parser bug was corrected: the required job ID is no longer rejected before version/quota validation. Source-retry, byte-limit and coach-deadline regressions passed. The coach deadline now covers the whole 45-second ask lifecycle—including grounding—inside the client's 50-second margin; a timeout creates no fabricated answer.

The Quant Lab snapshot/stream mismatch was corrected explicitly: fresh polled venue snapshots are permitted only in research-scenario mode, while stream-only quoting helpers remain strict by default. Receipt timestamps are not refreshed on cache reads. A live venue request timed out during testing even though public HTTP checks recovered; final real-venue retry evidence is recorded separately, not inferred from fixtures.

A safe additive `trading_runtime_state` table was created and verified for durable request counters and processing evidence. No paper orders, private-source content, owner trades or brokerage records were created or deleted by the validation scripts. Original source bytes are excluded from portable metadata exports.

### Where to try the new controls

- **My Library:** original/page preview, durable source-analysis progress/retry, sync/conflict status, archive/dependency tools, private ZIP export/import, personal AI limits, optional PIN and background privacy.
- **Strategies → selected rulebook:** explicit no-code research draft editor and real-source evaluation.
- **Quant Lab → Advanced:** the integrated method and ML purge/embargo/CPCV controls; inspect source and distribution diagnostics before interpreting any result as a candidate.
- **Trades → Pending:** version-checked Cancel, with cancelled plans treated as terminal. **Trade detail:** canonical risk cap, enforced/advisory personal guard classifications and actual processing-evidence badge.
- **Chart/context:** explicit Sample-mode escape, quote recovery/status, chosen timezone clocks, deeper recent-analogue support and source-limited session projections.

### What I need from you next

Send the **detailed failed-Publish log from the Dashboard** if you want deployment/scheduler activation repaired. I will not retry publication blindly or loosen ownership. Then test the owner flow on your actual phone: background/reopen sync, PIN recovery, original PDF/image viewing, a manual paper order, a gated order, cancellation and its retained lifecycle, and an alert. Actual closed-app brackets and native sound/badge delivery require a successful private deployment/build and real delivery testing. Institutional depth/history, point-in-time universes, macro vintages and qualified outcomes still require real data—not simulation or a website link alone.

Final affected venue check: at **18 October 2026, 15:10:28 UTC**, the actual Quant Lab production service returned **ready** using genuine Coinbase REST L2 data. It produced two tick/lot-constrained hypothetical paper quotes, explicitly labelled **polled fallback—not streamed/NBBO**. No fills, returns, historical performance or owner/broker writes were simulated. The earlier transient timeout remains part of the observed provider history rather than being hidden.

The private feature guide was expanded to include **149 controls across 18 modules**, including the new reliability tools. A documentation-only count assertion is updated to match that intentional expansion; this does not turn all 149 controls into device-verified or statistically qualified features.

Final affected check: all **seven** expanded-guide regressions passed, and the final web source export passed. The original current whole-code run remains 519 passed/one existing skip; no redundant second full acceptance run was used to manufacture stronger device or statistical claims.
