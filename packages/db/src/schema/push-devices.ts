import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { users } from "./backlog.js";

/** Keyed by token, not user: a phone switching accounts moves its row, not notifying both. */
export const pushDevices = pgTable(
  "push_devices",
  {
    // Expo push token, opaque.
    token: text("token").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // App language for notification copy.
    locale: text("locale").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("push_devices_user_id_idx").on(t.userId)],
);
