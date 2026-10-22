import { useState } from "react";
import { Modal, StyleSheet, Text, TextInput, View } from "react-native";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  type DisciplineGuardId,
  type DisciplineGuardSettings,
} from "@/lib/trading/discipline-policy";
import {
  persistDisciplineGuardWithAcknowledgement,
  type DisciplineGuardPersistenceChange,
} from "@/lib/trading/discipline-guard-ack";
import { ActionButton, ToggleRow } from "./ui";
import { C } from "./theme";
type GuardControlDefinition = {
  guard: DisciplineGuardId;
  setting: keyof DisciplineGuardSettings;
  label: string;
  detail: string;
};

const GUARDS: GuardControlDefinition[] = [
  {
    guard: "cooldown",
    setting: "enforceCooldown",
    label: "Post-loss cooldown",
    detail:
      "Optional paper-order guard after a recorded canonical realized loss. UTC timing is independent of your display timezone.",
  },
  {
    guard: "overtrading",
    setting: "enforceOvertrading",
    label: "Daily closed-trade threshold",
    detail:
      "Optional paper-order guard when the configured closed-trade threshold is reached in the UTC reporting day.",
  },
  {
    guard: "riskEscalation",
    setting: "enforceRiskEscalation",
    label: "Risk escalation after loss",
    detail:
      "Optional paper-order guard only when the canonical original-risk comparison reports material sizing escalation after a loss.",
  },
  {
    guard: "lossStreak",
    setting: "enforceLossStreak",
    label: "Recorded loss streak",
    detail:
      "Optional paper-order guard for a confirmed sequence of recorded losses. It does not infer motive, emotion, or readiness.",
  },
];

export type DisciplineGuardChange = DisciplineGuardPersistenceChange & {
  guard: DisciplineGuardId;
  /** Captured only after explicit disable confirmation; parent persistence owns it. */
};

export function DisciplineGuardControl({
  onGuardChange,
}: {
  onGuardChange?: (change: DisciplineGuardChange) => void | Promise<void>;
}) {
  const { workspace, update, saveCloud } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [pendingDisable, setPendingDisable] =
    useState<GuardControlDefinition>();
  const [disableReason, setDisableReason] = useState("");

  const applyChange = async (
    definition: GuardControlDefinition,
    enabled: boolean,
    reason?: string,
  ) => {
    if (busy) return;
    setBusy(true);
    const change: DisciplineGuardChange = {
      guard: definition.guard,
      setting: definition.setting,
      enabled,
      ...(reason?.trim() ? { reason: reason.trim().slice(0, 1000) } : {}),
    };
    try {
      const persisted = await persistDisciplineGuardWithAcknowledgement({
        workspace,
        change,
        update,
        saveCloud,
      });
      if (persisted.status === "local-only") {
        setMessage(
          "The local guard value changed, but the owner cloud workspace was not acknowledged. Server enforcement is unchanged; retry the save before relying on this guard.",
        );
        return;
      }
      try {
        // Compatibility observer only: canonical persistence has already
        // acknowledged, so an observer cannot represent the guard as applied.
        await onGuardChange?.(change);
      } catch {
        setMessage(
          "The owner cloud workspace acknowledged this guard. An additional local handler did not finish.",
        );
        return;
      }
      setMessage(
        enabled
          ? `${definition.label} is enabled. It only blocks a new paper order when its matching observable canonical condition is active.`
          : `${definition.label} is disabled. Coaching observations remain advisory and no personal practice was changed.`,
      );
    } catch {
      setMessage(
        "The guard change was not applied. Review the workspace save status and try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const requestChange = (
    definition: GuardControlDefinition,
    enabled: boolean,
  ) => {
    if (enabled) {
      void applyChange(definition, true);
      return;
    }
    setDisableReason("");
    setPendingDisable(definition);
  };

  const confirmDisable = () => {
    if (!pendingDisable) return;
    const definition = pendingDisable;
    setPendingDisable(undefined);
    void applyChange(definition, false, disableReason);
  };

  return (
    <>
      <Text style={styles.intro}>
        All guards are off by default. When off, they leave your practice
        unchanged and show the same advisory coaching observations.
      </Text>
      {GUARDS.map((definition) => (
        <ToggleRow
          key={definition.guard}
          label={definition.label}
          detail={definition.detail}
          value={Boolean(workspace.settings[definition.setting])}
          onChange={(value) => requestChange(definition, value)}
        />
      ))}
      {message ? (
        <Text style={styles.message} accessibilityLiveRegion="polite">
          {message}
        </Text>
      ) : null}
      <Modal
        visible={Boolean(pendingDisable)}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingDisable(undefined)}
      >
        <View style={styles.backdrop}>
          <View style={styles.dialog} accessibilityViewIsModal>
            <Text accessibilityRole="header" style={styles.dialogTitle}>
              Disable {pendingDisable?.label}?
            </Text>
            <Text style={styles.dialogText}>
              This removes an optional paper-order block for this condition.
              Coaching will remain advisory. Confirm before disabling.
            </Text>
            <Text style={styles.reasonLabel}>
              Optional reason (saved with guard change)
            </Text>
            <TextInput
              accessibilityLabel="Optional reason for disabling discipline guard"
              value={disableReason}
              onChangeText={setDisableReason}
              maxLength={1000}
              multiline
              placeholder="Why is this guard being turned off?"
              placeholderTextColor={C.muted}
              style={styles.reasonInput}
            />
            <View style={styles.dialogActions}>
              <ActionButton
                compact
                kind="secondary"
                label="Keep guard on"
                onPress={() => setPendingDisable(undefined)}
              />
              <ActionButton
                compact
                kind="danger"
                label="Confirm disable"
                onPress={confirmDisable}
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  intro: { color: C.muted, fontSize: 10, lineHeight: 15 },
  message: { color: C.muted, fontSize: 11, lineHeight: 16 },
  backdrop: {
    flex: 1,
    padding: 18,
    justifyContent: "center",
    backgroundColor: "#000000AA",
  },
  dialog: {
    gap: 10,
    padding: 15,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  dialogTitle: { color: C.text, fontSize: 16, fontWeight: "800" },
  dialogText: { color: C.muted, fontSize: 11, lineHeight: 16 },
  reasonLabel: { color: C.text, fontSize: 11, fontWeight: "700" },
  reasonInput: {
    minHeight: 76,
    padding: 9,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 4,
    color: C.text,
    backgroundColor: C.black + "66",
    fontSize: 12,
    textAlignVertical: "top",
  },
  dialogActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
});
