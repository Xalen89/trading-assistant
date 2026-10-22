import { randomUUID } from 'node:crypto';
import { AIService, pnl, type HistoricalSample } from './ai.js';
import type { PriceProvider } from './prices.js';
import type { Repository } from './repository.js';
import { ApiError, seconds, type Analysis, type Backtest, type Candle, type Instrument, type Timeframe, type Trade } from './types.js';

export function metrics(trades: Trade[]) {
  const wins = trades.filter(t => pnl(t) > 0).length;
  const losses = trades.filter(t => pnl(t) < 0).length;
  return { totalTrades: trades.length, wins, losses, winRate: trades.length ? wins / trades.length * 100 : null,
    netPnl: trades.reduce((sum, t) => sum + pnl(t), 0) };
}
export function assertNoLookahead(candles: Candle[], timeframe: Timeframe, cutoff: string) {
  if (candles.some(c => c.time + seconds[timeframe] > Date.parse(cutoff) / 1000)) throw new ApiError(502, 'Market data violated the completed-candle boundary.');
}
export class TradingService {
  constructor(private repository: Repository, private prices: PriceProvider, private ai: AIService) {}
  private async getStrategy(id: string) {
    const strategy = await this.repository.strategy(id);
    if (!strategy) throw new ApiError(404, 'Strategy not found.');
    return strategy;
  }
  private async samples(trades: Trade[]): Promise<HistoricalSample[]> {
    const successful: HistoricalSample[] = [];
    // At most five bounded provider calls; the metrics still include every eligible journal trade.
    for (const trade of trades.filter(t => pnl(t) > 0).slice(0, 5)) {
      const result = await this.prices.get({ instrument: trade.instrument, timeframe: trade.timeframe, limit: 60, to: trade.entryTime }, new Date(trade.entryTime));
      assertNoLookahead(result.candles, trade.timeframe, trade.entryTime);
      if (result.candles.length) successful.push({ tradeId: trade.id, entryTime: trade.entryTime, candles: result.candles });
    }
    return successful;
  }
  private async pastTrades(instrument: Instrument, timeframe: Timeframe, strategyId: string, to: string, from?: string) {
    const rows = await this.repository.trades({ instrument, timeframe, strategyId, to, from });
    if (rows.length > 5000) throw new ApiError(422, 'More than 5000 trades match; narrow the date window.');
    // Independent boundary enforcement protects callers even if a repository implementation changes.
    return rows.filter(t => t.instrument === instrument && t.timeframe === timeframe && t.strategyId === strategyId
      && Date.parse(t.exitTime) <= Date.parse(to) && (!from || Date.parse(t.entryTime) >= Date.parse(from)));
  }
  async analyze(instrument: Instrument, timeframe: Timeframe, strategyId: string): Promise<Analysis> {
    const asOf = new Date();
    const strategy = await this.getStrategy(strategyId);
    const price = await this.prices.get({ instrument, timeframe, limit: 150 }, asOf);
    assertNoLookahead(price.candles, timeframe, asOf.toISOString());
    if (!price.candles.length) throw new ApiError(422, 'No completed candles are available for analysis.');
    // Analyze only journal exits already known at the last completed candle boundary.
    const candleEnd = new Date((price.candles.at(-1)!.time + seconds[timeframe]) * 1000).toISOString();
    const trades = await this.pastTrades(instrument, timeframe, strategyId, candleEnd);
    const stats = metrics(trades);
    const successfulEntries = this.ai.configured ? await this.samples(trades) : [];
    const result = await this.ai.analyze({ strategy, candles: price.candles, asOf: candleEnd, successfulEntries,
      sampleSize: stats.totalTrades, historicalWinRate: stats.winRate, marketSource: price.source });
    const row: Analysis = { ...result, id: randomUUID(), createdAt: asOf.toISOString(), instrument, timeframe, strategyId,
      sampleSize: stats.totalTrades, historicalWinRate: stats.winRate };
    await this.repository.saveAnalysis(row);
    return row;
  }
  async backtest(instrument: Instrument, timeframe: Timeframe, strategyId: string, from: string, to: string): Promise<Backtest> {
    const strategy = await this.getStrategy(strategyId);
    const trades = await this.pastTrades(instrument, timeframe, strategyId, to, from);
    const stats = metrics(trades);
    const successfulEntries = this.ai.configured ? await this.samples(trades) : [];
    const result = await this.ai.patterns({ strategy, asOf: to, successfulEntries, sampleSize: stats.totalTrades,
      historicalWinRate: stats.winRate, marketSource: this.prices.source });
    return { ...stats, ...result, limitations: [
      'Journal-only retrospective review, not a strategy execution simulation. Only matching logged trades with entry and exit inside the requested window are included.',
      'Win rate is the observed share of logged trades with positive gross P&L, not a predictive probability. Breakeven trades count in the denominator, not as wins or losses.',
      'Gross P&L = (exit - entry) × quantity × direction. Fees, financing, slippage, contract multipliers, and currency conversion are excluded.',
      'Patterns use at most five most recent successful entries, each with at most 60 candles completed by entry; selection bias and small samples limit conclusions.',
      'WR1 has no verified proprietary definition here; both strategy seeds require user configuration and independent validation.',
      ...(this.prices.source === 'demo' ? ['Market data is deterministic synthetic demonstration data, not historical market prices.'] : []),
      ...(result.source === 'demo' ? ['AI is not configured. Pattern output is a demonstration only; no real recommendations are provided.'] : []),
    ] };
  }
}
