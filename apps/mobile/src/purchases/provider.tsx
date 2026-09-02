import { useAuth } from "@clerk/expo";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, type ReactNode } from "react";
import Purchases, { type CustomerInfo } from "react-native-purchases";

import { useApi } from "@/api/provider";
import { keys } from "@/api/keys";
import { REVENUECAT_API_KEY } from "@/env";

import { identifyAction } from "./should-identify";
import { entitlementChanged, PREMIUM_ENTITLEMENT } from "./should-refresh";

const REFRESH_ATTEMPTS = 2;
const REFRESH_RETRY_MS = 2_000;

/** Keeps RevenueCat's App User ID equal to the Clerk `sub`, which is `users.id`. */
export function PurchasesProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth({ treatPendingAsSignedOut: false });
  const queryClient = useQueryClient();
  const api = useApi();
  const previous = useRef<string | null | undefined>(undefined);
  const entitled = useRef<boolean | undefined>(undefined);

  useEffect(() => {
    Purchases.configure({ apiKey: REVENUECAT_API_KEY });
  }, []);

  useEffect(() => {
    const action = identifyAction(previous.current, userId);
    if (action === "none") return;

    previous.current = userId;
    // The next firing belongs to a different account (or to none), so it seeds
    // the comparison afresh rather than reading as a transition.
    entitled.current = undefined;

    if (action === "logout") {
      void Purchases.logOut();
      return;
    }

    void Purchases.logIn(userId as string);
  }, [userId]);

  const refresh = useCallback(async () => {
    for (let attempt = 1; attempt <= REFRESH_ATTEMPTS; attempt += 1) {
      try {
        await api.refreshSubscription();
        return;
      } catch (error) {
        // Never rethrow: this runs inside a native listener callback, where a
        // rejection has nowhere to go. But never swallow it silently either —
        // this is the recovery path when the webhook is delayed, so a failure
        // here is why a paying user is still on the free tier.
        if (__DEV__) {
          console.warn(`refreshSubscription attempt ${attempt} failed`, error);
        }

        if (attempt < REFRESH_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, REFRESH_RETRY_MS));
        }
      }
    }
  }, [api]);

  useEffect(() => {
    const listener = (customerInfo: CustomerInfo) => {
      const active = customerInfo.entitlements.active[PREMIUM_ENTITLEMENT] !== undefined;
      const changed = entitlementChanged(entitled.current, active);
      entitled.current = active;

      if (!changed) return;

      // The SDK knows about a purchase before our webhook does. Ask the server
      // to re-read RevenueCat, then invalidate — so the unlock is immediate and
      // the API stays the authority.
      void refresh().finally(() => void queryClient.invalidateQueries({ queryKey: keys.me() }));
    };

    Purchases.addCustomerInfoUpdateListener(listener);

    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [queryClient, refresh]);

  return children;
}
