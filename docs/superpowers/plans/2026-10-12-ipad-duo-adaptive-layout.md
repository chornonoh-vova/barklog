# Adaptive layout — retired implementation plan

Historical record, retired during the documentation audit on 2026-10-29. The original task checklist, copied implementation and expected test output are not current instructions and have been removed. Git history retains the original plan; this note preserves its relevant rationale and points to maintained references. Retirement does not certify device or deployment verification.

## Rationale retained

Use available width and text size rather than device labels to choose layout. Modal style is chosen at presentation; route stacks should survive resizing. Old simulator availability claims are historical, not prerequisites for all development.

## Current references

- [Current implementation reference](../specs/2026-10-12-ipad-duo-adaptive-layout-design.md)
- [Architecture decision index](../../adr/README.md)
- [Implementation](../../../apps/mobile/src/ui/columns.ts)
- [Tests or verification](../../../docs/mobile-device-verification.md)

Use the current workspace manifests and [agent guide](../../../AGENTS.md) for commands and conventions. Start any new change from the current code and ADRs rather than replaying this plan.
