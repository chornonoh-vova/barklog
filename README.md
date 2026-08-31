# Barklog

Track your gaming backlog — the games you own, the ones you're playing, and the
ones you keep meaning to finish — with a cute dog companion keeping score.

Turborepo monorepo for the Barklog iOS app and its backend.

## What's inside

| Workspace                    | What it is                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| `apps/mobile`                | Expo (SDK 57) app — expo-router native tabs, React Native lists with @expo/ui SwiftUI controls |
| `apps/api`                   | Hono HTTP API running on Node via `@hono/node-server`                                          |
| `apps/worker`                | Nightly IGDB → Postgres sync (`node-cron` + a one-shot CLI)                                    |
| `packages/db`                | Drizzle schema, migrations, connection factory                                                 |
| `packages/cache`             | Fail-open Valkey wrapper                                                                       |
| `packages/contracts`         | shared valibot request schemas, the backlog status union, and the shared HTTP wire contract    |
| `packages/logging`           | one LogTape configuration — JSON lines, with a per-request or per-run context                  |
| `packages/igdb`              | Typed IGDB client — token, rate limiting, keyset paging                                        |
| `packages/eslint-config`     | Shared flat ESLint configs (`base`, `expo`, `node`)                                            |
| `packages/typescript-config` | Shared tsconfig bases (`base.json`, `expo.json`, `node.json`)                                  |

Validation is **valibot throughout, behind Standard Schema** — one library, not
two. `apps/api`'s validator, its `hono-problem-details` hook, `packages/igdb`'s
IGDB response schema and `apps/worker`'s environment schema all meet at that one
interface.

Everything is TypeScript. The app is **iOS-only for now** (`platforms: ["ios"]`
in `app.json`) because a development build is needed: `@clerk/expo`'s native
components and `@expo/ui` are native modules.

- App identifier: `gg.barklog.app`
- URL scheme: `barklog://`
- Associated domain: `barklog.gg`

Every screen is gated behind Clerk's native `AuthView` — see [Auth](#auth) for
how the app guards access.

## Requirements

- Node `>=24` (see `.nvmrc`)
- pnpm 11 (`corepack enable`)
- Xcode

`pnpm-workspace.yaml` sets `nodeLinker: hoisted` because React Native does not
support pnpm's isolated `node_modules` layout.

## Getting started

```sh
pnpm install
```

