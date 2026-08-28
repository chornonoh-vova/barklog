import { useAuth } from "@clerk/expo";
import { useEffect, useState, type ReactNode } from "react";

import { OnboardingScreen } from "@/features/onboarding/onboarding-screen";
import { useReleaseSplash } from "@/splash";

import { onboardingDecision } from "./should-show-onboarding";
import { markOnboardingSeen, readHasSeenOnboarding } from "./storage";

/**
 * Sits outside `AuthGate` so the pages are reachable without an account by
 * construction: expo-router's routes live under the `Slot` inside `AuthGate`, so
 * onboarding could not have been a route and still come first.
 *
 * `treatPendingAsSignedOut: false` matches `AuthGate`, so a session still being
 * established does not read as signed-out and drop a returning user into
 * onboarding.
 */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const [hasSeen, setHasSeen] = useState<boolean | undefined>(undefined);
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });

  useEffect(() => {
    void readHasSeenOnboarding().then(setHasSeen);
  }, []);

  // `undefined` until Clerk has read the keychain: the policy treats that as
  // "not yet known", never as signed-out.
  const decision = onboardingDecision(hasSeen, isLoaded ? isSignedIn : undefined);

  useReleaseSplash(decision === "show");

  useEffect(() => {
    // Reinstall case: session restored, flag gone — persist it so the next launch
    // skips Clerk. `setHasSeen(true)` mirrors that locally too: without it, a
    // later sign-out in the same session flips `decision` back to "show" and
    // buries the sign-in screen under onboarding. Chained onto the write rather
    // than called directly, because a bare `setState` here trips
    // `react-hooks/set-state-in-effect`; `markOnboardingSeen` never rejects, so
    // `.then()` always runs.
    if (hasSeen === false && decision === "complete") {
      void markOnboardingSeen().then(() => setHasSeen(true));
    }
  }, [hasSeen, decision]);

  if (decision === "pending") return null;

  if (decision === "show") {
    return (
      <OnboardingScreen
        onComplete={() => {
          // Local state first: entry to the app must not wait on a write.
          setHasSeen(true);
          void markOnboardingSeen();
        }}
      />
    );
  }

  return children;
}
