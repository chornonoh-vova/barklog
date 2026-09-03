import { sValidator } from "@hono/standard-validator";
import { getLogger } from "@logtape/logtape";
import { revenueCatEventSchema } from "@repo/contracts";
import {
  deleteUser,
  ensureUser,
  isUserDeleted,
  recordSubscriptionEvent,
  recordUserDeletion,
  scrubEventPayload,
  scrubSubscriptionEvents,
  upsertSubscription,
} from "@repo/db";
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
  const clerkLog = getLogger(["api", "clerk"]);

  return new Hono<AppEnv>()
    .post(
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

        // One transaction, because the recorded event id is the idempotency guard
        // for everything below it. Committing the id before the effect it guards
        // means a throw in `ensureUser` or `upsertSubscription` answers 500,
        // RevenueCat retries, the retry finds the id already stored and answers
        // 200 as a duplicate — and the subscription is never written. Rolling the
        // event log back with the effect leaves the retry a genuinely unprocessed
        // event.
        const outcome = await deps.db.transaction(async (tx) => {
          // Deleting a Barklog account cannot cancel an App Store
          // subscription, so RevenueCat keeps delivering renewals and
          // expirations for an id whose account is gone. Taken through the
          // path below, `ensureUser` would recreate the `users` row and the
          // stored payload would carry the `app_user_id` the deletion was
          // about — the deletion would quietly undo itself. Checked before the
          // event is recorded, so it is written already scrubbed rather than
          // written and then repaired.
          if (await isUserDeleted(tx, event.app_user_id)) {
            await recordSubscriptionEvent(tx, {
              id: event.id,
              userId: null,
              type: event.type,
              payload: scrubEventPayload(event),
            });

            return "deleted-user" as const;
          }

          const isNew = await recordSubscriptionEvent(tx, {
            id: event.id,
            userId: event.app_user_id,
            type: event.type,
            payload: event,
          });

          // `ON CONFLICT DO NOTHING` wrote nothing, so this commits nothing —
          // and it must stay a 200, or RevenueCat retries a delivery we have
          // already applied.
          if (!isNew) return "duplicate" as const;

          const row = toSubscriptionRow(event);

          // Recorded and genuinely processed: there is no subscription state in
          // this payload to apply.
          if (row === null) return "no-state" as const;

          // A free user can buy Premium having sent nothing but GETs, so
          // `ensureUserMiddleware` — which runs only for MUTATING_METHODS — may
          // never have created their row, and the upsert's foreign key needs it.
          // `app_user_id` comes from our own `Purchases.logIn(clerkUserId)` behind
          // both webhook secrets, so creating the row here is exactly what the
          // middleware does on a first write.
          await ensureUser(tx, event.app_user_id);

          // Unconditional: the upsert's WHERE clause drops stale events.
          await upsertSubscription(tx, row);

          return "applied" as const;
        });

        if (outcome === "duplicate") {
          log.info("Duplicate RevenueCat event {id} ignored", { id: event.id });
        }

        if (outcome === "deleted-user") {
          // No `app_user_id`: the whole point of the branch is that we no
          // longer keep it, and a log line is a place it would survive.
          log.info("RevenueCat event {id} of type {type} belongs to a deleted account", {
            id: event.id,
            type: event.type,
          });
        }

        if (outcome === "no-state") {
          // The id, because a partial purchase payload lands here too: without it
          // a dropped purchase has nothing to trace it by.
          log.info("RevenueCat event {id} of type {type} carries no subscription state", {
            id: event.id,
            type: event.type,
          });
        }

        return c.body(null, 200);
      },
    )
    .post("/clerk", async (c) => {
      // `verifyWebhook` reads the request body, and the `/webhooks/*`
      // bodyLimit middleware has already consumed `c.req.raw`'s stream by
      // now. `c.req.text()` is served from Hono's cache, so re-wrapping it in
      // a fresh Request is what lets the HMAC see the bytes as received.
      const raw = await c.req.text();
      const request = new Request(c.req.url, {
        method: "POST",
        headers: c.req.raw.headers,
        body: raw,
      });

      let event;
      try {
        event = await deps.verifyClerkWebhook(request);
      } catch {
        throw problems.create("UNAUTHORIZED", {
          detail: "A valid webhook signature is required.",
        });
      }

      // 200, not 4xx: Clerk sends whatever the endpoint subscribes to, and a
      // rejection would make it retry an event we simply do not act on.
      if (event.type !== "user.deleted") {
        clerkLog.info("Clerk event of type {type} ignored", { type: event.type });

        return c.body(null, 200);
      }

      // Nothing to query without an id: answer like an unknown user rather
      // than let an absent id reach `deleteUser`.
      const userId = event.data.id;
      if (!userId) {
        clerkLog.info("Clerk user.deleted event carried no user id");

        return c.body(null, 200);
      }

      // One transaction: the scrub, the tombstone and the delete commit
      // together, or Clerk's retry finds the account still whole. The
      // tombstone in particular must not outlive a rolled-back delete, or a
      // live account would start losing its RevenueCat events.
      const { scrubbed, removed } = await deps.db.transaction(async (tx) => {
        const scrubbedCount = await scrubSubscriptionEvents(tx, userId);
        await recordUserDeletion(tx, userId);

        return { scrubbed: scrubbedCount, removed: await deleteUser(tx, userId) };
      });

      if (removed) {
        clerkLog.info("Deleted user {userId}, scrubbing {scrubbed} subscription events", {
          userId,
          scrubbed,
        });
      } else {
        // A redelivery, or a user who never wrote anything. Neither is an error.
        clerkLog.info("Clerk user.deleted for unknown user {userId}", { userId });
      }

      return c.body(null, 200);
    });
}
