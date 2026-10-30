# Account deletion reference

Current implementation reference, checked against the repository on 2026-10-29.
The established decision is [ADR-0006](../../adr/0006-clerk-account-deletion.md).

## Flow and rationale

Clerk owns identity and initiates deletion through its account controls or
dashboard. Barklog acts on verified `user.deleted` notifications at
`POST /webhooks/clerk`. There is no separate `DELETE /api/me` path. A webhook
covers dashboard deletion and avoids depending on the app remaining open after
Clerk has deleted the identity.

The [handler](../../../apps/api/src/routes/webhooks.ts) rebuilds a Request from
the cached raw text and original headers before passing it to the injected Clerk
verifier: body-limit middleware has already consumed the original stream.
Verification failure returns 401. Irrelevant event types, missing ids and repeat
deletions return 200.

One database transaction:

1. Scrubs the user's retained subscription events.
2. Records a tombstone for the Clerk id.
3. Deletes the user; backlog and subscription rows cascade.

The transaction keeps deletion, retention and tombstone state consistent on
failure. [User queries](../../../packages/db/src/queries/users.ts),
[backlog schema](../../../packages/db/src/schema/backlog.ts) and
[subscription schema](../../../packages/db/src/schema/subscriptions.ts) define
these effects.

## Retention and later deliveries

Subscription events survive for accounting history, with `user_id` set to null.
Their payload retains only non-null `product_id`, `store`, `period_type`,
`purchased_at_ms`, `expiration_at_ms` and `environment`. An allowlist avoids
retaining future identifying payload additions by default. The event id and type
remain for delivery tracking.

The RevenueCat handler checks the tombstone before recording an event. For an
already deleted user it writes a scrubbed event without recreating the user or
subscription. Tombstones retain the Clerk id and deletion timestamp; no expiry
policy is implemented. SQL scrubbing of old events and TypeScript scrubbing of
new deliveries share a parity test.

Account deletion does not cancel an App Store subscription. This is why later
purchase events must be handled without recreating the account. The retained
records described here concern database deletion behavior, not a claim that all
operational logs or backups have been erased.

## Configuration and verification

The API requires `CLERK_WEBHOOK_SIGNING_SECRET`; see
[environment validation](../../../apps/api/src/env.ts) and
[environment example](../../../.env.example). The selected Clerk instance needs
a webhook endpoint for `/webhooks/clerk` delivering `user.deleted`. The repository
does not establish that a deployed instance is configured correctly.

[Clerk route tests](../../../apps/api/test/clerk-webhook.test.ts) verify rejection,
cascade deletion, scrubbing and harmless redelivery.
[RevenueCat tests](../../../apps/api/test/webhook-routes.test.ts) cover events after
deletion. [Database deletion tests](../../../packages/db/test/user-deletion.test.ts)
and [scrub parity tests](../../../packages/db/test/scrub-parity.test.ts) check the
storage behavior.

Deletion still depends on delivery to the configured webhook. Periodic
reconciliation with Clerk was proposed in the original design and is not
implemented here. These tests establish sequential delivery behavior, not a
blanket guarantee for every overlap between deletion and other in-flight work.
