# Barklog HTTP API — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the populated games mirror into the authenticated HTTP API of spec
§8–§13 — search, game details, the backlog CRUD core, uniform problem
documents, Clerk auth, rate limiting and the two probes.

**Architecture:** Two new packages (`@repo/contracts`, valibot only and shared
with mobile; `@repo/logging`, one LogTape configuration shared by both
processes), two new query modules inside `@repo/db` (mirror reads, backlog
writes), and `apps/api` grown from a two-route skeleton into the full surface.
Every read that touches the mirror goes through `@repo/db`, so ranking and
constraint behaviour is tested against real Postgres rather than through HTTP.
`apps/api` holds only HTTP concerns: validation, problem documents, caching
directives, auth and rate limits.

**Tech Stack:** TypeScript 6, Node 24, pnpm 11 workspaces, Turborepo, Hono 4.13,
`@hono/node-server` 2, `@hono/clerk-auth` 3.1, `@hono/standard-validator` 0.2.3,
`@standard-schema/spec` 1, valibot 1.4, `hono-problem-details` 0.11, LogTape 2.3
(`@logtape/logtape` + `@logtape/hono`), Drizzle ORM 0.45, node-postgres 8,
iovalkey 0.4, Vitest 4, Testcontainers 12.

**Two libraries do work this plan does not write itself.** `hono-problem-details`
supplies the RFC 9457 model — a throwable `ProblemDetailsError`, a type registry,
an `app.onError` renderer, and a validation hook — and this plan takes its
**vocabulary as well as its machinery**: type slugs and titles come from the
library's status tables, and a validation failure is rendered by its own
`standardSchemaProblemHook`. That amends two details of spec §11, listed under
"Where this plan amends spec §11" at the end. LogTape supplies structured
JSON-lines logging with an implicit per-request context, so `traceId` reaches
every log line without being threaded through a call stack, and the worker gets
the same treatment keyed on `runId`.

