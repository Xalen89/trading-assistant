import type { Candle } from "./model";
export type CatalogEntry = {
  id: string;
  name: string;
  category:
    | "PD arrays"
    | "Candlesticks"
    | "Chart structure"
    | "Indicator styles";
  definition: string;
  support: string;
  source: string;
  tags: string[];
};
const wr1 =
  "Shared wr1 PDF.pdf · source taxonomy/reference; exact personal definition can differ";
const talib =
  "https://github.com/TA-Lib/ta-lib · BSD-3-Clause; official pattern functions https://ta-lib.org/functions/; independently paraphrased reference, not imported TA-Lib code";
const manual =
  "General educational chart taxonomy · manual definition; not a detected/uploaded/validated strategy";
const row = (
  id: string,
  name: string,
  category: CatalogEntry["category"],
  definition: string,
  support: string,
  source: string,
  tags: string[] = [],
): CatalogEntry => ({ id, name, category, definition, support, source, tags });
export const PATTERN_CATALOG: CatalogEntry[] = [
  row(
    "fvg",
    "FVG · Fair Value Gap",
    "PD arrays",
    "Regular three-candle imbalance: third low above first high (bullish), or third high below first low (bearish). CE is the zone midpoint.",
    "Automatic regular OHLC gap/CE context; complete setup still needs ordered source factors.",
    wr1,
    ["imbalance", "CE"],
  ),
  row(
    "ifvg",
    "IFVG CE",
    "PD arrays",
    "An invalidated FVG considered in the opposite role; midpoint is CE. Invalidation/retest rules must be specified.",
    "Manual/source reference; generic gap overlay is not an inversion detector.",
    wr1,
    ["inversion", "CE"],
  ),
  row(
    "ob",
    "Order Block CE",
    "PD arrays",
    "Source last-opposite candle body before qualifying displacement; CE is its body midpoint.",
    "Supported last-opposite-body context in ordered source setup, not every candle called a block.",
    wr1,
    ["OB", "body"],
  ),
  row(
    "rdrb",
    "RDRB CE",
    "PD arrays",
    "Rejection-block or source-defined range/body CE; precise source meaning/anchors must be reviewed.",
    "Manual/source-specific. No universal RDRB interpretation is inferred from the abbreviation.",
    wr1,
    ["RDRB", "CE"],
  ),
  row(
    "overlap",
    "Overlap CE / BPR",
    "PD arrays",
    "Midpoint/overlap of qualifying oppositely directed imbalances; boundaries depend on the reviewed source.",
    "Manual reference; no generic overlap is declared a ready trade.",
    wr1,
    ["balanced price range"],
  ),
  row(
    "wick",
    "Wick CE",
    "PD arrays",
    "Midpoint of a selected candle wick, not of its full range/body. Upper/lower wick and anchor candle must be explicit.",
    "Manual named-level reference.",
    wr1,
    ["wick midpoint"],
  ),
  row(
    "turtle",
    "Turtle Soup / Liquidity Sweep",
    "PD arrays",
    "Sweep of known prior high/low followed by rejection back through the level. Source swing/day/range anchors differ.",
    "Supported confirmed-prior-swing sweep context; not every wick or all Turtle Soup variants.",
    wr1,
    ["stop run", "liquidity"],
  ),
  row(
    "mss",
    "MSS / CHoCH",
    "PD arrays",
    "Directional close through a defined local structural level after displacement. Pivot confirmation must be causal.",
    "Supported closed structural shift in source sequence; broader CHoCH variants manual.",
    wr1,
    ["structure shift"],
  ),
  row(
    "bos",
    "Break of Structure",
    "PD arrays",
    "Close through a source-defined confirmed swing in the prevailing direction.",
    "Manual broader structure reference; no universal BOS detector is claimed.",
    manual,
    ["BOS"],
  ),
  row(
    "equal",
    "Equal Highs / Equal Lows",
    "PD arrays",
    "Nearby comparable swing highs/lows, often reviewed as resting-liquidity objectives. Equality tolerance needs instrument rules.",
    "Manual threshold/source reference.",
    manual,
    ["EQH", "EQL"],
  ),
  row(
    "breaker",
    "Breaker Block",
    "PD arrays",
    "A failed qualifying block reviewed in the opposite role after source-confirmed structure/liquidity changes.",
    "Manual rules/anchors required.",
    manual,
    ["failed OB"],
  ),
  row(
    "mitigation",
    "Mitigation Block",
    "PD arrays",
    "Source-defined return to a prior price-delivery area; definitions vary across style authors.",
    "Manual source reference; label alone cannot train a detector.",
    manual,
  ),
  row(
    "po3",
    "PO3 · Accumulation / Manipulation / Distribution",
    "PD arrays",
    "Reference phase framework for range building, liquidity run and directional delivery.",
    "Manual phase interpretation, not a guaranteed clock sequence.",
    wr1,
    ["power of three"],
  ),
  row(
    "ote",
    "OTE / Premium–Discount",
    "PD arrays",
    "Source retracement and range-half ratios using explicit swing/range anchors.",
    "Visible range-quarter/OTE guide; chosen range is not asserted optimal.",
    wr1,
    ["fib", "retracement"],
  ),
  row(
    "stdv",
    "STDV −2 / −2.5 / −4",
    "PD arrays",
    "Source manipulation-range Fibonacci extensions; these negative ratios are not Gaussian standard deviation.",
    "Automatic named range targets when valid sweep/MSS anchors exist; no standalone entry.",
    wr1,
    ["range extensions"],
  ),
  row(
    "smt",
    "SMT / C-SMT",
    "PD arrays",
    "Divergence across source-correlated markets over matched swings/time windows.",
    "Manual/multi-source prerequisite; one chart cannot prove it.",
    wr1,
    ["correlated markets"],
  ),
  row(
    "asia",
    "Asian Range Sweep",
    "PD arrays",
    "Sweep/rejection of a completed source-defined Asian session range. Session clock/timezone and coverage must be explicit.",
    "Manual session/range evidence until actual coverage rules are configured.",
    wr1,
  ),
  row(
    "pdh",
    "PDH / PDL",
    "PD arrays",
    "High/low of the previous completed provider daily candle. Broker day need not match exchange reporting day.",
    "Automatic only with actual completed provider-day source.",
    wr1,
  ),
  row(
    "engulf",
    "Bullish / Bearish Engulfing",
    "Candlesticks",
    "Second opposite-color real body strictly covers the previous body. Shape alone does not validate prior trend.",
    "App closed-bar strict-body shape observation; not identical to TA-Lib threshold variants.",
    talib,
    ["CDLENGULFING"],
  ),
  row(
    "hammer",
    "Hammer",
    "Candlesticks",
    "Small real body near top of range, long lower wick and small upper wick. Prior decline/reversal confirmation is separate.",
    "App explicit ratio shape observation; not TA-Lib adaptive thresholds.",
    talib,
    ["CDLHAMMER"],
  ),
  row(
    "doji",
    "Doji",
    "Candlesticks",
    "Very small real body relative to full candle range. Indecision is interpretation, not direction.",
    "App body≤10% of nonzero range; not TA-Lib BodyDoji moving-average convention.",
    talib,
    ["CDLDOJI"],
  ),
  row(
    "harami",
    "Bullish / Bearish Harami",
    "Candlesticks",
    "Smaller second real body contained within preceding larger body.",
    "Manual reference; no complete trend/confirmation detector.",
    talib,
    ["CDLHARAMI"],
  ),
  row(
    "morning",
    "Morning / Evening Star",
    "Candlesticks",
    "Three-candle long-body, small middle body and directional third-candle penetration/gap structure. Gap/penetration conventions must be explicit.",
    "Manual source reference; no invented gap thresholds.",
    talib,
    ["CDLMORNINGSTAR", "CDLEVENINGSTAR"],
  ),
  row(
    "three",
    "Rising / Falling Three Methods",
    "Candlesticks",
    "Long initial candle, three smaller counter-direction candles within range, then long continuation candle.",
    "Manual source reference; preceding trend not proven by shape.",
    talib,
    ["CDLRISEFALL3METHODS"],
  ),
  row(
    "inside",
    "Inside Bar",
    "Candlesticks",
    "Latest high strictly below prior high and low strictly above prior low; context is compression, not guaranteed breakout.",
    "Automatic explicit closed two-bar geometry.",
    manual,
  ),
  row(
    "outside",
    "Outside Bar",
    "Candlesticks",
    "Latest high above prior high and low below prior low. Direction is not implied by range expansion.",
    "Automatic explicit closed two-bar geometry.",
    manual,
  ),
  row(
    "shooting",
    "Shooting Star / Inverted Hammer",
    "Candlesticks",
    "Small lower body with long upper shadow; prior up/down trend distinguishes interpretations.",
    "Manual ratio/trend source reference.",
    manual,
  ),
  row(
    "tweezer",
    "Tweezer Top / Bottom",
    "Candlesticks",
    "Nearby equal extremes in consecutive candles. Tolerance and preceding trend must be defined.",
    "Manual reference; exact/tolerance equality is not guessed.",
    manual,
  ),
  row(
    "soldiers",
    "Three White Soldiers / Black Crows",
    "Candlesticks",
    "Three directionally persistent real-body candles; opening/closing/wick/trend conventions vary.",
    "Manual reference; not automatically a continuation/reversal.",
    manual,
  ),
  row(
    "marubozu",
    "Marubozu / Spinning Top",
    "Candlesticks",
    "Large near-wickless body versus small body with shadows; concrete wick/body tolerances needed.",
    "Manual morphology reference.",
    manual,
  ),
  row(
    "bullflag",
    "Bull / Bear Flag",
    "Chart structure",
    "Directional impulse followed by countertrend/consolidating channel; continuation needs valid breakout/volume/context.",
    "Manual multi-bar anchors; breakout ten-bar box is not a flag detector.",
    manual,
  ),
  row(
    "triangle",
    "Ascending / Descending / Symmetric Triangle",
    "Chart structure",
    "Converging source-confirmed swing boundaries; one side may be horizontal.",
    "Manual swing/fit/breakout rules; no drawn fictional future.",
    manual,
  ),
  row(
    "double",
    "Double Top / Double Bottom",
    "Chart structure",
    "Two comparable extremes with intervening neckline; confirmation after neckline break, not second extreme alone.",
    "Manual tolerance/spacing/neckline conventions.",
    manual,
  ),
  row(
    "shoulders",
    "Head & Shoulders / Inverse",
    "Chart structure",
    "Three-extreme pattern with central extreme beyond shoulders and defined neckline.",
    "Manual swing/neckline confirmation.",
    manual,
  ),
  row(
    "wedge",
    "Rising / Falling Wedge",
    "Chart structure",
    "Converging sloped multi-swing boundaries; direction depends on source context/confirmed break.",
    "Manual fitting/context reference.",
    manual,
  ),
  row(
    "cup",
    "Cup & Handle / Rounded Base",
    "Chart structure",
    "Rounded consolidation/base and subsequent handle; anchors/horizon/volume conventions required.",
    "Manual multi-bar source reference.",
    manual,
  ),
  row(
    "channel",
    "Price Channel / Rectangle",
    "Chart structure",
    "Repeated source-confirmed highs/lows bounding a trend or horizontal range.",
    "Manual fit; actual prior20 Donchian numbers are separate.",
    manual,
  ),
  row(
    "ema-style",
    "EMA20/50 Pullback",
    "Indicator styles",
    "Rising EMA alignment and first green closed bounce from EMA20.",
    "Supported uploaded long-only evidence; ATR guide is not managed trail.",
    "Pasted_content_03.txt",
  ),
  row(
    "bb-style",
    "BB20 / RSI14 Oversold Bounce",
    "Indicator styles",
    "Closed price back inside lowerBB while RSI14 crosses above30; target SMA20, stop fixed distance below wick.",
    "Source stop distance unknown; numerical trigger evidence, not exact ready source sizing.",
    "strategy-excerpt-03-continuation.txt",
  ),
  row(
    "breakout-style",
    "Breakout / RVOL / Catalyst",
    "Indicator styles",
    "Tight range breaks with relative volume≥2 and actual fundamental/news catalyst.",
    "Range/ratio context; catalyst/tick/stop-limit tools unconnected.",
    "Pasted_content_03.txt",
  ),
  row(
    "scalp-style",
    "Level2 / Tape Scalping",
    "Indicator styles",
    "Buyer wall/green prints → passive bid entry,2–5 tick stop,3–10 tick limit target.",
    "Reference-only; real tick/DOM/tape/queue/DMA unavailable.",
    "strategy-excerpt-03-continuation.txt",
  ),
  row(
    "sma-style",
    "SMA20/50 Crossover",
    "Indicator styles",
    "Fast SMA crosses above slow SMA on completed closes; reverse cross review.",
    "Numerical event recipe, not a validated complete trading strategy.",
    "https://github.com/QuantConnect/Lean · Apache-2.0; app-authored20/50 adaptation",
  ),
  row(
    "macd-style",
    "MACD12/26/9 Momentum",
    "Indicator styles",
    "SMA-seeded EMA12−EMA26 crosses signalEMA9; no automatic short.",
    "Numerical event recipe; incomplete execution and convergence limits.",
    "https://github.com/QuantConnect/Lean · Apache-2.0; app-authored cross adaptation",
  ),
  row(
    "donchian-style",
    "Donchian20 Prior-Range Break",
    "Indicator styles",
    "Close beyond prior20-bar upper/lower channel; exclude current bar.",
    "Numerical context; state/stop/size must be reviewed.",
    "https://github.com/DaveSkender/Stock.Indicators · Apache-2.0",
  ),
];
export function candleShapeObservations(
  bars: Candle[],
): { name: string; side: "long" | "short" | "neutral"; evidence: string }[] {
  const c = bars.at(-1),
    p = bars.at(-2);
  if (!c) return [];
  const range = c.high - c.low,
    body = Math.abs(c.close - c.open),
    upper = c.high - Math.max(c.open, c.close),
    lower = Math.min(c.open, c.close) - c.low,
    items: {
      name: string;
      side: "long" | "short" | "neutral";
      evidence: string;
    }[] = [];
  if (range > 0 && body <= range * 0.1)
    items.push({
      name: "Doji shape",
      side: "neutral",
      evidence:
        "App definition: real body≤10% full nonzero range; no direction/trend assertion.",
    });
  if (
    range > 0 &&
    body > 0 &&
    lower >= 2 * body &&
    upper <= body * 0.3 &&
    body <= range * 0.35
  )
    items.push({
      name: "Hammer shape",
      side: "long",
      evidence:
        "App lower shadow≥2×body; upper≤0.3×body; body≤35%range. Prior decline/reversal not verified.",
    });
  if (p) {
    const strict =
      Math.min(c.open, c.close) < Math.min(p.open, p.close) &&
      Math.max(c.open, c.close) > Math.max(p.open, p.close);
    if (strict && c.close > c.open && p.close < p.open)
      items.push({
        name: "Bullish engulfing shape",
        side: "long",
        evidence:
          "Strict full real-body coverage of previous bearish candle. No prior-trend/complete setup claim.",
      });
    if (strict && c.close < c.open && p.close > p.open)
      items.push({
        name: "Bearish engulfing shape",
        side: "short",
        evidence:
          "Strict full real-body coverage of previous bullish candle. No prior-trend/complete setup claim.",
      });
    if (c.high < p.high && c.low > p.low)
      items.push({
        name: "Inside bar",
        side: "neutral",
        evidence: "Current closed range strictly inside prior closed range.",
      });
    if (c.high > p.high && c.low < p.low)
      items.push({
        name: "Outside bar",
        side: "neutral",
        evidence: "Current closed range strictly outside prior closed range.",
      });
  }
  return items;
}
