import { drainSourceJobs } from "./source-analysis-jobs";
import {
  withScheduledScanBudget,
  scheduledScanDeadline,
  scheduledBrokerReadsUsed,
} from "./scheduled-scan-budget";
import {
  recordPaperProcessing,
  type PaperProcessingOrigin,
} from "./paper-processing";
import { confluenceAlertDecision } from "../../lib/trading/confluence-alerts";
import { confluenceForAnalysis } from "../../lib/trading/confluence-runtime";
import {
  alertNotificationChannelId,
  isAlertNotificationKind,
  notificationDeliveryPreference,
  type AlertDeliveryPreference,
  type AlertNotificationKind,
} from "../../lib/trading/notification-scope";
import { initialWorkspace } from "../../lib/trading/model";
import { setupAnalysis } from "./setup-service";
import { latestSetup } from "./setup-history";
import { persistDirectionObservation } from "./scenario-directions";
import { managePaperTrades } from "./paper-service";
import { checkSessionAutoPaper } from "./session-auto-paper";
import { activePaperTrades } from "./setup-history";
import { mayUseApp } from "./access";
import {
  meaningfulScenarioChange,
  setupSignalIdentity,
} from "../../lib/trading/setup-alerts";
import { SECONDS } from "../../lib/trading/engine";
import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import { jwtVerify } from "jose";
import { parse as parseCookie } from "cookie";
import type { Express } from "express";
import { TRPCError } from "@trpc/server";
import {
  tradingDevices,
  tradingAlertEvents,
  tradingRuntimeState,
  tradingSchedules,
  tradingWorkspaces,
} from "../../drizzle/schema";
import { AlertEvent, AlertRule } from "../../lib/trading/model";
import type { SetupAnalysis } from "../../lib/trading/setup-model";
import type { SessionAutoResult } from "../../lib/trading/session-auto-types";
import { gaps } from "../../lib/trading/engine";
import { dbRequired, loadWorkspace } from "./repository";
import { getQuote, getCandles } from "./market";
import {
  createHeartbeatJob,
  deleteHeartbeatJob,
  listHeartbeatJobs,
} from "../_core/heartbeat";
import { ENV } from "../_core/env";
import { sdk } from "../_core/sdk";
import { users } from "../../drizzle/schema";
import { recordBackgroundStrategyHeartbeat } from "./background-strategy-status";
import { beforeDeadline, planBrokerScan, requestTimeout } from "./scan-budget";
import { brokerBootstrapReadBudget } from "./tradelocker";
import {
  DELIVERY_LEASE_MS,
  MAX_DELIVERY_ATTEMPTS,
  aggregateDelivery,
  conditionalPendingClaim,
  deliveryRuntimeRecord,
  deliveryRuntimeStateId,
  mayRecoverDeliveryLease,
  newDeliveryClaim,
  receiptTicketIds,
  sendingDelivery,
  withReceiptResults,
  type AlertDeliveryRuntimeRecord,
} from "./alert-delivery-state";
const scanCursors = new Map<number, number>();
const priorityScanCursors = new Map<number, number>();
export type AlertScanResponse = {
  events: AlertEvent[];
  message: string;
  ruleStates: Array<AlertScanState & { id: string }>;
};
const running = new Map<number, Promise<AlertScanResponse>>();
type AlertEventWithNotification = AlertEvent & {
  alertKind?: AlertNotificationKind;
};
type AlertDeliveryRow = {
  id: string;
  userId: number;
  payload: unknown;
  delivery?: string;
  createdAt?: Date;
};

const DELIVERY_RUNTIME_KIND = "alert-delivery";
const SCHEDULE_LOCK_TIMEOUT_SECONDS = 1;

function affectedRows(result: unknown) {
  return Array.isArray(result) && result[0]?.affectedRows === 1;
}

function deliveryStateId(userId: number, eventId: string) {
  return deliveryRuntimeStateId(userId, eventId);
}

function deviceKey(token: string) {
  return createHash("sha256").update(token).digest("hex").slice(0, 32);
}

function newClaimToken() {
  return randomUUID().replace(/-/g, "").slice(0, 20);
}

async function deliveryRecordFor(db: any, userId: number, eventId: string) {
  const id = deliveryStateId(userId, eventId);
  if (!id) return undefined;
  const rows = await db
    .select({ payload: tradingRuntimeState.payload })
    .from(tradingRuntimeState)
    .where(
      and(
        eq(tradingRuntimeState.id, id),
        eq(tradingRuntimeState.userId, userId),
        eq(tradingRuntimeState.kind, DELIVERY_RUNTIME_KIND),
      ),
    )
    .limit(1);
  return deliveryRuntimeRecord(rows[0]?.payload);
}

async function saveDeliveryRecord(
  db: any,
  userId: number,
  id: string,
  record: AlertDeliveryRuntimeRecord,
) {
  await db
    .insert(tradingRuntimeState)
    .values({ id, userId, kind: DELIVERY_RUNTIME_KIND, payload: record })
    .onDuplicateKeyUpdate({ set: { payload: record, updatedAt: new Date() } });
}

/**
 * A delivery claim is conditional on the durable event still being pending and
 * persists on the same transaction as its short lease. Without transactions the
 * worker sends nothing: process-local state is never a cross-replica claim.
 */
async function claimPendingDelivery(row: AlertDeliveryRow) {
  const stateId = deliveryStateId(row.userId, row.id);
  if (!stateId) return undefined;
  const db = await dbRequired();
  if (typeof db.transaction !== "function") return undefined;
  const claimToken = newClaimToken();
  const sending = conditionalPendingClaim("pending", claimToken);
  if (!sending) return undefined;
  try {
    return await db.transaction(async (tx: any) => {
      const previous = await deliveryRecordFor(tx, row.userId, row.id);
      const attempts = (previous?.attempts || 0) + 1;
      if (attempts > MAX_DELIVERY_ATTEMPTS) {
        await tx
          .update(tradingAlertEvents)
          .set({ delivery: "delivery-unknown" })
          .where(
            and(
              eq(tradingAlertEvents.id, row.id),
              eq(tradingAlertEvents.userId, row.userId),
              eq(tradingAlertEvents.delivery, "pending"),
            ),
          );
        return undefined;
      }
      const claim = newDeliveryClaim({
        eventId: row.id,
        claimToken,
        attempts,
        now: Date.now(),
      });
      if (!claim) return undefined;
      const updated = await tx
        .update(tradingAlertEvents)
        .set({ delivery: sending })
        .where(
          and(
            eq(tradingAlertEvents.id, row.id),
            eq(tradingAlertEvents.userId, row.userId),
            eq(tradingAlertEvents.delivery, "pending"),
          ),
        );
      if (!affectedRows(updated)) return undefined;
      await saveDeliveryRecord(tx, row.userId, stateId, claim);
      return claim;
    });
  } catch {
    return undefined;
  }
}

