import { useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform, Pressable, Text, View } from "react-native";
import type { Strategy, Workspace } from "@/lib/trading/model";
import {
  sessionAutoSettingsSchema,
  type SessionAutoSettings,
  type SessionAutoStatus,
} from "@/lib/trading/session-auto-types";
import {
  isSessionStrategyFamily,
  sessionStrategyConfigSchema,
} from "@/lib/trading/session-strategy-model";
import { mergeCanonicalPaperTrade } from "@/lib/trading/trade-chart";
import { useWorkspace } from "@/hooks/use-workspace";
import { trpc } from "@/lib/trpc";
import { Card, Pill } from "./ui";
import { C } from "./theme";

type SettingsCarrier = { sessionAutoPaper?: unknown };
const POLL_MS = 20_000;
const ERROR_COOLDOWN_MS = 60_000;

function savedSettings(workspace: Workspace) {
  return sessionAutoSettingsSchema.safeParse(
    (workspace.settings as SettingsCarrier).sessionAutoPaper,
  );
}

function patchSessionSettings(
  workspace: Workspace,
  next: SessionAutoSettings,
): Workspace {
  return {
    ...workspace,
    settings: {
      ...workspace.settings,
      sessionAutoPaper: next,
    },
  } as Workspace;
}

function approvedSide(strategy: Strategy) {
  const confluence = strategy.confluence;
  if (
    !confluence ||
    confluence.contract.strategyId !== strategy.id ||
    confluence.contract.strategyVersion !== strategy.version ||
    confluence.contract.approval.status !== "approved" ||
    (confluence.binding.side !== "long" && confluence.binding.side !== "short")
  )
    return undefined;
  return confluence.binding.side;
}

function pdcComplete(strategy: Strategy) {
  const parsed = sessionStrategyConfigSchema.safeParse(strategy.sessionConfig);
  if (!parsed.success || parsed.data.family !== "pdc-continuation")
    return parsed.success;
  const config = parsed.data;
  if (config.pdcBasis === "unselected" || !config.priceTick) return false;
  if (config.targetMode === "owner-key-levels")
    return Boolean(config.longTargetPrice && config.shortTargetPrice);
  return Number.isInteger(config.premarketStartMinute);
}

function validSessionStrategy(strategy: Strategy) {
  const config = sessionStrategyConfigSchema.safeParse(strategy.sessionConfig);
  return (
    isSessionStrategyFamily(strategy.setupFamily) &&
    config.success &&
    config.data.family === strategy.setupFamily &&
    config.data.confirmed === true &&
    pdcComplete(strategy)
  );
}

function sameSavedSetting(
  left: SessionAutoSettings | undefined,
  right: SessionAutoSettings | undefined,
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function ChoiceButton({
  label,
  selected,
  disabled,
  onPress,
  danger = false,
}: {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
  danger?: boolean;
}) {
  const color = danger ? C.rose : selected ? C.lime : C.text;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: selected ? C.lime : danger ? `${C.rose}88` : C.border,
        backgroundColor: selected
          ? `${C.lime}18`
          : danger
            ? `${C.rose}16`
            : C.surface2,
        justifyContent: "center",
        alignItems: "center",
        borderRadius: 4,
        opacity: disabled ? 0.42 : pressed ? 0.72 : 1,
      })}
    >
      <Text style={{ color, fontSize: 11, fontWeight: "800" }}>{label}</Text>
    </Pressable>
  );
}

/**
 * Strategy-sheet consent control only. It never receives or sends a scheduled
 * origin, creates a job, approves a gate, or submits a paper order.
 */
