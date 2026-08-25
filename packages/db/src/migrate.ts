import { fileURLToPath } from "node:url";

import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import type * as schema from "./schema/index.js";

const MIGRATIONS_FOLDER = fileURLToPath(new URL("../drizzle", import.meta.url));

/**
 * pg_trgm is created here rather than in a migration file: drizzle-kit does not
 * generate CREATE EXTENSION, and the trigram index in the generated SQL cannot
 * be built until the extension exists.
 */
export async function runMigrations(db: NodePgDatabase<typeof schema>): Promise<void> {
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}
