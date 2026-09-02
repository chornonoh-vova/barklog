# Barklog Premium — Design

**Date:** 2026-09-01
**Status:** Approved for planning
**Depends on:** `2026-08-25-barklog-api-design.md` §auth and §middleware (the
`requireAuth` chain and the problem-details registry),
`2026-08-27-barklog-mobile-design.md` §6 (the game detail screen) and §gates
(the `OnboardingGate` / `AuthGate` nesting)
**Motivated by:** RevenueCat Shipaton 2026, submission deadline
2026-09-30 23:45 PDT

## 1. Purpose

Barklog has no revenue mechanism and has never been published. The RevenueCat
Shipaton requires "a working software application that uses the RevenueCat SDK
to power at least one in-app or web purchase", fully published to the App Store
by the deadline.

Beyond eligibility, this repo is entering the **Influencer Award — Gaming (Mr
Lewis Blogs Gaming)**, whose criterion is:

> For a gaming bucket-list app that makes it easy to save games at the moment of
> discovery. Judges will consider how effectively users can organize, complete,
> rate, and share games, along with whether managing a backlog feels enjoyable
> rather than another chore.

That sentence constrains the monetization design more than any technical
consideration does. Every verb it rewards — save, organize, complete, rate,
share — is a verb a naive cap would tax. So the free tier limits **hoarding**,
not saving: it caps how many _unfinished_ games you may hold, and finishing one
gives the slot back.

### Goals

- One subscription, two products, server-enforced. A patched client cannot
  unlock the API.
- The free tier is fully usable. No gate stands between a new user and the
  four verbs above.
- The cap is visible from the first add, never a surprise wall. At ten slots
  this is not optional polish; it is what separates a rule from an ambush.
- **No ads, on any tier, ever.** A stated product promise, not an omission.
- Hitting the cap presents a dismissible offer, not a takeover.
- Entitlement state lives in Postgres, so revenue is queryable for a
  `#BuildInPublic` post without opening the RevenueCat dashboard.
- Ads can be added later without a schema migration or an entitlement rename.

### Non-goals

- **Ads, permanently.** Not deferred — rejected as a product decision, and
  turned into a selling point instead. See §11.
- **Android.** `app.json` is `platforms: ["ios"]` and stays that way.
- **A lifetime / non-consumable product.** Would improve the revenue mix, but
  adds a third product and an entitlement with no expiry to reason about.
- **The dog companion.** It exists only in README copy — no component, no
  asset. Building it is net-new design work, not wiring.
- **Web purchases, Stripe, promotional entitlement grants.** The `store` enum
  admits them so the schema need not change, but nothing reads them in 1.0.

## 2. Decisions

| Decision                    | Choice                                               | Why                                                                                                                                                                      |
| --------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Free tier limit             | 10 **unfinished** entries                            | `waiting` and `playing` count; `completed` and `abandoned` are free. Caps hoarding, not saving. Rewards the judge's verbs.                                               |
| Where the limit is enforced | `apps/api`, inside a transaction it opens            | The limit is a product rule, so it belongs in the API; `packages/db` stays queries and writes. The transaction is what keeps check-then-write atomic.                    |
| Entitlement authority       | The API, backed by Postgres                          | The API owns backlog writes, so the API must own the entitlement answer.                                                                                                 |
| Freshness                   | RevenueCat webhooks, plus an on-demand REST pull     | Webhooks are fast but not synchronous; a user who just paid must not get a 402 on the next tap.                                                                          |
| Entitlement on device       | `GET /api/me`                                        | The UI must agree with the enforcer. `customerInfo` is a change _signal_, never the authority.                                                                           |
| Products                    | Monthly $2.99, Yearly $19.99, one group              | Minimum App Store Connect surface with a low-commitment entry point.                                                                                                     |
| Trial                       | 7-day introductory offer on both                     | Judging runs Oct 1–13. A 30-day trial started in September converts to first payment _after_ judging closes, leaving zero revenue to report.                             |
| Paywall UI                  | RevenueCat Paywalls v2 (`react-native-purchases-ui`) | Remotely editable after Sept 30 without a new build or review. The app ships once; judging happens afterwards.                                                           |
| Paywall presentation        | `pageSheet`, dismissible                             | A sheet reads as an offer; a `fullScreenModal` reads as a wall. That is the "chore" line.                                                                                |
| Entitlement identifier      | `barklog_premium`                                    | As created in RevenueCat, display name "Barklog Premium". Not `ad_free`, and not because ads are coming later — there are none. It grants unlimited slots, nothing more. |

### Rejected alternatives

**A flat 10-entry cap** (the original proposal). Ten _total_ entries is
consumed in the first session and never recovers, because a finished game keeps
occupying a slot forever — a paywall before value, on the exact verb the judge
scores. Ten _unfinished_ slots is a different rule: it is reached quickly, but
finishing a game always reopens the door, so the wall is never permanent and
never punishes the behaviour the app exists to encourage.

