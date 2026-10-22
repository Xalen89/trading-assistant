import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { tradingResearchJobs, users } from "../../drizzle/schema";
import {
  DEFAULT_BACKTEST,
  type BacktestReport,
  type ResearchStart,
  type ResearchJob,
} from "../../lib/trading/research";
import { SECONDS, validateCandles } from "../../lib/trading/engine";
import { uid } from "../../lib/trading/model";
import type { User } from "../../drizzle/schema";
import { dbRequired } from "./repository";
import { getCandles } from "./market";
import { runPython } from "./python";
import { discuss } from "./discussion";
import { strategySchema, symbol, timeframe, tradeSchema } from "./validation";
import {
  orderBookInputSchema,
  orderBookReportSchema,
} from "./orderbook-validation";
const candle = z.object({
  time: z.number().positive().finite(),
  open: z.number().positive().finite(),
  high: z.number().positive().finite(),
  low: z.number().positive().finite(),
  close: z.number().positive().finite(),
  volume: z.number().nonnegative().finite(),
});
export const backtestSpecSchema = z
  .object({
    model: z.enum(["ma-cross", "fvg"]),
    side: z.enum(["long", "short"]),
    fast: z.array(z.number().int().min(2).max(100)).min(1).max(6),
    slow: z.array(z.number().int().min(3).max(250)).min(1).max(6),
    holdBars: z.number().int().min(1).max(100),
    trainingBars: z.number().int().min(60).max(4000),
    testBars: z.number().int().min(20).max(1000),
    feesBps: z.number().min(0).max(100),
    slippageBps: z.number().min(0).max(100),
    initialEquity: z.number().positive().max(1e9),
  })
  .refine(
    (s) => s.fast.length * s.slow.length <= 24,
    "Parameter grid is limited to24pairs",
  );
export const researchStartSchema: z.ZodType<ResearchStart> = z
  .object({
    kind: z.enum(["backtest", "discussion", "orderbook"]),
    market: symbol,
    timeframe,
    strategy: strategySchema,
    confirmations: z.record(z.string().max(200), z.boolean()),
    weeklyBias: z.enum(["Bullish", "Bearish", "Neutral"]),
    trades: z.array(tradeSchema).max(2000),
    startingBalance: z.number().positive().finite(),
    dailyDrawdownLimitPct: z.number().positive().max(100).optional(),
    spec: backtestSpecSchema.optional(),
    series: z
      .array(
        z.object({
          symbol: z.string().min(1).max(100),
          timeframe,
          source: z.string().max(250),
          candles: z.array(candle).min(80).max(5000),
        }),
      )
      .min(1)
      .max(2)
      .optional(),
    book: orderBookInputSchema.optional(),
  })
  .refine(
    (v) =>
      Buffer.byteLength(JSON.stringify(v), "utf8") <
      (v.kind === "orderbook" ? 9 * 1024 * 1024 : 2000000),
    "Research request too large",
  )
  .refine(
    (v) => (v.kind === "orderbook" ? Boolean(v.book) && !v.series : !v.book),
    "Orderbook research requires its own real rights-confirmed depth data, not OHLC.",
  );
