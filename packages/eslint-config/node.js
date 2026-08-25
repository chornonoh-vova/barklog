import globals from "globals";

import { config as baseConfig } from "./base.js";

/**
 * ESLint configuration for Node.js services (e.g. the Hono API).
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const nodeConfig = [
  ...baseConfig,
  {
    languageOptions: {
      globals: { ...globals.node },
      ecmaVersion: "latest",
      sourceType: "module",
    },
  },
];
