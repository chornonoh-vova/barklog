# Account Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user deletes their account in Clerk, Barklog deletes their data.

**Architecture:** Clerk's native `UserProfileView` already renders the delete action and its confirmation, so there is nothing to build in `apps/mobile`. The API gains a second webhook endpoint, `POST /webhooks/clerk`, which verifies a `user.deleted` delivery and, in one transaction, scrubs the user's `subscription_events` rows and deletes their `users` row — from which `backlog_entries` and `subscriptions` cascade.

**Tech Stack:** Hono, Drizzle, valibot, `@clerk/backend/webhooks`, vitest with Testcontainers.

**Spec:** `docs/superpowers/specs/2026-09-03-account-deletion-design.md`

## Global Constraints

- **No changes to `apps/mobile`.** Clerk's `UserProfileView` already provides the entry point and confirmation.
- **No `DELETE /api/me`.** Clerk is the identity authority.
- **Every response is 200 except a failed signature verification.** Clerk retries any non-2xx, so duplicates, unknown users and irrelevant event types all answer 200.
- **`verifyClerkWebhook` is injected through `AppDeps`**, never imported at the call site — the same rule `auth`, `share` and `revenueCat` follow, and what keeps the suite free of network and of a real signing secret.
- **The scrub uses a keep-list, not a drop-list.** RevenueCat adds fields without warning; a drop-list would leak every future addition.
- **One transaction.** The scrub and the delete commit together or not at all.
- Node `>=24`, pnpm 11. Run everything through `pnpm --filter <workspace> <script>`.

---

### Task 1: Nullable `user_id` and the deletion queries

**Files:**
- Modify: `packages/db/src/schema/subscriptions.ts`
- Create: `packages/db/src/queries/users.ts`
- Modify: `packages/db/src/index.ts`
- Create: `packages/db/drizzle/0006_*.sql` (generated)
- Test: `packages/db/test/user-deletion.test.ts`

**Interfaces:**
- Consumes: `Queryable` from `packages/db/src/client.js`; `users` from `schema/backlog.js`; `subscriptionEvents` from `schema/subscriptions.js`.
- Produces:
  - `deleteUser(db: Queryable, userId: string): Promise<boolean>` — true when a row was deleted.
  - `scrubSubscriptionEvents(db: Queryable, userId: string): Promise<number>` — count of rows scrubbed.
  - Both exported from `@repo/db`.

- [ ] **Step 1: Make `user_id` nullable in the schema**

In `packages/db/src/schema/subscriptions.ts`, change the `subscriptionEvents.userId` column and replace its comment:

```ts
  // Not a foreign key: an event for an unknown user is worth logging. Nullable
  // because account deletion scrubs the identifier while keeping the row —
  // revenue queries outlive the account. See queries/users.ts.
  userId: text("user_id"),
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm --filter @repo/db db:generate`

Expected: a new `packages/db/drizzle/0006_*.sql` containing `ALTER TABLE "subscription_events" ALTER COLUMN "user_id" DROP NOT NULL;`. Open it and confirm it contains nothing else. If drizzle-kit prompts, it has misread the change — abort and re-check step 1.

- [ ] **Step 3: Write the failing test**

Create `packages/db/test/user-deletion.test.ts`:

```ts
import { schema } from "@repo/db";
import { deleteUser, ensureUser, scrubSubscriptionEvents } from "@repo/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, test } from "vitest";

import { createTestDb } from "./helpers.js";

const { db, reset, close } = createTestDb();

const USER = "user_2deleteAAA";

const rawEvent = {
  id: "rc_event_1",
  type: "INITIAL_PURCHASE",
  app_user_id: USER,
  event_timestamp_ms: 2_000,
  product_id: "gg.barklog.app.premium.yearly",
  store: "APP_STORE",
  period_type: "TRIAL",
  purchased_at_ms: 1_000,
  expiration_at_ms: 5_000,
  environment: "PRODUCTION",
  aliases: [USER, "anon_123"],
  subscriber_attributes: { $email: { value: "someone@example.com" } },
  transaction_id: "2000000123456789",
};

async function seed(): Promise<void> {
  await ensureUser(db, USER);
  await db.insert(schema.gameTypes).values({ id: 0, name: "Main Game" });
  await db.insert(schema.games).values({
    id: 1,
    name: "Hollow Knight",
    slug: "hollow-knight",
    gameTypeId: 0,
    totalRatingCount: 100,
    igdbUpdatedAt: new Date("2026-01-01T00:00:00Z"),
  });
  await db.insert(schema.backlogEntries).values({ userId: USER, gameId: 1, status: "playing" });
  await db.insert(schema.subscriptions).values({
    userId: USER,
    productId: "gg.barklog.app.premium.yearly",
    store: "app_store",
    periodType: "trial",
    purchasedAt: new Date(1_000),
    expiresAt: new Date(5_000),
    willRenew: true,
    sandbox: false,
    lastEventAtMs: 2_000,
  });
  await db.insert(schema.subscriptionEvents).values({
    id: "rc_event_1",
    userId: USER,
    type: "INITIAL_PURCHASE",
    payload: rawEvent,
  });
}

beforeEach(async () => {
  await reset();
  await seed();
});

afterAll(close);

test("deleteUser cascades the backlog and the subscription", async () => {
  await expect(deleteUser(db, USER)).resolves.toBe(true);

  expect(await db.select().from(schema.users)).toHaveLength(0);
  expect(await db.select().from(schema.backlogEntries)).toHaveLength(0);
  expect(await db.select().from(schema.subscriptions)).toHaveLength(0);
});

test("deleteUser is idempotent for an absent user", async () => {
  await expect(deleteUser(db, "user_2nobody")).resolves.toBe(false);
  expect(await db.select().from(schema.users)).toHaveLength(1);
});

test("scrubSubscriptionEvents keeps the row, drops the identifiers", async () => {
  await expect(scrubSubscriptionEvents(db, USER)).resolves.toBe(1);

  const rows = await db
    .select()
    .from(schema.subscriptionEvents)
    .where(eq(schema.subscriptionEvents.id, "rc_event_1"));

  expect(rows).toHaveLength(1);
  expect(rows[0].userId).toBeNull();
  // The row still identifies the product and the period, which is what
  // revenue queries group by.
  expect(rows[0].payload).toEqual({
    product_id: "gg.barklog.app.premium.yearly",
    store: "APP_STORE",
    period_type: "TRIAL",
    purchased_at_ms: 1_000,
    expiration_at_ms: 5_000,
    environment: "PRODUCTION",
  });
});

test("scrubSubscriptionEvents drops fields RevenueCat adds later", async () => {
  await db.insert(schema.subscriptionEvents).values({
    id: "rc_event_2",
    userId: USER,
    type: "RENEWAL",
    payload: { ...rawEvent, id: "rc_event_2", some_future_field: "leaks-if-droplist" },
  });

  await expect(scrubSubscriptionEvents(db, USER)).resolves.toBe(2);

  const rows = await db
    .select()
    .from(schema.subscriptionEvents)
    .where(eq(schema.subscriptionEvents.id, "rc_event_2"));

  expect(rows[0].payload).not.toHaveProperty("some_future_field");
  expect(rows[0].payload).not.toHaveProperty("transaction_id");
});

test("scrubSubscriptionEvents leaves other users alone", async () => {
  await ensureUser(db, "user_2otherBBB");
  await db.insert(schema.subscriptionEvents).values({
    id: "rc_event_other",
    userId: "user_2otherBBB",
    type: "RENEWAL",
    payload: rawEvent,
  });

  await expect(scrubSubscriptionEvents(db, USER)).resolves.toBe(1);

  const rows = await db
    .select()
    .from(schema.subscriptionEvents)
    .where(eq(schema.subscriptionEvents.id, "rc_event_other"));

  expect(rows[0].userId).toBe("user_2otherBBB");
});
```