async function completeDeliveryClaim(input: {
  row: AlertDeliveryRow;
  claim: AlertDeliveryRuntimeRecord;
  delivery: string;
  tickets: AlertDeliveryRuntimeRecord["tickets"];
}) {
  const { row, claim } = input;
  const stateId = deliveryStateId(row.userId, row.id);
  const sending = claim.claimToken
    ? sendingDelivery(claim.claimToken)
    : undefined;
  if (!stateId || !sending) return false;
  const db = await dbRequired();
  if (typeof db.transaction !== "function") return false;
  const { claimedAt: _claimedAt, leaseUntil: _leaseUntil, ...stable } = claim;
  const record: AlertDeliveryRuntimeRecord = {
    ...stable,
    phase: "sent",
    tickets: input.tickets,
  };
  try {
    return await db.transaction(async (tx: any) => {
      const updated = await tx
        .update(tradingAlertEvents)
        .set({
          delivery: input.delivery,
          receiptId:
            input.tickets.find((ticket) => ticket.ticketStatus === "accepted")
              ?.ticketId || null,
        })
        .where(
          and(
            eq(tradingAlertEvents.id, row.id),
            eq(tradingAlertEvents.userId, row.userId),
            eq(tradingAlertEvents.delivery, sending),
          ),
        );
      if (!affectedRows(updated)) return false;
      await saveDeliveryRecord(tx, row.userId, stateId, record);
      return true;
    });
  } catch {
    return false;
  }
}

async function recoverExpiredDeliveryLeases(userId: number) {
  const db = await dbRequired();
  const rows = await db
    .select({
      id: tradingAlertEvents.id,
      userId: tradingAlertEvents.userId,
      delivery: tradingAlertEvents.delivery,
      createdAt: tradingAlertEvents.createdAt,
    })
    .from(tradingAlertEvents)
    .where(
      and(
        eq(tradingAlertEvents.userId, userId),
        or(
          eq(tradingAlertEvents.delivery, "sending"),
          like(tradingAlertEvents.delivery, "sending:%"),
        ),
      ),
    )
    .limit(20);
  for (const row of rows) {
    const stateId = deliveryStateId(userId, row.id);
    if (!stateId || typeof db.transaction !== "function") continue;
    try {
      await db.transaction(async (tx: any) => {
        const record = await deliveryRecordFor(tx, userId, row.id);
        const expired = mayRecoverDeliveryLease({
          delivery: row.delivery,
          record,
          createdAt: row.createdAt,
          now: Date.now(),
        });
        const exhausted =
          record?.phase === "sending" &&
          Boolean(record.leaseUntil && record.leaseUntil <= Date.now()) &&
          record.attempts >= MAX_DELIVERY_ATTEMPTS;
        if (!expired && !exhausted) return;
        const delivery = exhausted ? "delivery-unknown" : "pending";
        const updated = await tx
          .update(tradingAlertEvents)
          .set({ delivery })
          .where(
            and(
              eq(tradingAlertEvents.id, row.id),
              eq(tradingAlertEvents.userId, userId),
              eq(tradingAlertEvents.delivery, row.delivery),
            ),
          );
        if (!affectedRows(updated)) return;
        if (record) {
          const {
            claimedAt: _claimedAt,
            leaseUntil: _leaseUntil,
            ...stable
          } = record;
          await saveDeliveryRecord(tx, userId, stateId, {
            ...stable,
            phase: exhausted ? "exhausted" : "recovered",
          });
        }
      });
    } catch {
      // A later bounded scan may safely retry lease recovery.
    }
  }
}
export type AlertScanDeferReason =
  | "provider-budget"
  | "scan-deadline"
  | "source-unavailable";
export type AlertScanState = {
  lastEvaluatedAt?: number;
  deferredCount: number;
  deferReason?: AlertScanDeferReason;
  priority: NonNullable<AlertRule["priority"]>;
};

export function selectedRuleStrategyIds(rule: AlertRule) {
  const input = rule.combinedStrategyIds?.length
    ? rule.combinedStrategyIds
    : [rule.strategyId];
  return [...new Set(input)].slice(0, 3);
}

/**
 * Pinned broker markets receive the finite request budget before normal markets.
 * When pinned work itself exceeds that budget it still rotates and reports a
 * deferral; this never silently spends extra provider reads or invents a quote.
 */
export function planAlertScan(
  rules: AlertRule[],
  normalCursor = 0,
  priorityCursor = 0,
  maxRequests = 12,
  bootstrapReads = 0,
) {
  const priorityMarkets = new Set(
    rules
      .filter(
        (rule) => rule.market.startsWith("TL:") && rule.priority === "high",
      )
      .map((rule) => rule.market),
  );
  const priorityRules = rules.filter(
    (rule) => rule.market.startsWith("TL:") && priorityMarkets.has(rule.market),
  );
  const normalRules = rules.filter(
    (rule) =>
      rule.market.startsWith("TL:") && !priorityMarkets.has(rule.market),
  );
  const priority = planBrokerScan(
    priorityRules,
    priorityCursor,
    maxRequests,
    bootstrapReads,
  );
  const normal = planBrokerScan(
    normalRules,
    normalCursor,
    Math.max(0, maxRequests - priority.requestBudget),
    0,
  );
  return {
    rules: [
      ...priority.rules,
      ...normal.rules,
      ...rules.filter((rule) => rule.enabled && !rule.market.startsWith("TL:")),
    ],
    requestBudget: priority.requestBudget + normal.requestBudget,
    deferredMarkets: priority.deferredMarkets + normal.deferredMarkets,
    deferredPriorityMarkets: priority.deferredMarkets,
    priorityMarkets,
    totalPriorityMarkets: priority.totalBrokerMarkets,
    totalNormalMarkets: normal.totalBrokerMarkets,
    priorityStartCursor: priority.startCursor,
    normalStartCursor: normal.startCursor,
  };
}

