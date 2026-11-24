import { notificationAsync, NotificationFeedbackType } from "expo-haptics";

import { decisionHaptic, type HapticEvent, type HapticFeedback } from "./decision";

const TYPES: Record<HapticFeedback, NotificationFeedbackType> = {
  success: NotificationFeedbackType.Success,
  error: NotificationFeedbackType.Error,
};

/** The system haptics setting silences it; there is no in-app switch. */
export function playHaptic(feedback: HapticFeedback): void {
  void notificationAsync(TYPES[feedback]);
}

export function playDecisionHaptic(event: HapticEvent): void {
  const feedback = decisionHaptic(event);
  if (feedback !== null) playHaptic(feedback);
}
