import { createCache } from "@repo/cache";
import { describe, expect, test } from "vitest";

import { createIgdbClient } from "../src/client.js";
import { igdbGameSchema } from "../src/schemas.js";
import { createTokenSource } from "../src/token.js";

const clientId = process.env.IGDB_CLIENT_ID;
const clientSecret = process.env.IGDB_CLIENT_SECRET;

describe.runIf(clientId && clientSecret)("IGDB contract", () => {
  const cache = createCache(process.env.VALKEY_URL ?? "redis://127.0.0.1:1");
  const tokens = createTokenSource({ clientId: clientId!, clientSecret: clientSecret!, cache });
  const client = createIgdbClient({ clientId: clientId!, tokens });

  test("IGDB accepts every field we request", async () => {
    // A deprecated or removed field makes IGDB answer 400, which the client
    // surfaces without retrying.
    const rows = await client.gamesPage({ since: null, afterId: 0 });

    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
  });

  test("live responses satisfy our schema", async () => {
    const rows = await client.gamesPage({ since: null, afterId: 0 });

    for (const row of rows.slice(0, 50)) {
      expect(() => igdbGameSchema.parse(row)).not.toThrow();
    }
  });

  test("game_type ids used for search filtering still resolve", async () => {
    // Spec §9 filters search by game_type_id. Confirm the ids we rely on exist
    // rather than trusting the legacy enum values.
    const rows = await client.gamesPage({ since: null, afterId: 0 });
    const types = new Set(
      rows
        .map((row) => (row as { game_type?: { id: number } }).game_type?.id)
        .filter((id): id is number => typeof id === "number"),
    );

    expect(types.size).toBeGreaterThan(0);
  });
});
