# Barklog agent guide

Shared instructions for agents working in this repository. Keep repository guidance in `AGENTS.md`; `CLAUDE.md` files import the corresponding shared file rather than duplicating rules. Read any nested `AGENTS.md` for the area you are changing; its more specific guidance applies there.

## Start here

- Read [CONTEXT.md](CONTEXT.md) for domain vocabulary and invariants.
- Before proposing architectural changes, read the [ADR index](docs/adr/README.md) and the records relevant to the change, including their unresolved guarantees.
- Use [README.md](README.md) for setup and operational guidance; use current workspace manifests and tool configuration for executable commands and installed versions.
- Use the [documentation index](docs/README.md) to find maintained implementation references under `docs/superpowers/specs/`. Files under `docs/superpowers/plans/` are retired records with rationale and links, not execution instructions; Git history retains their original contents.

## Document authority and upkeep

`CONTEXT.md` defines domain language. ADRs record agreed decisions and their reasons. Code and tests show current behavior, which may differ from the intended decision. When these disagree, flag the mismatch explicitly rather than silently treating either as correct or rewriting the decision to match an accidental implementation.

When an agreed change introduces or sharpens a domain term, update `CONTEXT.md` with a short definition. When it changes a durable architectural decision, add or supersede an ADR and update the index. Link supporting sources, distinguish established decisions from proposals, and keep unresolved guarantees explicit. Keep implementation details out of the glossary and mark obsolete plans as historical instead of erasing their rationale.

## Repository map

| Area                                                   | Responsibility                                                        |
| ------------------------------------------------------ | --------------------------------------------------------------------- |
| `apps/mobile`                                          | iOS app; read [its agent guide](apps/mobile/AGENTS.md) before editing |
| `apps/api`                                             | HTTP requests, authentication, backlog write policy and entitlement   |
| `apps/worker`                                          | IGDB mirror ingestion and sync-run orchestration                      |
| `apps/landing`                                         | Marketing and legal site                                              |
| `packages/contracts`                                   | Shared validation, domain constants and wire shapes                   |
| `packages/db`                                          | Postgres schema, migrations and queries                               |
| `packages/igdb`                                        | IGDB retrieval and mapping                                            |
| `packages/cache`, `packages/logging`                   | Shared cache and logging implementations                              |
| `packages/eslint-config`, `packages/typescript-config` | Shared tooling configuration                                          |

## Validation

Use the affected workspace's current `package.json` scripts for tests, lint and type checks; inspect dependent callers when changing a shared package. Mobile currently uses Jest; backend workspaces use Vitest, with database/cache integration tests using Testcontainers and requiring Docker. Retired plan records are not test-runner guidance.

For documentation-only changes, check local links and `git diff --check`; use the repository's Prettier when installed. Report checks that could not run and why. For local infrastructure, follow the README's `pnpm deps:up` workflow: the default `compose.yaml` describes the production stack.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
