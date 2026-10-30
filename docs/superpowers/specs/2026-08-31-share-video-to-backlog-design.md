# Share a Video, Fetch the Game — Superseded

**Status:** Historical design, superseded by [Share Any Link](2026-09-08-share-any-link-design.md) and [ADR-0007](../../adr/0007-staged-share-identification.md).

The original design made Barklog an iOS share destination so a player could move from a gaming video to candidate games without retyping its title. Selection opens ordinary game detail; existing backlog controls remain responsible for adding a game. That separation and mirror-only candidate search remain in the current design.

The original YouTube/TikTok allowlist, Claude extraction, video-specific identities and bottom-sheet proposal are obsolete. The shipped full-screen modal required a root Stack to preserve the tab controller underneath it; the transparent nested-sheet approach was reversed after device checks. Current retrieval, two-pass extraction, cache identities, presentation, tests and unresolved native-navigation limits are consolidated in the linked reference. This file is not an implementation checklist.