export function buildExpoPushPayloads(
  devices: Array<{ token: string }>,
  event: AlertEventWithNotification,
  preference: AlertDeliveryPreference,
) {
  const kind = isAlertNotificationKind(event.alertKind)
    ? event.alertKind
    : undefined;
  return devices.map((device) => ({
    to: device.token,
    sound: preference.sound ? "default" : null,
    ...(preference.badge ? { badge: 1 } : {}),
    title: event.title,
    body: event.body,
    data: {
      alertId: event.id,
      ruleId: event.ruleId,
      market: event.market,
      timeframe: event.timeframe,
      strategyId: event.strategyId,
      strategyVersion: event.strategyVersion,
      evidenceId: event.id,
      ...(kind ? { alertKind: kind } : {}),
    },
    channelId: alertNotificationChannelId(kind),
  }));
}

export function alertPredicate(
  rule: AlertRule,
  price: number,
  hasRecentGap: boolean,
) {
  return rule.kind === "above"
    ? price >= rule.price
    : rule.kind === "below"
      ? price <= rule.price
      : rule.kind === "fvg"
        ? hasRecentGap
        : false;
}
export function eventKey(userId: number, ruleId: string, bucket: number) {
  return (
    "alert_" +
    createHash("sha256")
      .update(`${userId}:${ruleId}:${bucket}`)
      .digest("hex")
      .slice(0, 40)
  );
}

/**
 * Setup candidates are emitted only when their detector has marked every
 * required source guard ready. Include the exact closed source bar and PDC's
 * observed quote pair in the persisted key, so retries of the same evidence
 * deduplicate while a different proof cannot inherit an earlier alert ID.
 */
export function setupAlertSignalIdentity(analysis: SetupAnalysis) {
  const pdcQuotePairs = (analysis.sessionContexts || [])
    .filter((context) =>
      analysis.candidates.some(
        (candidate) =>
          candidate.ready &&
          candidate.family === "pdc-continuation" &&
          candidate.strategyId === context.strategyId,
      ),
    )
    .map((context) => {
      const pair = context.quoteEvidence;
      return [
        context.strategyId,
        pair?.previous?.symbol ?? null,
        pair?.previous?.price ?? null,
        pair?.previous?.timestamp ?? null,
        pair?.previous?.source ?? null,
        pair?.current.symbol ?? null,
        pair?.current.price ?? null,
        pair?.current.timestamp ?? null,
        pair?.current.source ?? null,
      ];
    })
    .sort((left, right) => String(left[0]).localeCompare(String(right[0])));
  return JSON.stringify([
    setupSignalIdentity(analysis),
    analysis.source,
    pdcQuotePairs.length &&
    analysis.candidates
      .filter((candidate) => candidate.ready)
      .every((candidate) => candidate.family === "pdc-continuation")
      ? null
      : (analysis.candles.at(-1)?.time ?? null),
    pdcQuotePairs,
  ]);
}
export async function registerDevice(
  userId: number,
  token: string,
  platform: string,
) {
  const db = await dbRequired();
  await db
    .insert(tradingDevices)
    .values({ userId, token, platform })
    .onDuplicateKeyUpdate({ set: { userId, platform } });
  return { ok: true as const };
}
async function pushEvent(
  row: AlertDeliveryRow,
  preference: AlertDeliveryPreference,
  deadline?: number,
) {
  const claim = await claimPendingDelivery(row);
  if (!claim) return;
  try {
    const db = await dbRequired();
    const devices = await db
      .select()
      .from(tradingDevices)
      .where(eq(tradingDevices.userId, row.userId))
      .limit(10);
    if (!devices.length) {
      await completeDeliveryClaim({
        row,
        claim,
        delivery: "no-device",
        tickets: [],
      });
      return;
    }
    const event = row.payload as AlertEventWithNotification;
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(process.env.EXPO_PUSH_ACCESS_TOKEN
          ? { Authorization: `Bearer ${process.env.EXPO_PUSH_ACCESS_TOKEN}` }
          : {}),
      },
      body: JSON.stringify(buildExpoPushPayloads(devices, event, preference)),
      signal: AbortSignal.timeout(Math.min(10_000, requestTimeout(deadline))),
    });
    if (!response.ok) throw new Error("Push transport rejected request.");
    const body = await response.json();
    const responseTickets = Array.isArray(body.data) ? body.data : [body.data];
    const tickets: AlertDeliveryRuntimeRecord["tickets"] = devices.map(
      (device, index) => {
        const ticket = responseTickets[index] as
          | { status?: unknown; id?: unknown; details?: { error?: unknown } }
          | undefined;
        const ticketId =
          typeof ticket?.id === "string" && ticket.id.length <= 256
            ? ticket.id
            : undefined;
        const providerError =
          typeof ticket?.details?.error === "string"
            ? ticket.details.error.slice(0, 64)
            : undefined;
        const accepted = ticket?.status === "ok" && Boolean(ticketId);
        return {
          deviceKey: deviceKey(device.token),
          ...(ticketId ? { ticketId } : {}),
          ticketStatus: accepted
            ? ("accepted" as const)
            : ("rejected" as const),
          receiptStatus: accepted
            ? ("pending" as const)
            : ("not-requested" as const),
          ...(providerError ? { providerError } : {}),
          updatedAt: Date.now(),
        };
      },
    );
    for (let index = 0; index < tickets.length; index++) {
      if (tickets[index].providerError === "DeviceNotRegistered")
        await db
          .delete(tradingDevices)
          .where(
            and(
              eq(tradingDevices.token, devices[index].token),
              eq(tradingDevices.userId, row.userId),
            ),
          );
    }
    await completeDeliveryClaim({
      row,
      claim,
      delivery: aggregateDelivery(tickets),
      tickets,
    });
  } catch {
    await completeDeliveryClaim({
      row,
      claim,
      delivery: "delivery-unknown",
      tickets: [],
    });
  }
}

