import { sValidator } from "@hono/standard-validator";
import { getLogger } from "@logtape/logtape";
import { revenueCatEventSchema } from "@repo/contracts";
import { ensureUser, recordSubscriptionEvent, upsertSubscription } from "@repo/db";
import { Hono } from "hono";
import type { Context } from "hono";

import { problems, renderProblem } from "../problems.js";
import { secretMatches, signatureMatches, toSubscriptionRow } from "../revenuecat.js";
import type { AppDeps, AppEnv } from "../types.js";

function renderUnprocessable(c: Context) {
  return renderProblem(
    c,
    problems.create("UNPROCESSABLE_WEBHOOK", {
      detail: "The webhook payload did not match RevenueCat's event shape.",
    }),
  );
}

/**
 * Status codes are a contract with RevenueCat's retries: anything but 2xx is
 * retried, so duplicates and stale events answer 200 too.
 */
export function webhookRoutes(deps: AppDeps) {
  const log = getLogger(["api", "revenuecat"]);

  return new Hono<AppEnv>().post(
    "/revenuecat",
    async (c, next) => {
      if (!secretMatches(c.req.header("Authorization"), deps.webhookSecret)) {
        throw problems.create("UNAUTHORIZED", {
          detail: "A valid webhook secret is required.",
        });
      }

      // `text()` before the validator's `json()`: Hono caches the body and
      // derives the parsed value from the cached text, so nothing is consumed
      // twice — and the HMAC must see the bytes as received.
      const rawBody = await c.req.text();

      if (
        !signatureMatches(
          c.req.header("X-RevenueCat-Webhook-Signature"),
          rawBody,
          deps.webhookSigningSecret,
        )
      ) {
        throw problems.create("UNAUTHORIZED", {
          detail: "A valid webhook signature is required.",
        });
      }

      return next();
    },
    sValidator("json", revenueCatEventSchema, (result, c) => {
      if (!result.success) {
        return renderUnprocessable(c);
      }
    }),
    async (c) => {
      const { event } = c.req.valid("json");

      const isNew = await recordSubscriptionEvent(deps.db, {
        id: event.id,
        userId: event.app_user_id,
        type: event.type,
        payload: event,
      });

      if (!isNew) {
        log.info("Duplicate RevenueCat event {id} ignored", { id: event.id });
        return c.body(null, 200);
      }

      const row = toSubscriptionRow(event);

      if (row === null) {
        // The id, because a partial purchase payload lands here too: without it
        // a dropped purchase has nothing to trace it by.
        log.info("RevenueCat event {id} of type {type} carries no subscription state", {
          id: event.id,
          type: event.type,
        });
        return c.body(null, 200);
      }

      // A free user can buy Premium having sent nothing but GETs, so
      // `ensureUserMiddleware` — which runs only for MUTATING_METHODS — may never
      // have created their row. Answering 200 without it would consume the event
      // id and discard the purchase, and the retry would hit the duplicate
      // branch: permanently lost. `app_user_id` comes from our own
      // `Purchases.logIn(clerkUserId)` behind both webhook secrets, so creating
      // the row here is exactly what the middleware does on a first write.
      await ensureUser(deps.db, event.app_user_id);

      // Unconditional: the upsert's WHERE clause drops stale events.
      await upsertSubscription(deps.db, row);

      return c.body(null, 200);
    },
  );
}
