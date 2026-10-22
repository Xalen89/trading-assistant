import type { Candle, Strategy } from "./model";
import type { SetupCandidate, SetupStep } from "./setup-model";
import type { IndicatorSnapshot } from "./indicators";
import type { GitHubFamily } from "./github-presets";
const s = (
  id: string,
  name: string,
  status: SetupStep["status"],
  evidence: string,
): SetupStep => ({ id, name, status, evidence });
const fmt = (v: number | undefined) =>
  v === undefined ? "unavailable" : v.toFixed(6);
export function githubCandidate(
  strategy: Strategy,
  family: GitHubFamily,
  bars: Candle[],
  snapshot: IndicatorSnapshot,
): SetupCandidate {
  const p = snapshot.points.at(-1),
    prior = snapshot.points.at(-2),
    last = bars.at(-1),
    steps: SetupStep[] = [];
  let longEvent = false;
  if (family === "sma-crossover") {
    const known =
      p?.sma20 !== undefined &&
      p.sma50 !== undefined &&
      prior?.sma20 !== undefined &&
      prior.sma50 !== undefined;
    longEvent = Boolean(
      known && p!.sma20! > p!.sma50! && prior!.sma20! <= prior!.sma50!,
    );
    const exit = Boolean(
      known && p!.sma20! < p!.sma50! && prior!.sma20! >= prior!.sma50!,
    );
    steps.push(
      s(
        "sma-cross",
        "Completed SMA20 above SMA50 cross",
        known ? (longEvent ? "met" : "waiting") : "unknown",
        `Current20/50 ${fmt(p?.sma20)} / ${fmt(p?.sma50)}; prior ${fmt(prior?.sma20)} / ${fmt(prior?.sma50)}.51 closed observations required; equality alone is not a cross.`,
      ),
      s(
        "sma-exit",
        "Reverse crossover review only",
        known ? (exit ? "met" : "waiting") : "unknown",
        "A reverse cross is review/exit context; no current position, short or automatic close is inferred.",
      ),
    );
  } else if (family === "macd-momentum") {
    const known =
      p?.macd !== undefined &&
      p.macdSignal !== undefined &&
      prior?.macd !== undefined &&
      prior.macdSignal !== undefined;
    longEvent = Boolean(
      known && p!.macd! > p!.macdSignal! && prior!.macd! <= prior!.macdSignal!,
    );
    const exit = Boolean(
      known && p!.macd! < p!.macdSignal! && prior!.macd! >= prior!.macdSignal!,
    );
    steps.push(
      s(
        "macd-cross",
        "MACD12/26 crosses above signal9",
        known ? (longEvent ? "met" : "waiting") : "unknown",
        `Current MACD/signal ${fmt(p?.macd)} / ${fmt(p?.macdSignal)}; prior ${fmt(prior?.macd)} / ${fmt(prior?.macdSignal)}.SMA seeding needs35 closed observations for the first pair; longer convergence history still matters.`,
      ),
      s(
        "macd-exit",
        "Reverse crossover review only",
        known ? (exit ? "met" : "waiting") : "unknown",
        "No zero-line/news/volume filters or short model added. This is app-authored adaptation, not the source normalized-threshold implementation.",
      ),
    );
  } else {
    const known =
      p?.donchianUpper !== undefined &&
      p.donchianLower !== undefined &&
      Boolean(last);
    longEvent = Boolean(known && last!.close > p!.donchianUpper!);
    const exit = Boolean(known && last!.close < p!.donchianLower!);
    steps.push(
      s(
        "donchian-break",
        "Close above prior20-bar high",
        known ? (longEvent ? "met" : "waiting") : "unknown",
        `Close ${fmt(last?.close)} versus prior20 upper ${fmt(p?.donchianUpper)} / lower ${fmt(p?.donchianLower)}.Current bar is excluded; equality is not a break.`,
      ),
      s(
        "donchian-exit",
        "Below prior20-bar low review",
        known ? (exit ? "met" : "waiting") : "unknown",
        "A lower-channel break is review context, not proof that a long position exists. Flat/long state and queue fills are not reconstructed from this snapshot.",
      ),
    );
  }
  if (family === "sma-crossover" || family === "macd-momentum") {
    const rsi = p?.rsi14;
    steps.push(s(family === "sma-crossover" ? "sma-rsi-confirm" : "macd-rsi-confirm", "Closed RSI14 above 50 confirmation", rsi === undefined ? "unknown" : rsi > 50 ? "met" : "waiting", `App-authored optional gate condition: closed RSI14 ${fmt(rsi)} > 50. This is not claimed to be in the source recipe or a proven edge; explicit personal gate approval is required.`));
  }
  steps.push(
    s(
      "recipe-execution",
      "Complete stop / size / execution rules",
      "unknown",
      "This is a GitHub-inspired, independently implemented numerical recipe. Source-specific stop/target/sizing and complete strategy state are not defined. A generic2R paper proposal is separate; no automatic ready trade or validated outcome is claimed.",
    ),
  );
  return {
    id: `recipe-${strategy.id}-${last?.time || 0}`,
    family,
    side: "long",
    strategyId: strategy.id,
    strategyVersion: strategy.version,
    name: strategy.name,
    ready: false,
    steps,
    zones: [],
    entry: longEvent ? last?.close : undefined,
    source: strategy.source || "Verified GitHub reference",
  };
}
