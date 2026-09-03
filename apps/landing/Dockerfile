# syntax=docker/dockerfile:1

# The static marketing site at barklog.gg, served by nginx.
# Design: docs/superpowers/specs/2026-09-03-landing-site-design.md
#
# Separate from the root Dockerfile on purpose: that file builds three Node
# runtime images from one shared install, and this chain shares only `base`.
#
#   docker build -f apps/landing/Dockerfile -t barklog-landing .

FROM node:24-alpine AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    TURBO_TELEMETRY_DISABLED=1 \
    DO_NOT_TRACK=1
RUN corepack enable pnpm
WORKDIR /app

# Pinned here as well as in the root package.json. Keep the two in step —
# the root Dockerfile carries the same duplication and the same warning.
FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2.10.11 prune landing --docker

FROM base AS deps
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY --from=pruner /app/out/full/ .
RUN pnpm exec turbo run build --filter=landing --ui=stream

# ---------------------------------------------------------------------------
# The runtime carries static files only — no node_modules reaches it, so there
# is no prod-deps stage. nginx-unprivileged rather than nginx: the stock image
# runs its master as root, and every other image in this repo runs unprivileged.
# ---------------------------------------------------------------------------
FROM nginxinc/nginx-unprivileged:alpine AS landing
# From the build context, not from `builder`: this is checked-in configuration
# rather than build output, and copying it last keeps an edit to it from
# invalidating the install and build layers above.
COPY apps/landing/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY apps/landing/nginx/snippets/ /etc/nginx/snippets/
COPY --from=builder /app/apps/landing/dist/ /usr/share/nginx/html/
EXPOSE 8080
