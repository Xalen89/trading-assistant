import { analyzeVwapStdv } from "./vwap-stdv";
import type { Candle, Level, Market, Strategy, Timeframe } from "./model";
import { SECONDS, statistics, tradeMetrics } from "./engine";
import type {
  Direction,
  HistoricalEstimate,
  HistoricalProfile,
  PaperProposal,
  SetupAnalysis,
  SetupCandidate,
  SetupFamily,
  SetupInput,
  SetupStep,
  SetupZone,
} from "./setup-model";
import { isSupportedSetupFamily, resolveSetupFamily } from "./setup-presets";
import { isIndicatorFamily, type IndicatorFamily } from "./indicator-presets";
import { indicatorSnapshot } from "./indicators";
import { indicatorCandidate } from "./indicator-setups";
import { contextualScenario, scenarioDirection } from "./historical-scenario";
import { strategyIndicatorLayers } from "./strategy-indicators";
import { analyzeOrb, orbPaperGeometry } from "./orb-strategy";
import type { OrbContext } from "./orb-model";
import {
  isSessionStrategyFamily,
  type SessionStrategyContext,
} from "./session-strategy-model";
import { detectSessionRangeStrategy } from "./session-range-strategies";
import { detectPdcContinuation } from "./pdc-continuation";
import { sessionPaperGeometry } from "./session-paper-geometry";
const MAX_BARS = 3000;
const HORIZON = 12;
const QUERY_WINDOW = 12;
const MAX_SAMPLES = 500;
const MAX_CASE_SCANS = 600;
const SOURCE_FALLBACK =
  "Pasted_content_01.txt · user-provided setup reference, not a proprietary user strategy";
const COLORS: Partial<Record<SetupFamily, string>> = {
  "core-sequence": "#7DD3FC",
  "silver-bullet": "#C4B5FD",
  "ob-retest": "#FBBF24",
  stdv: "#FB7185",
};
type SupportedFamily = "core-sequence" | "silver-bullet" | "ob-retest" | "stdv";
type Swing = {
  index: number;
  confirmedAt: number;
  kind: "high" | "low";
  price: number;
};
type Sweep = { index: number; pivot: Swing };
type Point = { index: number; atr: number; body: number; structural: number };
type Poi = { zone: SetupZone; index: number; kind: "fvg" | "ob" };
type Sequence = {
  family: SupportedFamily;
  side: Direction;
  steps: SetupStep[];
  zones: SetupZone[];
  htf: "Bullish" | "Bearish" | "Neutral" | "Unknown";
  sweep?: Sweep;
  displacement?: Point;
  mss?: Point;
  poi?: Poi;
  retracementIndex?: number;
  entry?: number;
  stop?: number;
  baseQualified: boolean;
  ready: boolean;
};
type Case = {
  anchor: number;
  sequence: Sequence;
  side: Direction;
  entry: number;
  stop: number;
  target: number;
  outcome: "win" | "loss" | "unresolved";
  ambiguous: boolean;
  future: Candle[];
  distance?: number;
};

const finiteCandle = (bar: Candle) =>
  Number.isFinite(bar.time) &&
  Number.isFinite(bar.open) &&
  Number.isFinite(bar.high) &&
  Number.isFinite(bar.low) &&
  Number.isFinite(bar.close) &&
  bar.time > 0 &&
  bar.low > 0 &&
  bar.high >= bar.low &&
  bar.high >= Math.max(bar.open, bar.close) &&
  bar.low <= Math.min(bar.open, bar.close);
const nowSeconds = (now: number) =>
  Number.isFinite(now)
    ? now > 10_000_000_000
      ? now / 1000
      : now
    : Date.now() / 1000;
const closedBars = (raw: Candle[], seconds: number, asOf: number) => {
  const unique = new Map<number, Candle>();
  for (const bar of raw)
    if (finiteCandle(bar) && bar.time + seconds <= asOf)
      unique.set(bar.time, bar);
  return [...unique.values()].sort((a, b) => a.time - b.time).slice(-MAX_BARS);
};
const fmt = (n: number) =>
  Number.isFinite(n) ? Number(n.toFixed(6)).toString() : "unavailable";
const priorAtr = (
  candles: Candle[],
  endExclusive: number,
  period = 14,
): number | undefined => {
  const start = Math.max(1, endExclusive - period);
  const ranges: number[] = [];
  for (let index = start; index < endExclusive; index++) {
    const bar = candles[index],
      prior = candles[index - 1];
    ranges.push(
      Math.max(
        bar.high - bar.low,
        Math.abs(bar.high - prior.close),
        Math.abs(bar.low - prior.close),
      ),
    );
  }
  if (ranges.length < 5) return undefined;
  return ranges.reduce((sum, value) => sum + value, 0) / ranges.length;
};
const step = (
  id: string,
  name: string,
  status: SetupStep["status"],
  evidence: string,
): SetupStep => ({ id, name, status, evidence });
const blocked = (prior: SetupStep): SetupStep["status"] =>
  prior.status === "met"
    ? "waiting"
    : prior.status === "failed"
      ? "failed"
      : "unknown";
const isLong = (side: Direction) => side === "long";
const directional = (side: Direction, value: number) =>
  isLong(side) ? value : -value;
const validStop = (side: Direction, entry: number, stop: number | undefined) =>
  Number.isFinite(stop) &&
  Number.isFinite(entry) &&
  (side === "long" ? stop! < entry : stop! > entry);
const validTarget = (side: Direction, entry: number, target: number) =>
  Number.isFinite(target) &&
  (side === "long" ? target > entry : target < entry);

function confirmedSwings(candles: Candle[]): Swing[] {
  const found: Swing[] = [];
  // A pivot is exposed only after two later closed bars confirm it.  At every decision
  // point those confirming bars are already in the supplied past, never future data.
  for (let index = 2; index < candles.length - 2; index++) {
    const bar = candles[index],
      left = candles.slice(index - 2, index),
      right = candles.slice(index + 1, index + 3);
    if (
      left.every((other) => bar.high > other.high) &&
      right.every((other) => bar.high > other.high)
    )
      found.push({
        index,
        confirmedAt: index + 2,
        kind: "high",
        price: bar.high,
      });
    if (
      left.every((other) => bar.low < other.low) &&
      right.every((other) => bar.low < other.low)
    )
      found.push({
        index,
        confirmedAt: index + 2,
        kind: "low",
        price: bar.low,
      });
  }
  return found;
}

function htfContext(
  hourly: Candle[],
  cutoff: number,
): { bias: Sequence["htf"]; evidence: string } {
  const completed = hourly.filter((bar) => bar.time + SECONDS["1h"] <= cutoff);
  if (completed.length < 6)
    return {
      bias: "Unknown",
      evidence:
        "Need at least six completed hourly bars; no higher-timeframe direction is inferred.",
    };
  const lookback = completed.slice(-6),
    first = lookback[0],
    last = lookback.at(-1)!;
  if (last.close > first.close)
    return {
      bias: "Bullish",
      evidence: `Six completed hourly bars close ${fmt(first.close)} → ${fmt(last.close)}; closed-bar directional context is Bullish.`,
    };
  if (last.close < first.close)
    return {
      bias: "Bearish",
      evidence: `Six completed hourly bars close ${fmt(first.close)} → ${fmt(last.close)}; closed-bar directional context is Bearish.`,
    };
  return {
    bias: "Neutral",
    evidence:
      "The six completed hourly closes are flat; no directional context is inferred.",
  };
}

