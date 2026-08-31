import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { createDb } from "./client.js";
import { runMigrations } from "./migrate.js";
import type * as schema from "./schema/index.js";

export const POSTGRES_IMAGE = "postgres:18-alpine";

export async function startPostgres(): Promise<{ url: string; stop(): Promise<void> }> {
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  const url = container.getConnectionUri();

  const { db, close } = createDb(url);
  await runMigrations(db);
  await close();

  return {
    url,
    stop: async () => {
      await container.stop();
    },
  };
}

export async function truncateAll(db: NodePgDatabase<typeof schema>): Promise<void> {
  await db.execute(sql`
    TRUNCATE TABLE
      sync_runs,
      backlog_entries, users,
      game_companies, game_platforms, game_genres, game_screenshots, game_similar,
      games, companies, platforms, genres, game_types
    RESTART IDENTITY CASCADE
  `);
}
