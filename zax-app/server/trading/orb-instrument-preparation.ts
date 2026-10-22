import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { User } from "../../drizzle/schema";
import type { InstrumentFacts } from "../../lib/trading/instrument-setup-types";
import { orbConfigSchema, type OrbConfig } from "../../lib/trading/orb-model";
import { isNas100CfdMarket } from "../../lib/trading/orb-market-profile";
import { mayUseApp } from "./access";
import { symbol } from "./validation";
import { marketFor } from "./setup-service";
import { instrumentFactsFor } from "./instrument-facts-service";
import { beforeDeadline } from "./scan-budget";

export const orbInstrumentPreparationSchema = z
  .object({
    market: symbol,
    config: orbConfigSchema,
  })
  .strict();
export type PreparedOrbInstrument = {
  config: OrbConfig;
  facts: InstrumentFacts;
  remaining: string[];
};

/** Metadata read only. The caller reviews/saves a local draft and arms paper separately. */
export async function prepareOrbInstrument(
  user: User,
  request: z.infer<typeof orbInstrumentPreparationSchema>,
): Promise<PreparedOrbInstrument> {
  if (!mayUseApp(user)) throw new TRPCError({ code: "FORBIDDEN" });
  const input = orbInstrumentPreparationSchema.parse(request);
  if (input.config.marketMode !== "nas100-cfd")
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Select the labelled NAS100 CFD mode before detecting its tick.",
    });
  const deadline = Date.now() + 20_000;
  const market = await beforeDeadline(marketFor(user, input.market), deadline);
  if (!isNas100CfdMarket(market))
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Select your exact TradeLocker NAS100 CFD instrument. No futures, Gold, crypto or alternate broker symbol was substituted.",
    });
  const facts = await beforeDeadline(
    instrumentFactsFor(user, market, deadline),
    deadline,
  );
  if (
    facts.market !== market.id ||
    facts.providerSymbol !== market.providerSymbol
  )
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Instrument metadata did not match selected NAS100; no tick was applied.",
    });
  const tick = facts.tick?.value;
  const validTick =
    typeof tick === "number" &&
    Number.isFinite(tick) &&
    tick > 0 &&
    tick <= 1000;
  const config = orbConfigSchema.parse({
    ...input.config,
    instrumentMarket: market.id,
    priceTick: validTick ? tick : undefined,
  });
  return {
    config,
    facts,
    remaining: [
      ...(!validTick
        ? [
            "The selected broker instrument has not returned a safe minimum increment. No CME or display-decimal tick was substituted.",
          ]
        : []),
      ...(!config.confirmed
        ? [
            "Review and confirm this app-added CFD variation before saving execution settings.",
          ]
        : []),
      "Detection only prepares a local configuration. Save its revision and approve fresh native source gates before separately arming paper.",
    ],
  };
}
