import { expect, test } from "vitest";

import { parseEnv } from "../src/env.js";

const VALID = {
  DATABASE_URL: "postgres://barklog:barklog@localhost:5432/barklog",
  VALKEY_URL: "redis://localhost:6379",
  CLERK_SECRET_KEY: "sk_test_x",
  CLERK_PUBLISHABLE_KEY: "pk_test_x",
};

test("defaults fill in everything that is optional", () => {
  expect(parseEnv(VALID)).toEqual({
    ...VALID,
    PORT: 3000,
    NODE_ENV: "development",
    LOG_LEVEL: "info",
  });
});

test("PORT arrives as a string and comes out a number", () => {
  expect(parseEnv({ ...VALID, PORT: "8080" }).PORT).toBe(8080);
});

test("a missing secret stops the process at boot, not at the first request", () => {
  expect(() => parseEnv({ ...VALID, CLERK_SECRET_KEY: undefined })).toThrow(/CLERK_SECRET_KEY/);
});

test("the log levels are LogTape's, so `warn` is a boot failure", () => {
  expect(parseEnv({ ...VALID, LOG_LEVEL: "warning" }).LOG_LEVEL).toBe("warning");
  expect(() => parseEnv({ ...VALID, LOG_LEVEL: "warn" })).toThrow(/LOG_LEVEL/);
  expect(() => parseEnv({ ...VALID, LOG_LEVEL: "verbose" })).toThrow(/LOG_LEVEL/);
});
