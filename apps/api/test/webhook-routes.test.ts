import { createHmac } from "node:crypto";

import { deleteUser, ensureUser, getSubscription, recordUserDeletion, schema } from "@repo/db";
import { afterAll, beforeEach, expect, test } from "vitest";

import type { Db } from "../src/types.js";

import {
  callApi,
  createTestApp,
  TEST_USER,
  WEBHOOK_SECRET,
  WEBHOOK_SIGNING_SECRET,
} from "./helpers.js";

const harness = createTestApp();

/** RevenueCat's scheme: HMAC-SHA256 over `${t}.${rawBody}`, hex. */
function sign(rawBody: string, secret = WEBHOOK_SIGNING_SECRET): string {
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");

  return `t=${t},v1=${v1}`;
}

const event = (overrides: Record<string, unknown> = {}) => ({
  event: {
    id: "rc_event_1",
    type: "INITIAL_PURCHASE",
    app_user_id: TEST_USER,
    event_timestamp_ms: 2_000,
    product_id: "gg.barklog.app.premium.yearly",
    store: "APP_STORE",
    period_type: "TRIAL",
    purchased_at_ms: Date.parse("2026-09-01T00:00:00Z"),
    expiration_at_ms: Date.parse("2026-09-08T00:00:00Z"),
    environment: "PRODUCTION",
    ...overrides,
  },
});

const post = (
  body: unknown,
  options: { secret?: string | null; signature?: string | null } = {},
): RequestInit & { user?: string | null } => {
  const { secret = WEBHOOK_SECRET, signature } = options;
  // Signed over the exact bytes sent, which is what the route verifies.
  const rawBody = JSON.stringify(body);

  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret === null ? {} : { Authorization: secret }),
      ...(signature === null
        ? {}
        : { "X-RevenueCat-Webhook-Signature": signature ?? sign(rawBody) }),
    },
    body: rawBody,
    // Not a session route, so no X-Test-User.
    user: null,
  };
};

/** Every `insert(subscriptions)` throws; every other call is delegated. */
function failUpsert<T extends Pick<Db, "insert">>(handle: T): T {
  return new Proxy(handle, {
    get(target, prop, receiver) {
      if (prop !== "insert") return Reflect.get(target, prop, receiver);

      return (table: Parameters<Db["insert"]>[0]) => {
        if (table === schema.subscriptions) {
          throw new Error("the subscriptions upsert failed");
        }

        return target.insert(table);
      };
    },
  });
}

/**
 * The real db, except that the subscriptions upsert throws — inside a
 * transaction or outside one, so the test measures the handler rather than the
 * shape it happens to have. Everything else, the transaction itself included,
 * is delegated: the rollback under test is Postgres's, not a stub's.
 */
function withFailingUpsert(db: Db): Db {
  return new Proxy(failUpsert(db), {
    get(target, prop, receiver) {
      if (prop !== "transaction") return Reflect.get(target, prop, receiver);

      return (run: Parameters<Db["transaction"]>[0]) => db.transaction((tx) => run(failUpsert(tx)));
    },
  });
}

beforeEach(async () => {
  await harness.reset();
  await ensureUser(harness.db, TEST_USER);
});

afterAll(async () => {
  await harness.close();
});

test("a valid event is applied and the user becomes premium", async () => {
  const response = await callApi(harness.app, "/webhooks/revenuecat", post(event()));

  expect(response.status).toBe(200);
  expect(await getSubscription(harness.db, TEST_USER)).toMatchObject({
    productId: "gg.barklog.app.premium.yearly",
    store: "app_store",
    periodType: "trial",
    willRenew: true,
    sandbox: false,
    lastEventAtMs: 2_000,
  });
});

test("the webhook needs no session token, which is the whole point of PUBLIC_PATHS", async () => {
  const response = await callApi(harness.app, "/webhooks/revenuecat", post(event()));
  expect(response.status).not.toBe(401);
});

test("a missing secret is 401", async () => {
  const response = await callApi(
    harness.app,
    "/webhooks/revenuecat",
    post(event(), { secret: null }),
  );
  expect(response.status).toBe(401);
});

test("a wrong secret is 401 and applies nothing", async () => {
  const response = await callApi(
    harness.app,
    "/webhooks/revenuecat",
    post(event(), { secret: "nope" }),
  );

  expect(response.status).toBe(401);
  expect(await getSubscription(harness.db, TEST_USER)).toBeNull();
});

