import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as schema from "./schema/index.js";

export interface Database {
  db: NodePgDatabase<typeof schema>;
  pool: pg.Pool;
  close(): Promise<void>;
}

export function createDb(url: string): Database {
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  const db = drizzle(pool, { schema });

  return { db, pool, close: () => pool.end() };
}
