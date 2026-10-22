import { paperHistory } from "./setup-history";
import { analyzeConfluenceTrades } from "../../lib/trading/confluence-analytics";
import { evaluateDiscipline } from "../../lib/trading/trading-discipline";
import type { Trade } from "../../lib/trading/model";
export async function coachAnalytics(userId: number) {
  const trades: Trade[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 20; page++) {
    const batch = await paperHistory(userId, "closed", cursor, 100);
    trades.push(...batch.trades);
    cursor = batch.nextCursor;
    if (!cursor) break;
  }
  const now = Date.now();
  return {
    analytics: analyzeConfluenceTrades(trades, now),
    discipline: evaluateDiscipline(trades, { now }),
    complete: !cursor,
    scope: cursor
      ? "Bounded first2,000 canonical closed records; more history exists and conclusions are incomplete."
      : "Canonical closed paper records, not live brokerage fills; legacy snapshots are not backfilled.",
    asOf: now,
  };
}
