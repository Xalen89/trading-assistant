import { eq } from "drizzle-orm";
import { getDb, getUserByOpenId } from "../server/db";
import { ENV } from "../server/_core/env";
import { tradingWorkspaces, users } from "../drizzle/schema";
import { mayUseApp } from "../server/trading/access";
import type { Workspace } from "../lib/trading/model";
import { PIVOT_DEFAULT_CONFIG } from "../lib/trading/session-strategy-model";
import { prepareInstrument } from "../server/trading/instrument-preparation";

async function main() {
  const db = await getDb();
  if (!db) throw new Error("Read-only canonical owner lookup unavailable.");
  const email = process.env.TRADELOCKER_OWNER_EMAIL?.trim().toLowerCase();
  const candidates = ENV.ownerOpenId
    ? [await getUserByOpenId(ENV.ownerOpenId)].filter(Boolean)
    : email
      ? await db.select().from(users).where(eq(users.email, email)).limit(2)
      : [];
  const owner = candidates.length === 1 ? candidates[0] : undefined;
  if (!owner || !mayUseApp(owner))
    throw new Error("Unique authorized owner unavailable.");
  const rows = await db
    .select({ payload: tradingWorkspaces.payload })
    .from(tradingWorkspaces)
    .where(eq(tradingWorkspaces.userId, owner.id))
    .limit(1);
  const workspace = rows[0]?.payload as Workspace | undefined;
  const targets = process.argv.includes("--public-only")
    ? ["BTC-USD"]
    : [
        ...new Set([
          ...(workspace && !workspace.settings.sampleMode
            ? [workspace.market]
            : []),
          "BTC-USD",
        ]),
      ];
  for (const market of targets) {
    try {
      const result = await prepareInstrument(owner, {
        market,
        config: PIVOT_DEFAULT_CONFIG,
      });
      console.log(
        JSON.stringify(
          {
            at: new Date().toISOString(),
            market,
            source: result.facts.source,
            actualPriceTick: result.facts.tick?.value ?? null,
            tickSource: result.facts.tick?.source ?? null,
            pdcBasis:
              result.config.family === "pdc-continuation"
                ? result.config.pdcBasis
                : null,
            targetMode:
              result.config.family === "pdc-continuation"
                ? result.config.targetMode
                : null,
            previousDay: result.previousDay ?? null,
            volume: result.volumeSample,
            status: result.status,
            remaining: result.choices,
            notes: result.warnings,
            databaseWrites: 0,
            orders: 0,
            scheduledJobs: 0,
          },
          null,
          2,
        ),
      );
    } catch (error) {
      console.log(
        JSON.stringify({
          market,
          status: "blocked",
          error:
            error instanceof Error ? error.message : "Preparation unavailable",
          databaseWrites: 0,
          orders: 0,
          scheduledJobs: 0,
        }),
      );
    }
  }
}
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Read-only check failed",
    );
    process.exit(1);
  });
