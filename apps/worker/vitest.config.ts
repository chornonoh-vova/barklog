import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./test/setup/containers.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    pool: "forks",
    // One shared Postgres container: files must not truncate under each other.
    fileParallelism: false,
  },
});
