import type { Factor, Strategy } from "./model";
import {
  LONDON_DEFAULT_CONFIG,
  IB_DEFAULT_CONFIG,
  PIVOT_DEFAULT_CONFIG,
} from "./session-strategy-model";
const source =
  "Pasted_content_08.txt + owner timeframe instructions18October2026 · approved labelled app rules18:52:05 · unvalidated source strategy";
const factor = (
  id: string,
  name: string,
  group: string,
  description: string,
): Factor => ({ id, name, group, description, weight: 10, enabled: true });
export const SESSION_STRATEGY_PRESETS: Strategy[] = [
  {
    id: "london-breakout-reference",
    name: "London Breakout",
    setupFamily: "london-breakout",
    kind: "reference",
    color: "#38BDF8",
    visible: true,
    version: 1,
    source,
    description:
      "Exact00:00–03:00EST Asian range;15m completed close outside after03:00. Source midpoint/opposite stop and1.5R/2R/range-height targets. H1/H4 are reference views, not a fabricated3h range. AI-assisted explanation, not validated edge.",
    sessionConfig: LONDON_DEFAULT_CONFIG,
    factors: [
      factor(
        "session-range",
        "Complete Asian range",
        "Reference",
        "All actual15m periods in00:00–03:00EST; no coarse-bar inference or missing fill.",
      ),
      factor(
        "session-breakout",
        "15m close outside range",
        "Entry",
        "Completed15m close aboveAsianHigh or belowAsianLow aftercomplete referencewindow.",
      ),
      factor(
        "session-risk",
        "Source stop and target",
        "Risk",
        "Source alternatives; approved defaultmidpoint+2R; actual fill geometry muststayvalid.",
      ),
      factor(
        "session-clock",
        "Declared London clock",
        "Time",
        "FixedEST supplied; optionalNewYork/DST is a personal override. Same-local-date scope, no invented London cutoff.",
      ),
    ],
  },
  {
    id: "initial-balance-reference",
    name: "Initial Balance (IB) Breakout",
    setupFamily: "initial-balance",
    kind: "reference",
    color: "#FBBF24",
    visible: true,
    version: 1,
    source,
    description:
      "Exact09:30–10:30EST range; completed15m/30m breakout afterward. Approved app high-volume≥1.5×prior20same-frame bars, midpoint stop and10:30–11:30monitoring; source TP1×range beyond brokenboundary. No measured institutional/statistical edge.",
    sessionConfig: IB_DEFAULT_CONFIG,
    factors: [
      factor(
        "session-range",
        "Complete initial balance",
        "Reference",
        "Exactfirst60minutes09:30–10:30EST, not09:00H1 candle; no entry beforecomplete.",
      ),
      factor(
        "session-breakout",
        "15m/30m post-IB close",
        "Entry",
        "Decision candle startsat/after10:30 and completesaboveIBHigh or belowIBLow.",
      ),
      factor(
        "session-high-volume",
        "Known high venue volume",
        "Volume",
        "Approved app definition1.5×prior20completed same-timeframe bars; latest excludedfrombaseline; unknownbrokerVdoesnotqualify.",
      ),
      factor(
        "session-risk",
        "IB expansion bracket",
        "Risk",
        "Source midpoint/insideboundary stop; TPoneIBheight beyondbrokenedge, notfromentry.",
      ),
      factor(
        "session-clock",
        "Approved app window",
        "Time",
        "10:30–11:30EST defaultmonitoring cutoff is app-added, not a measuredstatistical result.",
      ),
    ],
  },
  {
    id: "pdc-continuation-reference",
    name: "Red-to-Green / Green-to-Red Continuation",
    setupFamily: "pdc-continuation",
    kind: "reference",
    color: "#A78BFA",
    visible: true,
    version: 1,
    source,
    description:
      "1m/5m primary;09:30–10:00EST observedquote PDCcross withdayopening side and knownrisingvolume. Owner mustchoosePDCsessionbasis,truepriceTick andtarget before execution. SampledRESTcrossing—not first-tick tape or a15mclose substitute.",
    sessionConfig: PIVOT_DEFAULT_CONFIG,
    factors: [
      factor(
        "pivot-pdc",
        "Declared previous close",
        "Reference",
        "ProvidercontinuousUTCday or explicitly declared observedsessionclose; no midnight-as-US-close substitution.",
      ),
      factor(
        "pivot-opening-side",
        "Red/green opening side",
        "Context",
        "Exactcompleted09:30opening minute belowPDCforlong/aboveshort; missingopenunknown.",
      ),
      factor(
        "pivot-quote-cross",
        "Observed quote cross",
        "Entry",
        "Monotonictimestamped same-source prior/current quotescrossPDC; no synthetic previousquote or guarantee of firsttick.",
      ),
      factor(
        "pivot-rising-volume",
        "Completed venue-volume rise",
        "Volume",
        "Approved app proxy:latestcompleted1m/5mVgreaterthanprevioussameperiod; not guessed broker volume.",
      ),
      factor(
        "pivot-morning-stop",
        "Morning extreme + true tick",
        "Risk",
        "Completed observed morningrange plusowner-declaredactualminimum priceincrement, notdisplaydigits.",
      ),
      factor(
        "session-risk",
        "Owner target level",
        "Risk",
        "Explicitlong/shortkeylevel orcompleteowner-declaredpremarketwindow; no invented generic2R.",
      ),
    ],
  },
];