**Twenty-five unfinished slots** (the previous revision). More generous, and it
delays the first paywall to session two or three. Ten was chosen instead to put
the offer in front of engaged users sooner, accepting that some will meet it in
session one. The mitigation is §7's slots indicator: the limit is visible from
the first add, so meeting it is a rule, not an ambush.

**Whole app behind a trial.** Simplest to enforce, strongest revenue signal, but
a hard wall on day 8 for every user and nothing free for the judge to explore.

**Client-only gating.** Half a day of work, but any user with a proxy gets the
IGDB mirror for free, and there is no revenue truth in our own database to
report.

**Per-request RevenueCat REST calls.** Always authoritative, no webhook
infrastructure, but it puts a third-party network hop and rate limit in front of
`GET /api/backlog`.

**Banner ads on the game detail screen.** See §11.

## 3. The slot model

Only `waiting` and `playing` occupy a slot.

```
FREE TIER — 10 active slots

waiting      7  ● counts
playing      2  ● counts
─────────────────────────
completed   31  ○ free
abandoned    7  ○ free

            9 / 10 used
```

`PUT /api/backlog/:gameId` is an upsert that may raise, lower, or not move the
active count. The limit applies to the **delta**, not the total:

| From                      | To                          | Δ   | Free user at 10/10 |
| ------------------------- | --------------------------- | --- | ------------------ |
| — (new entry)             | `waiting` / `playing`       | +1  | blocked            |
| `completed` / `abandoned` | `waiting` / `playing`       | +1  | blocked            |
| `waiting`                 | `playing` (or reverse)      | 0   | allowed            |
| `waiting` / `playing`     | `completed` / `abandoned`   | −1  | allowed            |
| any                       | same status, rating changed | 0   | allowed            |

Blocked when `delta > 0 && !premium && activeCount + delta > FREE_ACTIVE_SLOTS`.

`DELETE` always lowers or holds the count, so it is never gated.

### The arithmetic lives in `packages/contracts`

`slotDelta(from, to)` is pure and belongs to the shared domain contract, beside
`BACKLOG_SORTS` and `RATING_MIN`/`RATING_MAX`. Both runtime consumers —
`apps/api` and `apps/mobile` — already depend on `@repo/contracts`, so it is
declared exactly once:

```ts
export const FREE_ACTIVE_SLOTS = 10;

export const SLOT_CONSUMING_STATUSES = ["waiting", "playing"] as const;

/** −1, 0 or +1: how a status transition moves the active count. */
export function slotDelta(from: BacklogStatus | null, to: BacklogStatus): -1 | 0 | 1;
```

`packages/db` never sees it. `@repo/contracts` is a **devDependency** there, not
a runtime one — the deliberate boundary that `status-parity.test.ts` exists to
police — and the db package has no business knowing what a slot is. §5 covers
how the rule stays atomic without living in the data layer.

`SUBSCRIPTION_STORES` and `PERIOD_TYPES` are the one unavoidable duplication:
`pgEnum` needs the values in `packages/db`, and `MeResponse` needs the union in
`packages/contracts`. That is precisely the `BACKLOG_STATUSES` situation, so
they are declared in both and added to `status-parity.test.ts`.

## 4. Data model

New file `packages/db/src/schema/subscriptions.ts`, exported from
`schema/index.ts`.

```ts
export const SUBSCRIPTION_STORES = ["app_store", "play_store", "stripe", "promotional"] as const;
export const PERIOD_TYPES = ["normal", "trial", "intro", "promotional"] as const;

export const subscriptionStore = pgEnum("subscription_store", SUBSCRIPTION_STORES);
export const periodType = pgEnum("subscription_period_type", PERIOD_TYPES);

/** Current state. One row per user, upserted. The entitlement answer. */
export const subscriptions = pgTable("subscriptions", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull(),
  store: subscriptionStore("store").notNull(),
  periodType: periodType("period_type").notNull(),
  purchasedAt: timestamp("purchased_at", { withTimezone: true }).notNull(),
  // null = never expires. Not nullable-as-unknown: absence means lifetime.
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  willRenew: boolean("will_renew").notNull(),
  sandbox: boolean("sandbox").notNull(),
  // Ordering guard. RevenueCat retries, and can deliver out of order.
  lastEventAtMs: bigint("last_event_at_ms", { mode: "number" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Append-only. The RevenueCat event id is the primary key, so
 * `ON CONFLICT DO NOTHING` *is* the idempotency check — no dedupe table.
 */
export const subscriptionEvents = pgTable("subscription_events", {
  id: text("id").primaryKey(),
  // Deliberately not a foreign key: the log outlives the user row it names.
  userId: text("user_id").notNull(),
  type: text("type").notNull(),
  payload: jsonb("payload").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});
```

### Entitlement is derived, never stored

