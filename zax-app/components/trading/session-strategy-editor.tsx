import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { Strategy } from "@/lib/trading/model";
import type { PreparedInstrumentSetup } from "@/lib/trading/instrument-setup-types";
import {
  IB_DEFAULT_CONFIG,
  LONDON_DEFAULT_CONFIG,
  PIVOT_DEFAULT_CONFIG,
  sessionStrategyConfigSchema,
  type IbConfig,
  type PivotConfig,
  type SessionStrategyConfig,
  type SessionStrategyFamily,
} from "@/lib/trading/session-strategy-model";
import { trpc } from "@/lib/trpc";
import { ActionButton, Card, Input, SectionLabel, ToggleRow } from "./ui";
import { C } from "./theme";

type Props = {
  strategy: Strategy;
  /** Selected workspace instrument; detection never changes this value. */
  market: string;
  onSave: (config: SessionStrategyConfig) => void;
  onClose?: () => void;
  /** The strategy sheet remains visible to a non-owner, but must not mutate a workspace. */
  disabled?: boolean;
};

type PreparedState = {
  requestKey: string;
  response: PreparedInstrumentSetup;
};

const CLOCKS = [
  ["Etc/GMT+5", "Fixed EST (UTC−5)"],
  ["America/New_York", "New York (DST)"],
] as const;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function familyFor(strategy: Strategy): SessionStrategyFamily {
  if (
    strategy.setupFamily === "london-breakout" ||
    strategy.setupFamily === "initial-balance" ||
    strategy.setupFamily === "pdc-continuation"
  )
    return strategy.setupFamily;
  if (
    strategy.sessionConfig?.family === "london-breakout" ||
    strategy.sessionConfig?.family === "initial-balance" ||
    strategy.sessionConfig?.family === "pdc-continuation"
  )
    return strategy.sessionConfig.family;
  return "london-breakout";
}

function defaultFor(family: SessionStrategyFamily): SessionStrategyConfig {
  if (family === "initial-balance") return clone(IB_DEFAULT_CONFIG);
  if (family === "pdc-continuation") return clone(PIVOT_DEFAULT_CONFIG);
  return clone(LONDON_DEFAULT_CONFIG);
}

function validConfig(strategy: Strategy): SessionStrategyConfig {
  const parsed = sessionStrategyConfigSchema.safeParse(strategy.sessionConfig);
  return parsed.success && parsed.data.family === familyFor(strategy)
    ? parsed.data
    : defaultFor(familyFor(strategy));
}

function minuteText(minute?: number) {
  if (!Number.isInteger(minute) || minute! < 0 || minute! > 1439) return "";
  return `${String(Math.floor(minute! / 60)).padStart(2, "0")}:${String(
    minute! % 60,
  ).padStart(2, "0")}`;
}

function parseMinute(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
    ? hour * 60 + minute
    : undefined;
}

function positiveNumber(value: string) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function sourceRules(family: SessionStrategyFamily) {
  if (family === "initial-balance")
    return "Original user rules: form the 09:30–10:30 EST Initial Balance; after 10:30 watch a 15m closed break of its high/low with high volume. Enter at market after the close; stop just inside the boundary or at the midpoint; target one IB range beyond the broken edge.";
  if (family === "pdc-continuation")
    return "Original user rules: use the exact Previous Day Close (PDC). If the day opens below PDC, a move above it is red-to-green; if above PDC, a move below it is green-to-red. The trigger is an observed price cross with increasing volume. The source says the stop is just past the morning move and targets are pre-market levels or owner key levels.";
  return "Original user rules: measure the 00:00–03:00 EST late-Asia range, then from the 03:00 EST London open wait for a full 5m or 15m close beyond its high/low. Enter in that direction at close; use the opposite range side or midpoint for the stop, and 1.5R, 2R, or range height from entry for the target.";
}

