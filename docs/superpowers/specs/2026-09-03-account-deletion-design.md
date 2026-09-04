# Account Deletion — Design

**Date:** 2026-09-03
**Status:** Approved for planning

## 1. Purpose

Clerk's `UserProfileView` — already mounted from
`apps/mobile/src/components/profile-toolbar.tsx` — renders a Delete account
action with its own native confirmation. Today that action deletes the Clerk
user and nothing else. Every row Barklog holds for that person survives:
their `users` row, their backlog, their subscription, and the raw RevenueCat
payloads in `subscription_events`.

This design closes that gap. It is a prerequisite for the Privacy policy in
the landing-site design, which must describe a deletion mechanism that
actually works.

### Goals

- Deleting a Clerk account removes the corresponding Barklog data.
- The mechanism is verifiable from the database, not merely asserted in a
  policy document.
- Redelivery is safe. Clerk retries on any non-2xx.

### Non-goals

- **No mobile changes.** Clerk's native view already provides the entry point
  and the confirmation. Building our own would duplicate it.
- **No `DELETE /api/me`.** Clerk is the identity authority; a second deletion
  path that did not go through Clerk would leave the Clerk user alive.
- **No subscription cancellation.** Barklog cannot cancel an App Store
  subscription. Only Apple can, from the user's own subscription settings.
  Section 5 covers how this is communicated rather than worked around.

## 2. Decisions

| Question                      | Decision                                                            |
| ----------------------------- | ------------------------------------------------------------------- |
| Who initiates?                | The user, in Clerk's native `UserProfileView`                       |
| How does the API learn of it? | A `user.deleted` webhook at `POST /webhooks/clerk`                  |
| Verification                  | `verifyWebhook` from `@clerk/backend/webhooks`, injected as a dep   |
| What is deleted?              | `DELETE FROM users` — `backlog_entries` and `subscriptions` cascade |
| `subscription_events`         | Retained, `user_id` nulled, payload stripped                        |
| Idempotency                   | Deleting an absent row is a success, not an error                   |
| Deleted ids                   | A `deleted_users` tombstone, checked by the RevenueCat handler      |

Two decisions deserve their reasoning recorded.

**A webhook, not an API call from the app.** The deletion is initiated inside
Clerk's own native view, which does not surface a hook for us to attach a
prior API call to. Even if it did, an app-initiated `DELETE` would be lost
whenever the process was killed between Clerk's confirmation and our request.
The webhook is the only path that also covers deletions initiated from the
Clerk dashboard.

**`subscription_events` is scrubbed, not dropped.** The table is deliberately
not a foreign key on `users` — its comment records that an event for an
unknown or deleted user is worth logging — and its rows are what revenue
queries read. Deleting them would lose accounting history for a refund window
that outlives the account. But the `payload` jsonb is the raw RevenueCat
event, which carries `app_user_id` and store metadata, so retaining it intact
would keep exactly the identifiers the deletion request was about. The row
therefore survives with its `user_id` set to null and its payload reduced to
the fields revenue queries actually read.

The payload is rewritten to keep `product_id`, `store`, `period_type`,
`purchased_at_ms`, `expiration_at_ms` and `environment`, and to drop
`app_user_id`, `original_app_user_id`, `aliases`, `subscriber_attributes`, and
every transaction, receipt and store-identifier field. The retained set is
what a revenue query groups and filters on; the dropped set is what identifies
a person.

This requires one schema change: `subscription_events.user_id` becomes
nullable.

**Added after the whole-branch review, not part of the original design.** §5 says
deletion cannot cancel an App Store subscription, so RevenueCat keeps delivering
`RENEWAL` and `EXPIRATION` events for a deleted `app_user_id`. The RevenueCat
handler calls `ensureUser`, which recreated the `users` row and the subscription
on the next renewal — the deletion silently reversed itself for exactly the
population this section anticipates.

A `deleted_users` tombstone closes it. The Clerk route writes it in the same
transaction as the scrub and the delete; the RevenueCat handler checks it before
recording anything, and for a tombstoned id records the event with a null
`user_id` and a scrubbed payload, skipping `ensureUser` and `upsertSubscription`
entirely. The delivery still answers 200, so RevenueCat does not retry.

The keep-list consequently exists twice — as SQL in `scrubSubscriptionEvents`
and as TypeScript for this path. They are not shared; a parity test asserts they
produce the same key set, the same way `status-parity.test.ts` guards the
duplicated status enums.

## 3. The route

`POST /webhooks/clerk`, alongside the existing `/webhooks/revenuecat` in
`apps/api/src/routes/webhooks.ts`.