```ts
// packages/db — returns the row, judges nothing.
export async function getSubscription(
  db: Queryable,
  userId: string,
): Promise<SubscriptionRow | null>;

// apps/api/src/entitlement.ts — owns the policy.
export function isPremium(row: SubscriptionRow | null, now: Date): boolean;
//   row !== null && (row.expiresAt === null || row.expiresAt > now)
```

A stored boolean goes stale the moment a subscription lapses without a webhook
arriving — expiry is the one state change RevenueCat cannot always push in
time. Deriving it costs one comparison.

### Sandbox purchases grant the entitlement

`sandbox` is recorded but is **not** an input to `isPremium`. This is not a
convenience; refusing sandbox entitlements in production is a known App Store
rejection.

App Review tests in-app purchases in Apple's **sandbox** environment against
the **production** build. RevenueCat reports those with `environment: SANDBOX`.
An entitlement check that rejected them would show the reviewer a successful
purchase followed by an unchanged paywall — "purchased but content not
unlocked", one of the most common RevenueCat-adjacent rejections.

Granting them is also safe. Sandbox Apple Accounts are created only by us in
App Store Connect, RevenueCat validates every receipt with Apple, and the
webhook is authenticated by a shared secret. There is no user-reachable path to
a sandbox receipt for this app, so there is nothing to defend against.

What the column is actually for: excluding test purchases from revenue figures.
Every `subscription_events` query that reports money must filter
`sandbox = false`, or the `#BuildInPublic` numbers will include our own device
testing.

Grace periods need no special handling: RevenueCat extends `expiration_at_ms`
for App Store billing-retry, so a user in grace still reads as entitled through
the same comparison.

### `lastEventAtMs` is load-bearing

Apply a webhook event only when `event_timestamp_ms >= lastEventAtMs`. Without
it, a retried `INITIAL_PURCHASE` delivered after a `CANCELLATION` resurrects a
dead subscription.

### Why keep the event log

Trial starts, conversions, cancellations and billing issues become queryable in
Postgres for about fifteen lines of code. That is the difference between a
`#BuildInPublic` post with numbers in it and one without.

## 5. Enforcement — the API owns the rule, the transaction keeps it atomic

The limit is a product rule, so it lives in `apps/api`. `packages/db` stays what
it is: queries and writes. But the check and the write must still be atomic —
two concurrent adds at 9/10 must not both read 9 and both succeed.

Both hold if the **API opens the transaction** and the db package supplies
primitives to run inside it. `upsertBacklogEntry` keeps its current signature
unchanged: no `activeLimit`, no `UpsertResult`, no knowledge of slots.

### One widened type in `packages/db`

Every query currently takes `db: Db`. They need to accept a transaction too,
derived from drizzle rather than by naming its internal generics:

```ts
type Db = NodePgDatabase<typeof schema>;

/** `Db`, or the transaction handle `db.transaction()` hands its callback. */
export type Queryable = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];
```

Then `db: Db` becomes `db: Queryable` across `queries/*.ts`. A mechanical
change, and the only one the db package needs.

### Two new primitives, both dumb

```ts
/** SELECT ... FOR UPDATE on the users row. Serializes one user's writes. */
export async function lockUser(db: Queryable, userId: string): Promise<void>;

/** The caller says which statuses to count. `packages/db` has no idea why. */
export async function countBacklogEntriesByStatus(
  db: Queryable,
  userId: string,
  statuses: readonly BacklogStatusValue[],
): Promise<number>;
```

### The route

```ts
const outcome = await deps.db.transaction(async (tx) => {
  await lockUser(tx, userId);

  const existing = await getBacklogEntry(tx, userId, gameId);
  const delta = slotDelta(existing?.status ?? null, status);

  if (delta > 0) {
    const subscription = await getSubscription(tx, userId);

    if (!isPremium(subscription, new Date())) {
      const used = await countBacklogEntriesByStatus(tx, userId, SLOT_CONSUMING_STATUSES);

      if (used + delta > FREE_ACTIVE_SLOTS) return { blocked: true as const, used };
    }
  }

  return { blocked: false as const, ...(await upsertBacklogEntry(tx, { ... })) };
});
```

`{ blocked: true }` returns from the transaction having written nothing; the
route maps it to §6's 402.

Three things this buys beyond correct layering:

- **The fast path costs nothing.** The subscription read and the count happen
  only when `delta > 0`. A status change, a rating edit, or completing a game
  runs exactly the queries it runs today.
- **The rule is readable in one place**, next to the route it governs, instead
  of being a parameter threaded into a data-access function.
- **The parity test stops growing.** `slotDelta` has one declaration.

### The transaction discipline

No external I/O inside the transaction — no RevenueCat call, no IGDB call. Every
statement above is Postgres, and the lock is held for the span of a few
indexed queries. `ensureUserMiddleware` already runs ahead of every mutating
route, so `lockUser` always finds a row to lock.

## 6. API surface

```
GET  /api/me                    → { premium, entitlement }
POST /api/subscription/refresh  → pulls RevenueCat REST, upserts, returns as above
POST /webhooks/revenuecat       → RevenueCat → Postgres
```

