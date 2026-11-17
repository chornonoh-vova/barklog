import { feedbackBody, feedbackMailto, type DebugInfo } from "./feedback";

const info: DebugInfo = {
  version: "1.4.0",
  build: "123",
  updateId: "0f1e-embedded",
  isEmbeddedLaunch: true,
  channel: "production",
  osVersion: "27.2",
  isPad: false,
  language: "uk",
  userId: "user_1",
  premium: true,
};

describe("feedbackBody", () => {
  it("leaves room on top for the message, then lists the details", () => {
    expect(feedbackBody(info)).toBe(
      [
        "",
        "",
        "",
        "—",
        "The details below help me look into your request. Remove anything you'd rather not share.",
        "App: Barklog 1.4.0 (123)",
        "Update: embedded, 0f1e-embedded (production)",
        "Device: iPhone, iOS 27.2",
        "Language: uk",
        "Account: user_1",
        "Premium: yes",
      ].join("\n"),
    );
  });

  it("says when no update system is running, as in development", () => {
    expect(feedbackBody({ ...info, updateId: null, channel: null })).toContain(
      "Update: none (development)\n",
    );
  });

  it("names an over-the-air update, an iPad and unknown values", () => {
    const body = feedbackBody({
      ...info,
      version: null,
      build: null,
      updateId: "abc-123",
      isEmbeddedLaunch: false,
      channel: null,
      isPad: true,
      userId: null,
      premium: undefined,
    });

    expect(body).toContain("App: Barklog unknown\n");
    expect(body).toContain("Update: abc-123\n");
    expect(body).toContain("Device: iPad, iOS 27.2");
    expect(body).toContain("Account: signed out");
    expect(body).toContain("Premium: unknown");
  });
});

describe("feedbackMailto", () => {
  it("addresses the feedback inbox with the subject and an encoded body", () => {
    const url = feedbackMailto("Hi there\n—\nApp: Barklog 1.4.0 (123)");

    expect(url).toBe(
      "mailto:chernonog.vova%2Bbarklog@gmail.com?subject=Feedback%20About%20Barklog" +
        "&body=Hi%20there%0D%0A%E2%80%94%0D%0AApp%3A%20Barklog%201.4.0%20%28123%29",
    );
  });
});
