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

  return (
    <>
      <Stack.Toolbar placement="right">
        {/* Premium's one home on every tab: an outline star offers it, a
            filled one manages it. Customer Center, not the paywall, for
            subscribers — Apple requires restore to be reachable, and the
            paywall is a screen a subscriber has no reason to open. Presented,
            not routed, like the profile below: RevenueCat dismisses its own
            sheet. Hidden while the entitlement is unknown, so a subscriber
            never sees the outline flip to filled. */}
        {premium === undefined ? null : (
          <Stack.Toolbar.Button
            icon={premium ? "star.fill" : "star"}
            accessibilityLabel={t(premium ? "profile.manageSubscription" : "profile.getPremium")}
            onPress={() => {
              if (premium) void RevenueCatUI.presentCustomerCenter();
              else router.push("/paywall");
            }}
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
