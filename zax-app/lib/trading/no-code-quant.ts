import { SECONDS } from "./engine";
import type { Candle, Timeframe } from "./model";
import type { QuantSeries } from "./quant-lab-types";

/**
 * A deliberately compact no-code research tree. It is serializable, contains no
 * credentials/endpoints, and is not an order or broker instruction.
 *
 * The only permitted indicators are trailing calculations on supplied closed
 * bars. Any output is hypothetical research and must not be used to bypass the
 * existing paper-entry gate.
 */
export const NO_CODE_QUANT_RULE_VERSION = 1 as const;
export const MAX_NO_CODE_ASSETS = 8 as const;
export const MAX_NO_CODE_BARS_PER_ASSET = 2_000 as const;
export const MAX_NO_CODE_LOOKBACK_BARS = 252 as const;

export type NoCodeQuantComparison = "above" | "below";
export type NoCodeQuantCondition =
  | {
      kind: "trend";
      fastBars: number;
      slowBars: number;
      comparison: NoCodeQuantComparison;
    }
  | {
      kind: "rsi";
      lookbackBars: number;
      level: number;
      comparison: NoCodeQuantComparison;
    }
  | {
      kind: "cumulative-return";
      lookbackBars: number;
      threshold: number;
      comparison: NoCodeQuantComparison;
    };

export type NoCodeQuantAssetNode = {
  type: "asset";
  id: string;
  symbol: string;
};

export type NoCodeQuantConditionNode = {
  type: "condition";
  id: string;
  condition: NoCodeQuantCondition;
  /** The asset is explicit rather than inferred from a chart or account selection. */
  child: NoCodeQuantAssetNode;
};

export type NoCodeQuantTopNNode = {
  type: "topN";
  id: string;
  lookbackBars: number;
  topN: number;
  /** Fixed, explicit research universe. No asset is fetched or silently added. */
  children: readonly NoCodeQuantAssetNode[];
};

export type NoCodeQuantInverseVolWeightNode = {
  type: "inverseVolWeight";
  id: string;
  lookbackBars: number;
  children: readonly NoCodeQuantAssetNode[];
};

export type NoCodeQuantNode =
  | NoCodeQuantConditionNode
  | NoCodeQuantTopNNode
  | NoCodeQuantInverseVolWeightNode;

export type NoCodeQuantRule = {
  ruleVersion: typeof NO_CODE_QUANT_RULE_VERSION;
  name: string;
  /** Saved drafts are tied to the exact strategy revision that the owner reviewed. */
  strategyId: string;
  strategyVersion: number;
  /** The editor persists a reviewable draft only; there is no approved/auto-run mode. */
  status: "draft";
  root: {
    type: "all";
    id: string;
    children: readonly NoCodeQuantNode[];
  };
};

export type NoCodeQuantValidation = {
  valid: boolean;
  issues: readonly string[];
  assetSymbols: readonly string[];
};

export type NoCodeQuantSource = {
  symbol: string;
  source: string;
  provenance: QuantSeries["provenance"];
  timeframe: Timeframe;
  closedBars: number;
  excludedBars: number;
};

export type NoCodeQuantConditionResult = {
  nodeId: string;
  assetId: string;
  symbol: string;
  kind: NoCodeQuantCondition["kind"];
  value: number | null;
  comparison: NoCodeQuantComparison;
  threshold: number | null;
  met: boolean | null;
  reason: string;
};

export type NoCodeQuantSelection = {
  nodeId: string;
  lookbackBars: number;
  topN: number;
  ranked: readonly { symbol: string; cumulativeReturn: number }[];
  selectedSymbols: readonly string[];
};

export type NoCodeQuantAllocation = {
  nodeId: string;
  lookbackBars: number;
  weights: readonly { symbol: string; volatility: number; weight: number }[];
};

export type NoCodeQuantEvaluation = {
  status: "ready" | "insufficient-data";
  /** Unix seconds at the latest shared/available closed bar, not a live quote. */
  asOf: number | null;
  researchReady: boolean;
  /** Always true: callers must not treat this as trade or order authority. */
  hypotheticalResearch: true;
  /** Always false: this module has no execution surface. */
  autoExecution: false;
  conditionResults: readonly NoCodeQuantConditionResult[];
  selections: readonly NoCodeQuantSelection[];
  allocations: readonly NoCodeQuantAllocation[];
  sources: readonly NoCodeQuantSource[];
  issues: readonly string[];
  limitations: readonly string[];
};

