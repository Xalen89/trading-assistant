export type GlossaryEntry = {
  id: string;
  term: string;
  definition: string;
  groupIds: string[];
};

/**
 * Plain-language definitions shared by the feature guide. Other surfaces can
 * mount these as inline tips without copying terminology into their UI.
 */
export const GLOSSARY: readonly GlossaryEntry[] = [
  {
    id: "manus",
    term: "Manus",
    definition:
      "The workspace host and sign-in service used by this app; it is not a broker or a market-data venue.",
    groupIds: [
      "markets",
      "chart",
      "strategies",
      "library",
      "screenshots",
      "coach",
      "paper",
      "journal",
      "discipline",
      "alerts",
    ],
  },
  {
    id: "closed-bar",
    term: "closed bar",
    definition:
      "A completed price interval. Its OHLC values no longer change; a forming bar can still change.",
    groupIds: [
      "chart",
      "strategies",
      "historical",
      "forecast",
      "alerts",
      "pairs",
      "momentum",
      "macro",
      "ml",
    ],
  },
  {
    id: "sample-mode",
    term: "Sample mode",
    definition:
      "A clearly marked demonstration data setting, not a substitute for sourced market evidence.",
    groupIds: ["chart", "strategies", "historical", "forecast", "alerts"],
  },
  {
    id: "source-version",
    term: "source version",
    definition:
      "The specific revision of a strategy or source record that an observation, result, or paper action belongs to.",
    groupIds: [
      "strategies",
      "library",
      "screenshots",
      "historical",
      "forecast",
      "paper",
      "journal",
      "alerts",
    ],
  },
  {
    id: "confluence",
    term: "confluence",
    definition:
      "Several separately checked conditions considered together; it is not a probability or an order instruction.",
    groupIds: ["chart", "strategies", "paper", "alerts"],
  },
  {
    id: "fvg",
    term: "FVG",
    definition:
      "Fair Value Gap: an app-defined three-bar price gap zone used as chart context.",
    groupIds: ["chart", "strategies", "historical", "alerts"],
  },
  {
    id: "ce",
    term: "CE",
    definition:
      "Consequent Encroachment: the midpoint of an FVG or other defined range in this guide’s terminology.",
    groupIds: ["chart", "strategies", "historical", "alerts"],
  },
  {
    id: "ob",
    term: "OB",
    definition:
      "Order Block: a rule-defined price zone in a strategy model, not a record of broker order flow.",
    groupIds: ["chart", "strategies", "historical", "alerts"],
  },
  {
    id: "mss",
    term: "MSS",
    definition:
      "Market Structure Shift: a rule-defined change in swing structure used by supported setup analysis.",
    groupIds: ["strategies", "historical", "alerts"],
  },
  {
    id: "ote",
    term: "OTE",
    definition:
      "Optimal Trade Entry: a labelled range-ratio convention in the chart overlay, not an execution signal.",
    groupIds: ["chart", "strategies"],
  },
  {
    id: "pdh-pdl",
    term: "PDH/PDL",
    definition:
      "Previous Day High / Previous Day Low from completed provider-day data.",
    groupIds: ["chart", "strategies", "historical"],
  },
  {
    id: "stdv",
    term: "STDV",
    definition:
      "Standard-deviation notation used for volatility bands or target conventions; it is not a guarantee of normal returns.",
    groupIds: ["strategies", "pairs", "momentum", "macro", "ml"],
  },
  {
    id: "wr1",
    term: "WR1",
    definition:
      "A bundled source-reference label and risk-disclaimer context, not a personal trading system.",
    groupIds: ["strategies", "chart", "historical", "alerts"],
  },
  {
    id: "silver-bullet",
    term: "Silver Bullet",
    definition:
      "A named source setup whose session timing remains a manual check in the documented analysis.",
    groupIds: ["strategies", "chart", "historical", "alerts"],
  },
  {
    id: "mae",
    term: "MAE",
    definition:
      "Maximum Adverse Excursion: the largest unfavourable move observed during a recorded paper trade.",
    groupIds: ["paper", "journal"],
  },
  {
    id: "mfe",
    term: "MFE",
    definition:
      "Maximum Favourable Excursion: the largest favourable move observed during a recorded paper trade.",
    groupIds: ["paper", "journal"],
  },
  {
    id: "wilson-interval",
    term: "Wilson interval",
    definition:
      "A confidence interval for an observed proportion; it describes the recorded sample and is not predictive probability.",
    groupIds: ["journal", "discipline", "ml"],
  },
  {
    id: "cointegration",
    term: "cointegration",
    definition:
      "A statistical relationship in which a combination of non-stationary series may be stable; it does not establish a tradable edge.",
    groupIds: ["pairs"],
  },
  {
    id: "adf",
    term: "ADF",
    definition:
      "Augmented Dickey–Fuller test, a residual-stationarity diagnostic used by the pairs model.",
    groupIds: ["pairs"],
  },
  {
    id: "inverse-volatility",
    term: "inverse volatility",
    definition:
      "A weighting method that gives relatively less weight to assets with higher measured volatility.",
    groupIds: ["momentum", "macro"],
  },
  {
    id: "slippage",
    term: "slippage",
    definition:
      "An entered cost assumption for the difference between a reference price and a hypothetical execution price.",
    groupIds: ["paper", "pairs", "momentum", "making", "macro", "ml"],
  },
  {
    id: "purge",
    term: "purge",
    definition:
      "Removing overlapping labelled observations around a validation split to reduce information leakage.",
    groupIds: ["ml"],
  },
  {
    id: "embargo",
    term: "embargo",
    definition:
      "An exclusion interval after a validation segment that further reduces label overlap; this guide does not claim it is implemented unless stated.",
    groupIds: ["ml"],
  },
  {
    id: "cpcv",
    term: "CPCV",
    definition:
      "Combinatorial Purged Cross-Validation, a financial validation method that evaluates multiple purged train/test paths.",
    groupIds: ["ml"],
  },
  {
    id: "oos",
    term: "OOS",
    definition:
      "Out-of-sample: data held aside from model fitting for a separate evaluation.",
    groupIds: ["pairs", "momentum", "making", "macro", "ml"],
  },
] as const;

export const glossaryForGroup = (groupId: string): readonly GlossaryEntry[] =>
  GLOSSARY.filter((entry) => entry.groupIds.includes(groupId));
