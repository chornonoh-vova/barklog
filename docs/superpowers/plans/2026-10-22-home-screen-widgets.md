# Widgets and persisted backlog — retired implementation plan

Historical record, retired during the documentation audit on 2026-10-29. The original task checklist, copied implementation and expected test output are not current instructions and have been removed. Git history retains the original plan; this note preserves its relevant rationale and points to maintained references. Retirement does not certify device or deployment verification.

## Rationale retained

Widget snapshots derive from the backlog query rather than a second backlog store. Persisted data is per-account and restored as stale. The initial spike, package-install and version-bump tasks are retired; account-switch queue isolation remains open under ADR-0004.

## Current references

- [Current implementation reference](../specs/2026-10-21-home-screen-widgets-design.md)
- [ADR: derived device backlog](../../adr/0003-derived-device-backlog.md)
- [Implementation](../../../apps/mobile/src/features/widgets/widget-sync.tsx)
- [Tests or verification](../../../docs/mobile-device-verification.md)

Use the current workspace manifests and [agent guide](../../../AGENTS.md) for commands and conventions. Start any new change from the current code and ADRs rather than replaying this plan.