function findSweep(candles: Candle[], side: Direction): Sweep | undefined {
  const desired = isLong(side) ? "low" : "high",
    swings = confirmedSwings(candles).filter((s) => s.kind === desired);
  let latest: Sweep | undefined,
    pivot: Swing | undefined,
    cursor = 0;
  for (let index = 0; index < candles.length; index++) {
    while (cursor < swings.length && swings[cursor].confirmedAt < index)
      pivot = swings[cursor++];
    if (!pivot) continue;
    const bar = candles[index];
    if (
      isLong(side)
        ? bar.low < pivot.price && bar.close > pivot.price
        : bar.high > pivot.price && bar.close < pivot.price
    )
      latest = { index, pivot };
  }
  return latest;
}

function findDisplacement(
  candles: Candle[],
  side: Direction,
  sweep: Sweep,
): { displacement?: Point; mss?: Point } {
  let firstBody: Point | undefined;
  for (let index = sweep.index + 1; index < candles.length; index++) {
    const atr = priorAtr(candles, index);
    if (!atr) continue;
    const bar = candles[index],
      body = Math.abs(bar.close - bar.open),
      directionalBody = isLong(side)
        ? bar.close > bar.open
        : bar.close < bar.open;
    if (!directionalBody || body < atr) continue;
    const before = candles.slice(Math.max(0, sweep.index - 3), index);
    const structural = isLong(side)
      ? Math.max(...before.map((item) => item.high))
      : Math.min(...before.map((item) => item.low));
    const point = { index, atr, body, structural };
    if (!firstBody) firstBody = point;
    if (isLong(side) ? bar.close > structural : bar.close < structural)
      return { displacement: point, mss: point };
  }
  return { displacement: firstBody };
}

function zone(
  id: string,
  kind: SetupZone["kind"],
  side: Direction,
  candles: Candle[],
  startIndex: number,
  endIndex: number,
  low: number,
  high: number,
  label: string,
  strategy: Strategy,
): SetupZone {
  const lo = Math.min(low, high),
    hi = Math.max(low, high);
  return {
    id,
    kind,
    side,
    startTime: candles[startIndex].time,
    endTime: candles[endIndex].time,
    low: lo,
    high: hi,
    ce: (lo + hi) / 2,
    label,
    source: strategy.source || SOURCE_FALLBACK,
    strategyId: strategy.id,
  };
}

function buildSequence(
  candles: Candle[],
  hourly: Candle[],
  cutoff: number,
  side: Direction,
  family: SupportedFamily,
  strategy: Strategy,
): Sequence {
  const context = htfContext(hourly, cutoff);
  const expected = isLong(side) ? "Bullish" : "Bearish";
  const contextStatus: SetupStep["status"] =
    context.bias === expected
      ? "met"
      : context.bias === "Unknown" || context.bias === "Neutral"
        ? "unknown"
        : "failed";
  const steps: SetupStep[] = [
    step(
      "htf-context",
      "HTF directional context",
      contextStatus,
      context.evidence,
    ),
  ];
  const zones: SetupZone[] = [];
  const sweep = findSweep(candles, side);
  const sweepStatus = sweep ? "met" : blocked(steps[0]);
  steps.push(
    step(
      "liquidity-sweep",
      "Prior confirmed-swing liquidity sweep",
      sweepStatus,
      sweep
        ? `${isLong(side) ? "Sell-side" : "Buy-side"} liquidity swept ${fmt(sweep.pivot.price)} and the closed bar rejected back through it; the pivot was confirmed two closed bars after it formed.`
        : sweepStatus === "waiting"
          ? "No closed-bar sweep/rejection of a confirmed prior swing yet."
          : "Sweep is not asserted while directional context is unavailable or opposing.",
    ),
  );
  if (sweep) {
    const bar = candles[sweep.index];
    zones.push(
      zone(
        `sweep-${strategy.id}-${bar.time}`,
        "sweep",
        side,
        candles,
        sweep.index,
        sweep.index,
        isLong(side) ? bar.low : sweep.pivot.price,
        isLong(side) ? sweep.pivot.price : bar.high,
        "Confirmed prior-swing sweep",
        strategy,
      ),
    );
  }

  const movement = sweep ? findDisplacement(candles, side, sweep) : {};
  const displacementStatus = movement.displacement ? "met" : blocked(steps[1]);
  steps.push(
    step(
      "displacement",
      "Opposite displacement body versus prior ATR",
      displacementStatus,
      movement.displacement
        ? `Closed ${isLong(side) ? "bullish" : "bearish"} body ${fmt(movement.displacement.body)} is at least prior ATR ${fmt(movement.displacement.atr)}.`
        : displacementStatus === "waiting"
          ? "No directional closed body at least the prior ATR after the sweep."
          : "Displacement remains unavailable until a valid preceding sweep exists.",
    ),
  );
  const mssStatus = movement.mss
    ? "met"
    : movement.displacement
      ? "waiting"
      : blocked(steps[2]);
  steps.push(
    step(
      "mss",
      "Market-structure shift (MSS)",
      mssStatus,
      movement.mss
        ? `Close ${fmt(candles[movement.mss.index].close)} crossed the pre-displacement structural level ${fmt(movement.mss.structural)}.`
        : movement.displacement
          ? "A qualifying body exists, but it has not closed through the required local structural level."
          : "MSS remains unavailable until displacement is established.",
    ),
  );
  if (movement.mss) {
    const bar = candles[movement.mss.index];
    zones.push(
      zone(
        `mss-${strategy.id}-${bar.time}`,
        "mss",
        side,
        candles,
        movement.mss.index,
        movement.mss.index,
        bar.low,
        bar.high,
        "Displacement / MSS candle",
        strategy,
      ),
    );
  }

  let fvg: SetupZone | undefined;
  if (movement.mss) {
    for (
      let index = Math.max(2, movement.mss.index);
      index < candles.length;
      index++
    ) {
      const left = candles[index - 2],
        right = candles[index];
      if (isLong(side) && right.low > left.high) {
        fvg = zone(
          `fvg-${strategy.id}-${right.time}`,
          "fvg",
          side,
          candles,
          index - 2,
          index,
          left.high,
          right.low,
          "Bullish FVG CE",
          strategy,
        );
        break;
      }
      if (!isLong(side) && right.high < left.low) {
        fvg = zone(
          `fvg-${strategy.id}-${right.time}`,
          "fvg",
          side,
          candles,
          index - 2,
          index,
          right.high,
          left.low,
          "Bearish FVG CE",
          strategy,
        );
        break;
      }
    }
  }
  const fvgRequired = family === "silver-bullet";
  const fvgStatus = fvg
    ? "met"
    : movement.mss
      ? fvgRequired
        ? "waiting"
        : "unknown"
      : blocked(steps[3]);
  steps.push(
    step(
      "fvg",
      "Regular three-bar FVG / CE",
      fvgStatus,
      fvg
        ? `${fvg.label} spans ${fmt(fvg.low)}–${fmt(fvg.high)}; CE is ${fmt(fvg.ce!)}.`
        : fvgRequired
          ? "No regular same-direction FVG has formed after the confirmed displacement."
          : "No regular FVG is available; this family may use a supported OB alternative.",
    ),
  );
  if (fvg) zones.push(fvg);

  let ob: SetupZone | undefined;
  if (movement.mss && sweep) {
    for (let index = movement.mss.index - 1; index > sweep.index; index--) {
      const bar = candles[index],
        opposite = isLong(side) ? bar.close < bar.open : bar.close > bar.open;
      if (opposite) {
        ob = zone(
          `ob-${strategy.id}-${bar.time}`,
          "ob",
          side,
          candles,
          index,
          index,
          Math.min(bar.open, bar.close),
          Math.max(bar.open, bar.close),
          "Last opposite order-block body CE",
          strategy,
        );
        break;
      }
    }
  }
  const obRequired = family === "ob-retest";
  const obStatus = ob
    ? "met"
    : movement.mss
      ? obRequired
        ? "waiting"
        : "unknown"
      : blocked(steps[3]);
  steps.push(
    step(
      "order-block",
      "Last-opposite order-block body / CE",
      obStatus,
      ob
        ? `${ob.label} spans body ${fmt(ob.low)}–${fmt(ob.high)}; CE is ${fmt(ob.ce!)}.`
        : obRequired
          ? "No last opposite candle body was found between the sweep and displacement."
          : "No supported last-opposite OB is available; this family may use a regular FVG alternative.",
    ),
  );
  if (ob) zones.push(ob);

  const poi =
    family === "silver-bullet"
      ? fvg
        ? {
            zone: fvg,
            index: candles.findIndex((bar) => bar.time === fvg!.endTime),
            kind: "fvg" as const,
          }
        : undefined
      : family === "ob-retest"
        ? ob
          ? {
              zone: ob,
              index: candles.findIndex((bar) => bar.time === ob!.endTime),
              kind: "ob" as const,
            }
          : undefined
        : fvg
          ? {
              zone: fvg,
              index: candles.findIndex((bar) => bar.time === fvg!.endTime),
              kind: "fvg" as const,
            }
          : ob
            ? {
                zone: ob,
                index: candles.findIndex((bar) => bar.time === ob!.endTime),
                kind: "ob" as const,
              }
            : undefined;
  let retracementIndex: number | undefined;
  if (poi?.zone.ce !== undefined) {
    for (
      let index = Math.max(poi.index, movement.mss?.index ?? poi.index) + 1;
      index < candles.length;
      index++
    )
      if (
        candles[index].low <= poi.zone.ce &&
        candles[index].high >= poi.zone.ce
      ) {
        retracementIndex = index;
        break;
      }
  }
  const poiReady = Boolean(
    poi && movement.mss && sweep && contextStatus === "met",
  );
  const retraceStatus: SetupStep["status"] =
    retracementIndex !== undefined && poiReady
      ? "met"
      : poiReady
        ? "waiting"
        : poi
          ? "unknown"
          : blocked(steps[3]);
  steps.push(
    step(
      "retest",
      "FVG / last-opposite OB CE retracement",
      retraceStatus,
      retracementIndex !== undefined && poi
        ? `Closed bar at ${new Date(candles[retracementIndex].time * 1000).toISOString()} touched ${poi.kind.toUpperCase()} CE ${fmt(poi.zone.ce!)} after its formation.`
        : poiReady
          ? `Await a later closed-bar touch of the selected ${poi!.kind.toUpperCase()} CE ${fmt(poi!.zone.ce!)}; a zone alone is not an entry.`
          : "No fully ordered, supported POI/retest is available.",
    ),
  );

  const entry = poi?.zone.ce;
  const structuralStops = [
    sweep
      ? candles[sweep.index] &&
        (isLong(side) ? candles[sweep.index].low : candles[sweep.index].high)
      : undefined,
    ob && (isLong(side) ? ob.low : ob.high),
  ].filter((value): value is number => Number.isFinite(value));
  const stop =
    entry === undefined
      ? undefined
      : isLong(side)
        ? Math.min(...structuralStops)
        : Math.max(...structuralStops);
  const invalidated = Boolean(
    poi &&
    candles
      .slice(Math.max(poi.index, movement.mss?.index ?? poi.index) + 1)
      .some((c) =>
        isLong(side) ? c.close < poi.zone.low : c.close > poi.zone.high,
      ),
  );
  if (invalidated)
    steps.push(
      step(
        "poi-valid",
        "POI remains valid",
        "failed",
        "A closed bar invalidated the selected zone; no current entry is asserted.",
      ),
    );
  const baseQualified = Boolean(
    !invalidated &&
    contextStatus === "met" &&
    sweep &&
    movement.displacement &&
    movement.mss &&
    poi &&
    entry !== undefined &&
    validStop(side, entry, stop),
  );
  return {
    family,
    side,
    steps,
    zones,
    htf: context.bias,
    sweep,
    displacement: movement.displacement,
    mss: movement.mss,
    poi,
    retracementIndex,
    entry,
    stop,
    baseQualified,
    ready:
      baseQualified &&
      retraceStatus === "met" &&
      retracementIndex !== undefined &&
      retracementIndex >= candles.length - 2 &&
      !candles
        .slice(retracementIndex + 1)
        .some((c) => (isLong(side) ? c.low <= stop! : c.high >= stop!)),
  };
}

