import { and, eq } from "drizzle-orm";
import {
  tradingDevices,
  tradingRuntimeState,
  tradingSchedules,
} from "../../drizzle/schema";
import { ENV } from "../_core/env";
import { dbRequired } from "./repository";

const HEARTBEAT_KIND = "strategy-background-heartbeat";
const heartbeatId = (userId: number) => `${HEARTBEAT_KIND}:${userId}`;

type ScheduledHeartbeatPayload = {
  taskUid: string;
  lastScheduledHeartbeat: number;
  eventCount: number;
  sessionAutoState?: string;
};

export type BackgroundStrategyStatus = {
  isProduction: boolean;
  registeredTask: string | null;
  schedulerRegistered: boolean;
  lastScheduledHeartbeat: number | null;
  callbackRecent: boolean;
  devicePushRegistered: boolean;
  deviceVerified: false;
  message: string;
};

function timestamp(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= Date.now()
    ? value
    : null;
}

/**
 * A heartbeat only means this mapped owner's authenticated callback completed.
 * It deliberately says nothing about a native device display, sound, badge, or
 * an unverified paper signal/order.
 */
export async function recordBackgroundStrategyHeartbeat(
  userId: number,
  taskUid: string,
  eventCount: number,
  sessionAutoState?: string,
) {
  const db = await dbRequired();
  const payload: ScheduledHeartbeatPayload = {
    taskUid,
    lastScheduledHeartbeat: Date.now(),
    eventCount: Math.max(0, Math.min(1000, Math.floor(eventCount) || 0)),
    ...(typeof sessionAutoState === "string"
      ? { sessionAutoState: sessionAutoState.slice(0, 32) }
      : {}),
  };
  await db
    .insert(tradingRuntimeState)
    .values({
      id: heartbeatId(userId),
      userId,
      kind: HEARTBEAT_KIND,
      payload,
    })
    .onDuplicateKeyUpdate({ set: { payload, updatedAt: new Date() } });
  return payload;
}

export function backgroundStrategyStatusFromRows(input: {
  taskUid?: string | null;
  heartbeat?: unknown;
  devicePushRegistered?: boolean;
}): BackgroundStrategyStatus {
  const heartbeat =
    input.heartbeat as Partial<ScheduledHeartbeatPayload> | null;
  const mappedTask =
    typeof input.taskUid === "string" && input.taskUid.trim()
      ? input.taskUid
      : null;
  const lastScheduledHeartbeat =
    mappedTask && heartbeat?.taskUid === mappedTask
      ? timestamp(heartbeat.lastScheduledHeartbeat)
      : null;
  const devicePushRegistered = input.devicePushRegistered === true;
  const schedulerRegistered = Boolean(mappedTask);
  return {
    isProduction: ENV.isProduction,
    registeredTask: mappedTask,
    schedulerRegistered,
    lastScheduledHeartbeat,
    callbackRecent:
      lastScheduledHeartbeat !== null &&
      Date.now() - lastScheduledHeartbeat <= 3 * 60 * 1000,
    devicePushRegistered,
    deviceVerified: false,
    message: !ENV.isProduction
      ? "Closed-app monitoring is unavailable until this private backend is published. Source/Preview is not deployment."
      : !schedulerRegistered
        ? "No mapped deployed monitoring task is registered for this owner."
        : !lastScheduledHeartbeat
          ? "The platform task is mapped, but no authenticated scheduled callback has completed yet."
          : !devicePushRegistered
            ? "An authenticated scheduled callback completed, but no native push device is registered."
            : "Monitoring task and device registration are recorded. Native device delivery remains unverified until a real alert is received.",
  };
}

/** Reads only rows owned by the authenticated application user selected by the router. */
export async function backgroundStrategyStatus(userId: number) {
  const db = await dbRequired();
  const [schedule, heartbeat, device] = await Promise.all([
    db
      .select({ taskUid: tradingSchedules.taskUid })
      .from(tradingSchedules)
      .where(eq(tradingSchedules.userId, userId))
      .limit(1),
    db
      .select({ payload: tradingRuntimeState.payload })
      .from(tradingRuntimeState)
      .where(
        and(
          eq(tradingRuntimeState.id, heartbeatId(userId)),
          eq(tradingRuntimeState.userId, userId),
          eq(tradingRuntimeState.kind, HEARTBEAT_KIND),
        ),
      )
      .limit(1),
    db
      .select({ id: tradingDevices.id })
      .from(tradingDevices)
      .where(eq(tradingDevices.userId, userId))
      .limit(1),
  ]);
  return backgroundStrategyStatusFromRows({
    taskUid: schedule[0]?.taskUid,
    heartbeat: heartbeat[0]?.payload,
    devicePushRegistered: Boolean(device[0]),
  });
}
