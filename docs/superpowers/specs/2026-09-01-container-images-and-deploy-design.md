# Container images and deployment

Current implementation reference, checked against repository configuration on 2026-10-29. Replaces the original proposed build sequence; external deployment settings still need verification in the target environment.

## Images and publication

The [root Dockerfile](../../../Dockerfile) builds `api`, `worker` and `migrate` targets. A pruned workspace excludes mobile dependencies from installs. Separate full and production-only installs keep development dependencies out of the runtime tree; copying the whole production tree preserves per-workspace package links. Migration SQL must remain beside the built database package. Node runtime targets run as `node`.

[Landing's Dockerfile](../../../apps/landing/Dockerfile) has a separate pruned build and an nginx runtime running as `nginx` on port 8080. Its runtime contains static files, not Node dependencies. [.dockerignore](../../../.dockerignore) excludes secrets and generated output while retaining workspace manifests needed by pruning.

[images.yml](../../../.github/workflows/images.yml) invokes [verification](../../../.github/workflows/verify.yml), including build, formatting, lint, type checks and tests. It then publishes migrate first, API and worker in parallel after migrate, and landing independently. API and worker reuse migrate's build cache without writing it; landing has its own cache scope. Builds target `linux/amd64` with provenance disabled. Publication runs are not cancelled merely because another push arrives, reducing partial tag updates.

Publication is still not atomic. An interrupted or failed job can leave mutable tags at different revisions. Confirm all four SHA-tagged images exist before choosing a release. There is no deploy webhook in this workflow; publishing does not deploy.

## Runtime topology

[compose.yaml](../../../compose.yaml) runs migrate, API, worker, landing and Valkey, with an external Postgres connection. API and worker wait for migrate to exit successfully and for Valkey to become healthy. Migrations are not run inside request-serving startup, avoiding replica races and making schema preparation an explicit deployment prerequisite. Landing has no dependency on migrations or Valkey.

API and landing join the external `dokploy-network`; worker and Valkey use the project network. No host ports are published. Domain routing, certificates, registry access and the external network are deployment configuration, not facts that can be verified from these files alone.

Images use `IMAGE_TAG` and `pull_policy: always`. A rollback selects older binaries but does not undo schema changes. Migration-first publication assumes changes remain compatible with older code; it is not an automatic safety guarantee for arbitrary migrations.

The API healthcheck uses `/healthz`, leaving dependency failures to the API's own responses rather than intentionally gating routing on `/readyz`. Worker has no HTTP healthcheck. Valkey disables persistence because it holds reconstructible caches and counters. Shutdown grace periods are set separately for API and worker in compose.

## Configuration and local development

Required secrets and defaults are defined in compose and each app's environment schema, not copied into this document. Database credentials need the intended TLS settings and permission for the migration runner's `pg_trgm` extension. See the [root setup and deployment instructions](../../../README.md).

`deps.compose.yaml` is the local infrastructure stack. Bare `docker compose up` selects production compose and can run migrations against whichever database its environment names. Use the root `deps:up` and `deps:down` scripts locally.

## Known configuration drift

Both Dockerfiles currently invoke pruning with Turbo `2.10.11`, while root `package.json` declares `^2.11.10`. The old claim that those versions match has been removed. Aligning or deliberately separating them requires a tooling change and validation against the relevant installed Turbo documentation; this documentation audit does not change the build.

## Verification surface

The workflow verifies workspace code, but that alone does not prove deployment configuration. Validate image builds, migration replay against a disposable database, health responses, and shutdown behavior when changing these files. Device setup, live domain routing and provider dashboards are separate checks. [ADR-0001](../../adr/0001-local-game-mirror.md) records the sync cleanup gap, which image publication does not resolve.
