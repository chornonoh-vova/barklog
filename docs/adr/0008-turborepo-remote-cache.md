---
status: accepted
---

# Share Turborepo task results through Vercel Remote Cache

CI ran every Turborepo task from scratch on each run. Inside the image builds this was worst: any source change invalidates the Dockerfile `builder` layer, so turbo rebuilt every package that `verify` had built minutes earlier in the same `images.yml` run.

Workflows that run turbo — `verify.yml`, `igdb-contract.yml` and `publish-image.yml` — now use Vercel Remote Cache. Each job runs `vercel/setup-turborepo-remote-cache-action`, which trades the job's GitHub OIDC token for a short-lived Turborepo token and revokes it when the job ends. No long-lived cache credential is stored in the repository; the only configuration is the `TURBO_TEAM` repository variable and a Turborepo CLI OIDC policy on the Vercel team. A self-hosted cache server and `actions/cache` on `.turbo/cache` were the alternatives; the first would need a stored token, and the second cannot reach turbo inside Docker builds.

Image builds receive the token and team as BuildKit secrets mounted on the `turbo run build` step alone. Build arguments were rejected because `cache-to: mode=max` exports the `builder` stage, whose metadata and history would record them. A build without the secrets, such as a local `docker build`, runs on turbo's local cache.

## Write policy

Pull requests read the remote cache but do not write it (`TURBO_CACHE=local:rw,remote:r`). Image builds replay cached `dist/` output, and an unmerged branch must not be able to supply it. Only runs on `main` and manual or scheduled runs write. Fork pull requests get no OIDC token and skip the remote cache.

## Unresolved guarantees

- Docker builds run turbo on a pruned workspace. Whether their task hashes match the unpruned CI workspace, and therefore whether image builds actually hit what `verify` wrote, is unverified until the first `images.yml` run's build log shows cache hits.
- `test` remains uncached (`cache: false`). Caching it would need coverage declared as an output and acceptance that Testcontainers suites are keyed on files and environment only.
- Artifact signing (`remoteCache.signature`) is not enabled.

## Evidence

- [Verify workflow](../../.github/workflows/verify.yml), [image publish workflow](../../.github/workflows/publish-image.yml), [IGDB contract workflow](../../.github/workflows/igdb-contract.yml)
- [Root Dockerfile](../../Dockerfile), [landing Dockerfile](../../apps/landing/Dockerfile)
- [Action documentation](https://github.com/vercel/setup-turborepo-remote-cache-action), [Vercel external CI/CD remote caching](https://vercel.com/docs/monorepos/remote-caching/external-ci-cd)
