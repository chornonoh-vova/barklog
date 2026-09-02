import { getSubscription, upsertSubscription } from "@repo/db";
import { getLogger } from "@logtape/logtape";
import { Hono } from "hono";

import { isPremium } from "../entitlement.js";
import { problems } from "../problems.js";
import { toEntitlement } from "../serialize.js";
import type { AppDeps, AppEnv } from "../types.js";

export function subscriptionRoutes(deps: AppDeps) {
  const log = getLogger(["api", "revenuecat"]);

  return new Hono<AppEnv>().post("/refresh", async (c) => {
    const userId = c.get("userId");

    let fetched;
    try {
      fetched = await deps.revenueCat.fetchSubscriber(userId);
    } catch (error) {
      log.warn("RevenueCat refresh failed for {userId}: {message}", {
        userId,
        message: error instanceof Error ? error.message : String(error),
      });

      throw problems.create("BAD_GATEWAY");
    }

    if (fetched !== null) {
      // The session's user id wins over the third party's.
      await upsertSubscription(deps.db, { ...fetched, userId });
    }

    const row = await getSubscription(deps.db, userId);

    c.header("Cache-Control", "private, no-store");

    return c.json({
      premium: isPremium(row, new Date()),
      entitlement: row === null ? null : toEntitlement(row),
    });
  });
}
