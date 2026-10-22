# AI conditional forecast scenario (`forecast`)

**Scope:** Read-only source audit of the forecast capability only. This describes behavior in the current code; it is not a device/browser test or a forecast-quality assessment.

## At a glance

This is an **AI-generated, explicitly hypothetical chart scenario** intended to help a trader think through a conditional path, its assumptions, and an invalidation condition. It is not a price prediction, probability estimate, validated strategy, historical replay, order, or trade recommendation. It does not create paper entries, write forecast points into historical/source data, or provide execution functionality.

The panel is rendered on the trading screen **below Timeframe Bias and above Historical scenario** (`app/(tabs)/index.tsx:1149–1175`). The chart can display its projection separately from actual bars and historical replay. The API procedure is owner-gated (`server/trading/forecast-router.ts:24–35`).

## Controls and subtools

### 1. “AI forecast scenario” disclosure
- **Purpose:** Open or collapse the scenario tool and its result; the summary distinguishes “Generate a conditional scenario—not a prediction” from a generated hypothetical direction.
- **Location:** Trading screen, below Timeframe Bias; component `components/trading/ai-forecast-panel.tsx:47–54`.
- **How to use:** Tap the disclosure heading to inspect or hide its contents. It is open by default in this component.
- **Output:** A short summary when collapsed; when open, the prompt, generation control, any status/error, and (after generation) scenario details and display controls.
- **Next action:** If actual connected market data is available, optionally enter a scenario question and generate. Treat the result as a conditional planning aid only.
- **Status:** Implemented in the panel source.
- **Limits:** The panel is disabled in app sample mode. Its availability also depends on the server prerequisites below; no generated result is persisted as a forecast record by the audited router/service.

### 2. “Scenario question (optional)” text input
- **Purpose:** Let the trader ask what conditional scenario to examine (placeholder example: “What conditions could extend or reverse this move?”).
- **Location:** Inside the open forecast panel; `ai-forecast-panel.tsx:60–66`.
- **How to use:** Tap the multiline input, type a question or conditions of interest, then tap Generate. The UI truncates input to 800 characters; the API also caps it at 800 (`forecast-router.ts:27–32`). It may be left blank.
- **Output:** The text is passed as untrusted user scenario instructions to the model together with market data. The resulting thesis, assumptions, and invalidation are displayed if generation succeeds; the question itself does not directly create a price path.
- **Next action:** Use the returned assumptions and falsifiable invalidation to frame what to monitor; revise the question and regenerate if the scenario question changes.
- **Status:** Implemented; no separate question validation or saved prompt history is shown in this component.
- **Limits:** User text is not evidence and does not override the server prompt. It cannot supply substitute candles or make the output a validated forecast.

### 3. “Generate AI scenario” / “Regenerate from current data”
- **Purpose:** Request a new conditional hypothetical path from current source context. Regeneration reuses current market/timeframe and the active strategy context supplied by the screen; there is no separate strategy picker in this panel.
- **Location:** Button below the optional question; `ai-forecast-panel.tsx:67–85`. Server endpoint: `forecast.generate` in `server/trading/forecast-router.ts:24–68`.
- **How to use:** With the panel open and not disabled, optionally enter a question, then tap Generate. Wait while the label says “Building scenario…”. After a result, the button becomes “Regenerate from current data”. If it fails, read the displayed mutation error; the source catches the failed mutation without fabricating a substitute (`ai-forecast-panel.tsx:31–45, 83–85`).
- **Output:** On success, a direction (`up`, `down`, or `range`), thesis, 1–6 assumptions, invalidation, and exactly 12 future display OHLC points. The points are constructed from the actual anchor price and actual ATR using model-provided ATR offsets; the direction must agree with the final path. The panel displays source, model, generated time, expiry, anchor price, and last completed source-bar time (`forecast-service.ts:88–176`; `lib/trading/ai-forecast.ts:5–23, 50–68, 70–130`).
- **Next action:** Review the thesis, each assumption, and invalidation together; use the plotted path to discuss conditional scenarios, not to place or size a trade. Regenerate only after refreshing/confirming context or changing the question.
- **Status:** End-to-end code path is present: owner-only mutation fetches market candles and quote, calls the configured LLM, validates the strict response schema, then materializes a display-only scenario. The model call was not executed as part of this audit.
- **Limits / exact prerequisites from code:**
  - App sample mode passes `disabled=true`; the button is disabled and the UI says actual connected market data is required (`index.tsx:1153–1159`; panel `:76–82`).
  - Server needs an actual, valid feed with at least **15 completed bars** (up to the latest 80 are sent), and a matching-market quote with `status === "live"`, positive price, timestamp no more than 120 seconds old and no more than 1 second in the future (`forecast-service.ts:50–69`). A completed source bar must be no more than two timeframe periods stale (`:68–69`). Sample candles are explicitly not substituted.
  - The actual completed OHLC bars must yield a positive 14-period ATR; ATR uses actual source high/low/previous close only and throws if there are fewer than 15 completed bars (`ai-forecast.ts:50–68`).
  - At least one available supported model must be listed: `gemini-3-flash-preview`, `gpt-5-mini`, `gemini-3.1-pro-preview`, or `gpt-5` (`forecast-service.ts:70–86`), and the LLM call must complete and return strict schema-valid JSON. If an active strategy ID is supplied, it must resolve to a non-archived strategy in the owner’s private workspace; otherwise the API returns not found (`forecast-router.ts:42–51`).
  - The route imposes a process-memory limit of **six generation attempts per user per 10 minutes** (`forecast-router.ts:9–22`); this is a server availability/rate-limit condition, not a model-quality check.

