import { tradeMetrics } from "./engine";
import type { Trade } from "./model";

export type DisciplineFlag = {
  id: string;
  severity: "info" | "warning" | "block";
  title: string;
  evidence: string[];
  action: string;
};

export type DisciplineReport = {
  /**
   * Coaching observations only. This module deliberately emits no execution
   * permission and no server-side block; callers may choose a separate guard.
   */
  flags: DisciplineFlag[];
  /** Millisecond UTC timestamp of the latest eligible realized loss. */
  lastLossAt?: number;
  /** Suggested pause end in milliseconds, not an enforced cooldown. */
  cooldownUntil?: number;
  /** A readiness recommendation for reflection, never execution permission. */
  ready: boolean;
  /** Closed-trade counts derived from valid canonical closure records only. */
  counts: { todayTrades: number; consecutiveLosses: number };
  /** Personal reflection prompts; checking them does not approve a trade. */
  requiredThoughts: string[];
};

export type DisciplineInput = {
  /** Unix milliseconds. Reporting days are always UTC (00:00:00Z–23:59:59.999Z). */
  now: number;
  proposedRisk?: number;
  market?: string;
  side?: "long" | "short";
  /** Suggested time between a realized loss and a new plan. Defaults to 20. */
  cooldownMinutes?: number;
  /** Closed-trade review threshold for the current UTC day. Defaults to 6. */
  maxTradesPerDay?: number;
  /** Optional self-reported note, reflected without diagnosis or inference. */
  emotion?: string;
};

type ClosedRecord = {
  trade: Trade;
  closedAt: number;
  pnl?: number;
  risk?: number;
};

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const DEFAULT_COOLDOWN_MINUTES = 20;
const DEFAULT_MAX_TRADES_PER_DAY = 6;

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function validTimestamp(value: unknown): value is number {
  return finitePositive(value) && Number.isFinite(new Date(value).getTime());
}

function utcDayStart(timestamp: number) {
  return Math.floor(timestamp / DAY) * DAY;
}

function formatUtc(timestamp: number) {
  return new Date(timestamp).toISOString().replace(".000Z", "Z");
}

