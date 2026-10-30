# Mobile app — retired implementation plan

Historical record, retired during the documentation audit on 2026-10-29. The original task checklist, copied implementation and expected test output are not current instructions and have been removed. Git history retains the original plan; this note preserves its relevant rationale and points to maintained references. Retirement does not certify device or deployment verification.

## Rationale retained

Routes wire navigation; features own behavior. Per-tab game routes preserve the current tab stack. The original pure-only Vitest approach is obsolete: current mobile tests use Jest and render hooks, screens and routes.

## Current references

- [Current implementation reference](../specs/2026-08-27-barklog-mobile-design.md)
- [ADR: derived device backlog](../../adr/0003-derived-device-backlog.md)
- [Implementation](../../../apps/mobile/src/app/_layout.tsx)
- [Tests or verification](../../../apps/mobile/test/README.md)

Use the current workspace manifests and [agent guide](../../../AGENTS.md) for commands and conventions. Start any new change from the current code and ADRs rather than replaying this plan.
