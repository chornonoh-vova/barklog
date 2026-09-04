import astro from "eslint-plugin-astro";

import { config as base } from "./base.js";

/**
 * eslint-plugin-astro ^3: peers on eslint >= 10, and parses with Astro's Rust
 * compiler (astro-eslint-parser v3) rather than the JS one.
 *
 * v3 dropped astro/valid-compile and astro/no-omitted-end-tags from
 * recommended; both are deprecated upstream. We do not re-enable them —
 * `astro check` in this workspace's check-types task already reports compile
 * errors, which is what valid-compile covered.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const config = [...base, ...astro.configs.recommended];
