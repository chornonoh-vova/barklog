import { i18n } from "@/lib/i18n/instance";

export type AccountUser = {
  fullName: string | null;
  primaryEmailAddress: string | null;
  imageUrl: string | null;
};

/** The account row leads with the name, like Settings' Apple Account row; the
 * email stands in when there is none. The subtitle says what the row manages. */
export function accountRowText(user: AccountUser): { title: string; subtitle: string } {
  const name = user.fullName?.trim() || null;
  const subtitle = i18n.t("profile.accountSubtitle");

  return { title: name ?? user.primaryEmailAddress ?? i18n.t("profile.account"), subtitle };
}

export type PremiumRow = {
  title: string;
  status: string | null;
  icon: "star" | "star.fill";
  accessibilityLabel: string;
  action: "paywall" | "customerCenter";
} | null;

/** `undefined` means entitlement has not loaded yet, so no row is shown. */
export function premiumRow(premium: boolean | undefined): PremiumRow {
  if (premium === undefined) return null;

  if (premium) {
    return {
      title: i18n.t("profile.premium"),
      status: i18n.t("profile.premiumActive"),
      icon: "star.fill",
      accessibilityLabel: i18n.t("profile.premiumActiveLabel"),
      action: "customerCenter",
    };
  }

  const title = i18n.t("profile.getPremium");
  return {
    title,
    status: null,
    icon: "star",
    accessibilityLabel: title,
    action: "paywall",
  };
}

export function versionLine(version: string | null, build: string | null): string {
  const v = version ?? "";
  return build
    ? i18n.t("profile.version", { version: v, build })
    : i18n.t("profile.versionNoBuild", { version: v });
}