test("a missing signature is 401, even with the right Authorization secret", async () => {
  const response = await callApi(
    harness.app,
    "/webhooks/revenuecat",
    post(event(), { signature: null }),
  );

  expect(response.status).toBe(401);
  expect(await getSubscription(harness.db, TEST_USER)).toBeNull();
});

test("a signature from the wrong secret is 401", async () => {
  const body = event();
  const response = await callApi(harness.app, "/webhooks/revenuecat", {
    ...post(body),
    headers: {
      "Content-Type": "application/json",
      Authorization: WEBHOOK_SECRET,
      "X-RevenueCat-Webhook-Signature": sign(JSON.stringify(body), "wrong-signing-secret"),
    },
  });

  expect(response.status).toBe(401);
});

test("a tampered body is 401 — the signature covers the bytes, not just the headers", async () => {
  const original = event();
  const signature = sign(JSON.stringify(original));

  // Same signature, different body: what an attacker replaying a captured
  // delivery with an extended expiry would send.
  const tampered = event({ expiration_at_ms: Date.parse("2099-01-01T00:00:00Z") });

  const response = await callApi(harness.app, "/webhooks/revenuecat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: WEBHOOK_SECRET,
      "X-RevenueCat-Webhook-Signature": signature,
    },
    body: JSON.stringify(tampered),
    user: null,
  });

  expect(response.status).toBe(401);
  expect(await getSubscription(harness.db, TEST_USER)).toBeNull();
});

test("a malformed signature header is 401, not a crash", async () => {
  for (const signature of ["", "garbage", "t=123", "v1=abc", "t=,v1="]) {
    const response = await callApi(
      harness.app,
      "/webhooks/revenuecat",
      post(event(), { signature }),
    );

    expect(response.status, signature).toBe(401);
  }
});

test("a redelivered event is 200 and applied once, so RevenueCat stops retrying", async () => {
  await callApi(harness.app, "/webhooks/revenuecat", post(event()));
  const again = await callApi(harness.app, "/webhooks/revenuecat", post(event()));

  expect(again.status).toBe(200);

  const rows = await harness.db.execute("select count(*)::int as total from subscription_events");
  expect((rows.rows[0] as { total: number }).total).toBe(1);
});

test("a stale event is 200 and does not resurrect a cancelled subscription", async () => {
  await callApi(
    harness.app,
    "/webhooks/revenuecat",
    post(
      event({
        id: "rc_cancel",
        type: "CANCELLATION",
        event_timestamp_ms: 3_000,
        cancel_reason: "UNSUBSCRIBE",
      }),
    ),
  );

  const stale = await callApi(
    harness.app,
    "/webhooks/revenuecat",
    post(event({ id: "rc_late", event_timestamp_ms: 1_000 })),
  );

  expect(stale.status).toBe(200);
  expect(await getSubscription(harness.db, TEST_USER)).toMatchObject({
    willRenew: false,
    lastEventAtMs: 3_000,
  });
});

test("a cancel_reason means auto-renew is off but the entitlement stands until expiry", async () => {
  await callApi(
    harness.app,
    "/webhooks/revenuecat",
    post(event({ type: "CANCELLATION", cancel_reason: "UNSUBSCRIBE" })),
  );

  expect(await getSubscription(harness.db, TEST_USER)).toMatchObject({ willRenew: false });
});

test("a sandbox event is stored as sandbox and still grants premium", async () => {
  await callApi(harness.app, "/webhooks/revenuecat", post(event({ environment: "SANDBOX" })));

  expect(await getSubscription(harness.db, TEST_USER)).toMatchObject({ sandbox: true });

  const me = await callApi(harness.app, "/api/me");
  expect(await me.json()).toMatchObject({ premium: true });
});

test("a null expiration is stored as a lifetime entitlement", async () => {
  await callApi(harness.app, "/webhooks/revenuecat", post(event({ expiration_at_ms: null })));

  expect(await getSubscription(harness.db, TEST_USER)).toMatchObject({ expiresAt: null });
});

// A free user can buy Premium having only ever sent GETs, so
// `ensureUserMiddleware` has never created their row. Dropping the upsert here
// would consume the event id and lose the purchase for good.
test("an event for a user with no row yet creates the row and applies the purchase", async () => {
  const response = await callApi(
    harness.app,
    "/webhooks/revenuecat",
    post(event({ app_user_id: "user_never_seen" })),
  );

  expect(response.status).toBe(200);
  const rows = await harness.db.execute(
    "select count(*)::int as total from subscription_events where user_id = 'user_never_seen'",
  );
  expect((rows.rows[0] as { total: number }).total).toBe(1);

  const users = await harness.db.execute(
    "select count(*)::int as total from users where id = 'user_never_seen'",
  );
  expect((users.rows[0] as { total: number }).total).toBe(1);

  expect(await getSubscription(harness.db, "user_never_seen")).toMatchObject({
    productId: "gg.barklog.app.premium.yearly",
    store: "app_store",
    periodType: "trial",
  });
});

