# Barklog Premium Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a RevenueCat-backed `premium` subscription that lifts a free-tier cap of 10 unfinished backlog games, enforced server-side.

**Architecture:** `packages/contracts` owns the pure slot arithmetic. `apps/api` owns the product rule and opens a transaction that locks the user row, so check-then-write is atomic; `packages/db` supplies only queries and writes. RevenueCat webhooks keep a `subscriptions` row current, with an on-demand REST pull covering the gap between a purchase completing and its webhook landing. `apps/mobile` reads entitlement from `GET /api/me` and presents RevenueCat's hosted paywall in a dismissible sheet.

**Tech Stack:** TypeScript throughout. Hono + valibot (behind Standard Schema) + `hono-problem-details` on the API; Drizzle + Postgres 18; Expo SDK 57 / RN 0.86 with `react-native-purchases` and `react-native-purchases-ui`; vitest with testcontainers.

**Spec:** `docs/superpowers/specs/2026-09-01-premium-subscription-design.md`

## Global Constraints

- **Branch:** `feat/premium-subscription`, already rebased on `main`. Do not create another.
- **Free tier limit:** `FREE_ACTIVE_SLOTS = 10`. Only `waiting` and `playing` consume a slot.
- **Entitlement identifier:** `barklog_premium`, exactly — as created in RevenueCat. Display name "Barklog Premium". Not `premium`, not `ad_free`.
- **No ad dependencies, ever.** Do not add `react-native-google-mobile-ads`, `expo-build-properties`, or `useFrameworks: "static"`. See spec §11.
- **Sandbox purchases grant the entitlement.** `sandbox` is never an input to `isPremium`. Refusing them fails App Review. See spec §4.
- **Validation is valibot behind Standard Schema.** One library. Never add zod.
- **Problem documents for every error.** Use the `problems` registry in `apps/api/src/problems.ts`; never `c.json({ error })`.
- **`packages/db` holds no product rules.** No limits, no entitlement judgement, no knowledge of what a slot is.
- **`@repo/contracts` is a devDependency of `packages/db`.** Never import it from `packages/db/src/**`.
- **Package versions:** `react-native-purchases@^10.8.1`, `react-native-purchases-ui@^10.8.1`.
- **Verify the HMAC over the raw body bytes.** RevenueCat signs
  `${t}.${rawBody}`; re-serialising a parsed object changes the bytes and fails
  every legitimate request. Read `c.req.text()` before the validator parses.
- **Never ship the Test Store key.** RevenueCat's Test Store simulates purchases
  and reports them as sandbox data; submitting an app configured with its key is
  explicitly prohibited. `env.ts` selects on `__DEV__` so a release build cannot
  reach it — do not move that choice into the provider or a `.env` file.
- **Node `>=24`, pnpm 11.** Run commands from the repo root unless a step says otherwise.
- **Prettier before every commit.** `npx prettier --write <files>`.
- **Comment only what the code cannot say.** The snippets below carry the
  comments this feature needs and no more. Keep a comment when it records a
  _why_ that a later reader would otherwise undo — an ordering guard, a `>=`
  that looks like a typo, a deliberate omission. Delete anything restating the
  signature or narrating the next line, and do not add JSDoc to a function
  whose name and types already say it. If you find yourself explaining _what_
  the code does, the code needs the change, not a comment.

---

### Task 1: Slot arithmetic in `packages/contracts`

**Files:**

- Create: `packages/contracts/src/subscription.ts`
- Modify: `packages/contracts/src/wire.ts` (append `MeResponse`)
- Modify: `packages/contracts/src/index.ts` (add one export line)
- Test: `packages/contracts/test/subscription.test.ts`

**Interfaces:**

- Consumes: `BacklogStatus` from `./backlog.js`.
- Produces: `FREE_ACTIVE_SLOTS: 10`, `SLOT_CONSUMING_STATUSES: readonly ["waiting","playing"]`, `slotDelta(from: BacklogStatus | null, to: BacklogStatus): -1 | 0 | 1`, `SUBSCRIPTION_STORES`, `PERIOD_TYPES`, `type SubscriptionStore`, `type PeriodType`, `interface MeResponse`.

- [ ] **Step 1: Write the failing test**

Create `packages/contracts/test/subscription.test.ts`:

```ts
import { expect, test } from "vitest";

import { FREE_ACTIVE_SLOTS, SLOT_CONSUMING_STATUSES, slotDelta } from "../src/subscription.js";

test("the free tier holds ten unfinished games", () => {
  expect(FREE_ACTIVE_SLOTS).toBe(10);
});

test("only waiting and playing consume a slot", () => {
  expect([...SLOT_CONSUMING_STATUSES]).toEqual(["waiting", "playing"]);
});

test("a new unfinished entry consumes a slot", () => {
  expect(slotDelta(null, "waiting")).toBe(1);
  expect(slotDelta(null, "playing")).toBe(1);
});

test("a new finished entry consumes nothing, so a finished game can always be logged", () => {
  expect(slotDelta(null, "completed")).toBe(0);
  expect(slotDelta(null, "abandoned")).toBe(0);
});

test("reopening a finished game consumes a slot", () => {
  expect(slotDelta("completed", "waiting")).toBe(1);
  expect(slotDelta("abandoned", "playing")).toBe(1);
});

test("finishing a game frees its slot — the whole point of the mechanic", () => {
  expect(slotDelta("waiting", "completed")).toBe(-1);
  expect(slotDelta("playing", "abandoned")).toBe(-1);
});

test("moving between two unfinished statuses is free", () => {
  expect(slotDelta("waiting", "playing")).toBe(0);
  expect(slotDelta("playing", "waiting")).toBe(0);
});

test("moving between two finished statuses is free", () => {
  expect(slotDelta("completed", "abandoned")).toBe(0);
});

test("a rating-only change cannot consume a slot", () => {
  for (const status of ["waiting", "playing", "completed", "abandoned"] as const) {
    expect(slotDelta(status, status)).toBe(0);
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @repo/contracts test
```

Expected: FAIL — `Cannot find module '../src/subscription.js'`.

- [ ] **Step 3: Write the implementation**

Create `packages/contracts/src/subscription.ts`:

```ts
import type { BacklogStatus } from "./backlog.js";

/** Unfinished games only — completing or abandoning one returns its slot. */
export const FREE_ACTIVE_SLOTS = 10;

export const SLOT_CONSUMING_STATUSES = ["waiting", "playing"] as const;

export type SlotConsumingStatus = (typeof SLOT_CONSUMING_STATUSES)[number];

function consumesSlot(status: BacklogStatus | null): boolean {
  return status !== null && (SLOT_CONSUMING_STATUSES as readonly string[]).includes(status);
}

/**
 * The cap applies to this, never to the total: finishing a game must succeed at
 * 10/10, and reopening one must not. `from` is null for a game not yet added.
 */
export function slotDelta(from: BacklogStatus | null, to: BacklogStatus): -1 | 0 | 1 {
  const before = consumesSlot(from);
  const after = consumesSlot(to);

  if (before === after) return 0;

  return after ? 1 : -1;
}

/** Duplicated in the db schema, where `pgEnum` needs the values. See status-parity. */
export const SUBSCRIPTION_STORES = ["app_store", "play_store", "stripe", "promotional"] as const;
export type SubscriptionStore = (typeof SUBSCRIPTION_STORES)[number];

export const PERIOD_TYPES = ["normal", "trial", "intro", "promotional"] as const;
export type PeriodType = (typeof PERIOD_TYPES)[number];
```

- [ ] **Step 4: Add `MeResponse` to the wire contract**

Append to `packages/contracts/src/wire.ts`:

```ts
export interface EntitlementWire {
  productId: string;
  store: SubscriptionStore;
  periodType: PeriodType;
  expiresAt: string | null;
  willRenew: boolean;
}

export interface MeResponse {
  premium: boolean;
  entitlement: EntitlementWire | null;
}
```

And add to the imports at the top of `wire.ts`, beside the existing `BacklogStatus` import:

```ts
import type { PeriodType, SubscriptionStore } from "./subscription.js";
```

- [ ] **Step 5: Export the new module**

In `packages/contracts/src/index.ts`, add one line, keeping the list alphabetical:

```ts
export * from "./subscription.js";
```

- [ ] **Step 6: Run the tests and type-check**

```bash
pnpm --filter @repo/contracts test
pnpm --filter @repo/contracts check-types
```

Expected: all tests PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
npx prettier --write packages/contracts/src packages/contracts/test
git add packages/contracts
git commit -m "feat(contracts): slot arithmetic for the free-tier cap

slotDelta answers how a status transition moves the active count, which
is what the cap applies to. Applying it to the total instead would block
finishing a game at 10/10 and allow reopening one, both backwards.

SUBSCRIPTION_STORES and PERIOD_TYPES are duplicated from the db schema
under the arrangement BACKLOG_STATUSES already uses: pgEnum needs the
values there, the wire types need the union here, and status-parity
keeps them honest."
```

---

### Task 2: Let `packages/db` queries run inside a transaction

**Files:**

- Modify: `packages/db/src/client.ts` (add the `Queryable` type)
- Modify: `packages/db/src/queries/backlog.ts` (widen `Db` → `Queryable`)
- Modify: `packages/db/src/queries/games.ts` (same)
- Modify: `packages/db/src/queries/sync-runs.ts` (same)
- Modify: `packages/db/src/index.ts` (export `Queryable`)

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `export type Queryable` from `@repo/db`. Every exported query function accepts it in place of the old `Db`.

This is a mechanical change with no behaviour and no new tests. It exists so Task 5 can open a transaction in the API and pass the handle to db functions.

- [ ] **Step 1: Add the `Queryable` type**

In `packages/db/src/client.ts`, after the `Database` interface:

```ts
/**
 * A `NodePgDatabase` or a transaction handle, so callers can compose queries
 * into one transaction. Derived from drizzle's own signature rather than naming
 * `PgTransaction`'s generics, which move between minor versions.
 */
export type Queryable =
  | NodePgDatabase<typeof schema>
  | Parameters<Parameters<NodePgDatabase<typeof schema>["transaction"]>[0]>[0];
```

- [ ] **Step 2: Widen the query modules**

In each of `packages/db/src/queries/backlog.ts`, `games.ts`, and `sync-runs.ts`, delete the local

```ts
type Db = NodePgDatabase<typeof schema>;
```

and replace it with an import:

```ts
import type { Queryable } from "../client.js";
```

Then replace every `db: Db` parameter with `db: Queryable`. Remove the now-unused `NodePgDatabase` and `schema` imports where nothing else uses them.

- [ ] **Step 3: Export it**

In `packages/db/src/index.ts`, change the client export line to:

```ts
export { createDb, type Database, type Queryable } from "./client.js";
```

- [ ] **Step 4: Verify nothing broke**

```bash
pnpm --filter @repo/db check-types
pnpm --filter @repo/db test
pnpm --filter api check-types
```

Expected: no type errors, all existing db tests PASS. If `apps/api` fails to type-check, a call site was passing something no longer accepted — fix the call site, not the type.

- [ ] **Step 5: Commit**

```bash
npx prettier --write packages/db/src
git add packages/db
git commit -m "refactor(db): queries accept a transaction handle

Widens every query's first parameter from NodePgDatabase to a Queryable
that also admits the handle db.transaction() passes its callback, so a
caller can compose several queries into one transaction.

The API needs that for the free-tier cap: counting active entries and
upserting must be atomic, and the count is a product rule that does not
belong in this package. Derived from drizzle's own transaction signature
rather than naming PgTransaction's generics, which move between minors.

No behaviour change."
```

---

### Task 3: The `subscriptions` and `subscription_events` tables

**Files:**

- Create: `packages/db/src/schema/subscriptions.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/src/testing.ts` (add both tables to `truncateAll`)
- Modify: `packages/db/test/status-parity.test.ts`
- Create: `packages/db/drizzle/0005_*.sql` (generated, do not hand-write)

**Interfaces:**

- Consumes: `users` from `./backlog.js`.
- Produces: `subscriptions` and `subscriptionEvents` tables; `SUBSCRIPTION_STORES`, `PERIOD_TYPES` value arrays; `subscriptionStore` / `periodType` pgEnums.

- [ ] **Step 1: Write the failing parity test**

Append to `packages/db/test/status-parity.test.ts`:

```ts
test("the contract store union matches the database enum, in order", () => {
  expect([...SUBSCRIPTION_STORES]).toEqual([...CONTRACT_STORES]);
});