async function persistReceiptRecord(input: {
  row: AlertDeliveryRow;
  record: AlertDeliveryRuntimeRecord;
  delivery: string;
}) {
  const db = await dbRequired();
  const stateId = deliveryStateId(input.row.userId, input.row.id);
  if (!stateId || typeof db.transaction !== "function") return false;
  try {
    return await db.transaction(async (tx: any) => {
      const updated = await tx
        .update(tradingAlertEvents)
        .set({ delivery: input.delivery })
        .where(
          and(
            eq(tradingAlertEvents.id, input.row.id),
            eq(tradingAlertEvents.userId, input.row.userId),
            eq(tradingAlertEvents.delivery, input.row.delivery!),
          ),
        );
      if (!affectedRows(updated)) return false;
      await saveDeliveryRecord(tx, input.row.userId, stateId, input.record);
      return true;
    });
  } catch {
    return false;
  }
}

async function checkReceipts(userId: number, deadline?: number) {
  const db = await dbRequired();
  const rows = await db
    .select()
    .from(tradingAlertEvents)
    .where(
      and(
        eq(tradingAlertEvents.userId, userId),
        or(
          eq(tradingAlertEvents.delivery, "receipt-pending"),
          eq(tradingAlertEvents.delivery, "push-partial"),
        ),
      ),
    )
    .limit(20);
  const candidates = await Promise.all(
    rows.map(async (row) => ({
      row,
      record: await deliveryRecordFor(db, userId, row.id),
    })),
  );
  const ids = [
    ...new Set(candidates.flatMap(({ record }) => receiptTicketIds(record))),
  ].slice(0, 200);
  if (!ids.length) return;
  try {
    const response = await fetch(
      "https://exp.host/--/api/v2/push/getReceipts",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.EXPO_PUSH_ACCESS_TOKEN
            ? { Authorization: `Bearer ${process.env.EXPO_PUSH_ACCESS_TOKEN}` }
            : {}),
        },
        body: JSON.stringify({ ids }),
        signal: AbortSignal.timeout(Math.min(10000, requestTimeout(deadline))),
      },
    );
    if (!response.ok) return;
    const body = await response.json();
    const devices = await db
      .select({ token: tradingDevices.token })
      .from(tradingDevices)
      .where(eq(tradingDevices.userId, userId))
      .limit(10);
    for (const { row, record } of candidates) {
      const result = withReceiptResults({
        record,
        receipts: body.data || {},
        now: Date.now(),
      });
      if (!result) continue;
      for (const invalid of result.invalidDeviceKeys) {
        const device = devices.find(
          (item) => deviceKey(item.token) === invalid,
        );
        if (device)
          await db
            .delete(tradingDevices)
            .where(
              and(
                eq(tradingDevices.userId, userId),
                eq(tradingDevices.token, device.token),
              ),
            );
      }
      await persistReceiptRecord({
        row,
        record: result.record,
        delivery: result.delivery,
      });
    }
  } catch {
    /* next scan may check again; accepted is not a device receipt */
  }
}
async function scan(
  userId: number,
  origin: PaperProcessingOrigin = "foreground",
) {
  const deadline = scheduledScanDeadline(Date.now() + 45000)!;
  const db = await dbRequired();
  const identity = (
    await db.select().from(users).where(eq(users.id, userId)).limit(1)
  )[0];
  if (!mayUseApp(identity))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Scheduled app access is restricted to the approved owner.",
    });
  const loaded = await loadWorkspace(userId),
    workspace = loaded.workspace || initialWorkspace();
  const events: AlertEvent[] = [];
  let unavailable = 0;
  const paperWatches = (await activePaperTrades(userId))
    .filter((t) => t.autoManage)
    .map((t) => ({
      id: "paper-watch-" + t.id,
      name: "Paper bracket watch",
      market: t.market,
      timeframe: "5m" as const,
      strategyId: t.strategyId,
      kind: "above" as const,
      price: Number.MAX_VALUE,
      enabled: true,
      cooldownMinutes: 1,
      createdAt: t.createdAt,
    }));
  const valid = [
    ...workspace.alerts.filter((rule) => {
      const ids = selectedRuleStrategyIds(rule);
      return (
        rule.enabled &&
        ids.length >= 1 &&
        ids.length <= 3 &&
        ids.every((id) =>
          workspace.strategies.some(
            (strategy) => strategy.id === id && !strategy.archived,
          ),
        )
      );
    }),
    ...paperWatches,
  ];
  // A cold process still advances by scan minute; a deploy/restart cannot reset
  // all non-priority markets to index zero and silently starve the tail.
  const rotationMinute = Math.floor(Date.now() / 60_000);
  const plan = planAlertScan(
    valid,
    scanCursors.get(userId) ?? rotationMinute,
    priorityScanCursors.get(userId) ?? rotationMinute,
    12,
    brokerBootstrapReadBudget(deadline),
  );
  const plannedRuleIds = new Set(plan.rules.map((rule) => rule.id));
  const attemptedPriorityBroker = new Set<string>(),
    attemptedNormalBroker = new Set<string>(),
    failedQuotes = new Set<string>();
  const quoteCache = new Map<string, Awaited<ReturnType<typeof getQuote>>>(),
    barCache = new Map<string, Awaited<ReturnType<typeof getCandles>>>();
  let timedOut = 0;
  const deferReasons = new Map<string, AlertScanDeferReason>();
  const defer = (rule: AlertRule, reason: AlertScanDeferReason) => {
    rule.deferredCount = (rule.deferredCount || 0) + 1;
    deferReasons.set(rule.id, reason);
  };
  const evaluated = (rule: AlertRule) => {
    rule.lastEvaluatedAt = Date.now();
    rule.deferredCount = 0;
    deferReasons.delete(rule.id);
  };
  for (const rule of workspace.alerts)
    if (
      rule.enabled &&
      rule.market.startsWith("TL:") &&
      !plannedRuleIds.has(rule.id)
    )
      defer(rule, "provider-budget");
  for (const rule of plan.rules) {
    if (Date.now() >= deadline - 2000) {
      timedOut++;
      if (!rule.id.startsWith("paper-watch-")) defer(rule, "scan-deadline");
      continue;
    }
    if (rule.market.startsWith("TL:")) {
      if (plan.priorityMarkets.has(rule.market))
        attemptedPriorityBroker.add(rule.market);
      else attemptedNormalBroker.add(rule.market);
    }
    if (failedQuotes.has(rule.market)) {
      unavailable++;
      if (!rule.id.startsWith("paper-watch-"))
        defer(rule, "source-unavailable");
      continue;
    }
    const strategy = workspace.strategies.find((s) => s.id === rule.strategyId);
    if ((!strategy || strategy.archived) && !rule.id.startsWith("paper-watch-"))
      continue;
    let quote;
    try {
      quote =
        quoteCache.get(rule.market) ||
        (await beforeDeadline(
          getQuote(rule.market, identity, deadline),
          deadline,
        ));
      quoteCache.set(rule.market, quote);
    } catch {
      failedQuotes.add(rule.market);
      unavailable++;
      if (!rule.id.startsWith("paper-watch-"))
        defer(rule, "source-unavailable");
      continue;
    }
    if (quote.status !== "live") {
      unavailable++;
      if (!rule.id.startsWith("paper-watch-"))
        defer(rule, "source-unavailable");
      continue;
    }
    if (rule.id.startsWith("paper-watch-")) continue;
    if (!strategy) continue;
    const last = await db
      .select()
      .from(tradingAlertEvents)
      .where(
        and(
          eq(tradingAlertEvents.userId, userId),
          eq(tradingAlertEvents.ruleId, rule.id),
        ),
      )
      .orderBy(desc(tradingAlertEvents.createdAt))
      .limit(1);
    if (
      rule.kind !== "scenario-direction" &&
      last[0] &&
      Date.now() - last[0].createdAt.getTime() < rule.cooldownMinutes * 60000
    ) {
      evaluated(rule);
      continue;
    }
    if (rule.kind === "confluence" || rule.kind === "below-gate") {
      try {
        const ids = selectedRuleStrategyIds(rule),
          strategies = workspace.strategies.filter((s) => ids.includes(s.id));
        const analysis = await setupAnalysis(
          identity!,
          {
            market: rule.market,
            timeframe: rule.timeframe,
            strategyIds: ids,
            strategies,
            combination: workspace.settings.combination || "all",
            timezone: workspace.settings.timezone,
          },
          deadline,
        );
        evaluated(rule);
        const evaluations = confluenceForAnalysis(
            strategies,
            analysis,
            Date.now(),
          ),
          decisions = Object.entries(evaluations).map(([id, e]) => ({
            id,
            e,
            decision: confluenceAlertDecision(rule, e),
          }));
        const firing = decisions.filter((d) => d.decision.fire),
          all = workspace.settings.combination !== "any";
        if (!firing.length || (all && firing.length !== ids.length)) continue;
        const signature = firing.map((d) => [
            d.id,
            d.e.snapshot.version,
            d.e.snapshot.decisionBarOpenAt,
            d.decision.score,
            rule.minimumPoints,
            rule.minimumConditions,
          ]),
          event: AlertEventWithNotification = {
            id:
              "confluence-alert_" +
              createHash("sha256")
                .update(JSON.stringify([userId, rule.id, signature]))
                .digest("hex")
                .slice(0, 40),
            ruleId: rule.id,
            market: rule.market,
            timeframe: rule.timeframe,
            strategyId: rule.strategyId,
            strategyVersion: strategy.version,
            price: quote.price,
            source: analysis.source,
            providerTimestamp:
              quote.timestampKind === "received" ? undefined : quote.timestamp,
            createdAt: Date.now(),
            read: false,
            title: `${rule.market} · ${rule.kind === "below-gate" ? "Trigger below entry gate" : "Confluence alert threshold met"}`,
            body: firing.map((d) => d.decision.reason).join(" "),
            evidence: firing.flatMap((d) => [
              d.decision.reason,
              ...d.e.snapshot.checklist.map(
                (c) => `${c.name}: ${c.status} (${c.weight} points)`,
              ),
            ]),
            setup: { ...analysis, candles: analysis.candles.slice(-80) },
            alertKind: rule.kind,
            delivery: "pending",
          };
        try {
          await db
            .insert(tradingAlertEvents)
            .values({ id: event.id, userId, ruleId: rule.id, payload: event });
          events.push(event);
        } catch (e) {
          if (
            (e as any).code !== "ER_DUP_ENTRY" &&
            (e as any).cause?.code !== "ER_DUP_ENTRY"
          )
            throw e;
        }
      } catch {
        unavailable++;
        defer(rule, "source-unavailable");
      }
      continue;
    }
    if (
      rule.kind === "setup" ||
      rule.kind === "scenario-change" ||
      rule.kind === "scenario-direction"
    ) {
      const ids = selectedRuleStrategyIds(rule),
        combination = workspace.settings.combination || "all";
      let analysis;
      try {
        const previous =
          rule.kind === "scenario-change"
            ? await latestSetup(
                userId,
                rule.market,
                rule.timeframe,
                ids,
                combination,
              )
            : undefined;
        analysis = await setupAnalysis(
          identity!,
          {
            market: rule.market,
            timeframe: rule.timeframe,
            strategyIds: ids,
            combination,
            timezone: workspace.settings.timezone,
            strategies: workspace.strategies.filter((s) => ids.includes(s.id)),
          },
          deadline,
        );
        evaluated(rule);
        if (rule.kind === "scenario-direction") {
          const event = await persistDirectionObservation(
            userId,
            rule,
            analysis,
            workspace.strategies,
            quote,
            deadline,
          );
          if (event) events.push(event);
          continue;
        }
        if (
          rule.kind === "setup"
            ? !analysis.candidates.some((c) => c.ready)
            : !meaningfulScenarioChange(previous, analysis)
        )
          continue;
      } catch {
        unavailable++;
        defer(rule, "source-unavailable");
        continue;
      }
      const ready = analysis.candidates.filter((c) => c.ready),
        aligned = ready.flatMap((c) =>
          c.steps.filter((s) => s.status === "met").map((s) => s.name),
        ),
        unique = [...new Set(aligned)];
      const identityKey =
        rule.kind === "setup"
          ? setupAlertSignalIdentity(analysis)
          : JSON.stringify([
              analysis.scenario?.sourceAt,
              analysis.scenario?.side,
              analysis.scenario?.candles.map((c) => c.close),
            ]);
      const event: AlertEventWithNotification = {
        id:
          "setup-alert_" +
          createHash("sha256")
            .update(JSON.stringify([userId, rule.id, identityKey]))
            .digest("hex")
            .slice(0, 40),
        ruleId: rule.id,
        market: rule.market,
        timeframe: rule.timeframe,
        strategyId: rule.strategyId,
        strategyVersion: strategy!.version,
        price: quote.price,
        source: analysis.source,
        providerTimestamp:
          quote.timestampKind === "received" ? undefined : quote.timestamp,
        createdAt: Date.now(),
        read: false,
        title: `${rule.market} · ${rule.kind === "setup" ? "Ready OHLC setup" : "Historical scenario changed"}`,
        body: `${unique.length} aligned supported conditions: ${unique.join(", ") || "scenario-only update"}. ${ids.length} selected model(s). Conditional history, not calibrated probability; paper review only.`,
        evidence: [
          ...unique,
          analysis.estimate.label,
          analysis.profile.basis,
          ...analysis.messages.slice(0, 5),
        ],
        setup: { ...analysis, candles: analysis.candles.slice(-80) },
        alertKind: rule.kind,
        delivery: "pending",
      };
      try {
        await db
          .insert(tradingAlertEvents)
          .values({ id: event.id, userId, ruleId: rule.id, payload: event });
        events.push(event);
      } catch (e) {
        if (
          (e as any).code !== "ER_DUP_ENTRY" &&
          (e as any).cause?.code !== "ER_DUP_ENTRY"
        )
          throw e;
      }
      continue;
    }
    let gap = false;
    const evidence = [
      `Rule ${rule.id}: ${rule.kind}${rule.kind === "fvg" ? "" : ` ${rule.price}`}`,
      `Quote ${quote.price} from ${quote.source}; ${quote.timestampKind === "received" ? "received time (provider timestamp unavailable)" : "provider time"} ${new Date(quote.timestamp * 1000).toISOString()}`,
      `${strategy.name} v${strategy.version}; rule trigger, not calibrated style success.`,
    ];
    if (rule.kind === "fvg") {
      try {
        const key = `${rule.market}:${rule.timeframe}`;
        const bars =
          barCache.get(key) ||
          (await beforeDeadline(
            getCandles(rule.market, rule.timeframe, identity, deadline),
            deadline,
          ));
        barCache.set(key, bars);
        const candles = bars.candles.filter(
          (c) => c.time + SECONDS[rule.timeframe] <= Date.now() / 1000,
        );
        const candidate = gaps(candles).find(
          (g) => g.end >= candles.length - 2,
        );
        gap = Boolean(candidate);
        if (candidate)
          evidence.push(
            `Deterministic ${candidate.side} FVG ${candidate.low}–${candidate.high}; CE ${candidate.ce}; bars ${candles[candidate.start].time}–${candles[candidate.end].time}. Candidate requires confirmation.`,
          );
      } catch {
        defer(rule, "source-unavailable");
        continue;
      }
    }
    evaluated(rule);
    if (!alertPredicate(rule, quote.price, gap)) continue;
    const bucket = Math.floor(Date.now() / (rule.cooldownMinutes * 60000));
    const event: AlertEventWithNotification = {
      id: eventKey(userId, rule.id, bucket),
      ruleId: rule.id,
      market: rule.market,
      timeframe: rule.timeframe,
      strategyId: rule.strategyId,
      strategyVersion: strategy.version,
      evidence,
      providerTimestamp:
        quote.timestampKind === "received" ? undefined : quote.timestamp,
      title: `${rule.market} · ${rule.name}`,
      body: `${rule.kind === "fvg" ? "Recent FVG candidate" : `Price ${rule.kind} ${rule.price}`} at ${quote.price}. ${strategy.name} v${strategy.version}. Paper analysis only.`,
      createdAt: Date.now(),
      read: false,
      price: quote.price,
      source: quote.source,
      alertKind: rule.kind,
      delivery: "pending",
    };
    try {
      await db
        .insert(tradingAlertEvents)
        .values({ id: event.id, userId, ruleId: rule.id, payload: event });
      events.push(event);
    } catch (e) {
      if (
        (e as any).code !== "ER_DUP_ENTRY" &&
        (e as any).cause?.code !== "ER_DUP_ENTRY"
      )
        throw e;
    }
  }
  priorityScanCursors.set(
    userId,
    plan.totalPriorityMarkets
      ? (plan.priorityStartCursor + attemptedPriorityBroker.size) %
          plan.totalPriorityMarkets
      : 0,
  );
  scanCursors.set(
    userId,
    plan.totalNormalMarkets
      ? (plan.normalStartCursor + attemptedNormalBroker.size) %
          plan.totalNormalMarkets
      : 0,
  );
  let scanStatePersisted = false;
  if (loaded.workspace && loaded.revision > 0) {
    try {
      const persisted = await db
        .update(tradingWorkspaces)
        .set({ payload: workspace, revision: loaded.revision + 1 })
        .where(
          and(
            eq(tradingWorkspaces.userId, userId),
            eq(tradingWorkspaces.revision, loaded.revision),
          ),
        );
      scanStatePersisted = persisted[0]?.affectedRows === 1;
    } catch {
      // A concurrent owner save wins; the response still carries this scan's state.
    }
  }
  const paperUpdates = await managePaperTrades(
    identity!,
    deadline,
    new Set(plan.rules.map((r) => r.market)),
    quoteCache,
  );
  // Only explicit fresh assessments are checked. No inference from a no-op,
  // deferred budget or failed quote; mutations retain their separate list.
  const checkedTradeIds = [...new Set(paperUpdates.checkedIds)].slice(0, 200);
  await recordPaperProcessing(
    userId,
    origin,
    paperUpdates.trades
      .filter((trade) => trade.autoManage)
      .map((trade) => trade.id),
    checkedTradeIds,
  ).catch(() => {});
  await recoverExpiredDeliveryLeases(userId);
  const pending = await db
    .select()
    .from(tradingAlertEvents)
    .where(
      and(
        eq(tradingAlertEvents.userId, userId),
        eq(tradingAlertEvents.delivery, "pending"),
      ),
    )
    .limit(20);
  for (const row of pending) {
    if (Date.now() >= deadline - 2000) break;
    const event = row.payload as AlertEventWithNotification;
    const rule = workspace.alerts.find((item) => item.id === row.ruleId);
    await pushEvent(
      row,
      notificationDeliveryPreference(
        event.alertKind ?? rule?.kind,
        workspace.settings.notificationPreferences,
      ),
      deadline,
    );
  }
  if (Date.now() < deadline - 2000) await checkReceipts(userId, deadline);
  return {
    events,
    ruleStates: workspace.alerts.map((rule) => {
      return {
        id: rule.id,
        lastEvaluatedAt: rule.lastEvaluatedAt,
        deferredCount: rule.deferredCount || 0,
        deferReason: deferReasons.get(rule.id),
        priority: rule.priority || "normal",
      } satisfies AlertScanState & { id: string };
    }),
    message: `Bounded read-only scan completed. ${plan.deferredMarkets ? `${plan.deferredMarkets} broker markets deferred to rotating future scans within the 12-read budget (including account/catalog bootstrap reserve). ` : ""}${plan.deferredPriorityMarkets ? `${plan.deferredPriorityMarkets} high-priority broker markets exceeded that same finite budget and remain in their own visible rotation; no extra provider reads were made. ` : ""}${timedOut ? `${timedOut} rules deferred at scan deadline. ` : ""}${unavailable ? `${unavailable} rules deferred for unavailable/stale data. ` : ""}${scanStatePersisted ? "Rule evaluation state saved to the owner workspace. " : "Rule evaluation state is in this response only until a conflict-free cloud save. "}Expo/provider acceptance is not proof that a native device displayed, sounded, or badged an alert.`,
  };
}
export function scanAlerts(
  userId: number,
  origin: PaperProcessingOrigin = "foreground",
) {
  const pending = running.get(userId);
  if (pending) return pending;
  const p = scan(userId, origin).finally(() => running.delete(userId));
  running.set(userId, p);
  return p;
}

