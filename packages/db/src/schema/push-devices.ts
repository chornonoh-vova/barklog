import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { users } from "./backlog.js";

/**
 * One row per app installation that can receive release alerts. Keyed by the
 * token, not by user: a phone that switches accounts moves its row to the new
 * user rather than notifying both.
 */
export const pushDevices = pgTable(
  "push_devices",
  {
    // The Expo push token, as the app sent it. Its format is Expo's business.
    token: text("token").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // The app language, for rendering notification copy on this device.
    locale: text("locale").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("push_devices_user_id_idx").on(t.userId)],
);
