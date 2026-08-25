# `@repo/eslint-config`

Shared flat ESLint configurations.

| Export                     | Use for                                 |
| -------------------------- | --------------------------------------- |
| `@repo/eslint-config/base` | Any TypeScript workspace (shared rules) |
| `@repo/eslint-config/expo` | `apps/mobile` — Expo / React Native     |
| `@repo/eslint-config/node` | `apps/api` — Node.js / Hono             |

```js
// eslint.config.js
import { nodeConfig } from "@repo/eslint-config/node";

export default nodeConfig;
```
