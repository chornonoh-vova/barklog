import AsyncStorage from "@react-native-async-storage/async-storage";
import { screen, userEvent } from "@testing-library/react-native";

import { clerk } from "@test/mocks/native";
import { setWindow, TABLET } from "@test/window";

import { fakeServer, markOnboardingSeen, renderApp } from "./app";

// `useColorScheme` reads Appearance through a direct import, which a spy on
// the `Appearance` object never reaches; a test picks the scheme here instead.
let mockColorScheme: "light" | "dark" = "light";
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: () => mockColorScheme,
}));

beforeEach(async () => {
  mockColorScheme = "light";
  await AsyncStorage.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("root layout", () => {
  it("shows onboarding on a first launch, signed out", async () => {
    clerk.userId = null;
    clerk.isAuthFlowComplete = false;
    fakeServer();
    await renderApp("/");

    expect(await screen.findByText("Welcome to Barklog")).toBeOnTheScreen();
    expect(screen.queryByTestId("clerk-auth-view")).not.toBeOnTheScreen();
  });

  it("goes from onboarding to Clerk's sign-in, and remembers onboarding was seen", async () => {
    clerk.userId = null;
    clerk.isAuthFlowComplete = false;
    fakeServer();
    await renderApp("/");

    await userEvent.setup().press(await screen.findByRole("button", { name: "Skip" }));

    expect(await screen.findByTestId("clerk-auth-view")).toBeOnTheScreen();
    expect(await AsyncStorage.getItem("barklog.onboarding.seen")).not.toBeNull();
  });

  it("skips onboarding once it has been seen", async () => {
    await markOnboardingSeen();
    fakeServer();
    await renderApp("/");

    expect(await screen.findByText("Your backlog is empty")).toBeOnTheScreen();
    expect(screen.queryByText("Welcome to Barklog")).not.toBeOnTheScreen();
  });

  it("shows Clerk's sign-in to a returning user who is signed out", async () => {
    await markOnboardingSeen();
    clerk.userId = null;
    clerk.isAuthFlowComplete = false;
    fakeServer();
    await renderApp("/");

    expect(await screen.findByTestId("clerk-auth-view")).toBeOnTheScreen();
    expect(screen.queryByText("Your backlog is empty")).not.toBeOnTheScreen();
  });

  it("skips onboarding for a signed-in reinstall", async () => {
    fakeServer();
    await renderApp("/");

    expect(await screen.findByText("Your backlog is empty")).toBeOnTheScreen();
  });

  it("renders the tabs on a wide window too", async () => {
    await setWindow(TABLET);
    await markOnboardingSeen();
    fakeServer();
    await renderApp("/");

    expect(await screen.findByText("Your backlog is empty")).toBeOnTheScreen();
  });

  it("renders in dark mode", async () => {
    mockColorScheme = "dark";
    await markOnboardingSeen();
    fakeServer();
    await renderApp("/");

    expect(await screen.findByText("Your backlog is empty")).toBeOnTheScreen();
  });
});
