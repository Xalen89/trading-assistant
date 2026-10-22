import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Strategy } from "@/lib/trading/model";
import type {
  SetupAnalysis,
  SetupStep,
  SetupZone,
} from "@/lib/trading/setup-model";
import { Card, Pill, SectionLabel } from "./ui";
import { C, formatPrice, mono } from "./theme";

type SetupPanelProps = {
  strategies: Strategy[];
  selectedIds: string[];
  combination: "all" | "any";
  analysis?: SetupAnalysis;
  loading?: boolean;
  error?: string;
  sampleMode?: boolean;
  precision: number;
  onSelectedIdsChange: (ids: string[]) => void;
  onCombinationChange: (value: "all" | "any") => void;
};

const statusTone = (status: SetupStep["status"]) =>
  status === "met"
    ? "mint"
    : status === "failed"
      ? "rose"
      : status === "waiting"
        ? "amber"
        : "muted";
const statusLabel = (status: SetupStep["status"]) =>
  status === "met"
    ? "MET"
    : status === "failed"
      ? "FAILED"
      : status === "waiting"
        ? "WAITING"
        : "UNKNOWN";
const zoneLabel = (zone: SetupZone) =>
  `${zone.kind === "ob" ? "OB" : zone.kind.toUpperCase()} · ${zone.label}`;

