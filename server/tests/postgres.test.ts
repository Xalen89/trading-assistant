import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { Pool } from 'pg';
import { PostgresRepository } from '../repository.js';
import { PriceService } from '../prices.js';
import type { Analysis } from '../types.js';

test('PostgreSQL integration: idempotent schema, seeds, journal risks/outcomes, OHLCV and analyses persist',
  { skip: !process.env.TEST_DATABASE_URL }, async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1, connectionTimeoutMillis: 5000 });
    // Generated identifier only; never interpolate request data into SQL.
    const schema = `backend_test_${randomUUID().replaceAll('-', '')}`;
    try {
      await pool.query(`CREATE SCHEMA ${schema}`);
      await pool.query(`SET search_path TO ${schema}`);
      const repository = new PostgresRepository(pool);
      await repository.init(); await repository.init();
      const migrationUrl = new URL(process.env.TEST_DATABASE_URL!);
      migrationUrl.searchParams.set('options', `-c search_path=${schema}`);
      const migration = await promisify(execFile)(process.execPath,
        ['--import', 'tsx', fileURLToPath(new URL('../migrate.ts', import.meta.url))],
        { env: { ...process.env, DATABASE_URL: migrationUrl.toString() }, timeout: 15000 });
      assert.match(migration.stdout, /schema and strategy seeds are ready/);
      assert.equal((await repository.strategies()).length, 2);
      assert.equal((await repository.strategy('WR1'))!.parameters.verified, false);
      const custom = await repository.saveStrategy({ id: 'custom', name: 'User-defined', description: 'Not validated', rules: ['Observe'], parameters: { n: 2 } });
      await repository.saveStrategy({ ...custom, name: 'Updated' });
      assert.equal((await repository.strategy('custom'))!.name, 'Updated');
      const trade = await repository.saveTrade({ strategyId: 'custom', instrument: 'NAS100', timeframe: '5m', direction: 'long',
        entry: 100, exit: 110, quantity: 2, entryTime: '2025-01-01T10:00:00.000Z', exitTime: '2025-01-01T11:00:00.000Z',
        notes: 'Actual logged trade', stopLoss: 95, takeProfit: 115, riskAmount: 10 });
      assert.deepEqual((await repository.trades({ instrument: 'NAS100', timeframe: '5m', strategyId: 'custom' }))[0], trade);
      assert.equal((await repository.trades({ instrument: 'XAUUSD' })).length, 0);
      assert.equal((await repository.trades({ from: '2025-01-01T10:30:00Z' })).length, 0);
      assert.deepEqual((await pool.query('SELECT pnl,outcome,risk_amount FROM trades WHERE id=$1', [trade.id])).rows[0], { pnl: 20, outcome: 'win', risk_amount: 10 });
      const candles = [{ time: 1000, open: 100, high: 110, low: 90, close: 102, volume: 20 }];
      await repository.saveCandles('NAS100', '5m', 'demo', candles);
      await repository.saveCandles('NAS100', '5m', 'oanda', candles);
      await repository.saveCandles('NAS100', '5m', 'oanda', [{ ...candles[0], volume: 30 }]);
      assert.equal((await pool.query('SELECT count(*)::int AS count FROM candles')).rows[0].count, 2);
      assert.equal((await pool.query('SELECT volume FROM candles WHERE source=$1', ['oanda'])).rows[0].volume, 30);
      const analysis: Analysis = { id: randomUUID(), createdAt: '2025-01-01T00:00:00.000Z', instrument: 'NAS100', timeframe: '5m',
        strategyId: 'custom', summary: 'Demo only', confidence: 0, direction: 'wait', patterns: [], levels: [], source: 'demo', sampleSize: 1, historicalWinRate: 100 };
      await repository.saveAnalysis(analysis);
      assert.deepEqual(await repository.analyses('NAS100', '5m'), [analysis]);
      assert.deepEqual(await repository.analyses('XAUUSD', '5m'), []);
      const synthetic = await new PriceService(repository).get({ instrument: 'NAS100', timeframe: '5m', limit: 2 });
      assert.equal(synthetic.source, 'demo');
      assert.equal(synthetic.candles.length, 2);
      assert.equal((await pool.query('SELECT source FROM candles WHERE instrument=$1 AND timeframe=$2 AND time=$3',
        ['NAS100', '5m', synthetic.candles[0].time])).rows[0].source, 'demo');
      assert.equal((await pool.query("SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema=$1 AND table_name='users'", [schema])).rows[0].count, 1);
    } finally {
      await pool.query('SET search_path TO public');
      await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await pool.end();
    }
  });
