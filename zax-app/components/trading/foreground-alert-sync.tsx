import { useEffect, useRef, useState } from "react";
import { AppState, Pressable, Text } from "react-native";
import { trpc } from "@/lib/trpc";
import { useWorkspace } from "@/hooks/use-workspace";
import { C } from "./theme";
/** Foreground saved-rule polling is not a closed-app scheduler or push delivery. */
export function ForegroundAlertSync() {
  const { workspace, update } = useWorkspace(),
    scan = trpc.notifications.scan.useMutation();
  const [message, setMessage] = useState<string>();
  const busy = useRef(false),
    active = useRef(AppState.currentState === "active"),
    actions = useRef({ scan: scan.mutateAsync, update });
  const enabled = workspace.alerts.some((r) => r.enabled);
  useEffect(() => {
    actions.current = { scan: scan.mutateAsync, update };
  }, [scan.mutateAsync, update]);
  useEffect(() => {
    if (!enabled) return;
    let mounted = true;
    const run = async () => {
      if (!active.current || busy.current) return;
      busy.current = true;
      try {
        const result = await actions.current.scan();
        if (mounted) {
          setMessage(undefined);
          actions.current.update((w) => {
            const states = new Map(
              result.ruleStates.map((state) => [state.id, state]),
            );
            return {
              ...w,
              alerts: w.alerts.map((rule) => {
                const state = states.get(rule.id);
                if (!state) return rule;
                const { deferReason: _deferReason, ...persistableState } = state;
                return { ...rule, ...persistableState };
              }),
              events: [
                ...result.events,
                ...w.events.filter(
                  (old) => !result.events.some((e) => e.id === old.id),
                ),
              ].slice(0, 2000),
            };
          });
        }
      } catch (e) {
        if (mounted)
          setMessage(
            e instanceof Error
              ? e.message
              : "Saved-rule foreground scan unavailable.",
          );
      } finally {
        busy.current = false;
      }
    };
    const subscription = AppState.addEventListener("change", (state) => {
      active.current = state === "active";
      if (active.current) void run();
    });
    const timer = setInterval(() => void run(), 60000);
    return () => {
      mounted = false;
      clearInterval(timer);
      subscription.remove();
    };
  }, [enabled]);
  return message ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Dismiss foreground scan error"
      onPress={() => setMessage(undefined)}
      style={{
        position: "absolute",
        bottom: 90,
        left: 16,
        right: 16,
        backgroundColor: C.surface,
        borderWidth: 1,
        borderColor: C.amber,
        padding: 10,
        borderRadius: 6,
      }}
    >
      <Text style={{ color: C.amber, fontSize: 11 }}>
        Alert scan: {message} · Tap to dismiss. Saved cloud rules only; no
        closed-app guarantee.
      </Text>
    </Pressable>
  ) : null;
}
