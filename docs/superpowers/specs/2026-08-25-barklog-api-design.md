# API and mirror reference

Current implementation reference, checked against the repository on 2026-10-29.
This replaces the original implementation proposal; historical seed measurements,
SQL copies and task lists are available in Git history. Domain terms come from
[CONTEXT.md](../../../CONTEXT.md); durable decisions live in the [ADRs](../../adr/README.md).

## Boundaries and data

The Hono API serves game data from the Postgres mirror. The separate worker
retrieves IGDB data and owns sync runs; the API has no IGDB client dependency.
Shared Valibot contracts define request validation and wire shapes. Drizzle schema
and migrations, rather than copied SQL in this document, define storage.

- [API composition](../../../apps/api/src/app.ts) and [contracts](../../../packages/contracts/src/index.ts)
- [Mirror schema](../../../packages/db/src/schema/mirror.ts) and [backlog schema](../../../packages/db/src/schema/backlog.ts)
- [Game queries](../../../packages/db/src/queries/games.ts) and [backlog queries](../../../packages/db/src/queries/backlog.ts)

A backlog entry is keyed by user and game, with one status and an optional integer
rating from 1 to 10. User ids are Clerk ids; authenticated mutating API requests
provision the user as needed. Subscription and deletion webhooks have separate
provisioning and tombstone handling.

The mirror's slug index is deliberately non-unique so a transferred upstream slug
does not reject a sync page. Parent game ids are soft references because a parent
may arrive on a later page. Reference entities arrive with game payloads, avoiding
ordering dependencies between separate reference syncs.

## HTTP surface

All `/api` routes require authentication. The exact public-path allowlist contains
`/healthz`, `/readyz`, `/webhooks/revenuecat` and `/webhooks/clerk`; webhook handlers
perform their own verification. See [authentication](../../../apps/api/src/middleware/auth.ts)
and [path constants](../../../apps/api/src/types.ts).

| Routes                                           | Behavior                                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `GET /api/games/search`                          | Mirror search with validated query, limit and offset                                      |
| `GET /api/games/popular`, `/upcoming`, `/recent` | Mirror feeds                                                                              |
| `GET /api/games/:id/similar`                     | Related games from the mirror                                                             |
| `GET /api/games/:id`                             | Details plus the caller's backlog entry                                                   |
| `POST /api/games/identify`                       | Shared-link identification; see [ADR-0007](../../adr/0007-staged-share-identification.md) |
| `GET /api/backlog`                               | List with optional status/sort and ETag revalidation                                      |
| `GET /api/backlog/stats`                         | Server counts and average rating; mobile derives its views from the list                  |
| `PUT /api/backlog/:gameId`                       | Create/update; omitted rating is preserved, explicit null clears it                       |
| `DELETE /api/backlog/:gameId`                    | Remove entry; 404 when absent                                                             |
| `GET /api/me`, `POST /api/subscription/refresh`  | Server-derived entitlement                                                                |
| `GET /api/sync/status`                           | Latest run summary, excluding its internal error text                                     |

The backlog list has no pagination and its query returns at most
`BACKLOG_SOFT_CAP` entries (currently 5,000). Writes do not enforce that total-entry
limit. The intended full-list model therefore has a boundary: larger backlogs are
truncated, and device counts derived from that response need not match the server
counts. The free-tier cap applies to unfinished entries, not total list size. Writes use server confirmation
and device refetching, as recorded in [ADR-0002](../../adr/0002-server-authoritative-backlog-writes.md).
Current parameters and response behavior are in the [routes](../../../apps/api/src/routes/games.ts),
[backlog routes](../../../apps/api/src/routes/backlog.ts) and contracts.

## Caching and failures

Search, feeds and similar-game results use versioned Valkey keys; feeds also use a
UTC day bucket. Game details embed personal data and do not enter the shared
cache. Backlog responses use `private, no-cache` with ETags; entitlement responses
use `private, no-store`. [Cache keys](../../../apps/api/src/cache-keys.ts) hold the
current TTLs. Share retrieval and extraction have their own caches and failure
policy in ADR-0007.

Cache operations fail open, but readiness requires both Postgres and Valkey.
[Probes](../../../apps/api/src/routes/probes.ts) bound and briefly cache dependency
checks. Middleware applies body limits, per-user rate limits and security headers;
[Problem Details](../../../apps/api/src/problems.ts) provide the error envelope.

## Sync runs

[Sync orchestration](../../../apps/worker/src/sync.ts) takes a session advisory
lock, reads an overlapping successful watermark and pages by game id. Each
[persisted page](../../../apps/worker/src/persist.ts) commits transactionally.
A screenshot sweep runs before success. A successful run records its watermark
before requesting a best-effort search-cache version bump.

A failed run can leave committed pages in the mirror; it does not roll back the
whole run. Replay-safe page writes and the unchanged successful watermark allow
retry. Startup and unlock failures can still skip connection release: the
[ADR-0001 cleanup gap](../../adr/0001-local-game-mirror.md) remains unresolved.

## Validation and operations

Use [README.md](../../../README.md) and workspace manifests for setup and commands.
Backend tests use Vitest; database/cache integration tests require Docker through
Testcontainers. [Game route tests](../../../apps/api/test/games-routes.test.ts),
[backlog tests](../../../apps/api/test/backlog-routes.test.ts),
[HTTP invariants](../../../apps/api/test/invariants.test.ts),
[sync tests](../../../apps/worker/test/sync.test.ts) and
[page replay tests](../../../apps/worker/test/persist.test.ts) cover these boundaries.
The IGDB live contract test is a separate script in the
[IGDB manifest](../../../packages/igdb/package.json), not proof that every ordinary
local test run has contacted upstream.