It follows that route's established shape: verify, validate, act in one
transaction, answer 200. Status codes are a contract with the sender —
anything but 2xx is retried, so duplicates and irrelevant event types answer
200 too.

### 3.1 Constraints the route must respect

- **`PUBLIC_PATHS` must gain `/webhooks/clerk`.** `requireAuth` matches by
  exact path, so without the entry every delivery is rejected as unauthorised
  before reaching the handler.
- **The body must be re-wrapped, not passed through.** `verifyWebhook` takes a
  standard `Request` and reads its body. By the time the handler runs, the
  `/webhooks/*` `bodyLimit` middleware has already consumed `c.req.raw`'s
  stream, so passing `c.req.raw` straight in fails. The handler reads
  `await c.req.text()` — which Hono serves from its cache — and constructs a
  fresh `Request` carrying that text and the original headers. The HMAC must
  see the bytes as received, which is the same reason the RevenueCat route
  reads `text()` before its validator.
- **Verification is injected, not imported at the call site.** `AppDeps` gains
  a `verifyClerkWebhook` member, mirroring `auth`, `share` and `revenueCat`.
  This is what keeps the suite free of network and of a real signing secret.
- **Only `user.deleted` acts.** Every other event type is logged and answered 200. Clerk sends whatever the endpoint is subscribed to, and a 4xx on an
  unrecognised type would make Clerk retry it forever.
- **One transaction.** The scrub of `subscription_events` and the `DELETE FROM
users` commit together, or neither does and Clerk's retry finds the account
  still whole.

## 4. Configuration

One new environment variable, `CLERK_WEBHOOK_SIGNING_SECRET`, threaded through
`apps/api/src/env.ts` (as `required`), `compose.yaml`'s `api` service,
`.env.example`, and the `env` lists in `turbo.json`'s `build`, `test`, `dev`
and `start` tasks.

`@clerk/backend` becomes an explicit dependency of `apps/api`. It is present
today only as a transitive dependency of `@clerk/hono`, and `nodeLinker:
hoisted` makes that import resolve — which is precisely why it must be
declared rather than relied upon.

### 4.1 The Clerk instance settings

Two switches must be thrown in the Clerk dashboard, and **both are
per-instance**: the production instance does not inherit them from
development.

1. Enable the delete-account action in the user profile.
2. Create a webhook endpoint pointed at `https://api.barklog.gg/webhooks/clerk`
   subscribed to `user.deleted`, and copy its signing secret.

Verify against the instance's `/v1/environment` rather than assuming the
setting carried over. This exact class of mistake — assuming production
inherits development's Clerk configuration — has already cost time on this
project once.

## 5. What the user must be told

Deleting the account does not cancel an active App Store subscription. Apple
owns that transaction; Barklog cannot cancel it, and a user who deletes their
account while subscribed will keep being billed until they cancel through
Apple.

Clerk's native confirmation dialog is not ours to edit, so this cannot be said
at the moment of deletion. It is stated in the Terms and in the Privacy
policy instead, and the landing-site design carries the wording.

## 6. Testing

The existing webhook suite is the template.

- A delivery whose signature does not verify is rejected, and nothing is
  deleted.
- `user.deleted` for a user with backlog entries and a subscription leaves
  zero rows in `users`, `backlog_entries` and `subscriptions`, verified by
  count rather than by the response status.
- The matching `subscription_events` rows survive with a null `user_id` and a
  payload carrying none of the stripped identifiers.
- Redelivery of the same `user.deleted` answers 200 and changes nothing.
- An event type other than `user.deleted` answers 200 and deletes nothing.
- A `user.deleted` for an id with no `users` row answers 200.

## 7. Consequences

- `subscription_events.user_id` becomes nullable, so every read of it must
  tolerate null. A Drizzle migration accompanies the change.
- A `deleted_users` table is added, and the RevenueCat handler gains a branch it
  did not have. Tombstones are retained indefinitely: the row is a Clerk `sub`
  and a timestamp, and forgetting one would let the resurrection return.
- The API gains its second webhook sender, and with it a second signing
  secret. `PUBLIC_PATHS` now allowlists two unauthenticated webhook paths
  rather than one, so its exact-match rule matters more than it did.
- Deletion depends on webhook delivery. Clerk retries on failure, but a
  permanently disabled endpoint would leave rows orphaned with no alarm. A
  periodic reconciliation against Clerk's user list would close this and is
  recorded as a follow-up, not built here — the rows are keyed on a Clerk
  `sub` that can never authenticate again, so the exposure is storage, not
  access.