test("the contract period-type union matches the database enum, in order", () => {
  expect([...PERIOD_TYPES]).toEqual([...CONTRACT_PERIODS]);
});
```

Extend the two import blocks at the top of that file:

```ts
import {
  BACKLOG_SORTS as CONTRACT_SORTS,
  BACKLOG_STATUSES as CONTRACT_STATUSES,
  PERIOD_TYPES as CONTRACT_PERIODS,
  SUBSCRIPTION_STORES as CONTRACT_STORES,
} from "@repo/contracts";
```

```ts
import { PERIOD_TYPES, SUBSCRIPTION_STORES } from "../src/schema/subscriptions.js";
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter @repo/db test -- status-parity
```

Expected: FAIL — `Cannot find module '../src/schema/subscriptions.js'`.

- [ ] **Step 3: Write the schema**

Create `packages/db/src/schema/subscriptions.ts`:

```ts
import { bigint, boolean, jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { users } from "./backlog.js";

/** Duplicated in `packages/contracts` — see the parity test. */
export const SUBSCRIPTION_STORES = ["app_store", "play_store", "stripe", "promotional"] as const;
export type SubscriptionStoreValue = (typeof SUBSCRIPTION_STORES)[number];

export const PERIOD_TYPES = ["normal", "trial", "intro", "promotional"] as const;
export type PeriodTypeValue = (typeof PERIOD_TYPES)[number];

export const subscriptionStore = pgEnum("subscription_store", SUBSCRIPTION_STORES);
export const periodType = pgEnum("subscription_period_type", PERIOD_TYPES);

export const subscriptions = pgTable("subscriptions", {
  // The Clerk `sub`, which is also the RevenueCat App User ID — so no mapping.
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull(),
  store: subscriptionStore("store").notNull(),
  periodType: periodType("period_type").notNull(),
  purchasedAt: timestamp("purchased_at", { withTimezone: true }).notNull(),
  // null is a lifetime entitlement, not an unknown expiry.
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  willRenew: boolean("will_renew").notNull(),
  // Never an input to entitlement — see isPremium. It exists so revenue
  // queries can filter our own device testing out.
  sandbox: boolean("sandbox").notNull(),
  // Ordering guard: RevenueCat retries and can deliver out of order, so a
  // retried INITIAL_PURCHASE after a CANCELLATION must not resurrect the row.
  lastEventAtMs: bigint("last_event_at_ms", { mode: "number" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const subscriptionEvents = pgTable("subscription_events", {
  // The RevenueCat event id, so ON CONFLICT DO NOTHING is the idempotency check.
  id: text("id").primaryKey(),
  // Not a foreign key: an event for an unknown or deleted user is worth logging.
  userId: text("user_id").notNull(),
  type: text("type").notNull(),
  payload: jsonb("payload").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 4: Export it from the schema barrel**

Append to `packages/db/src/schema/index.ts`:

```ts
export * from "./subscriptions.js";
```

- [ ] **Step 5: Add both tables to `truncateAll`**

In `packages/db/src/testing.ts`, extend the `TRUNCATE TABLE` list. Order matters only for readability — `CASCADE` handles the dependencies:

```ts
await db.execute(sql`
    TRUNCATE TABLE
      sync_runs,
      subscription_events, subscriptions,
      backlog_entries, users,
      game_companies, game_platforms, game_genres, game_screenshots, game_similar,
      games, companies, platforms, genres, game_types
    RESTART IDENTITY CASCADE
  `);
```

Forgetting this leaks subscription rows between tests, and a leaked premium row makes every cap test pass for the wrong reason.

- [ ] **Step 6: Generate the migration**

```bash
pnpm --filter @repo/db db:generate
```

This needs `DATABASE_URL` in the root `.env` and reads `src/schema/index.ts`. Inspect the generated `packages/db/drizzle/0005_*.sql`: it must contain two `CREATE TYPE` statements and two `CREATE TABLE` statements, and must not touch `backlog_entries`, `games`, or any mirror table. If it tries to drop or alter anything, stop — the schema barrel export is wrong.

- [ ] **Step 7: Run the tests**

```bash
pnpm --filter @repo/db test
```

Expected: PASS, including both new parity tests. The migration runs against a fresh testcontainer in `startPostgres`, so a broken migration fails here.

- [ ] **Step 8: Commit**

```bash
npx prettier --write packages/db/src packages/db/test
git add packages/db
git commit -m "feat(db): subscriptions and subscription_events

subscriptions holds current state, one row per user. Entitlement is
derived from expires_at rather than stored, because a boolean goes stale
the moment a subscription lapses without a webhook arriving.

last_event_at_ms guards ordering: RevenueCat retries and can deliver out
of order, so without it a retried INITIAL_PURCHASE landing after a
CANCELLATION resurrects a dead subscription.

subscription_events is append-only and keyed by the RevenueCat event id,
which makes ON CONFLICT DO NOTHING the idempotency check. Its user_id is
deliberately not a foreign key so an event for an unknown or deleted
user is logged rather than rejected.

sandbox is recorded but never gates entitlement — App Review purchases
run in Apple's sandbox against the production build. The column is for
filtering our own testing out of revenue queries.

Both tables join truncateAll: a leaked premium row would make every cap
test pass for the wrong reason."
```

---

### Task 4: Database queries the cap and the webhook need

**Files:**

- Create: `packages/db/src/queries/subscriptions.ts`
- Modify: `packages/db/src/queries/backlog.ts` (add two functions)
- Modify: `packages/db/src/index.ts` (export the new query module)
- Test: `packages/db/test/subscriptions-queries.test.ts`
- Test: `packages/db/test/backlog-queries.test.ts` (append cases)

**Interfaces:**

- Consumes: `Queryable` (Task 2); `subscriptions`, `subscriptionEvents` (Task 3).
- Produces:
  - `lockUser(db: Queryable, userId: string): Promise<void>`
  - `countBacklogEntriesByStatus(db: Queryable, userId: string, statuses: readonly BacklogStatusValue[]): Promise<number>`
  - `getSubscription(db: Queryable, userId: string): Promise<SubscriptionRow | null>`
  - `recordSubscriptionEvent(db: Queryable, event: {...}): Promise<boolean>` — false when the id was already present
  - `upsertSubscription(db: Queryable, row: {...}): Promise<void>`
  - `interface SubscriptionRow`

- [ ] **Step 1: Write the failing tests for the backlog helpers**

Append to `packages/db/test/backlog-queries.test.ts`. That file already defines `USER = "user_2abcDEF"`, `OTHER = "user_2xyzGHI"`, a `seedGames()` covering ids 1–3, and a `beforeEach` that truncates and seeds — reuse all of it. Add `countBacklogEntriesByStatus` and `lockUser` to its existing `../src/queries/backlog.js` import:

```ts
test("countBacklogEntriesByStatus counts only the statuses it is given", async () => {
  await upsertBacklogEntry(db, { userId: USER, gameId: 1, status: "waiting", rating: null });
  await upsertBacklogEntry(db, { userId: USER, gameId: 2, status: "playing", rating: null });
  await upsertBacklogEntry(db, { userId: USER, gameId: 3, status: "completed", rating: null });

  expect(await countBacklogEntriesByStatus(db, USER, ["waiting", "playing"])).toBe(2);
  expect(await countBacklogEntriesByStatus(db, USER, ["completed"])).toBe(1);
  expect(await countBacklogEntriesByStatus(db, USER, ["abandoned"])).toBe(0);
});

test("countBacklogEntriesByStatus counts one user's entries only", async () => {
  await upsertBacklogEntry(db, { userId: USER, gameId: 1, status: "waiting", rating: null });
  await upsertBacklogEntry(db, { userId: OTHER, gameId: 2, status: "waiting", rating: null });

  expect(await countBacklogEntriesByStatus(db, USER, ["waiting", "playing"])).toBe(1);
});

test("an empty status list counts nothing rather than everything", async () => {
  await upsertBacklogEntry(db, { userId: USER, gameId: 1, status: "waiting", rating: null });

  expect(await countBacklogEntriesByStatus(db, USER, [])).toBe(0);
});

test("lockUser serialises two transactions on the same user", async () => {
  const order: string[] = [];

  const first = db.transaction(async (tx) => {
    await lockUser(tx, USER);
    order.push("first-locked");
    await new Promise((resolve) => setTimeout(resolve, 150));
    order.push("first-releasing");
  });

  // A beat, so the first transaction certainly holds the lock.
  await new Promise((resolve) => setTimeout(resolve, 30));

  const second = db.transaction(async (tx) => {
    await lockUser(tx, USER);
    order.push("second-locked");
  });

  await Promise.all([first, second]);

  expect(order).toEqual(["first-locked", "first-releasing", "second-locked"]);
});
```

These tests need only games 1–3, which `seedGames()` already provides.

- [ ] **Step 2: Run them to verify they fail**

```bash
pnpm --filter @repo/db test -- backlog-queries
```

Expected: FAIL — `countBacklogEntriesByStatus is not a function`.

- [ ] **Step 3: Implement the two backlog helpers**

Append to `packages/db/src/queries/backlog.ts`:

```ts
/**
 * Serialises one user's backlog writes for the rest of the transaction. Without
 * it, two concurrent adds at 9/10 both read 9 and both succeed.
 */
export async function lockUser(db: Queryable, userId: string): Promise<void> {
  await db.execute(sql`SELECT 1 FROM ${users} WHERE ${users.id} = ${userId} FOR UPDATE`);
}

export async function countBacklogEntriesByStatus(
  db: Queryable,
  userId: string,
  statuses: readonly BacklogStatusValue[],
): Promise<number> {
  // Explicit, not incidental: a silent "everything" here would uncap the free tier.
  if (statuses.length === 0) return 0;

  const rows = await db
    .select({ total: count() })
    .from(backlogEntries)
    .where(and(eq(backlogEntries.userId, userId), inArray(backlogEntries.status, [...statuses])));

  return rows[0]?.total ?? 0;
}
```

Add `inArray` to the `drizzle-orm` import at the top of the file.

- [ ] **Step 4: Run the backlog tests**

```bash
pnpm --filter @repo/db test -- backlog-queries
```

Expected: PASS, including the lock-ordering test.

- [ ] **Step 5: Write the failing subscription-query tests**

Create `packages/db/test/subscriptions-queries.test.ts`:

```ts
import { afterAll, beforeEach, expect, test } from "vitest";
import { inject } from "vitest";

import { createDb } from "../src/client.js";
import { ensureUser } from "../src/queries/backlog.js";
import {
  getSubscription,
  recordSubscriptionEvent,
  upsertSubscription,
} from "../src/queries/subscriptions.js";
import { truncateAll } from "../src/testing.js";

const USER = "user_2testAAA";

const { db, close } = createDb(inject("databaseUrl"));

const row = (overrides: Partial<Parameters<typeof upsertSubscription>[1]> = {}) => ({
  userId: USER,
  productId: "gg.barklog.app.premium.yearly",
  store: "app_store" as const,
  periodType: "trial" as const,
  purchasedAt: new Date("2026-09-01T00:00:00Z"),
  expiresAt: new Date("2026-09-08T00:00:00Z"),
  willRenew: true,
  sandbox: false,
  lastEventAtMs: 1_000,
  ...overrides,
});

beforeEach(async () => {
  await truncateAll(db);
  await ensureUser(db, USER);
});

afterAll(async () => {
  await close();
});

test("getSubscription returns null before anything is recorded", async () => {
  expect(await getSubscription(db, USER)).toBeNull();
});

test("upsertSubscription inserts, then replaces on a later event", async () => {
  await upsertSubscription(db, row());
  await upsertSubscription(db, row({ periodType: "normal", lastEventAtMs: 2_000 }));

  const stored = await getSubscription(db, USER);
  expect(stored).toMatchObject({ periodType: "normal", lastEventAtMs: 2_000 });
});

test("a stale event does not overwrite a newer row", async () => {
  await upsertSubscription(db, row({ periodType: "normal", lastEventAtMs: 2_000 }));
  await upsertSubscription(db, row({ periodType: "trial", lastEventAtMs: 1_000 }));

  const stored = await getSubscription(db, USER);
  expect(stored).toMatchObject({ periodType: "normal", lastEventAtMs: 2_000 });
});

test("an event at exactly the stored timestamp still applies, so a redelivery is not lost", async () => {
  await upsertSubscription(db, row({ willRenew: true, lastEventAtMs: 2_000 }));
  await upsertSubscription(db, row({ willRenew: false, lastEventAtMs: 2_000 }));

  expect(await getSubscription(db, USER)).toMatchObject({ willRenew: false });
});

test("getSubscription returns expired and sandbox rows verbatim — judging is not its job", async () => {
  await upsertSubscription(db, row({ expiresAt: new Date("2020-01-01T00:00:00Z"), sandbox: true }));

  const stored = await getSubscription(db, USER);
  expect(stored).toMatchObject({ sandbox: true });
  expect(stored?.expiresAt?.getFullYear()).toBe(2020);
});

test("a null expiresAt round-trips as lifetime rather than becoming a date", async () => {
  await upsertSubscription(db, row({ expiresAt: null }));

  expect(await getSubscription(db, USER)).toMatchObject({ expiresAt: null });
});

test("recordSubscriptionEvent is idempotent on the RevenueCat event id", async () => {
  const event = {
    id: "rc_event_1",
    userId: USER,
    type: "INITIAL_PURCHASE",
    payload: { id: "rc_event_1" },
  };

  expect(await recordSubscriptionEvent(db, event)).toBe(true);
  expect(await recordSubscriptionEvent(db, event)).toBe(false);
});

test("an event for an unknown user is logged, because the column is not a foreign key", async () => {
  const recorded = await recordSubscriptionEvent(db, {
    id: "rc_event_2",
    userId: "user_never_seen",
    type: "INITIAL_PURCHASE",
    payload: {},
  });

  expect(recorded).toBe(true);
});
```

- [ ] **Step 6: Run them to verify they fail**

```bash
pnpm --filter @repo/db test -- subscriptions-queries
```

Expected: FAIL — `Cannot find module '../src/queries/subscriptions.js'`.

- [ ] **Step 7: Implement the subscription queries**

Create `packages/db/src/queries/subscriptions.ts`:

```ts
import { eq, sql } from "drizzle-orm";

import type { Queryable } from "../client.js";
import {
  subscriptionEvents,
  subscriptions,
  type PeriodTypeValue,
  type SubscriptionStoreValue,
} from "../schema/subscriptions.js";

export interface SubscriptionRow {
  userId: string;
  productId: string;
  store: SubscriptionStoreValue;
  periodType: PeriodTypeValue;
  purchasedAt: Date;
  expiresAt: Date | null;
  willRenew: boolean;
  sandbox: boolean;
  lastEventAtMs: number;
}

/** Verbatim, expired and sandbox rows included — judging it belongs in apps/api. */
export async function getSubscription(
  db: Queryable,
  userId: string,
): Promise<SubscriptionRow | null> {
  const rows = await db
    .select({
      userId: subscriptions.userId,
      productId: subscriptions.productId,
      store: subscriptions.store,
      periodType: subscriptions.periodType,
      purchasedAt: subscriptions.purchasedAt,
      expiresAt: subscriptions.expiresAt,
      willRenew: subscriptions.willRenew,
      sandbox: subscriptions.sandbox,
      lastEventAtMs: subscriptions.lastEventAtMs,
    })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Refuses to apply behind a newer event. `>=`, not `>`: a redelivery of the
 * newest event must still apply, since a partial write looks like none.
 */
export async function upsertSubscription(db: Queryable, row: SubscriptionRow): Promise<void> {
  await db
    .insert(subscriptions)
    .values({ ...row, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: subscriptions.userId,
      set: {
        productId: row.productId,
        store: row.store,
        periodType: row.periodType,
        purchasedAt: row.purchasedAt,
        expiresAt: row.expiresAt,
        willRenew: row.willRenew,
        sandbox: row.sandbox,
        lastEventAtMs: row.lastEventAtMs,
        updatedAt: new Date(),
      },
      where: sql`${subscriptions.lastEventAtMs} <= ${row.lastEventAtMs}`,
    });
}

/** False when the event id was already stored — the webhook's idempotency check. */
export async function recordSubscriptionEvent(
  db: Queryable,
  event: { id: string; userId: string; type: string; payload: unknown },
): Promise<boolean> {
  const inserted = await db
    .insert(subscriptionEvents)
    .values({
      id: event.id,
      userId: event.userId,
      type: event.type,
      payload: event.payload as Record<string, unknown>,
    })
    .onConflictDoNothing({ target: subscriptionEvents.id })
    .returning({ id: subscriptionEvents.id });

  return inserted.length > 0;
}
```

- [ ] **Step 8: Export the module**

Append to `packages/db/src/index.ts`, keeping the query exports together:

```ts
export * from "./queries/subscriptions.js";
```

- [ ] **Step 9: Run the whole db suite**

```bash
pnpm --filter @repo/db test
pnpm --filter @repo/db check-types
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
npx prettier --write packages/db/src packages/db/test
git add packages/db
git commit -m "feat(db): subscription queries, plus lockUser and a status count

getSubscription returns the row verbatim — expired and sandbox rows
included — because whether it grants anything is a product decision that
belongs in apps/api.

upsertSubscription refuses to apply behind a newer event, using >= so a
redelivery of the newest event still applies; a partially-applied write
is indistinguishable from none. recordSubscriptionEvent returns false on
a duplicate id, which is the webhook's whole idempotency story.

lockUser takes a row lock for the rest of the transaction so one user's
backlog writes serialise. countBacklogEntriesByStatus takes the statuses
from its caller and returns 0 for an empty list — inArray would generate
false anyway, but a silent 'everything' there would uncap the free tier."
```

---

### Task 5: Enforce the cap in the API

**Files:**

- Create: `apps/api/src/entitlement.ts`
- Modify: `apps/api/src/problems.ts` (add `SUBSCRIPTION_REQUIRED`)
- Modify: `apps/api/src/routes/backlog.ts` (the `PUT` handler)
- Modify: `apps/api/test/invariants.test.ts` (the type-URI list)
- Test: `apps/api/test/entitlement.test.ts`
- Test: `apps/api/test/backlog-cap.test.ts`

**Interfaces:**

- Consumes: `slotDelta`, `FREE_ACTIVE_SLOTS`, `SLOT_CONSUMING_STATUSES` (Task 1); `lockUser`, `countBacklogEntriesByStatus`, `getSubscription`, `type SubscriptionRow` (Task 4); `Queryable` (Task 2).
- Produces: `isPremium(row: SubscriptionRow | null, now: Date): boolean`; a 402 problem carrying `activeCount` and `limit` extensions.

- [ ] **Step 1: Write the failing entitlement test**

Create `apps/api/test/entitlement.test.ts`:

```ts
import type { SubscriptionRow } from "@repo/db";
import { expect, test } from "vitest";

import { isPremium } from "../src/entitlement.js";

const NOW = new Date("2026-09-05T00:00:00Z");

const row = (overrides: Partial<SubscriptionRow> = {}): SubscriptionRow => ({
  userId: "user_2testAAA",
  productId: "gg.barklog.app.premium.yearly",
  store: "app_store",
  periodType: "trial",
  purchasedAt: new Date("2026-09-01T00:00:00Z"),
  expiresAt: new Date("2026-09-08T00:00:00Z"),
  willRenew: true,
  sandbox: false,
  lastEventAtMs: 1_000,
  ...overrides,
});

test("no row is not premium", () => {
  expect(isPremium(null, NOW)).toBe(false);
});

test("an unexpired row is premium", () => {
  expect(isPremium(row(), NOW)).toBe(true);
});

test("an expired row is not premium, with no webhook needed to say so", () => {
  expect(isPremium(row({ expiresAt: new Date("2026-09-04T00:00:00Z") }), NOW)).toBe(false);
});

test("a null expiresAt is a lifetime entitlement", () => {
  expect(isPremium(row({ expiresAt: null }), NOW)).toBe(true);
});

test("expiry exactly now has lapsed", () => {
  expect(isPremium(row({ expiresAt: NOW }), NOW)).toBe(false);
});

test("a sandbox purchase grants premium — App Review buys in the sandbox", () => {
  expect(isPremium(row({ sandbox: true }), NOW)).toBe(true);
});

test("a cancelled but unexpired subscription is still premium until it lapses", () => {
  expect(isPremium(row({ willRenew: false }), NOW)).toBe(true);
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter api test -- entitlement
```

Expected: FAIL — `Cannot find module '../src/entitlement.js'`.

- [ ] **Step 3: Implement `isPremium`**

Create `apps/api/src/entitlement.ts`:

```ts
import type { SubscriptionRow } from "@repo/db";

/**
 * `sandbox` is deliberately absent: App Review buys in Apple's sandbox against
 * the production build, so refusing those entitlements shows a reviewer a
 * completed purchase and an unchanged paywall — a documented rejection.
 */
export function isPremium(row: SubscriptionRow | null, now: Date): boolean {
  if (row === null) return false;

  return row.expiresAt === null || row.expiresAt > now;
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
pnpm --filter api test -- entitlement
```

Expected: PASS.

- [ ] **Step 5: Write the failing cap tests**

Create `apps/api/test/backlog-cap.test.ts`:

```ts
import { FREE_ACTIVE_SLOTS } from "@repo/contracts";
import { upsertSubscription } from "@repo/db";
import { afterAll, beforeEach, expect, test } from "vitest";

import { callApi, createTestApp, seedGame, TEST_USER } from "./helpers.js";

const harness = createTestApp();

const put = (body: unknown): RequestInit => ({
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const GAME_COUNT = FREE_ACTIVE_SLOTS + 2;

async function grantPremium(): Promise<void> {
  await upsertSubscription(harness.db, {
    userId: TEST_USER,
    productId: "gg.barklog.app.premium.yearly",
    store: "app_store",
    periodType: "normal",
    purchasedAt: new Date("2026-09-01T00:00:00Z"),
    expiresAt: new Date("2027-09-01T00:00:00Z"),
    willRenew: true,
    sandbox: false,
    lastEventAtMs: 1_000,
  });
}

async function fillSlots(): Promise<void> {
  for (let id = 1; id <= FREE_ACTIVE_SLOTS; id++) {
    const response = await callApi(harness.app, `/api/backlog/${id}`, put({ status: "waiting" }));
    expect(response.status, `filling slot ${id}`).toBe(201);
  }
}

beforeEach(async () => {
  await harness.reset();
  for (let id = 1; id <= GAME_COUNT; id++) {
    await seedGame(harness.db, { id, name: `Game ${id}`, count: 100 });
  }
});

afterAll(async () => {
  await harness.close();
});

test("a free user fills every slot, and the next unfinished add is 402", async () => {
  await fillSlots();

  const blocked = await callApi(
    harness.app,
    `/api/backlog/${FREE_ACTIVE_SLOTS + 1}`,
    put({ status: "waiting" }),
  );

  expect(blocked.status).toBe(402);
  expect(await blocked.json()).toMatchObject({
    type: "https://barklog.gg/problems/payment-required",
    activeCount: FREE_ACTIVE_SLOTS,
    limit: FREE_ACTIVE_SLOTS,
  });
});

test("a blocked add writes nothing", async () => {
  await fillSlots();
  await callApi(harness.app, `/api/backlog/${FREE_ACTIVE_SLOTS + 1}`, put({ status: "waiting" }));

  const list = await callApi(harness.app, "/api/backlog");
  const body = (await list.json()) as { items: unknown[] };
  expect(body.items).toHaveLength(FREE_ACTIVE_SLOTS);
});

test("finishing a game frees a slot, so the blocked add then succeeds", async () => {
  await fillSlots();

  const finished = await callApi(harness.app, "/api/backlog/1", put({ status: "completed" }));
  expect(finished.status).toBe(200);

  const retried = await callApi(
    harness.app,
    `/api/backlog/${FREE_ACTIVE_SLOTS + 1}`,
    put({ status: "waiting" }),
  );
  expect(retried.status).toBe(201);
});

test("a full free tier can still finish a game — the cap must never trap a user", async () => {
  await fillSlots();

  const response = await callApi(harness.app, "/api/backlog/2", put({ status: "abandoned" }));
  expect(response.status).toBe(200);
});

test("a full free tier can still move between two unfinished statuses", async () => {
  await fillSlots();

  const response = await callApi(harness.app, "/api/backlog/3", put({ status: "playing" }));
  expect(response.status).toBe(200);
});

test("a full free tier can still change a rating", async () => {
  await fillSlots();

  const response = await callApi(
    harness.app,
    "/api/backlog/4",
    put({ status: "waiting", rating: 8 }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ rating: 8 });
});

test("reopening a finished game is blocked when the slots are full", async () => {
  await fillSlots();
  await callApi(harness.app, "/api/backlog/1", put({ status: "completed" }));
  await callApi(harness.app, `/api/backlog/${FREE_ACTIVE_SLOTS + 1}`, put({ status: "waiting" }));

  const reopened = await callApi(harness.app, "/api/backlog/1", put({ status: "playing" }));
  expect(reopened.status).toBe(402);
});

test("a finished game can always be logged, even with the slots full", async () => {
  await fillSlots();

  const response = await callApi(
    harness.app,
    `/api/backlog/${FREE_ACTIVE_SLOTS + 1}`,
    put({ status: "completed", rating: 10 }),
  );
  expect(response.status).toBe(201);
});

test("a premium user is never blocked", async () => {
  await fillSlots();
  await grantPremium();

  const response = await callApi(
    harness.app,
    `/api/backlog/${FREE_ACTIVE_SLOTS + 1}`,
    put({ status: "waiting" }),
  );
  expect(response.status).toBe(201);
});

test("an expired subscription is back to the free tier", async () => {
  await upsertSubscription(harness.db, {
    userId: TEST_USER,
    productId: "gg.barklog.app.premium.monthly",
    store: "app_store",
    periodType: "normal",
    purchasedAt: new Date("2026-07-01T00:00:00Z"),
    expiresAt: new Date("2026-08-01T00:00:00Z"),
    willRenew: false,
    sandbox: false,
    lastEventAtMs: 1_000,
  });
  await fillSlots();

  const response = await callApi(
    harness.app,
    `/api/backlog/${FREE_ACTIVE_SLOTS + 1}`,
    put({ status: "waiting" }),
  );
  expect(response.status).toBe(402);
});

test("the cap counts one user's entries only", async () => {
  await fillSlots();

  const other = await callApi(harness.app, `/api/backlog/${FREE_ACTIVE_SLOTS + 1}`, {
    ...put({ status: "waiting" }),
    user: "user_2testBBB",
  });
  expect(other.status).toBe(201);
});

test("two concurrent adds at the boundary cannot both win", async () => {
  for (let id = 1; id < FREE_ACTIVE_SLOTS; id++) {
    await callApi(harness.app, `/api/backlog/${id}`, put({ status: "waiting" }));
  }

  // One slot, two racers. Without lockUser both read the same count and commit.
  const [first, second] = await Promise.all([
    callApi(harness.app, `/api/backlog/${FREE_ACTIVE_SLOTS}`, put({ status: "waiting" })),
    callApi(harness.app, `/api/backlog/${FREE_ACTIVE_SLOTS + 1}`, put({ status: "waiting" })),
  ]);

  const statuses = [first.status, second.status].sort();
  expect(statuses).toEqual([201, 402]);

  const list = await callApi(harness.app, "/api/backlog");
  const body = (await list.json()) as { items: unknown[] };
  expect(body.items).toHaveLength(FREE_ACTIVE_SLOTS);
});
```

- [ ] **Step 6: Run them to verify they fail**

```bash
pnpm --filter api test -- backlog-cap
```

Expected: FAIL — the adds past the cap return 201, and `problems.create("SUBSCRIPTION_REQUIRED")` does not exist yet.

- [ ] **Step 7: Add the problem type**

In `apps/api/src/problems.ts`, add one entry to the registry, after `NOT_FOUND`:

```ts
  SUBSCRIPTION_REQUIRED: definition(402),
```

The library's phrase table has `402: "Payment Required"`, so `definition(402)` resolves to the slug `payment-required` with no extra work.

- [ ] **Step 8: Update the type-URI invariant**

`apps/api/test/invariants.test.ts` asserts the registry's exact URI list in order. Add the new URI in the same position the registry entry occupies:

```ts
    "https://barklog.gg/problems/unauthorized",
    "https://barklog.gg/problems/not-found",
    "https://barklog.gg/problems/payment-required",
    "https://barklog.gg/problems/content-too-large",
```

- [ ] **Step 9: Enforce the cap in the route**

In `apps/api/src/routes/backlog.ts`, replace the body of the `.put("/:gameId", …)` handler after the `gameExists` check:

```ts
const outcome = await deps.db.transaction(async (tx) => {
  await lockUser(tx, c.get("userId"));

  const existing = await getBacklogEntry(tx, c.get("userId"), gameId);
  const delta = slotDelta(existing?.status ?? null, status);

  // Only a slot-consuming transition can be blocked, so finishing or
  // re-rating a game costs no extra queries.
  if (delta > 0) {
    const subscription = await getSubscription(tx, c.get("userId"));

    if (!isPremium(subscription, new Date())) {
      const activeCount = await countBacklogEntriesByStatus(
        tx,
        c.get("userId"),
        SLOT_CONSUMING_STATUSES,
      );

      if (activeCount + delta > FREE_ACTIVE_SLOTS) {
        return { blocked: true as const, activeCount };
      }
    }
  }

  const { entry, created } = await upsertBacklogEntry(tx, {
    userId: c.get("userId"),
    gameId,
    status,
    rating: rating ?? null,
  });

  return { blocked: false as const, entry, created };
});

if (outcome.blocked) {
  throw problems.create("SUBSCRIPTION_REQUIRED", {
    detail: `A free backlog holds ${FREE_ACTIVE_SLOTS} unfinished games. Finish one to free a spot, or subscribe for unlimited.`,
    extensions: { activeCount: outcome.activeCount, limit: FREE_ACTIVE_SLOTS },
  });
}

return c.json(toBacklogEntry(outcome.entry), outcome.created ? 201 : 200);
```

The `throw` sits outside the transaction deliberately: throwing inside would roll back, which is harmless here but couples the error path to transaction semantics for no reason.

Extend the imports at the top of the file:

```ts
import {
  FREE_ACTIVE_SLOTS,
  SLOT_CONSUMING_STATUSES,
  backlogListQuerySchema,
  backlogUpsertSchema,
  gameIdPathSchema,
  slotDelta,
} from "@repo/contracts";
import {
  countBacklogEntriesByStatus,
  deleteBacklogEntry,
  gameExists,
  getBacklogEntry,
  getBacklogStats,
  getSubscription,
  listBacklog,
  lockUser,
  upsertBacklogEntry,
} from "@repo/db";
```

and add:

```ts
import { isPremium } from "../entitlement.js";
```

- [ ] **Step 10: Run the API suite**

```bash
pnpm --filter api test
pnpm --filter api check-types
```

Expected: PASS, including `backlog-cap`, `backlog-routes`, `invariants`, and `entitlement`. If `backlog-routes` fails, an existing test exceeded 10 unfinished games — raise its game count, do not weaken the cap.

- [ ] **Step 11: Commit**

```bash
npx prettier --write apps/api/src apps/api/test
git add apps/api
git commit -m "feat(api): enforce the free-tier slot cap

The API opens the transaction and owns the rule; packages/db supplies
lockUser and a status count that decide nothing. Check-then-write is
atomic because lockUser serialises one user's writes — the concurrency
test fails without it, which is the point of writing it.

The cap applies to slotDelta, not the total, so a full free tier can
still finish a game, re-rate one, shuffle between waiting and playing,
or log something already completed. Only a transition that consumes a
slot is ever refused, which also means the common paths run exactly the
queries they ran before.

402 carries activeCount and limit as extensions so the paywall can
render without a second request."
```

---

### Task 6: `GET /api/me`

**Files:**

- Create: `apps/api/src/routes/me.ts`
- Modify: `apps/api/src/app.ts` (mount it)
- Modify: `apps/api/src/serialize.ts` (add `toEntitlement`)
- Modify: `apps/api/test/invariants.test.ts` (the `AppType` route list)
- Test: `apps/api/test/me-routes.test.ts`

**Interfaces:**

- Consumes: `isPremium` (Task 5); `getSubscription` (Task 4); `MeResponse`, `EntitlementWire` (Task 1).
- Produces: `GET /api/me` returning `MeResponse`; `meRoutes(deps: AppDeps)`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/test/me-routes.test.ts`:

```ts
import { upsertSubscription } from "@repo/db";
import { afterAll, beforeEach, expect, test } from "vitest";

import { callApi, createTestApp, TEST_USER } from "./helpers.js";

const harness = createTestApp();

beforeEach(async () => {
  await harness.reset();
});

afterAll(async () => {
  await harness.close();
});

test("a user who has never subscribed is not premium", async () => {
  const response = await callApi(harness.app, "/api/me");

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ premium: false, entitlement: null });
});

test("an active subscription is reported with its product and expiry", async () => {
  await upsertSubscription(harness.db, {
    userId: TEST_USER,
    productId: "gg.barklog.app.premium.yearly",
    store: "app_store",
    periodType: "trial",
    purchasedAt: new Date("2026-09-01T00:00:00Z"),
    expiresAt: new Date("2027-09-01T00:00:00Z"),
    willRenew: true,
    sandbox: false,
    lastEventAtMs: 1_000,
  });

  const response = await callApi(harness.app, "/api/me");

  expect(await response.json()).toEqual({
    premium: true,
    entitlement: {
      productId: "gg.barklog.app.premium.yearly",
      store: "app_store",
      periodType: "trial",
      expiresAt: "2027-09-01T00:00:00.000Z",
      willRenew: true,
    },
  });
});

test("a lapsed subscription reports premium false but keeps the entitlement detail", async () => {
  await upsertSubscription(harness.db, {
    userId: TEST_USER,
    productId: "gg.barklog.app.premium.monthly",
    store: "app_store",
    periodType: "normal",
    purchasedAt: new Date("2026-07-01T00:00:00Z"),
    expiresAt: new Date("2026-08-01T00:00:00Z"),
    willRenew: false,
    sandbox: false,
    lastEventAtMs: 1_000,
  });

  const body = (await (await callApi(harness.app, "/api/me")).json()) as Record<string, unknown>;

  expect(body.premium).toBe(false);
  expect(body.entitlement).toMatchObject({ willRenew: false });
});

test("one user's subscription never leaks into another's answer", async () => {
  await upsertSubscription(harness.db, {
    userId: TEST_USER,
    productId: "gg.barklog.app.premium.yearly",
    store: "app_store",
    periodType: "normal",
    purchasedAt: new Date("2026-09-01T00:00:00Z"),
    expiresAt: new Date("2027-09-01T00:00:00Z"),
    willRenew: true,
    sandbox: false,
    lastEventAtMs: 1_000,
  });

  const other = await callApi(harness.app, "/api/me", { user: "user_2testBBB" });
  expect(await other.json()).toEqual({ premium: false, entitlement: null });
});

test("the route needs a session", async () => {
  const response = await callApi(harness.app, "/api/me", { user: null });
  expect(response.status).toBe(401);
});

test("entitlement is never cached by a shared cache", async () => {
  const response = await callApi(harness.app, "/api/me");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter api test -- me-routes
```

Expected: FAIL — 404 on `/api/me`.

- [ ] **Step 3: Add the serializer**

Append to `apps/api/src/serialize.ts`, following the shape of the existing `toBacklogEntry`:

```ts
export function toEntitlement(row: SubscriptionRow): EntitlementWire {
  return {
    productId: row.productId,
    store: row.store,
    periodType: row.periodType,
    expiresAt: row.expiresAt === null ? null : row.expiresAt.toISOString(),
    willRenew: row.willRenew,
  };
}
```

with imports `import type { EntitlementWire } from "@repo/contracts";` and `import type { SubscriptionRow } from "@repo/db";` added to that file's existing import block.

- [ ] **Step 4: Write the route**

Create `apps/api/src/routes/me.ts`:

```ts
import { getSubscription } from "@repo/db";
import { Hono } from "hono";

import { isPremium } from "../entitlement.js";
import { toEntitlement } from "../serialize.js";
import type { AppDeps, AppEnv } from "../types.js";

export function meRoutes(deps: AppDeps) {
  return new Hono<AppEnv>().get("/", async (c) => {
    const row = await getSubscription(deps.db, c.get("userId"));

    // no-store, not no-cache: this gates a paid feature, so a stale
    // revalidation is worse than a round trip.
    c.header("Cache-Control", "private, no-store");

    return c.json({
      premium: isPremium(row, new Date()),
      entitlement: row === null ? null : toEntitlement(row),
    });
  });
}
```

- [ ] **Step 5: Mount it**

In `apps/api/src/app.ts`, add the import and one `.route()` call before `/api/backlog`:

```ts
import { meRoutes } from "./routes/me.js";
```

```ts
    .route("/api/me", meRoutes(deps))
```

- [ ] **Step 6: Update the `AppType` invariant**

In `apps/api/test/invariants.test.ts`, add to the route assertions:

```ts
expect(typeof client.api.me.$get).toBe("function");
```

- [ ] **Step 7: Run the suite**

```bash
pnpm --filter api test
pnpm --filter api check-types
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
npx prettier --write apps/api/src apps/api/test
git add apps/api
git commit -m "feat(api): GET /api/me reports entitlement

One call the app renders premium state from. Slot counts stay on
/api/backlog/stats, which already returns per-status counts and is
already invalidated by every backlog mutation — a second source for the
same number would be a second thing to keep fresh.

Cache-Control is private, no-store rather than no-cache: this gates a
paid feature, so a stale revalidation is worse than a round trip.

A lapsed subscription reports premium false but keeps the entitlement
detail, so the paywall can say 'your subscription ended' rather than
pretending the user never subscribed."
```

---

### Task 7: The RevenueCat webhook

**Files:**

- Create: `packages/contracts/src/revenuecat.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `apps/api/src/revenuecat.ts`
- Create: `apps/api/src/routes/webhooks.ts`
- Modify: `apps/api/src/types.ts` (`PUBLIC_PATHS`, `WEBHOOK_BODY_LIMIT_BYTES`)
- Modify: `apps/api/src/middleware/auth.ts` (`PROBE_PATHS` → `PUBLIC_PATHS`)
- Modify: `apps/api/src/app.ts` (scoped body limits, mount the route)
- Modify: `apps/api/src/env.ts` (three secrets)
- Modify: `apps/api/src/problems.ts` (`UNPROCESSABLE_WEBHOOK`)
- Modify: `apps/api/test/invariants.test.ts` (type-URI list)
- Modify: `.env.example`, `compose.yaml`
- Test: `apps/api/test/webhook-routes.test.ts`

**Interfaces:**

- Consumes: `recordSubscriptionEvent`, `upsertSubscription` (Task 4).
- Produces: `POST /webhooks/revenuecat`; `revenueCatEventSchema`; `toSubscriptionRow(event): SubscriptionRow | null`; `secretMatches(header, secret): boolean`; `signatureMatches(header, rawBody, secret): boolean`; `PUBLIC_PATHS`.

- [ ] **Step 1: Write the payload schema**

Create `packages/contracts/src/revenuecat.ts`. Only the fields the API uses are validated; RevenueCat adds fields freely, so unknown keys must be tolerated (`v.object`, never `v.strictObject`):

```ts
import * as v from "valibot";

import { PERIOD_TYPES, SUBSCRIPTION_STORES } from "./subscription.js";

/** Uppercase on the wire; our enums are lowercase — hence the maps below. */
export const REVENUECAT_STORES = [
  "APP_STORE",
  "MAC_APP_STORE",
  "PLAY_STORE",
  "STRIPE",
  "PROMOTIONAL",
] as const;

export const REVENUECAT_PERIOD_TYPES = ["NORMAL", "TRIAL", "INTRO", "PROMOTIONAL"] as const;

/**
 * `v.object`, not `v.strictObject`: RevenueCat adds fields without warning, and
 * a strict schema would turn every addition into a 422 and a retry storm.
 */
export const revenueCatEventSchema = v.object({
  event: v.object({
    id: v.pipe(v.string(), v.minLength(1)),
    type: v.pipe(v.string(), v.minLength(1)),
    app_user_id: v.pipe(v.string(), v.minLength(1)),
    event_timestamp_ms: v.number(),
    // Absent on TRANSFER and SUBSCRIBER_ALIAS.
    product_id: v.optional(v.string()),
    store: v.optional(v.picklist(REVENUECAT_STORES)),
    period_type: v.optional(v.picklist(REVENUECAT_PERIOD_TYPES)),
    purchased_at_ms: v.optional(v.number()),
    // null for a lifetime purchase.
    expiration_at_ms: v.optional(v.nullable(v.number())),
    cancel_reason: v.optional(v.nullable(v.string())),
    environment: v.optional(v.picklist(["SANDBOX", "PRODUCTION"])),
  }),
});

export type RevenueCatEvent = v.InferOutput<typeof revenueCatEventSchema>["event"];

export const REVENUECAT_STORE_MAP: Record<
  (typeof REVENUECAT_STORES)[number],
  (typeof SUBSCRIPTION_STORES)[number]
> = {
  APP_STORE: "app_store",
  MAC_APP_STORE: "app_store",
  PLAY_STORE: "play_store",
  STRIPE: "stripe",
  PROMOTIONAL: "promotional",
};

export const REVENUECAT_PERIOD_MAP: Record<
  (typeof REVENUECAT_PERIOD_TYPES)[number],
  (typeof PERIOD_TYPES)[number]
> = {
  NORMAL: "normal",
  TRIAL: "trial",
  INTRO: "intro",
  PROMOTIONAL: "promotional",
};
```

Add `export * from "./revenuecat.js";` to `packages/contracts/src/index.ts`.

- [ ] **Step 2: Write the failing webhook tests**

Create `apps/api/test/webhook-routes.test.ts`:

```ts
import { createHmac } from "node:crypto";

import { getSubscription } from "@repo/db";
import { afterAll, beforeEach, expect, test } from "vitest";

import { callApi, createTestApp, TEST_USER } from "./helpers.js";

const harness = createTestApp();

const SECRET = "test-webhook-secret";
const SIGNING_SECRET = "test-signing-secret";

/** RevenueCat's scheme: HMAC-SHA256 over `${t}.${rawBody}`, hex. */
function sign(rawBody: string, secret = SIGNING_SECRET): string {
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");

  return `t=${t},v1=${v1}`;
}

const event = (overrides: Record<string, unknown> = {}) => ({
  event: {
    id: "rc_event_1",
    type: "INITIAL_PURCHASE",
    app_user_id: TEST_USER,
    event_timestamp_ms: 2_000,
    product_id: "gg.barklog.app.premium.yearly",
    store: "APP_STORE",
    period_type: "TRIAL",
    purchased_at_ms: Date.parse("2026-09-01T00:00:00Z"),
    expiration_at_ms: Date.parse("2026-09-08T00:00:00Z"),
    environment: "PRODUCTION",
    ...overrides,
  },
});

const post = (
  body: unknown,
  options: { secret?: string | null; signature?: string | null } = {},
): RequestInit & { user?: string | null } => {
  const { secret = SECRET, signature } = options;
  // Signed over the exact bytes sent, which is what the route verifies.
  const rawBody = JSON.stringify(body);

  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret === null ? {} : { Authorization: secret }),
      ...(signature === null
        ? {}
        : { "X-RevenueCat-Webhook-Signature": signature ?? sign(rawBody) }),
    },
    body: rawBody,
    // Not a session route, so no X-Test-User.
    user: null,
  };
};

beforeEach(async () => {
  await harness.reset();
  await harness.db.execute(`insert into users (id) values ('${TEST_USER}')`);
});

afterAll(async () => {
  await harness.close();
});

test("a valid event is applied and the user becomes premium", async () => {
  const response = await callApi(harness.app, "/webhooks/revenuecat", post(event()));

  expect(response.status).toBe(200);
  expect(await getSubscription(harness.db, TEST_USER)).toMatchObject({
    productId: "gg.barklog.app.premium.yearly",
    store: "app_store",
    periodType: "trial",
    willRenew: true,
    sandbox: false,
    lastEventAtMs: 2_000,
  });
});

test("the webhook needs no session token, which is the whole point of PUBLIC_PATHS", async () => {
  const response = await callApi(harness.app, "/webhooks/revenuecat", post(event()));
  expect(response.status).not.toBe(401);
});

test("a missing secret is 401", async () => {
  const response = await callApi(
    harness.app,
    "/webhooks/revenuecat",
    post(event(), { secret: null }),
  );
  expect(response.status).toBe(401);
});

test("a wrong secret is 401 and applies nothing", async () => {
  const response = await callApi(
    harness.app,
    "/webhooks/revenuecat",
    post(event(), { secret: "nope" }),
  );

  expect(response.status).toBe(401);
  expect(await getSubscription(harness.db, TEST_USER)).toBeNull();
});

test("a missing signature is 401, even with the right Authorization secret", async () => {
  const response = await callApi(
    harness.app,
    "/webhooks/revenuecat",
    post(event(), { signature: null }),
  );

  expect(response.status).toBe(401);
  expect(await getSubscription(harness.db, TEST_USER)).toBeNull();
});

test("a signature from the wrong secret is 401", async () => {
  const body = event();
  const response = await callApi(harness.app, "/webhooks/revenuecat", {
    ...post(body),
    headers: {
      "Content-Type": "application/json",
      Authorization: SECRET,
      "X-RevenueCat-Webhook-Signature": sign(JSON.stringify(body), "wrong-signing-secret"),
    },
  });

  expect(response.status).toBe(401);
});

test("a tampered body is 401 — the signature covers the bytes, not just the headers", async () => {
  const original = event();
  const signature = sign(JSON.stringify(original));

  // Same signature, different body: what an attacker replaying a captured
  // delivery with an extended expiry would send.
  const tampered = event({ expiration_at_ms: Date.parse("2099-01-01T00:00:00Z") });

  const response = await callApi(harness.app, "/webhooks/revenuecat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: SECRET,
      "X-RevenueCat-Webhook-Signature": signature,
    },
    body: JSON.stringify(tampered),
    user: null,
  });

  expect(response.status).toBe(401);
  expect(await getSubscription(harness.db, TEST_USER)).toBeNull();
});

test("a malformed signature header is 401, not a crash", async () => {
  for (const signature of ["", "garbage", "t=123", "v1=abc", "t=,v1="]) {
    const response = await callApi(
      harness.app,
      "/webhooks/revenuecat",
      post(event(), { signature }),
    );

    expect(response.status, signature).toBe(401);
  }
});

test("a redelivered event is 200 and applied once, so RevenueCat stops retrying", async () => {
  await callApi(harness.app, "/webhooks/revenuecat", post(event()));
  const again = await callApi(harness.app, "/webhooks/revenuecat", post(event()));

  expect(again.status).toBe(200);

  const rows = await harness.db.execute("select count(*)::int as total from subscription_events");
  expect((rows.rows[0] as { total: number }).total).toBe(1);
});

test("a stale event is 200 and does not resurrect a cancelled subscription", async () => {
  await callApi(
    harness.app,
    "/webhooks/revenuecat",
    post(
      event({
        id: "rc_cancel",
        type: "CANCELLATION",
        event_timestamp_ms: 3_000,
        cancel_reason: "UNSUBSCRIBE",
      }),
    ),
  );

  const stale = await callApi(
    harness.app,
    "/webhooks/revenuecat",
    post(event({ id: "rc_late", event_timestamp_ms: 1_000 })),
  );

  expect(stale.status).toBe(200);
  expect(await getSubscription(harness.db, TEST_USER)).toMatchObject({
    willRenew: false,
    lastEventAtMs: 3_000,
  });
});

test("a cancel_reason means auto-renew is off but the entitlement stands until expiry", async () => {
  await callApi(
    harness.app,
    "/webhooks/revenuecat",
    post(event({ type: "CANCELLATION", cancel_reason: "UNSUBSCRIBE" })),
  );

  expect(await getSubscription(harness.db, TEST_USER)).toMatchObject({ willRenew: false });
});

test("a sandbox event is stored as sandbox and still grants premium", async () => {
  await callApi(harness.app, "/webhooks/revenuecat", post(event({ environment: "SANDBOX" })));

  expect(await getSubscription(harness.db, TEST_USER)).toMatchObject({ sandbox: true });

  const me = await callApi(harness.app, "/api/me");
  expect(await me.json()).toMatchObject({ premium: true });
});

test("a null expiration is stored as a lifetime entitlement", async () => {
  await callApi(harness.app, "/webhooks/revenuecat", post(event({ expiration_at_ms: null })));

  expect(await getSubscription(harness.db, TEST_USER)).toMatchObject({ expiresAt: null });
});

test("an event for an unknown user is 200, logged, and upserts nothing", async () => {
  const response = await callApi(
    harness.app,
    "/webhooks/revenuecat",
    post(event({ app_user_id: "user_never_seen" })),
  );

  expect(response.status).toBe(200);
  const rows = await harness.db.execute(
    "select count(*)::int as total from subscription_events where user_id = 'user_never_seen'",
  );
  expect((rows.rows[0] as { total: number }).total).toBe(1);

  const subs = await harness.db.execute("select count(*)::int as total from subscriptions");
  expect((subs.rows[0] as { total: number }).total).toBe(0);
});

test("an unparseable payload is 422, not a crash", async () => {
  const response = await callApi(harness.app, "/webhooks/revenuecat", post({ event: {} }));
  expect(response.status).toBe(422);
});

test("an event type carrying no product is logged without touching the row", async () => {
  await callApi(harness.app, "/webhooks/revenuecat", post(event()));

  const transfer = await callApi(
    harness.app,
    "/webhooks/revenuecat",
    post({
      event: {
        id: "rc_transfer",
        type: "TRANSFER",
        app_user_id: TEST_USER,
        event_timestamp_ms: 5_000,
      },
    }),
  );

  expect(transfer.status).toBe(200);
  // A TRANSFER carries no product, so the purchase row survives.
  expect(await getSubscription(harness.db, TEST_USER)).toMatchObject({
    productId: "gg.barklog.app.premium.yearly",
    lastEventAtMs: 2_000,
  });
});

test("a body over the api limit is accepted, because webhooks get their own limit", async () => {
  const padded = event();
  (padded.event as Record<string, unknown>).padding = "x".repeat(64 * 1024);

  const response = await callApi(harness.app, "/webhooks/revenuecat", post(padded));
  expect(response.status).toBe(200);
});

test("the api body limit still applies to api routes", async () => {
  const response = await callApi(harness.app, "/api/backlog/1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "waiting", padding: "x".repeat(32 * 1024) }),
  });

  expect(response.status).toBe(413);
});
```

`createTestApp` must supply both secrets. In `apps/api/test/helpers.ts`, export

```ts
export const WEBHOOK_SECRET = "test-webhook-secret";
export const WEBHOOK_SIGNING_SECRET = "test-signing-secret";
```

and pass `webhookSecret: WEBHOOK_SECRET` and `webhookSigningSecret: WEBHOOK_SIGNING_SECRET` in the `createApp({...})` call, before `...overrides`. Import both in the test rather than redeclaring the local constants.

- [ ] **Step 3: Run them to verify they fail**

```bash
pnpm --filter api test -- webhook-routes
```

Expected: FAIL — 404 on `/webhooks/revenuecat`.

- [ ] **Step 4: Add the env vars**

In `apps/api/src/env.ts`, add to `envSchema`:

```ts
  REVENUECAT_WEBHOOK_SECRET: required,
  REVENUECAT_WEBHOOK_SIGNING_SECRET: required,
  REVENUECAT_API_KEY: required,
```

In `.env.example`, following the existing comment style:

```
# RevenueCat — https://app.revenuecat.com, Project settings
# The Authorization header value you set on the webhook in RevenueCat's dashboard.
REVENUECAT_WEBHOOK_SECRET=
# HMAC signing secret. RevenueCat shows it once, at creation or rotation.
REVENUECAT_WEBHOOK_SIGNING_SECRET=
# Secret API key (v1), used to re-read a subscriber after a purchase.
REVENUECAT_API_KEY=
```

In `compose.yaml`, in the api service's `environment:` block, matching the established required-variable syntax:

```yaml
REVENUECAT_WEBHOOK_SECRET: ${REVENUECAT_WEBHOOK_SECRET:?required}
REVENUECAT_WEBHOOK_SIGNING_SECRET: ${REVENUECAT_WEBHOOK_SIGNING_SECRET:?required}
REVENUECAT_API_KEY: ${REVENUECAT_API_KEY:?required}
```

Indent these to match the block you are editing — the fence above is unindented
only because Prettier formats fenced YAML.

- [ ] **Step 5: Add `PUBLIC_PATHS` and the webhook body limit**

In `apps/api/src/types.ts`, below `PROBE_PATHS`:

```ts
/**
 * Separate from `PROBE_PATHS`, not merged into it: that set also drives the
 * `honoLogger` skip, and webhook requests should be logged.
 */
export const PUBLIC_PATHS: ReadonlySet<string> = new Set([...PROBE_PATHS, "/webhooks/revenuecat"]);

/** Scoped, not global: nobody should POST a megabyte at a backlog write. */
export const WEBHOOK_BODY_LIMIT_BYTES = 1024 * 1024;
```

Add `webhookSecret: string;` and `webhookSigningSecret: string;` to `AppDeps`.

- [ ] **Step 6: Switch the auth middleware to `PUBLIC_PATHS`**

In `apps/api/src/middleware/auth.ts`, change the import and the guard:

```ts
import { PUBLIC_PATHS, type AppEnv, type Db } from "../types.js";
```

```ts
// By exact path: a prefix allowlist would quietly make a future
// `/healthz-debug` public.
if (PUBLIC_PATHS.has(c.req.path)) return next();
```

- [ ] **Step 7: Write the RevenueCat helpers**

Create `apps/api/src/revenuecat.ts`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

import { REVENUECAT_PERIOD_MAP, REVENUECAT_STORE_MAP, type RevenueCatEvent } from "@repo/contracts";
import type { SubscriptionRow } from "@repo/db";

/** Length check first: `timingSafeEqual` throws on a mismatch. */
function constantTimeEquals(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);

  return a.length === b.length && timingSafeEqual(a, b);
}

export function secretMatches(header: string | undefined, secret: string): boolean {
  return header !== undefined && constantTimeEquals(header, secret);
}

/**
 * `X-RevenueCat-Webhook-Signature: t=<unix>,v1=<hmac_sha256_hex>`, computed over
 * `${t}.${rawBody}`.
 *
 * `rawBody` must be the bytes as received. Re-serialising a parsed object
 * changes them, and every legitimate request then fails — uniformly, so it
 * reads as a wrong secret rather than a bytes problem.
 */
export function signatureMatches(
  header: string | undefined,
  rawBody: string,
  secret: string,
): boolean {
  if (header === undefined) return false;

  const parts = new Map(
    header.split(",").map((part) => {
      const index = part.indexOf("=");
      return [part.slice(0, index).trim(), part.slice(index + 1).trim()] as const;
    }),
  );

  const timestamp = parts.get("t");
  const provided = parts.get("v1");
  if (timestamp === undefined || provided === undefined) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");

  return constantTimeEquals(provided, expected);
}

/** null when the event carries no subscription state — blanking a real purchase. */
export function toSubscriptionRow(event: RevenueCatEvent): SubscriptionRow | null {
  if (
    event.product_id === undefined ||
    event.store === undefined ||
    event.period_type === undefined ||
    event.purchased_at_ms === undefined
  ) {
    return null;
  }

  return {
    userId: event.app_user_id,
    productId: event.product_id,
    store: REVENUECAT_STORE_MAP[event.store],
    periodType: REVENUECAT_PERIOD_MAP[event.period_type],
    purchasedAt: new Date(event.purchased_at_ms),
    // Absent and null both mean "does not expire".
    expiresAt:
      event.expiration_at_ms === undefined || event.expiration_at_ms === null
        ? null
        : new Date(event.expiration_at_ms),
    // Auto-renew off. The entitlement still stands until expiry — see isPremium.
    willRenew: event.cancel_reason === undefined || event.cancel_reason === null,
    sandbox: event.environment === "SANDBOX",
    lastEventAtMs: event.event_timestamp_ms,
  };
}
```

- [ ] **Step 8: Write the route**

Create `apps/api/src/routes/webhooks.ts`:

```ts
import { sValidator } from "@hono/standard-validator";
import { revenueCatEventSchema } from "@repo/contracts";
import { recordSubscriptionEvent, upsertSubscription, userExists } from "@repo/db";
import { getLogger } from "@logtape/logtape";
import { Hono } from "hono";

import { problems } from "../problems.js";
import { secretMatches, signatureMatches, toSubscriptionRow } from "../revenuecat.js";
import type { AppDeps, AppEnv } from "../types.js";

/**
 * Status codes are a contract with RevenueCat's retries: anything but 2xx is
 * retried, so duplicates, stale events and unknown users all answer 200.
 */
export function webhookRoutes(deps: AppDeps) {
  const log = getLogger(["api", "revenuecat"]);

  return new Hono<AppEnv>().post(
    "/revenuecat",
    async (c, next) => {
      if (!secretMatches(c.req.header("Authorization"), deps.webhookSecret)) {
        throw problems.create("UNAUTHORIZED", {
          detail: "A valid webhook secret is required.",
        });
      }

      // `text()` before the validator's `json()`: Hono caches the body and
      // derives the parsed value from the cached text, so nothing is consumed
      // twice — and the HMAC must see the bytes as received.
      const rawBody = await c.req.text();

      if (
        !signatureMatches(
          c.req.header("X-RevenueCat-Webhook-Signature"),
          rawBody,
          deps.webhookSigningSecret,
        )
      ) {
        throw problems.create("UNAUTHORIZED", {
          detail: "A valid webhook signature is required.",
        });
      }

      return next();
    },
    sValidator("json", revenueCatEventSchema, (result, c) => {
      if (!result.success) {
        return renderUnprocessable(c);
      }
    }),
    async (c) => {
      const { event } = c.req.valid("json");

      const isNew = await recordSubscriptionEvent(deps.db, {
        id: event.id,
        userId: event.app_user_id,
        type: event.type,
        payload: event,
      });

      if (!isNew) {
        log.info("Duplicate RevenueCat event {id} ignored", { id: event.id });
        return c.body(null, 200);
      }

      const row = toSubscriptionRow(event);

      if (row === null) {
        log.info("RevenueCat event {type} carries no subscription state", { type: event.type });
        return c.body(null, 200);
      }

      // The log kept the event; the row must not be written for an unknown user.
      if (!(await userExists(deps.db, event.app_user_id))) {
        log.warn("RevenueCat event for unknown user {userId}", { userId: event.app_user_id });
        return c.body(null, 200);
      }

      // Unconditional: the upsert's WHERE clause drops stale events.
      await upsertSubscription(deps.db, row);

      return c.body(null, 200);
    },
  );
}
```

Add the `renderUnprocessable` helper at the top of the file:

```ts
import { renderProblem } from "../problems.js";
import type { Context } from "hono";

function renderUnprocessable(c: Context) {
  return renderProblem(
    c,
    problems.create("UNPROCESSABLE_WEBHOOK", {
      detail: "The webhook payload did not match RevenueCat's event shape.",
    }),
  );
}
```

- [ ] **Step 9: Add `userExists` to the db package**

`packages/db/src/queries/backlog.ts`, beside `ensureUser`:

```ts
export async function userExists(db: Queryable, userId: string): Promise<boolean> {
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);

  return rows.length > 0;
}
```

- [ ] **Step 10: Add the problem type and update the invariant**

In `apps/api/src/problems.ts`, after `UNPROCESSABLE_SHARE`:

```ts
  UNPROCESSABLE_WEBHOOK: definition(422),
```

`definition(422)` produces the same `unprocessable-content` slug as `UNPROCESSABLE_SHARE`, so the URI list in `invariants.test.ts` gains a second identical entry in the matching position:

```ts
    "https://barklog.gg/problems/unprocessable-content",
    "https://barklog.gg/problems/unprocessable-content",
```

- [ ] **Step 11: Wire the route and the scoped body limits**

In `apps/api/src/app.ts`, replace the single `.use("*", bodyLimit(...))` with two scoped limiters, keeping the existing `onError` shape for each:

```ts
    .use(
      "/api/*",
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
    .use(
      "/webhooks/*",
      bodyLimit({
        maxSize: WEBHOOK_BODY_LIMIT_BYTES,
        onError: (c) =>
          renderProblem(
            c,
            problems.create("CONTENT_TOO_LARGE", {
              detail: `Request body must be at most ${WEBHOOK_BODY_LIMIT_BYTES} bytes.`,
            }),
          ),
      }),
    )
```

and mount the route beside the others:

```ts
    .route("/webhooks", webhookRoutes(deps))
```

Import `webhookRoutes` and add `WEBHOOK_BODY_LIMIT_BYTES` to the `./types.js` import.

- [ ] **Step 12: Run the suite**

```bash
pnpm --filter api test
pnpm --filter api check-types
pnpm --filter @repo/db check-types
```

Expected: PASS. `app.test.ts` may assert the old global body-limit behaviour — if it fails, update it to assert the `/api/*` limit, which is the behaviour that still matters.

- [ ] **Step 13: Commit**

```bash
npx prettier --write apps/api packages/contracts packages/db compose.yaml .env.example
git add -A
git commit -m "feat(api): RevenueCat webhook

Mounted at /webhooks/revenuecat, outside /api/*, so it skips requireJson
and the /api/* rate limiter without either needing an exception. Auth is
a constant-time compare of the Authorization header; the length check
comes first because timingSafeEqual throws on a mismatch.

Status codes are a contract with RevenueCat's retry machinery: a
duplicate, a stale event, and an event for an unknown user all answer
200, because anything else is retried forever. Only a bad secret (401)
and an unparseable payload (422) refuse.

The payload schema is v.object, not v.strictObject — RevenueCat adds
fields without warning, and a strict schema would turn every addition
into a retry storm. Events with no product (TRANSFER, SUBSCRIBER_ALIAS)
are logged and skipped rather than blanking a real purchase.

PUBLIC_PATHS is separate from PROBE_PATHS because that set also drives
the logger skip, and webhook requests should be logged. Body limits are
now scoped: 1MB for /webhooks/*, the existing 16KB for /api/*, so
raising one does not let anyone POST a megabyte at a backlog write."
```

---

### Task 8: `POST /api/subscription/refresh`

**Files:**

- Modify: `apps/api/src/revenuecat.ts` (add the REST fetch)
- Create: `apps/api/src/routes/subscription.ts`
- Modify: `apps/api/src/app.ts`, `apps/api/src/rate-limits.ts`, `apps/api/src/types.ts`
- Modify: `apps/api/test/invariants.test.ts`
- Test: `apps/api/test/subscription-refresh.test.ts`

**Interfaces:**

- Consumes: `toSubscriptionRow`, `isPremium`, `upsertSubscription`, `getSubscription`, `toEntitlement`.
- Produces: `POST /api/subscription/refresh` returning `MeResponse`; `AppDeps.revenueCat: RevenueCatClient` with `fetchSubscriber(appUserId): Promise<SubscriptionRow | null>`.

Injected as a dep, like `share: ShareProvider`, so the test suite needs no network.

- [ ] **Step 1: Write the failing test**

Create `apps/api/test/subscription-refresh.test.ts`:

```ts
import { getSubscription, type SubscriptionRow } from "@repo/db";
import { afterAll, beforeEach, expect, test, vi } from "vitest";

import { callApi, createTestApp, TEST_USER } from "./helpers.js";

const fetchSubscriber = vi.fn<(appUserId: string) => Promise<SubscriptionRow | null>>();

const harness = createTestApp({ revenueCat: { fetchSubscriber } });

const post: RequestInit = {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "{}",
};

const row = (overrides: Partial<SubscriptionRow> = {}): SubscriptionRow => ({
  userId: TEST_USER,
  productId: "gg.barklog.app.premium.yearly",
  store: "app_store",
  periodType: "trial",
  purchasedAt: new Date("2026-09-01T00:00:00Z"),
  expiresAt: new Date("2027-09-01T00:00:00Z"),
  willRenew: true,
  sandbox: false,
  lastEventAtMs: 9_000,
  ...overrides,
});

beforeEach(async () => {
  await harness.reset();
  fetchSubscriber.mockReset();
});

afterAll(async () => {
  await harness.close();
});

test("a refresh pulls the subscriber and reports premium immediately", async () => {
  fetchSubscriber.mockResolvedValue(row());

  const response = await callApi(harness.app, "/api/subscription/refresh", post);

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ premium: true });
  expect(fetchSubscriber).toHaveBeenCalledWith(TEST_USER);
  expect(await getSubscription(harness.db, TEST_USER)).toMatchObject({ lastEventAtMs: 9_000 });
});

test("a subscriber with nothing active reports premium false without writing", async () => {
  fetchSubscriber.mockResolvedValue(null);

  const response = await callApi(harness.app, "/api/subscription/refresh", post);

  expect(await response.json()).toEqual({ premium: false, entitlement: null });
  expect(await getSubscription(harness.db, TEST_USER)).toBeNull();
});

test("a refresh cannot be aimed at another user", async () => {
  fetchSubscriber.mockResolvedValue(row({ userId: "user_2testBBB" }));

  await callApi(harness.app, "/api/subscription/refresh", post);

  expect(await getSubscription(harness.db, TEST_USER)).toMatchObject({ userId: TEST_USER });
  expect(await getSubscription(harness.db, "user_2testBBB")).toBeNull();
});

test("a RevenueCat outage is 502, not a 500", async () => {
  fetchSubscriber.mockRejectedValue(new Error("connect ETIMEDOUT"));

  const response = await callApi(harness.app, "/api/subscription/refresh", post);

  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({
    type: "https://barklog.gg/problems/bad-gateway",
  });
});

test("the route needs a session", async () => {
  const response = await callApi(harness.app, "/api/subscription/refresh", { ...post, user: null });
  expect(response.status).toBe(401);
});
```

`createTestApp` must default `revenueCat` to a throwing stub, exactly as `unusedShareProvider` does. Add to `apps/api/test/helpers.ts`:

```ts
const unusedRevenueCat: RevenueCatClient = {
  fetchSubscriber: () => {
    throw new Error("revenueCat.fetchSubscriber was not stubbed for this test");
  },
};
```

and pass `revenueCat: unusedRevenueCat` in the `createApp` call, before `...overrides`.

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter api test -- subscription-refresh
```

Expected: FAIL — 404.

- [ ] **Step 3: Declare the client type and the rate-limit scope**

In `apps/api/src/types.ts`:

```ts
/** Injected like `share`, so the suite needs no network. */
export interface RevenueCatClient {
  fetchSubscriber(appUserId: string): Promise<SubscriptionRow | null>;
}
```

Add `revenueCat: RevenueCatClient;` to `AppDeps` and import `type SubscriptionRow` from `@repo/db`.

In `apps/api/src/rate-limits.ts`, extend the scope union and the defaults:

```ts
export type RateLimitScope = "search" | "identify" | "write" | "refresh" | "overall";
```

```ts
  // Reaches a third party, and only a purchase or restore needs it.
  refresh: { limit: 10, windowSeconds: 60 },
```

- [ ] **Step 4: Implement the REST fetch**

Append to `apps/api/src/revenuecat.ts`:

```ts
const SUBSCRIBERS_URL = "https://api.revenuecat.com/v1/subscribers";

export const PREMIUM_ENTITLEMENT = "barklog_premium";

interface SubscriberResponse {
  subscriber?: {
    entitlements?: Record<string, { product_identifier?: string; expires_date?: string | null }>;
    subscriptions?: Record<
      string,
      {
        store?: string;
        period_type?: string;
        purchase_date?: string;
        expires_date?: string | null;
        unsubscribe_detected_at?: string | null;
        is_sandbox?: boolean;
      }
    >;
  };
}

export function createRevenueCatClient(apiKey: string): RevenueCatClient {
  return {
    async fetchSubscriber(appUserId) {
      const response = await fetch(`${SUBSCRIBERS_URL}/${encodeURIComponent(appUserId)}`, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`RevenueCat answered ${response.status}`);
      }

      const body = (await response.json()) as SubscriberResponse;
      const entitlement = body.subscriber?.entitlements?.[PREMIUM_ENTITLEMENT];
      const productId = entitlement?.product_identifier;

      if (entitlement === undefined || productId === undefined) return null;

      const subscription = body.subscriber?.subscriptions?.[productId];

      return {
        userId: appUserId,
        productId,
        store:
          REVENUECAT_STORE_MAP[
            (subscription?.store?.toUpperCase() ?? "APP_STORE") as keyof typeof REVENUECAT_STORE_MAP
          ],
        periodType:
          REVENUECAT_PERIOD_MAP[
            (subscription?.period_type?.toUpperCase() ??
              "NORMAL") as keyof typeof REVENUECAT_PERIOD_MAP
          ],
        purchasedAt: new Date(subscription?.purchase_date ?? Date.now()),
        expiresAt: entitlement.expires_date ? new Date(entitlement.expires_date) : null,
        willRenew: !subscription?.unsubscribe_detected_at,
        sandbox: subscription?.is_sandbox ?? false,
        // The freshest answer available, so it must beat the staleness guard.
        lastEventAtMs: Date.now(),
      };
    },
  };
}
```

Add `import type { RevenueCatClient } from "./types.js";` to that file.

- [ ] **Step 5: Write the route**

Create `apps/api/src/routes/subscription.ts`:

```ts
import { getSubscription, upsertSubscription } from "@repo/db";
import { getLogger } from "@logtape/logtape";
import { Hono } from "hono";

import { isPremium } from "../entitlement.js";
import { problems } from "../problems.js";
import { toEntitlement } from "../serialize.js";
import type { AppDeps, AppEnv } from "../types.js";

export function subscriptionRoutes(deps: AppDeps) {
  const log = getLogger(["api", "revenuecat"]);

  return new Hono<AppEnv>().post("/refresh", async (c) => {
    const userId = c.get("userId");

    let fetched;
    try {
      fetched = await deps.revenueCat.fetchSubscriber(userId);
    } catch (error) {
      log.warn("RevenueCat refresh failed for {userId}: {message}", {
        userId,
        message: error instanceof Error ? error.message : String(error),
      });

      throw problems.create("BAD_GATEWAY");
    }

    if (fetched !== null) {
      // The session's user id wins over the third party's.
      await upsertSubscription(deps.db, { ...fetched, userId });
    }

    const row = await getSubscription(deps.db, userId);

    c.header("Cache-Control", "private, no-store");

    return c.json({
      premium: isPremium(row, new Date()),
      entitlement: row === null ? null : toEntitlement(row),
    });
  });
}
```

- [ ] **Step 6: Wire it up**

In `apps/api/src/app.ts`, add the rate limiter before the general `/api/*` one and mount the route:

```ts
    .on(["POST"], "/api/subscription/refresh", rateLimit(deps.cache, "refresh", limits.refresh))
```

```ts
    .route("/api/subscription", subscriptionRoutes(deps))
```

In `apps/api/src/index.ts`, construct the real client from `env.REVENUECAT_API_KEY` and pass `revenueCat`, `webhookSecret: env.REVENUECAT_WEBHOOK_SECRET` and `webhookSigningSecret: env.REVENUECAT_WEBHOOK_SIGNING_SECRET` into `createApp`.

Add to `apps/api/test/invariants.test.ts`:

```ts
expect(typeof client.api.subscription.refresh.$post).toBe("function");
```

- [ ] **Step 7: Run the suite**

```bash
pnpm --filter api test
pnpm --filter api check-types
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
npx prettier --write apps/api
git add apps/api
git commit -m "feat(api): POST /api/subscription/refresh

Closes the window between a purchase completing on device and its
webhook landing. Without it the user who just paid can tap Add and get a
402 on the transaction they just completed.

The client is injected like share: ShareProvider, so the suite needs no
network. It reads RevenueCat's v1 subscribers endpoint, which returns
the same entitlement shape the webhook carries — one mapping function
serves both paths and there is no project id to configure.

lastEventAtMs is set to now, deliberately: a REST read is the freshest
answer available, so it must win over an already-applied webhook or the
upsert's staleness guard would discard the very thing the user waits for.
The session's user id overrides whatever the third party returned, and an
outage is a 502 rather than an unhandled 500."
```

---

### Task 9: RevenueCat on device — provider and entitlement hook

**Files:**

- Modify: `apps/mobile/package.json`
- Modify: `apps/mobile/src/env.ts`
- Create: `apps/mobile/src/purchases/provider.tsx`
- Create: `apps/mobile/src/purchases/should-identify.ts`
- Modify: `apps/mobile/src/app/_layout.tsx`
- Modify: `apps/mobile/src/api/endpoints.ts`, `keys.ts`, `hooks.ts`
- Test: `apps/mobile/test/should-identify.test.ts`
- Test: `apps/mobile/test/api-endpoints.test.ts` (append)

**Interfaces:**

- Consumes: `MeResponse` (Task 1); `GET /api/me` (Task 6); `POST /api/subscription/refresh` (Task 8).
- Produces: `PurchasesProvider`; `useMe(): UseQueryResult<MeResponse>`; `useIsPremium(): boolean`; `keys.me()`; `endpoints.getMe`, `endpoints.refreshSubscription`; `identifyAction(previous, current)`.

- [ ] **Step 1: Install the packages**

```bash
cd apps/mobile && npx expo install react-native-purchases react-native-purchases-ui && cd ../..
```

Confirm both landed at `^10.8.1` or later in `apps/mobile/package.json`. **Do not** add `expo-build-properties` — that is an AdMob requirement and this app ships no ads.

- [ ] **Step 2: Write the failing identify-decision test**

The provider must not call `logIn`/`logOut` on every render, and must not log out during Clerk's mid-establishment window. Extract the decision so it is testable, mirroring `should-clear-cache.ts`.

Create `apps/mobile/test/should-identify.test.ts`:

```ts
import { expect, test } from "vitest";

import { identifyAction } from "@/purchases/should-identify";

test("nothing happens before Clerk has resolved", () => {
  expect(identifyAction(undefined, undefined)).toBe("none");
});

test("a resolved user is identified", () => {
  expect(identifyAction(undefined, "user_a")).toBe("login");
});

test("the same user is not re-identified on every render", () => {
  expect(identifyAction("user_a", "user_a")).toBe("none");
});

test("a switched user is re-identified, so premium never carries across accounts", () => {
  expect(identifyAction("user_a", "user_b")).toBe("login");
});

test("a sign-out logs out", () => {
  expect(identifyAction("user_a", null)).toBe("logout");
});

test("an undefined current user is Clerk mid-establishment, so nothing happens", () => {
  expect(identifyAction("user_a", undefined)).toBe("none");
});

test("a repeated signed-out state does nothing", () => {
  expect(identifyAction(null, null)).toBe("none");
});
```

- [ ] **Step 3: Run it to verify it fails**

```bash
pnpm --filter mobile test -- should-identify
```

Expected: FAIL — cannot resolve `@/purchases/should-identify`.

- [ ] **Step 4: Implement the decision**

Create `apps/mobile/src/purchases/should-identify.ts`:

```ts
export type IdentifyAction = "none" | "login" | "logout";

/**
 * `undefined` is Clerk unresolved, `null` is signed out. Treating them alike
 * logs out mid session-establishment, detaching the entitlement mid-purchase —
 * the same distinction `should-clear-cache.ts` draws.
 */
export function identifyAction(
  previous: string | null | undefined,
  current: string | null | undefined,
): IdentifyAction {
  if (current === undefined) return "none";
  if (previous === current) return "none";

  return current === null ? "logout" : "login";
}
```

- [ ] **Step 5: Add the env var**

In `apps/mobile/src/env.ts`, following the inline-literal rule documented there:

```ts
/**
 * RevenueCat warns in capitals never to submit an app configured with a Test
 * Store key, so the choice is made here rather than left to a `.env` someone
 * has to remember. Expo folds both `__DEV__` and the `process.env` reads at
 * build time, so a release bundle contains neither the branch nor the test key.
 */
export const REVENUECAT_API_KEY = __DEV__
  ? requireEnv("EXPO_PUBLIC_REVENUECAT_TEST_KEY", process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY)
  : requireEnv("EXPO_PUBLIC_REVENUECAT_IOS_KEY", process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY);
```

Add both to `apps/mobile/.env.example`, with a comment saying which is which:

```
# RevenueCat — https://app.revenuecat.com, API keys
# Test Store key. Used by development builds only; simulated purchases.
EXPO_PUBLIC_REVENUECAT_TEST_KEY=
# App Store key. Used by release builds. Never put the Test Store key here.
EXPO_PUBLIC_REVENUECAT_IOS_KEY=
```

Set `EXPO_PUBLIC_REVENUECAT_IOS_KEY` as an EAS environment variable for the `production` profile so the release build has it.

- [ ] **Step 6: Add the API endpoints and query keys**

In `apps/mobile/src/api/endpoints.ts`, add to the returned object:

```ts
    getMe: () => request<MeResponse>("/api/me"),

    refreshSubscription: () =>
      request<MeResponse>("/api/subscription/refresh", { method: "POST", body: {} }),
```

with `type MeResponse` added to the `@repo/contracts` import.

In `apps/mobile/src/api/keys.ts`, add a top-level key:

```ts
  /** Entitlement only — slot counts come from `backlog.stats`. */
  me: () => ["me"] as const,
```

In `apps/mobile/src/api/hooks.ts`:

```ts
export function useMe(): UseQueryResult<MeResponse> {
  const api = useApi();

  return useQuery({ queryKey: keys.me(), queryFn: () => api.getMe() });
}

/** From the API, not `customerInfo`: the UI must agree with the enforcer. */
export function useIsPremium(): boolean {
  return useMe().data?.premium ?? false;
}
```

Append inside the existing `describe("createEndpoints", ...)` block in `apps/mobile/test/api-endpoints.test.ts`, using that file's `spy()` helper and its `it` style. Note `spy()` records `{ path, options }`, not `{ path, init }`:

```ts
it("reads the entitlement route", async () => {
  const { request, calls } = spy();
  await createEndpoints(request).getMe();

  expect(calls[0]).toEqual({ path: "/api/me", options: {} });
});

it("posts to refresh, because it makes the server re-read RevenueCat", async () => {
  const { request, calls } = spy();
  await createEndpoints(request).refreshSubscription();

  expect(calls[0]).toEqual({
    path: "/api/subscription/refresh",
    options: { method: "POST", body: {} },
  });
});
```

- [ ] **Step 7: Write the provider**

Create `apps/mobile/src/purchases/provider.tsx`:

```tsx
import { useAuth } from "@clerk/expo";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, type ReactNode } from "react";
import Purchases from "react-native-purchases";

import { useApi } from "@/api/provider";
import { keys } from "@/api/keys";
import { REVENUECAT_API_KEY } from "@/env";

import { identifyAction } from "./should-identify";

/** Keeps RevenueCat's App User ID equal to the Clerk `sub`, which is `users.id`. */
export function PurchasesProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth({ treatPendingAsSignedOut: false });
  const queryClient = useQueryClient();
  const api = useApi();
  const previous = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    Purchases.configure({ apiKey: REVENUECAT_API_KEY });
  }, []);

  useEffect(() => {
    const action = identifyAction(previous.current, userId);
    if (action === "none") return;

    previous.current = userId;

    if (action === "logout") {
      void Purchases.logOut();
      return;
    }

    void Purchases.logIn(userId as string);
  }, [userId]);

  useEffect(() => {
    // The SDK knows about a purchase before our webhook does. Ask the server
    // to re-read RevenueCat, then invalidate — so the unlock is immediate and
    // the API stays the authority.
    const listener = () => {
      void api
        .refreshSubscription()
        .catch(() => undefined)
        .finally(() => void queryClient.invalidateQueries({ queryKey: keys.me() }));
    };

    Purchases.addCustomerInfoUpdateListener(listener);

    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [api, queryClient]);

  return children;
}
```

- [ ] **Step 8: Mount it**

In `apps/mobile/src/app/_layout.tsx`, wrap inside `ApiProvider` (it uses `useApi`) and outside the gates:

```tsx
        <ApiProvider>
          <PurchasesProvider>
            <ThemeProvider ...>
```

closing it after `</ThemeProvider>`.

- [ ] **Step 9: Run the mobile tests and type-check**

```bash
pnpm --filter mobile test
pnpm --filter mobile check-types
pnpm --filter mobile lint
```

Expected: PASS. `react-native-purchases` is a native module — vitest never imports the provider, so no mock is needed unless a test pulls it in transitively. If one does, add a `vi.mock("react-native-purchases", ...)` to that test only.

- [ ] **Step 10: Build a development client and confirm it boots**

```bash
pnpm --filter mobile build:dev
```

Install on device, launch, and confirm the app reaches the backlog screen. A native module was added, so the previous dev build will crash on launch — this step is what proves the new one works before any paywall code depends on it.

- [ ] **Step 11: Commit**

```bash
npx prettier --write apps/mobile/src apps/mobile/test
git add apps/mobile
git commit -m "feat(mobile): configure RevenueCat and read entitlement from the API

Purchases.logIn uses the Clerk sub, which is also users.id on the
server, so there is no mapping table. identifyAction is extracted and
tested because the interesting case is invisible: Clerk reports
undefined while a session establishes, and treating that like signed-out
would log RevenueCat out mid-purchase. It also re-identifies on a user
switch, so premium never carries across accounts on a shared device.

useIsPremium reads GET /api/me, not customerInfo. The API enforces the
cap, so the UI has to agree with the enforcer; customerInfo is a change
signal that triggers a server re-read, never the authority.

No expo-build-properties and no static frameworks: this app ships no
ads, so the pod graph stays untouched."
```

---

### Task 10: The paywall, and the two ways users reach it

**Files:**

- Create: `apps/mobile/src/app/paywall.tsx`
- Create: `apps/mobile/src/features/paywall/should-offer-paywall.ts`
- Modify: `apps/mobile/src/app/_layout.tsx`
- Modify: `apps/mobile/src/features/game/entry-actions.tsx`
- Modify: `apps/mobile/src/features/game/game-detail-screen.tsx`
- Modify: `apps/mobile/src/api/hooks.ts`, `apps/mobile/src/api/error-copy.ts`
- Test: `apps/mobile/test/should-offer-paywall.test.ts`
- Test: `apps/mobile/test/error-copy.test.ts` (append)

**Interfaces:**

- Consumes: `slotDelta`, `FREE_ACTIVE_SLOTS` (Task 1); `useIsPremium` (Task 9); the 402 problem (Task 5).
- Produces: route `/paywall`; `wouldExceedSlots({ premium, activeCount, from, to }): boolean`.

- [ ] **Step 1: Write the failing decision test**

Create `apps/mobile/test/should-offer-paywall.test.ts`:

```ts
import { FREE_ACTIVE_SLOTS } from "@repo/contracts";
import { expect, test } from "vitest";

import { wouldExceedSlots } from "@/features/paywall/should-offer-paywall";

const full = { premium: false, activeCount: FREE_ACTIVE_SLOTS };

test("a premium user never sees the paywall", () => {
  expect(wouldExceedSlots({ ...full, premium: true, from: null, to: "waiting" })).toBe(false);
});

test("adding past a full free tier offers the paywall", () => {
  expect(wouldExceedSlots({ ...full, from: null, to: "waiting" })).toBe(true);
});

test("adding with a slot left does not", () => {
  expect(
    wouldExceedSlots({
      premium: false,
      activeCount: FREE_ACTIVE_SLOTS - 1,
      from: null,
      to: "waiting",
    }),
  ).toBe(false);
});

test("finishing a game at the cap never offers the paywall", () => {
  expect(wouldExceedSlots({ ...full, from: "playing", to: "completed" })).toBe(false);
});

test("shuffling between unfinished statuses at the cap never offers the paywall", () => {
  expect(wouldExceedSlots({ ...full, from: "waiting", to: "playing" })).toBe(false);
});

test("logging an already-finished game at the cap never offers the paywall", () => {
  expect(wouldExceedSlots({ ...full, from: null, to: "completed" })).toBe(false);
});

test("reopening a finished game at the cap offers the paywall", () => {
  expect(wouldExceedSlots({ ...full, from: "completed", to: "playing" })).toBe(true);
});

test("an unknown count does not guess — the server decides", () => {
  expect(
    wouldExceedSlots({ premium: false, activeCount: undefined, from: null, to: "waiting" }),
  ).toBe(false);
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter mobile test -- should-offer-paywall
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement it**

Create `apps/mobile/src/features/paywall/should-offer-paywall.ts`:

```ts
import { FREE_ACTIVE_SLOTS, slotDelta, type BacklogStatus } from "@repo/contracts";

/**
 * An unknown `activeCount` returns false on purpose: guessing would refuse a
 * legitimate add while stats load, and the 402 handler is the backstop.
 */
export function wouldExceedSlots(input: {
  premium: boolean;
  activeCount: number | undefined;
  from: BacklogStatus | null;
  to: BacklogStatus;
}): boolean {
  if (input.premium || input.activeCount === undefined) return false;

  const delta = slotDelta(input.from, input.to);
  if (delta <= 0) return false;

  return input.activeCount + delta > FREE_ACTIVE_SLOTS;
}
```

- [ ] **Step 4: Write the paywall route**

Create `apps/mobile/src/app/paywall.tsx`:

```tsx
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import RevenueCatUI from "react-native-purchases-ui";

import { keys } from "@/api/keys";

/** Presented as a `pageSheet` by `_layout.tsx` — an offer, not a wall. */
export default function Paywall() {
  const queryClient = useQueryClient();

  const settle = () => {
    // The provider's customerInfo listener already asked the server to
    // re-read RevenueCat; this makes the screen behind the sheet agree.
    void queryClient.invalidateQueries({ queryKey: keys.me() });
    void queryClient.invalidateQueries({ queryKey: keys.backlog.all });
    router.back();
  };

  return (
    <RevenueCatUI.Paywall
      onPurchaseCompleted={settle}
      onRestoreCompleted={settle}
      onDismiss={() => router.back()}
    />
  );
}
```

- [ ] **Step 5: Register the route**

In `apps/mobile/src/app/_layout.tsx`, beside the `shared` screen:

```tsx
<Stack.Screen name="paywall" options={{ presentation: "pageSheet" }} />
```

- [ ] **Step 6: Add the proactive trigger**

`entry-actions.tsx` currently calls `onUpsert` directly from both pickers. Give it the data to decide and a way to divert. Change its props to add:

```ts
  premium: boolean;
  activeCount: number | undefined;
  onBlocked: () => void;
```

and route the status picker's handler through the check:

```tsx
          <Picker
            selection={status ?? ""}
            onSelectionChange={(selection) => {
              const next = selection as BacklogStatus;

              if (wouldExceedSlots({ premium, activeCount, from: status, to: next })) {
                onBlocked();
                return;
              }

              onUpsert({ status: next, rating });
            }}
```

The rating picker needs no check — `slotDelta` is 0 for a same-status change, so it can never be refused.

In `game-detail-screen.tsx`, replace the single `<EntryActions .../>` line inside the `QueryBoundary` render prop:

```tsx
<EntryActions
  entry={data.backlogEntry}
  premium={premium}
  activeCount={activeCount}
  onBlocked={() => router.push("/paywall")}
  onUpsert={(input) => upsert.mutate(input)}
/>
```

and add, beside the existing `upsert` and `remove` hooks in `GameDetailScreen`:

```tsx
const router = useRouter();
const premium = useIsPremium();
const stats = useBacklogStats();
// The cap counts unfinished games only, so this is the number the rule uses.
const activeCount =
  stats.data === undefined ? undefined : stats.data.counts.waiting + stats.data.counts.playing;
```

Extend that file's imports: `useBacklogStats` and `useIsPremium` onto the existing `@/api/hooks` import, and `useRouter` onto the existing `expo-router` import.

- [ ] **Step 7: Add the defensive 402 trigger**

In `apps/mobile/src/api/hooks.ts`, change `useBacklogEntryMutation`'s `onError` so a 402 opens the sheet instead of an alert:

```ts
    onError: (error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(keys.games.detail(gameId), context.previous);
      }

      // No Alert: a sheet plus an alert is two dismissals for one event.
      if (isApiError(error) && error.status === 402) {
        router.push("/paywall");
        return;
      }

      alertOnMutationError(error);
    },
```

with `import { router } from "expo-router";` and `isApiError` added to the imports.

- [ ] **Step 8: Add the 402 copy**

In `apps/mobile/src/api/error-copy.ts`, before the final fallback:

```ts
if (error.status === 402) {
  return {
    title: "Your backlog is full",
    description: error.detail ?? "Finish a game to free a spot, or go Premium.",
  };
}
```

Append to `apps/mobile/test/error-copy.test.ts`:

```ts
test("a 402 explains the slot mechanic rather than saying try again", () => {
  const copy = errorCopy(
    new ApiError({
      status: 402,
      type: "https://barklog.gg/problems/payment-required",
      title: "Payment Required",
      detail: "A free backlog holds 10 unfinished games.",
    }),
  );

  expect(copy.title).toBe("Your backlog is full");
  expect(copy.description).toContain("10 unfinished games");
});
```

- [ ] **Step 9: Run the mobile checks**

```bash
pnpm --filter mobile test
pnpm --filter mobile check-types
pnpm --filter mobile lint
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
npx prettier --write apps/mobile/src apps/mobile/test
git add apps/mobile
git commit -m "feat(mobile): paywall sheet, reached two ways

RevenueCat's hosted paywall, so copy and pricing emphasis can change
after the app ships without another App Store review. Presented as a
pageSheet: a dismissible sheet reads as an offer, a full-screen takeover
reads as a wall.

Two triggers, both needed. The proactive one in entry-actions diverts
before mutating, which matters because onMutate writes optimistically —
without it the game appears added and then snaps back. The defensive 402
handler in the mutation covers what the proactive check cannot see: the
share extension, a stale slot count, a race with another device.

An unknown slot count deliberately does not block: guessing would refuse
a legitimate add while stats load, and the 402 is the backstop. The
rating picker needs no check at all, since slotDelta is 0 for a
same-status change."
```

---

### Task 11: Show the cap before it bites

**Files:**

- Modify: `apps/mobile/src/features/backlog/backlog-screen.tsx`
- Create: `apps/mobile/src/features/backlog/slots.ts`
- Test: `apps/mobile/test/slots.test.ts`

**Interfaces:**

- Consumes: `FREE_ACTIVE_SLOTS`, `BacklogStatsWire`, `useIsPremium`.
- Produces: `slotsLabel(stats, premium): string | null`.

At ten slots this is not decoration. A user who watches the counter fill understands a rule; a user who meets an unannounced wall on their eleventh add experiences the chore the judging criterion penalises.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/test/slots.test.ts`:

```ts
import { FREE_ACTIVE_SLOTS, type BacklogStatsWire } from "@repo/contracts";
import { expect, test } from "vitest";

import { slotsLabel } from "@/features/backlog/slots";

const stats = (waiting: number, playing: number): BacklogStatsWire => ({
  total: waiting + playing,
  counts: { waiting, playing, completed: 12, abandoned: 3 },
  averageRating: 7.5,
});

test("premium users see no counter at all", () => {
  expect(slotsLabel(stats(4, 2), true)).toBeNull();
});

test("the counter shows unfinished games against the cap", () => {
  expect(slotsLabel(stats(7, 2), false)).toBe(`9 of ${FREE_ACTIVE_SLOTS} spots used`);
});

test("finished games do not count toward the cap", () => {
  expect(slotsLabel(stats(1, 0), false)).toBe(`1 of ${FREE_ACTIVE_SLOTS} spots used`);
});

test("a full backlog says how to free a spot rather than just refusing", () => {
  expect(slotsLabel(stats(FREE_ACTIVE_SLOTS, 0), false)).toBe(
    "All spots full — finish a game to free one",
  );
});

test("an over-full backlog still reads sensibly, in case a plan change lowered the cap", () => {
  expect(slotsLabel(stats(FREE_ACTIVE_SLOTS + 3, 0), false)).toBe(
    "All spots full — finish a game to free one",
  );
});

test("nothing is shown before stats load", () => {
  expect(slotsLabel(undefined, false)).toBeNull();
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter mobile test -- slots
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement it**

Create `apps/mobile/src/features/backlog/slots.ts`:

```ts
import { FREE_ACTIVE_SLOTS, type BacklogStatsWire } from "@repo/contracts";

/** null when there is nothing to say — premium, or stats not loaded. */
export function slotsLabel(stats: BacklogStatsWire | undefined, premium: boolean): string | null {
  if (premium || stats === undefined) return null;

  const used = stats.counts.waiting + stats.counts.playing;

  if (used >= FREE_ACTIVE_SLOTS) return "All spots full — finish a game to free one";

  return `${used} of ${FREE_ACTIVE_SLOTS} spots used`;
}
```

- [ ] **Step 4: Render it**

`backlog-screen.tsx` already holds `const stats = useBacklogStats()` and `const router = useRouter()`. Add beside them:

```tsx
const premium = useIsPremium();
const slots = slotsLabel(stats.data, premium);
```

Then extend the existing `listHeader` element — the slots line belongs inside it, so it scrolls with the list rather than pinning above it and stealing the large title's collapse target:

```tsx
const listHeader = (
  <View style={styles.header}>
    <StatusFilter value={filter} onChange={setFilter} />
    {stats.data ? <Text style={styles.stats}>{statsLine(stats.data)}</Text> : null}
    {slots === null ? null : (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${slots}. Tap to see Barklog Premium.`}
        onPress={() => router.push("/paywall")}
      >
        <Text style={styles.slots}>{slots}</Text>
      </Pressable>
    )}
  </View>
);
```

Add one entry to that file's `StyleSheet.create`, reusing the `Type` and `PlatformColor` vocabulary the neighbouring `stats` style already uses:

```tsx
  slots: {
    ...Type.footnote,
    color: PlatformColor("link"),
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
```

Add `Pressable` to the existing `react-native` import and `useIsPremium` to the existing `@/api/hooks` import.

- [ ] **Step 5: Run the mobile checks**

```bash
pnpm --filter mobile test
pnpm --filter mobile check-types
pnpm --filter mobile lint
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
npx prettier --write apps/mobile/src apps/mobile/test
git add apps/mobile
git commit -m "feat(mobile): show remaining free slots on the backlog

At ten slots the counter is load-bearing, not decoration: a user who
watches it fill understands a rule, while one who meets an unannounced
wall on their eleventh add experiences exactly the chore this app exists
to remove. A full backlog says how to free a spot rather than only
refusing.

Reuses useBacklogStats, which the screen already calls and which every
backlog mutation already invalidates, so the counter refreshes with no
new wiring. Premium users see nothing."
```

---

### Task 12: Documentation and the device checklist

**Files:**

- Modify: `README.md`
- Modify: `.env.example` (verify Task 7's additions read well in context)
- Create: `docs/premium-device-verification.md`

- [ ] **Step 1: Document the feature in the README**

Add a `## Premium` section after the auth section, covering: the ten-unfinished-slot free tier and that finishing frees a slot; that there are no ads on any tier and this is deliberate; the `premium` entitlement; the two products; that entitlement is enforced in `apps/api` inside a transaction and the client never decides; the webhook at `/webhooks/revenuecat`; and the three new environment variables. Add both `EXPO_PUBLIC_REVENUECAT_TEST_KEY` and `EXPO_PUBLIC_REVENUECAT_IOS_KEY` to the mobile env list already documented there, saying plainly that the first is for development builds only and the second is what ships.

- [ ] **Step 2: Write the device checklist**

Create `docs/premium-device-verification.md`, in the style of `docs/mobile-device-verification.md`. It must state up front that StoreKit configuration files cannot be used — they bypass Apple's servers, so RevenueCat's server-side validation cannot see them — and that sandbox compresses a 1-week trial to about 3 minutes, which is what makes steps 4–6 feasible.

It must also note that the fast loop is RevenueCat's **Test Store**, reached by the development build's `EXPO_PUBLIC_REVENUECAT_TEST_KEY`: no device account needed, correct prices, and renewals compressed to roughly 5 minutes weekly and an hour annually, auto-renewing five times before cancelling. Steps 5 and 6 are far quicker there than in Apple's sandbox, and Test Store purchases arrive as sandbox events — which `isPremium` grants — so they exercise the webhook, the `subscriptions` row and `/api/me` for real. Steps 1–4 and 7–10 should still be repeated against Apple's sandbox before submission, because only that path proves StoreKit itself works.

Steps, each with an explicit expected result:

1. Fresh sandbox Apple Account signed in under Settings → Developer. Add 10 games; the 11th presents the sheet.
2. At 10/10, finish a game; the previously blocked add now succeeds.
3. Purchase yearly. The sheet dismisses and the 11th add succeeds **without relaunching** — this is the listener → refresh → invalidate chain, and a relaunch would hide a failure in it.
4. Confirm `subscriptions` and `subscription_events` rows landed, with `sandbox = true`.
5. Let the trial lapse without cancelling; confirm renewal and that `period_type` moves to `normal`.
6. Cancel; confirm `will_renew` goes false while premium holds, then that the cap returns after expiry.
7. Restore purchases on a second device, same Clerk account.
8. Sign out, sign in as a different Clerk user; confirm premium does **not** carry over.
9. Share a video into the app at 10/10; confirm the sheet appears rather than an Alert.
10. Airplane mode at 10/10; confirm the offline copy appears, not the paywall.

- [ ] **Step 3: Verify the whole repo**

```bash
pnpm test
pnpm lint
pnpm check-types
```

Expected: everything PASS. This is the last gate before the paywall screenshot and submission.

- [ ] **Step 4: Commit**

```bash
npx prettier --write README.md docs .env.example
git add -A
git commit -m "docs: document Premium and how to verify it on device

The device checklist exists because none of this is unit-testable:
StoreKit configuration files bypass Apple's servers, so RevenueCat's
server-side validation cannot see them, and the trial lifecycle only
runs in sandbox.

Two steps are deliberately awkward. The post-purchase add must succeed
without relaunching the app, because a relaunch would mask a broken
listener → refresh → invalidate chain. And signing in as a second Clerk
user must not inherit premium, which is the failure that would otherwise
only appear on a shared device."
```

---

## Post-Implementation: what still gates submission

Not code, and not optional — Apple reviews a first in-app purchase only alongside an app version, so none of this can follow the build.

- [ ] RevenueCat: In-App Purchase Key (.p8) uploaded, then **Import** both products into the `Barklog (App Store)` app rather than adding them by hand — a mistyped identifier is the usual cause of "None of the products registered in the RevenueCat dashboard could be fetched from App Store Connect".
- [ ] Both **App Store** products attached to `barklog_premium`, and a `default` offering whose packages point at them — not at the Test Store products, or a release build's paywall renders empty.
- [ ] The 7-day introductory offer present on **both** subscriptions in App Store Connect. It lives there, not in RevenueCat, and the Test Store does not reproduce it.
- [ ] The Paywall built in the dashboard editor with all of §7's required elements.
- [ ] The release build verified to use `EXPO_PUBLIC_REVENUECAT_IOS_KEY` — check the EAS `production` profile's environment before the submission build, not after.
- [ ] RevenueCat webhook pointed at `https://api.barklog.gg/webhooks/revenuecat` with its `Authorization` secret **and HMAC signing enabled**; that secret, the signing secret and `REVENUECAT_API_KEY` all set in Dokploy's environment. The signing secret is shown only once — if it was not saved, rotate it rather than guessing.
- [ ] **Send test event** from the dashboard returns 200 and lands a `subscription_events` row. Do this before trusting the signature path: a raw-body mistake fails every delivery uniformly, so it reads as a wrong secret rather than a bytes problem.
- [ ] Terms of Use and Privacy Policy live on `barklog.gg` and linked from the paywall — Guideline 3.1.2 is the most common rejection for this shape of app.
- [ ] EU DSA trader status declared, with a P.O. Box rather than a home address if you would rather not publish one. Apple verifies this, so it takes time.
- [ ] Each subscription's review screenshot replaced with the real paywall.
- [ ] `submit.production` in `eas.json` filled in with `ascAppId` so EAS Submit does not stop to prompt.
- [ ] The subscription added to the app version under "In-App Purchases and Subscriptions", **Add for Review** selected, and both submitted together.
- [ ] Offer Codes prepared for judges — they require the app to be live, so generate them the day approval lands.