type ClosedSeries = {
  symbol: string;
  source: string;
  provenance: QuantSeries["provenance"];
  timeframe: Timeframe;
  candles: readonly Pick<Candle, "time" | "close">[];
  excludedBars: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Canonical form is shared by validation, source matching, and result rendering. */
function canonicalSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function positiveInteger(
  value: unknown,
  maximum: number = MAX_NO_CODE_LOOKBACK_BARS,
): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= maximum
  );
}

function addIssue(issues: string[], issue: string): void {
  if (!issues.includes(issue)) issues.push(issue);
}

function validateAsset(
  asset: unknown,
  path: string,
  issues: string[],
  symbols: string[],
): asset is NoCodeQuantAssetNode {
  if (!isRecord(asset) || asset.type !== "asset") {
    addIssue(issues, `${path} must be an asset node.`);
    return false;
  }
  if (!nonEmptyText(asset.id)) addIssue(issues, `${path}.id must be a non-empty string.`);
  if (!nonEmptyText(asset.symbol)) {
    addIssue(issues, `${path}.symbol must be a non-empty string.`);
  } else {
    symbols.push(canonicalSymbol(asset.symbol));
  }
  return true;
}

function validateCondition(
  condition: unknown,
  path: string,
  issues: string[],
): condition is NoCodeQuantCondition {
  if (!isRecord(condition) || !nonEmptyText(condition.kind)) {
    addIssue(issues, `${path} must declare a supported condition kind.`);
    return false;
  }
  if (condition.kind === "trend") {
    if (!positiveInteger(condition.fastBars))
      addIssue(issues, `${path}.fastBars must be a whole number from 1 to ${MAX_NO_CODE_LOOKBACK_BARS}.`);
    if (!positiveInteger(condition.slowBars))
      addIssue(issues, `${path}.slowBars must be a whole number from 1 to ${MAX_NO_CODE_LOOKBACK_BARS}.`);
    if (
      positiveInteger(condition.fastBars) &&
      positiveInteger(condition.slowBars) &&
      condition.fastBars >= condition.slowBars
    )
      addIssue(issues, `${path}.fastBars must be smaller than slowBars.`);
  } else if (condition.kind === "rsi") {
    if (!positiveInteger(condition.lookbackBars))
      addIssue(issues, `${path}.lookbackBars must be a whole number from 1 to ${MAX_NO_CODE_LOOKBACK_BARS}.`);
    if (
      typeof condition.level !== "number" ||
      !Number.isFinite(condition.level) ||
      condition.level <= 0 ||
      condition.level >= 100
    )
      addIssue(issues, `${path}.level must be a finite number strictly between 0 and 100.`);
  } else if (condition.kind === "cumulative-return") {
    if (!positiveInteger(condition.lookbackBars))
      addIssue(issues, `${path}.lookbackBars must be a whole number from 1 to ${MAX_NO_CODE_LOOKBACK_BARS}.`);
    if (
      typeof condition.threshold !== "number" ||
      !Number.isFinite(condition.threshold)
    )
      addIssue(issues, `${path}.threshold must be finite.`);
  } else {
    addIssue(issues, `${path}.kind must be trend, rsi, or cumulative-return.`);
  }
  if (condition.comparison !== "above" && condition.comparison !== "below")
    addIssue(issues, `${path}.comparison must be above or below.`);
  return true;
}