**Validation is valibot behind Standard Schema, not zod.** Everything meets at
the [Standard Schema](https://standardschema.dev) interface: valibot implements
it, `@hono/standard-validator` consumes it, and
`hono-problem-details/standard-schema` renders its issues. No library-specific
error class appears in any signature, so the three compose with **no casts and no
peer warnings** — which is not true of the zod path (see "The validation stack"
at the end). Valibot is also a fraction of zod's weight and tree-shakes, and
`@repo/contracts` is imported by the Expo bundle.

**Spec:** `docs/superpowers/specs/2026-08-25-barklog-api-design.md`

**Predecessor:** `docs/superpowers/plans/2026-08-25-barklog-mirror-foundation.md`
— completed. The mirror holds 373,590 games locally; `@repo/db`, `@repo/cache`,
`@repo/igdb` and `apps/worker` all exist and pass their suites.

## Global Constraints

- Node `>=24`, pnpm `11.22.0`. Never run `npm install` — this is a pnpm workspace.
- Every package is ESM (`"type": "module"`). `tsconfig` uses `moduleResolution: NodeNext`
  with `verbatimModuleSyntax`, so **every relative import must carry a `.js`
  extension** even in `.ts` source.
- `noUncheckedIndexedAccess` is on. `rows[0]` is `T | undefined`; use `rows[0]!`
  only after a length check or a `returning()` that cannot be empty, exactly as
  `packages/db/src/queries/sync-runs.ts` already does.
- ESLint enforces `@typescript-eslint/consistent-type-imports`: type-only imports
  must use `import type`.
- ESLint enforces `turbo/no-undeclared-env-vars`: any new env var must also be
  listed in the relevant `turbo.json` task's `env` array. Task 5 adds
  `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` and `LOG_LEVEL`; nothing later
  introduces a new variable.
- Internal packages compile to `dist/` and are consumed via `dist`, never via
  TypeScript source. Each package tsconfig sets `"declaration": true`.
- Tests never touch the docker-compose stack. Test infrastructure comes from
  Testcontainers only, so the suite needs nothing but a Docker socket.
- Container images are pinned exactly: `postgres:18-alpine`, `valkey/valkey:9-alpine`.
- Every Vitest config that shares a container sets `fileParallelism: false`, and
  every test file that writes to the database truncates in its own `beforeEach`.
- The dev shell aliases `rm` to `rm -i`. Use `command rm -f` in scripted steps.
- Prettier formats everything: run `pnpm format` before any commit that touches
  more than one file.
- **`apps/api` must never depend on `@repo/igdb`.** No user request reaches IGDB
  (spec §2). Task 11 adds a test that reads the manifest and fails if it does.
- **Every non-2xx response is `application/problem+json`** (spec §11). The only
  exception is `304`, which carries no body by definition.
- **Problem type slugs and titles are the library's, not ours.** `statusToSlug`
  and `statusToPhrase` from `hono-problem-details` name every type, so 413 is
  `content-too-large`, 422 is `unprocessable-content`, 429 is
  `too-many-requests` and 500 is `internal-server-error` — not the
  `payload-too-large` / `validation-failed` / `rate-limited` / `internal-error`
  of the spec's table. Never hand-write a slug or a title.
- **Two renderers, by decision.** `problemDetailsHandler` on `app.onError` renders
  everything thrown, plus `app.notFound` calling it directly; the library's
  `zodProblemHook` renders a 422 on its own. The 422 is therefore the one
  response with `type: "about:blank"` and no `instance` or `traceId` in the body —
  it still carries `X-Request-Id`, and Task 11 asserts exactly that.
- **A failure is thrown, not returned.** `throw problems.create("NOT_FOUND", …)`
  works from a route, a middleware or anything they call. Hono's `compose` catches
  a thrown error at the frame that threw and renders it through `app.onError`, so
  every outer middleware's post-`next()` work still runs — the security headers
  and the response log line land on a problem document exactly as they do on a 200.
- **No 5xx problem document carries an exception message.** A 500 from an
  unhandled bug carries the library's fixed `"An unexpected error occurred"`,
  which leaks nothing; a 5xx `HTTPException` has its message stripped by
  `mapError`; a 503 is raised with no `detail` at all. The real message goes to
  the log with the same `traceId`.
- **Log levels are LogTape's:** `trace`, `debug`, `info`, `warning`, `error`,
  `fatal`. There is no `warn` level — `LOG_LEVEL=warn` is a boot failure.
- **valibot everywhere by the end.** Tasks 1–12 introduce it in
  `@repo/contracts` and `apps/api`; Task 13 converts the two places that still
  hold zod, `@repo/igdb` and `apps/worker`, and removes zod from the repo. Until
  Task 13 runs, do not touch those two — a validation-library change tangled up
  with a logging change is two problems wearing one commit.
- **`@hono/standard-validator` is pinned to `^0.2.3`**, the range
  `hono-problem-details` declares. 0.4.x installs but makes `pnpm` warn for no
  gain.
- **LogTape's `configure()` must be given a `contextLocalStorage`.** Without one,
  `withContext` and the Hono adapter's request context silently do nothing and
  every `traceId` disappears. `@repo/logging` always passes an
  `AsyncLocalStorage`.
- **Route modules export one unbroken chain** (`new Hono().get(...).put(...)`)
  and are mounted with `app.route()`. Breaking the chain degrades `AppType` to
  `{}` and silently untypes the mobile client (spec §8).
- **No CORS middleware.** The client is a native app with no browser origin.
- `bodyLimit` is 16 KB. Secrets come from the environment only, validated by valibot
  at startup, so the process refuses to boot on a missing variable.

---

## File Structure

### `packages/contracts` — new, valibot only

| File                     | Responsibility                                                     |
| ------------------------ | ------------------------------------------------------------------ |
| `src/coerce.ts`          | `integerFrom(min, max)` — valibot has no `coerce`                  |
| `src/backlog.ts`         | `BACKLOG_STATUSES`, `BACKLOG_SORTS`, list-query and upsert schemas |
| `src/games.ts`           | search / popular query schemas, game-id param schemas              |
| `src/index.ts`           | barrel                                                             |
| `test/contracts.test.ts` | schema behaviour: defaults, bounds, coercion                       |

The package carries `valibot` and nothing else, and its tsconfig sets
`"types": []` so no Node global can leak into a package the mobile bundle
imports.

### `packages/db` — two new query modules

| File                           | Responsibility                                                         |
| ------------------------------ | ---------------------------------------------------------------------- |
| `src/queries/games.ts`         | `searchGames`, `popularGames`, `getGameDetail`, `gameExists`           |
| `src/queries/backlog.ts`       | `ensureUser`, list / stats / get / upsert / delete for backlog entries |
| `src/queries/sync-runs.ts`     | **modified** — gains `getLastRun` for `GET /api/sync/status`           |
| `test/games-queries.test.ts`   | ranking fixtures (`zeld`, `mario`, `dark soules`), detail joins        |
| `test/backlog-queries.test.ts` | upsert create-vs-update, sorts, stats, delete                          |
| `test/status-parity.test.ts`   | the contract status union equals the database enum                     |

Queries live here, not in `apps/api`, for the same reason `persist.ts` lives in
the worker rather than the client: the behaviour that carries risk — trigram
ranking, the composite-key upsert — is then tested against real Postgres with no
HTTP in the way.

### `packages/cache` — three additions

| File                | Responsibility                                                  |
| ------------------- | --------------------------------------------------------------- |
| `src/client.ts`     | **modified** — gains `incrAndExpire` for the rate limiter       |
| `src/with-cache.ts` | `withCache(cache, key, ttl, load)` — read-through, TTL by value |
| `src/testing.ts`    | `startValkey()`, `flushAll(url)` — mirrors `@repo/db/testing`   |

### `packages/logging` — new, one LogTape configuration for both processes

| File                   | Responsibility                                                         |
| ---------------------- | ---------------------------------------------------------------------- |
| `src/index.ts`         | `configureLogging({ service, level })`, `resetLogging()`, `LOG_LEVELS` |
| `test/logging.test.ts` | records are JSON lines; implicit context reaches every record          |

One console sink with `jsonLinesFormatter`, one `AsyncLocalStorage`, and a root
category per process. Both apps then log through `getLogger()` from
`@logtape/logtape` directly — the package configures, it does not wrap.

### `apps/api` — the HTTP surface

| File                           | Responsibility                                                     |
| ------------------------------ | ------------------------------------------------------------------ |
| `src/env.ts`                   | valibot-validated environment, parsed once at boot                 |
| `src/problems.ts`              | the problem-type registry, the `app.onError` renderer, `onInvalid` |
| `src/types.ts`                 | `Db`, `AppEnv`, `AppDeps`, `Authenticator`                         |
| `src/rate-limits.ts`           | the three scopes and their limits, as data                         |
| `src/cache-keys.ts`            | query normalisation, `sha1`, key builders, TTLs                    |
| `src/serialize.ts`             | row → wire mappers (dates become ISO strings before caching)       |
| `src/clerk.ts`                 | the production `Authenticator`, the only file importing Clerk      |
| `src/middleware/finalize.ts`   | post-response fixes: default `no-store`, re-stamp `X-Request-Id`   |
| `src/middleware/auth.ts`       | `requireAuth` with an exact-path allowlist, `ensureUser`           |
| `src/middleware/json.ts`       | `requireJson` — the 415 path                                       |
| `src/middleware/rate-limit.ts` | fixed-window counters in Valkey, fail-open                         |
| `src/routes/probes.ts`         | `/healthz`, `/readyz`                                              |
| `src/routes/games.ts`          | search, details, popular                                           |
| `src/routes/backlog.ts`        | the CRUD core, stats, ETag                                         |
| `src/routes/sync.ts`           | `GET /api/sync/status`                                             |
| `src/app.ts`                   | `createApp(deps)` — the middleware chain, `AppType`                |
| `src/index.ts`                 | Node bootstrap: env → logging → db → cache → app → serve           |
| `test/setup/containers.ts`     | Vitest `globalSetup`: Postgres, Valkey, and logging configuration  |
| `test/helpers.ts`              | `createTestApp`, `callApi` (the problem-document invariant), fakes |

There is no `logger.ts` and no request-logging middleware: `@logtape/hono`'s
`honoLogger` is the request log, and everything else calls `getLogger()` where it
stands.

`src/clerk.ts` is the only file that imports `@hono/clerk-auth`. Everything else
depends on the `Authenticator` function type, which is what lets the whole
authenticated suite run without network access to Clerk (spec §13).

### `apps/worker` — the same logging, keyed on the run

| File             | Responsibility                                                     |
| ---------------- | ------------------------------------------------------------------ |
| `src/env.ts`     | **modified** — `LOG_LEVEL` (Task 12), then zod → valibot (Task 13) |
| `src/sync.ts`    | **modified** — `withContext({ runId })` wraps the whole run        |
| `src/context.ts` | **modified** — no more `console.log` injection                     |
| `src/cli.ts`     | **modified** — configures logging before the run                   |
| `src/index.ts`   | **modified** — configures logging before scheduling                |

### `packages/igdb` — off zod (Task 13)

| File                    | Responsibility                                           |
| ----------------------- | -------------------------------------------------------- |
| `src/schemas.ts`        | **modified** — the IGDB response schema, in valibot      |
| `src/map.ts`            | **modified** — one parse call                            |
| `test/schemas.test.ts`  | **new** — the optional/stripping/path properties, pinned |
| `test/contract.test.ts` | **modified** — the live-payload parse call               |

---

## Task 1: `@repo/contracts` — the shared request schemas

**Files:**

- Create: `packages/contracts/package.json`
- Create: `packages/contracts/tsconfig.json`
- Create: `packages/contracts/eslint.config.js`
- Create: `packages/contracts/vitest.config.ts`
- Create: `packages/contracts/src/backlog.ts`
- Create: `packages/contracts/src/games.ts`
- Create: `packages/contracts/src/index.ts`
- Test: `packages/contracts/test/contracts.test.ts`
- Test: `packages/db/test/status-parity.test.ts`
- Modify: `packages/db/package.json` (dev dependency on `@repo/contracts`)

**Interfaces:**

- Consumes: nothing but `valibot`. This is the leaf of the dependency graph.
- Produces:
  - `BACKLOG_STATUSES: readonly ["waiting","playing","completed","abandoned"]`
  - `type BacklogStatus = "waiting" | "playing" | "completed" | "abandoned"`
  - `BACKLOG_SORTS: readonly ["updated_at","added_at","rating","name"]`
  - `type BacklogSort = (typeof BACKLOG_SORTS)[number]`
  - `integerFrom(min, max)` — the coercion helper every numeric query param uses
  - `backlogStatusSchema`, `backlogListQuerySchema`, `backlogUpsertSchema`
  - `type BacklogListQuery = { status?: BacklogStatus; sort: BacklogSort }`
  - `type BacklogUpsert = { status: BacklogStatus; rating?: number | null }`
  - `searchQuerySchema` → `{ q: string; limit: number; offset: number }`
  - `popularQuerySchema` → `{ limit: number }`
  - `gameIdParamSchema` → `{ id: number }`, `gameIdPathSchema` → `{ gameId: number }`
  - `SEARCH_QUERY_MIN = 2`, `SEARCH_LIMIT_MAX = 50`, `SEARCH_OFFSET_MAX = 200`

Every schema is a plain valibot schema, so it satisfies Standard Schema and
`sValidator` accepts it directly. Parse with `v.parse(schema, input)` /
`v.safeParse(schema, input)` — valibot's API is standalone functions, not methods
on the schema.

- [ ] **Step 1: Write the failing test**

Create `packages/contracts/test/contracts.test.ts`:

```ts
import * as v from "valibot";
import { expect, test } from "vitest";

import {
  backlogListQuerySchema,
  backlogUpsertSchema,
  gameIdParamSchema,
  popularQuerySchema,
  searchQuerySchema,
} from "../src/index.js";

const parse = <T extends v.GenericSchema>(schema: T, input: unknown) =>
  v.parse(schema, input) as v.InferOutput<T>;
const accepts = (schema: v.GenericSchema, input: unknown) => v.safeParse(schema, input).success;

test("search defaults limit and offset so a bare ?q= is valid", () => {
  expect(parse(searchQuerySchema, { q: "zelda" })).toEqual({
    q: "zelda",
    limit: 20,
    offset: 0,
  });
});

test("search coerces the numeric strings a query string actually carries", () => {
  expect(parse(searchQuerySchema, { q: "zelda", limit: "50", offset: "200" })).toEqual({
    q: "zelda",
    limit: 50,
    offset: 200,
  });
});

test("search trims q before the length check, so a padded single letter fails", () => {
  expect(accepts(searchQuerySchema, { q: " a " })).toBe(false);
  expect(parse(searchQuerySchema, { q: "  zelda  " }).q).toBe("zelda");
});

test("search rejects the bounds the spec puts on limit and offset", () => {
  expect(accepts(searchQuerySchema, { q: "zelda", limit: 51 })).toBe(false);
  expect(accepts(searchQuerySchema, { q: "zelda", limit: 0 })).toBe(false);
  expect(accepts(searchQuerySchema, { q: "zelda", offset: 201 })).toBe(false);
  // A non-numeric limit coerces to NaN and is rejected, not silently defaulted.
  expect(accepts(searchQuerySchema, { q: "zelda", limit: "abc" })).toBe(false);
});

test("popular defaults its limit and caps it at 50", () => {
  expect(parse(popularQuerySchema, {})).toEqual({ limit: 20 });
  expect(accepts(popularQuerySchema, { limit: 51 })).toBe(false);
});

test("the backlog list defaults to the most recently updated first", () => {
  expect(parse(backlogListQuerySchema, {})).toEqual({ sort: "updated_at" });
  expect(parse(backlogListQuerySchema, { status: "playing", sort: "name" })).toEqual({
    status: "playing",
    sort: "name",
  });
  expect(accepts(backlogListQuerySchema, { status: "finished" })).toBe(false);
  expect(accepts(backlogListQuerySchema, { sort: "id" })).toBe(false);
});

test("an upsert body is a status and an optional 1-10 rating", () => {
  expect(parse(backlogUpsertSchema, { status: "completed", rating: 9 })).toEqual({
    status: "completed",
    rating: 9,
  });
  expect(parse(backlogUpsertSchema, { status: "waiting" })).toEqual({ status: "waiting" });
  // null is how the client clears a rating it previously set.
  expect(parse(backlogUpsertSchema, { status: "playing", rating: null })).toEqual({
    status: "playing",
    rating: null,
  });
  expect(accepts(backlogUpsertSchema, { status: "playing", rating: 0 })).toBe(false);
  expect(accepts(backlogUpsertSchema, { status: "playing", rating: 11 })).toBe(false);
  expect(accepts(backlogUpsertSchema, { status: "playing", rating: 7.5 })).toBe(false);
});

test("an upsert body rejects an unknown key, and names it", () => {
  const result = v.safeParse(backlogUpsertSchema, { status: "playing", note: "hi" });

  expect(result.success).toBe(false);
  // The field name matters: it is what reaches the client in `errors[]`.
  expect(result.issues?.map((issue) => v.getDotPath(issue))).toEqual(["note"]);
});

test("a path id coerces from its string form and rejects nonsense", () => {
  expect(parse(gameIdParamSchema, { id: "1942" })).toEqual({ id: 1942 });
  expect(accepts(gameIdParamSchema, { id: "abc" })).toBe(false);
  expect(accepts(gameIdParamSchema, { id: "0" })).toBe(false);
  expect(accepts(gameIdParamSchema, { id: "-3" })).toBe(false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @repo/contracts test`
Expected: FAIL — the package does not exist yet, so pnpm reports no such filter.

- [ ] **Step 3: Scaffold the package**

Create `packages/contracts/package.json`:

```json
{
  "name": "@repo/contracts",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "lint": "eslint . --max-warnings 0",
    "check-types": "tsc --noEmit"
  },
  "dependencies": {
    "valibot": "^1.4.2"
  },
  "devDependencies": {
    "@repo/eslint-config": "workspace:*",
    "@repo/typescript-config": "workspace:*",
    "eslint": "^9.39.5",
    "typescript": "~6.0.3",
    "vitest": "^4.1.11"
  }
}
```

Create `packages/contracts/tsconfig.json`. This one does **not** extend
`node.json`: `"types": []` is what guarantees the package the mobile bundle
imports cannot reference a Node global.

```json
{
  "extends": "@repo/typescript-config/base.json",
  "compilerOptions": {
    "lib": ["ES2024"],
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "verbatimModuleSyntax": true,
    "declaration": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "types": []
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

Create `packages/contracts/eslint.config.js` — the base config, not the node one,
for the same reason:

```js
import { config } from "@repo/eslint-config/base";

/** @type {import("eslint").Linter.Config[]} */
export default config;
```

Create `packages/contracts/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Pure schema unit tests: no containers, no global setup.
    include: ["test/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Write the schemas**

Create `packages/contracts/src/coerce.ts`:

```ts
import * as v from "valibot";

/**
 * Valibot has no `coerce`, and query strings and path params arrive as strings.
 * The pipe starts at `unknown` rather than `string` for two reasons: a JSON body
 * legitimately sends a number, and `v.optional(schema, fallback)` types its
 * fallback as the schema's *input*, so an input of `string` would force the
 * defaults to be written as `"20"`.
 *
 * `Number(undefined)` is `NaN`, which fails `v.number()` with "Expected number
 * but received NaN" — so a junk `?limit=abc` is a 422, never a silent default.
 */
export function integerFrom(min: number, max: number) {
  return v.pipe(
    v.unknown(),
    v.transform(Number),
    v.number(),
    v.integer(),
    v.minValue(min),
    v.maxValue(max),
  );
}
```

Create `packages/contracts/src/backlog.ts`:

```ts
import * as v from "valibot";

/**
 * The single source of truth for the status union. `packages/db` declares the
 * same list for its Postgres enum; `test/status-parity.test.ts` over there
 * fails if the two ever drift.
 */
export const BACKLOG_STATUSES = ["waiting", "playing", "completed", "abandoned"] as const;
export type BacklogStatus = (typeof BACKLOG_STATUSES)[number];

export const backlogStatusSchema = v.picklist(BACKLOG_STATUSES);

export const BACKLOG_SORTS = ["updated_at", "added_at", "rating", "name"] as const;
export type BacklogSort = (typeof BACKLOG_SORTS)[number];

export const RATING_MIN = 1;
export const RATING_MAX = 10;

export const backlogListQuerySchema = v.object({
  status: v.optional(backlogStatusSchema),
  sort: v.optional(v.picklist(BACKLOG_SORTS), "updated_at"),
});
export type BacklogListQuery = v.InferOutput<typeof backlogListQuerySchema>;

/**
 * Strict: an entry is exactly two fields, and `PUT` is a full replace, so an
 * unrecognised key is a client bug worth surfacing rather than dropping.
 * `rating: null` is the client clearing a rating it set earlier.
 */
export const backlogUpsertSchema = v.strictObject({
  status: backlogStatusSchema,
  rating: v.optional(
    v.nullable(v.pipe(v.number(), v.integer(), v.minValue(RATING_MIN), v.maxValue(RATING_MAX))),
  ),
});
export type BacklogUpsert = v.InferOutput<typeof backlogUpsertSchema>;
```

Create `packages/contracts/src/games.ts`:

```ts
import * as v from "valibot";

import { integerFrom } from "./coerce.js";

export const SEARCH_QUERY_MIN = 2;
export const SEARCH_QUERY_MAX = 100;
export const SEARCH_LIMIT_MAX = 50;
export const SEARCH_OFFSET_MAX = 200;
export const SEARCH_LIMIT_DEFAULT = 20;

const gameId = integerFrom(1, Number.MAX_SAFE_INTEGER);

export const searchQuerySchema = v.object({
  q: v.pipe(v.string(), v.trim(), v.minLength(SEARCH_QUERY_MIN), v.maxLength(SEARCH_QUERY_MAX)),
  limit: v.optional(integerFrom(1, SEARCH_LIMIT_MAX), SEARCH_LIMIT_DEFAULT),
  offset: v.optional(integerFrom(0, SEARCH_OFFSET_MAX), 0),
});
export type SearchQuery = v.InferOutput<typeof searchQuerySchema>;

export const popularQuerySchema = v.object({
  limit: v.optional(integerFrom(1, SEARCH_LIMIT_MAX), SEARCH_LIMIT_DEFAULT),
});
export type PopularQuery = v.InferOutput<typeof popularQuerySchema>;

/** `GET /api/games/:id` */
export const gameIdParamSchema = v.object({ id: gameId });

/** `PUT`/`DELETE /api/backlog/:gameId` */
export const gameIdPathSchema = v.object({ gameId });
```

`v.trim()` sits inside the pipe before `v.minLength`, so the checks run in order
and `?q=%20a%20` is a 422 rather than a one-character search.

Create `packages/contracts/src/index.ts`:

```ts
export * from "./backlog.js";
export * from "./coerce.js";
export * from "./games.js";
```

- [ ] **Step 5: Install and run the test to verify it passes**

Run: `pnpm install && pnpm --filter @repo/contracts test`
Expected: PASS — 9 tests.

- [ ] **Step 6: Write the parity test that stops the status union drifting**

Add `@repo/contracts` to `packages/db/package.json` `devDependencies`
(alphabetically, before `@repo/eslint-config`):

```json
    "@repo/contracts": "workspace:*",
```

Create `packages/db/test/status-parity.test.ts`:

```ts
import { BACKLOG_STATUSES as CONTRACT_STATUSES } from "@repo/contracts";
import { expect, test } from "vitest";

import { BACKLOG_STATUSES } from "../src/schema/backlog.js";

/**
 * Two declarations of the same union: the Postgres enum and the valibot picklist the
 * mobile app pickers read. A mismatch would be a 422 for a status the database
 * accepts, or an insert that fails a constraint the client never checked.
 */
test("the contract status union matches the database enum, in order", () => {
  expect([...BACKLOG_STATUSES]).toEqual([...CONTRACT_STATUSES]);
});
```

- [ ] **Step 7: Run the database suite to verify the parity test passes**

Run: `pnpm install && pnpm --filter @repo/db test`
Expected: PASS — the existing files plus `status-parity.test.ts`.

- [ ] **Step 8: Verify the whole workspace still builds and lints**

Run: `pnpm format && pnpm lint && pnpm check-types && pnpm build`
Expected: all pass. `@repo/contracts` emits `dist/index.js` and `dist/index.d.ts`.

- [ ] **Step 9: Commit**

```bash
git add packages/contracts packages/db/package.json packages/db/test/status-parity.test.ts pnpm-lock.yaml pnpm-workspace.yaml
git commit -m "feat(contracts): add shared valibot request schemas and the status union"
```

---

## Task 2: `@repo/cache` — read-through caching and an atomic counter

**Files:**

- Modify: `packages/cache/src/client.ts` (add `incrAndExpire` to `Cache`)
- Create: `packages/cache/src/with-cache.ts`
- Create: `packages/cache/src/testing.ts`
- Modify: `packages/cache/src/index.ts`
- Modify: `packages/cache/package.json` (`./testing` export; testcontainers becomes a runtime dep)
- Modify: `packages/cache/test/setup/containers.ts` (use `startValkey`)
- Modify: `packages/cache/test/cache.test.ts` (cover `incrAndExpire`)
- Test: `packages/cache/test/with-cache.test.ts`

**Interfaces:**

- Consumes: the existing `Cache` from the mirror plan (`get`, `set`, `incr`, `ping`, `close`).
- Produces:
  - `Cache.incrAndExpire(key: string, ttlSeconds: number): Promise<number | null>`
  - `Cache.ttlSeconds(key: string): Promise<number | null>`
  - `withCache<T>(cache: Cache, key: string, ttl: number | ((value: T) => number), load: () => Promise<T>): Promise<T>`
  - `VALKEY_IMAGE = "valkey/valkey:9-alpine"`
  - `startValkey(): Promise<{ url: string; stop(): Promise<void> }>`
  - `flushAll(url: string): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Create `packages/cache/test/with-cache.test.ts`:

```ts
import { afterAll, beforeEach, expect, inject, test, vi } from "vitest";

import { createCache } from "../src/client.js";
import { flushAll } from "../src/testing.js";
import { withCache } from "../src/with-cache.js";

const url = inject("valkeyUrl");
const cache = createCache(url);

beforeEach(async () => {
  await flushAll(url);
});

afterAll(async () => {
  await cache.close();
});

test("a miss loads, stores, and a second call does not load again", async () => {
  const load = vi.fn(async () => ({ items: [1, 2, 3] }));

  expect(await withCache(cache, "k1", 60, load)).toEqual({ items: [1, 2, 3] });
  expect(await withCache(cache, "k1", 60, load)).toEqual({ items: [1, 2, 3] });
  expect(load).toHaveBeenCalledTimes(1);
});

test("the TTL can be derived from the loaded value", async () => {
  // Spec §10: an empty search result is cached at the shorter TTL, which is
  // what absorbs the typo storm search-as-you-type generates.
  const ttl = vi.fn((value: number[]) => (value.length === 0 ? 60 : 600));

  await withCache(cache, "empty", ttl, async () => []);
  await withCache(cache, "full", ttl, async () => [1]);

  expect(ttl).toHaveBeenNthCalledWith(1, []);
  expect(ttl).toHaveBeenNthCalledWith(2, [1]);
});

test("a dead cache still returns the loaded value, every time", async () => {
  const dead = createCache("redis://127.0.0.1:1");
  const load = vi.fn(async () => "value");

  expect(await withCache(dead, "k", 60, load)).toBe("value");
  expect(await withCache(dead, "k", 60, load)).toBe("value");
  expect(load).toHaveBeenCalledTimes(2);

  await dead.close();
});
```

Append to `packages/cache/test/cache.test.ts`:

```ts
test("incrAndExpire counts and puts a TTL on the key in one round trip", async () => {
  // The rate limiter needs both, atomically: a counter with no TTL would leak
  // one key per user per window for ever.
  expect(await cache.incrAndExpire("rl:search:user_1:9000", 120)).toBe(1);
  expect(await cache.incrAndExpire("rl:search:user_1:9000", 120)).toBe(2);

  const ttl = await cache.ttlSeconds("rl:search:user_1:9000");
  expect(ttl).toBeGreaterThan(0);
  expect(ttl).toBeLessThanOrEqual(120);
});

test("incrAndExpire fails open, so a Valkey outage cannot reject requests", async () => {
  const dead = createCache("redis://127.0.0.1:1");
  expect(await dead.incrAndExpire("rl:search:user_1:9000", 120)).toBeNull();
  await dead.close();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @repo/cache test`
Expected: FAIL — `Cannot find module '../src/with-cache.js'`, and
`cache.incrAndExpire is not a function`.

- [ ] **Step 3: Extend the client**

In `packages/cache/src/client.ts`, add two methods to the `Cache` interface:

```ts
export interface Cache {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  incr(key: string): Promise<number | null>;
  /**
   * `INCR` plus `EXPIRE` in one transaction. Returns the new count, or `null`
   * when Valkey is unreachable — which the rate limiter reads as "fail open".
   */
  incrAndExpire(key: string, ttlSeconds: number): Promise<number | null>;
  /** Remaining TTL in seconds, or `null` if the key is missing or Valkey is down. */
  ttlSeconds(key: string): Promise<number | null>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}
```

and implement them in the returned object, after `incr`:

```ts
    incrAndExpire: (key, ttlSeconds) =>
      failOpen<number | null>(async () => {
        // The window number is part of the key, so re-arming the TTL on every
        // hit cannot slide the window — it only keeps a dead key from leaking.
        const results = await client.multi().incr(key).expire(key, ttlSeconds).exec();
        const first = results?.[0];
        if (!first) return null;

        const [error, value] = first;
        if (error) throw error;

        return Number(value);
      }, null),

    ttlSeconds: (key) =>
      failOpen<number | null>(async () => {
        const ttl = await client.ttl(key);
        return ttl < 0 ? null : ttl;
      }, null),
```

- [ ] **Step 4: Write the read-through helper**

Create `packages/cache/src/with-cache.ts`:

```ts
import type { Cache } from "./client.js";

/**
 * Read-through caching. `ttl` may be a function of the loaded value, which is
 * how an empty search result gets a shorter TTL than a populated one (spec §10).
 *
 * Because the cache fails open, a Valkey outage degrades this to a direct call
 * to `load` — never to an error.
 */
export async function withCache<T>(
  cache: Cache,
  key: string,
  ttl: number | ((value: T) => number),
  load: () => Promise<T>,
): Promise<T> {
  const hit = await cache.get<T>(key);
  if (hit !== null) return hit;

  const value = await load();
  await cache.set(key, value, typeof ttl === "number" ? ttl : ttl(value));

  return value;
}
```

- [ ] **Step 5: Add the testing entrypoint**

Create `packages/cache/src/testing.ts`:

```ts
import { RedisContainer } from "@testcontainers/redis";
import { Valkey } from "iovalkey";

// The Redis testcontainers module drives Valkey unchanged — Valkey is
// wire-compatible — so we point it at the same image docker-compose uses.
export const VALKEY_IMAGE = "valkey/valkey:9-alpine";

/** Starts a Valkey for a test suite. Never used outside tests. */
export async function startValkey(): Promise<{ url: string; stop(): Promise<void> }> {
  const container = await new RedisContainer(VALKEY_IMAGE).start();

  return {
    url: container.getConnectionUrl(),
    stop: async () => {
      await container.stop();
    },
  };
}

/** Wipes every key. The cache equivalent of `truncateAll`. */
export async function flushAll(url: string): Promise<void> {
  const client = new Valkey(url, { maxRetriesPerRequest: 1, connectTimeout: 1_000 });
  try {
    await client.flushall();
  } finally {
    client.disconnect();
  }
}
```

Update `packages/cache/src/index.ts`:

```ts
export { createCache, type Cache } from "./client.js";
export { withCache } from "./with-cache.js";
```

In `packages/cache/package.json`, add the `./testing` export, and move
`@testcontainers/redis` from `devDependencies` to `dependencies` — `src/testing.ts`
imports it at runtime, exactly as `@repo/db` does with `@testcontainers/postgresql`:

```json
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./testing": {
      "types": "./dist/testing.d.ts",
      "default": "./dist/testing.js"
    }
  },
```

```json
  "dependencies": {
    "@testcontainers/redis": "^12.1.0",
    "iovalkey": "^0.4.0"
  },
```

Replace `packages/cache/test/setup/containers.ts` so the suite and its consumers
start Valkey the same way:

```ts
import type { TestProject } from "vitest/node";

import { startValkey } from "../../src/testing.js";

declare module "vitest" {
  interface ProvidedContext {
    valkeyUrl: string;
  }
}

let stop: (() => Promise<void>) | undefined;

export async function setup(project: TestProject) {
  const valkey = await startValkey();
  stop = valkey.stop;
  project.provide("valkeyUrl", valkey.url);
}

export async function teardown() {
  await stop?.();
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm install && pnpm --filter @repo/cache test`
Expected: PASS — the existing cache tests, the two new `incrAndExpire` tests, and
three `withCache` tests.

Note: `cache.test.ts` does not truncate between tests and `with-cache.test.ts`
flushes in `beforeEach`. `fileParallelism: false` is already set, but the flush
would still wipe keys `cache.test.ts` wrote if the files interleaved — they
cannot. Leave the existing file alone.

- [ ] **Step 7: Verify lint, types and build**

Run: `pnpm format && pnpm lint && pnpm check-types && pnpm build`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add packages/cache pnpm-lock.yaml
git commit -m "feat(cache): add withCache, incrAndExpire, and a testing entrypoint"
```

---

## Task 3: `@repo/db` — mirror reads and the search ranking

This task carries the search-ranking guarantee of spec §9 and §15. The weights
are constants in one file, and the fixture set is chosen so that a _naive_
ranking gets the answer wrong.

**Files:**

- Create: `packages/db/src/queries/games.ts`
- Modify: `packages/db/src/index.ts`
- Test: `packages/db/test/games-queries.test.ts`

**Interfaces:**

- Consumes: `schema` and `createDb` from `@repo/db`; `truncateAll` from `@repo/db/testing`.
- Produces:
  - `SEARCHABLE_GAME_TYPE_IDS: readonly [0, 4, 8, 9, 10]`
  - `WORD_SIMILARITY_THRESHOLD = 0.3`, `SIMILARITY_WEIGHT = 0.6`, `POPULARITY_WEIGHT = 0.4`, `POPULARITY_CEILING = 500`, `POPULAR_RATING_FLOOR = 70`
  - `interface GameSummary { id: number; name: string; slug: string; coverImageId: string | null; firstReleaseDate: Date | null; totalRating: number | null; totalRatingCount: number }`
  - `interface NamedRef { id: number; name: string; slug: string }`
  - `interface PlatformRef extends NamedRef { abbreviation: string | null }`
  - `interface GameDetail extends GameSummary { summary: string | null; gameType: { id: number; name: string } | null; parentGame: { id: number; name: string } | null; screenshots: string[]; genres: NamedRef[]; platforms: PlatformRef[]; developers: NamedRef[]; publishers: NamedRef[] }`
  - `searchGames(db, { query: string; limit: number; offset: number }): Promise<GameSummary[]>`
  - `popularGames(db, { limit: number }): Promise<GameSummary[]>`
  - `getGameDetail(db, gameId: number): Promise<GameDetail | null>`
  - `gameExists(db, gameId: number): Promise<boolean>`

- [ ] **Step 1: Write the failing tests**

Create `packages/db/test/games-queries.test.ts`:

```ts
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, inject, test } from "vitest";

import { createDb } from "../src/client.js";
import { gameExists, getGameDetail, popularGames, searchGames } from "../src/queries/games.js";
import * as schema from "../src/schema/index.js";
import { truncateAll } from "../src/testing.js";

const { db, close } = createDb(inject("databaseUrl"));

const UPDATED = new Date("2026-01-01T00:00:00Z");

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

interface Fixture {
  id: number;
  name: string;
  count: number;
  /** Defaults to 0 = Main Game, which is searchable. */
  typeId?: number;
  rating?: number | null;
}

/**
 * The ranking cases from spec §9 and §15. `Zeldas Adventure` and the ROM hack
 * are the rows a naive ranking puts first: plain `similarity` prefers the short
 * title, and pure `word_similarity` ties the ROM hack with Odyssey.
 */
const RANKING_FIXTURES: Fixture[] = [
  { id: 1, name: "The Legend of Zelda: Breath of the Wild", count: 3000 },
  { id: 2, name: "The Legend of Zelda: Ocarina of Time", count: 2000 },
  { id: 3, name: "Zeldas Adventure", count: 3 },
  { id: 4, name: "Super Mario Odyssey", count: 2500 },
  { id: 5, name: "Mario Teaches Typing ROM Hack", count: 1 },
  { id: 6, name: "Dark Souls III", count: 4000 },
  { id: 7, name: "Dark Souls", count: 3500 },
  // Type 1 is DLC: not searchable, however popular it is.
  { id: 8, name: "Dark Souls: Artorias of the Abyss", count: 9000, typeId: 1 },
  { id: 9, name: "Obscure Unrated Platformer", count: 800, rating: 40 },
];

async function seed(fixtures: Fixture[]): Promise<void> {
  await db
    .insert(schema.gameTypes)
    .values([
      { id: 0, name: "Main Game" },
      { id: 1, name: "DLC" },
    ])
    .onConflictDoNothing();

  await db.insert(schema.games).values(
    fixtures.map((fixture) => ({
      id: fixture.id,
      name: fixture.name,
      slug: slugify(fixture.name),
      gameTypeId: fixture.typeId ?? 0,
      totalRating: fixture.rating === undefined ? 85 : fixture.rating,
      totalRatingCount: fixture.count,
      igdbUpdatedAt: UPDATED,
    })),
  );
}

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await close();
});

test("a four-letter prefix finds the popular Zelda, not the obscure one", async () => {
  await seed(RANKING_FIXTURES);

  const results = await searchGames(db, { query: "zeld", limit: 10, offset: 0 });
  const names = results.map((row) => row.name);

  // word_similarity is what makes a long title match at all; the popularity
  // term is what decides which of the matches comes first.
  expect(names[0]).toBe("The Legend of Zelda: Breath of the Wild");
  expect(names).toContain("Zeldas Adventure");
  expect(names.indexOf("Zeldas Adventure")).toBeGreaterThan(1);
});

test("popularity keeps a ROM hack from beating Odyssey on an exact word match", async () => {
  await seed(RANKING_FIXTURES);

  const names = (await searchGames(db, { query: "mario", limit: 10, offset: 0 })).map(
    (row) => row.name,
  );

  expect(names[0]).toBe("Super Mario Odyssey");
  expect(names).toContain("Mario Teaches Typing ROM Hack");
});

test("a misspelled query still ranks the right series first", async () => {
  await seed(RANKING_FIXTURES);

  const names = (await searchGames(db, { query: "dark soules", limit: 10, offset: 0 })).map(
    (row) => row.name,
  );

  expect(names[0]).toBe("Dark Souls III");
  expect(names[1]).toBe("Dark Souls");
});

test("non-searchable game types are excluded however popular they are", async () => {
  await seed(RANKING_FIXTURES);

  const names = (await searchGames(db, { query: "dark souls", limit: 10, offset: 0 })).map(
    (row) => row.name,
  );

  expect(names).not.toContain("Dark Souls: Artorias of the Abyss");
});

test("pagination neither repeats nor skips a row", async () => {
  // Two identical names with identical popularity: only the id tie-break makes
  // the order total, and without it a page boundary could duplicate a row.
  await seed([
    { id: 20, name: "Same Name Game", count: 100 },
    { id: 21, name: "Same Name Game", count: 100 },
    { id: 22, name: "Same Name Game", count: 100 },
  ]);

  const [first] = await searchGames(db, { query: "same name", limit: 1, offset: 0 });
  const [second] = await searchGames(db, { query: "same name", limit: 1, offset: 1 });
  const [third] = await searchGames(db, { query: "same name", limit: 1, offset: 2 });

  expect([first?.id, second?.id, third?.id]).toEqual([20, 21, 22]);
});

test("a query below the similarity threshold matches nothing", async () => {
  await seed(RANKING_FIXTURES);

  expect(await searchGames(db, { query: "qqqqzzzz", limit: 10, offset: 0 })).toEqual([]);
});

test("popular ranks by rating count behind a rating floor and searchable types", async () => {
  await seed(RANKING_FIXTURES);

  const names = (await popularGames(db, { limit: 10 })).map((row) => row.name);

  expect(names[0]).toBe("Dark Souls III");
  // Below the rating floor, so popularity alone does not earn a place.
  expect(names).not.toContain("Obscure Unrated Platformer");
  // A DLC, so out of scope for the explore feed.
  expect(names).not.toContain("Dark Souls: Artorias of the Abyss");
});

test("game details gather every child collection and split the companies", async () => {
  await seed([{ id: 1942, name: "The Witcher 3: Wild Hunt", count: 4021 }]);

  await db.insert(schema.genres).values({ id: 12, name: "Role-playing (RPG)", slug: "rpg" });
  await db
    .insert(schema.platforms)
    .values({ id: 6, name: "PC (Microsoft Windows)", abbreviation: "PC", slug: "win" });
  await db.insert(schema.companies).values([
    { id: 908, name: "CD Projekt RED", slug: "cd-projekt-red" },
    { id: 42, name: "Bandai Namco", slug: "bandai-namco" },
  ]);
  await db.insert(schema.gameGenres).values({ gameId: 1942, genreId: 12 });
  await db.insert(schema.gamePlatforms).values({ gameId: 1942, platformId: 6 });
  await db.insert(schema.gameCompanies).values([
    { gameId: 1942, companyId: 908, isDeveloper: true, isPublisher: true },
    { gameId: 1942, companyId: 42, isDeveloper: false, isPublisher: true },
  ]);
  await db.insert(schema.gameScreenshots).values([
    { gameId: 1942, imageId: "sc6l7z" },
    { gameId: 1942, imageId: "sc6l80" },
  ]);

  const detail = await getGameDetail(db, 1942);

  expect(detail).not.toBeNull();
  expect(detail?.name).toBe("The Witcher 3: Wild Hunt");
  expect(detail?.gameType).toEqual({ id: 0, name: "Main Game" });
  expect(detail?.genres).toEqual([{ id: 12, name: "Role-playing (RPG)", slug: "rpg" }]);
  expect(detail?.platforms).toEqual([
    { id: 6, name: "PC (Microsoft Windows)", abbreviation: "PC", slug: "win" },
  ]);
  expect(detail?.screenshots).toEqual(["sc6l7z", "sc6l80"]);
  // A company flagged both ways appears in both lists.
  expect(detail?.developers.map((company) => company.id)).toEqual([908]);
  expect(detail?.publishers.map((company) => company.id)).toEqual([42, 908]);
  expect(detail?.parentGame).toBeNull();
});

test("a parent_game_id pointing at a game we have not mirrored resolves to null", async () => {
  // Spec §4: parent_game_id is a soft reference with no foreign key, because a
  // DLC can arrive in a sync page before its parent does.
  await seed([{ id: 30, name: "Some Expansion", count: 10 }]);
  await db.update(schema.games).set({ parentGameId: 999_999 }).where(eq(schema.games.id, 30));

  const detail = await getGameDetail(db, 30);

  expect(detail?.parentGame).toBeNull();
});

test("details for an unmirrored id are null, and gameExists agrees", async () => {
  await seed([{ id: 40, name: "Hades", count: 500 }]);

  expect(await getGameDetail(db, 999_999)).toBeNull();
  expect(await gameExists(db, 40)).toBe(true);
  expect(await gameExists(db, 999_999)).toBe(false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @repo/db test games-queries`
Expected: FAIL — `Cannot find module '../src/queries/games.js'`.

- [ ] **Step 3: Write the query module**

Create `packages/db/src/queries/games.ts`:

```ts
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { alias } from "drizzle-orm/pg-core";

import type * as schema from "../schema/index.js";
import {
  companies,
  gameCompanies,
  gameGenres,
  gamePlatforms,
  games,
  gameScreenshots,
  gameTypes,
  genres,
  platforms,
} from "../schema/mirror.js";

type Db = NodePgDatabase<typeof schema>;

/**
 * Read from the live `/game_types` data, not transcribed from the legacy enum
 * (spec §7): Main Game, Standalone Expansion, Remake, Remaster, Expanded Game.
 * 316,525 of the 373,590 mirrored games.
 */
export const SEARCHABLE_GAME_TYPE_IDS = [0, 4, 8, 9, 10] as const;

/**
 * Ranking constants. Starting points tuned against the real mirror, and the
 * reason they live here: changing how search feels is a one-line change with a
 * fixture test behind it, not a query rewrite.
 */
export const WORD_SIMILARITY_THRESHOLD = 0.3;
export const SIMILARITY_WEIGHT = 0.6;
export const POPULARITY_WEIGHT = 0.4;
export const POPULARITY_CEILING = 500;

/** The explore feed only shows games people have actually rated well. */
export const POPULAR_RATING_FLOOR = 70;

export interface GameSummary {
  id: number;
  name: string;
  slug: string;
  coverImageId: string | null;
  firstReleaseDate: Date | null;
  totalRating: number | null;
  totalRatingCount: number;
}

export interface NamedRef {
  id: number;
  name: string;
  slug: string;
}

export interface PlatformRef extends NamedRef {
  abbreviation: string | null;
}

export interface GameDetail extends GameSummary {
  summary: string | null;
  gameType: { id: number; name: string } | null;
  parentGame: { id: number; name: string } | null;
  screenshots: string[];
  genres: NamedRef[];
  platforms: PlatformRef[];
  developers: NamedRef[];
  publishers: NamedRef[];
}

/** The projection every list endpoint returns. Also used nested, as `game`. */
export const GAME_SUMMARY_COLUMNS = {
  id: games.id,
  name: games.name,
  slug: games.slug,
  coverImageId: games.coverImageId,
  firstReleaseDate: games.firstReleaseDate,
  totalRating: games.totalRating,
  totalRatingCount: games.totalRatingCount,
};

/**
 * `word_similarity` rather than plain `similarity`: plain similarity compares
 * whole strings, so `zeld` against `The Legend of Zelda: Ocarina of Time` scores
 * near zero. `word_similarity` scores the query against the best-matching span
 * of words inside the name. The `<%` operator uses the same gin_trgm_ops index.
 *
 * The threshold is a GUC, so this runs in a transaction: `SET LOCAL` is scoped
 * to it and reverts on commit, which keeps the pooled connection clean.
 */
export async function searchGames(
  db: Db,
  options: { query: string; limit: number; offset: number },
): Promise<GameSummary[]> {
  const { query, limit, offset } = options;

  return db.transaction(async (tx) => {
    await tx.execute(
      sql.raw(`SET LOCAL pg_trgm.word_similarity_threshold = ${WORD_SIMILARITY_THRESHOLD}`),
    );

    return tx
      .select(GAME_SUMMARY_COLUMNS)
      .from(games)
      .where(
        and(
          sql`${query} <% ${games.name}`,
          inArray(games.gameTypeId, [...SEARCHABLE_GAME_TYPE_IDS]),
        ),
      )
      .orderBy(
        desc(
          sql`${SIMILARITY_WEIGHT} * word_similarity(${query}, ${games.name})
            + ${POPULARITY_WEIGHT} * LEAST(${games.totalRatingCount}, ${POPULARITY_CEILING})::real
              / ${POPULARITY_CEILING}`,
        ),
        desc(games.totalRatingCount),
        // A total order, so a page boundary can neither repeat nor skip a row.
        asc(games.id),
      )
      .limit(limit)
      .offset(offset);
  });
}

/**
 * `total_rating_count DESC` behind a `total_rating` floor. v1 uses rating count
 * as a proxy for IGDB's `popularity_primitives` (spec §17); swapping it in
 * touches this function only.
 */
export async function popularGames(db: Db, options: { limit: number }): Promise<GameSummary[]> {
  return db
    .select(GAME_SUMMARY_COLUMNS)
    .from(games)
    .where(
      and(
        gte(games.totalRating, POPULAR_RATING_FLOOR),
        inArray(games.gameTypeId, [...SEARCHABLE_GAME_TYPE_IDS]),
      ),
    )
    .orderBy(desc(games.totalRatingCount), asc(games.id))
    .limit(options.limit);
}

export async function gameExists(db: Db, gameId: number): Promise<boolean> {
  const rows = await db.select({ id: games.id }).from(games).where(eq(games.id, gameId)).limit(1);
  return rows.length > 0;
}

/**
 * Five indexed reads rather than one query with aggregate subselects: each is
 * a primary-key or composite-key lookup, and the assembly stays readable.
 * The caller's backlog entry is deliberately NOT joined here — the mirror half
 * of the schema and the user half meet in the route, not in a query.
 */
export async function getGameDetail(db: Db, gameId: number): Promise<GameDetail | null> {
  const parent = alias(games, "parent");

  const rows = await db
    .select({
      ...GAME_SUMMARY_COLUMNS,
      summary: games.summary,
      gameTypeId: gameTypes.id,
      gameTypeName: gameTypes.name,
      parentGameId: parent.id,
      parentGameName: parent.name,
    })
    .from(games)
    .leftJoin(gameTypes, eq(games.gameTypeId, gameTypes.id))
    .leftJoin(parent, eq(games.parentGameId, parent.id))
    .where(eq(games.id, gameId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const [screenshotRows, genreRows, platformRows, companyRows] = await Promise.all([
    db
      .select({ imageId: gameScreenshots.imageId })
      .from(gameScreenshots)
      .where(eq(gameScreenshots.gameId, gameId))
      .orderBy(asc(gameScreenshots.imageId)),
    db
      .select({ id: genres.id, name: genres.name, slug: genres.slug })
      .from(gameGenres)
      .innerJoin(genres, eq(gameGenres.genreId, genres.id))
      .where(eq(gameGenres.gameId, gameId))
      .orderBy(asc(genres.name)),
    db
      .select({
        id: platforms.id,
        name: platforms.name,
        abbreviation: platforms.abbreviation,
        slug: platforms.slug,
      })
      .from(gamePlatforms)
      .innerJoin(platforms, eq(gamePlatforms.platformId, platforms.id))
      .where(eq(gamePlatforms.gameId, gameId))
      .orderBy(asc(platforms.name)),
    db
      .select({
        id: companies.id,
        name: companies.name,
        slug: companies.slug,
        isDeveloper: gameCompanies.isDeveloper,
        isPublisher: gameCompanies.isPublisher,
      })
      .from(gameCompanies)
      .innerJoin(companies, eq(gameCompanies.companyId, companies.id))
      .where(eq(gameCompanies.gameId, gameId))
      .orderBy(asc(companies.name)),
  ]);

  const toRef = (company: (typeof companyRows)[number]): NamedRef => ({
    id: company.id,
    name: company.name,
    slug: company.slug,
  });

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    summary: row.summary,
    coverImageId: row.coverImageId,
    firstReleaseDate: row.firstReleaseDate,
    totalRating: row.totalRating,
    totalRatingCount: row.totalRatingCount,
    gameType:
      row.gameTypeId === null || row.gameTypeName === null
        ? null
        : { id: row.gameTypeId, name: row.gameTypeName },
    parentGame:
      row.parentGameId === null || row.parentGameName === null
        ? null
        : { id: row.parentGameId, name: row.parentGameName },
    screenshots: screenshotRows.map((screenshot) => screenshot.imageId),
    genres: genreRows,
    platforms: platformRows,
    developers: companyRows.filter((company) => company.isDeveloper).map(toRef),
    publishers: companyRows.filter((company) => company.isPublisher).map(toRef),
  };
}
```

Export it from `packages/db/src/index.ts`, after the `sync-runs` line:

```ts
export * from "./queries/games.js";
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @repo/db test games-queries`
Expected: PASS — 11 tests.

If a ranking assertion fails, the fix is in the four weight constants, not in
the query shape. Print the scores before changing anything:

```sql
SELECT name, total_rating_count,
       word_similarity('zeld', name) AS sim
FROM games WHERE 'zeld' <% name ORDER BY sim DESC;
```

- [ ] **Step 5: Confirm the trigram index is actually used**

Run: `pnpm --filter @repo/db test` then, against the seeded local database:

```bash
docker compose up -d
psql "postgres://barklog:barklog@localhost:5432/barklog" -c "
  BEGIN;
  SET LOCAL pg_trgm.word_similarity_threshold = 0.3;
  EXPLAIN ANALYZE SELECT id, name FROM games WHERE 'zeld' <% name LIMIT 20;
  ROLLBACK;"
```

Expected: a **Bitmap Index Scan on `games_name_trgm_idx`**, not a Seq Scan. The
mirror foundation plan measured 2.7 ms over 373 k rows.

- [ ] **Step 6: Verify lint, types and build**

Run: `pnpm format && pnpm lint && pnpm check-types && pnpm build`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add packages/db
git commit -m "feat(db): add mirror read queries with trigram search ranking"
```

---

## Task 4: `@repo/db` — the backlog write path

**Files:**

- Create: `packages/db/src/queries/backlog.ts`
- Modify: `packages/db/src/index.ts`
- Modify: `packages/db/test/status-parity.test.ts` (add the sort-order parity check)
- Test: `packages/db/test/backlog-queries.test.ts`

**Interfaces:**

- Consumes: `GAME_SUMMARY_COLUMNS`, `GameSummary` from Task 3.
- Produces:
  - `BACKLOG_SORTS: readonly ["updated_at","added_at","rating","name"]`, `type BacklogSort`
  - `BACKLOG_SOFT_CAP = 5000`
  - `ensureUser(db, userId: string): Promise<void>`
  - `interface BacklogEntry { gameId: number; status: BacklogStatusValue; rating: number | null; addedAt: Date; updatedAt: Date }`
  - `interface BacklogListItem extends BacklogEntry { game: GameSummary }`
  - `interface BacklogStats { total: number; counts: Record<BacklogStatusValue, number>; averageRating: number | null }`
  - `getBacklogEntry(db, userId: string, gameId: number): Promise<BacklogEntry | null>`
  - `listBacklog(db, { userId, status?, sort?, limit? }): Promise<BacklogListItem[]>`
  - `getBacklogStats(db, userId: string): Promise<BacklogStats>`
  - `upsertBacklogEntry(db, { userId, gameId, status, rating }): Promise<{ entry: BacklogEntry; created: boolean }>`
  - `deleteBacklogEntry(db, userId: string, gameId: number): Promise<boolean>`

- [ ] **Step 1: Write the failing tests**

Create `packages/db/test/backlog-queries.test.ts`:

```ts
import { afterAll, beforeEach, expect, inject, test } from "vitest";

import { createDb } from "../src/client.js";
import {
  deleteBacklogEntry,
  ensureUser,
  getBacklogEntry,
  getBacklogStats,
  listBacklog,
  upsertBacklogEntry,
} from "../src/queries/backlog.js";
import * as schema from "../src/schema/index.js";
import { truncateAll } from "../src/testing.js";

const { db, close } = createDb(inject("databaseUrl"));

const USER = "user_2abcDEF";
const OTHER = "user_2xyzGHI";

async function seedGames(): Promise<void> {
  await db.insert(schema.gameTypes).values({ id: 0, name: "Main Game" }).onConflictDoNothing();
  await db.insert(schema.games).values([
    {
      id: 1,
      name: "Alpha Protocol",
      slug: "alpha-protocol",
      gameTypeId: 0,
      totalRatingCount: 100,
      igdbUpdatedAt: new Date("2026-01-01T00:00:00Z"),
    },
    {
      id: 2,
      name: "Beta Decay",
      slug: "beta-decay",
      gameTypeId: 0,
      totalRatingCount: 200,
      igdbUpdatedAt: new Date("2026-01-01T00:00:00Z"),
    },
    {
      id: 3,
      name: "Chrono Trigger",
      slug: "chrono-trigger",
      gameTypeId: 0,
      totalRatingCount: 300,
      igdbUpdatedAt: new Date("2026-01-01T00:00:00Z"),
    },
  ]);
}

beforeEach(async () => {
  await truncateAll(db);
  await seedGames();
  await ensureUser(db, USER);
  await ensureUser(db, OTHER);
});

afterAll(async () => {
  await close();
});

test("ensureUser is idempotent, which is what makes it safe in middleware", async () => {
  await ensureUser(db, USER);
  await ensureUser(db, USER);

  const rows = await db.select({ id: schema.users.id }).from(schema.users);
  expect(rows.map((row) => row.id).sort()).toEqual([USER, OTHER].sort());
});

test("the first upsert creates and the second updates the same row", async () => {
  const first = await upsertBacklogEntry(db, {
    userId: USER,
    gameId: 1,
    status: "waiting",
    rating: null,
  });
  expect(first.created).toBe(true);
  expect(first.entry.status).toBe("waiting");

  const second = await upsertBacklogEntry(db, {
    userId: USER,
    gameId: 1,
    status: "completed",
    rating: 9,
  });
  // The composite primary key is the "exactly one status per game" rule: this
  // is an update, not a second row.
  expect(second.created).toBe(false);
  expect(second.entry.status).toBe("completed");
  expect(second.entry.rating).toBe(9);

  const rows = await db
    .select({ gameId: schema.backlogEntries.gameId })
    .from(schema.backlogEntries);
  expect(rows).toHaveLength(1);
});

test("an update advances updated_at but leaves added_at alone", async () => {
  const created = await upsertBacklogEntry(db, {
    userId: USER,
    gameId: 1,
    status: "waiting",
    rating: null,
  });
  const updated = await upsertBacklogEntry(db, {
    userId: USER,
    gameId: 1,
    status: "playing",
    rating: null,
  });

  expect(updated.entry.addedAt.getTime()).toBe(created.entry.addedAt.getTime());
  expect(updated.entry.updatedAt.getTime()).toBeGreaterThanOrEqual(
    created.entry.updatedAt.getTime(),
  );
});

test("a rating can be cleared by writing null", async () => {
  await upsertBacklogEntry(db, { userId: USER, gameId: 1, status: "completed", rating: 8 });
  const cleared = await upsertBacklogEntry(db, {
    userId: USER,
    gameId: 1,
    status: "completed",
    rating: null,
  });

  expect(cleared.entry.rating).toBeNull();
});

test("two users hold independent entries for the same game", async () => {
  await upsertBacklogEntry(db, { userId: USER, gameId: 1, status: "playing", rating: null });
  await upsertBacklogEntry(db, { userId: OTHER, gameId: 1, status: "abandoned", rating: 2 });

  expect((await getBacklogEntry(db, USER, 1))?.status).toBe("playing");
  expect((await getBacklogEntry(db, OTHER, 1))?.status).toBe("abandoned");
  expect(await getBacklogEntry(db, USER, 2)).toBeNull();
});

test("delete reports whether it removed anything", async () => {
  await upsertBacklogEntry(db, { userId: USER, gameId: 1, status: "playing", rating: null });

  expect(await deleteBacklogEntry(db, USER, 1)).toBe(true);
  expect(await deleteBacklogEntry(db, USER, 1)).toBe(false);
  expect(await deleteBacklogEntry(db, USER, 999)).toBe(false);
});

test("the list joins game summaries and filters by status", async () => {
  await upsertBacklogEntry(db, { userId: USER, gameId: 1, status: "playing", rating: null });
  await upsertBacklogEntry(db, { userId: USER, gameId: 2, status: "completed", rating: 7 });
  await upsertBacklogEntry(db, { userId: OTHER, gameId: 3, status: "playing", rating: null });

  const all = await listBacklog(db, { userId: USER });
  expect(all).toHaveLength(2);
  expect(all[0]?.game.name).toBeDefined();

  const playing = await listBacklog(db, { userId: USER, status: "playing" });
  expect(playing.map((item) => item.gameId)).toEqual([1]);
});

test("each sort orders the way the spec says, with rating nulls last", async () => {
  await upsertBacklogEntry(db, { userId: USER, gameId: 3, status: "playing", rating: null });
  await upsertBacklogEntry(db, { userId: USER, gameId: 1, status: "completed", rating: 4 });
  await upsertBacklogEntry(db, { userId: USER, gameId: 2, status: "completed", rating: 10 });

  const byName = await listBacklog(db, { userId: USER, sort: "name" });
  expect(byName.map((item) => item.game.name)).toEqual([
    "Alpha Protocol",
    "Beta Decay",
    "Chrono Trigger",
  ]);

  const byRating = await listBacklog(db, { userId: USER, sort: "rating" });
  expect(byRating.map((item) => item.rating)).toEqual([10, 4, null]);

  const byAdded = await listBacklog(db, { userId: USER, sort: "added_at" });
  expect(byAdded.map((item) => item.gameId)).toEqual([2, 1, 3]);
});

test("the list honours a limit, which is how the soft cap is enforced", async () => {
  await upsertBacklogEntry(db, { userId: USER, gameId: 1, status: "playing", rating: null });
  await upsertBacklogEntry(db, { userId: USER, gameId: 2, status: "playing", rating: null });
  await upsertBacklogEntry(db, { userId: USER, gameId: 3, status: "playing", rating: null });

  expect(await listBacklog(db, { userId: USER, limit: 2 })).toHaveLength(2);
});

test("stats count every status and average only the rated entries", async () => {
  await upsertBacklogEntry(db, { userId: USER, gameId: 1, status: "completed", rating: 8 });
  await upsertBacklogEntry(db, { userId: USER, gameId: 2, status: "completed", rating: 6 });
  await upsertBacklogEntry(db, { userId: USER, gameId: 3, status: "waiting", rating: null });
  await upsertBacklogEntry(db, { userId: OTHER, gameId: 1, status: "playing", rating: 1 });

  expect(await getBacklogStats(db, USER)).toEqual({
    total: 3,
    counts: { waiting: 1, playing: 0, completed: 2, abandoned: 0 },
    averageRating: 7,
  });
});

test("stats for an empty backlog are zeroes and a null average", async () => {
  expect(await getBacklogStats(db, USER)).toEqual({
    total: 0,
    counts: { waiting: 0, playing: 0, completed: 0, abandoned: 0 },
    averageRating: null,
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @repo/db test backlog-queries`
Expected: FAIL — `Cannot find module '../src/queries/backlog.js'`.

- [ ] **Step 3: Write the query module**

Create `packages/db/src/queries/backlog.ts`:

```ts
import { and, asc, avg, count, desc, eq, sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  BACKLOG_STATUSES,
  backlogEntries,
  users,
  type BacklogStatusValue,
} from "../schema/backlog.js";
import type * as schema from "../schema/index.js";
import { games } from "../schema/mirror.js";
import { GAME_SUMMARY_COLUMNS, type GameSummary } from "./games.js";

type Db = NodePgDatabase<typeof schema>;

/**
 * Declared here rather than imported from `@repo/contracts`, so this package
 * stays free of any runtime dependency on it. `test/status-parity.test.ts`
 * fails if the two lists drift.
 */
export const BACKLOG_SORTS = ["updated_at", "added_at", "rating", "name"] as const;
export type BacklogSort = (typeof BACKLOG_SORTS)[number];

/**
 * A personal backlog runs to hundreds of rows, so `GET /api/backlog` returns
 * the whole collection unpaginated (spec §8). This keeps the response bounded
 * anyway.
 */
export const BACKLOG_SOFT_CAP = 5000;

export interface BacklogEntry {
  gameId: number;
  status: BacklogStatusValue;
  rating: number | null;
  addedAt: Date;
  updatedAt: Date;
}

export interface BacklogListItem extends BacklogEntry {
  game: GameSummary;
}

export interface BacklogStats {
  total: number;
  counts: Record<BacklogStatusValue, number>;
  averageRating: number | null;
}

const ENTRY_COLUMNS = {
  gameId: backlogEntries.gameId,
  status: backlogEntries.status,
  rating: backlogEntries.rating,
  addedAt: backlogEntries.addedAt,
  updatedAt: backlogEntries.updatedAt,
};

const ORDER_BY: Record<BacklogSort, SQL> = {
  updated_at: desc(backlogEntries.updatedAt),
  added_at: desc(backlogEntries.addedAt),
  // NULLS LAST: an unrated entry belongs after every rated one, not on top.
  rating: sql`${backlogEntries.rating} DESC NULLS LAST`,
  name: asc(games.name),
};

/**
 * Just-in-time provisioning (spec §4). Chosen over a Clerk webhook because a
 * webhook needs a publicly reachable URL, which would drag a tunnelling tool
 * into local development.
 */
export async function ensureUser(db: Db, userId: string): Promise<void> {
  await db.insert(users).values({ id: userId }).onConflictDoNothing();
}

export async function getBacklogEntry(
  db: Db,
  userId: string,
  gameId: number,
): Promise<BacklogEntry | null> {
  const rows = await db
    .select(ENTRY_COLUMNS)
    .from(backlogEntries)
    .where(and(eq(backlogEntries.userId, userId), eq(backlogEntries.gameId, gameId)))
    .limit(1);

  return rows[0] ?? null;
}

export async function listBacklog(
  db: Db,
  options: { userId: string; status?: BacklogStatusValue; sort?: BacklogSort; limit?: number },
): Promise<BacklogListItem[]> {
  const filters = [eq(backlogEntries.userId, options.userId)];
  if (options.status) filters.push(eq(backlogEntries.status, options.status));

  return db
    .select({ ...ENTRY_COLUMNS, game: GAME_SUMMARY_COLUMNS })
    .from(backlogEntries)
    .innerJoin(games, eq(backlogEntries.gameId, games.id))
    .where(and(...filters))
    .orderBy(ORDER_BY[options.sort ?? "updated_at"], asc(backlogEntries.gameId))
    .limit(options.limit ?? BACKLOG_SOFT_CAP);
}

export async function getBacklogStats(db: Db, userId: string): Promise<BacklogStats> {
  const [byStatus, aggregate] = await Promise.all([
    db
      .select({ status: backlogEntries.status, count: count() })
      .from(backlogEntries)
      .where(eq(backlogEntries.userId, userId))
      .groupBy(backlogEntries.status),
    db
      .select({ average: avg(backlogEntries.rating) })
      .from(backlogEntries)
      .where(eq(backlogEntries.userId, userId)),
  ]);

  const counts = Object.fromEntries(BACKLOG_STATUSES.map((status) => [status, 0])) as Record<
    BacklogStatusValue,
    number
  >;

  let total = 0;
  for (const row of byStatus) {
    counts[row.status] = row.count;
    total += row.count;
  }

  // `avg` over a numeric column comes back as a string, and as null when every
  // rating is null or there are no rows at all.
  const average = aggregate[0]?.average ?? null;

  return {
    total,
    counts,
    averageRating: average === null ? null : Math.round(Number(average) * 100) / 100,
  };
}

/**
 * `PUT` semantics: one statement that creates or replaces, which is what makes
 * an offline retry harmless (spec §8).
 *
 * `xmax = 0` is how Postgres tells an insert apart from an `ON CONFLICT` update
 * in the same `RETURNING` clause: a freshly inserted row has no updating
 * transaction id. That is the whole difference between a 201 and a 200.
 */
export async function upsertBacklogEntry(
  db: Db,
  input: {
    userId: string;
    gameId: number;
    status: BacklogStatusValue;
    rating: number | null;
  },
): Promise<{ entry: BacklogEntry; created: boolean }> {
  const rows = await db
    .insert(backlogEntries)
    .values({
      userId: input.userId,
      gameId: input.gameId,
      status: input.status,
      rating: input.rating,
    })
    .onConflictDoUpdate({
      target: [backlogEntries.userId, backlogEntries.gameId],
      set: { status: input.status, rating: input.rating, updatedAt: new Date() },
    })
    .returning({ ...ENTRY_COLUMNS, created: sql<boolean>`(xmax = 0)` });

  const { created, ...entry } = rows[0]!;

  return { entry, created };
}

export async function deleteBacklogEntry(db: Db, userId: string, gameId: number): Promise<boolean> {
  const removed = await db
    .delete(backlogEntries)
    .where(and(eq(backlogEntries.userId, userId), eq(backlogEntries.gameId, gameId)))
    .returning({ gameId: backlogEntries.gameId });

  return removed.length > 0;
}
```

Export it from `packages/db/src/index.ts`:

```ts
export * from "./queries/backlog.js";
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @repo/db test backlog-queries`
Expected: PASS — 12 tests.

- [ ] **Step 5: Extend the parity test to cover the sort union**

Append to `packages/db/test/status-parity.test.ts`:

```ts
import { BACKLOG_SORTS as CONTRACT_SORTS } from "@repo/contracts";

import { BACKLOG_SORTS } from "../src/queries/backlog.js";

test("the contract sort union matches the query module's, in order", () => {
  expect([...BACKLOG_SORTS]).toEqual([...CONTRACT_SORTS]);
});
```

Merge the new imports into the existing import block at the top of the file
rather than adding a second one — ESLint's import ordering will complain
otherwise.

- [ ] **Step 6: Run the whole database suite**

Run: `pnpm --filter @repo/db test`
Expected: PASS — every file, including the two parity assertions.

- [ ] **Step 7: Verify lint, types and build**

Run: `pnpm format && pnpm lint && pnpm check-types && pnpm build`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add packages/db
git commit -m "feat(db): add the backlog write path with create-vs-update reporting"
```

---

## Task 5: `@repo/logging` and the hardened API skeleton

The end of this task is an app that serves `/healthz`, renders every error as a
problem document from the registry, logs one JSON line per request with a
`traceId`, and carries the full security header set. `GET /api/hello` and
`GET /health` are gone.

`@repo/logging` is folded in here rather than given its own task: it is one
function, and this is the deliverable that needs it. Task 12 has the worker adopt
the same package with no further changes to it.

**Files:**

- Create: `packages/logging/package.json`, `tsconfig.json`, `eslint.config.js`, `vitest.config.ts`
- Create: `packages/logging/src/index.ts`
- Test: `packages/logging/test/logging.test.ts`
- Create: `apps/api/src/env.ts`
- Create: `apps/api/src/problems.ts`
- Create: `apps/api/src/types.ts`
- Create: `apps/api/src/middleware/finalize.ts`
- Modify: `apps/api/src/app.ts` (full rewrite)
- Modify: `apps/api/src/index.ts` (full rewrite)
- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/tsconfig.test.json`
- Create: `apps/api/test/setup/containers.ts`
- Create: `apps/api/test/helpers.ts`
- Test: `apps/api/test/env.test.ts`
- Test: `apps/api/test/app.test.ts`
- Modify: `apps/api/package.json`, `apps/api/.env.example`, `turbo.json`, `.env.example`

**Interfaces:**

- Consumes: `createDb`, `Database` from `@repo/db`; `createCache`, `Cache` from
  `@repo/cache`; `startPostgres`/`truncateAll` from `@repo/db/testing`;
  `startValkey`/`flushAll` from `@repo/cache/testing`; `configure`, `getLogger`,
  `getConsoleSink`, `jsonLinesFormatter`, `reset`, `withContext` from
  `@logtape/logtape`; `honoLogger` from `@logtape/hono`;
  `createProblemTypeRegistry`, `problemDetailsHandler`, `ProblemDetailsError`,
  `statusToPhrase` from `hono-problem-details`.
- Produces:
  - `@repo/logging`: `LOG_LEVELS`, `type LogLevel`, `configureLogging({ service, level }): Promise<void>`, `resetLogging(): Promise<void>`
  - `type Db = Database["db"]`
  - `interface AppVariables { userId: string }`, `interface AppEnv { Variables: AppVariables }`
  - `interface AppDeps { db: Db; cache: Cache; production?: boolean }`
  - `createApp(deps: AppDeps)` and `type AppType = ReturnType<typeof createApp>`
  - `parseEnv(source): ApiEnv` with `PORT`, `DATABASE_URL`, `VALKEY_URL`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `NODE_ENV`, `LOG_LEVEL`
  - `PROBLEM_BASE`, `problems` (the registry: `UNAUTHORIZED`, `NOT_FOUND`,
    `CONTENT_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `TOO_MANY_REQUESTS`,
    `SERVICE_UNAVAILABLE`), `type ProblemKey`, `renderProblem(c, problem)`,
    `apiErrorHandler`, `notFoundHandler`
  - `BODY_LIMIT_BYTES = 16384`, `secureHeaderOptions(production: boolean)`
  - test helpers: `createTestApp(overrides?)`, `callApi(app, path, init?)`, `TEST_USER`, `OTHER_USER`

Note what is **not** here: no `Logger` in `AppDeps`. LogTape is configured once
per process and reached with `getLogger()` wherever a line needs writing, so
there is nothing to inject and nothing to thread through a signature.

- [ ] **Step 1: Add the dependencies and the scripts**

Replace the `dependencies`/`devDependencies`/`scripts` blocks of
`apps/api/package.json`:

```json
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "lint": "eslint . --max-warnings 0",
    "check-types": "tsc --noEmit -p tsconfig.test.json"
  },
  "dependencies": {
    "@hono/clerk-auth": "^3.1.1",
    "@hono/node-server": "^2.1.1",
    "@hono/standard-validator": "^0.2.3",
    "@logtape/hono": "^2.3.2",
    "@logtape/logtape": "^2.3.2",
    "@repo/cache": "workspace:*",
    "@repo/contracts": "workspace:*",
    "@repo/db": "workspace:*",
    "@repo/logging": "workspace:*",
    "@standard-schema/spec": "^1.1.0",
    "drizzle-orm": "^0.45.2",
    "hono": "^4.13.3",
    "hono-problem-details": "^0.11.0",
    "valibot": "^1.4.2"
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
```

There is deliberately no `@repo/igdb` here, and Task 11 adds a test that fails
if one appears (spec §3).

`check-types` runs against `tsconfig.test.json` so the type-level route
assertion of Task 11 is actually checked. Create `apps/api/tsconfig.test.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": true,
    "rootDir": "."
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

Create `apps/api/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./test/setup/containers.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    pool: "forks",
    // One Postgres and one Valkey are shared by the whole suite, so files must
    // not truncate or flush under each other.
    fileParallelism: false,
  },
});
```

- [ ] **Step 2: Declare the new environment variables**

In `turbo.json`, add `"CLERK_SECRET_KEY"`, `"CLERK_PUBLISHABLE_KEY"` and
`"LOG_LEVEL"` to the `env` array of **each** of `build`, `test`, `dev` and
`start`, and add `"PORT"` to `build` and `test` (the other two already have it).
Leaving any of them out fails `pnpm lint` with `turbo/no-undeclared-env-vars`
the moment `src/env.ts` is linted — the mirror plan hit exactly this at its
Task 4.

Replace `apps/api/.env.example`:

```
PORT=3000

# Infrastructure (matches docker-compose.yml)
DATABASE_URL=postgres://barklog:barklog@localhost:5432/barklog
VALKEY_URL=redis://localhost:6379

# Clerk — https://dashboard.clerk.com, API keys
CLERK_SECRET_KEY=
CLERK_PUBLISHABLE_KEY=

# LogTape levels: trace | debug | info | warning | error | fatal
LOG_LEVEL=info
```

Append the same Clerk block and `LOG_LEVEL` to the root `.env.example`, under a
`# API` heading, so a single root `.env` still runs everything.

`warning`, not `warn`: these are LogTape's level names, and `parseEnv` rejects
anything else rather than quietly falling back.

`@hono/standard-validator` is pinned at `^0.2.3` because that is the range
`hono-problem-details` declares. The result is a graph with **no peer warnings at
all** — verified with `npm`, which is stricter than `pnpm` and refuses a bad peer
outright. Do not bump it to 0.4.x without a reason; the newer major buys nothing
here and reintroduces a warning.

- [ ] **Step 3: Write the failing tests**

Create `apps/api/test/env.test.ts`:

```ts
import { expect, test } from "vitest";

import { parseEnv } from "../src/env.js";

const VALID = {
  DATABASE_URL: "postgres://barklog:barklog@localhost:5432/barklog",
  VALKEY_URL: "redis://localhost:6379",
  CLERK_SECRET_KEY: "sk_test_x",
  CLERK_PUBLISHABLE_KEY: "pk_test_x",
};

test("defaults fill in everything that is optional", () => {
  expect(parseEnv(VALID)).toEqual({
    ...VALID,
    PORT: 3000,
    NODE_ENV: "development",
    LOG_LEVEL: "info",
  });
});

test("PORT arrives as a string and comes out a number", () => {
  expect(parseEnv({ ...VALID, PORT: "8080" }).PORT).toBe(8080);
});

test("a missing secret stops the process at boot, not at the first request", () => {
  expect(() => parseEnv({ ...VALID, CLERK_SECRET_KEY: undefined })).toThrow(/CLERK_SECRET_KEY/);
});

test("the log levels are LogTape's, so `warn` is a boot failure", () => {
  expect(parseEnv({ ...VALID, LOG_LEVEL: "warning" }).LOG_LEVEL).toBe("warning");
  expect(() => parseEnv({ ...VALID, LOG_LEVEL: "warn" })).toThrow(/LOG_LEVEL/);
  expect(() => parseEnv({ ...VALID, LOG_LEVEL: "verbose" })).toThrow(/LOG_LEVEL/);
});
```

Create `apps/api/test/app.test.ts`:

```ts
import { HTTPException } from "hono/http-exception";
import { afterAll, beforeEach, expect, test } from "vitest";

import { BODY_LIMIT_BYTES } from "../src/app.js";
import { callApi, createTestApp, logs } from "./helpers.js";

const harness = createTestApp();

beforeEach(async () => {
  await harness.reset();
});

afterAll(async () => {
  await harness.close();
});

test("healthz is 200 with no dependency checks at all", async () => {
  const response = await callApi(harness.app, "/healthz");

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
  expect(response.headers.get("cache-control")).toBe("no-store");
});

test("an unknown route is a problem document, not Hono's default text", async () => {
  const response = await callApi(harness.app, "/nope");

  expect(response.status).toBe(404);
  expect(response.headers.get("content-type")).toContain("application/problem+json");
  // The title is the library's reason phrase, verbatim — see Step 7.
  expect(await response.json()).toMatchObject({
    type: "https://barklog.gg/problems/not-found",
    title: "Not Found",
    status: 404,
    instance: "/nope",
  });
});

test("every problem document carries the traceId echoed in X-Request-Id", async () => {
  const response = await callApi(harness.app, "/nope");
  const body = (await response.json()) as { traceId: string };

  expect(body.traceId).toBeTruthy();
  expect(response.headers.get("x-request-id")).toBe(body.traceId);
});

test("a caller-supplied request id is honoured, so client and server logs join up", async () => {
  const response = await callApi(harness.app, "/healthz", {
    headers: { "X-Request-Id": "abc-123" },
  });

  expect(response.headers.get("x-request-id")).toBe("abc-123");
});

test("the full security header set is present on a 200", async () => {
  const response = await callApi(harness.app, "/healthz");

  expect(response.headers.get("strict-transport-security")).toBe(
    "max-age=63072000; includeSubDomains; preload",
  );
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("content-security-policy")).toBe(
    "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  );
  expect(response.headers.get("x-frame-options")).toBe("DENY");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
  expect(response.headers.get("cross-origin-opener-policy")).toBe("same-origin");
  expect(response.headers.get("x-permitted-cross-domain-policies")).toBe("none");
  expect(response.headers.get("x-powered-by")).toBeNull();
  expect(response.headers.get("server")).toBeNull();
});

test("the same header set is present on a problem document", async () => {
  const response = await callApi(harness.app, "/nope");

  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
  expect(response.headers.get("strict-transport-security")).toContain("max-age=63072000");
});

test("HSTS is omitted outside production, where it would be meaningless", async () => {
  const dev = createTestApp({ production: false });
  const response = await callApi(dev.app, "/healthz");

  expect(response.headers.get("strict-transport-security")).toBeNull();
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");

  await dev.close();
});

test("a body over the limit is 413, before any handler sees it", async () => {
  const response = await callApi(harness.app, "/nope", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ padding: "x".repeat(BODY_LIMIT_BYTES) }),
  });

  expect(response.status).toBe(413);
  expect(await response.json()).toMatchObject({
    type: "https://barklog.gg/problems/content-too-large",
    title: "Content Too Large",
    status: 413,
  });
});

test("an unhandled exception is a 500 that says nothing about the exception", async () => {
  const boom = createTestApp();
  boom.app.get("/boom", () => {
    throw new Error("connection string postgres://user:secret@host/db failed");
  });

  const response = await callApi(boom.app, "/boom");
  const body = (await response.json()) as Record<string, unknown>;

  expect(response.status).toBe(500);
  expect(body).toMatchObject({
    type: "https://barklog.gg/problems/internal-server-error",
    title: "Internal Server Error",
    status: 500,
    instance: "/boom",
    // The library's fixed string, not the exception's message. It carries no
    // information, which is the point (spec §11).
    detail: "An unexpected error occurred",
  });
  expect(JSON.stringify(body)).not.toContain("secret");
  expect(JSON.stringify(body)).not.toContain("postgres://");
  expect(body.stack).toBeUndefined();
  expect(body.traceId).toBeTruthy();
  // The response is a fresh Response built by the renderer, so this only holds
  // because `finalize` re-stamps the header.
  expect(response.headers.get("x-request-id")).toBe(body.traceId);

  await boom.close();
});

test("a 5xx HTTPException loses its message on the way out", async () => {
  const boom = createTestApp();
  boom.app.get("/upstream", () => {
    // Library default would put this message straight into `detail`.
    throw new HTTPException(503, { message: "pool exhausted at db-primary-3" });
  });

  const body = (await (await callApi(boom.app, "/upstream")).json()) as Record<string, unknown>;

  expect(body).toMatchObject({
    type: "https://barklog.gg/problems/service-unavailable",
    status: 503,
  });
  expect(body.detail).toBeUndefined();
  expect(JSON.stringify(body)).not.toContain("db-primary-3");

  await boom.close();
});

test("a 4xx HTTPException keeps its message, because it is useful", async () => {
  const boom = createTestApp();
  boom.app.get("/teapot", () => {
    throw new HTTPException(400, { message: "Malformed JSON in request body" });
  });

  expect(await (await callApi(boom.app, "/teapot")).json()).toMatchObject({
    type: "https://barklog.gg/problems/bad-request",
    status: 400,
    detail: "Malformed JSON in request body",
  });

  await boom.close();
});

test("one request log line per request, carrying the same traceId", async () => {
  const response = await callApi(harness.app, "/nope");

  const requestLines = logs.records.filter((record) => record.category.includes("http"));
  expect(requestLines).toHaveLength(1);
  expect(requestLines[0]?.properties).toMatchObject({
    method: "GET",
    path: "/nope",
    status: 404,
    traceId: response.headers.get("x-request-id"),
  });
});

test("the probes are not request-logged", async () => {
  await callApi(harness.app, "/healthz");

  expect(logs.records.filter((record) => record.category.includes("http"))).toEqual([]);
});

test("the log line for a bug carries the traceId the client was given", async () => {
  const boom = createTestApp();
  boom.app.get("/boom", () => {
    throw new Error("something broke");
  });

  const response = await callApi(boom.app, "/boom");
  const errorLine = logs.records.find((record) => record.category.includes("error"));

  // This pairing is the only thing that makes a detail-less 500 debuggable.
  expect(errorLine?.properties).toMatchObject({
    message: "something broke",
    traceId: response.headers.get("x-request-id"),
  });
  expect(errorLine?.properties.stack).toBeTruthy();

  await boom.close();
});
```

The CSP assertion pins the order Hono emits directives in, which is the order
the options object declares them. If it differs, read the actual header once and
fix the expectation — do not loosen it to `toContain` for the whole value.

- [ ] **Step 4: Run the tests to verify they fail**

Run: `pnpm --filter @repo/logging test; pnpm --filter api test`
Expected: FAIL on both — no such filter for `@repo/logging`, and
`Cannot find module '../src/env.js'` for the API.

- [ ] **Step 5: Create `@repo/logging`**

Create `packages/logging/package.json`:

```json
{
  "name": "@repo/logging",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./testing": {
      "types": "./dist/testing.d.ts",
      "default": "./dist/testing.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "lint": "eslint . --max-warnings 0",
    "check-types": "tsc --noEmit"
  },
  "dependencies": {
    "@logtape/logtape": "^2.3.2"
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

Create `packages/logging/tsconfig.json` and `eslint.config.js` exactly as
`packages/cache` has them (extend `@repo/typescript-config/node.json` with
`outDir: "./dist"`, `rootDir: "./src"`, `declaration: true`; re-export
`nodeConfig`), and `packages/logging/vitest.config.ts` with no global setup:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
```

Create `packages/logging/src/index.ts`:

```ts
import { AsyncLocalStorage } from "node:async_hooks";

import {
  configure,
  getConsoleSink,
  jsonLinesFormatter,
  reset,
  type LogLevel,
  type Sink,
} from "@logtape/logtape";

export const LOG_LEVELS = [
  "trace",
  "debug",
  "info",
  "warning",
  "error",
  "fatal",
] as const satisfies readonly LogLevel[];

export type { LogLevel };

export interface LoggingOptions {
  /** Root category. Every logger in the process hangs off it: `["api", …]`. */
  service: string;
  level: LogLevel;
  /** Tests pass a recording sink; a process always wants the console. */
  sink?: Sink;
}

/**
 * One configuration for both processes: JSON lines on stdout, one object per
 * record, and an implicit context so a `traceId` or a `runId` reaches every
 * line written while it is in scope.
 *
 * `contextLocalStorage` is the load-bearing option. Without it `withContext`
 * and the Hono adapter's request context degrade to no-ops that only warn on
 * the meta logger — which is why the meta logger is wired to the same sink.
 */
export async function configureLogging(options: LoggingOptions): Promise<void> {
  await configure({
    reset: true,
    contextLocalStorage: new AsyncLocalStorage(),
    sinks: { out: options.sink ?? getConsoleSink({ formatter: jsonLinesFormatter }) },
    loggers: [
      { category: [options.service], sinks: ["out"], lowestLevel: options.level },
      { category: ["logtape", "meta"], sinks: ["out"], lowestLevel: "warning" },
    ],
  });
}

export async function resetLogging(): Promise<void> {
  await reset();
}
```

Create `packages/logging/src/testing.ts`:

```ts
import type { LogRecord, Sink } from "@logtape/logtape";

export interface RecordingSink {
  sink: Sink;
  records: LogRecord[];
  clear(): void;
}

/** A sink that keeps records in memory so a test can assert on them. */
export function recordingSink(): RecordingSink {
  const records: LogRecord[] = [];

  return {
    sink: (record) => {
      records.push(record);
    },
    records,
    clear: () => {
      records.length = 0;
    },
  };
}
```

Create `packages/logging/test/logging.test.ts`:

```ts
import { getLogger, withContext } from "@logtape/logtape";
import { afterEach, beforeEach, expect, test } from "vitest";

import { configureLogging, resetLogging } from "../src/index.js";
import { recordingSink, type RecordingSink } from "../src/testing.js";

let logs: RecordingSink;

beforeEach(async () => {
  logs = recordingSink();
  await configureLogging({ service: "test", level: "debug", sink: logs.sink });
});

afterEach(async () => {
  await resetLogging();
});

test("records carry their category, level and properties", () => {
  getLogger(["test", "unit"]).info("Seeded {count} games.", { count: 10 });

  const record = logs.records[0];
  expect(record?.category).toEqual(["test", "unit"]);
  expect(record?.level).toBe("info");
  expect(record?.properties).toMatchObject({ count: 10 });
});

test("a level below the threshold is dropped", async () => {
  await configureLogging({ service: "test", level: "warning", sink: logs.sink });

  getLogger(["test"]).info("Ignored.");
  getLogger(["test"]).error("Kept.");

  expect(logs.records.map((record) => record.level)).toEqual(["error"]);
});

test("an implicit context reaches every record inside it", () => {
  // This is the whole reason for contextLocalStorage: the traceId in the API and
  // the runId in the worker are set once and never passed as an argument again.
  withContext({ runId: "run-1" }, () => {
    getLogger(["test"]).info("Started.");
    getLogger(["test", "deep"]).warn("Something odd.");
  });
  getLogger(["test"]).info("Outside.");

  expect(logs.records.map((record) => record.properties.runId)).toEqual([
    "run-1",
    "run-1",
    undefined,
  ]);
});

test("records outside the configured service are not sunk", () => {
  getLogger(["somebody-else"]).error("Not ours.");

  expect(logs.records).toEqual([]);
});
```

- [ ] **Step 6: Write the environment schema**

Create `apps/api/src/env.ts`:

```ts
import { integerFrom } from "@repo/contracts";
import { LOG_LEVELS } from "@repo/logging";
import * as v from "valibot";

const required = v.pipe(v.string(), v.minLength(1));

const envSchema = v.object({
  PORT: v.optional(integerFrom(1, 65_535), 3000),
  DATABASE_URL: required,
  VALKEY_URL: required,
  CLERK_SECRET_KEY: required,
  CLERK_PUBLISHABLE_KEY: required,
  NODE_ENV: v.optional(v.picklist(["development", "test", "production"]), "development"),
  LOG_LEVEL: v.optional(v.picklist(LOG_LEVELS), "info"),
});

export type ApiEnv = v.InferOutput<typeof envSchema>;

/**
 * Parsed once at boot, so a missing secret refuses the process rather than
 * surfacing as a 500 on the first request that needs it.
 *
 * `v.getDotPath` is what puts the variable's name in the message — without it a
 * missing `CLERK_SECRET_KEY` reads as an anonymous "Invalid key".
 */
export function parseEnv(source: Record<string, string | undefined>): ApiEnv {
  const result = v.safeParse(envSchema, source);

  if (!result.success) {
    const detail = result.issues
      .map((issue) => `${v.getDotPath(issue) ?? "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid API environment — ${detail}`);
  }

  return result.output;
}
```

`integerFrom` is reused from `@repo/contracts` rather than redeclared: it is the
same "a string arrives, a bounded integer comes out" problem as a query
parameter.

- [ ] **Step 7: Write the problem registry and the one renderer**

Create `apps/api/src/problems.ts`. This is the whole error surface of the
service: the six types we raise, one guard on 5xx detail, and one renderer
everything goes through. Every slug and title is the library's.

```ts
import { getLogger } from "@logtape/logtape";
import type { Context, ErrorHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  createProblemTypeRegistry,
  problemDetailsHandler,
  ProblemDetailsError,
  statusToPhrase,
  statusToSlug,
  type ProblemDetailsInput,
} from "hono-problem-details";
import { standardSchemaProblemHook } from "hono-problem-details/standard-schema";

/** Stable identifiers. They are not required to resolve. */
export const PROBLEM_BASE = "https://barklog.gg/problems";

/**
 * Slug and title both come from the library's status tables, so there is no
 * second naming scheme to keep in step and no hand-written string to get wrong.
 * The throw is a load-time assertion: every status below is in those tables, and
 * a typo should stop the process rather than ship an `about:blank` type.
 */
function definition(status: number) {
  const slug = statusToSlug(status);
  const title = statusToPhrase(status);

  if (!slug || !title) throw new Error(`No problem definition for HTTP ${status}`);

  return { type: `${PROBLEM_BASE}/${slug}`, status, title };
}

/**
 * The problem types **we** raise. Three more reach the wire without a key here,
 * deliberately:
 *
 * - `400 bad-request` and `500 internal-server-error`, from the library's own
 *   handling of an `HTTPException` and of an unhandled bug;
 * - `422 unprocessable-content`, from `zodProblemHook` (Task 9).
 *
 * The first two still land under `PROBLEM_BASE`, because `typePrefix` derives
 * their URI from the same `statusToSlug` this file uses. The 422 does not — see
 * the note at the end of this step.
 */
export const problems = createProblemTypeRegistry({
  UNAUTHORIZED: definition(401),
  NOT_FOUND: definition(404),
  CONTENT_TOO_LARGE: definition(413),
  UNSUPPORTED_MEDIA_TYPE: definition(415),
  TOO_MANY_REQUESTS: definition(429),
  SERVICE_UNAVAILABLE: definition(503),
});

export type ProblemKey = Parameters<typeof problems.create>[0];

/**
 * The library puts an `HTTPException`'s message into `detail`. On a 4xx that is
 * exactly right — "Malformed JSON in request body" is what the client needs. On
 * a 5xx it is a leak: exception messages carry schema names, file paths and
 * connection strings. Returning the bare status drops the message and lets the
 * library derive the type and title as usual.
 *
 * Everything else returns `undefined`, which is how the library's own branches
 * stay in charge.
 */
function mapError(error: Error): ProblemDetailsInput | undefined {
  if (error instanceof HTTPException && error.status >= 500) {
    return { status: error.status };
  }

  return undefined;
}

const render = problemDetailsHandler({
  // Where a library-raised problem gets its type URI.
  typePrefix: PROBLEM_BASE,
  autoInstance: true,
  mapError,
  // The library can read a trace id from OpenTelemetry, which we do not run.
  // This is the hook that puts our request id on every document instead.
  localize: (pd, c) => ({
    extensions: { ...pd.extensions, traceId: c.get("requestId") },
  }),
});

/**
 * For the one caller that needs to add response headers to a problem — the rate
 * limiter and its `Retry-After`. Everything else throws and lets `app.onError`
 * do this.
 */
export async function renderProblem(c: Context, problem: ProblemDetailsError): Promise<Response> {
  return render(problem, c);
}

/**
 * `app.onError`. It sees three kinds of thing: a `ProblemDetailsError` thrown
 * deliberately, an `HTTPException` from Hono, and a genuine bug. Only the last
 * two are worth a log line — a thrown problem is a documented outcome, and it is
 * already in the request log with its status.
 */
export const apiErrorHandler: ErrorHandler = (error, c) => {
  if (!(error instanceof ProblemDetailsError)) {
    getLogger(["api", "error"]).error("Unhandled error: {message}", {
      status: error instanceof HTTPException ? error.status : 500,
      message: error.message,
      stack: error.stack,
    });
  }

  return render(error, c);
};

/** `app.notFound`. Same renderer, so an unmatched route is not a special case. */
export const notFoundHandler: NotFoundHandler = (c) =>
  renderProblem(
    c,
    problems.create("NOT_FOUND", {
      detail: `No route matches ${c.req.method} ${c.req.path}.`,
    }),
  );

/**
 * The validation failure hook, passed to every `sValidator` call. The library's
 * own, used as-is and with no options, so the 422's `errors[]`, title and detail
 * are all its defaults.
 *
 * It needs no wrapper and no cast. Everything in the chain speaks Standard
 * Schema — `sValidator`'s hook hands over `readonly StandardSchemaV1.Issue[]`,
 * which is exactly what this consumes — so there is no library-specific error
 * class to reconcile.
 */
export const onInvalid = standardSchemaProblemHook();
```

**The 422 does not come through `render`.** `onInvalid` builds its response
directly, which has two consequences, both accepted rather than worked around:

- `errors[]` entries are `{field, message}` with a dot-joined path (`"rating"`,
  `"note"`, `"user.name"`), not the `{pointer, detail}` JSON Pointer form of spec
  §11's example.
- `type` is `"about:blank"` — RFC 9457's legitimate default, but it makes the 422
  the one response in the API without a `barklog.gg` type URI, and it has no
  `instance` or `traceId` in the body.

What survives is traceability: the hook _returns_ its response from a middleware
rather than throwing, so `finalize` and `secureHeaders` still run over it and the
`X-Request-Id` header is still there to join the log line to. Task 11 asserts
that specifically, because it is the only thing standing between a 422 and being
undebuggable.

Should the pointer form ever be wanted back, the change is local: wrap the hook,
read its body, and re-emit through `renderProblem`. Do not reach for that without
a reason — the point of adopting the hook is to stop maintaining a parallel
vocabulary.

- [ ] **Step 8: Write the shared types and the finalize middleware**

Create `apps/api/src/types.ts`:

```ts
import type { Cache } from "@repo/cache";
import type { Database } from "@repo/db";

export type Db = Database["db"];

/** The two public routes, allowlisted by exact path — never by prefix. */
export const PROBE_PATHS: ReadonlySet<string> = new Set(["/healthz", "/readyz"]);

export interface AppVariables {
  /** The Clerk `sub`, set by `requireAuth`. Absent only on the public probes. */
  userId: string;
}

export interface AppEnv {
  Variables: AppVariables;
}

/**
 * Everything the app needs, passed in rather than imported, so a test can
 * substitute a dead cache or a fake authenticator without touching a module
 * registry. Logging is absent on purpose: LogTape is configured once per process
 * and reached with `getLogger()`, so there is nothing to inject.
 */
export interface AppDeps {
  db: Db;
  cache: Cache;
  /** Gates HSTS. Defaults to false. */
  production?: boolean;
}
```

Create `apps/api/src/middleware/finalize.ts`:

```ts
import type { MiddlewareHandler } from "hono";

import type { AppEnv } from "../types.js";

/** The whole API is authenticated, so anything unstated must not be stored. */
export const DEFAULT_CACHE_CONTROL = "no-store";

const REQUEST_ID_HEADER = "X-Request-Id";

/**
 * Two fixes applied to the finished response, whoever built it.
 *
 * `Cache-Control` is a default rather than a per-route obligation: forgetting
 * `no-store` on a new authenticated route is a real mistake, while forgetting to
 * override the default on a cacheable one is only a missed optimisation.
 *
 * `X-Request-Id` is re-stamped because `requestId()` sets it as a *prepared*
 * header. Prepared headers survive `c.json()`, but a problem document is a fresh
 * `Response` built by the problem renderer, and they do not survive that — so
 * without this the one response class where the id matters most would be the one
 * class missing it. The body still carries `traceId`; this keeps the header
 * matching it.
 */
export function finalize(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    await next();

    if (!c.res.headers.has("Cache-Control")) {
      c.res.headers.set("Cache-Control", DEFAULT_CACHE_CONTROL);
    }

    const requestId = c.get("requestId");
    if (requestId && !c.res.headers.has(REQUEST_ID_HEADER)) {
      c.res.headers.set(REQUEST_ID_HEADER, requestId);
    }
  };
}
```

- [ ] **Step 9: Rewrite the app**

Replace `apps/api/src/app.ts`:

```ts
import { honoLogger } from "@logtape/hono";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";

import { finalize } from "./middleware/finalize.js";
import { apiErrorHandler, notFoundHandler, problems, renderProblem } from "./problems.js";
import { PROBE_PATHS, type AppDeps, type AppEnv } from "./types.js";

/** The largest legitimate body in the whole API is `{status, rating}`. */
export const BODY_LIMIT_BYTES = 16 * 1024;

/**
 * `SecureHeadersOptions` is not exported from `hono/secure-headers`, so the
 * option type is recovered from the function signature.
 */
export function secureHeaderOptions(production: boolean): Parameters<typeof secureHeaders>[0] {
  return {
    // Meaningless over plain HTTP, and on localhost it would pin a developer's
    // browser to https for two years.
    strictTransportSecurity: production ? "max-age=63072000; includeSubDomains; preload" : false,
    // Stops `application/problem+json` being sniffed as something executable.
    xContentTypeOptions: "nosniff",
    // The API returns zero HTML, so the correct policy is "nothing at all".
    contentSecurityPolicy: {
      defaultSrc: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'none'"],
      frameAncestors: ["'none'"],
    },
    xFrameOptions: "DENY",
    referrerPolicy: "no-referrer",
    crossOriginResourcePolicy: "same-origin",
    crossOriginOpenerPolicy: "same-origin",
    xPermittedCrossDomainPolicies: "none",
    removePoweredBy: true,
  };
}

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>()
    // First, so it also covers error responses and the probes.
    .use("*", secureHeaders(secureHeaderOptions(deps.production ?? false)))
    .use("*", finalize())
    // Before the logger, so every line for a request carries the same id.
    .use("*", requestId())
    .use(
      "*",
      honoLogger({
        category: ["api", "http"],
        // A liveness probe every few seconds would drown the log in noise, and
        // its outcome is already visible to whoever is probing it.
        skip: (c) => PROBE_PATHS.has(c.req.path),
        context: {
          // `requestId()` above already generated or accepted the id and owns
          // the response header; this only copies it into LogTape's implicit
          // context, so every record written while handling the request — the
          // request log line, a query warning, a 500 — carries the same traceId
          // without anyone passing it down.
          requestId: false,
          enrich: (c) => ({ traceId: c.get("requestId") }),
        },
      }),
    )
    .use(
      "*",
      bodyLimit({
        maxSize: BODY_LIMIT_BYTES,
        onError: (c) =>
          renderProblem(
            c,
            problems.create("CONTENT_TOO_LARGE", {
              detail: `Request body must be at most ${BODY_LIMIT_BYTES} bytes.`,
            }),
          ),
      }),
    )
    // Liveness: no I/O, no dependency checks. An orchestrator restarts the
    // container when this fails, so it must not depend on Postgres.
    .get("/healthz", (c) => c.json({ status: "ok" } as const));

  app.notFound(notFoundHandler);
  app.onError(apiErrorHandler);

  return app;
}

