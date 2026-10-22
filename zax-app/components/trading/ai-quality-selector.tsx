import { StyleSheet, Text, View } from "react-native";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  AI_QUALITIES,
  aiQualityLabel,
  resolveAIQuality,
} from "@/lib/trading/ai-quality";
import { ActionButton } from "./ui";
import { C } from "./theme";

/** Preference only. A quality change never calls a model, raises a quota, or starts an order. */
export function AIQualitySelector({
  disabled = false,
}: {
  disabled?: boolean;
}) {
  const { workspace, update, ready, ownerAllowed } = useWorkspace();
  const quality = resolveAIQuality(workspace.settings.aiQuality);
  return (
    <View style={styles.root}>
      <Text style={styles.label}>AI QUALITY</Text>
      <View style={styles.buttons}>
        {AI_QUALITIES.map((candidate) => (
          <ActionButton
            key={candidate}
            label={aiQualityLabel(candidate)}
            compact
            kind={candidate === quality ? "primary" : "secondary"}
            disabled={disabled || !ready || !ownerAllowed}
            onPress={() =>
              update((current) => ({
                ...current,
                settings: { ...current.settings, aiQuality: candidate },
              }))
            }
          />
        ))}
      </View>
      <Text style={styles.detail}>
        {quality === "deep"
          ? "Deep uses available GPT-5.5, GPT-5 or Gemini Pro for stronger reasoning. It can take longer and use more model resources; it does not validate a forecast."
          : "Efficient uses available GPT-5 mini or Gemini Flash. No automatic premium upgrade."}
      </Text>
      <Text style={styles.detail}>
        Applies to future Coach and AI scenario requests. Saved with your
        workspace; use Save to cloud for your other device unless auto-sync is
        enabled.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 5, minWidth: 0, maxWidth: "100%" },
  label: { color: C.muted, fontSize: 9, fontWeight: "800", letterSpacing: 0.7 },
  buttons: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  detail: { color: C.muted, fontSize: 10, lineHeight: 15, flexShrink: 1 },
});
