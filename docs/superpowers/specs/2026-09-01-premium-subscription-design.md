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
not saving: it caps how many *unfinished* games you may hold, and finishing one
gives the slot back.

### Goals

- One subscription, two products, server-enforced. A patched client cannot
  unlock the API.
- The free tier is fully usable. No gate stands between a new user and the
  four verbs above.
- The cap is visible from the first session, never a surprise wall.
- Hitting the cap presents a dismissible offer, not a takeover.
- Entitlement state lives in Postgres, so revenue is queryable for a
  `#BuildInPublic` post without opening the RevenueCat dashboard.
- Ads can be added later without a schema migration or an entitlement rename.

### Non-goals

- **Ads.** Deferred to 1.1 — see §11. AdMob on iOS requires
  `useFrameworks: "static"`, and flipping the pod graph before a first-ever
  App Store review, alongside a share extension, `@expo/ui` and Clerk's native
  views, is the most likely way to miss the deadline.
- **Android.** `app.json` is `platforms: ["ios"]` and stays that way.
- **A lifetime / non-consumable product.** Would improve the revenue mix, but
  adds a third product and an entitlement with no expiry to reason about.
- **The dog companion.** It exists only in README copy — no component, no
  asset. Building it is net-new design work, not wiring.
- **Web purchases, Stripe, promotional entitlement grants.** The `store` enum
  admits them so the schema need not change, but nothing reads them in 1.0.

## 2. Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Free tier limit | 25 **unfinished** entries | `waiting` and `playing` count; `completed` and `abandoned` are free. Caps hoarding, not saving. Rewards the judge's verbs. |
| Where the limit is enforced | `packages/db`, inside the upsert transaction | The count and the write must be atomic. A route-level check races. |
| Entitlement authority | The API, backed by Postgres | The API owns backlog writes, so the API must own the entitlement answer. |
| Freshness | RevenueCat webhooks, plus an on-demand REST pull | Webhooks are fast but not synchronous; a user who just paid must not get a 402 on the next tap. |
| Entitlement on device | `GET /api/me` | The UI must agree with the enforcer. `customerInfo` is a change *signal*, never the authority. |
| Products | Monthly $2.99, Yearly $19.99, one group | Minimum App Store Connect surface with a low-commitment entry point. |
| Trial | 7-day introductory offer on both | Judging runs Oct 1–13. A 30-day trial started in September converts to first payment *after* judging closes, leaving zero revenue to report. |
| Paywall UI | RevenueCat Paywalls v2 (`react-native-purchases-ui`) | Remotely editable after Sept 30 without a new build or review. The app ships once; judging happens afterwards. |
| Paywall presentation | `pageSheet`, dismissible | A sheet reads as an offer; a `fullScreenModal` reads as a wall. That is the "chore" line. |
| Entitlement identifier | `premium` | Not `ad_free`: ads arrive in 1.1 under the same entitlement. |

### Rejected alternatives

**A flat 10-entry cap** (the original proposal). An excited new user adds the
games they are playing plus their bucket list in the *first* session, so 10 is
consumed in about ninety seconds — a paywall before value, on the exact verb the
judge scores. 25 unfinished slots is reached in session two or three, by
someone who came back.

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
FREE TIER — 25 active slots

waiting     18  ● counts
playing      4  ● counts
─────────────────────────
completed   31  ○ free
abandoned    7  ○ free

           22 / 25 used
