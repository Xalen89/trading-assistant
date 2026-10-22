import { TRPCError } from "@trpc/server";
import type { User } from "../../drizzle/schema";
import type { Market } from "../../lib/trading/model";
import type { InstrumentFacts } from "../../lib/trading/instrument-setup-types";
import { mayUseApp } from "./access";
import { jsonFetch, cached } from "./market";
import { requestTimeout } from "./scan-budget";

/** Information only: no broker execution, exchange book, alternate symbol or credentials returned. */
export async function instrumentFactsFor(
  user: User,
  market: Market,
  deadline: number,
): Promise<InstrumentFacts> {
  if (!mayUseApp(user)) throw new TRPCError({ code: "FORBIDDEN" });
  requestTimeout(deadline);
  if (market.provider === "tradelocker") {
    const { brokerInstrumentFacts } = await import("./tradelocker");
    return brokerInstrumentFacts(market.id, user, deadline);
  }
  if (market.provider === "coinbase") {
    const retrievedAt = Date.now();
    const product: unknown = await cached(
      `instrument-meta:${market.id}`,
      300_000,
      () =>
        jsonFetch(
          `https://api.exchange.coinbase.com/products/${encodeURIComponent(market.providerSymbol)}`,
          {},
          deadline,
        ),
    );
    if (!product || typeof product !== "object")
      throw new Error("Coinbase product metadata is unavailable.");
    const row = product as Record<string, unknown>;
    if (row.id !== market.providerSymbol)
      throw new Error("Coinbase metadata does not match the selected product.");
    const tick =
      typeof row.quote_increment === "string" ||
      typeof row.quote_increment === "number"
        ? Number(row.quote_increment)
        : NaN;
    const validTick = Number.isFinite(tick) && tick > 0;
    return {
      market: market.id,
      providerSymbol: market.providerSymbol,
      source: "Coinbase Exchange product metadata",
      retrievedAt,
      tick: validTick
        ? {
            value: tick,
            source:
              "Coinbase product quote_increment — actual minimum price increment",
          }
        : undefined,
      volumeBasis: "venue",
      dailyBasis: "utc-continuous-24h",
      messages: [
        validTick
          ? "Price tick is product quote_increment, not display decimals or base lot increment."
          : "Actual price increment is absent/invalid; no decimal-derived tick was supplied.",
        "Provider UTC day is continuous crypto data, not US regular-session close.",
        ...(row.status !== "online" || row.trading_disabled === true
          ? [
              "Product is not currently enabled; source/native quote gates remain mandatory.",
            ]
          : []),
      ],
    };
  }
  return {
    market: market.id,
    providerSymbol: market.providerSymbol,
    source: `${market.provider} instrument metadata not verified`,
    retrievedAt: Date.now(),
    volumeBasis: "unknown",
    messages: [
      "This source has not returned verified price-increment/daily-period metadata. No Coinbase or futures values were substituted.",
    ],
  };
}