type OwnerLockResult<T> = { acquired: boolean; value?: T; reason?: string };

function lockScalar(value: unknown): unknown {
  if (Array.isArray(value)) return lockScalar(value[0]);
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    for (const key of ["acquired", "released", "GET_LOCK", "RELEASE_LOCK"])
      if (key in object) return lockScalar(object[key]);
    const first = Object.values(object)[0];
    if (first !== undefined) return lockScalar(first);
  }
  return value;
}

/** A single connection owns both GET_LOCK and RELEASE_LOCK for one activation. */
async function withOwnerScheduleActivationLock<T>(
  db: {
    transaction?: (
      work: (tx: any) => Promise<OwnerLockResult<T>>,
    ) => Promise<OwnerLockResult<T>>;
  },
  userId: number,
  work: (tx: any) => Promise<T>,
): Promise<OwnerLockResult<T>> {
  if (typeof db.transaction !== "function")
    return {
      acquired: false,
      reason:
        "The database driver cannot provide a transaction-bound activation lock.",
    };
  const name = `stratdesk:owneralerts:schedule:${userId}`;
  try {
    return await db.transaction(async (tx: any) => {
      if (typeof tx.execute !== "function")
        return {
          acquired: false,
          reason:
            "The database transaction cannot verify the owner activation lock.",
        };
      let acquired = false;
      try {
        const reply = await tx.execute(
          sql`SELECT GET_LOCK(${name}, ${SCHEDULE_LOCK_TIMEOUT_SECONDS}) AS acquired`,
        );
        acquired = Number(lockScalar(reply)) === 1;
        if (!acquired)
          return {
            acquired: false,
            reason:
              "Another device is already activating monitoring for this owner.",
          };
        return { acquired: true, value: await work(tx) };
      } finally {
        if (acquired) {
          try {
            await tx.execute(sql`SELECT RELEASE_LOCK(${name}) AS released`);
          } catch {
            // Connection close also releases a MySQL advisory lock; future activation stays fail-closed on lock errors.
          }
        }
      }
    });
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    return {
      acquired: false,
      reason:
        "The owner activation lock could not be verified; no remote task was created.",
    };
  }
}