let running = 0;
async function execute(user: User, id: string, input: ResearchStart) {
  try {
    const db = await dbRequired();
    const claim = await db
      .update(tradingResearchJobs)
      .set({ status: "running", updatedAt: new Date() })
      .where(
        and(
          eq(tradingResearchJobs.id, id),
          eq(tradingResearchJobs.userId, user.id),
          eq(tradingResearchJobs.status, "queued"),
        ),
      );
    if (claim[0].affectedRows !== 1) return;
    try {
      let result: ResearchJob["result"];
      if (input.kind === "orderbook") {
        if (!input.book)
          throw new Error("No actual top3 orderbook input was provided.");
        result = orderBookReportSchema.parse(
          await runPython("orderbook_research", input.book, 60000),
        );
      } else {
        let series = input.series?.map((s) => ({
          ...s,
          source: "User-supplied historical OHLC: " + s.source,
          candles: validateCandles(s.candles),
        }));
        if (input.kind === "discussion" || !series) {
          const feed = await getCandles(input.market, input.timeframe, user);
          const now = Date.now() / 1000;
          series = [
            {
              symbol: input.market,
              timeframe: input.timeframe,
              source: feed.source,
              candles: feed.candles.filter(
                (c) => c.time + SECONDS[input.timeframe] <= now,
              ),
            },
          ];
        }
        if (
          series.some((s) =>
            s.candles.some(
              (c) => c.time + SECONDS[s.timeframe] > Date.now() / 1000,
            ),
          )
        )
          throw new Error(
            "Incomplete/future candles cannot enter historical research.",
          );
        await db
          .update(tradingResearchJobs)
          .set({ request: { ...input, series } })
          .where(
            and(
              eq(tradingResearchJobs.id, id),
              eq(tradingResearchJobs.userId, user.id),
              eq(tradingResearchJobs.status, "running"),
            ),
          );
        result =
          input.kind === "discussion"
            ? await discuss(input, series[0].candles, series[0].source)
            : await runPython<BacktestReport>(
                "research_engine",
                { series, spec: input.spec || DEFAULT_BACKTEST },
                60000,
              );
      }
      if (!result || result.probability !== null)
        throw new Error("Uncalibrated probability output rejected.");
      await db
        .update(tradingResearchJobs)
        .set({ status: "succeeded", result, updatedAt: new Date() })
        .where(
          and(
            eq(tradingResearchJobs.id, id),
            eq(tradingResearchJobs.userId, user.id),
            eq(tradingResearchJobs.status, "running"),
          ),
        );
    } catch (e) {
      await db
        .update(tradingResearchJobs)
        .set({
          status: "failed",
          error:
            e instanceof Error
              ? e.message.slice(0, 1000)
              : "Research failed; no result accepted.",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(tradingResearchJobs.id, id),
            eq(tradingResearchJobs.userId, user.id),
            eq(tradingResearchJobs.status, "running"),
          ),
        );
    }
  } finally {
    running--;
  }
}
export async function startResearch(user: User, input: ResearchStart) {
  const db = await dbRequired(),
    id = uid("research");
  if (running >= 4)
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Research capacity reached; wait for current jobs.",
    });
  running++;
  try {
    await db.transaction(async (tx) => {
      await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, user.id))
        .for("update");
      const active = await tx
        .select()
        .from(tradingResearchJobs)
        .where(
          and(
            eq(tradingResearchJobs.userId, user.id),
            inArray(tradingResearchJobs.status, ["queued", "running"]),
          ),
        )
        .limit(1);
      if (active.length)
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "You already have an active research job. View it before starting another.",
        });
      await tx.insert(tradingResearchJobs).values({
        id,
        userId: user.id,
        kind: input.kind,
        status: "queued",
        request: input,
      });
    });
    void execute(user, id, input).catch(() => {
      /* Persisted queued job becomes visibly interrupted on lookup. */
    });
    return { id };
  } catch (e) {
    running--;
    throw e;
  }
}
export async function researchJob(
  userId: number,
  id?: string,
): Promise<ResearchJob | null> {
  const db = await dbRequired();
  const rows = await db
      .select()
      .from(tradingResearchJobs)
      .where(
        and(
          eq(tradingResearchJobs.userId, userId),
          inArray(tradingResearchJobs.kind, ["backtest", "discussion", "orderbook"]),
          id ? eq(tradingResearchJobs.id, id) : undefined,
        ),
      )
      .orderBy(desc(tradingResearchJobs.createdAt))
      .limit(1),
    row = rows[0];
  if (!row) return null;
  if (
    ["queued", "running"].includes(row.status) &&
    Date.now() - row.updatedAt.getTime() > 600000
  ) {
    await db
      .update(tradingResearchJobs)
      .set({
        status: "failed",
        error:
          "Analysis interrupted or expired. Start a new job explicitly; no model work was automatically retried.",
      })
      .where(
        and(
          eq(tradingResearchJobs.id, row.id),
          eq(tradingResearchJobs.userId, userId),
          eq(tradingResearchJobs.status, row.status),
        ),
      );
    row.status = "failed";
    row.error = "Analysis interrupted or expired. Start a new job explicitly.";
  }
  const input = row.request as ResearchStart;
  return {
    id: row.id,
    kind: row.kind as ResearchJob["kind"],
    status: row.status as ResearchJob["status"],
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
    market: input.market,
    timeframe: input.timeframe,
    strategy: {
      id: input.strategy.id,
      name: input.strategy.name,
      version: input.strategy.version,
    },
    error: row.error || undefined,
    result: row.result as ResearchJob["result"],
  };
}