/** Shared with the mobile app for end-to-end typed calls via Hono's RPC client. */
export type AppType = ReturnType<typeof createApp>;
```

Replace `apps/api/src/index.ts`:

```ts
import { serve } from "@hono/node-server";
import { getLogger } from "@logtape/logtape";
import { createCache } from "@repo/cache";
import { createDb } from "@repo/db";
import { configureLogging } from "@repo/logging";

import { createApp } from "./app.js";
import { parseEnv } from "./env.js";

const env = parseEnv(process.env);

// Before anything else logs: a record written before this lands nowhere.
await configureLogging({ service: "api", level: env.LOG_LEVEL });
const log = getLogger(["api"]);

const { db, close: closeDb } = createDb(env.DATABASE_URL);
const cache = createCache(env.VALKEY_URL);

const app = createApp({ db, cache, production: env.NODE_ENV === "production" });

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  log.info("Listening on http://localhost:{port}", { port: info.port });
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    log.info("{signal} — shutting down", { signal });
    server.close(() => {
      void Promise.all([closeDb(), cache.close()]).then(() => process.exit(0));
    });
  });
}
```

Top-level `await` is fine here: the file is ESM and is the process entrypoint.

- [ ] **Step 10: Write the test harness**

Create `apps/api/test/setup/containers.ts`:

```ts
import { startValkey } from "@repo/cache/testing";
import { startPostgres } from "@repo/db/testing";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  interface ProvidedContext {
    databaseUrl: string;
    valkeyUrl: string;
  }
}