function stdvZones(
  sequence: Sequence,
  candles: Candle[],
  strategy: Strategy,
): SetupZone[] {
  if (!sequence.sweep || !sequence.mss) return [];
  const sweepBar = candles[sequence.sweep.index],
    mssBar = candles[sequence.mss.index];
  // Source labels are negative Fibonacci ratios, not Gaussian sigma.  Long convention:
  // A=displacement high (ratio 0), B=swept low (ratio 1), level=A+r(B-A), r<0.
  // Short mirrors it: A=displacement low, B=swept high.  Thus -2 extends away from B.
  const a = isLong(sequence.side) ? mssBar.high : mssBar.low;
  const b = isLong(sequence.side) ? sweepBar.low : sweepBar.high;
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return [];
  return [-2, -2.5, -4]
    .map((ratio) => {
      const price = a + ratio * (b - a);
      return {
        id: `stdv-${strategy.id}-${mssBar.time}-${ratio}`,
        kind: "stdv" as const,
        side: sequence.side,
        startTime: sweepBar.time,
        endTime: mssBar.time,
        low: price,
        high: price,
        ce: price,
        label: `STDV ${ratio} · A=${fmt(a)} (0), B=${fmt(b)} (1)`,
        source: `${strategy.source || SOURCE_FALLBACK}. Manipulation-range Fibonacci extension; not a statistical standard deviation.`,
        strategyId: strategy.id,
      };
    })
    .filter((item) => item.low > 0 && Number.isFinite(item.low));
}

function candidateFor(
  strategy: Strategy,
  sequence: Sequence,
  candles: Candle[],
): SetupCandidate {
  const zones =
    sequence.family === "stdv"
      ? [...sequence.zones, ...stdvZones(sequence, candles, strategy)]
      : sequence.zones;
  const stdvReady = Boolean(
    sequence.sweep &&
    sequence.mss &&
    zones.some((item) => item.kind === "stdv"),
  );
  const steps =
    sequence.family === "stdv"
      ? [
          ...sequence.steps,
          step(
            "stdv-targets",
            "STDV -2 / -2.5 / -4 manipulation-range targets",
            stdvReady ? "met" : sequence.mss ? "waiting" : "unknown",
            stdvReady
              ? "Targets use A=displacement extreme (0), B=swept extreme (1), then A+r(B-A) for r=-2/-2.5/-4; these labels are not statistical sigma."
              : "Need a confirmed sweep and displacement/MSS manipulation range before projecting targets.",
          ),
        ]
      : sequence.steps;
  const isTargetOnly = sequence.family === "stdv";
  const target =
    sequence.entry !== undefined && sequence.stop !== undefined
      ? sequence.entry +
        directional(sequence.side, 2 * Math.abs(sequence.entry - sequence.stop))
      : undefined;
  return {
    id: `setup-${strategy.id}-${sequence.side}-${candles.at(-1)?.time || 0}`,
    family: sequence.family,
    side: sequence.side,
    strategyId: strategy.id,
    strategyVersion: strategy.version,
    name: strategy.name,
    ready: isTargetOnly ? false : sequence.ready,
    steps,
    zones,
    entry: isTargetOnly ? undefined : sequence.entry,
    stop: isTargetOnly ? undefined : sequence.stop,
    target: isTargetOnly ? undefined : target,
    source: strategy.source || SOURCE_FALLBACK,
  };
}

