import { startOAuthLogin } from "@/constants/oauth";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  createPortableExport,
  downloadPortableExportOnWeb,
} from "@/lib/trading/workspace-portability";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Linking, Modal, Platform, StyleSheet, Text, View } from "react-native";
import { ActionButton, Card, Pill } from "./ui";
import { C } from "./theme";

/** Compact, embeddable controls for surfaces that need an explicit account state. */
export function AccountControls() {
  const { user, loading, error, isAuthenticated, logout, refresh } = useAuth();
  const {
    workspace,
    ownerAllowed,
    ready: workspaceReady,
    cloudState,
    cloudMessage,
    localState,
    localMessage,
    conflict,
    saveCloud,
    loadCloud,
    setAutoCloudSave,
    clearLocal,
    exportSnapshot,
  } = useWorkspace();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [loginInfo, setLoginInfo] = useState<string | null>(null);
  const [workspaceInfo, setWorkspaceInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [loadConfirmationOpen, setLoadConfirmationOpen] = useState(false);
  const [clearConfirmationOpen, setClearConfirmationOpen] = useState(false);

  const beginLogin = async () => {
    setActionError(null);
    setLoginInfo(null);
    setBusy(true);
    try {
      const result = await startOAuthLogin();
      if (result === "standalone")
        setLoginInfo(
          "Sign-in opened in another tab. Continue using StratDesk there; a cookie-blocking embedded Preview may remain signed out.",
        );
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Sign-in could not be started. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const refreshAccount = async () => {
    setActionError(null);
    setBusy(true);
    try {
      await refresh();
    } catch {
      setActionError("Could not refresh account status.");
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setActionError(null);
    setBusy(true);
    try {
      await logout();
      queryClient.clear();
    } catch {
      setActionError("Could not sign out. Device authentication state was cleared.");
    } finally {
      setBusy(false);
    }
  };

  const saveCurrentCloud = async () => {
    setWorkspaceInfo(null);
    setWorkspaceBusy(true);
    try {
      await saveCloud();
    } finally {
      setWorkspaceBusy(false);
    }
  };

  const confirmLoadCurrentCloud = async () => {
    setLoadConfirmationOpen(false);
    setWorkspaceInfo(null);
    setWorkspaceBusy(true);
    try {
      await loadCloud({ replaceLocal: true });
    } finally {
      setWorkspaceBusy(false);
    }
  };

  const confirmClearLocal = async () => {
    setClearConfirmationOpen(false);
    setWorkspaceInfo(null);
    setWorkspaceBusy(true);
    try {
      await clearLocal({ confirmed: true });
    } finally {
      setWorkspaceBusy(false);
    }
  };

  const exportLocalCopy = () => {
    setWorkspaceInfo(null);
    try {
      const snapshot = exportSnapshot();
      if (!snapshot) throw new Error("The verified owner workspace is not ready to export.");
      const artifact = createPortableExport(snapshot);
      if (Platform.OS === "web") {
        downloadPortableExportOnWeb(artifact);
        setWorkspaceInfo(
          `Downloaded ${artifact.filename}. It contains ${artifact.files.length} data-only files and excludes private source bytes, tokens, and internal URIs.`,
        );
      } else {
        setWorkspaceInfo(
          `Prepared ${artifact.filename} in memory. Native file sharing is not enabled in this build, so no private file was written.`,
        );
      }
    } catch (exportError) {
      setWorkspaceInfo(
        exportError instanceof Error
          ? exportError.message
          : "A portable local copy could not be prepared.",
      );
    }
  };

  const message = actionError ?? error?.message ?? null;
  const displayName =
    user?.name || user?.email || (isAuthenticated ? "Signed-in account" : "Guest workspace");
  const autoCloudSave = workspace.settings.autoCloudSave !== false;
  const persistenceBusy = workspaceBusy || cloudState === "saving";

  return (
    <>
      <Card style={styles.card}>
        <View style={styles.topLine}>
          <View>
            <Text style={styles.label}>Account</Text>
            <Text style={styles.title}>{loading ? "Checking session…" : displayName}</Text>
          </View>
          <Pill
            label={isAuthenticated ? "CONNECTED" : "SIGNED OUT"}
            tone={isAuthenticated ? "mint" : "muted"}
          />
        </View>

        {isAuthenticated && user?.email ? <Text style={styles.detail}>{user.email}</Text> : null}
        {!loading && !isAuthenticated ? (
          <Text style={styles.detail}>
            Sign in to associate account actions with your Manus session.
          </Text>
        ) : null}
        {!loading && !isAuthenticated && Platform.OS === "web" ? (
          <Text style={styles.detail}>
            If Preview blocks sign-in, open the app in your browser using the button below. Sign in and continue in that tab; the embedded Preview may still show signed out.
          </Text>
        ) : null}
        {message ? <Text accessibilityLiveRegion="polite" style={styles.error}>{message}</Text> : null}
        {loginInfo ? <Text accessibilityLiveRegion="polite" style={styles.detail}>{loginInfo}</Text> : null}

        <View style={styles.actions}>
          {isAuthenticated ? (
            <>
              <View style={styles.action}>
                <ActionButton
                  compact
                  label="Refresh"
                  kind="secondary"
                  icon="refresh-outline"
                  disabled={busy}
                  onPress={refreshAccount}
                />
              </View>
              <View style={styles.action}>
                <ActionButton
                  compact
                  label="Sign out"
                  kind="ghost"
                  icon="log-out-outline"
                  disabled={busy}
                  onPress={signOut}
                />
              </View>
            </>
          ) : (
            <View style={styles.action}>
              <ActionButton
                compact
                label={busy ? "Opening…" : "Sign in"}
                icon="log-in-outline"
                disabled={busy || loading}
                onPress={beginLogin}
              />
            </View>
          )}
        </View>
        {!isAuthenticated && Platform.OS === "web" && typeof window !== "undefined" ? (
          <ActionButton
            compact
            kind="secondary"
            label="Open app in browser tab"
            onPress={() => void Linking.openURL(window.location.origin)}
          />
        ) : null}

        {ownerAllowed ? (
          <View style={styles.persistence}>
            <View style={styles.persistenceHeader}>
              <Text style={styles.label}>Owner workspace</Text>
              <Pill
                label={cloudState === "saved" ? "CLOUD CURRENT" : "LOCAL"}
                tone={cloudState === "error" ? "rose" : cloudState === "saved" ? "mint" : "muted"}
              />
            </View>
            <Text style={styles.detail}>
              Local changes save on this device after two seconds and immediately when the app backgrounds. Cloud creation remains explicit; automatic cloud sync begins only after an owner cloud copy exists.
            </Text>
            {localState === "saving" ? (
              <Text accessibilityLiveRegion="polite" style={styles.detail}>
                Saving locally…
              </Text>
            ) : null}
            {localMessage ? (
              <Text accessibilityLiveRegion="polite" style={styles.error}>{localMessage}</Text>
            ) : null}
            {cloudMessage ? (
              <Text accessibilityLiveRegion="polite" style={cloudState === "error" ? styles.error : styles.detail}>
                {cloudMessage}
              </Text>
            ) : null}
            {conflict ? (
              <Text accessibilityLiveRegion="polite" style={styles.error}>
                {conflict.message}
              </Text>
            ) : null}
            {workspaceInfo ? (
              <Text accessibilityLiveRegion="polite" style={styles.detail}>{workspaceInfo}</Text>
            ) : null}
            <View style={styles.actions}>
              <View style={styles.action}>
                <ActionButton
                  compact
                  kind="secondary"
                  label={persistenceBusy ? "Working…" : "Save cloud"}
                  disabled={!workspaceReady || persistenceBusy || Boolean(conflict)}
                  onPress={() => void saveCurrentCloud()}
                />
              </View>
              <View style={styles.action}>
                <ActionButton
                  compact
                  kind="secondary"
                  label="Load current cloud"
                  disabled={!workspaceReady || persistenceBusy}
                  onPress={() => setLoadConfirmationOpen(true)}
                />
              </View>
            </View>
            <View style={styles.actions}>
              <View style={styles.action}>
                <ActionButton
                  compact
                  kind="ghost"
                  label={autoCloudSave ? "Auto cloud: on" : "Auto cloud: off"}
                  disabled={!workspaceReady || persistenceBusy}
                  onPress={() => setAutoCloudSave(!autoCloudSave)}
                />
              </View>
              <View style={styles.action}>
                <ActionButton
                  compact
                  kind="ghost"
                  label="Export local copy"
                  disabled={!workspaceReady || persistenceBusy}
                  onPress={exportLocalCopy}
                />
              </View>
            </View>
            <ActionButton
              compact
              kind="danger"
              label="Clear this device copy"
              disabled={!workspaceReady || persistenceBusy}
              onPress={() => setClearConfirmationOpen(true)}
            />
            <Text style={styles.meta}>
              Auto cloud is {autoCloudSave ? "on" : "off"}; the default is on after owner authorization and it can be changed at any time.
            </Text>
          </View>
        ) : null}
      </Card>

      <Modal
        visible={loadConfirmationOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLoadConfirmationOpen(false)}
      >
        <View style={styles.backdrop}>
          <View style={styles.dialog} accessibilityViewIsModal>
            <Text accessibilityRole="header" style={styles.dialogTitle}>Load current cloud workspace?</Text>
            <Text style={styles.dialogText}>
              This replaces the local workspace with the current owner cloud copy. Export local changes first if you need to keep them; cloud loading never merges the two copies.
            </Text>
            <View style={styles.dialogActions}>
              <ActionButton
                compact
                kind="secondary"
                label="Keep local"
                onPress={() => setLoadConfirmationOpen(false)}
              />
              <ActionButton
                compact
                kind="danger"
                label="Load current cloud"
                onPress={() => void confirmLoadCurrentCloud()}
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={clearConfirmationOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setClearConfirmationOpen(false)}
      >
        <View style={styles.backdrop}>
          <View style={styles.dialog} accessibilityViewIsModal>
            <Text accessibilityRole="header" style={styles.dialogTitle}>
              Clear this device copy?
            </Text>
            <Text style={styles.dialogText}>
              This removes only this device’s owner workspace envelope. It does not delete cloud data, private source files, or canonical paper-trade records. Export local changes first if needed.
            </Text>
            <View style={styles.dialogActions}>
              <ActionButton
                compact
                kind="secondary"
                label="Keep local copy"
                onPress={() => setClearConfirmationOpen(false)}
              />
              <ActionButton
                compact
                kind="danger"
                label="Clear device copy"
                onPress={() => void confirmClearLocal()}
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: 132, padding: 12, gap: 8 },
  topLine: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  label: { color: C.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" },
  title: { color: C.text, fontSize: 14, fontWeight: "800", marginTop: 2, maxWidth: 210 },
  detail: { color: C.muted, fontSize: 11, lineHeight: 16 },
  meta: { color: C.muted, fontSize: 10, lineHeight: 14 },
  error: { color: C.rose, fontSize: 11, lineHeight: 15 },
  actions: { flexDirection: "row", gap: 8, marginTop: "auto" },
  action: { flex: 1 },
  persistence: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border, marginTop: 4, paddingTop: 10, gap: 8 },
  persistenceHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  backdrop: { flex: 1, backgroundColor: "#00000099", justifyContent: "center", padding: 24 },
  dialog: { backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 14, padding: 18, gap: 12 },
  dialogTitle: { color: C.text, fontSize: 17, fontWeight: "800" },
  dialogText: { color: C.muted, fontSize: 13, lineHeight: 19 },
  dialogActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
});