let stopPostgres: (() => Promise<void>) | undefined;
let stopValkey: (() => Promise<void>) | undefined;

export async function setup(project: TestProject) {
  const [postgres, valkey] = await Promise.all([startPostgres(), startValkey()]);

  stopPostgres = postgres.stop;
  stopValkey = valkey.stop;

  project.provide("databaseUrl", postgres.url);
  project.provide("valkeyUrl", valkey.url);
}

export async function teardown() {
  await stopPostgres?.();
  await stopValkey?.();
}
```

Create `apps/api/test/helpers.ts`:

```ts
import { createCache, type Cache } from "@repo/cache";
import { flushAll } from "@repo/cache/testing";
import { createDb } from "@repo/db";
import { truncateAll } from "@repo/db/testing";
import { configureLogging } from "@repo/logging";
import { recordingSink } from "@repo/logging/testing";
import { expect, inject } from "vitest";

import { createApp } from "../src/app.js";
import type { AppDeps, Db } from "../src/types.js";

export const TEST_USER = "user_2testAAA";
export const OTHER_USER = "user_2testBBB";

/**
 * Logging is configured here, at import time, rather than in `globalSetup`:
 * `globalSetup` runs in its own process, and LogTape's configuration is
 * process-global. Every test file imports this module, so every test file gets a
 * configured logger and a sink it can read back.
 */
