import type { SessionStrategyConfig } from "./session-strategy-model";

/** Read-only facts; a detected configuration still requires save and fresh native gates. */
export type InstrumentFacts = {
  market: string;
  providerSymbol: string;
  source: string;
  retrievedAt: number;
  tick?: { value: number; source: string };
  dailyBasis?: "utc-continuous-24h" | "utc-provider-trading-days";
  volumeBasis: "venue" | "broker-reported" | "unknown";
  messages: string[];
};
export type PreparedInstrumentSetup = {
  market: string;
  facts: InstrumentFacts;
  config: SessionStrategyConfig;
  status: "ready" | "partial";
  previousDay?: {
    close: number;
    high: number;
    low: number;
    barAt: number;
    closeAt: number;
    source: string;
  };
  volumeSample: {
    bars: number;
    positiveBars: number;
    basis: InstrumentFacts["volumeBasis"];
  };
  choices: string[];
  warnings: string[];
};