function approvedDefaults(family: SessionStrategyFamily) {
  if (family === "initial-balance")
    return "Approved app defaults (18:52:05): 15m execution, high volume means latest completed volume ≥1.5× the prior 20 completed bars, midpoint stop, one-range-beyond-boundary target, and 11:30 EST entry cutoff. The cutoff may be overridden below.";
  if (family === "pdc-continuation")
    return "Approved app defaults (18:52:05): 1m execution, an observed quote cross (not a candle inference), and latest completed volume greater than the previous completed bar. PDC day basis and executable targets deliberately begin unselected/incomplete.";
  return "Approved app defaults (18:52:05): 15m execution, midpoint stop, and 2R target. These are labelled app conventions, not a performance claim or an approval of a confluence gate.";
}

export function SessionStrategyEditor({
  strategy,
  market,
  onSave,
  onClose,
  disabled = false,
}: Props) {
  const family = familyFor(strategy);
  const prepareInstrument = trpc.setup.prepareInstrument.useMutation();
  const requestGenerationRef = useRef(0);
  const requestActiveRef = useRef(false);
  const currentDetectionIdentityRef = useRef("");
  const mountedRef = useRef(true);
  const [prepared, setPrepared] = useState<PreparedState>();
  const [detectionError, setDetectionError] = useState<string>();
  const [draft, setDraft] = useState<SessionStrategyConfig>(() =>
    validConfig(strategy),
  );
  const [insideTicks, setInsideTicks] = useState(() =>
    draft.family === "initial-balance"
      ? String(draft.insideBoundaryTicks)
      : "1",
  );
  const [ibPriceTick, setIbPriceTick] = useState(() =>
    draft.family === "initial-balance" && draft.priceTick
      ? String(draft.priceTick)
      : "",
  );
  const [ibCutoff, setIbCutoff] = useState(() =>
    draft.family === "initial-balance"
      ? minuteText(draft.entryEndMinute)
      : "11:30",
  );
  const [pivotPriceTick, setPivotPriceTick] = useState(() =>
    draft.family === "pdc-continuation" && draft.priceTick
      ? String(draft.priceTick)
      : "",
  );
  const [closeMinute, setCloseMinute] = useState(() =>
    draft.family === "pdc-continuation"
      ? minuteText(draft.sessionCloseMinute)
      : "",
  );
  const [longTarget, setLongTarget] = useState(() =>
    draft.family === "pdc-continuation" && draft.longTargetPrice
      ? String(draft.longTargetPrice)
      : "",
  );
  const [shortTarget, setShortTarget] = useState(() =>
    draft.family === "pdc-continuation" && draft.shortTargetPrice
      ? String(draft.shortTargetPrice)
      : "",
  );
  const [premarketStart, setPremarketStart] = useState(() =>
    draft.family === "pdc-continuation"
      ? minuteText(draft.premarketStartMinute)
      : "",
  );

  const candidate = useMemo<SessionStrategyConfig>(() => {
    if (draft.family === "initial-balance") {
      const tick = positiveNumber(ibPriceTick);
      return {
        ...draft,
        insideBoundaryTicks: Number(insideTicks),
        priceTick: tick,
        entryEndMinute: parseMinute(ibCutoff) ?? Number.NaN,
      };
    }
    if (draft.family === "pdc-continuation") {
      const tick = positiveNumber(pivotPriceTick);
      const long = positiveNumber(longTarget);
      const short = positiveNumber(shortTarget);
      return {
        ...draft,
        priceTick: tick,
        sessionCloseMinute: parseMinute(closeMinute),
        longTargetPrice: long,
        shortTargetPrice: short,
        premarketStartMinute: parseMinute(premarketStart),
      };
    }
    return draft;
  }, [
    closeMinute,
    draft,
    ibCutoff,
    ibPriceTick,
    insideTicks,
    longTarget,
    pivotPriceTick,
    premarketStart,
    shortTarget,
  ]);
  const parsed = sessionStrategyConfigSchema.safeParse(candidate);
  const detectionKey = `${strategy.id}:${market}:${JSON.stringify(candidate)}`;

  // These effects only record identity/mounting state. Response eligibility uses
  // this identity and request generation; neither effect synchronizes UI state.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  useEffect(() => {
    currentDetectionIdentityRef.current = detectionKey;
  }, [detectionKey]);

  const visiblePrepared =
    prepared?.requestKey === detectionKey &&
    prepared.response.market === market &&
    prepared.response.facts.market === market
      ? prepared.response
      : undefined;
  const clearDetection = () => {
    setPrepared(undefined);
    setDetectionError(undefined);
  };
  const blockers = useMemo(() => {
    const errors: string[] = [];
    if (!parsed.success)
      errors.push(
        parsed.error.issues[0]?.message ||
          "Check the approved app configuration.",
      );
    if (candidate.family === "initial-balance") {
      if (
        candidate.stopMode === "inside-boundary" &&
        !positiveNumber(ibPriceTick)
      )
        errors.push(
          "Inside-boundary stop is blocked until you enter the market’s actual positive price tick.",
        );
      if (parseMinute(ibCutoff) === undefined || parseMinute(ibCutoff)! < 631)
        errors.push("Enter a valid EST/DST cutoff after 10:31 (HH:MM).");
    }
    if (candidate.family === "pdc-continuation") {
      if (!positiveNumber(pivotPriceTick))
        errors.push(
          "Observed quote cross is blocked until you enter the market’s actual positive price tick.",
        );
      if (candidate.pdcBasis === "unselected")
        errors.push(
          "Choose a PDC basis: provider UTC day/trading-day close or an owner-declared session-close minute.",
        );
      if (
        candidate.pdcBasis === "declared-session-close" &&
        parseMinute(closeMinute) === undefined
      )
        errors.push(
          "Enter the owner-declared PDC session-close clock (HH:MM); US 16:00 is not assumed.",
        );
      if (
        candidate.targetMode === "owner-key-levels" &&
        (!positiveNumber(longTarget) || !positiveNumber(shortTarget))
      )
        errors.push(
          "Owner-key-level targets are blocked until both positive long and short prices are entered.",
        );
      if (
        candidate.targetMode === "declared-premarket-range" &&
        parseMinute(premarketStart) === undefined
      )
        errors.push(
          "Pre-market target is blocked until an owner-declared start clock (HH:MM) is entered.",
        );
    }
    return errors;
  }, [
    candidate,
    closeMinute,
    ibCutoff,
    ibPriceTick,
    longTarget,
    parsed,
    pivotPriceTick,
    premarketStart,
    shortTarget,
  ]);
  // A schema-valid but incomplete configuration is a draft. The notices below
  // remain execution prerequisites rather than blocking editing or saving.
  const canSave = parsed.success && !disabled;

  const detectInstrument = async () => {
    if (
      disabled ||
      !parsed.success ||
      prepareInstrument.isPending ||
      requestActiveRef.current
    )
      return;
    const requestGeneration = ++requestGenerationRef.current;
    const requestKey = detectionKey;
    requestActiveRef.current = true;
    setPrepared(undefined);
    setDetectionError(undefined);
    try {
      const response: PreparedInstrumentSetup =
        await prepareInstrument.mutateAsync({ market, config: parsed.data });
      if (
        !mountedRef.current ||
        requestGeneration !== requestGenerationRef.current ||
        requestKey !== currentDetectionIdentityRef.current
      )
        return;
      if (response.market !== market || response.facts.market !== market) {
        setDetectionError(
          "Instrument response did not match the selected market. No defaults were applied.",
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
            : "Instrument detection could not be completed.",
        );
    } finally {
      requestActiveRef.current = false;
    }
  };

  const applyDetectedDefaults = () => {
    if (!visiblePrepared || disabled || prepareInstrument.isPending) return;
    const detected = sessionStrategyConfigSchema.safeParse({
      ...visiblePrepared.config,
      instrumentMarket: market,
    });
    if (!detected.success || detected.data.family !== family) {
      setDetectionError(
        "Detected defaults do not match this strategy family. No local fields were changed.",
      );
      return;
    }
    clearDetection();
    setDraft(detected.data);
    if (detected.data.family === "initial-balance") {
      setInsideTicks(String(detected.data.insideBoundaryTicks));
      setIbPriceTick(
        detected.data.priceTick === undefined
          ? ""
          : String(detected.data.priceTick),
      );
      setIbCutoff(minuteText(detected.data.entryEndMinute));
    }
    if (detected.data.family === "pdc-continuation") {
      setPivotPriceTick(
        detected.data.priceTick === undefined
          ? ""
          : String(detected.data.priceTick),
      );
      setCloseMinute(minuteText(detected.data.sessionCloseMinute));
      setLongTarget(
        detected.data.longTargetPrice === undefined
          ? ""
          : String(detected.data.longTargetPrice),
      );
      setShortTarget(
        detected.data.shortTargetPrice === undefined
          ? ""
          : String(detected.data.shortTargetPrice),
      );
      setPremarketStart(minuteText(detected.data.premarketStartMinute));
    }
  };

  const updateClock = (timezone: SessionStrategyConfig["timezone"]) => {
    if (disabled) return;
    clearDetection();
    setDraft((current) => ({ ...current, timezone }));
  };
  const updateIb = (patch: Partial<IbConfig>) => {
    if (disabled) return;
    clearDetection();
    setDraft((current) =>
      current.family === "initial-balance" ? { ...current, ...patch } : current,
    );
  };
  const updatePivot = (patch: Partial<PivotConfig>) => {
    if (disabled) return;
    clearDetection();
    setDraft((current) =>
      current.family === "pdc-continuation"
        ? { ...current, ...patch }
        : current,
    );
  };
  const updateText = (setter: (value: string) => void) => (value: string) => {
    if (disabled) return;
    clearDetection();
    setter(value);
  };

  return (
    <Card style={styles.editor}>
      <View style={styles.heading}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Session & pivot configuration</Text>
          <Text style={styles.meta}>
            Source rules remain intact. This panel records labelled
            owner-approved app execution conventions for this exact strategy
            revision.
          </Text>
        </View>
        {onClose ? (
          <ActionButton label="Close" compact kind="ghost" onPress={onClose} />
        ) : null}
      </View>

      <SectionLabel>Original user rules</SectionLabel>
      <Text style={styles.detail}>{sourceRules(family)}</Text>
      <SectionLabel>Approved app defaults</SectionLabel>
      <Text style={styles.notice}>{approvedDefaults(family)}</Text>

      <ToggleRow
        label="Owner approval confirmed"
        detail="Records the approved app convention only. It does not approve confluence, create a watch, submit an order, or establish profitability."
        value={draft.confirmed}
        onChange={(confirmed) => {
          if (disabled) return;
          clearDetection();
          setDraft((current) => ({ ...current, confirmed }));
        }}
      />
      <Text style={styles.meta}>
        Clock basis: source calls this EST. Fixed EST is UTC−5 all year; New
        York follows daylight saving time. Device time never reinterprets source
        bars.
      </Text>
      <View style={styles.actions}>
        {CLOCKS.map(([timezone, label]) => (
          <ActionButton
            key={timezone}
            label={label}
            compact
            kind={draft.timezone === timezone ? "primary" : "secondary"}
            disabled={disabled}
            onPress={() => updateClock(timezone)}
          />
        ))}
      </View>

      {draft.family !== "london-breakout" ? (
        <InstrumentDetector
          market={market}
          family={draft.family}
          pending={prepareInstrument.isPending}
          disabled={disabled || !parsed.success}
          result={visiblePrepared}
          error={detectionError}
          onDetect={() => void detectInstrument()}
          onUseDetected={applyDetectedDefaults}
        />
      ) : null}

      {draft.family === "london-breakout" ? (
        <LondonControls
          config={draft}
          disabled={disabled}
          onChange={(patch) =>
            !disabled &&
            setDraft((current) =>
              current.family === "london-breakout"
                ? { ...current, ...patch }
                : current,
            )
          }
        />
      ) : null}
      {draft.family === "initial-balance" ? (
        <InitialBalanceControls
          config={draft}
          disabled={disabled}
          insideTicks={insideTicks}
          ibPriceTick={ibPriceTick}
          ibCutoff={ibCutoff}
          setInsideTicks={updateText(setInsideTicks)}
          setIbPriceTick={updateText(setIbPriceTick)}
          setIbCutoff={updateText(setIbCutoff)}
          onChange={updateIb}
        />
      ) : null}
      {draft.family === "pdc-continuation" ? (
        <PivotControls
          config={draft}
          disabled={disabled}
          pivotPriceTick={pivotPriceTick}
          closeMinute={closeMinute}
          longTarget={longTarget}
          shortTarget={shortTarget}
          premarketStart={premarketStart}
          setPivotPriceTick={updateText(setPivotPriceTick)}
          setCloseMinute={updateText(setCloseMinute)}
          setLongTarget={updateText(setLongTarget)}
          setShortTarget={updateText(setShortTarget)}
          setPremarketStart={updateText(setPremarketStart)}
          onChange={updatePivot}
        />
      ) : null}

      {blockers.map((blocker) => (
        <Text key={blocker} style={styles.error}>
          BLOCKED · {blocker}
        </Text>
      ))}
      {draft.family === "pdc-continuation" ? (
        <Text style={styles.notice}>
          The detector evaluates the completed 1m morning extreme with the
          configured tick buffer. A saved draft is still not an executable
          setup, paper order, or public signal; current data prerequisites and
          native gates are rechecked at entry.
        </Text>
      ) : null}
      <ActionButton
        label="Save session app configuration"
        disabled={!canSave}
        onPress={() => {
          if (parsed.success) onSave(parsed.data);
        }}
      />
      <Text style={styles.meta}>
        Saving validates the strict configuration schema, creates a local
        strategy revision, clears any prior confluence approval, and follows the
        existing explicit cloud-save / auto-save policy separately.
      </Text>
    </Card>
  );
}