export const logs = recordingSink();

await configureLogging({ service: "api", level: "debug", sink: logs.sink });

export interface TestHarness {
  app: ReturnType<typeof createApp>;
  db: Db;
  cache: Cache;
  reset(): Promise<void>;
  close(): Promise<void>;
}

export function createTestApp(overrides: Partial<AppDeps> = {}): TestHarness {
  const valkeyUrl = inject("valkeyUrl");
  const { db, close: closeDb } = createDb(inject("databaseUrl"));
  const cache = createCache(valkeyUrl);

  const app = createApp({
    db,
    cache,
    // Production, so the header suite sees the full set including HSTS.
    production: true,
    ...overrides,
  });

  return {
    app,
    db,
    cache,
    reset: async () => {
      await truncateAll(db);
      await flushAll(valkeyUrl);
      logs.clear();
    },
    close: async () => {
      await closeDb();
      await cache.close();
    },
  };
}

/**
 * Every integration test calls the app through here. That is what makes spec
 * §11's "always a problem document" an invariant of the whole suite rather than
 * a handful of assertions: any request that ends 4xx or 5xx anywhere in these
 * tests fails here unless it carries the right media type.
 *
 * 304 is exempt by definition — it carries no body at all.
 *
 * `user` sets the header the fake authenticator of Task 7 reads. Pass
 * `user: null` to make an unauthenticated request.
 */
export async function callApi(
  app: TestHarness["app"],
  path: string,
  init: RequestInit & { user?: string | null } = {},
): Promise<Response> {
  const { user = TEST_USER, ...requestInit } = init;

  const headers = new Headers(requestInit.headers);
  if (user) headers.set("X-Test-User", user);

  const response = await app.request(path, { ...requestInit, headers });

  if (response.status >= 400) {
    expect(
      response.headers.get("content-type"),
      `${requestInit.method ?? "GET"} ${path} answered ${response.status} without a problem document`,
    ).toContain("application/problem+json");
  }

  return response;
}
```

- [ ] **Step 11: Run the tests to verify they pass**

Run: `pnpm install && pnpm --filter @repo/logging test && pnpm --filter api test`
Expected: PASS — 4 logging tests, 4 env tests, 15 app tests.

`pnpm install` prints one peer warning: `hono-problem-details` declares
`@hono/zod-validator ^0.7.5` and this repo is on `^0.9.0`. Task 9 covers what
that costs and why it is not resolved by downgrading.

- [ ] **Step 12: Verify lint, types and build, then check it boots**

Run: `pnpm format && pnpm lint && pnpm check-types && pnpm build`

Then, with `docker compose up -d` already running and a root `.env` holding the
Clerk keys:

```bash
pnpm --filter api dev
curl -i http://localhost:3000/healthz
curl -i http://localhost:3000/api/hello
```

Expected: `/healthz` is `200 {"status":"ok"}` with the security headers;
`/api/hello` is `404` `application/problem+json` — the route is gone. The
terminal shows one JSON object per request, each with a `traceId` matching the
`X-Request-Id` header in the `curl` output, and nothing for `/healthz`.

- [ ] **Step 13: Commit**

```bash
git add packages/logging apps/api turbo.json .env.example pnpm-lock.yaml
git commit -m "feat(api): add problem details, structured logging, and secure headers"
```

---

## Task 6: `/readyz` — the strict dependency probe

**Files:**

- Create: `apps/api/src/routes/probes.ts`
- Modify: `apps/api/src/app.ts` (mount the route module, drop the inline `/healthz`)
- Test: `apps/api/test/probes.test.ts`

**Interfaces:**

- Consumes: `AppDeps`, `problems`, `getLogger`.
- Produces: `probeRoutes(deps: AppDeps)`, `READINESS_TIMEOUT_MS = 1000`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/test/probes.test.ts`:

```ts
import { createCache } from "@repo/cache";
import { createDb } from "@repo/db";
import { afterAll, expect, test } from "vitest";

import { callApi, createTestApp } from "./helpers.js";

const harness = createTestApp();

afterAll(async () => {
  await harness.close();
});

test("readyz is 200 with both dependencies up", async () => {
  const response = await callApi(harness.app, "/readyz");

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    status: "ok",
    checks: { postgres: "up", valkey: "up" },
  });
  expect(response.headers.get("cache-control")).toBe("no-store");
});

test("a Valkey outage takes readiness down, by decision", async () => {
  // Spec §12 records the cost: the cache is fail-open, so the API still serves
  // every request correctly with Valkey down, and a strict probe will pull a
  // working instance out of rotation. The trade buys a probe that reports the
  // true state of the dependencies. Reverting it is one branch.
  const dead = createCache("redis://127.0.0.1:1");
  const harnessWithDeadCache = createTestApp({ cache: dead });

  const response = await callApi(harnessWithDeadCache.app, "/readyz");
  const body = (await response.json()) as Record<string, unknown>;

  expect(response.status).toBe(503);
  expect(response.headers.get("content-type")).toContain("application/problem+json");
  expect(body).toMatchObject({
    type: "https://barklog.gg/problems/service-unavailable",
    status: 503,
    checks: { postgres: "up", valkey: "down" },
  });
  // 503 is a 5xx: no detail, no driver error string, no hostname. These are
  // unauthenticated endpoints.
  expect(body.detail).toBeUndefined();
  expect(JSON.stringify(body)).not.toContain("127.0.0.1");

  await harnessWithDeadCache.close();
});

test("a Postgres outage takes readiness down too", async () => {
  const { db, close } = createDb("postgres://barklog:barklog@127.0.0.1:1/barklog");
  const harnessWithDeadDb = createTestApp({ db });

  const response = await callApi(harnessWithDeadDb.app, "/readyz");

  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({
    checks: { postgres: "down", valkey: "up" },
  });

  await close();
  await harnessWithDeadDb.close();
});

test("liveness stays up when readiness is down", async () => {
  const dead = createCache("redis://127.0.0.1:1");
  const harnessWithDeadCache = createTestApp({ cache: dead });

  // The distinction is the whole point: a Postgres blip must not restart pods.
  expect((await callApi(harnessWithDeadCache.app, "/healthz")).status).toBe(200);
  expect((await callApi(harnessWithDeadCache.app, "/readyz")).status).toBe(503);

  await harnessWithDeadCache.close();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter api test probes`
Expected: FAIL — `/readyz` is 404.

- [ ] **Step 3: Write the probe routes**

Create `apps/api/src/routes/probes.ts`:

```ts
import { getLogger } from "@logtape/logtape";
import { sql } from "drizzle-orm";
import { Hono } from "hono";

import { problems } from "../problems.js";
import type { AppDeps, AppEnv, Db } from "../types.js";

/** Neither check may hold a probe open longer than this. */
export const READINESS_TIMEOUT_MS = 1_000;

async function withTimeout(check: Promise<boolean>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      check.catch(() => false),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function checkPostgres(db: Db): Promise<boolean> {
  await db.execute(sql`select 1`);
  return true;
}

export function probeRoutes(deps: AppDeps) {
  return (
    new Hono<AppEnv>()
      // Liveness: no I/O at all. 200 whenever the event loop turns.
      .get("/healthz", (c) => c.json({ status: "ok" } as const))
      // Readiness: strict on both dependencies.
      .get("/readyz", async (c) => {
        const [postgres, valkey] = await Promise.all([
          withTimeout(checkPostgres(deps.db), READINESS_TIMEOUT_MS),
          withTimeout(deps.cache.ping(), READINESS_TIMEOUT_MS),
        ]);

        const checks = {
          postgres: postgres ? "up" : "down",
          valkey: valkey ? "up" : "down",
        } as const;

        if (!postgres || !valkey) {
          // The probes are not request-logged, and a thrown problem is not
          // logged by `app.onError` either, so this line is the only trace a
          // readiness failure leaves behind. It is worth having.
          getLogger(["api", "readiness"]).warn("Not ready: {checks}", { checks });

          // A problem document, so even the probe honours spec §11 — and the
          // body stays terse: component names and up/down, nothing else. No
          // detail (it is a 5xx) and no driver error string; these endpoints are
          // unauthenticated.
          throw problems.create("SERVICE_UNAVAILABLE", { extensions: { checks } });
        }

        return c.json({ status: "ok", checks } as const);
      })
  );
}
```

- [ ] **Step 4: Mount it**

In `apps/api/src/app.ts`, add the import:

```ts
import { probeRoutes } from "./routes/probes.js";
```

and replace the inline `/healthz` handler at the end of the chain with:

```ts
    .route("/", probeRoutes(deps))
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter api test`
Expected: PASS — the app suite (still green: `/healthz` behaves identically) plus
4 probe tests.

- [ ] **Step 6: Verify lint, types and build**

Run: `pnpm format && pnpm lint && pnpm check-types && pnpm build`

- [ ] **Step 7: Commit**

```bash
git add apps/api
git commit -m "feat(api): add liveness and readiness probes"
```

---

## Task 7: Clerk auth, the exact-path allowlist, and user provisioning

**Files:**

- Create: `apps/api/src/middleware/auth.ts`
- Create: `apps/api/src/clerk.ts`
- Modify: `apps/api/src/types.ts` (`AppDeps.auth`)
- Modify: `apps/api/src/app.ts` (mount the chain)
- Modify: `apps/api/src/index.ts` (use the Clerk provider)
- Modify: `apps/api/test/helpers.ts` (the fake authenticator)
- Test: `apps/api/test/auth.test.ts`

**Interfaces:**

- Consumes: `ensureUser` from `@repo/db`; `problems`; `PROBE_PATHS` from `src/types.ts`.
- Produces:
  - `type Authenticator = (c: Context) => Promise<string | null> | string | null`
  - `interface AuthProvider { middleware?: MiddlewareHandler; authenticate: Authenticator }`
  - `requireAuth(authenticate: Authenticator): MiddlewareHandler<AppEnv>` — public
    paths come from `PROBE_PATHS`, which Task 5 already defined and the request
    logger already skips
  - `ensureUserMiddleware(db: Db): MiddlewareHandler<AppEnv>`
  - `clerkAuthProvider(env: { CLERK_SECRET_KEY: string; CLERK_PUBLISHABLE_KEY: string }): AuthProvider`
  - `AppDeps` gains `auth: AuthProvider`
  - test helpers gain `fakeAuthProvider` (reads `X-Test-User`)

- [ ] **Step 1: Write the failing tests**

Create `apps/api/test/auth.test.ts`:

```ts
import { afterAll, beforeEach, expect, test } from "vitest";

import { callApi, createTestApp, TEST_USER } from "./helpers.js";

const harness = createTestApp();

beforeEach(async () => {
  await harness.reset();
});

afterAll(async () => {
  await harness.close();
});

test("the two probes are public", async () => {
  expect((await callApi(harness.app, "/healthz", { user: null })).status).toBe(200);
  expect((await callApi(harness.app, "/readyz", { user: null })).status).toBe(200);
});

test("everything else is 401 without a session", async () => {
  const response = await callApi(harness.app, "/api/backlog", { user: null });

  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({
    type: "https://barklog.gg/problems/unauthorized",
    status: 401,
  });
});

test("the allowlist is by exact path, so no future /health-debug is public", async () => {
  // Spec §8. A prefix allowlist is the mistake this test exists to prevent.
  expect((await callApi(harness.app, "/healthz/extra", { user: null })).status).toBe(401);
  expect((await callApi(harness.app, "/health-debug", { user: null })).status).toBe(401);
});

test("an authenticated request gets past auth and on to routing", async () => {
  // No /api/backlog route exists yet, so reaching a 404 is the proof that the
  // 401 gate opened.
  expect((await callApi(harness.app, "/api/backlog")).status).toBe(404);
});

test("a mutating request provisions the user row just in time", async () => {
  await callApi(harness.app, "/api/backlog/1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "playing" }),
  });

  const rows = await harness.db.execute("select id from users");
  expect(rows.rows).toEqual([{ id: TEST_USER }]);
});

test("a read does not provision anything", async () => {
  await callApi(harness.app, "/api/backlog");

  const rows = await harness.db.execute("select id from users");
  expect(rows.rows).toEqual([]);
});

test("provisioning twice is not an error", async () => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await callApi(harness.app, "/api/backlog/1", {
      method: "DELETE",
    });
  }

  const rows = await harness.db.execute("select id from users");
  expect(rows.rows).toHaveLength(1);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter api test auth`
Expected: FAIL — `/api/backlog` answers 404 rather than 401, because nothing
guards it yet.

- [ ] **Step 3: Write the auth middleware**

Create `apps/api/src/middleware/auth.ts`:

```ts
import { ensureUser } from "@repo/db";
import type { Context, MiddlewareHandler } from "hono";

import { problems } from "../problems.js";
import { PROBE_PATHS, type AppEnv, type Db } from "../types.js";

/**
 * Verification behind a function type. The production implementation lives in
 * `src/clerk.ts`; a test substitutes a fake, which is the only reason the
 * authenticated suite needs no network access to Clerk (spec §13).
 */
export type Authenticator = (c: Context) => Promise<string | null> | string | null;

export interface AuthProvider {
  /** Runs before `requireAuth`. Absent in tests, `clerkMiddleware()` in production. */
  middleware?: MiddlewareHandler;
  authenticate: Authenticator;
}

export function requireAuth(authenticate: Authenticator): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    // By exact path, not by prefix — a prefix allowlist would quietly make a
    // future `/healthz-debug` public. The same set decides what the request
    // logger skips, which is why it lives in `types.ts` and not here.
    if (PROBE_PATHS.has(c.req.path)) return next();

    const userId = await authenticate(c);
    if (!userId) {
      throw problems.create("UNAUTHORIZED", {
        detail: "A valid session token is required.",
      });
    }

    c.set("userId", userId);
    await next();
  };
}

/**
 * Just-in-time provisioning on mutating requests only (spec §4). A read never
 * needs the row to exist: the only thing keyed on it is a backlog entry, and
 * creating one is a mutation by definition.
 */
export function ensureUserMiddleware(db: Db): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    await ensureUser(db, c.get("userId"));
    await next();
  };
}
```

- [ ] **Step 4: Write the Clerk provider**

Create `apps/api/src/clerk.ts`:

```ts
import { clerkMiddleware, getAuth } from "@hono/clerk-auth";

import type { AuthProvider } from "./middleware/auth.js";

/**
 * The only file in the API that imports Clerk.
 *
 * Verification is stateless: `clerkMiddleware` checks the session JWT against
 * Clerk's JWKS with a cached key set, so there is no Clerk round trip per
 * request. The keys are passed in from the validated environment rather than
 * read from `process.env` inside the middleware, so a missing key is a boot
 * failure (spec §13).
 */
export function clerkAuthProvider(env: {
  CLERK_SECRET_KEY: string;
  CLERK_PUBLISHABLE_KEY: string;
}): AuthProvider {
  return {
    middleware: clerkMiddleware({
      secretKey: env.CLERK_SECRET_KEY,
      publishableKey: env.CLERK_PUBLISHABLE_KEY,
    }),
    authenticate: (c) => getAuth(c)?.userId ?? null,
  };
}
```

- [ ] **Step 5: Wire it into the app**

In `apps/api/src/types.ts`, add the import and the field:

```ts
import type { AuthProvider } from "./middleware/auth.js";
```

```ts
export interface AppDeps {
  db: Db;
  cache: Cache;
  auth: AuthProvider;
  /** Gates HSTS. Defaults to false. */
  production?: boolean;
}
```

`types.ts` now imports a type from `middleware/auth.ts`, which imports
`PROBE_PATHS` back from `types.ts`. That cycle is type-only in one direction and
value-only in the other, and `verbatimModuleSyntax` erases the `import type`
entirely — so there is no runtime cycle. Keep the `import type`.

In `apps/api/src/app.ts`, add the imports:

```ts
import type { MiddlewareHandler } from "hono";

import { ensureUserMiddleware, requireAuth } from "./middleware/auth.js";
```

add the no-op used when no provider middleware is supplied:

```ts
/** Stands in for `clerkMiddleware()` when a test supplies its own authenticator. */
const passthrough: MiddlewareHandler = (_c, next) => next();
```

and insert three links into the chain, after `bodyLimit` and before
`.route("/", probeRoutes(deps))`:

```ts
    .use("*", deps.auth.middleware ?? passthrough)
    .use("*", requireAuth(deps.auth.authenticate))
    // Mutating requests only, and after auth, because it needs the Clerk sub.
    .on(["PUT", "POST", "PATCH", "DELETE"], "/api/*", ensureUserMiddleware(deps.db))
```

In `apps/api/src/index.ts`, add the import and pass the provider:

```ts
import { clerkAuthProvider } from "./clerk.js";
```

```ts
const app = createApp({
  db,
  cache,
  log,
  auth: clerkAuthProvider(env),
  production: env.NODE_ENV === "production",
});
```

- [ ] **Step 6: Add the fake authenticator to the harness**

In `apps/api/test/helpers.ts`, add the export and put it in the defaults:

```ts
/**
 * Stands in for Clerk. The suite is about what the API does with an identity,
 * not about how the identity was proven, and every alternative — a real Clerk
 * instance, a hand-signed JWT and a stub JWKS — buys nothing for it.
 */
export const fakeAuthProvider: AuthProvider = {
  authenticate: (c) => c.req.header("X-Test-User") ?? null,
};
```

with the import:

```ts
import type { AuthProvider } from "../src/middleware/auth.js";
```

and add `auth: fakeAuthProvider,` to the `createApp` call in `createTestApp`,
above the `...overrides` spread.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm --filter api test`
Expected: PASS — every earlier file plus 7 auth tests. The `app.test.ts` 404 and
413 cases still pass because `callApi` sends `X-Test-User` by default.

- [ ] **Step 8: Verify lint, types and build**

Run: `pnpm format && pnpm lint && pnpm check-types && pnpm build`

- [ ] **Step 9: Commit**

```bash
git add apps/api
git commit -m "feat(api): require a Clerk session everywhere but the probes"
```

---

## Task 8: Rate limiting — fixed windows in Valkey, fail-open

**Files:**

- Create: `apps/api/src/rate-limits.ts`
- Create: `apps/api/src/middleware/rate-limit.ts`
- Modify: `apps/api/src/types.ts` (`AppDeps.rateLimits`)
- Modify: `apps/api/src/app.ts` (three scopes into the chain)
- Test: `apps/api/test/rate-limit.test.ts`

**Interfaces:**

- Consumes: `Cache.incrAndExpire` from Task 2; `problems`, `renderProblem`.
- Produces:
  - `type RateLimitScope = "search" | "write" | "overall"`
  - `interface RateLimitRule { limit: number; windowSeconds: number }`
  - `type RateLimits = Record<RateLimitScope, RateLimitRule>`
  - `DEFAULT_RATE_LIMITS` — search 30/min, write 60/min, overall 300/min
  - `RATE_LIMIT_KEY_TTL_SECONDS = 120`
  - `rateLimitKey(scope, userId, window): string`
  - `rateLimit(cache, scope, rule): MiddlewareHandler<AppEnv>`
  - `AppDeps` gains `rateLimits?: Partial<RateLimits>`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/test/rate-limit.test.ts`:

```ts
import { createCache } from "@repo/cache";
import { afterAll, beforeEach, expect, test } from "vitest";

import { DEFAULT_RATE_LIMITS } from "../src/rate-limits.js";
import { callApi, createTestApp } from "./helpers.js";

// Two requests per window rather than thirty: the behaviour under test is the
// window, and the real limits are asserted separately as data.
const harness = createTestApp({
  rateLimits: { search: { limit: 2, windowSeconds: 60 } },
});

beforeEach(async () => {
  await harness.reset();
});

afterAll(async () => {
  await harness.close();
});

test("the configured limits are the ones the spec states", () => {
  expect(DEFAULT_RATE_LIMITS).toEqual({
    search: { limit: 30, windowSeconds: 60 },
    write: { limit: 60, windowSeconds: 60 },
    overall: { limit: 300, windowSeconds: 60 },
  });
});

test("a request under the limit carries the RateLimit headers", async () => {
  const response = await callApi(harness.app, "/api/games/search?q=zelda");

  expect(response.headers.get("ratelimit-limit")).toBe("2");
  expect(response.headers.get("ratelimit-remaining")).toBe("1");
  expect(Number(response.headers.get("ratelimit-reset"))).toBeGreaterThan(0);
});

test("one request past the limit is a 429 problem document with Retry-After", async () => {
  await callApi(harness.app, "/api/games/search?q=zelda");
  await callApi(harness.app, "/api/games/search?q=zelda");
  const blocked = await callApi(harness.app, "/api/games/search?q=zelda");

  expect(blocked.status).toBe(429);
  expect(await blocked.json()).toMatchObject({
    type: "https://barklog.gg/problems/too-many-requests",
    title: "Too Many Requests",
    status: 429,
  });
  expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
  expect(blocked.headers.get("ratelimit-remaining")).toBe("0");
});

test("the counter is per user, so one noisy client cannot block another", async () => {
  await callApi(harness.app, "/api/games/search?q=zelda");
  await callApi(harness.app, "/api/games/search?q=zelda");

  const other = await callApi(harness.app, "/api/games/search?q=zelda", {
    user: "user_2someoneElse",
  });

  expect(other.status).not.toBe(429);
});

test("scopes count separately", async () => {
  const scoped = createTestApp({
    rateLimits: { write: { limit: 1, windowSeconds: 60 } },
  });

  // Exhaust the write scope.
  await callApi(scoped.app, "/api/backlog/1", { method: "DELETE" });
  expect((await callApi(scoped.app, "/api/backlog/1", { method: "DELETE" })).status).toBe(429);

  // A read is a different scope and is unaffected.
  expect((await callApi(scoped.app, "/api/games/search?q=zelda")).status).not.toBe(429);

  await scoped.close();
});

test("the overall scope counts every /api request", async () => {
  const scoped = createTestApp({
    rateLimits: { overall: { limit: 2, windowSeconds: 60 } },
  });

  await callApi(scoped.app, "/api/backlog");
  await callApi(scoped.app, "/api/games/search?q=zelda");
  expect((await callApi(scoped.app, "/api/backlog")).status).toBe(429);

  await scoped.close();
});

test("the probes are never rate limited", async () => {
  const scoped = createTestApp({
    rateLimits: { overall: { limit: 1, windowSeconds: 60 } },
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    expect((await callApi(scoped.app, "/healthz", { user: null })).status).toBe(200);
  }

  await scoped.close();
});

test("a Valkey outage cannot reject a request", async () => {
  // Spec §13: availability over enforcement, consistent with the cache.
  const failOpen = createTestApp({
    cache: createCache("redis://127.0.0.1:1"),
    rateLimits: { overall: { limit: 1, windowSeconds: 60 } },
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    expect((await callApi(failOpen.app, "/api/backlog")).status).not.toBe(429);
  }

  await failOpen.close();
});
```

Every one of these requests reaches a 404 today — no `/api/games` or
`/api/backlog` route exists until Tasks 9 and 10. That is deliberate: the
limiter runs before routing, so the tests assert the limiter and nothing else.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter api test rate-limit`
Expected: FAIL — `Cannot find module '../src/rate-limits.js'`.

- [ ] **Step 3: Write the limits as data**

Create `apps/api/src/rate-limits.ts`:

```ts
export type RateLimitScope = "search" | "write" | "overall";

export interface RateLimitRule {
  limit: number;
  windowSeconds: number;
}

export type RateLimits = Record<RateLimitScope, RateLimitRule>;

