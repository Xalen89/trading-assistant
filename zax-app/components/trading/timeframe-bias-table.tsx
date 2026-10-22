import { useCallback } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  TIMEFRAME_BIAS_TIMEFRAMES,
  type TimeframeBiasRow,
  type TimeframeBiasStatus,
} from "@/lib/trading/timeframe-bias";
import { freshnessPolicyLabel } from "@/lib/trading/freshness";
import { trpc } from "@/lib/trpc";
import { Disclosure } from "./disclosure";
import { C, mono } from "./theme";
import { Card, SectionLabel } from "./ui";

export type TimeframeBiasTableProps = {
  /** The current chart market. Changing it creates a new tRPC query key. */
  market: string;
  enabled?: boolean;
  /** Convenience inverse used while the chart is explicitly in sample mode. */
  disabled?: boolean;
  /** Optional parent notification after a pull/button refresh completes. */
  onRefreshed?: () => void;
  /** Parent-owned sample persistence can provide a one-tap exit action. */
  onExitSampleMode?: () => void;
};

type SignalVisual = { label: string; arrow: string; color: string };

const VISUALS: Record<TimeframeBiasStatus, SignalVisual> = {
  bullish: { label: "Bullish", arrow: "↑", color: C.lime },
  bearish: { label: "Bearish", arrow: "↓", color: C.rose },
  neutral: { label: "Mixed / neutral", arrow: "↔", color: C.amber },
  insufficient: { label: "Insufficient", arrow: "—", color: C.muted },
  stale: { label: "Stale", arrow: "◷", color: C.amber },
  unavailable: { label: "Unavailable", arrow: "×", color: C.rose },
};

function dateTime(value?: number, seconds = false): string {
  if (!value || !Number.isFinite(value)) return "Unavailable";
  return new Date(seconds ? value * 1000 : value).toLocaleString();
}

function waitingRow(timeframe: (typeof TIMEFRAME_BIAS_TIMEFRAMES)[number]) {
  return { timeframe, label: "Checking…", arrow: "…", color: C.muted };
}

function disabledVisual(disabled: boolean): SignalVisual {
  return {
    label: disabled ? "Sample mode" : "Disabled",
    arrow: "—",
    color: C.amber,
  };
}

/**
 * Compact source-only bias view. It intentionally uses the server's getCandles
 * response rather than the screen's accumulating/forming chart candles.
 */
