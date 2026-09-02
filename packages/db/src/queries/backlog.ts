import { and, asc, avg, count, desc, eq, sql, type SQL } from "drizzle-orm";

import type { Queryable } from "../client.js";
import {
  BACKLOG_STATUSES,
  backlogEntries,
  users,
  type BacklogStatusValue,
} from "../schema/backlog.js";
import { games } from "../schema/mirror.js";
import { GAME_SUMMARY_COLUMNS, type GameSummary } from "./games.js";

export const BACKLOG_SORTS = ["updated_at", "added_at", "rating", "name"] as const;
export type BacklogSort = (typeof BACKLOG_SORTS)[number];

export const BACKLOG_SOFT_CAP = 5000;

export interface BacklogEntry {
  gameId: number;
  status: BacklogStatusValue;
  rating: number | null;
  addedAt: Date;
  updatedAt: Date;
}

export interface BacklogListItem extends BacklogEntry {
  game: GameSummary;
}

export interface BacklogStats {
  total: number;
  counts: Record<BacklogStatusValue, number>;
  averageRating: number | null;
}

const ENTRY_COLUMNS = {
  gameId: backlogEntries.gameId,
  status: backlogEntries.status,
  rating: backlogEntries.rating,
  addedAt: backlogEntries.addedAt,
  updatedAt: backlogEntries.updatedAt,
};

const ORDER_BY: Record<BacklogSort, SQL> = {
  updated_at: desc(backlogEntries.updatedAt),
  added_at: desc(backlogEntries.addedAt),
  rating: sql`${backlogEntries.rating} DESC NULLS LAST`,
  name: asc(games.name),
};

export async function ensureUser(db: Queryable, userId: string): Promise<void> {
  await db.insert(users).values({ id: userId }).onConflictDoNothing();
}

export async function getBacklogEntry(
  db: Queryable,
  userId: string,
  gameId: number,
): Promise<BacklogEntry | null> {
  const rows = await db
    .select(ENTRY_COLUMNS)
    .from(backlogEntries)
    .where(and(eq(backlogEntries.userId, userId), eq(backlogEntries.gameId, gameId)))
    .limit(1);

  return rows[0] ?? null;
}

export async function listBacklog(
  db: Queryable,
  options: { userId: string; status?: BacklogStatusValue; sort?: BacklogSort; limit?: number },
): Promise<BacklogListItem[]> {
  const filters = [eq(backlogEntries.userId, options.userId)];
  if (options.status) filters.push(eq(backlogEntries.status, options.status));

  return db
    .select({ ...ENTRY_COLUMNS, game: GAME_SUMMARY_COLUMNS })
    .from(backlogEntries)
    .innerJoin(games, eq(backlogEntries.gameId, games.id))
    .where(and(...filters))
    .orderBy(ORDER_BY[options.sort ?? "updated_at"], asc(backlogEntries.gameId))
    .limit(options.limit ?? BACKLOG_SOFT_CAP);
}

export async function getBacklogStats(db: Queryable, userId: string): Promise<BacklogStats> {
  const [byStatus, aggregate] = await Promise.all([
    db
      .select({ status: backlogEntries.status, count: count() })
      .from(backlogEntries)
      .where(eq(backlogEntries.userId, userId))
      .groupBy(backlogEntries.status),
    db
      .select({ average: avg(backlogEntries.rating) })
      .from(backlogEntries)
      .where(eq(backlogEntries.userId, userId)),
  ]);

  const counts = Object.fromEntries(BACKLOG_STATUSES.map((status) => [status, 0])) as Record<
    BacklogStatusValue,
    number
  >;

  let total = 0;
  for (const row of byStatus) {
    counts[row.status] = row.count;
    total += row.count;
  }

  // `avg` returns a string, and null when there is nothing to average.
  const average = aggregate[0]?.average ?? null;

  return {
    total,
    counts,
    averageRating: average === null ? null : Math.round(Number(average) * 100) / 100,
  };
}

/** `xmax = 0` distinguishes an insert from an `ON CONFLICT` update — a freshly
 * inserted row has no updating transaction id. It is the 201-vs-200 signal. */
export async function upsertBacklogEntry(
  db: Queryable,
  input: {
    userId: string;
    gameId: number;
    status: BacklogStatusValue;
    rating: number | null;
  },
): Promise<{ entry: BacklogEntry; created: boolean }> {
  const rows = await db
    .insert(backlogEntries)
    .values({
      userId: input.userId,
      gameId: input.gameId,
      status: input.status,
      rating: input.rating,
    })
    .onConflictDoUpdate({
      target: [backlogEntries.userId, backlogEntries.gameId],
      set: { status: input.status, rating: input.rating, updatedAt: new Date() },
    })
    .returning({ ...ENTRY_COLUMNS, created: sql<boolean>`(xmax = 0)` });

  const { created, ...entry } = rows[0]!;

  return { entry, created };
}

export async function deleteBacklogEntry(
  db: Queryable,
  userId: string,
  gameId: number,
): Promise<boolean> {
  const removed = await db
    .delete(backlogEntries)
    .where(and(eq(backlogEntries.userId, userId), eq(backlogEntries.gameId, gameId)))
    .returning({ gameId: backlogEntries.gameId });

  return removed.length > 0;
}
