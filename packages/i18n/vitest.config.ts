import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@repo/i18n",
    // Reuse workers across files: tests reset their own state, and per-file
    // startup roughly doubled the container-backed suites.
    isolate: false,
    include: ["test/**/*.test.ts"],
  },
});
