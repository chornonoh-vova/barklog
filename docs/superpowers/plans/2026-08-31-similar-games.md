# Similar games — retired implementation plan

Historical record, retired during the documentation audit on 2026-10-29. The original task checklist, copied implementation and expected test output are not current instructions and have been removed. Git history retains the original plan; this note preserves its relevant rationale and points to maintained references. Retirement does not certify device or deployment verification.

## Rationale retained

Similar-game edges can reference a game not yet mirrored; queries join only available games. Keep suggestions on their own cacheable request rather than embedding them in personal game detail.

## Current references

- [Current implementation reference](../specs/2026-08-31-similar-games-design.md)
- [ADR: local game mirror](../../adr/0001-local-game-mirror.md)
- [Implementation](../../../packages/db/src/schema/mirror.ts)
- [Tests or verification](../../../apps/api/test/games-routes.test.ts)

Use the current workspace manifests and [agent guide](../../../AGENTS.md) for commands and conventions. Start any new change from the current code and ADRs rather than replaying this plan.
