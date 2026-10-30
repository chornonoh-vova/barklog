# Container images and deployment — retired implementation plan

Historical record, retired during the documentation audit on 2026-10-29. The original task checklist, copied implementation and expected test output are not current instructions and have been removed. Git history retains the original plan; this note preserves its relevant rationale and points to maintained references. Retirement does not certify device or deployment verification.

## Rationale retained

Migration preparation is separate from request-serving startup. Production installs preserve workspace links and exclude development dependencies. Old serial-publication and cancellation instructions do not describe the current workflow; image publication is still not atomic.

## Current references

- [Current implementation reference](../specs/2026-09-01-container-images-and-deploy-design.md)
- [Architecture decision index](../../adr/README.md)
- [Implementation](../../../Dockerfile)
- [Tests or verification](../../../.github/workflows/images.yml)

Use the current workspace manifests and [agent guide](../../../AGENTS.md) for commands and conventions. Start any new change from the current code and ADRs rather than replaying this plan.
