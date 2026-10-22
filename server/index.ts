import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { AIService } from './ai.js';
import { createApp } from './app.js';
import { PriceService, type OandaConfig } from './prices.js';
import { createDatabasePool, MemoryRepository, PostgresRepository, type Repository } from './repository.js';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
async function main() {
  const mode = process.env.DATABASE_URL ? 'live' : 'demo';
  let repository: Repository;
  if (process.env.DATABASE_URL) {
    const pg = new PostgresRepository(createDatabasePool({ connectionString: process.env.DATABASE_URL, max: 5,
      connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, statement_timeout: 10000 }));
    await pg.init(); repository = pg;
  } else repository = new MemoryRepository();
  const environment = process.env.OANDA_ENV ?? 'practice';
  if (!['practice', 'live'].includes(environment)) throw new Error('Invalid configuration');
  const instrumentName = (value: string) => {
    if (!/^[A-Z0-9_]{2,40}$/.test(value)) throw new Error('Invalid configuration');
    return value;
  };
  const oanda: OandaConfig | undefined = process.env.OANDA_API_KEY ? {
    token: process.env.OANDA_API_KEY, environment: environment as OandaConfig['environment'],
    nas100: instrumentName(process.env.OANDA_NAS100_INSTRUMENT ?? 'NAS100_USD'),
    xauusd: instrumentName(process.env.OANDA_XAUUSD_INSTRUMENT ?? 'XAU_USD'),
  } : undefined;
  const ai = new AIService({ apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.CLAUDE_MODEL });
  const app = createApp({ repository, prices: new PriceService(repository, oanda), ai, mode, apiToken: process.env.API_TOKEN });
  const host = process.env.HOST ?? '127.0.0.1';
  const port = Number(process.env.PORT ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid configuration');
  const server = app.listen(port, host, () => {
    console.log(`Trading API listening on ${host}:${port} (${mode}; ${ai.configured ? 'AI configured' : 'AI demonstration only'}).`);
    if (mode === 'demo') console.log('DEMO STORAGE: in-memory journal; all stored data is lost on restart.');
    if (!oanda) console.log('DEMO PRICES: deterministic synthetic candles; no OANDA key is configured.');
    if (!process.env.API_TOKEN && host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') console.warn('Warning: API_TOKEN is not set for a non-loopback listener.');
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  server.on('error', () => { console.error('API listener failed. Check host and port configuration.'); process.exitCode = 1; void repository.close(); });
  let closing = false;
  const shutdown = () => {
    if (closing) return; closing = true;
    const timer = setTimeout(() => { server.closeAllConnections(); void repository.close(); }, 5000);
    timer.unref();
    server.close(() => { clearTimeout(timer); void repository.close(); });
  };
  process.once('SIGTERM', shutdown); process.once('SIGINT', shutdown);
}
void main().catch(() => { console.error('API startup failed. Check database connectivity and environment configuration.'); process.exitCode = 1; });
