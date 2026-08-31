import { expect, test } from "vitest";

import { parseEnv } from "../src/env.js";

const VALID = {
  DATABASE_URL: "postgres://barklog:barklog@localhost:5432/barklog",
  VALKEY_URL: "redis://localhost:6379",
  IGDB_CLIENT_ID: "cid",
  IGDB_CLIENT_SECRET: "secret",
};

test("applies defaults for the schedule", () => {
  const env = parseEnv(VALID);

  expect(env.SYNC_CRON).toBe("0 0 * * *");
  expect(env.SYNC_TZ).toBe("UTC");
});

test("a missing secret fails at boot rather than on first use", () => {
  expect(() => parseEnv({ ...VALID, IGDB_CLIENT_SECRET: undefined })).toThrow(/IGDB_CLIENT_SECRET/);
});

test("an empty string counts as missing", () => {
  expect(() => parseEnv({ ...VALID, IGDB_CLIENT_ID: "" })).toThrow(/IGDB_CLIENT_ID/);
});

test("overrides are respected", () => {
  const env = parseEnv({ ...VALID, SYNC_CRON: "30 3 * * *", SYNC_TZ: "Europe/Kyiv" });

  expect(env.SYNC_CRON).toBe("30 3 * * *");
  expect(env.SYNC_TZ).toBe("Europe/Kyiv");
});

test("LOG_LEVEL defaults to info and rejects a non-LogTape level", () => {
  expect(parseEnv(VALID).LOG_LEVEL).toBe("info");
  expect(parseEnv({ ...VALID, LOG_LEVEL: "debug" }).LOG_LEVEL).toBe("debug");
  expect(() => parseEnv({ ...VALID, LOG_LEVEL: "warn" })).toThrow(/LOG_LEVEL/);
});
