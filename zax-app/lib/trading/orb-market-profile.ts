import type { Market } from "./model";
import {
  ORB_DEFAULT_CONFIG,
  type OrbConfig,
  type OrbInstrumentMetadata,
} from "./orb-model";

const CME_TICK = 0.25;
const NAS100_TL_MARKET_ID = /^TL:\d{1,18}$/;

export type OrbMarketProfile = {
  mode: "native-futures" | "nas100-cfd";
  label: string;
  tick: number;
  minimumTargetPoints: number;
  maximumTargetPoints: number;
};

const nativeFutureCode = (market: Market) => {
  if (market.category !== "Futures") return undefined;
  if (market.id === "NQ" && market.providerSymbol === "NQ")
    return "NQ" as const;
  if (market.id === "ES" && market.providerSymbol === "ES")
    return "ES" as const;
  return undefined;
};

/**
 * Strictly identifies the one owner-configurable TradeLocker NAS100 CFD instrument shape.
 * It intentionally does not recognize aliases, other CFDs, futures, metals, or crypto.
 */
export function isNas100CfdMarket(market: Market): boolean {
  return (
    market.provider === "tradelocker" &&
    (market.category === "Indices" || market.category === "Stocks") &&
    market.providerSymbol === "NAS100" &&
    NAS100_TL_MARKET_ID.test(market.id)
  );
}

const validPositiveTick = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

function requireNas100Metadata(
  market: Market,
  config: OrbConfig,
  metadata: OrbInstrumentMetadata | undefined,
): OrbInstrumentMetadata {
  if (!isNas100CfdMarket(market))
    throw new Error(
      "NAS100 CFD mode requires exact TradeLocker providerSymbol NAS100 and TL:<numeric-id>, with the broker index/equity-index classification. No other symbol or futures alias is accepted.",
    );
  if (config.instrumentMarket !== market.id)
    throw new Error(
      `NAS100 CFD mode requires config.instrumentMarket to exactly equal selected market ${market.id}.`,
    );
  if (!metadata)
    throw new Error(
      "NAS100 CFD mode is blocked: current same-instrument metadata is missing; no price tick is inferred from precision or a CME fallback.",
    );
  if (metadata.market !== market.id)
    throw new Error(
      `NAS100 CFD mode is blocked: metadata.market ${metadata.market || "(empty)"} does not exactly equal selected market ${market.id}.`,
    );
  if (!validPositiveTick(metadata.priceTick))
    throw new Error(
      "NAS100 CFD mode is blocked: metadata.priceTick must be a finite positive same-instrument tick; no fallback tick is used.",
    );
  if (
    !validPositiveTick(config.priceTick) ||
    config.priceTick !== metadata.priceTick
  )
    throw new Error(
      `NAS100 CFD mode is blocked: config.priceTick must exactly match current metadata.priceTick ${metadata.priceTick}.`,
    );
  if (typeof metadata.source !== "string" || !metadata.source.trim())
    throw new Error(
      "NAS100 CFD mode is blocked: current same-instrument metadata requires a non-empty source.",
    );
  return metadata;
}

/** Resolves the only executable ORB market profiles; no price tick is guessed. */
export function resolveOrbMarketProfile(
  market: Market,
  config: OrbConfig = ORB_DEFAULT_CONFIG,
  metadata?: OrbInstrumentMetadata,
): OrbMarketProfile {
  const mode = config.marketMode ?? "native-futures";
  if (mode === "nas100-cfd") {
    const resolvedMetadata = requireNas100Metadata(market, config, metadata);
    return {
      mode,
      label: "NAS100 CFD app adaptation",
      tick: resolvedMetadata.priceTick,
      minimumTargetPoints: 50,
      maximumTargetPoints: 150,
    };
  }

  const code = nativeFutureCode(market);
  if (!code)
    throw new Error(
      "Native-futures ORB mode requires market id/providerSymbol exactly NQ or ES with category Futures; CFDs, crypto, cash indices, and aliases are denied.",
    );
  return {
    mode,
    label: `${code} native futures`,
    tick: CME_TICK,
    minimumTargetPoints: code === "NQ" ? 50 : 20,
    maximumTargetPoints: code === "NQ" ? 150 : 40,
  };
}
