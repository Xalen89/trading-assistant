import { StyleSheet, Text, View } from "react-native";
import type { IndicatorSnapshot } from "@/lib/trading/indicators";
import { attachedIndicatorNames } from "@/lib/trading/strategy-indicators";
import { Card, SectionLabel } from "./ui";
import type { IndicatorLayers } from "./candle-chart";
import { C, formatPrice, mono } from "./theme";

type IndicatorCardProps = {
  snapshot?: IndicatorSnapshot;
  precision: number;
  layers: IndicatorLayers;
};

const isFiniteNumber = (value: number | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);
const metric = (value: number | undefined, precision: number) =>
  formatPrice(value, precision);
const asOfLabel = (time: number | undefined) =>
  isFiniteNumber(time)
    ? new Date(time * 1000).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Not supplied";

export function IndicatorCard({
  snapshot,
  precision,
  layers,
}: IndicatorCardProps) {
  const latest = snapshot?.points.at(-1);
  const showEma20 = layers.ema && layers.ema20 !== false;
  const showEma50 = layers.ema && layers.ema50 !== false;
  const showSma20 = layers.sma && layers.sma20 !== false;
  const showSma50 = layers.sma && layers.sma50 !== false;
  const attached = attachedIndicatorNames(layers);
  const missing = snapshot
    ? [
        showEma20 && !isFiniteNumber(latest?.ema20)
          ? "EMA20 needs enough closed bars; absent warm-up values are not zero."
          : undefined,
        showEma50 && !isFiniteNumber(latest?.ema50)
          ? "EMA50 needs enough closed bars; absent warm-up values are not zero."
          : undefined,
        showSma20 && !isFiniteNumber(latest?.sma20)
          ? "SMA20 needs enough closed bars; absent warm-up values are not zero."
          : undefined,
        showSma50 && !isFiniteNumber(latest?.sma50)
          ? "SMA50 needs enough closed bars; absent warm-up values are not zero."
          : undefined,
        layers.bands &&
        (!isFiniteNumber(latest?.bbUpper) || !isFiniteNumber(latest?.bbLower))
          ? "Bollinger20 needs enough closed bars; absent warm-up values are not zero."
          : undefined,
        layers.donchian &&
        (!isFiniteNumber(latest?.donchianUpper) ||
          !isFiniteNumber(latest?.donchianLower))
          ? "Prior Donchian20 needs 20 preceding closed bars; absent values are not zero."
          : undefined,
        layers.trail && !isFiniteNumber(latest?.trail2Atr)
          ? "The 2× ATR guide needs ATR14 from closed bars; it is not a managed paper stop."
          : undefined,
        layers.rsi && !isFiniteNumber(latest?.rsi14)
          ? "RSI14 needs enough closed bars; absent warm-up values are not zero."
          : undefined,
        layers.macd &&
        (!isFiniteNumber(latest?.macd) ||
          !isFiniteNumber(latest?.macdSignal) ||
          !isFiniteNumber(latest?.macdHistogram))
          ? "MACD12/26/9 needs enough closed bars; absent warm-up values are not zero."
          : undefined,
      ].filter((message): message is string => Boolean(message))
    : attached.length
      ? [
          "No closed-bar indicator snapshot was supplied for the attached tools.",
        ]
      : [];
  const relevantMessages = (snapshot?.messages ?? []).filter((message) => {
    const text = message.toLowerCase();
    if (/rvol|volume/.test(text)) return false;
    return (
      (/(ema|slope)/.test(text) && (showEma20 || showEma50)) ||
      (/sma/.test(text) && (showSma20 || showSma50)) ||
      (/bollinger|bb20/.test(text) && layers.bands) ||
      (/donchian/.test(text) && layers.donchian) ||
      (/atr/.test(text) && layers.trail) ||
      (/rsi/.test(text) && layers.rsi) ||
      (/macd/.test(text) && layers.macd)
    );
  });

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <View style={styles.headingCopy}>
          <SectionLabel>Closed-bar indicators</SectionLabel>
          <Text style={styles.caption}>
            Strategy-attached evidence only · overlays do not place or manage
            paper stops
          </Text>
        </View>
        <Text style={styles.timeframe}>{snapshot?.timeframe ?? "—"}</Text>
      </View>

      <View style={styles.attached}>
        <Text style={styles.attachedLabel}>ATTACHED TO SELECTED STRATEGY</Text>
        <Text style={styles.attachedValue}>
          {attached.length
            ? attached.join(" · ")
            : "No indicator layers attached"}
        </Text>
      </View>

      <View style={styles.metrics}>
        {showEma20 ? (
          <Metric
            label="EMA 20"
            value={metric(latest?.ema20, precision)}
            tone={C.blue}
          />
        ) : null}
        {showEma50 ? (
          <Metric
            label="EMA 50"
            value={metric(latest?.ema50, precision)}
            tone={C.amber}
          />
        ) : null}
        {showSma20 ? (
          <Metric
            label="SMA 20"
            value={metric(latest?.sma20, precision)}
            tone={C.lime}
          />
        ) : null}
        {showSma50 ? (
          <Metric
            label="SMA 50"
            value={metric(latest?.sma50, precision)}
            tone={C.rose}
          />
        ) : null}
        {layers.bands ? (
          <Metric
            label="BB20 U / M / L"
            value={
              latest
                ? `${metric(latest.bbUpper, precision)} / ${metric(latest.bbMid, precision)} / ${metric(latest.bbLower, precision)}`
                : "—"
            }
            wide
          />
        ) : null}
        {layers.donchian ? (
          <Metric
            label="PRIOR DONCHIAN20 U / L"
            value={`${metric(latest?.donchianUpper, precision)} / ${metric(latest?.donchianLower, precision)}`}
            wide
          />
        ) : null}
        {layers.trail ? (
          <Metric
            label="ATR14 / 2× GUIDE"
            value={`${metric(latest?.atr14, precision)} / ${metric(latest?.trail2Atr, precision)}`}
            wide
          />
        ) : null}
        {layers.rsi ? (
          <Metric
            label="RSI 14"
            value={
              isFiniteNumber(latest?.rsi14) ? latest.rsi14.toFixed(1) : "—"
            }
            tone={C.lime}
          />
        ) : null}
        {layers.macd ? (
          <Metric
            label="MACD / SIGNAL / HIST"
            value={`${metric(latest?.macd, precision + 2)} / ${metric(latest?.macdSignal, precision + 2)} / ${metric(latest?.macdHistogram, precision + 2)}`}
            wide
          />
        ) : null}
      </View>

      <View style={styles.provenance}>
        <Text style={styles.provenanceLabel}>SOURCE</Text>
        <Text style={styles.provenanceValue}>
          {snapshot?.source ?? "Not supplied"}
        </Text>
        <Text style={styles.provenanceLabel}>AS OF</Text>
        <Text style={styles.provenanceValue}>{asOfLabel(snapshot?.asOf)}</Text>
        <Text style={styles.provenanceLabel}>CLOSED BARS</Text>
        <Text style={styles.provenanceValue}>
          {snapshot?.points.length ?? 0}
        </Text>
      </View>

      <View style={styles.warning}>
        <Text style={styles.warningTitle}>CONTEXT & LIMITATIONS</Text>
        {layers.range10 ? (
          <Text style={styles.warningText}>
            Prior 10-bar range is derived on-chart from the displayed actual
            OHLC bars, excluding the current bar.
          </Text>
        ) : null}
        {relevantMessages.map((message, index) => (
          <Text key={`${message}-${index}`} style={styles.warningText}>
            • {message}
          </Text>
        ))}
        {missing.map((message, index) => (
          <Text key={`${message}-${index}`} style={styles.warningText}>
            • {message}
          </Text>
        ))}
      </View>

      <View style={styles.formula}>
        <Text style={styles.formulaLabel}>FORMULAS</Text>
        <Text style={styles.formulaText}>
          {snapshot?.formulas ?? "Not supplied."}
        </Text>
      </View>
    </Card>
  );
}

