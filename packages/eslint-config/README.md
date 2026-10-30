# `@repo/eslint-config`

Shared flat ESLint configurations. Installed dependency versions are in [package.json](package.json) and the workspace catalog.

| Export                      | Use for                                   |
| --------------------------- | ----------------------------------------- |
| `@repo/eslint-config/base`  | Shared TypeScript rules                   |
| `@repo/eslint-config/expo`  | Expo / React Native (`apps/mobile`)       |
| `@repo/eslint-config/node`  | Node workspaces, including API and worker |
| `@repo/eslint-config/astro` | Astro (`apps/landing`)                    |

```js
import { nodeConfig } from "@repo/eslint-config/node";

export default nodeConfig;
```

Each workspace's lint configuration can add local rules. Read those configurations before assuming the shared export is the complete rule set.
