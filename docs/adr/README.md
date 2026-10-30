# Architecture decisions

These records were backfilled on 2026-10-28 from the current implementation and existing design documents. The date records the backfill, not when each decision was originally made. Specs are maintained implementation references; retired plan records preserve key rationale and navigation, with their original contents in Git history. Where behavior differs from an agreed guarantee, the ADR says so.

| Record                                              | Decision                                             |
| --------------------------------------------------- | ---------------------------------------------------- |
| [0001](0001-local-game-mirror.md)                   | Serve games from a local mirror                      |
| [0002](0002-server-authoritative-backlog-writes.md) | Keep backlog entry writes server-authoritative       |
| [0003](0003-derived-device-backlog.md)              | Derive device views from one backlog query           |
| [0004](0004-account-switch-isolation.md)            | Isolate personal data across account switches        |
| [0005](0005-server-derived-entitlement.md)          | Derive entitlement on the server                     |
| [0006](0006-clerk-account-deletion.md)              | Process account deletion through Clerk notifications |
| [0007](0007-staged-share-identification.md)         | Identify shared links through staged processing      |

## Unresolved guarantees

- **Account switch:** ADR-0004 records the intended isolation rule and the current widget queue gap. It does not select a new coordination design or claim stale work is already suppressed everywhere.
- **Sync cleanup:** ADR-0001 records uncovered startup and unlock failure paths. It does not select a new owner for the run lifetime or claim every acquired connection is already released on failure.

These are code-path findings from inspection, not reproduced runtime failures. A future change should establish failing regression tests before changing the implementation.

## Documented limits

- [ADR-0003](0003-derived-device-backlog.md): device views derive from a list capped at 5,000 entries, although writes do not enforce that total-entry cap.
- [ADR-0007](0007-staged-share-identification.md): extraction cache identities do not include changed title or author metadata.
- [Deployment reference](../superpowers/specs/2026-09-01-container-images-and-deploy-design.md): Dockerfile pruning versions differ from the root Turbo dependency; image publication is not atomic.
- [Share reference](../superpowers/specs/2026-09-08-share-any-link-design.md): the tab revealed after dismissing a warm share requires native verification.
