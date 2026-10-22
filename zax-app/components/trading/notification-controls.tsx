import { useEffect, useState } from "react";
import { Platform, Text, View } from "react-native";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import { type Timeframe } from "@/lib/trading/model";
import {
  ALERT_NOTIFICATION_KINDS,
  alertNotificationChannelId,
  notificationDeliveryPreference,
  type AlertNotificationKind,
} from "@/lib/trading/notification-scope";
import {
  useNotificationRegisterMutation,
  useNotificationActivateMutation,
} from "@/lib/trading/client";
import { ActionButton, Card, ToggleRow } from "./ui";
import { C } from "./theme";
import { validNotificationScope } from "@/lib/trading/notification-scope";

const notificationKindLabels: Record<AlertNotificationKind, string> = {
  above: "Price above",
  below: "Price below",
  fvg: "FVG event",
  setup: "Ready setup",
  "scenario-change": "Scenario update",
  "scenario-direction": "Direction flip",
  confluence: "Confluence",
  "below-gate": "Below-gate warning",
};

async function configureAndroidChannels(preferences: unknown) {
  if (Platform.OS !== "android") return;
  const notifications = await import("expo-notifications");
  await Promise.all(
    ALERT_NOTIFICATION_KINDS.map((kind) => {
      const preference = notificationDeliveryPreference(kind, preferences);
      return notifications.setNotificationChannelAsync(
        alertNotificationChannelId(kind),
        {
          name: `${notificationKindLabels[kind]} alerts`,
          importance: notifications.AndroidImportance.HIGH,
          sound: preference.sound ? "default" : undefined,
          enableVibrate: true,
          vibrationPattern: [0, 250, 150, 250],
          showBadge: preference.badge,
        },
      );
    }),
  );
}