export function SessionAutoControls({ strategy }: { strategy: Strategy }) {
  const { workspace, ownerAllowed, ready, update, saveCloud } = useWorkspace();
  const utils = trpc.useUtils();
  const status = trpc.paper.sessionAutoStatus.useQuery(undefined, {
    enabled: ownerAllowed && ready,
    retry: false,
    staleTime: 10_000,
  });
  const background = trpc.notifications.backgroundStatus.useQuery(undefined, {
    enabled: ownerAllowed && ready,
    retry: false,
    staleTime: 10_000,
  });
  const parsed = savedSettings(workspace);
  const saved = parsed.success ? parsed.data : undefined;
  const scoped = saved?.strategyId === strategy.id ? saved : undefined;
  const canonical = status?.data?.settings;
  const canonicalScoped =
    canonical?.strategyId === strategy.id ? canonical : undefined;
  const [riskPct, setRiskPct] = useState<1 | 2>(scoped?.riskPct || 1);
  const [maxTradesPerDay, setMaxTradesPerDay] = useState<1 | 2 | 3>(
    scoped?.maxTradesPerDay || 1,
  );
  const [runWhenClosed, setRunWhenClosed] = useState(
    scoped?.runWhenClosed || false,
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const side = approvedSide(strategy);
  const drawdownReady =
    typeof workspace.settings.dailyDrawdownLimitPct === "number" &&
    Number.isFinite(workspace.settings.dailyDrawdownLimitPct) &&
    workspace.settings.dailyDrawdownLimitPct > 0;
  const sourceReady = validSessionStrategy(strategy);
  const backgroundCanArm = Boolean(
    background.data?.isProduction &&
    background.data.schedulerRegistered &&
    background.data.callbackRecent,
  );
  const canArm =
    ownerAllowed &&
    ready &&
    sourceReady &&
    Boolean(side) &&
    drawdownReady &&
    !busy &&
    (!runWhenClosed || backgroundCanArm);
  const isArmed = Boolean(
    scoped?.enabled &&
    canonicalScoped?.enabled &&
    status?.data?.state === "waiting" &&
    sameSavedSetting(scoped, canonicalScoped),
  );

  const refreshCanonicalStatus = async () => {
    await utils.paper.sessionAutoStatus.invalidate();
    return utils.paper.sessionAutoStatus.fetch();
  };

  const arm = async () => {
    if (!canArm) {
      setNotice(
        !sourceReady
          ? "Complete and cloud-save the exact session configuration first. PDC also needs basis, price tick, and explicit source targets."
          : !side
            ? "Arm is unavailable until this exact strategy version has an approved same-direction confluence gate."
            : !drawdownReady
              ? "Set and cloud-save a positive daily drawdown limit before arming."
              : "Owner workspace is not ready for a canonical cloud save.",
      );
      return;
    }
    const now = Date.now();
    const next: SessionAutoSettings = {
      version: 1,
      enabled: true,
      strategyId: strategy.id,
      // The market is the owner's current workspace selection, never a hidden hard-coded contract.
      market: workspace.market,
      riskPct,
      maxTradesPerDay,
      // Separate deliberate consent; publication alone never sets this flag.
      runWhenClosed,
      armedAt: now,
      expiresAt: now + 24 * 60 * 60 * 1000,
    };
    const verified = sessionAutoSettingsSchema.safeParse(next);
    if (!verified.success) {
      setNotice(
        "The requested arm settings are invalid; no canonical setting changed.",
      );
      return;
    }
    setBusy(true);
    setNotice(undefined);
    if (runWhenClosed) {
      try {
        const actual = await utils.notifications.backgroundStatus.fetch();
        if (
          !actual.isProduction ||
          !actual.schedulerRegistered ||
          !actual.callbackRecent
        ) {
          setNotice(
            "Published monitoring needs a recent authenticated callback before background paper can be armed.",
          );
          setBusy(false);
          return;
        }
      } catch {
        setNotice(
          "Background monitoring could not be verified; no consent changed.",
        );
        setBusy(false);
        return;
      }
    }
    const payload = patchSessionSettings(workspace, verified.data);
    update(() => payload);
    try {
      const savedCloud = await saveCloud(payload);
      const refreshed = savedCloud ? await refreshCanonicalStatus() : undefined;
      const data = refreshed as SessionAutoStatus | undefined;
      if (
        savedCloud &&
        data?.state === "waiting" &&
        sameSavedSetting(data.settings, verified.data)
      )
        setNotice(
          "Armed for up to 24 hours with refreshed canonical consent. Every simulated entry still requires current source, gate, risk, and position checks.",
        );
      else if (savedCloud)
        setNotice(
          `Consent saved, but the canonical checker is not ready: ${data?.message || "status could not be refreshed"}`,
        );
      else {
        update((current) =>
          patchSessionSettings(current, {
            ...verified.data,
            enabled: false,
            armedAt: undefined,
            expiresAt: undefined,
          }),
        );
        setNotice(
          "Cloud save did not confirm arming. This device remains off; an arm on another device must be explicitly turned off there.",
        );
      }
    } catch {
      update((current) =>
        patchSessionSettings(current, {
          ...verified.data,
          enabled: false,
          armedAt: undefined,
          expiresAt: undefined,
        }),
      );
      setNotice(
        "Cloud save failed. This displayed draft is not armed and no new foreground checks will start.",
      );
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    const next: SessionAutoSettings = {
      version: 1,
      enabled: false,
      strategyId: strategy.id,
      market: workspace.market,
      riskPct,
      maxTradesPerDay,
      runWhenClosed: false,
    };
    setBusy(true);
    setNotice(undefined);
    const payload = patchSessionSettings(workspace, next);
    update(() => payload);
    try {
      const savedCloud = await saveCloud(payload);
      const refreshed = await refreshCanonicalStatus();
      const data = refreshed as SessionAutoStatus | undefined;
      setNotice(
        savedCloud && data?.state === "off"
          ? "Off is confirmed in the canonical workspace. Existing paper trades are not closed."
          : "Off is active on this device, but cloud confirmation did not complete. Existing paper trades are not closed.",
      );
    } catch {
      setNotice(
        "Off is active on this device, but cloud confirmation failed. Existing paper trades are not closed.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (!isSessionStrategyFamily(strategy.setupFamily)) return null;
  return (
    <Card>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          gap: 8,
          alignItems: "center",
        }}
      >
        <Text style={{ color: C.text, fontSize: 14, fontWeight: "900" }}>
          Session automatic paper
        </Text>
        <Pill
          label={isArmed ? "ARMED" : scoped?.enabled ? "CHECK STATUS" : "OFF"}
          tone={isArmed ? "amber" : "muted"}
        />
      </View>
      <Text style={{ color: C.muted, fontSize: 10, lineHeight: 15 }}>
        PAPER ONLY · deterministic London, Initial Balance, or PDC source rules.
        No broker or real-money order, AI trigger, default ATR bracket, partial,
        or break-even rule is used.
      </Text>
      <Text
        style={{
          color: sourceReady && side ? C.text : C.amber,
          fontSize: 11,
          lineHeight: 16,
        }}
      >
        Source: {sourceReady ? "confirmed" : "configuration incomplete"} ·
        Approved direction: {side?.toUpperCase() || "required"} · Daily
        drawdown:{" "}
        {drawdownReady
          ? `${workspace.settings.dailyDrawdownLimitPct}% saved`
          : "positive saved limit required"}
      </Text>
      <View style={{ gap: 4 }}>
        <Text
          style={{
            color: C.muted,
            fontSize: 9,
            fontWeight: "800",
            letterSpacing: 0.4,
          }}
        >
          OWNER-SELECTED MARKET
        </Text>
        <View
          style={{
            minHeight: 44,
            borderWidth: 1,
            borderColor: C.border,
            backgroundColor: C.surface2,
            justifyContent: "center",
            paddingHorizontal: 12,
          }}
        >
          <Text style={{ color: C.text, fontSize: 11, fontWeight: "800" }}>
            {workspace.market}
          </Text>
          <Text style={{ color: C.muted, fontSize: 9, marginTop: 2 }}>
            Uses the current workspace market selection when explicitly armed.
          </Text>
        </View>
      </View>
      <View style={{ gap: 4 }}>
        <Text
          style={{
            color: C.muted,
            fontSize: 9,
            fontWeight: "800",
            letterSpacing: 0.4,
          }}
        >
          RISK PER PAPER TRADE
        </Text>
        <View style={{ flexDirection: "row", gap: 7 }}>
          {([1, 2] as const).map((value) => (
            <ChoiceButton
              key={value}
              label={`${value}%`}
              selected={riskPct === value}
              disabled={busy}
              onPress={() => setRiskPct(value)}
            />
          ))}
        </View>
      </View>
      <View style={{ gap: 4 }}>
        <Text
          style={{
            color: C.muted,
            fontSize: 9,
            fontWeight: "800",
            letterSpacing: 0.4,
          }}
        >
          MAX AUTOMATIC ENTRIES / SOURCE-LOCAL DAY
        </Text>
        <View style={{ flexDirection: "row", gap: 7 }}>
          {([1, 2, 3] as const).map((value) => (
            <ChoiceButton
              key={value}
              label={String(value)}
              selected={maxTradesPerDay === value}
              disabled={busy}
              onPress={() => setMaxTradesPerDay(value)}
            />
          ))}
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 7, flexWrap: "wrap" }}>
        <ChoiceButton
          label="App active only"
          selected={!runWhenClosed}
          disabled={busy}
          onPress={() => setRunWhenClosed(false)}
        />
        <ChoiceButton
          label="Also when closed"
          selected={runWhenClosed}
          disabled={busy || !backgroundCanArm}
          onPress={() => setRunWhenClosed(true)}
        />
      </View>
      <Text style={{ color: C.muted, fontSize: 10, lineHeight: 15 }}>
        {background.data?.message ||
          "Published callback readiness has not been verified."}{" "}
        Background consent remains separate, expires with this arm and never
        creates a schedule.
      </Text>
      <View style={{ flexDirection: "row", gap: 7, flexWrap: "wrap" }}>
        <ChoiceButton
          label={busy ? "Saving…" : "Arm for 24 hours"}
          disabled={!canArm}
          selected
          onPress={() => void arm()}
        />
        <ChoiceButton
          label="Off"
          danger
          disabled={busy || !ownerAllowed || !ready}
          onPress={() => void turnOff()}
        />
      </View>
      <Text style={{ color: C.muted, fontSize: 10, lineHeight: 15 }}>
        Saved scope:{" "}
        {canonicalScoped?.runWhenClosed
          ? "app active plus separately consented published checks"
          : "foreground/visible only"}
        . Off stops new checks, not existing positions or an already-submitted
        entry. One-minute background sampling can miss fast pivot moves; device
        push receipt remains unverified.
      </Text>
      {notice ? (
        <Text style={{ color: C.amber, fontSize: 10, lineHeight: 15 }}>
          {notice}
        </Text>
      ) : null}
    </Card>
  );
}

function documentIsVisible() {
  return (
    typeof document === "undefined" || document.visibilityState === "visible"
  );
}

function foregroundSnapshot() {
  return {
    appActive: AppState.currentState === "active",
    documentVisible: documentIsVisible(),
  };
}

function useForegroundSnapshot() {
  const [snapshot, setSnapshot] = useState(foregroundSnapshot);
  useEffect(() => {
    const refresh = () => setSnapshot(foregroundSnapshot());
    const subscription = AppState.addEventListener("change", refresh);
    if (Platform.OS === "web" && typeof document !== "undefined")
      document.addEventListener("visibilitychange", refresh);
    return () => {
      subscription.remove();
      if (Platform.OS === "web" && typeof document !== "undefined")
        document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return snapshot;
}

/** Pure foreground eligibility predicate: it does no persistence, time sampling, or network work. */
export function canForegroundSessionPoll(input: {
  appActive: boolean;
  documentVisible: boolean;
  ownerAllowed: boolean;
  workspaceReady: boolean;
  canonicalEnabled: boolean;
}) {
  return (
    input.appActive &&
    input.documentVisible &&
    input.ownerAllowed &&
    input.workspaceReady &&
    input.canonicalEnabled
  );
}

/** Root-mounted foreground runner. Scheduled origin is never sent from this client. */
export function SessionAutoRunner() {
  const { workspace, ownerAllowed, ready, update } = useWorkspace();
  const utils = trpc.useUtils();
  const foreground = useForegroundSnapshot();
  const status = trpc.paper.sessionAutoStatus.useQuery(undefined, {
    enabled:
      ownerAllowed &&
      ready &&
      foreground.appActive &&
      foreground.documentVisible,
    retry: false,
    staleTime: 10_000,
    refetchInterval:
      foreground.appActive && foreground.documentVisible ? POLL_MS : false,
  });
  const check = trpc.paper.sessionAutoCheck.useMutation({ retry: false });
  const [message, setMessage] = useState<string>();
  const inFlight = useRef(false);
  const generation = useRef(0);
  const cooldownUntil = useRef(0);
  const local = savedSettings(workspace);
  const canonical = status?.data?.settings;
  const currentStrategy = workspace.strategies.find(
    (strategy) => strategy.id === canonical?.strategyId,
  );
  const canonicalEnabled = Boolean(
    local.success &&
    local.data.enabled &&
    canonical?.enabled &&
    status?.data?.state === "waiting" &&
    currentStrategy &&
    validSessionStrategy(currentStrategy) &&
    approvedSide(currentStrategy) &&
    currentStrategy.version === status.data?.strategyVersion &&
    currentStrategy.confluence?.contract.configVersion ===
      status.data?.gateConfigVersion &&
    sameSavedSetting(local.data, canonical),
  );
  const eligible = canForegroundSessionPoll({
    appActive: foreground.appActive,
    documentVisible: foreground.documentVisible,
    ownerAllowed,
    workspaceReady: ready,
    canonicalEnabled,
  });
  // The fixed literal protects future call-site edits: this client never selects "scheduled".
  const origin = useMemo(() => "foreground" as const, []);
  const current = useMemo(
    () => ({
      mutateAsync: check?.mutateAsync,
      refetch: status?.refetch,
      ownerAllowed,
      ready,
      canonicalEnabled,
      update,
      workspace,
      origin,
      loadCloud: () => utils.workspace.load.fetch(),
    }),
    [
      canonicalEnabled,
      check?.mutateAsync,
      origin,
      ownerAllowed,
      ready,
      status?.refetch,
      update,
      workspace,
      utils,
    ],
  );
  const actions = useRef(current);
  useEffect(() => {
    actions.current = current;
  }, [current]);

  useEffect(() => {
    if (!eligible) return;
    const myGeneration = ++generation.current;
    let mounted = true;
    const run = async () => {
      const action = actions.current;
      if (
        !mounted ||
        generation.current !== myGeneration ||
        action.origin !== "foreground" ||
        inFlight.current ||
        Date.now() < cooldownUntil.current ||
        !canForegroundSessionPoll({
          appActive: AppState.currentState === "active",
          documentVisible: documentIsVisible(),
          ownerAllowed: action.ownerAllowed,
          workspaceReady: action.ready,
          canonicalEnabled: action.canonicalEnabled,
        }) ||
        !action.mutateAsync
      )
        return;
      inFlight.current = true;
      try {
        const outcome = await action.mutateAsync();
        if (!mounted || generation.current !== myGeneration) return;
        setMessage(outcome.message);
        if (outcome.state === "placed") {
          const cloud = await action.loadCloud();
          if (
            !mounted ||
            generation.current !== myGeneration ||
            !cloud?.workspace
          )
            return;
          action.update((localWorkspace) => {
            const byId = new Map(
              localWorkspace.trades.map((trade) => [trade.id, trade]),
            );
            cloud.workspace.trades
              .filter((trade: { orderType?: unknown }) =>
                Boolean(trade.orderType),
              )
              .forEach((trade) =>
                byId.set(
                  trade.id,
                  mergeCanonicalPaperTrade(byId.get(trade.id), trade),
                ),
              );
            return {
              ...localWorkspace,
              trades: [...byId.values()]
                .sort((left, right) => right.createdAt - left.createdAt)
                .slice(0, 2000),
            };
          });
        }
        await action.refetch?.();
      } catch (error) {
        cooldownUntil.current = Date.now() + ERROR_COOLDOWN_MS;
        if (mounted && generation.current === myGeneration)
          setMessage(
            error instanceof Error
              ? `${error.message} Foreground checks paused briefly; no automatic mutation retry was made.`
              : "Foreground session check failed; checks paused briefly without an automatic mutation retry.",
          );
      } finally {
        inFlight.current = false;
      }
    };
    void run();
    const timer = setInterval(() => void run(), POLL_MS);
    return () => {
      mounted = false;
      generation.current += 1;
      clearInterval(timer);
    };
  }, [eligible]);

  if (!canonicalEnabled) return null;
  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", left: 14, right: 14, bottom: 82, gap: 3 }}
    >
      <Text
        style={{
          color: C.amber,
          fontSize: 10,
          lineHeight: 14,
          backgroundColor: C.surface,
          borderColor: C.border,
          borderWidth: 1,
          padding: 8,
        }}
      >
        {message ||
          "Session paper runner armed: foreground and visible only. An already submitted entry may finish; Off does not close existing paper trades."}
      </Text>
    </View>
  );
}
