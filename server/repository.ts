import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import { ApiError, type Analysis, type Candle, type Instrument, type Strategy, type Timeframe, type Trade, type TradeFilter } from './types.js';

export const seeds: Strategy[] = [
  { id: 'WR1', name: 'WR1 — unverified template', description: 'Configurable placeholder only. The proprietary WR1 definition is not known or verified; supply your own documented rules before evaluation.',
    rules: ['No verified WR1 rules supplied. Configure this template with your own rules.'], parameters: { verified: false } },
  { id: 'OTE', name: 'OTE — configurable retracement study', description: 'Educational Optimal Trade Entry retracement template, not a validated trading system. Swing selection and confirmation must be defined by the user.',
    rules: ['Identify a user-defined directional swing.', 'Study a configurable Fibonacci retracement zone.', 'Require user-defined confirmation and risk controls; do not assume a trade was executed.'],
    parameters: { retracementMin: 0.62, retracementMax: 0.79, verified: false } },
];
export interface Repository {
  strategies(): Promise<Strategy[]>;
  strategy(id: string): Promise<Strategy | undefined>;
  saveStrategy(data: Omit<Strategy, 'id'> & { id?: string }): Promise<Strategy>;
  trades(filter?: TradeFilter): Promise<Trade[]>;
  saveTrade(data: Omit<Trade, 'id'>): Promise<Trade>;
  saveCandles(instrument: Instrument, timeframe: Timeframe, source: 'demo' | 'oanda', candles: Candle[]): Promise<void>;
  saveAnalysis(analysis: Analysis): Promise<void>;
  analyses(instrument?: Instrument, timeframe?: Timeframe): Promise<Analysis[]>;
  close(): Promise<void>;
}
export class MemoryRepository implements Repository {
  private strategyRows = new Map(seeds.map(s => [s.id, structuredClone(s)]));
  private tradeRows: Trade[] = [];
  private candleRows = new Map<string, Candle>();
  private analysisRows: Analysis[] = [];
  async strategies() { return structuredClone([...this.strategyRows.values()]); }
  async strategy(id: string) { const row = this.strategyRows.get(id); return row ? structuredClone(row) : undefined; }
  async saveStrategy(data: Omit<Strategy, 'id'> & { id?: string }) {
    const row = { ...data, id: data.id ?? randomUUID() };
    if (!this.strategyRows.has(row.id) && this.strategyRows.size >= 500) throw new ApiError(409, 'Demo strategy capacity reached.');
    this.strategyRows.set(row.id, structuredClone(row)); return row;
  }
  async trades(filter: TradeFilter = {}) {
    return structuredClone(this.tradeRows.filter(t => (!filter.instrument || t.instrument === filter.instrument)
      && (!filter.timeframe || t.timeframe === filter.timeframe) && (!filter.strategyId || t.strategyId === filter.strategyId)
      && (!filter.from || Date.parse(t.entryTime) >= Date.parse(filter.from))
      && (!filter.to || Date.parse(t.exitTime) <= Date.parse(filter.to))).sort((a, b) => b.exitTime.localeCompare(a.exitTime)).slice(0, 5001));
  }
  async saveTrade(data: Omit<Trade, 'id'>) {
    if (this.tradeRows.length >= 5000) throw new ApiError(409, 'Demo trade capacity reached.');
    if (!this.strategyRows.has(data.strategyId)) throw new ApiError(404, 'Strategy not found.');
    const row = { ...data, id: randomUUID() }; this.tradeRows.push(structuredClone(row)); return row;
  }
  async saveCandles(instrument: Instrument, timeframe: Timeframe, source: 'demo' | 'oanda', candles: Candle[]) {
    for (const c of candles) this.candleRows.set(`${instrument}:${timeframe}:${source}:${c.time}`, { ...c });
    while (this.candleRows.size > 20000) this.candleRows.delete(this.candleRows.keys().next().value!);
  }
  async saveAnalysis(row: Analysis) { this.analysisRows.unshift(structuredClone(row)); this.analysisRows.length = Math.min(500, this.analysisRows.length); }
  async analyses(instrument?: Instrument, timeframe?: Timeframe) {
    return structuredClone(this.analysisRows.filter(a => (!instrument || a.instrument === instrument) && (!timeframe || a.timeframe === timeframe)).slice(0, 100));
  }
  async close() {}
}
export class PostgresRepository implements Repository {
  constructor(private pool: Pool) {}
  async init() {
    await this.pool.query(await readFile(path.join(__dirname, 'schema.sql'), 'utf8'));
    for (const seed of seeds) await this.pool.query('INSERT INTO strategies(id,name,description,rules,parameters) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING',
      [seed.id, seed.name, seed.description, JSON.stringify(seed.rules), JSON.stringify(seed.parameters)]);
  }
  async strategies(): Promise<Strategy[]> { return (await this.pool.query('SELECT id,name,description,rules,parameters FROM strategies ORDER BY created_at LIMIT 500')).rows; }
  async strategy(id: string): Promise<Strategy | undefined> { return (await this.pool.query('SELECT id,name,description,rules,parameters FROM strategies WHERE id=$1', [id])).rows[0]; }
  async saveStrategy(data: Omit<Strategy, 'id'> & { id?: string }): Promise<Strategy> {
    return (await this.pool.query('INSERT INTO strategies(id,name,description,rules,parameters) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,rules=EXCLUDED.rules,parameters=EXCLUDED.parameters RETURNING id,name,description,rules,parameters',
      [data.id ?? randomUUID(), data.name, data.description, JSON.stringify(data.rules), JSON.stringify(data.parameters)])).rows[0];
  }
  async trades(filter: TradeFilter = {}): Promise<Trade[]> {
    const rows = (await this.pool.query(`SELECT id,strategy_id AS "strategyId",instrument,timeframe,direction,entry,exit,quantity,
      entry_time AS "entryTime",exit_time AS "exitTime",notes,stop_loss AS "stopLoss",take_profit AS "takeProfit",risk_amount AS "riskAmount"
      FROM trades WHERE ($1::text IS NULL OR instrument=$1) AND ($2::text IS NULL OR strategy_id=$2)
      AND ($3::text IS NULL OR timeframe=$3) AND ($4::timestamptz IS NULL OR entry_time >= $4)
      AND ($5::timestamptz IS NULL OR exit_time <= $5) ORDER BY exit_time DESC LIMIT 5001`,
    [filter.instrument ?? null, filter.strategyId ?? null, filter.timeframe ?? null, filter.from ?? null, filter.to ?? null])).rows;
    return rows.map(row => {
      for (const key of ['stopLoss', 'takeProfit', 'riskAmount']) if (row[key] === null) delete row[key];
      return { ...row, entryTime: row.entryTime.toISOString(), exitTime: row.exitTime.toISOString() };
    });
  }
  async saveTrade(data: Omit<Trade, 'id'>): Promise<Trade> {
    const row = { ...data, id: randomUUID() };
    await this.pool.query(`INSERT INTO trades(id,strategy_id,instrument,timeframe,direction,entry,exit,quantity,entry_time,exit_time,notes,stop_loss,take_profit,risk_amount)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [row.id, row.strategyId, row.instrument, row.timeframe, row.direction, row.entry, row.exit, row.quantity, row.entryTime, row.exitTime, row.notes, row.stopLoss ?? null, row.takeProfit ?? null, row.riskAmount ?? null]);
    return row;
  }
  async saveCandles(instrument: Instrument, timeframe: Timeframe, source: 'demo' | 'oanda', candles: Candle[]) {
    if (!candles.length) return;
    await this.pool.query(`INSERT INTO candles(instrument,timeframe,time,open,high,low,close,volume,source)
      SELECT $1,$2,c.time,c.open,c.high,c.low,c.close,c.volume,$3 FROM jsonb_to_recordset($4::jsonb)
      AS c(time bigint,open double precision,high double precision,low double precision,close double precision,volume double precision)
      ON CONFLICT(instrument,timeframe,time,source) DO UPDATE SET open=EXCLUDED.open,high=EXCLUDED.high,low=EXCLUDED.low,close=EXCLUDED.close,volume=EXCLUDED.volume`,
    [instrument, timeframe, source, JSON.stringify(candles)]);
  }
  async saveAnalysis(row: Analysis) {
    await this.pool.query('INSERT INTO analyses(id,created_at,instrument,timeframe,strategy_id,data) VALUES($1,$2,$3,$4,$5,$6)',
      [row.id, row.createdAt, row.instrument, row.timeframe, row.strategyId, JSON.stringify(row)]);
  }
  async analyses(instrument?: Instrument, timeframe?: Timeframe): Promise<Analysis[]> {
    return (await this.pool.query('SELECT data FROM analyses WHERE ($1::text IS NULL OR instrument=$1) AND ($2::text IS NULL OR timeframe=$2) ORDER BY created_at DESC LIMIT 100', [instrument ?? null, timeframe ?? null])).rows.map(row => row.data);
  }
  async close() { await this.pool.end(); }
}