function utcAnalyticalDays(
  candles: Candle[],
  timeframe: Timeframe,
  asOf: number,
): Candle[] {
  const seconds = SECONDS[timeframe],
    byDay = new Map<number, Candle[]>();
  for (const bar of candles) {
    const start = Math.floor(bar.time / 86400) * 86400;
    if (start + 86400 > asOf) continue;
    const group = byDay.get(start) || [];
    group.push(bar);
    byDay.set(start, group);
  }
  const output: Candle[] = [];
  for (const [start, group] of byDay) {
    const ordered = group.sort((a, b) => a.time - b.time),
      first = ordered[0],
      last = ordered.at(-1)!;
    // Do not call a fragment a daily bar.  This only tests time coverage, not a broker session.
    if (first.time > start + seconds || last.time < start + 86400 - seconds)
      continue;
    output.push({
      time: start,
      open: first.open,
      close: last.close,
      high: Math.max(...ordered.map((bar) => bar.high)),
      low: Math.min(...ordered.map((bar) => bar.low)),
      volume: ordered.reduce((sum, bar) => sum + bar.volume, 0),
    });
  }
  return output.sort((a, b) => a.time - b.time);
}

function profileAndPreviousDay(
  input: SetupInput,
  candles: Candle[],
  asOf: number,
): { profile: HistoricalProfile; previousDay?: SetupAnalysis["previousDay"] } {
  const provider = closedBars(input.daily || [], SECONDS["1d"], asOf);
  const previous = provider.at(-1);
  const previousDay = previous
    ? {
        high: previous.high,
        low: previous.low,
        at: previous.time,
        source: `Last completed provider daily candle · ${input.dailySource || input.source}; provider-day semantics, not a guessed exchange session.`,
      }
    : undefined;
  const monday = (time: number) => {
    const d = new Date(time * 1000);
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.getTime() / 1000;
  };
  const week = monday(asOf),
    priorWeek = week - 604800;
  const current = provider.filter((c) => c.time >= week),
    prior = provider.filter((c) => c.time >= priorWeek && c.time < week);
  const source = `Completed provider daily bars · ${input.dailySource || input.source}`;
  const basis =
    "ISO UTC reporting week (Monday boundary); classify the latest completed weekly-to-date close versus the first provider daily open in this reporting week and versus the prior reporting-week close. This is not a discretionary WR1 weekly-profile classifier or a guaranteed broker week/session.";
  if (!current.length || prior.length < 3)
    return {
      profile: {
        bias: "Unknown",
        source,
        basis,
        explanation:
          "Need a completed current-week provider daily observation and at least three prior-week observations; direction is not invented.",
      },
      previousDay,
    };
  const first = current[0],
    last = current.at(-1)!,
    priorLast = prior.at(-1)!;
  const bias: HistoricalProfile["bias"] =
    last.close > first.open && last.close > priorLast.close
      ? "Bullish"
      : last.close < first.open && last.close < priorLast.close
        ? "Bearish"
        : "Neutral";
  return {
    profile: {
      bias,
      source,
      basis,
      asOf: last.time + 86400,
      weeklyOpen: first.open,
      priorWeekHigh: Math.max(...prior.map((c) => c.high)),
      priorWeekLow: Math.min(...prior.map((c) => c.low)),
      explanation: `Weekly-to-date open ${fmt(first.open)}, last completed close ${fmt(last.close)}, prior-week close ${fmt(priorLast.close)}. Mixed direction is Neutral. Partial week, descriptive context only.`,
    },
    previousDay,
  };
}
type lastType = "Bullish" | "Bearish" | "Neutral";

function wilson(wins: number, total: number): [number, number] | undefined {
  if (!total) return undefined;
  const z = 1.96,
    p = wins / total,
    denominator = 1 + (z * z) / total,
    centre = (p + (z * z) / (2 * total)) / denominator;
  const radius =
    (z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total)) /
    denominator;
  return [Math.max(0, centre - radius), Math.min(1, centre + radius)];
}
const shape = (candles: Candle[]) => {
  if (candles.length < 2) return [];
  const base = candles[0].close,
    values = candles.map((bar) => Math.log(bar.close / base));
  const norm =
    Math.sqrt(values.reduce((sum, value) => sum + value * value, 0)) || 1;
  return values.map((value) => value / norm);
};
const distance = (a: number[], b: number[]) =>
  a.length === b.length && a.length > 0
    ? Math.sqrt(
        a.reduce((sum, value, index) => sum + (value - b[index]) ** 2, 0) /
          a.length,
      )
    : Infinity;

function compatibleAt(
  candles: Candle[],
  hourly: Candle[],
  cutoff: number,
  side: Direction,
  strategies: { strategy: Strategy; family: SupportedFamily }[],
  combination: "all" | "any",
): { primary?: Sequence; all: Sequence[] } {
  const sequences = strategies.map((item) =>
    buildSequence(candles, hourly, cutoff, side, item.family, item.strategy),
  );
  const executable = sequences.filter((item) => item.family !== "stdv");
  if (!executable.length) return { all: sequences };
  const standard =
    combination === "all"
      ? executable.every((item) => item.baseQualified) &&
        sequences
          .filter((item) => item.family === "stdv")
          .every((item) => item.sweep && item.mss)
      : executable.some((item) => item.baseQualified);
  return {
    primary: standard
      ? executable.find((item) => item.baseQualified)
      : undefined,
    all: sequences,
  };
}

function historicalCases(
  candles: Candle[],
  hourly: Candle[],
  strategies: { strategy: Strategy; family: SupportedFamily }[],
  combination: "all" | "any",
  side: Direction,
  executionSeconds: number,
): Case[] {
  const queryStart = candles.length - QUERY_WINDOW;
  const earliest = 20;
  const usable = queryStart - HORIZON - earliest;
  if (usable <= 0) return [];
  const stride = Math.max(1, Math.ceil(usable / MAX_CASE_SCANS));
  const cases: Case[] = [];
  let lastAccepted = -Infinity;
  for (
    let anchor = earliest;
    anchor + HORIZON < queryStart && cases.length < MAX_SAMPLES;
    anchor += stride
  ) {
    if (anchor - lastAccepted < QUERY_WINDOW + HORIZON) continue;
    const history = candles.slice(0, anchor + 1),
      state = compatibleAt(
        history,
        hourly,
        history.at(-1)!.time + executionSeconds,
        side,
        strategies,
        combination,
      ),
      primary = state.primary;
    // The retest must have become visible at this historical close.  Future outcome bars
    // start on the following bar; no bar used in a result is part of the current query window.
    if (
      !primary ||
      !primary.ready ||
      primary.retracementIndex !== anchor ||
      primary.entry === undefined ||
      primary.stop === undefined
    )
      continue;
    const future = candles.slice(anchor + 1, anchor + 1 + HORIZON);
    if (future.length < HORIZON || anchor + HORIZON >= queryStart) continue;
    const entry = future[0].open;
    if (!validStop(side, entry, primary.stop)) continue;
    const target =
      entry + directional(side, 2 * Math.abs(entry - primary.stop));
    let outcome: "win" | "loss" | "unresolved" = "unresolved",
      ambiguous = false;
    for (const bar of future) {
      const stopped = isLong(side)
        ? bar.low <= primary.stop
        : bar.high >= primary.stop;
      const won = isLong(side) ? bar.high >= target : bar.low <= target;
      if (stopped) {
        outcome = "loss";
        ambiguous = won;
        break;
      } // conservative if one OHLC bar reaches both
      if (won) {
        outcome = "win";
        break;
      }
    }
    cases.push({
      anchor,
      sequence: primary,
      side,
      entry,
      stop: primary.stop,
      target,
      outcome,
      ambiguous,
      future,
    });
    lastAccepted = anchor;
  }
  return cases;
}