/** Spec §13. Keyed on the Clerk `sub`, so the limits are per person. */
export const DEFAULT_RATE_LIMITS: RateLimits = {
  search: { limit: 30, windowSeconds: 60 },
  write: { limit: 60, windowSeconds: 60 },
  overall: { limit: 300, windowSeconds: 60 },
};

/**
 * Longer than any window, so a counter always outlives the window it counts and
 * the key still expires on its own.
 */
export const RATE_LIMIT_KEY_TTL_SECONDS = 120;
```

- [ ] **Step 4: Write the middleware**

Create `apps/api/src/middleware/rate-limit.ts`:

```ts
import type { Cache } from "@repo/cache";
import type { MiddlewareHandler } from "hono";

import { problems, renderProblem } from "../problems.js";
import {
  RATE_LIMIT_KEY_TTL_SECONDS,
  type RateLimitRule,
  type RateLimitScope,
} from "../rate-limits.js";
import type { AppEnv } from "../types.js";

export function rateLimitKey(scope: RateLimitScope, userId: string, window: number): string {
  return `rl:${scope}:${userId}:${window}`;
}

/**
 * A fixed window, not a sliding one: `INCR` plus `EXPIRE` is atomic and cheap,
 * and the window number is part of the key, so nothing has to be cleaned up.
 */
export function rateLimit(
  cache: Cache,
  scope: RateLimitScope,
  rule: RateLimitRule,
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const userId = c.get("userId");
    // Only the public probes reach here without an identity, and they are not
    // limited — a probe that gets a 429 restarts a healthy container.
    if (!userId) return next();

    const nowSeconds = Math.floor(Date.now() / 1000);
    const window = Math.floor(nowSeconds / rule.windowSeconds);
    const resetSeconds = (window + 1) * rule.windowSeconds - nowSeconds;

    const count = await cache.incrAndExpire(
      rateLimitKey(scope, userId, window),
      RATE_LIMIT_KEY_TTL_SECONDS,
    );

    // Fail open. A counter we cannot read is not a reason to refuse service.
    if (count === null) return next();

    const headers: Record<string, string> = {
      "RateLimit-Limit": String(rule.limit),
      "RateLimit-Remaining": String(Math.max(0, rule.limit - count)),
      "RateLimit-Reset": String(resetSeconds),
    };

    if (count > rule.limit) {
      // The one place that renders a problem instead of throwing one: a 429 has
      // to carry `Retry-After` and the RateLimit headers, and a thrown problem
      // is rendered by `app.onError` where there is nowhere to attach them.
      // Same renderer, so the document is identical to every other problem.
      const response = await renderProblem(
        c,
        problems.create("TOO_MANY_REQUESTS", {
          detail: `At most ${rule.limit} requests per ${rule.windowSeconds} seconds.`,
        }),
      );

      for (const [name, value] of Object.entries({
        ...headers,
        "Retry-After": String(resetSeconds),
      })) {
        response.headers.set(name, value);
      }

      return response;
    }

    for (const [name, value] of Object.entries(headers)) {
      c.header(name, value);
    }

    await next();
  };
}
```

The success path uses `c.header()` because the response does not exist yet; the
429 path sets headers on the response object it just built. Both end up on the
wire — the test asserts each.

- [ ] **Step 5: Wire the three scopes in**

In `apps/api/src/types.ts`, add the import and the field:

```ts
import type { RateLimits } from "./rate-limits.js";
```

```ts
  /** Merged over `DEFAULT_RATE_LIMITS`. Tests use it to shrink a window. */
  rateLimits?: Partial<RateLimits>;
```

In `apps/api/src/app.ts`, add the imports:

```ts
import { rateLimit } from "./middleware/rate-limit.js";
import { DEFAULT_RATE_LIMITS } from "./rate-limits.js";
```

resolve the limits at the top of `createApp`:

```ts
const limits = { ...DEFAULT_RATE_LIMITS, ...deps.rateLimits };
```

and insert three links between `requireAuth` and the `ensureUserMiddleware`
line — the limiter needs the Clerk `sub`, so it must follow auth, and the most
specific scope is registered first:

```ts
    .use("/api/games/search", rateLimit(deps.cache, "search", limits.search))
    .on(["PUT", "DELETE"], "/api/backlog/*", rateLimit(deps.cache, "write", limits.write))
    .use("/api/*", rateLimit(deps.cache, "overall", limits.overall))
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter api test`
Expected: PASS — every earlier file plus 8 rate-limit tests.

- [ ] **Step 7: Verify lint, types and build**

Run: `pnpm format && pnpm lint && pnpm check-types && pnpm build`

- [ ] **Step 8: Commit**

```bash
git add apps/api
git commit -m "feat(api): add per-user fixed-window rate limiting"
```

---

## Task 9: Games routes — search, popular, details

**Files:**

- Create: `apps/api/src/cache-keys.ts`
- Create: `apps/api/src/serialize.ts`
- Create: `apps/api/src/routes/games.ts`
- Modify: `apps/api/src/app.ts` (mount `/api/games`)
- Modify: `apps/api/test/helpers.ts` (add `seedGame`)
- Test: `apps/api/test/games-routes.test.ts`

**Interfaces:**

- Consumes: `searchGames`, `popularGames`, `getGameDetail`, `getBacklogEntry` from
  `@repo/db`; `withCache` from `@repo/cache`; the query schemas from
  `@repo/contracts`; `onInvalid` and `problems` from `src/problems.ts`;
  `sValidator` from `@hono/standard-validator`.
- Produces:
  - `normaliseQuery(q): string`, `sha1(input): string`
  - `SEARCH_VERSION_KEY = "search:ver"`, `searchKey(version, q, limit, offset)`, `popularKey(version, limit)`
  - `SEARCH_TTL_SECONDS = 600`, `EMPTY_SEARCH_TTL_SECONDS = 60`, `POPULAR_TTL_SECONDS = 3600`
  - `toGameSummary`, `toGameDetail`, `toBacklogEntry`, `toBacklogListItem` and their
    `*Wire` types, in which every `Date` is an ISO string
  - `gamesRoutes(deps: AppDeps)`
  - test helper `seedGame(db, game)`

There is no validation-hook file to write: `onInvalid` came with the problem
registry in Task 5, and `sValidator` accepts it directly.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/test/games-routes.test.ts`:

```ts
import { schema } from "@repo/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, test } from "vitest";

import { SEARCH_VERSION_KEY } from "../src/cache-keys.js";
import { callApi, createTestApp, seedGame, TEST_USER } from "./helpers.js";

const harness = createTestApp();

beforeEach(async () => {
  await harness.reset();
});

afterAll(async () => {
  await harness.close();
});

test("search returns ranked summaries and a private short-lived cache directive", async () => {
  await seedGame(harness.db, {
    id: 1,
    name: "The Legend of Zelda: Breath of the Wild",
    count: 3000,
  });
  await seedGame(harness.db, { id: 2, name: "Zeldas Adventure", count: 3 });

  const response = await callApi(harness.app, "/api/games/search?q=zeld");
  const body = (await response.json()) as { items: { id: number; name: string }[] };

  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, max-age=60");
  expect(body.items[0]?.id).toBe(1);
  expect(body.items).toHaveLength(2);
});

test("a one-character query is 422, naming the field that failed", async () => {
  const response = await callApi(harness.app, "/api/games/search?q=z");
  const body = (await response.json()) as {
    errors: { field: string; message: string }[];
    type: string;
    title: string;
    detail: string;
  };

  expect(response.status).toBe(422);
  expect(response.headers.get("content-type")).toContain("application/problem+json");
  expect(body.errors[0]?.field).toBe("q");
  // valibot's wording, passed through untouched.
  expect(body.errors[0]?.message).toBe("Invalid length: Expected >=2 but received 1");
  // The library's shape and wording, adopted as-is (Task 5, Step 7): `about:blank`
  // rather than a barklog type, and no instance or traceId in the body.
  expect(body.type).toBe("about:blank");
  expect(body.title).toBe("Validation Error");
  expect(body.detail).toBe("Request validation failed");
  // The header is what keeps a 422 traceable.
  expect(response.headers.get("x-request-id")).toBeTruthy();
});

test("a limit over the cap is 422 rather than silently clamped", async () => {
  const response = await callApi(harness.app, "/api/games/search?q=zelda&limit=500");

  expect(response.status).toBe(422);
  expect((await response.json()).errors[0].field).toBe("limit");
});

test("a non-numeric limit is 422, not a silent fallback to the default", async () => {
  // `integerFrom` coerces with `Number`, so junk becomes NaN and fails the
  // `v.number()` check rather than passing through as 20.
  const response = await callApi(harness.app, "/api/games/search?q=zelda&limit=abc");

  expect(response.status).toBe(422);
  expect((await response.json()).errors[0]).toMatchObject({
    field: "limit",
    message: "Invalid type: Expected number but received NaN",
  });
});

test("a repeated search is served from the cache", async () => {
  await seedGame(harness.db, { id: 1, name: "Hades", count: 900 });

  const first = await callApi(harness.app, "/api/games/search?q=hades");
  expect((await first.json()).items).toHaveLength(1);

  // Remove the row the answer came from. A cached answer cannot notice.
  await harness.db.delete(schema.games).where(eq(schema.games.id, 1));

  const second = await callApi(harness.app, "/api/games/search?q=hades");
  expect((await second.json()).items).toHaveLength(1);
});

test("normalisation means casing and spacing share one cache entry", async () => {
  await seedGame(harness.db, { id: 1, name: "Hades", count: 900 });

  await callApi(harness.app, "/api/games/search?q=hades");
  await harness.db.delete(schema.games).where(eq(schema.games.id, 1));

  const padded = await callApi(harness.app, "/api/games/search?q=%20%20HADES%20%20");
  expect((await padded.json()).items).toHaveLength(1);
});

test("the version bump the sync performs invalidates every cached search at once", async () => {
  await seedGame(harness.db, { id: 1, name: "Hades", count: 900 });

  await callApi(harness.app, "/api/games/search?q=hades");
  await harness.db.delete(schema.games).where(eq(schema.games.id, 1));

  // This is exactly what the worker does at the end of a successful run.
  await harness.cache.incr(SEARCH_VERSION_KEY);

  const fresh = await callApi(harness.app, "/api/games/search?q=hades");
  expect((await fresh.json()).items).toHaveLength(0);
});

test("a cache hit and a cache miss are byte-identical", async () => {
  // Dates must be serialised before they are cached, or a hit would answer with
  // strings where a miss answered with Date objects.
  await seedGame(harness.db, {
    id: 1,
    name: "Hades",
    count: 900,
    firstReleaseDate: new Date("2020-09-17T00:00:00Z"),
  });

  const miss = await (await callApi(harness.app, "/api/games/search?q=hades")).text();
  const hit = await (await callApi(harness.app, "/api/games/search?q=hades")).text();

  expect(hit).toBe(miss);
  expect(JSON.parse(miss).items[0].firstReleaseDate).toBe("2020-09-17T00:00:00.000Z");
});

test("popular ranks by rating count behind a rating floor", async () => {
  await seedGame(harness.db, { id: 1, name: "Well Loved", count: 500, rating: 90 });
  await seedGame(harness.db, { id: 2, name: "Widely Played, Badly Rated", count: 900, rating: 40 });

  const response = await callApi(harness.app, "/api/games/popular");
  const body = (await response.json()) as { items: { id: number }[] };

  expect(response.headers.get("cache-control")).toBe("private, max-age=300");
  expect(body.items.map((item) => item.id)).toEqual([1]);
});

test("details carry the child collections and the caller's own backlog entry", async () => {
  await seedGame(harness.db, { id: 1942, name: "The Witcher 3: Wild Hunt", count: 4021 });
  await harness.db.insert(schema.users).values({ id: TEST_USER });
  await harness.db
    .insert(schema.backlogEntries)
    .values({ userId: TEST_USER, gameId: 1942, status: "playing", rating: 9 });

  const response = await callApi(harness.app, "/api/games/1942");
  const body = (await response.json()) as {
    id: number;
    genres: unknown[];
    screenshots: unknown[];
    backlogEntry: { status: string; rating: number } | null;
  };

  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, max-age=300");
  expect(body.id).toBe(1942);
  expect(body.genres).toEqual([]);
  expect(body.screenshots).toEqual([]);
  expect(body.backlogEntry).toMatchObject({ status: "playing", rating: 9 });
});

test("another user's entry never appears in the caller's game details", async () => {
  await seedGame(harness.db, { id: 1942, name: "The Witcher 3: Wild Hunt", count: 4021 });
  await harness.db.insert(schema.users).values({ id: "user_2somebodyElse" });
  await harness.db
    .insert(schema.backlogEntries)
    .values({ userId: "user_2somebodyElse", gameId: 1942, status: "completed", rating: 3 });

  const response = await callApi(harness.app, "/api/games/1942");

  expect((await response.json()).backlogEntry).toBeNull();
});

test("an unmirrored id is 404 and a non-numeric id is 422", async () => {
  expect((await callApi(harness.app, "/api/games/999999")).status).toBe(404);
  expect((await callApi(harness.app, "/api/games/abc")).status).toBe(422);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter api test games-routes`
Expected: FAIL — `Cannot find module '../src/cache-keys.js'`.

- [ ] **Step 3: Write the cache keys**

Create `apps/api/src/cache-keys.ts`:

```ts
import { createHash } from "node:crypto";

/**
 * A counter, not a key list. The sync runs `INCR` on it, and every key from the
 * previous version becomes unreachable at once and expires on its own — no key
 * scanning, and no way to miss an invalidation.
 */
export const SEARCH_VERSION_KEY = "search:ver";

export const SEARCH_TTL_SECONDS = 600;
/** Shorter, because this is what absorbs the typo storm search-as-you-type makes. */
export const EMPTY_SEARCH_TTL_SECONDS = 60;
export const POPULAR_TTL_SECONDS = 3600;

/** Trimmed, lowercased, internal whitespace collapsed — before hashing. */
export function normaliseQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

export function sha1(input: string): string {
  return createHash("sha1").update(input).digest("hex");
}

export function searchKey(version: number, query: string, limit: number, offset: number): string {
  return `search:v${version}:${sha1(`${query}|${limit}|${offset}`)}`;
}

export function popularKey(version: number, limit: number): string {
  return `popular:v${version}:${limit}`;
}
```

- [ ] **Step 4: Write the wire mappers**

Create `apps/api/src/serialize.ts`:

```ts
import type {
  BacklogEntry,
  BacklogListItem,
  BacklogStatusValue,
  GameDetail,
  GameSummary,
  NamedRef,
  PlatformRef,
} from "@repo/db";

export interface GameSummaryWire {
  id: number;
  name: string;
  slug: string;
  coverImageId: string | null;
  firstReleaseDate: string | null;
  totalRating: number | null;
  totalRatingCount: number;
}

export interface GameDetailWire extends GameSummaryWire {
  summary: string | null;
  gameType: { id: number; name: string } | null;
  parentGame: { id: number; name: string } | null;
  screenshots: string[];
  genres: NamedRef[];
  platforms: PlatformRef[];
  developers: NamedRef[];
  publishers: NamedRef[];
}

export interface BacklogEntryWire {
  gameId: number;
  status: BacklogStatusValue;
  rating: number | null;
  addedAt: string;
  updatedAt: string;
}

export interface BacklogListItemWire extends BacklogEntryWire {
  game: GameSummaryWire;
}

/**
 * Rows become wire shapes before anything is cached or hashed. `JSON.stringify`
 * would turn a Date into the same string either way, but then a cache hit would
 * hand the route a string where a miss handed it a Date — a type that is a lie
 * half the time, and an ETag that changes for no reason.
 */
const iso = (value: Date | null): string | null => (value === null ? null : value.toISOString());

export function toGameSummary(row: GameSummary): GameSummaryWire {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    coverImageId: row.coverImageId,
    firstReleaseDate: iso(row.firstReleaseDate),
    totalRating: row.totalRating,
    totalRatingCount: row.totalRatingCount,
  };
}

export function toGameDetail(row: GameDetail): GameDetailWire {
  return {
    ...toGameSummary(row),
    summary: row.summary,
    gameType: row.gameType,
    parentGame: row.parentGame,
    screenshots: row.screenshots,
    genres: row.genres,
    platforms: row.platforms,
    developers: row.developers,
    publishers: row.publishers,
  };
}

export function toBacklogEntry(entry: BacklogEntry): BacklogEntryWire {
  return {
    gameId: entry.gameId,
    status: entry.status,
    rating: entry.rating,
    addedAt: entry.addedAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

export function toBacklogListItem(item: BacklogListItem): BacklogListItemWire {
  return { ...toBacklogEntry(item), game: toGameSummary(item.game) };
}
```

- [ ] **Step 5: Write the routes**

Create `apps/api/src/routes/games.ts`:

```ts
import { sValidator } from "@hono/standard-validator";
import { withCache } from "@repo/cache";
import { gameIdParamSchema, popularQuerySchema, searchQuerySchema } from "@repo/contracts";
import { getBacklogEntry, getGameDetail, popularGames, searchGames } from "@repo/db";
import { Hono } from "hono";

import {
  EMPTY_SEARCH_TTL_SECONDS,
  normaliseQuery,
  POPULAR_TTL_SECONDS,
  popularKey,
  SEARCH_TTL_SECONDS,
  SEARCH_VERSION_KEY,
  searchKey,
} from "../cache-keys.js";
import { onInvalid, problems } from "../problems.js";
import { toBacklogEntry, toGameDetail, toGameSummary, type GameSummaryWire } from "../serialize.js";
import type { AppDeps, AppEnv } from "../types.js";

export function gamesRoutes(deps: AppDeps) {
  const searchVersion = async (): Promise<number> =>
    (await deps.cache.get<number>(SEARCH_VERSION_KEY)) ?? 0;

  return (
    new Hono<AppEnv>()
      .get("/search", sValidator("query", searchQuerySchema, onInvalid), async (c) => {
        const { q, limit, offset } = c.req.valid("query");
        const query = normaliseQuery(q);
        const version = await searchVersion();

        const items = await withCache<GameSummaryWire[]>(
          deps.cache,
          searchKey(version, query, limit, offset),
          (value) => (value.length === 0 ? EMPTY_SEARCH_TTL_SECONDS : SEARCH_TTL_SECONDS),
          async () => (await searchGames(deps.db, { query, limit, offset })).map(toGameSummary),
        );

        c.header("Cache-Control", "private, max-age=60");
        return c.json({ items });
      })
      .get("/popular", sValidator("query", popularQuerySchema, onInvalid), async (c) => {
        const { limit } = c.req.valid("query");
        const version = await searchVersion();

        const items = await withCache<GameSummaryWire[]>(
          deps.cache,
          popularKey(version, limit),
          POPULAR_TTL_SECONDS,
          async () => (await popularGames(deps.db, { limit })).map(toGameSummary),
        );

        c.header("Cache-Control", "private, max-age=300");
        return c.json({ items });
      })
      // Registered last so the two static paths above are never shadowed.
      .get("/:id", sValidator("param", gameIdParamSchema, onInvalid), async (c) => {
        const { id } = c.req.valid("param");

        const game = await getGameDetail(deps.db, id);
        if (!game) {
          throw problems.create("NOT_FOUND", { detail: `Game ${id} is not in the mirror.` });
        }

        // Embedding the caller's entry is what gives the game screen the right
        // button state in one request. It also makes the response user-varying,
        // which is why it must never enter a shared cache (spec §8).
        const entry = await getBacklogEntry(deps.db, c.get("userId"), id);

        c.header("Cache-Control", "private, max-age=300");
        return c.json({
          ...toGameDetail(game),
          backlogEntry: entry === null ? null : toBacklogEntry(entry),
        });
      })
  );
}
```

- [ ] **Step 6: Mount the routes and add the seed helper**

In `apps/api/src/app.ts`, add the import and one chain link before
`.route("/", probeRoutes(deps))`:

```ts
import { gamesRoutes } from "./routes/games.js";
```

```ts
    .route("/api/games", gamesRoutes(deps))
```

In `apps/api/test/helpers.ts`, add the import and the helper:

```ts
import { schema } from "@repo/db";
```

```ts
/** Enough of a mirror row for a route test. Defaults are searchable and popular. */
export async function seedGame(
  db: Db,
  game: {
    id: number;
    name: string;
    count?: number;
    rating?: number | null;
    typeId?: number;
    firstReleaseDate?: Date | null;
  },
): Promise<void> {
  await db
    .insert(schema.gameTypes)
    .values({ id: game.typeId ?? 0, name: "Main Game" })
    .onConflictDoNothing();

  await db.insert(schema.games).values({
    id: game.id,
    name: game.name,
    slug: game.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, ""),
    gameTypeId: game.typeId ?? 0,
    totalRating: game.rating === undefined ? 85 : game.rating,
    totalRatingCount: game.count ?? 100,
    firstReleaseDate: game.firstReleaseDate ?? null,
    igdbUpdatedAt: new Date("2026-01-01T00:00:00Z"),
  });
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm --filter api test`
Expected: PASS — every earlier file plus 12 games-route tests.

- [ ] **Step 8: Verify lint, types and build, then exercise it by hand**

Run: `pnpm format && pnpm lint && pnpm check-types && pnpm build`

The API is locked down, so a `curl` needs a session token. Take one from the
Expo app once it exists; until then the suite is the check.

- [ ] **Step 9: Commit**

```bash
git add apps/api
git commit -m "feat(api): serve search, popular and game details from the mirror"
```

---

## Task 10: Backlog routes — the CRUD core

**Files:**

- Create: `apps/api/src/middleware/json.ts`
- Create: `apps/api/src/routes/backlog.ts`
- Modify: `apps/api/src/app.ts` (mount `/api/backlog`, mount `requireJson`)
- Test: `apps/api/test/backlog-routes.test.ts`

**Interfaces:**

- Consumes: `listBacklog`, `getBacklogStats`, `upsertBacklogEntry`,
  `deleteBacklogEntry`, `gameExists` from `@repo/db`; `backlogListQuerySchema`,
  `backlogUpsertSchema`, `gameIdPathSchema` from `@repo/contracts`; `sha1`.
- Produces:
  - `requireJson(): MiddlewareHandler<AppEnv>`
  - `matchesIfNoneMatch(header: string | undefined, etag: string): boolean`
  - `backlogRoutes(deps: AppDeps)`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/test/backlog-routes.test.ts`:

```ts
import { afterAll, beforeEach, expect, test } from "vitest";

import { BODY_LIMIT_BYTES } from "../src/app.js";
import { callApi, createTestApp, OTHER_USER, seedGame } from "./helpers.js";

const harness = createTestApp();