function instrumentTime(value?: number) {
  if (!value) return "not supplied";
  return new Date(value).toLocaleString();
}

function InstrumentDetector({
  market,
  family,
  pending,
  disabled,
  result,
  error,
  onDetect,
  onUseDetected,
}: {
  market: string;
  family: Exclude<SessionStrategyFamily, "london-breakout">;
  pending: boolean;
  disabled: boolean;
  result?: PreparedInstrumentSetup;
  error?: string;
  onDetect: () => void;
  onUseDetected: () => void;
}) {
  const dailyBasis =
    result?.facts.dailyBasis === "utc-provider-trading-days"
      ? "Provider UTC trading-day close — not US RTH"
      : result?.facts.dailyBasis === "utc-continuous-24h"
        ? "Provider UTC calendar-day close — not US RTH"
        : "Daily close basis was not verified";
  return (
    <View style={styles.detector}>
      <View style={styles.heading}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionInline}>Instrument setup · {market}</Text>
          <Text style={styles.meta}>
            Read-only detection fetches facts only. It does not save a
            workspace, create an order, change automation, or schedule a scan.
          </Text>
        </View>
        <ActionButton
          label={pending ? "Detecting…" : "Detect instrument"}
          compact
          kind="secondary"
          disabled={disabled || pending}
          onPress={onDetect}
        />
      </View>
      {error ? <Text style={styles.error}>DETECTION · {error}</Text> : null}
      {result ? (
        <>
          <Text style={styles.fact}>
            Source · {result.facts.source} · symbol{" "}
            {result.facts.providerSymbol}
          </Text>
          <Text style={styles.fact}>
            Retrieved · {instrumentTime(result.facts.retrievedAt)} · status{" "}
            {result.status}
          </Text>
          <Text style={styles.fact}>
            Tick ·{" "}
            {result.facts.tick
              ? `${result.facts.tick.value} (${result.facts.tick.source})`
              : "unverified"}
          </Text>
          <Text style={styles.fact}>Daily basis · {dailyBasis}</Text>
          <Text style={styles.fact}>
            Volume sample · {result.volumeSample.positiveBars}/
            {result.volumeSample.bars} positive bars ·{" "}
            {result.volumeSample.basis}
          </Text>
          {result.previousDay ? (
            <Text style={styles.fact}>
              Previous day · close {result.previousDay.close} · high{" "}
              {result.previousDay.high} · low {result.previousDay.low} · close{" "}
              {instrumentTime(result.previousDay.closeAt)} ·{" "}
              {result.previousDay.source}
            </Text>
          ) : null}
          {result.facts.messages.map((message) => (
            <Text key={`fact:${message}`} style={styles.meta}>
              Source note · {message}
            </Text>
          ))}
          {result.choices.map((choice) => (
            <Text key={`choice:${choice}`} style={styles.meta}>
              Choice · {choice}
            </Text>
          ))}
          {result.warnings.map((warning) => (
            <Text key={`warning:${warning}`} style={styles.notice}>
              Caution · {warning}
            </Text>
          ))}
          {family === "pdc-continuation" ? (
            <Text style={styles.meta}>
              Previous-day-extremes targets use the actual returned source and
              reroll as its daily data rerolls; they are not fixed personal
              target prices.
            </Text>
          ) : null}
          <ActionButton
            label="Fill missing verified settings"
            compact
            disabled={disabled || pending}
            onPress={onUseDetected}
          />
          <Text style={styles.meta}>
            This only fills local fields and preserves owner choices returned by
            the service. Preview values are as-of the source timestamp; native
            PDC/PDH/PDL are recomputed at entry. Review, then use the separate
            Save action to create the existing explicit strategy revision and
            clear prior approval.
          </Text>
        </>
      ) : null}
    </View>
  );
}

