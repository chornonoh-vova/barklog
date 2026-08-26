/**
 * A counter, not a key list. The sync runs `INCR` on it, and every key from the
 * previous version becomes unreachable at once and expires on its own — no key
 * scanning, and no way to miss an invalidation.
 *
 * Declared here, not duplicated as a literal in `apps/api` and `apps/worker`,
 * because those are two separate processes: a typo in one that diverges from
 * the other would silently break invalidation (search would keep serving
 * stale results) with nothing in the suite failing.
 */
export const SEARCH_VERSION_KEY = "search:ver";
