import type { Strategy, Factor } from "./model";
export type GitHubFamily =
  | "sma-crossover"
  | "macd-momentum"
  | "donchian-breakout";
const f = (id: string, name: string, description: string): Factor => ({
  id,
  name,
  description,
  group: "GitHub-inspired reference",
  weight: 10,
  enabled: true,
});
export const GITHUB_PRESETS: Strategy[] = [
  {
    id: "sma-crossover",
    name: "SMA20 / 50 · Close Crossover",
    kind: "reference",
    version: 1,
    visible: true,
    color: "#86EFAC",
    source:
      "https://github.com/QuantConnect/Lean/blob/master/Algorithm.Python/MovingAverageCrossAlgorithm.py · Apache-2.0; app-authored SMA20/50 adaptation, no source code copied",
    description:
      "Completed-close SMA20 crosses above SMA50; reverse cross is an exit/review event, not a short.51 closes needed. Educational signal recipe; source sample is EMA15/30, not these app parameters. Risk/stop and execution are reviewed separately.",
    factors: [
      f(
        "sma-warmup",
        "51 completed closes",
        "SMA20/50 include the current closed price; require current and previous SMA values.",
      ),
      f(
        "sma-cross",
        "SMA20 crosses above SMA50",
        "Current SMA20>SMA50 and previous SMA20≤SMA50. Equality alone is not an entry.",
      ),
      f(
        "sma-exit",
        "Reverse cross = exit/review",
        "Current SMA20<SMA50 and previous SMA20≥SMA50. No short strategy or automatic position exit is inferred.",
      ),
      f(
        "sma-risk",
        "Separate stop/size review",
        "Reference gives a signal recipe, not a source-authorized stop distance, target, sizing or fill assumption. Generic2R paper review is distinct.",
      ),
    ],
  },
  {
    id: "macd-momentum",
    name: "MACD12 / 26 / 9 · Momentum Cross",
    kind: "reference",
    version: 1,
    visible: true,
    color: "#93C5FD",
    source:
      "https://github.com/QuantConnect/Lean/blob/master/Algorithm.Python/MACDTrendAlgorithm.py · Apache-2.0; app-authored close-cross adaptation, not source threshold strategy; no copied code",
    description:
      "EMA12−EMA26 crosses above SMA-seeded EMA9 signal on completed closes; reverse cross is review/exit context, not a short.35 closes for first pair; early seeded values need convergence history. No zero/volume/news filter or predictive claim.",
    factors: [
      f(
        "macd-seed",
        "SMA-seeded EMA12/26 and signal9",
        "Price EMA12/26 seed their period SMA; signal9 seeds the first nine available MACD values.35 closed values allow current/prior signal comparison; additional history improves convergence.",
      ),
      f(
        "macd-cross",
        "MACD crosses above signal9",
        "Current MACD>signal and previous MACD≤signal; actual completed-bar crossover, not only positive histogram.",
      ),
      f(
        "macd-exit",
        "Reverse cross review",
        "Current MACD<signal and previous MACD≥signal. No silent short or automatic broker/paper exit.",
      ),
      f(
        "macd-risk",
        "Separate stop/size review",
        "The original source uses normalized thresholds; this is an app-authored crossover variant. Source-specific sizing/brackets are not supplied.",
      ),
    ],
  },
  {
    id: "donchian-breakout",
    name: "Donchian20 · Prior-Range Breakout",
    kind: "reference",
    version: 1,
    visible: true,
    color: "#FDBA74",
    source:
      "https://github.com/DaveSkender/Stock.Indicators → facioquo/stock-indicators-dotnet · https://dotnet.stockindicators.dev/indicators/donchian · Apache-2.0; app-authored prior-bar recipe, no copied code",
    description:
      "Close above the prior20-bar highest high; lower prior20-bar low is a review/exit threshold. Current bar excluded;21 closed bars minimum. State/fills are not reconstructed from a chart snapshot. No complete tested strategy or automatic exit.",
    factors: [
      f(
        "donchian-window",
        "Prior20 high/low; current bar excluded",
        "At completed t: upper=max(high[t−20…t−1]); lower=min(low[t−20…t−1]). Require21 bars, not current-inclusive breakout thresholds.",
      ),
      f(
        "donchian-break",
        "Close strictly above prior20 upper",
        "Equality is not a breakout. This is a numerical long watch event; active/flat position state is separate.",
      ),
      f(
        "donchian-exit",
        "Close below prior20 lower = review",
        "Review long exit if close<lower; do not infer a currently held position or open short.",
      ),
      f(
        "donchian-risk",
        "Separate stop/size/state review",
        "Donchian source defines an indicator, not this trading rule or risk allocation. Source-specific stop/fill/state remains user reviewed.",
      ),
    ],
  },
];
export function isGitHubFamily(family: string): family is GitHubFamily {
  return GITHUB_PRESETS.some((p) => p.id === family);
}
