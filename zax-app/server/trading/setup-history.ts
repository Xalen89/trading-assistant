import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import {
  tradingMarketHistory,
  tradingSetupSnapshots,
  tradingPaperTrades,
  tradingPaperEvents,
} from "../../drizzle/schema";
import type { Candle, Trade, Timeframe } from "../../lib/trading/model";
import type { SetupAnalysis } from "../../lib/trading/setup-model";
import { dbRequired } from "./repository";
import { isSourceIdentity } from "./source-identity";
export function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
const capturedBatches = new Map<string, string>();

type RetainedBarPayload = {
  version: 2;
  candle: Candle;
  /** Human-readable provenance; the SQL discriminator remains opaque. */
  source: string;
  sourceIdentity: string;
};

function retainedPayload(
  value: unknown,
  sourceIdentity: string,
): Candle | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const payload = value as Partial<RetainedBarPayload>;
  if (
    payload.version !== 2 ||
    payload.sourceIdentity !== sourceIdentity ||
    typeof payload.source !== "string" ||
    payload.source.length === 0 ||
    payload.source.length > 2_000
  )
    return undefined;

  const candle = payload.candle;
  if (
    !candle ||
    ![
      candle.time,
      candle.open,
      candle.high,
      candle.low,
      candle.close,
      candle.volume,
    ].every(Number.isFinite) ||
    candle.time <= 0 ||
    candle.volume < 0 ||
    candle.high < candle.low ||
    candle.open < candle.low ||
    candle.open > candle.high ||
    candle.close < candle.low ||
    candle.close > candle.high
  )
    return undefined;
  return candle;
}