function LondonControls({
  config,
  onChange,
  disabled,
}: {
  config: Extract<SessionStrategyConfig, { family: "london-breakout" }>;
  onChange: (
    patch: Partial<
      Extract<SessionStrategyConfig, { family: "london-breakout" }>
    >,
  ) => void;
  disabled: boolean;
}) {
  return (
    <>
      <SectionLabel>London breakout execution</SectionLabel>
      <Text style={styles.detail}>
        Preferred app/source execution frame: 15m. A completed 15m candle must
        close beyond the completed late-Asia range; a 5m source alternative is
        described but not selected for app execution.
      </Text>
      <Text style={styles.meta}>STOP SOURCE ALTERNATIVE</Text>
      <View style={styles.actions}>
        {(["midpoint", "opposite-boundary"] as const).map((stopMode) => (
          <ActionButton
            key={stopMode}
            compact
            disabled={disabled}
            label={
              stopMode === "midpoint" ? "Range midpoint" : "Opposite range side"
            }
            kind={config.stopMode === stopMode ? "primary" : "secondary"}
            onPress={() => onChange({ stopMode })}
          />
        ))}
      </View>
      <Text style={styles.meta}>TAKE-PROFIT SOURCE ALTERNATIVE</Text>
      <View style={styles.actions}>
        {(["1.5r", "2r", "range-height-from-entry"] as const).map(
          (targetMode) => (
            <ActionButton
              key={targetMode}
              compact
              disabled={disabled}
              label={
                targetMode === "1.5r"
                  ? "1.5R"
                  : targetMode === "2r"
                    ? "2R"
                    : "Range height from entry"
              }
              kind={config.targetMode === targetMode ? "primary" : "secondary"}
              onPress={() => onChange({ targetMode })}
            />
          ),
        )}
      </View>
    </>
  );
}

