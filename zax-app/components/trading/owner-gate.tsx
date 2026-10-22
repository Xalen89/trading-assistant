import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { trpc } from "@/lib/trpc";
import { AccountControls } from "./account-controls";
import { C } from "./theme";
export function OwnerGate({ children }: { children: ReactNode }) {
  const access = trpc.auth.access.useQuery(undefined, {
    retry: false,
    staleTime: 0,
    refetchInterval: 15000,
  });
  if (access.data?.allowed) return <>{children}</>;
  return (
    <View style={styles.page}>
      <View style={styles.content}>
        <Text style={styles.mark}>ZAX</Text>
        <Text style={styles.title}>Your private trading desk.</Text>
        <Text style={styles.detail}>
          {access.isLoading
            ? "Checking the verified owner session…"
            : access.data?.signedIn
              ? "This account is not the approved owner. Sign out and use your authorized account."
              : "Owner-only access. Sign in through your browser to continue. No guest charts or private account data are exposed."}
        </Text>
        {access.isLoading ? <ActivityIndicator color={C.lime} /> : null}
        {access.error ? (
          <Text style={styles.error}>
            {access.error.message}. Access remains locked until the server can
            verify ownership.
          </Text>
        ) : null}
        <AccountControls />
        <Text style={styles.footer}>
          Unpublished · simulated trading only · protected personal feed
        </Text>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: C.bg,
    justifyContent: "center",
    padding: 24,
  },
  content: { width: "100%", maxWidth: 430, alignSelf: "center", gap: 18 },
  mark: { color: C.lime, fontSize: 13, fontWeight: "900", letterSpacing: 3 },
  title: { color: C.text, fontSize: 32, lineHeight: 37, fontWeight: "800" },
  detail: { color: C.muted, fontSize: 14, lineHeight: 21 },
  error: { color: C.rose, fontSize: 12, lineHeight: 18 },
  footer: { color: C.muted, fontSize: 10, letterSpacing: 0.6 },
});

export function OwnerTools({ children }: { children: ReactNode }) {
  const access = trpc.auth.access.useQuery(undefined, {
    retry: false,
    staleTime: 0,
    refetchInterval: 15000,
  });
  return access.data?.allowed ? <>{children}</> : null;
}
