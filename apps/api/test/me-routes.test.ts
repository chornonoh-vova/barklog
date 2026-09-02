import { ensureUser, upsertSubscription } from "@repo/db";
import { afterAll, beforeEach, expect, test } from "vitest";

import { callApi, createTestApp, TEST_USER } from "./helpers.js";

const harness = createTestApp();

beforeEach(async () => {
  await harness.reset();
  // `subscriptions.user_id` references `users.id`. These tests upsert before
  // making any request, so `ensureUserMiddleware` has not created the row.
  await ensureUser(harness.db, TEST_USER);
});

afterAll(async () => {
  await harness.close();
});

test("a user who has never subscribed is not premium", async () => {
  const response = await callApi(harness.app, "/api/me");

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ premium: false, entitlement: null });
});

test("an active subscription is reported with its product and expiry", async () => {
  await upsertSubscription(harness.db, {
    userId: TEST_USER,
    productId: "gg.barklog.app.premium.yearly",
    store: "app_store",
    periodType: "trial",
    purchasedAt: new Date("2026-09-01T00:00:00Z"),
    expiresAt: new Date("2027-09-01T00:00:00Z"),
    willRenew: true,
    sandbox: false,
    lastEventAtMs: 1_000,
  });

  const response = await callApi(harness.app, "/api/me");

  expect(await response.json()).toEqual({
    premium: true,
    entitlement: {
      productId: "gg.barklog.app.premium.yearly",
      store: "app_store",
      periodType: "trial",
      expiresAt: "2027-09-01T00:00:00.000Z",
      willRenew: true,
    },
  });
});

test("a lapsed subscription reports premium false but keeps the entitlement detail", async () => {
  await upsertSubscription(harness.db, {
    userId: TEST_USER,
    productId: "gg.barklog.app.premium.monthly",
    store: "app_store",
    periodType: "normal",
    purchasedAt: new Date("2026-07-01T00:00:00Z"),
    expiresAt: new Date("2026-08-01T00:00:00Z"),
    willRenew: false,
    sandbox: false,
    lastEventAtMs: 1_000,
  });

  const body = (await (await callApi(harness.app, "/api/me")).json()) as Record<string, unknown>;

  expect(body.premium).toBe(false);
  expect(body.entitlement).toMatchObject({ willRenew: false });
});

test("one user's subscription never leaks into another's answer", async () => {
  await ensureUser(harness.db, "user_2testBBB");
  await upsertSubscription(harness.db, {
    userId: TEST_USER,
    productId: "gg.barklog.app.premium.yearly",
    store: "app_store",
    periodType: "normal",
    purchasedAt: new Date("2026-09-01T00:00:00Z"),
    expiresAt: new Date("2027-09-01T00:00:00Z"),
    willRenew: true,
    sandbox: false,
    lastEventAtMs: 1_000,
  });

  const other = await callApi(harness.app, "/api/me", { user: "user_2testBBB" });
  expect(await other.json()).toEqual({ premium: false, entitlement: null });
});

test("the route needs a session", async () => {
  const response = await callApi(harness.app, "/api/me", { user: null });
  expect(response.status).toBe(401);
});

test("entitlement is never cached by a shared cache", async () => {
  const response = await callApi(harness.app, "/api/me");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