function InitialBalanceControls({
  config,
  onChange,
  disabled,
  insideTicks,
  ibPriceTick,
  ibCutoff,
  setInsideTicks,
  setIbPriceTick,
  setIbCutoff,
}: {
  config: Extract<SessionStrategyConfig, { family: "initial-balance" }>;
  onChange: (patch: Partial<IbConfig>) => void;
  disabled: boolean;
  insideTicks: string;
  ibPriceTick: string;
  ibCutoff: string;
  setInsideTicks: (value: string) => void;
  setIbPriceTick: (value: string) => void;
  setIbCutoff: (value: string) => void;
}) {
  return (
    <>
      <SectionLabel>Initial Balance execution</SectionLabel>
      <Text style={styles.detail}>
        Source frame is 15m; choose 15m or 30m app execution. A completed bar
        must close beyond the completed 09:30–10:30 EST/DST IB range.
      </Text>
      <Text style={styles.meta}>EXECUTION TIMEFRAME</Text>
      <View style={styles.actions}>
        {(["15m", "30m"] as const).map((executionTimeframe) => (
          <ActionButton
            key={executionTimeframe}
            label={executionTimeframe}
            compact
            disabled={disabled}
            kind={
              config.executionTimeframe === executionTimeframe
                ? "primary"
                : "secondary"
            }
            onPress={() => onChange({ executionTimeframe })}
          />
        ))}
      </View>
      <Text style={styles.detail}>
        High-volume confirmation is fixed: latest completed bar volume must be
        at least 1.5× the prior 20 completed bars.
      </Text>
      <Text style={styles.meta}>VOLUME DATA POLICY</Text>
      <View style={styles.actions}>
        {(
          [
            ["venue-only", "Venue-only (default)"],
            ["broker-reported-proxy", "Broker reported proxy"],
          ] as const
        ).map(([volumePolicy, label]) => (
          <ActionButton
            key={volumePolicy}
            label={label}
            compact
            disabled={disabled}
            kind={
              config.volumePolicy === volumePolicy ? "primary" : "secondary"
            }
            onPress={() => onChange({ volumePolicy })}
          />
        ))}
      </View>
      <Text style={styles.meta}>
        {config.volumePolicy === "broker-reported-proxy"
          ? "Selected policy: broker-reported volume is an explicit proxy, not exchange/venue volume. Unverified, non-exchange, or zero volume still blocks execution."
          : "Selected policy: venue-only is the default. Execution requires verified venue volume; no broker-volume proxy is selected."}
      </Text>
      <Text style={styles.meta}>STOP SOURCE ALTERNATIVE</Text>
      <View style={styles.actions}>
        {(["midpoint", "inside-boundary"] as const).map((stopMode) => (
          <ActionButton
            key={stopMode}
            compact
            disabled={disabled}
            label={stopMode === "midpoint" ? "IB midpoint" : "Inside IB edge"}
            kind={config.stopMode === stopMode ? "primary" : "secondary"}
            onPress={() => onChange({ stopMode })}
          />
        ))}
      </View>
      {config.stopMode === "inside-boundary" ? (
        <>
          <Input
            label="Inside-boundary buffer (whole ticks 1–10)"
            value={insideTicks}
            onChangeText={setInsideTicks}
            keyboardType="numeric"
          />
          <Input
            label="Actual market price tick (required)"
            value={ibPriceTick}
            onChangeText={setIbPriceTick}
            keyboardType="numeric"
          />
        </>
      ) : null}
      <Text style={styles.meta}>ENTRY CUTOFF (APP OVERRIDABLE)</Text>
      <Input
        label="Last entry local clock (HH:MM)"
        value={ibCutoff}
        onChangeText={setIbCutoff}
        placeholder="11:30"
      />
      <Text style={styles.detail}>
        Target is fixed to one completed IB range beyond the broken edge. It is
        not a claim that the range expansion will occur.
      </Text>
    </>
  );
}