For the mobile app's env file, dev-build requirement, and run commands, see
[Mobile](#mobile) below.

Backend:

```sh
pnpm --filter api dev        # tsx watch → http://localhost:3000
```

When running the app on a physical device, point `EXPO_PUBLIC_API_URL` at your
machine's LAN IP rather than `localhost`.

### Mobile

The app needs a development build — `@clerk/expo`'s native components and
`@expo/ui` are native modules, so Expo Go cannot run it.

One-time setup:

1. Enable **Sign In with Apple** on the App ID `gg.barklog.app` in the Apple
   Developer portal.
2. In the Clerk Dashboard, add the iOS app under **Native Applications** (Apple
   Team ID + bundle id) and enable **Apple** under SSO connections.
3. Create `apps/mobile/.env` from `.env.example`. `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`
   must be the same Clerk instance as the API's `CLERK_SECRET_KEY`, or every
   request is a 401.

Then:

```bash
pnpm deps:up                      # Postgres + Valkey
pnpm --filter api dev             # the API on :3000
pnpm --filter mobile prebuild     # after any config-plugin change
pnpm --filter mobile ios
```

On a physical device set `EXPO_PUBLIC_API_URL` to the host machine's LAN IP —
`localhost` resolves to the phone. Building onto a connected iPhone instead of
the simulator: `pnpm --filter mobile ios:device`. Prefer a cloud build?
`pnpm --filter mobile build:dev` runs `eas build --profile development
--platform ios`; run `npx eas-cli login` and `npx eas-cli init` once first to
attach an EAS project id.

## Local infrastructure

Postgres and Valkey run in Docker; the API and worker run on the host so
reloads stay fast.

```sh
pnpm deps:up
cp .env.example .env                        # then fill in the IGDB credentials
cp apps/api/.env.example apps/api/.env      # Clerk keys go here
cp apps/worker/.env.example apps/worker/.env
pnpm --filter @repo/db db:migrate
```

Nothing has to be exported into your shell. Each app loads its own `.env`
through `node --env-file`, so `apps/api/.env` and `apps/worker/.env` are what
`pnpm dev` reads, and `@repo/db` loads the root `.env` itself — `db:migrate`
via `--env-file-if-exists`, `drizzle-kit` from `drizzle.config.ts`, which has
no flag to pass. Both defer to variables that are already set, so a
`DATABASE_URL` from CI or a deploy environment still wins.

Values that appear in more than one file (`DATABASE_URL`, `VALKEY_URL`,
`LOG_LEVEL`) have to be kept in step by hand.

Use `pnpm --filter @repo/db db:migrate` rather than `drizzle-kit migrate`. It
also runs `CREATE EXTENSION pg_trgm`, which drizzle-kit does not generate and
which the trigram search index depends on.

> Postgres 18+ stores data under a major-version subdirectory, so the compose
> volume mounts `/var/lib/postgresql`, **not** `/var/lib/postgresql/data`. The
> older path makes the image refuse to start.

### Seeding the games mirror

The API never calls IGDB. Everything is served from our own Postgres, populated
by the worker. Create a Twitch application at
<https://dev.twitch.tv/console/apps> to get `IGDB_CLIENT_ID` and
`IGDB_CLIENT_SECRET`, then:

```sh
pnpm --filter worker sync --full   # full seed: ~700 requests, a few minutes
pnpm --filter worker sync          # incremental: only what changed
pnpm --filter worker dev           # schedule the nightly run (SYNC_CRON)
```

A failed run does not advance the watermark, so the next run simply re-fetches
the same range. Every write is an upsert, which makes replaying a range safe.

## Testing

```sh
pnpm test
```

Tests start their own Postgres and Valkey via **Testcontainers** — they do not
use the `deps.compose.yaml` stack, so all they need is a running Docker
daemon. The compose stack is purely a development convenience.

## Logs

Both processes write JSON lines to stdout, one object per record, filtered by
`LOG_LEVEL` (`trace`, `debug`, `info`, `warning`, `error`, `fatal` — LogTape's
levels, so there is no `warn`).

Every record written while handling an HTTP request carries the `traceId` that
the client got back in `X-Request-Id` and that any problem document repeats, and
every record written during a sync carries that run's `runId`. Neither is passed
as an argument anywhere: they come from LogTape's implicit context.

```bash
pnpm --filter api dev | jq 'select(.traceId == "…")'
pnpm --filter worker sync | jq -r '[.level, .message] | @tsv'
```

## Tasks

| Command                              | Does                                 |
| ------------------------------------ | ------------------------------------ |
| `pnpm dev`                           | Every dev server (Expo + API)        |
| `pnpm build`                         | Compile the API to `apps/api/dist`   |
| `pnpm lint`                          | ESLint across all workspaces         |
| `pnpm check-types`                   | `tsc --noEmit` across all workspaces |
| `pnpm test`                          | Vitest across all workspaces         |
| `pnpm --filter @repo/db db:generate` | Generate a migration from the schema |
| `pnpm --filter @repo/db db:migrate`  | Apply migrations (+ `pg_trgm`)       |
| `pnpm --filter worker sync --full`   | Seed the games mirror from IGDB      |
| `pnpm format`                        | Prettier write                       |
| `pnpm format:check`                  | Prettier check (no write)            |
| `pnpm --filter mobile ios`           | Dev build on the simulator           |
| `pnpm --filter mobile ios:device`    | Dev build on a connected device      |
| `pnpm --filter mobile prebuild`      | Regenerate the native `ios/` project |

## apps/mobile

```
src/
  app/
    _layout.tsx            ClerkProvider -> QueryClientProvider -> ApiProvider -> theme -> OnboardingGate -> AuthGate
    (tabs)/
      _layout.tsx          NativeTabs: Home | Explore | Search
      (home)/              route group, so index.tsx still resolves to "/"
        _layout.tsx  index.tsx  game/[id].tsx
      explore/   _layout.tsx  index.tsx  game/[id].tsx
      search/    _layout.tsx  index.tsx  game/[id].tsx
  api/         errors, client, endpoints, keys, provider, hooks
  auth/        auth-gate, should-clear-cache
  components/  profile-toolbar, cover, game-row, query-boundary, query-states, empty-state
  features/    backlog/ explore/ search/ game/ onboarding/
  hooks/       use-debounced
  onboarding/  onboarding-gate, should-show-onboarding, storage
  ui/          glass, platform-glass, measured-host
  env.ts  igdb-image.ts  query-client.ts  splash.ts  theme.ts
```

**Tabs.** Expo Router's native tabs (`expo-router/unstable-native-tabs`) render
a real `UITabBarController`. Home, Explore and Search form the tab bar — there
is no Profile tab; the avatar in each tab's header opens Clerk's
`UserProfileView` instead. Each tab owns its own Stack, and `game/[id].tsx` is
triplicated — one per tab — so a pushed detail screen stays inside its tab with
the native tab bar still visible.
Icons are SF Symbols (`sf`) with Material Symbols (`md`) kept in place for
whenever Android lands.

**Explore.** Three shelves — Most Popular, Upcoming, Recently Released — each a
two-row grid scrolling sideways over its own feed request. The three queries are
independent: a shelf that fails or answers empty is simply not drawn, so one
slow feed cannot take the page down with it.

**Similar games.** The detail screen closes with a row of IGDB's own
`similar_games`, mirrored into `game_similar` by the nightly sync and served
from `GET /api/games/:id/similar` — its own cacheable route rather than a field
on the detail response, which is `private, no-cache` because it embeds the
caller's backlog entry. The row is absent, not empty, when a game has no
suggestions, so the feature was deployable before the backfill ran. Each tab's
`game/[id].tsx` supplies its own push, so tapping a suggestion stays inside the
current tab.

**UI.** React Native renders lists, rows, images and text content; `@expo/ui/swift-ui`
inside a `Host` renders controls, plus `ProgressView` for loading and a
hand-laid-out symbol/title/description stack for empty and error states —
`ContentUnavailableView` fills its container and centres inside it, which
pushes a sibling call to action to the bottom of the screen. `PlatformColor`
is used throughout so both halves resolve the same iOS dynamic system colours. This
split is forced, not stylistic: `@expo/ui`'s SwiftUI `Image` accepts only an
SF Symbol, an asset-catalog name, or a local file URI — it has no remote-URL
prop, and every list in Barklog is IGDB cover art.

This branch's UI is committed and statically verified, but not yet exercised
on a device — [`docs/mobile-device-verification.md`](docs/mobile-device-verification.md)
is the checklist of what remains.

## Auth

`ClerkProvider`, with a `tokenCache` from `@clerk/expo/token-cache`, wraps the
app at the root of `src/app/_layout.tsx`. Below it, `AuthGate` renders Clerk's
non-dismissible native `AuthView` whenever the auth flow is incomplete, so
every other screen only ever renders for a signed-in user — there is no
`sign-in.tsx` route or `Stack.Protected` guard. The splash screen stays up
until Clerk has read the keychain, so a returning user never sees the sign-in
screen flash before landing on their backlog. On sign-out, the query cache is
cleared so the next person to sign in on the same device can't see the
previous user's backlog.

`OnboardingGate` sits above `AuthGate` and is the one exception to "every other
screen only ever renders for a signed-in user": it renders for a signed-out
visitor on a first install, before an account exists. `splash.ts` owns the
splash lifecycle for both gates: it holds the splash at import and exposes
`useReleaseSplash(ready)`, which each gate calls with its own readiness, so
whichever gate decides first releases it and neither needs to know the other
exists.

There is no `expo-apple-authentication` dependency: `<AuthView />` runs the
Apple flow internally, so nothing else needs to touch the config plugin.

Declare any new `EXPO_PUBLIC_*` keys in `turbo.json` under the `dev` and
`build` task `env` arrays, or `turbo/no-undeclared-env-vars` will flag them.

## apps/api

```
src/
  env.ts          valibot-validated environment, parsed once at boot
  problems.ts     the problem-type registry and the one error renderer
  types.ts        Db, AppEnv, AppDeps, PROBE_PATHS
  rate-limits.ts  the three scopes and their limits, as data
  cache-keys.ts   query normalisation, sha1, key builders, TTLs
  serialize.ts    row -> wire mappers (dates become ISO strings)
  clerk.ts        the production authenticator; the only Clerk import
  middleware/     finalize, auth, media type, rate limiting, validation
  routes/         probes, games, backlog, sync status
  app.ts          createApp(deps) — the middleware chain, exports AppType
  index.ts        Node bootstrap
```

Every route needs a valid Clerk session token. The only public routes are
`/healthz` and `/readyz`, allowlisted by exact path.

| Route                                     | Notes                                                        |
| ----------------------------------------- | ------------------------------------------------------------ |
| `GET /api/games/search?q=&limit=&offset=` | `q` ≥ 2 chars, `limit` ≤ 50, `offset` ≤ 200                  |
| `GET /api/games/popular?limit=`           | `limit` ≤ 50 (default 20)                                    |
| `GET /api/games/upcoming?limit=`          | unreleased, soonest first                                    |
| `GET /api/games/recent?limit=`            | released in the last 90 days, most rated first               |
| `GET /api/games/:id`                      | full details plus the caller's `backlogEntry`                |
| `GET /api/games/:id/similar?limit=`       | IGDB's `similar_games`, re-ranked; `limit` ≤ 50 (default 12) |
| `GET /api/backlog?status=&sort=`          | the caller's full list; `ETag` + `304`                       |
| `GET /api/backlog/stats`                  | counts per status plus average rating                        |
| `PUT /api/backlog/:gameId`                | `{status, rating?}`; `201` created, `200` updated            |
| `DELETE /api/backlog/:gameId`             | `204`, or `404` if absent                                    |
| `GET /api/sync/status`                    | the last sync run                                            |
| `GET /healthz`                            | liveness, public, no I/O                                     |
| `GET /readyz`                             | readiness, public, strict on Postgres and Valkey             |

Every non-2xx response is `application/problem+json` (RFC 9457). Type slugs and
titles come from `hono-problem-details`, so a 413 is `content-too-large` and a
429 is `too-many-requests`. Every response carries `X-Request-Id`, and every
problem body repeats it as `traceId` — except a 422, which is rendered by the
library's validation hook and correlates by header alone. No 5xx ever carries an
exception message; that goes to the log under the same id.

`pnpm --filter api build` emits `dist/`; `pnpm --filter api start` runs it.
`pnpm --filter api test` starts its own Postgres and Valkey via Testcontainers;
Clerk is faked, so the suite needs no network.

## apps/worker

```
src/
  env.ts      valibot-validated environment, parsed once at boot
  context.ts  wires db + cache + IGDB client into SyncDeps
  persist.ts  writes one IGDB page in a single transaction
  sync.ts     syncAll() — advisory lock, watermark, page loop, bookkeeping
  cli.ts      one-shot run: `pnpm --filter worker sync [--full]`
  index.ts    node-cron scheduler (SYNC_CRON, SYNC_TZ)
```

The worker holds a Postgres advisory lock for the duration of a run, so a
manual `sync` colliding with the nightly cron is skipped rather than run twice.
Progress is recorded in the `sync_runs` table.
