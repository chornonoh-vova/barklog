import { useAuth } from "@clerk/expo";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, type ReactNode } from "react";
import Purchases from "react-native-purchases";

import { useApi } from "@/api/provider";
import { keys } from "@/api/keys";
import { REVENUECAT_API_KEY } from "@/env";

import { identifyAction } from "./should-identify";

/** Keeps RevenueCat's App User ID equal to the Clerk `sub`, which is `users.id`. */
export function PurchasesProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth({ treatPendingAsSignedOut: false });
  const queryClient = useQueryClient();
  const api = useApi();
  const previous = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    Purchases.configure({ apiKey: REVENUECAT_API_KEY });
  }, []);

  useEffect(() => {
    const action = identifyAction(previous.current, userId);
    if (action === "none") return;

    previous.current = userId;

    if (action === "logout") {
      void Purchases.logOut();
      return;
    }

    void Purchases.logIn(userId as string);
  }, [userId]);

  useEffect(() => {
    // The SDK knows about a purchase before our webhook does. Ask the server
    // to re-read RevenueCat, then invalidate — so the unlock is immediate and
    // the API stays the authority.
    const listener = () => {
      void api
        .refreshSubscription()
        .catch(() => undefined)
        .finally(() => void queryClient.invalidateQueries({ queryKey: keys.me() }));
    };

    Purchases.addCustomerInfoUpdateListener(listener);

    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [api, queryClient]);

  return children;
}