const json = (body: unknown): RequestInit => ({
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

beforeEach(async () => {
  await harness.reset();
  await seedGame(harness.db, { id: 1, name: "Alpha Protocol", count: 100 });
  await seedGame(harness.db, { id: 2, name: "Beta Decay", count: 200 });
});

afterAll(async () => {
  await harness.close();
});

test("a first PUT creates with 201 and a second updates with 200", async () => {
  const created = await callApi(harness.app, "/api/backlog/1", json({ status: "waiting" }));
  expect(created.status).toBe(201);
  expect(await created.json()).toMatchObject({ gameId: 1, status: "waiting", rating: null });

  const updated = await callApi(
    harness.app,
    "/api/backlog/1",
    json({ status: "completed", rating: 9 }),
  );
  expect(updated.status).toBe(200);
  expect(await updated.json()).toMatchObject({ status: "completed", rating: 9 });
});

test("a resent identical PUT is harmless, which is what makes offline retry safe", async () => {
  await callApi(harness.app, "/api/backlog/1", json({ status: "playing" }));
  const resent = await callApi(harness.app, "/api/backlog/1", json({ status: "playing" }));

  expect(resent.status).toBe(200);
  const list = await callApi(harness.app, "/api/backlog");
  expect((await list.json()).items).toHaveLength(1);
});

test("a PUT for a game outside the mirror is 404, not a foreign-key crash", async () => {
  const response = await callApi(harness.app, "/api/backlog/999999", json({ status: "waiting" }));

  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({
    type: "https://barklog.gg/problems/not-found",
  });
});

test("an out-of-range rating is 422 naming the field", async () => {
  const response = await callApi(
    harness.app,
    "/api/backlog/1",
    json({ status: "playing", rating: 11 }),
  );

  expect(response.status).toBe(422);
  expect((await response.json()).errors[0].field).toBe("rating");
});

test("an unknown status is 422 naming the field", async () => {
  const response = await callApi(harness.app, "/api/backlog/1", json({ status: "finished" }));

  expect(response.status).toBe(422);
  expect((await response.json()).errors[0].field).toBe("status");
});

test("an unknown key is rejected, and the offending key is named", async () => {
  const response = await callApi(
    harness.app,
    "/api/backlog/1",
    json({ status: "playing", note: "hi" }),
  );
  const error = (await response.json()).errors[0] as { field: string; message: string };

  expect(response.status).toBe(422);
  // valibot puts the rejected key in the issue path, so `field` is usable here
  // as it is everywhere else.
  expect(error.field).toBe("note");
});

test("a body that is not JSON is 415", async () => {
  const response = await callApi(harness.app, "/api/backlog/1", {
    method: "PUT",
    headers: { "Content-Type": "text/plain" },
    body: "status=playing",
  });

  expect(response.status).toBe(415);
  expect(await response.json()).toMatchObject({
    type: "https://barklog.gg/problems/unsupported-media-type",
  });
});

test("malformed JSON is 400, distinct from a validation failure", async () => {
  const response = await callApi(harness.app, "/api/backlog/1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: "{not json",
  });

  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({
    type: "https://barklog.gg/problems/bad-request",
  });
});

test("an oversized body is 413 before the route sees it", async () => {
  const response = await callApi(
    harness.app,
    "/api/backlog/1",
    json({ status: "playing", padding: "x".repeat(BODY_LIMIT_BYTES) }),
  );

  expect(response.status).toBe(413);
});

test("DELETE removes once and is 404 the second time", async () => {
  await callApi(harness.app, "/api/backlog/1", json({ status: "playing" }));

  const removed = await callApi(harness.app, "/api/backlog/1", { method: "DELETE" });
  expect(removed.status).toBe(204);
  expect(await removed.text()).toBe("");

  const again = await callApi(harness.app, "/api/backlog/1", { method: "DELETE" });
  expect(again.status).toBe(404);
});

test("the list is the caller's own, joined to game summaries", async () => {
  await callApi(harness.app, "/api/backlog/1", json({ status: "playing" }));
  await callApi(harness.app, "/api/backlog/2", { ...json({ status: "completed", rating: 8 }) });
  await callApi(harness.app, "/api/backlog/1", {
    ...json({ status: "waiting" }),
    user: OTHER_USER,
  });

  const response = await callApi(harness.app, "/api/backlog");
  const body = (await response.json()) as {
    items: { gameId: number; game: { name: string } }[];
  };

  expect(response.status).toBe(200);
  expect(body.items).toHaveLength(2);
  expect(body.items.map((item) => item.game.name).sort()).toEqual(["Alpha Protocol", "Beta Decay"]);
});

test("the list filters by status and sorts on request", async () => {
  await callApi(harness.app, "/api/backlog/1", json({ status: "playing" }));
  await callApi(harness.app, "/api/backlog/2", json({ status: "completed", rating: 8 }));

  const playing = await callApi(harness.app, "/api/backlog?status=playing");
  expect((await playing.json()).items.map((item: { gameId: number }) => item.gameId)).toEqual([1]);

  const byName = await callApi(harness.app, "/api/backlog?sort=name");
  expect((await byName.json()).items.map((item: { gameId: number }) => item.gameId)).toEqual([
    1, 2,
  ]);

  const badSort = await callApi(harness.app, "/api/backlog?sort=id");
  expect(badSort.status).toBe(422);
});

test("the list revalidates with an ETag and answers 304 on a match", async () => {
  await callApi(harness.app, "/api/backlog/1", json({ status: "playing" }));

  const first = await callApi(harness.app, "/api/backlog");
  const etag = first.headers.get("etag");

  expect(etag).toBeTruthy();
  // `no-cache`, not `no-store`: the client must be allowed to keep the copy it
  // revalidates against.
  expect(first.headers.get("cache-control")).toBe("private, no-cache");

  const revalidated = await callApi(harness.app, "/api/backlog", {
    headers: { "If-None-Match": etag! },
  });

  expect(revalidated.status).toBe(304);
  expect(await revalidated.text()).toBe("");
  expect(revalidated.headers.get("etag")).toBe(etag);
  // A 304 must still be traceable and must still carry the security headers.
  expect(revalidated.headers.get("x-request-id")).toBeTruthy();
  expect(revalidated.headers.get("x-content-type-options")).toBe("nosniff");
});

test("the ETag changes when the collection does", async () => {
  await callApi(harness.app, "/api/backlog/1", json({ status: "playing" }));
  const before = (await callApi(harness.app, "/api/backlog")).headers.get("etag");

  await callApi(harness.app, "/api/backlog/2", json({ status: "waiting" }));
  const after = (await callApi(harness.app, "/api/backlog")).headers.get("etag");

  expect(after).not.toBe(before);
});

test("a wildcard If-None-Match revalidates too", async () => {
  await callApi(harness.app, "/api/backlog/1", json({ status: "playing" }));

  const response = await callApi(harness.app, "/api/backlog", {
    headers: { "If-None-Match": "*" },
  });

  expect(response.status).toBe(304);
});

test("stats count every status and average only the rated entries", async () => {
  await callApi(harness.app, "/api/backlog/1", json({ status: "completed", rating: 8 }));
  await callApi(harness.app, "/api/backlog/2", json({ status: "waiting" }));

  const response = await callApi(harness.app, "/api/backlog/stats");

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    total: 2,
    counts: { waiting: 1, playing: 0, completed: 1, abandoned: 0 },
    averageRating: 8,
  });
});

test("stats on an empty backlog are zeroes, not a 404", async () => {
  const response = await callApi(harness.app, "/api/backlog/stats");

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ total: 0, averageRating: null });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter api test backlog-routes`
Expected: FAIL — every request answers 404.

- [ ] **Step 3: Write the media-type guard**

Create `apps/api/src/middleware/json.ts`:

```ts
import type { MiddlewareHandler } from "hono";

import { problems } from "../problems.js";
import type { AppEnv } from "../types.js";

const JSON_CONTENT_TYPE = /^application\/(?:[\w.+-]+\+)?json\b/i;

/**
 * Hono's validator treats a non-JSON body as an empty object, which surfaces as
 * a 422 about missing fields — misleading when the real problem is the media
 * type. This turns that case into the 415 spec §11 asks for, before validation.
 */
export function requireJson(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const contentType = c.req.header("Content-Type");

    if (!contentType || !JSON_CONTENT_TYPE.test(contentType)) {
      throw problems.create("UNSUPPORTED_MEDIA_TYPE", {
        detail: "Request body must be application/json.",
      });
    }

    await next();
  };
}
```

- [ ] **Step 4: Write the routes**

Create `apps/api/src/routes/backlog.ts`:

```ts
import { sValidator } from "@hono/standard-validator";
import { backlogListQuerySchema, backlogUpsertSchema, gameIdPathSchema } from "@repo/contracts";
import {
  deleteBacklogEntry,
  gameExists,
  getBacklogStats,
  listBacklog,
  upsertBacklogEntry,
} from "@repo/db";
import { Hono } from "hono";

import { sha1 } from "../cache-keys.js";
import { onInvalid, problems } from "../problems.js";
import { toBacklogEntry, toBacklogListItem } from "../serialize.js";
import type { AppDeps, AppEnv } from "../types.js";

/** `If-None-Match` is a list, and `*` matches any current representation. */
export function matchesIfNoneMatch(header: string | undefined, etag: string): boolean {
  if (!header) return false;

  return header
    .split(",")
    .map((candidate) => candidate.trim())
    .some((candidate) => candidate === "*" || candidate === etag);
}

export function backlogRoutes(deps: AppDeps) {
  return (
    new Hono<AppEnv>()
      /**
       * The caller's whole collection. No pagination: a personal backlog runs to
       * hundreds of rows, and the soft cap in the query keeps it bounded.
       *
       * Conditional, because the collection changes rarely and a user opening the
       * app five times a day should get four empty responses.
       */
      .get("/", sValidator("query", backlogListQuerySchema, onInvalid), async (c) => {
        const { status, sort } = c.req.valid("query");

        const items = (await listBacklog(deps.db, { userId: c.get("userId"), status, sort })).map(
          toBacklogListItem,
        );

        const body = { items };
        const etag = `"${sha1(JSON.stringify(body))}"`;

        c.header("Cache-Control", "private, no-cache");
        c.header("ETag", etag);

        if (matchesIfNoneMatch(c.req.header("If-None-Match"), etag)) {
          return c.body(null, 304);
        }

        return c.json(body);
      })
      // Before `/:gameId` would ever be consulted, and a distinct method anyway.
      .get("/stats", async (c) => c.json(await getBacklogStats(deps.db, c.get("userId"))))
      /**
       * `PUT` only. An entry is two fields and the client always holds both, so a
       * full replace is always expressible — which removes the
       * 409-already-exists path entirely and makes an offline retry harmless.
       */
      .put(
        "/:gameId",
        sValidator("param", gameIdPathSchema, onInvalid),
        sValidator("json", backlogUpsertSchema, onInvalid),
        async (c) => {
          const { gameId } = c.req.valid("param");
          const { status, rating } = c.req.valid("json");

          // An entry for a game we have not mirrored cannot satisfy the foreign
          // key, so this is a 404 rather than a constraint violation.
          if (!(await gameExists(deps.db, gameId))) {
            throw problems.create("NOT_FOUND", {
              detail: `Game ${gameId} is not in the mirror.`,
            });
          }

          const { entry, created } = await upsertBacklogEntry(deps.db, {
            userId: c.get("userId"),
            gameId,
            status,
            rating: rating ?? null,
          });

          return c.json(toBacklogEntry(entry), created ? 201 : 200);
        },
      )
      .delete("/:gameId", sValidator("param", gameIdPathSchema, onInvalid), async (c) => {
        const { gameId } = c.req.valid("param");

        const removed = await deleteBacklogEntry(deps.db, c.get("userId"), gameId);
        if (!removed) {
          throw problems.create("NOT_FOUND", {
            detail: `No backlog entry for game ${gameId}.`,
          });
        }

        return c.body(null, 204);
      })
  );
}
```

- [ ] **Step 5: Mount the routes and the media-type guard**

In `apps/api/src/app.ts`, add the imports:

```ts
import { requireJson } from "./middleware/json.js";
import { backlogRoutes } from "./routes/backlog.js";
```

Add `requireJson` immediately before the `ensureUserMiddleware` link, so a wrong
media type is refused before anything touches the database:

```ts
    .on(["PUT", "POST", "PATCH"], "/api/*", requireJson())
```

and mount the routes next to the games routes:

```ts
    .route("/api/backlog", backlogRoutes(deps))
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter api test`
Expected: PASS — every earlier file plus 17 backlog-route tests.

If the 304 case loses `X-Request-Id` or a security header, the cause is response
construction, not the ETag: `finalize` re-stamps `X-Request-Id` on whatever the
handler returned, and `c.body(null, 304)` keeps the prepared headers where a
bare `new Response(null, { status: 304 })` would not.

- [ ] **Step 7: Verify lint, types and build**

Run: `pnpm format && pnpm lint && pnpm check-types && pnpm build`

- [ ] **Step 8: Commit**

```bash
git add apps/api
git commit -m "feat(api): add the backlog CRUD core with conditional list responses"
```

---

## Task 11: Sync status, the invariants, and the docs

**Files:**

- Modify: `packages/db/src/queries/sync-runs.ts` (add `getLastRun`)
- Test: `packages/db/test/sync-runs.test.ts` (cover `getLastRun`)
- Create: `apps/api/src/routes/sync.ts`
- Modify: `apps/api/src/app.ts` (mount `/api/sync`)
- Test: `apps/api/test/invariants.test.ts`
- Modify: `README.md`

**Interfaces:**

- Consumes: everything above.
- Produces:
  - `interface SyncRunSummary { id: string; status: "running" | "success" | "failed"; startedAt: Date; finishedAt: Date | null; watermark: Date | null; counts: Record<string, number>; error: string | null }`
  - `getLastRun(db): Promise<SyncRunSummary | null>`
  - `syncRoutes(deps: AppDeps)`

- [ ] **Step 1: Write the failing tests**

Append to `packages/db/test/sync-runs.test.ts` — match the existing file's
imports and `beforeEach` rather than adding new ones:

```ts
test("getLastRun returns the most recently started run, whatever its status", async () => {
  const first = await startRun(db);
  await finishRun(db, first, { watermark: new Date("2026-08-01T00:00:00Z"), counts: { games: 5 } });

  const second = await startRun(db);

  const last = await getLastRun(db);
  expect(last?.id).toBe(second);
  expect(last?.status).toBe("running");
  expect(last?.finishedAt).toBeNull();
});

test("getLastRun reports the counts and watermark of a finished run", async () => {
  const id = await startRun(db);
  await finishRun(db, id, {
    watermark: new Date("2026-08-25T00:00:00Z"),
    counts: { games: 373_590, pages: 748 },
  });

  const last = await getLastRun(db);
  expect(last).toMatchObject({
    id,
    status: "success",
    counts: { games: 373_590, pages: 748 },
  });
  expect(last?.watermark?.toISOString()).toBe("2026-08-25T00:00:00.000Z");
});

test("getLastRun is null before the worker has ever run", async () => {
  expect(await getLastRun(db)).toBeNull();
});
```

Create `apps/api/test/invariants.test.ts`:

```ts
import { readFile } from "node:fs/promises";

import { hc } from "hono/client";
import { afterAll, beforeEach, expect, test } from "vitest";

import type { AppType } from "../src/app.js";
import { problems } from "../src/problems.js";
import { callApi, createTestApp, seedGame } from "./helpers.js";

const harness = createTestApp();

beforeEach(async () => {
  await harness.reset();
});

afterAll(async () => {
  await harness.close();
});

test("the API cannot reach IGDB, and the manifest is what guarantees it", async () => {
  // Spec §3: the separation is enforced by the package manifest, not by
  // convention, so the design cannot regress into a live proxy by accident.
  const manifest = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

  const names = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });

  expect(names).not.toContain("@repo/igdb");
  expect(names.filter((name) => name.toLowerCase().includes("igdb"))).toEqual([]);
});

test("AppType still exposes every route the mobile client calls", () => {
  const client = hc<AppType>("http://api.test");

  // The runtime assertions are a formality — `hc` is a Proxy and answers to any
  // property. The real guarantee is at the type level: if a route module's
  // chain were broken, AppType would degrade to {} and none of these accesses
  // would compile. That is why `check-types` runs against tsconfig.test.json.
  expect(typeof client.healthz.$get).toBe("function");
  expect(typeof client.readyz.$get).toBe("function");
  expect(typeof client.api.games.search.$get).toBe("function");
  expect(typeof client.api.games.popular.$get).toBe("function");
  expect(typeof client.api.games[":id"].$get).toBe("function");
  expect(typeof client.api.backlog.$get).toBe("function");
  expect(typeof client.api.backlog.stats.$get).toBe("function");
  expect(typeof client.api.backlog[":gameId"].$put).toBe("function");
  expect(typeof client.api.backlog[":gameId"].$delete).toBe("function");
  expect(typeof client.api.sync.status.$get).toBe("function");
});

