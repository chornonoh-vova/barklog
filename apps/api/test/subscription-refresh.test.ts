import { getSubscription, type SubscriptionRow } from "@repo/db";
import { afterAll, beforeEach, expect, test, vi } from "vitest";

import { callApi, createTestApp, TEST_USER } from "./helpers.js";

const fetchSubscriber = vi.fn<(appUserId: string) => Promise<SubscriptionRow | null>>();

const harness = createTestApp({ revenueCat: { fetchSubscriber } });

const post: RequestInit = {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "{}",
};

const row = (overrides: Partial<SubscriptionRow> = {}): SubscriptionRow => ({
  userId: TEST_USER,
  productId: "gg.barklog.app.premium.yearly",
  store: "app_store",
  periodType: "trial",
  purchasedAt: new Date("2026-09-01T00:00:00Z"),
  expiresAt: new Date("2027-09-01T00:00:00Z"),
  willRenew: true,
  sandbox: false,
  lastEventAtMs: 9_000,
  ...overrides,
});

beforeEach(async () => {
  await harness.reset();
  fetchSubscriber.mockReset();
});

afterAll(async () => {
  await harness.close();
});

test("a refresh pulls the subscriber and reports premium immediately", async () => {
  fetchSubscriber.mockResolvedValue(row());

  const response = await callApi(harness.app, "/api/subscription/refresh", post);

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ premium: true });
  expect(fetchSubscriber).toHaveBeenCalledWith(TEST_USER);
  expect(await getSubscription(harness.db, TEST_USER)).toMatchObject({ lastEventAtMs: 9_000 });
});

test("a subscriber with nothing active reports premium false without writing", async () => {
  fetchSubscriber.mockResolvedValue(null);

  const response = await callApi(harness.app, "/api/subscription/refresh", post);

  expect(await response.json()).toEqual({ premium: false, entitlement: null });
  expect(await getSubscription(harness.db, TEST_USER)).toBeNull();
});

test("a refresh cannot be aimed at another user", async () => {
  fetchSubscriber.mockResolvedValue(row({ userId: "user_2testBBB" }));

  await callApi(harness.app, "/api/subscription/refresh", post);

  expect(await getSubscription(harness.db, TEST_USER)).toMatchObject({ userId: TEST_USER });
  expect(await getSubscription(harness.db, "user_2testBBB")).toBeNull();
});

test("a RevenueCat outage is 502, not a 500", async () => {
  fetchSubscriber.mockRejectedValue(new Error("connect ETIMEDOUT"));

  const response = await callApi(harness.app, "/api/subscription/refresh", post);

  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({
    type: "https://barklog.gg/problems/bad-gateway",
  });
});

test("the route needs a session", async () => {
  const response = await callApi(harness.app, "/api/subscription/refresh", { ...post, user: null });
  expect(response.status).toBe(401);
});
