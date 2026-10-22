import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  AppState,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  localLock,
  type LocalLockService,
  type LocalLockStatus,
} from "@/lib/trading/local-lock";
import { ActionButton, Card } from "./ui";
import { C } from "./theme";

type LocalAppLockContextValue = {
  enabled: boolean;
  lockNow: () => boolean;
  refresh: () => Promise<void>;
};

const LocalAppLockContext = createContext<LocalAppLockContextValue | null>(null);

/** Use in a child control such as LocalLockControls; null means no enclosing app lock. */
export function useLocalAppLock(): LocalAppLockContextValue | null {
  return useContext(LocalAppLockContext);
}

export type LocalAppLockProps = {
  children: ReactNode;
  service?: LocalLockService;
  /** Defaults to true. The PIN screen is shown after this app goes to background. */
  autoLockOnBackground?: boolean;
  /**
   * Must sign out and complete a fresh server-verified owner authentication before returning true.
   * Returning true removes only the local PIN verifier; workspace and screenshots are untouched.
   */
  onRequestReauthentication?: () => Promise<boolean> | boolean;
  onLocked?: () => void;
  onUnlocked?: () => void;
};

function cooldownText(cooldownUntil: number | null, now: number): string | null {
  if (!cooldownUntil || cooldownUntil <= now) return null;
  return `Too many incorrect PIN attempts. Try again in ${Math.ceil(
    (cooldownUntil - now) / 1000,
  )} seconds.`;
}

/**
 * A local privacy overlay. Keep this outside OwnerGate so server authorization remains authoritative.
 * This component intentionally has no broker, trading, workspace, screenshot, or network writes.
 */
