import * as v from "valibot";
import { expect, test } from "vitest";

import { meSettingsSchema, pushDeviceRegisterSchema, pushTokenPathSchema } from "../src/index.js";

const device = { token: "ExponentPushToken[abc-123_X]", locale: "uk", timeZone: "Europe/Kyiv" };

test("the alert time accepts the grid's ends and the default", () => {
  for (const releaseAlertMinutes of [0, 540, 1410]) {
    expect(v.safeParse(meSettingsSchema, { releaseAlertMinutes }).success).toBe(true);
  }
});

test("the alert time rejects values off the grid or out of range", () => {
  for (const releaseAlertMinutes of [-30, 1440, 45, 540.5, "540"]) {
    expect(v.safeParse(meSettingsSchema, { releaseAlertMinutes }).success).toBe(false);
  }
});

test("settings require the alert time and nothing else", () => {
  expect(v.safeParse(meSettingsSchema, {}).success).toBe(false);
  expect(v.safeParse(meSettingsSchema, { releaseAlertMinutes: 540, extra: 1 }).success).toBe(false);
});

test("a registration accepts any non-empty token, an app language and a time zone", () => {
  expect(v.safeParse(pushDeviceRegisterSchema, device).success).toBe(true);
  // Expo owns the token format; a new one must not break registration.
  expect(
    v.safeParse(pushDeviceRegisterSchema, { ...device, token: "SomeFutureToken" }).success,
  ).toBe(true);
});

test("a registration rejects an unknown language, an unknown zone, an empty token and extra keys", () => {
  for (const body of [
    { ...device, locale: "fr" },
    { ...device, timeZone: "Mars/Olympus" },
    { ...device, token: "" },
    { ...device, extra: true },
  ]) {
    expect(v.safeParse(pushDeviceRegisterSchema, body).success).toBe(false);
  }
});

test("a registration rejects a UTC offset in place of a zone name", () => {
  // Intl reads "+05:00" as UTC+5 but Postgres reads it as UTC-5 (POSIX sign),
  // so an offset would put alerts ten hours apart depending on who reads it.
  for (const timeZone of ["+05:00", "-03:30", "+0530", "+05"]) {
    expect(v.safeParse(pushDeviceRegisterSchema, { ...device, timeZone }).success).toBe(false);
  }
});

test("a registration accepts IANA names, including the fixed-offset Etc zones", () => {
  for (const timeZone of ["UTC", "America/New_York", "Etc/GMT+5", "Asia/Kolkata"]) {
    expect(v.safeParse(pushDeviceRegisterSchema, { ...device, timeZone }).success).toBe(true);
  }
});

test("the token path parameter must not be empty", () => {
  expect(v.safeParse(pushTokenPathSchema, { token: device.token }).success).toBe(true);
  expect(v.safeParse(pushTokenPathSchema, { token: "" }).success).toBe(false);
});
