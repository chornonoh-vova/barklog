import RegisteredWidget from "@/features/widgets/backlog-widget";
import type { WidgetSnapshot } from "@/features/widgets/snapshot";

/** What `createWidget` was handed, as the suite's expo-widgets fake keeps it. */
const BacklogWidget = RegisteredWidget as unknown as {
  name: string;
  View: unknown;
  initial: WidgetSnapshot;
};

// Only the registration is testable here. The `'widget'` directive compiles
// the view into a source string for the widget extension's own runtime, so
// Jest cannot render it. What it draws comes from `deriveSnapshot` and the
// links, which `snapshot.test.ts` and `links.test.ts` cover; the drawing
// itself is checked on device (docs/mobile-device-verification.md, "Home
// Screen widget").
describe("BacklogWidget", () => {
  it("registers under the name the widget extension knows", () => {
    expect(BacklogWidget.name).toBe("BacklogWidget");
  });

  it("starts signed out, asking the user to open the app", () => {
    expect(BacklogWidget.initial).toMatchObject({
      signedIn: false,
      message: "Open Barklog to see your backlog.",
      appUrl: "barklog://widget/home",
    });
    for (const section of Object.values(BacklogWidget.initial.sections)) {
      expect(section.games).toEqual([]);
    }
  });
});