/** Validates configuration only; it does not fill, rewrite, fetch, or execute. */
export function validateNoCodeQuantRule(rule: unknown): NoCodeQuantValidation {
  const issues: string[] = [];
  const symbols: string[] = [];
  if (!isRecord(rule))
    return { valid: false, issues: ["Rule must be an object."], assetSymbols: [] };
  if (rule.ruleVersion !== NO_CODE_QUANT_RULE_VERSION)
    addIssue(issues, `ruleVersion must equal ${NO_CODE_QUANT_RULE_VERSION}.`);
  if (!nonEmptyText(rule.name)) addIssue(issues, "name must be a non-empty string.");
  if (!nonEmptyText(rule.strategyId))
    addIssue(issues, "strategyId must be a non-empty string.");
  if (!positiveInteger(rule.strategyVersion, Number.MAX_SAFE_INTEGER))
    addIssue(issues, "strategyVersion must be a positive integer.");
  if (rule.status !== "draft") addIssue(issues, "status must remain draft; no auto-run status exists.");
  if (!isRecord(rule.root) || rule.root.type !== "all") {
    addIssue(issues, "root must be an all node.");
    return { valid: false, issues, assetSymbols: [] };
  }
  if (!nonEmptyText(rule.root.id)) addIssue(issues, "root.id must be a non-empty string.");
  if (!Array.isArray(rule.root.children) || rule.root.children.length === 0) {
    addIssue(issues, "root.children must contain at least one no-code node.");
    return { valid: false, issues, assetSymbols: [] };
  }
  if (rule.root.children.length > 12)
    addIssue(issues, "root.children is capped at 12 compact research nodes.");

  const nodeIds = new Set<string>();
  const assetIds = new Set<string>();
  rule.root.children.forEach((node, index) => {
    const path = `root.children[${index}]`;
    if (!isRecord(node) || !nonEmptyText(node.type)) {
      addIssue(issues, `${path} must be a supported node.`);
      return;
    }
    if (!nonEmptyText(node.id)) addIssue(issues, `${path}.id must be a non-empty string.`);
    else if (nodeIds.has(node.id)) addIssue(issues, `${path}.id is duplicated.`);
    else nodeIds.add(node.id);

    if (node.type === "condition") {
      validateCondition(node.condition, `${path}.condition`, issues);
      if (validateAsset(node.child, `${path}.child`, issues, symbols)) {
        if (assetIds.has(node.child.id)) addIssue(issues, `${path}.child.id is duplicated.`);
        assetIds.add(node.child.id);
      }
      return;
    }
    if (node.type === "topN" || node.type === "inverseVolWeight") {
      if (!positiveInteger(node.lookbackBars))
        addIssue(issues, `${path}.lookbackBars must be a whole number from 1 to ${MAX_NO_CODE_LOOKBACK_BARS}.`);
      if (!Array.isArray(node.children) || node.children.length === 0)
        addIssue(issues, `${path}.children must contain explicit asset nodes.`);
      else {
        const universeSymbols: string[] = [];
        node.children.forEach((asset, assetIndex) => {
          if (validateAsset(asset, `${path}.children[${assetIndex}]`, issues, symbols)) {
            if (assetIds.has(asset.id)) addIssue(issues, `${path}.children[${assetIndex}].id is duplicated.`);
            assetIds.add(asset.id);
            if (nonEmptyText(asset.symbol)) universeSymbols.push(canonicalSymbol(asset.symbol));
          }
        });
        if (
          universeSymbols.length === node.children.length &&
          new Set(universeSymbols).size < universeSymbols.length
        )
          addIssue(
            issues,
            `${path}.children must contain distinct symbols after trimming and case normalization.`,
          );
      }
      if (node.type === "topN") {
        if (!positiveInteger(node.topN, MAX_NO_CODE_ASSETS))
          addIssue(issues, `${path}.topN must be a whole number from 1 to ${MAX_NO_CODE_ASSETS}.`);
        else if (Array.isArray(node.children) && node.topN > node.children.length)
          addIssue(issues, `${path}.topN cannot exceed its explicit asset count.`);
      }
      return;
    }
    addIssue(issues, `${path}.type must be condition, topN, or inverseVolWeight.`);
  });

  const distinctSymbols = [...new Set(symbols)];
  if (distinctSymbols.length > MAX_NO_CODE_ASSETS)
    addIssue(issues, `At most ${MAX_NO_CODE_ASSETS} distinct assets are permitted.`);
  return { valid: issues.length === 0, issues, assetSymbols: distinctSymbols };
}

function closeEnough(nowMs: unknown): nowMs is number {
  return (
    typeof nowMs === "number" &&
    Number.isSafeInteger(nowMs) &&
    nowMs > 1_000_000_000_000
  );
}