test("an unparseable payload is 422, not a crash", async () => {
  const response = await callApi(harness.app, "/webhooks/revenuecat", post({ event: {} }));
  expect(response.status).toBe(422);
});

test("an event type carrying no product is logged without touching the row", async () => {
  await callApi(harness.app, "/webhooks/revenuecat", post(event()));

  const transfer = await callApi(
    harness.app,
    "/webhooks/revenuecat",
    post({
      event: {
        id: "rc_transfer",
        type: "TRANSFER",
        app_user_id: TEST_USER,
        event_timestamp_ms: 5_000,
      },
    }),
  );

  expect(transfer.status).toBe(200);
  // A TRANSFER carries no product, so the purchase row survives.
  expect(await getSubscription(harness.db, TEST_USER)).toMatchObject({
    productId: "gg.barklog.app.premium.yearly",
    lastEventAtMs: 2_000,
  });
});

test("a body over the api limit is accepted, because webhooks get their own limit", async () => {
  const padded = event();
  (padded.event as Record<string, unknown>).padding = "x".repeat(64 * 1024);

  const response = await callApi(harness.app, "/webhooks/revenuecat", post(padded));
  expect(response.status).toBe(200);
});

test("the api body limit still applies to api routes", async () => {
  const response = await callApi(harness.app, "/api/backlog/1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "waiting", padding: "x".repeat(32 * 1024) }),
  });

  expect(response.status).toBe(413);
});

// The record-and-apply must be one transaction. Committing the event id before
// the effect it guards is F1's failure mode on the error path: the handler
// 500s, RevenueCat retries, `isNew` is false, the duplicate branch answers 200,
// and the purchase is lost for good.
test("a failed apply leaves no event row, so the redelivery is processed and not swallowed", async () => {
  const broken = createTestApp({ db: withFailingUpsert(harness.db) });

  const failed = await callApi(broken.app, "/webhooks/revenuecat", post(event()));

  expect(failed.status).toBe(500);
  expect(await getSubscription(harness.db, TEST_USER)).toBeNull();

  const rows = await harness.db.execute(
    "select count(*)::int as total from subscription_events where id = 'rc_event_1'",
  );
  expect((rows.rows[0] as { total: number }).total).toBe(0);

  // RevenueCat's retry, against a healthy api: the same event id must still be
  // unprocessed, so the purchase lands.
  const retry = await callApi(harness.app, "/webhooks/revenuecat", post(event()));

  expect(retry.status).toBe(200);
  expect(await getSubscription(harness.db, TEST_USER)).toMatchObject({
    productId: "gg.barklog.app.premium.yearly",
    lastEventAtMs: 2_000,
  });

  await broken.close();
});

// Deleting a Barklog account cannot cancel the App Store subscription behind
// it, so RevenueCat keeps delivering for the id long after the account is
// gone. Applied as an ordinary event, `ensureUser` would recreate the `users`
// row and the deletion would silently undo itself.
test("an event for a deleted account is recorded without resurrecting it", async () => {
  // What the Clerk webhook leaves behind: no user row, an id on the tombstone.
  await deleteUser(harness.db, TEST_USER);
  await recordUserDeletion(harness.db, TEST_USER);

  const response = await callApi(
    harness.app,
    "/webhooks/revenuecat",
    post(event({ id: "rc_event_after_deletion", type: "RENEWAL" })),
  );

  // 200, or RevenueCat retries a delivery we have already dealt with.
  expect(response.status).toBe(200);
  expect(await harness.db.select().from(schema.users)).toHaveLength(0);
  expect(await harness.db.select().from(schema.subscriptions)).toHaveLength(0);

  const rows = await harness.db.select().from(schema.subscriptionEvents);

  expect(rows).toHaveLength(1);
  expect(rows[0]!.userId).toBeNull();
  expect(rows[0]!.payload).not.toHaveProperty("app_user_id");
  expect(rows[0]!.payload).toHaveProperty("product_id", "gg.barklog.app.premium.yearly");
});