export function LocalAppLock({
  children,
  service = localLock,
  autoLockOnBackground = true,
  onRequestReauthentication,
  onLocked,
  onUnlocked,
}: LocalAppLockProps) {
  const [status, setStatus] = useState<LocalLockStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [pin, setPin] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const [busy, setBusy] = useState(false);
  const enabledRef = useRef(false);
  const hasReportedLock = useRef(false);

  const refresh = useCallback(
    async (lockAtStartup = false) => {
      const next = await service.getStatus();
      enabledRef.current = next.enabled;
      setStatus(next);
      if (lockAtStartup && next.enabled) setLocked(true);
      if (!next.enabled) {
        setLocked(false);
        setCooldownUntil(null);
      } else {
        setCooldownUntil(await service.getCooldownUntil());
      }
      setLoading(false);
    },
    [service],
  );

  useEffect(() => {
    const initialRefresh = setTimeout(() => {
      void refresh(true);
    }, 0);
    const unsubscribe = service.subscribe(() => {
      void refresh(false);
    });
    return () => {
      clearTimeout(initialRefresh);
      unsubscribe();
    };
  }, [refresh, service]);

  const lockNow = useCallback(() => {
    if (!enabledRef.current) return false;
    setPin("");
    setNotice(null);
    setLocked(true);
    return true;
  }, []);

  useEffect(() => {
    if (!autoLockOnBackground) return;
    const subscription = AppState.addEventListener("change", (nextState) => {
      if ((nextState === "background" || nextState === "inactive")) lockNow();
    });
    return () => subscription.remove();
  }, [autoLockOnBackground, lockNow]);

  useEffect(() => {
    if (!locked && hasReportedLock.current) {
      hasReportedLock.current = false;
      onUnlocked?.();
    } else if (locked && !hasReportedLock.current) {
      hasReportedLock.current = true;
      onLocked?.();
    }
  }, [locked, onLocked, onUnlocked]);

  useEffect(() => {
    if (!cooldownUntil || cooldownUntil <= now) return;
    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, [cooldownUntil, now]);

  const unlock = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await service.verifyPin(pin);
      setPin("");
      if (result.state === "unlocked") {
        setCooldownUntil(null);
        setLocked(false);
      } else if (result.state === "wrong-pin") {
        setNotice(
          `Incorrect PIN. ${result.attemptsRemaining} attempt${
            result.attemptsRemaining === 1 ? "" : "s"
          } remaining before a cooldown.`,
        );
      } else if (result.state === "cooldown") {
        const until = Date.now() + result.retryAfterMs;
        setCooldownUntil(until);
        setNow(Date.now());
        setNotice(cooldownText(until, Date.now()));
      } else if (result.state === "invalid-pin" || result.state === "unavailable") {
        setNotice(result.message);
      } else {
        setNotice("Local PIN protection is off.");
        setLocked(false);
      }
    } finally {
      setBusy(false);
    }
  };

  const recover = async () => {
    if (!onRequestReauthentication) {
      setNotice(
        "PIN reset requires signing out and completing a fresh owner re-authentication. Wire onRequestReauthentication before enabling this recovery action.",
      );
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const reauthenticated = await onRequestReauthentication();
      if (!reauthenticated) {
        setNotice(
          "PIN was not reset because fresh owner re-authentication was not confirmed.",
        );
        return;
      }
      await service.resetAfterReauthentication();
      setLocked(false);
      setNotice(
        "Local PIN reset after re-authentication. Workspace and screenshots were not deleted.",
      );
    } catch {
      setNotice(
        "Could not complete the re-authentication recovery. Your workspace and screenshots were not changed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const context = {
    enabled: Boolean(status?.enabled),
    lockNow,
    refresh: () => refresh(false),
  };

  if (loading) {
    return (
      <View style={styles.loading} accessibilityLabel="Checking optional local app lock">
        <ActivityIndicator color={C.lime} />
        <Text style={styles.loadingText}>Checking optional local app lock…</Text>
      </View>
    );
  }

  if (!locked) {
    return <LocalAppLockContext.Provider value={context}>{children}</LocalAppLockContext.Provider>;
  }

  const cooldown = cooldownText(cooldownUntil, now);
  return (
    <LocalAppLockContext.Provider value={context}>
      <View style={styles.page} accessibilityViewIsModal>
        <Card style={styles.card}>
          <Text style={styles.eyebrow}>LOCAL PRIVACY LAYER</Text>
          <Text style={styles.title}>StratDesk is locked on this device.</Text>
          <Text style={styles.detail}>
            Enter your local PIN to continue. Owner Gate remains server-authoritative;
            this PIN does not grant account, broker, or trading authority.
          </Text>
          <TextInput
            accessibilityLabel="Local app lock PIN"
            autoComplete="off"
            editable={!busy && !cooldown}
            keyboardType="number-pad"
            maxLength={12}
            onChangeText={setPin}
            onSubmitEditing={() => void unlock()}
            placeholder="6–12 digit PIN"
            placeholderTextColor={C.muted}
            secureTextEntry
            style={styles.input}
            textContentType="password"
            value={pin}
          />
          {cooldown || notice ? (
            <Text accessibilityLiveRegion="polite" style={styles.notice}>
              {cooldown || notice}
            </Text>
          ) : null}
          <ActionButton
            disabled={busy || Boolean(cooldown) || pin.length === 0}
            label={busy ? "Checking…" : "Unlock"}
            onPress={() => void unlock()}
          />
          <View style={styles.recovery}>
            <Text style={styles.recoveryText}>
              Forgot your PIN? Sign out and complete a fresh owner re-authentication to
              reset this local PIN. This never wipes workspace or screenshots.
            </Text>
            <ActionButton
              compact
              disabled={busy}
              icon="log-out-outline"
              kind="ghost"
              label="Sign out & re-auth to reset PIN"
              onPress={() => void recover()}
            />
          </View>
        </Card>
      </View>
    </LocalAppLockContext.Provider>
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: "center",
    backgroundColor: C.bg,
    flex: 1,
    gap: 12,
    justifyContent: "center",
    padding: 24,
  },
  loadingText: { color: C.muted, fontSize: 13 },
  page: {
    alignItems: "center",
    backgroundColor: C.bg,
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  card: { gap: 14, maxWidth: 430, padding: 18, width: "100%" },
  eyebrow: { color: C.lime, fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  title: { color: C.text, fontSize: 24, fontWeight: "800", lineHeight: 30 },
  detail: { color: C.muted, fontSize: 13, lineHeight: 19 },
  input: {
    backgroundColor: C.black,
    borderColor: C.border,
    borderRadius: 9,
    borderWidth: 1,
    color: C.text,
    fontSize: 17,
    letterSpacing: 3,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  notice: { color: C.amber, fontSize: 12, lineHeight: 17 },
  recovery: { borderTopColor: C.border, borderTopWidth: 1, gap: 8, paddingTop: 12 },
  recoveryText: { color: C.muted, fontSize: 11, lineHeight: 16 },
});
