import "dotenv/config";
import mysql from "mysql2/promise";
import { readFile } from "node:fs/promises";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("Database environment is unavailable; no migration was attempted.");
  const sql = await readFile(new URL("../drizzle/0007_harsh_archangel.sql", import.meta.url), "utf8");
  const parts = sql.split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean);
  if (parts.length !== 2 || !parts[0].startsWith("CREATE TABLE `trading_runtime_state`") || !parts[1].startsWith("CREATE INDEX `runtime_owner_kind_updated`")) throw new Error("Only the reviewed additive runtime-state migration is allowed.");
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [tables] = await connection.query("SHOW TABLES LIKE 'trading_runtime_state'");
    if (!(tables as unknown[]).length) await connection.query(parts[0]);
    const [indexes] = await connection.query("SHOW INDEX FROM trading_runtime_state WHERE Key_name = 'runtime_owner_kind_updated'");
    if (!(indexes as unknown[]).length) await connection.query(parts[1]);
    console.log("Runtime-state table and owner index verified. No existing application records changed.");
  } finally { await connection.end(); }
}
main().catch(error => { console.error(error instanceof Error && !/mysql|password|connect|host|port/i.test(error.message) ? error.message : "Runtime-state migration could not complete; connection details were not logged."); process.exitCode = 1; });
