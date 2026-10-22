import type { Candle, Strategy, Timeframe } from "./model";
import { SECONDS } from "./engine";
import type { SetupCandidate, SetupStep } from "./setup-model";
import { INDICATOR_INFO, type IndicatorFamily } from "./indicator-presets";
import {
  completedIndicatorBars,
  indicatorSnapshot,
  type IndicatorSnapshot,
} from "./indicators";
import { isGitHubFamily } from "./github-presets";
import { githubCandidate } from "./github-setups";
const step = (
  id: string,
  name: string,
  status: SetupStep["status"],
  evidence: string,
): SetupStep => ({ id, name, status, evidence });
const show = (n: number | undefined) =>
  n === undefined ? "unavailable" : Number(n.toFixed(6)).toString();

/** Source long rules only; no short/reversal rules are inferred from indicator symmetry. */
export function indicatorCandidate(
  strategy: Strategy,
  family: IndicatorFamily,
  raw: Candle[],
  timeframe: Timeframe,
  source: string,
  now: number,
  supplied?: IndicatorSnapshot,
): SetupCandidate {
  const bars = completedIndicatorBars(raw, timeframe, now),
    snapshot = supplied || indicatorSnapshot(bars, timeframe, source, now),
    p = snapshot.points.at(-1),
    prev = snapshot.points.at(-2),
    last = bars.at(-1),
    lastIndex = bars.length - 1;
  if (isGitHubFamily(family))
    return githubCandidate(strategy, family, bars, snapshot);
  const steps: SetupStep[] = [],
    info = INDICATOR_INFO[family],
    sourceFrame = info.frames.includes(timeframe);
  steps.push(
    step(
      "source-frame",
      family === "scalping"
        ? "Actual tick / microstructure timeframe"
        : "Source execution timeframe",
      family === "scalping" ? "unknown" : sourceFrame ? "met" : "failed",
      family === "scalping"
        ? "Source5s/15s/1m tick charts. The existing1mOHLC and REST15s quotes are not tick/DOM/tape observations."
        : `${timeframe}; source frames ${info.frames.join(", ")}. ${timeframe === "4h" || timeframe === "1w" ? "Aggregated UTC analytical buckets, not a native venue session." : ""}`,
    ),
  );
  let ready = false,
    entry: number | undefined,
    stop: number | undefined,
    target: number | undefined;
  if (family === "scalping") {
    steps.push(
      step(
        "scalp-wall",
        "Actual Level2 buyer wall / green tape",
        "unknown",
        "No Level2 sizes, real Time&Sales aggressor prints or sudden bid/ask sizing source is connected.",
      ),
    );
    steps.push(
      step(
        "scalp-bid",
        "Passive buy at bid / queue fill",
        "unknown",
        "A displayed bid does not prove a passive limit order fills; queue position and executions are unknown. No DMA order exists.",
      ),
    );
    steps.push(
      step(
        "scalp-ticks",
        "2–5 tick stop / 3–10 tick limit target",
        "unknown",
        "Real instrument tick size was not supplied. Display decimals cannot define these prices or fabricate a profitable scalp.",
      ),
    );
  } else if (family === "trend-following") {
    const older = snapshot.points.at(-6),
      known =
        p?.ema20 !== undefined &&
        p.ema50 !== undefined &&
        older?.ema20 !== undefined &&
        older.ema50 !== undefined;
    const up = Boolean(
      known &&
      last &&
      last.close > p!.ema20! &&
      p!.ema20! > p!.ema50! &&
      p!.ema20! > older!.ema20! &&
      p!.ema50! > older!.ema50!,
    );
    steps.push(
      step(
        "ema-uptrend",
        "Price / EMA20 / EMA50 rising alignment",
        known ? (up ? "met" : "waiting") : "unknown",
        `Closed price ${show(last?.close)}, EMA20 ${show(p?.ema20)}, EMA50 ${show(p?.ema50)}. Five-bar prior EMA20 ${show(older?.ema20)}, EMA50 ${show(older?.ema50)};50-bar SMA seed +five-bar slope need55 closed observations.`,
      ),
    );
    const recentStart = Math.max(50, bars.length - 6);
    let touch = -1;
    for (let i = recentStart; i < bars.length; i++) {
      const v = snapshot.points[i];
      if (
        v?.ema20 !== undefined &&
        v.ema50 !== undefined &&
        bars[i].low <= v.ema20 &&
        bars[i].close > v.ema50
      ) {
        touch = i;
        break;
      }
    }
    let firstBounce = -1;
    if (touch >= 0)
      for (let i = touch; i < bars.length; i++) {
        const v = snapshot.points[i];
        if (
          v?.ema20 !== undefined &&
          bars[i].close > bars[i].open &&
          bars[i].close > v.ema20
        ) {
          firstBounce = i;
          break;
        }
      }
    const bounce = firstBounce === lastIndex && touch >= 0;
    steps.push(
      step(
        "ema-touch",
        "Recent closed-bar EMA20 pullback",
        known ? (touch >= 0 ? "met" : "waiting") : "unknown",
        touch >= 0
          ? `Low touched EMA20 on ${new Date(bars[touch].time * 1000).toISOString()}, within the explicit six-bar app window and above EMA50.`
          : "No recent supported closed EMA20 touch; do not infer an entry from rising lines alone.",
      ),
    );
    steps.push(
      step(
        "ema-bounce",
        "First green EMA20 bounce is latest closed bar",
        known ? (bounce ? "met" : "waiting") : "unknown",
        bounce
          ? "First green close above EMA20 after the recent touch is the latest completed observation."
          : firstBounce >= 0
            ? "The first bounce occurred earlier; it is not a fresh current entry."
            : "No qualifying latest closed green bounce.",
      ),
    );
    if (up && p?.ema50 !== undefined) {
      entry = last!.close;
      const swing = bars
        .slice(-10)
        .slice(0, -2)
        .filter(
          (c, i, arr) =>
            i > 0 &&
            i < arr.length - 1 &&
            c.low < arr[i - 1].low &&
            c.low < arr[i + 1].low,
        )
        .at(-1)?.low;
      stop =
        swing !== undefined && swing < entry
          ? Math.min(swing, p.ema50)
          : p.ema50;
    }
    steps.push(
      step(
        "ema-stop",
        "Swing / EMA50 invalidation reference",
        stop !== undefined ? "met" : "unknown",
        stop !== undefined
          ? `Price reference ${show(stop)}; a source stop is below the swing orEMA50. Exact buffer is reviewed in the separate paper form.`
          : "No upward-aligned EMA50/swing reference available.",
      ),
    );
    steps.push(
      step(
        "atr-guide",
        "ATR14 ×2 guide, not managed trail",
        p?.atr14 !== undefined ? "met" : "unknown",
        `ATR14 ${show(p?.atr14)}; closed-price-minus2ATR guide ${show(p?.trail2Atr)}. This is not a ratcheted/trade-specific trailing stop or an enabled paper automation rule.`,
      ),
    );
    ready = Boolean(
      sourceFrame &&
      up &&
      bounce &&
      stop !== undefined &&
      entry !== undefined &&
      stop < entry &&
      p?.atr14 !== undefined,
    );
  } else if (family === "breakout-momentum") {
    const prior = bars.slice(-11, -1),
      atr = prev?.atr14,
      resistance =
        prior.length === 10 ? Math.max(...prior.map((c) => c.high)) : undefined,
      low =
        prior.length === 10 ? Math.min(...prior.map((c) => c.low)) : undefined;
    const tight = Boolean(
        atr !== undefined &&
        resistance !== undefined &&
        low !== undefined &&
        resistance - low <= 2 * atr,
      ),
      greenBreak = Boolean(
        last &&
        resistance !== undefined &&
        last.close > last.open &&
        last.close > resistance,
      );
    const v20 = bars.slice(-21, -1),
      priorMean =
        v20.length === 20 &&
        v20.every((c) => Number.isFinite(c.volume) && c.volume > 0)
          ? v20.reduce((a, c) => a + c.volume, 0) / 20
          : undefined;
    const consolidationMean =
      prior.length === 10 &&
      prior.every((c) => Number.isFinite(c.volume) && c.volume > 0)
        ? prior.reduce((a, c) => a + c.volume, 0) / 10
        : undefined;
    const lowVol =
      priorMean !== undefined &&
      consolidationMean !== undefined &&
      consolidationMean < priorMean;
    const knownVolume = /Coinbase Exchange/i.test(source) && p?.rvol20 !== undefined;
    steps.push(
      step(
        "breakout-consolidation",
        "Prior ten-bar tight / low-volume range",
        knownVolume && atr !== undefined && resistance !== undefined
          ? tight && lowVol
            ? "met"
            : "waiting"
          : "unknown",
        `Resistance ${show(resistance)}, low ${show(low)}, priorATR14 ${show(atr)}; width≤2ATR is an explicit app baseline, not a detected flag/wedge. Prior ten-bar volume ${show(consolidationMean)} versus prior20 ${show(priorMean)}; indicative if source volume semantics unknown.`,
      ),
    );
    steps.push(
      step(
        "breakout-close",
        "Green close through prior resistance",
        resistance === undefined ? "unknown" : greenBreak ? "met" : "waiting",
        greenBreak
          ? `Latest green closed candle exceeded prior resistance ${show(resistance)}.`
          : "No latest completed green close through the defined resistance.",
      ),
    );
    steps.push(
      step(
        "breakout-rvol",
        "RVOL ≥2× known source volume",
        knownVolume ? (p!.rvol20! >= 2 ? "met" : "waiting") : "unknown",
        `Raw prior20 same-frame ratio ${show(p?.rvol20)}. ${snapshot.volumeBasis} This is not a time-of-day-normalized scanner.`,
      ),
    );
    steps.push(
      step(
        "breakout-catalyst",
        "Actual news / fundamental catalyst",
        "unknown",
        "No connected catalyst evidence. Candles or a generic calendar do not prove this mandatory source filter.",
      ),
    );
    steps.push(
      step(
        "breakout-ticks",
        "Buy-stop-limit1–2 real ticks above resistance",
        "unknown",
        "Real instrument tick size and paper stop-limit order semantics not configured. Display precision must not substitute.",
      ),
    );
    steps.push(
      step(
        "breakout-tools",
        "Level2 / tape / volume profile",
        "unknown",
        "OHLC does not expose resting orders, aggressor prints, queue fills or a price-level volume distribution.",
      ),
    );
    if (greenBreak) {
      entry = last!.close;
      stop = low;
    }
    steps.push(
      step(
        "breakout-risk",
        "Below-range stop / fixed2R–3R reference",
        stop !== undefined ? "met" : "unknown",
        stop !== undefined
          ? `Range-low reference ${show(stop)}. A source stop goes below it; exact entry offset remains unknown. Paper review is not a source stop-limit order.`
          : "Need an actual source range before considering bracket geometry.",
      ),
    );
  } else {
    const known = Boolean(
      p?.bbLower !== undefined &&
      p.bbUpper !== undefined &&
      p.rsi14 !== undefined &&
      prev?.bbLower !== undefined &&
      prev.rsi14 !== undefined &&
      bars.length >= 21,
    );
    const priorOutside = Boolean(
        known && bars.at(-2)!.low <= prev!.bbLower! && prev!.rsi14! <= 30,
      ),
      inside = Boolean(
        known && last && last.close > p!.bbLower! && last.close < p!.bbUpper!,
      ),
      cross = Boolean(known && prev!.rsi14! <= 30 && p!.rsi14! > 30);
    steps.push(
      step(
        "bb-oversold",
        "Prior lower-band / oversold context",
        known ? (priorOutside ? "met" : "waiting") : "unknown",
        `Previous low ${show(bars.at(-2)?.low)}, previous lowerBB ${show(prev?.bbLower)}, RSI ${show(prev?.rsi14)}. Need prior lower-band touch and oversold RSI; no divergence inferred.`,
      ),
    );
    steps.push(
      step(
        "bb-reentry",
        "Latest closed price back inside lower band",
        known ? (inside && priorOutside ? "met" : "waiting") : "unknown",
        `Closed ${show(last?.close)} versus lowerBB ${show(p?.bbLower)} / upperBB ${show(p?.bbUpper)}. Still-forming prices cannot confirm this rule.`,
      ),
    );
    steps.push(
      step(
        "rsi-cross",
        "RSI14 crosses back above30",
        known ? (cross ? "met" : "waiting") : "unknown",
        `Completed RSI ${show(prev?.rsi14)} → ${show(p?.rsi14)}; require previous≤30 and latest>30.`,
      ),
    );
    const wick =
      bars.length >= 5
        ? Math.min(...bars.slice(-5).map((c) => c.low))
        : undefined;
    steps.push(
      step(
        "wick-stop",
        "Fixed distance below recent extreme wick",
        "unknown",
        `Recent five-bar wick reference ${show(wick)} (app lookback convention). Source fixed stop distance was not supplied. No exact source stop/sizing is asserted.`,
      ),
    );
    if (priorOutside && inside && cross) {
      entry = last!.close;
      target = p?.bbMid;
    }
    steps.push(
      step(
        "mean-target",
        "Primary target: SMA20 middle band",
        p?.bbMid === undefined
          ? "unknown"
          : entry !== undefined && p.bbMid <= entry
            ? "failed"
            : "met",
        `Current middleBB / SMA20 ${show(p?.bbMid)}. The source target is to the mean, not automatically2R; the existing generic paper2R template remains a different reviewed plan.`,
      ),
    );
  }
  const seconds = now > 10_000_000_000 ? now / 1000 : now;
  if (
    !last ||
    seconds - (last.time + SECONDS[timeframe]) >
      Math.max(SECONDS[timeframe] * 2, 900)
  ) {
    ready = false;
    steps.push(
      step(
        "latest-source",
        "Recent closed observation",
        "unknown",
        "Latest closed observation is absent/stale; no ready source entry is asserted.",
      ),
    );
  }
  return {
    id: `indicator-${strategy.id}-${last?.time || 0}`,
    family,
    side: "long",
    strategyId: strategy.id,
    strategyVersion: strategy.version,
    name: strategy.name,
    ready,
    steps,
    zones: [],
    entry,
    stop,
    target,
    source: strategy.source || "Uploaded indicator reference",
  };
}
