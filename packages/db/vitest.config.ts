import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@repo/db",
    // Reuse workers across files: tests reset their own state, and per-file
    // startup roughly doubled the container-backed suites.
    isolate: false,
    globalSetup: ["./test/setup/containers.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    pool: "forks",
    // One shared Postgres container: concurrent files would truncate each other.
    fileParallelism: false,
  },
});
