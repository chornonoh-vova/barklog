# Mobile onboarding — retired implementation plan

Historical record, retired during the documentation audit on 2026-10-29. The original task checklist, copied implementation and expected test output are not current instructions and have been removed. Git history retains the original plan; this note preserves its relevant rationale and points to maintained references. Retirement does not certify device or deployment verification.

## Rationale retained

Onboarding precedes authentication for a new visitor and persists a device-level seen flag. It is not account-specific data to clear during an account switch. The old four-page implementation and file paths are obsolete.

## Current references

- [Current implementation reference](../specs/2026-08-28-mobile-onboarding-design.md)
- [Architecture decision index](../../adr/README.md)
- [Implementation](../../../apps/mobile/src/features/onboarding/onboarding-gate.tsx)
- [Tests or verification](../../../apps/mobile/src/features/onboarding)

Use the current workspace manifests and [agent guide](../../../AGENTS.md) for commands and conventions. Start any new change from the current code and ADRs rather than replaying this plan.