```

`PUT /api/backlog/:gameId` is an upsert that may raise, lower, or not move the
active count. The limit applies to the **delta**, not the total:

| From | To | Δ | Free user at 25/25 |
| --- | --- | --- | --- |
| — (new entry) | `waiting` / `playing` | +1 | blocked |
| `completed` / `abandoned` | `waiting` / `playing` | +1 | blocked |
| `waiting` | `playing` (or reverse) | 0 | allowed |
| `waiting` / `playing` | `completed` / `abandoned` | −1 | allowed |
| any | same status, rating changed | 0 | allowed |

Blocked when `delta > 0 && !premium && activeCount + delta > FREE_ACTIVE_SLOTS`.

`DELETE` always lowers or holds the count, so it is never gated.

### The arithmetic is declared twice, with a parity test

The API's transaction and the app's proactive check must agree exactly — the
failure mode is a button that lies: enabled on device, rejected by the server.

But `@repo/contracts` is a **devDependency** of `packages/db`, not a runtime
one. That is deliberate and load-bearing: it is why
`packages/db/test/status-parity.test.ts` exists at all. `BACKLOG_STATUSES` is
declared in both `packages/db/src/schema/backlog.ts` and
`packages/contracts/src/backlog.ts`, and the parity test asserts they match.

So this follows the established pattern rather than inventing a runtime
dependency: declare the slot rules in both packages and extend the parity test
to cover them.

```ts
// Identical in packages/db/src/schema/subscriptions.ts and
// packages/contracts/src/subscription.ts. Guarded by status-parity.test.ts.

export const FREE_ACTIVE_SLOTS = 25;

export const SLOT_CONSUMING_STATUSES = ["waiting", "playing"] as const;

/** −1, 0 or +1: how a status transition moves the active count. */
export function slotDelta(from: BacklogStatus | null, to: BacklogStatus): -1 | 0 | 1;
```

`SUBSCRIPTION_STORES` and `PERIOD_TYPES` are duplicated on the same terms, for
the same reason, and covered by the same test. Adding a status to one package
and not the other must fail the build, not ship.

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
export async function getEntitlement(
  db: Db,
  userId: string,
  // From AppDeps.production, inverted at the call site. packages/db has no
  // notion of environment, and should not grow one.
  options: { allowSandbox: boolean },
): Promise<Entitlement | null>;

// isPremium = row !== null
//   && (row.expiresAt === null || row.expiresAt > now)
//   && (!row.sandbox || allowSandbox)
```

A stored boolean goes stale the moment a subscription lapses without a webhook
arriving — expiry is the one state change RevenueCat cannot always push in
time. Deriving it costs one comparison.

The `sandbox` term matters: without it, anyone holding a sandbox receipt unlocks
the production API. Passing `allowSandbox` rather than dropping sandbox rows
keeps on-device testing working against a development API.

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

## 5. Enforcement in the query layer

`upsertBacklogEntry` in `packages/db/src/queries/backlog.ts` grows an optional
limit and a blocked outcome:

```ts
export type UpsertResult =
  | { ok: true; entry: BacklogEntry; created: boolean }
  | { ok: false; activeCount: number; limit: number };

export async function upsertBacklogEntry(
  db: Db,
  input: {
    userId: string;
    gameId: number;
    status: BacklogStatusValue;
    rating: number | null;
    /** null = unlimited (premium). */
    activeLimit: number | null;
  },
): Promise<UpsertResult>;
```

The whole thing runs in one transaction opening with `SELECT ... FOR UPDATE` on
the `users` row:

1. Lock the user row. This serializes that user's backlog writes and nothing
   else.
2. Read the existing entry's status (or `null`).
3. `slotDelta(from, to)`. If `≤ 0`, or `activeLimit === null`, skip to 5.
4. Count active entries. If `count + delta > activeLimit`, return
   `{ ok: false, … }` — the transaction commits having changed nothing.
5. Upsert, return `{ ok: true, … }`.

The check cannot live in the route: two concurrent adds at 24/25 would both read
24 and both succeed. The row lock is the cheapest correct answer at this scale,
and it also closes the share-extension-races-the-main-app case.

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
   webhook requests *should* be logged. The existing exact-path comment in
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

3. **Its own authentication.** Constant-time compare of the `Authorization`
   header against `REVENUECAT_WEBHOOK_SECRET`. Use `crypto.timingSafeEqual` on
   equal-length buffers, after a length check.

Status codes are the contract with RevenueCat's retry machinery:

| Case | Status | Why |
| --- | --- | --- |
| Applied | 200 | — |
| Duplicate event id | 200 | Already handled. A non-2xx retries forever. |
| Stale `event_timestamp_ms` | 200 | Deliberately ignored, not failed. |
| Bad or missing secret | 401 | — |
| Unparseable payload | 422 | New `UNPROCESSABLE_WEBHOOK` type, sibling to `UNPROCESSABLE_SHARE`. |
| Unknown `app_user_id` | 200 | Event logged, `subscriptions` upsert skipped. `subscription_events.userId` is deliberately not a foreign key so this row can land — a webhook for a deleted user is not an error, and the log is where you find out it happened. |

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
REVENUECAT_WEBHOOK_SECRET   # the Authorization value set on the webhook
REVENUECAT_API_KEY          # secret API key, for the refresh pull
```

Mirrored in `.env.example` with the dashboard URL, following the existing
commenting style.

## 7. Mobile

### Dependencies

`react-native-purchases@^10.8.1` and `react-native-purchases-ui@^10.8.1`. Both
autolinked, **no config plugin, no `expo-build-properties`, no static
frameworks** — that requirement belongs to AdMob, which 1.0 does not ship. A new
development build is needed, but the pod graph is not disturbed.

`src/env.ts` gains `EXPO_PUBLIC_REVENUECAT_IOS_KEY`, written inline and literal
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

`backlog-screen.tsx` already holds `useBacklogStats()`. Add a "22 / 25 spots"
line for free users, with the mechanic stated where it is read — *finish a game
to free a spot*. The cap being visible from the first session is what makes it a
rule rather than an ambush, and that is the whole difference the judging
criterion turns on.

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

| Path | What |
| --- | --- |
| `packages/contracts/src/subscription.ts` | `FREE_ACTIVE_SLOTS`, `SLOT_CONSUMING_STATUSES`, `slotDelta`, `SUBSCRIPTION_STORES`, `PERIOD_TYPES` |
| `packages/contracts/src/revenuecat.ts` | webhook payload schema |
| `packages/db/src/schema/subscriptions.ts` | both tables, both enums, `FREE_ACTIVE_SLOTS`, `slotDelta` |
| `packages/db/src/queries/subscriptions.ts` | upsert from event, read entitlement, event log insert |
| `packages/db/drizzle/…` | generated migration |
| `apps/api/src/routes/me.ts` | `GET /api/me` |
| `apps/api/src/routes/subscription.ts` | `POST /api/subscription/refresh` |
| `apps/api/src/routes/webhooks.ts` | `POST /webhooks/revenuecat` |
| `apps/api/src/revenuecat.ts` | REST client, secret compare, event → row mapping |
| `apps/mobile/src/purchases/provider.tsx` | configure / logIn / logOut / listener |
| `apps/mobile/src/purchases/use-is-premium.ts` | `GET /api/me` hook |
| `apps/mobile/src/app/paywall.tsx` | `RevenueCatUI.Paywall` in a sheet |

### Changed

| Path | Change |
| --- | --- |
| `packages/contracts/src/index.ts` | re-export the two new modules |
| `packages/contracts/src/wire.ts` | `MeResponse` — the sole declaration, beside `BacklogStatsWire` |
| `packages/db/src/schema/index.ts` | export subscriptions schema |
| `packages/db/src/queries/backlog.ts` | `upsertBacklogEntry` takes `activeLimit`, returns `UpsertResult`; add `countActiveEntries` |
| `packages/db/src/index.ts` | export the new queries |
| `apps/api/src/env.ts` | three RevenueCat vars |
| `apps/api/src/types.ts` | `PUBLIC_PATHS`, `WEBHOOK_BODY_LIMIT_BYTES` |
| `apps/api/src/problems.ts` | `SUBSCRIPTION_REQUIRED`, unprocessable-webhook type |
| `apps/api/src/middleware/auth.ts` | `PUBLIC_PATHS` instead of `PROBE_PATHS` |
| `apps/api/src/app.ts` | scoped body limits, three new routes |
| `apps/api/src/routes/backlog.ts` | map `{ ok: false }` to a 402 problem |
| `apps/api/src/rate-limits.ts` | a scope for `refresh` |
| `apps/mobile/src/env.ts` | `EXPO_PUBLIC_REVENUECAT_IOS_KEY` |
| `apps/mobile/package.json` | two RevenueCat packages |
| `apps/mobile/src/app/_layout.tsx` | `PurchasesProvider`, paywall screen |
| `apps/mobile/src/api/endpoints.ts` | `getMe`, `refreshSubscription` |
| `apps/mobile/src/api/keys.ts` | `keys.me()` |
| `apps/mobile/src/api/hooks.ts` | `useMe`; 402 branch in `onError` |
| `apps/mobile/src/api/error-copy.ts` | 402 case |
| `apps/mobile/src/features/game/entry-actions.tsx` | proactive check |
| `apps/mobile/src/features/backlog/backlog-screen.tsx` | slots indicator |
| `.env.example` | the three API vars |
| `README.md` | monetization section, new env vars |

## 9. Testing

### `packages/contracts`

- `slotDelta` for every row of §3's table, including `null → completed` (0) and
  same-status rating changes (0).

### `packages/db` (testcontainers, as existing)

- Free user at 24/25: adding a 25th `waiting` succeeds; a 26th is blocked.
- Two concurrent upserts at 24/25 — exactly one wins. Without the row lock this
  test fails, which is the point of writing it.
- `completed → waiting` at 25/25 is blocked; `waiting → completed` at 25/25
  succeeds.
- Rating-only change at 25/25 succeeds.
- `activeLimit: null` ignores the cap entirely.
- Parity: `FREE_ACTIVE_SLOTS`, `SLOT_CONSUMING_STATUSES`, `SUBSCRIPTION_STORES`
  and `PERIOD_TYPES` match across `packages/db` and `packages/contracts`, and
  `slotDelta` agrees on every input — extending `status-parity.test.ts`.
- Same webhook event id twice → one `subscription_events` row, one upsert.
- Stale `event_timestamp_ms` → row unchanged.
- `sandbox: true` with `production: true` → `premium` false; with
  `production: false` → true.
- Expired `expiresAt` → `premium` false without any event arriving.

### `apps/api`

- `/webhooks/revenuecat` with no `Authorization` → 401; wrong secret → 401.
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

1. Fresh sandbox account, sign in, add 25 games, confirm the 26th presents the
   sheet.
2. Purchase yearly. Confirm the sheet dismisses and the 26th add succeeds
   *without* an app restart — this exercises the listener → refresh → invalidate
   chain.
3. Confirm `subscriptions` and `subscription_events` rows landed.
4. Let the trial lapse without cancelling; confirm renewal.
5. Cancel; after expiry confirm the cap returns.
6. Restore purchases on a second device, same Clerk account.
7. Sign out, sign in as a different Clerk user; confirm premium does *not*
   carry over.
8. Share a video into the app at 25/25; confirm the defensive path presents the
   sheet rather than an Alert.

## 10. Task order

1. `packages/contracts` — `slotDelta`, `FREE_ACTIVE_SLOTS`, the duplicated
   enums, `MeResponse` in `wire.ts`, tests.
2. `packages/db` — schema, migration, subscription queries, `upsertBacklogEntry`
   rework, the extended parity test, tests. **The cap works end to end after
   this step**, provable without RevenueCat.
3. `apps/api` — problem type, `PUBLIC_PATHS`, scoped body limits, 402 mapping in
   the backlog route, `GET /api/me`. Still no RevenueCat.
4. `apps/api` — webhook route, REST client, `refresh`. Verified with
   RevenueCat's dashboard test event.
5. `apps/mobile` — dependencies, dev build, `PurchasesProvider`, `useMe`.
6. `apps/mobile` — paywall route, both trigger paths, error copy.
7. `apps/mobile` — slots indicator.
8. Device checklist.

Steps 1–3 depend on nothing external and can proceed while the App Store
Connect agreements clear and the backend is being deployed. Step 4 is the first
step that needs a public HTTPS URL.

## 11. Deferred to 1.1 — ads

Researched and deliberately postponed.

**"RevenueCat Ads" is not an ad network.** It is an ad-revenue *tracking* layer,
in public beta since 2026-03-25. Serving still happens through AdMob or
AppLovin; RevenueCat hooks the impression-level revenue callbacks so ad revenue
appears beside subscriptions in Charts. Entering the Catvertising Award
therefore means two integrations, not one.

Viability on this stack:

- `react-native-google-mobile-ads` 16.5.0 (2026-08-18) has an Expo config
  plugin and works under the New Architecture.
- `react-native-purchases` 10.8.1 supports ad tracking; the manual `AdTracker`
  path is required because AdMob's `loadAndTrack` convenience helpers are
  iOS/Android-native only.
- Impression-level revenue must be enabled in the AdMob account.
- **AdMob on iOS wants `useFrameworks: "static"`.** With a share extension,
  `@expo/ui` and Clerk's native views already in the build, this is the single
  largest deadline risk in the project.

The original proposal — a banner on the game detail screen, contextually
related to the current game — does not survive contact with the details. AdMob
has no game-title targeting; `contentUrl` and keywords are hints, not
guarantees, so in practice hyper-casual banners land under the cover art. The
detail screen is also the app's showcase (`hero.tsx`, `similar-games.tsx`) and
the screen most likely to be screenshotted by a judge. And the Catvertising
criterion is explicitly whether ads *"feel natural, useful, or additive rather
than interruptive"* — which a banner nailed to the prettiest screen answers
badly.

The shape worth building instead, in 1.1: a **rewarded** ad offered *beside* the
paywall at the cap — watch 30 seconds, free three slots. The ad then gives the
user something, which answers the Catvertising criterion directly; rewarded
eCPMs run an order of magnitude above banners; and the cap becomes a choice
between two ways forward rather than a wall. Entitlement stays `premium`, so no
migration.

Banner revenue was also the weakest part of the original rationale: general-
interest banner eCPMs run roughly $0.20–$2, which at hackathon scale is cents.
The argument for ads is strategic, not financial.

## 12. Risks

| Risk | Mitigation |
| --- | --- |
| **No deployment configuration exists in this repo.** No Dockerfile, no host config; the API runs against `deps.compose.yaml` locally and `EXPO_PUBLIC_API_URL` points at a workstation. A published app cannot reach localhost, and neither can a webhook. | Being deployed in parallel with this work. Steps 1–3 do not depend on it. **This is the larger half of the remaining work; the subscription feature is the smaller half.** |
| Empty production IGDB mirror — search returns nothing and `gameExists` rejects every backlog write | Run and *time* the initial sync early; it is paced by IGDB rate limits and cannot be compressed. |
| Paid Apps agreement, tax and banking latency. Until active, products cannot be sold or sandbox-tested. | Start on day one. No workaround exists. |
| First-ever App Store review with a first auto-renewable subscription; two passes is common | Submit by ~Sept 20, leaving ten days of buffer. If scope must be cut, cut the dog and all ad work — never the buffer. |
| Guideline 3.1.2 rejection (missing price, trial terms, auto-renew text, EULA or privacy links) | §7's checklist, verified against the built paywall before submission. |
| Each subscription product needs a paywall review screenshot that does not exist yet | Upload a placeholder at product creation; replace before submission. |
| Judges need access; Offer Codes require the app to be live | Prepare the batch and redemption URL; generate the day approval lands. |
| Webhook secret leaking into logs | `honoLogger` does not log headers; do not add the `Authorization` header to any log context. |
| Trial abuse by Clerk account churn | Apple ties introductory-offer eligibility to the Apple ID, not our user id, so a new Clerk account gets no new trial. Accepted as-is. |
