import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Pool } from 'pg';
import { MemoryRepository, PostgresRepository } from '../repository.js';
import type { Analysis } from '../types.js';

test('PostgreSQL repository parameterizes all user-controlled values and preserves contract mapping', async () => {
  const calls: { sql: string; values: unknown[] }[] = [];
  const pool = {
    async query(sql: string, values: unknown[] = []) {
      calls.push({ sql, values });
      if (sql.includes('FROM trades')) return { rows: [{
        id: 'trade', strategyId: 'OTE', instrument: 'NAS100', timeframe: '5m', direction: 'long',
        entry: 100, exit: 110, quantity: 2, entryTime: new Date('2025-01-01T10:00:00Z'),
        exitTime: new Date('2025-01-01T11:00:00Z'), notes: 'logged', stopLoss: null, takeProfit: null, riskAmount: null,
      }] };
      if (sql.startsWith('INSERT INTO strategies')) return { rows: [{ id: values[0], name: values[1], description: values[2], rules: JSON.parse(String(values[3])), parameters: JSON.parse(String(values[4])) }] };
      if (sql.startsWith('SELECT data FROM analyses')) return { rows: [{ data: { id: 'analysis' } }] };
      return { rows: [] };
    },
    async end() {},
  };
  const repository = new PostgresRepository(pool as unknown as Pool);
  const attack = "'; DROP TABLE trades; --";
  await repository.strategy(attack);
  assert.equal(calls.at(-1)!.values[0], attack);
  assert.ok(!calls.at(-1)!.sql.includes(attack));
  const strategy = await repository.saveStrategy({ id: 'custom', name: attack, description: attack, rules: [attack], parameters: { comment: attack } });
  assert.equal(strategy.name, attack);
  assert.ok(!calls.at(-1)!.sql.includes(attack));
  const trades = await repository.trades({ strategyId: attack, instrument: 'NAS100', timeframe: '5m', from: '2025-01-01T00:00:00Z', to: '2025-01-02T00:00:00Z' });
  assert.equal(calls.at(-1)!.values[1], attack);
  assert.ok(!calls.at(-1)!.sql.includes(attack));
  assert.equal(trades[0].entryTime, '2025-01-01T10:00:00.000Z');
  assert.ok(!('stopLoss' in trades[0]));
  await repository.saveTrade({ ...trades[0], notes: attack });
  assert.ok(calls.at(-1)!.values.includes(attack));
  assert.ok(!calls.at(-1)!.sql.includes(attack));
  const candles = [{ time: 1000, open: 100, high: 110, low: 90, close: 102, volume: 20 }];
  await repository.saveCandles('NAS100', '5m', 'oanda', candles);
  assert.equal(calls.at(-1)!.values[2], 'oanda');
  assert.deepEqual(JSON.parse(String(calls.at(-1)!.values[3])), candles);
  assert.match(calls.at(-1)!.sql, /ON CONFLICT/);
  const analysis: Analysis = { id: 'analysis', createdAt: '2025-01-01T00:00:00Z', instrument: 'NAS100', timeframe: '5m', strategyId: 'OTE',
    summary: attack, confidence: 0, direction: 'wait', patterns: [], levels: [], source: 'demo', sampleSize: 0, historicalWinRate: null };
  await repository.saveAnalysis(analysis);
  assert.ok(!calls.at(-1)!.sql.includes(attack));
  assert.deepEqual(JSON.parse(String(calls.at(-1)!.values[5])), analysis);
  assert.deepEqual(await repository.analyses('NAS100', '5m'), [{ id: 'analysis' }]);
});
test('memory demo returns defensive copies and preserves saved analysis data', async () => {
  const repository = new MemoryRepository();
  const strategies = await repository.strategies();
  strategies[0].rules[0] = 'mutated';
  strategies[0].parameters.verified = true;
  assert.notEqual((await repository.strategy('WR1'))!.rules[0], 'mutated');
  assert.equal((await repository.strategy('WR1'))!.parameters.verified, false);
  const analysis: Analysis = { id: 'analysis', createdAt: '2025-01-01T00:00:00Z', instrument: 'NAS100', timeframe: '5m', strategyId: 'OTE',
    summary: 'Demo', confidence: 0, direction: 'wait', patterns: [], levels: [], source: 'demo', sampleSize: 0, historicalWinRate: null };
  await repository.saveAnalysis(analysis);
  analysis.summary = 'mutated';
  assert.equal((await repository.analyses())[0].summary, 'Demo');
  const returned = await repository.analyses(); returned[0].summary = 'also mutated';
  assert.equal((await repository.analyses())[0].summary, 'Demo');
});
