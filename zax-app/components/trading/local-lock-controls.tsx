import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import {
  localLock,
  type LocalLockService,
  type LocalLockStatus,
  validateLocalPin,
} from "@/lib/trading/local-lock";
import { useLocalAppLock } from "./local-app-lock";
import { ActionButton, Card, Pill } from "./ui";
import { C } from "./theme";

export type LocalLockControlsProps = {
  service?: LocalLockService;
  /** Optional for controls mounted outside LocalAppLock. */
  onLockNow?: () => void;
  onStatusChange?: (status: LocalLockStatus) => void;
};

type SetupStep = "idle" | "create" | "confirm";

/**
 * Library-friendly configuration UI. Enabling always requires a PIN and matching confirmation;
 * there is no first-run auto-enrollment. The long-press quick action has a visible Lock now button
 * so it is never gesture-only.
 */
export function LocalLockControls({
  service = localLock,
  onLockNow,
  onStatusChange,
}: LocalLockControlsProps) {
  const appLock = useLocalAppLock();
  const [status, setStatus] = useState<LocalLockStatus | null>(null);
  const [step, setStep] = useState<SetupStep>("idle");
  const [pin, setPin] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const next = await service.getStatus();
    setStatus(next);
    onStatusChange?.(next);
  }, [onStatusChange, service]);

  useEffect(() => {
    const initialRefresh = setTimeout(() => {
      void refresh();
    }, 0);
    const unsubscribe = service.subscribe(() => {
      void refresh();
    });
    return () => {
      clearTimeout(initialRefresh);
      unsubscribe();
    };
  }, [refresh, service]);

  const startSetup = () => {
    setNotice(null);
    setPin("");
    setConfirmation("");
    setStep("create");
  };

  const continueSetup = () => {
    const error = validateLocalPin(pin);
    if (error) {
      setNotice(error);
      return;
    }
    setNotice(null);
    setStep("confirm");
  };

  const enable = async () => {
    if (pin !== confirmation) {
      setNotice("PINs do not match. Nothing was enabled.");
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await service.configurePin(pin);
      setPin("");
      setConfirmation("");
      setStep("idle");
      setNotice("Local PIN protection is on. Use Lock now or background the app to lock it.");
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not enable local PIN protection.");
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await service.disable();
      setStep("idle");
      setNotice("Local PIN protection is off. Workspace and screenshots were not changed.");
      await refresh();
    } catch {
      setNotice("Could not turn off local PIN protection.");
    } finally {
      setBusy(false);
    }
  };

  const performLock = () => {
    const lock = onLockNow ?? appLock?.lockNow;
    if (!lock) {
      setNotice("Mount these controls inside LocalAppLock or pass onLockNow to use quick lock.");
      return;
    }
    lock();
  };

  const lockAvailable = Boolean(onLockNow ?? appLock?.lockNow);
  const enabled = Boolean(status?.enabled);
  const unavailable = status && !status.isSupported;

  return (
    <Card style={styles.card}>
      <View style={styles.topLine}>
        <View style={styles.heading}>
          <Text style={styles.label}>Local app lock</Text>
          <Text style={styles.title}>Optional device PIN</Text>
        </View>
        <Pill
          label={unavailable ? "UNAVAILABLE" : enabled ? "ON" : "OFF"}
          tone={unavailable ? "amber" : enabled ? "mint" : "muted"}
        />
      </View>

      <Text style={styles.detail}>
        {status?.message ?? "Checking local PIN availability…"}
      </Text>
      {status ? <Text style={styles.boundary}>{status.privacyNotice}</Text> : null}

      {unavailable ? (
        <Text accessibilityLiveRegion="polite" style={styles.warning}>
          {status.message}
        </Text>
      ) : null}

      {!status || unavailable ? null : enabled ? (
        <View style={styles.actions}>
          <View style={styles.action}>
            <Pressable
              accessibilityHint="Long press locks immediately. The separate Lock now button provides the accessible tap alternative."
              accessibilityLabel="Quick lock"
              accessibilityRole="button"
              delayLongPress={450}
              onLongPress={performLock}
              onPress={() =>
                setNotice("Long press here for quick lock, or use the Lock now button below.")
              }
              style={({ pressed }) => [
                styles.quickAction,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={styles.quickActionText}>Hold to quick lock</Text>
            </Pressable>
          </View>
          <View style={styles.action}>
            <ActionButton
              compact
              disabled={busy || !lockAvailable}
              icon="lock-closed-outline"
              kind="secondary"
              label="Lock now"
              onPress={performLock}
            />
          </View>
          <View style={styles.action}>
            <ActionButton
              compact
              disabled={busy}
              kind="ghost"
              label="Turn off PIN"
              onPress={() => void turnOff()}
            />
          </View>
        </View>
      ) : step === "create" ? (
        <View style={styles.setup}>
          <Text style={styles.setupTitle}>Create a 6–12 digit PIN</Text>
          <TextInput
            accessibilityLabel="New local PIN"
            autoComplete="off"
            editable={!busy}
            keyboardType="number-pad"
            maxLength={12}
            onChangeText={setPin}
            onSubmitEditing={continueSetup}
            placeholder="New PIN"
            placeholderTextColor={C.muted}
            secureTextEntry
            style={styles.input}
            textContentType="newPassword"
            value={pin}
          />
          <View style={styles.actions}>
            <View style={styles.action}>
              <ActionButton compact kind="ghost" label="Cancel" onPress={() => setStep("idle")} />
            </View>
            <View style={styles.action}>
              <ActionButton compact label="Continue" onPress={continueSetup} />
            </View>
          </View>
        </View>
      ) : step === "confirm" ? (
        <View style={styles.setup}>
          <Text style={styles.setupTitle}>Confirm your PIN to turn on local lock</Text>
          <TextInput
            accessibilityLabel="Confirm local PIN"
            autoComplete="off"
            editable={!busy}
            keyboardType="number-pad"
            maxLength={12}
            onChangeText={setConfirmation}
            onSubmitEditing={() => void enable()}
            placeholder="Confirm PIN"
            placeholderTextColor={C.muted}
            secureTextEntry
            style={styles.input}
            textContentType="newPassword"
            value={confirmation}
          />
          <View style={styles.actions}>
            <View style={styles.action}>
              <ActionButton compact kind="ghost" label="Back" onPress={() => setStep("create")} />
            </View>
            <View style={styles.action}>
              <ActionButton
                compact
                disabled={busy || confirmation.length === 0}
                label={busy ? "Enabling…" : "Confirm & turn on"}
                onPress={() => void enable()}
              />
            </View>
          </View>
        </View>
      ) : (
        <ActionButton
          disabled={busy}
          icon="lock-closed-outline"
          label="Set up local PIN"
          onPress={startSetup}
        />
      )}

      {notice ? (
        <Text accessibilityLiveRegion="polite" style={styles.notice}>
          {notice}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 9, minHeight: 160, padding: 12 },
  topLine: { alignItems: "flex-start", flexDirection: "row", gap: 10, justifyContent: "space-between" },
  heading: { flex: 1 },
  label: { color: C.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" },
  title: { color: C.text, fontSize: 14, fontWeight: "800", marginTop: 2 },
  detail: { color: C.muted, fontSize: 11, lineHeight: 16 },
  boundary: { color: C.muted, fontSize: 10, lineHeight: 14 },
  warning: { color: C.amber, fontSize: 11, lineHeight: 16 },
  notice: { color: C.mint, fontSize: 11, lineHeight: 16 },
  setup: { gap: 8 },
  setupTitle: { color: C.text, fontSize: 12, fontWeight: "700" },
  input: {
    backgroundColor: C.black,
    borderColor: C.border,
    borderRadius: 8,
    borderWidth: 1,
    color: C.text,
    fontSize: 15,
    letterSpacing: 2,
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  actions: { flexDirection: "row", gap: 7 },
  action: { flex: 1 },
  quickAction: {
    alignItems: "center",
    backgroundColor: C.surface2,
    borderColor: C.border,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 34,
    paddingHorizontal: 7,
  },
  quickActionText: { color: C.text, fontSize: 10, fontWeight: "700", textAlign: "center" },
});
