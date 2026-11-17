import { recordUserDeletion, schema } from "@repo/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, test } from "vitest";

import { callApi, createTestApp, OTHER_USER, TEST_USER } from "./helpers.js";

const harness = createTestApp();

const TOKEN = "ExponentPushToken[route-device_1]";

function register(body: Record<string, unknown>, user: string = TEST_USER) {
  return callApi(harness.app, "/api/me/push-devices", {
    method: "PUT",
    user,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function unregister(token: string, user: string = TEST_USER) {
  return callApi(harness.app, `/api/me/push-devices/${encodeURIComponent(token)}`, {
    method: "DELETE",
    user,
  });
}

function patchSettings(body: Record<string, unknown>) {
  return callApi(harness.app, "/api/me/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function devices() {
  return harness.db.select().from(schema.pushDevices);
}

async function userRow(userId: string) {
  const rows = await harness.db.select().from(schema.users).where(eq(schema.users.id, userId));
  return rows[0];
}

beforeEach(async () => {
  await harness.reset();
});

afterAll(async () => {
  await harness.close();
});

test("register stores the device and the time zone", async () => {
  const response = await register({ token: TOKEN, locale: "de", timeZone: "Europe/Berlin" });

  expect(response.status).toBe(204);
  expect(await devices()).toEqual([
    expect.objectContaining({ token: TOKEN, userId: TEST_USER, locale: "de" }),
  ]);
  expect((await userRow(TEST_USER))?.timeZone).toBe("Europe/Berlin");
});

test("re-register updates language and time zone", async () => {
  await register({ token: TOKEN, locale: "de", timeZone: "Europe/Berlin" });
  await register({ token: TOKEN, locale: "es", timeZone: "America/New_York" });

  const rows = await devices();
  expect(rows).toHaveLength(1);
  expect(rows[0]?.locale).toBe("es");
  expect((await userRow(TEST_USER))?.timeZone).toBe("America/New_York");
});

test("registration reassigns a token held by another account", async () => {
  await register({ token: TOKEN, locale: "en", timeZone: "UTC" }, OTHER_USER);
  await register({ token: TOKEN, locale: "uk", timeZone: "Europe/Kyiv" });

  expect(await devices()).toEqual([expect.objectContaining({ token: TOKEN, userId: TEST_USER })]);
});

test("delete removes the caller's device, and repeating it is fine", async () => {
  await register({ token: TOKEN, locale: "en", timeZone: "UTC" });

  expect((await unregister(TOKEN)).status).toBe(204);
  expect(await devices()).toHaveLength(0);
  expect((await unregister(TOKEN)).status).toBe(204);
});

test("delete leaves another account's device alone", async () => {
  await register({ token: TOKEN, locale: "en", timeZone: "UTC" }, OTHER_USER);

  expect((await unregister(TOKEN)).status).toBe(204);
  expect(await devices()).toEqual([expect.objectContaining({ userId: OTHER_USER })]);
});

test("invalid registration is rejected and changes nothing", async () => {
  await register({ token: "ExponentPushToken[first]", locale: "en", timeZone: "Europe/London" });

  expect((await register({ token: TOKEN, locale: "fr", timeZone: "Europe/Paris" })).status).toBe(
    422,
  );
  expect((await register({ token: TOKEN, locale: "en", timeZone: "Mars/Olympus" })).status).toBe(
    422,
  );

  expect(await devices()).toHaveLength(1);
  expect((await userRow(TEST_USER))?.timeZone).toBe("Europe/London");
});

test("a deleted account cannot register, unregister or change settings", async () => {
  await recordUserDeletion(harness.db, TEST_USER);

  expect((await register({ token: TOKEN, locale: "en", timeZone: "UTC" })).status).toBe(401);
  expect((await unregister(TOKEN)).status).toBe(401);
  expect((await patchSettings({ releaseAlertMinutes: 600 })).status).toBe(401);

  expect(await harness.db.select().from(schema.users)).toHaveLength(0);
  expect(await devices()).toHaveLength(0);
});

test("settings store the alert time and /me reports it", async () => {
  const response = await patchSettings({ releaseAlertMinutes: 1290 });

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ releaseAlertMinutes: 1290 });

  const me = (await (await callApi(harness.app, "/api/me")).json()) as Record<string, unknown>;
  expect(me.releaseAlertMinutes).toBe(1290);
});

test("settings reject an alert time off the grid and keep the stored one", async () => {
  await patchSettings({ releaseAlertMinutes: 600 });

  for (const releaseAlertMinutes of [1440, 45, -30]) {
    expect((await patchSettings({ releaseAlertMinutes })).status).toBe(422);
  }

  expect((await userRow(TEST_USER))?.releaseAlertMinutes).toBe(600);
});
