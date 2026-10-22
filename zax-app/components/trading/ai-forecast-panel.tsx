import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Pressable, Text, View, StyleSheet } from "react-native";
import { trpc } from "@/lib/trpc";
import type { Timeframe } from "@/lib/trading/model";
import type { AIPriceForecast } from "@/lib/trading/ai-forecast";
import type { ScenarioStyle } from "@/lib/trading/chart-types";
import { ActionButton, Input, ToggleRow } from "./ui";
import { Disclosure } from "./disclosure";
import { C } from "./theme";
import { useWorkspace } from "@/hooks/use-workspace";
import { resolveAIQuality } from "@/lib/trading/ai-quality";
import { AIQualitySelector } from "./ai-quality-selector";
import { SECONDS } from "@/lib/trading/engine";
import {
  fixedAIServiceFailureCopy,
  localScenarioTimeoutCopy,
  LOCAL_SCENARIO_REQUEST_TIMEOUT_MS,
  readAIServiceFailureKind,
  ScenarioRequestEpoch,
  type AIServiceFailureKind,
} from "@/lib/trading/ai-request-lifecycle";

const MANUS_HELP_URL = "https://help.manus.im";

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

export function AIForecastPanel({
  market,
  timeframe,
  strategyId,
  disabled = false,
  onChange,
}: {
  market: string;
  timeframe: Timeframe;
  strategyId?: string;
  disabled?: boolean;
  onChange: (
    scenario: AIPriceForecast | undefined,
    style: ScenarioStyle,
  ) => void;
}) {
  const { workspace } = useWorkspace();
  const [scenario, setScenario] = useState<AIPriceForecast>();
  const [visible, setVisible] = useState(true);
  const [style, setStyle] = useState<ScenarioStyle>("line");
  const [instructions, setInstructions] = useState("");
  const generate = trpc.forecast.generate.useMutation();
  const [requestPending, setRequestPending] = useState(false);
  const [failure, setFailure] = useState<{
    kind?: AIServiceFailureKind;
    localTimeout?: boolean;
  }>();
  const requestEpochRef = useRef(new ScenarioRequestEpoch());
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const clearRequestTimer = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = undefined;
  }, []);

  useEffect(
    () => () => {
      requestEpochRef.current.invalidate();
      clearRequestTimer();
    },
    [clearRequestTimer],
  );

  const run = () => {
    if (requestPending) return;
    clearRequestTimer();
    generate.reset();
    const requestEpoch = requestEpochRef.current.begin();
    setRequestPending(true);
    setFailure(undefined);
    timeoutRef.current = setTimeout(() => {
      if (!requestEpochRef.current.settle(requestEpoch)) return;
      clearRequestTimer();
      setRequestPending(false);
      generate.reset();
      // This only releases device controls. It does not cancel server/model work.
      setFailure({ localTimeout: true });
    }, LOCAL_SCENARIO_REQUEST_TIMEOUT_MS);

    void generate
      .mutateAsync({
        market,
        timeframe,
        strategyId,
        instructions,
        aiQuality: resolveAIQuality(workspace.settings.aiQuality),
      })
      .then((next) => {
        if (!requestEpochRef.current.settle(requestEpoch)) return;
        clearRequestTimer();
        setRequestPending(false);
        setScenario(next);
        setVisible(true);
        onChange(next, style);
      })
      .catch((error: unknown) => {
        if (!requestEpochRef.current.settle(requestEpoch)) return;
        clearRequestTimer();
        setRequestPending(false);
        generate.reset();
        setFailure({ kind: readAIServiceFailureKind(error) });
      });
  };
  return (
    <Disclosure
      title="AI forecast scenario"
      summary={
        scenario
          ? `${scenario.direction.toUpperCase()} · hypothetical; tap to inspect`
          : "Generate a conditional scenario—not a prediction"
      }
    >
      <Text style={styles.note}>
        Blue projection is AI-generated hypothetical OHLC, separate from
        historical replay. It never triggers a paper entry or becomes
        source/validation data.
      </Text>
      <AIQualitySelector disabled={requestPending} />
      <Input
        label="Scenario question (optional)"
        value={instructions}
        onChangeText={(text) => setInstructions(text.slice(0, 800))}
        placeholder="What conditions could extend or reverse this move?"
        multiline
      />
      <ActionButton
        label={
          requestPending
            ? "Building scenario…"
            : scenario
              ? "Regenerate from selected source"
              : "Generate AI scenario"
        }
        onPress={run}
        disabled={disabled || requestPending}
      />
      {disabled ? (
        <Text style={styles.error}>
          Requires actual connected market data; sample candles are not used.
        </Text>
      ) : null}
      {failure ? (
        <View accessibilityLiveRegion="polite" style={styles.errorBlock}>
          <Text style={styles.error}>
            {failure.localTimeout
              ? localScenarioTimeoutCopy("scenario")
              : fixedAIServiceFailureCopy(failure.kind, "scenario")}
          </Text>
          <ManusHelpLink />
        </View>
      ) : null}
      {scenario ? (
        <>
          <ToggleRow
            label="Show AI forecast"
            detail="Independent of historical replay"
            value={visible}
            onChange={(v) => {
              setVisible(v);
              onChange(v ? scenario : undefined, style);
            }}
          />
          <View style={styles.row}>
            {(["line", "candles", "both"] as const).map((next) => (
              <ActionButton
                key={next}
                label={next}
                kind="secondary"
                onPress={() => {
                  setStyle(next);
                  onChange(visible ? scenario : undefined, next);
                }}
              />
            ))}
          </View>
          <Text style={styles.title}>{scenario.thesis}</Text>
          {scenario.generationNotice ? (
            <Text style={styles.note}>{scenario.generationNotice}</Text>
          ) : null}
          {scenario.contextMode === "last-available" ? (
            <Text style={styles.note}>
              Historical-only source context, not a current-market forecast.
            </Text>
          ) : null}
          <Text style={styles.note}>
            {scenario.assumptions.map((v) => `• ${v}`).join("\n")}
          </Text>
          <Text style={styles.note}>Invalidation: {scenario.invalidation}</Text>
          <Text style={styles.note}>
            {scenario.source} · {scenario.model}
            {"\n"}Generated {new Date(scenario.generatedAt).toLocaleString()} ·
            expires {new Date(scenario.expiresAt).toLocaleString()}
            {"\n"}Anchor {scenario.anchorPrice} · source closed bar{" "}
            {new Date(
              (scenario.sourceFreshness?.closedAt ??
                scenario.sourceLastClosedAt + SECONDS[scenario.timeframe]) *
                1000,
            ).toLocaleString()}
            {"\n"}No success probability or validated edge; projected volume is
            only a display placeholder.
          </Text>
          <ActionButton
            label="Remove forecast"
            kind="secondary"
            onPress={() => {
              setScenario(undefined);
              onChange(undefined, style);
            }}
          />
        </>
      ) : null}
    </Disclosure>
  );
}
const styles = StyleSheet.create({
  note: { color: C.muted, fontSize: 11, lineHeight: 17, marginVertical: 5 },
  error: { color: C.rose, fontSize: 12, lineHeight: 17, marginVertical: 6 },
  errorBlock: { gap: 2 },
  helpLink: { color: C.lime, fontSize: 12, fontWeight: "800" },
  title: { color: C.text, fontSize: 12, lineHeight: 18, marginVertical: 7 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 8 },
});
