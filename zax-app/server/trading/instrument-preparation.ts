import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { User } from "../../drizzle/schema";
import type { Market, Timeframe } from "../../lib/trading/model";
import type {
  PreparedInstrumentSetup,
  InstrumentFacts,
} from "../../lib/trading/instrument-setup-types";
import {
  sessionStrategyConfigSchema,
  sessionVolumeAllowed,
} from "../../lib/trading/session-strategy-model";
import { SECONDS } from "../../lib/trading/engine";
import { symbol } from "./validation";
import { marketFor } from "./setup-service";
import { getCandles, type CandleFeed } from "./market";
import { instrumentFactsFor } from "./instrument-facts-service";
import { mayUseApp } from "./access";
import { boundedRequest } from "../../lib/trading/request-deadline";

export const instrumentPreparationSchema = z
  .object({ market: symbol, config: sessionStrategyConfigSchema })
  .strict();
export type InstrumentPreparationDependencies = {
  marketFor: (user: User, market: string) => Promise<Market>;
  facts: (
    user: User,
    market: Market,
    deadline: number,
  ) => Promise<InstrumentFacts>;
  candles: (
    market: string,
    timeframe: Timeframe,
    user: User,
    deadline: number,
  ) => Promise<CandleFeed>;
};
const dependencies: InstrumentPreparationDependencies = {
  marketFor,
  facts: instrumentFactsFor,
  candles: getCandles,
};
const SETUP_MS = 25_000;