function cleanSeries(raw: unknown, nowMs: number): ClosedSeries | null {
  if (!isRecord(raw) || !nonEmptyText(raw.symbol) || !nonEmptyText(raw.source)) return null;
  if (raw.provenance !== "provider" && raw.provenance !== "user-import") return null;
  if (!Array.isArray(raw.candles) || !closeEnough(raw.fetchedAt)) return null;
  const timeframe = raw.timeframe as Timeframe;
  const seconds = SECONDS[timeframe];
  if (!Number.isFinite(seconds)) return null;
  const cutoff = Math.floor(Math.min(nowMs, raw.fetchedAt) / 1_000);
  const candidates: Pick<Candle, "time" | "close">[] = [];
  let excludedBars = 0;
  for (const entry of raw.candles.slice(-MAX_NO_CODE_BARS_PER_ASSET)) {
    const candle = entry as Partial<Candle>;
    if (
      typeof candle.time !== "number" ||
      !Number.isSafeInteger(candle.time) ||
      candle.time <= 0 ||
      typeof candle.close !== "number" ||
      !Number.isFinite(candle.close) ||
      candle.close <= 0 ||
      candle.time + seconds > cutoff
    ) {
      excludedBars += 1;
      continue;
    }
    candidates.push({ time: candle.time, close: candle.close });
  }
  candidates.sort((left, right) => left.time - right.time);
  const candles: Pick<Candle, "time" | "close">[] = [];
  for (let index = 0; index < candidates.length; ) {
    let end = index + 1;
    while (end < candidates.length && candidates[end].time === candidates[index].time) end += 1;
    // Ambiguous duplicated source rows are excluded; no later revision is chosen.
    if (end === index + 1) candles.push(candidates[index]);
    else excludedBars += end - index;
    index = end;
  }
  return {
    symbol: canonicalSymbol(raw.symbol),
    source: raw.source.trim(),
    provenance: raw.provenance,
    timeframe,
    candles,
    excludedBars: excludedBars + Math.max(0, raw.candles.length - MAX_NO_CODE_BARS_PER_ASSET),
  };
}

function latestSma(candles: readonly Pick<Candle, "close">[], bars: number): number | null {
  if (candles.length < bars) return null;
  const values = candles.slice(-bars).map((candle) => candle.close);
  const total = values.reduce((sum, value) => sum + value, 0);
  return Number.isFinite(total) ? total / values.length : null;
}

function latestRsi(candles: readonly Pick<Candle, "close">[], bars: number): number | null {
  if (candles.length < bars + 1) return null;
  let gains = 0;
  let losses = 0;
  const sample = candles.slice(-(bars + 1));
  for (let index = 1; index < sample.length; index += 1) {
    const change = sample[index].close - sample[index - 1].close;
    if (change > 0) gains += change;
    else losses -= change;
  }
  const averageGain = gains / bars;
  const averageLoss = losses / bars;
  if (averageLoss === 0) return averageGain === 0 ? 50 : 100;
  const rsi = 100 - 100 / (1 + averageGain / averageLoss);
  return Number.isFinite(rsi) ? rsi : null;
}

function cumulativeReturn(candles: readonly Pick<Candle, "close">[], bars: number): number | null {
  if (candles.length < bars + 1) return null;
  const start = candles[candles.length - bars - 1]?.close;
  const end = candles.at(-1)?.close;
  if (!start || !end) return null;
  const value = end / start - 1;
  return Number.isFinite(value) ? value : null;
}

function realizedVolatility(candles: readonly Pick<Candle, "close">[], bars: number): number | null {
  if (candles.length < bars + 1) return null;
  const returns: number[] = [];
  const sample = candles.slice(-(bars + 1));
  for (let index = 1; index < sample.length; index += 1) {
    const value = Math.log(sample[index].close / sample[index - 1].close);
    if (!Number.isFinite(value)) return null;
    returns.push(value);
  }
  const average = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - average) ** 2, 0) / returns.length;
  const volatility = Math.sqrt(variance);
  return Number.isFinite(volatility) && volatility > 0 ? volatility : null;
}

function compare(value: number, threshold: number, comparison: NoCodeQuantComparison): boolean {
  return comparison === "above" ? value > threshold : value < threshold;
}

