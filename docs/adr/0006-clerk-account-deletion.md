---
status: accepted
---

# Process account deletion through Clerk notifications

Clerk owns identity and initiates deletion through its native account controls or dashboard. Barklog processes verified `user.deleted` notifications rather than requiring a device request that could be lost when the app closes or miss a dashboard deletion.

One transaction scrubs retained subscription events, records a tombstone and deletes the user; backlog and subscription rows cascade. Subscription events survive for accounting history, with a null user id and an explicit allowlist of non-identifying purchase fields. Tombstones are retained so later RevenueCat deliveries are recorded scrubbed without recreating the deleted account. Duplicate or irrelevant deliveries receive success responses to avoid pointless retries.

Deleting the account does not cancel an App Store subscription: only the user can cancel through Apple. This distinction also explains why subscription notifications can continue after deletion and why a tombstone is necessary.

## Evidence

- [Account deletion design and rejected alternatives](../superpowers/specs/2026-09-03-account-deletion-design.md)
- [Webhook implementation](../../apps/api/src/routes/webhooks.ts)
- [Deletion tests](../../apps/api/test/clerk-webhook.test.ts), [post-deletion subscription tests](../../apps/api/test/webhook-routes.test.ts)
