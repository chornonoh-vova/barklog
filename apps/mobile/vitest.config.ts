import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Pure unit tests in plain Node: no React Native transform, no jsdom.
    // @expo/ui components are native views that render to nothing meaningful
    // off-device, so anything under test must stay free of react-native and
    // @expo/ui imports.
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    // Mirrors the `@/*` path in tsconfig.json so tests and source agree.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