Open `packages/db/test/helpers.ts` first and use whatever it actually exports. If it does not expose a `createTestDb` with `{ db, reset, close }`, copy the setup shape from `packages/db/test/subscriptions-queries.test.ts` instead — that file is the closest sibling.

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm --filter @repo/db test user-deletion`
Expected: FAIL — `deleteUser` and `scrubSubscriptionEvents` are not exported from `@repo/db`.

- [ ] **Step 5: Write the queries**

Create `packages/db/src/queries/users.ts`:

```ts
import { eq, sql } from "drizzle-orm";

import type { Queryable } from "../client.js";
import { users } from "../schema/backlog.js";
import { subscriptionEvents } from "../schema/subscriptions.js";

/**
 * `backlog_entries` and `subscriptions` both declare `onDelete: cascade` on
 * `users.id`, so this one statement clears them too. False for an absent user:
 * a redelivered `user.deleted` must succeed, not throw.
 */
export async function deleteUser(db: Queryable, userId: string): Promise<boolean> {
  const deleted = await db.delete(users).where(eq(users.id, userId)).returning({ id: users.id });

  return deleted.length > 0;
}

/**
 * Keeps the row — revenue queries outlive the account, and `subscription_events`
 * is deliberately not a foreign key — while removing what identifies a person.
 *
 * A keep-list, not a drop-list: RevenueCat adds fields without warning, and a
 * drop-list would retain every future addition. `jsonb_strip_nulls` removes the
 * keys whose source field was absent, so a lifetime purchase loses its null
 * `expiration_at_ms` rather than storing a JSON null.
 */
export async function scrubSubscriptionEvents(db: Queryable, userId: string): Promise<number> {
  const scrubbed = await db
    .update(subscriptionEvents)
    .set({
      userId: null,
      payload: sql`jsonb_strip_nulls(jsonb_build_object(
        'product_id',      ${subscriptionEvents.payload} -> 'product_id',
        'store',           ${subscriptionEvents.payload} -> 'store',
        'period_type',     ${subscriptionEvents.payload} -> 'period_type',
        'purchased_at_ms', ${subscriptionEvents.payload} -> 'purchased_at_ms',
        'expiration_at_ms',${subscriptionEvents.payload} -> 'expiration_at_ms',
        'environment',     ${subscriptionEvents.payload} -> 'environment'
      ))`,
    })
    .where(eq(subscriptionEvents.userId, userId))
    .returning({ id: subscriptionEvents.id });

  return scrubbed.length;
}
```

- [ ] **Step 6: Export the queries**

In `packages/db/src/index.ts`, add below the other query exports:

```ts
export * from "./queries/users.js";
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm --filter @repo/db test user-deletion`
Expected: PASS, five tests.

- [ ] **Step 8: Run the full db suite for regressions**

Run: `pnpm --filter @repo/db test && pnpm --filter @repo/db check-types && pnpm --filter @repo/db lint`
Expected: all pass. `recordSubscriptionEvent` still compiles — its `userId` argument is `string`, which a nullable column accepts.

Then confirm nothing reads the column expecting a non-null value:

Run: `grep -rn "subscriptionEvents.userId\|subscription_events" --include=*.ts packages apps | grep -v node_modules`

Expected: the only hits are `schema/subscriptions.ts`, `queries/subscriptions.ts`, `queries/users.ts`, `testing.ts` and the tests. If any other reader appears, it must handle `null` — `check-types` will have said so already, but a silent `as string` would not show up there.

- [ ] **Step 9: Commit**

```bash
git add packages/db/src/schema/subscriptions.ts packages/db/src/queries/users.ts \
        packages/db/src/index.ts packages/db/drizzle packages/db/test/user-deletion.test.ts
git commit -m "feat(db): delete a user, and scrub their subscription events

