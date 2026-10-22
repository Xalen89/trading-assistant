import { eq } from "drizzle-orm";
import { mkdir, writeFile } from "node:fs/promises";
import { users } from "../drizzle/schema";
import { getDb } from "../server/db";
import { brokerCatalog, brokerOwner } from "../server/trading/tradelocker";
import { getCandles } from "../server/trading/market";
import { SETUP_PRESETS } from "../lib/trading/setup-presets";
import { analyzeSetups } from "../lib/trading/setup-engine";
import { WR1 } from "../lib/trading/model";
import {
  strategyIndicatorLayers,
  attachedIndicatorNames,
} from "../lib/trading/strategy-indicators";
import {
  observeScenarioDirection,
  scenarioDirectionContext,
} from "../lib/trading/scenario-direction";

async function main() {
  const db = await getDb();
  if (!db)
    throw new Error(
      "Owner lookup unavailable; no private data request attempted.",
    );
  try {
    const email = process.env.TRADELOCKER_OWNER_EMAIL?.trim();
    if (!email) throw new Error("Approved owner identity unavailable.");
    const owners = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(2);
    if (owners.length !== 1 || !brokerOwner(owners[0]))
      throw new Error(
        "Unique existing authorized owner required; no session is manufactured.",
      );
    const catalog = await brokerCatalog();
    const market = catalog.find((m) => m.providerSymbol === "XAUUSD");
    if (!market)
      throw new Error("Selected-account XAUUSD history unavailable.");
    console.log(
      "Reading actual XAUUSD 5m history; no order/event/scheduler calls.",
    );
    const raw = await getCandles(
      market.id,
      "5m",
      owners[0],
      Date.now() + 30000,
    );
    const custom = {
      ...WR1,
      id: "unit-independent-custom-source",
      name: "Arbitrary custom metadata",
      kind: "style" as const,
      factors: [],
    };
    const selections = [
      ...SETUP_PRESETS.map((s) => [s]),
      [custom],
      SETUP_PRESETS.slice(0, 2),
    ];
    const results = selections.map((strategies) => {
      const analysis = analyzeSetups({
        market,
        timeframe: "5m",
        candles: raw.candles,
        daily: [],
        hourly: [],
        strategies,
        patterns: [],
        combination: "all",
        timezone: "America/New_York",
        now: raw.fetchedAt / 1000,
        source: raw.source,
        dailySource: "Not requested",
        hourlySource: "Not requested",
      });
      if (!analysis.scenario || analysis.scenario.candles.length !== 12)
        throw new Error(
          "Actual closed source history did not produce the required real continuation.",
        );
      const baseline = observeScenarioDirection(undefined, {
        context: scenarioDirectionContext(analysis, strategies),
        asOf: analysis.asOf,
        scenario: analysis.scenario,
      });
      if (baseline.change)
        throw new Error("Initial observation incorrectly produced a flip.");
      return {
        selected: strategies.map((s) => s.id),
        basis: analysis.scenario.basis,
        closedBars: analysis.candles.length,
        sourceAt: analysis.scenario.sourceAt,
        sourceEndAt: analysis.scenario.sourceEndAt,
        anchorAt: analysis.scenario.anchorAt,
        direction: analysis.scenario.direction,
        projectedBars: analysis.scenario.candles.length,
        tools: attachedIndicatorNames(strategyIndicatorLayers(strategies)),
        probability: analysis.estimate.probability,
        initialFlip: false,
      };
    });
    await mkdir("artifacts", { recursive: true });
    await writeFile(
      "artifacts/strategy-replay-verification.json",
      JSON.stringify(
        {
          at: new Date().toISOString(),
          market: market.providerSymbol,
          timeframe: "5m",
          source: raw.source,
          rawBars: raw.candles.length,
          results,
          actions:
            "Read existing authorized owner and actual private broker history only. Pure closed-bar strategy/replay calculations. No app session, user strategy, order, trade, alert/baseline row, device token or scheduler created. Native rendering/delivery remain separately unverified.",
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      JSON.stringify({
        actualSource: raw.source,
        rawBars: raw.candles.length,
        strategySelections: results.length,
        allReplaysAvailable: true,
        eventOrOrderCreated: false,
      }),
    );
  } finally {
    await (db as any).$client.promise().end();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Replay verification failed.");
  process.exitCode = 1;
});
