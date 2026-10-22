import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SESSION_DEFINITIONS } from "@/lib/trading/chart-sessions";
import type { InstrumentFacts } from "@/lib/trading/instrument-setup-types";
import type { Strategy } from "@/lib/trading/model";
import {
  ORB_DEFAULT_CONFIG,
  orbConfigSchema,
  type OrbConfig,
  type OrbSession,
} from "@/lib/trading/orb-model";
import { trpc } from "@/lib/trpc";
import { ActionButton, Card, Input, SectionLabel, ToggleRow } from "./ui";
import { C } from "./theme";

type Props = {
  strategy: Strategy;
  /** Selected workspace instrument; detection must never replace this selection. */
  marketId: string;
  onSave: (config: OrbConfig) => void;
  onClose?: () => void;
};

type OrbMarketMode = NonNullable<OrbConfig["marketMode"]>;
type PreparedOrbInstrument = {
  config: OrbConfig;
  facts: InstrumentFacts;
  remaining: string[];
};
type PreparedState = {
  requestKey: string;
  response: PreparedOrbInstrument;
};
type AppliedFacts = {
  market: string;
  priceTick: number;
  facts: InstrumentFacts;
  remaining: string[];
};

const ORB_SESSION_IDS: OrbSession["id"][] = ["asia", "london", "new-york"];
const ORB_SESSION_DEFINITIONS = SESSION_DEFINITIONS.filter((definition) =>
  ORB_SESSION_IDS.includes(definition.id as OrbSession["id"]),
);

function cloneDefaultConfig(): OrbConfig {
  return JSON.parse(JSON.stringify(ORB_DEFAULT_CONFIG)) as OrbConfig;
}

function validConfig(config?: OrbConfig): OrbConfig {
  const parsed = orbConfigSchema.safeParse(config);
  return parsed.success ? parsed.data : cloneDefaultConfig();
}

/** Older saved configurations have no field, which deliberately means native futures. */
function modeFor(config: OrbConfig): OrbMarketMode {
  return config.marketMode ?? "native-futures";
}

function positiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function hasNas100Binding(config: OrbConfig, marketId: string) {
  return (
    config.instrumentMarket === marketId && positiveNumber(config.priceTick)
  );
}

