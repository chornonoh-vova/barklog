import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./test/setup/containers.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    pool: "forks",
    // One Postgres container is shared by the whole suite, so test files must
    // not run concurrently — a truncate in one file would wipe rows another
    // file just inserted.
    fileParallelism: false,
  },
});
