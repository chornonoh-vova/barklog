import { createCache } from "@repo/cache";
import { createDb } from "@repo/db";
import { createIgdbClient, createTokenSource } from "@repo/igdb";

import type { WorkerEnv } from "./env.js";
import type { SyncDeps } from "./sync.js";

export function createContext(env: WorkerEnv): { deps: SyncDeps; close(): Promise<void> } {
  const { db, pool, close: closeDb } = createDb(env.DATABASE_URL);
  const cache = createCache(env.VALKEY_URL);

  const tokens = createTokenSource({
    clientId: env.IGDB_CLIENT_ID,
    clientSecret: env.IGDB_CLIENT_SECRET,
    cache,
  });
  const igdb = createIgdbClient({ clientId: env.IGDB_CLIENT_ID, tokens });

  return {
    deps: { db, pool, cache, igdb, log: (message) => console.log(`[sync] ${message}`) },
    close: async () => {
      await closeDb();
      await cache.close();
    },
  };
}