function estimateFor(cases: Case[]): HistoricalEstimate {
  const resolved = cases.filter((item) => item.outcome !== "unresolved"),
    wins = resolved.filter((item) => item.outcome === "win").length,
    losses = resolved.length - wins;
  const rate = resolved.length >= 100 ? wins / resolved.length : null;
  return {
    rate,
    wins,
    losses,
    unresolved: cases.length - resolved.length,
    ambiguous: cases.filter((item) => item.ambiguous).length,
    samples: cases.length,
    interval: resolved.length >= 30 ? wilson(wins, resolved.length) : undefined,
    from: cases[0]?.future[0]?.time,
    to: cases.at(-1)?.future.at(-1)?.time,
    horizon: HORIZON,
    costs:
      "Hypothetical next-bar-open after the closed retest; 2R price-distance target. Excluded: supplied OHLC has no spread, commission, slippage, financing, fill queue, or intrabar order-path data. Same-bar stop/target is counted as a conservative loss.",
    label:
      rate === null
        ? `Insufficient resolved non-overlapping qualified cases (${resolved.length}/100 required); observed rate withheld.`
        : `Observed target-before-stop fraction across ${resolved.length} resolved, non-overlapping qualified cases; UNCONFIRMED without costed walk-forward and untouched holdout. Uncertainty interval is descriptive only.`,
    probability: null,
  };
}

function makeScenario(
  cases: Case[],
  candles: Candle[],
  strategyIds: string[],
  versions: number[],
  combination: "all" | "any",
): SetupAnalysis["scenario"] {
  if (!cases.length) return undefined;
  const current = shape(candles.slice(-QUERY_WINDOW));
  const ranked = cases
    .map((item) => ({
      ...item,
      distance: distance(
        shape(
          candles.slice(
            Math.max(0, item.anchor - QUERY_WINDOW + 1),
            item.anchor + 1,
          ),
        ),
        current,
      ),
    }))
    .sort((a, b) => a.distance - b.distance);
  const match = ranked[0],
    base = candles[match.anchor].close,
    scale = candles.at(-1)!.close / base;
  // Keep source timestamps intact.  Every returned ghost OHLC bar is an actual historical
  // future bar strictly before the withheld current query window; only prices are rescaled.
  const normalized = match.future.map((bar) => ({
    ...bar,
    open: bar.open * scale,
    high: bar.high * scale,
    low: bar.low * scale,
    close: bar.close * scale,
  }));
  return {
    id: `historical-${candles[match.anchor].time}`,
    anchorAt: candles.at(-1)!.time,
    sourceAt: candles[match.anchor].time,
    source: "Closed supplied OHLC · compatible selected setup model",
    strategyIds,
    strategyVersions: versions,
    combination,
    candles: normalized,
    side: match.side,
    basis: "strategy-matched",
    anchorPrice: candles.at(-1)!.close,
    queryBars: QUERY_WINDOW,
    sourceEndAt: match.future.at(-1)!.time,
    distance: match.distance,
    explanation: `Historical source outcome begins after ${new Date(candles[match.anchor].time * 1000).toISOString()} and ends before the current ${QUERY_WINDOW}-bar query window. OHLC prices are normalized by ${fmt(scale)} to the current close; this is a scenario overlay, not a forecast.`,
    referenceId: match.sequence.family,
  };
}

