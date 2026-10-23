import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@repo/db",
    globalSetup: ["./test/setup/containers.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    pool: "forks",
    // One shared Postgres container: concurrent files would truncate each other.
    fileParallelism: false,
  },
});
