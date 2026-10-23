import { screen } from "@testing-library/react-native";
import * as SplashScreen from "expo-splash-screen";
import { Text } from "react-native";

import { clearRecents } from "@/features/search/recents-storage";
import { clearWidget } from "@/features/widgets/sync";
import { keys } from "@/lib/api/keys";
import { AuthGate } from "@/lib/auth/auth-gate";
import { clearPersistedCaches, startPersistence } from "@/lib/query/query-persist";
import { backlogList } from "@test/fixtures";
import { clerk } from "@test/mocks/native";
import { renderWithProviders, testQueryClient } from "@test/render";

jest.mock("@/lib/query/query-persist", () => ({
  startPersistence: jest.fn(),
  clearPersistedCaches: jest.fn(async () => undefined),
}));
jest.mock("@/features/search/recents-storage", () => ({ clearRecents: jest.fn() }));
jest.mock("@/features/widgets/sync", () => ({ clearWidget: jest.fn() }));
jest.mock("expo-splash-screen", () => ({
  preventAutoHideAsync: jest.fn(async () => true),
  hideAsync: jest.fn(async () => true),
}));

const stops: Record<string, jest.Mock> = {};

beforeEach(() => {
  for (const key of Object.keys(stops)) delete stops[key];
  jest.mocked(startPersistence).mockImplementation((_client, userId) => {
    stops[userId] = jest.fn();
    return stops[userId];
  });
});

const gate = () => (
  <AuthGate>
    <Text>Signed in</Text>
  </AuthGate>
);

/** A client holding a cached backlog, so a test can see whether it was cleared. */
function cachedClient() {
  const queryClient = testQueryClient();
  queryClient.setQueryData(keys.backlog.list(), backlogList());
  return queryClient;
}

const deviceDataCleared = () => jest.mocked(clearRecents).mock.calls.length > 0;

describe("AuthGate", () => {
  it("renders nothing, and keeps the splash up, until Clerk has loaded", async () => {
    clerk.isLoaded = false;
    await renderWithProviders(gate());

    expect(screen.toJSON()).toBeNull();
    expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
    expect(startPersistence).not.toHaveBeenCalled();
    expect(deviceDataCleared()).toBe(false);
  });

  it("shows Clerk's sign-in until the auth flow completes", async () => {
    clerk.isAuthFlowComplete = false;
    clerk.userId = null;
    await renderWithProviders(gate());

    expect(screen.getByTestId("clerk-auth-view")).toBeOnTheScreen();
    expect(screen.queryByText("Signed in")).not.toBeOnTheScreen();
  });

  it("shows the app once signed in, and releases the splash", async () => {
    await renderWithProviders(gate());

    expect(screen.getByText("Signed in")).toBeOnTheScreen();
    expect(screen.queryByTestId("clerk-auth-view")).not.toBeOnTheScreen();
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
  });

  it("releases the splash once Clerk loads", async () => {
    clerk.isLoaded = false;
    const { rerender } = await renderWithProviders(gate());

    clerk.isLoaded = true;
    await rerender(gate());

    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Signed in")).toBeOnTheScreen();
  });

  it("starts persisting a signed-in user's cache, and leaves their data alone", async () => {
    const queryClient = cachedClient();
    await renderWithProviders(gate(), { queryClient });

    expect(startPersistence).toHaveBeenCalledWith(queryClient, "user_1");
    expect(deviceDataCleared()).toBe(false);
    expect(queryClient.getQueryData(keys.backlog.list())).toEqual(backlogList());
  });

  it("does not persist anything while signed out", async () => {
    clerk.userId = null;
    clerk.isAuthFlowComplete = false;
    await renderWithProviders(gate());

    expect(startPersistence).not.toHaveBeenCalled();
  });

  it("clears the last account's data on an account switch", async () => {
    const queryClient = cachedClient();
    const { rerender } = await renderWithProviders(gate(), { queryClient });

    clerk.userId = "user_2";
    await rerender(gate());

    expect(queryClient.getQueryData(keys.backlog.list())).toBeUndefined();
    expect(clearRecents).toHaveBeenCalledTimes(1);
    expect(clearPersistedCaches).toHaveBeenCalledWith("user_2");
    expect(clearWidget).toHaveBeenCalledTimes(1);
    expect(stops.user_1).toHaveBeenCalledTimes(1);
    expect(startPersistence).toHaveBeenLastCalledWith(queryClient, "user_2");
  });

  it("clears everything on sign-out and stops persisting", async () => {
    const queryClient = cachedClient();
    const { rerender } = await renderWithProviders(gate(), { queryClient });

    clerk.userId = null;
    clerk.isAuthFlowComplete = false;
    await rerender(gate());

    expect(queryClient.getQueryData(keys.backlog.list())).toBeUndefined();
    expect(clearRecents).toHaveBeenCalledTimes(1);
    expect(clearPersistedCaches).toHaveBeenCalledWith(null);
    expect(clearWidget).toHaveBeenCalledTimes(1);
    expect(stops.user_1).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("clerk-auth-view")).toBeOnTheScreen();
  });

  it("clears the device's data on a signed-out cold start", async () => {
    clerk.userId = null;
    clerk.isAuthFlowComplete = false;
    const queryClient = cachedClient();
    await renderWithProviders(gate(), { queryClient });

    expect(clearRecents).toHaveBeenCalledTimes(1);
    expect(clearPersistedCaches).toHaveBeenCalledWith(null);
    expect(clearWidget).toHaveBeenCalledTimes(1);
    // Nothing in memory belongs to anyone yet.
    expect(queryClient.getQueryData(keys.backlog.list())).toEqual(backlogList());
  });

  it("treats an unresolved user as unknown, not as a switch", async () => {
    const queryClient = cachedClient();
    const { rerender } = await renderWithProviders(gate(), { queryClient });

    clerk.userId = undefined;
    await rerender(gate());
    clerk.userId = "user_1";
    await rerender(gate());

    expect(deviceDataCleared()).toBe(false);
    expect(queryClient.getQueryData(keys.backlog.list())).toEqual(backlogList());
  });

  it("does not clear on a re-render with the same user", async () => {
    const queryClient = cachedClient();
    const { rerender } = await renderWithProviders(gate(), { queryClient });

    await rerender(gate());

    expect(deviceDataCleared()).toBe(false);
    expect(startPersistence).toHaveBeenCalledTimes(1);
  });
});
