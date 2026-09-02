import { sValidator } from "@hono/standard-validator";
import { getLogger } from "@logtape/logtape";
import { revenueCatEventSchema } from "@repo/contracts";
import { recordSubscriptionEvent, upsertSubscription, userExists } from "@repo/db";
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
 * retried, so duplicates, stale events and unknown users all answer 200.
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
        log.info("RevenueCat event {type} carries no subscription state", { type: event.type });
        return c.body(null, 200);
      }

      // The log kept the event; the row must not be written for an unknown user.
      if (!(await userExists(deps.db, event.app_user_id))) {
        log.warn("RevenueCat event for unknown user {userId}", { userId: event.app_user_id });
        return c.body(null, 200);
      }

      // Unconditional: the upsert's WHERE clause drops stale events.
      await upsertSubscription(deps.db, row);

      return c.body(null, 200);
    },
  );
}
