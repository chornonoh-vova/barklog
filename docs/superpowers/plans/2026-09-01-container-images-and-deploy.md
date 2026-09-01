# Container Images and Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish `api`, `worker`, and one-shot `migrate` images to GHCR on every push to `main`, and add a root `compose.yaml` that runs them plus Valkey on a Dokploy-managed VPS with only the API reachable from outside.

**Architecture:** One root `Dockerfile` with six stages. A `pruner` stage runs `turbo prune api worker --docker` to cut `apps/mobile` out of the workspace; `deps` and `prod-deps` each install from the pruned manifests independently; `builder` compiles with turbo; `runtime-base` combines the production dependency tree with every built workspace package; and three thin targets add one app each. A `verify`-gated workflow builds the three targets sequentially over one shared BuildKit cache.

**Tech Stack:** Docker BuildKit multi-stage builds, `node:24-alpine`, pnpm 11.22.0 via corepack, Turborepo 2.10.11, GitHub Actions (`docker/build-push-action@v6`, `docker/metadata-action@v5`), Docker Compose, Valkey 9, Dokploy + Traefik.

**Spec:** `docs/superpowers/specs/2026-09-01-container-images-and-deploy-design.md`

## Global Constraints

- Node `24` (`node:24-alpine`); root `package.json` requires `>=24`.
- pnpm `11.22.0`, pinned by the root `packageManager` field, enabled with corepack.
- Turbo `2.10.11`, pinned in the root `package.json` **and** in the Dockerfile's `pruner` stage. The two must move together.
- Platform `linux/amd64` only. No multi-arch builds.
- Registry `ghcr.io`, owner `chornonoh-vova`. Image names: `barklog-api`, `barklog-worker`, `barklog-migrate`.
- Tags per image: the branch name (`main`), `sha-<short>`, and `latest`.
- Containers run as the image's built-in `node` user, never root.
- `compose.yaml` declares **no** `ports:` for any service. That absence is the security boundary.
- Compose reads secrets through `${VAR:?message}` required-variable syntax so a missing value fails at `compose up`, naming the variable.
- All three compose services pin `${IMAGE_TAG:-main}`.

## Verified Facts

These were checked against the real repository while writing this plan. Trust them; do not re-derive.

- `turbo prune api worker --docker` writes `out/json/` (10 `package.json` files **plus** `pnpm-lock.yaml` **and** `pnpm-workspace.yaml`), `out/full/` (sources, including `packages/db/drizzle/` and `turbo.json`), and a duplicate `out/pnpm-lock.yaml` / `out/pnpm-workspace.yaml` at the top level. Because `out/json/` already carries the lockfile and workspace file, `COPY --from=pruner /app/out/json/ .` is sufficient — no separate lockfile `COPY` is needed.
- Pruning drops `apps/mobile` from the lockfile's importers and halves it: 13,905 → 6,660 lines. Included packages are `api`, `worker`, `@repo/{cache,contracts,db,igdb,logging,eslint-config,typescript-config}`.
- `pnpm install --prod --frozen-lockfile` against `out/json/` succeeds and installs 226 packages / ~136 MB.
- **pnpm's hoisted linker puts `@repo/*` links in per-project directories, not at the root.** After a prod install there is no `node_modules/@repo` at all. The links are `apps/api/node_modules/@repo/{cache,contracts,db,logging} -> ../../../../packages/<name>`, `apps/worker/node_modules/@repo/{cache,db,igdb,logging}`, and `packages/igdb/node_modules/@repo/cache -> ../../../cache`. Root `node_modules/*` entries are real directories, and `node_modules/.pnpm` is ~1 MB. This is why `runtime-base` copies the **whole** `/app` tree from `prod-deps` rather than just `/app/node_modules`.
- The prod tree contains `typescript` (24 MB) and `react-dom` (8 MB) as auto-installed peer dependencies (`autoInstallPeers: true`): `typescript` is a peer of `valibot`, `react-dom` a peer of `@clerk/shared`. Neither is used at runtime. We accept them — disabling `auto-install-peers` would conflict with the frozen lockfile, and hand-deleting directories from `node_modules` is a gamble. Expect a ~200 MB image.
- `dockerode`, `@grpc/grpc-js`, `protobufjs`, and `archiver`/`lodash` in the prod tree all trace to `@testcontainers/postgresql`, which Task 1 removes.
- `pnpm test` needs no secrets. The only credential-dependent test is `packages/igdb`'s contract test, which has its own vitest config (`test:contract`) and its own scheduled workflow.
- `turbo run build` accepts `--ui=stream`.
- The repo is public (`chornonoh-vova/barklog`), so GHCR packages can be made public and the VPS needs no pull secret.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `Dockerfile` (create) | All six stages and three published targets. One file because the stages share a dependency install and a build. |
| `.dockerignore` (create) | Keeps the pruner's `COPY . .` cheap and keeps developer `.env` files out of the build context. |
| `.github/workflows/images.yml` (create) | `verify` job (build, lint, check-types, test) gating a `publish` job (three sequential buildx steps). |
| `compose.yaml` (create) | The VPS runtime topology: migrate, api, worker, valkey. |
| `packages/db/package.json` (modify) | Move `@testcontainers/postgresql` to `devDependencies`. |
| `pnpm-lock.yaml` (modify) | Regenerated by Task 1. |
| `README.md` (modify) | A `## Deployment` section describing the images, the workflow, and the compose stack. |
| `docs/superpowers/specs/2026-09-01-container-images-and-deploy-design.md` (modify) | Correct §3.1's claim about where the pnpm symlinks live. |

