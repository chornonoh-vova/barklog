# Barklog

Track your gaming backlog — the games you own, the ones you're playing, and the
ones you keep meaning to finish — with a cute dog companion keeping score.

Turborepo monorepo for the Barklog iOS app and its backend.

## What's inside

| Workspace                    | What it is                                                         |
| ---------------------------- | ------------------------------------------------------------------ |
| `apps/mobile`                | Expo (SDK 57) app — expo-router, native tabs, SwiftUI via @expo/ui |
| `apps/api`                   | Hono HTTP API running on Node via `@hono/node-server`              |
| `apps/worker`                | Nightly IGDB → Postgres sync (`node-cron` + a one-shot CLI)        |
| `packages/db`                | Drizzle schema, migrations, connection factory                     |
| `packages/cache`             | Fail-open Valkey wrapper                                           |
| `packages/igdb`              | Typed IGDB client — token, rate limiting, keyset paging            |
| `packages/eslint-config`     | Shared flat ESLint configs (`base`, `expo`, `node`)                |
| `packages/typescript-config` | Shared tsconfig bases (`base.json`, `expo.json`, `node.json`)      |

Everything is TypeScript. The app is **iOS-only for now** (`platforms: ["ios"]`
in `app.json`) because the UI is built with `@expo/ui`'s SwiftUI components.

- App identifier: `gg.barklog.app`
- URL scheme: `barklog://`
- Associated domain: `barklog.gg`

There is **no auth yet** — every screen is reachable. See
[Adding auth](#adding-auth) for what to wire up when you get to it.

## Requirements

- Node `>=24` (see `.nvmrc`)
- pnpm 11 (`corepack enable`)
- Xcode

`pnpm-workspace.yaml` sets `nodeLinker: hoisted` because React Native does not
support pnpm's isolated `node_modules` layout.

## Getting started

```sh
pnpm install
cp apps/mobile/.env.example apps/mobile/.env.local
```

The app needs a **development build** — `@expo/ui` is a native module and is not
available in Expo Go.

```sh
# Build and install onto a connected iPhone, then start the dev server
pnpm --filter mobile ios:device

# Subsequent runs only need the dev server; the dev client picks it up
pnpm --filter mobile dev
```

Prefer a cloud build? `pnpm --filter mobile build:dev` runs
`eas build --profile development --platform ios`. Run `npx eas-cli login` and
`npx eas-cli init` once first to attach an EAS project id.

Backend:

```sh
pnpm --filter api dev        # tsx watch → http://localhost:3000
```

When running the app on a physical device, point `EXPO_PUBLIC_API_URL` at your
machine's LAN IP rather than `localhost`.

## Local infrastructure

Postgres and Valkey run in Docker; the API and worker run on the host so
reloads stay fast.

```sh
docker compose up -d
cp .env.example .env          # then fill in the IGDB credentials
set -a && . ./.env && set +a  # export them into your shell
pnpm --filter @repo/db db:migrate
```

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
use the docker-compose stack, so all they need is a running Docker daemon. The
compose stack is purely a development convenience.

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
| `pnpm --filter mobile ios`           | Dev build on the simulator           |
| `pnpm --filter mobile ios:device`    | Dev build on a connected device      |
| `pnpm --filter mobile prebuild`      | Regenerate the native `ios/` project |

## apps/mobile

```
src/
  app/
    _layout.tsx        root Stack + theme
    (tabs)/
      _layout.tsx      NativeTabs: Home · Explore · Profile, plus Search
      index.tsx        Home — your backlog
      explore.tsx
      profile.tsx
      search.tsx       declared with role="search"
  components/
    placeholder-screen.tsx
  theme.ts             brand tint, fed to SwiftUI via <Host seedColor>
```

**Tabs.** Expo Router's native tabs (`expo-router/unstable-native-tabs`) render
a real `UITabBarController`. Home, Explore and Profile form the main group;
Search uses `role="search"`, which on iOS 26+ pulls it out of the group and
turns it into the native search field. Icons are SF Symbols (`sf`) with
Material Symbols (`md`) kept in place for whenever Android lands.

**UI.** Screens are SwiftUI, rendered through `@expo/ui/swift-ui` inside a
`<Host>`. Styling uses SwiftUI modifiers from `@expo/ui/swift-ui/modifiers`
rather than React Native stylesheets.

## Adding auth

The skeleton is deliberately unauthenticated. When you add a provider, the
pieces that need to land are:

- A provider at the root of `src/app/_layout.tsx`, wrapping the `Stack`.
- Session persistence in the keychain (`expo-secure-store`).
- A `src/app/sign-in.tsx` route, gated with `Stack.Protected guard={...}` so a
  signed-out user can only reach it.
- Hold the splash screen (`expo-splash-screen`) until the session has been
  restored, so an already-signed-in user never sees the sign-in screen flash.
- For native Sign in with Apple: `expo-apple-authentication` in `dependencies`
  **and** in `app.json` `plugins` — the config plugin is what adds the
  `com.apple.developer.applesignin` entitlement. Needs a paid Apple Developer
  team.
- Declare any new `EXPO_PUBLIC_*` keys in `turbo.json` under the `dev` and
  `build` task `env` arrays, or `turbo/no-undeclared-env-vars` will flag them.

## apps/api

```
src/
  app.ts      Hono app + routes, exports `AppType` for Hono's typed RPC client
  index.ts    Node server bootstrap (PORT, default 3000)
```

`pnpm --filter api build` emits `dist/`; `pnpm --filter api start` runs it.

## apps/worker

```
src/
  env.ts      zod-validated environment, parsed once at boot
  context.ts  wires db + cache + IGDB client into SyncDeps
  persist.ts  writes one IGDB page in a single transaction
  sync.ts     syncAll() — advisory lock, watermark, page loop, bookkeeping
  cli.ts      one-shot run: `pnpm --filter worker sync [--full]`
  index.ts    node-cron scheduler (SYNC_CRON, SYNC_TZ)
```

The worker holds a Postgres advisory lock for the duration of a run, so a
manual `sync` colliding with the nightly cron is skipped rather than run twice.
Progress is recorded in the `sync_runs` table.
