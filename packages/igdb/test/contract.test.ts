import { createCache } from "@repo/cache";
import * as v from "valibot";
import { describe, expect, test } from "vitest";

import { createIgdbClient } from "../src/client.js";
import { mapGameIds } from "../src/map.js";
import { igdbGameSchema } from "../src/schemas.js";
import { createTokenSource } from "../src/token.js";

const clientId = process.env.IGDB_CLIENT_ID;
const clientSecret = process.env.IGDB_CLIENT_SECRET;

describe.runIf(clientId && clientSecret)("IGDB contract", () => {
  const cache = createCache(process.env.VALKEY_URL ?? "redis://127.0.0.1:1");
  const tokens = createTokenSource({ clientId: clientId!, clientSecret: clientSecret!, cache });
  const client = createIgdbClient({ clientId: clientId!, tokens });

  test("IGDB accepts every field we request", async () => {
    const rows = await client.gamesPage({ since: null, afterId: 0 });

    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
  });

  test("live responses satisfy our schema", async () => {
    const rows = await client.gamesPage({ since: null, afterId: 0 });

    for (const row of rows.slice(0, 50)) {
      expect(() => v.parse(igdbGameSchema, row)).not.toThrow();
    }
  });

  test("game_type ids used for search filtering still resolve", async () => {
    const rows = await client.gamesPage({ since: null, afterId: 0 });
    const types = new Set(
      rows
        .map((row) => (row as { game_type?: { id: number } }).game_type?.id)
        .filter((id): id is number => typeof id === "number"),
    );

    expect(types.size).toBeGreaterThan(0);
  });

  /**
   * A silent no-op is the failure mode that matters here: if the theme id or the
   * `where` syntax ever stopped matching, the sweep would keep succeeding while
   * cleaning nothing.
   */
  test("the erotic sweep still matches games", async () => {
    const rows = await client.eroticGameIds({ afterId: 0 });

    expect(rows.length).toBeGreaterThan(0);
    expect(mapGameIds(rows).every((id) => Number.isInteger(id))).toBe(true);
  });
});
