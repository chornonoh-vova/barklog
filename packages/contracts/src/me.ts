import * as v from "valibot";

/** Duplicates `@repo/i18n`'s `LANGUAGES` to stay dependency-free; i18n holds the parity test. */
export const PUSH_LOCALES = ["en", "uk", "ru", "de", "es"] as const;
export type PushLocale = (typeof PUSH_LOCALES)[number];

/** Minutes after local midnight. 540 is 09:00; the database has the same default. */
export const RELEASE_ALERT_MINUTES_DEFAULT = 540;
export const RELEASE_ALERT_MINUTES_MAX = 1410;
export const RELEASE_ALERT_MINUTES_STEP = 30;

/**
 * An IANA zone name. Offsets like `+05:00` are refused: Postgres reads their sign POSIX-style
 * (UTC-5), unlike Intl. `Etc/GMT±N` is POSIX-signed in both, so it stays valid.
 */
function isTimeZone(value: string): boolean {
  if (value.startsWith("+") || value.startsWith("-")) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

// Expo owns the format; validating it could silently stop registrations.
const token = v.pipe(v.string(), v.nonEmpty());

export const pushDeviceRegisterSchema = v.strictObject({
  token,
  locale: v.picklist(PUSH_LOCALES),
  timeZone: v.pipe(
    v.string(),
    v.nonEmpty(),
    v.maxLength(64),
    v.check(isTimeZone, "Unknown time zone."),
  ),
});
export type PushDeviceRegister = v.InferOutput<typeof pushDeviceRegisterSchema>;

export const pushTokenPathSchema = v.object({ token });

export const meSettingsSchema = v.strictObject({
  releaseAlertMinutes: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(0),
    v.maxValue(RELEASE_ALERT_MINUTES_MAX),
    v.multipleOf(RELEASE_ALERT_MINUTES_STEP),
  ),
});
export type MeSettings = v.InferOutput<typeof meSettingsSchema>;

export interface MeSettingsResponse {
  releaseAlertMinutes: number;
}
