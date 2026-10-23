const expoPreset = require("jest-expo/ios/jest-preset");

// Packages that ship untranspiled ESM on top of the ones jest-expo already
// transforms. Each entry is a package the app imports that Jest's CommonJS
// runtime cannot load as published.
const ESM_PACKAGES = ["@formatjs", "@clerk"];

/** @type {import("jest").Config} */
module.exports = {
  // iOS, not the universal preset: the app ships only there, so `Platform.OS`
  // and `.ios.tsx` resolution match the device.
  preset: "jest-expo/ios",
  // Call history resets per test; implementations a test set stay its own.
  clearMocks: true,
  setupFiles: ["<rootDir>/test/env.ts"],
  setupFilesAfterEnv: ["<rootDir>/test/setup.ts"],
  moduleNameMapper: {
    // Mirrors the `@/*` paths in tsconfig.json so tests and source agree.
    "^@/assets/(.*)$": "<rootDir>/assets/$1",
    "^@test/(.*)$": "<rootDir>/test/$1",
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  transformIgnorePatterns: [
    expoPreset.transformIgnorePatterns[0].replace("(?!(", `(?!(${ESM_PACKAGES.join("|")}|`),
    ...expoPreset.transformIgnorePatterns.slice(1),
  ],
  roots: ["<rootDir>/src", "<rootDir>/test"],
  testPathIgnorePatterns: [
    "/node_modules/",
    "<rootDir>/ios/",
    "<rootDir>/dist/",
    "<rootDir>/.expo/",
  ],
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/**/*.test.{ts,tsx}",
    // The `'widget'` directive compiles the view to a string for the widget
    // extension's runtime, so Jest never runs it. Its data is covered through
    // snapshot.ts and links.ts; the drawing is a device check.
    "!src/features/widgets/backlog-widget.tsx",
  ],
  coverageReporters: ["text-summary", "json-summary", "lcov"],
};