export function OrbStrategyEditor({
  strategy,
  marketId,
  onSave,
  onClose,
}: Props) {
  const prepareOrbInstrument = trpc.setup.prepareOrbInstrument.useMutation();
  const [draft, setDraft] = useState<OrbConfig>(() =>
    validConfig(strategy.orbConfig),
  );
  const [bufferText, setBufferText] = useState(String(draft.stopBufferTicks));
  const [prepared, setPrepared] = useState<PreparedState>();
  const [appliedFacts, setAppliedFacts] = useState<AppliedFacts>();
  const [detectionError, setDetectionError] = useState<string>();
  const mountedRef = useRef(true);
  const requestGenerationRef = useRef(0);

  const candidate = useMemo(
    () => ({ ...draft, stopBufferTicks: Number(bufferText) }),
    [bufferText, draft],
  );
  const parsed = orbConfigSchema.safeParse(candidate);
  const configError = parsed.success
    ? undefined
    : parsed.error.issues[0]?.message ||
      "Check the approved app configuration.";
  const mode = modeFor(draft);
  const detectionKey = `${strategy.id}:${marketId}:${JSON.stringify(candidate)}`;
  const currentDetectionIdentityRef = useRef(detectionKey);

  useLayoutEffect(() => {
    currentDetectionIdentityRef.current = detectionKey;
  }, [detectionKey]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestGenerationRef.current += 1;
    };
  }, []);

  const visiblePrepared =
    prepared?.requestKey === detectionKey &&
    prepared.response.facts.market === marketId &&
    prepared.response.config.instrumentMarket === marketId
      ? prepared.response
      : undefined;
  const applicableAppliedFacts =
    appliedFacts &&
    appliedFacts.market === draft.instrumentMarket &&
    appliedFacts.priceTick === draft.priceTick
      ? appliedFacts
      : undefined;
  const displayedFacts =
    visiblePrepared?.facts ?? applicableAppliedFacts?.facts;
  const displayedRemaining =
    visiblePrepared?.remaining ??
    (displayedFacts ? applicableAppliedFacts?.remaining : undefined);
  const cfdBound = hasNas100Binding(draft, marketId);
  const cfdTickMatchesFacts =
    cfdBound &&
    positiveNumber(displayedFacts?.tick?.value) &&
    displayedFacts.tick.value === draft.priceTick;
  const cfdReadiness = !cfdBound
    ? "Source blocks NAS100 CFD execution until this exact selected TradeLocker instrument and a positive provider tick are bound. Draft saving remains available."
    : !displayedFacts
      ? "A NAS100 CFD binding is saved in this draft, but current source facts have not been rechecked in this editor. Source validation still blocks execution when unavailable."
      : !cfdTickMatchesFacts
        ? "The displayed source tick does not match this draft binding. No NAS100 CFD execution is ready."
        : displayedRemaining?.length
          ? "Detection found remaining source prerequisites. This local draft may be saved, but source checks still block execution."
          : "Detected NAS100 CFD facts match this local draft. Save it explicitly; fresh source and gate checks still control execution.";

  const invalidateDetection = () => {
    requestGenerationRef.current += 1;
    setPrepared(undefined);
    setDetectionError(undefined);
  };

  const setTimezone = (timezone: OrbConfig["timezone"]) => {
    invalidateDetection();
    setDraft((current) => ({ ...current, timezone }));
  };

  const toggleSession = (id: OrbSession["id"]) => {
    const definition = ORB_SESSION_DEFINITIONS.find((item) => item.id === id);
    if (!definition) return;
    invalidateDetection();
    setDraft((current) => {
      const exists = current.sessions.some((session) => session.id === id);
      return {
        ...current,
        sessions: exists
          ? current.sessions.filter((session) => session.id !== id)
          : [
              ...current.sessions,
              {
                id,
                timezone: definition.timezone,
                startHour: definition.startHour,
                endHour: definition.endHour,
              },
            ],
      };
    });
  };

  const chooseMode = (nextMode: OrbMarketMode) => {
    if (mode === nextMode) return;
    invalidateDetection();
    setAppliedFacts(undefined);
    setDraft((current) => {
      const {
        instrumentMarket: _instrumentMarket,
        priceTick: _priceTick,
        ...rest
      } = current;
      return {
        ...rest,
        marketMode: nextMode,
        // A different market convention always requires a fresh deliberate confirmation.
        confirmed: false,
      };
    });
  };

  const detectNas100Tick = async () => {
    if (
      mode !== "nas100-cfd" ||
      !parsed.success ||
      prepareOrbInstrument.isPending
    )
      return;
    const requestGeneration = ++requestGenerationRef.current;
    const requestKey = detectionKey;
    setPrepared(undefined);
    setDetectionError(undefined);
    try {
      const response: PreparedOrbInstrument =
        await prepareOrbInstrument.mutateAsync({
          market: marketId,
          config: parsed.data,
        });
      if (
        !mountedRef.current ||
        requestGeneration !== requestGenerationRef.current ||
        requestKey !== currentDetectionIdentityRef.current
      )
        return;
      if (
        response.facts.market !== marketId ||
        response.config.instrumentMarket !== marketId
      ) {
        setDetectionError(
          "Instrument response did not match the selected workspace market. No local binding was applied.",
        );
        return;
      }
      setPrepared({ requestKey, response });
    } catch (error) {
      if (
        mountedRef.current &&
        requestGeneration === requestGenerationRef.current &&
        requestKey === currentDetectionIdentityRef.current
      )
        setDetectionError(
          error instanceof Error
            ? error.message
            : "NAS100 tick detection could not be completed.",
        );
    }
  };

  const applyDetectedNas100Tick = () => {
    if (!visiblePrepared || prepareOrbInstrument.isPending) return;
    const detected = orbConfigSchema.safeParse(visiblePrepared.config);
    const factTick = visiblePrepared.facts.tick?.value;
    if (
      !detected.success ||
      modeFor(detected.data) !== "nas100-cfd" ||
      detected.data.instrumentMarket !== marketId ||
      !positiveNumber(detected.data.priceTick) ||
      !positiveNumber(factTick) ||
      detected.data.priceTick !== factTick
    ) {
      setDetectionError(
        "The response did not provide a matching positive NAS100 provider tick for this selected instrument. No local fields were changed.",
      );
      return;
    }
    requestGenerationRef.current += 1;
    setPrepared(undefined);
    setDetectionError(undefined);
    setDraft(detected.data);
    setBufferText(String(detected.data.stopBufferTicks));
    setAppliedFacts({
      market: marketId,
      priceTick: detected.data.priceTick,
      facts: visiblePrepared.facts,
      remaining: visiblePrepared.remaining,
    });
  };

  return (
    <Card style={styles.editor}>
      <View style={styles.heading}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>ORB configuration</Text>
          <Text style={styles.meta}>
            Personal app settings for this reference. The video source and its
            factors remain read-only.
          </Text>
        </View>
        {onClose ? (
          <ActionButton label="Close" compact kind="ghost" onPress={onClose} />
        ) : null}
      </View>

      <SectionLabel>Immutable video rules</SectionLabel>
      <Text style={styles.detail}>
        Retained video rule: form the 08:00–08:15 EST opening candle, then
        consider entries from 09:00 inclusive to 11:00 exclusive EST.
      </Text>
      <Text style={styles.detail}>
        Retained 1m closed-bar sequence: break outside the range → a strictly
        later bar spanning the 50% range price → a strictly later closed
        continuation beyond the retest high/low.
      </Text>
      <Text style={styles.detail}>
        The video’s source target bands name NQ 50–150 points or ES 20–40
        points. They do not validate NAS100 CFD equivalence or a win-rate claim.
      </Text>
      <Text style={styles.notice}>
        Gold during Asia is reference-only: the video supplies no validated
        gold/Asia opening anchor, instrument specification, or session clock.
      </Text>

      <SectionLabel>Deliberate market convention</SectionLabel>
      <Text style={styles.meta}>
        Choose the convention for the next saved revision. Changing it clears
        the old instrument/tick binding and requires fresh owner confirmation;
        it never saves or arms anything.
      </Text>
      <View style={styles.actions}>
        {(
          [
            ["native-futures", "Native ES / NQ"],
            ["nas100-cfd", "NAS100 CFD"],
          ] as const
        ).map(([value, label]) => (
          <ActionButton
            key={value}
            label={label}
            compact
            kind={mode === value ? "primary" : "secondary"}
            onPress={() => chooseMode(value)}
          />
        ))}
      </View>
      {mode === "nas100-cfd" ? (
        <Text style={styles.notice}>
          NAS100 CFD app convention: 50–150 CFD price points with a 3R target.
          This is not a CME tick and does not establish validated equivalence to
          NQ or ES futures.
        </Text>
      ) : (
        <Text style={styles.meta}>
          Native ES/NQ keeps the video’s futures context. It does not transfer a
          CME tick convention to another provider or instrument.
        </Text>
      )}

      <SectionLabel>Approved app execution</SectionLabel>
      <ToggleRow
        label="Owner approval confirmed"
        detail="Explicitly enables these app conventions; it does not auto-approve any confluence gate."
        value={draft.confirmed}
        onChange={(confirmed) => {
          invalidateDetection();
          setDraft((current) => ({ ...current, confirmed }));
        }}
      />
      <Text style={styles.detail}>
        Entry timeframe is fixed at 1m. A completed 1m breakout must close
        strictly outside the range. The later retest and continuation both use
        completed bars; no same-bar ordering is assumed.
      </Text>
      <Text style={styles.detail}>
        Stop convention: beyond the opposite retest wick. The buffer stays in
        whole ticks; NAS100 CFD needs its actual provider tick and never infers
        one from price precision.
      </Text>
      <Input
        label="Stop buffer ticks (whole number 1–10)"
        value={bufferText}
        onChangeText={(value) => {
          invalidateDetection();
          setBufferText(value);
        }}
        keyboardType="numeric"
      />
      {configError ? <Text style={styles.error}>{configError}</Text> : null}

      <Text style={styles.meta}>
        Clock basis: the video calls this EST. Fixed EST is UTC−5 all year; New
        York follows daylight saving time. Device time does not reinterpret
        source bars.
      </Text>
      <View style={styles.actions}>
        {(["Etc/GMT+5", "America/New_York"] as const).map((timezone) => (
          <ActionButton
            key={timezone}
            label={
              timezone === "Etc/GMT+5" ? "Fixed EST (UTC−5)" : "New York (DST)"
            }
            compact
            kind={draft.timezone === timezone ? "primary" : "secondary"}
            onPress={() => setTimezone(timezone)}
          />
        ))}
      </View>

      {mode === "nas100-cfd" ? (
        <Nas100TickDetector
          marketId={marketId}
          pending={prepareOrbInstrument.isPending}
          disabled={!parsed.success}
          result={visiblePrepared}
          facts={displayedFacts}
          remaining={displayedRemaining}
          error={detectionError}
          binding={
            cfdBound
              ? { market: draft.instrumentMarket!, tick: draft.priceTick! }
              : undefined
          }
          readiness={cfdReadiness}
          onDetect={() => void detectNas100Tick()}
          onApply={applyDetectedNas100Tick}
        />
      ) : (
        <Text
          style={
            mode === "native-futures" &&
            (marketId === "NQ" || marketId === "ES")
              ? styles.meta
              : styles.error
          }
        >
          {marketId === "NQ" || marketId === "ES"
            ? `Current workspace market ${marketId}: native futures context is selected.`
            : `Current workspace market ${marketId} is not an ES/NQ futures source. Choose NAS100 CFD only when the server verifies the actual selected TradeLocker NAS100 index.`}
        </Text>
      )}

      <SectionLabel>Optional analytical session clocks</SectionLabel>
      <Text style={styles.notice}>
        These clocks are not in the video and remain untested with limited
        loaded hourly history. They add no automatic bias or target filter;
        leave all off when their source clocks are unknown.
      </Text>
      {ORB_SESSION_DEFINITIONS.map((definition) => {
        const selected = draft.sessions.some(
          (session) => session.id === definition.id,
        );
        return (
          <ToggleRow
            key={definition.id}
            label={`${definition.label} analytical clock`}
            detail={`${definition.timezone} · ${definition.startHour}:00–${definition.endHour}:00`}
            value={selected}
            onChange={() => toggleSession(definition.id as OrbSession["id"])}
          />
        );
      })}

      <ActionButton
        label="Save ORB app configuration"
        disabled={!parsed.success}
        onPress={() => {
          if (parsed.success) onSave(parsed.data);
        }}
      />
      <Text style={styles.meta}>
        Saving creates a local strategy revision and clears any prior confluence
        approval. An incomplete NAS100 CFD configuration may be saved as a
        draft, but its source prerequisites continue to block execution. Use the
        explicit workspace cloud-save action to preserve it remotely.
      </Text>
    </Card>
  );
}

