# Container Images and Deployment — Design

**Date:** 2026-09-01
**Status:** Approved for planning

## 1. Purpose

The repository has no Dockerfile and no continuous-delivery workflow. Postgres
and Valkey run locally through `deps.compose.yaml` while the API and worker run
on the host under `tsx watch`; nothing describes how either process reaches a
server.

This design adds the missing half: images built and published from CI, and a
compose stack that runs them on a Dokploy-managed VPS.

### Goals

- One `Dockerfile` produces three runtime images — `api`, `worker`, and a
  one-shot `migrate` — sharing a single dependency install and build.
- Pushing to `main` publishes those images to the GitHub Container Registry,
  gated on lint, type-checking, and the test suite.
- A root `compose.yaml` runs api, worker, and Valkey on the VPS, with only the
  API reachable from outside.
- Drizzle migrations apply automatically on each deploy, before either app
  starts.

### Non-goals

- Postgres is not in the stack. It lives on PlanetScale, reached over the
  network.
- The promotional site at `barklog.gg` is out of scope. This design covers
  `api.barklog.gg` only.
- No multi-architecture images. The VPS is `linux/amd64`.
- No deploy webhook. Dokploy pulls when told to from its UI.

## 2. Decisions

| Question                | Decision                                                              |
| ----------------------- | --------------------------------------------------------------------- |
| Who applies migrations? | A one-shot `migrate` service in compose, which api and worker wait on |
| Image layout            | One `Dockerfile`, three published targets                             |
| Build strategy          | `turbo prune --docker`, one shared `deps`/`builder` pair              |
| Release trigger         | Push to `main`; no webhook, deploys stay deliberate                   |
| CI gate                 | `lint`, `check-types`, and `test` must pass before publish            |
| Ingress                 | Dokploy's Domains UI injects Traefik labels; compose carries none     |

Two decisions deserve their reasoning recorded.

**Migrations as a compose service, not at API startup.** Running them in the
API's entrypoint is simpler by one service, but it couples serving to schema
changes: a bad migration stops the API from booting at all, and a second replica
would race the first. A one-shot service that api and worker gate on keeps the
failure contained to the deploy.

**`turbo prune`, not a full workspace install.** `apps/mobile` is in the pnpm
workspace with 25 Expo and React Native dependencies. A plain
`pnpm install --frozen-lockfile` inside the image would download all of it for
nothing, and any change to `apps/mobile/package.json` would invalidate the API's
dependency layer. Pruning to `api worker` emits a subset lockfile that excludes
the mobile app entirely.

`pnpm deploy` would yield smaller images still, but it is awkward under this
workspace's `nodeLinker: hoisted` and is inherently per-app, which would defeat
the shared build stage.

## 3. `Dockerfile`

Six stages at the repository root, three of them published.

```
base        node:24-alpine, corepack enable, WORKDIR /app
 └ pruner   COPY . . → turbo prune api worker --docker
    ├ deps       out/json + out/pnpm-lock.yaml → pnpm install --frozen-lockfile
    │  └ builder + out/full → turbo run build --filter=api --filter=worker
    ├ prod-deps  out/json + lockfile → pnpm install --prod --frozen-lockfile
    └ runtime-base  prod node_modules + packages/*/dist + packages/db/drizzle
       ├ api      + apps/api/dist    → node apps/api/dist/index.js
       ├ worker   + apps/worker/dist → node apps/worker/dist/index.js
       └ migrate  (nothing extra)    → node packages/db/dist/migrate-cli.js
```

`deps` and `prod-deps` copy only the pruned manifests and lockfile, so a
source-only change rebuilds `builder` alone. `prod-deps` is a second install
rather than a post-build `--prod` prune specifically so that no layer the
runtime images inherit has ever contained a dev dependency.

Pruning `api worker` pulls in the whole of `@repo/db`, so `migrate` needs no
scope of its own.

### 3.1 Constraints the stages must respect

- **`runtime-base` must carry `packages/db/drizzle/*.sql`.** `runMigrations` in
  `packages/db/src/migrate.ts` resolves `../drizzle` relative to its own
  compiled location, so the SQL has to sit beside `dist/`. All three targets
  inherit the directory; only `migrate` reads it.
- **The whole dependency tree must be copied, not just the root.** pnpm's
  hoisted linker puts the real packages in `/app/node_modules` as ordinary
  directories, but the `@repo/*` links live in per-project directories —
  `apps/api/node_modules/@repo/db -> ../../../../packages/db`, and likewise for
  `apps/worker` and `packages/igdb`. There is no `/app/node_modules/@repo`.
  `runtime-base` therefore copies the entire `/app` tree from `prod-deps`;
  copying `/app/node_modules` alone would leave those links behind and every
  `@repo` import would fail to resolve.
