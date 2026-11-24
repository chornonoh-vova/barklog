import de from "./locales/de/landing.json" with { type: "json" };
import en from "./locales/en/landing.json" with { type: "json" };
import es from "./locales/es/landing.json" with { type: "json" };
import ru from "./locales/ru/landing.json" with { type: "json" };
import uk from "./locales/uk/landing.json" with { type: "json" };
import type { Language } from "./locales.js";

/** The landing site's copy, typed from English like the app's. */
export type LandingCopy = typeof en;

/** Exported only from `@repo/i18n/landing`, never the package root, so the app's
    bundle (which imports the root) never carries web-only copy. */
export const landing: Record<Language, LandingCopy> = { en, uk, ru, de, es };