function conditionResult(
  node: NoCodeQuantConditionNode,
  series: ClosedSeries | undefined,
): NoCodeQuantConditionResult {
  const base = {
    nodeId: node.id,
    assetId: node.child.id,
    symbol: canonicalSymbol(node.child.symbol),
    kind: node.condition.kind,
    comparison: node.condition.comparison,
  } as const;
  if (!series)
    return { ...base, value: null, threshold: null, met: null, reason: "No supplied source series matches this explicit asset." };
  if (node.condition.kind === "trend") {
    const fast = latestSma(series.candles, node.condition.fastBars);
    const slow = latestSma(series.candles, node.condition.slowBars);
    if (fast === null || slow === null)
      return { ...base, value: null, threshold: null, met: null, reason: "Not enough closed source bars for both trailing trend averages." };
    return {
      ...base,
      value: fast,
      threshold: slow,
      met: compare(fast, slow, node.condition.comparison),
      reason: `Trailing ${node.condition.fastBars}-bar average ${node.condition.comparison} trailing ${node.condition.slowBars}-bar average.`,
    };
  }
  if (node.condition.kind === "rsi") {
    const value = latestRsi(series.candles, node.condition.lookbackBars);
    if (value === null)
      return { ...base, value: null, threshold: node.condition.level, met: null, reason: "Not enough closed source bars for RSI." };
    return {
      ...base,
      value,
      threshold: node.condition.level,
      met: compare(value, node.condition.level, node.condition.comparison),
      reason: `Trailing ${node.condition.lookbackBars}-bar RSI ${node.condition.comparison} ${node.condition.level}.`,
    };
  }
  const value = cumulativeReturn(series.candles, node.condition.lookbackBars);
  if (value === null)
    return { ...base, value: null, threshold: node.condition.threshold, met: null, reason: "Not enough closed source bars for cumulative return." };
  return {
    ...base,
    value,
    threshold: node.condition.threshold,
    met: compare(value, node.condition.threshold, node.condition.comparison),
    reason: `Trailing ${node.condition.lookbackBars}-bar cumulative return ${node.condition.comparison} ${node.condition.threshold}.`,
  };
}

/**
 * Pure bounded evaluation against only caller-supplied source bars. It neither
 * calls an API nor alters strategy/confluence/paper state. `researchReady` is a
 * triage fact for the draft; it intentionally does not imply entry eligibility.
 */