---

### Task 1: Move `@testcontainers/postgresql` out of production dependencies

Spec §6. Do this first so the image built in Task 2 never contains testcontainers.

`packages/db` lists `@testcontainers/postgresql` under `dependencies`, unlike `@repo/cache`, which correctly lists `@testcontainers/redis` under `devDependencies`. As written, the production tree carries testcontainers along with dockerode, `@grpc/grpc-js`, protobufjs, and archiver.

**Files:**
- Modify: `packages/db/package.json`
- Modify: `pnpm-lock.yaml` (regenerated, not hand-edited)

**Interfaces:**
- Consumes: nothing.
- Produces: a `pnpm-lock.yaml` in which `@testcontainers/postgresql` appears only under `devDependencies` for `packages/db`. Task 2's `prod-deps` stage depends on this.

- [ ] **Step 1: Record the current production footprint, so the change can be measured**

```bash
git -C . rev-parse --short HEAD
node -e "const p=require('./packages/db/package.json');console.log('dependencies:',Object.keys(p.dependencies))"
```

Expected: `dependencies: [ '@testcontainers/postgresql', 'drizzle-orm', 'pg' ]`

- [ ] **Step 2: Confirm the test suite passes before the move**

This is the baseline. If it is already failing, stop and report — do not attribute a pre-existing failure to this change.

Run: `pnpm test`
Expected: PASS

- [ ] **Step 3: Move the dependency**

Edit `packages/db/package.json`. Remove `"@testcontainers/postgresql": "^12.1.0"` from `dependencies` and add it to `devDependencies`, keeping both blocks alphabetically sorted as the file already is.

`dependencies` becomes:

```json
  "dependencies": {
    "drizzle-orm": "^0.45.2",
    "pg": "^8.23.0"
  },
```

`devDependencies` becomes:

```json
  "devDependencies": {
    "@repo/contracts": "workspace:*",
    "@repo/eslint-config": "workspace:*",
    "@repo/typescript-config": "workspace:*",
    "@testcontainers/postgresql": "^12.1.0",
    "@types/node": "^26.2.0",
    "@types/pg": "^8.23.1",
    "drizzle-kit": "^0.31.10",
    "eslint": "^9.39.5",
    "tsx": "^4.23.12",
    "typescript": "~6.0.3",
    "vitest": "^4.1.11"
  }
```

- [ ] **Step 4: Regenerate the lockfile**

The lockfile records which dependencies are dev, so it must be updated. Do not pass `--frozen-lockfile` here.

Run: `pnpm install`
Expected: succeeds; `pnpm-lock.yaml` shows changes under the `packages/db:` importer only.

Verify the shape of the diff:

```bash
git diff --stat pnpm-lock.yaml packages/db/package.json
git diff pnpm-lock.yaml | grep -c "testcontainers"
```

- [ ] **Step 5: Confirm nothing broke**

`packages/db/src/testing.ts` is the only importer. It is compiled at build time and imported at test time, both of which have dev dependencies available. Consumers reach it through `@repo/db/testing` and resolve it from the hoisted root `node_modules`. The suite exercises that path from `apps/api`, `apps/worker`, and `packages/cache`.

Run: `pnpm build && pnpm check-types && pnpm test`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add packages/db/package.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
build(db): make @testcontainers/postgresql a dev dependency

