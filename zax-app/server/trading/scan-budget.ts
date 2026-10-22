import type { AlertRule } from "../../lib/trading/model";
function sourceFrame(timeframe: AlertRule["timeframe"]) {
  return timeframe === "4h" ? "1h" : timeframe === "1w" ? "1d" : timeframe;
}
export function planBrokerScan(
  rules: AlertRule[],
  cursor = 0,
  maxRequests = 12,
  bootstrapReads = 0,
) {
  const grouped = new Map<string, AlertRule[]>();
  for (const rule of rules.filter(
    (r) => r.enabled && r.market.startsWith("TL:"),
  )) {
    const group = grouped.get(rule.market) || [];
    group.push(rule);
    grouped.set(rule.market, group);
  }
  const groups = [...grouped.entries()];
  const selected = new Set<string>(),
    ordered: AlertRule[] = [];
  const bootstrapReserve = groups.length
    ? Math.max(0, Math.min(maxRequests, bootstrapReads))
    : 0;
  let cost = bootstrapReserve,
    visited = 0;
  for (; visited < groups.length; visited++) {
    const [market, items] = groups[(cursor + visited) % groups.length];
    const frames = new Set(
      items
        .filter((r) =>
          ["fvg", "setup", "scenario-change", "scenario-direction"].includes(
            r.kind,
          ),
        )
        .map((r) => sourceFrame(r.timeframe)),
    );
    if (
      items.some(
        (r) =>
          r.kind === "setup" ||
          r.kind === "scenario-change" ||
          r.kind === "scenario-direction",
      )
    ) {
      frames.add("1h");
      frames.add("1d");
    }
    const requests = 1 + frames.size;
    if (cost + requests > maxRequests) break;
    selected.add(market);
    ordered.push(...items);
    cost += requests;
  }
  return {
    rules: [
      ...ordered,
      ...rules.filter((r) => r.enabled && !r.market.startsWith("TL:")),
    ],
    startCursor: groups.length ? cursor % groups.length : 0,
    totalBrokerMarkets: groups.length,
    requestBudget: cost,
    bootstrapReserve,
    deferredMarkets: groups.length - selected.size,
    nextCursor: groups.length ? (cursor + visited) % groups.length : 0,
  };
}
export function beforeDeadline<T>(
  promise: Promise<T>,
  deadline?: number,
): Promise<T> {
  if (!deadline) return promise;
  const remaining = deadline - Date.now();
  if (remaining <= 0)
    return Promise.reject(new Error("Scan budget elapsed; work deferred."));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Scan budget elapsed; work deferred.")),
      remaining,
    );
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
export function requestTimeout(deadline?: number) {
  const remaining = deadline ? deadline - Date.now() : 15000;
  if (remaining <= 0)
    throw new Error("Scan budget elapsed; request not started.");
  return Math.max(1, Math.min(15000, remaining));
}
