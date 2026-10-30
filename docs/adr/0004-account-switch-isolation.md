---
status: accepted
---

# Isolate personal data across account switches

Personal device data belongs to a Clerk user id, not merely to a signed-in session. Detect account switches by user id because one signed-in account can replace another without a signed-out interval; a signed-out cold start also needs to clear data left by a revoked session.

The intended rule is that recents, query data and widget data from the previous account must not carry into the next account. Persisted backlog keys are per-account, and persistence has a stop guard for delayed restores and queued saves. Clerk's pending authentication flow must not be mistaken for sign-out.

## Known gap and open decision

The widget queue serializes work but does not give it account ownership. An in-flight cover download can finish and publish the previous backlog after clearing was requested; a newer queued push can replace a pending clear. Existing clearing tests drain the preceding push first, so they do not establish isolation during that overlap.

The isolation requirement is established; how to coordinate cancellation, clearing and stale-work suppression remains open. This record does not claim that all personal asynchronous work is already protected or select a new module design. Test an account switch with a deferred cover download and restore before choosing the implementation.

## Evidence

- [Widget design: account-switch clearing](../superpowers/specs/2026-10-21-home-screen-widgets-design.md)
- [Authentication coordination](../../apps/mobile/src/lib/auth/auth-gate.tsx), [persistence guard](../../apps/mobile/src/lib/query/query-persist-policy.ts), [widget queue](../../apps/mobile/src/features/widgets/sync.ts)
- [Authentication tests](../../apps/mobile/src/lib/auth/auth-gate.test.tsx), [widget queue tests](../../apps/mobile/src/features/widgets/sync.test.ts)
