import { SECONDS } from "./engine";
import type { Candle, Strategy, Timeframe } from "./model";
import type { Direction, SetupCandidate, SetupStep } from "./setup-model";

/**
 * Fixed operating defaults for Foundry scope 04's rolling VWAP ±2.5σ rule.
 * The scope supplies the 2.5σ threshold; the 20-bar rolling window and five-bar
 * stop reference are app-authored, explicit conventions rather than source claims.
 */
export const VWAP_STDV_DEFAULTS = {
  windowBars: 20,
  sigmaMultiplier: 2.5,
  stopLookbackBars: 5,
} as const;

export const VWAP_STDV_CONFLUENCE_IDS = [
  "vwap-stdv-source-bars",
  "vwap-stdv-known-volume",
  "vwap-stdv-window",
  "vwap-stdv-prior-outside",
  "vwap-stdv-reentry",
  "vwap-stdv-stop-extreme",
  "vwap-stdv-target-vwap",
] as const;

export type VwapStdvConfluenceId = (typeof VWAP_STDV_CONFLUENCE_IDS)[number];
export type VolumeState = "positive" | "zero" | "missing";
export type WindowState =
  | "warmup"
  | "missing-volume"
  | "zero-total-volume"
  | "ready";

export type VwapStdvPoint = {
  time: number;
  typicalPrice: number;
  volume: number;
  volumeState: VolumeState;
  windowState: WindowState;
  windowBars: number;
  windowVolume?: number;
  vwap?: number;
  sigma?: number;
  upper?: number;
  lower?: number;
};

export type VwapStdvSource = {
  source: string;
  knownVolume: boolean;
  volumeLabel: string;
  vwapLabel: string;
};

export type VwapStdvCurves = {
  timeframe: Timeframe;
  evaluatedAt: number;
  sourceAsOf?: number;
  sourceCloseAsOf?: number;
  sourceBars: Candle[];
  points: VwapStdvPoint[];
  source: VwapStdvSource;
  formula: string;
  messages: string[];
};

/**
 * Kept family-free until SetupFamily is extended by the integrating change.
 * Parent code can assign `family: "vwap-stdv"` after widening that union.
 */
export type VwapStdvCandidate = Omit<SetupCandidate, "family"> & {
  declaredFamily: "vwap-stdv";
  sourceKnownVolume: boolean;
  sourceAsOf?: number;
};

export type VwapStdvAnalysis = {
  curves: VwapStdvCurves;
  candidates: VwapStdvCandidate[];
  sourceKnownVolume: boolean;
};

const step = (
  id: VwapStdvConfluenceId,
  name: string,
  status: SetupStep["status"],
  evidence: string,
): SetupStep => ({ id, name, status, evidence });

const show = (value: number | undefined) =>
  value === undefined ? "unavailable" : Number(value.toFixed(6)).toString();

const seconds = (now: number) => (now > 10_000_000_000 ? now / 1000 : now);

const validPriceBar = (bar: Candle) =>
  Number.isFinite(bar.time) &&
  bar.time > 0 &&
  [bar.open, bar.high, bar.low, bar.close].every(
    (value) => Number.isFinite(value) && value > 0,
  ) &&
  bar.high >= Math.max(bar.open, bar.close) &&
  bar.low <= Math.min(bar.open, bar.close);

const volumeState = (volume: number): VolumeState =>
  !Number.isFinite(volume) || volume < 0
    ? "missing"
    : volume === 0
      ? "zero"
      : "positive";

/**
 * Source semantics are deliberately conservative.  Coinbase Exchange is treated
 * as a labelled single-venue OHLCV-volume source; every other label (including a
 * broker feed) is volume-semantically unknown and can never make a setup ready.
 */
export function vwapStdvSource(source: string): VwapStdvSource {
  const label = source.trim() || "Unspecified source";
  const knownVolume = /Coinbase Exchange/i.test(label);
  return knownVolume
    ? {
        source: label,
        knownVolume: true,
        volumeLabel:
          "Coinbase Exchange single-venue OHLCV volume (source-labelled).",
        vwapLabel:
          "Rolling typical-price VWAP proxy from Coinbase Exchange OHLCV; not exchange tick/trade VWAP.",
      }
    : {
        source: label,
        knownVolume: false,
        volumeLabel:
          "Volume semantics are not established for this broker/provider source; it cannot qualify a ready VWAP setup.",
        vwapLabel:
          "Any calculated line is an unverified OHLCV-volume proxy, not a claimed venue tick/trade VWAP.",
      };
}

