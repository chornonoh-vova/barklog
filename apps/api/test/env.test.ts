import { expect, test } from "vitest";

import { parseEnv } from "../src/env.js";

function validEnv(): Record<string, string> {
  return {
    DATABASE_URL: "postgres://barklog:barklog@localhost:5432/barklog",
    VALKEY_URL: "redis://localhost:6379",
    CLERK_SECRET_KEY: "sk_test_x",
    CLERK_PUBLISHABLE_KEY: "pk_test_x",
    CLERK_WEBHOOK_SIGNING_SECRET: "whsec_test_x",
    OPENAI_API_KEY: "sk-openai-test-x",
    REVENUECAT_WEBHOOK_SECRET: "rc-webhook-x",
    REVENUECAT_WEBHOOK_SIGNING_SECRET: "rc-signing-x",
    REVENUECAT_API_KEY: "sk-rc-test-x",
  };
}

test("defaults fill in everything that is optional", () => {
  expect(parseEnv(validEnv())).toEqual({
    ...validEnv(),
    PORT: 3000,
    NODE_ENV: "development",
    LOG_LEVEL: "info",
    IDENTIFY_MODEL: "gpt-5.4-mini",
  });
});

test("PORT arrives as a string and comes out a number", () => {
  expect(parseEnv({ ...validEnv(), PORT: "8080" }).PORT).toBe(8080);
});

test("a missing secret stops the process at boot, not at the first request", () => {
  expect(() => parseEnv({ ...validEnv(), CLERK_SECRET_KEY: undefined })).toThrow(
    /CLERK_SECRET_KEY/,
  );
});

test("the log levels are LogTape's, so `warn` is a boot failure", () => {
  expect(parseEnv({ ...validEnv(), LOG_LEVEL: "warning" }).LOG_LEVEL).toBe("warning");
  expect(() => parseEnv({ ...validEnv(), LOG_LEVEL: "warn" })).toThrow(/LOG_LEVEL/);
  expect(() => parseEnv({ ...validEnv(), LOG_LEVEL: "verbose" })).toThrow(/LOG_LEVEL/);
});

test("a missing OpenAI key stops the process at boot, since every share would degrade", () => {
  expect(() => parseEnv({ ...validEnv(), OPENAI_API_KEY: undefined })).toThrow(/OPENAI_API_KEY/);
});

test("an IDENTIFY_MODEL outside the verified picklist stops the process at boot, not with a silent fail-soft extraction", () => {
  expect(() => parseEnv({ ...validEnv(), IDENTIFY_MODEL: "gpt-4o-mini" })).toThrow(
    /IDENTIFY_MODEL/,
  );
});

test("CLERK_WEBHOOK_SIGNING_SECRET is required", () => {
  const { CLERK_WEBHOOK_SIGNING_SECRET: _omitted, ...withoutIt } = validEnv();

  expect(() => parseEnv(withoutIt)).toThrow(/CLERK_WEBHOOK_SIGNING_SECRET/);
});
