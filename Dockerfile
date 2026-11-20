# syntax=docker/dockerfile:1

# Three runtime images: `api`, `worker`, and the one-shot `migrate`. Each is
# built from a workspace pruned to its own workspace package, named by the APP
# build argument, so an image carries only the dependencies it runs.
# Design: docs/superpowers/specs/2026-09-01-container-images-and-deploy-design.md
#
# Build one target at a time, with its matching APP:
#   docker build --target api     --build-arg APP=api      -t barklog-api .
#   docker build --target worker  --build-arg APP=worker   -t barklog-worker .
#   docker build --target migrate --build-arg APP=@repo/db -t barklog-migrate .
# A mismatched pair fails: the api and worker targets copy a dist that only
# their own APP builds.

# Pinned by digest; Dependabot bumps tag and digest together (dependabot.yml).
# The runtime images start from this stage, so they carry Node but not pnpm.
FROM node:24.22.3-alpine3.24@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS node
WORKDIR /app

# The build stages add pnpm and turbo's settings on top of `node`.
FROM node AS base
ENV TURBO_TELEMETRY_DISABLED=1 \
    DO_NOT_TRACK=1
# Node 25 stopped bundling Corepack, so pnpm comes straight from npm. Pinned
# here as well as in "packageManager" in the root package.json. Keep the two
# in step.
RUN npm install --global pnpm@12.3.4

# ---------------------------------------------------------------------------
# pruner — cut the workspace down to APP and what it depends on.
#
# apps/mobile brings 25 Expo and React Native dependencies that no image needs.
# Pruning halves the lockfile (13905 -> 6660 lines) and stops a change to the
# mobile app from invalidating the dependency layers below.
#
# The turbo version is pinned here as well as in the root package.json. Keep
# the two in step.
# ---------------------------------------------------------------------------
FROM base AS pruner
ARG APP
COPY . .
RUN test -n "$APP" || { echo "Pass --build-arg APP=api, worker or @repo/db." >&2; exit 1; } \
    && pnpm dlx turbo@2.11.10 prune "$APP" --docker

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
ARG APP
COPY --from=pruner /app/out/full/ .
# Turborepo remote cache credentials, mounted for this step only and never
# written to a layer. A build without them (a local `docker build`) runs on
# turbo's local cache alone. See ADR-0008.
RUN --mount=type=secret,id=turbo_token,env=TURBO_TOKEN \
    --mount=type=secret,id=turbo_team,env=TURBO_TEAM \
    pnpm exec turbo run build --filter="$APP" --ui=stream

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
#
# It starts from `node`, not `base`: pnpm (about 40 MB) builds the tree but
# nothing at runtime uses it.
# ---------------------------------------------------------------------------
FROM node AS runtime-base
ENV NODE_ENV=production
COPY --from=prod-deps /app/ .
# Every workspace package the build produced, by glob rather than by name, so
# a package APP starts importing ships without editing this list.
# The `./` marks where the kept path starts: /app/packages/db/dist lands at
# ./packages/db/dist.
COPY --from=builder --parents /app/./packages/*/dist ./
# runMigrations resolves ../drizzle relative to its own compiled location, so
# the SQL has to sit beside packages/db/dist. Every target inherits it; only
# `migrate` reads it.
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
