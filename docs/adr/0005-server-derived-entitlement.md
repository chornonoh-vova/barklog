---
status: accepted
---

# Derive entitlement on the server

The server derives Premium from stored subscription facts so the device's entitlement answer agrees with the free-tier cap enforcer. RevenueCat device information signals when to refresh; it is not the authority for granting slots. Webhooks maintain purchase facts, and an on-demand refresh covers the delay after purchase or restore without adding a RevenueCat request to every backlog write.

Webhook event recording and its effect commit in one transaction, so a failed effect does not consume the duplicate-detection id. Subscription writes reject older event timestamps. Cancellation of renewal preserves access until expiry; a null expiry grants a lifetime entitlement. Sandbox purchases also grant Premium because App Review purchases use the sandbox against a production build.

The device requests a server refresh before invalidating its entitlement query. It retains an unknown entitlement as unknown for slot checks instead of treating missing data as proof of a free account.

## Evidence

- [Premium decisions and rejected alternatives](../superpowers/specs/2026-09-01-premium-subscription-design.md)
- [Entitlement derivation](../../apps/api/src/entitlement.ts), [webhook transaction](../../apps/api/src/routes/webhooks.ts), [subscription ordering](../../packages/db/src/queries/subscriptions.ts)
- [Device refresh](../../apps/mobile/src/lib/purchases/refresh.ts), [webhook tests](../../apps/api/test/webhook-routes.test.ts)