function PivotControls({
  config,
  onChange,
  disabled,
  pivotPriceTick,
  closeMinute,
  longTarget,
  shortTarget,
  premarketStart,
  setPivotPriceTick,
  setCloseMinute,
  setLongTarget,
  setShortTarget,
  setPremarketStart,
}: {
  config: Extract<SessionStrategyConfig, { family: "pdc-continuation" }>;
  onChange: (patch: Partial<PivotConfig>) => void;
  disabled: boolean;
  pivotPriceTick: string;
  closeMinute: string;
  longTarget: string;
  shortTarget: string;
  premarketStart: string;
  setPivotPriceTick: (value: string) => void;
  setCloseMinute: (value: string) => void;
  setLongTarget: (value: string) => void;
  setShortTarget: (value: string) => void;
  setPremarketStart: (value: string) => void;
}) {
  return (
    <>
      <SectionLabel>PDC continuation execution</SectionLabel>
      <Text style={styles.detail}>
        Select 1m or 5m for review. The trigger remains an observed quote cross,
        not an OHLC approximation; latest completed volume must be greater than
        the previous completed bar before it can be considered.
      </Text>
      <Text style={styles.meta}>EXECUTION TIMEFRAME</Text>
      <View style={styles.actions}>
        {(["1m", "5m"] as const).map((executionTimeframe) => (
          <ActionButton
            key={executionTimeframe}
            label={executionTimeframe}
            compact
            disabled={disabled}
            kind={
              config.executionTimeframe === executionTimeframe
                ? "primary"
                : "secondary"
            }
            onPress={() => onChange({ executionTimeframe })}
          />
        ))}
      </View>
      <Input
        label="Actual market price tick (required for observed crossing)"
        value={pivotPriceTick}
        onChangeText={setPivotPriceTick}
        keyboardType="numeric"
      />
      <Text style={styles.meta}>PREVIOUS DAY CLOSE BASIS</Text>
      <View style={styles.actions}>
        {(
          [
            ["unselected", "Choose basis"],
            ["provider-utc-day", "Provider UTC day"],
            ["provider-utc-trading-day", "Provider UTC trading day"],
            ["declared-session-close", "Owner session close"],
          ] as const
        ).map(([pdcBasis, label]) => (
          <ActionButton
            key={pdcBasis}
            label={label}
            compact
            disabled={disabled}
            kind={config.pdcBasis === pdcBasis ? "primary" : "secondary"}
            onPress={() => onChange({ pdcBasis })}
          />
        ))}
      </View>
      {config.pdcBasis === "provider-utc-trading-day" ? (
        <Text style={styles.meta}>
          Broker daily means the provider’s UTC trading-day close, not a US RTH
          close.
        </Text>
      ) : null}
      {config.pdcBasis === "declared-session-close" ? (
        <Input
          label="Owner-declared PDC session-close clock (HH:MM)"
          value={closeMinute}
          onChangeText={setCloseMinute}
          placeholder="No US 16:00 assumption"
        />
      ) : null}
      <Text style={styles.meta}>VOLUME DATA POLICY</Text>
      <View style={styles.actions}>
        {(
          [
            ["venue-only", "Venue-only (default)"],
            ["broker-reported-proxy", "Broker reported proxy"],
          ] as const
        ).map(([volumePolicy, label]) => (
          <ActionButton
            key={volumePolicy}
            label={label}
            compact
            disabled={disabled}
            kind={
              config.volumePolicy === volumePolicy ? "primary" : "secondary"
            }
            onPress={() => onChange({ volumePolicy })}
          />
        ))}
      </View>
      <Text style={styles.meta}>
        {config.volumePolicy === "broker-reported-proxy"
          ? "Selected policy: broker-reported volume is an explicit proxy, not exchange/venue volume. Unverified, non-exchange, or zero volume still blocks execution."
          : "Selected policy: venue-only is the default. Execution requires verified venue volume; no broker-volume proxy is selected."}
      </Text>
      <Text style={styles.meta}>TARGET DECLARATION</Text>
      <View style={styles.actions}>
        {(
          [
            ["owner-key-levels", "Owner key levels"],
            ["declared-premarket-range", "Declared pre-market range"],
            ["previous-day-extremes", "Dynamic PDH / PDL"],
          ] as const
        ).map(([targetMode, label]) => (
          <ActionButton
            key={targetMode}
            label={label}
            compact
            disabled={disabled}
            kind={config.targetMode === targetMode ? "primary" : "secondary"}
            onPress={() => onChange({ targetMode })}
          />
        ))}
      </View>
      {config.targetMode === "owner-key-levels" ? (
        <>
          <Input
            label="Owner long target price (required)"
            value={longTarget}
            onChangeText={setLongTarget}
            keyboardType="numeric"
          />
          <Input
            label="Owner short target price (required)"
            value={shortTarget}
            onChangeText={setShortTarget}
            keyboardType="numeric"
          />
        </>
      ) : config.targetMode === "declared-premarket-range" ? (
        <Input
          label="Declared pre-market start clock (HH:MM)"
          value={premarketStart}
          onChangeText={setPremarketStart}
          placeholder="Owner must choose"
        />
      ) : (
        <Text style={styles.meta}>
          Dynamic PDH/PDL targets use actual source daily highs/lows and reroll
          with that source’s completed daily data. They do not overwrite
          personal prices.
        </Text>
      )}
    </>
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
