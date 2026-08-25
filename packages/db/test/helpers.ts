import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { expect } from "vitest";

import type * as schema from "../src/schema/index.js";

export async function truncateAll(db: NodePgDatabase<typeof schema>): Promise<void> {
  await db.execute(sql`
    TRUNCATE TABLE
      backlog_entries, users,
      game_companies, game_platforms, game_genres, game_screenshots,
      games, companies, platforms, genres, game_types
    RESTART IDENTITY CASCADE
  `);
}

/**
 * Drizzle wraps driver errors as `Failed query: ...` and hangs the real
 * Postgres error off `cause`, so asserting on `.message` alone would pass for
 * any failure at all. This flattens the whole chain and matches against that.
 */
export async function expectRejectedBy(
  operation: Promise<unknown>,
  pattern: RegExp,
): Promise<void> {
  try {
    await operation;
  } catch (error) {
    const messages: string[] = [];
    let current: unknown = error;
    while (current instanceof Error) {
      messages.push(current.message);
      current = current.cause;
    }
    expect(messages.join(" | ")).toMatch(pattern);
    return;
  }

  throw new Error(`Expected the query to be rejected by ${pattern}, but it succeeded`);
}
