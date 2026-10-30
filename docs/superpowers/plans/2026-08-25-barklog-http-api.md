# Barklog HTTP interface — retired implementation plan

Historical record, retired during the documentation audit on 2026-10-29. The original task checklist, copied implementation and expected test output are not current instructions and have been removed. Git history retains the original plan; this note preserves its relevant rationale and points to maintained references. Retirement does not certify device or deployment verification.

## Rationale retained

Validation uses shared Valibot contracts. Error rendering and request correlation are deliberately centralized; readiness is bounded and briefly memoized. Search ranking and its cache must be evaluated together, not against obsolete seed-size benchmarks.

## Current references

- [Current implementation reference](../specs/2026-08-25-barklog-api-design.md)
- [ADR: local game mirror](../../adr/0001-local-game-mirror.md)
- [Implementation](../../../apps/api/src/app.ts)
- [Tests or verification](../../../apps/api/test)

Use the current workspace manifests and [agent guide](../../../AGENTS.md) for commands and conventions. Start any new change from the current code and ADRs rather than replaying this plan.
