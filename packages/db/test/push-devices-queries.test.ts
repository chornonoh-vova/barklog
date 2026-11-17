import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, expect, inject, test } from "vitest";

import { createDb } from "../src/client.js";
import { ensureUser } from "../src/queries/backlog.js";
import { registerPushDevice, unregisterPushDevice } from "../src/queries/push-devices.js";
import { getReleaseAlertMinutes, setReleaseAlertMinutes } from "../src/queries/users.js";
import * as schema from "../src/schema/index.js";
import { truncateAll } from "../src/testing.js";

const { db, close } = createDb(inject("databaseUrl"));

const USER_A = "user_2pushAAA";
const USER_B = "user_2pushBBB";
const TOKEN = "ExponentPushToken[device-1]";

async function devices() {
  return db.select().from(schema.pushDevices);
}

async function timeZoneOf(userId: string): Promise<string | null> {
  const rows = await db
    .select({ timeZone: schema.users.timeZone })
    .from(schema.users)
    .where(eq(schema.users.id, userId));

  return rows[0]?.timeZone ?? null;
}

beforeEach(async () => {
  await truncateAll(db);
  await ensureUser(db, USER_A);
  await ensureUser(db, USER_B);
});

afterAll(async () => {
  await close();
});

test("registers a device and records the user's time zone", async () => {
  await registerPushDevice(db, {
    token: TOKEN,
    userId: USER_A,
    locale: "de",
    timeZone: "Europe/Berlin",
  });

  const rows = await devices();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ token: TOKEN, userId: USER_A, locale: "de" });
  expect(await timeZoneOf(USER_A)).toBe("Europe/Berlin");
});

test("re-registering updates locale and time zone in place", async () => {
  await registerPushDevice(db, {
    token: TOKEN,
    userId: USER_A,
    locale: "de",
    timeZone: "Europe/Berlin",
  });
  const [first] = await devices();

  await registerPushDevice(db, {
    token: TOKEN,
    userId: USER_A,
    locale: "uk",
    timeZone: "Europe/Kyiv",
  });

  const rows = await devices();
  expect(rows).toHaveLength(1);
  expect(rows[0].locale).toBe("uk");
  expect(rows[0].createdAt).toEqual(first.createdAt);
  expect(rows[0].updatedAt.getTime()).toBeGreaterThan(first.updatedAt.getTime());
  expect(await timeZoneOf(USER_A)).toBe("Europe/Kyiv");
});

test("registering a token another user holds reassigns it", async () => {
  await registerPushDevice(db, { token: TOKEN, userId: USER_A, locale: "en", timeZone: "UTC" });
  await registerPushDevice(db, {
    token: TOKEN,
    userId: USER_B,
    locale: "es",
    timeZone: "Europe/Madrid",
  });

  const rows = await devices();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ userId: USER_B, locale: "es" });
  expect(await timeZoneOf(USER_B)).toBe("Europe/Madrid");
});

test("unregister removes only the caller's token", async () => {
  await registerPushDevice(db, { token: TOKEN, userId: USER_A, locale: "en", timeZone: "UTC" });

  await expect(unregisterPushDevice(db, USER_B, TOKEN)).resolves.toBe(false);
  expect(await devices()).toHaveLength(1);

  await expect(unregisterPushDevice(db, USER_A, TOKEN)).resolves.toBe(true);
  expect(await devices()).toHaveLength(0);
});

test("a new user's alert time defaults to 09:00", async () => {
  await expect(getReleaseAlertMinutes(db, USER_A)).resolves.toBe(540);
  await expect(getReleaseAlertMinutes(db, "user_2nobody")).resolves.toBeNull();
});

test("setReleaseAlertMinutes stores the value", async () => {
  await expect(setReleaseAlertMinutes(db, USER_A, 1410)).resolves.toBe(1410);
  await expect(getReleaseAlertMinutes(db, USER_A)).resolves.toBe(1410);
  await expect(getReleaseAlertMinutes(db, USER_B)).resolves.toBe(540);
});

test("the database rejects an alert time off the 30-minute grid", async () => {
  for (const minutes of [45, 1440, -30]) {
    await expect(
      db.execute(sql`UPDATE users SET release_alert_minutes = ${minutes} WHERE id = ${USER_A}`),
    ).rejects.toThrow();
  }
});
