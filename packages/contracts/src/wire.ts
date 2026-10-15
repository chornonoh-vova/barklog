import type { BacklogStatus } from "./backlog.js";
import type { PeriodType, SubscriptionStore } from "./subscription.js";

export interface NamedRef {
  id: number;
  name: string;
  slug: string;
}

export interface PlatformRef extends NamedRef {
  abbreviation: string | null;
}

export interface GameSummaryWire {
  id: number;
  name: string;
  slug: string;
  coverImageId: string | null;
  firstReleaseDate: string | null;
  totalRating: number | null;
  totalRatingCount: number;
}

export interface GameDetailWire extends GameSummaryWire {
  summary: string | null;
  gameType: { id: number; name: string } | null;
  parentGame: { id: number; name: string } | null;
  screenshots: string[];
  genres: NamedRef[];
  platforms: PlatformRef[];
  developers: NamedRef[];
  publishers: NamedRef[];
}

export interface BacklogEntryWire {
  gameId: number;
  status: BacklogStatus;
  rating: number | null;
  addedAt: string;
  updatedAt: string;
}

export interface BacklogListItemWire extends BacklogEntryWire {
  game: GameSummaryWire;
}

export interface GameListResponse {
  items: GameSummaryWire[];
}

export interface GameDetailResponse extends GameDetailWire {
  backlogEntry: BacklogEntryWire | null;
}

export interface BacklogListResponse {
  items: BacklogListItemWire[];
}

export interface BacklogStatsWire {
  total: number;
  counts: Record<BacklogStatus, number>;
  averageRating: number | null;
}

/**
 * Stable, machine-readable reasons a client can look up in its own copy. The
 * `title` and `detail` beside them stay English and stay sent, for builds that
 * predate the code.
 */
export const PROBLEM_CODES = [
  "unauthorized",
  "game_not_found",
  "backlog_entry_not_found",
  "backlog_cap_reached",
  "share_invalid_url",
  "share_source_gone",
  "share_source_blocked",
  "share_source_unreadable",
  "share_fetch_failed",
] as const;

export type ProblemCode = (typeof PROBLEM_CODES)[number];

export interface ProblemDocument {
  type: string;
  title: string;
  status: number;
  code?: ProblemCode;
  detail?: string;
  /** `backlog_cap_reached`: how many games to finish to free one spot. */
  toFree?: number;
  instance?: string;
  traceId?: string;
  errors?: { field: string; message: string }[];
}

export interface EntitlementWire {
  productId: string;
  store: SubscriptionStore;
  periodType: PeriodType;
  expiresAt: string | null;
  willRenew: boolean;
}

export interface MeResponse {
  premium: boolean;
  entitlement: EntitlementWire | null;
}
