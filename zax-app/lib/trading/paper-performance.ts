import type { Quote, Trade } from "./model";
import { tradeMetrics } from "./engine";
export function paperPerformance(
  trades: Trade[],
  startingBalance: number,
  quotes: Quote[],
  now: number,
) {
  const closed = trades.filter((t) => t.status === "closed"),
    open = trades.filter((t) => t.status === "open");
  const closedNet = closed.reduce(
      (sum, t) => sum + (tradeMetrics(t).pnl || 0),
      0,
    ),
    openRealized = open.reduce((sum, t) => sum + (t.realizedPnl || 0), 0),
    realized = closedNet + openRealized,
    balance = startingBalance + realized;
  const missing: string[] = [];
  let marked = 0;
  for (const t of open) {
    const q = quotes.find((q) => q.symbol === t.market);
    if (
      !q ||
      q.status !== "live" ||
      !Number.isFinite(q.price) ||
      q.price <= 0 ||
      now - q.timestamp * 1000 > 120000 ||
      q.timestamp * 1000 > now + 30000
    ) {
      missing.push(t.market);
      continue;
    }
    const exit = t.side === "long" ? q.bid || q.price : q.ask || q.price;
    marked += (tradeMetrics({ ...t, exit }).pnl || 0) - (t.realizedPnl || 0);
  }
  const day = Math.floor(now / 86400000) * 86400000,
    ledger: { at: number; pnl: number }[] = [];
  let missingTiming = false;
  for (const t of trades) {
    const partials =
      t.events?.filter((e) => e.kind === "partial" && Number.isFinite(e.pnl)) ||
      [];
    partials.forEach((e) => ledger.push({ at: e.at, pnl: e.pnl! }));
    if ((t.realizedPnl || 0) !== 0 && !partials.length) missingTiming = true;
    if (t.status === "closed") {
      if (!t.closedAt) missingTiming = true;
      ledger.push({
        at: t.closedAt || 0,
        pnl: (tradeMetrics(t).pnl || 0) - (t.realizedPnl || 0),
      });
    }
  }
  let equity = startingBalance,
    peak = equity,
    drawdown = 0;
  for (const entry of ledger.sort((a, b) => a.at - b.at)) {
    equity += entry.pnl;
    if (entry.at < day) peak = equity;
    else {
      peak = Math.max(peak, equity);
      drawdown = Math.max(
        drawdown,
        peak > 0 ? ((peak - equity) / peak) * 100 : 100,
      );
    }
  }
  const rr = trades.length
    ? trades.reduce((sum, t) => sum + tradeMetrics(t).rr, 0) / trades.length
    : null;
  return {
    balance,
    realized,
    openCount: open.length,
    openPnl: missing.length ? null : marked,
    equity: missing.length ? null : balance + marked,
    missing: [...new Set(missing)],
    meanRR: rr,
    openRisk: open.reduce((sum, t) => sum + tradeMetrics(t).risk, 0),
    todayClosedDrawdownPct: missingTiming ? null : drawdown,
  };
}
