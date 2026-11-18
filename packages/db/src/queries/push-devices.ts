import { and, eq, sql } from "drizzle-orm";

import type { Queryable } from "../client.js";
import { users } from "../schema/backlog.js";
import { pushDevices } from "../schema/push-devices.js";

export interface PushDeviceRegistration {
  token: string;
  userId: string;
  locale: string;
  timeZone: string;
}

/**
 * Upserts by token, so registering a token another account holds moves it to
 * this one: an account switch without a signed-out interval must not leave the
 * previous account's alerts arriving. Two statements; pass a transaction.
 */
export async function registerPushDevice(
  db: Queryable,
  device: PushDeviceRegistration,
): Promise<void> {
  await db
    .insert(pushDevices)
    .values({ token: device.token, userId: device.userId, locale: device.locale })
    .onConflictDoUpdate({
      target: pushDevices.token,
      set: { userId: device.userId, locale: device.locale, updatedAt: sql`now()` },
    });

  await db.update(users).set({ timeZone: device.timeZone }).where(eq(users.id, device.userId));
}

/**
 * Only the caller's own token: a late sign-out from one account must not
 * unregister a phone another account has since registered.
 */
export async function unregisterPushDevice(
  db: Queryable,
  userId: string,
  token: string,
): Promise<boolean> {
  const deleted = await db
    .delete(pushDevices)
    .where(and(eq(pushDevices.token, token), eq(pushDevices.userId, userId)))
    .returning({ token: pushDevices.token });

  return deleted.length > 0;
}
