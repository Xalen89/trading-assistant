import { and, eq, lt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import {
  tradingRuntimeState,
  tradingWorkspaces,
  users,
} from "../../drizzle/schema";
import { dbRequired } from "./repository";

export type AppQuotaScope = "coach" | "source-analysis" | "forecast";
export type AppQuotaInfo = {
  scope: AppQuotaScope;
  limit: number;
  used: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};
export type AppQuotaReservation = Readonly<{
  token: string;
  bucketId: string;
  userId: number;
  scope: AppQuotaScope;
  cost: number;
  reservedAt: number;
}>;
export type AppQuotaReservationResult = Readonly<{
  quota: AppQuotaInfo;
  reservation: AppQuotaReservation;
}>;
const POLICIES: Record<AppQuotaScope, { limit: number; windowMs: number }> = {
  coach: { limit: 30, windowMs: 600_000 },
  "source-analysis": { limit: 20, windowMs: 600_000 },
  forecast: { limit: 20, windowMs: 600_000 },
};
// Terminal releases do not reset the independent request-attempt ceiling.
const REQUEST_ATTEMPT_LIMIT = 60;
export class AppQuotaExceeded extends Error {
  constructor(public readonly quota: AppQuotaInfo) {
    super(
      `Analysis limit reached. Retry in ${quota.retryAfterSeconds} seconds (resets ${new Date(quota.resetAt).toISOString()}).`,
    );
    this.name = "AppQuotaExceeded";
  }
}
function boundedLimit(scope: AppQuotaScope, override?: number) {
  return Number.isInteger(override) && override! >= 1 && override! <= 60
    ? override!
    : POLICIES[scope].limit;
}
export function quotaInfo(
  scope: AppQuotaScope,
  used: number,
  now = Date.now(),
  limitOverride?: number,
): AppQuotaInfo {
  const policy = POLICIES[scope],
    limit = boundedLimit(scope, limitOverride);
  const resetAt = (Math.floor(now / policy.windowMs) + 1) * policy.windowMs;
  const count = Number.isSafeInteger(used) && used >= 0 ? used : limit;
  return {
    scope,
    limit,
    used: count,
    remaining: Math.max(0, limit - count),
    resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
  };
}
export function nextQuota(
  scope: AppQuotaScope,
  used: number,
  cost: number,
  now = Date.now(),
  limitOverride?: number,
) {
  const limit = boundedLimit(scope, limitOverride);
  if (!Number.isSafeInteger(cost) || cost <= 0 || cost > limit)
    throw new Error("Invalid analysis quota cost.");
  const current = quotaInfo(scope, used, now, limit);
  if (used + cost > current.limit) throw new AppQuotaExceeded(current);
  return quotaInfo(scope, used + cost, now, limit);
}
function key(userId: number, scope: AppQuotaScope, now: number) {
  if (!Number.isSafeInteger(userId) || userId <= 0)
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Verified owner required.",
    });
  return `quota:${userId}:${scope}:${Math.floor(now / POLICIES[scope].windowMs)}`;
}
function configuredLimit(payload: unknown, scope: AppQuotaScope) {
  const settings = (
    payload as
      | { settings?: { aiRateLimits?: Partial<Record<AppQuotaScope, number>> } }
      | undefined
  )?.settings;
  return boundedLimit(scope, settings?.aiRateLimits?.[scope]);
}

function storedReservations(payload: unknown): Record<string, number> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return {};
  const candidate = (payload as { reservations?: unknown }).reservations;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
    return {};
  return Object.fromEntries(
    Object.entries(candidate).filter(
      ([token, cost]) =>
        token.length > 0 &&
        token.length <= 128 &&
        Number.isSafeInteger(cost) &&
        cost > 0 &&
        cost <= 60,
    ),
  );
}

