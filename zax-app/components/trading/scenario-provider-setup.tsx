import { useCallback, useEffect, useState } from "react";
import { AppState, StyleSheet, Text, TextInput, View } from "react-native";
import { trpc } from "@/lib/trpc";
import { ActionButton } from "./ui";
import { C } from "./theme";

const genericProviderErrorCopy =
  "Couldn't complete that provider change. Please try again.";
const allowedProviderErrorCopy = [
  "OpenAI rejected this key. Check key permissions and try again.",
  "No supported scenario model is available for this key.",
  "OpenAI check timed out. Key was not saved.",
] as const;

function safeProviderErrorCopy(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error
      ? (error as { message?: unknown }).message
      : undefined;
  if (typeof message !== "string") return genericProviderErrorCopy;
  const matchedCopy = allowedProviderErrorCopy.find((copy) =>
    message.startsWith(copy),
  );
  if (matchedCopy) return matchedCopy;
  if (message.startsWith("Unable to save"))
    return "Unable to save this key. Please try again.";
  return genericProviderErrorCopy;
}

/**
 * Holds a provider key only for the current render session. The key is cleared before
 * the request begins, whenever the app backgrounds, and when this UI unmounts.
 */
export function ScenarioProviderSetup() {
  const providerStatus = trpc.forecast.providerStatus.useQuery();
  const connectProvider = trpc.forecast.connectProvider.useMutation({
    gcTime: 0,
  });
  const disconnectProvider = trpc.forecast.disconnectProvider.useMutation();
  const [apiKey, setApiKey] = useState("");
  const [providerError, setProviderError] = useState<string>();
  const [isConnecting, setIsConnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const resetConnectProvider = connectProvider.reset;
  const resetDisconnectProvider = disconnectProvider.reset;
  const clearApiKey = useCallback(() => setApiKey(""), []);
  const statusUnknown = providerStatus.isError;
  const configured = providerStatus.data?.configured === true;
  const models = providerStatus.data?.models ?? [];
  const trimmedApiKey = apiKey.trim();
  const hasValidApiKey =
    /^sk-[A-Za-z0-9_-]+$/.test(trimmedApiKey) &&
    trimmedApiKey.length >= 32 &&
    trimmedApiKey.length <= 1024;

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") {
        clearApiKey();
        resetConnectProvider();
      }
    });

    return () => {
      clearApiKey();
      resetConnectProvider();
      resetDisconnectProvider();
      subscription.remove();
    };
  }, [clearApiKey, resetConnectProvider, resetDisconnectProvider]);

  const refreshStatus = async () => {
    try {
      await providerStatus.refetch();
    } catch {
      // Connection changes have already completed; status refresh can retry normally.
    }
  };

  const saveAndConnect = async () => {
    if (isConnecting) return;

    let keyToSubmit = trimmedApiKey;
    clearApiKey();
    setProviderError(undefined);
    if (
      !/^sk-[A-Za-z0-9_-]+$/.test(keyToSubmit) ||
      keyToSubmit.length < 32 ||
      keyToSubmit.length > 1024
    )
      return;

    setIsConnecting(true);
    let connected = false;
    try {
      await connectProvider.mutateAsync({ apiKey: keyToSubmit });
      connected = true;
    } catch (error) {
      setProviderError(safeProviderErrorCopy(error));
    } finally {
      keyToSubmit = "";
      // Do not retain mutation variables containing the submitted key after it settles.
      connectProvider.reset();
      setIsConnecting(false);
    }

    if (connected) {
      setConfirmDisconnect(false);
      await refreshStatus();
    }
  };

  const disconnect = async () => {
    if (disconnectProvider.isPending) return;

    setProviderError(undefined);
    let disconnected = false;
    try {
      await disconnectProvider.mutateAsync(undefined);
      disconnected = true;
    } catch (error) {
      setProviderError(safeProviderErrorCopy(error));
    } finally {
      disconnectProvider.reset();
    }

    if (disconnected) {
      setConfirmDisconnect(false);
      await refreshStatus();
    }
  };

  return (
    <View style={styles.root}>
      <Text style={styles.heading}>Connect OpenAI</Text>
      {statusUnknown ? (
        <View style={styles.connected}>
          <Text style={styles.error}>
            We could not confirm the saved connection. Retry status or reconnect
            below.
          </Text>
          <ActionButton
            compact
            kind="secondary"
            label={providerStatus.isFetching ? "Checking…" : "Retry status"}
            disabled={providerStatus.isFetching}
            onPress={() => void refreshStatus()}
          />
        </View>
      ) : null}
      {configured && !statusUnknown ? (
        <View style={styles.connected}>
          <Text style={styles.connectedLabel}>Connected model catalog</Text>
          <Text style={styles.detail}>
            {models.length
              ? models.join(" · ")
              : "No safe model names were returned."}
          </Text>
          <Text style={styles.detail}>
            Used for scenario layers only. Coach and paper trading are
            unchanged.
          </Text>
          <Text style={styles.detail}>
            A connection verifies the model catalog; inference is not verified
            until you generate a scenario layer.
          </Text>
          {confirmDisconnect ? (
            <View style={styles.confirmation}>
              <Text style={styles.confirmationText}>
                Disconnect removes this saved key. Future scenario requests use
                the managed provider again; other features are unchanged.
              </Text>
              <View style={styles.actions}>
                <ActionButton
                  compact
                  kind="danger"
                  label={
                    disconnectProvider.isPending
                      ? "Disconnecting…"
                      : "Confirm disconnect"
                  }
                  disabled={disconnectProvider.isPending}
                  onPress={() => void disconnect()}
                />
                <ActionButton
                  compact
                  kind="ghost"
                  label="Cancel"
                  disabled={disconnectProvider.isPending}
                  onPress={() => {
                    clearApiKey();
                    setConfirmDisconnect(false);
                  }}
                />
              </View>
            </View>
          ) : (
            <ActionButton
              compact
              kind="secondary"
              label="Disconnect"
              onPress={() => setConfirmDisconnect(true)}
            />
          )}
        </View>
      ) : (
        <View style={styles.form}>
          <Text style={styles.label}>Paste your OpenAI API key here</Text>
          <TextInput
            accessibilityLabel="Paste your OpenAI API key here"
            value={apiKey}
            onChangeText={(value) => {
              setApiKey(value);
              setProviderError(undefined);
            }}
            placeholder="Paste your OpenAI API key here"
            placeholderTextColor={C.muted}
            secureTextEntry
            editable={!isConnecting}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={1024}
            textContentType="password"
            autoComplete="off"
            style={styles.input}
          />
          <Text style={styles.detail}>
            Sent securely to your private server; encrypted there. Never saved
            in your phone workspace.
          </Text>
          <ActionButton
            label={isConnecting ? "Saving…" : "Save & connect"}
            disabled={!hasValidApiKey || isConnecting}
            onPress={() => void saveAndConnect()}
          />
        </View>
      )}
      {providerError ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {providerError}
        </Text>
      ) : null}
    </View>
  );
}

/** The direct provider model note is intentionally local to AI scenario layers. */
export function ScenarioProviderDirectModelNote() {
  const providerStatus = trpc.forecast.providerStatus.useQuery();

  if (!providerStatus.data?.configured) return null;
  return (
    <Text style={styles.detail}>
      Direct Efficient/Deep uses GPT-5-mini/GPT-5, subject to the actual
      catalog.
    </Text>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 7,
    paddingTop: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  heading: { color: C.text, fontSize: 13, fontWeight: "800" },
  form: { gap: 6 },
  connected: { gap: 6 },
  connectedLabel: {
    color: C.lime,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  label: {
    color: C.muted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  input: {
    height: 42,
    color: C.text,
    backgroundColor: C.black + "66",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 10,
    fontSize: 16,
  },
  detail: { color: C.muted, fontSize: 10, lineHeight: 15, flexShrink: 1 },
  error: { color: C.rose, fontSize: 11, lineHeight: 17 },
  confirmation: {
    gap: 6,
    borderLeftWidth: 2,
    borderColor: C.rose,
    paddingLeft: 8,
  },
  confirmationText: { color: C.text, fontSize: 10, lineHeight: 15 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
});