### 4. “Show AI forecast” toggle
- **Purpose:** Show or hide the already generated scenario from the chart without deleting its result.
- **Location:** Appears after successful generation; `ai-forecast-panel.tsx:86–96`.
- **How to use:** Turn it off to remove the forecast overlay; turn it back on to restore it while the scenario remains valid. It is independent of historical replay.
- **Output:** The parent chart receives the scenario when on and `undefined` when off. A chart validity check suppresses a mismatched, expired, or invalid scenario (`forecast-display.ts:3–49`; payload construction `lightweight-payload.ts:293–310`).
- **Next action:** Keep it visible to compare the conditional path with actual chart context; turn it off for an uncluttered view. If the chart reports that the anchor rolled over or the scenario expired, regenerate from current context.
- **Status:** Implemented as a display toggle; no change to the generated scenario’s data or validity.
- **Limits:** Hiding it does not erase it. It will not display if the market/timeframe differs, expiry has passed, the chart’s latest candle no longer matches the forecast anchor, or the forecast display data is invalid (`forecast-display.ts:13–43`). The source does not document the precise display response on every device/chart renderer.

### 5. `line`, `candles`, `both` chart-style buttons
- **Purpose:** Choose the visual representation of the same hypothetical path.
- **Location:** Three secondary buttons next to one another, shown after a scenario exists; `ai-forecast-panel.tsx:97–109`.
- **How to use:** Tap `line` for the dashed projected close path, `candles` for projected OHLC candles, or `both` for both representations. The chart controller implements these choices (`lib/trading/lightweight-controller.ts:673–741`).
- **Output:** A dashed blue line joins the anchor to the 12 projected closes; translucent blue/purple candles show the 12 projected OHLC bars. `both` shows both. The chart labels the overlay as hypothetical/not validated (`lightweight-payload.ts:491–495`).
- **Next action:** Choose the display that makes the path easiest to compare with the actual chart; this is presentation only.
- **Status:** Implemented in payload/controller code.
- **Limits:** Style does not alter assumptions, model output, values, or chart source bars. Forecast candles use `volume: 0`, explicitly marked `display-placeholder-not-forecast`; the panel also warns projected volume is only a display placeholder (`ai-forecast.ts:104–112, 122–129`; panel `:121–122`). No volume, order-flow, or liquidity forecast is produced.

### 6. Scenario detail/readout and chart overlay
- **Purpose:** Make the scenario inspectable, including its conditional argument and provenance, rather than presenting a naked directional line.
- **Location:** Panel details after generation (`ai-forecast-panel.tsx:110–123`) and chart annotation/readout (`components/trading/candle-chart.tsx:343–357`).
- **How to use:** Read the thesis, assumptions, and invalidation; check source, model, generation/expiry, anchor and last completed source bar before using the chart overlay.
- **Output:** The panel explicitly says there is no success probability or validated edge. Chart readout repeats thesis/assumptions/invalidation, source, model, and times. Forecast display validity additionally requires correct kind, matching market/timeframe, unexpired timestamp, unchanged anchor, and 12 structurally valid future bars (`forecast-display.ts:10–47`).
- **Next action:** Convert assumptions/invalidation into observation questions for manual review; compare subsequent actual market bars with the scenario as new data, but do not reinterpret one path as backtest evidence.
- **Status:** Implemented display and safety/validity checks. Current unit tests cover selected logic with synthetic fixtures only.
- **Limits:** No success probability, calibration, hit rate, out-of-sample evidence, or validated trading edge is calculated. A generated path is not a historical result. The forecast is separate from historical replay, source data and analysis input; associated tests assert generated candles are not appended to actual candles/replay (`tests/trading/ai-forecast.test.ts:89–114`).

### 7. “Remove forecast”
- **Purpose:** Clear the current scenario from the panel and chart state.
- **Location:** Button at the bottom of the generated scenario details; `ai-forecast-panel.tsx:124–131`.
- **How to use:** Tap “Remove forecast”. To get another scenario, tap Generate again after removal.
- **Output:** The panel’s scenario state is cleared and the parent is notified with no forecast; style selection is retained.
- **Next action:** Generate again only if a fresh conditional scenario is useful.
- **Status:** Implemented as local/UI state clearing.
- **Limits:** It is not an order cancellation or deletion of a persisted forecast: the audited router/service do not store forecast records or create trades.

## Operational behavior versus validation

The code describes an **operational, conditional scenario-generation/display path** when the required live feed, quote, model, authentication, and strategy context (if supplied) are available. Errors are surfaced as precondition, rate-limit, or mutation messages rather than replaced with synthetic/generated fallback data. The router is owner-only and the service contains no order/account/source-write tools (`forecast-service.ts:46–47`; `forecast-router.ts:25–40`). Nothing in this feature submits an order or paper entry.

The associated Vitest file uses clearly labeled **synthetic unit fixtures only**. It exercises 12-point construction, schema/bounds/direction checks, no probability and placeholder volume, mismatch/expiry/anchor rollover suppression, separation from actual/replay candles, and ATR warmup (`tests/trading/ai-forecast.test.ts:10–127`). Those checks are not device/browser proof, live-provider proof, backtesting, calibration, statistical edge, or evidence of predictive accuracy. No live generation or statistical validation was performed for this audit.

## Confirmed source defects

None identified in the audited forecast-specific panel, service, display validation, and associated unit tests. No changes were made to project code or shared workbench UI/API files.
