import type { Trade, Timeframe } from "./model";
import type { PaperProposal } from "./setup-model";

export type TradeChartLineTone =
  | "entry"
  | "stop"
  | "target"
  | "original"
  | "partial";

export type TradeChartLine = {
  id: string;
  price: number;
  label: string;
  tone: TradeChartLineTone;
  dashed?: boolean;
};

const finitePositive = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const samePrice = (left: number, right: number) =>
  Math.abs(left - right) <=
  Math.max(1, Math.abs(left), Math.abs(right)) * 1e-10;

const managementLabel = (trade: Trade) =>
  `MANAGEMENT ${trade.autoManage ? "ON" : "OFF"}`;

/**
 * Produces chart annotations from a saved trade only. It intentionally does not
 * consult strategy/setup/scenario levels or invent lifecycle prices.
 */
export function paperTradeChartLines(trade: Trade): TradeChartLine[] {
  const state = `${trade.side.toUpperCase()} · ${trade.status.toUpperCase()}`;
  const lines: TradeChartLine[] = [];
  const originalStop = finitePositive(trade.originalStop)
    ? trade.originalStop
    : undefined;
  const originalTarget = finitePositive(trade.originalTarget)
    ? trade.originalTarget
    : undefined;
  const movedToBreakEven =
    finitePositive(trade.stop) &&
    finitePositive(trade.entry) &&
    samePrice(trade.stop, trade.entry) &&
    originalStop !== undefined &&
    !samePrice(originalStop, trade.entry);

  if (finitePositive(trade.entry))
    lines.push({
      id: "entry",
      price: trade.entry,
      label: `PAPER ENTRY · ${state}`,
      tone: "entry",
    });
  if (finitePositive(trade.stop))
    lines.push({
      id: "working-stop",
      price: trade.stop,
      label: `WORKING SL${movedToBreakEven ? " · BREAK-EVEN" : ""} · ${managementLabel(trade)}`,
      tone: "stop",
    });
  if (finitePositive(trade.target))
    lines.push({
      id: "working-target",
      price: trade.target,
      label: `WORKING TP · ${managementLabel(trade)}`,
      tone: "target",
    });
  if (
    originalStop !== undefined &&
    finitePositive(trade.stop) &&
    !samePrice(originalStop, trade.stop)
  )
    lines.push({
      id: "original-stop",
      price: originalStop,
      label: "ORIGINAL SL · REPLACED",
      tone: "original",
      dashed: true,
    });
  if (
    originalTarget !== undefined &&
    finitePositive(trade.target) &&
    !samePrice(originalTarget, trade.target)
  )
    lines.push({
      id: "original-target",
      price: originalTarget,
      label: "ORIGINAL TP · REPLACED",
      tone: "original",
      dashed: true,
    });
  if (trade.partialTaken && finitePositive(trade.partialAt)) {
    const recordedPartial = [...(trade.events ?? [])]
      .filter(
        (event) => event.kind === "partial" && finitePositive(event.price),
      )
      .sort((left, right) => right.at - left.at)[0];
    lines.push({
      id: "partial-taken",
      price: recordedPartial?.price ?? trade.partialAt,
      label: recordedPartial
        ? "PARTIAL TAKEN · RECORDED"
        : "PARTIAL TRIGGER · PLANNED",
      tone: "partial",
      dashed: true,
    });
  }

  return lines;
}

export function paperTradeChartSummary(trade: Trade) {
  return `PAPER · ${trade.side.toUpperCase()} · ${trade.status.toUpperCase()} · ${managementLabel(trade)}`;
}

/**
 * Remote paper records are authoritative for their current lifecycle/bracket
 * state. Workspace-only journals and strategy snapshots remain the user's
 * records and are deliberately not replaced during a background refresh.
 */
export function mergeCanonicalPaperTrade(
  existing: Trade | undefined,
  canonical: Trade,
): Trade {
  if (!existing) return canonical;
  // An older request can resolve after a newer management/detail revision.
  // Never let it downgrade the working SL/TP, status, or recorded event trail.
  if ((canonical.version ?? 0) < (existing.version ?? 0)) return existing;
  return {
    ...canonical,
    journal: existing.journal,
    strategyId: existing.strategyId,
    strategyName: existing.strategyName,
    strategyVersion: existing.strategyVersion,
    strategyIds: existing.strategyIds,
    factors: existing.factors,
    review: existing.review ?? canonical.review,
    aiReview: existing.aiReview ?? canonical.aiReview,
  };
}

/** The immutable proposal detail is the only currently persisted execution timeframe. */
export function storedExecutionTimeframe(
  proposal: PaperProposal | undefined,
): Timeframe | undefined {
  const timeframe = proposal?.analysis?.timeframe;
  return ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"].includes(
    timeframe as string,
  )
    ? (timeframe as Timeframe)
    : undefined;
}
