import { AsyncLocalStorage } from "node:async_hooks";
const context = new AsyncLocalStorage<{
  deadline: number;
  brokerReads: number;
}>();
export function withScheduledScanBudget<T>(
  deadline: number,
  work: () => Promise<T>,
): Promise<T> {
  if (!Number.isFinite(deadline) || deadline <= Date.now())
    return Promise.reject(new Error("Scheduled scan deadline expired."));
  return context.run({ deadline, brokerReads: 0 }, work);
}
export function scheduledScanDeadline(explicit?: number): number | undefined {
  const inherited = context.getStore()?.deadline;
  return inherited === undefined
    ? explicit
    : explicit === undefined
      ? inherited
      : Math.min(explicit, inherited);
}
/** Counts actual attempted broker HTTP calls, including token/bootstrap reads; cached work spends none. */
export function consumeScheduledBrokerRead() {
  const state = context.getStore();
  if (!state) return;
  if (Date.now() >= state.deadline)
    throw new Error("Scheduled scan deadline expired; work deferred.");
  if (state.brokerReads >= 12)
    throw new Error(
      "Shared scheduled broker request budget exhausted; work deferred.",
    );
  state.brokerReads += 1;
}
export function scheduledBrokerReadsUsed() {
  return context.getStore()?.brokerReads ?? 0;
}
