import { TRPCError } from "@trpc/server";
import type { User } from "../../drizzle/schema";
import { validateCandles, SECONDS } from "../../lib/trading/engine";
import type {
  QuantSeries,
  QuantLabInput,
  QuantLabResult,
} from "../../lib/trading/quant-lab-types";
import type { QuantResearchRequest } from "./quant-request";
import { quantHistory } from "./quant-data";
import { venueDepth } from "./venue-depth";
async function execute(input: QuantLabInput): Promise<QuantLabResult> {
  switch (input.family) {
    case "pairs":
      return (await import("../../lib/trading/quant-pairs")).runPairs(input);
    case "momentum":
      return (await import("../../lib/trading/quant-momentum")).runMomentum(
        input,
      );
    case "making":
      return (await import("../../lib/trading/quant-making")).runMarketMaking(
        input,
      );
    case "macro":
      return (await import("../../lib/trading/quant-macro")).runMacroTrend(
        input,
      );
    case "ml":
      return (await import("../../lib/trading/quant-ml")).runML(input);
  }
}
/** Read-only service; the router, not this diagnostic entry point, authenticates the owner and records scoped research. */
export async function runQuantResearch(
  input: QuantResearchRequest,
  user: User,
) {
  const deadline = Date.now() + 45000;
  const series: QuantSeries[] = [];
  if (input.family !== "making")
    for (let offset = 0; offset < input.symbols.length; offset += 2) {
      if (Date.now() >= deadline)
        throw new TRPCError({
          code: "TIMEOUT",
          message:
            "Research data request timed out. Try fewer markets or fewer bars; inputs are retained.",
        });
      const block = await Promise.all(
        input.symbols.slice(offset, offset + 2).map(async (id) => {
          const own = input.imports?.find((row) => row.symbol === id);
          if (own) {
            if (own.timeframe !== input.timeframe)
              throw new TRPCError({
                code: "BAD_REQUEST",
                message:
                  "Imported timeframes must match the selected research frame.",
              });
            return {
              symbol: id,
              timeframe: own.timeframe,
              source: `Owner-provided dataset (${own.source.slice(0, 300)}); timeframe manually declared, not provider-verified`,
              candles: validateCandles(own.candles)
                .filter(
                  (c) => c.time + SECONDS[own.timeframe] <= Date.now() / 1000,
                )
                .slice(-5000),
              fetchedAt: Date.now(),
              provenance: "user-import" as const,
              adjustedTotalReturn: false,
            };
          }
          try {
            return await quantHistory(
              id,
              input.timeframe,
              user,
              input.bars,
              deadline,
            );
          } catch (e) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: `History unavailable for ${id} (${input.timeframe}): ${e instanceof Error ? e.message : "Source unavailable"}. Use a connected source, import matching actual history, or retry.`,
            });
          }
        }),
      );
      series.push(...block);
    }
  const book =
    input.family === "making" ? await venueDepth(input.symbols[0]) : undefined;
  if (Date.now() > deadline)
    throw new TRPCError({
      code: "TIMEOUT",
      message:
        "Data request exceeded its 45-second budget. Reduce markets/bars and retry.",
    });
  const result = await execute({
    family: input.family,
    series,
    settings: input.settings,
    book,
    now: Date.now(),
  });
  if (!["unconfirmed", "exploratory"].includes(result.validation.status))
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Unexpected model qualification; no confirmed edge is inferred.",
    });
  result.limitations = [
    ...new Set([
      ...result.limitations,
      `Transaction costs use your assumptions: fee ${input.settings.feeBps}bps and slippage ${input.settings.slippageBps}bps, not verified venue/broker charges.`,
      "Model results are exploratory paper research; not brokerage orders or a calibrated chance of winning.",
    ]),
  ];
  return {
    result,
    series: series.map((s) => ({
      symbol: s.symbol,
      source: s.source,
      barCount: s.candles.length,
      asOf: s.candles.at(-1)?.time || 0,
      provenance: s.provenance,
    })),
    book,
  };
}