It sat under `dependencies`, unlike @repo/cache's @testcontainers/redis, so
a production install pulled in testcontainers along with dockerode,
@grpc/grpc-js, protobufjs and archiver. Its only importer is
src/testing.ts, which is compiled at build time and imported at test time.
EOF
)"
```

---

### Task 2: `Dockerfile` and `.dockerignore`

Spec §3. One deliverable: three images that build and run.

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Modify: `docs/superpowers/specs/2026-09-01-container-images-and-deploy-design.md` (§3.1 correction)

**Interfaces:**
- Consumes: Task 1's lockfile.
- Produces: build targets named exactly `api`, `worker`, and `migrate`, referenced by `--target` in Task 3. The API listens on container port `3000`. Entrypoints are `node apps/api/dist/index.js`, `node apps/worker/dist/index.js`, and `node packages/db/dist/migrate-cli.js`.

- [ ] **Step 1: Write `.dockerignore`**

```
# Keeps the pruner stage's `COPY . .` cheap and, more importantly, keeps
# developer .env files out of the build context.

node_modules
**/node_modules
dist
**/dist
.turbo
**/.turbo
out
.git
.github
docs

# Every local secret file. The build reads none of them.
.env
.env.*
apps/*/.env
apps/*/.env.*

.DS_Store
coverage
.expo
.superpowers

# NOTE: apps/mobile is deliberately NOT excluded. `turbo prune` reads the whole
# workspace to rewrite the lockfile, and an importer present in pnpm-lock.yaml
# with no package.json on disk makes the pruned output inconsistent.
```

- [ ] **Step 2: Write the `Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1

# Three runtime images from one build: `api`, `worker`, and the one-shot
# `migrate`. Design: docs/superpowers/specs/2026-09-01-container-images-and-deploy-design.md
#
# Build one target at a time:
#   docker build --target api -t barklog-api .

FROM node:24-alpine AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    TURBO_TELEMETRY_DISABLED=1 \
    DO_NOT_TRACK=1
RUN corepack enable pnpm
WORKDIR /app

# ---------------------------------------------------------------------------
# pruner — cut the workspace down to api, worker, and what they depend on.
#
# apps/mobile brings 25 Expo and React Native dependencies that no image needs.
# Pruning halves the lockfile (13905 -> 6660 lines) and stops a change to the
# mobile app from invalidating the dependency layers below.
#
# The turbo version is pinned here as well as in the root package.json. Keep
# the two in step.
# ---------------------------------------------------------------------------
FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2.10.11 prune api worker --docker

# ---------------------------------------------------------------------------
# deps — full install, dev dependencies included, for the build.
#
# Keyed on the pruned manifests alone, so a source-only change does not
# re-install. `out/json/` already carries pnpm-lock.yaml and
# pnpm-workspace.yaml, so this one COPY is everything the install needs.
# ---------------------------------------------------------------------------
FROM base AS deps
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY --from=pruner /app/out/full/ .
RUN pnpm exec turbo run build --filter=api --filter=worker --ui=stream

# ---------------------------------------------------------------------------
# prod-deps — a second, independent install rather than a post-build prune of
# `deps`, so that no layer the runtime images inherit has ever held a dev
# dependency.
# ---------------------------------------------------------------------------
FROM base AS prod-deps
COPY --from=pruner /app/out/json/ .
RUN pnpm install --prod --frozen-lockfile

# ---------------------------------------------------------------------------
# runtime-base — production dependencies plus every built workspace package.
#
# Copying the whole /app tree from prod-deps is deliberate. pnpm's hoisted
# linker puts the real packages in /app/node_modules but the @repo/* links in
# per-project directories — apps/api/node_modules/@repo/db ->
# ../../../../packages/db, and likewise for apps/worker and packages/igdb.
# There is no /app/node_modules/@repo at all. Copying only /app/node_modules
# would leave those links behind and every @repo import would fail to resolve.
# ---------------------------------------------------------------------------
FROM base AS runtime-base
ENV NODE_ENV=production
COPY --from=prod-deps /app/ .
COPY --from=builder /app/packages/cache/dist ./packages/cache/dist
COPY --from=builder /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/packages/igdb/dist ./packages/igdb/dist
COPY --from=builder /app/packages/logging/dist ./packages/logging/dist
# runMigrations resolves ../drizzle relative to its own compiled location, so
# the SQL has to sit beside packages/db/dist. All three targets inherit it;
# only `migrate` reads it.
COPY --from=builder /app/packages/db/drizzle ./packages/db/drizzle
USER node

FROM runtime-base AS api
COPY --from=builder /app/apps/api/dist ./apps/api/dist
EXPOSE 3000
CMD ["node", "apps/api/dist/index.js"]

FROM runtime-base AS worker
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
CMD ["node", "apps/worker/dist/index.js"]

