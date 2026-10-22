import { and, eq } from "drizzle-orm";
import { tradingRuntimeState } from "../../drizzle/schema";
import { dbRequired } from "./repository";
import { ENV } from "../_core/env";
export type PaperProcessingOrigin = "foreground" | "scheduled";
export type PaperProcessingRecord = {
  lastCompletedAt: number;
  origin: PaperProcessingOrigin;
  updatedTradeIds: string[];
  checkedTradeIds: string[];
};

function boundedTradeIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter(
        (id): id is string =>
          typeof id === "string" && id.length > 0 && id.length <= 100,
      ),
    ),
  ].slice(0, 200);
}

export function verifiedPaperProcessing(
  record: unknown,
  tradeId?: string,
  now = Date.now(),
  published = ENV.isProduction,
) {
  const value = record as Partial<PaperProcessingRecord> | null;
  const scheduled = Boolean(
    published &&
    value?.origin === "scheduled" &&
    typeof value.lastCompletedAt === "number" &&
    value.lastCompletedAt <= now &&
    now - value.lastCompletedAt <= 180000,
  );
  const updatedTradeIds = boundedTradeIds(value?.updatedTradeIds);
  const checkedTradeIds = boundedTradeIds(value?.checkedTradeIds);
  const serverManaged = Boolean(
    scheduled && (!tradeId || updatedTradeIds.includes(tradeId)),
  );
  const serverChecked = Boolean(
    scheduled && (!tradeId || checkedTradeIds.includes(tradeId)),
  );
  return {
    serverManaged,
    serverChecked,
    lastCompletedAt:
      typeof value?.lastCompletedAt === "number" ? value.lastCompletedAt : null,
    message: serverManaged
      ? "Authenticated deployed worker updated this paper position at the shown time; venue-quote observations only."
      : serverChecked
        ? "Authenticated deployed worker checked this opted-in paper position at the shown time without changing its bracket. This is not proof of a device alert, fill, or broker action."
      : "Foreground only — no recent authenticated deployed update is verified for this position. Do not assume closed-app fills.",
  };
}
export async function recordPaperProcessing(
  userId: number,
  origin: PaperProcessingOrigin,
  tradeIds: string[],
  checkedTradeIds: string[] = [],
) {
  const db = await dbRequired(),
    record: PaperProcessingRecord = {
      lastCompletedAt: Date.now(),
      origin,
      updatedTradeIds: boundedTradeIds(tradeIds),
      checkedTradeIds: boundedTradeIds(checkedTradeIds),
    };
  const id = `paper-processing:${userId}:${origin}`;
  await db
    .insert(tradingRuntimeState)
    .values({ id, userId, kind: "paper-processing", payload: record })
    .onDuplicateKeyUpdate({ set: { payload: record, updatedAt: new Date() } });
}
export async function paperProcessingStatus(userId: number, tradeId?: string) {
  const db = await dbRequired(),
    rows = await db
      .select()
      .from(tradingRuntimeState)
      .where(
        and(
          eq(tradingRuntimeState.id, `paper-processing:${userId}:scheduled`),
          eq(tradingRuntimeState.userId, userId),
        ),
      )
      .limit(1);
  return verifiedPaperProcessing(rows[0]?.payload, tradeId);
}
