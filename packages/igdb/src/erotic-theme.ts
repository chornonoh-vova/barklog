/**
 * IGDB's theme id for "Erotic", the tag its contribution guidelines require on
 * pornographic titles. Those guidelines already bar nudity and sexual acts from
 * screenshots — censored ones included — but the database is community-
 * contributed and moderation lags, so Barklog mirrors no screenshots at all for
 * these games. Barklog's App Store age rating answers "None" to graphic sexual
 * content, and this is what keeps that true despite the lag.
 *
 * Covers and summaries are deliberately kept: IGDB bars full nudity from
 * covers, and the rating declares "Infrequent" for non-graphic sexual content.
 *
 * Two things use it, for two different jobs. `mapGames` drops screenshots on the
 * way in, so they never reach Postgres. `eroticGameIdsQuery` drives the nightly
 * sweep, which clears rows stored before this existed and rows for games IGDB
 * re-tagged after we had already synced them.
 */
export const EROTIC_THEME_ID = 42;
