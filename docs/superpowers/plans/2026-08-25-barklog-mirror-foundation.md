# Barklog Mirror Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up local infrastructure and a nightly IGDB→Postgres mirror, ending with a populated games database that the API (plan 2) can serve from.

**Architecture:** Three new internal packages (`@repo/db`, `@repo/cache`, `@repo/igdb`) and one new app (`apps/worker`). The worker pages through IGDB by keyset, upserts each page in a single transaction, and advances a watermark only on success — which makes every run idempotent and every failure a no-op. Nothing in this plan serves HTTP.

**Tech Stack:** TypeScript 6, Node 24, pnpm 11 workspaces, Turborepo, Drizzle ORM 0.45 + drizzle-kit 0.31, node-postgres 8, iovalkey 0.4, zod 4, node-cron 4, Vitest 4, Testcontainers 12.

**Spec:** `docs/superpowers/specs/2026-08-25-barklog-api-design.md`

## Global Constraints

- Node `>=24`, pnpm `11.22.0`. Never run `npm install` — this is a pnpm workspace.
- Every package is ESM (`"type": "module"`). `tsconfig` uses `moduleResolution: NodeNext` with `verbatimModuleSyntax`, so **every relative import must carry a `.js` extension** even in `.ts` source.
- ESLint enforces `@typescript-eslint/consistent-type-imports`: type-only imports must use `import type`.
- ESLint enforces `turbo/no-undeclared-env-vars`: any new env var must also be listed in the relevant `turbo.json` task's `env` array.
- Internal packages compile to `dist/` and are consumed via `dist`, never via TypeScript source. Each package tsconfig sets `"declaration": true` (the shared `node.json` base sets it to `false`).
- Container images are pinned exactly: `postgres:18-alpine`, `valkey/valkey:9-alpine`. Both are used by docker-compose **and** by Testcontainers, so they must match.
- Tests never touch the docker-compose stack. Test infrastructure comes from Testcontainers only, so the suite needs nothing but a Docker socket.
- Prettier formats everything: run `pnpm format` before any commit that touches more than one file.
- IGDB rate limit is 4 requests/second with at most 8 open requests. The client must never exceed this.

---

## File Structure

### `packages/db` — schema, migrations, connection

| File                       | Responsibility                                                           |
| -------------------------- | ------------------------------------------------------------------------ |
| `src/client.ts`            | `createDb(url)` → pool + Drizzle instance + `close()`                    |
| `src/migrate.ts`           | `runMigrations(db)` — creates `pg_trgm`, then applies Drizzle migrations |
| `src/schema/mirror.ts`     | IGDB mirror tables (games, reference, join)                              |
| `src/schema/backlog.ts`    | `users`, `backlog_status` enum, `backlog_entries`                        |
| `src/schema/sync.ts`       | `sync_run_status` enum, `sync_runs`                                      |
| `src/schema/index.ts`      | re-export barrel used by Drizzle and consumers                           |
| `src/queries/sync-runs.ts` | watermark read + run lifecycle writes                                    |
| `src/index.ts`             | package barrel                                                           |
| `test/setup/containers.ts` | Vitest `globalSetup` — one Postgres container for the suite              |
| `test/helpers.ts`          | `freshDb()`, `truncateAll()`                                             |

`pg_trgm` lives in `migrate.ts` rather than a migration file because drizzle-kit will not generate `CREATE EXTENSION`, and the trigram index in the generated SQL cannot be created until the extension exists.

### `packages/cache` — Valkey wrapper

| File                       | Responsibility                                                 |
| -------------------------- | -------------------------------------------------------------- |
| `src/client.ts`            | `createCache(url)` → `get/set/incr/withCache/close`, fail-open |
| `src/index.ts`             | barrel                                                         |
| `test/setup/containers.ts` | Vitest `globalSetup` — one Valkey container                    |

### `packages/igdb` — IGDB client

| File                 | Responsibility                                           |
| -------------------- | -------------------------------------------------------- |
| `src/token.ts`       | Twitch client-credentials token, cached in Valkey        |
| `src/throttle.ts`    | 4 req/s + concurrency limiter                            |
| `src/client.ts`      | `createIgdbClient()` — request, retry, keyset pagination |
| `src/games-query.ts` | the APIcalypse field list, in one place                  |
| `src/schemas.ts`     | zod schemas for IGDB responses                           |
| `src/map.ts`         | IGDB payload → database row shapes                       |
| `src/index.ts`       | barrel                                                   |

`schemas.ts` and `map.ts` are separate because the mapper is pure and heavily unit-tested, while the schemas track IGDB's wire format.

### `apps/worker` — the sync

| File             | Responsibility                                        |
| ---------------- | ----------------------------------------------------- |
| `src/env.ts`     | zod-validated environment, read once at boot          |
| `src/persist.ts` | write one page of mapped rows in one transaction      |
| `src/sync.ts`    | `syncAll()` — lock, watermark, page loop, bookkeeping |
| `src/cli.ts`     | `pnpm --filter worker sync [--full]`                  |
| `src/index.ts`   | cron scheduler entrypoint                             |

`persist.ts` is split from `sync.ts` because page persistence is the one piece carrying the idempotency guarantee, and it is tested against a real database independently of any IGDB interaction.

---

## Task 1: `@repo/db` scaffold + Testcontainers harness + `pg_trgm`

**Files:**

- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/eslint.config.js`, `packages/db/vitest.config.ts`, `packages/db/drizzle.config.ts`
- Create: `packages/db/src/client.ts`, `packages/db/src/migrate.ts`, `packages/db/src/schema/index.ts`, `packages/db/src/index.ts`
- Test: `packages/db/test/setup/containers.ts`, `packages/db/test/extension.test.ts`

**Interfaces:**

- Produces: `createDb(url: string): { db: NodePgDatabase<typeof schema>; pool: Pool; close(): Promise<void> }`; `runMigrations(db: NodePgDatabase<typeof schema>): Promise<void>`; Vitest injected value `databaseUrl: string`.

- [ ] **Step 1: Create the package scaffold**

`packages/db/package.json`:

```json
{
  "name": "@repo/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
    "./schema": { "types": "./dist/schema/index.d.ts", "default": "./dist/schema/index.js" }
  },
  "scripts": {
    "build": "tsc",
    "db:generate": "drizzle-kit generate",
    "test": "vitest run",
    "lint": "eslint . --max-warnings 0",
    "check-types": "tsc --noEmit"
  },
  "dependencies": {
    "drizzle-orm": "^0.45.2",
    "pg": "^8.23.0"
  },
  "devDependencies": {
    "@repo/eslint-config": "workspace:*",
    "@repo/typescript-config": "workspace:*",
    "@testcontainers/postgresql": "^12.1.0",
    "@types/node": "^26.2.0",
    "@types/pg": "^8.23.1",
    "drizzle-kit": "^0.31.10",
    "eslint": "^9.39.5",
    "typescript": "~6.0.3",
    "vitest": "^4.1.11"
  }
}
```

`packages/db/tsconfig.json`:

```json
{
  "extends": "@repo/typescript-config/node.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

`packages/db/eslint.config.js`:

```js
import { nodeConfig } from "@repo/eslint-config/node";

/** @type {import("eslint").Linter.Config[]} */
export default nodeConfig;
```

`packages/db/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./test/setup/containers.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    pool: "forks",
  },
});
```

`hookTimeout` is generous because the first run pulls the Postgres image.

`packages/db/drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://barklog:barklog@localhost:5432/barklog",
  },
});
```

- [ ] **Step 2: Write the failing test**

`packages/db/test/setup/containers.ts`:

```ts
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { TestProject } from "vitest/node";

import { createDb } from "../../src/client.js";
import { runMigrations } from "../../src/migrate.js";

declare module "vitest" {
  interface ProvidedContext {
    databaseUrl: string;
  }
}

let container: StartedPostgreSqlContainer | undefined;

export async function setup(project: TestProject) {
  container = await new PostgreSqlContainer("postgres:18-alpine").start();
  const url = container.getConnectionUri();

  const { db, close } = createDb(url);
  await runMigrations(db);
  await close();

  project.provide("databaseUrl", url);
}

export async function teardown() {
  await container?.stop();
}
```

`packages/db/test/extension.test.ts`:

```ts
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
```

- [ ] **Step 3: Install dependencies and run the test to verify it fails**

```bash
pnpm install
pnpm --filter @repo/db test
```

Expected: FAIL — `Cannot find module '../../src/client.js'`.

- [ ] **Step 4: Write the minimal implementation**

`packages/db/src/client.ts`:

```ts
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
```

`packages/db/src/migrate.ts`:

```ts
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
```

`packages/db/src/schema/index.ts` (empty for now — tables arrive in Task 2):

```ts
export {};
```

`packages/db/src/index.ts`:

```ts
export { createDb, type Database } from "./client.js";
export { runMigrations } from "./migrate.js";
export * as schema from "./schema/index.js";
```

Create the empty migrations folder so `migrate()` has somewhere to look:

```bash
mkdir -p packages/db/drizzle/meta
printf '{"version":"7","dialect":"postgresql","entries":[]}\n' > packages/db/drizzle/meta/_journal.json
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm --filter @repo/db test
```

Expected: PASS, 2 tests. The first run takes ~30s while the Postgres image downloads.

- [ ] **Step 6: Commit**

```bash
pnpm format
git add packages/db pnpm-lock.yaml
git commit -m "feat(db): add @repo/db with testcontainers harness and pg_trgm"
```

---

## Task 2: Mirror schema

**Files:**

- Create: `packages/db/src/schema/mirror.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/db/drizzle/0000_*.sql` (generated)
- Test: `packages/db/test/mirror-schema.test.ts`

**Interfaces:**

- Produces: table objects `gameTypes`, `genres`, `platforms`, `companies`, `games`, `gameScreenshots`, `gameGenres`, `gamePlatforms`, `gameCompanies`, all exported from `@repo/db/schema`.

- [ ] **Step 1: Write the failing test**

`packages/db/test/mirror-schema.test.ts`:

```ts
import { sql } from "drizzle-orm";
import { afterAll, expect, inject, test } from "vitest";

import { createDb } from "../src/client.js";
import { games, gameGenres, genres } from "../src/schema/index.js";

const { db, close } = createDb(inject("databaseUrl"));

afterAll(async () => {
  await close();
});

test("a game round-trips through the mirror tables", async () => {
  await db.insert(genres).values({ id: 12, name: "Role-playing (RPG)", slug: "role-playing-rpg" });
  await db.insert(games).values({
    id: 1942,
    name: "The Witcher 3: Wild Hunt",
    slug: "the-witcher-3-wild-hunt",
    totalRatingCount: 4000,
    igdbUpdatedAt: new Date("2026-01-01T00:00:00Z"),
  });
  await db.insert(gameGenres).values({ gameId: 1942, genreId: 12 });

  const rows = await db.select().from(games);

  expect(rows).toHaveLength(1);
  expect(rows[0]!.name).toBe("The Witcher 3: Wild Hunt");
  expect(rows[0]!.totalRatingCount).toBe(4000);
});

test("the trigram index exists on games.name", async () => {
  const result = await db.execute<{ indexdef: string }>(
    sql`SELECT indexdef FROM pg_indexes WHERE indexname = 'games_name_trgm_idx'`,
  );

  expect(result.rows[0]!.indexdef).toContain("gin_trgm_ops");
});

test("parent_game_id is a soft reference with no foreign key", async () => {
  // A DLC can arrive in a sync page before its parent game does. An FK here
  // would reject the row and fail the page.
  await db.insert(games).values({
    id: 9999,
    name: "Blood and Wine",
    slug: "blood-and-wine",
    parentGameId: 424242, // does not exist
    igdbUpdatedAt: new Date("2026-01-01T00:00:00Z"),
  });

  const rows = await db
    .select()
    .from(games)
    .where(sql`${games.id} = 9999`);
  expect(rows[0]!.parentGameId).toBe(424242);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @repo/db test mirror-schema
```

Expected: FAIL — `games` is not exported from `../src/schema/index.js`.

- [ ] **Step 3: Write the schema**

`packages/db/src/schema/mirror.ts`:

```ts
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const gameTypes = pgTable("game_types", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
});

export const genres = pgTable("genres", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
});

export const platforms = pgTable("platforms", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  abbreviation: text("abbreviation"),
  slug: text("slug").notNull(),
});

export const companies = pgTable("companies", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
});

export const games = pgTable(
  "games",
  {
    id: integer("id").primaryKey(),
    name: text("name").notNull(),
    // Indexed but NOT unique: IGDB slugs occasionally migrate between games,
    // and a unique constraint would turn that into a failed sync page.
    slug: text("slug").notNull(),
    summary: text("summary"),
    firstReleaseDate: timestamp("first_release_date", { withTimezone: true }),
    gameTypeId: integer("game_type_id").references(() => gameTypes.id),
    // Deliberately no foreign key — see the test in mirror-schema.test.ts.
    parentGameId: integer("parent_game_id"),
    totalRating: real("total_rating"),
    totalRatingCount: integer("total_rating_count").notNull().default(0),
    coverImageId: text("cover_image_id"),
    igdbUpdatedAt: timestamp("igdb_updated_at", { withTimezone: true }).notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("games_slug_idx").on(t.slug),
    index("games_name_trgm_idx").using("gin", sql`${t.name} gin_trgm_ops`),
    index("games_popular_idx")
      .on(sql`${t.totalRatingCount} DESC`)
      .where(sql`${t.totalRatingCount} > 50`),
  ],
);

export const gameScreenshots = pgTable(
  "game_screenshots",
  {
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    imageId: text("image_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.imageId] })],
);

export const gameGenres = pgTable(
  "game_genres",
  {
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    genreId: integer("genre_id")
      .notNull()
      .references(() => genres.id),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.genreId] })],
);

export const gamePlatforms = pgTable(
  "game_platforms",
  {
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    platformId: integer("platform_id")
      .notNull()
      .references(() => platforms.id),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.platformId] })],
);

export const gameCompanies = pgTable(
  "game_companies",
  {
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id),
    isDeveloper: boolean("is_developer").notNull().default(false),
    isPublisher: boolean("is_publisher").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.companyId] })],
);
```

`packages/db/src/schema/index.ts`:

```ts
export * from "./mirror.js";
```

- [ ] **Step 4: Generate the migration**

```bash
pnpm --filter @repo/db db:generate
```

Inspect the emitted `packages/db/drizzle/0000_*.sql` and confirm it contains
`CREATE INDEX "games_name_trgm_idx" ... USING gin` — if drizzle-kit emitted the
index without `gin_trgm_ops`, fix the schema rather than the SQL.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
pnpm --filter @repo/db test
```

Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
pnpm format
git add packages/db
git commit -m "feat(db): add IGDB mirror schema"
```

---

## Task 3: Backlog schema, with the constraints proven

**Files:**

- Create: `packages/db/src/schema/backlog.ts`, `packages/db/test/helpers.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/db/drizzle/0001_*.sql` (generated)
- Test: `packages/db/test/backlog-constraints.test.ts`

**Interfaces:**

- Produces: `users`, `backlogEntries`, `backlogStatus` (pgEnum), and the type `BacklogStatusValue = "waiting" | "playing" | "completed" | "abandoned"`; test helper `truncateAll(db): Promise<void>`.

These tests are the point of the task. §4 of the spec claims the database
enforces "exactly one status per game" and the 1–10 rating range. A claim that
the database enforces something is only worth making if a test proves the
database rejects the violation.

- [ ] **Step 1: Write the failing test**

`packages/db/test/helpers.ts`:

```ts
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

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
```

`packages/db/test/backlog-constraints.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, inject, test } from "vitest";

import { createDb } from "../src/client.js";
import { backlogEntries, games, users } from "../src/schema/index.js";
import { truncateAll } from "./helpers.js";

const { db, close } = createDb(inject("databaseUrl"));

beforeEach(async () => {
  await truncateAll(db);
  await db.insert(users).values({ id: "user_alice" });
  await db.insert(games).values([
    { id: 1, name: "Hades", slug: "hades", igdbUpdatedAt: new Date() },
    { id: 2, name: "Celeste", slug: "celeste", igdbUpdatedAt: new Date() },
  ]);
});

afterAll(async () => {
  await close();
});

describe("exactly one status per game", () => {
  test("a second entry for the same (user, game) is rejected", async () => {
    await db.insert(backlogEntries).values({ userId: "user_alice", gameId: 1, status: "playing" });

    await expect(
      db.insert(backlogEntries).values({ userId: "user_alice", gameId: 1, status: "completed" }),
    ).rejects.toThrow(/duplicate key value/i);
  });

  test("the same game for a different user is allowed", async () => {
    await db.insert(users).values({ id: "user_bob" });
    await db.insert(backlogEntries).values({ userId: "user_alice", gameId: 1, status: "playing" });
    await db.insert(backlogEntries).values({ userId: "user_bob", gameId: 1, status: "waiting" });

    const rows = await db.select().from(backlogEntries);
    expect(rows).toHaveLength(2);
  });
});

describe("rating range", () => {
  test.each([0, 11, -1, 100])("rating %i is rejected", async (rating) => {
    await expect(
      db.insert(backlogEntries).values({
        userId: "user_alice",
        gameId: 1,
        status: "completed",
        rating,
      }),
    ).rejects.toThrow(/backlog_entries_rating_range/);
  });

  test.each([1, 5, 10])("rating %i is accepted", async (rating) => {
    await db.insert(backlogEntries).values({
      userId: "user_alice",
      gameId: 2,
      status: "completed",
      rating,
    });

    const rows = await db.select().from(backlogEntries);
    expect(rows[0]!.rating).toBe(rating);
  });

  test("rating is optional", async () => {
    await db.insert(backlogEntries).values({ userId: "user_alice", gameId: 1, status: "waiting" });

    const rows = await db.select().from(backlogEntries);
    expect(rows[0]!.rating).toBeNull();
  });
});

test("an unknown status value is rejected by the enum", async () => {
  await expect(
    db.execute(
      "INSERT INTO backlog_entries (user_id, game_id, status) VALUES ('user_alice', 1, 'someday')",
    ),
  ).rejects.toThrow(/invalid input value for enum/i);
});

test("deleting a user removes their entries", async () => {
  await db.insert(backlogEntries).values({ userId: "user_alice", gameId: 1, status: "playing" });
  await db.execute("DELETE FROM users WHERE id = 'user_alice'");

  const rows = await db.select().from(backlogEntries);
  expect(rows).toHaveLength(0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @repo/db test backlog-constraints
```

Expected: FAIL — `backlogEntries` is not exported.

- [ ] **Step 3: Write the schema**

`packages/db/src/schema/backlog.ts`:

```ts
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { games } from "./mirror.js";

export const BACKLOG_STATUSES = ["waiting", "playing", "completed", "abandoned"] as const;
export type BacklogStatusValue = (typeof BACKLOG_STATUSES)[number];

export const backlogStatus = pgEnum("backlog_status", BACKLOG_STATUSES);

export const users = pgTable("users", {
  // The Clerk `sub`, verbatim — an authenticated request needs no lookup to
  // know who is asking.
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const backlogEntries = pgTable(
  "backlog_entries",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    status: backlogStatus("status").notNull(),
    rating: smallint("rating"),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // This composite primary key IS the "exactly one status per game" rule.
    primaryKey({ columns: [t.userId, t.gameId] }),
    index("backlog_entries_user_status_idx").on(t.userId, t.status),
    check("backlog_entries_rating_range", sql`${t.rating} BETWEEN 1 AND 10`),
  ],
);
```

`packages/db/src/schema/index.ts`:

```ts
export * from "./mirror.js";
export * from "./backlog.js";
```

- [ ] **Step 4: Generate the migration and run the tests**

```bash
pnpm --filter @repo/db db:generate
pnpm --filter @repo/db test
```

Expected: PASS, 17 tests.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add packages/db
git commit -m "feat(db): add backlog schema with enforced status and rating constraints"
```

---

## Task 4: `sync_runs` and the watermark

**Files:**

- Create: `packages/db/src/schema/sync.ts`, `packages/db/src/queries/sync-runs.ts`
- Modify: `packages/db/src/schema/index.ts`, `packages/db/src/index.ts`, `packages/db/test/helpers.ts`
- Create: `packages/db/drizzle/0002_*.sql` (generated)
- Test: `packages/db/test/sync-runs.test.ts`

**Interfaces:**

- Produces:
  - `syncRuns`, `syncRunStatus`
  - `startRun(db): Promise<string>` — returns the new run id
  - `finishRun(db, id, { watermark: Date; counts: Record<string, number> }): Promise<void>`
  - `failRun(db, id, error: string): Promise<void>`
  - `getWatermark(db): Promise<Date | null>` — last **successful** watermark minus 60s of overlap, or `null` if there has never been a successful run

- [ ] **Step 1: Write the failing test**

Add `sync_runs` to the truncate list in `packages/db/test/helpers.ts`:

```ts
    TRUNCATE TABLE
      sync_runs,
      backlog_entries, users,
```

`packages/db/test/sync-runs.test.ts`:

```ts
import { afterAll, beforeEach, expect, inject, test } from "vitest";

import { createDb } from "../src/client.js";
import { failRun, finishRun, getWatermark, startRun } from "../src/queries/sync-runs.js";
import { truncateAll } from "./helpers.js";

const { db, close } = createDb(inject("databaseUrl"));

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await close();
});

test("no successful run yet means no watermark, which triggers a full seed", async () => {
  expect(await getWatermark(db)).toBeNull();
});

test("a successful run sets a watermark, rewound by the 60s overlap", async () => {
  const id = await startRun(db);
  const watermark = new Date("2026-08-20T00:00:00Z");
  await finishRun(db, id, { watermark, counts: { games: 12 } });

  const result = await getWatermark(db);

  expect(result).toEqual(new Date("2026-08-19T23:59:00Z"));
});

test("a failed run does not advance the watermark, so the range is retried", async () => {
  const first = await startRun(db);
  await finishRun(db, first, {
    watermark: new Date("2026-08-20T00:00:00Z"),
    counts: { games: 12 },
  });

  const second = await startRun(db);
  await failRun(db, second, "IGDB returned 503");

  // Still the first run's watermark: tomorrow re-fetches the same range.
  expect(await getWatermark(db)).toEqual(new Date("2026-08-19T23:59:00Z"));
});

test("the most recent successful run wins", async () => {
  const older = await startRun(db);
  await finishRun(db, older, {
    watermark: new Date("2026-08-18T00:00:00Z"),
    counts: {},
  });
  const newer = await startRun(db);
  await finishRun(db, newer, {
    watermark: new Date("2026-08-20T00:00:00Z"),
    counts: {},
  });

  expect(await getWatermark(db)).toEqual(new Date("2026-08-19T23:59:00Z"));
});

test("failRun records the error and marks the run failed", async () => {
  const id = await startRun(db);
  await failRun(db, id, "boom");

  const rows = await db.query.syncRuns.findMany();
  expect(rows[0]!.status).toBe("failed");
  expect(rows[0]!.error).toBe("boom");
  expect(rows[0]!.finishedAt).not.toBeNull();
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @repo/db test sync-runs
```

Expected: FAIL — cannot find `../src/queries/sync-runs.js`.

- [ ] **Step 3: Write the schema and queries**

`packages/db/src/schema/sync.ts`:

```ts
import { sql } from "drizzle-orm";
import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const syncRunStatus = pgEnum("sync_run_status", ["running", "success", "failed"]);

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: syncRunStatus("status").notNull().default("running"),
    watermark: timestamp("watermark", { withTimezone: true }),
    counts: jsonb("counts").$type<Record<string, number>>().notNull().default({}),
    error: text("error"),
  },
  (t) => [
    index("sync_runs_success_idx")
      .on(sql`${t.finishedAt} DESC`)
      .where(sql`${t.status} = 'success'`),
  ],
);
```

`packages/db/src/queries/sync-runs.ts`:

```ts
import { desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "../schema/index.js";
import { syncRuns } from "../schema/sync.js";

type Db = NodePgDatabase<typeof schema>;

/**
 * Rewind the watermark by a minute before querying IGDB. IGDB's `updated_at`
 * has second resolution and rows can land either side of a boundary, so a small
 * overlap costs a few redundant upserts and prevents a silent gap.
 */
const OVERLAP_MS = 60_000;

export async function startRun(db: Db): Promise<string> {
  const [row] = await db.insert(syncRuns).values({}).returning({ id: syncRuns.id });
  return row!.id;
}

export async function finishRun(
  db: Db,
  id: string,
  result: { watermark: Date; counts: Record<string, number> },
): Promise<void> {
  await db
    .update(syncRuns)
    .set({
      status: "success",
      finishedAt: new Date(),
      watermark: result.watermark,
      counts: result.counts,
    })
    .where(eq(syncRuns.id, id));
}

export async function failRun(db: Db, id: string, error: string): Promise<void> {
  await db
    .update(syncRuns)
    .set({ status: "failed", finishedAt: new Date(), error })
    .where(eq(syncRuns.id, id));
}

/**
 * The watermark of the most recent successful run, minus the overlap. `null`
 * means no successful run has ever completed, which the caller treats as a
 * request for a full seed. A failed run never advances this, so a failed range
 * is simply retried on the next run.
 */
export async function getWatermark(db: Db): Promise<Date | null> {
  const [row] = await db
    .select({ watermark: syncRuns.watermark })
    .from(syncRuns)
    .where(eq(syncRuns.status, "success"))
    .orderBy(desc(syncRuns.finishedAt))
    .limit(1);

  if (!row?.watermark) return null;

  return new Date(row.watermark.getTime() - OVERLAP_MS);
}
```

`packages/db/src/schema/index.ts`:

```ts
export * from "./mirror.js";
export * from "./backlog.js";
export * from "./sync.js";
```

`packages/db/src/index.ts`:

```ts
export { createDb, type Database } from "./client.js";
export { runMigrations } from "./migrate.js";
export * from "./queries/sync-runs.js";
export * as schema from "./schema/index.js";
export { BACKLOG_STATUSES, type BacklogStatusValue } from "./schema/backlog.js";
```

- [ ] **Step 4: Generate the migration and run the full suite**

```bash
pnpm --filter @repo/db db:generate
pnpm --filter @repo/db test
```

Expected: PASS, 22 tests.

- [ ] **Step 5: Verify the package builds and lints**

```bash
pnpm --filter @repo/db build
pnpm --filter @repo/db lint
pnpm --filter @repo/db check-types
```

Expected: all clean, and `packages/db/dist/index.d.ts` exists.

- [ ] **Step 6: Commit**

```bash
pnpm format
git add packages/db
git commit -m "feat(db): add sync_runs and watermark queries"
```

---

## Task 5: `@repo/cache` — a Valkey wrapper that fails open

**Files:**

- Create: `packages/cache/package.json`, `packages/cache/tsconfig.json`, `packages/cache/eslint.config.js`, `packages/cache/vitest.config.ts`
- Create: `packages/cache/src/client.ts`, `packages/cache/src/index.ts`
- Test: `packages/cache/test/setup/containers.ts`, `packages/cache/test/cache.test.ts`

**Interfaces:**

- Produces:
  ```ts
  interface Cache {
    get<T>(key: string): Promise<T | null>;
    set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
    incr(key: string): Promise<number | null>;
    ping(): Promise<boolean>;
    close(): Promise<void>;
  }
  function createCache(url: string): Cache;
  ```

Spec §10 says the cache "must never be able to take the service down". That is
a behavioural claim, so the task's headline test is the one that points a cache
at a dead port and asserts it returns `null` instead of throwing.

- [ ] **Step 1: Create the package scaffold**

`packages/cache/package.json`:

```json
{
  "name": "@repo/cache",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" }
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "lint": "eslint . --max-warnings 0",
    "check-types": "tsc --noEmit"
  },
  "dependencies": {
    "iovalkey": "^0.4.0"
  },
  "devDependencies": {
    "@repo/eslint-config": "workspace:*",
    "@repo/typescript-config": "workspace:*",
    "@testcontainers/redis": "^12.1.0",
    "@types/node": "^26.2.0",
    "eslint": "^9.39.5",
    "typescript": "~6.0.3",
    "vitest": "^4.1.11"
  }
}
```

`packages/cache/tsconfig.json` and `packages/cache/eslint.config.js` are byte-identical to the ones written in Task 1 for `packages/db`.

`packages/cache/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./test/setup/containers.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    pool: "forks",
  },
});
```

- [ ] **Step 2: Write the failing test**

`packages/cache/test/setup/containers.ts`:

```ts
import { RedisContainer, type StartedRedisContainer } from "@testcontainers/redis";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  interface ProvidedContext {
    valkeyUrl: string;
  }
}

