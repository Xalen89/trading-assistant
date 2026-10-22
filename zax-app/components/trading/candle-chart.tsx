import { useCallback, useMemo, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import type {
  CandleChartProps,
  ChartSurfaceEvent,
} from "@/lib/trading/chart-types";
import { buildLightweightPayload } from "@/lib/trading/lightweight-payload";
import { paperTradeChartSummary } from "@/lib/trading/trade-chart";
import type { Candle } from "@/lib/trading/model";
import LightweightSurface from "./lightweight-surface";
import type { ChartSurfaceHandle } from "./lightweight-surface-types";
import { CandleChart as SvgCandleChart } from "./svg-candle-chart";
import { Sheet, ToggleRow } from "./ui";
import { C, formatPrice, mono } from "./theme";
import {
  DEFAULT_SESSION_OVERLAY,
  SESSION_DEFINITIONS,
  type SessionOverlayPrefs,
} from "@/lib/trading/chart-sessions";

export type {
  ChartReferenceImage,
  ScenarioStyle,
  IndicatorLayers,
} from "@/lib/trading/chart-types";
const TRADINGVIEW = "https://www.tradingview.com/";

/** Display-only chart. Orders and source access remain in the owner-gated parent. */
export function CandleChart(props: CandleChartProps) {
  const [showSetupLabels, setShowSetupLabels] = useState(
    props.showSetupLabels === true,
  );
  const [localSessions, setLocalSessions] = useState<SessionOverlayPrefs>(
    DEFAULT_SESSION_OVERLAY,
  );
  const sessionPreferences = props.sessionOverlay ?? localSessions;
  const changeSessions = (next: SessionOverlayPrefs) => {
    if (props.onSessionOverlayChange) props.onSessionOverlayChange(next);
    else setLocalSessions(next);
  };
  const [details, setDetails] = useState(false);
  const payload = useMemo(
    () =>
      buildLightweightPayload({
        ...props,
        showSetupLabels,
        sessionOverlay: sessionPreferences,
      }),
    [props, showSetupLabels, sessionPreferences],
  );
  const surface = useRef<ChartSurfaceHandle>(null);
  const [selected, setSelected] = useState<{
    key: string;
    candle: Candle | null;
  } | null>(null);
  const [error, setError] = useState<string>();
  const [ready, setReady] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [fallback, setFallback] = useState(false);
  const inspection =
    (selected?.key === payload.key &&
      selected.candle &&
      payload.candles.find((c) => c.time === selected.candle?.time)) ||
    payload.candles.at(-1);
  const inspecting = selected?.key === payload.key && Boolean(selected.candle);
  const hasRsi = payload.lines.some((l) => l.pane === "rsi");
  const hasMacd = payload.lines.some((l) => l.pane === "macd");
  const height = 360 + (hasRsi ? 110 : 0) + (hasMacd ? 110 : 0);
  const savedTrade =
    props.focusedTrade &&
    (!props.market || props.focusedTrade.market === props.market)
      ? props.focusedTrade
      : undefined;
  const formingNotice = payload.formingCandle
    ? "FORMING / QUOTE UPDATE · CURRENT BAR NOT CLOSED · SCENARIOS USE LAST COMPLETED BAR"
    : undefined;
  const openAttribution = useCallback(() => {
    void Linking.openURL(TRADINGVIEW).catch(() =>
      setError("TradingView attribution link could not open in this browser."),
    );
  }, []);
  const onEvent = useCallback(
    (event: ChartSurfaceEvent) => {
      if (event.type === "ready") {
        setReady(true);
        return;
      }
      if (event.type === "error") {
        setError(event.message);
        return;
      }
      if (event.type === "attribution") {
        openAttribution();
        return;
      }
      // Never treat a historical replay candle as an actual market candle.
      setSelected({ key: payload.key, candle: event.candle });
    },
    [openAttribution, payload.key],
  );
  const retry = () => {
    setFallback(false);
    setError(undefined);
    setReady(false);
    setGeneration((n) => n + 1);
  };

  if (fallback)
    return (
      <View>
        <View style={styles.notice}>
          <Text style={styles.warning}>
            EXPLICIT SVG FALLBACK · NOT LIGHTWEIGHT CHARTS
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={retry}
            style={styles.smallButton}
          >
            <Text style={styles.buttonText}>Retry canvas</Text>
          </Pressable>
        </View>
        {formingNotice ? (
          <Text style={styles.formingNotice}>{formingNotice}</Text>
        ) : null}
        {props.aiForecast ? (
          <Text style={styles.warning}>
            AI forecast requires the canvas renderer. Retry canvas to display
            it; no actual/historical data was replaced.
          </Text>
        ) : null}
        {sessionPreferences.enabled ? (
          <Text style={styles.warning}>
            Session backgrounds require the canvas renderer. Retry canvas to
            show them.
          </Text>
        ) : null}
        <SvgCandleChart
          {...props}
          candles={payload.candles}
          focusedTrade={savedTrade}
        />
      </View>
    );

  return (
    <View style={styles.wrap}>
      <View style={styles.controls}>
        <View style={styles.tradeStatus}>
          <Text style={styles.statusText} numberOfLines={1}>
            {savedTrade
              ? `PAPER ${savedTrade.side.toUpperCase()} · ${savedTrade.status.toUpperCase()}`
              : "PAPER TRADING"}
          </Text>
          <Text style={styles.subtle} numberOfLines={1}>
            {savedTrade
              ? `Management ${savedTrade.autoManage ? "on" : "off"}`
              : "Tap a candle to inspect"}
          </Text>
        </View>
        <View style={styles.actions}>
          {props.onSell ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Create paper sell plan"
              onPress={props.onSell}
              style={[styles.tradeButton, styles.sell]}
            >
              <Text style={styles.sellText}>SELL</Text>
            </Pressable>
          ) : null}
          {props.onBuy ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Create paper buy plan"
              onPress={props.onBuy}
              style={[styles.tradeButton, styles.buy]}
            >
              <Text style={styles.buyText}>BUY</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      {inspecting && inspection ? (
        <Text style={styles.inspection}>
          {new Date(inspection.time * 1000).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
          {`  O ${formatPrice(inspection.open, props.precision)}  H ${formatPrice(inspection.high, props.precision)}\nL ${formatPrice(inspection.low, props.precision)}  C ${formatPrice(inspection.close, props.precision)}`}
        </Text>
      ) : null}
      {formingNotice ? (
        <Text style={styles.formingNotice} accessibilityLiveRegion="polite">
          {formingNotice}
        </Text>
      ) : null}
      <LightweightSurface
        key={generation}
        ref={surface}
        payload={payload}
        height={height}
        onEvent={onEvent}
      />
      <View style={styles.toolbar}>
        <View style={styles.actions}>
          {(
            [
              ["zoom-out", "−", "Show more candles"],
              ["zoom-in", "+", "Show fewer candles"],
              ["reset", "Latest", "Reset chart to latest"],
            ] as const
          ).map(([command, label, accessibilityLabel]) => (
            <Pressable
              key={command}
              accessibilityRole="button"
              accessibilityLabel={accessibilityLabel}
              style={styles.smallButton}
              onPress={() => {
                surface.current?.command(command);
                setSelected(null);
              }}
            >
              <Text style={styles.buttonText}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel="Session background boxes"
            accessibilityState={{ checked: sessionPreferences.enabled }}
            aria-checked={sessionPreferences.enabled}
            style={[
              styles.smallButton,
              sessionPreferences.enabled && styles.activeButton,
            ]}
            onPress={() =>
              changeSessions({
                ...sessionPreferences,
                enabled: !sessionPreferences.enabled,
              })
            }
          >
            <Text
              style={[
                styles.buttonText,
                sessionPreferences.enabled && { color: C.lime },
              ]}
            >
              Sessions
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Show setup text labels"
            accessibilityState={{ selected: showSetupLabels }}
            style={[styles.smallButton, showSetupLabels && styles.activeButton]}
            onPress={() => setShowSetupLabels((current) => !current)}
          >
            <Text
              style={[styles.buttonText, showSetupLabels && { color: C.lime }]}
            >
              Labels
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setDetails(true)}
            style={styles.smallButton}
          >
            <Text style={styles.buttonText}>Details</Text>
          </Pressable>
        </View>
      </View>
      {sessionPreferences.enabled &&
      (props.timeframe === "1d" || props.timeframe === "1w") ? (
        <Text style={styles.subtle}>
          Session boxes are intraday only · choose 4h or lower.
        </Text>
      ) : null}
      {sessionPreferences.enabled && !sessionPreferences.sessions.length ? (
        <Text style={styles.subtle}>
          No sessions selected · choose them in Details.
        </Text>
      ) : null}
      {!payload.candles.length ? (
        <Text style={styles.warning}>
          No source candles available. Refresh the selected market; no data is
          invented.
        </Text>
      ) : null}
      {error ? (
        <View style={styles.notice}>
          <Text style={styles.warning}>{error}</Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={retry}
              style={styles.smallButton}
            >
              <Text style={styles.buttonText}>Retry chart</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setFallback(true)}
              style={styles.smallButton}
            >
              <Text style={styles.buttonText}>Use SVG fallback</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {payload.scenarioLabel ? (
        <Text style={styles.warning}>HISTORICAL REPLAY · NOT A FORECAST</Text>
      ) : null}
      {payload.forecastLabel ? (
        <Text style={[styles.warning, { color: C.blue }]}>
          {payload.forecastLabel} · BLUE PROJECTION
        </Text>
      ) : null}
      {payload.scenarioLayers?.length ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Inspect scenario layer sources"
          onPress={() => setDetails(true)}
          style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
        >
          {payload.scenarioLayers.map((layer) => (
            <Text
              key={layer.id}
              style={[styles.subtle, { color: layer.color }]}
            >
              {layer.kind === "ai" ? "AI" : "History"} {layer.sourceTimeframe} ·{" "}
              {layer.style}
              {layer.kind === "historical"
                ? " · REBASED"
                : layer.contextMode === "last-available"
                  ? " · HISTORY CONTEXT / NOT CURRENT"
                  : ""}
            </Text>
          ))}
        </Pressable>
      ) : null}
      {payload.reference ? (
        <Text style={styles.warning}>VISUAL REFERENCE · NOT A FORECAST</Text>
      ) : null}
      {payload.messages.map((message) => (
        <Text key={message} style={styles.warning}>
          {message}
        </Text>
      ))}
      <View style={styles.attribution}>
        <Text style={styles.subtle} numberOfLines={1}>
          {ready
            ? `${props.market ?? "Chart"} · ${props.timeframe ?? ""} · Device time`
            : "Starting canvas…"}
        </Text>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="TradingView Lightweight Charts attribution"
          onPress={openAttribution}
        >
          <Text style={styles.link}>TradingView</Text>
        </Pressable>
      </View>
      <Sheet
        visible={details}
        title="Chart details"
        subtitle="Display only · exact source and saved prices"
        onClose={() => setDetails(false)}
      >
        <Text style={styles.section}>SESSION BACKGROUNDS</Text>
        <ToggleRow
          label="Show session boxes"
          value={sessionPreferences.enabled}
          onChange={(enabled) =>
            changeSessions({ ...sessionPreferences, enabled })
          }
        />
        <Text style={styles.detailText}>
          Subtle clock-window rectangles sit behind candles. Regional
          timezone/DST is automatic and independent of your WR1 strategy clock.
          These are time references, not exchange opening hours or entry
          signals. Crypto runs 24/7, including weekends. Changes save on this
          device; use Open context → Save to cloud to sync them.
        </Text>
        {SESSION_DEFINITIONS.map((session) => (
          <View key={session.id} style={styles.sessionRow}>
            <View
              style={[styles.sessionColor, { backgroundColor: session.color }]}
            />
            <View style={{ flex: 1 }}>
              <ToggleRow
                label={session.label}
                detail={`${String(session.startHour).padStart(2, "0")}:00–${String(session.endHour).padStart(2, "0")}:00 · ${session.timezone}`}
                value={sessionPreferences.sessions.includes(session.id)}
                onChange={(enabled) =>
                  changeSessions({
                    ...sessionPreferences,
                    sessions: enabled
                      ? [
                          ...new Set([
                            ...sessionPreferences.sessions,
                            session.id,
                          ]),
                        ]
                      : sessionPreferences.sessions.filter(
                          (id) => id !== session.id,
                        ),
                  })
                }
              />
            </View>
          </View>
        ))}
        <Text style={styles.detailText}>
          {props.timeframe === "1d" || props.timeframe === "1w"
            ? "Session backgrounds are intraday only. Choose 4h, 1h, 15m, 5m or 1m; daily/weekly candles cannot resolve intraday session boundaries."
            : sessionPreferences.enabled && !sessionPreferences.sessions.length
              ? "Choose at least one session to draw a background."
              : "Only actual chart history/observed time is shaded; AI and historical-projection future space is not. Overlapping sessions intentionally blend softly."}
        </Text>
        <Text style={styles.section}>SOURCE</Text>
        <Text style={styles.detailText}>{payload.sourceLabel}</Text>
        <Text style={styles.detailText}>
          TradingView Lightweight Charts · drag horizontally/pinch to navigate;
          tap or crosshair to inspect actual OHLC. Scroll vertically to move
          through the page.
        </Text>
        {inspection ? (
          <>
            <Text style={styles.section}>
              {inspecting ? "INSPECTED CANDLE" : "LATEST SOURCE CANDLE"}
            </Text>
            <Text style={styles.detailText}>
              {new Date(inspection.time * 1000).toLocaleString()}
            </Text>
            <Text
              style={styles.detailText}
            >{`Open ${formatPrice(inspection.open, props.precision)}\nHigh ${formatPrice(inspection.high, props.precision)}\nLow ${formatPrice(inspection.low, props.precision)}\nClose ${formatPrice(inspection.close, props.precision)}`}</Text>
          </>
        ) : null}
        {savedTrade ? (
          <>
            <Text style={styles.section}>SAVED PAPER TRADE</Text>
            <Text style={styles.detailText}>
              {paperTradeChartSummary(savedTrade)}
            </Text>
          </>
        ) : null}
        <Text style={styles.section}>LEVELS · {payload.priceLines.length}</Text>
        <Text style={styles.detailText}>
          Clean view keeps Entry/SL/TP badges visible. Setup text is optional;
          lines and attached indicators remain on. Distant setup levels do not
          shrink the candle view. Saved paper brackets stay in scale.
        </Text>
        {payload.priceLines.length ? (
          payload.priceLines.map((line, i) => (
            <View key={`${line.id}:${i}`} style={styles.levelRow}>
              <Text style={[styles.levelName, { color: line.color }]}>
                {line.label}
              </Text>
              <Text style={styles.levelPrice}>
                {formatPrice(line.price, props.precision)}
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.detailText}>No supplied price levels.</Text>
        )}
        {payload.zones.length ? (
          <>
            <Text style={styles.section}>
              STRATEGY ZONES · {payload.zones.length}
            </Text>
            {payload.zones.map((zone, i) => (
              <Text key={`${zone.id}:${i}`} style={styles.detailText}>
                {zone.label}
                {` · ${formatPrice(zone.low, props.precision)}–${formatPrice(zone.high, props.precision)}`}
                {zone.ce !== undefined
                  ? ` · CE ${formatPrice(zone.ce, props.precision)}`
                  : ""}
              </Text>
            ))}
          </>
        ) : null}
        {payload.forecastLabel && props.aiForecast ? (
          <>
            <Text style={styles.section}>AI FORECAST · HYPOTHETICAL ONLY</Text>
            <Text style={styles.detailText}>
              {props.aiForecast.thesis}
              {"\n"}Assumptions: {props.aiForecast.assumptions.join(" · ")}
              {"\n"}Invalidation: {props.aiForecast.invalidation}
              {"\n"}Generated{" "}
              {new Date(props.aiForecast.generatedAt).toLocaleString()} ·
              expires {new Date(props.aiForecast.expiresAt).toLocaleString()}
              {"\n"}
              {props.aiForecast.source} · {props.aiForecast.model} · no
              validated success probability.
            </Text>
          </>
        ) : null}
        {payload.lines.length ? (
          <>
            <Text style={styles.section}>ATTACHED INDICATORS</Text>
            <Text style={styles.detailText}>
              {payload.lines.map((line) => line.label).join(" · ")}
            </Text>
          </>
        ) : null}
        {payload.scenarioLabel ? (
          <>
            <Text style={styles.section}>HISTORICAL SOURCE</Text>
            <Text style={styles.detailText}>{payload.scenarioLabel}</Text>
          </>
        ) : null}
        {props.scenarioLayers?.length ? (
          <>
            <Text style={styles.section}>TIMEFRAME SCENARIO LAYERS</Text>
            {props.scenarioLayers
              .filter((layer) => layer.market === props.market)
              .map((layer) => (
                <View key={layer.id} style={{ gap: 4, marginBottom: 10 }}>
                  <Text style={[styles.detailText, { color: layer.color }]}>
                    {layer.kind === "ai"
                      ? "AI hypothesis"
                      : "Historical replay"}{" "}
                    · {layer.sourceTimeframe} · {layer.label}
                  </Text>
                  <Text style={styles.detailText}>
                    Show on: {layer.displayTimeframes.join(" · ")} ·{" "}
                    {layer.anchorMode === "follow"
                      ? "Connected display only"
                      : "Fixed source anchor"}
                  </Text>
                  <Text style={styles.detailText}>
                    {
                      payload.scenarioLayerStatus?.find(
                        (s) => s.id === layer.id,
                      )?.reason
                    }
                  </Text>
                  <Text style={styles.detailText}>
                    {
                      payload.scenarioLayers?.find((s) => s.id === layer.id)
                        ?.note
                    }
                  </Text>
                </View>
              ))}
          </>
        ) : null}
        {payload.reference ? (
          <Text style={styles.detailText}>
            LOCAL VISUAL REFERENCE · {payload.reference.label} · NOT A FORECAST
          </Text>
        ) : null}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: "hidden", minHeight: 360, gap: 6 },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingBottom: 4,
  },
  tradeStatus: { flex: 1, gap: 3 },
  statusText: {
    color: C.text,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  subtle: { color: C.muted, fontSize: 10, lineHeight: 15, flexShrink: 1 },
  actions: { flexDirection: "row", alignItems: "center", gap: 6 },
  tradeButton: {
    minHeight: 40,
    minWidth: 54,
    paddingHorizontal: 9,
    borderWidth: 1,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  buy: { backgroundColor: C.lime, borderColor: C.lime },
  sell: { backgroundColor: C.rose + "18", borderColor: C.rose + "88" },
  buyText: { color: C.black, fontWeight: "900", fontSize: 11 },
  sellText: { color: C.rose, fontWeight: "900", fontSize: 11 },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingTop: 2,
    flexWrap: "wrap",
  },
  smallButton: {
    minHeight: 36,
    minWidth: 36,
    paddingHorizontal: 8,
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  activeButton: { borderColor: C.lime + "88", backgroundColor: C.lime + "0D" },
  buttonText: { color: C.text, fontSize: 10, fontFamily: mono },
  inspection: {
    color: C.price,
    fontFamily: mono,
    fontSize: 10,
    lineHeight: 15,
  },
  warning: { color: C.amber, fontSize: 10, lineHeight: 15, paddingVertical: 3 },
  formingNotice: {
    color: C.blue,
    fontFamily: mono,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.35,
    lineHeight: 14,
    paddingVertical: 3,
  },
  notice: {
    paddingVertical: 8,
    borderTopWidth: 1,
    borderColor: C.border,
    gap: 6,
  },
  attribution: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    alignItems: "center",
    paddingBottom: 2,
  },
  link: {
    color: C.blue,
    fontSize: 10,
    textDecorationLine: "underline",
    paddingVertical: 5,
  },
  section: {
    color: C.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.7,
    paddingTop: 8,
  },
  detailText: { color: C.text, fontSize: 12, lineHeight: 19 },
  sessionRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  sessionColor: { width: 7, height: 28, borderRadius: 2 },
  levelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  levelName: { flex: 1, fontSize: 12, lineHeight: 18 },
  levelPrice: {
    color: C.price,
    fontFamily: mono,
    fontSize: 12,
    lineHeight: 18,
  },
});