### `GET /api/me`

Authenticated, never entitlement-gated. Carries entitlement only — **no slot
counts**. `GET /api/backlog/stats` already returns `counts` per status, and
`backlog-screen.tsx` already calls `useBacklogStats()`, so the app derives
`used = counts.waiting + counts.playing` from data it holds. Adding a second
source for the same number would mean two things to invalidate.

```ts
export interface MeResponse {
  premium: boolean;
  entitlement: {
    productId: string;
    periodType: PeriodType;
    expiresAt: string | null;
    willRenew: boolean;
  } | null;
}
```

### `POST /api/subscription/refresh`

Fetches `GET https://api.revenuecat.com/v1/subscribers/{app_user_id}` with the
secret API key, upserts, and returns a `MeResponse`. The v1 subscribers endpoint
over v2: it returns the same entitlement shape the webhook carries, so one
mapping function serves both paths, and it needs no project id.

This is the race fix: the webhook usually lands in under
a second, but "usually" is not a guarantee, and the user who just paid tapping
Add and getting a 402 is the worst moment in the funnel. Needs its own
rate-limit scope in `rate-limits.ts` — it reaches a third party.

### `POST /webhooks/revenuecat`

Mounted at `/webhooks/revenuecat`, **outside `/api/*`**, root-mounted like
`probeRoutes`. That placement is deliberate: it skips `requireJson` and the
`/api/*` rate limiter without either needing an exception.

Three changes in `apps/api`:

1. **Exempt from `requireAuth`.** A new exact-path set in `types.ts`, kept
   separate from `PROBE_PATHS` rather than merged into it:

   ```ts
   export const PUBLIC_PATHS: ReadonlySet<string> = new Set([
     ...PROBE_PATHS,
     "/webhooks/revenuecat",
   ]);
   ```

   Separate because `PROBE_PATHS` also drives the `honoLogger` skip, and
   webhook requests _should_ be logged. The existing exact-path comment in
   `middleware/auth.ts` — a prefix allowlist would quietly make a future
   `/healthz-debug` public — applies unchanged.

2. **Scoped body limits.** `bodyLimit` is currently `.use("*", …)` at 16KB.
   RevenueCat payloads carrying subscriber attributes can exceed that, but
   raising the global limit would let anyone POST a megabyte at
   `PUT /api/backlog/:gameId`. Two scoped limiters:

   ```ts
   .use("/api/*",      bodyLimit({ maxSize: BODY_LIMIT_BYTES }))          // 16KB
   .use("/webhooks/*", bodyLimit({ maxSize: WEBHOOK_BODY_LIMIT_BYTES }))  // 1MB
   ```

   Probes are GET-only, so nothing else needs a limit.

3. **Two independent checks.** A constant-time compare of the `Authorization`
   header against `REVENUECAT_WEBHOOK_SECRET`, then an HMAC-SHA256 verification
   of `X-RevenueCat-Webhook-Signature` (`t=<unix>,v1=<hex>`) computed over
   `${t}.${rawBody}` with `REVENUECAT_WEBHOOK_SIGNING_SECRET`.

   Both, not one. The `Authorization` value is a bearer secret: anyone who ever
   sees it — a log, a proxy, an error report — can forge events forever, and a
   forged event here is `upsertSubscription` with an expiry of the attacker's
   choosing. HMAC changes the property from _knows a shared string_ to _can
   prove this body came from RevenueCat_. The header check stays because it
   rejects junk before we touch the body.

   The HMAC must be computed over the bytes **as received**. Re-serialising a
   parsed object changes them and fails every legitimate request — uniformly,
   so it presents as a wrong secret rather than a bytes problem. Hono caches
   request bodies and derives the parsed value from the cached text, so reading
   `c.req.text()` before the validator runs consumes nothing twice.

   Replay needs no separate defence: `subscription_events.id` is the RevenueCat
   event id and the primary key, so a replayed delivery is a duplicate insert
   that changes nothing. RevenueCat also recomputes `t` on every retry, so a
   freshness window would be safe to add — it is simply not what is holding the
   line.

Status codes are the contract with RevenueCat's retry machinery:

| Case                       | Status | Why                                                                                                                                                                                                                              |
| -------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Applied                    | 200    | —                                                                                                                                                                                                                                |
| Duplicate event id         | 200    | Already handled. A non-2xx retries forever.                                                                                                                                                                                      |
| Stale `event_timestamp_ms` | 200    | Deliberately ignored, not failed.                                                                                                                                                                                                |
| Bad or missing secret      | 401    | —                                                                                                                                                                                                                                |
| Unparseable payload        | 422    | New `UNPROCESSABLE_WEBHOOK` type, sibling to `UNPROCESSABLE_SHARE`.                                                                                                                                                              |
| Unknown `app_user_id`      | 200    | Event logged, `subscriptions` upsert skipped. `subscription_events.userId` is deliberately not a foreign key so this row can land — a webhook for a deleted user is not an error, and the log is where you find out it happened. |