export async function retainBars(
  userId: number,
  market: string,
  timeframe: Timeframe,
  candles: Candle[],
  source: string,
  sourceIdentity: string,
) {
  if (!isSourceIdentity(sourceIdentity) || !source || source.length > 2_000)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Retained history requires an exact bounded source identity; unlabeled bars were not captured.",
    });
  const key = JSON.stringify([userId, market, timeframe, sourceIdentity]),
    signature = digest([source, sourceIdentity, candles]);
  if (capturedBatches.get(key) === signature) return;
  const db = await dbRequired();
  for (let i = 0; i < candles.length; i += 100) {
    const rows = candles.slice(i, i + 100).map((c) => ({
      id: digest([userId, market, timeframe, sourceIdentity, c.time]),
      userId,
      market,
      timeframe,
      barTime: String(c.time).padStart(16, "0"),
      payload: {
        version: 2 as const,
        candle: c,
        source,
        sourceIdentity,
      } satisfies RetainedBarPayload,
      // Existing schema has no identity column. This opaque discriminator makes
      // the indexed query exact without exposing account/route identifiers.
      source: sourceIdentity,
    }));
    if (rows.length)
      await db
        .insert(tradingMarketHistory)
        .values(rows)
        .onDuplicateKeyUpdate({
          set: {
            payload: sql`VALUES(payload)`,
            source: sql`VALUES(source)`,
          },
        });
  }
  capturedBatches.set(key, signature);
  if (capturedBatches.size > 200)
    capturedBatches.delete(capturedBatches.keys().next().value!);
}
export async function retainedBars(
  userId: number,
  market: string,
  timeframe: Timeframe,
  sourceIdentity: string,
) {
  if (!isSourceIdentity(sourceIdentity)) return [];
  const db = await dbRequired();
  const rows = await db
    .select()
    .from(tradingMarketHistory)
    .where(
      and(
        eq(tradingMarketHistory.userId, userId),
        eq(tradingMarketHistory.market, market),
        eq(tradingMarketHistory.timeframe, timeframe),
        eq(tradingMarketHistory.source, sourceIdentity),
      ),
    )
    .orderBy(desc(tradingMarketHistory.barTime))
    .limit(3000);
  return rows
    .map((row) => retainedPayload(row.payload, sourceIdentity))
    .filter((candle): candle is Candle => candle !== undefined)
    .sort((a, b) => a.time - b.time);
}
export async function retainSetup(userId: number, analysis: SetupAnalysis) {
  const db = await dbRequired();
  const selectionKey = digest([
    analysis.market,
    analysis.timeframe,
    analysis.selectedStrategyIds,
    analysis.combination,
  ]);
  const id =
    "setup_" +
    digest([
      userId,
      selectionKey,
      analysis.candles.at(-1)?.time,
      analysis.profile.bias,
      analysis.scenario?.id,
      analysis.candidates.map((c) => [c.id, c.strategyVersion, c.ready]),
    ]).slice(0, 64);
  await db
    .insert(tradingSetupSnapshots)
    .values({
      id,
      userId,
      market: analysis.market,
      timeframe: analysis.timeframe,
      selectionKey,
      payload: { ...analysis, candles: analysis.candles.slice(-80) },
    })
    .onDuplicateKeyUpdate({ set: { id } });
  return id;
}
export async function latestSetup(
  userId: number,
  market: string,
  timeframe: Timeframe,
  strategyIds: string[],
  combination: string,
) {
  const db = await dbRequired();
  const rows = await db
    .select()
    .from(tradingSetupSnapshots)
    .where(
      and(
        eq(tradingSetupSnapshots.userId, userId),
        eq(
          tradingSetupSnapshots.selectionKey,
          digest([market, timeframe, strategyIds, combination]),
        ),
      ),
    )
    .orderBy(desc(tradingSetupSnapshots.createdAt))
    .limit(1);
  return rows[0]?.payload as SetupAnalysis | undefined;
}
export async function writePaperTrade(
  userId: number,
  trade: Trade,
  expectedVersion?: number,
) {
  const db = await dbRequired(),
    id = `${userId}:${trade.id}`,
    version = trade.version || 1;
  await db.transaction(async (tx) => {
    if (expectedVersion === undefined) {
      await tx.insert(tradingPaperTrades).values({
        id,
        tradeId: trade.id,
        userId,
        version,
        status: trade.status,
        payload: trade,
        createdAt: new Date(Math.max(1000, trade.createdAt)),
      });
    } else {
      const result = await tx
        .update(tradingPaperTrades)
        .set({
          version,
          status: trade.status,
          payload: trade,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(tradingPaperTrades.id, id),
            eq(tradingPaperTrades.userId, userId),
            eq(tradingPaperTrades.version, expectedVersion),
          ),
        );
      if (result[0].affectedRows !== 1)
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Paper trade changed elsewhere. Refresh before editing; history was not overwritten.",
        });
    }
    await tx.insert(tradingPaperEvents).values({
      id: `${id}:v${version}`,
      userId,
      tradeId: trade.id,
      version,
      payload: trade,
    });
  });
  return trade;
}
export async function paperTrade(userId: number, id: string) {
  const db = await dbRequired();
  const rows = await db
    .select()
    .from(tradingPaperTrades)
    .where(
      and(
        eq(tradingPaperTrades.userId, userId),
        eq(tradingPaperTrades.tradeId, id),
      ),
    )
    .limit(1);
  if (!rows[0])
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Paper trade not found in your account.",
    });
  return rows[0].payload as Trade;
}
export async function paperHistory(
  userId: number,
  status?: string,
  before?: string,
  limit = 50,
) {
  const db = await dbRequired();
  const clauses = [
    eq(tradingPaperTrades.userId, userId),
    ...(status ? [eq(tradingPaperTrades.status, status)] : []),
  ];
  if (before) {
    const cursor = (
      await db
        .select()
        .from(tradingPaperTrades)
        .where(
          and(
            eq(tradingPaperTrades.userId, userId),
            eq(tradingPaperTrades.id, before),
          ),
        )
        .limit(1)
    )[0];
    if (!cursor)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "History cursor is not valid for this account.",
      });
    clauses.push(
      or(
        lt(tradingPaperTrades.createdAt, cursor.createdAt),
        and(
          eq(tradingPaperTrades.createdAt, cursor.createdAt),
          lt(tradingPaperTrades.id, cursor.id),
        ),
      )!,
    );
  }
  const size = Math.min(100, limit),
    rows = await db
      .select()
      .from(tradingPaperTrades)
      .where(and(...clauses))
      .orderBy(desc(tradingPaperTrades.createdAt), desc(tradingPaperTrades.id))
      .limit(size + 1);
  return {
    trades: rows.slice(0, size).map((r) => r.payload as Trade),
    nextCursor: rows.length > size ? rows[size - 1].id : undefined,
  };
}
export async function activePaperTrades(userId: number) {
  const db = await dbRequired();
  const rows = await db
    .select()
    .from(tradingPaperTrades)
    .where(
      and(
        eq(tradingPaperTrades.userId, userId),
        inArray(tradingPaperTrades.status, ["pending", "open"]),
      ),
    )
    .limit(100);
  return rows.map((r) => r.payload as Trade);
}
export async function paperRevisions(userId: number, id: string) {
  const db = await dbRequired();
  return (
    await db
      .select()
      .from(tradingPaperEvents)
      .where(
        and(
          eq(tradingPaperEvents.userId, userId),
          eq(tradingPaperEvents.tradeId, id),
        ),
      )
      .orderBy(desc(tradingPaperEvents.version))
      .limit(100)
  ).map((r) => r.payload as Trade);
}