/** Analyze only closed supplied bars.  It is intentionally deterministic and bounded so imported history can reuse it later. */
export function analyzeSetups(input: SetupInput): SetupAnalysis {
  const asOf = nowSeconds(input.now),
    candles = closedBars(input.candles || [], SECONDS[input.timeframe], asOf),
    hourly = closedBars(input.hourly || [], SECONDS["1h"], asOf);
  const messages: string[] = [];
  const distinct = Array.from(
    new Map(
      (input.strategies || []).map((strategy) => [strategy.id, strategy]),
    ).values(),
  );
  if (distinct.length > 3)
    messages.push(
      "Only the first three selected source models are evaluated; this bounded engine does not silently combine additional rulebooks.",
    );
  const selected = distinct.slice(0, 3),
    supported: { strategy: Strategy; family: SupportedFamily }[] = [];
  const numerical: { strategy: Strategy; family: IndicatorFamily }[] = [];
  const indicators = indicatorSnapshot(
    candles,
    input.timeframe,
    input.source,
    asOf,
  );
  const vwapStrategies: Strategy[] = [];
  const orbStrategies: Strategy[] = [];
  const sessionStrategies: Strategy[] = [];
  for (const strategy of selected) {
    const family = resolveSetupFamily(strategy);
    if (isSessionStrategyFamily(family)) {
      sessionStrategies.push(strategy);
      continue;
    }
    if (family === "orb") {
      orbStrategies.push(strategy);
      continue;
    }
    if (family === "vwap-stdv") {
      vwapStrategies.push(strategy);
      continue;
    }
    if (isIndicatorFamily(family)) numerical.push({ strategy, family });
    else if (
      ["core-sequence", "silver-bullet", "ob-retest", "stdv"].includes(family)
    )
      supported.push({ strategy, family: family as SupportedFamily });
    else
      messages.push(
        `${strategy.name} is an arbitrary/custom or unsupported source definition. Its SMT, RDRB, session, visual, or other discretionary rules remain unknown and are not automatically marked met.`,
      );
  }
  if (
    !supported.length &&
    !numerical.length &&
    !orbStrategies.length &&
    !sessionStrategies.length &&
    !vwapStrategies.length
  )
    messages.push(
      "Select at least one supported source model (Core Sequence, Sweep + FVG / Silver Bullet, Order Block Retest, or STDV) for automatic OHLC setup retrieval.",
    );
  if (candles.length < 8)
    messages.push(
      "Too few completed execution bars for a causal sweep/displacement sequence. Future or still-forming bars were excluded.",
    );
  const profileContext = profileAndPreviousDay(input, candles, asOf);
  const candidates: SetupCandidate[] = [];
  const orbContexts: OrbContext[] = [];
  const orbLevels: Level[] = [];
  for (const strategy of orbStrategies) {
    const result = analyzeOrb(
      { ...input, candles, hourly, now: asOf },
      strategy,
    );
    candidates.push(...result.candidates);
    orbContexts.push(result.context);
    orbLevels.push(...result.levels);
    messages.push(...result.messages);
  }
  const sessionContexts: SessionStrategyContext[] = [];
  for (const strategy of sessionStrategies) {
    const result =
      resolveSetupFamily(strategy) === "pdc-continuation"
        ? detectPdcContinuation(
            { ...input, candles, hourly, now: asOf },
            strategy,
          )
        : detectSessionRangeStrategy(
            { ...input, candles, hourly, now: asOf },
            strategy,
          );
    candidates.push(...result.candidates);
    sessionContexts.push(result.context);
    messages.push(...result.context.missing.slice(0, 8));
  }
  if (candles.length >= 3)
    for (const item of supported)
      for (const side of ["long", "short"] as const) {
        const sequence = buildSequence(
          candles,
          hourly,
          asOf,
          side,
          item.family,
          item.strategy,
        );
        // Preserve both sides only when the directional context is unknown; an opposing closed
        // context is represented as failed rather than concealed.
        candidates.push(candidateFor(item.strategy, sequence, candles));
      }
  const supportedExecution = SECONDS[input.timeframe] < SECONDS["1h"];
  if (!supportedExecution) {
    if (supported.length)
      messages.push(
        "Legacy reference execution requires a sub-hour chart. This chart can retain profiles/levels and an explicitly manual ATR proposal, but hourly data is not labelled higher than a 1h/1d execution frame.",
      );
    candidates.forEach((c) => {
      c.ready = false;
      const h = c.steps.find((s) => s.id === "htf-context");
      if (h) {
        h.status = "unknown";
        h.name = "Hourly context is not higher than this execution frame";
      }
    });
  }
  for (const strategy of vwapStrategies) {
    const result = analyzeVwapStdv(
      strategy,
      candles,
      input.timeframe,
      input.source,
      asOf,
    );
    candidates.push(
      ...result.candidates.map((candidate) => ({
        ...candidate,
        family: "vwap-stdv" as const,
      })),
    );
    messages.push(...result.curves.messages.slice(0, 2));
  }
  const executable = supported.filter((item) => item.family !== "stdv");
  for (const item of numerical)
    candidates.push(
      indicatorCandidate(
        item.strategy,
        item.family,
        candles,
        input.timeframe,
        input.source,
        asOf,
        indicators,
      ),
    );
  if (numerical.length)
    messages.push(
      "Indicator entries use their exact closed-bar source definitions. Unknown stop distance, catalysts, tick size or microstructure do not become automatic confluences. No mirrored short rules are inferred.",
    );
  if (input.combination === "all" && executable.length > 1)
    for (const side of ["long", "short"] as const) {
      const allEntries = executable.every((item) =>
        candidates.some(
          (candidate) =>
            candidate.strategyId === item.strategy.id &&
            candidate.side === side &&
            candidate.ready,
        ),
      );
      const allTargetConditions = supported
        .filter((item) => item.family === "stdv")
        .every((item) =>
          candidates.some(
            (candidate) =>
              candidate.strategyId === item.strategy.id &&
              candidate.side === side &&
              candidate.steps.some(
                (step) => step.id === "stdv-targets" && step.status === "met",
              ),
          ),
        );
      if (!allEntries || !allTargetConditions)
        for (const candidate of candidates)
          if (candidate.side === side && candidate.family !== "stdv")
            candidate.ready = false;
    }
  const contextDirection = htfContext(hourly, asOf).bias;
  const aligned = !supportedExecution
    ? undefined
    : contextDirection === "Bullish"
      ? "long"
      : contextDirection === "Bearish"
        ? "short"
        : undefined;
  const rawConfluences = candidates
    .filter(
      (c) =>
        c.family === "orb" ||
        isSessionStrategyFamily(c.family) ||
        isIndicatorFamily(c.family) ||
        (aligned && c.side === aligned),
    )
    .flatMap((candidate) =>
      candidate.steps.map((item) => ({
        ...item,
        id: `${candidate.strategyId}:${candidate.side}:${item.id}`,
      })),
    );
  const confluences = [
    ...new Map(
      rawConfluences.map((s) => [
        s.name + "|" + s.status + "|" + s.evidence,
        s,
      ]),
    ).values(),
  ];
  const readySides = new Set(
    candidates.filter((item) => item.ready).map((item) => item.side),
  );
  if (readySides.size > 1)
    messages.push(
      "Selected source models currently conflict across long and short candidates; no combined direction is asserted.",
    );
  if (input.combination === "all" && supported.length > 1)
    messages.push(
      "ALL requires every selected compatible entry model to qualify on the same side. Combining filters does not imply a higher win rate.",
    );
  if (input.combination === "any" && supported.length > 1)
    messages.push(
      "ANY lists independently qualifying source models; it does not imply that combined signals have a higher win rate.",
    );
  if (supported.length && supported.every((item) => item.family === "stdv"))
    messages.push(
      "STDV is a manipulation-range target reference, not a standalone entry model; it cannot by itself create a ready setup or historical entry outcome.",
    );

  const unsupportedAll =
    input.combination === "all" &&
    supported.length +
      numerical.length +
      orbStrategies.length +
      sessionStrategies.length +
      vwapStrategies.length <
      selected.length;
  if (unsupportedAll) {
    messages.push(
      "ALL includes an unsupported source definition. Combined readiness and historical conditioning are withheld rather than silently dropping its rules.",
    );
    candidates.forEach((c) => (c.ready = false));
  }
  if (input.combination === "all" && selected.length > 1) {
    for (const side of ["long", "short"] as const) {
      const alignedSelection = selected.every((s) =>
        candidates.some(
          (c) =>
            c.strategyId === s.id &&
            c.side === side &&
            (c.family === "stdv"
              ? c.steps.some(
                  (step) => step.id === "stdv-targets" && step.status === "met",
                )
              : c.ready),
        ),
      );
      if (!alignedSelection)
        candidates
          .filter((c) => c.side === side)
          .forEach((c) => {
            c.ready = false;
          });
    }
  }
  const numericalHistoryMissing =
    numerical.length > 0 || orbStrategies.length > 0;
  if (numericalHistoryMissing)
    messages.push(
      "Strategy-specific outcome evaluation is not configured for these indicator/microstructure/ORB references. A contextual historical replay can still be drawn, but is never reported as a backtest of those rules.",
    );
  const currentSides =
    unsupportedAll || !supportedExecution || numericalHistoryMissing
      ? []
      : (["long", "short"] as const).filter((side) => {
          const state = compatibleAt(
            candles,
            hourly,
            asOf,
            side,
            supported,
            input.combination,
          );
          return Boolean(state.primary);
        });
  const cases =
    !input.skipHistorical && currentSides.length === 1 && executable.length
      ? historicalCases(
          candles,
          hourly,
          supported,
          input.combination,
          currentSides[0],
          SECONDS[input.timeframe],
        )
      : [];
  if (currentSides.length > 1)
    messages.push(
      "Historical conditioning is withheld while selected compatible models disagree on direction.",
    );
  if (currentSides.length === 0 && executable.length)
    messages.push(
      "Strategy-conditioned retrieval awaits a compatible setup; a separately labeled real-history context replay does not require a ready entry.",
    );
  const estimate = estimateFor(cases);
  if (estimate.rate === null) messages.push(estimate.label);
  messages.push(
    "Historical probability remains null by design. An empirical rate, when enough resolved cases exist, is not a calibrated future probability.",
  );
  messages.push(estimate.costs);
  const levels: Level[] = [...orbLevels];
  if (profileContext.previousDay) {
    levels.push({
      id: "pdh",
      strategyId: "daily-profile",
      market: input.market.id,
      name: "PDH · last completed provider/analytical daily bar",
      price: profileContext.previousDay.high,
      color: "#93C5FD",
    });
    levels.push({
      id: "pdl",
      strategyId: "daily-profile",
      market: input.market.id,
      name: "PDL · last completed provider/analytical daily bar",
      price: profileContext.previousDay.low,
      color: "#FCA5A5",
    });
  }
  for (const context of sessionContexts) {
    if (context.range)
      for (const [suffix, name, price] of [
        ["high", "High", context.range.high],
        ["low", "Low", context.range.low],
        ["midpoint", "50%", context.range.midpoint],
      ] as const)
        levels.push({
          id: `${context.strategyId}-session-${suffix}`,
          strategyId: context.strategyId,
          market: input.market.id,
          name: `${context.family === "initial-balance" ? "IB" : context.family === "london-breakout" ? "Asian range" : "Declared premarket"} ${name}`,
          price,
          color:
            context.family === "london-breakout"
              ? "#38BDF8"
              : context.family === "initial-balance"
                ? "#FBBF24"
                : "#A78BFA",
        });
    if (context.pdc)
      levels.push({
        id: `${context.strategyId}-pdc`,
        strategyId: context.strategyId,
        market: input.market.id,
        name: `PDC · ${context.pdc.basis === "provider-utc-day" ? "declared provider UTC day" : "last observed owner-declared session close"}`,
        price: context.pdc.price,
        color: "#A78BFA",
      });
  }
  for (const candidate of candidates)
    for (const item of candidate.zones)
      if (item.ce !== undefined && item.kind !== "session-range")
        levels.push({
          id: `${candidate.strategyId}-${item.id}`,
          strategyId: candidate.strategyId,
          market: input.market.id,
          name: item.label,
          price: item.ce,
          color: COLORS[candidate.family as SupportedFamily] || "#94A3B8",
        });
  const matchedScenario = makeScenario(
    cases,
    candles,
    selected.map((s) => s.id),
    selected.map((s) => s.version),
    input.combination,
  );
  const scenario = input.skipHistorical
    ? undefined
    : matchedScenario ||
      contextualScenario(
        candles,
        input.market.id,
        input.timeframe,
        selected,
        input.combination,
        input.source,
      );
  if (scenario) scenario.direction = scenarioDirection(scenario);
  if (scenario?.basis === "context-replay")
    messages.push(
      "Historical context replay: nearest completed same-market/frame price shape, not proof that the selected strategy rules were matched or a prediction.",
    );
  if (!input.skipHistorical && !scenario)
    messages.push(
      "Historical source replay unavailable: need at least 36 valid closed bars containing a completed past continuation before the current query window. No future OHLC was invented.",
    );
  const descriptive = statistics(candles);
  const rhythm = descriptive
    ? {
        volatility: descriptive.volatility,
        autocorrelation: descriptive.autocorrelation,
        momentum: descriptive.momentum,
        bars: descriptive.bars,
      }
    : null;
  return {
    market: input.market.id,
    timeframe: input.timeframe,
    asOf,
    candles: candles.slice(-MAX_BARS),
    source: input.source,
    profile: profileContext.profile,
    previousDay: profileContext.previousDay,
    candidates,
    confluences,
    levels,
    scenario,
    estimate,
    rhythm,
    messages,
    selectedStrategyIds: selected.map((item) => item.id),
    combination: input.combination,
    indicators,
    attachedIndicators: strategyIndicatorLayers(selected),
    ...(orbContexts.length ? { orbContexts } : {}),
    ...(sessionContexts.length ? { sessionContexts } : {}),
  };
}