function Nas100TickDetector({
  marketId,
  pending,
  disabled,
  result,
  facts,
  remaining,
  error,
  binding,
  readiness,
  onDetect,
  onApply,
}: {
  marketId: string;
  pending: boolean;
  disabled: boolean;
  result?: PreparedOrbInstrument;
  facts?: InstrumentFacts;
  remaining?: string[];
  error?: string;
  binding?: { market: string; tick: number };
  readiness: string;
  onDetect: () => void;
  onApply: () => void;
}) {
  const sourceTick = facts?.tick;
  return (
    <View style={styles.detector}>
      <View style={styles.heading}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionInline}>NAS100 CFD instrument setup</Text>
          <Text style={styles.meta}>
            Selected workspace instrument: {marketId}. Detection reads metadata
            only; it does not save a workspace, arm automation, or create an
            order.
          </Text>
        </View>
        <ActionButton
          label={pending ? "Detecting…" : "Detect NAS100 tick"}
          compact
          kind="secondary"
          disabled={disabled || pending}
          onPress={onDetect}
        />
      </View>
      {error ? <Text style={styles.error}>DETECTION · {error}</Text> : null}
      {facts ? (
        <>
          <Text style={styles.fact}>
            Source · {facts.source} · symbol {facts.providerSymbol}
          </Text>
          <Text style={styles.fact}>
            Actual provider tick ·{" "}
            {sourceTick
              ? `${sourceTick.value} (${sourceTick.source})`
              : "unverified"}
          </Text>
          <Text style={styles.fact}>
            Retrieved · {new Date(facts.retrievedAt).toLocaleString()}
          </Text>
          {facts.messages.map((message, index) => (
            <Text key={`fact:${index}:${message}`} style={styles.meta}>
              Source note · {message}
            </Text>
          ))}
        </>
      ) : null}
      <Text style={styles.fact}>
        Draft binding ·{" "}
        {binding ? `${binding.market} · tick ${binding.tick}` : "none"}
      </Text>
      <Text style={styles.notice}>Readiness · {readiness}</Text>
      {remaining?.map((item, index) => (
        <Text key={`remaining:${index}:${item}`} style={styles.notice}>
          Source prerequisite · {item}
        </Text>
      ))}
      {result ? (
        <>
          <ActionButton
            label="Apply detected tick locally"
            compact
            disabled={pending}
            onPress={onApply}
          />
          <Text style={styles.meta}>
            Applying only stages the matching source tick in this local draft.
            Review it, confirm the convention, and use the separate Save action;
            no cloud write, gate approval, or paper arm occurs here.
          </Text>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  editor: { borderColor: C.amber + "99", gap: 8 },
  detector: {
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 10,
    gap: 6,
    padding: 9,
  },
  heading: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  title: { color: C.text, fontWeight: "800", fontSize: 14 },
  sectionInline: { color: C.text, fontWeight: "800", fontSize: 12 },
  detail: { color: C.text, fontSize: 12, lineHeight: 18 },
  fact: { color: C.text, fontSize: 11, lineHeight: 16 },
  meta: { color: C.muted, fontSize: 11, lineHeight: 17 },
  notice: { color: C.amber, fontSize: 12, lineHeight: 18 },
  error: { color: C.rose, fontSize: 12, lineHeight: 18 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