/**
 * Sorts, de-duplicates, validates price fields and excludes unclosed/future bars.
 * Volume is intentionally not filtered here: missing and zero observations must
 * remain in their time window so the calculation cannot silently invent volume.
 */
export function completedVwapStdvBars(
  raw: Candle[],
  timeframe: Timeframe,
  now: number,
): Candle[] {
  const nowSeconds = seconds(now);
  if (!Number.isFinite(nowSeconds)) return [];
  const unique = new Map<number, Candle>();
  raw.forEach((bar) => {
    if (validPriceBar(bar) && bar.time + SECONDS[timeframe] <= nowSeconds)
      unique.set(bar.time, bar);
  });
  return [...unique.values()].sort((a, b) => a.time - b.time).slice(-3000);
}

/**
 * Computes a causal rolling VWAP and weighted population standard deviation from
 * completed OHLCV bars. Typical price is (high + low + close) / 3. A window is
 * unavailable during warm-up, for any missing/negative volume, or when its total
 * actual volume is zero. Zero-volume bars otherwise remain in-window at weight 0.
 */
export function rollingVwapStdv(
  raw: Candle[],
  timeframe: Timeframe,
  source: string,
  now: number,
): VwapStdvCurves {
  const sourceBars = completedVwapStdvBars(raw, timeframe, now);
  const sourceInfo = vwapStdvSource(source);
  const points = sourceBars.map((bar, index): VwapStdvPoint => {
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    const state = volumeState(bar.volume);
    const point: VwapStdvPoint = {
      time: bar.time,
      typicalPrice,
      volume: bar.volume,
      volumeState: state,
      windowState: "warmup",
      windowBars: Math.min(index + 1, VWAP_STDV_DEFAULTS.windowBars),
    };
    if (index + 1 < VWAP_STDV_DEFAULTS.windowBars) return point;

    const window = sourceBars.slice(
      index + 1 - VWAP_STDV_DEFAULTS.windowBars,
      index + 1,
    );
    if (window.some((item) => volumeState(item.volume) === "missing")) {
      point.windowState = "missing-volume";
      return point;
    }
    const totalVolume = window.reduce((sum, item) => sum + item.volume, 0);
    point.windowVolume = totalVolume;
    if (!(totalVolume > 0) || !Number.isFinite(totalVolume)) {
      point.windowState = "zero-total-volume";
      return point;
    }
    const vwap =
      window.reduce(
        (sum, item) =>
          sum + item.volume * ((item.high + item.low + item.close) / 3),
        0,
      ) / totalVolume;
    const variance =
      window.reduce((sum, item) => {
        const typical = (item.high + item.low + item.close) / 3;
        return sum + item.volume * (typical - vwap) ** 2;
      }, 0) / totalVolume;
    const sigma = Math.sqrt(Math.max(0, variance));
    point.windowState = "ready";
    point.vwap = vwap;
    point.sigma = sigma;
    point.upper = vwap + VWAP_STDV_DEFAULTS.sigmaMultiplier * sigma;
    point.lower = vwap - VWAP_STDV_DEFAULTS.sigmaMultiplier * sigma;
    return point;
  });
  const latest = sourceBars.at(-1);
  const missingVolume = points.some((point) => point.volumeState === "missing");
  const zeroVolume = points.some((point) => point.volumeState === "zero");
  const messages = [
    "Formula: typical price=(high+low+close)/3; rolling VWAP=Σ(volume×typical)/Σ(volume); weighted population σ=sqrt(Σ(volume×(typical−VWAP)²)/Σ(volume)); bands=VWAP±2.5σ.",
    sourceInfo.vwapLabel,
    "No calibrated edge, probability, win rate, or live-order claim is produced by this deterministic rule.",
  ];
  if (sourceBars.length < VWAP_STDV_DEFAULTS.windowBars)
    messages.push(
      `Warm-up: ${sourceBars.length}/${VWAP_STDV_DEFAULTS.windowBars} completed source bars; no curve before the full rolling window.`,
    );
  if (missingVolume)
    messages.push(
      "Missing, negative, or non-finite volume makes every affected rolling window unavailable; volume is never imputed.",
    );
  if (zeroVolume)
    messages.push(
      "Zero-volume source bars receive exactly zero weight; an all-zero rolling window has no VWAP or sigma.",
    );

  return {
    timeframe,
    evaluatedAt: seconds(now),
    sourceAsOf: latest?.time,
    sourceCloseAsOf:
      latest === undefined ? undefined : latest.time + SECONDS[timeframe],
    sourceBars,
    points,
    source: sourceInfo,
    formula: messages[0],
    messages,
  };
}

