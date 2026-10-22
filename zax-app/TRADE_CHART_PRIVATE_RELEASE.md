# Paper brackets on chart — private release

## Trading workflow

A confirmed StratDesk paper order is a stored simulated trade, not a broker order. The chart must show the trade's saved **entry, working stop loss and take profit** on that instrument's price scale. It must not invent levels from a scenario or recalculate a filled trade's original risk.

After confirmation, the returned trade is focused. In **Trades → Open**, tapping the trade opens its market/chart; a separate details/review action retains the journal and deep-dive workflow. Current canonical records are fetched for reload/deep links. Pending, open and closed records are labeled distinctly; inaccessible or wrong-market records never become fake marker lines.

Working stop/target revisions, partial exits and break-even management remain distinct from the original bracket. Automatic paper management remains opt-in; simply displaying an SL or TP does not activate management. No real-money order path is added.

## Private publication

This release is authorized for a permanent **owner-only web application and API**. The login page can be reached publicly, but all app tabs, personal market data, uploads, research, order/history and alert actions continue to require the verified owner. The broker data connection has no placement/edit/close broker-operation route.

Production serving uses the Expo web export for pages/assets and the Python-capable API container for `/api/*`. Browser API requests use the permanent application origin, not an old Sandbox URL. The OAuth origin allowlist remains exact; only configured or confirmed HTTPS app origins are admitted. API responses use private/no-store and publication routes disable shared caching. Auto-publish remains off.

**Publication is not a signed iOS/Android build.** APNs/FCM credentials, an actual native build, device notification permission/token and activated saved server watches are still required for closed-app push. Publishing does not enroll a device, create a watch or place a paper/broker trade.

## Verification status

Trade-marker implementation, source checks and final managed publication verification are in progress. This file will record actual outcomes before delivery; an accepted source push or a successful health endpoint alone is not proof of a working published UI/login/private-data gate.

## Moving from Preview to the permanent URL

Browser local storage is origin-specific. **Save workspace to cloud in the existing Preview/browser tab before moving**, then sign in at the permanent URL and use **Load cloud** if the new tab starts with the default workspace. Unsaved local strategy edits are not silently copied between browser origins. The managed database remains the same project store; durable paper orders/events, protected uploaded source files, source revisions and saved cloud records are not deleted by publication. Do not overwrite a newer local workspace merely to make the new URL look populated.

## Completed source checks

- Saved paper trade entry/working SL/TP markers implemented; price range includes focused bracket levels.
- Open-card navigation and immediate confirmed-order focus implemented with exact owned trade detail and saved proposal timeframe when available. Navigation seeds that timeframe once rather than locking normal chart controls.
- Version-monotone canonical merging preserves journals and strategy snapshots; exact details refresh every 15 seconds. Real partial event prices are distinguished from planned partial triggers.
- Owner-only legacy storage redirect and private theme-lab route were corrected during the read-only release trace. AES-GCM source encryption and owner-specific decrypt/read remain intact.
- **212 tests passed; one pre-existing auth integration test skipped.** TypeScript, ESLint and native/web source export checks passed before the final one-time navigation seed; focused checks and exports are rerunning for that final small change.

No test created an owner ledger order, broker order, push enrollment or fake browser session. The actual permanent publication URL and anonymous/owner-auth boundary checks will be recorded only after the managed publish result.

**Frozen source is ready:** final one-time navigation checks passed, followed by 14 focused marker/publication/storage regressions, TypeScript, zero ESLint findings and successful web/iOS/Android source exports. Local API health is 200; anonymous collection data and the legacy storage redirect both return 401 with private/no-store. The permanent publication is now being requested from this saved source; it is not live merely because these checks passed.

## Managed release request

The dedicated publication card was settled with **Allow once**. The persisted request confirmed that source version `ba6402ffcd539c9cb6beec147db1377339b7e0eb` was accepted for deployment `68116009`. At this observation the deployment was still **deploying**, not yet a successful public URL. The server already submitted the request; no duplicate publication request was made. Owner-only access, data-only broker connectivity and paper execution are unchanged.

## First clean-build failure and recovery

The first managed deployment failed while exporting Expo web: Metro could not get a SHA-1 for the newly created `react-native-css-interop/.cache/web.css`. Dependency installation completed; the failure was not owner authentication, trade validation or a broker order. Inspection showed that the installed interop adapter creates initial native cache placeholders but omits the web placeholder. The project Metro config now creates that missing placeholder before indexing a clean checkout, without overwriting existing generated Preview CSS or modifying installed packages. The normal NativeWind transform still produces real styles. A clean-checkpoint comparison and another explicitly confirmed managed publish are required before reporting a live release.

**Clean-source recovery passed.** A fresh `git archive` of committed candidate `9465ff4` was installed using the exact pinned declared command (no copied installed directory or warm generated project CSS). Expo web export succeeded and produced a nonempty `web-dist/index.html`. This validates the specific missing-web-placeholder correction locally; the hosted publish remains authoritative for upload/container/network/time-budget behavior and is being retried through the normal confirmation flow.

## Current release status — not yet published

The corrected request was accepted for source `9e5ededa738e68eb173ba45f1f318cbf76acc94e`, deployment `68533960`, but its final managed result was **failed: deployment timed out**. A one-time post-failure infrastructure snapshot reports `app_not_published` and deploy status `failed`. The deployment system-log request returned `owner_unavailable`, so no detailed container/static/upload-stage log was obtained. This evidence does not identify which stage stalled; do not blame Python, increase resource/billing settings, or repeat publication blindly.

The saved trade-chart implementation, 212 passing tests, final focused checks and clean Expo web reproduction remain valid. The working temporary Preview is **https://8328-ifud8uxlezx8u8y20iv5v-f48dabb1.us1.manus.computer** (not a successful permanent publication). Owner-only access and paper-only execution remain intact. To continue the release, obtain the detailed failed-Publish build/runtime log from the Dashboard, correct the evidenced stage, then use the normal confirmed publication path. No permanent live URL or native release artifact is available from these two failed requests.
