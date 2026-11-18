import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { games } from "./mirror.js";

export const BACKLOG_STATUSES = ["waiting", "playing", "completed", "abandoned"] as const;
export type BacklogStatusValue = (typeof BACKLOG_STATUSES)[number];

export const backlogStatus = pgEnum("backlog_status", BACKLOG_STATUSES);

export const users = pgTable(
  "users",
  {
    // The Clerk `sub`, verbatim.
    id: text("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Release alert time: minutes after local midnight, on a 30-minute grid.
    // 540 is 09:00. Duplicated in `packages/contracts` as the API's default.
    releaseAlertMinutes: smallint("release_alert_minutes").notNull().default(540),
    // IANA name from the most recent push device registration; null until the
    // first one, which is what keeps a user without devices out of the scheduler.
    timeZone: text("time_zone"),
    // The user's local date the alert scheduler last finished. Written only by
    // the worker.
    releaseAlertsRunOn: date("release_alerts_run_on", { mode: "string" }),
  },
  (t) => [
    check(
      "users_release_alert_minutes_valid",
      sql`${t.releaseAlertMinutes} BETWEEN 0 AND 1410 AND ${t.releaseAlertMinutes} % 30 = 0`,
    ),
  ],
);

/**
 * A tombstone, not a soft delete: the `users` row really is gone. It exists
 * because deleting a Barklog account cannot cancel an App Store subscription,
 * so RevenueCat keeps delivering renewals and expirations for the id, and a
 * session issued before the deletion can still send writes. `ensureUser`
 * checks it, so neither recreates the account the deletion removed. The id is
 * all it holds; there is nothing else left to hold.
 */
export const deletedUsers = pgTable("deleted_users", {
  id: text("id").primaryKey(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }).notNull().defaultNow(),
});

export const backlogEntries = pgTable(
  "backlog_entries",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    status: backlogStatus("status").notNull(),
    rating: smallint("rating"),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.gameId] }),
    index("backlog_entries_user_status_idx").on(t.userId, t.status),
    check("backlog_entries_rating_range", sql`${t.rating} BETWEEN 1 AND 10`),
  ],
);