/** Reads only: never saves a strategy/workspace, registers alerts or creates an order. */
export async function prepareInstrument(
  user: User,
  raw: z.infer<typeof instrumentPreparationSchema>,
  deps = dependencies,
): Promise<PreparedInstrumentSetup> {
  if (!mayUseApp(user)) throw new TRPCError({ code: "FORBIDDEN" });
  const input = instrumentPreparationSchema.parse(raw);
  const deadline = Date.now() + SETUP_MS;
  return boundedRequest(
    prepareWithinDeadline(user, input, deps, deadline),
    SETUP_MS,
    "Instrument preparation timed out. Existing settings and paper consent were not changed.",
  );
}
async function prepareWithinDeadline(
  user: User,
  input: z.infer<typeof instrumentPreparationSchema>,
  deps: InstrumentPreparationDependencies,
  deadline: number,
): Promise<PreparedInstrumentSetup> {
  const market = await deps.marketFor(user, input.market);
  if (market.id !== input.market)
    throw new Error(
      "Prepared market identity does not match the selected instrument.",
    );
  const startedAt = Date.now();
  const [metadata, volume, daily] = await Promise.allSettled([
    deps.facts(user, market, deadline),
    deps.candles(input.market, input.config.executionTimeframe, user, deadline),
    input.config.family === "pdc-continuation"
      ? deps.candles(input.market, "1d", user, deadline)
      : Promise.resolve(null),
  ]);
  if (Date.now() >= deadline)
    throw new Error(
      "Instrument source deadline exceeded; no configuration was changed.",
    );
  const facts: InstrumentFacts =
    metadata.status === "fulfilled"
      ? metadata.value
      : {
          market: input.market,
          providerSymbol: market.providerSymbol,
          source: "Instrument metadata unavailable",
          retrievedAt: Date.now(),
          volumeBasis: "unknown",
          messages: [
            "The selected provider did not return usable metadata; no alternate source was used.",
          ],
        };
  if (
    facts.market !== input.market ||
    facts.providerSymbol !== market.providerSymbol
  )
    throw new Error("Returned instrument facts do not match this market.");
  const config = structuredClone(input.config);
  const choices: string[] = [];
  const warnings = [...facts.messages];
  const changedInstrument = Boolean(
    config.instrumentMarket && config.instrumentMarket !== input.market,
  );
  config.instrumentMarket = input.market;
  if (config.family !== "london-breakout") {
    if (changedInstrument) {
      config.priceTick = undefined;
      warnings.push(
        "Previous detected tick belonged to another market and was cleared before preparing this instrument.",
      );
    }
    if (
      !config.priceTick &&
      facts.tick &&
      Number.isFinite(facts.tick.value) &&
      facts.tick.value > 0
    )
      config.priceTick = facts.tick.value;
    else if (
      config.priceTick &&
      facts.tick &&
      config.priceTick !== facts.tick.value
    )
      warnings.push(
        "Your existing price tick differs from provider metadata. It was preserved; review the actual provider tick before execution.",
      );
    if (
      !config.priceTick &&
      (config.family === "pdc-continuation" ||
        config.stopMode === "inside-boundary")
    )
      choices.push(
        "The source did not return a safe price tick; supply verified instrument metadata or set the actual tick.",
      );
  }
  const volumeFeed = volume.status === "fulfilled" ? volume.value : undefined;
  const volumeCutoff =
    Math.min(
      startedAt,
      volumeFeed?.requestedAt ?? volumeFeed?.fetchedAt ?? startedAt,
    ) / 1000;
  const closed =
    volumeFeed?.candles.filter(
      (c) => c.time + SECONDS[input.config.executionTimeframe] <= volumeCutoff,
    ) ?? [];
  const basis = volumeFeed?.volumeBasis ?? "unknown";
  const requiredBars =
    config.family === "initial-balance"
      ? 21
      : config.family === "pdc-continuation"
        ? 2
        : 0;
  const sample = closed.slice(-requiredBars || -1);
  const positiveBars = sample.filter(
    (c) => Number.isFinite(c.volume) && c.volume > 0,
  ).length;
  if (config.family !== "london-breakout") {
    if (!sessionVolumeAllowed(config, basis))
      choices.push(
        basis === "broker-reported"
          ? "Broker-reported volume is not exchange volume. Keep venue-only or deliberately choose the labelled broker proxy in the editor."
          : "Volume provenance is unavailable; no verified venue or labelled broker proxy was returned.",
      );
    if (sample.length < requiredBars || positiveBars < requiredBars)
      choices.push(
        "Recent completed source volume is missing/zero or too short. Autofill cannot create qualifying readings.",
      );
  }
  let previousDay: PreparedInstrumentSetup["previousDay"];
  if (config.family === "pdc-continuation") {
    const dailyFeed = daily.status === "fulfilled" ? daily.value : undefined;
    if (
      config.pdcBasis === "unselected" ||
      (changedInstrument && config.pdcBasis !== "declared-session-close")
    ) {
      config.pdcBasis =
        dailyFeed?.dailyPeriodBasis === "utc-continuous-24h"
          ? "provider-utc-day"
          : dailyFeed?.dailyPeriodBasis === "utc-provider-trading-days"
            ? "provider-utc-trading-day"
            : "unselected";
    }
    if (config.pdcBasis === "unselected")
      choices.push(
        "Provider day basis is not verified. Choose an explicitly declared source session close rather than assuming a US close.",
      );
    if (dailyFeed) {
      const sameSource =
        (!volumeFeed?.sourceIdentity ||
          !dailyFeed.sourceIdentity ||
          volumeFeed.sourceIdentity === dailyFeed.sourceIdentity) &&
        dailyFeed.source === volumeFeed?.source;
      if (!sameSource)
        warnings.push(
          "Daily and native sources do not match; no previous-close or key levels were populated.",
        );
      else {
        const { resolvePreviousProviderDay } =
          await import("../../lib/trading/previous-provider-day");
        const day = resolvePreviousProviderDay({
          candles: dailyFeed.candles,
          basis: dailyFeed.dailyPeriodBasis,
          cutoff: Math.floor(
            Math.min(startedAt, dailyFeed.requestedAt ?? dailyFeed.fetchedAt) /
              1000,
          ),
          source: dailyFeed.source,
        });
        if (day.bar && day.closeAt)
          previousDay = {
            close: day.bar.close,
            high: day.bar.high,
            low: day.bar.low,
            barAt: day.bar.time,
            closeAt: day.closeAt,
            source: dailyFeed.source,
          };
        else
          warnings.push(
            day.reason ||
              "Complete actual previous provider-day data is unavailable.",
          );
      }
    } else
      warnings.push(
        "Actual selected-source daily data is unavailable; no prices were invented.",
      );
    // Only fill the incomplete default target choice. Personal key levels or declared premarket remain deliberate overrides.
    if (
      config.targetMode === "owner-key-levels" &&
      !config.longTargetPrice &&
      !config.shortTargetPrice &&
      previousDay
    )
      config.targetMode = "previous-day-extremes";
    if (
      config.targetMode === "owner-key-levels" &&
      (!config.longTargetPrice || !config.shortTargetPrice)
    )
      choices.push(
        "Set missing personal target(s), or choose dynamic actual PDH/PDL when the source supports them.",
      );
    if (
      config.targetMode === "declared-premarket-range" &&
      config.premarketStartMinute === undefined
    )
      choices.push(
        "Your personal premarket start remains unspecified; no 04:00 start was invented.",
      );
    if (config.targetMode === "previous-day-extremes" && !previousDay)
      choices.push(
        "Dynamic PDH/PDL requires complete same-source prior provider-day data.",
      );
    if (
      config.pdcBasis === "declared-session-close" &&
      config.sessionCloseMinute === undefined
    )
      choices.push("Your personal session-close clock remains unspecified.");
  }
  warnings.push(
    "Detected setup is configuration only, not a ready trade. Save/review the source revision and approve fresh native gates; automatic paper consent stays separate.",
  );
  return {
    market: input.market,
    facts,
    config: sessionStrategyConfigSchema.parse(config),
    status: choices.length ? "partial" : "ready",
    previousDay,
    volumeSample: { bars: sample.length, positiveBars, basis },
    choices,
    warnings,
  };
}
