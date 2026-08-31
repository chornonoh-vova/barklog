import { useAuth } from "@clerk/expo";
import { useEffect, useState, type ReactNode } from "react";

import { OnboardingScreen } from "@/features/onboarding/onboarding-screen";
import { useReleaseSplash } from "@/splash";

import { onboardingDecision } from "./should-show-onboarding";
import { markOnboardingSeen, readHasSeenOnboarding } from "./storage";

export function OnboardingGate({ children }: { children: ReactNode }) {
  const [hasSeen, setHasSeen] = useState<boolean | undefined>(undefined);
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });

  useEffect(() => {
    void readHasSeenOnboarding().then(setHasSeen);
  }, []);

  const decision = onboardingDecision(hasSeen, isLoaded ? isSignedIn : undefined);

  useReleaseSplash(decision === "show");

  useEffect(() => {
    // Reinstall: session restored, flag gone. `setHasSeen(true)` must mirror the
    // write locally, or a later sign-out flips `decision` back to "show" and
    // buries the sign-in screen. Chained rather than called directly to satisfy
    // `react-hooks/set-state-in-effect`; `markOnboardingSeen` never rejects.
    if (hasSeen === false && decision === "complete") {
      void markOnboardingSeen().then(() => setHasSeen(true));
    }
  }, [hasSeen, decision]);

  if (decision === "pending") return null;

  if (decision === "show") {
    return (
      <OnboardingScreen
        onComplete={() => {
          setHasSeen(true);
          void markOnboardingSeen();
        }}
      />
    );
  }

  return children;
}
