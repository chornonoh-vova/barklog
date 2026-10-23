import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@repo/igdb",
    testTimeout: 30_000,
    exclude: ["**/node_modules/**", "**/dist/**", "test/contract.test.ts"],
  },
});