- **Containers run as the image's `node` user**, not root.
- **The turbo version is pinned twice.** The `pruner` stage invokes
  `pnpm dlx turbo@2.10.11`, duplicating the pin in the root `package.json`.
  A comment in the Dockerfile notes that the two must move together.
- **`linux/amd64` only.**

### 3.2 `.dockerignore`

Excludes `node_modules`, `dist`, `.turbo`, `out`, `.git`, `.github`, `docs`,
every `.env`/`.env.*` file, `.DS_Store`, `coverage`, `.expo`, and
`.superpowers`. For nested matches, `node_modules`, `dist`, `.turbo`, `.env`,
`.env.*`, `.DS_Store`, `coverage`, and `.expo` are listed in both bare and
`**/` forms so they are excluded anywhere in the tree — not just at the root.
The others (`out`, `.git`, `.github`, `docs`, `.superpowers`) are bare form
only. This keeps the pruner's `COPY . .` cheap and, more importantly,
keeps developer secrets out of the build context.

`apps/mobile` is deliberately **not** excluded. `turbo prune` reads the whole
workspace to rewrite the lockfile, and an importer present in
`pnpm-lock.yaml` with no `package.json` on disk makes the pruned output
inconsistent — so the mobile app's source has to stay in the build context
even though none of it ends up in an image.

## 4. `.github/workflows/images.yml`

Triggers on push to `main` and on `workflow_dispatch`. A `concurrency` group
keyed on the ref cancels superseded runs, so two merges in quick succession
cannot race over the `:main` tag.

**`verify` job.** pnpm install, then `pnpm lint`, `pnpm check-types`, and
`pnpm test`. No secrets required: the only credential-dependent test is
`packages/igdb`'s contract test, which lives behind a separate vitest config and
runs from its own scheduled workflow.

**`publish` job.** `needs: verify`, with `permissions: packages: write`. Logs
into `ghcr.io` using `GITHUB_TOKEN`, then runs three `docker/build-push-action`
steps — one per target — sequentially, all sharing one `type=gha` cache scope.

Sequential is deliberate. The second and third steps hit cache for `pruner`,
`deps`, and `builder`, so the expensive work happens exactly once. A matrix
would run those stages three times in parallel and contend over the cache.

Tags per image, from `docker/metadata-action`: `:main`, `:sha-<short>`, and
`:latest`. `provenance` is disabled, which avoids the `unknown/unknown` manifest
entry that appears in GHCR's package UI for single-platform builds.

Published images:

- `ghcr.io/chornonoh-vova/barklog-api`
- `ghcr.io/chornonoh-vova/barklog-worker`
- `ghcr.io/chornonoh-vova/barklog-migrate`

**One manual step, once.** After the first successful run, set each package's
visibility to Public in GitHub. The repository is public, so this costs nothing
and saves storing registry credentials in Dokploy. Left private, the VPS needs a
pull secret.

## 5. `compose.yaml`

Four services. Exactly one is reachable from outside the VPS.

| Service   | Image                    | Reachable from                                         |
| --------- | ------------------------ | ------------------------------------------------------ |
| `migrate` | `barklog-migrate`        | nothing; runs to completion and exits, `restart: "no"` |
| `api`     | `barklog-api`            | Traefik only, over `dokploy-network`; `expose: 3000`   |
| `worker`  | `barklog-worker`         | the project's internal network only                    |
| `valkey`  | `valkey/valkey:9-alpine` | the project's internal network only                    |

The file declares no `ports:` at all. That single absence is what keeps the
worker and Valkey off the host's public interface — they are addressable by
service name from inside the project network and nowhere else.

`api` joins both the default network and the external `dokploy-network` so that
Traefik can route to it. `api.barklog.gg` is attached to the `api` service in
Dokploy's Domains tab, which injects the routing labels and provisions the
certificate. No Traefik labels appear in the file, which keeps it readable and
free of coupling to one reverse-proxy configuration.

### 5.1 Ordering

Both `api` and `worker` declare:

```yaml
depends_on:
  migrate:
    condition: service_completed_successfully
  valkey:
    condition: service_healthy
```

A failed migration therefore blocks the deploy rather than starting apps against
a schema they do not match. Dokploy runs `docker compose up -d` on each deploy,
which re-runs the one-shot `migrate` service.

### 5.2 Configuration

`VALKEY_URL=redis://valkey:6379` and `NODE_ENV=production` are written into the
file, because they are facts about the topology rather than secrets.

