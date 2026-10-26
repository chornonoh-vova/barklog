# syntax=docker/dockerfile:1

# The static marketing site at barklog.gg, served by nginx.
# Design: docs/superpowers/specs/2026-09-03-landing-site-design.md
#
# Separate from the root Dockerfile on purpose: that file builds three Node
# runtime images from one shared install, and this chain shares only `base`.
#
#   docker build -f apps/landing/Dockerfile -t barklog-landing .

# Pinned by digest; Dependabot bumps tag and digest together (dependabot.yml).
FROM node:26.12.0-alpine3.24@sha256:6f08a523443ddedf52941874c203475b0ad503e859ad70cb26ab8be9a517dbd5 AS base
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
# is no prod-deps stage. The stock image runs its master as root; every other
# image in this repo runs unprivileged, so nginx.conf is replaced with one that
# runs as the `nginx` user (see the header of that file).
# ---------------------------------------------------------------------------
FROM nginx:1.31.8-alpine@sha256:1ef7ca94d7879df82421428ce13bd1eaa412404953859cf7a5b6512c25e67a60 AS landing
USER nginx
# From the build context, not from `builder`: this is checked-in configuration
# rather than build output, and copying it last keeps an edit to it from
# invalidating the install and build layers above.
COPY apps/landing/nginx/nginx.conf /etc/nginx/nginx.conf
COPY apps/landing/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY apps/landing/nginx/snippets/ /etc/nginx/snippets/
COPY --from=builder /app/apps/landing/dist/ /usr/share/nginx/html/
EXPOSE 8080
