import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./test/setup/containers.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    pool: "forks",
    // One Postgres and one Valkey are shared by the whole suite, so files must
    // not truncate or flush under each other.
    fileParallelism: false,
  },
});
