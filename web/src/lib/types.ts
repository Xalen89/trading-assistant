export type Instrument = "NAS100" | "XAUUSD";
export type Timeframe = "5m" | "15m" | "1h" | "4h" | "1d";
export type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
export type Strategy = { id: string; name: string; description: string; rules: string[]; parameters: Record<string, number | string | boolean> };
export type Trade = {
  id: string; strategyId: string; instrument: Instrument; timeframe: Timeframe;
  direction: "long" | "short"; entry: number; exit: number; quantity: number;
  entryTime: string; exitTime: string; notes: string;
};
export type Analysis = {
  id: string; createdAt: string; instrument: Instrument; timeframe: Timeframe; strategyId: string;
  summary: string; confidence: number; direction: "long" | "short" | "wait"; patterns: string[];
  levels: { label: string; price: number }[]; source: "claude" | "demo"; sampleSize: number; historicalWinRate: number | null;
};
export type Prices = { candles: Candle[]; instrument: Instrument; timeframe: Timeframe; source: "demo" | "oanda"; asOf: string };
export type Backtest = {
  totalTrades: number; wins: number; losses: number; winRate: number | null; netPnl: number;
  patterns: string[]; summary: string; source: "claude" | "demo"; limitations: string[];
};
