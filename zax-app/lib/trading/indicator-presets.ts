import type { Factor, Strategy, Timeframe } from "./model";
import { GITHUB_PRESETS, type GitHubFamily } from "./github-presets";

export type IndicatorFamily =
  | "trend-following"
  | "breakout-momentum"
  | "mean-reversion"
  | "scalping"
  | GitHubFamily;
const factor = (
  id: string,
  name: string,
  group: string,
  description: string,
): Factor => ({ id, name, group, description, weight: 10, enabled: true });
const source = (lines: string) =>
  `Pasted_content_03.txt · lines ${lines} · uploaded strategy reference, not user-authored/validated performance`;
export const INDICATOR_PRESETS: Strategy[] = [
  ...GITHUB_PRESETS,
  {
    id: "trend-following",
    name: "Trend-Following · EMA Pullback",
    color: "#67E8F9",
    kind: "reference",
    visible: true,
    version: 1,
    source: source("2–15"),
    description:
      "Swing/position reference: D / 4H / W, days to months. EMA20/50 uptrend → first green close bouncing off EMA20. Stop below swing or EMA50; 2×ATR trailing guide. Long rules only; trail is not automatically executed.",
    factors: [
      factor(
        "trend-frame",
        "D / 4H / W execution context",
        "Timeframe",
        "Source timeframe: Daily, 4-Hour or Weekly; holding period days to months.",
      ),
      factor(
        "ema-trend",
        "EMA20 / EMA50 rising uptrend",
        "Trend",
        "Price persists above EMA20/50, with averages fanning upward. App operationalization: close > EMA20 > EMA50 and both averages rising over five closed bars.",
      ),
      factor(
        "ema-pullback",
        "EMA20 pullback",
        "Entry",
        "A recent candle touches EMA20 while the broader uptrend remains upward.",
      ),
      factor(
        "ema-bounce",
        "First green EMA20 bounce close",
        "Entry",
        "Buy on the first green candle close bouncing off EMA20 after a minor pullback. App uses a six-bar recent-touch window and requires the first qualifying bounce to be the latest closed bar.",
      ),
      factor(
        "ema-stop",
        "Swing / EMA50 stop reference",
        "Risk",
        "Stop below the lowest confirmed local swing or below EMA50; structural choice remains reviewable.",
      ),
      factor(
        "atr-trail",
        "2×ATR trailing guide",
        "Exit",
        "Source proposes a trailing stop, e.g. 2×ATR. App uses Wilder ATR14 as an explicit convention and displays close − 2×ATR as a guide, not an automatically managed/ratcheted stop.",
      ),
    ],
  },
  {
    id: "breakout-momentum",
    name: "Breakout & Momentum",
    color: "#FDBA74",
    kind: "reference",
    visible: true,
    version: 1,
    source: source("17–28"),
    description:
      "Intraday 1m / 5m / 15m, minutes to hours. Tight/low-volume consolidation → resistance breakout with RVOL ≥2 and an actual news/fundamental catalyst. Buy-stop-limit 1–2 real ticks above resistance; below-range stop; 2R/3R. Catalyst/tick/orderbook feeds are not connected.",
    factors: [
      factor(
        "breakout-frame",
        "1m / 5m / 15m timeframe",
        "Timeframe",
        "Source timeframe: 1-Minute, 5-Minute or 15-Minute; holding period minutes to hours.",
      ),
      factor(
        "breakout-range",
        "Consolidation / resistance break",
        "Structure",
        "Source tight range or flag, low volume, then high-volume green breakout. App baseline uses prior ten-bar resistance, range width ≤2×prior ATR14 and a green close through it; this is not a bull-flag/wedge detector.",
      ),
      factor(
        "breakout-rvol",
        "Relative volume ≥2.0×",
        "Volume",
        "Current completed-bar volume divided by prior twenty same-timeframe bars (excluding current); requires known positive source volume. This is not time-of-day-normalized or consolidated stock RVOL.",
      ),
      factor(
        "breakout-catalyst",
        "News / fundamental catalyst",
        "Context",
        "An actual key news or fundamental catalyst is required; never inferred from candles, prices, RSI or generic calendar records.",
      ),
      factor(
        "breakout-stop-limit",
        "Buy-stop-limit 1–2 real ticks above resistance",
        "Entry",
        "Source entry uses stop-limit above resistance/flag high. Real instrument tick metadata is required; display precision is not tick size. Stop-limit order type is not implemented in the paper engine.",
      ),
      factor(
        "breakout-risk",
        "Below-range stop / 2R or 3R target",
        "Risk",
        "Stop below consolidation or breakout-candle low, with fixed 1:2 or 1:3 risk-to-reward target.",
      ),
      factor(
        "breakout-tools",
        "Level2 / tape / volume-profile tools",
        "Tools",
        "Source lists Level2 order book, Time & Sales and Volume Profile. Existing OHLC does not supply these; no fabricated order flow is shown.",
      ),
    ],
  },
  {
    id: "mean-reversion",
    name: "Mean Reversion · BB / RSI Bounce",
    color: "#C4B5FD",
    kind: "reference",
    visible: true,
    version: 1,
    source: `${source("28–35")}; user-supplied continuation at 17:26, preserved in strategy-excerpt-03-continuation.txt`,
    description:
      "15m / 1h / D, hours to days. Oversold long bounce: close back inside lowerBB while RSI14 crosses above30; fixed distance below recent extreme wick; primary target SMA20. Stop distance unspecified. No mirrored shorts or RSI divergence is inferred.",
    factors: [
      factor(
        "reversion-frame",
        "15m / 1h / D context",
        "Timeframe",
        "Source timeframe: 15-Minute, 1-Hour or Daily; holding period hours to days.",
      ),
      factor(
        "bb-extreme",
        "Price outside BB20 ±2σ",
        "Context",
        "Price pierces or stretches beyond the upper/lower twenty-period Bollinger Band, two standard deviations. App uses close SMA and population standard deviation.",
      ),
      factor(
        "rsi-extreme",
        "RSI14 >70 / <30",
        "Context",
        "Wilder RSI14 >70 for upper-band stretch, <30 for lower-band stretch. These thresholds are not proof of divergence or a reversal.",
      ),
      factor(
        "bb-reentry",
        "Closed price back inside lower band",
        "Entry",
        "Following oversold lower-band context, the latest closed price is back inside the lower Bollinger Band; it is not a still-forming tick.",
      ),
      factor(
        "rsi-cross",
        "RSI14 crosses back above30",
        "Entry",
        "Previous completed RSI≤30 and latest completed RSI>30, alongside the lower-band re-entry.",
      ),
      factor(
        "wick-stop",
        "Fixed distance below recent extreme wick",
        "Risk",
        "Source stop is a fixed distance below the recent extreme price wick. Distance was not supplied; the app shows the wick and leaves exact source stop/sizing unconfirmed.",
      ),
      factor(
        "mean-target",
        "SMA20 primary target",
        "Exit",
        "Source primary target is the middle Bollinger Band (twenty-period close SMA). If below2R, it is not silently substituted for the generic paper2R template.",
      ),
    ],
  },
  {
    id: "scalping",
    name: "Scalping · Level2 / Tape Reference",
    color: "#FB7185",
    kind: "reference",
    visible: true,
    version: 1,
    source:
      "User-supplied strategy-excerpt-03-continuation.txt · scalping rules; reference-only",
    description:
      "5s / 15s / 1m tick charts; seconds to minutes. Buyer wall on Level2 or heavy green tape prints → passive bid entry;2–5 tick stop;3–10 tick limit target. No DOM/tape/tick/DMA/queue source is connected. REST15s polling is not a tick feed or a bid-fill guarantee.",
    factors: [
      factor(
        "scalp-feed",
        "Actual tick / microstructure feed",
        "Data",
        "Require actual5s/15s/1m tick context, Level2 depth and Time&Sales. OHLC/REST cannot reveal buyer walls or tape prints.",
      ),
      factor(
        "scalp-entry",
        "Buyer wall or heavy green tape / bid entry",
        "Entry",
        "Buy at bid when a large buyer wall appears on Level2 or heavy green prints sweep tape. A passive bid order may not fill; queue/size evidence is required.",
      ),
      factor(
        "scalp-stop",
        "Immediate2–5 real tick stop",
        "Risk",
        "Source typically uses2–5 instrument ticks. Real tick metadata is unknown; decimal display precision is not tick size.",
      ),
      factor(
        "scalp-target",
        "Limit3–10 real ticks above entry",
        "Exit",
        "Source target3–10 actual ticks above entry. No live DMA order or simulated unobserved queue fill is created.",
      ),
    ],
  },
];
export const INDICATOR_INFO: Record<
  IndicatorFamily,
  { frames: Timeframe[]; status: string; holding: string; missing: string }
