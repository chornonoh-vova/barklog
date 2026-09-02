import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import RevenueCatUI from "react-native-purchases-ui";

import { keys } from "@/api/keys";

/** Presented as a `pageSheet` by `_layout.tsx` — an offer, not a wall. */
export default function Paywall() {
  const queryClient = useQueryClient();

  const settle = () => {
    // The provider's customerInfo listener already asked the server to
    // re-read RevenueCat; this makes the screen behind the sheet agree.
    void queryClient.invalidateQueries({ queryKey: keys.me() });
    void queryClient.invalidateQueries({ queryKey: keys.backlog.all });
    router.back();
  };

  return (
    <RevenueCatUI.Paywall
      onPurchaseCompleted={settle}
      onRestoreCompleted={settle}
      onDismiss={() => router.back()}
    />
  );
}
