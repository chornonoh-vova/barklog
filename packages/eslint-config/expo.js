import expoConfig from "eslint-config-expo/flat.js";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";

import { config as baseConfig } from "./base.js";

/**
 * ESLint configuration for the Expo / React Native app.
 *
 * `eslint-config-expo` brings the React, React Hooks, React Native and import
 * rules that match the installed Expo SDK, so it is layered on top of the
 * shared base and Prettier is re-applied last to win over its stylistic rules.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const expoAppConfig = [
  ...baseConfig,
  ...expoConfig,
  { ignores: ["ios/**", "android/**", "expo-env.d.ts"] },
  {
    // Metro/Babel config files must stay CommonJS.
    files: ["*.config.js", "**/*.cjs"],
    languageOptions: { globals: { ...globals.node }, sourceType: "commonjs" },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  eslintConfigPrettier,
];