test("every error the API can produce is a problem document", async () => {
  await seedGame(harness.db, { id: 1, name: "Alpha Protocol", count: 100 });

  interface Case {
    label: string;
    path: string;
    init?: RequestInit & { user?: string | null };
    /**
     * The 422 is rendered by the library's `zodProblemHook`, which builds its
     * response without the context: `about:blank`, no `instance`, no `traceId`
     * (Task 5, Step 7). It is the one documented exception, so it is spelled out
     * here rather than silently passing a weaker assertion.
     */
    libraryValidationShape?: true;
  }

  const cases: Case[] = [
    { label: "401", path: "/api/backlog", init: { user: null } },
    { label: "404 route", path: "/nope" },
    { label: "404 game", path: "/api/games/999999" },
    { label: "404 entry", path: "/api/backlog/1", init: { method: "DELETE" } },
    {
      label: "415",
      path: "/api/backlog/1",
      init: { method: "PUT", headers: { "Content-Type": "text/plain" }, body: "x" },
    },
    {
      label: "400",
      path: "/api/backlog/1",
      init: { method: "PUT", headers: { "Content-Type": "application/json" }, body: "{" },
    },
    { label: "422", path: "/api/games/search?q=z", libraryValidationShape: true },
  ];

  for (const testCase of cases) {
    const response = await callApi(harness.app, testCase.path, testCase.init);
    const body = (await response.json()) as Record<string, unknown>;

    // True of every error without exception: the media type, the status
    // agreeing with the body, a title, and a header to trace it by.
    expect(response.status, testCase.label).toBeGreaterThanOrEqual(400);
    expect(response.headers.get("content-type"), testCase.label).toContain(
      "application/problem+json",
    );
    expect(body.status, testCase.label).toBe(response.status);
    expect(body.title, testCase.label).toBeTruthy();
    expect(response.headers.get("x-request-id"), testCase.label).toBeTruthy();

    if (testCase.libraryValidationShape) {
      expect(body.type, testCase.label).toBe("about:blank");
      continue;
    }

    expect(body.type, testCase.label).toMatch(/^https:\/\/barklog\.gg\/problems\//);
    expect(body.instance, testCase.label).toBeTruthy();
    expect(body.traceId, testCase.label).toBe(response.headers.get("x-request-id"));
  }
});

test("the registry's type URIs are the library's slugs", () => {
  // A record of the vocabulary, so a library upgrade that renames a slug fails
  // here rather than surprising a client.
  expect(problems.types().map((key) => problems.get(key).type)).toEqual([
    "https://barklog.gg/problems/unauthorized",
    "https://barklog.gg/problems/not-found",
    "https://barklog.gg/problems/content-too-large",
    "https://barklog.gg/problems/unsupported-media-type",
    "https://barklog.gg/problems/too-many-requests",
    "https://barklog.gg/problems/service-unavailable",
  ]);
});

test("sync status reports the last run, and null before the worker has ever run", async () => {
  const empty = await callApi(harness.app, "/api/sync/status");
  expect(empty.status).toBe(200);
  expect(await empty.json()).toEqual({ lastRun: null });
  expect(empty.headers.get("cache-control")).toBe("no-store");

  await harness.db.execute(
    "insert into sync_runs (status, finished_at, watermark, counts) values ('success', now(), now(), '{\"games\": 10}'::jsonb)",
  );

  const populated = await callApi(harness.app, "/api/sync/status");
  const body = (await populated.json()) as { lastRun: Record<string, unknown> | null };

  expect(body.lastRun).toMatchObject({ status: "success", counts: { games: 10 } });
  // The stored error string stays server-side.
  expect(body.lastRun).not.toHaveProperty("error");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @repo/db test sync-runs && pnpm --filter api test invariants`
Expected: FAIL — `getLastRun` is not exported, and `/api/sync/status` is 404.

- [ ] **Step 3: Add the query**

Append to `packages/db/src/queries/sync-runs.ts`:

```ts
export interface SyncRunSummary {
  id: string;
  status: "running" | "success" | "failed";
  startedAt: Date;
  finishedAt: Date | null;
  watermark: Date | null;
  counts: Record<string, number>;
  error: string | null;
}

/**
 * The most recently *started* run, not the most recently finished, so a run in
 * progress is what `GET /api/sync/status` reports.
 */
export async function getLastRun(db: Db): Promise<SyncRunSummary | null> {
  const rows = await db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(1);

  return rows[0] ?? null;
}
```

- [ ] **Step 4: Add the route**

Create `apps/api/src/routes/sync.ts`:

```ts
import { getLastRun } from "@repo/db";
import { Hono } from "hono";

import type { AppDeps, AppEnv } from "../types.js";

export function syncRoutes(deps: AppDeps) {
  return new Hono<AppEnv>().get("/status", async (c) => {
    const run = await getLastRun(deps.db);

    return c.json({
      lastRun:
        run === null
          ? null
          : {
              id: run.id,
              status: run.status,
              startedAt: run.startedAt.toISOString(),
              finishedAt: run.finishedAt?.toISOString() ?? null,
              watermark: run.watermark?.toISOString() ?? null,
              counts: run.counts,
            },
      // `run.error` is deliberately omitted: it is an exception message, and
      // spec §11's reasoning about 5xx detail applies to it just the same.
    });
  });
}
```

In `apps/api/src/app.ts`, add the import and one more chain link:

```ts
import { syncRoutes } from "./routes/sync.js";
```

```ts
    .route("/api/sync", syncRoutes(deps))
```

- [ ] **Step 5: Run everything**

Run: `pnpm test`
Expected: PASS across `@repo/contracts`, `@repo/logging`, `@repo/cache`,
`@repo/db`, `@repo/igdb`, `apps/worker` and `apps/api`.

- [ ] **Step 6: Update the README**

Replace the `## apps/api` section with:

````markdown
## apps/api

```
src/
  env.ts          valibot-validated environment, parsed once at boot
  problems.ts     the problem-type registry and the one error renderer
  types.ts        Db, AppEnv, AppDeps, PROBE_PATHS
  rate-limits.ts  the three scopes and their limits, as data
  cache-keys.ts   query normalisation, sha1, key builders, TTLs
  serialize.ts    row -> wire mappers (dates become ISO strings)
  clerk.ts        the production authenticator; the only Clerk import
  middleware/     finalize, auth, media type, rate limiting, validation
  routes/         probes, games, backlog, sync status
  app.ts          createApp(deps) — the middleware chain, exports AppType
  index.ts        Node bootstrap
```

Every route needs a valid Clerk session token. The only public routes are
`/healthz` and `/readyz`, allowlisted by exact path.

| Route                                     | Notes                                             |
| ----------------------------------------- | ------------------------------------------------- |
| `GET /api/games/search?q=&limit=&offset=` | `q` ≥ 2 chars, `limit` ≤ 50, `offset` ≤ 200       |
| `GET /api/games/popular?limit=`           | `limit` ≤ 50 (default 20)                         |
| `GET /api/games/:id`                      | full details plus the caller's `backlogEntry`     |
| `GET /api/backlog?status=&sort=`          | the caller's full list; `ETag` + `304`            |
| `GET /api/backlog/stats`                  | counts per status plus average rating             |
| `PUT /api/backlog/:gameId`                | `{status, rating?}`; `201` created, `200` updated |
| `DELETE /api/backlog/:gameId`             | `204`, or `404` if absent                         |
| `GET /api/sync/status`                    | the last sync run                                 |
| `GET /healthz`                            | liveness, public, no I/O                          |
| `GET /readyz`                             | readiness, public, strict on Postgres and Valkey  |

Every non-2xx response is `application/problem+json` (RFC 9457). Type slugs and
titles come from `hono-problem-details`, so a 413 is `content-too-large` and a
429 is `too-many-requests`. Every response carries `X-Request-Id`, and every
problem body repeats it as `traceId` — except a 422, which is rendered by the
library's validation hook and correlates by header alone. No 5xx ever carries an
exception message; that goes to the log under the same id.

`pnpm --filter api build` emits `dist/`; `pnpm --filter api start` runs it.
`pnpm --filter api test` starts its own Postgres and Valkey via Testcontainers;
Clerk is faked, so the suite needs no network.
````

In the `## Adding auth` section, replace the "The skeleton is deliberately
unauthenticated" paragraph opening with a note that the API side is done and the
list that follows is what remains in `apps/mobile`. Add two rows to the
`## What's inside` package list: `@repo/contracts`, "shared valibot request schemas
and the backlog status union", and `@repo/logging`, "one LogTape configuration —
JSON lines, with a per-request or per-run context".

Add a `## Logs` section after `## Testing`:

````markdown
## Logs

Both processes write JSON lines to stdout, one object per record, filtered by
`LOG_LEVEL` (`trace`, `debug`, `info`, `warning`, `error`, `fatal` — LogTape's
levels, so there is no `warn`).

Every record written while handling an HTTP request carries the `traceId` that
the client got back in `X-Request-Id` and that any problem document repeats, and
every record written during a sync carries that run's `runId`. Neither is passed
as an argument anywhere: they come from LogTape's implicit context.

```bash
pnpm --filter api dev | jq 'select(.traceId == "…")'
pnpm --filter worker sync | jq -r '[.level, .message] | @tsv'
```
````

- [ ] **Step 7: Verify lint, types, build and format**

Run: `pnpm format && pnpm lint && pnpm check-types && pnpm build && pnpm test`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add apps/api packages/db README.md
git commit -m "feat(api): add sync status, the API invariants, and the docs"
```

---

## Task 12: `apps/worker` — the same logging, keyed on the run

The worker currently prints unstructured lines through `console.log` and an
injected `log` function. This task retires both: one `configureLogging` call per
entrypoint, `withContext({ runId })` around the run, and `getLogger()` where a
line is written.

**Files:**

- Modify: `apps/worker/package.json` (add `@repo/logging`, `@logtape/logtape`)
- Modify: `apps/worker/src/env.ts` (`LOG_LEVEL`)
- Modify: `apps/worker/src/sync.ts` (drop `SyncDeps.log`, add the run context)
- Modify: `apps/worker/src/context.ts` (drop the `console.log` injection)
- Modify: `apps/worker/src/cli.ts`, `apps/worker/src/index.ts` (configure logging)
- Modify: `apps/worker/test/sync.test.ts`, `apps/worker/test/env.test.ts`
- Modify: `apps/worker/vitest.config.ts` if a setup file is needed
- Modify: `.env.example`, `apps/worker/.env.example` if present

**Interfaces:**

- Consumes: `configureLogging`, `resetLogging`, `LOG_LEVELS` from `@repo/logging`;
  `recordingSink` from `@repo/logging/testing`; `getLogger`, `withContext` from
  `@logtape/logtape`.
- Produces: `SyncDeps` without its `log` field. Everything else keeps its
  signature, so `syncAll(deps, options)` still reads the same at both call sites.

- [ ] **Step 1: Write the failing tests**

Add to `apps/worker/test/env.test.ts`, matching the file's existing imports:

```ts
test("LOG_LEVEL defaults to info and rejects a non-LogTape level", () => {
  expect(parseEnv(VALID).LOG_LEVEL).toBe("info");
  expect(parseEnv({ ...VALID, LOG_LEVEL: "debug" }).LOG_LEVEL).toBe("debug");
  expect(() => parseEnv({ ...VALID, LOG_LEVEL: "warn" })).toThrow(/LOG_LEVEL/);
});
```

`VALID` is whatever the existing tests in that file already use for a complete
environment; reuse it rather than declaring a second one.

Add to `apps/worker/test/sync.test.ts`:

```ts
test("every line written during a run carries that run's id", async () => {
  const logs = recordingSink();
  await configureLogging({ service: "worker", level: "debug", sink: logs.sink });

  const result = await syncAll(deps);

  expect(result.status).toBe("success");

  const runIds = new Set(logs.records.map((record) => record.properties.runId));
  // One run, one id, on every record — nobody threaded it through a signature.
  expect(runIds.size).toBe(1);
  expect([...runIds][0]).toBeTruthy();
  expect(logs.records.length).toBeGreaterThan(0);

  await resetLogging();
});
```

Build `deps` the way the surrounding tests in that file already do — this test
adds the logging assertion to an existing successful-run fixture rather than
inventing a new one.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter worker test`
Expected: FAIL — `LOG_LEVEL` is not in the schema, and `runId` is undefined on
every record.

- [ ] **Step 3: Add `LOG_LEVEL` to the worker environment**

In `apps/worker/src/env.ts`, add the import and the field:

```ts
import { LOG_LEVELS } from "@repo/logging";
```

```ts
  LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
```

Still zod at this point. Task 13 converts this whole file to valibot; keep the
two changes in separate commits so a logging failure and a validation-library
failure cannot be mistaken for each other. `LOG_LEVELS` from `@repo/logging` is a
plain readonly tuple, so it works unchanged either side of that conversion.

and add `"@repo/logging": "workspace:*"` and `"@logtape/logtape": "^2.3.2"` to
`apps/worker/package.json` `dependencies`.

`LOG_LEVEL` is already in every relevant `turbo.json` task's `env` array from
Task 5, so no change is needed there.

- [ ] **Step 4: Put the run id in the implicit context**

In `apps/worker/src/sync.ts`, drop `log` from `SyncDeps`:

```ts
export interface SyncDeps {
  db: Db;
  pool: pg.Pool;
  cache: { incr(key: string): Promise<number | null> };
  igdb: { gamesPage(options: { since: Date | null; afterId: number }): Promise<unknown[]> };
}
```

add the imports:

```ts
import { getLogger, withContext } from "@logtape/logtape";
```

```ts
const log = getLogger(["worker", "sync"]);
```

and replace every `log("…")` call with a LogTape call using placeholders rather
than interpolation, so the values stay queryable fields instead of being baked
into a string:

```ts
// was: log("another sync holds the lock; skipping")
log.info("Another sync holds the lock; skipping.");

// was: log(since ? `incremental sync since ${since.toISOString()}` : "full seed")
log.info("Starting {mode} sync.", { mode: since ? "incremental" : "full", since });

// was: log(`page ${counts.pages}: ${page.length} games`)
log.debug("Page {page}: {games} games.", { page: counts.pages, games: page.length });

// was the failure path
log.error("Sync failed: {message}", { message });
```

Then wrap the body of the run — everything after the advisory lock is taken and
the `sync_runs` row is opened — in `withContext`, so the run id lands on every
record including those written by `persistPage` and anything it calls:

```ts
const runId = await startRun(deps.db);

return withContext({ runId }, async () => {
  try {
    // … the existing body, unchanged …
  } finally {
    await releaseLock();
  }
});
```

Keep the existing structure inside; the only change is the wrapper and the
logger calls. `withContext` returns whatever the callback returns, so the
function's `Promise<SyncResult>` signature is unaffected.

- [ ] **Step 5: Stop injecting a logger**

In `apps/worker/src/context.ts`, remove `log` from the returned `deps`:

```ts
    deps: { db, pool, cache, igdb },
```

In `apps/worker/src/cli.ts` and `apps/worker/src/index.ts`, configure logging
before anything else runs, and replace the remaining `console.log` calls:

```ts
import { getLogger } from "@logtape/logtape";
import { configureLogging } from "@repo/logging";
```

```ts
const env = parseEnv(process.env);
await configureLogging({ service: "worker", level: env.LOG_LEVEL });
const log = getLogger(["worker"]);
```

In `index.ts`, the scheduler messages become:

```ts
log.info("Scheduled {cron} ({timezone}).", { cron: env.SYNC_CRON, timezone: env.SYNC_TZ });
```

```ts
log.info("{signal} — shutting down.", { signal });
```

- [ ] **Step 6: Wire the recording sink into the worker suite**

Add `@repo/logging` to `apps/worker/package.json` `devDependencies` is not
needed — it is already a runtime dependency from Step 3. Import
`recordingSink` from `@repo/logging/testing` and `configureLogging` /
`resetLogging` from `@repo/logging` in `apps/worker/test/sync.test.ts`.

Tests that do not configure logging still pass: an unconfigured LogTape drops
records rather than throwing.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm --filter worker test`
Expected: PASS — the existing worker suite plus the two new assertions.

- [ ] **Step 8: Verify lint, types and build, then run a real sync**

Run: `pnpm format && pnpm lint && pnpm check-types && pnpm build`

```bash
docker compose up -d
pnpm --filter worker sync | tail -5
```

Expected: JSON lines, every one carrying the same `runId`, ending in a success
record. The incremental run should still be seconds (the mirror plan measured
6.9 s).

- [ ] **Step 9: Commit**

```bash
git add apps/worker README.md pnpm-lock.yaml
git commit -m "refactor(worker): log through LogTape with a per-run context"
```

---

## Task 13: `@repo/igdb` and `apps/worker` — the last of zod

One validation library in the repo, not two. Four files hold zod: the IGDB
response schema, its one call site, the worker's environment schema, and two
manifests. This task converts them and drops the dependency.

The risk here is not the type system — it is that the IGDB response schema is
the gate every one of 373,590 mirrored rows passes through, and a subtly
different optional-field rule would reject real payloads at 2am. So the
acceptance test is a real sync, not a fixture.

**Files:**

- Modify: `packages/igdb/src/schemas.ts` (zod → valibot)
- Modify: `packages/igdb/src/map.ts` (the one parse call)
- Modify: `packages/igdb/package.json` (drop `zod`, add `valibot`)
- Modify: `packages/igdb/test/contract.test.ts` (the parse call)
- Test: `packages/igdb/test/schemas.test.ts` (new — the parity properties)
- Modify: `apps/worker/src/env.ts` (zod → valibot, including Task 12's `LOG_LEVEL`)
- Modify: `apps/worker/package.json` (drop `zod`, add `valibot`)
- Modify: `README.md`

**Interfaces:**

- Consumes: `valibot`; `LOG_LEVELS` from `@repo/logging`.
- Produces: the same exports as before — `igdbGameSchema`, `type IgdbGame`,
  `parseEnv`, `type WorkerEnv`. `mapGames`, `createIgdbClient` and every worker
  entrypoint keep their signatures, so nothing downstream changes.

- [ ] **Step 1: Write the failing tests**

Create `packages/igdb/test/schemas.test.ts`. These are the properties the zod
schema had implicitly and nobody had written down — worth pinning precisely
because this task swaps the engine underneath them:

```ts
import * as v from "valibot";
import { expect, test } from "vitest";

import { igdbGameSchema } from "../src/schemas.js";

/** The narrowest row IGDB can return for a game: everything optional omitted. */
const MINIMAL = { id: 2, name: "Bare", slug: "bare", updated_at: 1_755_000_001 };

test("a row with every optional field omitted parses", () => {
  // IGDB omits absent fields rather than sending null, so this is the common
  // case, not an edge case.
  expect(v.parse(igdbGameSchema, MINIMAL)).toEqual(MINIMAL);
});

test("an omitted optional stays absent rather than becoming null", () => {
  // `map.ts` relies on this: it turns `undefined` into null itself.
  expect(Object.keys(v.parse(igdbGameSchema, MINIMAL))).toEqual([
    "id",
    "name",
    "slug",
    "updated_at",
  ]);
});

test("fields we did not ask for are stripped", () => {
  const parsed = v.parse(igdbGameSchema, { ...MINIMAL, checksum: "abc", category: 0 });

  expect(parsed).not.toHaveProperty("checksum");
  // `category` is the deprecated field of spec §7. Even if IGDB sends it, it
  // must not reach a row.
  expect(parsed).not.toHaveProperty("category");
});

test("a wrong type is rejected, naming the field", () => {
  const result = v.safeParse(igdbGameSchema, { ...MINIMAL, updated_at: "yesterday" });

  expect(result.success).toBe(false);
  expect(result.issues?.map((issue) => v.getDotPath(issue))).toEqual(["updated_at"]);
});

test("a malformed nested row is rejected, naming the path", () => {
  const result = v.safeParse(igdbGameSchema, {
    ...MINIMAL,
    genres: [{ id: 12, name: "Role-playing (RPG)" }],
  });

  expect(result.success).toBe(false);
  expect(result.issues?.map((issue) => v.getDotPath(issue))).toEqual(["genres.0.slug"]);
});

test("a non-integer id is rejected", () => {
  expect(v.safeParse(igdbGameSchema, { ...MINIMAL, id: 1.5 }).success).toBe(false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @repo/igdb test schemas`
Expected: FAIL — `v.parse` is not how a zod schema is parsed
(`TypeError: schema['~standard'] is undefined` or similar).

- [ ] **Step 3: Convert the IGDB response schema**

Replace `packages/igdb/src/schemas.ts`:

```ts
import * as v from "valibot";

const int = v.pipe(v.number(), v.integer());

/**
 * IGDB omits absent fields rather than sending null, so every optional field is
 * `v.optional()` and the mapper is responsible for turning that into null.
 *
 * `v.object` strips unknown keys, which is deliberate: IGDB returns what the
 * field list asks for, and anything else — a deprecated `category`, a `checksum`
 * — must not reach a database row.
 */
const referenceSchema = v.object({
  id: int,
  name: v.string(),
  slug: v.string(),
});

export const igdbGameSchema = v.object({
  id: int,
  name: v.string(),
  slug: v.string(),
  summary: v.optional(v.string()),
  first_release_date: v.optional(int),
  updated_at: int,
  total_rating: v.optional(v.number()),
  total_rating_count: v.optional(int),
  parent_game: v.optional(int),
  game_type: v.optional(v.object({ id: int, type: v.string() })),
  cover: v.optional(v.object({ id: int, image_id: v.string() })),
  screenshots: v.optional(v.array(v.object({ id: int, image_id: v.string() }))),
  genres: v.optional(v.array(referenceSchema)),
  platforms: v.optional(
    v.array(
      v.object({
        id: int,
        name: v.string(),
        abbreviation: v.optional(v.string()),
        slug: v.string(),
      }),
    ),
  ),
  involved_companies: v.optional(
    v.array(
      v.object({
        id: int,
        company: referenceSchema,
        developer: v.optional(v.boolean()),
        publisher: v.optional(v.boolean()),
      }),
    ),
  ),
});

export type IgdbGame = v.InferOutput<typeof igdbGameSchema>;
```

`v.InferOutput` produces the same optional-property type zod's `z.infer` did, so
every `game.summary ?? null` and `game.game_type?.id ?? null` in `map.ts` still
type-checks untouched.

- [ ] **Step 4: Update the two call sites**

In `packages/igdb/src/map.ts`, change the import and the parse:

```ts
import * as v from "valibot";

import { igdbGameSchema } from "./schemas.js";
```

```ts
const games = raw.map((row) => v.parse(igdbGameSchema, row));
```

In `packages/igdb/test/contract.test.ts`, the live-payload assertion becomes:

```ts
expect(() => v.parse(igdbGameSchema, row)).not.toThrow();
```

with `import * as v from "valibot";` added at the top.

In `packages/igdb/package.json`, swap the dependency:

```json
  "dependencies": {
    "@repo/cache": "workspace:*",
    "valibot": "^1.4.2"
  },
```

- [ ] **Step 5: Run the IGDB suite**

Run: `pnpm --filter @repo/igdb test`
Expected: PASS — the 6 new schema tests plus every existing file. `map.test.ts`
is the one that matters most: it parses full fixture pages through the new
schema and asserts the mapped rows are unchanged. Nothing in it should need
editing — if it does, the schema conversion is wrong, not the test.

- [ ] **Step 6: Convert the worker environment**

Replace `apps/worker/src/env.ts`. This supersedes the zod `LOG_LEVEL` line from
Task 12:

```ts
import { LOG_LEVELS } from "@repo/logging";
import * as v from "valibot";

const required = v.pipe(v.string(), v.minLength(1));

const envSchema = v.object({
  DATABASE_URL: required,
  VALKEY_URL: required,
  IGDB_CLIENT_ID: required,
  IGDB_CLIENT_SECRET: required,
  SYNC_CRON: v.optional(required, "0 0 * * *"),
  SYNC_TZ: v.optional(required, "UTC"),
  LOG_LEVEL: v.optional(v.picklist(LOG_LEVELS), "info"),
});

export type WorkerEnv = v.InferOutput<typeof envSchema>;

/**
 * Parsed once at boot so a missing secret stops the process immediately rather
 * than surfacing at midnight when the sync fires.
 *
 * `v.getDotPath` is what names the offending variable — without it a missing
 * `IGDB_CLIENT_SECRET` reads as an anonymous "Invalid key", and the tests below
 * match on the name.
 */
export function parseEnv(source: Record<string, string | undefined>): WorkerEnv {
  const result = v.safeParse(envSchema, source);

  if (!result.success) {
    const detail = result.issues
      .map((issue) => `${v.getDotPath(issue) ?? "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid worker environment — ${detail}`);
  }

  return result.output;
}
```

`v.optional(required, "0 0 * * *")` keeps the existing behaviour exactly: the
fallback applies only when the variable is absent, so `SYNC_CRON=""` still fails
the `minLength` check rather than silently reverting to the default. The existing
`env.test.ts` covers both cases and needs no changes.

In `apps/worker/package.json`, swap the dependency:

```json
    "valibot": "^1.4.2"
```

in place of `"zod": "^4.4.3"`, keeping the rest of the block alphabetical.

- [ ] **Step 7: Run the worker suite**

Run: `pnpm install && pnpm --filter worker test`
Expected: PASS — including the four existing `env.test.ts` tests unchanged, and
Task 12's `LOG_LEVEL` assertions.

- [ ] **Step 8: Confirm zod is gone from the repo**

```bash
grep -rn "\"zod\"\|from \"zod\"" --include="*.ts" --include="*.json" apps packages | grep -v node_modules | grep -v dist
```

Expected: no output. Then confirm the lockfile agrees:

```bash
pnpm install
grep -c "^  /zod@\|  zod@" pnpm-lock.yaml || echo "zod pruned from the lockfile"
```

- [ ] **Step 9: Verify lint, types and build, then sync for real**

Run: `pnpm format && pnpm lint && pnpm check-types && pnpm build && pnpm test`

This is the step that actually derisks the task — a fixture page proves the
schema compiles, a live page proves it matches IGDB:

```bash
docker compose up -d
pnpm --filter worker sync
```

Expected: a successful incremental run in seconds (the mirror plan measured
6.9 s for 10 games), with a `runId` on every line and no validation error. If
IGDB has moved on since the last sync this will pull a real delta through the
new schema, which is exactly the coverage a fixture cannot give.

Then run the nightly contract test against live IGDB, which validates real
payloads against the converted schema and is the guard from spec §7:

```bash
pnpm --filter @repo/igdb test:contract
```

Expected: PASS. If it fails on a field, the cause is the conversion, not IGDB —
compare against `git show HEAD~1:packages/igdb/src/schemas.ts` field by field.

- [ ] **Step 10: Update the README**

In `## What's inside`, change `@repo/igdb`'s description to note valibot rather
than zod if it names the library, and add a line to the `## Tasks` or
architecture notes recording that **validation is valibot throughout, behind
Standard Schema** — one library, and the API's validator, problem-details hook
and schemas all meet at that interface.

- [ ] **Step 11: Commit**

```bash
git add packages/igdb apps/worker README.md pnpm-lock.yaml
git commit -m "refactor: migrate the last zod schemas to valibot"
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

all pass, and against the local stack:

```bash
docker compose up -d
pnpm --filter @repo/db db:migrate
pnpm --filter api dev

curl -i http://localhost:3000/healthz          # 200, security headers, no-store
curl -i http://localhost:3000/readyz           # 200 with both checks up
curl -i http://localhost:3000/api/games/popular # 401 problem+json — no session
docker compose stop valkey
curl -i http://localhost:3000/readyz           # 503 problem+json, valkey down
docker compose start valkey
```

Each of those requests leaves exactly one JSON log line whose `traceId` matches
the `X-Request-Id` in the response — except `/healthz` and `/readyz`, which are
skipped — and `pnpm --filter worker sync` leaves a run's worth of lines sharing
one `runId`.

Two more things must be true at the end, both from Task 13:

```bash
# One validation library. No output from either command.
grep -rn "from \"zod\"" --include="*.ts" apps packages | grep -v node_modules | grep -v dist
grep -rn '"zod"' --include="*.json" apps packages | grep -v node_modules

# Real IGDB payloads still parse through the converted schema.
pnpm --filter worker sync
pnpm --filter @repo/igdb test:contract
```

Plan 3 wires `apps/mobile`: Clerk's Expo SDK, `hc<AppType>` against
`EXPO_PUBLIC_API_URL`, and `@repo/contracts` for client-side body validation and
the status pickers. It starts from a working, authenticated API — which is what
makes the mobile work about screens rather than about protocol. Valibot is the
only validation dependency it inherits, which is the point: `@repo/contracts`
adds a fraction of zod's weight to the Expo bundle.

## Spec coverage

| Spec section                 | Where                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------- |
| §3 no IGDB in the API        | Task 5 manifest, Task 11 invariant test                                         |
| §3 `packages/contracts`      | Task 1                                                                          |
| §8 games routes              | Task 9                                                                          |
| §8 backlog CRUD, stats, ETag | Task 10                                                                         |
| §8 operations routes         | Task 6 (probes), Task 11 (sync status)                                          |
| §8 `/api/hello` removed      | Task 5                                                                          |
| §8 typed RPC preserved       | Task 11 `AppType` assertion, `check-types` on the test config                   |
| §9 search                    | Task 3                                                                          |
| §10 cache keys, versioning   | Task 2 (`withCache`), Task 9 (keys, TTLs, version bump)                         |
| §11 problem details          | Task 5, enforced suite-wide by `callApi`                                        |
| §12 health and readiness     | Task 6                                                                          |
| §13 authentication           | Task 7                                                                          |
| §13 middleware order         | Task 5 → 10, one link at a time, in the spec's order                            |
| §13 headers                  | Task 5                                                                          |
| §13 caching directives       | Task 5 (default), Tasks 9–10 (per route)                                        |
| §13 rate limiting            | Task 8                                                                          |
| §13 body limit, no CORS      | Task 5                                                                          |
| §14 configuration            | Task 5 (`env.ts`, `turbo.json`, `.env.example`)                                 |
| §15 testing                  | every task; the two weight-carrying suites are Tasks 3 and 10                   |
| §7 IGDB field contract       | unchanged from the mirror plan; Task 13 re-runs it against the converted schema |

### Where this plan departs from the spec

**`logger()` from §13 is replaced by `@logtape/hono`'s `honoLogger`.** Hono's
built-in cannot see the request id, and a log line that cannot be joined to a
`traceId` is useless next to a 500 that carries nothing else. The adapter also
carries the id into an implicit context, so the same `traceId` appears on records
written far below the middleware — which is what makes the detail-less 5xx of
§11 a workable rule rather than an inconvenience.

**`requireJson` is an addition to the middleware order**, sitting between the
body limit and `ensureUser`, because Hono's validator turns a wrong media type
into a misleading 422 rather than the 415 the spec's error table requires.

**`/healthz` and `/readyz` are not request-logged.** A liveness probe every few
seconds would bury everything else, and its outcome is already visible to
whoever is probing.

**The worker's `SyncDeps.log` is removed** (Task 12). It was an injected
`(message: string) => void`; LogTape is configured per process and reached with
`getLogger()`, so there is nothing left to inject.

### Where this plan amends spec §11

`hono-problem-details` supplies both the model and the vocabulary, by decision:
its names win over the spec's, so there is one naming scheme in the codebase
rather than a table of overrides. Two parts of §11 are therefore superseded, and
the spec should be updated to match.

**The type slugs and titles are the library's.** Four of the nine differ from the
spec's table:

| Status | Spec §11 slug       | Actual (library)          | Title                  |
| ------ | ------------------- | ------------------------- | ---------------------- |
| 400    | bad-request         | bad-request               | Bad Request            |
| 401    | unauthorized        | unauthorized              | Unauthorized           |
| 404    | not-found           | not-found                 | Not Found              |
| 413    | payload-too-large   | **content-too-large**     | Content Too Large      |
| 415    | unsupported-…       | unsupported-media-type    | Unsupported Media Type |
| 422    | validation-failed   | **unprocessable-content** | Validation Error¹      |
| 429    | rate-limited        | **too-many-requests**     | Too Many Requests      |
| 500    | internal-error      | **internal-server-error** | Internal Server Error  |
| 503    | service-unavailable | service-unavailable       | Service Unavailable    |

¹ The 422's title comes from `zodProblemHook`, not from the status table, and its
`type` is `about:blank` rather than a `barklog.gg` URI.

**The validation error shape is the library's.** `errors[]` entries are
`{field, message}` with a dot-joined path, not the `{pointer, detail}` JSON
Pointer form of the spec's example, and the messages are valibot's wording. The
422 also has no `instance` and no `traceId` in its body; the `X-Request-Id`
header carries the correlation instead, and Task 11 asserts that for every error
including this one.

Two things still had to be built on top of the library, both in Task 5, Step 7:

- **`mapError` strips an `HTTPException`'s message on a 5xx.** Left alone the
  library would copy it into `detail`, and exception messages carry schema names,
  file paths and connection strings. On a 4xx the message is kept, because there
  it is what the client needs.
- **`localize` injects the `traceId`.** The library reads a trace id from
  OpenTelemetry only, and we do not run it.

And one consequence is worth stating plainly, because it is the reason
`middleware/finalize.ts` exists: a problem document is a fresh `Response`, so
headers prepared with `c.header()` — `X-Request-Id` above all — do not survive
onto it. `finalize` re-stamps that one header after the response is built, and
four tests assert it (a 404, a thrown 500, a 422, and a 304).

### The validation stack, and why it is not zod

The API validates with **valibot behind Standard Schema**:
`@hono/standard-validator` 0.2.3 → `hono-problem-details/standard-schema` →
valibot 1.4. That combination was chosen after measuring the alternative, and the
measurements are worth keeping:

|                  | zod 4 + `@hono/zod-validator`         | valibot + `@hono/standard-validator` |
| ---------------- | ------------------------------------- | ------------------------------------ |
| `npm install`    | **refuses** the pair (`ERESOLVE`)     | clean, no warnings                   |
| `pnpm install`   | peer warning                          | clean                                |
| `tsc`            | **fails** — see below                 | clean                                |
| Casts needed     | one, in a wrapper file                | none                                 |
| Wrapper file     | required                              | none; the hook is passed directly    |
| Strict-key error | `field: ""` (key only in the message) | `field: "note"`                      |

The zod failure is not a version-range problem and is not fixed by downgrading:
`zodProblemHook` types its argument as zod 4's `ZodError`, while the validator
hands over the core `$ZodError` — the base class, missing `format`, `flatten` and
`addIssue`. `@hono/zod-validator` 0.7.6, the exact version the library declares
as its peer, fails to compile in the same way. The incompatibility is zod 4
itself.

Standard Schema removes the whole class of problem: `sValidator`'s hook type is
`readonly StandardSchemaV1.Issue[]`, which is precisely what
`standardSchemaProblemHook` consumes, so no library-specific error class appears
in any signature and nothing has to be reconciled. Typed RPC survives it —
`hc<AppType>` still rejects an invalid `status` at compile time.

**zod leaves the repo in Task 13.** It survives Tasks 1–12 in `@repo/igdb` and
`apps/worker`, then those four files convert and the dependency is dropped. The
migration is small — one response schema, one env schema, two call sites — and
its acceptance test is a real incremental sync against live IGDB, which is the
only thing that proves 373,590 rows still parse.

## Execution deviations

Record them here as they are hit, so a re-run of this plan does not rediscover
them.

**Per-package test commands need a build first.** `pnpm --filter <pkg> test`
bypasses turbo's `test → ^build` dependency, so a package importing a
sibling's `dist` fails with module-not-found. Use `pnpm build` first, or
`pnpm turbo run test --filter=<pkg>`. Hit as soon as `packages/db`'s parity
test imported `@repo/contracts`.

**pnpm blocks `@clerk/shared`'s postinstall.** Adding `@hono/clerk-auth`
makes `pnpm install` refuse to proceed until the script is explicitly
allowed or declined. It only prints a telemetry notice and writes a marker
into the user's OS config directory, producing no build artifact — so it is
**declined** (`false`) in `pnpm-workspace.yaml`, matching the existing
`cpu-features`/`ssh2`/`protobufjs` entries rather than the
`esbuild`/`unrs-resolver` ones, which are `true` only because their
postinstall produces the working package.

**4xx are logged at `warning`, not `error`.** The plan's `apiErrorHandler`
logged every non-`ProblemDetailsError` at `error` with a stack, which
includes a client's malformed JSON body (Hono raises `HTTPException(400)`).
That made client mistakes indistinguishable from server bugs and was
client-triggerable. It now branches on status: `error` for 5xx, `warning`
below.

**Rate-limit headers are stamped after `next()`, not before.** The plan's
pre-`next()` `c.header()` calls silently lost every `RateLimit-*` header
whenever a request ended in a problem document, because the renderer builds
a bespoke `Response` and Hono's `set res` only merges prepared headers when
`c.res` was already realized — the same defect `finalize.ts` exists to fix
for `X-Request-Id`. Writing after `next()`, gated on `c.res.status !== 429`,
fixes it and also makes the most-specific scope's numbers win on a pass
while leaving a blocking scope's own headers intact.

**The rate-limit key TTL is derived from the rule.** A hard 120s constant
expires the counter mid-window for any configured window longer than that,
silently disabling enforcement. It is now `rule.windowSeconds * 2`.

**`popularGames` must repeat the partial index's predicate.**
`games_popular_idx` is partial on `total_rating_count > 50`; filtering only
on the rating floor leaves the predicate unimplied, so Postgres cannot use
the index. Measured on the real mirror: 45ms seq scan versus 0.36ms index
scan.

**Test files are type-checked, so `response.json()` needs narrowing.**
`Response.json()` is `Promise<unknown>` under this repo's Node-only types,
so test code reading fields off it needs a narrow `as {...}` cast even
though vitest would run it untyped.

**`/readyz` memoises its verdict for ~1s** (user decision), so an
unauthenticated flood cannot starve the connection pool. The trade is that
the probe reports dependency state as of at most a second ago.

**Test-count prose in the plan is unreliable.** Several tasks state a count
that disagrees with the number of `test(...)` cases in their own code block
(Task 3 said 11 for 10, Task 4 said 12 for 11 across two files, Task 5 said
15 for 14). The code blocks are authoritative.
