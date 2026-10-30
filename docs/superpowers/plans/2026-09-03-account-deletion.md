# Account deletion — retired implementation plan

Historical record, retired during the documentation audit on 2026-10-29. The original task checklist, copied implementation and expected test output are not current instructions and have been removed. Git history retains the original plan; this note preserves its relevant rationale and points to maintained references. Retirement does not certify device or deployment verification.

## Rationale retained

Verified Clerk delivery covers native and dashboard deletion without relying on a device request. Scrub retained subscription events and retain a tombstone so later deliveries cannot recreate the account. A database failure must remain retryable; success is not unconditional.

## Current references

- [Current implementation reference](../specs/2026-09-03-account-deletion-design.md)
- [ADR: clerk account deletion](../../adr/0006-clerk-account-deletion.md)
- [Implementation](../../../apps/api/src/routes/webhooks.ts)
- [Tests or verification](../../../apps/api/test/clerk-webhook.test.ts)

Use the current workspace manifests and [agent guide](../../../AGENTS.md) for commands and conventions. Start any new change from the current code and ADRs rather than replaying this plan.
