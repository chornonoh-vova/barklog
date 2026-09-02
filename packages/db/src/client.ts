import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as schema from "./schema/index.js";

export interface Database {
  db: NodePgDatabase<typeof schema>;
  pool: pg.Pool;
  close(): Promise<void>;
}

/**
 * A `NodePgDatabase` or a transaction handle, so callers can compose queries
 * into one transaction. Derived from drizzle's own signature rather than naming
 * `PgTransaction`'s generics, which move between minor versions.
 */
export type Queryable =
  | NodePgDatabase<typeof schema>
  | Parameters<Parameters<NodePgDatabase<typeof schema>["transaction"]>[0]>[0];

export function createDb(url: string): Database {
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  const db = drizzle(pool, { schema });

  return { db, pool, close: () => pool.end() };
}
