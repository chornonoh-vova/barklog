import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect } from "react";
import RevenueCatUI from "react-native-purchases-ui";

import { keys } from "@/api/keys";
import { useApi } from "@/api/provider";
import { refreshSubscription } from "@/purchases/refresh";
import { markPaywallSeen } from "@/review/session";

/** Presented as a `pageSheet` by `_layout.tsx` — an offer, not a wall. */
export default function Paywall() {
  const queryClient = useQueryClient();
  const api = useApi();

  // Marked here rather than at each `router.push("/paywall")`, so every route
  // into the sheet counts — including ones added later.
  useEffect(() => markPaywallSeen(), []);

  const settle = () => {
    // A purchase and a restore are the two moments the client knows something
    // the server may not: the SDK holds the entitlement, and the webhook that
    // would tell us can be lost for good (RevenueCat exhausting its retries,
    // the api down through the window, a rotated webhook secret). So ask the
    // server to re-read RevenueCat here — an invalidation alone cannot create a
    // row, which is why Restore Purchases used to repair nothing.
    //
    // Refresh first, invalidate after: `/api/me` must be refetched once the
    // server has re-read, not before. `api` and `queryClient` are captured
    // deliberately, because `router.back()` below is synchronous and this chain
    // outlives the component — `invalidateQueries` is safe after unmount, and
    // anything touching state would not be.
    void refreshSubscription(api).finally(() => {
      void queryClient.invalidateQueries({ queryKey: keys.me() });
      void queryClient.invalidateQueries({ queryKey: keys.backlog.all });
    });

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
