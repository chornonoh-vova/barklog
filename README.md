# Barklog

Track a gaming backlog with an iOS app, a Postgres game mirror, and a shared wire contract.

## Documentation

- [Agent guide](AGENTS.md): shared instructions for Codex and Claude.
- [Domain vocabulary](CONTEXT.md): names and invariants.
- [Architecture decisions](docs/adr/README.md): agreed decisions and unresolved guarantees.
- [Documentation index](docs/README.md): current implementation references and device verification.

Specs describe the checked-in implementation; ADRs record why it has that shape. Historical plans are retired navigation records, not instructions to execute. If code and an ADR disagree, report the mismatch rather than silently changing the decision.

## Workspaces

| Workspace                    | Responsibility                                               |
| ---------------------------- | ------------------------------------------------------------ |
| `apps/mobile`                | Expo iOS app, native tabs, adaptive layouts and widgets      |
| `apps/api`                   | Hono HTTP requests, backlog writes, entitlement and webhooks |
| `apps/worker`                | Scheduled and one-shot IGDB mirror sync                      |
| `apps/landing`               | Astro marketing, support and legal pages served by nginx     |
| `packages/db`                | Drizzle schema, migrations and Postgres queries              |
| `packages/contracts`         | Valibot schemas, domain constants and wire shapes            |
| `packages/igdb`              | IGDB token management, throttling, paging and mapping        |
| `packages/cache`             | Fail-open Valkey cache and counters                          |
| `packages/logging`           | Shared LogTape configuration                                 |
| `packages/eslint-config`     | Shared base, Expo, Node and Astro lint configurations        |
| `packages/typescript-config` | Shared TypeScript configurations                             |

See workspace manifests and `pnpm-workspace.yaml` for installed versions. Mobile layout and test conventions are in [its agent guide](apps/mobile/AGENTS.md) and [test README](apps/mobile/test/README.md).

## Local setup

Use Node satisfying `package.json`'s `engines` field (`.nvmrc` selects the major) and the pnpm version in `packageManager`. Docker is needed for local Postgres/Valkey and integration tests. Native iOS work also requires Xcode and signing configuration.

```sh
pnpm install
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/worker/.env.example apps/worker/.env
cp apps/mobile/.env.example apps/mobile/.env
```

Fill the copied files using their examples and the corresponding environment schemas. Root `.env` supplies database tooling; API and worker scripts load their own files. Keep shared values such as `DATABASE_URL`, `VALKEY_URL` and `LOG_LEVEL` consistent. Do not overwrite existing local configuration when repeating setup.

```sh
pnpm deps:up
pnpm --filter @repo/db db:migrate
pnpm build
pnpm --filter api dev
```

The migration runner installs `pg_trgm` as well as applying Drizzle migrations; use it instead of calling `drizzle-kit migrate` directly. `pnpm build` prepares shared packages whose imports resolve through `dist`.

Local infrastructure is explicitly `deps.compose.yaml`, managed by `pnpm deps:up` and `pnpm deps:down`. **Bare `docker compose up` uses the production `compose.yaml`.** An existing root `.env` can satisfy its required variables, so that command may pull production images and run migrations against the configured database.

### Seed or update the mirror

Configure the worker's IGDB credentials, then run:

```sh
pnpm --filter worker sync --full
pnpm --filter worker sync
pnpm --filter worker dev
```

The first command requests a full sync; the second uses the last successful watermark; the third starts the scheduler configured by `SYNC_CRON` and `SYNC_TZ`. Requests serve the local mirror rather than calling IGDB. Page transactions make replay safe, and failed runs do not advance the successful watermark. The known cleanup failure paths are recorded in [ADR-0001](docs/adr/0001-local-game-mirror.md).

### Run mobile

The app uses native Clerk, SwiftUI and widget modules and needs a native build. Configure the Clerk instance to match the server, and register signing capabilities for the app variant being built.

[app.config.js](apps/mobile/app.config.js) derives the bundle id and extension/app-group identifiers from `APP_VARIANT`: development uses `gg.barklog.app.dev`, preview uses `gg.barklog.app.preview`, and production uses `gg.barklog.app`. Configure Apple and Clerk for that identifier, not just the production one. Base capabilities and plugins are in [app.json](apps/mobile/app.json).

```sh
pnpm --filter mobile prebuild
pnpm --filter mobile ios
# For a connected physical device:
pnpm --filter mobile ios:device
```

These scripts select the development variant. Set `EXPO_PUBLIC_API_URL` to a reachable server address; on a physical device, `localhost` is the device itself. Re-run prebuild after native plugin/configuration changes.

The purchase key is selected by `__DEV__` in [env.ts](apps/mobile/src/lib/env.ts): development bundles use `EXPO_PUBLIC_REVENUECAT_TEST_KEY`, release bundles use `EXPO_PUBLIC_REVENUECAT_IOS_KEY`. Current EAS profiles are defined in [eas.json](apps/mobile/eas.json); do not infer purchase-store selection from the profile name alone.

### Run the landing site

```sh
pnpm --filter landing dev
pnpm --filter landing build
```

The site is static. Its App Store URL and contact details are in [config.ts](apps/landing/src/config.ts); its pages and assets live under `apps/landing/src`.

