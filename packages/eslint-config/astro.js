import astro from "eslint-plugin-astro";

import { config as base } from "./base.js";

/**
 * Pinned to eslint-plugin-astro ^1.7.0: every release from 2.0.0 peers on
 * eslint >= 10, and this workspace is on 9. Moving to eslint 10 unlocks ^3.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const config = [...base, ...astro.configs.recommended];
