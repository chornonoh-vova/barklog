import { act, screen, userEvent, waitFor } from "@testing-library/react-native";
import { Stack } from "expo-router";
import RevenueCatUI from "react-native-purchases-ui";

import { ProfileToolbar } from "@/components/profile-toolbar";
import { MODAL_ORIENTATIONS } from "@/ui/modal-orientations";
import { me } from "@test/fixtures";
import { clerk } from "@test/mocks/native";
import { fakeEndpoints, renderRouterWithProviders } from "@test/render";
import { setWindow, TABLET } from "@test/window";

type BarButtonItem = { accessibilityLabel?: string; sfSymbolName?: string; onPress: () => void };

async function renderToolbar({ premium = false } = {}) {
  const api = fakeEndpoints({ getMe: async () => me({ premium }) });
  const result = await renderRouterWithProviders(
    { _layout: () => <Stack />, index: () => <ProfileToolbar /> },
    { api },
  );
  await waitFor(() => expect(api.getMe).toHaveBeenCalled());
  return result;
}

/** `Stack.Toolbar.Button`s become native bar button items, which have no view to query. */
function barButtons(): BarButtonItem[] {
  const [header] = screen.container.queryAll((node) => node.type === "RNSScreenStackHeaderConfig");
  return (header?.props.headerRightBarButtonItems ?? []) as BarButtonItem[];
}

function profileModal() {
  const [modal] = screen.container.queryAll((node) => node.type === "Modal");
  if (modal === undefined) throw new Error("the profile modal is not mounted");
  return modal;
}

const openAccount = () => screen.getByRole("button", { name: "Open account" });

describe("ProfileToolbar", () => {
  it("shows the signed-in user's avatar", async () => {
    await renderToolbar();

    const [avatar] = screen.container.queryAll(
      (node) => node.type === "ViewManagerAdapter_ExpoImage",
    );
    expect(openAccount()).toContainElement(avatar ?? null);
    expect(avatar?.props.source).toEqual([expect.objectContaining({ uri: clerk.imageUrl })]);
  });

  it("offers no subscription button to a free user", async () => {
    await renderToolbar();

    expect(barButtons()).toEqual([]);
  });

  it("opens the Customer Center from the star for a premium user", async () => {
    await renderToolbar({ premium: true });

    await waitFor(() => expect(barButtons()).toHaveLength(1));
    const [star] = barButtons() as [BarButtonItem];
    expect(star).toEqual(
      expect.objectContaining({
        sfSymbolName: "star.fill",
        accessibilityLabel: "Barklog Premium, manage subscription",
      }),
    );

    await act(async () => star.onPress());

    expect(RevenueCatUI.presentCustomerCenter).toHaveBeenCalledTimes(1);
  });

  it("mounts the profile only once the avatar is tapped", async () => {
    await renderToolbar();

    expect(screen.queryByTestId("clerk-user-profile")).not.toBeOnTheScreen();

    await userEvent.setup().press(openAccount());

    expect(screen.getByTestId("clerk-user-profile")).toBeOnTheScreen();
  });

  it("closes the profile when Clerk dismisses it", async () => {
    const user = userEvent.setup();
    await renderToolbar();
    await user.press(openAccount());

    await user.press(screen.getByTestId("clerk-user-profile"));

    expect(screen.queryByTestId("clerk-user-profile")).not.toBeOnTheScreen();
  });

  it("closes the profile on the system's close request", async () => {
    await renderToolbar();
    await userEvent.setup().press(openAccount());

    await act(async () => profileModal().props.onRequestClose());

    expect(screen.queryByTestId("clerk-user-profile")).not.toBeOnTheScreen();
  });

  it("covers a phone's window and rotates with it", async () => {
    await renderToolbar();
    await userEvent.setup().press(openAccount());

    expect(profileModal().props).toEqual(
      expect.objectContaining({
        presentationStyle: "fullScreen",
        supportedOrientations: MODAL_ORIENTATIONS,
      }),
    );
  });

  it("is a page sheet on a wide window", async () => {
    await setWindow(TABLET);
    await renderToolbar();
    await userEvent.setup().press(openAccount());

    expect(profileModal().props.presentationStyle).toBe("pageSheet");
  });
});