function rrAt(
  market: Market,
  side: Direction,
  entry: number,
  stop: number,
  target: number,
): number {
  return tradeMetrics({
    entry,
    stop,
    target,
    quantity: 1,
    side,
    pointValue: market.pointValue,
    market: market.id,
    valuationSymbol: market.valuationSymbol,
    initialRisk: undefined,
    initialQuantity: undefined,
    realizedPnl: undefined,
  }).rr;
}

export function targetAtR(
  market: Market,
  side: Direction,
  entry: number,
  stop: number,
  requiredR: number,
): number {
  const direction = isLong(side) ? 1 : -1,
    distance = Math.abs(entry - stop);
  let near = entry,
    far = entry + direction * distance * requiredR;
  // USDJPY/USDCAD need a farther quote move than simple price-distance 2R because
  // tradeMetrics converts P/L at the stop/target price.  Bracket the exact metric R.
  for (let attempt = 0; attempt < 32; attempt++) {
    if (far <= 0) break;
    if (rrAt(market, side, entry, stop, far) >= requiredR) {
      for (let iteration = 0; iteration < 48; iteration++) {
        const mid = (near + far) / 2;
        if (rrAt(market, side, entry, stop, mid) >= requiredR) far = mid;
        else near = mid;
      }
      return far;
    }
    far = entry + direction * Math.abs(far - entry) * 2;
  }
  throw new Error(
    "Unable to form the requested R target under the available USD valuation conversion.",
  );
}

function nearestValidTarget(
  analysis: SetupAnalysis,
  market: Market,
  side: Direction,
  entry: number,
  stop: number,
): { target: number; reason: string } {
  const direction = isLong(side) ? 1 : -1;
  const minimum = targetAtR(market, side, entry, stop, 2);
  const possibilities: number[] = [];
  for (const candidate of analysis.candidates)
    for (const item of candidate.zones)
      if (
        item.kind === "stdv" &&
        item.side === side &&
        item.ce !== undefined &&
        direction * (item.ce - entry) > 0 &&
        rrAt(market, side, entry, stop, item.ce) >= 2
      )
        possibilities.push(item.ce);
  if (analysis.previousDay) {
    const liquidity = isLong(side)
      ? analysis.previousDay.high
      : analysis.previousDay.low;
    if (
      direction * (liquidity - entry) > 0 &&
      rrAt(market, side, entry, stop, liquidity) >= 2
    )
      possibilities.push(liquidity);
  }
  if (!possibilities.length)
    return {
      target: minimum,
      reason:
        "2R tradeMetrics-aware geometry fallback; no valid opposing liquidity/range target at or beyond 2R was available.",
    };
  const target = possibilities.sort(
    (a, b) => Math.abs(a - entry) - Math.abs(b - entry),
  )[0];
  return {
    target,
    reason:
      "Nearest valid named manipulation-range or prior-day-liquidity target at or beyond 2R; it is a geometry reference, not an optimal target claim.",
  };
}

