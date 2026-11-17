import { accountRowText, premiumRow, versionLine } from "./profile-rows";

describe("accountRowText", () => {
  it("leads with the full name and describes what the row manages", () => {
    expect(
      accountRowText({
        fullName: "Ada Lovelace",
        primaryEmailAddress: "ada@x.io",
        imageUrl: null,
      }),
    ).toEqual({ title: "Ada Lovelace", subtitle: "Profile, email and security" });
  });

  it("falls back to the email when there is no name", () => {
    expect(
      accountRowText({
        fullName: null,
        primaryEmailAddress: "ada@x.io",
        imageUrl: null,
      }),
    ).toEqual({ title: "ada@x.io", subtitle: "Profile, email and security" });
  });

  it("treats a blank name as missing", () => {
    expect(
      accountRowText({
        fullName: "  ",
        primaryEmailAddress: "ada@x.io",
        imageUrl: null,
      }),
    ).toEqual({ title: "ada@x.io", subtitle: "Profile, email and security" });
  });

  it("falls back to a generic title with neither", () => {
    expect(
      accountRowText({
        fullName: null,
        primaryEmailAddress: null,
        imageUrl: null,
      }),
    ).toEqual({ title: "Account", subtitle: "Profile, email and security" });
  });
});

describe("premiumRow", () => {
  it("is hidden while entitlement is unknown", () => {
    expect(premiumRow(undefined)).toBeNull();
  });

  it("opens the customer center when premium", () => {
    expect(premiumRow(true)).toEqual({
      title: "Barklog Premium",
      status: "Active",
      icon: "star.fill",
      accessibilityLabel: "Barklog Premium, active",
      action: "customerCenter",
    });
  });

  it("opens the paywall when not premium", () => {
    expect(premiumRow(false)).toEqual({
      title: "Get Barklog Premium",
      status: null,
      icon: "star",
      accessibilityLabel: "Get Barklog Premium",
      action: "paywall",
    });
  });
});

describe("versionLine", () => {
  it("includes the build when known", () => {
    expect(versionLine("1.4.0", "123")).toBe("Version 1.4.0 (123)");
  });

  it("omits the build when unknown", () => {
    expect(versionLine("1.4.0", null)).toBe("Version 1.4.0");
  });
});
