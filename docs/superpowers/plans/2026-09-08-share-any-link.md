# Any-link identification — retired implementation plan

Historical record, retired during the documentation audit on 2026-10-29. The original task checklist, copied implementation and expected test output are not current instructions and have been removed. Git history retains the original plan; this note preserves its relevant rationale and points to maintained references. Retirement does not certify device or deployment verification.

## Rationale retained

Metadata retrieval and extraction escalate only when necessary. Failures must escape cache loaders; fallback belongs outside them. The wire provider remains a legacy sizing token, not the arbitrary real provider name proposed in the original plan.

## Current references

- [Current implementation reference](../specs/2026-09-08-share-any-link-design.md)
- [ADR: staged share identification](../../adr/0007-staged-share-identification.md)
- [Implementation](../../../apps/api/src/routes/games.ts)
- [Tests or verification](../../../apps/api/test/identify-routes.test.ts)

Use the current workspace manifests and [agent guide](../../../AGENTS.md) for commands and conventions. Start any new change from the current code and ADRs rather than replaying this plan.