/** Build a paper-only editable proposal.  It refuses an explicit no-paper market and never places an order. */
export function proposePaper(
  analysis: SetupAnalysis,
  market: Market,
  side: Direction,
  entry: number,
  balance: number,
  riskPct = 0.5,
): PaperProposal {
  if (market.paperSupported === false)
    throw new Error(
      `${market.name} explicitly does not support paper proposals.`,
    );
  if (analysis.market !== market.id)
    throw new Error(
      "Analysis market does not match the requested paper market.",
    );
  if (
    !Number.isFinite(entry) ||
    entry <= 0 ||
    !Number.isFinite(balance) ||
    balance <= 0
  )
    throw new Error("Paper entry and balance must be positive finite values.");
  if (![0, 0.5, 1, 2].includes(riskPct))
    throw new Error(
      "Paper risk template must be 1%, 2%, or fixed units (legacy 0.5% proposals remain readable).",
    );
  const structural = analysis.candidates
    .filter(
      (candidate) =>
        candidate.side === side && validStop(side, entry, candidate.stop),
    )
    .sort((a, b) => Number(b.ready) - Number(a.ready))[0];
  let stop = structural?.stop,
    stopReason: string;
  const readyOrb = structural?.family === "orb" && structural.ready;
  const readySession = Boolean(
    structural?.ready && isSessionStrategyFamily(structural.family),
  );
  if (stop !== undefined && !readyOrb && !readySession) {
    const buffer = 10 ** -market.precision;
    stop += side === "long" ? -buffer : buffer;
  }
  if (readyOrb)
    stopReason =
      "Owner-approved ORB stop: the selected mode's actual verified instrument tick buffer beyond the retest opposite wick is already applied by the detector. No additional display-unit buffer or futures tick is applied to a CFD.";
  else if (readySession)
    stopReason =
      "Current session/PDC source stop is preserved exactly; configured true-tick offsets are already applied. No display-unit or generic ATR buffer is added.";
  else if (stop !== undefined)
    stopReason = `A one-display-precision-unit buffer is placed beyond the detected ${isIndicatorFamily(structural!.family) ? "source price/EMA/range reference" : structural!.zones.some((zone) => zone.kind === "ob") ? "sweep/order-block" : "sweep"} invalidation, not an instrument-tick or optimal-stop claim.`;
  else {
    const atr = priorAtr(analysis.candles, analysis.candles.length);
    if (!atr || !Number.isFinite(atr))
      throw new Error(
        "No valid sweep/order-block stop and insufficient closed ATR history for an explicit fallback.",
      );
    stop = entry + directional(side, -Math.max(atr, entry * 0.00001));
    stopReason = `No valid structural sweep/order-block stop was available; stop uses the explicit closed-bar ATR fallback (${fmt(atr)}), not an optimal-stop claim.`;
  }
  if (stop === undefined || !validStop(side, entry, stop))
    throw new Error(
      "Unable to form valid paper stop geometry from closed analysis.",
    );
  const riskDistance = Math.abs(entry - stop),
    target = readyOrb
      ? (() => {
          const context = analysis.orbContexts?.find(
            (item) => item.strategyId === structural!.strategyId,
          );
          return orbPaperGeometry(
            market,
            side,
            entry,
            stop,
            context?.config,
            context?.instrumentMetadata,
          ).target;
        })()
      : readySession
        ? (() => {
            const context = analysis.sessionContexts?.find(
              (item) => item.strategyId === structural!.strategyId,
            );
            if (!context)
              throw new Error("Current source session context is unavailable.");
            return sessionPaperGeometry(
              context.config,
              context,
              side,
              entry,
              stop!,
            ).target;
          })()
        : targetAtR(market, side, entry, stop, 2);
  if (!validTarget(side, entry, target))
    throw new Error(
      "Unable to form valid source/default paper target geometry.",
    );
  const perUnit = tradeMetrics({
    entry,
    stop,
    target,
    quantity: 1,
    side,
    pointValue: market.pointValue,
    market: market.id,
    valuationSymbol: market.valuationSymbol,
    initialRisk: undefined,
    initialQuantity: undefined,
    realizedPnl: undefined,
  }).risk;
  if (!Number.isFinite(perUnit) || perUnit <= 0)
    throw new Error(
      "USD valuation is unknown or invalid for automated paper sizing; no broker-lot size is assumed.",
    );
  // Fixed units still receive a bounded server proposal. The trader may reduce
  // or choose another positive unit count later, but paper-service never lets it
  // exceed this same 2% cap.
  const sizingPct = riskPct === 0 ? 2 : riskPct,
    allowance = balance * (sizingPct / 100),
    quantity = Math.floor((allowance / perUnit) * 1_000_000) / 1_000_000;
  if (!Number.isFinite(quantity) || quantity <= 0)
    throw new Error(
      "Risk allowance is too small for a positive paper quantity under the available valuation conversion.",
    );
  const metrics = tradeMetrics({
    entry,
    stop,
    target,
    quantity,
    side,
    pointValue: market.pointValue,
    market: market.id,
    valuationSymbol: market.valuationSymbol,
    initialRisk: undefined,
    initialQuantity: undefined,
    realizedPnl: undefined,
  });
  const partialAt = targetAtR(market, side, entry, stop, 2);
  const versions = analysis.candidates
    .filter((candidate) =>
      analysis.selectedStrategyIds.includes(candidate.strategyId),
    )
    .map((candidate) => candidate.strategyVersion)
    .filter((value, index, all) => all.indexOf(value) === index);
  const candidateNote = structural
    ? `${structural.name} v${structural.strategyVersion}: ${structural.ready ? (structural.family === "pdc-continuation" ? "its closed-volume and separately observed quote guards are currently met (sampled, not first tick)." : "its supported deterministic source entry is ready on closed bars.") : "it is a waiting/partial source price reference; inspect before any paper fill."}`
    : "No selected setup supplies a valid current structural stop; the plan relies on the disclosed ATR fallback.";
  return {
    side,
    entry,
    stop,
    target,
    quantity,
    riskPct,
    effectiveRiskCapPct: sizingPct,
    rr: metrics.rr,
    partialAt,
    initialRisk: metrics.risk,
    strategyIds: analysis.selectedStrategyIds,
    strategyVersions: versions,
    rationale: [
      "Paper-only proposal: no broker order, live fill, margin, or broker lot convention is created.",
      ...(readyOrb
        ? [
            "Ready ORB source bracket: exact3R within the video market's point band. No source-specific partial/break-even exit is implied.",
          ]
        : []),
      ...(readySession
        ? [
            "Session/PDC source bracket preserves the chosen LondonR/range, IB boundary expansion or owner-defined pivot target. No generic2R or source-invented partial/break-even rule is substituted.",
          ]
        : []),
      ...(analysis.candidates.some((c) => isIndicatorFamily(c.family))
        ? [
            "Generic paper review template: default 2R with user-selectable positive R or direct target, plus optional partial/break-even management. This does not faithfully execute the source EMA2ATR trail, BB/RSI SMA20 target, buy-stop-limit breakout or microstructure scalp; source-specific assumptions remain in the evidence card.",
          ]
        : []),
      `${candidateNote}`,
      stopReason,
      readyOrb || readySession
        ? "The source-specific target is retained; changing it is a manual-practice override, not faithful gated source execution."
        : "Default target uses tradeMetrics-aware 2R geometry; the ticket may explicitly choose another positive R or preserve an edited absolute target.",
      `Sizing uses tradeMetrics USD conversion (including USDJPY/USDCAD inverse-price conversion where applicable): ${riskPct === 0 ? "fixed-unit template with a 2% cap" : `${riskPct}% template`} allowance ${fmt(allowance)}, computed initial risk ${fmt(metrics.risk)}.`,
      readyOrb || readySession
        ? "Source bracket is full-position SL/TP; no partial or break-even behavior is implied by this source."
        : "Plan management convention: take 50% at 2R, then review break-even/remaining target manually. This is not an expected-value or performance claim.",
      `History limitation: ${analysis.estimate.label} ${analysis.estimate.costs}`,
    ],
    checklist: {
      purpose:
        "What to inspect before accepting a paper plan. This checklist is not a record of the trader’s actual thoughts, beliefs, or journal.",
      data: "Confirm provider symbol, fresh quote/bid-ask, candle closure, missing bars, and that the analytical UTC profile is not being treated as a broker/WR1 session.",
      context:
        "Verify the closed hourly context and the daily profile/PDH/PDL source; manually reject the plan if news, session, correlated-market, or discretionary context is unknown.",
      sequence: analysis.candidates.some((c) => isIndicatorFamily(c.family))
        ? "Inspect the selected source indicator conditions on closed bars, warm-up/formulas/timeframe, and every unknown execution prerequisite. Generic2R paper review does not confirm the source trail/SMA20/stop-limit/scalp execution."
        : "Inspect the confirmed prior swing, sweep rejection, body-versus-prior-ATR displacement, MSS level, selected FVG/OB body/CE, and actual later CE touch in timestamp order.",
      geometry: `Check ${side === "long" ? "stop < entry < target" : "target < entry < stop"}, the explicitly selected positive R or direct target, structural invalidation, and whether any named liquidity/range target is still valid at the intended entry.`,
      risk: `Recheck balance, ${riskPct === 0 ? "fixed units under the 2% cap" : `${riskPct}% allowance`}, quantity ${fmt(quantity)}, USD conversion, spread/slippage assumptions, and whether the partial 50% at 2R can actually be simulated.`,
      history:
        "Treat the empirical estimate/interval as limited descriptive history. It excludes costs and intrabar path, has conservative same-bar handling, and never supplies a probability.",
      journal:
        "Write the trader’s own rationale, emotional state, invalidation, and manual exit rules separately; none of those are inferred by this engine.",
    },
    analysis,
  };
}
