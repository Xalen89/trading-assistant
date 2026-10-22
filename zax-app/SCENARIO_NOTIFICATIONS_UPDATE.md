# Strategy-linked chart tools and historical direction alerts

## What changed

**Applying a strategy now attaches its declared numerical tools to the chart automatically.** The known EMA20/50, SMA10/20/50, Bollinger20, source ten-bar range, Donchian20, MACD and RSI14 layers follow the selected visible rulebook(s). ATR-based guides remain guides, not silently moved order stops. Comparisons combine the selected strategies’ declared tools. Old independent indicator switches no longer decide what appears. Strategy-level visibility still lets you hide a whole rulebook. An unknown period or undefined rule is not replaced with an invented indicator; source-only collection records still need reviewed definitions.

**Historical replay is no longer restricted to a ready setup.** With every strategy—including custom/reference/scalping metadata—the engine first uses a compatible strategy-conditioned historical case when it has one. Otherwise it retrieves the nearest past twelve-bar close shape and replays that window’s actual next twelve OHLC bars, anchored to the latest closed price and positively scaled. This fallback is prominently labeled **historical context replay**, not a strategy signal, success probability or forecast. Source timestamps and market gaps are retained, never filled with made-up candles.

The replay supports **Line**, **Ghost OHLC**, or **Both** inside the chart. It needs at least 36 valid closed observations containing a complete past continuation; a missing/disconnected feed, insufficient history or unsupported frame stays unavailable. “Always usable” means it does not require a ready setup or a particular strategy—not that the app fabricates a future when data is absent.

## Direction-change watch

On the chart, select the strategy or combination and press **Notify me when scenario direction flips**. Or create the **Scenario direction flips** rule in Alerts. Then use **Save rules to cloud** so the server sees the new watch.

A direction means the replay’s overall movement from the latest closed anchor price to its final historical-replay close. A relative move within ±0.01% is treated as flat. **Up → Down** and **Down → Up** notify; a changed source case with the same direction does not. This is separate from the broader **Scenario shape changes** rule.

- The first observation establishes a baseline without notifying.
- Baselines and captured flip events are stored atomically per owner/rule, independently of opening the chart.
- Flat or unavailable observations preserve the last directional baseline rather than inventing a reversal.
- A strategy revision, market/frame/provider or selected-combination change re-seeds the context; an older clock from a genuinely new provider does not retain the old provider baseline.
- A switch between strategy-matched and context replay can notify if the displayed path really reverses.
- Repeated observations do not duplicate the same event. If a reversal is suppressed by cooldown and remains reversed, it is eligible after cooldown; this coalesces movement rather than preserving every intermediate flip.
- A tap loads your owned event’s captured candles, exact historical path, strategy versions and declared tools. The captured path is shown even if live replay was previously hidden. Returning to live analysis restores live state; hiding a captured path returns to live view.

## How phone notifications work after publication

**Publishing the backend is necessary but not sufficient.** The Safari/browser version shown in your screenshot is not the native Expo push route. Web push/PWA notification delivery is not implemented by this app.

1. **Publish the current private backend** when you are ready, retaining the owner-only access gate. Publication does not have to make the app accessible to other users, and you can keep editing/saving new versions afterward.
2. **Prepare and install a push-capable native build** through the project’s native build workflow: a genuine Expo project ID, iOS APNs/signing configuration and Android FCM configuration. Native builds must use the published project’s backend configuration, not a temporary Preview port. Expo Go is not accepted for this notification path. iOS/TestFlight or a private Android build can be used without opening your app to everyone.
3. In the installed app, sign in as the approved owner, open **Alerts → Enable mobile push**, and grant the phone’s notification permission. This registers that device’s actual Expo push token to your owner record.
4. Create the direction watch and **Save rules to cloud**. Keep the watch enabled and choose its cooldown.
5. On the deployed backend, press **Activate closed-app scanner**. The authenticated server then checks source data independently of whether the app is open.
6. Verify a real test delivery and alert tap on your actual phone, including foreground/background/closed states. Native receipt and OS permission/network behavior are separate from an accepted Expo push ticket.

The scan cadence is one minute, but a 45-second deadline and maximum twelve broker information reads—including reserved account/catalog bootstrap reads—make a large watchlist rotate across scans. A five-minute chart changes its closed source window on its own cadence. Delivery is therefore not tick-by-tick or guaranteed instant. While the native app is open, received pushes can display a banner and fetch the owned stored event into the app; this does not fabricate an alert in the client.

## Verification and boundaries

The real-data probe read **300 actual XAUUSD five-minute BID bars** from the existing authorized TradeLocker account. All **13 tested selections**—the current eleven source presets, an arbitrary custom rulebook and a combined selection—returned a complete twelve-bar replay without creating an event, order or session. This verifies the algorithm/data path, not every market/frame or physical-device chart.

Source tests cover automatic attachment, no-lookahead replay, geometric rather than trade-side direction, durable baseline locking, duplicates, cooldown, provider/version reset, broker notification routing and cold-start scan reserve. The independent read-only trace’s captured-overlay, provider-clock and scan-bootstrap issues were corrected. Final test/export status is recorded below after completion.

No native credentials/device enrollment, public publication, real phone push delivery, broker order or calibrated forecast probability was produced during this update. The app stays **owner-only and paper-only**.

## Official notification references

- [Expo push notification setup](https://docs.expo.dev/push-notifications/push-notifications-setup/)
- [Using push notification services](https://docs.expo.dev/guides/using-push-notifications-services/)

### Final source verification

The whole existing suite passed **196 tests** (one existing integration skipped) before the independent trace’s targeted corrections. The corrected provider-clock, cold-bootstrap and persisted-direction paths then passed **21 focused tests**, TypeScript, ESLint and backend compilation. The frozen final source exported successfully for **web, iOS and Android**. Public Preview and API health returned HTTP 200. These are source/bundle checks—not a signed native release or proof of actual phone delivery. Publication remains off; final managed-source acceptance is separate from a recorded Version-history receipt.
