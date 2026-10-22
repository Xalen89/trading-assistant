import type { Strategy } from "./model";
import { ORB_DEFAULT_CONFIG } from "./orb-model";

export const ORB_SOURCE =
  "User-uploaded v15044gf0000db8jia7og65ur6bf9prg.mp4 · @rp_profits · narration 00:04–00:42; app execution conventions approved 2026-10-18";
export const ORB_STRATEGY_ID = "orb-strategy";
const factor = (
  id: string,
  name: string,
  group: string,
  description: string,
) => ({ id, name, group, description, enabled: true, weight: 10 });
export const ORB_STRATEGY: Strategy = {
  id: ORB_STRATEGY_ID,
  name: "ORB Strategy",
  setupFamily: "orb",
  kind: "reference",
  description:
    "Video ORB: ES/NQ; 08:00–08:15 EST candle → breakout → 50% retest → continuation, entries 09:00–11:00 EST. NQ 50–150 points / ES 20–40 points at 3R. Owner-approved app rules: 1m closed breakout/confirmation and retest-wick +1 tick stop. No generic 09:30 replacement or validated win rate.",
  color: "#F4C878",
  visible: true,
  version: 1,
  source: ORB_SOURCE,
  orbConfig: JSON.parse(JSON.stringify(ORB_DEFAULT_CONFIG)),
  factors: [
    factor(
      "orb-session-context",
      "Untested hourly session levels",
      "Video preparation",
      "00:07–00:13 · Mark untested Asia/London/New York highs/lows on1h. Clock windows and the tested-by-later-hourly-touch convention are not supplied; choose them explicitly. No bias or target filter is inferred.",
    ),
    factor(
      "orb-range",
      "08:00–08:15 EST opening candle",
      "Video range",
      "00:13–00:16 · Exact first15m candle08:00–08:15EST. FixedUTC−5 default. Completed same-instrument15m or all15 contiguous actual1m bars; incomplete source stays unknown.",
    ),
    factor(
      "orb-breakout",
      "Break outside the opening range",
      "Video sequence / app precision",
      "00:16–00:19 · Source says break above/below. App convention: completed1m close strictly beyond the range high/low after the range closes.",
    ),
    factor(
      "orb-midpoint-retest",
      "Later opening-candle midpoint retest",
      "Video sequence / approved app precision",
      "00:19–00:22 · Source says retest the midpoint. Owner approved opening-candle50%; a strictly later1m bar must span that price. No same-bar ordering guess.",
    ),
    factor(
      "orb-continuation",
      "Later closed continuation confirmation",
      "Owner-approved app rule",
      "After the retest, a strictly later completed1m bar must close beyond the retest candle's high for long or low for short. Only the newest completed confirmation is a current trigger.",
    ),
    factor(
      "orb-clock",
      "09:00–11:00 EST entries",
      "Video time",
      "00:32–00:38 · Fresh confirmation/entry inside09:00 inclusive to11:00 exclusiveEST. This is an entry cutoff, not a forced close of an existing paper position. DST-aware New York is an explicit personal override.",
    ),
    factor(
      "orb-risk-band",
      "Exact wick-plus-tick stop and3R band",
      "Video targets / owner-approved stop",
      "00:22–00:32 · NQ target50–150points, ES20–40points,3R. Owner approved stop one outright tick beyond the retest opposite wick. CME outrightES/NQ tick0.25points; accept3R only within the source band. No additional generic display buffer or2R target.",
    ),
    factor(
      "orb-asia-gold",
      "Gold during Asia (reference only)",
      "Video unresolved variant",
      "00:38–00:42 · Source mentions gold in Asia but supplies no exact Asian opening candle, instrument/tick or clock. Not an enabled executable variant.",
    ),
  ],
};
