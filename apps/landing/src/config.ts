/** Barklog's App Store id: the listing URL, the Smart App Banner and structured data all name it. */
export const APP_STORE_ID = "6807319879";

export const APP_STORE_URL = `https://apps.apple.com/app/barklog/id${APP_STORE_ID}`;

/** The site's origin. astro.config.mjs reads it as `site`, and every absolute URL is built from it. */
export const SITE = "https://barklog.gg";

/** English-only pages, at the trailing-slash paths their canonical URLs use. */
export const LEGAL_PATHS = ["/support/", "/terms/", "/privacy/"] as const;

export const CONTACT_EMAIL = "chernonog.vova@gmail.com";

export const REPO_URL = "https://github.com/chornonoh-vova/barklog";
