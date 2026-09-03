import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, inject, test } from "vitest";

import { createDb } from "../src/client.js";
import { ensureUser } from "../src/queries/backlog.js";
import {
  SCRUBBED_EVENT_KEYS,
  scrubEventPayload,
  scrubSubscriptionEvents,
} from "../src/queries/users.js";
import * as schema from "../src/schema/index.js";
import { truncateAll } from "../src/testing.js";

/**
 * The keep-list is written twice: once as SQL, for an event already stored when
 * the account is deleted, and once as TypeScript, for an event that arrives
 * after it. Neither can be expressed in the other's language, so this is what
 * keeps them from drifting — the same job `status-parity.test.ts` does for the
 * enums.
 */
const { db, close } = createDb(inject("databaseUrl"));

const USER = "user_2parityAAA";

async function sqlScrub(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  await db.insert(schema.subscriptionEvents).values({
    id: "rc_event_parity",
    userId: USER,
    type: "INITIAL_PURCHASE",
    payload,
  });

  await scrubSubscriptionEvents(db, USER);

  const rows = await db
    .select()
    .from(schema.subscriptionEvents)
    .where(eq(schema.subscriptionEvents.id, "rc_event_parity"));

  return rows[0].payload as Record<string, unknown>;
}

beforeEach(async () => {
  await truncateAll(db);
  await ensureUser(db, USER);
});

afterAll(async () => {
  await close();
});

test("both scrubs keep exactly the named keys", async () => {
  const payload = {
    id: "rc_event_parity",
    type: "INITIAL_PURCHASE",
    app_user_id: USER,
    original_app_user_id: USER,
    transaction_id: "2000000123456789",
    product_id: "gg.barklog.app.premium.yearly",
    store: "APP_STORE",
    period_type: "TRIAL",
    purchased_at_ms: 1_000,
    expiration_at_ms: 5_000,
    environment: "PRODUCTION",
  };

  const fromSql = Object.keys(await sqlScrub(payload)).sort();
  const fromTs = Object.keys(scrubEventPayload(payload)).sort();

  expect(fromSql).toEqual(fromTs);
  expect(fromSql).toEqual([...SCRUBBED_EVENT_KEYS].sort());
});

test("both scrubs drop a kept key that is absent, rather than keeping a null", async () => {
  // A lifetime purchase: `expiration_at_ms` is the field the null-stripping
  // exists for, and the two halves must strip it the same way.
  const payload = {
    app_user_id: USER,
    product_id: "gg.barklog.app.premium.lifetime",
    store: "APP_STORE",
    period_type: "NORMAL",
    purchased_at_ms: 1_000,
    expiration_at_ms: null,
    environment: "PRODUCTION",
  };

  const fromSql = await sqlScrub(payload);
  const fromTs = scrubEventPayload(payload);

  expect(Object.keys(fromSql).sort()).toEqual(Object.keys(fromTs).sort());
  expect(fromSql).not.toHaveProperty("expiration_at_ms");
  expect(fromTs).not.toHaveProperty("expiration_at_ms");
});