function projectId() {
  const value =
    Constants.easConfig?.projectId ??
    Constants.expoConfig?.extra?.eas?.projectId ??
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value)
    ? value
    : undefined;
}
export function NotificationNavigation() {
  const { workspace, update, ready } = useWorkspace(),
    router = useRouter(),
    utils = trpc.useUtils();
  const { isAuthenticated } = useAuth();
  const notificationPreferences = workspace.settings.notificationPreferences;
  useEffect(() => {
    if (Platform.OS === "web" || !ready || !isAuthenticated) return;
    let stopped = false,
      subscription: { remove: () => void } | undefined,
      receiptSubscription: { remove: () => void } | undefined,
      clearHandler: (() => void) | undefined;
    import("expo-notifications")
      .then(async (notifications) => {
        const jump = async (response: any): Promise<boolean> => {
          const data = response?.notification?.request?.content?.data;
          if (!validNotificationScope(data)) return false;
          // The owned stored event is authoritative, not untrusted push payload fields.
          let captured;
          try {
            captured = await utils.notifications.event.fetch(
              { id: data.alertId },
              { staleTime: 0 },
            );
          } catch {
            return false;
          } // Keep cold-start response for a later authenticated retry.
          if (
            stopped ||
            !validNotificationScope({
              alertId: captured.id,
              market: captured.market,
              timeframe: captured.timeframe,
            })
          )
            return false;
          update((w) => ({
            ...w,
            market: captured.market,
            timeframe: captured.timeframe as Timeframe,
            activeStrategyId: w.strategies.some(
              (s) => s.id === captured.strategyId,
            )
              ? captured.strategyId
              : w.activeStrategyId,
            settings: {
              ...w.settings,
              analysisStrategyIds:
                captured.setup?.selectedStrategyIds?.filter((id) =>
                  w.strategies.some((s) => s.id === id && !s.archived),
                ) || w.settings.analysisStrategyIds,
            },
            events: [
              { ...captured, read: true },
              ...w.events.filter((e) => e.id !== captured.id),
            ],
          }));
          router.navigate({ pathname: "/", params: { alertId: captured.id } });
          return true;
        };
        if (stopped) return;
        notifications.setNotificationHandler({
          handleNotification: async (notification) => {
            const accepted = validNotificationScope(
              notification.request.content.data,
            );
            const preference = notificationDeliveryPreference(
              (notification.request.content.data as { alertKind?: unknown })
                ?.alertKind,
              notificationPreferences,
            );
            return {
              shouldShowBanner: accepted,
              shouldShowList: accepted,
              shouldPlaySound: accepted && preference.sound,
              shouldSetBadge: accepted && preference.badge,
            };
          },
        });
        clearHandler = () => notifications.setNotificationHandler(null);
        receiptSubscription = notifications.addNotificationReceivedListener(
          (notification) => {
            const data = notification.request.content.data;
            if (!validNotificationScope(data)) return;
            void utils.notifications.event
              .fetch({ id: data.alertId }, { staleTime: 0 })
              .then((captured) => {
                if (stopped) return;
                update((w) => ({
                  ...w,
                  events: [
                    { ...captured, read: false },
                    ...w.events.filter((e) => e.id !== captured.id),
                  ],
                }));
              })
              .catch(() => {
                /* No invented guest or unavailable alert evidence. */
              });
          },
        );
        subscription = notifications.addNotificationResponseReceivedListener(
          (response) => void jump(response),
        );
        const last = await notifications.getLastNotificationResponseAsync();
        if (last && !stopped && (await jump(last)))
          await notifications.clearLastNotificationResponseAsync();
      })
      .catch(() => {
        /* The genuine native build is required for this path. */
      });
    return () => {
      stopped = true;
      subscription?.remove();
      receiptSubscription?.remove();
      clearHandler?.();
    };
  }, [update, router, ready, utils, isAuthenticated, notificationPreferences]);
  return null;
}
export function NotificationControls() {
  const register = useNotificationRegisterMutation(),
    activate = useNotificationActivateMutation(),
    { workspace, update } = useWorkspace();
  const [message, setMessage] = useState<string>(),
    [busy, setBusy] = useState(false);
  const preferences = workspace.settings.notificationPreferences;
  const setDeliveryPreference = (
    kind: AlertNotificationKind,
    field: "sound" | "badge",
    value: boolean,
  ) => {
    const next: Record<string, { sound: boolean; badge: boolean }> = {
      ...preferences,
      [kind]: {
        ...notificationDeliveryPreference(kind, preferences),
        [field]: value,
      },
    };
    update((current) => ({
      ...current,
      settings: { ...current.settings, notificationPreferences: next },
    }));
    void configureAndroidChannels(next).catch(() => {
      /* Native channel controls need a real Android app; the saved preference remains owner-controlled. */
    });
  };
  const enable = async () => {
    setBusy(true);
    try {
      if (Platform.OS === "web")
        throw new Error(
          "Safari/browser Preview does not receive this native push path. Install the iOS/Android app build first.",
        );
      if (Constants.appOwnership === "expo")
        throw new Error(
          "Expo Go is not a remote-push build. Install a genuine development or release app with its own project credentials.",
        );
      const id = projectId();
      if (!id)
        throw new Error(
          "Native push awaits a genuine Expo project ID and APNs/FCM credentials from build setup.",
        );
      const notifications = await import("expo-notifications");
      await configureAndroidChannels(preferences);
      let permission = await notifications.getPermissionsAsync();
      if (permission.status !== "granted")
        permission = await notifications.requestPermissionsAsync();
      if (permission.status !== "granted")
        throw new Error(
          "Notification permission not granted. No token was registered.",
        );
      const token = await notifications.getExpoPushTokenAsync({
        projectId: id,
      });
      await register.mutateAsync({
        token: token.data,
        platform: Platform.OS === "ios" ? "ios" : "android",
      });
      setMessage(
        "Device enrolled. Save rules to cloud and activate deployed scans. Expo/provider acceptance is not proof of a native banner, sound, badge, or actual delivery; test a real trigger before relying on alerts.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Push setup unavailable.");
    } finally {
      setBusy(false);
    }
  };
  const schedule = async () => {
    try {
      const result = await activate.mutateAsync();
      setMessage(
        `Deployed schedule registered (${result.taskUid}). Verify a real trigger/device delivery. Baseline scan does not create a direction-flip alert.`,
      );
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Server activation unavailable.",
      );
    }
  };
  return (
    <Card>
      <Text style={{ color: C.text, fontSize: 14, fontWeight: "800" }}>
        Notifications after publication
      </Text>
      <Text style={{ color: C.muted, fontSize: 11, lineHeight: 18 }}>
        Publishing alone is not push activation. Deploy this backend; install
        your own iOS/Android development or release build with Expo
        project/APNs-FCM credentials; sign in as owner; grant notifications and
        enroll the device; save watch rules to cloud; activate deployed scans;
        verify an actual test delivery. Per-type controls below are saved in this
        private workspace; save the workspace to cloud after changing them.
      </Text>
      <Text style={{ color: C.amber, fontSize: 11, lineHeight: 18 }}>
        A deployed scheduler may scan while the app is closed, subject to feed,
        scheduler, OS and delivery availability. This source change neither
        enrolls a native device nor proves a displayed notification. Safari/web
        and Expo Go are unsupported; the app stays owner-only and alerts never
        place broker orders.
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <ActionButton
          label={busy ? "Registering…" : "Enable mobile push"}
          compact
          kind="secondary"
          disabled={busy}
          onPress={enable}
        />
        <ActionButton
          label={activate.isPending ? "Activating…" : "Activate deployed scans"}
          compact
          kind="secondary"
          disabled={activate.isPending}
          onPress={schedule}
        />
      </View>
      <Text style={{ color: C.text, fontSize: 12, fontWeight: "800", marginTop: 4 }}>
        Alert delivery preferences
      </Text>
      <Text style={{ color: C.muted, fontSize: 11, lineHeight: 16 }}>
        Sound and badge default on for every alert type. Android channels are
        high importance by default; Android system channel settings can still
        override app-proposed sound or badge behavior.
      </Text>
      {ALERT_NOTIFICATION_KINDS.map((kind) => {
        const preference = notificationDeliveryPreference(kind, preferences);
        return (
          <View key={kind} style={{ borderTopWidth: 1, borderTopColor: C.border, paddingTop: 7 }}>
            <Text style={{ color: C.text, fontSize: 12, fontWeight: "700" }}>
              {notificationKindLabels[kind]}
            </Text>
            <ToggleRow
              label="Sound"
              detail="Apply this type’s audible preference to native payloads."
              value={preference.sound}
              onChange={(value) => setDeliveryPreference(kind, "sound", value)}
            />
            <ToggleRow
              label="Badge"
              detail="Allow this type to request an app-icon badge."
              value={preference.badge}
              onChange={(value) => setDeliveryPreference(kind, "badge", value)}
            />
          </View>
        );
      })}
      {message ? (
        <Text style={{ color: C.amber, fontSize: 11, lineHeight: 17 }}>
          {message}
        </Text>
      ) : null}
    </Card>
  );
}
