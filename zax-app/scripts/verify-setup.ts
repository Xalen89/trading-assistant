import "dotenv/config";
import { readMigrationFiles } from "drizzle-orm/migrator";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function configurationErrors(
  env: Record<string, string | undefined>,
): string[] {
  const errors: string[] = [];
  const required = {
    DATABASE_URL: env.DATABASE_URL,
    MANUS_PROJECT_ID: env.MANUS_PROJECT_ID ?? env.VITE_APP_ID,
    MANUS_OAUTH_API_URL: env.MANUS_OAUTH_API_URL ?? env.OAUTH_SERVER_URL,
    MANUS_OAUTH_PORTAL_URL:
      env.MANUS_OAUTH_PORTAL_URL ?? env.VITE_OAUTH_PORTAL_URL,
    MANUS_JWT_SECRET: env.MANUS_JWT_SECRET ?? env.JWT_SECRET,
    OWNER_OPEN_ID: env.OWNER_OPEN_ID,
  };
  for (const [name, value] of Object.entries(required)) {
    if (!value?.trim()) errors.push(`${name} is required.`);
  }
  if (
    required.MANUS_JWT_SECRET &&
    Buffer.byteLength(required.MANUS_JWT_SECRET) < 32
  ) {
    errors.push("MANUS_JWT_SECRET must contain at least 32 bytes.");
  }
  for (const [name, value] of Object.entries({
    DATABASE_URL: env.DATABASE_URL,
    MANUS_OAUTH_API_URL: required.MANUS_OAUTH_API_URL,
    MANUS_OAUTH_PORTAL_URL: required.MANUS_OAUTH_PORTAL_URL,
    EXPO_PUBLIC_API_BASE_URL: env.EXPO_PUBLIC_API_BASE_URL,
    BUILT_IN_FORGE_API_URL: env.BUILT_IN_FORGE_API_URL,
    PUBLIC_APP_URL: env.PUBLIC_APP_URL,
  })) {
    if (!value) continue;
    try {
      const url = new URL(value);
      if (name === "DATABASE_URL") {
        if (
          url.protocol !== "mysql:" ||
          !url.hostname ||
          url.pathname.length < 2
        )
          throw new Error();
      } else if (
        !["https:", "http:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        (url.protocol === "http:" &&
          !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
      ) {
        throw new Error();
      }
    } catch {
      errors.push(
        `${name} must be a valid ${name === "DATABASE_URL" ? "MySQL URL with a database name" : "HTTPS URL (HTTP allowed only on loopback)"}.`,
      );
    }
  }
  if (
    env.PORT &&
    (!/^\d+$/.test(env.PORT) ||
      Number(env.PORT) < 1 ||
      Number(env.PORT) > 65535)
  ) {
    errors.push("PORT must be an integer between 1 and 65535.");
  }
  if (
    Boolean(env.BUILT_IN_FORGE_API_URL) !== Boolean(env.BUILT_IN_FORGE_API_KEY)
  ) {
    errors.push(
      "Set both BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY, or neither.",
    );
  }
  return errors;
}

export async function verifyDatabase() {
  const migrations = readMigrationFiles({
    migrationsFolder: resolve("drizzle"),
  });
  const connection = await mysql.createConnection(process.env.DATABASE_URL!);
  try {
    const [rows] = await connection.query<RowDataPacket[]>(
      "SELECT hash, created_at FROM __drizzle_migrations",
    );
    if (
      !migrations.every((migration) =>
        rows.some(
          (row) =>
            row.hash === migration.hash &&
            Number(row.created_at) === migration.folderMillis,
        ),
      )
    ) {
      throw new Error("Missing or changed migrations");
    }
  } finally {
    await connection.end();
  }
}

export function verifyPython() {
  const python = process.env.PYTHON_EXECUTABLE || "python3";
  const result = spawnSync(
    python,
    [
      "-c",
      [
        "import sys",
        "assert sys.version_info >= (3, 11)",
        "import numpy, cv2, pandas, quantstats, matplotlib, seaborn, IPython, sklearn",
        "sys.path.insert(0, 'python')",
        "import pattern_indexer, research_engine, orderbook_research",
      ].join("; "),
    ],
    { timeout: 60000, stdio: "pipe" },
  );
  if (result.error || result.status !== 0) {
    throw new Error(
      "Python 3.11+ workers unavailable. Check PYTHON_EXECUTABLE and run pnpm run setup.",
    );
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => !["--config-only", "--skip-python"].includes(arg))) {
    throw new Error("Usage: pnpm verify:setup [--config-only] [--skip-python]");
  }
  const errors = configurationErrors(process.env);
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "[verify] Required configuration is valid (credentials not displayed).",
  );
  if (args.includes("--config-only")) return;
  try {
    await verifyDatabase();
  } catch {
    throw new Error(
      "MySQL or migration verification failed. Check DATABASE_URL and run pnpm db:migrate.",
    );
  }
  console.log(
    "[verify] MySQL is reachable and all committed migrations match.",
  );
  if (args.includes("--skip-python")) {
    console.warn(
      "[verify] Python skipped: image indexing and quantitative research are NOT verified.",
    );
  } else {
    verifyPython();
    console.log(
      "[verify] Python dependencies and all three workers import successfully.",
    );
  }
  if (!process.env.BUILT_IN_FORGE_API_KEY)
    console.warn("[verify] AI/storage provider not configured.");
  if (!process.env.FMP_API_KEY && !process.env.TRADELOCKER_EMAIL)
    console.warn("[verify] No market data provider configured.");
  if (
    spawnSync("pdftoppm", ["-v"], { stdio: "pipe", timeout: 5000 }).status !== 0
  ) {
    console.warn(
      "[verify] pdftoppm missing: install poppler-utils for PDF previews.",
    );
  }
  console.log(
    "[verify] Local setup checks passed; external OAuth/provider access still requires a live smoke test.",
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error: Error) => {
    console.error(`[verify] ${error.message}`);
    process.exitCode = 1;
  });
}
