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
