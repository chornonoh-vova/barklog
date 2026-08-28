import { describe, expect, it } from "vitest";

import { onboardingDecision } from "@/onboarding/should-show-onboarding";

describe("onboardingDecision", () => {
  it("waits while the stored flag is still being read", () => {
    // The splash is still up at this point, so rendering nothing costs nothing.
    expect(onboardingDecision(undefined, undefined)).toBe("pending");
    expect(onboardingDecision(undefined, false)).toBe("pending");
    expect(onboardingDecision(undefined, true)).toBe("pending");
  });

  it("goes straight through when onboarding has been seen", () => {
    // The hot path on every launch after the first. It must not wait on Clerk,
    // or the splash is held longer than it is today for no reason.
    expect(onboardingDecision(true, undefined)).toBe("complete");
    expect(onboardingDecision(true, false)).toBe("complete");
    expect(onboardingDecision(true, true)).toBe("complete");
  });

  it("waits for Clerk before showing onboarding to an unflagged install", () => {
    // Without this the reinstalling user whose session is still in the keychain
    // sees a frame of onboarding before the auto-complete below fires.
    expect(onboardingDecision(false, undefined)).toBe("pending");
  });

  it("auto-completes for a signed-in user with no stored flag", () => {
    // A reinstall: AsyncStorage went with the app container, the Clerk session
    // did not. Someone with an account has already seen the pitch.
    expect(onboardingDecision(false, true)).toBe("complete");
  });

  it("shows onboarding on a genuine first run", () => {
    expect(onboardingDecision(false, false)).toBe("show");
  });
});
