import { Alert } from "react-native";

import { removeConfirmCopy } from "@/features/game/remove-confirm";

/**
 * The one path to removing a game — the toolbar and the row menu both come
 * through here, so they both confirm. Undo was rejected: iOS has no system
 * toast to host it.
 */
export function confirmRemove(gameName: string, onConfirm: () => void): void {
  const copy = removeConfirmCopy(gameName);

  Alert.alert(copy.title, copy.message, [
    { text: copy.cancel, style: "cancel" },
    { text: copy.confirm, style: "destructive", onPress: onConfirm },
  ]);
}