> = {
  "sma-crossover": {
    frames: ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"],
    status: "Numerical signal recipe · no complete execution model",
    holding: "User-defined",
    missing:
      "51 closed bars; app-authored20/50 adaptation. Stop/size/fill are not provided by the source sample.",
  },
  "macd-momentum": {
    frames: ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"],
    status: "Numerical momentum event · no complete execution model",
    holding: "User-defined",
    missing:
      "35 closed bars for comparison; convergence history matters. Source threshold method differs from this close-cross adaptation.",
  },
  "donchian-breakout": {
    frames: ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"],
    status: "Prior-range event · state/stop rules not complete",
    holding: "User-defined",
    missing:
      "21 closed bars. Excludes current bar. No held-position state, source sizing or complete stop/fill model is reconstructed.",
  },
  "trend-following": {
    frames: ["4h" as Timeframe, "1d", "1w" as Timeframe],
    status: "Closed-bar long-only operational model",
    holding: "Days to months",
    missing:
      "2×ATR is a visual guide. Automatic trail execution is not configured; existing paper partial/BE rules are different.",
  },
  "breakout-momentum": {
    frames: ["1m", "5m", "15m"],
    status: "Structural watch · source prerequisites missing",
    holding: "Minutes to hours",
    missing:
      "No catalyst, real tick-size, stop-limit execution, Level2, tape or volume-profile feed. Broker volume may be indicative/tick volume.",
  },
  "mean-reversion": {
    frames: ["15m", "1h", "1d"],
    status: "Closed-bar rebound evidence · source stop distance unknown",
    holding: "Hours to days",
    missing:
      "Fixed stop distance below wick was not specified; no divergence definition or mirrored shorts. Source SMA20 target may differ from generic paper2R review.",
  },
  scalping: {
    frames: ["1m"],
    status: "Reference-only · tick/orderflow sources missing",
    holding: "Seconds to minutes",
    missing:
      "No5s/15s tick, Level2, tape, DMA, real tick-size or passive queue-fill evidence.1mOHLC is not a substitute.",
  },
};
export function isIndicatorFamily(family: string): family is IndicatorFamily {
  return INDICATOR_PRESETS.some((p) => p.id === family);
}
