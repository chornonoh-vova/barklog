# Premium reference

Current implementation reference, checked against the repository on 2026-10-29.
This replaces the implementation proposal and its launch checklist. Durable
subscription and write decisions are in [ADR-0005](../../adr/0005-server-derived-entitlement.md)
and [ADR-0002](../../adr/0002-server-authoritative-backlog-writes.md).

## Product rule and rationale

The free-tier cap is `FREE_ACTIVE_SLOTS` (currently 10). Only `waiting` and
`playing` occupy slots; completing, abandoning or removing an entry releases its
slot. Premium grants unlimited slots. A lapsed subscriber keeps existing entries,
but cannot consume another slot until below the cap or entitled again.

The original design rejected a total-entry cap because completed games would
permanently exhaust it. It also rejected putting the entire app behind a trial,
client-only enforcement and a RevenueCat request on every backlog write. The
recorded product decision is no advertising on either tier. Launch competition
requirements, historical prices, trial durations and third-party setup claims are
not current repository configuration.

[Shared slot arithmetic](../../../packages/contracts/src/subscription.ts) is used
by both server enforcement and the advisory device slot check.

## Server authority

[Entry writes](../../../apps/api/src/backlog/entry-write.ts) lock the user inside a
transaction before reading the entry, subscription and slot count. The cap is
checked only when the move consumes a new slot. This depends on READ COMMITTED
visibility; competing writes must see the preceding commit after taking the lock.
A rejected write returns 402 with the count, cap and number of entries to finish.
Moving an entry preserves an omitted rating; explicit null clears it.

[Entitlement](../../../apps/api/src/entitlement.ts) is derived from stored
subscription expiry: no row is free, a future expiry is Premium, and null expiry
is lifetime access. Renewal cancellation does not revoke an unexpired period.
Sandbox purchases also grant Premium. These are server rules, independent of
what a native purchase sheet reports.

- `GET /api/me` returns entitlement with `private, no-store`.
- `POST /api/subscription/refresh` asks RevenueCat for the authenticated user,
  writes returned purchase facts and returns the same entitlement shape. If the
  fetch returns no subscription, it leaves existing facts unchanged; an upstream
  failure becomes a gateway error.
- `POST /webhooks/revenuecat` verifies the configured authorization and signature,
  validates the event, then records its id and applies its effect in one
  transaction. Duplicate ids are ignored; subscription writes reject older event
  timestamps. Events without applicable purchase facts can still be recorded.

See [webhooks](../../../apps/api/src/routes/webhooks.ts),
[refresh route](../../../apps/api/src/routes/subscription.ts),
[webhook and REST mappings](../../../apps/api/src/revenuecat.ts) and
[subscription queries](../../../packages/db/src/queries/subscriptions.ts).
The two mappings handle different upstream shapes; the database stores facts and
event ordering, while the API owns entitlement policy. Deleted accounts use the
[tombstone and scrubbing path](2026-09-03-account-deletion-design.md).

## Device flow

The purchases provider identifies signed-in users with their Clerk id. SDK
entitlement changes signal a server refresh; SDK customer information is not the
slot authority. Purchase and restore callbacks also request refresh, then
invalidate `/api/me`. The helper retries once and does not rethrow. Paywall
presentation can finish before server entitlement becomes visible.

[Entry writes](../../../apps/mobile/src/features/backlog/entry-writes.ts) inspect
cached entitlement and backlog at tap time. Unknown data allows the request
through. A server 402 opens the paywall and invalidates entitlement without a
second error alert. Writes do not optimistically change the backlog; they
invalidate game and backlog queries when settled.

See the [provider](../../../apps/mobile/src/lib/purchases/provider.tsx),
[refresh helper](../../../apps/mobile/src/lib/purchases/refresh.ts) and
[slot check](../../../apps/mobile/src/features/paywall/should-offer-paywall.ts).
The native offerings and Customer Center require device verification; repository
code cannot establish their deployed dashboard configuration.

## Evidence and limits

- [Cap integration tests](../../../apps/api/test/backlog-cap.test.ts) include competing writes.
- [Webhook tests](../../../apps/api/test/webhook-routes.test.ts) cover delivery ordering and transactional effects.
- [Refresh route tests](../../../apps/api/test/subscription-refresh.test.ts) cover reconciliation.
- Mobile Jest tests cover [refresh](../../../apps/mobile/src/lib/purchases/refresh.test.ts), [provider behavior](../../../apps/mobile/src/lib/purchases/provider.test.tsx) and [entry writes](../../../apps/mobile/src/features/backlog/entry-writes.test.ts).
- [Device verification](../../premium-device-verification.md) covers native purchase and account behavior.

The historical implementation review recorded one unexplained concurrency-test
failure followed by successful reruns. Its retained evidence did not identify a
cause; this document does not promote it to a reproduced bug or claim it fixed.
The existing mirror existence check also precedes the write transaction: a game
removed between check and write can fail its foreign key rather than return the
normal missing-game response. Neither observation changes the intended cap rule.
