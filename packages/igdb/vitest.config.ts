import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@repo/igdb",
    // Reuse workers across files: tests reset their own state, and per-file
    // startup roughly doubled the container-backed suites.
    isolate: false,
    testTimeout: 30_000,
    exclude: ["**/node_modules/**", "**/dist/**", "test/contract.test.ts"],
  },
});
