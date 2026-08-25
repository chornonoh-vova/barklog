import { sql } from "drizzle-orm";
import { afterAll, expect, inject, test } from "vitest";

import { createDb } from "../src/client.js";

const { db, close } = createDb(inject("databaseUrl"));

afterAll(async () => {
  await close();
});

test("pg_trgm is installed so trigram indexes can be created", async () => {
  const result = await db.execute<{ extname: string }>(
    sql`SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'`,
  );

  expect(result.rows).toHaveLength(1);
});

test("word_similarity is callable", async () => {
  const result = await db.execute<{ ws: number }>(
    sql`SELECT word_similarity('zeld', 'The Legend of Zelda') AS ws`,
  );

  expect(result.rows[0]!.ws).toBeGreaterThan(0.5);
});