export function SetupPanel({
  strategies,
  selectedIds,
  combination,
  analysis,
  loading,
  error,
  sampleMode,
  precision,
  onSelectedIdsChange,
  onCombinationChange,
}: SetupPanelProps) {
  const selectable = strategies.filter((strategy) => !strategy.archived);
  const toggle = (id: string) => {
    if (selectedIds.includes(id))
      return onSelectedIdsChange(selectedIds.filter((value) => value !== id));
    if (selectedIds.length >= 3) return;
    onSelectedIdsChange([...selectedIds, id]);
  };
  const automatic = analysis?.confluences ?? [];
  const met = automatic.filter((step) => step.status === "met").length;
  const candidates = analysis?.candidates ?? [];
  const historical = analysis?.estimate;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <SectionLabel>Automatic setup sequence</SectionLabel>
          <Text style={styles.title}>Closed-bar setup evidence</Text>
          <Text style={styles.detail}>
            Select up to three rulebooks for automatic supported-model analysis.
            Chart visibility stays independent.
          </Text>
        </View>
        <Pill
          label={
            analysis
              ? `${met}/${automatic.length} MET`
              : loading
                ? "CHECKING"
                : "NO ANALYSIS"
          }
          tone={analysis ? (met ? "mint" : "amber") : "muted"}
        />
      </View>
      <View style={styles.selector}>
        {selectable.map((strategy) => {
          const selected = selectedIds.includes(strategy.id);
          return (
            <Pressable
              key={strategy.id}
              accessibilityRole="checkbox"
              accessibilityState={{
                checked: selected,
                disabled: !selected && selectedIds.length >= 3,
              }}
              onPress={() => toggle(strategy.id)}
              style={[
                styles.strategy,
                selected && {
                  borderColor: strategy.color,
                  backgroundColor: strategy.color + "16",
                },
                !selected && selectedIds.length >= 3 && styles.disabled,
              ]}
            >
              <View style={[styles.dot, { backgroundColor: strategy.color }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.strategyName} numberOfLines={1}>
                  {strategy.name}
                </Text>
                <Text style={styles.strategyMeta}>
                  v{strategy.version} ·{" "}
                  {strategy.kind === "reference" ? "source" : strategy.kind}
                </Text>
              </View>
              <Text
                style={[
                  styles.checked,
                  { color: selected ? strategy.color : C.muted },
                ]}
              >
                {selected ? "✓" : "+"}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.combination}>
        <Text style={styles.comboLabel}>Combination</Text>
        {(["all", "any"] as const).map((value) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            onPress={() => onCombinationChange(value)}
            style={[styles.combo, combination === value && styles.comboActive]}
          >
            <Text
              style={[
                styles.comboText,
                combination === value && styles.comboTextActive,
              ]}
            >
              {value === "all"
                ? "AND · all must align"
                : "OR · any supported model"}
            </Text>
          </Pressable>
        ))}
      </View>
      {combination === "all" && selectedIds.length > 1 ? (
        <Text style={styles.warning}>
          Combining filters does not guarantee a higher win rate. Unsupported or
          conflicting rules remain visible instead of being silently passed.
        </Text>
      ) : null}
      {sampleMode ? (
        <Text style={styles.warning}>
          Automatic setup analysis is disabled in Sample mode. Demo bars never
          create evidence or a scenario.
        </Text>
      ) : null}
      {!sampleMode && loading ? (
        <Text style={styles.detail}>
          Checking completed provider bars and supported setup definitions…
        </Text>
      ) : null}
      {!sampleMode && error ? (
        <Text style={styles.warning}>
          ErrorNoHistory / setup unavailable: {error}
        </Text>
      ) : null}
      {!sampleMode && analysis ? (
        <>
          <Text style={styles.provenance}>
            {analysis.source} · as of{" "}
            {new Date(analysis.asOf * 1000).toLocaleString()} ·{" "}
            {analysis.combination === "all" ? "AND" : "OR"} selection
          </Text>
          {analysis.messages.map((message, index) => (
            <Text key={`${message}-${index}`} style={styles.message}>
              • {message}
            </Text>
          ))}
          <View style={styles.counts}>
            <Text style={styles.countText}>
              Automatic confluences: {met} met ·{" "}
              {automatic.filter((step) => step.status === "waiting").length}{" "}
              waiting ·{" "}
              {automatic.filter((step) => step.status === "unknown").length}{" "}
              unknown
            </Text>
            <Text style={styles.countText}>
              Manual confluence is recorded separately below.
            </Text>
          </View>
          {candidates.length ? (
            <View style={styles.candidates}>
              {candidates.map((candidate) => (
                <View key={candidate.id} style={styles.candidate}>
                  <View style={styles.candidateHead}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.candidateTitle}>
                        {candidate.name}
                      </Text>
                      <Text style={styles.candidateMeta}>
                        {candidate.side.toUpperCase()} ·{" "}
                        {candidate.ready
                          ? "READY TO REVIEW"
                          : "SEQUENCE INCOMPLETE"}{" "}
                        · {candidate.source}
                      </Text>
                    </View>
                    <Pill
                      label={candidate.ready ? "READY" : "WATCH"}
                      tone={candidate.ready ? "mint" : "amber"}
                    />
                  </View>
                  <View style={styles.steps}>
                    {candidate.steps.map((step) => (
                      <View key={step.id} style={styles.step}>
                        <Pill
                          label={statusLabel(step.status)}
                          tone={statusTone(step.status)}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.stepName}>{step.name}</Text>
                          <Text style={styles.stepEvidence}>
                            {step.evidence}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                  {candidate.zones.length ? (
                    <View style={styles.zoneList}>
                      {candidate.zones.map((zone) => (
                        <Text key={zone.id} style={styles.zone}>
                          {zoneLabel(zone)} · {formatPrice(zone.low, precision)}
                          –{formatPrice(zone.high, precision)}
                          {zone.ce !== undefined
                            ? ` · CE ${formatPrice(zone.ce, precision)}`
                            : ""}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.detail}>
              No supported candidate is ready. Missing or unknown evidence is
              not counted as a pass.
            </Text>
          )}
          <View style={styles.history}>
            <Text style={styles.historyTitle}>Historical outcome profile</Text>
            {historical && historical.rate !== null ? (
              <>
                <Text style={styles.historyRate}>
                  {(historical.rate * 100).toFixed(1)}% target-before-stop
                </Text>
                <Text style={styles.detail}>
                  {historical.wins} wins / {historical.losses} losses ·{" "}
                  {historical.samples} eligible cases · horizon{" "}
                  {historical.horizon} bars
                </Text>
                {historical.interval ? (
                  <Text style={styles.provenance}>
                    Interval {(historical.interval[0] * 100).toFixed(1)}–
                    {(historical.interval[1] * 100).toFixed(1)}% ·{" "}
                    {historical.costs}
                  </Text>
                ) : null}
              </>
            ) : (
              <Text style={styles.detail}>
                Insufficient eligible completed history. No percentage is shown.
              </Text>
            )}
            <Text style={styles.provenance}>
              Historical TP-before-SL evidence is not calibrated future
              probability and is not a guarantee.
            </Text>
          </View>
          {analysis.rhythm ? (
            <Text style={styles.provenance}>
              Rhythm · {analysis.rhythm.bars} bars · volatility{" "}
              {analysis.rhythm.volatility.toFixed(3)} · autocorrelation{" "}
              {analysis.rhythm.autocorrelation.toFixed(3)} · momentum{" "}
              {analysis.rhythm.momentum.toFixed(2)}%
            </Text>
          ) : (
            <Text style={styles.provenance}>
              Rhythm unavailable: insufficient completed bars.
            </Text>
          )}
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 11 },
  header: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  title: { color: C.text, fontSize: 15, fontWeight: "900", marginTop: 2 },
  detail: { color: C.muted, fontSize: 11, lineHeight: 16 },
  selector: { gap: 6 },
  strategy: {
    minHeight: 45,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.black + "66",
    borderRadius: 10,
    paddingHorizontal: 10,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  disabled: { opacity: 0.45 },
  dot: { width: 8, height: 8, borderRadius: 99 },
  strategyName: { color: C.text, fontSize: 12, fontWeight: "800" },
  strategyMeta: { color: C.muted, fontSize: 9, marginTop: 1 },
  checked: { fontFamily: mono, fontSize: 16, fontWeight: "900" },
  combination: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  comboLabel: {
    color: C.muted,
    fontSize: 10,
    fontWeight: "800",
    marginRight: 2,
  },
  combo: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: C.surface2,
  },
  comboActive: { borderColor: C.lime, backgroundColor: C.lime + "1A" },
  comboText: { color: C.muted, fontSize: 9, fontWeight: "800" },
  comboTextActive: { color: C.lime },
  warning: { color: C.amber, fontSize: 10, lineHeight: 15 },
  provenance: { color: C.muted, fontSize: 9, lineHeight: 14 },
  message: { color: C.muted, fontSize: 10, lineHeight: 14 },
  counts: {
    padding: 8,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 9,
    gap: 2,
    backgroundColor: C.black + "44",
  },
  countText: { color: C.text, fontSize: 10, lineHeight: 14 },
  candidates: { gap: 8 },
  candidate: {
    padding: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    gap: 8,
  },
  candidateHead: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  candidateTitle: { color: C.text, fontSize: 12, fontWeight: "900" },
  candidateMeta: { color: C.muted, fontSize: 9, marginTop: 2 },
  steps: { gap: 6 },
  step: { flexDirection: "row", gap: 7, alignItems: "flex-start" },
  stepName: { color: C.text, fontSize: 11, fontWeight: "700", lineHeight: 14 },
  stepEvidence: { color: C.muted, fontSize: 10, lineHeight: 14 },
  zoneList: {
    gap: 3,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 7,
  },
  zone: { color: C.blue, fontFamily: mono, fontSize: 9, lineHeight: 13 },
  history: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 9,
    gap: 3,
  },
  historyTitle: { color: C.text, fontSize: 12, fontWeight: "900" },
  historyRate: {
    color: C.mint,
    fontFamily: mono,
    fontSize: 19,
    fontWeight: "900",
  },
});