function curveIssue(point: VwapStdvPoint | undefined): string {
  if (!point) return "No completed source bar is available.";
  if (point.windowState === "warmup")
    return `Warm-up requires ${VWAP_STDV_DEFAULTS.windowBars} completed bars; only ${point.windowBars} are present.`;
  if (point.windowState === "missing-volume")
    return "At least one bar in this rolling window has missing, negative, or non-finite volume; it was not imputed.";
  if (point.windowState === "zero-total-volume")
    return "All actual volumes in this rolling window are zero, so weighted VWAP/sigma are undefined.";
  return "Curve is available.";
}

function candidateForSide(
  strategy: Pick<Strategy, "id" | "name" | "version" | "source">,
  curves: VwapStdvCurves,
  side: Direction,
): VwapStdvCandidate {
  const last = curves.points.at(-1);
  const prior = curves.points.at(-2);
  const lastBar = curves.sourceBars.at(-1);
  const priorBar = curves.sourceBars.at(-2);
  const hasCurves =
    last?.windowState === "ready" && prior?.windowState === "ready";
  const priorOutside = Boolean(
    hasCurves &&
    prior &&
    priorBar &&
    (side === "long"
      ? priorBar.close < prior.lower!
      : priorBar.close > prior.upper!),
  );
  const reentered = Boolean(
    priorOutside &&
    last &&
    lastBar &&
    (side === "long"
      ? lastBar.close >= last.lower! && lastBar.close <= last.upper!
      : lastBar.close <= last.upper! && lastBar.close >= last.lower!),
  );
  const entry = reentered ? lastBar?.close : undefined;
  const riskBars = curves.sourceBars.slice(
    -VWAP_STDV_DEFAULTS.stopLookbackBars,
  );
  const extreme =
    riskBars.length === VWAP_STDV_DEFAULTS.stopLookbackBars
      ? side === "long"
        ? Math.min(...riskBars.map((bar) => bar.low))
        : Math.max(...riskBars.map((bar) => bar.high))
      : undefined;
  const stopGeometry = Boolean(
    entry !== undefined &&
    extreme !== undefined &&
    (side === "long" ? extreme < entry : extreme > entry),
  );
  const targetGeometry = Boolean(
    entry !== undefined &&
    last?.vwap !== undefined &&
    (side === "long" ? last.vwap > entry : last.vwap < entry),
  );
  const stop = stopGeometry ? extreme : undefined;
  const target = targetGeometry ? last?.vwap : undefined;
  const sideBand = side === "long" ? "lower" : "upper";
  const steps: SetupStep[] = [
    step(
      "vwap-stdv-source-bars",
      "Completed source-bar cutoff",
      lastBar ? "met" : "unknown",
      lastBar
        ? `Only source bars with close time ≤ evaluation time were used. Latest completed ${curves.timeframe} bar opens ${new Date(lastBar.time * 1000).toISOString()} and closes ${new Date((lastBar.time + SECONDS[curves.timeframe]) * 1000).toISOString()}; evaluated at ${new Date(curves.evaluatedAt * 1000).toISOString()}.`
        : "No valid completed OHLC source bar is available; future or forming bars are excluded.",
    ),
    step(
      "vwap-stdv-known-volume",
      "Known single-venue OHLCV volume semantics",
      curves.source.knownVolume ? "met" : "unknown",
      curves.source.volumeLabel,
    ),
    step(
      "vwap-stdv-window",
      `Two completed ${VWAP_STDV_DEFAULTS.windowBars}-bar VWAP ±${VWAP_STDV_DEFAULTS.sigmaMultiplier}σ windows`,
      hasCurves ? "met" : "unknown",
      `Prior: ${curveIssue(prior)} Latest: ${curveIssue(last)} No synthetic volume is used.`,
    ),
    step(
      "vwap-stdv-prior-outside",
      `Prior completed close outside ${sideBand} ±${VWAP_STDV_DEFAULTS.sigmaMultiplier}σ band`,
      !hasCurves ? "unknown" : priorOutside ? "met" : "waiting",
      side === "long"
        ? `Prior close ${show(priorBar?.close)} versus lower band ${show(prior?.lower)}; strict prior close < lower band is required.`
        : `Prior close ${show(priorBar?.close)} versus upper band ${show(prior?.upper)}; strict prior close > upper band is required.`,
    ),
    step(
      "vwap-stdv-reentry",
      `Latest completed close re-enters ${sideBand} band`,
      !hasCurves ? "unknown" : reentered ? "met" : "waiting",
      side === "long"
        ? `Latest close ${show(lastBar?.close)} must be within [${show(last?.lower)}, ${show(last?.upper)}] after the prior lower-band excursion.`
        : `Latest close ${show(lastBar?.close)} must be within [${show(last?.lower)}, ${show(last?.upper)}] after the prior upper-band excursion.`,
    ),
    step(
      "vwap-stdv-stop-extreme",
      `Recent ${VWAP_STDV_DEFAULTS.stopLookbackBars}-bar extreme stop geometry`,
      extreme === undefined ? "unknown" : stopGeometry ? "met" : "failed",
      `${side === "long" ? "Lowest low" : "Highest high"} ${show(extreme)} across the latest ${VWAP_STDV_DEFAULTS.stopLookbackBars} completed bars. This is an app-authored stop convention; Foundry scope 04 does not prescribe a stop or buffer.`,
    ),
    step(
      "vwap-stdv-target-vwap",
      "Rolling VWAP mean target has positive geometry",
      entry === undefined || last?.vwap === undefined
        ? "unknown"
        : targetGeometry
          ? "met"
          : "failed",
      `Entry ${show(entry)}, latest rolling VWAP ${show(last?.vwap)}. Targeting VWAP is an app-authored mean-reversion exit convention, not a claimed Foundry-scope exit rule.`,
    ),
  ];
  const sourceAsOf = curves.sourceAsOf;
  return {
    id: `vwap-stdv-${strategy.id}-${side}-${sourceAsOf || 0}`,
    declaredFamily: "vwap-stdv",
    side,
    strategyId: strategy.id,
    strategyVersion: strategy.version,
    name: strategy.name,
    ready: Boolean(
      curves.source.knownVolume &&
      hasCurves &&
      priorOutside &&
      reentered &&
      stopGeometry &&
      targetGeometry,
    ),
    steps,
    zones: [],
    entry,
    stop,
    target,
    sourceKnownVolume: curves.source.knownVolume,
    sourceAsOf,
    source: `${strategy.source || curves.source.source}. ${curves.source.vwapLabel} As-of completed source bar ${sourceAsOf === undefined ? "unavailable" : new Date(sourceAsOf * 1000).toISOString()}.`,
  };
}

/**
 * Pure setup evaluation. It emits both directional candidates and never assigns
 * the not-yet-added SetupFamily member; integration should add family "vwap-stdv"
 * after expanding SetupFamily and its parent registry.
 */
export function analyzeVwapStdv(
  strategy: Pick<Strategy, "id" | "name" | "version" | "source">,
  raw: Candle[],
  timeframe: Timeframe,
  source: string,
  now: number,
): VwapStdvAnalysis {
  const curves = rollingVwapStdv(raw, timeframe, source, now);
  return {
    curves,
    candidates: [
      candidateForSide(strategy, curves, "long"),
      candidateForSide(strategy, curves, "short"),
    ],
    sourceKnownVolume: curves.source.knownVolume,
  };
}
