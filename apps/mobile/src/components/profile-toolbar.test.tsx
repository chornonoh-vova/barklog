import { act, screen, userEvent, waitFor } from "@testing-library/react-native";
import { Stack } from "expo-router";
import RevenueCatUI from "react-native-purchases-ui";

import { ProfileToolbar } from "@/components/profile-toolbar";
import { MODAL_ORIENTATIONS } from "@/ui/modal-orientations";
import { me } from "@test/fixtures";
import { fakeEndpoints, renderRouterWithProviders } from "@test/render";
import { setWindow, TABLET } from "@test/window";
import {
  nativeView,
  navigationBarItem,
  navigationBars,
  pressHeaderButton,
  type BarItem,
} from "@test/queries";

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
const barButtons = (): BarItem[] => navigationBars()[0]?.items ?? [];

function profileModal() {
  return nativeView("Modal");
}

const openAccount = () => act(async () => pressHeaderButton("Open account"));

describe("ProfileToolbar", () => {
  it("opens the account from a bar button, which iPhone Duo can put in its rail", async () => {
    await renderToolbar();

    expect(barButtons()).toEqual([
      expect.objectContaining({
        sfSymbolName: "person.crop.circle",
        accessibilityLabel: "Open account",
      }),
    ]);
  });

  it("offers no subscription button to a free user", async () => {
    await renderToolbar();

    expect(barButtons().map((item) => item.sfSymbolName)).toEqual(["person.crop.circle"]);
  });

  it("opens the Customer Center from the star for a premium user", async () => {
    await renderToolbar({ premium: true });

    const label = "Barklog Premium, manage subscription";
    await waitFor(() => expect(navigationBarItem(label)).toBeDefined());
    expect(navigationBarItem(label)?.sfSymbolName).toBe("star.fill");

    await act(async () => pressHeaderButton(label));

    expect(RevenueCatUI.presentCustomerCenter).toHaveBeenCalledTimes(1);
  });

  it("mounts the profile only once the account button is pressed", async () => {
    await renderToolbar();

    expect(screen.queryByTestId("clerk-user-profile")).not.toBeOnTheScreen();

    await openAccount();

    expect(screen.getByTestId("clerk-user-profile")).toBeOnTheScreen();
  });

  it("closes the profile when Clerk dismisses it", async () => {
    const user = userEvent.setup();
    await renderToolbar();
    await openAccount();

    await user.press(screen.getByTestId("clerk-user-profile"));

    expect(screen.queryByTestId("clerk-user-profile")).not.toBeOnTheScreen();
  });

  it("closes the profile on the system's close request", async () => {
    await renderToolbar();
    await openAccount();

    await act(async () => profileModal().props.onRequestClose());

    expect(screen.queryByTestId("clerk-user-profile")).not.toBeOnTheScreen();
  });

  it("covers a phone's window and rotates with it", async () => {
    await renderToolbar();
    await openAccount();

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
    await openAccount();

    expect(profileModal().props.presentationStyle).toBe("pageSheet");
  });
});
