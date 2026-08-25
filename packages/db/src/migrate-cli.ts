import { createDb } from "./client.js";
import { runMigrations } from "./migrate.js";

/**
 * Applies migrations the same way the test harness does — including
 * `CREATE EXTENSION pg_trgm`, which drizzle-kit does not generate and which the
 * trigram index depends on. Use this rather than `drizzle-kit migrate`.
 */
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const { db, close } = createDb(url);
try {
  await runMigrations(db);
  console.log("migrations applied");
} finally {
  await close();
}
