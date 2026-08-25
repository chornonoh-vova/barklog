import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 30_000,
    // The contract test hits live IGDB and needs credentials, so it is excluded
    // from the default run and scheduled nightly instead.
    exclude: ["**/node_modules/**", "**/dist/**", "test/contract.test.ts"],
  },
});
