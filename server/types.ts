export const instruments = ['NAS100', 'XAUUSD'] as const;
export const timeframes = ['5m', '15m', '1h', '4h', '1d'] as const;
export type Instrument = typeof instruments[number];
export type Timeframe = typeof timeframes[number];
export const seconds: Record<Timeframe, number> = { '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 };
export interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number }
export interface Strategy {
  id: string; name: string; description: string; rules: string[];
  parameters: Record<string, number | string | boolean>;
}
export interface Trade {
  id: string; strategyId: string; instrument: Instrument; timeframe: Timeframe;
  direction: 'long' | 'short'; entry: number; exit: number; quantity: number;
  entryTime: string; exitTime: string; notes: string;
  stopLoss?: number; takeProfit?: number; riskAmount?: number;
}
export interface Analysis {
  id: string; createdAt: string; instrument: Instrument; timeframe: Timeframe; strategyId: string;
  summary: string; confidence: number; direction: 'long' | 'short' | 'wait';
  patterns: string[]; levels: { label: string; price: number }[];
  source: 'claude' | 'demo'; sampleSize: number; historicalWinRate: number | null;
}
export interface Backtest {
  totalTrades: number; wins: number; losses: number; winRate: number | null;
  netPnl: number; patterns: string[]; summary: string; source: 'claude' | 'demo'; limitations: string[];
}
export interface PriceQuery {
  instrument: Instrument; timeframe: Timeframe; limit: number; from?: string; to?: string;
}
export interface TradeFilter { instrument?: Instrument; strategyId?: string; timeframe?: Timeframe; from?: string; to?: string }
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