let container: StartedRedisContainer | undefined;

// The Redis testcontainers module drives Valkey unchanged — Valkey is
// wire-compatible — so we point it at the same image docker-compose uses.
export async function setup(project: TestProject) {
  container = await new RedisContainer("valkey/valkey:9-alpine").start();
  project.provide("valkeyUrl", container.getConnectionUrl());
}

export async function teardown() {
  await container?.stop();
}
```

`packages/cache/test/cache.test.ts`:

```ts
import { afterAll, expect, inject, test } from "vitest";

import { createCache } from "../src/client.js";

const cache = createCache(inject("valkeyUrl"));

afterAll(async () => {
  await cache.close();
});

test("values round-trip as JSON", async () => {
  await cache.set("games:1", { id: 1, name: "Hades" }, 60);

  expect(await cache.get<{ id: number; name: string }>("games:1")).toEqual({
    id: 1,
    name: "Hades",
  });
});

test("a missing key reads as null", async () => {
  expect(await cache.get("nope")).toBeNull();
});

test("a zero TTL does not write", async () => {
  await cache.set("zero", "x", 0);
  expect(await cache.get("zero")).toBeNull();
});

test("incr counts up from nothing, which is how search:ver works", async () => {
  expect(await cache.incr("search:ver")).toBe(1);
  expect(await cache.incr("search:ver")).toBe(2);
});

test("ping reports a healthy connection, which /readyz depends on", async () => {
  expect(await cache.ping()).toBe(true);
});

test("a dead Valkey fails open rather than throwing", async () => {
  // Spec §10: the cache must never be able to take the service down.
  const dead = createCache("redis://127.0.0.1:1");

  expect(await dead.get("anything")).toBeNull();
  await expect(dead.set("anything", "value", 60)).resolves.toBeUndefined();
  expect(await dead.incr("counter")).toBeNull();
  expect(await dead.ping()).toBe(false);

  await dead.close();
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
pnpm install
pnpm --filter @repo/cache test
```

Expected: FAIL — cannot find `../src/client.js`.

- [ ] **Step 4: Write the implementation**

`packages/cache/src/client.ts`:

```ts
import Valkey from "iovalkey";

export interface Cache {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  incr(key: string): Promise<number | null>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

/**
 * Every operation swallows connection errors and degrades to "no cache". The
 * cache holds nothing that cannot be recomputed, so a Valkey outage must cost
 * latency and nothing else.
 */
export function createCache(url: string): Cache {
  const client = new Valkey(url, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 1_000,
    retryStrategy: () => null,
  });

  // Without a listener, ioredis-style clients throw unhandled 'error' events.
  client.on("error", (error: Error) => {
    console.warn(`[cache] ${error.message}`);
  });

  async function failOpen<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      console.warn(`[cache] degraded: ${(error as Error).message}`);
      return fallback;
    }
  }

  return {
    get: <T>(key: string) =>
      failOpen<T | null>(async () => {
        const raw = await client.get(key);
        return raw === null ? null : (JSON.parse(raw) as T);
      }, null),

    set: (key, value, ttlSeconds) =>
      failOpen(async () => {
        if (ttlSeconds <= 0) return;
        await client.set(key, JSON.stringify(value), "EX", ttlSeconds);
      }, undefined),

    incr: (key) => failOpen<number | null>(() => client.incr(key), null),

    ping: () => failOpen(async () => (await client.ping()) === "PONG", false),

    close: async () => {
      await failOpen(async () => {
        client.disconnect();
      }, undefined);
    },
  };
}
```

`packages/cache/src/index.ts`:

```ts
export { createCache, type Cache } from "./client.js";
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
pnpm --filter @repo/cache test
pnpm --filter @repo/cache build
pnpm --filter @repo/cache lint
```

Expected: PASS, 6 tests; clean build and lint.

- [ ] **Step 6: Commit**

```bash
pnpm format
git add packages/cache pnpm-lock.yaml
git commit -m "feat(cache): add fail-open Valkey wrapper"
```

---

## Task 6: `@repo/igdb` — throttle and token

**Files:**

- Create: `packages/igdb/package.json`, `packages/igdb/tsconfig.json`, `packages/igdb/eslint.config.js`, `packages/igdb/vitest.config.ts`
- Create: `packages/igdb/src/throttle.ts`, `packages/igdb/src/token.ts`, `packages/igdb/src/index.ts`
- Test: `packages/igdb/test/throttle.test.ts`, `packages/igdb/test/token.test.ts`

**Interfaces:**

- Produces:
  ```ts
  function createThrottle(opts: {
    concurrency: number;
    minIntervalMs: number;
  }): <T>(fn: () => Promise<T>) => Promise<T>;

  interface TokenSource {
    get(): Promise<string>;
  }
  function createTokenSource(opts: {
    clientId: string;
    clientSecret: string;
    cache: Pick<Cache, "get" | "set">;
    fetchImpl?: typeof fetch;
  }): TokenSource;
  ```

This task has no container dependency — both units take their I/O as a
parameter, so both are pure unit tests.

- [ ] **Step 1: Create the scaffold**

`packages/igdb/package.json`:

```json
{
  "name": "@repo/igdb",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" }
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "lint": "eslint . --max-warnings 0",
    "check-types": "tsc --noEmit"
  },
  "dependencies": {
    "@repo/cache": "workspace:*",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@repo/eslint-config": "workspace:*",
    "@repo/typescript-config": "workspace:*",
    "@types/node": "^26.2.0",
    "eslint": "^9.39.5",
    "typescript": "~6.0.3",
    "vitest": "^4.1.11"
  }
}
```

`packages/igdb/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { testTimeout: 10_000 },
});
```

`tsconfig.json` and `eslint.config.js` are identical to Task 1's.

- [ ] **Step 2: Write the failing tests**

`packages/igdb/test/throttle.test.ts`:

```ts
import { expect, test } from "vitest";

import { createThrottle } from "../src/throttle.js";

test("never runs more than `concurrency` tasks at once", async () => {
  const throttle = createThrottle({ concurrency: 4, minIntervalMs: 0 });
  let active = 0;
  let peak = 0;

  await Promise.all(
    Array.from({ length: 20 }, () =>
      throttle(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
      }),
    ),
  );

  expect(peak).toBeLessThanOrEqual(4);
});

test("spaces starts by at least minIntervalMs", async () => {
  // IGDB allows 4 requests/second. With 8 tasks at 20ms spacing the last one
  // cannot start before 140ms have passed.
  const throttle = createThrottle({ concurrency: 4, minIntervalMs: 20 });
  const started = Date.now();

  await Promise.all(Array.from({ length: 8 }, () => throttle(async () => {})));

  expect(Date.now() - started).toBeGreaterThanOrEqual(130);
});

