import { useClerk, useUser } from "@clerk/expo";
import { useCallback, useRef, useState } from "react";
import { Alert } from "react-native";

import { confirmDeleteAccount, confirmSignOut } from "@/features/profile/confirm-account-actions";
import { playDecisionHaptic } from "@/lib/haptics/play";
import { i18n } from "@/lib/i18n/instance";

/** Clerk refuses `user.delete()` when the session was last verified too long ago. */
function isReverificationRequired(error: unknown): boolean {
  const code = (error as { errors?: { code?: unknown }[] } | null)?.errors?.[0]?.code;
  return code === "session_reverification_required";
}

export interface AccountActions {
  signOut(anchor: number | null): void;
  deleteAccount(): void;
  isDeleting: boolean;
}

/**
 * Sign out and delete account, each behind its confirmation. Neither clears
 * device data: the auth gate does that when the user id changes (ADR-0004).
 */
export function useAccountActions(options: {
  onReverificationRequired: () => void;
}): AccountActions {
  const { onReverificationRequired } = options;
  const clerk = useClerk();
  const { user } = useUser();
  const [isDeleting, setIsDeleting] = useState(false);
  const inFlight = useRef(false);

  const signOut = useCallback(
    (anchor: number | null) => {
      confirmSignOut(anchor, () => {
        void clerk.signOut();
      });
    },
    [clerk],
  );

  const deleteAccount = useCallback(() => {
    confirmDeleteAccount(() => {
      if (inFlight.current || !user) return;
      inFlight.current = true;
      setIsDeleting(true);
      user
        .delete()
        .catch((error: unknown) => {
          if (isReverificationRequired(error)) {
            Alert.alert(i18n.t("profile.reverifyTitle"), i18n.t("profile.reverifyMessage"), [
              { text: i18n.t("common.cancel"), style: "cancel" },
              { text: i18n.t("profile.reverifyContinue"), onPress: onReverificationRequired },
            ]);
            return;
          }
          playDecisionHaptic({ kind: "writeFailed" });
          Alert.alert(i18n.t("profile.deleteFailedTitle"), i18n.t("profile.deleteFailedMessage"));
        })
        .finally(() => {
          inFlight.current = false;
          setIsDeleting(false);
        });
    });
  }, [user, onReverificationRequired]);

  return { signOut, deleteAccount, isDeleting };
}
