import { useAuth } from "@clerk/expo";
import { nativeApplicationVersion, nativeBuildVersion } from "expo-application";
import { openURL } from "expo-linking";
import * as MailComposer from "expo-mail-composer";
import * as Updates from "expo-updates";
import { useCallback } from "react";
import { Alert, Platform } from "react-native";

import {
  FEEDBACK_EMAIL,
  FEEDBACK_SUBJECT,
  feedbackBody,
  feedbackMailto,
} from "@/features/profile/feedback";
import { usePremium } from "@/lib/api/hooks";
import { i18n } from "@/lib/i18n/instance";

/**
 * "Request a Feature or Report an Issue": the system compose sheet, kept
 * inside the app, with the subject, address and debug details filled in. A
 * device without Mail set up falls back to `mailto:` (whatever mail app the
 * user chose), and with no mail app at all the alert gives the address.
 */
export function useSendFeedback(): () => void {
  const { userId } = useAuth();
  const premium = usePremium();

  return useCallback(() => {
    const body = feedbackBody({
      version: nativeApplicationVersion,
      build: nativeBuildVersion,
      updateId: Updates.updateId,
      channel: Updates.channel,
      osVersion: String(Platform.Version),
      isPad: Platform.OS === "ios" && Platform.isPad,
      language: i18n.language,
      userId: userId ?? null,
      premium,
    });

    void (async () => {
      if (await MailComposer.isAvailableAsync()) {
        await MailComposer.composeAsync({
          recipients: [FEEDBACK_EMAIL],
          subject: FEEDBACK_SUBJECT,
          body,
        });
        return;
      }

      try {
        await openURL(feedbackMailto(body));
      } catch {
        Alert.alert(
          i18n.t("feedback.noMailTitle"),
          i18n.t("feedback.noMailMessage", { email: FEEDBACK_EMAIL }),
        );
      }
    })();
  }, [userId, premium]);
}
