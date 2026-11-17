import { Alert } from "react-native";

import { i18n } from "@/lib/i18n/instance";

/**
 * The same centred alert as Delete Account, so both account actions confirm
 * the same way. The message says nothing is lost: signing out is undone by
 * signing back in.
 */
export function confirmSignOut(onConfirm: () => void): void {
  Alert.alert(i18n.t("profile.signOutTitle"), i18n.t("profile.signOutMessage"), [
    { text: i18n.t("common.cancel"), style: "cancel" },
    { text: i18n.t("profile.signOut"), style: "destructive", onPress: onConfirm },
  ]);
}

/** Deletion is permanent, and does not cancel an App Store subscription. */
export function confirmDeleteAccount(onConfirm: () => void): void {
  Alert.alert(i18n.t("profile.deleteTitle"), i18n.t("profile.deleteMessage"), [
    { text: i18n.t("common.cancel"), style: "cancel" },
    { text: i18n.t("profile.deleteAccount"), style: "destructive", onPress: onConfirm },
  ]);
}
