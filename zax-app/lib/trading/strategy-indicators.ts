import type { Strategy } from "./model";
import { resolveSetupFamily } from "./setup-presets";

/** Chart tools are declarations, not proof that an entry detector is supported. */
export type StrategyIndicatorLayers = {
  ema: boolean;
  bands: boolean;
  trail: boolean;
  rsi: boolean;
  sma: boolean;
  donchian: boolean;
  macd: boolean;
  range10?: boolean;
  vwapStdv?: boolean;
  ema20?: boolean;
  ema50?: boolean;
  sma20?: boolean;
  sma50?: boolean;
};

export function strategyIndicatorLayers(
  strategies: Strategy[],
): StrategyIndicatorLayers {
  const layers: StrategyIndicatorLayers = {
    ema: false,
    bands: false,
    trail: false,
    rsi: false,
    sma: false,
    donchian: false,
    macd: false,
    ema20: false,
    ema50: false,
    sma20: false,
    sma50: false,
  };
  for (const strategy of strategies.filter((s) => s.visible && !s.archived)) {
    const family = resolveSetupFamily(strategy);
    if (family === "vwap-stdv") layers.vwapStdv = true;
    if (family === "trend-following") {
      layers.ema20 = layers.ema50 = layers.trail = true;
    } else if (family === "mean-reversion") {
      layers.bands = layers.rsi = true;
    } else if (family === "sma-crossover") {
      layers.sma20 = layers.sma50 = true;
    } else if (family === "macd-momentum") {
      layers.macd = true;
    } else if (family === "donchian-breakout") {
      layers.donchian = true;
    } else if (family === "breakout-momentum") {
      layers.range10 = true;
    }
    if (family === "custom") {
      const declared = strategy.factors
        .filter((f) => f.enabled)
        .map((f) => `${f.name} ${f.description}`)
        .join(" ");
      // Only implemented, explicit periods are interpreted. A name alone does not supply a period.
      layers.ema20 ||= /\bEMA\s*[-(]?\s*20\b/i.test(declared);
      layers.ema50 ||= /\bEMA\s*[-(]?\s*50\b/i.test(declared);
      layers.sma20 ||= /\bSMA\s*[-(]?\s*20\b/i.test(declared);
      layers.sma50 ||= /\bSMA\s*[-(]?\s*50\b/i.test(declared);
      layers.rsi ||= /\bRSI\s*[-(]?\s*14\b/i.test(declared);
      layers.bands ||= /\b(?:BB|Bollinger(?:\s+Bands?)?)\s*[-(]?\s*20\b/i.test(
        declared,
      );
      layers.donchian ||= /\bDonchian\s*[-(]?\s*20\b/i.test(declared);
      layers.macd ||= /\bMACD\s*[-(]?\s*12\s*[/,]\s*26\s*[/,]\s*9\b/i.test(
        declared,
      );
    }
  }
  layers.ema = Boolean(layers.ema20 || layers.ema50);
  layers.sma = Boolean(layers.sma20 || layers.sma50);
  return layers;
}

export function attachedIndicatorNames(
  layers: StrategyIndicatorLayers,
): string[] {
  return [
    layers.ema20 && "EMA20",
    layers.ema50 && "EMA50",
    layers.bands && "Bollinger20 ±2σ",
    layers.trail && "2×ATR14 guide",
    layers.rsi && "RSI14",
    layers.sma20 && "SMA20",
    layers.sma50 && "SMA50",
    layers.macd && "MACD12/26/9",
    layers.donchian && "Prior Donchian20",
    layers.range10 && "Prior 10-bar range",
    layers.vwapStdv && "Venue OHLCV VWAP20 ±2.5σ",
  ].filter((name): name is string => typeof name === "string");
}
