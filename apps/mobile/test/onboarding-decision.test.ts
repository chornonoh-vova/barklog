import { describe, expect, it } from "vitest";

import { onboardingDecision } from "@/onboarding/should-show-onboarding";

describe("onboardingDecision", () => {
  it("waits while the stored flag is still being read", () => {
    expect(onboardingDecision(undefined, undefined)).toBe("pending");
    expect(onboardingDecision(undefined, false)).toBe("pending");
    expect(onboardingDecision(undefined, true)).toBe("pending");
  });

  it("goes straight through when onboarding has been seen", () => {
    expect(onboardingDecision(true, undefined)).toBe("complete");
    expect(onboardingDecision(true, false)).toBe("complete");
    expect(onboardingDecision(true, true)).toBe("complete");
  });

  it("waits for Clerk before showing onboarding to an unflagged install", () => {
    expect(onboardingDecision(false, undefined)).toBe("pending");
  });

  it("auto-completes for a signed-in user with no stored flag", () => {
    expect(onboardingDecision(false, true)).toBe("complete");
  });

  it("shows onboarding on a genuine first run", () => {
    expect(onboardingDecision(false, false)).toBe("show");
  });
});
