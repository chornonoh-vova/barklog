import { useAuth } from "@clerk/expo";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState, type ReactNode } from "react";

import { OnboardingScreen } from "@/features/onboarding/onboarding-screen";

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
    let isCurrent = true;

    void readHasSeenOnboarding().then((seen) => {
      // A post-unmount `setState` is a silent no-op under React 19.2.3 (the
      // same reason the write callback below needs no guard), so this isn't
      // preventing a fault. It exists to skip a pointless update on a dead
      // component and to make the intent explicit: Fast Refresh can unmount
      // this before the read lands.
      if (isCurrent) setHasSeen(seen);
    });

    return () => {
      isCurrent = false;
    };
  }, []);

  // `undefined` until Clerk has read the keychain: the policy treats that as
  // "not yet known", never as signed-out.
  const decision = onboardingDecision(hasSeen, isLoaded ? isSignedIn : undefined);

  useEffect(() => {
    // The reinstall case: session restored, flag gone. Persist it so the next
    // launch takes the hot path and never waits on Clerk.
    //
    // `setHasSeen(true)` as well as the write, so local state mirrors storage.
    // Without it `hasSeen` stays `false` for the rest of the session and
    // `decision` keeps depending on `isSignedIn`: a sign-out later in the same
    // session would flip the gate back to "show" and bury the sign-in screen
    // under onboarding, since this gate sits above `AuthGate`. It also makes the
    // effect self-terminating rather than relying on the deps array.
    //
    // Chained onto the write, not called directly in the effect body: the bare
    // synchronous call trips `react-hooks/set-state-in-effect`, and
    // `markOnboardingSeen` never rejects, so the `.then()` always runs.
    if (hasSeen === false && decision === "complete") {
      void markOnboardingSeen().then(() => setHasSeen(true));
    }
  }, [hasSeen, decision]);

  useEffect(() => {
    // Held open by the root layout. Whichever gate paints first hides it, and
    // that is this one whenever onboarding runs.
    if (decision === "show") void SplashScreen.hideAsync();
  }, [decision]);

  if (decision === "pending") return null;

  if (decision === "show") {
    return (
      <OnboardingScreen
        onComplete={() => {
          // Local state first: the transition into the app must not wait on a
          // write, and `markOnboardingSeen` never rejects.
          setHasSeen(true);
          void markOnboardingSeen();
        }}
      />
    );
  }

  return children;
}