test("a rejecting task releases its slot", async () => {
  const throttle = createThrottle({ concurrency: 1, minIntervalMs: 0 });

  await expect(throttle(async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
  await expect(throttle(async () => "recovered")).resolves.toBe("recovered");
});
```

`packages/igdb/test/token.test.ts`:

```ts
import { expect, test, vi } from "vitest";

import { createTokenSource } from "../src/token.js";

function fakeCache() {
  const store = new Map<string, unknown>();
  return {
    store,
    get: async <T>(key: string) => (store.get(key) as T) ?? null,
    set: async (key: string, value: unknown) => void store.set(key, value),
  };
}

function tokenResponse(accessToken: string, expiresIn = 5_000_000) {
  return new Response(
    JSON.stringify({ access_token: accessToken, expires_in: expiresIn, token_type: "bearer" }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

test("fetches a token from Twitch with client credentials", async () => {
  const cache = fakeCache();
  const fetchImpl = vi.fn(async () => tokenResponse("tok_abc"));

  const source = createTokenSource({
    clientId: "cid",
    clientSecret: "secret",
    cache,
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });

  expect(await source.get()).toBe("tok_abc");

  const url = new URL((fetchImpl.mock.calls[0] as unknown as [string])[0]);
  expect(url.origin + url.pathname).toBe("https://id.twitch.tv/oauth2/token");
  expect(url.searchParams.get("client_id")).toBe("cid");
  expect(url.searchParams.get("grant_type")).toBe("client_credentials");
});

test("caches the token in Valkey with an hour of headroom", async () => {
  const cache = fakeCache();
  const setSpy = vi.spyOn(cache, "set");
  const fetchImpl = vi.fn(async () => tokenResponse("tok_abc", 5_000_000));

  const source = createTokenSource({
    clientId: "cid",
    clientSecret: "secret",
    cache,
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  await source.get();

  expect(setSpy).toHaveBeenCalledWith("igdb:token", "tok_abc", 5_000_000 - 3600);
});

test("a cached token short-circuits the network entirely", async () => {
  const cache = fakeCache();
  cache.store.set("igdb:token", "tok_cached");
  const fetchImpl = vi.fn(async () => tokenResponse("tok_fresh"));

  const source = createTokenSource({
    clientId: "cid",
    clientSecret: "secret",
    cache,
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });

  expect(await source.get()).toBe("tok_cached");
  expect(fetchImpl).not.toHaveBeenCalled();
});

test("a second call in the same process reuses the in-memory token", async () => {
  // The in-memory fallback is what keeps a Valkey outage from stopping a sync.
  const fetchImpl = vi.fn(async () => tokenResponse("tok_abc"));
  const deadCache = {
    get: async () => null,
    set: async () => {},
  };

  const source = createTokenSource({
    clientId: "cid",
    clientSecret: "secret",
    cache: deadCache,
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });

  await source.get();
  await source.get();

  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test("a Twitch failure surfaces as an error", async () => {
  const fetchImpl = vi.fn(async () => new Response("nope", { status: 401 }));

  const source = createTokenSource({
    clientId: "cid",
    clientSecret: "bad",
    cache: fakeCache(),
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });

  await expect(source.get()).rejects.toThrow(/401/);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
pnpm install
pnpm --filter @repo/igdb test
```

Expected: FAIL — cannot find `../src/throttle.js` or `../src/token.js`.

- [ ] **Step 4: Write the implementations**

`packages/igdb/src/throttle.ts`:

```ts
export interface ThrottleOptions {
  concurrency: number;
  minIntervalMs: number;
}

/**
 * IGDB permits 4 requests per second with at most 8 open at once. This gates
 * both dimensions: a concurrency slot, and a start time at least
 * `minIntervalMs` after the previously scheduled start.
 */
export function createThrottle(options: ThrottleOptions) {
  const waiting: Array<() => void> = [];
  let active = 0;
  let nextSlotAt = 0;

  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= options.concurrency) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    active += 1;

    const now = Date.now();
    const startAt = Math.max(now, nextSlotAt);
    nextSlotAt = startAt + options.minIntervalMs;

    if (startAt > now) {
      await new Promise((resolve) => setTimeout(resolve, startAt - now));
    }

    try {
      return await fn();
    } finally {
      active -= 1;
      waiting.shift()?.();
    }
  };
}
```

`packages/igdb/src/token.ts`:

```ts
const TOKEN_KEY = "igdb:token";
const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
/** Refresh an hour before expiry so a long sync never runs out mid-flight. */
const HEADROOM_SECONDS = 3600;

export interface TokenCache {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
}

export interface TokenSource {
  get(): Promise<string>;
}

export interface TokenSourceOptions {
  clientId: string;
  clientSecret: string;
  cache: TokenCache;
  fetchImpl?: typeof fetch;
}

export function createTokenSource(options: TokenSourceOptions): TokenSource {
  const doFetch = options.fetchImpl ?? fetch;
  let inMemory: string | null = null;
  let inFlight: Promise<string> | null = null;

  async function fetchToken(): Promise<string> {
    const url = new URL(TOKEN_URL);
    url.searchParams.set("client_id", options.clientId);
    url.searchParams.set("client_secret", options.clientSecret);
    url.searchParams.set("grant_type", "client_credentials");

    const response = await doFetch(url.toString(), { method: "POST" });
    if (!response.ok) {
      throw new Error(`IGDB token request failed with ${response.status}`);
    }

    const body = (await response.json()) as { access_token: string; expires_in: number };
    inMemory = body.access_token;
    await options.cache.set(TOKEN_KEY, body.access_token, body.expires_in - HEADROOM_SECONDS);
    return body.access_token;
  }

  return {
    async get(): Promise<string> {
      if (inMemory) return inMemory;

      const cached = await options.cache.get<string>(TOKEN_KEY);
      if (cached) {
        inMemory = cached;
        return cached;
      }

      // Collapse concurrent misses into one Twitch call.
      inFlight ??= fetchToken().finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
  };
}
```

`packages/igdb/src/index.ts`:

```ts
export { createThrottle, type ThrottleOptions } from "./throttle.js";
export { createTokenSource, type TokenSource, type TokenCache } from "./token.js";
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
pnpm --filter @repo/igdb test
```

Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
pnpm format
git add packages/igdb pnpm-lock.yaml
git commit -m "feat(igdb): add rate-limit throttle and cached Twitch token source"
```

---

## Task 7: `@repo/igdb` — response schemas, mapping, and the paging client

**Files:**

- Create: `packages/igdb/src/schemas.ts`, `packages/igdb/src/games-query.ts`, `packages/igdb/src/map.ts`, `packages/igdb/src/client.ts`
- Modify: `packages/igdb/src/index.ts`
- Test: `packages/igdb/test/map.test.ts`, `packages/igdb/test/client.test.ts`

**Interfaces:**

- Produces:
  ```ts
  const GAME_FIELDS: string; // the APIcalypse field list
  function gamesPageQuery(o: { since: Date | null; afterId: number; limit: number }): string;

  type IgdbGame = z.infer<typeof igdbGameSchema>;

  interface MappedPage {
    gameTypes: { id: number; name: string }[];
    genres: { id: number; name: string; slug: string }[];
    platforms: { id: number; name: string; abbreviation: string | null; slug: string }[];
    companies: { id: number; name: string; slug: string }[];
    games: {
      id: number;
      name: string;
      slug: string;
      summary: string | null;
      firstReleaseDate: Date | null;
      gameTypeId: number | null;
      parentGameId: number | null;
      totalRating: number | null;
      totalRatingCount: number;
      coverImageId: string | null;
      igdbUpdatedAt: Date;
    }[];
    screenshots: { gameId: number; imageId: string }[];
    gameGenres: { gameId: number; genreId: number }[];
    gamePlatforms: { gameId: number; platformId: number }[];
    gameCompanies: {
      gameId: number;
      companyId: number;
      isDeveloper: boolean;
      isPublisher: boolean;
    }[];
  }
  function mapGames(raw: unknown[]): MappedPage;

  interface IgdbClient {
    gamesPage(o: { since: Date | null; afterId: number }): Promise<unknown[]>;
  }
  function createIgdbClient(o: {
    clientId: string;
    tokens: TokenSource;
    fetchImpl?: typeof fetch;
    throttle?: ReturnType<typeof createThrottle>;
    retryBaseMs?: number;
  }): IgdbClient;
  ```

Two mapping hazards drive this task's tests, and both are real `ON CONFLICT`
failures rather than hypotheticals:

1. Two games in one page share a genre. Inserting the genre twice in a single
   statement raises _"ON CONFLICT DO UPDATE command cannot affect row a second
   time"_. Reference rows must be deduplicated by id **before** the upsert.
2. IGDB lists a company twice for one game — once as developer, once as
   publisher. Those two rows collide on the `(game_id, company_id)` primary key,
   so the flags must be merged into one row.

- [ ] **Step 1: Write the failing mapping test**

`packages/igdb/test/map.test.ts`:

```ts
import { expect, test } from "vitest";

import { mapGames } from "../src/map.js";

const FULL_GAME = {
  id: 1942,
  name: "The Witcher 3: Wild Hunt",
  slug: "the-witcher-3-wild-hunt",
  summary: "A story-driven open world RPG.",
  first_release_date: 1431993600,
  updated_at: 1755000000,
  total_rating: 93.5,
  total_rating_count: 4021,
  game_type: { id: 0, type: "Main Game" },
  cover: { id: 1, image_id: "co1wyy" },
  screenshots: [{ id: 10, image_id: "sc6l7z" }],
  genres: [{ id: 12, name: "Role-playing (RPG)", slug: "role-playing-rpg" }],
  platforms: [{ id: 6, name: "PC (Microsoft Windows)", abbreviation: "PC", slug: "win" }],
  involved_companies: [
    {
      id: 1,
      company: { id: 908, name: "CD Projekt RED", slug: "cd-projekt-red" },
      developer: true,
    },
    {
      id: 2,
      company: { id: 908, name: "CD Projekt RED", slug: "cd-projekt-red" },
      publisher: true,
    },
  ],
};

test("maps a fully populated game", () => {
  const page = mapGames([FULL_GAME]);

  expect(page.games[0]).toEqual({
    id: 1942,
    name: "The Witcher 3: Wild Hunt",
    slug: "the-witcher-3-wild-hunt",
    summary: "A story-driven open world RPG.",
    firstReleaseDate: new Date("2015-05-19T00:00:00.000Z"),
    gameTypeId: 0,
    parentGameId: null,
    totalRating: 93.5,
    totalRatingCount: 4021,
    coverImageId: "co1wyy",
    igdbUpdatedAt: new Date(1755000000 * 1000),
  });
  expect(page.screenshots).toEqual([{ gameId: 1942, imageId: "sc6l7z" }]);
  expect(page.gameGenres).toEqual([{ gameId: 1942, genreId: 12 }]);
  expect(page.gamePlatforms).toEqual([{ gameId: 1942, platformId: 6 }]);
});

test("IGDB omits absent optional fields entirely", () => {
  // IGDB does not send nulls — it leaves the key out. Every optional field must
  // survive being missing.
  const page = mapGames([{ id: 7, name: "Minimal", slug: "minimal", updated_at: 1700000000 }]);

  expect(page.games[0]).toEqual({
    id: 7,
    name: "Minimal",
    slug: "minimal",
    summary: null,
    firstReleaseDate: null,
    gameTypeId: null,
    parentGameId: null,
    totalRating: null,
    totalRatingCount: 0,
    coverImageId: null,
    igdbUpdatedAt: new Date(1700000000 * 1000),
  });
  expect(page.genres).toEqual([]);
  expect(page.gameCompanies).toEqual([]);
});

test("a company that both develops and publishes becomes one row with both flags", () => {
  // Two involved_companies entries collide on the (game_id, company_id) PK.
  const page = mapGames([FULL_GAME]);

  expect(page.gameCompanies).toEqual([
    { gameId: 1942, companyId: 908, isDeveloper: true, isPublisher: true },
  ]);
  expect(page.companies).toEqual([{ id: 908, name: "CD Projekt RED", slug: "cd-projekt-red" }]);
});

test("a genre shared by two games is emitted once", () => {
  // Otherwise: "ON CONFLICT DO UPDATE command cannot affect row a second time".
  const page = mapGames([
    FULL_GAME,
    { ...FULL_GAME, id: 1943, slug: "blood-and-wine", involved_companies: [] },
  ]);

  expect(page.genres).toHaveLength(1);
  expect(page.platforms).toHaveLength(1);
  expect(page.gameTypes).toHaveLength(1);
  expect(page.gameGenres).toHaveLength(2);
});

test("platform abbreviation is optional", () => {
  const page = mapGames([
    {
      ...FULL_GAME,
      platforms: [{ id: 99, name: "Odd Platform", slug: "odd" }],
    },
  ]);

  expect(page.platforms[0]).toEqual({
    id: 99,
    name: "Odd Platform",
    abbreviation: null,
    slug: "odd",
  });
});

test("a malformed record is rejected loudly rather than silently dropped", () => {
  expect(() => mapGames([{ id: "not-a-number", name: "Bad" }])).toThrow();
});
```

- [ ] **Step 2: Write the failing client test**

`packages/igdb/test/client.test.ts`:

```ts
import { expect, test, vi } from "vitest";

import { createIgdbClient } from "../src/client.js";
import { gamesPageQuery } from "../src/games-query.js";
import { createThrottle } from "../src/throttle.js";

const tokens = { get: async () => "tok_abc" };
const fastThrottle = createThrottle({ concurrency: 4, minIntervalMs: 0 });

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("sends the IGDB headers and an APIcalypse body", async () => {
  const fetchImpl = vi.fn(async () => jsonResponse([{ id: 1 }]));
  const client = createIgdbClient({
    clientId: "cid",
    tokens,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    throttle: fastThrottle,
  });

  await client.gamesPage({ since: null, afterId: 0 });

  const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("https://api.igdb.com/v4/games");
  expect(init.method).toBe("POST");
  expect((init.headers as Record<string, string>)["Client-ID"]).toBe("cid");
  expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer tok_abc");
  expect(init.body).toContain("sort id asc;");
});

test("retries a 429 and then succeeds", async () => {
  const fetchImpl = vi
    .fn()
    .mockResolvedValueOnce(new Response("slow down", { status: 429 }))
    .mockResolvedValueOnce(jsonResponse([{ id: 5 }]));

  const client = createIgdbClient({
    clientId: "cid",
    tokens,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    throttle: fastThrottle,
    retryBaseMs: 1,
  });

  await expect(client.gamesPage({ since: null, afterId: 0 })).resolves.toEqual([{ id: 5 }]);
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

test("gives up after five attempts on persistent 5xx", async () => {
  const fetchImpl = vi.fn(async () => new Response("down", { status: 503 }));
  const client = createIgdbClient({
    clientId: "cid",
    tokens,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    throttle: fastThrottle,
    retryBaseMs: 1,
  });

  await expect(client.gamesPage({ since: null, afterId: 0 })).rejects.toThrow(/503/);
  expect(fetchImpl).toHaveBeenCalledTimes(5);
});

test("a 400 is not retried — a bad query will never succeed", async () => {
  const fetchImpl = vi.fn(async () => new Response("bad field", { status: 400 }));
  const client = createIgdbClient({
    clientId: "cid",
    tokens,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    throttle: fastThrottle,
    retryBaseMs: 1,
  });

  await expect(client.gamesPage({ since: null, afterId: 0 })).rejects.toThrow(/400/);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test("the seed query has no updated_at filter", () => {
  const query = gamesPageQuery({ since: null, afterId: 0, limit: 500 });

  expect(query).toContain("where id > 0;");
  expect(query).not.toContain("updated_at >");
  expect(query).toContain("limit 500;");
});

test("the incremental query filters on updated_at in unix seconds", () => {
  const query = gamesPageQuery({
    since: new Date("2026-08-20T00:00:00Z"),
    afterId: 1200,
    limit: 500,
  });

  expect(query).toContain(`where updated_at > 1787184000 & id > 1200;`);
});

test("keyset paging sorts by id so pages cannot overlap or skip", () => {
  expect(gamesPageQuery({ since: null, afterId: 0, limit: 500 })).toContain("sort id asc;");
});
```

- [ ] **Step 3: Run both tests to verify they fail**

```bash
pnpm --filter @repo/igdb test
```

Expected: FAIL — cannot find `../src/map.js`, `../src/client.js`, `../src/games-query.js`.

- [ ] **Step 4: Write the implementations**

`packages/igdb/src/schemas.ts`:

```ts
import { z } from "zod";

/**
 * IGDB omits absent fields rather than sending null, so every optional field is
 * `.optional()` and the mapper is responsible for turning that into null.
 */
const referenceSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  slug: z.string(),
});

export const igdbGameSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  slug: z.string(),
  summary: z.string().optional(),
  first_release_date: z.number().int().optional(),
  updated_at: z.number().int(),
  total_rating: z.number().optional(),
  total_rating_count: z.number().int().optional(),
  parent_game: z.number().int().optional(),
  game_type: z.object({ id: z.number().int(), type: z.string() }).optional(),
  cover: z.object({ id: z.number().int(), image_id: z.string() }).optional(),
  screenshots: z.array(z.object({ id: z.number().int(), image_id: z.string() })).optional(),
  genres: z.array(referenceSchema).optional(),
  platforms: z
    .array(
      z.object({
        id: z.number().int(),
        name: z.string(),
        abbreviation: z.string().optional(),
        slug: z.string(),
      }),
    )
    .optional(),
  involved_companies: z
    .array(
      z.object({
        id: z.number().int(),
        company: referenceSchema,
        developer: z.boolean().optional(),
        publisher: z.boolean().optional(),
      }),
    )
    .optional(),
});

export type IgdbGame = z.infer<typeof igdbGameSchema>;
```

`packages/igdb/src/games-query.ts`:

```ts
/**
 * Only non-deprecated fields (spec §7). `category` and `status` are deprecated
 * in favour of `game_type` and `game_status`; we use `game_type` and do not
 * store release status. The nightly contract test (Task 11) fails the build if
 * IGDB rejects anything here.
 */
export const GAME_FIELDS = [
  "id",
  "name",
  "slug",
  "summary",
  "first_release_date",
  "updated_at",
  "total_rating",
  "total_rating_count",
  "parent_game",
  "game_type.id",
  "game_type.type",
  "cover.image_id",
  "screenshots.image_id",
  "genres.id",
  "genres.name",
  "genres.slug",
  "platforms.id",
  "platforms.name",
  "platforms.abbreviation",
  "platforms.slug",
  "involved_companies.company.id",
  "involved_companies.company.name",
  "involved_companies.company.slug",
  "involved_companies.developer",
  "involved_companies.publisher",
].join(",");

export interface GamesPageQueryOptions {
  since: Date | null;
  afterId: number;
  limit: number;
}

/**
 * Keyset pagination, not offset: IGDB's deep offsets degrade badly, and sorting
 * by id makes the initial seed and the nightly delta the same code path.
 */
export function gamesPageQuery(options: GamesPageQueryOptions): string {
  const where =
    options.since === null
      ? `where id > ${options.afterId};`
      : `where updated_at > ${Math.floor(options.since.getTime() / 1000)} & id > ${options.afterId};`;

  return [`fields ${GAME_FIELDS};`, where, "sort id asc;", `limit ${options.limit};`].join("\n");
}
```

`packages/igdb/src/map.ts`:

```ts
import { igdbGameSchema } from "./schemas.js";

export interface MappedPage {
  gameTypes: { id: number; name: string }[];
  genres: { id: number; name: string; slug: string }[];
  platforms: { id: number; name: string; abbreviation: string | null; slug: string }[];
  companies: { id: number; name: string; slug: string }[];
  games: {
    id: number;
    name: string;
    slug: string;
    summary: string | null;
    firstReleaseDate: Date | null;
    gameTypeId: number | null;
    parentGameId: number | null;
    totalRating: number | null;
    totalRatingCount: number;
    coverImageId: string | null;
    igdbUpdatedAt: Date;
  }[];
  screenshots: { gameId: number; imageId: string }[];
  gameGenres: { gameId: number; genreId: number }[];
  gamePlatforms: { gameId: number; platformId: number }[];
  gameCompanies: {
    gameId: number;
    companyId: number;
    isDeveloper: boolean;
    isPublisher: boolean;
  }[];
}

const seconds = (value: number) => new Date(value * 1000);

export function mapGames(raw: unknown[]): MappedPage {
  const games = raw.map((row) => igdbGameSchema.parse(row));

  // Reference rows are deduplicated by id: two games in one page routinely
  // share a genre, and inserting it twice in one statement raises
  // "ON CONFLICT DO UPDATE command cannot affect row a second time".
  const gameTypes = new Map<number, MappedPage["gameTypes"][number]>();
  const genres = new Map<number, MappedPage["genres"][number]>();
  const platforms = new Map<number, MappedPage["platforms"][number]>();
  const companies = new Map<number, MappedPage["companies"][number]>();
  // Keyed by `${gameId}:${companyId}` so a company listed twice for one game —
  // once as developer, once as publisher — merges into a single row.
  const gameCompanies = new Map<string, MappedPage["gameCompanies"][number]>();

  const page: MappedPage = {
    gameTypes: [],
    genres: [],
    platforms: [],
    companies: [],
    games: [],
    screenshots: [],
    gameGenres: [],
    gamePlatforms: [],
    gameCompanies: [],
  };

  for (const game of games) {
    if (game.game_type) {
      gameTypes.set(game.game_type.id, { id: game.game_type.id, name: game.game_type.type });
    }

    page.games.push({
      id: game.id,
      name: game.name,
      slug: game.slug,
      summary: game.summary ?? null,
      firstReleaseDate: game.first_release_date ? seconds(game.first_release_date) : null,
      gameTypeId: game.game_type?.id ?? null,
      parentGameId: game.parent_game ?? null,
      totalRating: game.total_rating ?? null,
      totalRatingCount: game.total_rating_count ?? 0,
      coverImageId: game.cover?.image_id ?? null,
      igdbUpdatedAt: seconds(game.updated_at),
    });

    for (const shot of game.screenshots ?? []) {
      page.screenshots.push({ gameId: game.id, imageId: shot.image_id });
    }

    for (const genre of game.genres ?? []) {
      genres.set(genre.id, { id: genre.id, name: genre.name, slug: genre.slug });
      page.gameGenres.push({ gameId: game.id, genreId: genre.id });
    }

    for (const platform of game.platforms ?? []) {
      platforms.set(platform.id, {
        id: platform.id,
        name: platform.name,
        abbreviation: platform.abbreviation ?? null,
        slug: platform.slug,
      });
      page.gamePlatforms.push({ gameId: game.id, platformId: platform.id });
    }

    for (const involved of game.involved_companies ?? []) {
      const { company } = involved;
      companies.set(company.id, { id: company.id, name: company.name, slug: company.slug });

      const key = `${game.id}:${company.id}`;
      const existing = gameCompanies.get(key);
      gameCompanies.set(key, {
        gameId: game.id,
        companyId: company.id,
        isDeveloper: (existing?.isDeveloper ?? false) || (involved.developer ?? false),
        isPublisher: (existing?.isPublisher ?? false) || (involved.publisher ?? false),
      });
    }
  }

  page.gameTypes = [...gameTypes.values()];
  page.genres = [...genres.values()];
  page.platforms = [...platforms.values()];
  page.companies = [...companies.values()];
  page.gameCompanies = [...gameCompanies.values()];

  return page;
}
```

`packages/igdb/src/client.ts`:

```ts
import { gamesPageQuery } from "./games-query.js";
import { createThrottle } from "./throttle.js";
import type { TokenSource } from "./token.js";

const IGDB_BASE = "https://api.igdb.com/v4";
const MAX_ATTEMPTS = 5;
const PAGE_SIZE = 500;

export interface IgdbClient {
  gamesPage(options: { since: Date | null; afterId: number }): Promise<unknown[]>;
}

export interface IgdbClientOptions {
  clientId: string;
  tokens: TokenSource;
  fetchImpl?: typeof fetch;
  throttle?: ReturnType<typeof createThrottle>;
  retryBaseMs?: number;
}

const isRetryable = (status: number) => status === 429 || status >= 500;

export function createIgdbClient(options: IgdbClientOptions): IgdbClient {
  const doFetch = options.fetchImpl ?? fetch;
  const throttle = options.throttle ?? createThrottle({ concurrency: 4, minIntervalMs: 250 });
  const retryBaseMs = options.retryBaseMs ?? 500;

  async function request(endpoint: string, body: string): Promise<unknown[]> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const token = await options.tokens.get();

      const response = await throttle(() =>
        doFetch(`${IGDB_BASE}/${endpoint}`, {
          method: "POST",
          headers: {
            "Client-ID": options.clientId,
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
          body,
        }),
      );

      if (response.ok) return (await response.json()) as unknown[];

      lastError = new Error(`IGDB ${endpoint} failed with ${response.status}`);

      // A 4xx other than 429 means the query itself is wrong; retrying it will
      // never help, and hammering IGDB with it is worse than failing fast.
      if (!isRetryable(response.status)) throw lastError;

      const backoff = retryBaseMs * 2 ** attempt;
      const jitter = Math.floor(backoff * 0.2 * Math.random());
      await new Promise((resolve) => setTimeout(resolve, backoff + jitter));
    }

    throw lastError;
  }

  return {
    gamesPage: (o) => request("games", gamesPageQuery({ ...o, limit: PAGE_SIZE })),
  };
}

export { PAGE_SIZE };
```

`packages/igdb/src/index.ts`:

```ts
export { createIgdbClient, PAGE_SIZE, type IgdbClient, type IgdbClientOptions } from "./client.js";
export { GAME_FIELDS, gamesPageQuery } from "./games-query.js";
export { mapGames, type MappedPage } from "./map.js";
export { igdbGameSchema, type IgdbGame } from "./schemas.js";
export { createThrottle, type ThrottleOptions } from "./throttle.js";
export { createTokenSource, type TokenSource, type TokenCache } from "./token.js";
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
pnpm --filter @repo/igdb test
pnpm --filter @repo/igdb build
pnpm --filter @repo/igdb lint
```

Expected: PASS, 21 tests; clean build and lint.

- [ ] **Step 6: Commit**

```bash
pnpm format
git add packages/igdb
git commit -m "feat(igdb): add response schemas, page mapping, and keyset paging client"
```

---

## Task 8: Page persistence and the idempotency guarantee

**Files:**

- Create: `packages/db/src/testing.ts`
- Modify: `packages/db/package.json` (add `./testing` export), `packages/db/src/queries/sync-runs.ts` (export the overlap constant)
- Delete: `packages/db/test/helpers.ts` (its `truncateAll` moves to `src/testing.ts`)
- Modify: `packages/db/test/backlog-constraints.test.ts`, `packages/db/test/sync-runs.test.ts` (import from `../src/testing.js`)
- Create: `apps/worker/package.json`, `apps/worker/tsconfig.json`, `apps/worker/eslint.config.js`, `apps/worker/vitest.config.ts`
- Create: `apps/worker/src/persist.ts`
- Test: `apps/worker/test/setup/containers.ts`, `apps/worker/test/persist.test.ts`

**Interfaces:**

- Consumes: `mapGames`, `MappedPage` (Task 7); `createDb`, `runMigrations`, schema tables (Tasks 1–4)
- Produces:
  ```ts
  // @repo/db/testing
  function startPostgres(): Promise<{ url: string; stop(): Promise<void> }>;
  function truncateAll(db: Db): Promise<void>;
  // apps/worker
  function persistPage(db: Db, page: MappedPage): Promise<void>;
  ```

`truncateAll` moves out of `test/helpers.ts` and into `src/testing.ts` now
because this is the moment it acquires a second consumer. `startPostgres`
joins it so the worker does not duplicate the container harness.

**This task carries the guarantee the whole failure model rests on.** Spec §6
says a failed run is safe to replay because every write is an upsert. Step 1's
headline test is the one that replays a page and asserts the database is
byte-identical.

- [ ] **Step 1: Write the failing test**

`apps/worker/test/setup/containers.ts`:

```ts
import { startPostgres } from "@repo/db/testing";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  interface ProvidedContext {
    databaseUrl: string;
  }
}

let stop: (() => Promise<void>) | undefined;

export async function setup(project: TestProject) {
  const postgres = await startPostgres();
  stop = postgres.stop;
  project.provide("databaseUrl", postgres.url);
}

export async function teardown() {
  await stop?.();
}
```

`apps/worker/test/persist.test.ts`:

```ts
import { createDb, schema } from "@repo/db";
import { truncateAll } from "@repo/db/testing";
import { mapGames } from "@repo/igdb";
import { afterAll, beforeEach, expect, inject, test } from "vitest";

import { persistPage } from "../src/persist.js";

const { db, close } = createDb(inject("databaseUrl"));

const PAGE = [
  {
    id: 1942,
    name: "The Witcher 3: Wild Hunt",
    slug: "the-witcher-3-wild-hunt",
    updated_at: 1755000000,
    total_rating_count: 4021,
    game_type: { id: 0, type: "Main Game" },
    cover: { id: 1, image_id: "co1wyy" },
    screenshots: [{ id: 10, image_id: "sc6l7z" }],
    genres: [{ id: 12, name: "Role-playing (RPG)", slug: "role-playing-rpg" }],
    platforms: [{ id: 6, name: "PC (Microsoft Windows)", abbreviation: "PC", slug: "win" }],
    involved_companies: [
      {
        id: 1,
        company: { id: 908, name: "CD Projekt RED", slug: "cd-projekt-red" },
        developer: true,
      },
      {
        id: 2,
        company: { id: 908, name: "CD Projekt RED", slug: "cd-projekt-red" },
        publisher: true,
      },
    ],
  },
  {
    id: 1943,
    name: "Cyberpunk 2077",
    slug: "cyberpunk-2077",
    updated_at: 1755000500,
    total_rating_count: 3000,
    game_type: { id: 0, type: "Main Game" },
    genres: [{ id: 12, name: "Role-playing (RPG)", slug: "role-playing-rpg" }],
    platforms: [{ id: 6, name: "PC (Microsoft Windows)", abbreviation: "PC", slug: "win" }],
  },
];

async function snapshot() {
  return {
    games: await db.select().from(schema.games).orderBy(schema.games.id),
    genres: await db.select().from(schema.genres),
    platforms: await db.select().from(schema.platforms),
    companies: await db.select().from(schema.companies),
    gameGenres: await db.select().from(schema.gameGenres),
    gameCompanies: await db.select().from(schema.gameCompanies),
    screenshots: await db.select().from(schema.gameScreenshots),
  };
}

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await close();
});

test("replaying the same page leaves the database identical", async () => {
  // Spec §6: a failed run does not advance the watermark, so the next run
  // re-fetches the same range. That is only safe if replay is a no-op.
  await persistPage(db, mapGames(PAGE));
  const first = await snapshot();

  await persistPage(db, mapGames(PAGE));
  const second = await snapshot();

  expect(second).toEqual(first);
});

test("a page with two games sharing a genre inserts the genre once", async () => {
  await persistPage(db, mapGames(PAGE));

  expect(await db.select().from(schema.genres)).toHaveLength(1);
  expect(await db.select().from(schema.gameGenres)).toHaveLength(2);
});

test("a company that develops and publishes becomes one row", async () => {
  await persistPage(db, mapGames(PAGE));

  const rows = await db.select().from(schema.gameCompanies);
  expect(rows).toEqual([{ gameId: 1942, companyId: 908, isDeveloper: true, isPublisher: true }]);
});

test("an updated game overwrites its previous values", async () => {
  await persistPage(db, mapGames(PAGE));

  await persistPage(
    db,
    mapGames([{ ...PAGE[0]!, name: "The Witcher 3: Wild Hunt GOTY", total_rating_count: 5000 }]),
  );

  const [game] = await db.select().from(schema.games).orderBy(schema.games.id);
  expect(game!.name).toBe("The Witcher 3: Wild Hunt GOTY");
  expect(game!.totalRatingCount).toBe(5000);
});

test("removed child rows disappear on re-sync", async () => {
  // Join rows are replaced wholesale, so a genre IGDB dropped must not linger.
  await persistPage(db, mapGames(PAGE));
  await persistPage(db, mapGames([{ ...PAGE[0]!, genres: [], screenshots: [] }]));

  const remaining = await db.select().from(schema.gameGenres);
  expect(remaining.map((row) => row.gameId)).toEqual([1943]);
  expect(await db.select().from(schema.gameScreenshots)).toHaveLength(0);
});

test("an empty page is a no-op", async () => {
  await expect(persistPage(db, mapGames([]))).resolves.toBeUndefined();
  expect(await db.select().from(schema.games)).toHaveLength(0);
});

test("a failure inside the page rolls the whole page back", async () => {
  // The transaction boundary is per page, so a half-written page cannot exist.
  const page = mapGames(PAGE);
  page.gameGenres.push({ gameId: 999999, genreId: 12 }); // violates the games FK

  await expect(persistPage(db, page)).rejects.toThrow();
  expect(await db.select().from(schema.games)).toHaveLength(0);
});
```

- [ ] **Step 2: Create the worker scaffold**

`apps/worker/package.json`:

```json
{
  "name": "worker",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "sync": "tsx src/cli.ts",
    "test": "vitest run",
    "lint": "eslint . --max-warnings 0",
    "check-types": "tsc --noEmit"
  },
  "dependencies": {
    "@repo/cache": "workspace:*",
    "@repo/db": "workspace:*",
    "@repo/igdb": "workspace:*",
    "drizzle-orm": "^0.45.2",
    "node-cron": "^4.6.0",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@repo/eslint-config": "workspace:*",
    "@repo/typescript-config": "workspace:*",
    "@types/node": "^26.2.0",
    "eslint": "^9.39.5",
    "tsx": "^4.23.12",
    "typescript": "~6.0.3",
    "vitest": "^4.1.11"
  }
}
```

`node-cron` v4 ships its own type declarations — do **not** add `@types/node-cron`.

`apps/worker/tsconfig.json` matches `apps/api/tsconfig.json` (extends `@repo/typescript-config/node.json`, `outDir: ./dist`, `rootDir: ./src`). `eslint.config.js` matches Task 1's. `vitest.config.ts` matches `packages/db`'s, pointing at `./test/setup/containers.ts`.

- [ ] **Step 3: Run the test to verify it fails**

```bash
pnpm install
pnpm --filter worker test
```

Expected: FAIL — `@repo/db/testing` is not exported, and `../src/persist.js` does not exist.

- [ ] **Step 4: Write the implementation**

`packages/db/src/testing.ts`:

```ts
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { createDb } from "./client.js";
import { runMigrations } from "./migrate.js";
import type * as schema from "./schema/index.js";

export const POSTGRES_IMAGE = "postgres:18-alpine";

/** Starts a migrated Postgres for a test suite. Never used outside tests. */
export async function startPostgres(): Promise<{ url: string; stop(): Promise<void> }> {
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  const url = container.getConnectionUri();

  const { db, close } = createDb(url);
  await runMigrations(db);
  await close();

  return { url, stop: () => container.stop() };
}

export async function truncateAll(db: NodePgDatabase<typeof schema>): Promise<void> {
  await db.execute(sql`
    TRUNCATE TABLE
      sync_runs,
      backlog_entries, users,
      game_companies, game_platforms, game_genres, game_screenshots,
      games, companies, platforms, genres, game_types
    RESTART IDENTITY CASCADE
  `);
}
```

Add to `packages/db/package.json` exports, and move `@testcontainers/postgresql` from `devDependencies` to `dependencies` (it is now imported from `src/`):

```json
    "./testing": { "types": "./dist/testing.d.ts", "default": "./dist/testing.js" }
```

Delete `packages/db/test/helpers.ts` and update the two tests that imported it to `import { truncateAll } from "../src/testing.js";`. Update `packages/db/test/setup/containers.ts` to use `startPostgres()`.

Export the overlap constant from `packages/db/src/queries/sync-runs.ts` (Task 9 needs it):

```ts
export const WATERMARK_OVERLAP_MS = 60_000;
```

and replace the local `OVERLAP_MS` references with it.

`apps/worker/src/persist.ts`:

```ts
import { schema } from "@repo/db";
import type { MappedPage } from "@repo/igdb";
import { inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

type Db = NodePgDatabase<typeof schema>;

const excluded = (column: string) => sql.raw(`excluded.${column}`);

/**
 * Writes one IGDB page in a single transaction. Reference rows are upserted
 * first so the games and join rows can never reference a missing parent, and
 * join rows are replaced wholesale so anything IGDB dropped disappears.
 *
 * Every write is an upsert or a scoped replace, which is what makes replaying
 * a page a no-op — the property the sync's failure model depends on.
 */
export async function persistPage(db: Db, page: MappedPage): Promise<void> {
  if (page.games.length === 0) return;

  const gameIds = page.games.map((game) => game.id);

  await db.transaction(async (tx) => {
    if (page.gameTypes.length > 0) {
      await tx
        .insert(schema.gameTypes)
        .values(page.gameTypes)
        .onConflictDoUpdate({ target: schema.gameTypes.id, set: { name: excluded("name") } });
    }

    if (page.genres.length > 0) {
      await tx
        .insert(schema.genres)
        .values(page.genres)
        .onConflictDoUpdate({
          target: schema.genres.id,
          set: { name: excluded("name"), slug: excluded("slug") },
        });
    }

    if (page.platforms.length > 0) {
      await tx
        .insert(schema.platforms)
        .values(page.platforms)
        .onConflictDoUpdate({
          target: schema.platforms.id,
          set: {
            name: excluded("name"),
            abbreviation: excluded("abbreviation"),
            slug: excluded("slug"),
          },
        });
    }

    if (page.companies.length > 0) {
      await tx
        .insert(schema.companies)
        .values(page.companies)
        .onConflictDoUpdate({
          target: schema.companies.id,
          set: { name: excluded("name"), slug: excluded("slug") },
        });
    }

    await tx
      .insert(schema.games)
      .values(page.games)
      .onConflictDoUpdate({
        target: schema.games.id,
        set: {
          name: excluded("name"),
          slug: excluded("slug"),
          summary: excluded("summary"),
          firstReleaseDate: excluded("first_release_date"),
          gameTypeId: excluded("game_type_id"),
          parentGameId: excluded("parent_game_id"),
          totalRating: excluded("total_rating"),
          totalRatingCount: excluded("total_rating_count"),
          coverImageId: excluded("cover_image_id"),
          igdbUpdatedAt: excluded("igdb_updated_at"),
          syncedAt: sql`now()`,
        },
      });

    await tx.delete(schema.gameScreenshots).where(inArray(schema.gameScreenshots.gameId, gameIds));
    await tx.delete(schema.gameGenres).where(inArray(schema.gameGenres.gameId, gameIds));
    await tx.delete(schema.gamePlatforms).where(inArray(schema.gamePlatforms.gameId, gameIds));
    await tx.delete(schema.gameCompanies).where(inArray(schema.gameCompanies.gameId, gameIds));

    if (page.screenshots.length > 0) {
      await tx.insert(schema.gameScreenshots).values(page.screenshots);
    }
    if (page.gameGenres.length > 0) {
      await tx.insert(schema.gameGenres).values(page.gameGenres);
    }
    if (page.gamePlatforms.length > 0) {
      await tx.insert(schema.gamePlatforms).values(page.gamePlatforms);
    }
    if (page.gameCompanies.length > 0) {
      await tx.insert(schema.gameCompanies).values(page.gameCompanies);
    }
  });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
pnpm --filter @repo/db build
pnpm --filter @repo/db test
pnpm --filter worker test
```

Expected: PASS — 22 in `@repo/db`, 7 in `worker`.

- [ ] **Step 6: Commit**

```bash
pnpm format
git add packages/db apps/worker pnpm-lock.yaml
git commit -m "feat(worker): add idempotent page persistence"
```

---

## Task 9: `syncAll()` — lock, watermark, page loop, bookkeeping

**Files:**

- Create: `apps/worker/src/sync.ts`
- Test: `apps/worker/test/sync.test.ts`

**Interfaces:**

- Consumes: `persistPage` (Task 8); `startRun`/`finishRun`/`failRun`/`getWatermark`/`WATERMARK_OVERLAP_MS` (Task 4); `IgdbClient`, `mapGames`, `PAGE_SIZE` (Task 7); `Cache` (Task 5)
- Produces:

  ```ts
  interface SyncDeps {
    db: Db;
    pool: pg.Pool;
    cache: Cache;
    igdb: IgdbClient;
    log?: (message: string) => void;
  }
  type SyncResult =
    | { status: "skipped" }
    | { status: "success"; counts: Record<string, number>; watermark: Date }
    | { status: "failed"; error: string };
  function syncAll(deps: SyncDeps, options?: { full?: boolean }): Promise<SyncResult>;
  const SYNC_LOCK_KEY = 8823001;
  ```

- [ ] **Step 1: Write the failing test**

`apps/worker/test/sync.test.ts`:

```ts
import { createDb, schema } from "@repo/db";
import { truncateAll } from "@repo/db/testing";
import { PAGE_SIZE } from "@repo/igdb";
import { afterAll, beforeEach, expect, inject, test, vi } from "vitest";

import { syncAll } from "../src/sync.js";

const { db, pool, close } = createDb(inject("databaseUrl"));

function game(id: number, updatedAt: number) {
  return {
    id,
    name: `Game ${id}`,
    slug: `game-${id}`,
    updated_at: updatedAt,
    game_type: { id: 0, type: "Main Game" },
  };
}

/** An IGDB stub that serves fixed pages and records the queries it was asked. */
function stubIgdb(pages: unknown[][]) {
  const calls: { since: Date | null; afterId: number }[] = [];
  let index = 0;
  return {
    calls,
    gamesPage: async (options: { since: Date | null; afterId: number }) => {
      calls.push(options);
      return pages[index++] ?? [];
    },
  };
}

function stubCache() {
  const incremented: string[] = [];
  return {
    incremented,
    get: async () => null,
    set: async () => {},
    incr: async (key: string) => {
      incremented.push(key);
      return 1;
    },
    ping: async () => true,
    close: async () => {},
  };
}

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await close();
});

test("a seed run pages until IGDB returns a short page", async () => {
  const igdb = stubIgdb([[game(1, 1700000000), game(2, 1700000100)], [game(3, 1700000200)]]);
  const cache = stubCache();

  const result = await syncAll({ db, pool, cache, igdb });

  expect(result).toMatchObject({ status: "success" });
  expect(await db.select().from(schema.games)).toHaveLength(3);
  expect(igdb.calls).toEqual([
    { since: null, afterId: 0 },
    { since: null, afterId: 2 },
  ]);
});

test("the watermark becomes the newest igdb updated_at ingested", async () => {
  const igdb = stubIgdb([[game(1, 1700000000), game(2, 1755000000)]]);

  const result = await syncAll({ db, pool, cache: stubCache(), igdb });

  expect(result).toMatchObject({ status: "success", watermark: new Date(1755000000 * 1000) });
});

test("a second run is incremental, asking only for changes since the watermark", async () => {
  await syncAll({ db, pool, cache: stubCache(), igdb: stubIgdb([[game(1, 1755000000)]]) });

  const second = stubIgdb([[game(2, 1755100000)]]);
  await syncAll({ db, pool, cache: stubCache(), igdb: second });

  // Rewound by the 60s overlap so nothing is lost at the second boundary.
  expect(second.calls[0]!.since).toEqual(new Date(1755000000 * 1000 - 60_000));
});

test("`full` forces a seed even when a watermark exists", async () => {
  await syncAll({ db, pool, cache: stubCache(), igdb: stubIgdb([[game(1, 1755000000)]]) });

  const second = stubIgdb([[game(2, 1755100000)]]);
  await syncAll({ db, pool, cache: stubCache(), igdb: second }, { full: true });

  expect(second.calls[0]!.since).toBeNull();
});

test("a successful run bumps search:ver so cached searches become unreachable", async () => {
  const cache = stubCache();

  await syncAll({ db, pool, cache, igdb: stubIgdb([[game(1, 1700000000)]]) });

  expect(cache.incremented).toEqual(["search:ver"]);
});

test("a failing page marks the run failed and leaves the watermark alone", async () => {
  await syncAll({ db, pool, cache: stubCache(), igdb: stubIgdb([[game(1, 1755000000)]]) });

  const broken = {
    gamesPage: vi.fn(async () => {
      throw new Error("IGDB returned 503");
    }),
  };
  const result = await syncAll({ db, pool, cache: stubCache(), igdb: broken });

  expect(result).toMatchObject({ status: "failed", error: expect.stringContaining("503") });

  const runs = await db.query.syncRuns.findMany();
  expect(runs.map((run) => run.status).sort()).toEqual(["failed", "success"]);

  // The next run still asks from the first run's watermark.
  const third = stubIgdb([[]]);
  await syncAll({ db, pool, cache: stubCache(), igdb: third });
  expect(third.calls[0]!.since).toEqual(new Date(1755000000 * 1000 - 60_000));
});

test("a failed run does not bump search:ver", async () => {
  const cache = stubCache();
  const broken = {
    gamesPage: async () => {
      throw new Error("boom");
    },
  };

  await syncAll({ db, pool, cache, igdb: broken });

  expect(cache.incremented).toEqual([]);
});

test("a run with nothing to do keeps the previous watermark rather than rewinding it", async () => {
  // Writing back the rewound value every night would drift the watermark
  // backwards by a minute per run.
  await syncAll({ db, pool, cache: stubCache(), igdb: stubIgdb([[game(1, 1755000000)]]) });
  const second = await syncAll({ db, pool, cache: stubCache(), igdb: stubIgdb([[]]) });

  expect(second).toMatchObject({ status: "success", watermark: new Date(1755000000 * 1000) });
});

test("a concurrent run is skipped rather than run twice", async () => {
  const held = await pool.connect();
  await held.query("SELECT pg_advisory_lock(8823001)");

  const result = await syncAll({ db, pool, cache: stubCache(), igdb: stubIgdb([[game(1, 1)]]) });

  expect(result).toEqual({ status: "skipped" });
  expect(await db.select().from(schema.games)).toHaveLength(0);

  await held.query("SELECT pg_advisory_unlock(8823001)");
  held.release();
});

test("a full page is followed by another request", async () => {
  const full = Array.from({ length: PAGE_SIZE }, (_, i) => game(i + 1, 1700000000 + i));
  const igdb = stubIgdb([full, []]);

  await syncAll({ db, pool, cache: stubCache(), igdb });

  expect(igdb.calls).toHaveLength(2);
  expect(igdb.calls[1]!.afterId).toBe(PAGE_SIZE);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter worker test sync
```

Expected: FAIL — cannot find `../src/sync.js`.

- [ ] **Step 3: Write the implementation**

`apps/worker/src/sync.ts`:

```ts
import type { Cache } from "@repo/cache";
import { failRun, finishRun, getWatermark, schema, startRun, WATERMARK_OVERLAP_MS } from "@repo/db";
import { mapGames, PAGE_SIZE, type IgdbClient } from "@repo/igdb";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type pg from "pg";

import { persistPage } from "./persist.js";

type Db = NodePgDatabase<typeof schema>;

/** Arbitrary but fixed: any process taking this lock is running the sync. */
export const SYNC_LOCK_KEY = 8823001;

export interface SyncDeps {
  db: Db;
  pool: pg.Pool;
  cache: Pick<Cache, "incr">;
  igdb: Pick<IgdbClient, "gamesPage">;
  log?: (message: string) => void;
}

export type SyncResult =
  | { status: "skipped" }
  | { status: "success"; counts: Record<string, number>; watermark: Date }
  | { status: "failed"; error: string };

export async function syncAll(
  deps: SyncDeps,
  options: { full?: boolean } = {},
): Promise<SyncResult> {
  const log = deps.log ?? (() => {});

  // The advisory lock is session-scoped, so it has to be taken and released on
  // one dedicated connection rather than through the pool.
  const lockConnection = await deps.pool.connect();
  const locked = await lockConnection.query<{ locked: boolean }>(
    "SELECT pg_try_advisory_lock($1) AS locked",
    [SYNC_LOCK_KEY],
  );

  if (!locked.rows[0]?.locked) {
    lockConnection.release();
    log("another sync holds the lock; skipping");
    return { status: "skipped" };
  }

  const runId = await startRun(deps.db);

  try {
    const since = options.full ? null : await getWatermark(deps.db);
    log(since ? `incremental sync since ${since.toISOString()}` : "full seed");

    const counts: Record<string, number> = { games: 0, pages: 0 };
    let afterId = 0;
    let newestUpdatedAt: Date | null = null;

    for (;;) {
      const raw = await deps.igdb.gamesPage({ since, afterId });
      if (raw.length === 0) break;

      const page = mapGames(raw);
      await persistPage(deps.db, page);

      counts.games! += page.games.length;
      counts.pages! += 1;

      for (const game of page.games) {
        afterId = Math.max(afterId, game.id);
        if (!newestUpdatedAt || game.igdbUpdatedAt > newestUpdatedAt) {
          newestUpdatedAt = game.igdbUpdatedAt;
        }
      }

      log(`page ${counts.pages} — ${page.games.length} games, next after id ${afterId}`);
      if (raw.length < PAGE_SIZE) break;
    }

    // With nothing ingested, keep the previous watermark. `since` is the stored
    // value minus the overlap, so adding it back recovers the original exactly;
    // writing `since` itself would drift the watermark backwards every run.
    const watermark =
      newestUpdatedAt ?? (since ? new Date(since.getTime() + WATERMARK_OVERLAP_MS) : new Date(0));

    await finishRun(deps.db, runId, { watermark, counts });

    // Only after a successful run: every search cached under the old version
    // becomes unreachable at once.
    await deps.cache.incr("search:ver");

    log(`sync complete — ${counts.games} games across ${counts.pages} pages`);
    return { status: "success", counts, watermark };
  } catch (error) {
    const message = (error as Error).message;
    await failRun(deps.db, runId, message);
    log(`sync failed: ${message}`);
    return { status: "failed", error: message };
  } finally {
    await lockConnection.query("SELECT pg_advisory_unlock($1)", [SYNC_LOCK_KEY]);
    lockConnection.release();
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter worker test
```

Expected: PASS, 17 tests.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add apps/worker
git commit -m "feat(worker): add syncAll with advisory lock and watermark bookkeeping"
```

---

## Task 10: Environment, CLI, cron entrypoint, and docker-compose

**Files:**

- Create: `apps/worker/src/env.ts`, `apps/worker/src/context.ts`, `apps/worker/src/cli.ts`, `apps/worker/src/index.ts`
- Create: `docker-compose.yml`, `.env.example`
- Modify: `turbo.json`, `README.md`, `.gitignore`
- Test: `apps/worker/test/env.test.ts`

**Interfaces:**

- Consumes: `syncAll` (Task 9), `createDb` (Task 1), `createCache` (Task 5), `createTokenSource`/`createIgdbClient` (Tasks 6–7)
- Produces:

  ```ts
  function parseEnv(source: NodeJS.ProcessEnv): WorkerEnv; // throws on invalid
  interface WorkerEnv {
    DATABASE_URL: string;
    VALKEY_URL: string;
    IGDB_CLIENT_ID: string;
    IGDB_CLIENT_SECRET: string;
    SYNC_CRON: string;
    SYNC_TZ: string;
  }
  function createContext(env: WorkerEnv): { deps: SyncDeps; close(): Promise<void> };
  ```

- [ ] **Step 1: Write the failing test**

`apps/worker/test/env.test.ts`:

```ts
import { expect, test } from "vitest";

import { parseEnv } from "../src/env.js";

const VALID = {
  DATABASE_URL: "postgres://barklog:barklog@localhost:5432/barklog",
  VALKEY_URL: "redis://localhost:6379",
  IGDB_CLIENT_ID: "cid",
  IGDB_CLIENT_SECRET: "secret",
};

test("applies defaults for the schedule", () => {
  const env = parseEnv(VALID);

  expect(env.SYNC_CRON).toBe("0 0 * * *");
  expect(env.SYNC_TZ).toBe("UTC");
});

test("a missing secret fails at boot rather than on first use", () => {
  // The process must refuse to start, not fail at midnight.
  expect(() => parseEnv({ ...VALID, IGDB_CLIENT_SECRET: undefined })).toThrow(/IGDB_CLIENT_SECRET/);
});

test("an empty string counts as missing", () => {
  expect(() => parseEnv({ ...VALID, IGDB_CLIENT_ID: "" })).toThrow(/IGDB_CLIENT_ID/);
});

test("overrides are respected", () => {
  const env = parseEnv({ ...VALID, SYNC_CRON: "30 3 * * *", SYNC_TZ: "Europe/Kyiv" });

  expect(env.SYNC_CRON).toBe("30 3 * * *");
  expect(env.SYNC_TZ).toBe("Europe/Kyiv");
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter worker test env
```

Expected: FAIL — cannot find `../src/env.js`.

- [ ] **Step 3: Write env, context, CLI, and the cron entrypoint**

`apps/worker/src/env.ts`:

```ts
import { z } from "zod";

const required = z.string().min(1);

const envSchema = z.object({
  DATABASE_URL: required,
  VALKEY_URL: required,
  IGDB_CLIENT_ID: required,
  IGDB_CLIENT_SECRET: required,
  SYNC_CRON: z.string().min(1).default("0 0 * * *"),
  SYNC_TZ: z.string().min(1).default("UTC"),
});

export type WorkerEnv = z.infer<typeof envSchema>;

/**
 * Parsed once at boot so a missing secret stops the process immediately rather
 * than surfacing at midnight when the sync fires.
 */
export function parseEnv(source: NodeJS.ProcessEnv): WorkerEnv {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid worker environment — ${detail}`);
  }

  return result.data;
}
```

`apps/worker/src/context.ts`:

```ts
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
```

`apps/worker/src/cli.ts`:

```ts
import { parseEnv } from "./env.js";
import { createContext } from "./context.js";
import { syncAll } from "./sync.js";

const full = process.argv.includes("--full");
const { deps, close } = createContext(parseEnv(process.env));

try {
  const result = await syncAll(deps, { full });
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.status === "failed" ? 1 : 0;
} finally {
  await close();
}
```

`apps/worker/src/index.ts`:

```ts
import cron from "node-cron";

import { createContext } from "./context.js";
import { parseEnv } from "./env.js";
import { syncAll } from "./sync.js";

const env = parseEnv(process.env);
const { deps, close } = createContext(env);

const task = cron.schedule(
  env.SYNC_CRON,
  async () => {
    await syncAll(deps);
  },
  { timezone: env.SYNC_TZ },
);

console.log(`[worker] scheduled "${env.SYNC_CRON}" (${env.SYNC_TZ})`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    console.log(`[worker] ${signal} — shutting down`);
    await task.stop();
    await close();
    process.exit(0);
  });
}
```

- [ ] **Step 4: Add local infrastructure**

`docker-compose.yml` — Postgres and Valkey only. The API and worker stay on the
host under `tsx watch`; containerising them locally would cost fast reloads and
buy nothing. Tests do not use this stack (they use Testcontainers).

```yaml
name: barklog

services:
  postgres:
    image: postgres:18-alpine
    environment:
      POSTGRES_USER: barklog
      POSTGRES_PASSWORD: barklog
      POSTGRES_DB: barklog
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U barklog"]
      interval: 5s
      timeout: 5s
      retries: 10

  valkey:
    image: valkey/valkey:9-alpine
    # Persistence off: this holds a cache and rate-limit counters, all of which
    # are reconstructible.
    command: ["valkey-server", "--save", "", "--appendonly", "no"]
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "valkey-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  pgdata:
```

`.env.example` at the repo root:

```sh
# Infrastructure (matches docker-compose.yml)
DATABASE_URL=postgres://barklog:barklog@localhost:5432/barklog
VALKEY_URL=redis://localhost:6379

# IGDB — create a Twitch application at https://dev.twitch.tv/console/apps
IGDB_CLIENT_ID=
IGDB_CLIENT_SECRET=

# Sync schedule (optional; these are the defaults)
SYNC_CRON=0 0 * * *
SYNC_TZ=UTC
```

Add `.env` to `.gitignore` if it is not already covered.

Declare the new variables in `turbo.json` or `turbo/no-undeclared-env-vars`
will fail lint. Add to the `dev`, `build`, and `start` tasks' `env` arrays:

```json
"env": [
  "PORT",
  "EXPO_PUBLIC_API_URL",
  "DATABASE_URL",
  "VALKEY_URL",
  "IGDB_CLIENT_ID",
  "IGDB_CLIENT_SECRET",
  "SYNC_CRON",
  "SYNC_TZ"
]
```

Add a `test` task to `turbo.json`:

```json
"test": {
  "dependsOn": ["^build"],
  "cache": false
}
```

and make `dev` depend on `^build` so internal packages are compiled before an
app that imports them starts:

```json
"dev": {
  "cache": false,
  "persistent": true,
  "dependsOn": ["^build"],
  "env": ["PORT", "EXPO_PUBLIC_API_URL", "DATABASE_URL", "VALKEY_URL", "IGDB_CLIENT_ID", "IGDB_CLIENT_SECRET", "SYNC_CRON", "SYNC_TZ"]
}
```

- [ ] **Step 5: Apply migrations to the local database and verify the wiring**

```bash
docker compose up -d
cp .env.example .env    # then fill in the IGDB credentials
set -a && . ./.env && set +a
pnpm --filter @repo/db db:generate   # no-op if the schema has not changed
pnpm --filter @repo/db exec drizzle-kit migrate
pnpm --filter worker test
```

Expected: migrations apply cleanly; worker tests pass.

- [ ] **Step 6: Run the seed against real IGDB**

```bash
set -a && . ./.env && set +a
pnpm --filter worker sync --full
```

Expected: roughly 700 pages over about three minutes, ending in
`{"status": "success", ...}`. Then confirm the mirror looks sane:

```bash
docker compose exec -T postgres psql -U barklog -d barklog -c \
  "SELECT count(*) AS games FROM games;
   SELECT count(*) AS genres FROM genres;
   SELECT name, total_rating_count FROM games ORDER BY total_rating_count DESC LIMIT 5;
   SELECT name FROM games WHERE 'zeld' <% name ORDER BY word_similarity('zeld', name) DESC LIMIT 5;"
```

Expected: a six-figure game count, ~23 genres, recognisable titles at the top
of the popularity list, and Zelda titles from the trigram query. Record the
actual database size for the spec's §6 estimate:

```bash
docker compose exec -T postgres psql -U barklog -d barklog -c \
  "SELECT pg_size_pretty(pg_database_size('barklog'))"
```

- [ ] **Step 7: Update the README**

Add `apps/worker` to the workspace table, and a section covering: starting
docker-compose, copying `.env.example`, running migrations, running the seed,
and the fact that tests use Testcontainers rather than the compose stack.

- [ ] **Step 8: Commit**

```bash
pnpm format
git add apps/worker docker-compose.yml .env.example turbo.json README.md .gitignore
git commit -m "feat(worker): add cron entrypoint, sync CLI, and local infrastructure"
```

---

## Task 11: IGDB field contract test

**Files:**

- Create: `packages/igdb/test/contract.test.ts`
- Modify: `packages/igdb/vitest.config.ts`, `packages/igdb/package.json`
- Create: `.github/workflows/igdb-contract.yml`

**Interfaces:**

- Consumes: `GAME_FIELDS`, `createIgdbClient`, `createTokenSource` (Tasks 6–7)

Spec §7 commits to using only non-deprecated IGDB fields. That commitment is
worthless as a note in a document — IGDB retires fields on its own schedule.
This test turns it into a build failure, and catches removals the day they land.

It needs real credentials and real network, so it is excluded from the default
run and scheduled nightly.

- [ ] **Step 1: Write the test**

`packages/igdb/test/contract.test.ts`:

```ts
import { createCache } from "@repo/cache";
import { describe, expect, test } from "vitest";

import { createIgdbClient } from "../src/client.js";
import { GAME_FIELDS } from "../src/games-query.js";
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

  test("the field list contains no deprecated fields", () => {
    // `category` and `status` were deprecated in favour of `game_type` and
    // `game_status`. Spec §7.
    expect(GAME_FIELDS).not.toMatch(/(^|,)category(\.|,|$)/);
    expect(GAME_FIELDS).not.toMatch(/(^|,)status(\.|,|$)/);
    expect(GAME_FIELDS).toContain("game_type.type");
  });

  test("game_types ids used for search filtering still resolve", async () => {
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
```

`describe.runIf` skips the whole block when credentials are absent, so a normal
`pnpm test` stays offline and green.

- [ ] **Step 2: Exclude it from the default run**

In `packages/igdb/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 30_000,
    exclude: ["**/node_modules/**", "**/dist/**", "test/contract.test.ts"],
  },
});
```

Add a script to `packages/igdb/package.json`:

```json
"test:contract": "vitest run test/contract.test.ts --exclude ''"
```

and add `@repo/cache` to its `devDependencies` if it is not already a
dependency (it is, from Task 6).

- [ ] **Step 3: Verify both paths**

```bash
pnpm --filter @repo/igdb test              # contract test excluded, offline
set -a && . ./.env && set +a
pnpm --filter @repo/igdb test:contract     # hits IGDB
```

Expected: the first run is offline and green; the second passes against live
IGDB. **If the second run fails with a 400, that is the test doing its job** —
find the rejected field in IGDB's current docs, fix `GAME_FIELDS` and
`igdbGameSchema`, and update spec §7.

- [ ] **Step 4: Schedule it nightly**

`.github/workflows/igdb-contract.yml`:

```yaml
name: IGDB contract

on:
  schedule:
    - cron: "0 6 * * *"
  workflow_dispatch:

jobs:
  contract:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @repo/igdb build
      - run: pnpm --filter @repo/igdb test:contract
        env:
          IGDB_CLIENT_ID: ${{ secrets.IGDB_CLIENT_ID }}
          IGDB_CLIENT_SECRET: ${{ secrets.IGDB_CLIENT_SECRET }}
```

Add `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET` to the repository secrets.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add packages/igdb .github
git commit -m "test(igdb): add nightly field-deprecation contract test"
```

---

## Done when

```bash
pnpm install
pnpm lint
pnpm check-types
pnpm build
pnpm test
```

all pass, `docker compose up -d` plus `pnpm --filter worker sync --full`
populates the mirror, and `pnpm --filter worker dev` schedules the nightly job.

Plan 2 (the HTTP API) starts from a populated database, which is what makes
tuning the search ranking in spec §9 possible against real data.

---

## Execution deviations

Recorded as they were hit, so a re-run of this plan does not rediscover them.

**Task 1 — pnpm blocks on unapproved build scripts.** `pnpm install` exits
non-zero until `cpu-features`, `ssh2`, and `protobufjs` are explicitly approved
or declined. They arrive via `testcontainers → dockerode → ssh2` and are
optional native accelerations. All three are declined in `pnpm-workspace.yaml`
so installs need no C++ toolchain:

```yaml
allowBuilds:
  esbuild: true
  unrs-resolver: true
  cpu-features: false
  ssh2: false
  protobufjs: false
```

**Task 2 — test files must not run in parallel.** One Postgres container is
shared by the whole suite, so `backlog-constraints`' `beforeEach` truncate wiped
rows `mirror-schema` had just inserted. Fixed two ways: `fileParallelism: false`
in `packages/db/vitest.config.ts`, and every test file that touches tables
truncates in its own `beforeEach` rather than assuming a clean database. Apply
the same `fileParallelism: false` to `apps/worker`'s Vitest config.

**Task 3 — Drizzle wraps driver errors.** `.rejects.toThrow(/duplicate key/)`
fails even when the constraint fires: Drizzle 0.45 raises `Failed query: ...`
and hangs the real Postgres error off `.cause`. Asserting on `.message` alone
would also pass for _any_ failure, which would make these constraint tests
worthless. `packages/db/test/helpers.ts` gains `expectRejectedBy(promise,
pattern)`, which flattens the whole `cause` chain before matching.

**Task 4 — `turbo.json` env declarations are needed earlier than Task 10.**
`drizzle.config.ts` reads `DATABASE_URL`, so `turbo/no-undeclared-env-vars`
fails lint as soon as `packages/db` is linted. The full `turbo.json` update
described in Task 10 Step 4 was applied at Task 4 instead, including the new
`test` task and `dev` gaining `dependsOn: ["^build"]`.

**Task 4 — `WATERMARK_OVERLAP_MS` is exported immediately.** The plan had Task 4
use a private `OVERLAP_MS` and Task 8 rename it. It is exported from
`packages/db/src/queries/sync-runs.ts` from the start instead, avoiding a
pointless rename.

**Interactive `rm`.** The dev shell aliases `rm` to `rm -i`; a bare `rm` in a
scripted step hangs waiting for confirmation. Use `command rm -f`.

**Task 5 — `iovalkey` needs a named import and an eager connection.** Two
separate problems, both invisible to Vitest and only caught by `tsc` and a real
container:

- `import Valkey from "iovalkey"` fails to build under NodeNext — the package is
  CJS and its default export is not constructable from ESM. Use
  `import { Valkey } from "iovalkey"`.
- `lazyConnect: true` combined with `enableOfflineQueue: false` makes the very
  first command race the connection and lose, so the _healthy_ client fails open
  exactly like a dead one. Connect eagerly and let `retryStrategy: () => null`
  handle the unreachable case.

**Task 8 — `test/helpers.ts` survives, holding only `expectRejectedBy`.** The
plan had it deleted entirely, but that helper imports `vitest`, which must not
become a runtime dependency of `@repo/db`. Only `truncateAll` moved to
`src/testing.ts`, alongside the new `startPostgres`.

**Task 8 — the idempotency snapshot must exclude `synced_at`.** It records when
the sync last touched the row, so it legitimately advances on replay and a
byte-identical snapshot is impossible by design. The guarantee is about mirrored
_data_, so the snapshot drops that column and a separate test asserts
`synced_at` does advance.

**Task 9 — a short page terminates the run.** The planned fixture served two
short pages and expected both to be fetched, but fewer than `PAGE_SIZE` rows
means IGDB has nothing more to give, so a second request would be wasted. There
are two termination paths and each now has its own test: a short page, and a
full page followed by an empty one.

**Task 10 — Postgres 18 changed its Docker volume convention.** Mounting
`pgdata:/var/lib/postgresql/data` makes the image refuse to start: 18+ expects a
single mount at `/var/lib/postgresql` and stores data in a major-version
subdirectory so `pg_upgrade --link` works without crossing a mount boundary.
Testcontainers was unaffected because it mounts no volume.

**Task 10 — `drizzle-kit migrate` is not sufficient for local development.** It
does not run `CREATE EXTENSION pg_trgm`, so the trigram index migration fails on
a fresh database. Added `packages/db/src/migrate-cli.ts` and the
`pnpm --filter @repo/db db:migrate` script, which reuses the same
`runMigrations` the test harness calls. Local dev and tests now take an
identical path.

**Task 10 — the root `package.json` had no `test` script.** `turbo.json` gained
the task at Task 4, but `pnpm test` silently did nothing until
`"test": "turbo run test"` was added at the root.

**Task 11 — `--exclude ''` does not override a config's exclude list.** Vitest
appends the CLI value, so the contract file stayed excluded and the run failed
with "No test files found". Use a separate `vitest.contract.config.ts` with an
explicit `include`. Separately, the deprecated-field assertions moved to
`test/games-query.test.ts` so they run offline on every PR — leaving them in the
contract file meant the guard only ran nightly.

---

## Seed results (2026-08-25)

Task 10 Step 6 and Task 11's live run, executed against real IGDB.

|                                |                                                |
| ------------------------------ | ---------------------------------------------- |
| Games                          | 373,590 across 748 pages                       |
| Duration                       | 16 min 20 s (terminated on a short page of 90) |
| Database                       | 418 MB                                         |
| Incremental run straight after | 10 games, 1 page, 6.9 s                        |

**Two plan estimates were wrong.** The seed takes ~16 minutes rather than ~3:
748 requests at 4 req/s is only ~3 minutes of _network_ time, but per-page
database work — 1.67 M screenshot rows, 616 k genre links — dominates. And the
database is 418 MB, roughly 6× smaller than the 2–4 GB guessed.

**Search ranking verified on real data** (spec §9), which is why the plan put
seeding before search work:

- `zeld` → _Breath of the Wild_, _Ocarina of Time_, _A Link to the Past_. This
  is the case that justified `word_similarity` over plain `similarity`, which
  would have scored these near zero against a long title.
- `mario` → _Super Mario 64_, _World_, _Odyssey_. The popularity term doing its
  job — no obscure ROM hacks.
- `dark soules` (misspelled) → _Dark Souls III_, _Dark Souls_, _Dark Souls II_.
- `EXPLAIN ANALYZE` confirms **Bitmap Index Scan on `games_name_trgm_idx`**,
  2.7 ms over 373 k rows — the GIN index is used, not a sequential scan.

**The IGDB contract test passes against live IGDB**, settling spec §7: no
deprecated fields, `game_type` correct, live payloads validate against the zod
schema.

**`.env` could not be sourced.** `SYNC_CRON=0 0 * * *` unquoted makes a shell
execute `0 * * *`. Quoted in `.env.example`.
