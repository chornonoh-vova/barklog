# Documentation map

Reconciled with the checked-in code and ADRs on 2026-10-29. This is a repository audit, not a claim that live dashboards, deployed infrastructure or native device checks have passed.

## Read in this order

1. [CONTEXT.md](../CONTEXT.md) for domain vocabulary.
2. [ADR index](adr/README.md) for decisions, rationale and known gaps.
3. The relevant implementation reference below, then its linked source and tests.
4. [Root README](../README.md) and current workspace manifests for setup and commands.

ADRs express agreed intent; code and tests show the implementation. A mismatch must remain explicit until resolved. Do not infer that an unchecked historical task is unfinished, that an old expected test output is current evidence, or that a documentation edit fixed a runtime gap.

## Current references

| Area                             | Reference                                                                          |
| -------------------------------- | ---------------------------------------------------------------------------------- |
| HTTP and mirror                  | [API and mirror](superpowers/specs/2026-08-25-barklog-api-design.md)               |
| Mobile structure and behavior    | [Mobile app](superpowers/specs/2026-08-27-barklog-mobile-design.md)                |
| First-run experience             | [Onboarding](superpowers/specs/2026-08-28-mobile-onboarding-design.md)             |
| Share identification and preview | [Any-link sharing](superpowers/specs/2026-09-08-share-any-link-design.md)          |
| Related game discovery           | [Similar games](superpowers/specs/2026-08-31-similar-games-design.md)              |
| Subscription and slot rules      | [Premium](superpowers/specs/2026-09-01-premium-subscription-design.md)             |
| Identity deletion                | [Account deletion](superpowers/specs/2026-09-03-account-deletion-design.md)        |
| Build and deployment             | [Containers](superpowers/specs/2026-09-01-container-images-and-deploy-design.md)   |
| Marketing and legal site         | [Landing site](superpowers/specs/2026-09-03-landing-site-design.md)                |
| Resizing and accessibility       | [Adaptive layout](superpowers/specs/2026-10-12-ipad-duo-adaptive-layout-design.md) |
| Persisted backlog and widgets    | [Widgets](superpowers/specs/2026-10-21-home-screen-widgets-design.md)              |

The dated filenames remain stable so links from code and ADRs continue to resolve; they do not identify the current review date. The former [video-only](superpowers/specs/2026-08-31-share-video-to-backlog-design.md) and [source-preview](superpowers/specs/2026-09-03-share-source-preview-design.md) specs redirect to the consolidated sharing reference.

## Verification

- [Mobile automated-test conventions](../apps/mobile/test/README.md)
- [Mobile device scenarios](mobile-device-verification.md)
- [Premium device scenarios](premium-device-verification.md)
- [CI verification definition](../.github/workflows/verify.yml)

Manual checklists describe scenarios to run. Record the build and environment with actual results; do not treat their presence as completed validation.

## Historical plans

All 18 existing [implementation plans](superpowers/plans) are retired records. Obsolete code copies, install commands, task checkboxes and expected test output were removed. Each record retains relevant rationale and points to maintained references and code; original implementation sequences remain recoverable in Git history. No active implementation plan is implied by this directory.

## Follow-up limits

The [ADR index](adr/README.md) collects the current unresolved guarantees and documented limitations: sync cleanup, account-switch widget work, capped backlog views, extraction freshness, build-tool version drift and share dismissal verification. Keep those visible rather than rewriting documentation to imply they are solved.
