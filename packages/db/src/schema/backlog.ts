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
    // Minutes after local midnight on a 30-minute grid; default duplicated in `packages/contracts`.
    releaseAlertMinutes: smallint("release_alert_minutes").notNull().default(540),
    // IANA zone from the latest push registration; null keeps device-less users unscheduled.
    timeZone: text("time_zone"),
    // Local date the alert scheduler last finished; written only by the worker.
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
 * A tombstone, not a soft delete: RevenueCat events and pre-deletion sessions
 * keep arriving for the id, and `ensureUser` checks this so neither recreates the account.
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