subscription_events is deliberately not a foreign key on users, because
revenue queries outlive accounts. So a deletion keeps the row and removes
what identifies a person: user_id becomes null and the payload is rebuilt
from a keep-list.

A keep-list, not a drop-list. RevenueCat adds fields without warning, and
a drop-list would retain every one of them."
```

---

### Task 2: Environment and dependency plumbing

**Files:**
- Modify: `apps/api/src/env.ts`
- Modify: `apps/api/src/types.ts`
- Modify: `apps/api/src/clerk.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/package.json`
- Modify: `apps/api/test/helpers.ts`
- Modify: `.env.example`, `compose.yaml`, `turbo.json`
- Test: `apps/api/test/env.test.ts`

**Interfaces:**
- Consumes: `ApiEnv` from Task 0 (existing), `AppDeps` from `apps/api/src/types.ts`.
- Produces:
  - `type ClerkWebhookEvent = { type: string; data: { id: string } }`
  - `AppDeps.verifyClerkWebhook: (request: Request) => Promise<ClerkWebhookEvent>`
  - `clerkWebhookVerifier(signingSecret: string): AppDeps["verifyClerkWebhook"]` from `apps/api/src/clerk.ts`
  - `ApiEnv.CLERK_WEBHOOK_SIGNING_SECRET: string`

- [ ] **Step 1: Write the failing env test**

Append to `apps/api/test/env.test.ts` (match the file's existing style for building a valid source object — read it first):

```ts
test("CLERK_WEBHOOK_SIGNING_SECRET is required", () => {
  const { CLERK_WEBHOOK_SIGNING_SECRET: _omitted, ...withoutIt } = validEnv();

  expect(() => parseEnv(withoutIt)).toThrow(/CLERK_WEBHOOK_SIGNING_SECRET/);
});
```

If `env.test.ts` has no `validEnv()` helper, add one that returns a complete valid source object and refactor the existing tests onto it in this step.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter api test env`
Expected: FAIL — `parseEnv` accepts the object because the key is not in the schema.

- [ ] **Step 3: Add the variable to the schema**

In `apps/api/src/env.ts`, inside `envSchema`, directly below `CLERK_PUBLISHABLE_KEY`:

```ts
  CLERK_WEBHOOK_SIGNING_SECRET: required,
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter api test env`
Expected: PASS.

- [ ] **Step 5: Add `@clerk/backend` as an explicit dependency**

Run: `pnpm --filter api add @clerk/backend`

It resolves today only as a transitive dependency of `@clerk/hono` under `nodeLinker: hoisted`, which is exactly why it must be declared.

- [ ] **Step 6: Add the verifier type and dep**

In `apps/api/src/types.ts`, above `AppDeps`:

```ts
/**
 * The narrow slice of Clerk's `WebhookEvent` this app reads. Injected like
 * `auth` and `share`, so the suite needs neither network nor a real secret.
 */
export interface ClerkWebhookEvent {
  type: string;
  data: { id: string };
}
```

and inside `AppDeps`, below `webhookSigningSecret`:

```ts
  verifyClerkWebhook: (request: Request) => Promise<ClerkWebhookEvent>;
```

- [ ] **Step 7: Add `/webhooks/clerk` to `PUBLIC_PATHS`**

In `apps/api/src/types.ts`, change the `PUBLIC_PATHS` declaration:

```ts
export const PUBLIC_PATHS: ReadonlySet<string> = new Set([
  ...PROBE_PATHS,
  "/webhooks/revenuecat",
  "/webhooks/clerk",
]);
```

`requireAuth` matches by exact path, so without this entry every delivery is rejected as unauthorised before reaching the handler.

- [ ] **Step 8: Implement the verifier**

Append to `apps/api/src/clerk.ts`:

```ts
import { verifyWebhook } from "@clerk/backend/webhooks";

import type { ClerkWebhookEvent } from "./types.js";

/** Throws on a signature that does not verify; the route turns that into a 400. */
export function clerkWebhookVerifier(signingSecret: string) {
  return async (request: Request): Promise<ClerkWebhookEvent> => {
    const event = await verifyWebhook(request, { signingSecret });

    return { type: event.type, data: { id: event.data.id as string } };
  };
}
```

Merge the `import { clerkMiddleware, getAuth } from "@clerk/hono";` line and this new import block per the file's existing import ordering.

- [ ] **Step 9: Wire it in `index.ts`**

In `apps/api/src/index.ts`, find the `createApp({ ... })` call and add, beside the existing `webhookSigningSecret`:

```ts
  verifyClerkWebhook: clerkWebhookVerifier(env.CLERK_WEBHOOK_SIGNING_SECRET),
```

importing `clerkWebhookVerifier` from `./clerk.js`.

- [ ] **Step 10: Give the test harness a default verifier**

In `apps/api/test/helpers.ts`, beside `unusedRevenueCat`:

```ts
const unusedClerkWebhook: AppDeps["verifyClerkWebhook"] = () => {
  throw new Error("verifyClerkWebhook was not stubbed for this test");
};
```

and add `verifyClerkWebhook: unusedClerkWebhook,` to the `createApp({ ... })` call, above the `...overrides` spread.

- [ ] **Step 11: Document the variable**

In `.env.example`, below `CLERK_PUBLISHABLE_KEY=`:

```
# Signing secret for the user.deleted webhook endpoint. Clerk shows it on the
# endpoint's page under Webhooks. Per-instance: development and production
# have different endpoints and different secrets.
CLERK_WEBHOOK_SIGNING_SECRET=
```

In `compose.yaml`, in the `api` service's `environment` block, below `CLERK_PUBLISHABLE_KEY`:

```yaml
      CLERK_WEBHOOK_SIGNING_SECRET: ${CLERK_WEBHOOK_SIGNING_SECRET:?required}
```

In `turbo.json`, add `"CLERK_WEBHOOK_SIGNING_SECRET"` to the `env` array of the `build`, `test`, `dev` and `start` tasks. All four — `turbo/no-undeclared-env-vars` is an error in this repo.

- [ ] **Step 12: Verify the whole workspace still builds**

Run: `pnpm --filter api test && pnpm --filter api check-types && pnpm --filter api lint`
Expected: all pass. Every existing test still constructs a valid app because the harness supplies the new dep.

- [ ] **Step 13: Commit**

```bash
git add apps/api/src/env.ts apps/api/src/types.ts apps/api/src/clerk.ts apps/api/src/index.ts \
        apps/api/package.json apps/api/test/helpers.ts apps/api/test/env.test.ts \
        .env.example compose.yaml turbo.json pnpm-lock.yaml
git commit -m "feat(api): plumb the Clerk webhook signing secret

verifyClerkWebhook joins auth, share and revenueCat as an injected dep, so
the suite needs neither network nor a real secret.

@clerk/backend becomes an explicit dependency. It resolves today only as a
transitive of @clerk/hono under the hoisted linker, which is the reason to
declare it rather than the reason not to."
```

---

### Task 3: The `user.deleted` route

**Files:**
- Modify: `apps/api/src/routes/webhooks.ts`
- Modify: `README.md`
- Test: `apps/api/test/clerk-webhook.test.ts`

**Interfaces:**
- Consumes: `deleteUser`, `scrubSubscriptionEvents` (Task 1); `AppDeps.verifyClerkWebhook`, `ClerkWebhookEvent`, `PUBLIC_PATHS` (Task 2).
- Produces: `POST /webhooks/clerk`, answering 200 on every path except a failed verification, which is 400.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/test/clerk-webhook.test.ts`:

```ts
import { ensureUser, schema } from "@repo/db";
import { afterAll, beforeEach, expect, test } from "vitest";

import type { AppDeps } from "../src/types.js";

import { callApi, createTestApp, TEST_USER } from "./helpers.js";

