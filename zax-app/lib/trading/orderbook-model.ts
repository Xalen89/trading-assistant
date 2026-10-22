export type BookLevel = { price: number; quantity: number };
export type BookSnapshot = {
  time: number;
  bids: BookLevel[];
  asks: BookLevel[];
};
export type OrderBookInput = {
  instrument: string;
  source: string;
  rightsConfirmed: true;
  snapshots: BookSnapshot[];
  spec: {
    horizonSeconds: 600 | 900;
    trainingSeconds: 1800;
    testSeconds: 10;
    maxFolds: number;
  };
};
export type OrderBookFold = {
  trainStart: number;
  trainEnd: number;
  testStart: number;
  testEnd: number;
  trainRows: number;
  testRows: number;
  purgedRows: number;
  accuracy: number | null;
  balancedAccuracy: number | null;
  precision: number | null;
  recall: number | null;
  baselineAccuracy: number | null;
  confusion: [[number, number], [number, number]];
  testWindowExclusiveEnd?: number;
  metricScope?: string;
  reason?: string;
};
export type OrderBookReport = {
  kind: "orderbook-ml";
  engine: string;
  instrument: string;
  source: string;
  generatedAt: number;
  snapshots: number;
  featureRows: number;
  features: number;
  horizonSeconds: number;
  models: {
    name: string;
    status: "complete" | "skipped";
    reason?: string;
    configuration?: Record<string, string | number | boolean | null>;
    metricScope?: string;
    folds: OrderBookFold[];
  }[];
  limitations: string[];
  probability: null;
};

export type BookDisclosure = {
  sampling?: {
    mode: string;
    gapDisclosure: {
      minimumSeconds: number;
      medianSeconds: number;
      maximumSeconds: number;
    };
  };
  dataset?: {
    labelledRows: number;
    excludedForLookback: number;
    excludedForFutureTailOrCoverage: number;
  };
  evaluation?: {
    selection: string;
    trainingBound: string;
    candidateAccounting: string;
  };
};