export function ownerScheduleMapping<T extends { taskUid: string }>(rows: T[]) {
  if (rows.length === 0) return { state: "none" as const };
  if (rows.length !== 1) return { state: "ambiguous" as const };
  return { state: "one" as const, row: rows[0] };
}

export async function activateSchedule(userId: number, userSession: string) {
  if (!ENV.isProduction)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Closed-app monitoring needs a deployed backend containing this handler. Source/Preview is not deployment.",
    });
  const db = await dbRequired();
  const locked = await withOwnerScheduleActivationLock(
    db,
    userId,
    async (tx) => {
      const owner = (
        await tx.select().from(users).where(eq(users.id, userId)).limit(1)
      )[0];
      if (!mayUseApp(owner))
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Deployed monitoring is restricted to the approved owner.",
        });
      const mapping = ownerScheduleMapping(
        await tx
          .select()
          .from(tradingSchedules)
          .where(eq(tradingSchedules.userId, userId))
          .limit(2),
      );
      if (mapping.state === "ambiguous")
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Multiple local monitoring mappings exist for this owner. Monitoring remains blocked; no remote task was selected or created.",
        });
      if (mapping.state === "one") {
        const remote = await listHeartbeatJobs(userSession, {
          page: 1,
          pageSize: 100,
        });
        const task = remote.jobs.find(
          (candidate) =>
            candidate.taskUid === mapping.row.taskUid &&
            candidate.isEnable === true &&
            candidate.callbackPath === "/api/scheduled/trading-scan" &&
            candidate.callbackMethod === "POST",
        );
        if (!task)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "A local task mapping exists but the platform did not report this deployed callback as enabled. Monitoring was not claimed active; inspect the owner schedule before retrying.",
          });
        return {
          taskUid: task.taskUid,
          registered: true as const,
          callbackVerified: false as const,
          nextExecutionAt: task.nextExecutionAt ?? null,
          message:
            "The deployed platform task is enabled. It is not callback-verified until an authenticated scheduled pass is recorded.",
        };
      }
      const job = await createHeartbeatJob(
        {
          name: `stratdesk-user-${userId}`,
          cron: "0 * * * * *",
          path: "/api/scheduled/trading-scan",
          method: "POST",
          description:
            "Owner-authorized alerts plus separately bounded, explicitly armed simulated-session-paper checks; no broker orders. Checks each minute.",
        },
        userSession,
      );
      if (
        typeof job.taskUid !== "string" ||
        !job.taskUid ||
        job.taskUid.length > 128
      ) {
        try {
          await deleteHeartbeatJob(job.taskUid, userSession);
        } catch {
          // The invalid remote result is never represented as an active local mapping.
        }
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "The platform returned an invalid task identity. Monitoring was not registered locally.",
        });
      }
      try {
        await tx
          .insert(tradingSchedules)
          .values({ taskUid: job.taskUid, userId });
      } catch {
        try {
          await deleteHeartbeatJob(job.taskUid, userSession);
        } catch {
          // Do not create/select a second task after an uncertain compensation.
        }
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "The local monitoring mapping could not be committed. The newly created remote task was requested for removal; do not retry until the owner schedule is inspected.",
        });
      }
      return {
        ...job,
        registered: true as const,
        callbackVerified: false as const,
        message:
          "The platform accepted the deployed task registration. It is not callback-verified until an authenticated scheduled pass is recorded.",
      };
    },
  );
  if (!locked.acquired)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        locked.reason ||
        "Monitoring activation could not obtain the owner lock; no remote task was created.",
    });
  if (!locked.value)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Monitoring activation ended without a verified owner mapping.",
    });
  return locked.value;
}
export function parseSchedulerCredential(header: string) {
  return parseCookie(header).app_session_id;
}

