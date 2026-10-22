import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  draftConfluence,
  type ConfluenceRuleConfig,
} from "@/lib/trading/confluence-runtime";
import {
  validateConfluenceConfig,
  type ConfluenceCondition,
} from "@/lib/trading/confluence-contract";
import { normalizeConfluenceWeights } from "@/lib/trading/confluence-weights";
import type { Strategy } from "@/lib/trading/model";
import type {
  SetupAnalysis,
  SetupCandidate,
  SetupStep,
} from "@/lib/trading/setup-model";
import { C } from "./theme";
import { ActionButton, Divider, Input, Pill, SectionLabel, Sheet } from "./ui";

type StrategyWithConfluence = Strategy & { confluence?: ConfluenceRuleConfig };

type ConfluenceEditorProps = {
  strategy: Strategy;
  analysis?: SetupAnalysis;
  onSave: (config: ConfluenceRuleConfig) => void;
  onClose: () => void;
  visible: boolean;
};

function cloneConfig(config: ConfluenceRuleConfig): ConfluenceRuleConfig {
  return {
    contract: {
      ...config.contract,
      approval: { ...config.contract.approval },
      trigger: {
        ...config.contract.trigger,
        source: {
          ...config.contract.trigger.source,
          freshness: { ...config.contract.trigger.source.freshness },
        },
      },
      conditions: config.contract.conditions.map((condition) => ({
        ...condition,
        source: {
          ...condition.source,
          freshness: { ...condition.source.freshness },
        },
      })),
    },
    binding: {
      side: config.binding.side,
      triggerStepId: config.binding.triggerStepId,
      conditions: config.binding.conditions.map((item) => ({ ...item })),
    },
  };
}

function draftState(config: ConfluenceRuleConfig): ConfluenceRuleConfig {
  return {
    ...config,
    contract: {
      ...config.contract,
      approval: { status: "draft", approvedAt: null, approvedBy: null },
    },
  };
}

function conditionIdFor(stepId: string, used: Set<string>): string {
  const base = `native-${stepId}`;
  let id = base;
  let sequence = 2;
  while (used.has(id)) id = `${base}-${sequence++}`;
  return id;
}

function stepPredicate(step: SetupStep): string {
  return `Native closed-OHLC setup step ${step.id}: ${step.name}`;
}

function sourceFor(config: ConfluenceRuleConfig) {
  return {
    ...config.contract.trigger.source,
    freshness: { ...config.contract.trigger.source.freshness },
  };
}

/**
 * The editor obtains selectable IDs from draftConfluence rather than reusing
 * chart factor names.  That keeps source-frame, HTF, session, clock, news,
 * manual, and general prose steps out of the picker.
 */
function selectableSteps(
  strategy: Strategy,
  candidate: SetupCandidate | undefined,
  timeframe: SetupAnalysis["timeframe"] | undefined,
): SetupStep[] {
  if (!candidate || !timeframe) return [];
  const template = draftConfluence(strategy, candidate, timeframe);
  const allowed = new Set([
    template.binding.triggerStepId,
    ...template.binding.conditions.map((item) => item.stepId),
  ]);
  return candidate.steps.filter((step) => allowed.has(step.id));
}

function configErrors(
  config: ConfluenceRuleConfig | undefined,
  steps: readonly SetupStep[],
  candidate: SetupCandidate | undefined,
): string[] {
  if (!config) {
    return [
      candidate
        ? "This candidate has no supported native closed-OHLC trigger plus condition set."
        : "Run closed-bar setup analysis and select a same-version candidate before configuring confluence.",
    ];
  }
  const errors = [...validateConfluenceConfig(config.contract).issues];
  const validIds = new Set(steps.map((step) => step.id));
  if (!validIds.has(config.binding.triggerStepId)) {
    errors.push(
      "Choose an actual native closed-OHLC candidate step as the trigger.",
    );
  }
  if (config.contract.trigger.id !== config.binding.triggerStepId) {
    errors.push(
      "The selected trigger does not match the contract trigger binding.",
    );
  }
  const boundConditionIds = new Set<string>();
  const boundStepIds = new Set<string>();
  for (const binding of config.binding.conditions) {
    if (
      boundConditionIds.has(binding.conditionId) ||
      boundStepIds.has(binding.stepId)
    ) {
      errors.push("Each condition and native step may be bound only once.");
    }
    boundConditionIds.add(binding.conditionId);
    boundStepIds.add(binding.stepId);
    if (
      binding.stepId === config.binding.triggerStepId ||
      !validIds.has(binding.stepId)
    ) {
      errors.push(
        "Conditions must use supported native steps other than the trigger.",
      );
    }
  }
  for (const condition of config.contract.conditions) {
    if (!boundConditionIds.has(condition.id)) {
      errors.push(`Missing native binding for ${condition.name}.`);
    }
  }
  return [...new Set(errors)];
}

