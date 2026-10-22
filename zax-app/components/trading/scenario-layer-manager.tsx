import { SECONDS } from "@/lib/trading/engine";
import {
  useMemo,
  useState,
  useEffect,
  useCallback,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { trpc } from "@/lib/trpc";
import type { Strategy, Timeframe } from "@/lib/trading/model";
import {
  MAX_DRAWN_SCENARIO_LAYERS,
  MAX_SAVED_SCENARIO_LAYERS,
  SCENARIO_LAYER_COLORS,
  SCENARIO_TIMEFRAMES,
  type ScenarioLayer,
} from "@/lib/trading/scenario-layer-types";
import { ActionButton, Input, ToggleRow } from "./ui";
import { Disclosure } from "./disclosure";
import { C } from "./theme";
import { AIQualitySelector } from "./ai-quality-selector";
import {
  ScenarioProviderDirectModelNote,
  ScenarioProviderSetup,
} from "./scenario-provider-setup";
import { useWorkspace } from "@/hooks/use-workspace";
import { aiQualityLabel, resolveAIQuality } from "@/lib/trading/ai-quality";
import {
  fixedAIServiceFailureCopy,
  localScenarioTimeoutCopy,
  LOCAL_SCENARIO_REQUEST_TIMEOUT_MS,
  readAIServiceFailureKind,
  ScenarioRequestEpoch,
  type AIServiceFailureKind,
} from "@/lib/trading/ai-request-lifecycle";

export type ScenarioLayerManagerProps = {
  kind: "ai" | "historical";
  market: string;
  timeframe: Timeframe;
  strategyId?: string;
  strategyIds: string[];
  strategies: Strategy[];
  combination: "all" | "any";
  timezone: string;
  disabled?: boolean;
  layers: ScenarioLayer[];
  onChange: Dispatch<SetStateAction<ScenarioLayer[]>>;
};

function layerId(kind: ScenarioLayer["kind"]) {
  return `scenario-${kind}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 9)}`;
}

function defaultLayerColor(
  kind: ScenarioLayer["kind"],
  layers: readonly ScenarioLayer[],
) {
  const firstColor = kind === "ai" ? 0 : 2;
  const ordinal = layers.filter((layer) => layer.kind === kind).length;
  return SCENARIO_LAYER_COLORS[
    (firstColor + ordinal) % SCENARIO_LAYER_COLORS.length
  ];
}

function ageLabel(atMilliseconds: number, now: number) {
  const seconds = Math.max(0, Math.floor((now - atMilliseconds) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function sourceAgeLabel(atSeconds: number, now: number) {
  return Number.isFinite(atSeconds) && atSeconds > 0
    ? ageLabel(atSeconds * 1000, now)
    : "age unavailable";
}

function targetLabel(frames: readonly Timeframe[]) {
  return frames.length === SCENARIO_TIMEFRAMES.length
    ? "all target frames"
    : frames.join(" · ");
}

const MANUS_HELP_URL = "https://help.manus.im";

const DIRECT_OPENAI_KINDS = [
  "authentication",
  "rate-limit",
  "timeout",
  "unavailable",
  "invalid-output",
] as const;
type DirectOpenAIKind = (typeof DIRECT_OPENAI_KINDS)[number];

function readDirectOpenAIKind(error: unknown): DirectOpenAIKind | undefined {
  if (!error || typeof error !== "object" || !("data" in error))
    return undefined;
  const data = (error as { data?: unknown }).data;
  if (!data || typeof data !== "object" || !("directOpenAIKind" in data))
    return undefined;
  const kind = (data as { directOpenAIKind?: unknown }).directOpenAIKind;
  return typeof kind === "string" &&
    DIRECT_OPENAI_KINDS.includes(kind as DirectOpenAIKind)
    ? (kind as DirectOpenAIKind)
    : undefined;
}

function directOpenAIFailureCopy(kind: DirectOpenAIKind): string {
  switch (kind) {
    case "authentication":
      return "The connected OpenAI key was rejected. Reconnect with a key that can use the listed models. Your question and saved layers were kept.";
    case "rate-limit":
      return "The connected OpenAI key is rate-limited. Wait and try again. Your question and saved layers were kept.";
    case "timeout":
      return "Direct OpenAI timed out. Check your connection and try again. Your question and saved layers were kept.";
    case "unavailable":
      return "Direct OpenAI is unavailable. Check your connection and try again later. Your question and saved layers were kept.";
    case "invalid-output":
      return "Direct OpenAI returned unusable scenario output. Check the request and try again. Your question and saved layers were kept.";
  }
}

function ManusHelpLink() {
  return (
    <Pressable
      accessibilityLabel="Open Manus Help"
      accessibilityRole="link"
      onPress={() =>
        void Linking.openURL(MANUS_HELP_URL).catch(() => undefined)
      }
    >
      <Text style={styles.helpLink}>Manus Help</Text>
    </Pressable>
  );
}

function drawnCount(
  layers: readonly ScenarioLayer[],
  market: string,
  target: Timeframe,
  omitId?: string,
) {
  return layers.filter(
    (layer) =>
      layer.id !== omitId &&
      layer.enabled &&
      layer.market === market &&
      layer.displayTimeframes.includes(target),
  ).length;
}

function firstFullTarget(
  layers: readonly ScenarioLayer[],
  market: string,
  targets: readonly Timeframe[],
  omitId?: string,
) {
  return targets.find(
    (target) =>
      drawnCount(layers, market, target, omitId) >= MAX_DRAWN_SCENARIO_LAYERS,
  );
}

/** Pure guard used both before an action and inside its functional state update. */
function additionBlock(
  layers: readonly ScenarioLayer[],
  layer: ScenarioLayer,
): string | undefined {
  if (layers.length >= MAX_SAVED_SCENARIO_LAYERS)
    return `Saved-layer limit reached (${MAX_SAVED_SCENARIO_LAYERS}). Remove a saved scenario before adding another.`;
  if (layers.some((candidate) => candidate.id === layer.id))
    return "This scenario layer already exists.";
  const fullTarget = firstFullTarget(
    layers,
    layer.market,
    layer.displayTimeframes,
  );
  return fullTarget
    ? `${fullTarget} already has ${MAX_DRAWN_SCENARIO_LAYERS} visible layers. Hide one before adding this layer; it will not be saved invisibly.`
    : undefined;
}

function TargetFramePicker({
  value,
  fallback,
  onChange,
}: {
  value: readonly Timeframe[];
  fallback: Timeframe;
  onChange: (value: Timeframe[]) => void;
}) {
  const allSelected = value.length === SCENARIO_TIMEFRAMES.length;
  const toggle = (frame: Timeframe) => {
    if (value.includes(frame)) {
      if (value.length === 1) return;
      onChange(value.filter((candidate) => candidate !== frame));
      return;
    }
    onChange([...value, frame]);
  };

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>SHOW ON TARGET FRAMES</Text>
      <View style={styles.chips}>
        <ActionButton
          compact
          label="All"
          kind={allSelected ? "primary" : "secondary"}
          onPress={() =>
            onChange(
              allSelected ? [value[0] ?? fallback] : [...SCENARIO_TIMEFRAMES],
            )
          }
        />
        {SCENARIO_TIMEFRAMES.map((frame) => (
          <ActionButton
            key={frame}
            compact
            label={frame}
            kind={value.includes(frame) ? "primary" : "secondary"}
            onPress={() => toggle(frame)}
          />
        ))}
      </View>
      <Text style={styles.detail}>
        {targetLabel(value)}. Keep at least one target chart selected.
      </Text>
    </View>
  );
}

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>LAYER COLOR</Text>
      <View style={styles.palette}>
        {SCENARIO_LAYER_COLORS.map((color) => {
          const selected = value === color;
          return (
            <Pressable
              key={color}
              accessibilityRole="button"
              accessibilityLabel={`Use ${color} for this scenario layer`}
              accessibilityState={{ selected }}
              onPress={() => onChange(color)}
              style={({ pressed }) => [
                styles.colorChoice,
                {
                  backgroundColor: color,
                  borderColor: selected ? C.text : color,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text style={styles.colorChoiceText}>{selected ? "✓" : ""}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.detail}>Stable saved color · {value}</Text>
    </View>
  );
}

/**
 * Saves display-only snapshots. The chart renderer owns projection; these controls never
 * replace chart history, setup evidence, or paper-order input.
 */
export function ScenarioLayerManager({
  kind,
  market,
  timeframe,
  strategyId,
  strategyIds,
  strategies,
  combination,
  timezone,
  disabled = false,
  layers,
  onChange,
}: ScenarioLayerManagerProps) {
  const { workspace } = useWorkspace();
  const aiQuality = resolveAIQuality(workspace.settings.aiQuality);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const [sourceTimeframe, setSourceTimeframe] = useState<Timeframe>(timeframe);
  const [displayTimeframes, setDisplayTimeframes] = useState<Timeframe[]>([
    timeframe,
  ]);
  const [instructions, setInstructions] = useState("");
  const [aiContextMode, setAiContextMode] = useState<
    "auto" | "current" | "last-available"
  >("auto");
  const [notice, setNotice] = useState<string>();
  const [refreshingId, setRefreshingId] = useState<string>();
  const aiGenerate = trpc.forecast.generate.useMutation();
  const historicalGenerate = trpc.scenarios.historical.useMutation();
  const [aiRequestPending, setAiRequestPending] = useState(false);
  const [aiFailure, setAiFailure] = useState<{
    kind?: AIServiceFailureKind;
    localTimeout?: boolean;
    directOpenAIKind?: DirectOpenAIKind;
  }>();
  const aiRequestEpochRef = useRef(new ScenarioRequestEpoch());
  const aiTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const clearAiRequestTimer = useCallback(() => {
    if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current);
    aiTimeoutRef.current = undefined;
  }, []);

  const settleAiRequest = useCallback(
    (requestEpoch: number) => {
      if (!aiRequestEpochRef.current.settle(requestEpoch)) return false;
      clearAiRequestTimer();
      setAiRequestPending(false);
      return true;
    },
    [clearAiRequestTimer],
  );

  const resetAiRequest = useCallback(() => {
    aiRequestEpochRef.current.invalidate();
    clearAiRequestTimer();
    setAiRequestPending(false);
    setAiFailure(undefined);
    setRefreshingId(undefined);
    aiGenerate.reset();
  }, [aiGenerate, clearAiRequestTimer]);

  const beginAiRequest = useCallback(() => {
    clearAiRequestTimer();
    aiGenerate.reset();
    const requestEpoch = aiRequestEpochRef.current.begin();
    setAiRequestPending(true);
    setAiFailure(undefined);
    aiTimeoutRef.current = setTimeout(() => {
      if (!settleAiRequest(requestEpoch)) return;
      aiGenerate.reset();
      setRefreshingId(undefined);
      // This only releases device controls; it cannot cancel server/model work.
      setAiFailure({ localTimeout: true });
    }, LOCAL_SCENARIO_REQUEST_TIMEOUT_MS);
    return requestEpoch;
  }, [aiGenerate, clearAiRequestTimer, settleAiRequest]);

  useEffect(
    () => () => {
      aiRequestEpochRef.current.invalidate();
      clearAiRequestTimer();
    },
    [clearAiRequestTimer],
  );

  const scopedLayers = useMemo(
    () =>
      layers
        .filter((layer) => layer.kind === kind && layer.market === market)
        .sort((left, right) => right.createdAt - left.createdAt),
    [kind, layers, market],
  );
  const snapshotsFor = useCallback(
    (ids: readonly string[]) =>
      ids.reduce<Strategy[]>((selected, id) => {
        const snapshot = strategies.find(
          (strategy) => strategy.id === id && !strategy.archived,
        );
        if (snapshot) selected.push(snapshot);
        return selected;
      }, []),
    [strategies],
  );
  const selectedSnapshots = useMemo(
    () => snapshotsFor(strategyIds),
    [snapshotsFor, strategyIds],
  );
  const hasSelectedSnapshots =
    strategyIds.length > 0 && selectedSnapshots.length === strategyIds.length;
  const blockedTarget = firstFullTarget(layers, market, displayTimeframes);
  const overCapacityTargets = SCENARIO_TIMEFRAMES.filter(
    (target) => drawnCount(layers, market, target) > MAX_DRAWN_SCENARIO_LAYERS,
  );

  const updateAddressedLayer = (
    id: string,
    revise: (layer: ScenarioLayer) => ScenarioLayer,
  ) => {
    onChange((current) =>
      current.map((layer) =>
        layer.id === id && layer.kind === kind && layer.market === market
          ? revise(layer)
          : layer,
      ),
    );
  };

  const updateLayerTargets = (layer: ScenarioLayer, targets: Timeframe[]) => {
    if (!targets.length) return;
    const fullTarget = layer.enabled
      ? firstFullTarget(layers, market, targets, layer.id)
      : undefined;
    if (fullTarget) {
      setNotice(
        `${fullTarget} already has ${MAX_DRAWN_SCENARIO_LAYERS} visible layers. Hide one there before showing this snapshot on that chart.`,
      );
      return;
    }
    setNotice(undefined);
    onChange((current) => {
      const addressed = current.find(
        (candidate) =>
          candidate.id === layer.id &&
          candidate.kind === kind &&
          candidate.market === market,
      );
      if (
        !addressed ||
        (addressed.enabled &&
          firstFullTarget(current, market, targets, addressed.id))
      )
        return current;
      return current.map((candidate) =>
        candidate.id === addressed.id
          ? { ...candidate, displayTimeframes: targets }
          : candidate,
      );
    });
  };

  const setLayerEnabled = (layer: ScenarioLayer, enabled: boolean) => {
    const fullTarget = enabled
      ? firstFullTarget(layers, market, layer.displayTimeframes, layer.id)
      : undefined;
    if (fullTarget) {
      setNotice(
        `${fullTarget} already has ${MAX_DRAWN_SCENARIO_LAYERS} visible layers. Hide one before showing this saved layer.`,
      );
      return;
    }
    setNotice(undefined);
    onChange((current) => {
      const addressed = current.find(
        (candidate) =>
          candidate.id === layer.id &&
          candidate.kind === kind &&
          candidate.market === market,
      );
      if (
        !addressed ||
        (enabled &&
          firstFullTarget(
            current,
            market,
            addressed.displayTimeframes,
            addressed.id,
          ))
      )
        return current;
      return current.map((candidate) =>
        candidate.id === addressed.id ? { ...candidate, enabled } : candidate,
      );
    });
  };

  const addLayer = (layer: ScenarioLayer) => {
    const block = additionBlock(layers, layer);
    if (block) {
      setNotice(block);
      return;
    }
    setNotice(undefined);
    onChange((current) => {
      // Re-check against the latest parent state after asynchronous generation.
      return additionBlock(current, layer) ? current : [...current, layer];
    });
  };

  const generateAiLayer = async () => {
    if (
      aiRequestPending ||
      blockedTarget ||
      layers.length >= MAX_SAVED_SCENARIO_LAYERS
    )
      return;
    const requestEpoch = beginAiRequest();
    try {
      const forecast = await aiGenerate.mutateAsync({
        market,
        timeframe: sourceTimeframe,
        strategyId,
        instructions,
        contextMode: aiContextMode,
        aiQuality,
      });
      if (!settleAiRequest(requestEpoch)) return;
      const id = layerId("ai");
      addLayer({
        id,
        label: `AI hypothesis · ${sourceTimeframe}`,
        kind: "ai",
        market,
        sourceTimeframe,
        displayTimeframes,
        enabled: true,
        style: "both",
        anchorMode: "follow",
        color: defaultLayerColor("ai", layers),
        createdAt: Date.now(),
        forecast,
      });
    } catch (error) {
      if (!settleAiRequest(requestEpoch)) return;
      aiGenerate.reset();
      setAiFailure({
        kind: readAIServiceFailureKind(error),
        directOpenAIKind: readDirectOpenAIKind(error),
      });
    }
  };

  const generateHistoricalLayer = async () => {
    if (
      blockedTarget ||
      layers.length >= MAX_SAVED_SCENARIO_LAYERS ||
      !hasSelectedSnapshots
    )
      return;
    try {
      const result = await historicalGenerate.mutateAsync({
        market,
        sourceTimeframe,
        strategyIds,
        strategies: selectedSnapshots,
        combination,
        timezone,
      });
      const id = layerId("historical");
      addLayer({
        id,
        label: `Historical continuation · ${sourceTimeframe}`,
        kind: "historical",
        market,
        sourceTimeframe,
        displayTimeframes,
        enabled: true,
        style: "both",
        anchorMode: "follow",
        color: defaultLayerColor("historical", layers),
        createdAt: result.generatedAt,
        scenario: result.scenario,
      });
    } catch {
      // The server withholds missing/invalid history rather than returning a substitute path.
    }
  };

  const refreshAiLayer = async (
    layer: Extract<ScenarioLayer, { kind: "ai" }>,
    mode?: "auto" | "current" | "last-available",
  ) => {
    if (aiRequestPending) return;
    setRefreshingId(layer.id);
    setNotice(undefined);
    const requestEpoch = beginAiRequest();
    try {
      const forecast = await aiGenerate.mutateAsync({
        market: layer.market,
        timeframe: layer.sourceTimeframe,
        strategyId: layer.forecast.strategyId ?? strategyId,
        instructions,
        aiQuality,
        contextMode:
          mode ??
          layer.forecast.requestedContextMode ??
          layer.forecast.contextMode ??
          aiContextMode,
      });
      if (!settleAiRequest(requestEpoch)) return;
      updateAddressedLayer(layer.id, (current) =>
        current.kind === "ai"
          ? { ...current, forecast, createdAt: Date.now() }
          : current,
      );
      setRefreshingId(undefined);
    } catch (error) {
      if (!settleAiRequest(requestEpoch)) return;
      aiGenerate.reset();
      setAiFailure({
        kind: readAIServiceFailureKind(error),
        directOpenAIKind: readDirectOpenAIKind(error),
      });
      setRefreshingId(undefined);
    }
  };

  const refreshHistoricalLayer = async (
    layer: Extract<ScenarioLayer, { kind: "historical" }>,
  ) => {
    const layerSnapshots = snapshotsFor(layer.scenario.strategyIds);
    if (layerSnapshots.length !== layer.scenario.strategyIds.length) {
      setNotice(
        "This historical layer's saved strategy IDs no longer have active local snapshots to refresh.",
      );
      return;
    }
    setRefreshingId(layer.id);
    setNotice(undefined);
    try {
      const result = await historicalGenerate.mutateAsync({
        market: layer.market,
        sourceTimeframe: layer.sourceTimeframe,
        strategyIds: layer.scenario.strategyIds,
        strategies: layerSnapshots,
        combination: layer.scenario.combination,
        timezone,
      });
      updateAddressedLayer(layer.id, (current) =>
        current.kind === "historical"
          ? {
              ...current,
              scenario: result.scenario,
              createdAt: result.generatedAt,
            }
          : current,
      );
    } catch {
      // Historical source absence remains a server-visible error; no replay is fabricated.
    } finally {
      setRefreshingId(undefined);
    }
  };

  const generating =
    kind === "ai" ? aiRequestPending : historicalGenerate.isPending;
  const aiServiceError = kind === "ai" && Boolean(aiFailure);
  const mutationError =
    kind === "historical" ? historicalGenerate.error?.message : undefined;
  const creationDisabled =
    disabled ||
    generating ||
    Boolean(blockedTarget) ||
    layers.length >= MAX_SAVED_SCENARIO_LAYERS ||
    (kind === "historical" && !hasSelectedSnapshots);

  return (
    <Disclosure
      title={
        kind === "ai" ? "AI scenario layers" : "Historical scenario layers"
      }
      summary={
        scopedLayers.length
          ? `${scopedLayers.length} saved for ${market} · line and ghost OHLC are display-only`
          : kind === "ai"
            ? "Add conditional hypotheses from a selected source frame"
            : "Add actual historical continuations from a selected source frame"
      }
    >
      <Text style={styles.note}>
        Each saved layer keeps its own source timeframe, color, target frames,
        and anchor behavior. A connected line joins the selected anchor to its
        projected path; ghost candles are display-only OHLC, never source
        history or order input.
      </Text>
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>SOURCE TIMEFRAME</Text>
        <View style={styles.chips}>
          {SCENARIO_TIMEFRAMES.map((candidate) => (
            <ActionButton
              key={candidate}
              compact
              label={candidate}
              kind={sourceTimeframe === candidate ? "primary" : "secondary"}
              onPress={() => setSourceTimeframe(candidate)}
            />
          ))}
        </View>
      </View>
      <TargetFramePicker
        value={displayTimeframes}
        fallback={timeframe}
        onChange={setDisplayTimeframes}
      />
      {kind === "ai" ? (
        <>
          <ScenarioProviderSetup />
          <AIQualitySelector disabled={aiRequestPending} />
          <ScenarioProviderDirectModelNote />
          <Input
            label="Scenario question (optional)"
            value={instructions}
            onChangeText={(value) => setInstructions(value.slice(0, 800))}
            placeholder="What conditions could extend or reverse this move?"
            multiline
          />
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>AI CONTEXT</Text>
            <View style={styles.chips}>
              <ActionButton
                compact
                label="Auto"
                kind={aiContextMode === "auto" ? "primary" : "secondary"}
                onPress={() => {
                  setAiContextMode("auto");
                  resetAiRequest();
                }}
              />
              <ActionButton
                compact
                label="Current"
                kind={aiContextMode === "current" ? "primary" : "secondary"}
                onPress={() => {
                  setAiContextMode("current");
                  resetAiRequest();
                }}
              />
              <ActionButton
                compact
                label="Last available"
                kind={
                  aiContextMode === "last-available" ? "primary" : "secondary"
                }
                onPress={() => {
                  setAiContextMode("last-available");
                  resetAiRequest();
                }}
              />
            </View>
            <Text style={styles.detail}>
              Auto refreshes your selected source: fresh data gives a
              current-context hypothesis; older bars give a clearly dated
              historical-only hypothesis. Current stays strict. Last available
              always uses completed history. No mode invents live data or
              changes your market/provider.
            </Text>
          </View>
        </>
      ) : (
        <Text style={styles.detail}>
          Uses selected local strategy snapshots with actual completed source
          history. A nearest historical continuation is retained only when
          present; no forecast path is invented.
        </Text>
      )}
      <ActionButton
        label={
          generating
            ? "Building scenario layer…"
            : kind === "ai"
              ? "Generate AI layer"
              : "Add historical layer"
        }
        onPress={() => {
          if (kind === "ai") void generateAiLayer();
          else void generateHistoricalLayer();
        }}
        disabled={creationDisabled}
      />
      {disabled ? (
        <Text style={styles.error}>
          Scenario generation requires connected actual market data; sample
          candles are not used.
        </Text>
      ) : null}
      {!hasSelectedSnapshots && kind === "historical" ? (
        <Text style={styles.error}>
          Select saved local strategy snapshots before creating a historical
          scenario.
        </Text>
      ) : null}
      {blockedTarget ? (
        <Text style={styles.error}>
          {blockedTarget} already has {MAX_DRAWN_SCENARIO_LAYERS} visible
          layers. Hide one before adding another; excess layers are not saved as
          hidden chart output.
        </Text>
      ) : null}
      {layers.length >= MAX_SAVED_SCENARIO_LAYERS ? (
        <Text style={styles.error}>
          Maximum {MAX_SAVED_SCENARIO_LAYERS} saved scenario layers reached.
        </Text>
      ) : null}
      {overCapacityTargets.length ? (
        <Text style={styles.error}>
          Existing enabled layers exceed the visible limit on{" "}
          {overCapacityTargets.join(", ")}. The chart draws only six per target
          frame; hide layers to resolve the explicit excess.
        </Text>
      ) : null}
      {notice ? <Text style={styles.error}>{notice}</Text> : null}
      {aiServiceError ? (
        <View accessibilityLiveRegion="polite" style={styles.errorBlock}>
          <Text style={styles.error}>
            {aiFailure?.localTimeout
              ? localScenarioTimeoutCopy("scenario-layer")
              : aiFailure?.directOpenAIKind
                ? directOpenAIFailureCopy(aiFailure.directOpenAIKind)
                : fixedAIServiceFailureCopy(aiFailure?.kind, "scenario-layer")}
          </Text>
          {aiFailure?.directOpenAIKind ? null : <ManusHelpLink />}
        </View>
      ) : null}
      {mutationError ? <Text style={styles.error}>{mutationError}</Text> : null}
      {scopedLayers.map((layer) => {
        const history =
          layer.kind === "historical" ? layer.scenario : undefined;
        const ai = layer.kind === "ai" ? layer.forecast : undefined;
        const sourceLastAt = ai
          ? (ai.sourceFreshness?.closedAt ??
            ai.sourceLastClosedAt + SECONDS[layer.sourceTimeframe])
          : history?.candles.at(-1)?.time;
        const expired = Boolean(ai && ai.expiresAt <= clock);
        const refreshing = refreshingId === layer.id;
        return (
          <View key={layer.id} style={styles.layer}>
            <View style={styles.layerHead}>
              <View style={[styles.color, { backgroundColor: layer.color }]} />
              <View style={styles.layerCopy}>
                <Text style={styles.layerTitle}>{layer.label}</Text>
                <Text style={styles.detail}>
                  {layer.color} · source {layer.sourceTimeframe} · targets{" "}
                  {targetLabel(layer.displayTimeframes)} · saved{" "}
                  {ageLabel(layer.createdAt, clock)}
                </Text>
              </View>
            </View>
            {expired ? (
              <Text style={styles.error}>
                EXPIRED AI snapshot · refresh it to draw a new source-context
                hypothesis. The saved projection is not silently replaced.
              </Text>
            ) : null}
            <ToggleRow
              label={layer.enabled ? "Show layer" : "Layer hidden"}
              detail={
                layer.enabled
                  ? "Counts toward the six visible layers on each selected target chart"
                  : "Saved but not drawn on target charts"
              }
              value={layer.enabled}
              onChange={(enabled) => setLayerEnabled(layer, enabled)}
            />
            <TargetFramePicker
              value={layer.displayTimeframes}
              fallback={timeframe}
              onChange={(targets) => updateLayerTargets(layer, targets)}
            />
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>DISPLAY STYLE</Text>
              <View style={styles.chips}>
                {(["line", "candles", "both"] as const).map((style) => (
                  <ActionButton
                    key={style}
                    compact
                    label={
                      style === "candles"
                        ? "Ghost OHLC"
                        : style === "both"
                          ? "Line + ghost"
                          : "Line"
                    }
                    kind={layer.style === style ? "primary" : "secondary"}
                    onPress={() =>
                      updateAddressedLayer(layer.id, (current) => ({
                        ...current,
                        style,
                      }))
                    }
                  />
                ))}
              </View>
            </View>
            <ColorPicker
              value={layer.color}
              onChange={(color) =>
                updateAddressedLayer(layer.id, (current) => ({
                  ...current,
                  color,
                }))
              }
            />
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>ANCHOR MODE</Text>
              <View style={styles.chips}>
                {(["follow", "fixed"] as const).map((anchorMode) => (
                  <ActionButton
                    key={anchorMode}
                    compact
                    label={
                      anchorMode === "follow" ? "Follow chart" : "Fixed source"
                    }
                    kind={
                      layer.anchorMode === anchorMode ? "primary" : "secondary"
                    }
                    onPress={() =>
                      updateAddressedLayer(layer.id, (current) => ({
                        ...current,
                        anchorMode,
                      }))
                    }
                  />
                ))}
              </View>
              <Text style={styles.detail}>
                {layer.anchorMode === "follow"
                  ? "Follow reconnects the display-only line/ghost to the latest actual chart candle and rescales this saved snapshot. It does not refresh analysis, source data, evidence, or orders."
                  : "Fixed keeps the original source anchor. It is a display setting only and does not refresh analysis, source data, evidence, or orders."}
              </Text>
            </View>
            <Text style={styles.provenance}>
              Source · {ai?.source ?? history?.source ?? "unavailable"}
              {sourceLastAt
                ? ` · ${ai ? "source bar closed" : "source continuation bar"} ${new Date(sourceLastAt * 1000).toLocaleString()} (${sourceAgeLabel(sourceLastAt, clock)})`
                : " · source age unavailable"}
            </Text>
            {layer.kind === "ai" ? (
              <>
                <Text style={styles.detail}>
                  Model · {layer.forecast.model} ·{" "}
                  {layer.forecast.aiQuality
                    ? aiQualityLabel(layer.forecast.aiQuality)
                    : "legacy quality not recorded"}
                </Text>
                {layer.forecast.generationNotice ? (
                  <Text style={styles.provenance}>
                    {layer.forecast.generationNotice}
                  </Text>
                ) : null}
                <Text style={styles.provenance}>
                  Hypothesis · {layer.forecast.thesis}
                </Text>
                <Text style={styles.detail}>
                  {layer.forecast.contextMode === "last-available"
                    ? `${layer.forecast.requestedContextMode === "auto" ? "Auto selected" : "Selected"} last available history · historical context, NOT current.`
                    : "Current source-context snapshot · hypothetical, not a probability."}
                  {layer.forecast.sourceFreshness
                    ? ` Closed-bar age ${Math.round(layer.forecast.sourceFreshness.ageSeconds)}s · ${layer.forecast.sourceFreshness.status}.`
                    : ""}
                </Text>
                {layer.forecast.contextResolutionReason ? (
                  <Text style={styles.provenance}>
                    {layer.forecast.contextResolutionReason}
                  </Text>
                ) : null}
                <ActionButton
                  compact
                  kind="secondary"
                  label={
                    refreshing
                      ? "Refreshing AI layer…"
                      : expired
                        ? "Refresh expired AI layer"
                        : "Regenerate AI layer"
                  }
                  onPress={() => void refreshAiLayer(layer)}
                  disabled={disabled || refreshing || aiRequestPending}
                />
                {layer.forecast.contextMode !== "last-available" ? (
                  <ActionButton
                    compact
                    kind="secondary"
                    label="Use available history for this layer"
                    onPress={() => void refreshAiLayer(layer, "last-available")}
                    disabled={disabled || refreshing || aiRequestPending}
                  />
                ) : null}
              </>
            ) : layer.kind === "historical" ? (
              <>
                <Text style={styles.provenance}>
                  History provenance ·{" "}
                  {layer.scenario.basis ?? "strategy-matched"}
                  {" · "}source shape{" "}
                  {new Date(layer.scenario.sourceAt * 1000).toLocaleString()}
                  {" · "}rebased historical shape/times, not original prices or
                  a forecast.
                </Text>
                <Text style={styles.detail}>{layer.scenario.explanation}</Text>
                <ActionButton
                  compact
                  kind="secondary"
                  label={
                    refreshing
                      ? "Refreshing historical layer…"
                      : "Refresh historical layer"
                  }
                  onPress={() => void refreshHistoricalLayer(layer)}
                  disabled={
                    disabled || refreshing || historicalGenerate.isPending
                  }
                />
              </>
            ) : null}
            <ActionButton
              compact
              kind="danger"
              label="Remove layer"
              onPress={() =>
                onChange((current) =>
                  current.filter(
                    (candidate) =>
                      !(
                        candidate.id === layer.id &&
                        candidate.kind === kind &&
                        candidate.market === market
                      ),
                  ),
                )
              }
            />
          </View>
        );
      })}
    </Disclosure>
  );
}

const styles = StyleSheet.create({
  note: { color: C.muted, fontSize: 11, lineHeight: 17 },
  error: { color: C.rose, fontSize: 11, lineHeight: 17 },
  errorBlock: { gap: 4 },
  helpLink: { color: C.lime, fontSize: 11, fontWeight: "800" },
  detail: { color: C.muted, fontSize: 10, lineHeight: 15, flexShrink: 1 },
  provenance: { color: C.text, fontSize: 11, lineHeight: 17, flexShrink: 1 },
  field: { gap: 5 },
  fieldLabel: {
    color: C.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.7,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  palette: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  colorChoice: {
    width: 36,
    height: 36,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  colorChoiceText: { color: C.black, fontSize: 18, fontWeight: "900" },
  layer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    paddingTop: 10,
    gap: 8,
  },
  layerHead: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  color: { width: 8, height: 38, borderRadius: 2, marginTop: 2 },
  layerCopy: { flex: 1, gap: 3 },
  layerTitle: {
    color: C.text,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "800",
  },
});