export function evaluateNoCodeQuantRule(
  rule: NoCodeQuantRule,
  input: { now: number; series: readonly QuantSeries[] },
): NoCodeQuantEvaluation {
  const validation = validateNoCodeQuantRule(rule);
  const issues = [...validation.issues];
  if (!closeEnough(input?.now)) addIssue(issues, "now must be Unix epoch milliseconds.");
  const rawSeries = Array.isArray(input?.series) ? input.series : [];
  if (rawSeries.length > MAX_NO_CODE_ASSETS)
    addIssue(issues, `At most ${MAX_NO_CODE_ASSETS} supplied series are inspected.`);
  const cleaned = closeEnough(input?.now)
    ? rawSeries.slice(0, MAX_NO_CODE_ASSETS).map((item) => cleanSeries(item, input.now))
    : [];
  if (cleaned.some((item) => item === null))
    addIssue(issues, "Each supplied series needs source, provenance, timeframe, fetchedAt, and valid closed prices.");
  const series = cleaned.filter((item): item is ClosedSeries => item !== null);
  if (new Set(series.map((item) => item.symbol)).size !== series.length)
    addIssue(issues, "Supplied source symbols must be distinct; duplicates are not merged.");
  const bySymbol = new Map(series.map((item) => [item.symbol, item]));
  for (const symbol of validation.assetSymbols) {
    if (!bySymbol.has(symbol)) addIssue(issues, `Missing supplied source for asset ${symbol}.`);
  }

  const conditionResults: NoCodeQuantConditionResult[] = [];
  const selections: NoCodeQuantSelection[] = [];
  const allocations: NoCodeQuantAllocation[] = [];
  if (validation.valid && issues.length === 0) {
    for (const node of rule.root.children) {
      if (node.type === "condition") {
        conditionResults.push(conditionResult(node, bySymbol.get(canonicalSymbol(node.child.symbol))));
        continue;
      }
      if (node.type === "topN") {
        const ranked = node.children
          .map((asset) => ({
            symbol: canonicalSymbol(asset.symbol),
            cumulativeReturn: cumulativeReturn(bySymbol.get(canonicalSymbol(asset.symbol))!.candles, node.lookbackBars),
          }))
          .filter((item): item is { symbol: string; cumulativeReturn: number } => item.cumulativeReturn !== null)
          .sort((left, right) => right.cumulativeReturn - left.cumulativeReturn || left.symbol.localeCompare(right.symbol));
        if (ranked.length !== node.children.length) {
          addIssue(issues, `Not enough closed bars to rank every asset in ${node.id}.`);
          continue;
        }
        selections.push({
          nodeId: node.id,
          lookbackBars: node.lookbackBars,
          topN: node.topN,
          ranked,
          selectedSymbols: ranked.slice(0, node.topN).map((item) => item.symbol),
        });
        continue;
      }
      const rawWeights = node.children
        .map((asset) => ({
          symbol: canonicalSymbol(asset.symbol),
          volatility: realizedVolatility(bySymbol.get(canonicalSymbol(asset.symbol))!.candles, node.lookbackBars),
        }))
        .filter((item): item is { symbol: string; volatility: number } => item.volatility !== null);
      if (rawWeights.length !== node.children.length) {
        addIssue(issues, `Not enough non-zero closed-bar volatility history for every asset in ${node.id}.`);
        continue;
      }
      const totalInverseVolatility = rawWeights.reduce((sum, item) => sum + 1 / item.volatility, 0);
      if (!Number.isFinite(totalInverseVolatility) || totalInverseVolatility <= 0) {
        addIssue(issues, `Inverse-volatility weights cannot be calculated for ${node.id}.`);
        continue;
      }
      const weights = rawWeights.map((item, index) => ({
        ...item,
        // Force the final displayed fraction to absorb harmless binary rounding.
        weight:
          index === rawWeights.length - 1
            ? 1 - rawWeights.slice(0, -1).reduce((sum, prior) => sum + (1 / prior.volatility) / totalInverseVolatility, 0)
            : (1 / item.volatility) / totalInverseVolatility,
      }));
      allocations.push({ nodeId: node.id, lookbackBars: node.lookbackBars, weights });
    }
  }

  const sourceRows: NoCodeQuantSource[] = series.map((item) => ({
    symbol: item.symbol,
    source: item.source,
    provenance: item.provenance,
    timeframe: item.timeframe,
    closedBars: item.candles.length,
    excludedBars: item.excludedBars,
  }));
  const asOf = series.length
    ? Math.min(...series.map((item) => item.candles.at(-1)?.time ?? 0)) || null
    : null;
  const conditionsUsable = conditionResults.every((item) => item.met !== null);
  const conditionsMet = conditionResults.every((item) => item.met === true);
  const researchReady = issues.length === 0 && conditionsUsable && conditionsMet;
  return {
    status: issues.length ? "insufficient-data" : "ready",
    asOf,
    researchReady,
    hypotheticalResearch: true,
    autoExecution: false,
    conditionResults,
    selections,
    allocations,
    sources: sourceRows,
    issues,
    limitations: [
      "Uses only supplied, timestamped, closed source bars; no price, source, asset, or data revision is invented.",
      "Trend, RSI, cumulative return, ranking, and inverse-volatility outputs are hypothetical research observations, not validation, a recommendation, an order, or an eligibility override.",
      `Evaluation inspects at most ${MAX_NO_CODE_ASSETS} supplied assets and the latest ${MAX_NO_CODE_BARS_PER_ASSET} supplied bars per asset.`,
      "No external Composer, broker, paid credential, account, deployment, or execution API is used.",
    ],
  };
}

/** A minimal draft suitable for a visual editor; callers must still choose real supplied symbols. */
export function draftNoCodeQuantRule(
  name = "Closed-bar research rule",
  strategyId = "unbound-strategy",
  strategyVersion = 1,
): NoCodeQuantRule {
  return {
    ruleVersion: NO_CODE_QUANT_RULE_VERSION,
    name,
    strategyId,
    strategyVersion,
    status: "draft",
    root: {
      type: "all",
      id: "all-closed-bar-research",
      children: [
        {
          type: "condition",
          id: "trend-condition-1",
          condition: { kind: "trend", fastBars: 20, slowBars: 50, comparison: "above" },
          child: { type: "asset", id: "asset-condition-1", symbol: "" },
        },
        {
          type: "topN",
          id: "top-n-1",
          lookbackBars: 90,
          topN: 1,
          children: [{ type: "asset", id: "asset-rank-1", symbol: "" }],
        },
        {
          type: "inverseVolWeight",
          id: "inverse-vol-1",
          lookbackBars: 20,
          children: [{ type: "asset", id: "asset-weight-1", symbol: "" }],
        },
      ],
    },
  };
}
