# syntax=docker/dockerfile:1

# The static marketing site at barklog.gg, served by nginx.
# Design: docs/superpowers/specs/2026-09-03-landing-site-design.md
#
# Separate from the root Dockerfile on purpose: that file builds three Node
# runtime images from one shared install, and this chain shares only `base`.
#
#   docker build -f apps/landing/Dockerfile -t barklog-landing .

# Pinned by digest; Dependabot bumps tag and digest together (dependabot.yml).
FROM node:24.22.2-alpine3.24@sha256:a34ab6d7f6f4813f4d0c5469d74685604b962fbdbf5793a7bc7b4998ecb867c8 AS base
ENV TURBO_TELEMETRY_DISABLED=1 \
    DO_NOT_TRACK=1
# Node 25 stopped bundling Corepack, so pnpm comes straight from npm. Pinned
# here as well as in "packageManager" in the root package.json. Keep the two
# in step.
RUN npm install --global pnpm@12.3.4
WORKDIR /app

# Pinned here as well as in the root package.json. Keep the two in step —
# the root Dockerfile carries the same duplication and the same warning.
FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2.11.10 prune landing --docker

FROM base AS deps
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY --from=pruner /app/out/full/ .
# Turborepo remote cache credentials, mounted for this step only and never
# written to a layer. A build without them (a local `docker build`) runs on
# turbo's local cache alone. See ADR-0008.
RUN --mount=type=secret,id=turbo_token,env=TURBO_TOKEN \
    --mount=type=secret,id=turbo_team,env=TURBO_TEAM \
    pnpm exec turbo run build --filter=landing --ui=stream

# ---------------------------------------------------------------------------
# The runtime carries static files only — no node_modules reaches it, so there
# is no prod-deps stage. The stock image runs its master as root; every other
# image in this repo runs unprivileged, so nginx.conf is replaced with one that
# runs as the `nginx` user (see the header of that file).
# ---------------------------------------------------------------------------
FROM nginx:1.31.8-alpine@sha256:713fc2ebfd92e8217db451477182ee91944b123d2b1ee9fd5a8c6e91ca6c3a11 AS landing
USER nginx
# From the build context, not from `builder`: this is checked-in configuration
# rather than build output, and copying it last keeps an edit to it from
# invalidating the install and build layers above.
COPY apps/landing/nginx/nginx.conf /etc/nginx/nginx.conf
COPY apps/landing/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY apps/landing/nginx/snippets/ /etc/nginx/snippets/
COPY --from=builder /app/apps/landing/dist/ /usr/share/nginx/html/
EXPOSE 8080
