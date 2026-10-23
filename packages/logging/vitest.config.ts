import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@repo/logging",
    include: ["test/**/*.test.ts"],
  },
});
