import { sValidator } from "@hono/standard-validator";
import {
  RELEASE_ALERT_MINUTES_DEFAULT,
  meSettingsSchema,
  pushDeviceRegisterSchema,
  pushTokenPathSchema,
  type MeSettingsResponse,
} from "@repo/contracts";
import {
  getReleaseAlertMinutes,
  registerPushDevice,
  setReleaseAlertMinutes,
  unregisterPushDevice,
} from "@repo/db";
import { Hono } from "hono";

import { readEntitlement } from "../entitlement.js";
import { onInvalid } from "../problems.js";
import type { AppDeps, AppEnv } from "../types.js";

export function meRoutes(deps: AppDeps) {
  return (
    new Hono<AppEnv>()
      .get("/", async (c) => {
        // no-store, not no-cache: this gates a paid feature, so a stale
        // revalidation is worse than a round trip.
        c.header("Cache-Control", "private, no-store");

        const userId = c.get("userId");
        const [entitlement, minutes] = await Promise.all([
          readEntitlement(deps.db, userId, new Date()),
          getReleaseAlertMinutes(deps.db, userId),
        ]);

        // Added here rather than in `readEntitlement`, which
        // `/subscription/refresh` shares and whose answer stays as it was.
        return c.json({
          ...entitlement,
          releaseAlertMinutes: minutes ?? RELEASE_ALERT_MINUTES_DEFAULT,
        });
      })
      // The app calls this on every start, so `ensureUserMiddleware` refusing a
      // deleted account is what stops it from recreating one.
      .put("/push-devices", sValidator("json", pushDeviceRegisterSchema, onInvalid), async (c) => {
        const { token, locale, timeZone } = c.req.valid("json");
        const userId = c.get("userId");

        await deps.db.transaction((tx) =>
          registerPushDevice(tx, { token, userId, locale, timeZone }),
        );

        return c.body(null, 204);
      })
      // 204 whether or not anything was removed: sign-out is best effort, and
      // whether another account holds the token is not the caller's business.
      .delete(
        "/push-devices/:token",
        sValidator("param", pushTokenPathSchema, onInvalid),
        async (c) => {
          const { token } = c.req.valid("param");

          await unregisterPushDevice(deps.db, c.get("userId"), token);

          return c.body(null, 204);
        },
      )
      .patch("/settings", sValidator("json", meSettingsSchema, onInvalid), async (c) => {
        const { releaseAlertMinutes } = c.req.valid("json");

        const body: MeSettingsResponse = {
          releaseAlertMinutes: await setReleaseAlertMinutes(
            deps.db,
            c.get("userId"),
            releaseAlertMinutes,
          ),
        };

        return c.json(body);
      })
  );
}
