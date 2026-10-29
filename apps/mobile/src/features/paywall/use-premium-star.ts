import { useTranslation } from "react-i18next";
import RevenueCatUI from "react-native-purchases-ui";
import type { SFSymbol } from "sf-symbols-typescript";

import { openPaywall } from "@/features/paywall/open-paywall";
import { usePremium } from "@/lib/api/hooks";

export type PremiumStar = { icon: SFSymbol; accessibilityLabel: string; onPress: () => void };

/**
 * Props for the toolbar's Premium star, spread onto a `Stack.Toolbar.Button`.
 * A hook rather than a component: `Stack.Toolbar` accepts only its own item
 * types as children, so a wrapper component would be dropped.
 *
 * Subscribers get Customer Center, not the paywall: Apple requires restore to
 * be reachable, and a subscriber has no reason to open the paywall. `null`
 * while the entitlement is unknown, so a subscriber never sees the outline
 * flip to filled.
 */
export function usePremiumStar(): PremiumStar | null {
  const premium = usePremium();
  const { t } = useTranslation();

  if (premium === undefined) return null;

  return premium
    ? {
        icon: "star.fill",
        accessibilityLabel: t("profile.manageSubscription"),
        onPress: () => void RevenueCatUI.presentCustomerCenter(),
      }
    : { icon: "star", accessibilityLabel: t("profile.getPremium"), onPress: openPaywall };
}
