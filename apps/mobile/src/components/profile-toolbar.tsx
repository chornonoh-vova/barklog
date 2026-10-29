import { UserProfileView } from "@clerk/expo/native-components";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, StyleSheet, useWindowDimensions } from "react-native";
import RevenueCatUI from "react-native-purchases-ui";

import { usePremium } from "@/lib/api/hooks";
import { prefersSheet } from "@/ui/columns";
import { MODAL_ORIENTATIONS } from "@/ui/modal-orientations";

/**
 * Not Clerk's `UserButton`: it finds its parent by walking the responder chain,
 * and from iOS 26 react-native-screens adds a wrapper view that makes the walk
 * overshoot onto the `UINavigationController`, wiping the title and this item.
 * iOS 18 has no wrapper — that is the whole of the 18/26 split.
 *
 * Presented, not routed: Clerk dismisses its own native view, so a routed
 * profile calling `router.back()` has nothing left to pop.
 *
 * A symbol, not the user's avatar: iPhone Duo leaves custom views out of its
 * toolbar rail, and this is the way to account deletion, which App Review
 * must be able to find. A bar button cannot size or round a remote image.
 */
export function ProfileToolbar() {
  const [isOpen, setIsOpen] = useState(false);
  const premium = usePremium();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { t } = useTranslation();

  // Subscribers get Customer Center, not the paywall: Apple requires restore
  // to be reachable, and a subscriber has no reason to open the paywall.
  const star =
    premium === undefined
      ? null
      : premium
        ? ({
            icon: "star.fill",
            label: "profile.manageSubscription",
            onPress: () => void RevenueCatUI.presentCustomerCenter(),
          } as const)
        : ({
            icon: "star",
            label: "profile.getPremium",
            onPress: () => router.push("/paywall"),
          } as const);

  return (
    <>
      <Stack.Toolbar placement="right">
        {/* Hidden while the entitlement is unknown, so a subscriber never sees
            the outline flip to filled. */}
        {star === null ? null : (
          <Stack.Toolbar.Button
            icon={star.icon}
            accessibilityLabel={t(star.label)}
            onPress={star.onPress}
          />
        )}
        <Stack.Toolbar.Button
          icon="person.crop.circle"
          accessibilityLabel={t("profile.openAccount")}
          onPress={() => setIsOpen(true)}
        />
      </Stack.Toolbar>

      {/* `Modal` renders nothing while hidden, so the native profile view is
          mounted only for the tab whose account button was pressed. */}
      <Modal
        visible={isOpen}
        animationType="slide"
        presentationStyle={prefersSheet(width) ? "pageSheet" : "fullScreen"}
        supportedOrientations={MODAL_ORIENTATIONS}
        onRequestClose={() => setIsOpen(false)}
      >
        <UserProfileView style={styles.profile} onDismiss={() => setIsOpen(false)} />
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  profile: { flex: 1 },
});
