import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { createDatabasePool, PostgresRepository } from './repository.js';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
async function migrate() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required for migrations. Demo mode needs no migration.');
    process.exitCode = 1; return;
  }
  const repository = new PostgresRepository(createDatabasePool({ connectionString: process.env.DATABASE_URL,
    max: 1, connectionTimeoutMillis: 5000, statement_timeout: 10000 }));
  try {
    await repository.init();
    console.log('Trading database schema and strategy seeds are ready.');
  } finally { await repository.close(); }
}
void migrate().catch(() => {
  console.error('Database migration failed. Check connectivity and schema permissions.');
  process.exitCode = 1;
});