## Validation

The [verification workflow](.github/workflows/verify.yml) builds first, then runs formatting, lint, type checks and tests:

```sh
pnpm build
pnpm format:check
pnpm lint
pnpm check-types
pnpm test
```

Use `pnpm --filter <workspace-name> test`, `lint` or `check-types` for a targeted check after building shared dependencies. Mobile uses Jest; backend and landing workspaces use Vitest. Postgres/Valkey integration tests start disposable Testcontainers and need Docker, not the local compose stack. The separate IGDB contract-test workflow requires upstream credentials; ordinary test doubles do not prove native purchases or device behavior.

- [Mobile device verification](docs/mobile-device-verification.md)
- [Premium device verification](docs/premium-device-verification.md)

These are checklists, not records that a particular build has passed.

## Product behavior

Home, Explore and Search each own a navigation stack. Shared links open a sibling modal and lead to the same game-detail feature. Onboarding can render before sign-in; app content is gated by Clerk. Modal presentation adapts to available width.

A single backlog query supplies Home filters, counts and derived widget snapshots. The server list is capped at 5,000 entries without pagination, so larger backlogs produce truncated device views and counts. The device persists the successful backlog query per account as stale starting data. Backlog entry writes wait for the server and then refetch; there is no optimistic or offline write model. See [ADR-0002](docs/adr/0002-server-authoritative-backlog-writes.md) and [ADR-0003](docs/adr/0003-derived-device-backlog.md).

Account switches clear personal data by user id, including signed-out cold starts. The widget queue still has an unresolved stale-publication path during overlapping work; [ADR-0004](docs/adr/0004-account-switch-isolation.md) distinguishes the intended isolation from the current implementation.

Shared links may be HTTPS articles or videos. Identification gathers source metadata, extracts guesses, and searches the mirror for candidates; a candidate is not a confirmed game. A mirrored IGDB slug can be answered directly. See [ADR-0007](docs/adr/0007-staged-share-identification.md) and the [share reference](docs/superpowers/specs/2026-09-08-share-any-link-design.md).

The free-tier cap counts waiting and playing backlog entries. Premium lifts it; completed and abandoned entries consume no slot. The server's entitlement is authoritative, and device slot checks are advisory. Purchase products, pricing and offers must be verified in the connected store configuration rather than inferred from historical plans. See [ADR-0005](docs/adr/0005-server-derived-entitlement.md).

Account deletion arrives through a verified Clerk webhook, scrubs retained subscription events and writes a tombstone before deleting the user in the same transaction. It does not cancel an App Store subscription. See [ADR-0006](docs/adr/0006-clerk-account-deletion.md).

## HTTP interface

The [server reference](docs/superpowers/specs/2026-08-25-barklog-api-design.md) describes the routes, validation and error behavior. Request schemas and defaults live in [contracts](packages/contracts/src), while [app.ts](apps/api/src/app.ts) owns route mounting and middleware order.

Only `/healthz`, `/readyz`, `/webhooks/revenuecat` and `/webhooks/clerk` are exempt from Clerk session authentication; webhook handlers perform their own verification. `/healthz` checks liveness without dependency I/O; `/readyz` checks Postgres and Valkey with a bounded, briefly cached result.

## Deployment

[images.yml](.github/workflows/images.yml) publishes images after verification on pushes to `main` or manual dispatch. It does not trigger a deployment. The images are `barklog-migrate`, `barklog-api`, `barklog-worker` and `barklog-landing` under `ghcr.io/<repository-owner>/`. Branch and short-SHA tags are generated by the publish workflow; the default branch also receives `latest`.

The root Dockerfile builds the three Node targets from a pruned workspace. Migrate publishes before API and worker; landing publishes independently from its own Dockerfile. Publication is not atomic: confirm every image for a selected SHA exists before deploying that tag.

[compose.yaml](compose.yaml) describes the Dokploy stack with external Postgres, Valkey and the four published images. API and worker wait for migration success and healthy Valkey. Landing is independent. No host ports are published; API and landing join the external `dokploy-network` for domain routing.

Before deploying, configure:

- A reachable Postgres connection with the required TLS settings and permission to install `pg_trgm`.
- Registry access for all four images, and the external network and domains expected by compose.
- The variables required by `compose.yaml`, [API env validation](apps/api/src/env.ts) and [worker env validation](apps/worker/src/env.ts).
- Clerk and RevenueCat webhook destinations and matching verification secrets for the chosen environment. Use the same identity instance as the mobile build.

Use `IMAGE_TAG` to select the image set. Selecting an older image tag does not reverse database migrations; check schema compatibility before rollback. See the [deployment reference](docs/superpowers/specs/2026-09-01-container-images-and-deploy-design.md).

The deployed worker normally starts the scheduler. After migrations succeed, an explicit full seed against that environment can be run with:

```sh
docker compose run --rm --no-deps worker node apps/worker/dist/cli.js --full
```

## Logs

API and worker use the shared LogTape configuration and `LOG_LEVEL`. Request logs carry the request context; sync logs carry `runId` once the run has been created. `X-Request-Id` correlates HTTP responses, including problem documents. See [logging configuration](packages/logging/src) and [error handling](apps/api/src/problems.ts) for the actual record shapes.
