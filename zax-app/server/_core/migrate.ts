import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { resolve } from "node:path";

export async function migrateDatabase(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is required");
  const connection = await mysql.createConnection(url);
  try {
    // Serialize startup migrations across API processes sharing the MySQL server.
    const [locks] = await connection.query<RowDataPacket[]>(
      "SELECT GET_LOCK('zax:migrations', 30) AS acquired",
    );
    if (Number(locks[0]?.acquired) !== 1) {
      throw new Error("Could not acquire the database migration lock");
    }
    await migrate(drizzle(connection), {
      migrationsFolder: resolve(process.cwd(), "drizzle"),
    });
  } finally {
    // Closing the session also releases its advisory lock, including on failure.
    await connection.end();
  }
}