/**
 * The callback body is intentionally absent from this boundary. A task UID is
 * usable only when the signed cron JWT and the platform JWT lookup agree on
 * its cron identity, project, and non-expired ticket.
 */
export function schedulerTaskUidFromJwtIdentity(
  payload: { appId?: unknown; exp?: unknown; openId?: unknown },
  identity: { taskUid?: unknown; openId?: unknown },
  appId = ENV.appId,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  if (
    payload.appId !== appId ||
    typeof payload.exp !== "number" ||
    !Number.isFinite(payload.exp) ||
    payload.exp <= nowSeconds ||
    typeof payload.openId !== "string" ||
    !payload.openId.startsWith("cron_") ||
    typeof identity.taskUid !== "string" ||
    !identity.taskUid ||
    identity.openId !== payload.openId
  )
    return undefined;
  return identity.taskUid;
}

export type ScheduledSessionAutoWork = {
  state: "blocked-work" | "deferred" | "duplicate-protected" | "paper-recorded";
  result: SessionAutoResult["state"];
  message: string;
};

/**
 * Scheduler responses describe completed/deferred work, not enablement. In
 * particular, no consent, missing source data, or a busy owner lock can never
 * turn a callback into a claim that automatic paper monitoring is activated.
 */
export function scheduledSessionAutoWork(
  result: SessionAutoResult,
): ScheduledSessionAutoWork {
  if (result.state === "placed")
    return {
      state: "paper-recorded",
      result: result.state,
      message: result.message,
    };
  if (result.state === "duplicate")
    return {
      state: "duplicate-protected",
      result: result.state,
      message: result.message,
    };
  if (result.state === "busy")
    return { state: "deferred", result: result.state, message: result.message };
  return {
    state: "blocked-work",
    result: result.state,
    message: result.message,
  };
}
export function registerTradingScheduler(app: Express) {
  app.post("/api/scheduled/trading-scan", async (req, res) => {
    try {
      // Platform-issued cron credential; intentionally distinct from the app's own session cookie.
      const token = parseSchedulerCredential(req.headers.cookie || "");
      if (!token || !ENV.cookieSecret)
        throw new Error("Missing scheduler identity.");
      const { payload } = await jwtVerify(
        token,
        new TextEncoder().encode(ENV.cookieSecret),
        { algorithms: ["HS256"] },
      );
      const identity = await sdk.getUserInfoWithJwt(token);
      const taskUid = schedulerTaskUidFromJwtIdentity(payload, identity);
      if (!taskUid) throw new Error("No authenticated task UID.");
      const db = await dbRequired();
      const binding = await db
        .select()
        .from(tradingSchedules)
        .where(eq(tradingSchedules.taskUid, taskUid))
        .limit(1);
      if (!binding[0]) {
        res
          .status(403)
          .json({ error: "Schedule is not bound to this trading workspace." });
        return;
      }
      const owner = (
        await db
          .select()
          .from(users)
          .where(eq(users.id, binding[0].userId))
          .limit(1)
      )[0];
      // taskUid maps to one canonical owner row. Never fall back to the
      // schedule body, an old user, or a different role/account.
      if (!mayUseApp(owner))
        throw new Error("Mapped scheduler owner is not approved.");
      const boundedWork = await withScheduledScanBudget(
        Date.now() + 45_000,
        async () => {
          let sessionAuto: ScheduledSessionAutoWork;
          try {
            // This checker re-reads canonical runWhenClosed consent, owner
            // strategy/gate state, and its own finite source budget before any
            // simulated-paper lifecycle call. It is deliberately awaited here;
            // no detached scheduled task or old ORB consent path is used.
            sessionAuto = scheduledSessionAutoWork(
              await checkSessionAutoPaper(
                owner,
                "scheduled",
                scheduledScanDeadline(),
              ),
            );
          } catch {
            sessionAuto = {
              state: "deferred",
              result: "waiting",
              message:
                "Session auto-paper work was deferred after its finite callback budget or source checks; no unattended follow-on was spawned.",
            };
          }
          const result = await scanAlerts(owner.id, "scheduled");
          return {
            result,
            sessionAuto,
            brokerRequests: scheduledBrokerReadsUsed(),
          };
        },
      );
      const { result, sessionAuto, brokerRequests } = boundedWork;
      await recordBackgroundStrategyHeartbeat(
        owner.id,
        binding[0].taskUid,
        result.events.length,
        sessionAuto.result,
      );
      void drainSourceJobs(binding[0].userId).catch(() => {});
      res.json({
        accepted: true,
        events: result.events.length,
        sessionAuto,
        brokerRequests,
        message: result.message,
      });
    } catch {
      res
        .status(401)
        .json({ error: "Authenticated scheduled scan could not complete." });
    }
  });
}

export async function getAlertEvent(userId: number, id: string) {
  const db = await dbRequired();
  const rows = await db
    .select()
    .from(tradingAlertEvents)
    .where(
      and(eq(tradingAlertEvents.userId, userId), eq(tradingAlertEvents.id, id)),
    )
    .limit(1);
  if (!rows[0])
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Alert evidence not found in your account.",
    });
  return { ...(rows[0].payload as AlertEvent), delivery: rows[0].delivery };
}
