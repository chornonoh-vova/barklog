import expoConfig from "eslint-config-expo/flat.js";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";

import { config as baseConfig } from "./base.js";

/** @type {import("eslint").Linter.Config[]} */
export const expoAppConfig = [
  ...baseConfig,
  ...expoConfig,
  { ignores: ["ios/**", "android/**", "expo-env.d.ts"] },
  {
    files: ["*.config.js", "**/*.cjs"],
    languageOptions: { globals: { ...globals.node }, sourceType: "commonjs" },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  eslintConfigPrettier,
];