FROM runtime-base AS migrate
CMD ["node", "packages/db/dist/migrate-cli.js"]
```

- [ ] **Step 3: Build all three targets**

```bash
docker build --target api     -t barklog-api:dev     .
docker build --target worker  -t barklog-worker:dev  .
docker build --target migrate -t barklog-migrate:dev .
```

Expected: all three succeed. The second and third reuse cached `pruner`, `deps`, `builder`, and `prod-deps` layers, so they finish in seconds.

If `pnpm exec turbo run build` fails to find `turbo`, the `deps` install did not include the root devDependencies — check that `out/json/package.json` was copied to `/app/package.json` and not into a subdirectory (the trailing slash on `COPY --from=pruner /app/out/json/ .` matters).

- [ ] **Step 4: Record the image sizes**

```bash
docker images --format '{{.Repository}}:{{.Tag}}\t{{.Size}}' | grep barklog
```

Expected: roughly 200 MB each, dominated by the ~136 MB production `node_modules`. Note the actual numbers in the commit message. If any image exceeds ~300 MB, check that `USER node` did not silently pull in a dev install.

- [ ] **Step 5: Start the local dependency stack**

Run: `pnpm deps:up`
Expected: `postgres` and `valkey` healthy. This creates the `barklog_default` Docker network, which the next steps join so the containers can reach Postgres by service name on any platform.

- [ ] **Step 6: Verify the `migrate` image applies migrations and is idempotent**

```bash
docker run --rm --network barklog_default \
  -e DATABASE_URL=postgres://barklog:barklog@postgres:5432/barklog \
  barklog-migrate:dev
```

Expected: prints `migrations applied` and exits `0`.

Run the identical command a second time. Expected: prints `migrations applied` and exits `0` again — a no-op, because drizzle's journal records what has already run. Confirm the exit code explicitly:

```bash
echo "exit=$?"
```

Expected: `exit=0`

- [ ] **Step 7: Verify the `api` image serves both probes**

`--env-file apps/api/.env` supplies the real Clerk and Anthropic keys; the two `-e` flags then override the localhost URLs with in-network ones. Port 3100 on the host avoids colliding with a `pnpm dev` API already on 3000.

```bash
docker run --rm --name barklog-api-check --network barklog_default -p 3100:3000 \
  --env-file apps/api/.env \
  -e DATABASE_URL=postgres://barklog:barklog@postgres:5432/barklog \
  -e VALKEY_URL=redis://valkey:6379 \
  barklog-api:dev
```

Expected log line: `Listening on http://localhost:3000`

In a second shell:

```bash
curl -fsS http://127.0.0.1:3100/healthz; echo
curl -fsS http://127.0.0.1:3100/readyz;  echo
```

Expected:

```
{"status":"ok"}
{"status":"ok","checks":{"postgres":"up","valkey":"up"}}
```

`/readyz` returning `up` for both is the proof that the `@repo/db` and `@repo/cache` symlinks survived the copy into `runtime-base` — that is the whole point of this check, not just liveness.

- [ ] **Step 8: Verify the `api` image shuts down cleanly on SIGTERM**

```bash
docker stop barklog-api-check
```

Expected: logs `SIGTERM — shutting down` and the container exits within a second or two, well inside the 10 s force-exit timer, rather than being killed at Docker's 10 s deadline.

- [ ] **Step 9: Verify the `worker` image starts, schedules, and stops**

`SYNC_CRON` is overridden on the command line on purpose: `apps/worker/.env.example` writes it as `SYNC_CRON="0 0 * * *"`, and Docker's `--env-file` parser keeps the quotes as part of the value, which node-cron rejects.

```bash
docker run --rm --name barklog-worker-check --network barklog_default \
  --env-file apps/worker/.env \
  -e DATABASE_URL=postgres://barklog:barklog@postgres:5432/barklog \
  -e VALKEY_URL=redis://valkey:6379 \
  -e SYNC_CRON='0 0 * * *' \
  -e SYNC_TZ=UTC \
  barklog-worker:dev
```

Expected log line: `Scheduled 0 0 * * * (UTC).`

Then, in a second shell: `docker stop barklog-worker-check`
Expected: logs `SIGTERM — shutting down.` and exits.

- [ ] **Step 10: Correct §3.1 of the spec**

The spec was written before the pnpm layout was inspected and claims the `@repo/*` symlinks live at `/app/node_modules`. They do not. Replace the "Symlinks must survive the copy" bullet in §3.1 with:

