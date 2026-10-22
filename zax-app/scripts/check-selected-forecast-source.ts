import { eq } from "drizzle-orm";
import { getDb, getUserByOpenId } from "../server/db";
import { ENV } from "../server/_core/env";
import { tradingWorkspaces, users } from "../drizzle/schema";
import { mayUseApp } from "../server/trading/access";
import type { Workspace } from "../lib/trading/model";
import { retryCandles, retryQuote } from "../server/trading/market";
import { prepareForecastSource } from "../server/trading/forecast-source";
import { generateAIPriceForecast } from "../server/trading/forecast-service";

// Read-only diagnosis for the authorized configured owner. No loadWorkspace recovery,
// quota charge, source mutation, trade mutation, or credential output.
// Only --generate-auto permits one explicit bounded real-AI call; its result is not saved.
async function main() {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const ownerEmail = process.env.TRADELOCKER_OWNER_EMAIL?.trim().toLowerCase();
  const candidates = ENV.ownerOpenId
    ? [await getUserByOpenId(ENV.ownerOpenId)].filter(Boolean)
    : ownerEmail
      ? await db
          .select()
          .from(users)
          .where(eq(users.email, ownerEmail))
          .limit(2)
      : [];
  const user = candidates.length === 1 ? candidates[0] : undefined;
  if (!user || !mayUseApp(user))
    throw new Error("Unique authorized canonical owner is unavailable.");
  const rows = await db
    .select({ payload: tradingWorkspaces.payload })
    .from(tradingWorkspaces)
    .where(eq(tradingWorkspaces.userId, user.id))
    .limit(1);
  if (!rows[0])
    throw new Error(
      "No saved owner selection; do not guess the phone's instrument.",
    );
  const workspace = rows[0].payload as Workspace;
  if (workspace.settings.sampleMode)
    throw new Error("Sample mode is not real forecast evidence.");
  const deadline = Date.now() + 20_000;
  const [feed, quote] = await Promise.all([
    retryCandles(workspace.market, workspace.timeframe, user, deadline),
    retryQuote(workspace.market, user, deadline),
  ]);
  const last = feed.candles.at(-1);
  console.log(
    JSON.stringify(
      {
        at: new Date().toISOString(),
        selectedMarket: workspace.market,
        selectedTimeframe: workspace.timeframe,
        sampleMode: workspace.settings.sampleMode,
        candleCount: feed.candles.length,
        source: feed.source,
        lastBarOpen: last ? new Date(last.time * 1_000).toISOString() : null,
        lastClose: last?.close,
        quoteStatus: quote.status,
        quoteAt:
          quote.timestamp > 0
            ? new Date(quote.timestamp * 1_000).toISOString()
            : null,
        quotePrice: quote.price,
        quoteSource: quote.source,
      },
      null,
      2,
    ),
  );
  try {
    const prepared = prepareForecastSource({
      market: workspace.market,
      timeframe: workspace.timeframe,
      feed,
      quote,
    });
    console.log("Current source check:", prepared.sourceFreshness.status);
  } catch (error) {
    console.log(
      "Current source check:",
      error instanceof Error ? error.message : "Unavailable",
    );
  }
  const sourceInput = {
    market: workspace.market,
    timeframe: workspace.timeframe,
    feed,
    quote,
    contextMode: "auto" as const,
  };
  const automatic = prepareForecastSource(sourceInput);
  console.log(
    "Auto source check:",
    automatic.contextMode,
    automatic.sourceFreshness.status,
  );
  if (process.argv.includes("--generate-auto")) {
    const forecast = await generateAIPriceForecast({
      ...sourceInput,
      strategy: workspace.strategies.find(
        (s) => s.id === workspace.activeStrategyId,
      ),
      deadline: Date.now() + 48_000,
    });
    if (
      forecast.candles.length !== 12 ||
      forecast.probability !== null ||
      forecast.requestedContextMode !== "auto"
    )
      throw new Error("Auto forecast output contract failed.");
    if (
      automatic.contextMode === "last-available" &&
      (forecast.contextMode !== "last-available" ||
        !forecast.contextResolutionReason)
    )
      throw new Error("Old context was not explicitly disclosed.");
    console.log(
      "REAL AUTO GENERATION",
      JSON.stringify({
        market: forecast.market,
        timeframe: forecast.timeframe,
        source: forecast.source,
        requestedMode: forecast.requestedContextMode,
        resolvedMode: forecast.contextMode,
        sourceStatus: forecast.sourceFreshness?.status,
        sourceClosedAt: forecast.sourceFreshness?.closedAt,
        steps: forecast.candles.length,
        probability: forecast.probability,
        model: forecast.model,
        generatedAt: new Date(forecast.generatedAt).toISOString(),
      }),
    );
  }
}
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Source diagnosis failed.",
    );
    process.exit(1);
  });
