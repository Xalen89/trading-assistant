import { useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform, Text, View } from "react-native";
import type { Strategy, Workspace } from "@/lib/trading/model";
import {
  orbAutoPaperSettingsSchema,
  type OrbAutoPaperResult,
  type OrbAutoPaperSettings,
} from "@/lib/trading/orb-auto-types";
import { mergeCanonicalPaperTrade } from "@/lib/trading/trade-chart";
import { useWorkspace } from "@/hooks/use-workspace";
import { trpc } from "@/lib/trpc";
import { ActionButton, Card, Pill } from "./ui";
import { C } from "./theme";

type SettingsCarrier = { orbAutoPaper?: unknown };
const POLL_MS = 20_000;
const ERROR_COOLDOWN_MS = 60_000;

function savedSettings(workspace: Workspace) {
  return orbAutoPaperSettingsSchema.safeParse(
    (workspace.settings as SettingsCarrier).orbAutoPaper,
  );
}

function patchOrbSettings(workspace: Workspace, next: OrbAutoPaperSettings) {
  return {
    ...workspace,
    settings: {
      ...workspace.settings,
      orbAutoPaper: next,
    } as Workspace["settings"],
  };
}

function approvedSide(strategy: Strategy) {
  const config = strategy.confluence;
  if (
    config?.contract.strategyId !== strategy.id ||
    config.contract.strategyVersion !== strategy.version ||
    config.contract.approval.status !== "approved" ||
    (config.binding.side !== "long" && config.binding.side !== "short")
  )
    return undefined;
  return config.binding.side;
}

function sameSavedSetting(
  a: OrbAutoPaperSettings | undefined,
  b: OrbAutoPaperSettings | undefined,
) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function configuredNas100CfdMarket(strategy: Strategy) {
  const config = strategy.orbConfig;
  return config?.marketMode === "nas100-cfd" &&
    typeof config.instrumentMarket === "string" &&
    /^TL:\d{1,18}$/.test(config.instrumentMarket) &&
    typeof config.priceTick === "number" &&
    Number.isFinite(config.priceTick) &&
    config.priceTick > 0
    ? config.instrumentMarket
    : undefined;
}

/** Pure saved-revision scope check; it never changes an existing consent. */
export function orbAutoMarketMatchesStrategy(
  strategy: Strategy,
  market: OrbAutoPaperSettings["market"],
) {
  const nas100Market = configuredNas100CfdMarket(strategy);
  if (strategy.orbConfig?.marketMode === "nas100-cfd")
    return nas100Market !== undefined && market === nas100Market;
  // Legacy configurations intentionally retain their native-futures meaning.
  return market === "NQ" || market === "ES";
}

