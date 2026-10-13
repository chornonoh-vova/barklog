import { Alert } from "react-native";

import { removeConfirmCopy } from "@/features/game/remove-confirm";

/**
 * The one path to removing a game — toolbar, row menu and swipe all come
 * through here, so they all confirm. Undo was rejected: iOS has no system
 * toast to host it.
 */
export function confirmRemove(gameName: string, onConfirm: () => void): void {
  const copy = removeConfirmCopy(gameName);

  Alert.alert(copy.title, copy.message, [
    { text: copy.cancel, style: "cancel" },
    { text: copy.confirm, style: "destructive", onPress: onConfirm },
  ]);
}