Payload validated by a valibot schema in
`packages/contracts/src/revenuecat.ts`, behind Standard Schema like everything
else.

### New problem type

```ts
SUBSCRIPTION_REQUIRED: definition(402),
```

`hono-problem-details` has `402: "Payment Required"` in its phrase table, so
`definition(402)` works unchanged. Thrown with extensions the paywall can render
without a second request:

```ts
throw problems.create("SUBSCRIPTION_REQUIRED", {
  detail: `Free backlogs hold ${limit} unfinished games. Finish one, or go Premium.`,
  extensions: { activeCount, limit },
});
```

### Environment

`apps/api/src/env.ts` gains, all `required`:

```
REVENUECAT_WEBHOOK_SECRET           # the Authorization value set on the webhook
REVENUECAT_WEBHOOK_SIGNING_SECRET   # HMAC secret, shown once at creation
REVENUECAT_API_KEY                  # secret API key, for the refresh pull
```

Mirrored in `.env.example` with the dashboard URL, following the existing
commenting style, and added to `compose.yaml`'s api service using the
`${VAR:?message}` required-variable syntax that deploy design §5 established —
so a missing secret fails at `compose up` naming the variable, rather than at
the first webhook. The values themselves live in Dokploy's environment.

## 7. Mobile

### Dependencies

`react-native-purchases@^10.8.1` and `react-native-purchases-ui@^10.8.1`. Both
autolinked, **no config plugin, no `expo-build-properties`, no static
frameworks** — that requirement belongs to AdMob, which 1.0 does not ship. A new
development build is needed, but the pod graph is not disturbed.

`src/env.ts` gains two keys, written inline and literal
per the transform constraint documented in that file.

### Purchases provider

New `src/purchases/provider.tsx`, mounted inside `ClerkProvider` and outside the
gates, so configuration completes before any screen renders.

- `Purchases.configure({ apiKey, appUserID: null })` once on mount.
- On `userId` appearing → `Purchases.logIn(userId)`; on it going null →
  `Purchases.logOut()`. The Clerk `sub` is the RevenueCat App User ID, which is
  already the `users.id` primary key, so no mapping table.
- Reuse the previous-ref discipline from `auth/should-clear-cache.ts`. Clerk's
  `isSignedIn` flips before a session finishes establishing, and a premature
  `logOut()` detaches the entitlement mid-purchase. Without the switch handling,
  user B on a shared device inherits user A's premium.
- `Purchases.addCustomerInfoUpdateListener` → `POST /api/subscription/refresh`,
  then invalidate `keys.me()`. This is the client half of §6's race fix.

### Entitlement on device

`useIsPremium()` reads `GET /api/me` through react-query, keyed `keys.me()`.
Not `customerInfo`: the API enforces the cap, so the UI must agree with the
enforcer or it ships enabled buttons the server rejects. `customerInfo` is
consulted only as a change signal.

### Slots indicator

`backlog-screen.tsx` already holds `useBacklogStats()`. Add a "9 / 10 spots"
line for free users, with the mechanic stated where it is read — _finish a game
to free a spot_. At ten slots the indicator is load-bearing: a user who watches
the counter fill understands the rule, while a user who meets an unannounced
wall at their eleventh add experiences exactly the chore the judging criterion
penalises.

### The paywall is a route, not a gate

There is no `SubscriptionGate`. The free tier is usable, so a wrapper gate would
be wrong. `src/app/paywall.tsx` renders `RevenueCatUI.Paywall`, registered
alongside `(tabs)` and `shared` in `app/_layout.tsx`:

```tsx
<Stack.Screen name="paywall" options={{ presentation: "pageSheet" }} />
```

### Two trigger paths

1. **Proactive**, in `features/game/entry-actions.tsx`. It already receives
   `entry` and `onUpsert`. Run `slotDelta`; if the transition would exceed the
   limit for a free user, `router.push("/paywall")` instead of mutating.
2. **Defensive**, in `useBacklogEntryMutation.onError` in `api/hooks.ts`.
   Currently every error routes to `alertOnMutationError`. Branch on
   `status === 402`: roll back, push the paywall, and **skip the Alert** — an
   alert plus a sheet is two dismissals for one event.

Both are needed. `onMutate` writes the entry optimistically, so a 402 without
path 1 shows the game as added and then snaps it back. Path 1 removes the flash;
path 2 catches races, stale clients, and the share-extension intake path which
does not go through `entry-actions.tsx`.

`api/error-copy.ts` gains a 402 case ahead of the fallback, so a cap hit never
surfaces as "Please try again."

### Apple-mandated paywall content

Configured in the RevenueCat dashboard, verified before submission:

- Both prices with periods — "$2.99/month", "$19.99/year"
- Trial terms spelled out — "7 days free, then $19.99/year"
- Auto-renew disclosure
- Tappable Terms of Use and Privacy Policy links (live on `barklog.gg`)
- **Restore purchases.** `profile-toolbar.tsx` presents Clerk's
  `UserProfileView`, which is not extensible, so restore lives on the paywall.
  That satisfies the guideline.

Guideline 3.1.2 is the most common rejection for this shape of app. Every item
above is a rejection if missing.

## 8. Files

### New

| Path                                          | What                                                                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/contracts/src/subscription.ts`      | `FREE_ACTIVE_SLOTS`, `SLOT_CONSUMING_STATUSES`, `slotDelta`, `SUBSCRIPTION_STORES`, `PERIOD_TYPES` — the only home for the slot rule |
| `packages/contracts/src/revenuecat.ts`        | webhook payload schema                                                                                                               |
| `packages/db/src/schema/subscriptions.ts`     | both tables, both enums. No slot rule.                                                                                               |
| `packages/db/src/queries/subscriptions.ts`    | `getSubscription` (returns the row, judges nothing), upsert from event, event log insert                                             |
| `packages/db/drizzle/…`                       | generated migration                                                                                                                  |
| `apps/api/src/routes/me.ts`                   | `GET /api/me`                                                                                                                        |
| `apps/api/src/routes/subscription.ts`         | `POST /api/subscription/refresh`                                                                                                     |
| `apps/api/src/routes/webhooks.ts`             | `POST /webhooks/revenuecat`                                                                                                          |
| `apps/api/src/revenuecat.ts`                  | REST client, secret compare, event → row mapping                                                                                     |
| `apps/api/src/entitlement.ts`                 | `isPremium(row, now)` — the policy, in the API                                                                                       |
| `apps/mobile/src/purchases/provider.tsx`      | configure / logIn / logOut / listener                                                                                                |
| `apps/mobile/src/purchases/use-is-premium.ts` | `GET /api/me` hook                                                                                                                   |
| `apps/mobile/src/app/paywall.tsx`             | `RevenueCatUI.Paywall` in a sheet                                                                                                    |

### Changed

| Path                                                  | Change                                                                                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `packages/contracts/src/index.ts`                     | re-export the two new modules                                                                                            |
| `packages/contracts/src/wire.ts`                      | `MeResponse` — the sole declaration, beside `BacklogStatsWire`                                                           |
| `packages/db/src/schema/index.ts`                     | export subscriptions schema                                                                                              |
| `packages/db/src/queries/backlog.ts`                  | `db: Db` → `db: Queryable` throughout; add `lockUser` and `countBacklogEntriesByStatus`. `upsertBacklogEntry` unchanged. |
| `packages/db/src/index.ts`                            | export the new queries and `Queryable`                                                                                   |
| `packages/db/test/status-parity.test.ts`              | extend to `SUBSCRIPTION_STORES` and `PERIOD_TYPES`                                                                       |
| `packages/db/src/client.ts`                           | export the `Queryable` type                                                                                              |
| `packages/db/src/queries/games.ts`, `sync-runs.ts`    | `db: Db` → `db: Queryable`                                                                                               |
| `apps/api/src/env.ts`                                 | three RevenueCat vars                                                                                                    |
| `apps/api/src/types.ts`                               | `PUBLIC_PATHS`, `WEBHOOK_BODY_LIMIT_BYTES`                                                                               |
| `apps/api/src/problems.ts`                            | `SUBSCRIPTION_REQUIRED`, unprocessable-webhook type                                                                      |
| `apps/api/src/middleware/auth.ts`                     | `PUBLIC_PATHS` instead of `PROBE_PATHS`                                                                                  |
| `apps/api/src/app.ts`                                 | scoped body limits, three new routes                                                                                     |
| `apps/api/src/routes/backlog.ts`                      | open the transaction, run the slot rule, map `{ blocked: true }` to a 402 problem                                        |
| `apps/api/src/rate-limits.ts`                         | a scope for `refresh`                                                                                                    |
| `apps/mobile/src/env.ts`                              | `EXPO_PUBLIC_REVENUECAT_TEST_KEY` and `EXPO_PUBLIC_REVENUECAT_IOS_KEY`, selected on `__DEV__`                            |
| `apps/mobile/package.json`                            | two RevenueCat packages                                                                                                  |
| `apps/mobile/src/app/_layout.tsx`                     | `PurchasesProvider`, paywall screen                                                                                      |
| `apps/mobile/src/api/endpoints.ts`                    | `getMe`, `refreshSubscription`                                                                                           |
| `apps/mobile/src/api/keys.ts`                         | `keys.me()`                                                                                                              |
| `apps/mobile/src/api/hooks.ts`                        | `useMe`; 402 branch in `onError`                                                                                         |
| `apps/mobile/src/api/error-copy.ts`                   | 402 case                                                                                                                 |
| `apps/mobile/src/features/game/entry-actions.tsx`     | proactive check                                                                                                          |
| `apps/mobile/src/features/backlog/backlog-screen.tsx` | slots indicator                                                                                                          |
| `.env.example`                                        | the three API vars                                                                                                       |
| `README.md`                                           | monetization section, new env vars                                                                                       |

## 9. Testing

### `packages/contracts`

- `slotDelta` for every row of §3's table, including `null → completed` (0) and
  same-status rating changes (0).

### `packages/db` (testcontainers, as existing)

- `getSubscription` returns the row verbatim, including expired and sandbox
  rows — the judgement is not its job.
- Parity: `SUBSCRIPTION_STORES` and `PERIOD_TYPES` match across `packages/db`
  and `packages/contracts` — extending `status-parity.test.ts`. `slotDelta`
  needs no parity test; it has one declaration.
- `countBacklogEntriesByStatus` counts only the statuses it is given.
- `lockUser` serializes: two concurrent transactions on one user do not
  interleave their counts.
- Same webhook event id twice → one `subscription_events` row, one upsert.
- Stale `event_timestamp_ms` → row unchanged.
- `sandbox: true` grants premium — the App Review path. A test asserting the
  opposite would be asserting a rejection.
- Expired `expiresAt` → `premium` false without any event arriving.

### `apps/api`

The cap tests move here with the rule. These need a database, so they belong in
`apps/api`'s integration suite against the same testcontainers helper:

- Free user at 9/10: a 10th `waiting` succeeds; an 11th is blocked.
- Two concurrent `PUT`s at 9/10 — exactly one wins. Without `lockUser` this
  test fails, which is the point of writing it.
- `completed → waiting` at 10/10 is blocked; `waiting → completed` at 10/10
  succeeds.
- Rating-only change at 10/10 succeeds.
- Premium user at 10/10 is never blocked.
- `isPremium` unit tests: no row, expired, `expiresAt` null, expiry exactly
  now, and `sandbox: true` (granted).

- `/webhooks/revenuecat` with no `Authorization` → 401; wrong secret → 401.
- Valid `Authorization` but missing, malformed, or wrong-secret signature → 401.
- A body tampered after signing → 401, and no row written.
- Valid `Authorization` but missing, malformed, or wrong-secret signature → 401.
- A body tampered after signing → 401, and no row written.
- Reachable without a session token (proves the `PUBLIC_PATHS` wiring).
- `/api/me` without a token → 401.
- Unknown `app_user_id` → 200, a `subscription_events` row, no `subscriptions` row.
- A 16KB+ webhook body succeeds; a 16KB+ body at `PUT /api/backlog/:gameId`
  still gets 413.
- Blocked upsert → 402 carrying `activeCount` and `limit` extensions.

### `apps/mobile` (vitest, pure units, as existing)

- `errorCopy` 402 case.
- The proactive decision function extracted from `entry-actions.tsx` — pure, in
  the style of `should-show-onboarding.ts`.

### Device checklist

Sandbox only, on device: StoreKit configuration files bypass Apple's servers, so
RevenueCat's server-side validation cannot see them. Sandbox compresses a 1-week
trial to roughly 3 minutes, so trial → conversion → cancellation is watchable
end to end.

1. Fresh sandbox account, sign in, add 10 games, confirm the 11th presents the
   sheet.
2. Purchase yearly. Confirm the sheet dismisses and the 11th add succeeds
   _without_ an app restart — this exercises the listener → refresh → invalidate
   chain.
3. Confirm `subscriptions` and `subscription_events` rows landed.
4. Let the trial lapse without cancelling; confirm renewal.
5. Cancel; after expiry confirm the cap returns.
6. Restore purchases on a second device, same Clerk account.
7. Sign out, sign in as a different Clerk user; confirm premium does _not_
   carry over.
8. Share a video into the app at 10/10; confirm the defensive path presents the
   sheet rather than an Alert.

## 10. Task order

1. `packages/contracts` — `slotDelta`, `FREE_ACTIVE_SLOTS`,
   `SLOT_CONSUMING_STATUSES`, the two duplicated enums, `MeResponse` in
   `wire.ts`, tests.
2. `packages/db` — the `Queryable` widening, schema, migration,
   `getSubscription`, `lockUser`, `countBacklogEntriesByStatus`, the extended
   parity test. No product rules land here.
3. `apps/api` — `entitlement.ts`, the transaction and slot rule in the backlog
   route, problem type, `PUBLIC_PATHS`, scoped body limits, `GET /api/me`.
   **The cap works end to end after this step**, provable without RevenueCat by
   inserting a `subscriptions` row by hand.
4. `apps/api` — webhook route, REST client, `refresh`. Verified with
   RevenueCat's dashboard test event.
5. `apps/mobile` — dependencies, dev build, `PurchasesProvider`, `useMe`.
6. `apps/mobile` — paywall route, both trigger paths, error copy.
7. `apps/mobile` — slots indicator.
8. Device checklist.

Steps 1–3 depend on nothing external and can proceed while the App Store
Connect agreements clear and the backend is being deployed. Step 4 is the first
step that needs a public HTTPS URL.

## 11. Rejected — ads, and why their absence is the pitch

Ads were researched in detail and rejected outright, not postponed. "No ads,
ever, on any tier" is now a stated product promise and one of Premium's selling
points: the free tier is not subsidised by the user's attention, and Premium is
framed as supporting a solo developer rather than as buying your way out of an
annoyance.

That reframing is worth more here than the revenue would have been. General-
interest banner eCPMs run roughly $0.20–$2, so at any plausible near-term scale
the ad income is cents. Meanwhile the paywall gets an honest line that a
competitor running AdMob cannot copy.

The research, kept because it justifies the decision:

- **"RevenueCat Ads" is not an ad network.** It is an ad-revenue _tracking_
  layer, in public beta since 2026-03-25. Serving still happens through AdMob or
  AppLovin; RevenueCat hooks the impression-level revenue callbacks so ad revenue
  appears beside subscriptions in Charts. Entering the Catvertising Award would
  have meant two integrations, not one.
- `react-native-google-mobile-ads` 16.5.0 has an Expo config plugin and works
  under the New Architecture, so it was viable.
- AdMob's `loadAndTrack` convenience helpers are iOS/Android-native only, so
  React Native requires the manual `AdTracker` path.
- **AdMob on iOS wants `useFrameworks: "static"`.** With a share extension,
  `@expo/ui` and Clerk's native views in the build, that was the single largest
  technical risk in the project. Rejecting ads removes it permanently.
- The original placement — a banner on the game detail screen, contextually
  matched to the current game — was not achievable regardless. AdMob has no
  game-title targeting; `contentUrl` and keywords are hints, not guarantees.

Consequences of this decision, recorded so they are not rediscovered:

- The Catvertising Award ($20K/$10K/$5K) is out of reach. Accepted.
- `apps/mobile` never takes an ad dependency, so the pod graph is never
  disturbed and `expo-build-properties` is never needed.
- The `barklog_premium` entitlement has exactly one meaning — unlimited slots —
  for the life of the app.

## 12. Risks

| Risk                                                                                                                                                                                                                                                                                            | Mitigation                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~No deployment configuration~~                                                                                                                                                                                                                                                                 | **Resolved.** `api.barklog.gg` is live — `/readyz` reports postgres and valkey up, and the problem-details envelope renders. See `2026-09-01-container-images-and-deploy-design.md`. The webhook target is `https://api.barklog.gg/webhooks/revenuecat`. |
| ~~Empty production IGDB mirror~~                                                                                                                                                                                                                                                                | **Resolved.** Initial sync completed in ~30 minutes.                                                                                                                                                                                                     |
| ~~Paid Apps agreement latency~~                                                                                                                                                                                                                                                                 | **Resolved.** App Store Connect setup complete.                                                                                                                                                                                                          |
| **The first in-app purchase must be reviewed together with an app version.** Apple will not review the subscription independently, so there is no "ship v1.0, add Premium in 1.1" fallback: the paywall must be in the first binary, and a subscription rejection rejects the whole submission. | The paywall is in scope for the first submission by design. Submit by ~Sept 20, leaving ten days of buffer. If scope must be cut, cut the dog — never the buffer.                                                                                        |
| **EU DSA trader status must be declared even if the app is not sold in the EU.** Declaring as a trader publishes a contact address, phone and email on the EU product page.                                                                                                                     | Barklog has a subscription, so it is commercial and the hobbyist carve-out does not apply. Apple accepts a **P.O. Box** in place of a home address. Trader info is verified by Apple, which takes time — do it before submission, not after.             |
| Guideline 3.1.2 rejection (missing price, trial terms, auto-renew text, EULA or privacy links)                                                                                                                                                                                                  | §7's checklist, verified against the built paywall before submission.                                                                                                                                                                                    |
| Each subscription product needs a paywall review screenshot that does not exist yet                                                                                                                                                                                                             | Upload a placeholder at product creation; replace before submission.                                                                                                                                                                                     |
| Judges need access; Offer Codes require the app to be live                                                                                                                                                                                                                                      | Prepare the batch and redemption URL; generate the day approval lands.                                                                                                                                                                                   |
| Webhook secrets leaking into logs                                                                                                                                                                                                                                                               | `honoLogger` does not log headers; do not add `Authorization` or `X-RevenueCat-Webhook-Signature` to any log context.                                                                                                                                    |
| The HMAC signing secret is shown once at creation and cannot be retrieved                                                                                                                                                                                                                       | If it was not saved, rotate it in the dashboard rather than guessing.                                                                                                                                                                                    |
| Trial abuse by Clerk account churn                                                                                                                                                                                                                                                              | Apple ties introductory-offer eligibility to the Apple ID, not our user id, so a new Clerk account gets no new trial. Accepted as-is.                                                                                                                    |