/**
 * Stands in for `verifyWebhook`: trusts the body when the test sends the
 * agreed header, throws otherwise. The real verification is Clerk's, and
 * exercising it here would need a real secret and its wire format.
 */
const verifyClerkWebhook: AppDeps["verifyClerkWebhook"] = async (request) => {
  if (request.headers.get("X-Test-Signature") !== "good") {
    throw new Error("signature verification failed");
  }

  return JSON.parse(await request.text()) as { type: string; data: { id: string } };
};

const harness = createTestApp({ verifyClerkWebhook });

const post = (body: unknown, signature: string | null = "good") => ({
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...(signature === null ? {} : { "X-Test-Signature": signature }),
  },
  body: JSON.stringify(body),
  // Not a session route.
  user: null,
});

const deleted = (id = TEST_USER) => ({ type: "user.deleted", data: { id } });

async function seed(): Promise<void> {
  await ensureUser(harness.db, TEST_USER);
  await harness.db.insert(schema.gameTypes).values({ id: 0, name: "Main Game" });
  await harness.db.insert(schema.games).values({
    id: 1,
    name: "Hollow Knight",
    slug: "hollow-knight",
    gameTypeId: 0,
    totalRatingCount: 100,
    igdbUpdatedAt: new Date("2026-01-01T00:00:00Z"),
  });
  await harness.db
    .insert(schema.backlogEntries)
    .values({ userId: TEST_USER, gameId: 1, status: "playing" });
  await harness.db.insert(schema.subscriptionEvents).values({
    id: "rc_event_1",
    userId: TEST_USER,
    type: "INITIAL_PURCHASE",
    payload: { app_user_id: TEST_USER, product_id: "premium.yearly", store: "APP_STORE" },
  });
}

beforeEach(async () => {
  await harness.reset();
  await seed();
});

afterAll(async () => {
  await harness.close();
});

test("user.deleted removes the user and cascades the backlog", async () => {
  const response = await callApi(harness.app, "/webhooks/clerk", post(deleted()));

  expect(response.status).toBe(200);
  expect(await harness.db.select().from(schema.users)).toHaveLength(0);
  expect(await harness.db.select().from(schema.backlogEntries)).toHaveLength(0);
});

test("the subscription event survives, scrubbed", async () => {
  await callApi(harness.app, "/webhooks/clerk", post(deleted()));

  const rows = await harness.db.select().from(schema.subscriptionEvents);

  expect(rows).toHaveLength(1);
  expect(rows[0].userId).toBeNull();
  expect(rows[0].payload).not.toHaveProperty("app_user_id");
  expect(rows[0].payload).toHaveProperty("product_id", "premium.yearly");
});

test("a delivery that does not verify changes nothing", async () => {
  const response = await callApi(harness.app, "/webhooks/clerk", post(deleted(), "bad"));

  expect(response.status).toBe(400);
  expect(await harness.db.select().from(schema.users)).toHaveLength(1);
});

test("redelivery answers 200 and changes nothing", async () => {
  await callApi(harness.app, "/webhooks/clerk", post(deleted()));
  const second = await callApi(harness.app, "/webhooks/clerk", post(deleted()));

  expect(second.status).toBe(200);
  expect(await harness.db.select().from(schema.users)).toHaveLength(0);
});

test("an unknown user answers 200", async () => {
  const response = await callApi(harness.app, "/webhooks/clerk", post(deleted("user_2nobody")));

  expect(response.status).toBe(200);
  expect(await harness.db.select().from(schema.users)).toHaveLength(1);
});

