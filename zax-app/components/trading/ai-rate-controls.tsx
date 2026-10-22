import { useState } from "react";
import { Text, View } from "react-native";
import { useWorkspace } from "@/hooks/use-workspace";
import { Card, Input, ActionButton } from "./ui";
import { C } from "./theme";

export function AiRateControls() {
  const { workspace, update, saveCloud } = useWorkspace();
  const limits = workspace.settings.aiRateLimits;
  const [coach, setCoach] = useState(String(limits?.coach ?? 30));
  const [forecast, setForecast] = useState(String(limits?.forecast ?? 20));
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    const c = Number(coach),
      f = Number(forecast);
    if (![c, f].every((v) => Number.isInteger(v) && v >= 1 && v <= 60)) {
      setNotice("Choose a whole number from 1 to 60 for each 10-minute limit.");
      return;
    }
    setBusy(true);
    try {
      update((w) => ({
        ...w,
        settings: {
          ...w.settings,
          aiRateLimits: { ...w.settings.aiRateLimits, coach: c, forecast: f },
        },
      }));
      const ok = await saveCloud();
      setNotice(
        ok
          ? "Saved. Server checks use these private limits; lowering a limit does not erase prior requests."
          : "Saved on this device; cloud sync did not confirm the new limits. Server may still use the prior saved limits.",
      );
    } catch {
      setNotice(
        "The cloud save did not confirm the new limits. Retry after checking sync status.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <Text style={{ color: C.text, fontSize: 14, fontWeight: "800" }}>
        AI request limits
      </Text>
      <Text
        style={{ color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 6 }}
      >
        Personal limits per 10-minute window. These are workspace safeguards,
        not an account balance.
      </Text>
      <View style={{ marginTop: 10, gap: 8 }}>
        <Input
          label="Coach requests (1–60)"
          value={coach}
          onChangeText={setCoach}
          keyboardType="numeric"
        />
        <Input
          label="Forecast requests (1–60)"
          value={forecast}
          onChangeText={setForecast}
          keyboardType="numeric"
        />
        <ActionButton
          compact
          label={busy ? "Saving…" : "Save private limits"}
          disabled={busy}
          onPress={() => void save()}
        />
      </View>
      {notice ? (
        <Text
          style={{ color: C.amber, fontSize: 11, lineHeight: 16, marginTop: 8 }}
        >
          {notice}
        </Text>
      ) : null}
    </Card>
  );
}
