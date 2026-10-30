# Premium subscription — retired implementation plan

Historical record, retired during the documentation audit on 2026-10-29. The original task checklist, copied implementation and expected test output are not current instructions and have been removed. Git history retains the original plan; this note preserves its relevant rationale and points to maintained references. Retirement does not certify device or deployment verification.

## Rationale retained

The server that enforces slots also answers entitlement. Device purchase information signals a refresh; it does not grant access. Original competition deadlines, store prices, dashboard status and mobile test paths are not current execution guidance.

## Current references

- [Current implementation reference](../specs/2026-09-01-premium-subscription-design.md)
- [ADR: server derived entitlement](../../adr/0005-server-derived-entitlement.md)
- [Implementation](../../../apps/api/src/entitlement.ts)
- [Tests or verification](../../../docs/premium-device-verification.md)

Use the current workspace manifests and [agent guide](../../../AGENTS.md) for commands and conventions. Start any new change from the current code and ADRs rather than replaying this plan.
