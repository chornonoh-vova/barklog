import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "api",
    globalSetup: ["./test/setup/containers.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    pool: "forks",
    // Shared containers: concurrent files would truncate and flush under each other.
    fileParallelism: false,
  },
});