```markdown
- **The whole dependency tree must be copied, not just the root.** pnpm's
  hoisted linker puts the real packages in `/app/node_modules` as ordinary
  directories, but the `@repo/*` links live in per-project directories —
  `apps/api/node_modules/@repo/db -> ../../../../packages/db`, and likewise for
  `apps/worker` and `packages/igdb`. There is no `/app/node_modules/@repo`.
  `runtime-base` therefore copies the entire `/app` tree from `prod-deps`;
  copying `/app/node_modules` alone would leave those links behind and every
  `@repo` import would fail to resolve.
```

- [ ] **Step 11: Commit**

```bash
git add Dockerfile .dockerignore docs/superpowers/specs/2026-09-01-container-images-and-deploy-design.md
git commit -m "$(cat <<'EOF'
build: add a Dockerfile with api, worker and migrate targets

Six stages over one turbo-pruned workspace: pruning api and worker drops
apps/mobile's 25 Expo dependencies and halves the lockfile. `deps` and
`prod-deps` install independently so no layer the runtime images inherit
has held a dev dependency.

runtime-base copies the whole /app tree from prod-deps because pnpm's
hoisted linker keeps the @repo/* links in per-project node_modules, not at
the root — the spec's §3.1 claim to the contrary is corrected here.

Verified: all three targets build; migrate applies and re-applies cleanly;
the api image answers /healthz and /readyz against the local deps stack;
both apps exit on SIGTERM.
EOF
)"
```

---

### Task 3: `.github/workflows/images.yml`

Spec §4.

**Files:**
- Create: `.github/workflows/images.yml`

**Interfaces:**
- Consumes: Task 2's `api`, `worker`, and `migrate` build targets.
- Produces: `ghcr.io/chornonoh-vova/barklog-{api,worker,migrate}`, each tagged `main`, `sha-<short>`, and `latest`. Task 4's `compose.yaml` references these names.

- [ ] **Step 1: Confirm the verify job's command order works from a clean install**

`check-types` and the test suites resolve `@repo/*` through each package's built `.d.ts`, so `build` has to come first. Prove the order locally before encoding it:

```bash
pnpm install --frozen-lockfile
pnpm build && pnpm lint && pnpm check-types && pnpm test
```

Expected: all PASS. If `lint` fails on missing types, that confirms `build` must precede it — which this order already does.

- [ ] **Step 2: Write the workflow**

```yaml
name: Images

# Publishes the api, worker and migrate images to GHCR. Dokploy is not
# notified: deploys stay deliberate, so you press Deploy in its UI when you
# want a new build live.
on:
  push:
    branches: [main]
  workflow_dispatch:

# Two merges in quick succession must not race over the :main tag.
concurrency:
  group: images-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      # build first: check-types and the test suites resolve @repo/* through
      # each package's built .d.ts.
      - run: pnpm build
      - run: pnpm lint
      - run: pnpm check-types
      # The suites start Postgres and Valkey through Testcontainers on the
      # runner's Docker daemon. No secrets: the only credential-dependent test
      # is packages/igdb's contract test, which has its own config and its own
      # scheduled workflow.
      - run: pnpm test

  publish:
    needs: verify
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      # The three builds are sequential and share one cache scope on purpose.
      # The second and third hit cache for the pruner, deps and builder stages,
      # so the expensive work happens exactly once. A matrix would run those
      # stages three times in parallel and contend over the cache.

      - id: meta-api
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ github.repository_owner }}/barklog-api
          tags: |
            type=ref,event=branch
            type=sha,format=short
            type=raw,value=latest,enable={{is_default_branch}}
      - uses: docker/build-push-action@v6
        with:
          context: .
          target: api
          platforms: linux/amd64
          push: true
          tags: ${{ steps.meta-api.outputs.tags }}
          labels: ${{ steps.meta-api.outputs.labels }}
          cache-from: type=gha,scope=barklog
          cache-to: type=gha,scope=barklog,mode=max
          # Single-platform build: an attestation would add the unknown/unknown
          # manifest entry that clutters GHCR's package UI.
          provenance: false

      - id: meta-worker
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ github.repository_owner }}/barklog-worker
          tags: |
            type=ref,event=branch
            type=sha,format=short
            type=raw,value=latest,enable={{is_default_branch}}
      - uses: docker/build-push-action@v6
        with:
          context: .
          target: worker
          platforms: linux/amd64
          push: true
          tags: ${{ steps.meta-worker.outputs.tags }}
          labels: ${{ steps.meta-worker.outputs.labels }}
          cache-from: type=gha,scope=barklog
          cache-to: type=gha,scope=barklog,mode=max
          provenance: false

      - id: meta-migrate
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ github.repository_owner }}/barklog-migrate
          tags: |
            type=ref,event=branch
            type=sha,format=short
            type=raw,value=latest,enable={{is_default_branch}}
      - uses: docker/build-push-action@v6
        with:
          context: .
          target: migrate
          platforms: linux/amd64
          push: true
          tags: ${{ steps.meta-migrate.outputs.tags }}
          labels: ${{ steps.meta-migrate.outputs.labels }}
          cache-from: type=gha,scope=barklog
          cache-to: type=gha,scope=barklog,mode=max
          provenance: false
```

- [ ] **Step 3: Validate the workflow file**

```bash
node -e "const d=require('yaml').parse(require('fs').readFileSync('.github/workflows/images.yml','utf8'));console.log('verify:',d.jobs.verify.steps.length,'publish:',d.jobs.publish.steps.length)"
```

Expected: `verify: 8 publish: 9`

(`yaml` resolves from the repo's hoisted `node_modules` — it is a transitive
dependency, already present after `pnpm install`.)

If `actionlint` is available (`brew install actionlint`), run `actionlint .github/workflows/images.yml` and expect no output. If it is not installed, skip it rather than installing it.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/images.yml
git commit -m "$(cat <<'EOF'
ci: publish api, worker and migrate images to GHCR on push to main

A verify job (build, lint, check-types, test) gates three sequential buildx
steps that share one GHA cache scope, so the pruner/deps/builder stages are
built once rather than three times. No deploy webhook: Dokploy pulls when
told to.
EOF
)"
```

---

### Task 4: `compose.yaml`

Spec §5.

**Files:**
- Create: `compose.yaml`

**Interfaces:**
- Consumes: Task 3's published image names and tag scheme.
- Produces: services named `migrate`, `api`, `worker`, `valkey`. `api.barklog.gg` is attached to the `api` service in Dokploy's Domains tab.

- [ ] **Step 1: Write `compose.yaml`**

```yaml
# The production stack for the Dokploy-managed VPS: the API, the worker and
# Valkey, running images published by .github/workflows/images.yml.
#
# Postgres is NOT here — it lives on PlanetScale and is reached over the
# network. For local development use `pnpm deps:up`, which runs
# deps.compose.yaml (Postgres and Valkey only) and leaves the apps on the host.
#
# Rollback: set IMAGE_TAG=sha-abc1234 in Dokploy and redeploy. No file edit,
# no rebuild.
name: barklog

services:
  # Runs to completion before api or worker start, on every deploy. A failed
  # migration therefore blocks the deploy rather than starting the apps against
  # a schema they do not match.
  migrate:
    image: ghcr.io/chornonoh-vova/barklog-migrate:${IMAGE_TAG:-main}
    restart: "no"
    environment:
      DATABASE_URL: ${DATABASE_URL:?required — PlanetScale connection string, include sslmode=require}

  api:
    image: ghcr.io/chornonoh-vova/barklog-api:${IMAGE_TAG:-main}
    restart: unless-stopped
    init: true
    depends_on:
      migrate:
        condition: service_completed_successfully
      valkey:
        condition: service_healthy
    # No `ports:` anywhere in this file. Traefik reaches the API over
    # dokploy-network; add api.barklog.gg to this service in Dokploy's Domains
    # tab and it injects the routing labels and provisions the certificate.
    expose:
      - "3000"
    networks:
      - default
      - dokploy-network
    environment:
      NODE_ENV: production
      PORT: 3000
      VALKEY_URL: redis://valkey:6379
      DATABASE_URL: ${DATABASE_URL:?required — PlanetScale connection string, include sslmode=require}
      CLERK_SECRET_KEY: ${CLERK_SECRET_KEY:?required}
      CLERK_PUBLISHABLE_KEY: ${CLERK_PUBLISHABLE_KEY:?required}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:?required}
      IDENTIFY_MODEL: ${IDENTIFY_MODEL:-claude-sonnet-5}
      LOG_LEVEL: ${LOG_LEVEL:-info}
    healthcheck:
      # /healthz, not /readyz. Readiness folds in PlanetScale and Valkey
      # reachability, so a transient blip would mark the container unhealthy and
      # invite a restart loop for a condition the API is built to survive and
      # report. wget is busybox's, already in the alpine base.
      test: ["CMD-SHELL", "wget -q -O /dev/null http://127.0.0.1:3000/healthz || exit 1"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 10s

  worker:
    image: ghcr.io/chornonoh-vova/barklog-worker:${IMAGE_TAG:-main}
    restart: unless-stopped
    init: true
    depends_on:
      migrate:
        condition: service_completed_successfully
      valkey:
        condition: service_healthy
    # Default network only: nothing outside the project can reach it.
    environment:
      NODE_ENV: production
      VALKEY_URL: redis://valkey:6379
      DATABASE_URL: ${DATABASE_URL:?required — PlanetScale connection string, include sslmode=require}
      IGDB_CLIENT_ID: ${IGDB_CLIENT_ID:?required}
      IGDB_CLIENT_SECRET: ${IGDB_CLIENT_SECRET:?required}
      SYNC_CRON: "${SYNC_CRON:-0 0 * * *}"
      SYNC_TZ: ${SYNC_TZ:-UTC}
      LOG_LEVEL: ${LOG_LEVEL:-info}
    # No healthcheck: the worker runs a cron schedule and serves nothing to
    # probe. It relies on restart: unless-stopped.

  valkey:
    image: valkey/valkey:9-alpine
    restart: unless-stopped
    # Persistence off: this holds a cache and rate-limit counters, all of which
    # are reconstructible. Same reasoning as deps.compose.yaml.
    command: ["valkey-server", "--save", "", "--appendonly", "no"]
    healthcheck:
      test: ["CMD", "valkey-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 10

networks:
  # Created by Dokploy; Traefik is attached to it.
  dokploy-network:
    external: true
```

- [ ] **Step 2: Verify a missing secret fails loudly, naming the variable**

```bash
docker compose -f compose.yaml config >/dev/null
```

Expected: fails with a message containing `DATABASE_URL` and `required — PlanetScale connection string, include sslmode=require`. This is the point of the `:?` syntax — a missing secret must not reach a container and surface later as a valibot error in a restart loop.

- [ ] **Step 3: Verify the file is valid with all variables present**

```bash
DATABASE_URL=postgres://u:p@example.com:5432/db \
CLERK_SECRET_KEY=x CLERK_PUBLISHABLE_KEY=x ANTHROPIC_API_KEY=x \
IGDB_CLIENT_ID=x IGDB_CLIENT_SECRET=x \
docker compose -f compose.yaml config
```

Expected: prints the resolved configuration, with `image: ghcr.io/chornonoh-vova/barklog-api:main` and `SYNC_CRON: 0 0 * * *` (unquoted in the output, a single cron expression rather than a quoted string).

- [ ] **Step 4: Assert the security boundary mechanically**

```bash
DATABASE_URL=postgres://u:p@example.com:5432/db \
CLERK_SECRET_KEY=x CLERK_PUBLISHABLE_KEY=x ANTHROPIC_API_KEY=x \
IGDB_CLIENT_ID=x IGDB_CLIENT_SECRET=x \
docker compose -f compose.yaml config | grep -c "published:"
```

Expected: `0`. Any non-zero result means a service publishes a host port and the worker or Valkey may be reachable from the internet.

Also confirm only `api` is on the Traefik network:

```bash
DATABASE_URL=postgres://u:p@example.com:5432/db \
CLERK_SECRET_KEY=x CLERK_PUBLISHABLE_KEY=x ANTHROPIC_API_KEY=x \
IGDB_CLIENT_ID=x IGDB_CLIENT_SECRET=x \
docker compose -f compose.yaml config | grep -B30 "dokploy-network" | grep -E "^  [a-z]+:" | tail -3
```

Expected: `api:` is the only service block preceding a `dokploy-network` entry.

- [ ] **Step 5: Commit**

```bash
git add compose.yaml
git commit -m "$(cat <<'EOF'
feat: add the Dokploy compose stack

api, worker, Valkey and a one-shot migrate that both apps gate on. Postgres
is external (PlanetScale). No `ports:` in the file at all: the worker and
Valkey are reachable only inside the project network, and Traefik reaches
the API over dokploy-network with the domain attached in Dokploy's UI.

Secrets come through ${VAR:?message}, so a missing value fails at
`compose up` naming the variable instead of crash-looping a container.
EOF
)"
```

---

### Task 5: Document deployment in the README

The README documents local infrastructure in detail and says nothing about deployment. Anyone picking this up needs the manual steps, which are not inferable from the files.

**Files:**
- Modify: `README.md` (add a `## Deployment` section after `## Local infrastructure`, before `### Seeding the games mirror`)

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the section**

Insert after the Postgres 18 blockquote that closes `## Local infrastructure`, matching the README's existing prose style — full sentences, reasons given, no bullet-point shorthand.

```markdown
## Deployment

Pushing to `main` runs `.github/workflows/images.yml`, which verifies the
workspace (`build`, `lint`, `check-types`, `test`) and then publishes three
images to the GitHub Container Registry:

```
ghcr.io/chornonoh-vova/barklog-api
ghcr.io/chornonoh-vova/barklog-worker
ghcr.io/chornonoh-vova/barklog-migrate
```

Each is tagged `main`, `sha-<short>`, and `latest`. All three come from the
same root `Dockerfile` — `docker build --target api|worker|migrate .` — over a
single `turbo prune`d install, so `apps/mobile`'s Expo dependencies never enter
the build.

Nothing deploys automatically. `compose.yaml` describes the VPS stack and
Dokploy pulls when you press Deploy. That stack is the API, the worker, and
Valkey; Postgres is external and lives on PlanetScale. Only the API is
reachable from outside — the file publishes no host ports at all, and
`api.barklog.gg` is attached to the `api` service in Dokploy's Domains tab,
which injects the Traefik labels and provisions the certificate.

Migrations run as a one-shot `migrate` service that both apps wait on with
`service_completed_successfully`, so a failed migration blocks the deploy
instead of starting an app against a schema it does not match.

To roll back, set `IMAGE_TAG=sha-abc1234` in Dokploy's environment and
redeploy. There is no file to edit and nothing to rebuild.

> A bare `docker compose up` in this repository now starts the **production**
> stack, because `compose.yaml` is the file Compose picks up by default. Local
> development is `pnpm deps:up`, which passes `-f deps.compose.yaml`
> explicitly.

### Before the first deploy

Three things live outside this repository and need doing once.

Set each of the three GHCR packages to Public. The repository is public, so
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
`CLERK_PUBLISHABLE_KEY`, `ANTHROPIC_API_KEY`, `IGDB_CLIENT_ID`, and
`IGDB_CLIENT_SECRET` are required; `IMAGE_TAG`, `LOG_LEVEL`,
`IDENTIFY_MODEL`, `SYNC_CRON`, and `SYNC_TZ` are optional and default to the
values in each app's env schema.
```

- [ ] **Step 2: Check the formatting renders**

```bash
pnpm format:check
```

Expected: PASS. If prettier reports `README.md`, run `pnpm format` and re-check.

- [ ] **Step 3: Verify every claim in the new section is true of the files just written**

Read the section against `Dockerfile`, `.github/workflows/images.yml`, and `compose.yaml`. Confirm specifically: the three image names match the workflow's `images:` values; the tag list matches `metadata-action`'s `tags:`; the required-versus-optional environment split matches `compose.yaml`'s `:?` versus `:-` markers. Fix the README, not the code, if they disagree.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document the image pipeline and the Dokploy deploy"
```

---

## Post-Plan Manual Steps

These cannot be done from this repository and are not part of any task.

1. Merge to `main` and watch the first `Images` run. Confirm all three
   `sha-<short>` tags exist afterwards.
2. Set the three GHCR packages to Public.
3. Create the Dokploy Compose application pointing at `compose.yaml`, set the
   environment variables, and attach `api.barklog.gg` to the `api` service.
4. First deploy: watch the `migrate` service's logs. If `CREATE EXTENSION
   pg_trgm` is refused by PlanetScale, that is the failure to expect, and it
   blocks the deploy by design.
5. If Traefik does not route, check the `dokploy-network` name first. It is the
   one assumption in this design that has not been verified against a live
   Dokploy instance.

## Self-Review

**Spec coverage:**

| Spec section | Task |
| --- | --- |
| §3 Dockerfile, six stages, three targets | Task 2 Step 2 |
| §3.1 drizzle SQL placement, symlinks, `node` user, turbo pin, amd64 | Task 2 Step 2 (corrected in Step 10) |
| §3.2 `.dockerignore` | Task 2 Step 1 |
| §4 workflow, verify gate, sequential builds, tags, provenance | Task 3 Step 2 |
| §4 GHCR visibility | Task 5 Step 1, Post-Plan Step 2 |
| §5 compose services, no ports, dokploy-network | Task 4 Step 1, asserted in Step 4 |
| §5.1 ordering | Task 4 Step 1 |
| §5.2 configuration, `IMAGE_TAG` rollback | Task 4 Steps 1 and 3 |
| §5.3 health | Task 4 Step 1 |
| §6 `@testcontainers/postgresql` | Task 1 |
| §7 operational prerequisites | Task 5 Step 1, Post-Plan Steps 2–4 |
| §8 `compose.yaml` footgun | Task 5 Step 1 (blockquote) |
| §9 testing | Task 2 Steps 3–9, Task 4 Steps 2–4 |

No gaps.

**Placeholder scan:** No `TBD`, `TODO`, or "similar to Task N". Every code step
carries the actual file content. Every verification step carries a command and
its expected output.

**Type consistency:** Build target names `api`, `worker`, `migrate` are used
identically in the Dockerfile's `AS` clauses, the workflow's `target:` fields,
and Task 2's `--target` commands. Image names `barklog-api`, `barklog-worker`,
`barklog-migrate` match between the workflow's `images:` values, `compose.yaml`,
and the README. Entrypoint paths `apps/api/dist/index.js`,
`apps/worker/dist/index.js`, and `packages/db/dist/migrate-cli.js` match the
real `main` fields and the compiled `dist` layout. Container port `3000` is
consistent across `EXPOSE`, the compose `expose:`, `PORT`, and the healthcheck
URL.
