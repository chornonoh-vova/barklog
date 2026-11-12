---
status: accepted
---

# Share Turborepo task results through Vercel Remote Cache

CI ran every Turborepo task from scratch on each run. Inside the image builds this was worst: any source change invalidates the Dockerfile `builder` layer, so turbo rebuilt every package that `verify` had built minutes earlier in the same `images.yml` run.

Workflows that run turbo — `verify.yml`, `igdb-contract.yml` and `publish-image.yml` — now use Vercel Remote Cache. Each job runs `vercel/setup-turborepo-remote-cache-action`, which trades the job's GitHub OIDC token for a short-lived Turborepo token and revokes it when the job ends. No long-lived cache credential is stored in the repository; the only configuration is the `TURBO_TEAM` repository variable and a Turborepo CLI OIDC policy on the Vercel team. A self-hosted cache server and `actions/cache` on `.turbo/cache` were the alternatives; the first would need a stored token, and the second cannot reach turbo inside Docker builds.

Image builds receive the token and team as BuildKit secrets mounted on the `turbo run build` step alone. Build arguments were rejected because `cache-to: mode=max` exports the `builder` stage, whose metadata and history would record them. A build without the secrets, such as a local `docker build`, runs on turbo's local cache.

## Write policy

Pull requests read the remote cache but do not write it (`TURBO_CACHE=local:rw,remote:r`). Image builds replay cached `dist/` output, and an unmerged branch must not be able to supply it. Only runs on `main` and manual or scheduled runs write. Fork pull requests get no OIDC token and skip the remote cache.

## Hash parity with image builds

Pruning does not change task hashes: on the first `images.yml` run, landing and the shared packages hit what `verify` wrote. Two things broke parity and are fixed. `.dockerignore` excluded the committed `.env.example` files, which `turbo.json`'s `.env*` build input matches, so api and worker hashed differently in Docker; the templates are now in the build context. Mobile's `postinstall` built `@repo/contracts` before the remote cache was set up, so it was never uploaded; the remote cache step now runs before the install. Any future file excluded from the Docker context that matches a task's inputs will break parity the same way.

## Unresolved guarantees

- `test` remains uncached (`cache: false`). Caching it would need coverage declared as an output and acceptance that Testcontainers suites are keyed on files and environment only.
- Artifact signing (`remoteCache.signature`) is not enabled.

## Evidence

- [Verify workflow](../../.github/workflows/verify.yml), [image publish workflow](../../.github/workflows/publish-image.yml), [IGDB contract workflow](../../.github/workflows/igdb-contract.yml)
- [Root Dockerfile](../../Dockerfile), [landing Dockerfile](../../apps/landing/Dockerfile)
- [Action documentation](https://github.com/vercel/setup-turborepo-remote-cache-action), [Vercel external CI/CD remote caching](https://vercel.com/docs/monorepos/remote-caching/external-ci-cd)
