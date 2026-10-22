import type { Factor, Strategy } from "./model";
import type { SetupFamily } from "./setup-model";
import { INDICATOR_PRESETS } from "./indicator-presets";
import { ORB_STRATEGY } from "./orb-presets";
import { SESSION_STRATEGY_PRESETS } from "./session-strategy-presets";

const SOURCE =
  "Pasted_content_01.txt · user-provided setup reference, not a proprietary user strategy";
const factor = (
  id: string,
  name: string,
  group: string,
  description: string,
): Factor => ({ id, name, group, description, weight: 10, enabled: true });

/**
 * Reference rulebooks transcribed as small, inspectable setup definitions.  They are
 * deliberately separate from WR1 and user-authored strategies: only the deterministic
 * factors below are eligible for automatic OHLC evaluation.
 */
export const SETUP_PRESETS: Strategy[] = [
  ...INDICATOR_PRESETS,
  ORB_STRATEGY,
  ...SESSION_STRATEGY_PRESETS,
  {
    id: "vwap-stdv",
    name: "STDV · VWAP Re-entry",
    setupFamily: "vwap-stdv",
    description:
      "Rolling20-bar OHLCV VWAP proxy ±2.5σ. Prior outside-band close then closed-bar re-entry. Source-supplied2.5σ; app-authored20-bar window and five-bar extreme stop. Venue volume is required; not tickVWAP or validated edge.",
    color: "#B8A2FF",
    kind: "reference",
    visible: true,
    version: 1,
    source:
      "Pasted_content_04.txt · rolling VWAP±2.5σ rule; explicit app conventions",
    factors: [
      factor(
        "vwap-stdv-reentry",
        "Closed-band re-entry",
        "Entry",
        "Previous close outside±2.5σ followed by completed close inside",
      ),
      factor(
        "vwap-stdv-known-volume",
        "Known venue volume",
        "Data",
        "Coinbase venue OHLCV only; broker volume semantics remain unknown",
      ),
      factor(
        "vwap-stdv-target-vwap",
        "VWAP target",
        "Risk",
        "App-authored rollingVWAP target and five-bar wick extreme stop; canonicalriskgeometry stillrequired",
      ),
    ],
  },
  {
    id: "core-sequence",
    name: "Core Sequence",
    description:
      "HTF context → liquidity sweep → opposite displacement/MSS → FVG or last-opposite order-block CE retest.",
    color: "#7DD3FC",
    kind: "reference",
    visible: true,
    version: 1,
    source: SOURCE,
    factors: [
      factor(
        "htf-context",
        "Higher-timeframe directional context",
        "Context",
        "Closed hourly structure only.",
      ),
      factor(
        "liquidity-sweep",
        "Prior swing liquidity sweep",
        "Liquidity",
        "Closed-bar sweep and rejection of a confirmed prior swing.",
      ),
      factor(
        "displacement-mss",
        "Opposite displacement and MSS",
        "Structure",
        "Directional body at least the prior ATR and a structural close-through.",
      ),
      factor(
        "fvg",
        "Fair-value-gap CE",
        "PD array",
        "Regular three-bar FVG midpoint.",
      ),
      factor(
        "order-block",
        "Last opposite order-block CE",
        "PD array",
        "Body midpoint of the last opposite candle before displacement.",
      ),
      factor(
        "retest",
        "POI CE retracement",
        "Entry",
        "A later closed bar must touch the selected CE.",
      ),
    ],
  },
  {
    id: "silver-bullet",
    name: "Sweep + FVG / Silver Bullet",
    description:
      "Reference sweep-and-FVG execution sequence; session labels require separate source-confirmed timing and are not auto-confirmed.",
    color: "#C4B5FD",
    kind: "reference",
    visible: true,
    version: 1,
    source: SOURCE,
    factors: [
      factor(
        "htf-context",
        "Higher-timeframe directional context",
        "Context",
        "Closed hourly structure only.",
      ),
      factor(
        "liquidity-sweep",
        "Prior swing liquidity sweep",
        "Liquidity",
        "Closed-bar sweep and rejection.",
      ),
      factor(
        "displacement-mss",
        "Opposite displacement and MSS",
        "Structure",
        "Body versus prior ATR plus structural shift.",
      ),
      factor(
        "fvg",
        "Fair-value-gap CE",
        "PD array",
        "Regular three-bar FVG midpoint.",
      ),
      factor(
        "retest",
        "FVG CE retracement",
        "Entry",
        "A later closed bar must touch the CE.",
      ),
      factor(
        "session-manual",
        "Session timing (manual/source-connected)",
        "Time",
        "Not inferred from OHLC alone.",
      ),
    ],
  },
  {
    id: "ob-retest",
    name: "Order Block Retest",
    description:
      "Reference sequence using the last opposite candle body/CE before a confirmed displacement and MSS.",
    color: "#FBBF24",
    kind: "reference",
    visible: true,
    version: 1,
    source: SOURCE,
    factors: [
      factor(
        "htf-context",
        "Higher-timeframe directional context",
        "Context",
        "Closed hourly structure only.",
      ),
      factor(
        "liquidity-sweep",
        "Prior swing liquidity sweep",
        "Liquidity",
        "Closed-bar sweep and rejection.",
      ),
      factor(
        "displacement-mss",
        "Opposite displacement and MSS",
        "Structure",
        "Body versus prior ATR plus structural shift.",
      ),
      factor(
        "order-block",
        "Last opposite order-block CE",
        "PD array",
        "Body midpoint before displacement.",
      ),
      factor(
        "retest",
        "Order-block CE retracement",
        "Entry",
        "A later closed bar must touch the CE.",
      ),
    ],
  },
  {
    id: "stdv",
    name: "STDV Manipulation-Range Targets",
    description:
      "Named -2/-2.5/-4 manipulation-range Fibonacci extensions. They are targets, not statistical standard deviations or a standalone entry model.",
    color: "#FB7185",
    kind: "reference",
    visible: true,
    version: 1,
    source: SOURCE,
    factors: [
      factor(
        "liquidity-sweep",
        "Manipulation sweep anchor",
        "Liquidity",
        "The sweep extreme supplies one range anchor.",
      ),
      factor(
        "displacement-mss",
        "Displacement/MSS anchor",
        "Structure",
        "The confirmed opposite displacement supplies the other anchor.",
      ),
      factor(
        "stdv-targets",
        "-2, -2.5 and -4 extensions",
        "Targets",
        "Negative-ratio source labels projected from an explicitly documented manipulation range.",
      ),
    ],
  },
];

/** Only unchanged source factor definitions, not similar names, can use fixed OHLC detectors. */
export function resolveSetupFamily(strategy: Strategy): SetupFamily {
  if (strategy.id === "wr1") return "custom";
  const same = (reference: Strategy) =>
    strategy.factors.length === reference.factors.length &&
    strategy.factors.every((f) => {
      const original = reference.factors.find((o) => o.id === f.id);
      return (
        original &&
        f.enabled === original.enabled &&
        f.description === original.description &&
        f.name === original.name
      );
    });
  const source = SETUP_PRESETS.find((p) => same(p));
  return source
    ? (source.setupFamily ?? (source.id as Exclude<SetupFamily, "custom">))
    : "custom";
}
export const isSupportedSetupFamily = (
  family: SetupFamily,
): family is Exclude<SetupFamily, "custom"> => family !== "custom";