function formatRisk(value: number) {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Return original planned risk where it was retained by the paper lifecycle.
 * Legacy records fall back to the same side-aware tradeMetrics calculation,
 * using retained original bracket/quantity fields before mutable management
 * fields. A partial's realized P/L is intentionally not treated as its risk.
 */
function originalRisk(trade: Trade): number | undefined {
  if (finitePositive(trade.initialRisk)) return trade.initialRisk;
  const metrics = tradeMetrics({
    ...trade,
    quantity: trade.initialQuantity ?? trade.quantity,
    stop: trade.originalStop ?? trade.stop,
    target: trade.originalTarget ?? trade.target,
  });
  return finitePositive(metrics.risk) ? metrics.risk : undefined;
}

/**
 * A closed outcome is known only from the canonical closed record. tradeMetrics
 * includes realizedPnl from partials plus the final retained quantity/exit, so
 * a partial is never silently classified from its final leg alone.
 */
function closedPnl(trade: Trade): number | undefined {
  let realizedPnl = trade.realizedPnl;
  if (realizedPnl === undefined) {
    const partials = (trade.events || []).filter(
      (event) => event.kind === "partial",
    );
    if (partials.some((event) => !Number.isFinite(event.pnl))) return undefined;
    realizedPnl = partials.reduce((sum, event) => sum + (event.pnl || 0), 0);
  }
  if (typeof realizedPnl !== "number" || !Number.isFinite(realizedPnl))
    return undefined;
  const pnl = tradeMetrics({ ...trade, realizedPnl }).pnl;
  return typeof pnl === "number" && Number.isFinite(pnl) ? pnl : undefined;
}

function contextLabel(input: DisciplineInput) {
  const market = input.market?.trim();
  return market
    ? `${input.side ? `${input.side.toUpperCase()} ` : ""}${market}`
    : "the proposed plan";
}

/**
 * Evaluate a bounded, retrospective coaching check.
 *
 * UTC is deliberately the reporting-day convention: it is deterministic across
 * clients and avoids silently applying the workspace display timezone. Only
 * actual canonical closedAt timestamps at or before `now` participate. Missing,
 * malformed, or future timestamps/outcomes are surfaced as unknown/invalid
 * evidence rather than counted as proof that a risky pattern is absent.
 */
export function evaluateDiscipline(
  trades: Trade[],
  input: DisciplineInput,
): DisciplineReport {
  const now = validTimestamp(input.now) ? input.now : undefined;
  const flags: DisciplineFlag[] = [];
  const invalidTimestampIds: string[] = [];
  const futureTimestampIds: string[] = [];
  const unknownOutcomeIds: string[] = [];
  const unknownRiskIds: string[] = [];
  const records: ClosedRecord[] = [];

  for (const trade of trades) {
    if (trade.status !== "closed") continue;
    if (!validTimestamp(trade.closedAt)) {
      invalidTimestampIds.push(trade.id);
      continue;
    }
    if (!now || trade.closedAt > now) {
      futureTimestampIds.push(trade.id);
      continue;
    }
    const pnl = closedPnl(trade);
    const risk = originalRisk(trade);
    if (pnl === undefined) unknownOutcomeIds.push(trade.id);
    if (risk === undefined) unknownRiskIds.push(trade.id);
    records.push({ trade, closedAt: trade.closedAt, pnl, risk });
  }

  records.sort(
    (a, b) => a.closedAt - b.closedAt || a.trade.id.localeCompare(b.trade.id),
  );

  if (!now) {
    flags.push({
      id: "unknown-reporting-time",
      severity: "info",
      title: "Reporting time is unavailable",
      evidence: [
        "A finite UTC millisecond `now` value is required for day counts and pause timing.",
      ],
      action:
        "Refresh the coaching check when a current timestamp is available.",
    });
  }
  if (invalidTimestampIds.length) {
    flags.push({
      id: "unknown-closure-chronology",
      severity: "info",
      title: "Some closed records lack usable chronology",
      evidence: [
        `${invalidTimestampIds.length} closed record${invalidTimestampIds.length === 1 ? "" : "s"} had no positive finite closedAt timestamp: ${invalidTimestampIds.join(", ")}.`,
        "Those records were excluded rather than treated as evidence that no pattern occurred.",
      ],
      action:
        "Review the paper record timestamps before relying on sequence-based coaching.",
    });
  }
  if (futureTimestampIds.length) {
    flags.push({
      id: "invalid-future-closure",
      severity: "info",
      title: "Future closure timestamps were excluded",
      evidence: [
        `${futureTimestampIds.length} closed record${futureTimestampIds.length === 1 ? "" : "s"} occurs after the reporting time: ${futureTimestampIds.join(", ")}.`,
        "Future-dated records are invalid for a retrospective discipline check.",
      ],
      action:
        "Correct the record time or refresh after the actual close; do not use it as current-history evidence.",
    });
  }
  if (unknownOutcomeIds.length) {
    flags.push({
      id: "unknown-closed-outcome",
      severity: "info",
      title: "Some closed outcomes are unknown",
      evidence: [
        `${unknownOutcomeIds.length} chronological closed record${unknownOutcomeIds.length === 1 ? "" : "s"} has no finite final P/L from canonical entry, exit, and partial data: ${unknownOutcomeIds.join(", ")}.`,
        "Unknown outcomes do not prove that there was no loss or streak.",
      ],
      action:
        "Complete the final exit and realized partial P/L details before using outcome-based coaching.",
    });
  }
  if (unknownRiskIds.length) {
    flags.push({
      id: "unknown-original-risk",
      severity: "info",
      title: "Some original risk amounts are unavailable",
      evidence: [
        `${unknownRiskIds.length} chronological closed record${unknownRiskIds.length === 1 ? "" : "s"} lacks a finite original risk calculation: ${unknownRiskIds.join(", ")}.`,
        "Missing sizing data is not evidence that sizing stayed consistent.",
      ],
      action:
        "Retain initial risk or original bracket/quantity fields for later sizing comparison.",
    });
  }

  const dayStart = now === undefined ? undefined : utcDayStart(now);
  const todayTrades =
    dayStart === undefined
      ? 0
      : records.filter((record) => record.closedAt >= dayStart).length;

  let consecutiveLosses = 0;
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];
    if (record.pnl === undefined) break;
    if (record.pnl >= 0) break;
    consecutiveLosses += 1;
  }

  const losses = records.filter(
    (record) => record.pnl !== undefined && record.pnl < 0,
  );
  const lastLoss = losses.at(-1);
  const cooldownMinutes = Number.isFinite(input.cooldownMinutes)
    ? Math.max(0, input.cooldownMinutes!)
    : DEFAULT_COOLDOWN_MINUTES;
  const cooldownUntil = lastLoss
    ? lastLoss.closedAt + cooldownMinutes * MINUTE
    : undefined;
  const activeCooldown = Boolean(
    now !== undefined && cooldownUntil !== undefined && now < cooldownUntil,
  );

  if (activeCooldown && lastLoss && cooldownUntil !== undefined) {
    flags.push({
      id: "rapid-reentry-after-loss",
      severity: "warning",
      title: "Suggested pause after a realized loss",
      evidence: [
        `The latest known realized loss closed at ${formatUtc(lastLoss.closedAt)}.`,
        `The ${cooldownMinutes}-minute reflection window ends at ${formatUtc(cooldownUntil)}.`,
        "Timing alone does not establish revenge trading or intent.",
      ],
      action:
        "Pause, name the independent setup rule, and review the planned invalidation before deciding whether to proceed.",
    });
  }

  const maxTradesPerDay = Number.isFinite(input.maxTradesPerDay)
    ? Math.max(1, Math.floor(input.maxTradesPerDay!))
    : DEFAULT_MAX_TRADES_PER_DAY;
  if (dayStart !== undefined && todayTrades >= maxTradesPerDay) {
    flags.push({
      id: "daily-trade-count",
      severity: "warning",
      title: "Daily closed-trade review threshold reached",
      evidence: [
        `${todayTrades} eligible closed trade${todayTrades === 1 ? "" : "s"} fall in the current UTC day (starting ${formatUtc(dayStart)}).`,
        `The configured reflection threshold is ${maxTradesPerDay} closed trades per UTC day.`,
      ],
      action:
        "Stop adding urgency. Review the day’s setups and wait for a clearly documented next opportunity.",
    });
  }

  if (consecutiveLosses >= 3) {
    const streak = records.slice(-consecutiveLosses);
    flags.push({
      id: "loss-streak",
      severity: "warning",
      title: "Confirmed run of realized losses",
      evidence: [
        `${consecutiveLosses} latest chronological closed record${consecutiveLosses === 1 ? "" : "s"} have finite negative P/L.`,
        `The streak begins at ${formatUtc(streak[0].closedAt)} and is based on recorded outcomes, not an inferred cause.`,
      ],
      action:
        "Take a reset before the next plan: compare the setup, invalidation, and risk to your written rules rather than trying to recover an outcome.",
    });
  }

  const proposedRisk = input.proposedRisk;
  if (proposedRisk !== undefined && !finitePositive(proposedRisk)) {
    flags.push({
      id: "unknown-proposed-risk",
      severity: "info",
      title: "Proposed risk is not usable for comparison",
      evidence: ["A positive finite proposedRisk value was not supplied."],
      action:
        "State the maximum loss for this paper plan before comparing it with prior sizing.",
    });
  }
  if (lastLoss && finitePositive(proposedRisk)) {
    const earlierRisks = records
      .filter(
        (record) =>
          record.closedAt < lastLoss.closedAt && finitePositive(record.risk),
      )
      .slice(-5)
      .map((record) => record.risk!);
    if (earlierRisks.length) {
      const normalRisk = median(earlierRisks);
      if (proposedRisk > normalRisk * 1.5) {
        flags.push({
          id: "risk-escalation-after-loss",
          severity: "warning",
          title: "Proposed risk is materially above recent completed sizing",
          evidence: [
            `Proposed risk for ${contextLabel(input)} is ${formatRisk(proposedRisk)}.`,
            `It is more than 1.5× the median ${formatRisk(normalRisk)} original risk across ${earlierRisks.length} completed record${earlierRisks.length === 1 ? "" : "s"} before the latest known loss.`,
            "This is a sizing comparison, not evidence of motive or a prediction of outcome.",
          ],
          action:
            "Return to your written size rule or write a concrete, pre-existing reason for a different risk amount before continuing.",
        });
      }
    } else {
      flags.push({
        id: "unknown-recent-risk-baseline",
        severity: "info",
        title: "Recent normal risk is unknown",
        evidence: [
          "There is a realized loss, but no earlier closed record with a finite original risk to compare against.",
        ],
        action:
          "Use the written size rule for this plan; the history is too incomplete to label its size normal.",
      });
    }
  }

  const emotion = input.emotion?.trim();
  if (emotion) {
    flags.push({
      id: "self-reported-state",
      severity: "info",
      title: "A self-reported state is noted",
      evidence: [
        `You noted: “${emotion.slice(0, 160)}”.`,
        "This is a reflection prompt, not a diagnosis or a claim about what you will do.",
      ],
      action:
        "If the note feels urgent, take the same short pause and restate the setup rule in neutral terms.",
    });
  }

  const requiredThoughts = [
    "What specific setup rule is present, and what observable fact would invalidate it?",
    "What is the maximum planned loss, and does it match the written size rule?",
    "What would make waiting the better decision for this plan?",
  ];
  if (activeCooldown || consecutiveLosses > 0) {
    requiredThoughts.push(
      "What makes this an independent setup rather than a response to the last outcome?",
    );
  }
  if (flags.some((flag) => flag.id === "risk-escalation-after-loss")) {
    requiredThoughts.push(
      "What pre-existing rule, rather than the last result, supports this larger risk amount?",
    );
  }
  if (emotion) {
    requiredThoughts.push(
      "Can you name your current state without changing the setup or risk rule?",
    );
  }

  const ready = !flags.some(
    (flag) => flag.severity === "warning" || flag.severity === "block",
  );
  return {
    flags,
    lastLossAt: lastLoss?.closedAt,
    cooldownUntil,
    ready,
    counts: { todayTrades, consecutiveLosses },
    requiredThoughts,
  };
}
