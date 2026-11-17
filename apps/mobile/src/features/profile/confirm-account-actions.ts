import { ActionSheetIOS, Alert } from "react-native";

import { i18n } from "@/lib/i18n/instance";

/**
 * Sign out is reversible, so it gets an action sheet. `anchor` is the pressed
 * row's node handle, which iPad needs to place the popover; iPhone ignores it.
 */
export function confirmSignOut(anchor: number | null, onConfirm: () => void): void {
  ActionSheetIOS.showActionSheetWithOptions(
    {
      title: i18n.t("profile.signOutTitle"),
      options: [i18n.t("profile.signOut"), i18n.t("common.cancel")],
      destructiveButtonIndex: 0,
      cancelButtonIndex: 1,
      anchor: anchor ?? undefined,
    },
    (index) => {
      if (index === 0) onConfirm();
    },
  );
}

/** Deletion is permanent, and does not cancel an App Store subscription. */
export function confirmDeleteAccount(onConfirm: () => void): void {
  Alert.alert(i18n.t("profile.deleteTitle"), i18n.t("profile.deleteMessage"), [
    { text: i18n.t("common.cancel"), style: "cancel" },
    { text: i18n.t("profile.deleteAccount"), style: "destructive", onPress: onConfirm },
  ]);
}
