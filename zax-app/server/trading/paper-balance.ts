import { TRPCError } from "@trpc/server";
import { paperPerformance } from "../../lib/trading/paper-performance";
import type { Trade } from "../../lib/trading/model";
import { paperHistory } from "./setup-history";
import { loadWorkspace } from "./repository";

const PAPER_LEDGER_PAGE_SIZE = 100;
const PAPER_LEDGER_MAX_PAGES = 20;
const PAPER_LEDGER_MAX_ID_LENGTH = 200;

const unavailableBalance = () =>
  new TRPCError({
    code: "PRECONDITION_FAILED",
    message:
      "Canonical paper balance cannot be verified against the complete bounded realised ledger; no paper order or proposal sizing was created.",
  });

const finitePositive = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

function validTrade(trade: unknown): trade is Trade {
  if (!trade || typeof trade !== "object") return false;
  const value = trade as Partial<Trade>;
  if (
    typeof value.id !== "string" ||
    !value.id.trim() ||
    value.id.length > PAPER_LEDGER_MAX_ID_LENGTH ||
    (value.status !== "pending" &&
      value.status !== "open" &&
      value.status !== "closed" &&
      value.status !== "cancelled") ||
    (value.side !== "long" && value.side !== "short") ||
    !finitePositive(value.entry) ||
    !finitePositive(value.stop) ||
    !finitePositive(value.target) ||
    !finitePositive(value.quantity) ||
    !finitePositive(value.pointValue)
  )
    return false;

  if (
    (value.exit !== undefined && !finitePositive(value.exit)) ||
    (value.initialRisk !== undefined && !finitePositive(value.initialRisk)) ||
    (value.initialQuantity !== undefined &&
      !finitePositive(value.initialQuantity)) ||
    (value.realizedPnl !== undefined &&
      (typeof value.realizedPnl !== "number" ||
        !Number.isFinite(value.realizedPnl)))
  )
    return false;

  if (value.status === "closed" && !finitePositive(value.exit)) return false;
  if (value.events !== undefined && !Array.isArray(value.events)) return false;
  return true;
}

/**
 * Loads the only balance that can authorize paper sizing: the canonical
 * workspace starting balance plus the complete current durable paper ledger's
 * realised P/L. It intentionally has no client balance input and refuses
 * rather than truncating a ledger beyond its bounded read capacity.
 */
export async function loadCanonicalPaperBalance(
  userId: number,
): Promise<number> {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw unavailableBalance();

  const saved = await loadWorkspace(userId);
  const startingBalance = saved.workspace?.paperStartingBalance;
  if (
    typeof startingBalance !== "number" ||
    !Number.isFinite(startingBalance) ||
    startingBalance <= 0
  )
    throw unavailableBalance();

  const ledger: Trade[] = [];
  const seenTradeIds = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  for (let page = 0; page < PAPER_LEDGER_MAX_PAGES; page += 1) {
    const part = await paperHistory(
      userId,
      undefined,
      cursor,
      PAPER_LEDGER_PAGE_SIZE,
    );
    if (
      !part ||
      !Array.isArray(part.trades) ||
      part.trades.length > PAPER_LEDGER_PAGE_SIZE
    )
      throw unavailableBalance();

    for (const trade of part.trades) {
      if (!validTrade(trade) || seenTradeIds.has(trade.id))
        throw unavailableBalance();
      seenTradeIds.add(trade.id);
      ledger.push(trade);
    }

    const nextCursor = part.nextCursor;
    if (nextCursor === undefined) {
      const balance = paperPerformance(
        ledger,
        startingBalance,
        [],
        Date.now(),
      ).balance;
      if (!Number.isFinite(balance) || balance <= 0) throw unavailableBalance();
      return balance;
    }
    if (
      typeof nextCursor !== "string" ||
      !nextCursor.trim() ||
      nextCursor.length > PAPER_LEDGER_MAX_ID_LENGTH ||
      seenCursors.has(nextCursor)
    )
      throw unavailableBalance();
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }

  throw unavailableBalance();
}
