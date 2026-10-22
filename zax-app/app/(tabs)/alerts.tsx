import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useWorkspace } from "@/hooks/use-workspace";
import { type AlertRule, type Timeframe, uid } from "@/lib/trading/model";
import {
  useNotificationScanMutation,
} from "@/lib/trading/client";
import {
  ActionButton,
  Card,
  EmptyState,
  Header,
  Input,
  Pill,
  Screen,
  SectionLabel,
  Sheet,
  ToggleRow,
} from "@/components/trading/ui";
import { C, formatPrice, mono } from "@/components/trading/theme";
import { NotificationControls } from "@/components/trading/notification-controls";
const timeframes: Timeframe[] = ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"];
const thresholdKinds: AlertRule["kind"][] = ["confluence", "below-gate"];
type AlertRuleScanView = AlertRule & {
  deferReason?: "provider-budget" | "scan-deadline" | "source-unavailable";
};
function selectedRuleStrategyIds(rule: AlertRule) {
  const ids = rule.combinedStrategyIds?.length
    ? rule.combinedStrategyIds
    : [rule.strategyId];
  return [...new Set(ids)].slice(0, 3);
}

export default function AlertsScreen() {
  const {
    workspace,
    update,
    setMarket,
    setTimeframe,
    saveCloud,
    cloudState,
    cloudMessage,
  } = useWorkspace();
  const router = useRouter();
  const backgroundStatus = trpc.notifications.backgroundStatus.useQuery(undefined, {
    staleTime: 20_000,
    refetchInterval: 30_000,
    retry: false,
  });
  const scan = useNotificationScanMutation();
  const [sheet, setSheet] = useState(false);
  const [alertMarket, setAlertMarket] = useState(workspace.market),
    [alertFrame, setAlertFrame] = useState<Timeframe>(workspace.timeframe),
    [alertStrategyIds, setAlertStrategyIds] = useState<string[]>([
      workspace.activeStrategyId,
    ]),
    [marketSearch, setMarketSearch] = useState(""),
    [minimumPoints, setMinimumPoints] = useState("70"),
    [minimumConditions, setMinimumConditions] = useState("2");
  const catalog = trpc.market.catalog.useQuery(undefined, {
    enabled: sheet,
    retry: false,
  });
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [kind, setKind] = useState<AlertRule["kind"]>("above");
  const [feedback, setFeedback] = useState<string>();
  const [scanReasons, setScanReasons] = useState<
    Record<string, AlertRuleScanView["deferReason"]>
  >({});
  const selectedAlertStrategies = workspace.strategies.filter((strategy) =>
    alertStrategyIds.includes(strategy.id),
  );
  const toggleAlertStrategy = (id: string) => {
    setAlertStrategyIds((current) => {
      if (current.includes(id))
        return current.length > 1
          ? current.filter((candidate) => candidate !== id)
          : current;
      if (current.length >= 3) {
        setFeedback("Alert rules support up to three selected strategies.");
        return current;
      }
      return [...current, id];
    });
  };
  const add = () => {
    const p = Number(price);
    if (
      !selectedAlertStrategies.length ||
      selectedAlertStrategies.length > 3 ||
      (["above", "below"].includes(kind) && (!Number.isFinite(p) || p <= 0))
    )
      return setFeedback(
        "Select one to three active strategies and enter a valid price threshold when required.",
      );
    if (
      thresholdKinds.includes(kind) &&
      (!Number.isFinite(Number(minimumPoints)) ||
        Number(minimumPoints) < 0 ||
        Number(minimumPoints) > 100 ||
        !Number.isInteger(Number(minimumConditions)) ||
        Number(minimumConditions) < 1 ||
        Number(minimumConditions) > 3)
    )
      return setFeedback(
        "Choose a 0–100 point threshold and one to three conditions.",
      );
    const rule: AlertRule = {
      id: uid("alert"),
      name: name.trim() || `${alertMarket} ${kind}`,
      market: alertMarket,
      timeframe: alertFrame,
      strategyId: alertStrategyIds[0]!,
      combinedStrategyIds: alertStrategyIds,
      minimumPoints: thresholdKinds.includes(kind)
        ? Number(minimumPoints)
        : undefined,
      minimumConditions:
        thresholdKinds.includes(kind)
          ? Number(minimumConditions)
          : undefined,
      kind,
      price: Number.isFinite(p) ? p : 0,
      enabled: true,
      cooldownMinutes: kind === "scenario-direction" ? 1 : 30,
      createdAt: Date.now(),
    };
    update((current) => ({ ...current, alerts: [rule, ...current.alerts] }));
    setSheet(false);
    setFeedback(
      "Rule saved locally. Save/test to apply it to canonical foreground scanning. Closed-app delivery remains pending activation.",
    );
  };
  const runScan = async () => {
    try {
      const saved = await saveCloud();
      if (!saved)
        return setFeedback(
          "Cloud save failed; this scan was not run against stale rules. Review account/save status and retry.",
        );
      const result = await scan.mutateAsync();
      setScanReasons(
        Object.fromEntries(
          result.ruleStates
            .filter((state) => state.deferReason)
            .map((state) => [state.id, state.deferReason]),
        ),
      );
      update((current) => ({
        ...current,
        alerts: current.alerts.map((rule) => {
          const state = result.ruleStates.find((item) => item.id === rule.id);
          if (!state) return rule;
          const { deferReason: _deferReason, ...persistableState } = state;
          return { ...rule, ...persistableState };
        }),
        events: [...result.events, ...current.events],
      }));
      setFeedback(result.message);
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Foreground scan unavailable; no event was created.",
      );
    }
  };
  const jump = (event: {
    id: string;
    market: string;
    timeframe: Timeframe;
    strategyId: string;
  }) => {
    setMarket(event.market);
    setTimeframe(event.timeframe);
    update((current) => ({
      ...current,
      activeStrategyId: event.strategyId,
      events: current.events.map((item) =>
        item.id === event.id ? { ...item, read: true } : item,
      ),
    }));
    router.navigate({ pathname: "/", params: { alertId: event.id } });
  };
  return (
    <Screen>
      <Header
        title="Alerts"
        subtitle="Rules are paper-analysis signals, not execution"
        right={
          <ActionButton
            label="New rule"
            compact
            icon="add"
            onPress={() => setSheet(true)}
          />
        }
      />
      <Card style={styles.activation}>
        <View style={{ flex: 1 }}>
          <Text style={styles.activationTitle}>
            {backgroundStatus.data?.isProduction
              ? "Enable deployed monitoring"
              : "Closed-app monitoring unavailable"}
          </Text>
          <Text style={styles.activationText}>
            {!backgroundStatus.data
              ? "Checking your owner-only deployment status. No local or Preview state is treated as closed-app activation."
              : !backgroundStatus.data.isProduction
                ? "Publication is required before closed-app monitoring can be enabled. Source/Preview is not deployment."
                : !backgroundStatus.data.schedulerRegistered
                  ? "No owner-mapped platform task is registered. Enable deployed monitoring, then wait for an authenticated callback."
                  : !backgroundStatus.data.lastScheduledHeartbeat
                    ? "The owner-mapped task is registered but no authenticated scheduled callback has completed yet."
                    : !backgroundStatus.data.devicePushRegistered
                      ? "An authenticated callback is recorded, but no native push device is registered."
                      : `Last authenticated callback: ${new Date(backgroundStatus.data.lastScheduledHeartbeat).toLocaleString()}. A registered device is still not verified until a real alert is received.`}
          </Text>
        </View>
        <Pill
          label={
            !backgroundStatus.data
              ? "CHECKING"
              : !backgroundStatus.data.isProduction
                ? "PUBLISH"
                : !backgroundStatus.data.schedulerRegistered
                  ? "PENDING"
                  : !backgroundStatus.data.lastScheduledHeartbeat
                    ? "AWAITING"
                    : "REPORTING"
          }
          tone={
            backgroundStatus.data?.isProduction &&
            backgroundStatus.data?.lastScheduledHeartbeat
              ? "mint"
              : "amber"
          }
        />
      </Card>
      {backgroundStatus.data?.isProduction ? (
        <NotificationControls />
      ) : (
        <Card>
          <Text style={styles.notice}>
            Native push enrollment and deployed-monitoring activation remain
            owner-protected and become available only after the private backend
            reports production. A registered device alone never verifies a
            banner, sound, badge, or delivery.
          </Text>
        </Card>
      )}
      <Card>
        <Text style={styles.activationTitle}>
          Historical scenario direction watch
        </Text>
        <Text style={styles.notice}>
          Choose Scenario direction flip to watch the actual line/ghost
          endpoint: Up → Down or Down → Up. First scan seeds a baseline; a
          different shape in the same direction is not a flip. Flat or missing
          history keeps the last direction. Rule/version/source changes reseed.
          One-minute cooldown coalesces brief reversals; broker scan rotation
          can add latency.
        </Text>
        <ActionButton
          label={cloudState === "saving" ? "Saving…" : "Save rules to cloud"}
          disabled={cloudState === "saving"}
          kind="secondary"
          compact
          onPress={() => void saveCloud()}
        />
        {cloudMessage ? (
          <Text style={styles.feedback}>{cloudMessage}</Text>
        ) : null}
      </Card>
      <Card>
        <Text style={styles.notice}>
          Broker scans share a 12-information-request budget and a 45-second
          deadline. Rules for the same market reuse quotes and candles; excess
          markets rotate to later scans. Pin a rule as high priority to allocate
          its broker market before normal markets; pinning never exceeds the
          provider budget. Each rule shows its latest real evaluation or visible
          defer reason. Delivery still requires a deployed backend and a
          verified native push device.
        </Text>
      </Card>
      <ActionButton
        label={
          scan.isPending
            ? "Scanning current cloud workspace…"
            : "Test foreground scan"
        }
        onPress={runScan}
        disabled={scan.isPending}
        icon="scan-outline"
        kind="secondary"
      />
      {feedback ? (
        <Card>
          <Text style={styles.feedback}>{feedback}</Text>
        </Card>
      ) : null}
      <SectionLabel>Rules</SectionLabel>
      {workspace.alerts.length ? (
        workspace.alerts.map((rule) => (
          <Card key={rule.id} style={styles.rule}>
            <View style={styles.ruleHead}>
              <View>
                <Text style={styles.ruleName}>{rule.name}</Text>
                <Text style={styles.ruleMeta}>
                  {rule.market} · {rule.timeframe} ·{" "}
                  {["above", "below"].includes(rule.kind)
                    ? `${rule.kind} ${formatPrice(rule.price)}`
                    : rule.kind}{" "}
                  · {rule.cooldownMinutes}m cooldown
                </Text>
                <Text style={styles.ruleMeta}>
                  {selectedRuleStrategyIds(rule).length} selected model(s):{" "}
                  {selectedRuleStrategyIds(rule)
                    .map(
                      (id) =>
                        workspace.strategies.find((strategy) => strategy.id === id)
                          ?.name || "unavailable strategy",
                    )
                    .join(", ")}
                </Text>
                {(() => {
                  const state = rule as AlertRuleScanView;
                  const deferReason = state.deferReason || scanReasons[rule.id];
                  const deferLabel =
                    deferReason === "provider-budget"
                      ? "provider budget"
                      : deferReason === "scan-deadline"
                        ? "scan deadline"
                        : deferReason === "source-unavailable"
                          ? "unavailable or stale source"
                          : undefined;
                  return (
                    <Text style={styles.ruleMeta}>
                      {state.lastEvaluatedAt
                        ? `Last evaluated ${new Date(state.lastEvaluatedAt).toLocaleString()}`
                        : "Not evaluated yet"}
                      {deferLabel
                        ? ` · deferred ${state.deferredCount || 0} scan(s): ${deferLabel}`
                        : " · no current deferral"}
                    </Text>
                  );
                })()}
              </View>
              <Pill
                label={rule.enabled ? "ON" : "OFF"}
                tone={rule.enabled ? "lime" : "muted"}
              />
            </View>
            <ToggleRow
              label="Enable rule"
              detail="Saved cloud rules scan each minute while this app is active; closed-app delivery is separate."
              value={rule.enabled}
              onChange={(value) =>
                update((current) => ({
                  ...current,
                  alerts: current.alerts.map((item) =>
                    item.id === rule.id ? { ...item, enabled: value } : item,
                  ),
                }))
              }
            />
            <ToggleRow
              label="High-priority scan"
              detail="Reserves the finite broker read budget ahead of normal markets. If high-priority markets exceed that budget, their visible rotation continues without extra provider reads."
              value={rule.priority === "high"}
              onChange={(value) =>
                update((current) => ({
                  ...current,
                  alerts: current.alerts.map((item) =>
                    item.id === rule.id
                      ? { ...item, priority: value ? "high" : "normal" }
                      : item,
                  ),
                }))
              }
            />
            <ActionButton
              label="Remove rule"
              compact
              kind="ghost"
              onPress={() =>
                update((current) => ({
                  ...current,
                  alerts: current.alerts.filter((item) => item.id !== rule.id),
                }))
              }
            />
          </Card>
        ))
      ) : (
        <EmptyState
          title="No alert rules"
          detail="Create a market threshold or deterministic FVG watch. Alerting will never submit a trade."
        />
      )}
      <SectionLabel>Alert history</SectionLabel>
      {workspace.events.length ? (
        workspace.events.map((event) => (
          <Pressable key={event.id} onPress={() => jump(event)}>
            <Card style={[styles.event, !event.read && styles.eventUnread]}>
              <View style={styles.ruleHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.ruleName}>{event.title}</Text>
                  <Text style={styles.ruleMeta}>{event.body}</Text>
                  <Text style={styles.ruleMeta}>
                    {event.market} · {event.timeframe} · {event.source}
                  </Text>
                </View>
                <IonArrow />
              </View>
            </Card>
          </Pressable>
        ))
      ) : (
        <Card>
          <Text style={styles.empty}>
            No delivered events. Event history remains empty until a rule
            genuinely triggers.
          </Text>
        </Card>
      )}
      <Sheet
        visible={sheet}
        title="Create alert rule"
        onClose={() => setSheet(false)}
      >
        <Input
          label="Rule name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. BTC breakout"
        />
        <SectionLabel>Rule condition</SectionLabel>
        <View style={styles.choices}>
          {(
            [
              "above",
              "below",
              "fvg",
              "setup",
              "scenario-change",
              "scenario-direction",
              "confluence",
              "below-gate",
            ] as AlertRule["kind"][]
          ).map((item) => (
            <ActionButton
              key={item}
              label={
                item === "fvg"
                  ? "FVG event"
                  : item === "scenario-direction"
                    ? "Scenario direction flip"
                    : item === "scenario-change"
                      ? "Scenario shape update"
                      : item.toUpperCase()
              }
              compact
              kind={kind === item ? "primary" : "secondary"}
              onPress={() => setKind(item)}
            />
          ))}
        </View>
        {["above", "below"].includes(kind) ? (
          <Input
            label={`Threshold · ${alertMarket}`}
            value={price}
            onChangeText={setPrice}
            keyboardType="numeric"
            placeholder="Current or chosen price"
          />
        ) : null}
        {thresholdKinds.includes(kind) ? (
          <>
            <Input
              label="Minimum confluence points /100"
              value={minimumPoints}
              onChangeText={setMinimumPoints}
              keyboardType="numeric"
            />
            <Input
              label="Minimum conditions met"
              value={minimumConditions}
              onChangeText={setMinimumConditions}
              keyboardType="numeric"
            />
            <Text style={styles.notice}>
              The named closed-bar trigger and approved confluence configuration
              are still required. Points and conditions are independent
              thresholds; a below-gate warning fires when either configured
              threshold is missed. Alerting is not execution.
            </Text>
          </>
        ) : null}
        <SectionLabel>Pair & strategy</SectionLabel>
        <Input
          value={marketSearch}
          onChangeText={setMarketSearch}
          placeholder="Search a connected pair / market"
        />
        <View style={styles.choices}>
          {catalog.data
            ?.filter((m) =>
              `${m.id} ${m.name}`
                .toLowerCase()
                .includes(marketSearch.toLowerCase()),
            )
            .slice(0, 6)
            .map((m) => (
              <ActionButton
                compact
                key={m.id}
                label={m.id}
                kind={alertMarket === m.id ? "primary" : "secondary"}
                onPress={() => setAlertMarket(m.id)}
              />
            ))}
        </View>
        <View style={styles.choices}>
          {workspace.strategies
            .filter((s) => !s.archived)
            .map((s) => (
              <ActionButton
                compact
                key={s.id}
                label={s.name}
                kind={alertStrategyIds.includes(s.id) ? "primary" : "secondary"}
                onPress={() => toggleAlertStrategy(s.id)}
              />
            ))}
        </View>
        <Text style={styles.notice}>
          Select one to three active strategies. The first selection remains
          the compatibility strategy ID; all selected IDs are saved together
          and used by setup, scenario, and confluence evaluation.
        </Text>
        <SectionLabel>Scope</SectionLabel>
        <Text style={styles.scope}>
          {alertMarket} · {alertFrame} ·{" "}
          {selectedAlertStrategies.map((strategy) => strategy.name).join(" + ")}
        </Text>
        <View style={styles.choices}>
          {timeframes.map((frame) => (
            <ActionButton
              key={frame}
              label={frame}
              compact
              kind={alertFrame === frame ? "primary" : "secondary"}
              onPress={() => setAlertFrame(frame)}
            />
          ))}
        </View>
        <Text style={styles.notice}>
          Rules are stored locally in this owner workspace; save to cloud before
          unattended detection. Cloud detection, scheduling, and push require
          explicit authenticated setup; no foreground test proves closed-app
          delivery.
        </Text>
        <ActionButton label="Save local alert rule" onPress={add} />
      </Sheet>
    </Screen>
  );
}
function IonArrow() {
  return <Text style={{ color: C.lime, fontSize: 20 }}>›</Text>;
}
const styles = StyleSheet.create({
  activation: { flexDirection: "row", gap: 12, borderColor: C.amber + "66" },
  activationTitle: { color: C.text, fontSize: 14, fontWeight: "800" },
  activationText: {
    color: C.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  feedback: { color: C.amber, fontSize: 12, lineHeight: 17 },
  rule: { gap: 5 },
  ruleHead: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  ruleName: { color: C.text, fontWeight: "800", fontSize: 14 },
  ruleMeta: { color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  event: { borderLeftWidth: 2, borderLeftColor: C.border },
  eventUnread: { borderLeftColor: C.lime },
  empty: { color: C.muted, fontSize: 12, lineHeight: 17 },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  scope: { color: C.text, fontFamily: mono, fontSize: 12 },
  notice: { color: C.amber, fontSize: 11, lineHeight: 16 },
});
