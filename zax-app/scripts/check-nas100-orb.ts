import { eq } from "drizzle-orm";
import { getDb, getUserByOpenId } from "../server/db";
import { ENV } from "../server/_core/env";
import { users } from "../drizzle/schema";
import { mayUseApp } from "../server/trading/access";
import { brokerCatalog } from "../server/trading/tradelocker";
import { prepareOrbInstrument } from "../server/trading/orb-instrument-preparation";
import { setupAnalysis } from "../server/trading/setup-service";
import { ORB_DEFAULT_CONFIG } from "../lib/trading/orb-model";
import { ORB_STRATEGY } from "../lib/trading/orb-presets";
import { isNas100CfdMarket } from "../lib/trading/orb-market-profile";
async function main() {
  const db = await getDb();
  if (!db) throw new Error("Read-only owner lookup unavailable.");
  const email = process.env.TRADELOCKER_OWNER_EMAIL?.trim().toLowerCase();
  const candidates = ENV.ownerOpenId
    ? [await getUserByOpenId(ENV.ownerOpenId)].filter(Boolean)
    : email
      ? await db.select().from(users).where(eq(users.email, email)).limit(2)
      : [];
  const owner = candidates.length === 1 ? candidates[0] : undefined;
  if (!owner || !mayUseApp(owner))
    throw new Error(
      "Unique authorized owner unavailable; no private read attempted.",
    );
  const catalog = await brokerCatalog();
  if (process.argv.includes("--catalog-only")) {
    console.log(
      JSON.stringify(
        catalog
          .filter((m) => /nas100/i.test(m.providerSymbol) || m.id === "TL:3884")
          .map((m) => ({
            market: m.id,
            providerSymbol: m.providerSymbol,
            category: m.category,
            paperSupported: m.paperSupported,
          })),
        null,
        2,
      ),
    );
    return;
  }
  const markets = catalog.filter(isNas100CfdMarket);
  if (markets.length !== 1)
    throw new Error(
      "Exactly one selected-account NAS100 identity is required; no alias/source chosen.",
    );
  const market = markets[0];
  const prepared = await prepareOrbInstrument(owner, {
    market: market.id,
    config: { ...ORB_DEFAULT_CONFIG, marketMode: "nas100-cfd" },
  });
  const strategy = {
    ...ORB_STRATEGY,
    id: "unit-readonly-nas100-probe",
    orbConfig: prepared.config,
  };
  const analysis = await setupAnalysis(
    owner,
    {
      market: market.id,
      timeframe: "1m",
      strategyIds: [strategy.id],
      strategies: [strategy],
      combination: "all",
      timezone: "Etc/GMT+5",
    },
    Date.now() + 45_000,
    { proposalOnly: true },
  );
  console.log(
    JSON.stringify(
      {
        at: new Date().toISOString(),
        market: market.id,
        symbol: market.providerSymbol,
        mode: prepared.config.marketMode,
        tick: prepared.config.priceTick ?? null,
        tickSource: prepared.facts.tick?.source ?? null,
        source: analysis.source,
        latestCompletedBar: analysis.candles.at(-1)?.time ?? null,
        range: analysis.orbContexts?.[0]?.range ?? null,
        candidates: analysis.candidates
          .filter((c) => c.family === "orb")
          .map((c) => ({
            side: c.side,
            ready: c.ready,
            steps: c.steps.map((s) => ({
              id: s.id,
              status: s.status,
              evidence: s.evidence,
            })),
          })),
        warnings: analysis.messages,
        databaseWrites: 0,
        proposals: 0,
        orders: 0,
        schedules: 0,
        aiRequests: 0,
      },
      null,
      2,
    ),
  );
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(
      e instanceof Error ? e.message : "Read-only NAS100 check failed",
    );
    process.exit(1);
  });
