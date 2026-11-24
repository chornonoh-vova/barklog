import { Alert } from "react-native";

import { i18n } from "@/lib/i18n/instance";

export function confirmSignOut(onConfirm: () => void): void {
  Alert.alert(i18n.t("profile.signOutTitle"), i18n.t("profile.signOutMessage"), [
    { text: i18n.t("common.cancel"), style: "cancel" },
    { text: i18n.t("profile.signOut"), style: "destructive", onPress: onConfirm },
  ]);
}

export function confirmDeleteAccount(onConfirm: () => void): void {
  Alert.alert(i18n.t("profile.deleteTitle"), i18n.t("profile.deleteMessage"), [
    { text: i18n.t("common.cancel"), style: "cancel" },
    { text: i18n.t("profile.deleteAccount"), style: "destructive", onPress: onConfirm },
  ]);
}