function quotaError(error: unknown): never {
  if (error instanceof AppQuotaExceeded)
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: error.message,
      cause: error,
    });
  throw error;
}
/** Uses the authenticated owner's existing account lock to serialize a new or existing bucket. */
export async function consumeAppQuota(
  userId: number,
  scope: AppQuotaScope,
  cost = 1,
  now = Date.now(),
): Promise<AppQuotaInfo> {
  const id = key(userId, scope, now),
    db = await dbRequired();
  try {
    return await db.transaction(async (tx) => {
      const owner = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, userId))
        .for("update");
      if (!owner.length)
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Owner account not found.",
        });
      const workspaces = await tx
        .select({ payload: tradingWorkspaces.payload })
        .from(tradingWorkspaces)
        .where(eq(tradingWorkspaces.userId, userId))
        .limit(1);
      const rows = await tx
        .select()
        .from(tradingRuntimeState)
        .where(
          and(
            eq(tradingRuntimeState.id, id),
            eq(tradingRuntimeState.userId, userId),
          ),
        )
        .limit(1);
      const payload = rows[0]?.payload as { used?: number } | undefined;
      const info = nextQuota(
        scope,
        payload?.used ?? 0,
        cost,
        now,
        configuredLimit(workspaces[0]?.payload, scope),
      );
      if (rows.length)
        await tx
          .update(tradingRuntimeState)
          .set({ payload: info, updatedAt: new Date(now) })
          .where(
            and(
              eq(tradingRuntimeState.id, id),
              eq(tradingRuntimeState.userId, userId),
            ),
          );
      else
        await tx.insert(tradingRuntimeState).values({
          id,
          userId,
          kind: "quota",
          payload: info,
          updatedAt: new Date(now),
        });
      await tx
        .delete(tradingRuntimeState)
        .where(
          and(
            eq(tradingRuntimeState.userId, userId),
            eq(tradingRuntimeState.kind, "quota"),
            lt(tradingRuntimeState.updatedAt, new Date(now - 86_400_000)),
          ),
        );
      return info;
    });
  } catch (error) {
    quotaError(error);
  }
}

/**
 * Reserves one bounded request under the authenticated owner's existing lock.
 * The opaque token is server-only and can be released exactly once when a
 * terminal catalog/completion failure produced no usable AI output.
 */
export async function reserveAppQuota(
  userId: number,
  scope: AppQuotaScope,
  cost = 1,
  now = Date.now(),
): Promise<AppQuotaReservationResult> {
  const bucketId = key(userId, scope, now);
  const token = randomUUID();
  const db = await dbRequired();
  try {
    return await db.transaction(async (tx) => {
      const owner = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, userId))
        .for("update");
      if (!owner.length)
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Owner account not found.",
        });
      const workspaces = await tx
        .select({ payload: tradingWorkspaces.payload })
        .from(tradingWorkspaces)
        .where(eq(tradingWorkspaces.userId, userId))
        .limit(1);
      const rows = await tx
        .select()
        .from(tradingRuntimeState)
        .where(
          and(
            eq(tradingRuntimeState.id, bucketId),
            eq(tradingRuntimeState.userId, userId),
          ),
        )
        .limit(1);
      const payload = rows[0]?.payload as
        | { used?: number; attempts?: number }
        | undefined;
      const info = nextQuota(
        scope,
        payload?.used ?? 0,
        cost,
        now,
        configuredLimit(workspaces[0]?.payload, scope),
      );
      const reservations = storedReservations(payload);
      const attempts = nextQuota(
        scope,
        payload?.attempts ?? payload?.used ?? 0,
        1,
        now,
        REQUEST_ATTEMPT_LIMIT,
      ).used;
      reservations[token] = cost;
      const nextPayload = { ...info, attempts, reservations };
      if (rows.length)
        await tx
          .update(tradingRuntimeState)
          .set({ payload: nextPayload, updatedAt: new Date(now) })
          .where(
            and(
              eq(tradingRuntimeState.id, bucketId),
              eq(tradingRuntimeState.userId, userId),
            ),
          );
      else
        await tx.insert(tradingRuntimeState).values({
          id: bucketId,
          userId,
          kind: "quota",
          payload: nextPayload,
          updatedAt: new Date(now),
        });
      await tx
        .delete(tradingRuntimeState)
        .where(
          and(
            eq(tradingRuntimeState.userId, userId),
            eq(tradingRuntimeState.kind, "quota"),
            lt(tradingRuntimeState.updatedAt, new Date(now - 86_400_000)),
          ),
        );
      return {
        quota: info,
        reservation: { token, bucketId, userId, scope, cost, reservedAt: now },
      };
    });
  } catch (error) {
    quotaError(error);
  }
}

