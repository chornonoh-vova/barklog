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
| `apps/landing`               | Astro static marketing site + legal pages, served by nginx at `barklog.gg`                      |
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

Expo marks iOS share-receiving **experimental**: the generated share extension
opens the main app target with the payload rather than processing it in its own
`ViewController`, so the share journey lands in the app itself — see
[Sharing a video](#sharing-a-video).

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
   request is a 401. `EXPO_PUBLIC_REVENUECAT_TEST_KEY` is RevenueCat's Test
   Store key — `src/env.ts` only reads it under `__DEV__`, so it never reaches
   a release build. `EXPO_PUBLIC_REVENUECAT_IOS_KEY` is the App Store key that
   every release build ships.

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

## Deployment

Pushing to `main` runs `.github/workflows/images.yml`, which verifies the
workspace (`build`, `lint`, `check-types`, `test`) and then publishes four
images to the GitHub Container Registry:

```
ghcr.io/chornonoh-vova/barklog-api
ghcr.io/chornonoh-vova/barklog-worker
ghcr.io/chornonoh-vova/barklog-migrate
ghcr.io/chornonoh-vova/barklog-landing
```

Each is tagged `main`, `sha-<short>`, and `latest`. The first three come from
the same root `Dockerfile` — `docker build --target api|worker|migrate .` —
built from a single `turbo prune`d workspace: one `turbo prune` emits a subset
lockfile and manifests, which two separate installs then consume (a full
install for the build, a `--prod` install for the runtime image), so
`apps/mobile`'s Expo dependencies never enter either one. `landing` is built
separately, from `apps/landing/Dockerfile`, published last so a failure there
leaves the site at the previous commit rather than blocking the other three.

Nothing deploys automatically. `compose.yaml` describes the VPS stack and
Dokploy pulls when you press Deploy. That stack is the API, the worker, the
landing site, and Valkey; Postgres is external and lives on PlanetScale. The
API and the landing site are the only services reachable from outside — the
file publishes no host ports at all, and `api.barklog.gg` and `barklog.gg` are
attached to the `api` and `landing` services respectively in Dokploy's Domains
tab, which injects the Traefik labels and provisions each certificate. That is
only true of the public internet: `api` also joins the shared
`dokploy-network`, so any other container Dokploy puts on that network can
reach `api:3000` directly, and vice versa.

Migrations run as a one-shot `migrate` service that both apps wait on with
`service_completed_successfully`, so a failed migration blocks the deploy
instead of starting an app against a schema it does not match.

To roll back, set `IMAGE_TAG=sha-abc1234` in Dokploy's environment and
redeploy. There is no file to edit and nothing to rebuild.

> A bare `docker compose up` in this repository now starts the **production**
> stack, because `compose.yaml` is the file Compose picks up by default — and
> the `${VAR:?required}` guards do not protect you here: a git-ignored root
> `.env` exists in every checkout, so Compose fills every required variable
> from it instead of failing. The result is a live production stack, using
> your real third-party credentials and a `DATABASE_URL` pointing at your
> local Postgres, pulling the GHCR images and running `migrate` against
> whatever that URL reaches. Local development is `pnpm deps:up`, which passes
> `-f deps.compose.yaml` explicitly.

### Before the first deploy

Three things live outside this repository and need doing once.

Set each of the four GHCR packages to Public. The repository is public, so
this costs nothing and saves storing registry credentials in Dokploy. Left
private, the VPS needs a pull secret.

Confirm the PlanetScale role may create extensions. `@repo/db`'s migration
runner executes `CREATE EXTENSION IF NOT EXISTS pg_trgm`, because drizzle-kit
does not generate extension statements and the trigram search index depends on
it. If the role cannot, the `migrate` service fails and the deploy halts.

Put `sslmode=require` in `DATABASE_URL`. `createDb` passes the connection
string straight to `pg.Pool`, which reads `sslmode` from the URL, so TLS is a
property of the secret rather than of the code.

Set the deploy environment in Dokploy: `DATABASE_URL`, `CLERK_SECRET_KEY`,
`CLERK_PUBLISHABLE_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`, `ANTHROPIC_API_KEY`,
`IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET`, `REVENUECAT_WEBHOOK_SECRET`,
`REVENUECAT_WEBHOOK_SIGNING_SECRET`, and `REVENUECAT_API_KEY` are required —
the API's `env.ts` refuses to boot without any of them, and `compose.yaml`
marks each `:?required`, so an unset one halts the deploy at interpolation
rather than at boot; `IMAGE_TAG`, `LOG_LEVEL`, `IDENTIFY_MODEL`, `SYNC_CRON`,
and `SYNC_TZ` are optional and default to the values in each app's env
schema.

### Seeding the games mirror in production

The deployed `worker` container's entrypoint is the cron scheduler, not the
CLI, and the API never calls IGDB — so after the first deploy the catalogue is
empty until `SYNC_CRON` next fires. Run the same one-shot sync the CLI does,
against the deployed image, to populate it immediately:

```sh
docker compose run --rm --no-deps worker node apps/worker/dist/cli.js --full
```

### Landing site

`apps/landing` builds to static files served by nginx. `barklog.gg` is attached
to the `landing` service in Dokploy's Domains tab, the same way
`api.barklog.gg` is attached to `api`.

It has its own `Dockerfile` rather than a target in the root one: that file
builds three Node runtime images from a shared install, and this chain shares
only the base stage.

Two constraints are load-bearing and have tests behind them. `astro.config.mjs`
sets `build.inlineStylesheets: "never"`, without which Astro inlines small
stylesheets and forces `style-src 'unsafe-inline'`. And every nginx `location`
block includes `snippets/security-headers.conf` explicitly, because
`add_header` does not inherit into a block that declares its own.

```sh
pnpm --filter landing dev     # http://localhost:4321
pnpm --filter landing build
```

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
    shared/                full-screen modal listing the candidates for a shared video
      _layout.tsx  index.tsx  game/[id].tsx
    +native-intent.ts      redirects an expo-sharing intent to /shared
  api/         errors, client, endpoints, keys, provider, hooks
  auth/        auth-gate, should-clear-cache
  components/  profile-toolbar, cover, game-row, query-boundary, query-states, empty-state
  features/    backlog/ explore/ search/ game/ onboarding/ share/
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

The root layout is a `Stack`, not a `Slot`, because `(tabs)` is no longer the
only root route: `shared/` is its sibling, presented as a `fullScreenModal`
over it. Under a `Slot` it would replace the tab controller outright — the tabs
would unmount and their stacks would be lost, so there would be nothing to
return to. The extra `UINavigationController` that costs is hidden by
`headerShown: false`.

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

### Sharing a video

A YouTube or TikTok video shared into Barklog lands on the game it is about.
The journey: the share extension hands the payload to the main target, which
opens `barklog://` with an `expo-sharing` host; `app/+native-intent.ts`
rewrites that to `/shared`; `useSharedUrl` reads the resolved payloads and
`sharedUrlFrom` picks the first `https` link out of a `website` payload's
`contentUri` or a `text` payload's body; `POST /api/games/identify` turns the
link into ranked candidates; and `/shared` lists them as ordinary `GameRow`s.
Picking one pushes `/shared/game/[id]` — the same `GameDetailScreen` every tab
renders. `/shared` is a `fullScreenModal` with a toolbar button back to home
rather than a system back button: there is nothing behind a modal root to pop
to, and leaving has to clear the payload as well as navigate. Every exit calls `clear()` first, or the next cold
launch re-presents a share the user already dealt with.

The screen has four states, and `useSharedUrl` rather than the query decides
between the first three: pending, a resolution failure, a share with no link in
it, and only then the candidate list. A disabled TanStack query is permanently
pending, so routing a settled-but-urlless share through `QueryBoundary` would
spin forever. Deciding which of those a frame is in turns out to be the fiddly
part, so it lives in `shouldWaitForPayload` — pure, and unit-tested — because
`useIncomingShare` gives three overlapping signals and none alone is enough:
`isResolving` starts `false` and only turns true from an effect, one frame too
late; an empty resolved list means both "not started" and "finished with
nothing"; and a recorded error leaves the list empty too.

Three activation rules are declared, because the three sources differ —
YouTube offers a bare URL, Safari on a watch page offers a web page, and TikTok
offers text containing a URL:

```json
[
  "expo-sharing",
  {
    "ios": {
      "enabled": true,
      "activationRule": {
        "supportsWebUrlWithMaxCount": 1,
        "supportsWebPageWithMaxCount": 1,
        "supportsText": true
      }
    }
  }
]
```

`extensionBundleIdentifier` and `appGroupId` are left unset, so they default to
`gg.barklog.app.ShareExtension` and `group.gg.barklog.app`. Two Apple Developer
prerequisites follow from that, both needed before a build will install:

- an App ID for `gg.barklog.app.ShareExtension`
- the App Group `group.gg.barklog.app`, with the App Group capability enabled on
  **both** `gg.barklog.app` and the extension App ID

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

New `EXPO_PUBLIC_*` keys need no `turbo.json` entry. Turbo infers the framework
as `expo` for this package and adds an `EXPO_PUBLIC_*` wildcard to the task's
env hash, and `eslint-plugin-turbo` ships the same framework table — so the keys
already invalidate the cache when their values change, and
`turbo/no-undeclared-env-vars` does not flag them. Any key _without_ that prefix
does have to be declared.

## Premium

A free backlog holds 10 unfinished games — `waiting` or `playing`. `completed`
and `abandoned` don't count, so finishing or dropping a game frees the slot it
held; the cap limits hoarding, not how much of the catalogue a user can work
through. There are no ads on any tier, ever — not a placeholder for a later
tier, a stated product decision, and the reason the app has no ad dependency
and never needed `expo-build-properties` or static frameworks.

Premium lifts the cap and does nothing else. It is the `barklog_premium`
entitlement in RevenueCat, sold as two auto-renewing subscriptions, each with
a 7-day introductory free trial:

| Product                          | Price       |
| -------------------------------- | ----------- |
| `gg.barklog.app.premium.monthly` | $2.99/month |
| `gg.barklog.app.premium.yearly`  | $19.99/year |

The client never decides whether a user is premium — it reads `GET /api/me`.
Enforcement lives in `apps/api`, inside the same transaction that writes a
backlog entry: `lockUser` takes a `SELECT … FOR UPDATE` on the user row before
the slot count is read, so a concurrent add can't slip past the cap between
the check and the write. `packages/db` only supplies the primitives that
query — it holds no product rules and makes no entitlement judgement.

RevenueCat posts purchase and renewal events to `POST /webhooks/revenuecat`,
which authenticates each delivery twice before touching the database: a
constant-time comparison of the `Authorization` header against
`REVENUECAT_WEBHOOK_SECRET`, then an HMAC-SHA256 check of
`X-RevenueCat-Webhook-Signature` against `REVENUECAT_WEBHOOK_SIGNING_SECRET`,
computed over `${t}.${rawBody}` — the raw request bytes, read before the
validator parses them. Because a purchase can complete on device before its
webhook lands, `POST /api/subscription/refresh` re-reads the subscriber from
RevenueCat directly (using `REVENUECAT_API_KEY`) and closes that gap; the
mobile `PurchasesProvider` calls it from `customerInfoUpdateListener` and then
invalidates `GET /api/me`, so the unlock is immediate without waiting on the
webhook.

### Account deletion

Deleting an account happens in Clerk's native profile view, which the app
already presents from the profile toolbar. Clerk then sends `user.deleted` to
`POST /webhooks/clerk`, and the API removes the `users` row — from which
`backlog_entries` and `subscriptions` cascade — and scrubs the identifiers out
of `subscription_events` while keeping the rows for revenue accounting.

Two settings must be enabled in **each** Clerk instance, because production
does not inherit them from development:

1. The delete-account action in the user profile.
2. A webhook endpoint at `https://api.barklog.gg/webhooks/clerk` subscribed to
   `user.deleted`, whose signing secret becomes `CLERK_WEBHOOK_SIGNING_SECRET`.

Verify against the instance's `/v1/environment` rather than assuming the
setting carried over.

Deleting an account does **not** cancel an App Store subscription. Only Apple
can, from the user's own subscription settings.

`docs/premium-device-verification.md` is the checklist for verifying all of
this on a physical device — it can't be exercised by the test suite, because
Apple only validates a real purchase against its own servers.

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
  share/          provider, canonicalise, oembed, title extraction, identify
  routes/         probes, games, backlog, sync status
  app.ts          createApp(deps) — the middleware chain, exports AppType
  index.ts        Node bootstrap
```

Every route needs a valid Clerk session token. The only public routes are
`/healthz`, `/readyz`, `/webhooks/revenuecat`, and `/webhooks/clerk` — the two
webhooks each carrying their own authentication instead — allowlisted by exact
path in `PUBLIC_PATHS`.

| Route                                     | Notes                                                              |
| ----------------------------------------- | ------------------------------------------------------------------ |
| `GET /api/games/search?q=&limit=&offset=` | `q` ≥ 2 chars, `limit` ≤ 50, `offset` ≤ 200                        |
| `GET /api/games/popular?limit=`           | `limit` ≤ 50 (default 20)                                          |
| `GET /api/games/upcoming?limit=`          | unreleased, soonest first                                          |
| `GET /api/games/recent?limit=`            | released in the last 90 days, most rated first                     |
| `GET /api/games/:id`                      | full details plus the caller's `backlogEntry`                      |
| `GET /api/games/:id/similar?limit=`       | IGDB's `similar_games`, re-ranked; `limit` ≤ 50 (default 12)       |
| `POST /api/games/identify`                | `{url}`; YouTube or TikTok, returns ranked candidates              |
| `GET /api/backlog?status=&sort=`          | the caller's full list; `ETag` + `304`                             |
| `GET /api/backlog/stats`                  | counts per status plus average rating                              |
| `PUT /api/backlog/:gameId`                | `{status, rating?}`; `201` created, `200` updated                  |
| `DELETE /api/backlog/:gameId`             | `204`, or `404` if absent                                          |
| `GET /api/me`                             | `{premium, entitlement}` for the caller                            |
| `POST /api/subscription/refresh`          | re-reads RevenueCat directly, then answers like `GET /api/me`      |
| `GET /api/sync/status`                    | the last sync run                                                  |
| `POST /webhooks/revenuecat`               | public; authenticated by secret + HMAC, not a session token        |
| `POST /webhooks/clerk`                    | public; authenticated by `verifyClerkWebhook`, not a session token |
| `GET /healthz`                            | liveness, public, no I/O                                           |
| `GET /readyz`                             | readiness, public, strict on Postgres and Valkey                   |

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