test("another event type answers 200 and deletes nothing", async () => {
  const response = await callApi(
    harness.app,
    "/webhooks/clerk",
    post({ type: "user.updated", data: { id: TEST_USER } }),
  );

  expect(response.status).toBe(200);
  expect(await harness.db.select().from(schema.users)).toHaveLength(1);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter api test clerk-webhook`
Expected: FAIL — every request 404s, because the route does not exist.

- [ ] **Step 3: Implement the route**

In `apps/api/src/routes/webhooks.ts`, add these imports to the existing blocks:

```ts
import { deleteUser, ensureUser, recordSubscriptionEvent, scrubSubscriptionEvents, upsertSubscription } from "@repo/db";
```

Then change `webhookRoutes` so the returned Hono instance chains a second route after the RevenueCat one. Add this `.post(...)` immediately after the existing `.post("/revenuecat", ...)` call's closing `)`:

```ts
    .post("/clerk", async (c) => {
      // `verifyWebhook` reads the request body, and the `/webhooks/*`
      // bodyLimit middleware has already consumed `c.req.raw`'s stream by
      // now. `c.req.text()` is served from Hono's cache, so re-wrapping it in
      // a fresh Request is what lets the HMAC see the bytes as received.
      const raw = await c.req.text();
      const request = new Request(c.req.url, {
        method: "POST",
        headers: c.req.raw.headers,
        body: raw,
      });

      let event;
      try {
        event = await deps.verifyClerkWebhook(request);
      } catch {
        throw problems.create("UNAUTHORIZED", {
          detail: "A valid webhook signature is required.",
        });
      }

      // 200, not 4xx: Clerk sends whatever the endpoint subscribes to, and a
      // rejection would make it retry an event we simply do not act on.
      if (event.type !== "user.deleted") {
        log.info("Clerk event of type {type} ignored", { type: event.type });

        return c.body(null, 200);
      }

      // One transaction: the scrub and the delete commit together, or Clerk's
      // retry finds the account still whole.
      const removed = await deps.db.transaction(async (tx) => {
        await scrubSubscriptionEvents(tx, event.data.id);

        return deleteUser(tx, event.data.id);
      });

      if (!removed) {
        // A redelivery, or a user who never wrote anything. Neither is an error.
        log.info("Clerk user.deleted for unknown user {userId}", { userId: event.data.id });
      }

      return c.body(null, 200);
    });
```

Rename the existing logger binding if needed: the function currently declares `const log = getLogger(["api", "revenuecat"]);`. Change it to two loggers so each route logs under its own category:

```ts
  const log = getLogger(["api", "revenuecat"]);
  const clerkLog = getLogger(["api", "clerk"]);
```

and use `clerkLog` in the new handler.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter api test clerk-webhook`
Expected: PASS, six tests.

If "a delivery that does not verify" fails with 401 rather than 400, that is correct behaviour for this codebase — `problems.create("UNAUTHORIZED", ...)` renders a 401. Change the test's expectation to `401` and leave the route alone; a 401 is still non-2xx, so Clerk retries, which is what matters.

- [ ] **Step 5: Run the full API suite**

Run: `pnpm --filter api test && pnpm --filter api check-types && pnpm --filter api lint`
Expected: all pass, `webhook-routes.test.ts` included.

- [ ] **Step 6: Document it in the README**

In `README.md`, in the section covering webhooks and Clerk, add:

```markdown
### Account deletion

Deleting an account happens in Clerk's native profile view, which the app
already presents from the profile toolbar. Clerk then sends `user.deleted` to
`POST /webhooks/clerk`, and the API removes the `users` row — from which
`backlog_entries` and `subscriptions` cascade — and scrubs the identifiers out
of `subscription_events` while keeping the rows for revenue accounting.

Two settings must be enabled in **each** Clerk instance, because production
does not inherit them from development:

1. The delete-account action in the user profile.
2. A webhook endpoint at `https://api.barklog.gg/webhooks/clerk` subscribed to
   `user.deleted`, whose signing secret becomes `CLERK_WEBHOOK_SIGNING_SECRET`.

Verify against the instance's `/v1/environment` rather than assuming the
setting carried over.

Deleting an account does **not** cancel an App Store subscription. Only Apple
can, from the user's own subscription settings.
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/webhooks.ts apps/api/test/clerk-webhook.test.ts README.md
git commit -m "feat(api): delete Barklog data on Clerk user.deleted

The delete action and its confirmation already exist in Clerk's native
UserProfileView; what was missing is anything listening for the result.

verifyWebhook reads the request body, and the /webhooks/* bodyLimit has
already consumed c.req.raw by the time the handler runs — so the handler
re-wraps Hono's cached text in a fresh Request. Everything but a failed
verification answers 200, because Clerk retries anything else."
```

---

## Manual verification

Automated tests cover the route. These steps cover the parts they cannot.

- [ ] In the **development** Clerk instance, enable delete-account and add the webhook endpoint pointed at your tunnel, subscribed to `user.deleted`.
- [ ] Run the API with `CLERK_WEBHOOK_SIGNING_SECRET` set from that endpoint.
- [ ] In the app, add a game to your backlog, then delete your account from the profile sheet.
- [ ] Confirm against the database: `SELECT count(*) FROM users WHERE id = '<sub>';` returns 0, and the matching `subscription_events` rows have a null `user_id`.
- [ ] Repeat the enablement in the **production** instance and diff `/v1/environment` against development to confirm the setting is actually present.

---

## Self-Review

**Spec coverage:**

| Spec section                                           | Task                          |
| ------------------------------------------------------ | ----------------------------- |
| §2 nullable `user_id`, keep-list scrub                 | Task 1 Steps 1, 5             |
| §2 `DELETE FROM users`, cascade                        | Task 1 Step 5                 |
| §2 idempotency for an absent user                      | Task 1 Step 3, Task 3 Step 1  |
| §3 route shape, 200 on every non-verification path     | Task 3 Step 3                 |
| §3.1 `PUBLIC_PATHS` entry                              | Task 2 Step 7                 |
| §3.1 body re-wrap around the consumed stream           | Task 3 Step 3                 |
| §3.1 injected verifier                                 | Task 2 Steps 6, 8, 10         |
| §3.1 only `user.deleted` acts                          | Task 3 Steps 1, 3             |
| §3.1 one transaction                                   | Task 3 Step 3                 |
| §4 `CLERK_WEBHOOK_SIGNING_SECRET`, `@clerk/backend`    | Task 2 Steps 1–5, 11          |
| §4.1 per-instance Clerk settings                       | Task 3 Step 6, Manual         |
| §5 App Store cancellation warning                      | Task 3 Step 6; landing plan   |
| §6 all six test cases                                  | Task 3 Step 1                 |
| §7 nullable migration, readers tolerate null           | Task 1 Steps 2, 8             |

No gaps. §7's reconciliation job is recorded in the spec as a follow-up, not a
task, and is deliberately absent here.

**Placeholder scan:** No `TBD`, no "similar to Task N", no "add error
handling". Every code step carries the actual content. The one non-literal
artefact is the generated migration filename in Task 1 Step 2 (`0006_*.sql`),
where drizzle-kit owns the suffix — the step states the expected contents and
what to check.

**Type consistency:** `deleteUser` and `scrubSubscriptionEvents` keep the same
names and signatures across Task 1's definition, Task 1's tests, and Task 3's
handler. `ClerkWebhookEvent` is defined in Task 2 Step 6 and consumed by Task 2
Step 8's verifier and Task 3's stub, all with the shape `{ type, data: { id } }`.
`verifyClerkWebhook` is the same key in `AppDeps`, in the harness default, and
in the test override. `CLERK_WEBHOOK_SIGNING_SECRET` is spelled identically in
`env.ts`, `.env.example`, `compose.yaml`, `turbo.json` and the README.

**One expectation flagged as uncertain:** Task 3's "does not verify" test
expects 400, but `problems.create("UNAUTHORIZED", ...)` renders 401 in this
codebase. Step 4 tells the executor to adopt 401 and leave the route alone,
with the reason — any non-2xx makes Clerk retry, which is the property that
matters.