export function TimeframeBiasTable({
  market,
  enabled = true,
  disabled = false,
  onRefreshed,
  onExitSampleMode,
}: TimeframeBiasTableProps) {
  const active = enabled && !disabled;
  const inactiveMessage = !active
    ? disabled
      ? "Unavailable in Sample mode — exit Sample to compute from completed source bars."
      : "Automatic completed-bar bias is currently disabled."
    : undefined;
  const query = trpc.bias.timeframes.useQuery(
    { market },
    {
      enabled: active && Boolean(market),
      retry: false,
      staleTime: 0,
      gcTime: 0,
    },
  );
  // A market-keyed query may briefly retain a previous observer result; never
  // render that result beneath a newly selected market.
  const result =
    active && query.data?.market === market ? query.data : undefined;
  const runRefresh = useCallback(async () => {
    if (!active) return;
    await query.refetch();
    onRefreshed?.();
  }, [active, onRefreshed, query]);
  const refreshing = query.isFetching && !query.isLoading;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <SectionLabel>COMPLETED-BAR BIAS</SectionLabel>
          <Text style={styles.subtitle} numberOfLines={1}>
            {market || "Select a market"} · all supported frames
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh timeframe bias"
          disabled={!active || query.isFetching}
          onPress={() => void runRefresh()}
          style={({ pressed }) => [
            styles.refresh,
            {
              opacity: !active || query.isFetching ? 0.45 : pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text style={styles.refreshText}>
            {query.isFetching ? "Refreshing…" : "Refresh"}
          </Text>
        </Pressable>
      </View>
      {inactiveMessage ? (
        <View style={styles.disabledRow}>
          <Text style={styles.disabled}>{inactiveMessage}</Text>
          {disabled && onExitSampleMode ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Exit Sample mode to compute timeframe bias"
              onPress={onExitSampleMode}
              style={({ pressed }) => [styles.exitSample, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={styles.exitSampleText}>Exit Sample</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <Text style={styles.columns}>
        <Text style={styles.frameHeading}>TIMEFRAME</Text>
        <Text style={styles.biasHeading}>BULLISH / BEARISH</Text>
      </Text>
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void runRefresh()}
            tintColor={C.lime}
          />
        }
      >
        {TIMEFRAME_BIAS_TIMEFRAMES.map((timeframe) => {
          const row = result?.rows.find(
            (candidate) => candidate.timeframe === timeframe,
          );
          const visual = !active
            ? disabledVisual(disabled)
            : row
              ? VISUALS[row.status]
              : waitingRow(timeframe);
          return (
            <View key={timeframe} style={styles.row}>
              <Text style={styles.timeframe}>{timeframe}</Text>
              <Text
                style={[styles.signal, { color: visual.color }]}
                numberOfLines={1}
              >
                {visual.arrow} {visual.label}
              </Text>
            </View>
          );
        })}
        {query.isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={C.lime} size="small" />
            <Text style={styles.loadingText}>
              Reading completed source bars…
            </Text>
          </View>
        ) : null}
      </ScrollView>
      {query.error ? (
        <Text style={styles.error}>
          {query.error.message || "Timeframe-bias data could not be read."}
        </Text>
      ) : null}
      <Disclosure
        key={market}
        title="Bias details & provenance"
        summary="Definition, exact candle source, timestamps and warnings"
      >
        <Text style={styles.detail}>
          {result?.definition ?? "Waiting for completed candle evidence."}
        </Text>
        {result ? (
          result.rows.map((row) => <Provenance key={row.timeframe} row={row} />)
        ) : (
          <Text style={styles.detail}>
            {inactiveMessage ||
              "No prior-market result is shown while this market loads."}
          </Text>
        )}
        <Text style={styles.caveat}>
          Educational completed-bar classification only; it is not a forecast,
          recommendation, broker instruction, or paper-order action.
        </Text>
      </Disclosure>
    </Card>
  );
}

function Provenance({ row }: { row: TimeframeBiasRow }) {
  const visual = VISUALS[row.status];
  return (
    <View style={styles.provenance}>
      <Text style={[styles.provenanceTitle, { color: visual.color }]}>
        {row.timeframe} · {visual.arrow} {visual.label}
      </Text>
      <Text style={styles.detail}>Provider: {row.provider}</Text>
      <Text style={styles.detail}>Source: {row.source}</Text>
      <Text style={styles.detail}>As of: {dateTime(row.asOf)}</Text>
      <Text style={styles.detail}>
        Latest completed bar: {dateTime(row.latestClosedBar, true)} ·{" "}
        {row.completedBars} eligible bars
      </Text>
      <Text style={styles.detail}>{freshnessPolicyLabel(row.timeframe)}</Text>
      {row.values ? (
        <Text style={styles.detail}>
          Close {row.values.close.toPrecision(7)} · EMA20{" "}
          {row.values.ema20.toPrecision(7)} · EMA50{" "}
          {row.values.ema50.toPrecision(7)} · EMA20−5{" "}
          {row.values.ema20FiveBarsAgo.toPrecision(7)}
        </Text>
      ) : null}
      {row.warnings.map((warning) => (
        <Text key={warning} style={styles.warning}>
          Warning: {warning}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 9 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  titleGroup: { flex: 1, gap: 2 },
  subtitle: { color: C.muted, fontSize: 10 },
  refresh: {
    minHeight: 34,
    paddingHorizontal: 9,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface2,
  },
  refreshText: { color: C.text, fontFamily: mono, fontSize: 10 },
  columns: {
    flexDirection: "row",
    color: C.muted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.55,
  },
  frameHeading: { width: "34%", color: C.muted },
  biasHeading: { flex: 1, color: C.muted },
  list: { maxHeight: 245 },
  listContent: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  row: {
    minHeight: 31,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  timeframe: {
    width: "34%",
    color: C.price,
    fontFamily: mono,
    fontSize: 12,
    fontWeight: "800",
  },
  signal: { flex: 1, fontSize: 12, fontWeight: "800" },
  loading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingTop: 8,
  },
  loadingText: { color: C.muted, fontSize: 10 },
  error: { color: C.rose, fontSize: 10, lineHeight: 14 },
  disabledRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  disabled: { color: C.amber, fontSize: 10, lineHeight: 15 },
  exitSample: {
    borderWidth: 1,
    borderColor: C.amber + "88",
    backgroundColor: C.amber + "18",
    borderRadius: 3,
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  exitSampleText: { color: C.amber, fontSize: 9, fontFamily: mono, fontWeight: "800" },
  detail: { color: C.muted, fontSize: 10, lineHeight: 15 },
  provenance: {
    gap: 2,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  provenanceTitle: { fontSize: 11, fontWeight: "900" },
  warning: { color: C.amber, fontSize: 10, lineHeight: 15 },
  caveat: { color: C.muted, fontSize: 9, lineHeight: 14, paddingTop: 2 },
});
