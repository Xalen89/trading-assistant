import "dotenv/config";
import { migrateDatabase } from "../server/_core/migrate";

migrateDatabase().then(
  () => console.log("[database] Committed migrations applied."),
  () => {
    console.error(
      "[database] Migration failed. Check MySQL access and migration state.",
    );
    process.exitCode = 1;
  },
);
