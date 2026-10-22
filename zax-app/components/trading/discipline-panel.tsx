import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { trpc } from "@/lib/trpc";
import { useWorkspace } from "@/hooks/use-workspace";
import { selectDisciplineGuards } from "@/lib/trading/discipline-policy";
import {
  evaluateDiscipline,
  type DisciplineFlag,
} from "@/lib/trading/trading-discipline";
import type { Trade } from "@/lib/trading/model";
import { ActionButton, Card, Pill, SectionLabel } from "./ui";
import { C, mono } from "./theme";

export type DisciplinePanelProps = {
  /** Pass an already-canonical list when the parent has one; no local fallback is written. */
  trades?: Trade[];
  proposedRisk?: number;
  market?: string;
  side?: "long" | "short";
  compact?: boolean;
};

const EMPTY_TRADES: Trade[] = [];
const COACH_QUESTION =
  "I want to reflect on a recent paper-trading outcome. Please help me slow down, distinguish recorded evidence from intent, and review my written rules without assuming a trade should be taken.";

function tone(flag: DisciplineFlag): "amber" | "rose" | "muted" {
  return flag.severity === "block"
    ? "rose"
    : flag.severity === "warning"
      ? "amber"
      : "muted";
}

function pauseLabel(remainingMs: number) {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function calmVerdict(
  ready: boolean,
  loading: boolean,
  unavailable: boolean,
  hasActivePause: boolean,
  hasEnforcedBlock: boolean,
) {
  if (loading)
    return "Loading the canonical paper record. No history-based coaching conclusion is shown yet.";
  if (unavailable)
    return "Canonical paper history is unavailable, so this panel is offering prompts rather than a history-based conclusion.";
  if (hasEnforcedBlock)
    return "An enabled paper-order guard matches an observable recorded condition. The matching guard is enforced; other coaching observations remain advisory.";
  if (hasActivePause)
    return "A recent recorded loss is inside the suggested reflection window. Take a brief pause, then decide from the written setup—not urgency.";
  if (!ready)
    return "A coaching signal asks for a brief review before the next plan. It is not a diagnosis, prediction, or execution restriction.";
  return "No active coaching warning is present in the available closed-paper record. This is a reflection check, not approval for a strategy or trade.";
}

/**
 * Display-only coaching. When `trades` is omitted, this reads the owner-gated
 * canonical paper.working endpoint; it never mutates a workspace, paper record,
 * permissions, or server cooldown setting.
 */
export function DisciplinePanel({
  trades,
  proposedRisk,
  market,
  side,
  compact = false,
}: DisciplinePanelProps) {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const working = trpc.paper.working.useQuery(undefined, {
    enabled: trades === undefined,
    retry: false,
    refetchInterval: trades === undefined ? 15_000 : false,
  });
  const canonicalTrades = trades ?? working.data ?? EMPTY_TRADES;
  const [now, setNow] = useState(() => Date.now());
  const [evidenceOpen, setEvidenceOpen] = useState(!compact);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const tick = setTimeout(() => setNow(Date.now()), 0);
    return () => clearTimeout(tick);
  }, [trades, working.data, proposedRisk, market, side]);

  // Match the canonical paper service's saved-workspace fallback semantics.
  const cooldownMinutes = workspace.settings.cooldownMinutes || 20;
  const maxTradesPerDay = workspace.settings.maxTradesPerDay || 6;
  const report = useMemo(
    () =>
      evaluateDiscipline(canonicalTrades, {
        now,
        proposedRisk,
        market,
        side,
        cooldownMinutes,
        maxTradesPerDay,
      }),
    [
      canonicalTrades,
      cooldownMinutes,
      market,
      maxTradesPerDay,
      now,
      proposedRisk,
      side,
    ],
  );
  const activePause =
    report.cooldownUntil !== undefined && report.cooldownUntil > now;
  const guardSelection = selectDisciplineGuards(workspace.settings, report.flags);
  const enforcedFlagIds = new Set(
    guardSelection.blocks.map((block) => block.flag.id),
  );

  useEffect(() => {
    if (!activePause) return;
    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, [activePause, report.cooldownUntil]);

  const unavailable = trades === undefined && Boolean(working.error);
  const loading = trades === undefined && working.isLoading;
  const badge = loading
    ? { label: "LOADING", tone: "amber" as const }
    : unavailable
      ? { label: "UNAVAILABLE", tone: "rose" as const }
      : guardSelection.blocks.length
        ? { label: "ENFORCED", tone: "rose" as const }
        : report.ready
          ? { label: "REFLECT", tone: "mint" as const }
          : { label: "PAUSE & REVIEW", tone: "amber" as const };
  const verdict = calmVerdict(
    report.ready,
    loading,
    unavailable,
    activePause,
    guardSelection.blocks.length > 0,
  );
  const guardStatus =
    loading || unavailable
      ? "Guard status is unavailable until the canonical paper record is available."
      : guardSelection.blocks.length
        ? `ENFORCED PAPER GUARD · ${guardSelection.blocks.map((block) => block.title).join(" · ")}. This condition is based on observable canonical records, not an inference about emotion or intent.`
        : guardSelection.enabled.length
          ? `ENFORCED GUARDS ARMED · ${guardSelection.enabled.length} optional guard${guardSelection.enabled.length === 1 ? "" : "s"} enabled; no matching current canonical condition is blocking this paper plan. ${guardSelection.actualFlags.length ? "Other current discipline findings are advisory." : "No matching guard condition is active."}`
          : "ADVISORY ONLY · No discipline guard is enabled. Findings below are coaching prompts and do not block a paper order.";
  const selectedCount = report.requiredThoughts.filter(
    (thought) => checked[thought],
  ).length;

  const openCoach = () => {
    router.push({
      pathname: "/coach",
      params: { initialQuestion: COACH_QUESTION },
    });
  };

  return (
    <Card style={[styles.card, compact && styles.compactCard]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <SectionLabel>Discipline check · education</SectionLabel>
          <Text style={styles.title}>Pause before the next paper plan</Text>
        </View>
        <Pill label={badge.label} tone={badge.tone} />
      </View>

      <Text style={styles.verdict}>{verdict}</Text>
      <Text style={styles.provenance}>
        UTC closed-paper review · {report.counts.todayTrades} closed today ·{" "}
        {report.counts.consecutiveLosses} trailing recorded loss
        {report.counts.consecutiveLosses === 1 ? "" : "es"}
      </Text>
      <Text
        style={[
          styles.guardStatus,
          guardSelection.blocks.length > 0 && styles.guardStatusEnforced,
        ]}
        accessibilityLiveRegion="polite"
      >
        {guardStatus}
      </Text>

      {activePause && report.cooldownUntil !== undefined ? (
        <View
          style={[
            styles.pauseBox,
            enforcedFlagIds.has("rapid-reentry-after-loss") &&
              styles.pauseBoxEnforced,
          ]}
          accessibilityLiveRegion="polite"
        >
          <Text
            style={[
              styles.pauseTitle,
              enforcedFlagIds.has("rapid-reentry-after-loss") &&
                styles.pauseTitleEnforced,
            ]}
          >
            {enforcedFlagIds.has("rapid-reentry-after-loss")
              ? "Enforced cooldown remaining"
              : "Suggested pause remaining"}
          </Text>
          <Text style={styles.countdown}>
            {pauseLabel(report.cooldownUntil - now)}
          </Text>
          <Text style={styles.pauseDetail}>
            {enforcedFlagIds.has("rapid-reentry-after-loss")
              ? "This active cooldown is enforced for new paper orders. It is based on recorded close time and does not infer intent, readiness, or emotion."
              : "Put the plan down briefly, state the setup and invalidation in neutral terms, then choose whether waiting is wiser. This timer is advisory and does not restrict any order or account action."}
          </Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: evidenceOpen }}
        onPress={() => setEvidenceOpen((open) => !open)}
        style={({ pressed }) => [
          styles.evidenceToggle,
          { opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Text style={styles.evidenceToggleText}>
          {evidenceOpen ? "Hide" : "Show"} coaching evidence (
          {report.flags.length})
        </Text>
        <Text style={styles.evidenceToggleMark}>
          {evidenceOpen ? "−" : "+"}
        </Text>
      </Pressable>
      {evidenceOpen ? (
        <View style={styles.evidenceList}>
          {report.flags.length ? (
            report.flags.map((flag) => {
              const enforced = enforcedFlagIds.has(flag.id);
              return (
                <View key={flag.id} style={styles.flag}>
                  <Pill
                    label={
                      enforced
                        ? "ENFORCED"
                        : flag.severity === "warning"
                          ? "ADVISORY"
                          : flag.severity.toUpperCase()
                    }
                    tone={enforced ? "rose" : tone(flag)}
                  />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={styles.flagTitle}>{flag.title}</Text>
                    {flag.evidence.map((item, index) => (
                      <Text key={`${flag.id}:${index}`} style={styles.evidence}>
                        • {item}
                      </Text>
                    ))}
                    <Text style={styles.action}>Next: {flag.action}</Text>
                  </View>
                </View>
              );
            })
          ) : (
            <Text style={styles.evidence}>
              No warning conditions are present in the eligible canonical closed
              records. Empty history is not evidence about future outcomes.
            </Text>
          )}
        </View>
      ) : null}

      <View style={styles.checkHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.subhead}>Pre-trade thought prompts</Text>
          <Text style={styles.note}>
            Local reflection only · {selectedCount}/
            {report.requiredThoughts.length} noted. Checking an item does not
            approve a strategy, size, or paper order.
          </Text>
        </View>
      </View>
      <View style={styles.checklist}>
        {report.requiredThoughts.map((thought) => {
          const isChecked = Boolean(checked[thought]);
          return (
            <Pressable
              key={thought}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isChecked }}
              onPress={() =>
                setChecked((previous) => ({
                  ...previous,
                  [thought]: !previous[thought],
                }))
              }
              style={({ pressed }) => [
                styles.checkRow,
                isChecked && styles.checkRowChecked,
                { opacity: pressed ? 0.72 : 1 },
              ]}
            >
              <View style={[styles.box, isChecked && styles.boxChecked]}>
                <Text style={styles.boxMark}>{isChecked ? "✓" : ""}</Text>
              </View>
              <Text style={styles.checkText}>{thought}</Text>
            </Pressable>
          );
        })}
      </View>

      {!compact ? (
        <View style={styles.glossary}>
          <Text style={styles.subhead}>Small glossary</Text>
          <Text style={styles.glossaryText}>
            <Text style={styles.glossaryTerm}>Risk</Text> is the planned maximum
            loss to the invalidation, not a forecast. {"\n"}
            <Text style={styles.glossaryTerm}>Rule</Text> is a condition written
            before the result, so it can be reviewed consistently. {"\n"}
            <Text style={styles.glossaryTerm}>Emotional pause</Text> is a short
            break to notice urgency and return to observable evidence; it makes
            no therapeutic, profit, or performance claim.
          </Text>
        </View>
      ) : null}

      <ActionButton
        compact
        kind="secondary"
        icon="chatbubble-ellipses-outline"
        label="Reflect with coach"
        onPress={openCoach}
      />
      <Text style={styles.footer}>
        Education for paper-trading reflection only. The panel reports recorded
        facts and unknowns; it does not infer intent, provide financial advice,
        or promise an outcome.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  compactCard: { paddingVertical: 9 },
  header: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  title: { color: C.text, fontSize: 16, fontWeight: "800", marginTop: 2 },
  verdict: { color: C.text, fontSize: 13, lineHeight: 19 },
  provenance: {
    color: C.muted,
    fontFamily: mono,
    fontSize: 10,
    lineHeight: 15,
  },
  pauseBox: {
    borderColor: C.amber + "77",
    borderWidth: 1,
    backgroundColor: C.amber + "10",
    borderRadius: 4,
    padding: 10,
    gap: 3,
  },
  pauseTitle: { color: C.amber, fontWeight: "800", fontSize: 11 },
  pauseBoxEnforced: {
    borderColor: C.rose + "77",
    backgroundColor: C.rose + "10",
  },
  pauseTitleEnforced: { color: C.rose },
  countdown: {
    color: C.text,
    fontFamily: mono,
    fontSize: 22,
    fontWeight: "800",
  },
  pauseDetail: { color: C.muted, fontSize: 11, lineHeight: 16 },
  guardStatus: {
    color: C.muted,
    fontSize: 10,
    lineHeight: 15,
    borderLeftWidth: 2,
    borderLeftColor: C.border,
    paddingLeft: 8,
  },
  guardStatusEnforced: { color: C.rose, borderLeftColor: C.rose },
  evidenceToggle: {
    minHeight: 34,
    paddingHorizontal: 9,
    borderWidth: 1,
    borderRadius: 4,
    borderColor: C.border,
    backgroundColor: C.surface2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  evidenceToggleText: { color: C.text, fontSize: 11, fontWeight: "700" },
  evidenceToggleMark: { color: C.muted, fontSize: 18, lineHeight: 20 },
  evidenceList: { gap: 8 },
  flag: {
    flexDirection: "row",
    gap: 8,
    borderLeftColor: C.border,
    borderLeftWidth: 2,
    paddingLeft: 8,
  },
  flagTitle: { color: C.text, fontSize: 12, fontWeight: "800" },
  evidence: { color: C.muted, fontSize: 10, lineHeight: 15 },
  action: { color: C.blue, fontSize: 10, lineHeight: 15, marginTop: 1 },
  checkHeader: { flexDirection: "row", alignItems: "flex-start" },
  subhead: { color: C.text, fontSize: 12, fontWeight: "800" },
  note: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: 3 },
  checklist: { gap: 6 },
  checkRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.black + "22",
    borderRadius: 4,
  },
  checkRowChecked: {
    borderColor: C.mint + "88",
    backgroundColor: C.mint + "0D",
  },
  box: {
    width: 17,
    height: 17,
    borderWidth: 1,
    borderColor: C.muted,
    borderRadius: 2,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  boxChecked: { borderColor: C.mint, backgroundColor: C.mint },
  boxMark: { color: C.black, fontSize: 12, fontWeight: "900", lineHeight: 14 },
  checkText: { flex: 1, color: C.text, fontSize: 11, lineHeight: 16 },
  glossary: {
    gap: 4,
    borderTopColor: C.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 9,
  },
  glossaryText: { color: C.muted, fontSize: 10, lineHeight: 16 },
  glossaryTerm: { color: C.text, fontWeight: "800" },
  footer: { color: C.muted, fontSize: 9, lineHeight: 13 },
});
