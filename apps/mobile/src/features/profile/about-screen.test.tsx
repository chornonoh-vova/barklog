import { screen, userEvent } from "@testing-library/react-native";
import { openURL } from "expo-linking";

import { AboutScreen } from "@/features/profile/about-screen";
import { renderWithProviders } from "@test/render";

jest.mock("expo-linking", () => ({
  ...jest.requireActual<object>("expo-linking"),
  openURL: jest.fn(async () => true),
}));
jest.mock("expo-application", () => ({
  nativeApplicationVersion: "1.4.0",
  nativeBuildVersion: "123",
}));

describe("AboutScreen", () => {
  it("names the app and the installed version", async () => {
    await renderWithProviders(<AboutScreen />);

    expect(screen.getByText("Barklog")).toBeOnTheScreen();
    expect(screen.getByText("Version 1.4.0 (123)")).toBeOnTheScreen();
  });

  it("closes with where it is made", async () => {
    await renderWithProviders(<AboutScreen />);

    expect(screen.getByText("Designed and developed in Ukraine 🇺🇦")).toBeOnTheScreen();
  });

  it.each([
    ["Privacy Policy", "https://barklog.gg/privacy"],
    ["Terms of Use", "https://barklog.gg/terms"],
    ["Support", "https://barklog.gg/support"],
    ["Game data by IGDB", "https://www.igdb.com"],
    ["Source code", "https://github.com/chornonoh-vova/barklog"],
    ["Created by Volodymyr Chornonoh", "https://chornonoh-vova.com"],
  ])("opens %s outside the app", async (name, url) => {
    const user = userEvent.setup();
    await renderWithProviders(<AboutScreen />);

    await user.press(screen.getByRole("button", { name }));

    expect(openURL).toHaveBeenCalledWith(url);
  });
});