/**
 * Releases only the matching in-window reservation while holding the same
 * owner lock. Missing tokens are already settled and therefore cannot alter
 * another concurrent request's quota.
 */
export async function releaseAppQuotaReservation(
  reservation: AppQuotaReservation,
): Promise<boolean> {
  if (
    !Number.isSafeInteger(reservation.userId) ||
    reservation.userId <= 0 ||
    !Number.isSafeInteger(reservation.cost) ||
    reservation.cost <= 0 ||
    !Number.isSafeInteger(reservation.reservedAt) ||
    reservation.reservedAt <= 0 ||
    !reservation.token ||
    reservation.token.length > 128 ||
    key(reservation.userId, reservation.scope, reservation.reservedAt) !==
      reservation.bucketId
  )
    return false;
  const db = await dbRequired();
  return db.transaction(async (tx) => {
    const owner = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, reservation.userId))
      .for("update");
    if (!owner.length) return false;
    const workspaces = await tx
      .select({ payload: tradingWorkspaces.payload })
      .from(tradingWorkspaces)
      .where(eq(tradingWorkspaces.userId, reservation.userId))
      .limit(1);
    const rows = await tx
      .select()
      .from(tradingRuntimeState)
      .where(
        and(
          eq(tradingRuntimeState.id, reservation.bucketId),
          eq(tradingRuntimeState.userId, reservation.userId),
        ),
      )
      .limit(1);
    const payload = rows[0]?.payload as
      | { used?: number; attempts?: number }
      | undefined;
    if (!rows.length) return false;
    const reservations = storedReservations(payload);
    const cost = reservations[reservation.token];
    if (cost !== reservation.cost) return false;
    delete reservations[reservation.token];
    const limit = configuredLimit(workspaces[0]?.payload, reservation.scope);
    const used = quotaInfo(
      reservation.scope,
      payload?.used ?? limit,
      reservation.reservedAt,
      limit,
    ).used;
    const info = quotaInfo(
      reservation.scope,
      Math.max(0, used - cost),
      reservation.reservedAt,
      limit,
    );
    await tx
      .update(tradingRuntimeState)
      .set({
        payload: {
          ...info,
          attempts: payload?.attempts ?? used,
          ...(Object.keys(reservations).length ? { reservations } : {}),
        },
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tradingRuntimeState.id, reservation.bucketId),
          eq(tradingRuntimeState.userId, reservation.userId),
        ),
      );
    return true;
  });
}

export async function peekAppQuota(
  userId: number,
  scope: AppQuotaScope,
  now = Date.now(),
) {
  const id = key(userId, scope, now),
    db = await dbRequired();
  const [rows, workspaces] = await Promise.all([
    db
      .select()
      .from(tradingRuntimeState)
      .where(
        and(
          eq(tradingRuntimeState.id, id),
          eq(tradingRuntimeState.userId, userId),
        ),
      )
      .limit(1),
    db
      .select({ payload: tradingWorkspaces.payload })
      .from(tradingWorkspaces)
      .where(eq(tradingWorkspaces.userId, userId))
      .limit(1),
  ]);
  return quotaInfo(
    scope,
    (rows[0]?.payload as { used?: number } | undefined)?.used ?? 0,
    now,
    configuredLimit(workspaces[0]?.payload, scope),
  );
}