function Metric({
  label,
  value,
  tone = C.text,
  wide = false,
}: {
  label: string;
  value: string;
  tone?: string;
  wide?: boolean;
}) {
  return (
    <View style={[styles.metric, wide && styles.metricWide]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color: tone }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 11 },
  head: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  headingCopy: { flex: 1, gap: 3 },
  caption: { color: C.muted, fontSize: 11, lineHeight: 15 },
  attached: {
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 8,
    gap: 3,
  },
  attachedLabel: {
    color: C.lime,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.65,
  },
  attachedValue: {
    color: C.text,
    fontFamily: mono,
    fontSize: 10,
    lineHeight: 15,
  },
  timeframe: {
    color: C.lime,
    fontFamily: mono,
    fontSize: 11,
    fontWeight: "800",
    borderWidth: 1,
    borderColor: C.lime + "55",
    backgroundColor: C.lime + "13",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 4,
    textTransform: "uppercase",
  },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  metric: {
    minWidth: "31%",
    flexGrow: 1,
    backgroundColor: C.black + "55",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 9,
    paddingHorizontal: 8,
    paddingVertical: 7,
    gap: 2,
  },
  metricWide: { minWidth: "48%" },
  metricLabel: {
    color: C.muted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.45,
    textTransform: "uppercase",
  },
  metricValue: { fontFamily: mono, fontSize: 11, fontWeight: "700" },
  provenance: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    paddingVertical: 8,
    gap: 3,
  },
  provenanceLabel: {
    color: C.muted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.65,
  },
  provenanceValue: {
    color: C.text,
    fontFamily: mono,
    fontSize: 10,
    lineHeight: 15,
  },
  warning: {
    backgroundColor: C.amber + "10",
    borderWidth: 1,
    borderColor: C.amber + "44",
    borderRadius: 9,
    padding: 9,
    gap: 4,
  },
  warningTitle: {
    color: C.amber,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.75,
  },
  warningText: { color: C.muted, fontSize: 10, lineHeight: 14 },
  formula: { gap: 3 },
  formulaLabel: {
    color: C.muted,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.75,
  },
  formulaText: {
    color: C.muted,
    fontSize: 10,
    lineHeight: 15,
    fontFamily: mono,
  },
});
