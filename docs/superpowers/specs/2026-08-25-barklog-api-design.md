# Barklog API — Architecture Design

**Date:** 2026-08-25
**Status:** Approved for planning

## 1. Purpose

Barklog lets a player track their gaming backlog. Every game a user tracks has
exactly one status (`waiting`, `playing`, `completed`, `abandoned`) and an
optional personal rating from 1 to 10.

The game library itself comes from [IGDB](https://www.igdb.com/api). It is
mirrored into our own Postgres by a nightly job. **No user request ever reaches
IGDB.** Search, game details and the explore feed are all served from the
mirror.

### Goals

- A CRUD core for personal backlogs, backed by constraints the database
  enforces rather than application code.
- A nightly sync that is incremental, idempotent, and safe to re-run.
- Search that feels good on a phone: fast, typo-tolerant, and useful after four
  keystrokes.
- Uniform, machine-readable errors and a hardened HTTP surface.

### Non-goals for v1

Social features, lists beyond the single backlog, notes or reviews on an entry,
play-time tracking, Android, and any admin UI. Deferred items are listed in
§17.

## 2. Decisions

| Decision      | Choice                                      | Why                                                                                                              |
| ------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Identity      | Clerk (hosted)                              | First-class Expo SDK; API verifies JWTs against JWKS, so no per-request call to Clerk.                           |
| Auth coverage | Entire API                                  | Only `/healthz` and `/readyz` are public.                                                                        |
| Mirror scope  | Full mirror, incremental after seed         | 374k games is only 748 IGDB requests. A full mirror costs little and removes every runtime dependency on IGDB.   |
| DB access     | Drizzle ORM                                 | TypeScript-first, thin over SQL, bulk upsert via `onConflictDoUpdate`, clean raw-SQL escape hatch for `pg_trgm`. |
| Search        | `pg_trgm` GIN + popularity ranking          | No extra container; typo- and prefix-tolerant.                                                                   |
| Sync runner   | Separate worker process                     | A long IGDB pull never competes with request handling.                                                           |
| Cache         | Valkey: IGDB token + search/popular results | Chosen deliberately over caching game details — see §10.                                                         |
| Rating scale  | 1–10 integer                                | Matches how players talk about scores; `smallint` + `CHECK`.                                                     |
| Errors        | RFC 9457 Problem Details, always            | One error shape for the whole service.                                                                           |
| Tests         | Testcontainers                              | The suite owns its infrastructure; CI needs only a Docker socket.                                                |

## 3. Topology

```
Expo app ──HTTPS──> apps/api (Hono)  ──> Postgres ──<── apps/worker (nightly) ──> IGDB
                         │                              │
                         └──────> Valkey <──────────────┘
```

`apps/api` has no IGDB client on its dependency graph — the separation is
enforced by the package manifest, not by convention, so the design cannot
regress into a live proxy without someone adding a dependency on purpose.

### Workspaces

| Package              | Purpose                                                     |
| -------------------- | ----------------------------------------------------------- |
| `apps/api`           | Hono HTTP API (exists; grows routes)                        |
| `apps/worker`        | **new** — `node-cron` scheduler + sync CLI                  |
| `apps/mobile`        | Expo app (exists)                                           |
| `packages/db`        | **new** — Drizzle schema, migrations, pool factory          |
| `packages/igdb`      | **new** — typed IGDB client                                 |
| `packages/cache`     | **new** — Valkey wrapper, fail-open                         |
| `packages/contracts` | **new** — zod schemas + `BacklogStatus`, shared with mobile |

`packages/contracts` carries zod and nothing else, so the mobile bundle never
pulls in a Node dependency. Hono's `AppType` gives mobile its response types by
inference; `contracts` covers what inference cannot — request-body validation
on the client and the status union for UI pickers.

## 4. Data model

Two halves meeting at one foreign key: a mirror the worker owns and the API
only reads, and user data the API owns and the worker never touches.

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

### Mirror

```sql
CREATE TABLE game_types (
  id   integer PRIMARY KEY,      -- IGDB game_types.id
  name text    NOT NULL          -- IGDB game_types.type
);

CREATE TABLE genres (
  id integer PRIMARY KEY, name text NOT NULL, slug text NOT NULL
);

CREATE TABLE platforms (
  id integer PRIMARY KEY, name text NOT NULL,
  abbreviation text, slug text NOT NULL
);

CREATE TABLE companies (
  id integer PRIMARY KEY, name text NOT NULL, slug text NOT NULL
);

CREATE TABLE games (
  id                 integer     PRIMARY KEY,          -- IGDB id, natural key
  name               text        NOT NULL,
  slug               text        NOT NULL,
  summary            text,
  first_release_date timestamptz,
  game_type_id       integer     REFERENCES game_types(id),
  parent_game_id     integer,                          -- deliberately no FK
  total_rating       real,
  total_rating_count integer     NOT NULL DEFAULT 0,
  cover_image_id     text,                             -- denormalised; cover is 1:1
  igdb_updated_at    timestamptz NOT NULL,
  synced_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX games_slug_idx ON games (slug);
CREATE INDEX games_name_trgm_idx ON games USING gin (name gin_trgm_ops);
CREATE INDEX games_popular_idx ON games (total_rating_count DESC)
  WHERE total_rating_count > 50;

CREATE TABLE game_screenshots (
  game_id  integer NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  image_id text    NOT NULL,
  PRIMARY KEY (game_id, image_id)
);

CREATE TABLE game_genres (
  game_id  integer NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  genre_id integer NOT NULL REFERENCES genres(id),
  PRIMARY KEY (game_id, genre_id)
);

CREATE TABLE game_platforms (
  game_id     integer NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  platform_id integer NOT NULL REFERENCES platforms(id),
  PRIMARY KEY (game_id, platform_id)
);

CREATE TABLE game_companies (
  game_id      integer NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  company_id   integer NOT NULL REFERENCES companies(id),
  is_developer boolean NOT NULL DEFAULT false,
  is_publisher boolean NOT NULL DEFAULT false,
  PRIMARY KEY (game_id, company_id)
);
```

Two schema choices need their reasoning recorded:

**`games.slug` is indexed but not unique.** IGDB slugs are unique in practice,
but a slug occasionally migrates between games. A unique constraint would turn
that into a failed sync page; a plain index costs nothing and keeps the sync
running.

**`parent_game_id` has no foreign key.** A DLC can arrive in a sync page before
its parent game does. An FK would reject the row; without one the column is a
soft reference the API resolves with a left join.

### User data

```sql
CREATE TABLE users (
  id         text PRIMARY KEY,               -- the Clerk `sub`, verbatim
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE backlog_status AS ENUM
  ('waiting','playing','completed','abandoned');

CREATE TABLE backlog_entries (
  user_id    text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id    integer     NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  status     backlog_status NOT NULL,
  rating     smallint    CHECK (rating BETWEEN 1 AND 10),   -- nullable
  added_at   timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, game_id)
);

CREATE INDEX backlog_entries_user_status_idx
  ON backlog_entries (user_id, status);
```

**The composite primary key is the "exactly one status per game" rule.** It is
enforced by Postgres, so it cannot be violated by concurrent writes from two
devices. There is no surrogate entry id: the natural key is (user, game), which
is why the API addresses backlog resources by `gameId` (§8). The mobile client
never has to hold an entry id, and "is this game in my backlog?" is answerable
without one.

**`users.id` is the Clerk `sub` verbatim,** so an authenticated request needs
zero lookups to know who is asking. Rows are provisioned just-in-time —
`INSERT ... ON CONFLICT DO NOTHING` in middleware, on mutating requests only.
This is chosen over a Clerk webhook because webhooks need a publicly reachable
URL, which would drag a tunnelling tool into local development.

### Sync bookkeeping

```sql
CREATE TYPE sync_run_status AS ENUM ('running','success','failed');

CREATE TABLE sync_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status      sync_run_status NOT NULL DEFAULT 'running',
  watermark   timestamptz,
  counts      jsonb NOT NULL DEFAULT '{}'::jsonb,
  error       text
);

CREATE INDEX sync_runs_success_idx ON sync_runs (finished_at DESC)
  WHERE status = 'success';
```

## 5. IGDB client (`packages/igdb`)

**Token.** `POST https://id.twitch.tv/oauth2/token` with `grant_type=client_credentials`.
Cached in Valkey at `igdb:token` with TTL `expires_in - 3600`, with an
in-process fallback so a Valkey outage cannot stop a sync.

**Requests.** `POST https://api.igdb.com/v4/{endpoint}` with `Client-ID` and
`Authorization: Bearer` headers and an APIcalypse body.

**Rate limiting.** IGDB permits 4 requests/second and 8 open requests. The
client holds concurrency at 4 with 250 ms spacing.

**Retries.** Exponential backoff with jitter on 429 and 5xx: 500 ms, 1 s, 2 s,
4 s, 8 s; five attempts, then the page fails and the run fails.

**Pagination is keyset, not offset.** IGDB's deep offsets degrade badly, and
keyset makes the initial seed and the nightly delta the same code path:

```
where updated_at > {watermark} & id > {lastId};
sort id asc;
limit 500;
```

**Responses are validated with zod** before mapping to rows. IGDB omits absent
fields entirely rather than returning null, so the parser must treat every
optional field as possibly missing.

## 6. Sync worker (`apps/worker`)

`SYNC_CRON` (default `0 0 * * *`, `SYNC_TZ` default `UTC`) fires `syncAll()`.
The same function is exposed as `pnpm --filter worker sync [--full]` for the
initial seed and manual runs.

1. `SELECT pg_try_advisory_lock(...)`. A second process finds the lock taken
   and exits cleanly — insurance against a manual run colliding with the cron.
2. Open a `sync_runs` row with status `running`.
3. Read the watermark: `watermark` from the most recent `success` run, **minus
   60 s of overlap** so nothing is lost at the boundary. No prior success means
   a full seed.
4. Page through `/games` by keyset until a page returns fewer than 500 rows.
5. For each page, in one transaction:
   a. upsert `game_types`, `genres`, `platforms`, `companies` from the inline
   expansion data;
   b. upsert `games`;
   c. delete and reinsert the join and screenshot rows for that page's game ids.
6. `INCR search:ver` in Valkey (§10).
7. Close the run: `success`, new watermark (`max(igdb_updated_at)` ingested),
   per-entity counts.

### Reference entities ride along in the games query

```
fields id,name,slug,summary,first_release_date,updated_at,
       total_rating,total_rating_count,parent_game,
       game_type.id,game_type.type,
       cover.image_id,
       screenshots.image_id,
       genres.id,genres.name,genres.slug,
       platforms.id,platforms.name,platforms.abbreviation,platforms.slug,
       involved_companies.company.id,
       involved_companies.company.name,
       involved_companies.company.slug,
       involved_companies.developer,
       involved_companies.publisher;
```

This is the single biggest simplification in the sync. Fetching genres,
platforms and companies from their own endpoints creates an ordering problem: a
game can reference a company created after the company sync finished, and the
foreign key insert fails. With inline expansion every referenced row arrives in
the same payload as the game that needs it, so the ordering problem cannot
occur and no separate reference-entity sync exists.

### Failure is a no-op

A failed run is marked `failed` and **the watermark does not advance**, so the
next run re-fetches the same range. Every write is an upsert and join rows are
replaced wholesale, so replaying a range is harmless. There is no repair path
to write because there is no partial state to repair.

### Seed

**Measured on 2026-08-25**, not estimated:

|                                   |                                                           |
| --------------------------------- | --------------------------------------------------------- |
| Games mirrored                    | 373,590 across 748 pages of 500                           |
| Seed duration                     | 16 min 20 s                                               |
| Database size                     | 418 MB including indexes                                  |
| Reference rows                    | 23 genres, 217 platforms, 59,670 companies, 15 game types |
| Child rows                        | 1.67 M screenshots, 616 k game↔genre, 277 k game↔company  |
| Incremental run immediately after | 10 games, 1 page, **6.9 s**                               |

Two earlier estimates were wrong and are corrected here. The seed takes ~16
minutes, not the ~3 minutes that 748 requests at 4 req/s would suggest —
per-page database work dominates, not the IGDB rate limit. And the database is
418 MB, not the 2–4 GB guessed; roughly 6× smaller.

The 6.9-second incremental run is the number that matters for the nightly job:
the steady state is seconds.

## 7. Non-deprecated IGDB fields

The mirror uses only currently recommended fields:

- `games.category` is deprecated in favour of **`game_type`**, now a reference
  rather than an inline enum. We expand `game_type.type` and mirror a small
  `game_types` table.
- `games.status` is deprecated in favour of `game_status`. We do not store
  release status, so it stays out.
- Everything else we touch is current: `cover.image_id`, `screenshots.image_id`,
  `genres`, `platforms`, `involved_companies.company` with the
  `developer`/`publisher` flags, `total_rating`, `total_rating_count`,
  `first_release_date`, `updated_at`.

IGDB has been retiring `category`-style fields across endpoints on a rolling
basis, so this list was treated as unverified until checked. **It has now been
verified against live IGDB** (2026-08-25): every field above is accepted, and
real payloads validate against our zod schema. The durable guardrail is a **contract test that requests
our exact field list against `/games` with `limit 1` and fails on any field
IGDB rejects** (§15). That converts "did we use a deprecated field?" from
something a person has to remember into a build failure, and catches removals
on the day they land.

The searchable game-type ids (§9) were likewise read from the live
`/game_types` data rather than transcribed from the legacy enum. Confirmed:
`{0 Main Game, 4 Standalone Expansion, 8 Remake, 9 Remaster, 10 Expanded Game}`
— 316,525 of 373,590 mirrored games. The ids match the legacy enum; two names
differ (`1` is "DLC", `13` is "Pack / Addon").

## 8. API surface

Base path `/api`. Every route requires a valid Clerk session token. The only
public routes in the service are `/healthz` and `/readyz`, allowlisted by exact
path — not by prefix, so no future `/health-debug` is public by accident.

### Games (read-only, served from the mirror)

| Route                                     | Notes                                                    |
| ----------------------------------------- | -------------------------------------------------------- |
| `GET /api/games/search?q=&limit=&offset=` | `q` ≥ 2 chars; `limit` ≤ 50 (default 20); `offset` ≤ 200 |
| `GET /api/games/:id`                      | full details **plus the caller's backlog entry**         |
| `GET /api/games/popular?limit=`           | `limit` ≤ 50 (default 20)                                |

`GET /api/games/:id` returns the game with its cover, screenshots, genres,
platforms, developers and publishers, and a `backlogEntry` field that is the
caller's entry or `null`. Embedding it is deliberate: the game screen needs the
right button state, and one call removes a request and a loading flicker.

That also makes the response user-varying, which is why it must never enter a
shared cache. It is uncached today; adding a cache later requires splitting the
user-specific part out first.

`GET /api/games/popular` ranks by `total_rating_count DESC` behind a
`total_rating` floor, restricted to the searchable game types.

### Backlog — the CRUD core

| Route                            | Notes                                                          |
| -------------------------------- | -------------------------------------------------------------- |
| `GET /api/backlog?status=&sort=` | the caller's **full** list, joined to game summaries           |
| `GET /api/backlog/stats`         | counts per status plus average rating                          |
| `PUT /api/backlog/:gameId`       | `{status, rating?}` — upsert; `201` on create, `200` on update |
| `DELETE /api/backlog/:gameId`    | `204`; `404` if absent                                         |

`sort` accepts `updated_at` (default), `added_at`, `rating`, `name`, each
descending except `name`.

**`PUT` only — no `POST` and no `PATCH`.** An entry is two fields and the
client always holds both, so a full replace is always expressible. `PUT` is
idempotent, which removes the 409-already-exists path entirely and makes
offline retry safe: a resent request is harmless rather than an error the app
must interpret.

**No pagination.** A personal backlog runs to hundreds of rows. A documented
soft cap of 5000 entries keeps the response bounded.

**`GET /api/backlog` is conditional.** With the whole collection in one
response that changes rarely, an `ETag` is worth its three lines: hash the
serialised body, honour `If-None-Match`, return `304` with no body. A user
opening the app five times a day gets four empty responses. This requires
`Cache-Control: private, no-cache` rather than `no-store` — `no-cache` permits
storage but requires revalidation, which is exactly ETag semantics, whereas
`no-store` would forbid the client from keeping the copy it needs to revalidate
against.

`PUT` and `DELETE` return `404` when `:gameId` is not in the mirror, because a
backlog entry for an unknown game cannot satisfy the foreign key.

### Operations

| Route                  | Auth     | Notes                                |
| ---------------------- | -------- | ------------------------------------ |
| `GET /healthz`         | public   | §12                                  |
| `GET /readyz`          | public   | §12                                  |
| `GET /api/sync/status` | required | last run: status, timestamps, counts |

`GET /api/hello` is removed.

### Preserving typed RPC

Hono only preserves route types through chained calls. Each route module
exports `new Hono().get(...).put(...)` and is mounted with `app.route()`.
Breaking the chain degrades `AppType` to `{}` — mobile keeps compiling, just
untyped, which is a silent failure. A type-level test asserts a known route
still exists on `AppType`.

## 9. Search

```sql
SET LOCAL pg_trgm.word_similarity_threshold = 0.3;

-- $1 query  $2 searchable game_type ids  $3 limit  $4 offset
SELECT id, name, slug, cover_image_id, first_release_date,
       total_rating, total_rating_count
FROM games
WHERE $1 <% name
  AND game_type_id = ANY($2)
ORDER BY 0.6 * word_similarity($1, name)
       + 0.4 * LEAST(total_rating_count, 500)::real / 500 DESC,
         total_rating_count DESC,
         id ASC
LIMIT $3 OFFSET $4;
```

**`word_similarity` rather than plain `similarity`** is the detail that decides
whether search feels good. Plain similarity compares whole strings, so `zeld`
against `The Legend of Zelda: Ocarina of Time` scores near zero — the target is
long and mostly non-matching. `word_similarity` scores the query against the
best-matching span of words inside the name, so `zeld` matches `Zelda`
strongly. The `<%` operator uses the same `gin_trgm_ops` index.

The popularity term is what stops `mario` returning an obscure ROM hack ahead
of _Super Mario Odyssey_. `id ASC` gives a stable tie-break so pagination
cannot repeat or skip a row.

Weights and the 0.3 threshold are starting points. They are tuned against the
real 350k-row mirror, which is why seeding precedes search work in the build
order (§16).

## 10. Cache (`packages/cache`)

| Key                                      | Contents           | TTL                  |
| ---------------------------------------- | ------------------ | -------------------- |
| `igdb:token`                             | Twitch app token   | `expires_in - 3600`  |
| `search:ver`                             | version counter    | none                 |
| `search:v{ver}:{sha1(q\|limit\|offset)}` | search results     | 600 s; 60 s if empty |
| `popular:v{ver}:{limit}`                 | popular feed       | 3600 s               |
| `rl:{scope}:{sub}:{window}`              | rate-limit counter | 120 s                |

Queries are normalised before hashing: trimmed, lowercased, internal whitespace
collapsed. Empty results are cached too, at the shorter TTL, which absorbs the
typo storm that search-as-you-type generates.

**Invalidation is a version bump.** The sync runs `INCR search:ver`; every key
from the previous version becomes unreachable at once and expires on its own.
No key scanning, no delete lists, and no way to miss an invalidation.

**The cache is fail-open.** If Valkey is unreachable the wrapper logs and the
caller queries Postgres. A cache must never be able to take the service down,
and this one holds nothing that cannot be recomputed.

Game details are deliberately **not** cached: the response is user-varying
(§8), and the underlying read is a handful of indexed joins.

## 11. Errors — Problem Details

Every non-2xx response is RFC 9457 `application/problem+json`. There is no
second error shape anywhere in the service.

```json
{
  "type": "https://barklog.gg/problems/validation-failed",
  "title": "Validation failed",
  "status": 422,
  "detail": "Query parameter 'q' must be at least 2 characters.",
  "instance": "/api/games/search",
  "traceId": "01JQ8F3K2M9X7YB4NDVWZP6HRC",
  "errors": [{ "pointer": "/q", "detail": "String must contain at least 2 character(s)" }]
}
```

`errors[]` is a Barklog extension member, present only on `validation-failed`.
`traceId` is the request id, echoed in `X-Request-Id` and in every log line for
the request.

| `type` slug              | Status | Raised by                      |
| ------------------------ | ------ | ------------------------------ |
| `bad-request`            | 400    | malformed JSON                 |
| `unauthorized`           | 401    | missing or invalid Clerk token |
| `not-found`              | 404    | unknown game, entry, or route  |
| `unsupported-media-type` | 415    | non-JSON body                  |
| `payload-too-large`      | 413    | body over the limit            |
| `validation-failed`      | 422    | zod                            |
| `rate-limited`           | 429    | limiter                        |
| `internal-error`         | 500    | anything unhandled             |
| `service-unavailable`    | 503    | dependency down                |

`type` URIs are stable identifiers; they need not resolve.

**Three paths bypass a naive `app.onError` and all three must route into the
same factory:** Hono's `HTTPException`, the zod-validator failure hook, and
`app.notFound()`. "Always" is an architectural claim, so it is enforced by a
test asserting that **every** non-2xx response produced anywhere in the
integration suite carries `application/problem+json` — that is what keeps it
true a year from now.

**5xx problems never carry a `detail`.** Exception messages and stack traces
leak schema names, file paths and library versions. A 500 gets its `title`, its
`status`, and a `traceId` pointing at the server log where the real error
lives.

## 12. Health and readiness

| Route          | Behaviour                                                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /healthz` | Liveness. No I/O, no dependency checks. `200 {"status":"ok"}` whenever the event loop turns.                                                                                               |
| `GET /readyz`  | Readiness. `SELECT 1` on Postgres and `PING` on Valkey, each behind a 1 s timeout. Both up → `200`. **Either down → `503`**, rendered as a problem document so even the probe honours §11. |

The distinction is operational: an orchestrator restarts a container on a
failed liveness probe but merely stops routing traffic on a failed readiness
probe. Collapsing them means a blip in Postgres kills the pods.

Readiness is strict on both dependencies by decision, and it is worth recording
what that costs: the cache is fail-open (§10), so the API still serves every
request correctly with Valkey down — a strict `/readyz` will therefore pull a
functioning instance out of rotation. The trade is accepted in exchange for a
probe that reports the true state of the service's dependencies. Revisiting it
means changing one branch.

Both bodies stay terse — component names and up/down only. No versions, no
hostnames, no driver error strings; these are unauthenticated endpoints.

## 13. Security

### Authentication

`clerkMiddleware()` from `@hono/clerk-auth` verifies the session JWT against
Clerk's JWKS. Verification is stateless with a cached key set, so there is no
Clerk round trip per request. `requireAuth` mounts on `*` with an exact-path
allowlist for the two probes, and sets `c.set('userId', auth.userId)`.

Verification sits behind a small interface so tests can substitute a fake
(§15); otherwise the entire authenticated suite would need network access to
Clerk.

### Middleware order

1. `secureHeaders()` — first, so it also covers error responses and probes.
2. `requestId()` — generates or accepts `X-Request-Id`, echoes it on every
   response, and supplies the `traceId` in problem documents (§11). It precedes
   the logger so every log line for a request carries the same id.
3. `logger()`
4. `bodyLimit()`
5. `clerkMiddleware()` + `requireAuth` (exact-path allowlist for the probes)
6. rate limiter (needs the Clerk `sub`, so it follows auth)
7. `ensureUser` — mutating requests only
8. routes; `app.onError` and `app.notFound` render problem documents

### Headers

| Header                              | Value                                                                             | Rationale                                                              |
| ----------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `Strict-Transport-Security`         | `max-age=63072000; includeSubDomains; preload`                                    | production only; meaningless over plain HTTP                           |
| `X-Content-Type-Options`            | `nosniff`                                                                         | stops `application/problem+json` being sniffed as something executable |
| `Content-Security-Policy`           | `default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'` | the API returns zero HTML, so the correct policy is "nothing at all"   |
| `X-Frame-Options`                   | `DENY`                                                                            | belt and braces with `frame-ancestors`                                 |
| `Referrer-Policy`                   | `no-referrer`                                                                     |                                                                        |
| `Cross-Origin-Resource-Policy`      | `same-origin`                                                                     | blocks other origins embedding responses                               |
| `Cross-Origin-Opener-Policy`        | `same-origin`                                                                     |                                                                        |
| `X-Permitted-Cross-Domain-Policies` | `none`                                                                            |                                                                        |
| `X-Powered-By`, `Server`            | **removed**                                                                       | version disclosure                                                     |

A test asserts the full header set is present on a 200, on a 404 problem
document, and on `/healthz`.

### Caching directives

Because the whole API is authenticated, the default is `Cache-Control: no-store`
and every route states its own value explicitly:

| Route                                      | Value                                   |
| ------------------------------------------ | --------------------------------------- |
| `GET /api/backlog`                         | `private, no-cache` (ETag revalidation) |
| `GET /api/games/:id`, `/api/games/popular` | `private, max-age=300`                  |
| `GET /api/games/search`                    | `private, max-age=60`                   |
| everything else                            | `no-store`                              |

`private` is what keeps an intermediary from ever holding an authenticated
response.

### Rate limiting

Fixed-window counters in Valkey keyed on the Clerk `sub`: `INCR` plus `EXPIRE`,
atomic and cheap.

| Scope                    | Limit     |
| ------------------------ | --------- |
| search                   | 30 / min  |
| writes (`PUT`, `DELETE`) | 60 / min  |
| overall                  | 300 / min |

Responses carry `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset`;
a 429 also carries `Retry-After` alongside the problem document. The limiter
**fails open** if Valkey is unreachable — availability over enforcement,
consistent with the cache.

### Other

- `bodyLimit` at 16 KB. The largest legitimate body is `{status, rating}`.
- **No CORS middleware.** The client is a native app with no browser origin, so
  there is nothing to allow. Adding permissive CORS "just in case" would be the
  mistake here.
- Secrets come from the environment only, validated at startup by zod. The
  process refuses to boot on a missing or malformed variable rather than
  failing on the first request that needs it.

## 14. Configuration

| Process       | Variables                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------- |
| `apps/api`    | `PORT`, `DATABASE_URL`, `VALKEY_URL`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `NODE_ENV`, `LOG_LEVEL` |
| `apps/worker` | `DATABASE_URL`, `VALKEY_URL`, `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET`, `SYNC_CRON`, `SYNC_TZ`, `LOG_LEVEL`  |
| `apps/mobile` | `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`                                                 |

Every new variable must also be declared in `turbo.json` under the relevant
task's `env` array, or `turbo/no-undeclared-env-vars` will flag it.

### Local development

`docker-compose.yml` provides **Postgres and Valkey only**:

```yaml
services:
  postgres:
    image: postgres:18-alpine
    environment:
      POSTGRES_USER: barklog
      POSTGRES_PASSWORD: barklog
      POSTGRES_DB: barklog
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U barklog"]
      interval: 5s
  valkey:
    image: valkey/valkey:9-alpine
    command: ["valkey-server", "--save", "", "--appendonly", "no"]
    ports: ["6379:6379"]
    healthcheck:
      test: ["CMD", "valkey-cli", "ping"]
      interval: 5s
volumes:
  pgdata:
```

Valkey runs with persistence off: it holds only a cache and rate-limit
counters, all of which are reconstructible.

The API and worker stay on the host under `tsx watch`, matching the existing
`pnpm --filter api dev` flow. Containerising them locally would buy nothing and
cost fast reloads.

## 15. Testing

**Testcontainers, not the compose stack.** `@testcontainers/postgresql` and
`@testcontainers/redis` (pointed at a Valkey image — the Redis module works
against Valkey, which is wire-compatible) start in Vitest `globalSetup`, which
also runs the Drizzle migrations and exports `DATABASE_URL` and `VALKEY_URL`.
Tables are truncated between tests. `withReuse()` keeps the local loop fast
while CI gets a clean container per run. The suite therefore owns its
infrastructure and depends on nothing but a Docker socket.

Clerk verification is faked through the interface in §13, so the authenticated
suite needs no network.

| Layer       | Coverage                                                                                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | IGDB response mapping (including omitted optional fields), rate-limit windows, ETag derivation, problem-document construction                                             |
| Integration | backlog CRUD against real Postgres; search ranking against a seeded fixture set; cache hit/miss and version-bump invalidation; fail-open behaviour with Valkey stopped    |
| Contract    | our field list against live IGDB (§7)                                                                                                                                     |
| Invariant   | every non-2xx response is `application/problem+json` (§11); the secure-header set is present on 200, 404 and `/healthz` (§13); `AppType` still exposes a known route (§8) |

Two tests carry more weight than the rest:

- **Sync idempotency** — replay the same fixture page twice and assert
  identical database state. The entire failure model in §6 rests on this
  property.
- **Search ranking** — a fixture set where the naive ranking gets the answer
  wrong (`mario`, `zeld`, `dark souls`), asserting the expected title ranks
  first.

The IGDB contract test needs real credentials, so it is tagged and runs
nightly in CI rather than on every pull request.

## 16. Build order

Each step ends somewhere you can stop.

1. `docker-compose.yml` + `packages/db` + first migration (`CREATE EXTENSION pg_trgm`).
2. `packages/igdb` + `apps/worker` + run the seed — **get real data in**.
3. `packages/cache`, problem-details middleware, secure headers, `/healthz`,
   `/readyz`.
4. Games routes: search, details, popular — verifiable with `curl`.
5. Clerk middleware, `users` provisioning, rate limiting; lock the API down.
6. Backlog CRUD, stats, ETag.
7. Wire the mobile app.

Seeding precedes search work because tuning ranking weights against 350k real
titles is a fundamentally different exercise than tuning them against fixtures.
Steps 3 and 5 are separated so the games routes can be exercised without tokens
while the shape is still moving, then closed before anything ships.

## 17. Deferred

- **`popularity_primitives`** — IGDB's real popularity signal (site visits,
  want-to-play counts, Steam concurrents) and the properly non-deprecated
  source for the explore feed. It is a separate daily-refreshed dataset and a
  second table, so v1 uses `total_rating_count` as a good-enough proxy.
  Swapping it in touches one query.
- **Game-details caching** — requires splitting the user-specific
  `backlogEntry` out of the response first.
- **Search filters** by genre and platform. The join tables already support it.
- **Clerk webhooks** for user lifecycle, if just-in-time provisioning proves
  insufficient.
- **BullMQ** if the sync ever grows past one nightly job.

## 18. Risks

| Risk                                                      | Mitigation                                                                          |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| IGDB deprecates a field we mirror                         | Nightly contract test fails the build (§7)                                          |
| Seed exhausts the rate limit or dies midway               | Keyset pagination plus an unadvanced watermark makes a re-run resume correctly (§6) |
| Search ranking feels wrong on real data                   | Weights are configuration; ranking fixtures pin the regressions (§9, §15)           |
| Strict `/readyz` pulls healthy instances on a Valkey blip | Accepted trade, recorded in §12; reverting is one branch                            |
| Postgres growth from the full mirror                      | Measured at 418 MB for 373,590 games (§6)                                           |