/** Compact strategy-sheet control. It never approves a confluence gate or creates a paper order. */
export function OrbAutoPaperControls({ strategy }: { strategy: Strategy }) {
  const { workspace, ownerAllowed, ready, update, saveCloud } = useWorkspace();
  const utils = trpc.useUtils();
  const foreground = useForegroundSnapshot();
  const parsed = savedSettings(workspace);
  const existing = parsed.success ? parsed.data : undefined;
  const activeForStrategy =
    existing?.strategyId === strategy.id ? existing : undefined;
  const nas100Market = configuredNas100CfdMarket(strategy);
  const activeScopeMatches = Boolean(
    activeForStrategy &&
    orbAutoMarketMatchesStrategy(strategy, activeForStrategy.market),
  );
  const armed = Boolean(
    activeForStrategy?.enabled &&
    (activeForStrategy.expiresAt || 0) > foreground.now &&
    activeScopeMatches,
  );
  // Existing canonical consent remains the visible selection. A newly saved CFD
  // convention never silently replaces it with a broker instrument.
  const [market, setMarket] = useState<OrbAutoPaperSettings["market"]>(
    activeForStrategy?.market || "NQ",
  );
  const [riskPct, setRiskPct] = useState<1 | 2>(
    activeForStrategy?.riskPct || 1,
  );
  const [cap, setCap] = useState<1 | 2 | 3>(
    activeForStrategy?.maxTradesPerDay || 1,
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const side = approvedSide(strategy);
  const drawdownReady =
    typeof workspace.settings.dailyDrawdownLimitPct === "number" &&
    Number.isFinite(workspace.settings.dailyDrawdownLimitPct) &&
    workspace.settings.dailyDrawdownLimitPct > 0;
  const selectedScopeMatches = orbAutoMarketMatchesStrategy(strategy, market);

  const canArm =
    ownerAllowed &&
    ready &&
    strategy.setupFamily === "orb" &&
    strategy.orbConfig?.confirmed === true &&
    Boolean(side) &&
    drawdownReady &&
    selectedScopeMatches &&
    !busy;

  const arm = async () => {
    if (!canArm) {
      setNotice(
        !side
          ? "Arm is unavailable until this exact strategy version has an approved same-side confluence gate."
          : !drawdownReady
            ? "Set and cloud-save a positive daily drawdown limit before arming."
            : !selectedScopeMatches
              ? nas100Market
                ? "Choose the saved NAS100 CFD instrument for the next explicit arm. Existing NQ/ES consent was not changed."
                : "Choose a native NQ or ES market for this saved ORB futures revision."
              : "Owner workspace is not ready for a canonical cloud save.",
      );
      return;
    }
    const now = Date.now();
    const next: OrbAutoPaperSettings = {
      version: 1,
      enabled: true,
      strategyId: strategy.id,
      market,
      riskPct,
      maxTradesPerDay: cap,
      armedAt: now,
      expiresAt: now + 24 * 60 * 60 * 1000,
    };
    const verified = orbAutoPaperSettingsSchema.safeParse(next);
    if (!verified.success) {
      setNotice(
        "The requested arm settings are invalid; no canonical setting changed.",
      );
      return;
    }
    setBusy(true);
    setNotice(undefined);
    const payload = patchOrbSettings(workspace, verified.data);
    update(() => payload);
    try {
      const saved = await saveCloud(payload);
      if (saved) {
        await utils.paper.orbAutoStatus.invalidate();
        const canonical = await utils.paper.orbAutoStatus.fetch();
        setNotice(
          sameSavedSetting(canonical.settings, verified.data) &&
            canonical.state === "waiting"
            ? "Armed for up to24hours with refreshed canonical consent. Actual configured-instrument, source, and gate checks still control every simulated entry."
            : `Consent saved, but the canonical checker is not ready: ${canonical.message}`,
        );
      } else {
        // A local draft must never present as armed after its CAS/cloud acknowledgement fails.
        update((current) =>
          patchOrbSettings(current, {
            version: 1,
            enabled: false,
            strategyId: strategy.id,
            market,
            riskPct,
            maxTradesPerDay: cap,
          }),
        );
        setNotice(
          "Cloud save did not confirm arming. This device is off; a prior canonical arm on another device must be turned off there as well.",
        );
      }
    } catch {
      update((current) =>
        patchOrbSettings(current, {
          version: 1,
          enabled: false,
          strategyId: strategy.id,
          market,
          riskPct,
          maxTradesPerDay: cap,
        }),
      );
      setNotice(
        "Cloud save failed. The displayed draft is not armed and no new foreground checks will start.",
      );
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    const previous = (workspace.settings as SettingsCarrier).orbAutoPaper;
    const next: OrbAutoPaperSettings = {
      version: 1,
      enabled: false,
      strategyId: strategy.id,
      market,
      riskPct,
      maxTradesPerDay: cap,
    };
    setBusy(true);
    setNotice(undefined);
    const payload = patchOrbSettings(workspace, next);
    update(() => payload);
    try {
      const saved = await saveCloud(payload);
      if (saved) await utils.paper.orbAutoStatus.invalidate();
      setNotice(
        saved
          ? "Off is confirmed in the canonical workspace. Existing paper trades are not closed."
          : "Off is active on this device, but cloud save failed; another device may still see the prior canonical arm. Existing paper trades are not closed.",
      );
      if (!saved && previous === undefined) {
        // Preserve the safe local-off state, not a missing setting that could be misread as an arm draft.
        update((current) => patchOrbSettings(current, next));
      }
    } catch {
      setNotice(
        "Off is active on this device, but cloud confirmation failed. Existing paper trades are not closed.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (strategy.setupFamily !== "orb") return null;
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
          ORB automatic paper
        </Text>
        <Pill
          label={
            armed
              ? "ARMED"
              : activeForStrategy?.enabled && !activeScopeMatches
                ? "SCOPE CHANGED"
                : activeForStrategy?.enabled
                  ? "EXPIRED"
                  : "OFF"
          }
          tone={
            armed
              ? "amber"
              : activeForStrategy?.enabled && !activeScopeMatches
                ? "rose"
                : "muted"
          }
        />
      </View>
      <Text style={{ color: C.muted, fontSize: 10, lineHeight: 15 }}>
        PAPER ONLY · AI-assisted explanation with deterministic ORB execution.
        No AI forecast, freeform model, broker order, or real-money execution is
        used.
      </Text>
      {activeForStrategy?.enabled ? (
        <Text style={{ color: C.muted, fontSize: 10, lineHeight: 15 }}>
          Saved scope: {activeForStrategy.market} · {activeForStrategy.riskPct}%
          · {activeForStrategy.maxTradesPerDay}/day · expires{" "}
          {new Date(activeForStrategy.expiresAt || 0).toLocaleString()}.
          {activeScopeMatches
            ? " Controls below edit the next explicit arm."
            : " This consent is retained but does not match the current saved ORB market convention, so it cannot run or be refreshed."}
        </Text>
      ) : null}
      <Text
        style={{ color: side ? C.text : C.amber, fontSize: 11, lineHeight: 16 }}
      >
        Approved side: {side?.toUpperCase() || "required"} · Daily drawdown:{" "}
        {drawdownReady
          ? `${workspace.settings.dailyDrawdownLimitPct}% saved`
          : "positive saved limit required"}
      </Text>
      {!selectedScopeMatches ? (
        <Text style={{ color: C.amber, fontSize: 10, lineHeight: 15 }}>
          {nas100Market
            ? `This saved ORB revision is NAS100 CFD bound to ${nas100Market} with its saved provider tick. Select that exact broker instrument below before a new arm; mode changes never arm automatically.`
            : "This saved ORB revision uses native futures. NAS100 CFD cannot be selected until a saved revision has an exact TradeLocker instrument and positive source tick."}
        </Text>
      ) : null}
      <View style={{ gap: 6 }}>
        <Text
          style={{
            color: C.muted,
            fontSize: 9,
            fontWeight: "800",
            letterSpacing: 0.4,
          }}
        >
          MARKET SCOPE FOR NEXT EXPLICIT ARM
        </Text>
        <View style={{ flexDirection: "row", gap: 7 }}>
          {["NQ", "ES", ...(nas100Market ? [nas100Market] : [])].map(
            (value) => (
              <ActionButton
                key={value}
                compact
                label={value === nas100Market ? `NAS100 CFD · ${value}` : value}
                kind={market === value ? "primary" : "secondary"}
                disabled={busy}
                onPress={() => setMarket(value)}
              />
            ),
          )}
        </View>
        {nas100Market ? (
          <Text style={{ color: C.muted, fontSize: 10, lineHeight: 15 }}>
            NAS100 CFD is an additional explicit choice from this saved strategy
            revision only. It does not replace a current or prior NQ/ES consent.
          </Text>
        ) : null}
      </View>
      <View style={{ gap: 6 }}>
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
            <ActionButton
              key={value}
              compact
              label={`${value}%`}
              kind={riskPct === value ? "primary" : "secondary"}
              disabled={busy}
              onPress={() => setRiskPct(value)}
            />
          ))}
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <Text
          style={{
            color: C.muted,
            fontSize: 9,
            fontWeight: "800",
            letterSpacing: 0.4,
          }}
        >
          MAX AUTOMATIC TRADES / LOCAL DAY
        </Text>
        <View style={{ flexDirection: "row", gap: 7 }}>
          {([1, 2, 3] as const).map((value) => (
            <ActionButton
              key={value}
              compact
              label={String(value)}
              kind={cap === value ? "primary" : "secondary"}
              disabled={busy}
              onPress={() => setCap(value)}
            />
          ))}
        </View>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
        <ActionButton
          compact
          label={busy ? "Saving…" : "Arm for 24 hours"}
          disabled={!canArm}
          onPress={() => void arm()}
        />
        <ActionButton
          compact
          label="Off"
          kind="danger"
          disabled={busy || !ownerAllowed || !ready}
          onPress={() => void turnOff()}
        />
      </View>
      <Text style={{ color: C.muted, fontSize: 10, lineHeight: 15 }}>
        Runs only while this app is foregrounded and visible, checking about
        every 20 seconds. Off stops new checks, not an already submitted entry
        or an existing paper trade.
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
    now: Date.now(),
  };
}

function useForegroundSnapshot() {
  const [snapshot, setSnapshot] = useState(foregroundSnapshot);
  useEffect(() => {
    const refresh = () => setSnapshot(foregroundSnapshot());
    const subscription = AppState.addEventListener("change", refresh);
    if (Platform.OS === "web" && typeof document !== "undefined")
      document.addEventListener("visibilitychange", refresh);
    const timer = setInterval(refresh, 5000);
    return () => {
      subscription.remove();
      clearInterval(timer);
      if (Platform.OS === "web" && typeof document !== "undefined")
        document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return snapshot;
}

/** Pure foreground eligibility helper: no timers, network calls, or persistence. */
export function canForegroundOrbPoll(input: {
  appActive: boolean;
  documentVisible: boolean;
  ownerAllowed: boolean;
  workspaceReady: boolean;
  canonicalEnabled: boolean;
  expiresAt?: number;
  now: number;
}) {
  return (
    input.appActive &&
    input.documentVisible &&
    input.ownerAllowed &&
    input.workspaceReady &&
    input.canonicalEnabled &&
    typeof input.expiresAt === "number" &&
    input.expiresAt > input.now
  );
}

/** Root-mounted foreground runner. It cannot schedule closed-app work and makes no write while off. */
export function OrbAutoPaperRunner() {
  const { workspace, ownerAllowed, ready, update } = useWorkspace();
  const utils = trpc.useUtils();
  const foreground = useForegroundSnapshot();
  const status = trpc.paper.orbAutoStatus.useQuery(undefined, {
    enabled: ownerAllowed && ready,
    retry: false,
    staleTime: 10_000,
    refetchInterval:
      foreground.appActive && foreground.documentVisible ? POLL_MS : false,
  });
  const check = trpc.paper.orbAutoCheck.useMutation({ retry: false });
  const [message, setMessage] = useState<string>();
  const inFlight = useRef(false);
  const generation = useRef(0);
  const cooldownUntil = useRef(0);
  const local = savedSettings(workspace);
  const canonical = status.data?.settings as OrbAutoPaperSettings | undefined;
  const localStrategy = workspace.strategies.find(
    (item) => item.id === canonical?.strategyId,
  );
  const canonicalScopeMatches = Boolean(
    localStrategy &&
    canonical &&
    orbAutoMarketMatchesStrategy(localStrategy, canonical.market),
  );
  const canonicalEnabled = Boolean(
    local.success &&
    local.data.enabled &&
    canonical?.enabled &&
    status.data?.state === "waiting" &&
    localStrategy?.orbConfig?.confirmed &&
    approvedSide(localStrategy) &&
    localStrategy.version === status.data?.strategyVersion &&
    localStrategy.confluence?.contract.configVersion ===
      status.data?.gateConfigVersion &&
    canonicalScopeMatches &&
    sameSavedSetting(local.data, canonical),
  );
  const eligible = canForegroundOrbPoll({
    appActive: foreground.appActive,
    documentVisible: foreground.documentVisible,
    ownerAllowed,
    workspaceReady: ready,
    canonicalEnabled,
    expiresAt: canonical?.expiresAt,
    now: foreground.now,
  });
  const current = useMemo(
    () => ({
      mutateAsync: check.mutateAsync,
      statusRefetch: status.refetch,
      ownerAllowed,
      ready,
      canonicalEnabled,
      expiresAt: canonical?.expiresAt,
      update,
      workspace,
    }),
    [
      canonical?.expiresAt,
      canonicalEnabled,
      check.mutateAsync,
      ownerAllowed,
      ready,
      status.refetch,
      update,
      workspace,
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
      const a = actions.current;
      if (
        !mounted ||
        generation.current !== myGeneration ||
        inFlight.current ||
        Date.now() < cooldownUntil.current ||
        !canForegroundOrbPoll({
          appActive: AppState.currentState === "active",
          documentVisible: documentIsVisible(),
          ownerAllowed: a.ownerAllowed,
          workspaceReady: a.ready,
          canonicalEnabled: a.canonicalEnabled,
          expiresAt: a.expiresAt,
          now: Date.now(),
        })
      )
        return;
      inFlight.current = true;
      try {
        const outcome = (await a.mutateAsync()) as OrbAutoPaperResult;
        if (!mounted || generation.current !== myGeneration) return;
        setMessage(outcome.message);
        if (outcome.state === "placed") {
          // Merge only canonical server-created paper records; keep unsaved local strategy/settings edits untouched.
          const cloud = await utils.workspace.load.fetch();
          if (
            !mounted ||
            generation.current !== myGeneration ||
            !cloud?.workspace
          )
            return;
          a.update((localWorkspace) => {
            const byId = new Map(
              localWorkspace.trades.map((trade) => [trade.id, trade]),
            );
            cloud.workspace.trades
              .filter((trade) => Boolean(trade.orderType))
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
          await a.statusRefetch();
        }
      } catch (error) {
        cooldownUntil.current = Date.now() + ERROR_COOLDOWN_MS;
        if (mounted && generation.current === myGeneration)
          setMessage(
            error instanceof Error
              ? `${error.message} Foreground checks paused briefly; no automatic mutation retry was made.`
              : "Foreground ORB check failed; checks paused briefly without an automatic mutation retry.",
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
  }, [eligible, utils.workspace.load]);

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
          "ORB paper runner armed: foreground and visible only. An already submitted entry may finish; Off does not close existing paper trades."}
      </Text>
    </View>
  );
}
