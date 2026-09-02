import { afterEach, describe, expect, test, vi } from "vitest";

import { createRevenueCatClient, PREMIUM_ENTITLEMENT } from "../src/revenuecat.js";

const API_KEY = "sk_test_123";
const APP_USER_ID = "user_2testAAA";

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createRevenueCatClient", () => {
  test("hits the v1 subscribers URL for the encoded app user id, with a bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ subscriber: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await createRevenueCatClient(API_KEY).fetchSubscriber("user with spaces");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.revenuecat.com/v1/subscribers/user%20with%20spaces",
      { headers: { Authorization: `Bearer ${API_KEY}`, Accept: "application/json" } },
    );
  });

  test("no barklog_premium entitlement returns null without fabricating a row", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          subscriber: { entitlements: {}, subscriptions: {} },
        }),
      ),
    );

    const result = await createRevenueCatClient(API_KEY).fetchSubscriber(APP_USER_ID);

    expect(result).toBeNull();
  });

  test("entitlement with a matching subscription maps every field from the payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          subscriber: {
            entitlements: {
              [PREMIUM_ENTITLEMENT]: {
                product_identifier: "gg.barklog.app.premium.yearly",
                purchase_date: "2026-01-01T00:00:00Z",
                expires_date: "2027-01-01T00:00:00Z",
              },
            },
            subscriptions: {
              "gg.barklog.app.premium.yearly": {
                store: "app_store",
                period_type: "trial",
                purchase_date: "2026-01-02T00:00:00Z",
                expires_date: "2027-01-01T00:00:00Z",
                unsubscribe_detected_at: null,
                is_sandbox: true,
              },
            },
          },
        }),
      ),
    );

    const result = await createRevenueCatClient(API_KEY).fetchSubscriber(APP_USER_ID);

    expect(result).toMatchObject({
      userId: APP_USER_ID,
      productId: "gg.barklog.app.premium.yearly",
      store: "app_store",
      periodType: "trial",
      willRenew: true,
      sandbox: true,
    });
    expect(result?.purchasedAt).toEqual(new Date("2026-01-01T00:00:00Z"));
    expect(result?.expiresAt).toEqual(new Date("2027-01-01T00:00:00Z"));
  });

  test("a cancelled subscription (unsubscribe_detected_at set) reports willRenew false", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          subscriber: {
            entitlements: {
              [PREMIUM_ENTITLEMENT]: {
                product_identifier: "gg.barklog.app.premium.yearly",
                purchase_date: "2026-01-01T00:00:00Z",
                expires_date: "2027-01-01T00:00:00Z",
              },
            },
            subscriptions: {
              "gg.barklog.app.premium.yearly": {
                store: "app_store",
                period_type: "normal",
                purchase_date: "2026-01-01T00:00:00Z",
                expires_date: "2027-01-01T00:00:00Z",
                unsubscribe_detected_at: "2026-06-01T00:00:00Z",
              },
            },
          },
        }),
      ),
    );

    const result = await createRevenueCatClient(API_KEY).fetchSubscriber(APP_USER_ID);

    expect(result).toMatchObject({ willRenew: false });
  });

  test("entitlement with no matching subscription still returns the entitlement-driven fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          subscriber: {
            entitlements: {
              [PREMIUM_ENTITLEMENT]: {
                product_identifier: "gg.barklog.app.premium.promo",
                purchase_date: "2026-03-01T00:00:00Z",
                expires_date: "2027-03-01T00:00:00Z",
              },
            },
            subscriptions: {},
          },
        }),
      ),
    );

    const result = await createRevenueCatClient(API_KEY).fetchSubscriber(APP_USER_ID);

    expect(result).toMatchObject({
      productId: "gg.barklog.app.premium.promo",
      store: "app_store",
      periodType: "normal",
      willRenew: false,
      sandbox: false,
    });
    expect(result?.purchasedAt).toEqual(new Date("2026-03-01T00:00:00Z"));
    expect(result?.expiresAt).toEqual(new Date("2027-03-01T00:00:00Z"));
  });

  test("a null expires_date is a lifetime entitlement, not an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          subscriber: {
            entitlements: {
              [PREMIUM_ENTITLEMENT]: {
                product_identifier: "gg.barklog.app.premium.lifetime",
                purchase_date: "2026-01-01T00:00:00Z",
                expires_date: null,
              },
            },
            subscriptions: {
              "gg.barklog.app.premium.lifetime": {
                store: "app_store",
                period_type: "normal",
                purchase_date: "2026-01-01T00:00:00Z",
                expires_date: null,
              },
            },
          },
        }),
      ),
    );

    const result = await createRevenueCatClient(API_KEY).fetchSubscriber(APP_USER_ID);

    expect(result?.expiresAt).toBeNull();
  });

  test("a non-2xx response throws, so the route's 502 path is reachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, { status: 500 })));

    await expect(createRevenueCatClient(API_KEY).fetchSubscriber(APP_USER_ID)).rejects.toThrow(
      "RevenueCat answered 500",
    );
  });
});