function ConfluenceEditorForm({
  strategy,
  analysis,
  onSave,
  onClose,
  visible,
}: ConfluenceEditorProps) {
  const candidates = useMemo(
    () =>
      (analysis?.candidates || []).filter(
        (candidate) =>
          candidate.strategyId === strategy.id &&
          candidate.strategyVersion === strategy.version,
      ),
    [analysis?.candidates, strategy.id, strategy.version],
  );
  const stored = (strategy as StrategyWithConfluence).confluence;
  const initialCandidate =
    candidates.find((c) => c.side === stored?.binding.side) || candidates[0];
  const [candidateId, setCandidateId] = useState<string | undefined>(
    initialCandidate?.id,
  );
  const [config, setConfig] = useState<ConfluenceRuleConfig | undefined>(() =>
    stored
      ? cloneConfig(stored)
      : initialCandidate && analysis
        ? draftConfluence(strategy, initialCandidate, analysis.timeframe)
        : undefined,
  );
  const [reviewed, setReviewed] = useState(false);
  const [submitError, setSubmitError] = useState<string | undefined>();

  const selectedCandidate = candidates.find((item) => item.id === candidateId);
  const steps = useMemo(
    () => selectableSteps(strategy, selectedCandidate, analysis?.timeframe),
    [strategy, selectedCandidate, analysis?.timeframe],
  );
  // M25: ordinary finite rounding drift (for example 99.6) is normalized on
  // save, not treated as a reason to strand an otherwise reviewable draft.
  // The helper returns fresh condition/source objects, so this never mutates a
  // configured source or hides a source-weight change.
  const normalizedForSave = useMemo(() => {
    if (!config) return undefined;
    try {
      return {
        ...config,
        contract: {
          ...config.contract,
          conditions: normalizeConfluenceWeights(config.contract.conditions),
        },
      };
    } catch {
      return undefined;
    }
  }, [config]);
  const errors = configErrors(
    normalizedForSave || config,
    steps,
    selectedCandidate,
  );
  const enabledWeight = config
    ? config.contract.conditions.reduce(
        (total, condition) =>
          total + (condition.enabled ? condition.weight : 0),
        0,
      )
    : 0;


  const update = (next: ConfluenceRuleConfig) => {
    setConfig(draftState(next));
    setReviewed(false);
    setSubmitError(undefined);
  };

  const selectCandidate = (candidate: SetupCandidate) => {
    setCandidateId(candidate.id);
    if (analysis) {
      setConfig(draftConfluence(strategy, candidate, analysis.timeframe));
    }
    setReviewed(false);
    setSubmitError(undefined);
  };

  const selectTrigger = (triggerStepId: string) => {
    if (!config || !selectedCandidate) return;
    const trigger = steps.find((step) => step.id === triggerStepId);
    if (!trigger) return;
    const oldConditionsByStep = new Map<string, ConfluenceCondition>();
    for (const binding of config.binding.conditions) {
      const condition = config.contract.conditions.find(
        (item) => item.id === binding.conditionId,
      );
      if (condition) oldConditionsByStep.set(binding.stepId, condition);
    }
    const usedIds = new Set<string>();
    const nextPairs = steps
      .filter((step) => step.id !== triggerStepId)
      .map((step) => {
        const old = oldConditionsByStep.get(step.id);
        const id = old?.id || conditionIdFor(step.id, usedIds);
        usedIds.add(id);
        return {
          stepId: step.id,
          condition: {
            id,
            name: step.name,
            predicate: stepPredicate(step),
            source: sourceFor(config),
            enabled: old?.enabled ?? true,
            // A newly exposed condition receives zero points until the reviewer
            // explicitly adjusts or normalizes the weights.
            weight: old?.weight ?? 0,
          } satisfies ConfluenceCondition,
        };
      });
    const nextConditions = nextPairs.map((item) => item.condition);
    update({
      ...config,
      contract: {
        ...config.contract,
        trigger: {
          id: trigger.id,
          name: trigger.name,
          predicate: stepPredicate(trigger),
          source: sourceFor(config),
        },
        conditions: nextConditions,
      },
      binding: {
        side: selectedCandidate.side,
        triggerStepId,
        conditions: nextPairs.map(({ condition, stepId }) => ({
          conditionId: condition.id,
          stepId,
        })),
      },
    });
  };

  const updateCondition = (
    conditionId: string,
    change: Partial<Pick<ConfluenceCondition, "weight" | "enabled">>,
  ) => {
    if (!config) return;
    update({
      ...config,
      contract: {
        ...config.contract,
        conditions: config.contract.conditions.map((condition) =>
          condition.id === conditionId
            ? { ...condition, ...change }
            : condition,
        ),
      },
    });
  };

  const normalize = () => {
    if (!config) return;
    try {
      update({
        ...config,
        contract: {
          ...config.contract,
          conditions: normalizeConfluenceWeights(config.contract.conditions),
        },
      });
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Unable to normalize weights.",
      );
    }
  };

  const approve = () => {
    if (!config || !normalizedForSave) {
      setSubmitError(
        "At least one enabled condition needs a finite positive weight before it can be normalized.",
      );
      return;
    }
    if (!reviewed) {
      setSubmitError(
        "Confirm that you reviewed the native steps and weights before approving.",
      );
      return;
    }
    if (errors.length) {
      setSubmitError(errors[0]);
      return;
    }
    const now = Date.now();
    const approved: ConfluenceRuleConfig = {
      ...normalizedForSave,
      contract: {
        ...normalizedForSave.contract,
        strategyId: strategy.id,
        strategyVersion: strategy.version,
        configVersion: normalizedForSave.contract.configVersion + 1,
        approval: {
          status: "approved",
          approvedAt: now,
          approvedBy: "owner-review",
        },
      },
    };
    onSave(approved);
  };

  return (
    <Sheet
      visible={visible}
      title="Confluence review"
      subtitle="Closed-OHLC checklist only · no order or automation is created"
      onClose={onClose}
    >
      <View style={styles.headerCard}>
        <View style={{ flex: 1, gap: 3 }}>
          <SectionLabel>{strategy.name}</SectionLabel>
          <Text style={styles.title}>Configure a review gate</Text>
          <Text style={styles.detail}>
            Score is deterministic confluence points, not a win probability. A
            configured signal still has no execution authority.
          </Text>
        </View>
        <Pill label="PENDING REVIEW" tone="amber" />
      </View>

      <View
        style={styles.sourceBox}
        accessibilityLabel="Native source status pending review"
      >
        <Text style={styles.sourceLabel}>SOURCE · PENDING</Text>
        <Text style={styles.sourceText}>
          {selectedCandidate?.source ||
            analysis?.source ||
            "No closed-OHLC candidate source available"}
        </Text>
        <Text style={styles.sourceMeta}>
          {analysis
            ? `${analysis.timeframe} closed OHLC · freshness limit ${2 * (analysis.timeframe === "1m" ? 1 : analysis.timeframe === "5m" ? 5 : analysis.timeframe === "15m" ? 15 : analysis.timeframe === "30m" ? 30 : analysis.timeframe === "1h" ? 60 : analysis.timeframe === "4h" ? 240 : analysis.timeframe === "1d" ? 1440 : 10080)} minutes`
            : "Analysis is unavailable; unknown, session, clock, news, and prose cannot be counted."}
        </Text>
      </View>

      {!analysis ? (
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Closed-bar analysis required</Text>
          <Text style={styles.detail}>
            Run analysis first. The editor will not turn manual, session, HTF,
            news, quote, or free-text items into sourced conditions.
          </Text>
        </View>
      ) : null}

      {analysis && !candidates.length ? (
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>
            No same-version native candidate
          </Text>
          <Text style={styles.detail}>
            This strategy currently has no supported candidate-local OHLC steps.
            Its unknown/manual prerequisites remain pending rather than passed.
          </Text>
        </View>
      ) : null}

      {candidates.length > 1 ? (
        <View style={styles.section}>
          <SectionLabel>Candidate under review</SectionLabel>
          <Text style={styles.detail}>
            Select the concrete candidate whose native steps you are reviewing.
            Long and short evidence is never silently combined.
          </Text>
          {candidates.map((candidate) => {
            const selected = candidate.id === selectedCandidate?.id;
            return (
              <Pressable
                key={candidate.id}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${candidate.name} ${candidate.side} candidate`}
                onPress={() => selectCandidate(candidate)}
                style={[styles.choice, selected && styles.choiceSelected]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.choiceTitle}>{candidate.name}</Text>
                  <Text style={styles.choiceDetail}>
                    {candidate.side.toUpperCase()} ·{" "}
                    {candidate.ready
                      ? "ready to review"
                      : "sequence incomplete"}
                  </Text>
                </View>
                <Text style={styles.choiceMark}>
                  {selected ? "Selected" : "Select"}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {config && selectedCandidate ? (
        <>
          <View style={styles.section}>
            <SectionLabel>1 · Explicit trigger</SectionLabel>
            <Text style={styles.detail}>
              Choose one actual candidate step. Source-frame metadata is not a
              trigger.
            </Text>
            {steps.map((step) => {
              const selected = config.binding.triggerStepId === step.id;
              return (
                <Pressable
                  key={step.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => selectTrigger(step.id)}
                  style={[styles.choice, selected && styles.choiceSelected]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.choiceTitle}>{step.name}</Text>
                    <Text style={styles.choiceDetail}>
                      Native ID: {step.id}
                    </Text>
                  </View>
                  <Pill
                    label={selected ? "TRIGGER" : "USE"}
                    tone={selected ? "lime" : "muted"}
                  />
                </Pressable>
              );
            })}
          </View>

          <Divider />
          <View style={styles.section}>
            <SectionLabel>2 · Weighted conditions</SectionLabel>
            <Text style={styles.detail}>
              Conditions must be other native steps. Edit weights deliberately,
              then use Normalize weights if needed.
            </Text>
            <View style={styles.weightSummary}>
              <Text style={styles.weightText}>
                Enabled total:{" "}
                {Number.isFinite(enabledWeight)
                  ? enabledWeight.toFixed(2)
                  : "invalid"}{" "}
                / 100
              </Text>
              <ActionButton
                label="Normalize weights"
                compact
                kind="secondary"
                onPress={normalize}
              />
            </View>
            {config.contract.conditions.map((condition) => {
              const binding = config.binding.conditions.find(
                (item) => item.conditionId === condition.id,
              );
              return (
                <View key={condition.id} style={styles.condition}>
                  <View style={styles.conditionHead}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.choiceTitle}>{condition.name}</Text>
                      <Text style={styles.choiceDetail}>
                        Native ID: {binding?.stepId || "missing binding"}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="switch"
                      accessibilityState={{ checked: condition.enabled }}
                      accessibilityLabel={`Enable ${condition.name}`}
                      onPress={() =>
                        updateCondition(condition.id, {
                          enabled: !condition.enabled,
                        })
                      }
                      style={[
                        styles.enabled,
                        condition.enabled && styles.enabledOn,
                      ]}
                    >
                      <Text
                        style={[
                          styles.enabledText,
                          condition.enabled && styles.enabledTextOn,
                        ]}
                      >
                        {condition.enabled ? "Included" : "Excluded"}
                      </Text>
                    </Pressable>
                  </View>
                  <Input
                    label="Weight (points)"
                    keyboardType="numeric"
                    value={
                      Number.isFinite(condition.weight)
                        ? String(condition.weight)
                        : ""
                    }
                    onChangeText={(value) =>
                      updateCondition(condition.id, { weight: Number(value) })
                    }
                    placeholder="0"
                  />
                </View>
              );
            })}
          </View>

          <Divider />
          <View style={styles.section}>
            <SectionLabel>3 · Gate and approval</SectionLabel>
            <Input
              label="Minimum deterministic confluence points (0–100)"
              keyboardType="numeric"
              value={
                Number.isFinite(config.contract.threshold)
                  ? String(config.contract.threshold)
                  : ""
              }
              onChangeText={(value) =>
                update({
                  ...config,
                  contract: { ...config.contract, threshold: Number(value) },
                })
              }
              placeholder="70"
            />
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: reviewed }}
              onPress={() => setReviewed((value) => !value)}
              style={[styles.reviewCheck, reviewed && styles.reviewChecked]}
            >
              <Text style={[styles.checkMark, reviewed && styles.checkMarkOn]}>
                {reviewed ? "✓" : ""}
              </Text>
              <Text style={styles.reviewText}>
                I reviewed the selected trigger, native conditions, weights, and
                gate. I understand this only produces a paper-review eligibility
                signal.
              </Text>
            </Pressable>
            {errors.length ? (
              <View style={styles.errorBox} accessibilityRole="alert">
                <Text style={styles.errorTitle}>Resolve before approval</Text>
                {errors.slice(0, 3).map((error) => (
                  <Text key={error} style={styles.errorText}>
                    • {error}
                  </Text>
                ))}
              </View>
            ) : null}
            {submitError ? (
              <Text style={styles.errorText} accessibilityRole="alert">
                {submitError}
              </Text>
            ) : null}
            <ActionButton
              label="Approve confluence configuration"
              icon="checkmark-circle-outline"
              disabled={!reviewed || errors.length > 0}
              onPress={approve}
            />
            <Text style={styles.caption}>
              Approval records owner-review and the current time. Any edit
              returns the configuration to draft until this action is repeated.
            </Text>
          </View>
        </>
      ) : null}

      <ActionButton label="Close" kind="ghost" onPress={onClose} />
    </Sheet>
  );
}

/** Resets local review state when a strategy/analysis review session is reopened. */
export function ConfluenceEditor(props: ConfluenceEditorProps) {
  const reviewKey = [
    props.visible ? "open" : "closed",
    props.strategy.id,
    props.strategy.version,
    props.analysis?.asOf ?? "no-analysis",
  ].join(":");
  return <ConfluenceEditorForm key={reviewKey} {...props} />;
}

const styles = StyleSheet.create({
  headerCard: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  title: { color: C.text, fontSize: 18, fontWeight: "800" },
  detail: { color: C.muted, fontSize: 11, lineHeight: 16 },
  sourceBox: {
    borderWidth: 1,
    borderColor: C.amber + "77",
    backgroundColor: C.amber + "0D",
    padding: 10,
    borderRadius: 4,
    gap: 3,
  },
  sourceLabel: {
    color: C.amber,
    fontWeight: "800",
    fontSize: 10,
    letterSpacing: 0.8,
  },
  sourceText: { color: C.text, fontSize: 11, lineHeight: 15 },
  sourceMeta: { color: C.muted, fontSize: 10, lineHeight: 14 },
  notice: {
    backgroundColor: C.surface2,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 4,
    padding: 11,
    gap: 4,
  },
  noticeTitle: { color: C.text, fontSize: 12, fontWeight: "800" },
  section: { gap: 8 },
  choice: {
    minHeight: 57,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface2,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  choiceSelected: {
    borderColor: C.lime + "AA",
    backgroundColor: C.lime + "12",
  },
  choiceTitle: { color: C.text, fontSize: 12, fontWeight: "800" },
  choiceDetail: { color: C.muted, fontSize: 10, lineHeight: 14, marginTop: 2 },
  choiceMark: { color: C.lime, fontSize: 10, fontWeight: "800" },
  weightSummary: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    paddingVertical: 2,
  },
  weightText: { color: C.text, fontSize: 11, fontWeight: "700" },
  condition: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 4,
    padding: 9,
    gap: 7,
    backgroundColor: C.surface2,
  },
  conditionHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  enabled: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 3,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  enabledOn: { borderColor: C.mint + "88", backgroundColor: C.mint + "14" },
  enabledText: { color: C.muted, fontSize: 10, fontWeight: "800" },
  enabledTextOn: { color: C.mint },
  reviewCheck: {
    flexDirection: "row",
    gap: 8,
    borderWidth: 1,
    borderColor: C.border,
    padding: 10,
    borderRadius: 4,
    alignItems: "flex-start",
  },
  reviewChecked: { borderColor: C.lime + "88", backgroundColor: C.lime + "10" },
  checkMark: {
    width: 16,
    height: 16,
    borderWidth: 1,
    borderColor: C.muted,
    color: C.black,
    backgroundColor: "transparent",
    textAlign: "center",
    fontSize: 12,
    fontWeight: "900",
  },
  checkMarkOn: { backgroundColor: C.lime, borderColor: C.lime },
  reviewText: { flex: 1, color: C.text, fontSize: 11, lineHeight: 16 },
  errorBox: {
    borderWidth: 1,
    borderColor: C.rose + "99",
    backgroundColor: C.rose + "0E",
    borderRadius: 4,
    padding: 9,
    gap: 3,
  },
  errorTitle: { color: C.rose, fontSize: 11, fontWeight: "800" },
  errorText: { color: C.rose, fontSize: 10, lineHeight: 15 },
  caption: {
    color: C.muted,
    fontSize: 10,
    lineHeight: 14,
    textAlign: "center",
  },
});