Everything else comes from Dokploy's environment through `${VAR:?message}`
required-variable syntax, so a missing secret fails at `compose up` naming the
variable, instead of surfacing later as a valibot error inside a restarting
container: `DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`,
`ANTHROPIC_API_KEY`, `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET`. Optional, with
defaults matching each app's env schema: `LOG_LEVEL`, `IDENTIFY_MODEL`,
`SYNC_CRON`, `SYNC_TZ`.

All three images use `${IMAGE_TAG:-main}`. Rollback is then setting
`IMAGE_TAG=sha-abc1234` in Dokploy and redeploying, with no file edit and no
rebuild.

### 5.3 Health

`api` gets a healthcheck against `/healthz` using busybox `wget`. The port is
the literal `3000`, matching the literal `PORT: 3000` set in the same
service's `environment:` above — not `${PORT:-3000}`. The two are hardcoded
together on purpose: Dokploy's environment cannot desync a value that isn't
read from it.

Deliberately not `/readyz`, though not for the reason it might seem at first.
Compose's `restart:` policies trigger on container exit, never on health
status — health-gated restarting is Swarm behaviour, not Compose's — so a
failing healthcheck here has no remediation path regardless of which path is
probed; it is purely observational. The real reasons are that Traefik's
Docker provider _does_ act on container health: with the default
`allowEmptyServices: false`, unhealthy containers drop from the load balancer
entirely (requests get 404), or with `allowEmptyServices: true`, Traefik
keeps an empty server entry (requests get 503). So a `/readyz` check would
gate traffic on the API's dependencies — a PlanetScale blip would remove it
from routing, giving callers a bare 404 or 503 instead of the API's own
structured problem-details response naming which dependency is down. `/healthz`
keeps the container in the load balancer and lets the API report dependency
trouble in its format. Additionally, if Dokploy runs `up -d --wait`, a
`/readyz` check would fail the whole deploy on a transient blip the API is
built to survive and report. Traffic gates on liveness, not readiness, so
Traefik routes to the API while it is alive and its dependencies are down.

`worker` gets no healthcheck — it runs a cron schedule and serves nothing to
probe. It relies on `restart: unless-stopped`.

`valkey` keeps the `valkey-cli ping` check and the persistence-off flags from
`deps.compose.yaml`. Its contents remain a cache and rate-limit counters, all
reconstructible.

## 6. Supporting change

`packages/db/package.json` lists `@testcontainers/postgresql` under
`dependencies`, unlike `@repo/cache`, which correctly lists
`@testcontainers/redis` under `devDependencies`. As written, the production
image ships testcontainers along with dockerode and ssh2.

Move it to `devDependencies`. Its only importer is
`packages/db/src/testing.ts`, which is compiled at build time and imported at
test time, both of which have dev dependencies available. Consumers reach it
through `@repo/db/testing` and resolve it from the hoisted root
`node_modules`.

Verification: the full test suite passes afterwards, which exercises
`@repo/db/testing` from `apps/api`, `apps/worker`, and `packages/cache`.

## 7. Operational prerequisites

Three things live outside this repository and need confirming before the first
deploy.

1. **`pg_trgm` on PlanetScale.** `runMigrations` unconditionally executes
   `CREATE EXTENSION IF NOT EXISTS pg_trgm`, because drizzle-kit does not
   generate extension statements and the trigram index cannot be built without
   it. If the PlanetScale role cannot create extensions, the `migrate` service
   fails and the deploy halts.
2. **`sslmode=require` in `DATABASE_URL`.** `createDb` passes the connection
   string straight to `pg.Pool`, which reads `sslmode` from the URL. TLS is
   therefore a property of the secret, not of the code.
3. **The `dokploy-network` name.** This is what Dokploy's Traefik expects for a
   compose deployment with a UI-managed domain, but it has not been confirmed
   against this instance. If routing does not come up, check this first.

## 8. Known footgun

Adding `compose.yaml` at the repository root means a bare `docker compose up`
starts the production stack, where today it errors out for want of a file.
`pnpm deps:up` is unaffected because it passes `-f deps.compose.yaml`
explicitly.

The name stays as it is, since it is what Dokploy looks for by default. A header
comment in the file states which stack it describes and points to
`deps.compose.yaml` for local development, mirroring the comment that file
already carries.

## 9. Testing

Container and CI work resists unit testing; verification is by execution.

- `docker build --target api|worker|migrate` succeeds locally for all three.
- The `api` image starts against the local `deps.compose.yaml` stack and
  answers `/healthz` and `/readyz`.
- The `migrate` image applies migrations to a scratch Postgres and exits zero;
  a second run is a no-op that also exits zero.
- The `worker` image starts, logs its schedule, and exits cleanly on `SIGTERM`.
- `pnpm test` passes after the `@testcontainers/postgresql` move.
- The published `:sha-<short>` tags exist for all three images after the first
  workflow run.
