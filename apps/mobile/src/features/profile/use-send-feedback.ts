import { useAuth } from "@clerk/expo";
import { nativeApplicationVersion, nativeBuildVersion } from "expo-application";
import { openURL } from "expo-linking";
import * as MailComposer from "expo-mail-composer";
import * as Updates from "expo-updates";
import { useCallback, useRef } from "react";
import { Alert, Platform } from "react-native";

import {
  FEEDBACK_EMAIL,
  FEEDBACK_SUBJECT,
  feedbackBody,
  feedbackMailto,
} from "@/features/profile/feedback";
import { usePremium } from "@/lib/api/hooks";
import { i18n } from "@/lib/i18n/instance";

/** `false` so the caller falls back; a cancelled draft is still `true`. */
async function composeInApp(body: string): Promise<boolean> {
  try {
    if (!(await MailComposer.isAvailableAsync())) return false;
    await MailComposer.composeAsync({
      recipients: [FEEDBACK_EMAIL],
      subject: FEEDBACK_SUBJECT,
      body,
    });
    return true;
  } catch {
    return false;
  }
}

/** Compose sheet, then `mailto:`, then an alert with the address. One sheet at a time:
 * a second would make the composer reject. */
export function useSendFeedback(): () => void {
  const { userId } = useAuth();
  const premium = usePremium();
  const inFlight = useRef(false);

  return useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;

    const body = feedbackBody({
      version: nativeApplicationVersion,
      build: nativeBuildVersion,
      updateId: Updates.updateId,
      isEmbeddedLaunch: Updates.isEmbeddedLaunch,
      channel: Updates.channel,
      osVersion: String(Platform.Version),
      isPad: Platform.OS === "ios" && Platform.isPad,
      language: i18n.language,
      userId: userId ?? null,
      premium,
    });

    void (async () => {
      try {
        if (await composeInApp(body)) return;
        await openURL(feedbackMailto(body));
      } catch {
        Alert.alert(
          i18n.t("feedback.noMailTitle"),
          i18n.t("feedback.noMailMessage", { email: FEEDBACK_EMAIL }),
        );
      } finally {
        inFlight.current = false;
      }
    })();
  }, [userId, premium]);
}
