import { screen, userEvent, waitFor, within } from "@testing-library/react-native";
import { Stack } from "expo-router";
import RevenueCatUI from "react-native-purchases-ui";

import { ProfileScreen } from "@/features/profile/profile-screen";
import { useAccountActions, type AccountActions } from "@/features/profile/use-account-actions";
import type { Endpoints } from "@/lib/api/endpoints";
import { me } from "@test/fixtures";
import { clerk } from "@test/mocks/native";
import { fakeEndpoints, renderRouterWithProviders, renderWithProviders } from "@test/render";

jest.mock("@/features/profile/use-account-actions");
// jest-expo's Constants carry no app version; the footer reads the binary's.
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { version: "1.4.0" }, platform: { ios: { buildNumber: "123" } } },
}));

const onOpenAccount = jest.fn();
let actions: AccountActions;

beforeEach(() => {
  actions = { signOut: jest.fn(), deleteAccount: jest.fn(), isDeleting: false };
  jest.mocked(useAccountActions).mockImplementation(() => actions);
  clerk.user = {
    fullName: "Ada Lovelace",
    primaryEmailAddress: { emailAddress: "ada@x.io" },
    imageUrl: "https://img.example/ada.png",
    delete: jest.fn(async () => {}),
  };
});

async function renderScreen({
  premium = false,
  getMe = async () => me({ premium }),
}: { premium?: boolean; getMe?: Endpoints["getMe"] } = {}) {
  const api = fakeEndpoints({ getMe });
  const result = await renderWithProviders(<ProfileScreen onOpenAccount={onOpenAccount} />, {
    api,
  });
  await waitFor(() => expect(api.getMe).toHaveBeenCalled());
  return result;
}

/** With a stack around it, so the paywall push has somewhere to land. */
async function renderScreenInRouter({ premium = false }: { premium?: boolean } = {}) {
  const api = fakeEndpoints({ getMe: async () => me({ premium }) });
  const result = await renderRouterWithProviders(
    {
      _layout: () => <Stack />,
      index: () => <ProfileScreen onOpenAccount={onOpenAccount} />,
      paywall: () => null,
    },
    { api },
  );
  await waitFor(() => expect(api.getMe).toHaveBeenCalled());
  return result;
}

const button = (name: string | RegExp) => screen.getByRole("button", { name });

describe("account row", () => {
  it("shows the name and email and opens the account", async () => {
    const user = userEvent.setup();
    await renderScreen();

    expect(screen.getByText("Ada Lovelace")).toBeOnTheScreen();
    expect(screen.getByText("ada@x.io")).toBeOnTheScreen();

    await user.press(button("Ada Lovelace, ada@x.io"));

    expect(onOpenAccount).toHaveBeenCalledTimes(1);
  });

  it("hands account opening to the actions as the reverification fallback", async () => {
    await renderScreen();

    expect(useAccountActions).toHaveBeenCalledWith({ onReverificationRequired: onOpenAccount });
  });

  it("shows the avatar image when Clerk has one", async () => {
    await renderScreen();

    expect(screen.getByTestId("account-avatar-image")).toBeOnTheScreen();
    expect(screen.queryByTestId("symbol-person.crop.circle.fill")).not.toBeOnTheScreen();
  });

  it("falls back to the person symbol without an image", async () => {
    clerk.user = { ...clerk.user!, imageUrl: "" };
    await renderScreen();

    expect(screen.getByTestId("symbol-person.crop.circle.fill")).toBeOnTheScreen();
    expect(screen.queryByTestId("account-avatar-image")).not.toBeOnTheScreen();
  });
});

describe("Premium row", () => {
  it("offers Premium to a free user with an outline star that opens the paywall", async () => {
    const user = userEvent.setup();
    await renderScreenInRouter();

    const row = await screen.findByRole("button", { name: "Get Barklog Premium" });
    expect(within(row).getByTestId("symbol-star")).toBeOnTheScreen();

    await user.press(row);

    expect(screen).toHavePathname("/paywall");
    expect(RevenueCatUI.presentCustomerCenter).not.toHaveBeenCalled();
  });

  it("shows an active subscription that opens the Customer Center", async () => {
    const user = userEvent.setup();
    await renderScreen({ premium: true });

    const row = await screen.findByRole("button", { name: "Barklog Premium, active" });
    expect(within(row).getByTestId("symbol-star.fill")).toBeOnTheScreen();
    expect(within(row).getByText("Barklog Premium")).toBeOnTheScreen();
    expect(within(row).getByText("Active")).toBeOnTheScreen();

    await user.press(row);

    expect(RevenueCatUI.presentCustomerCenter).toHaveBeenCalledTimes(1);
  });

  it("is hidden until the entitlement is known", async () => {
    await renderScreen({ getMe: () => new Promise(() => {}) });

    expect(screen.queryByText(/Barklog Premium/)).not.toBeOnTheScreen();
  });
});

describe("Sign Out and Delete Account", () => {
  it("draws Sign Out in the normal tint and Delete Account as destructive, after it", async () => {
    await renderScreen();

    const signOut = button("Sign Out");
    const del = button("Delete Account");
    expect(within(signOut).getByTestId("symbol-rectangle.portrait.and.arrow.right")).toBeTruthy();
    expect(signOut.props.accessibilityHint).toBeUndefined();
    expect(within(del).getByTestId("symbol-trash")).toBeTruthy();
    expect(del.props.accessibilityHint).toBe("destructive");

    const order = screen.getAllByRole("button").map((b) => b.props.accessibilityLabel);
    expect(order.indexOf("Delete Account")).toBeGreaterThan(order.indexOf("Sign Out"));
  });

  it("hands the presses to the account actions", async () => {
    const user = userEvent.setup();
    await renderScreen();

    await user.press(button("Sign Out"));
    await user.press(button("Delete Account"));

    expect(actions.signOut).toHaveBeenCalledWith(null);
    expect(actions.deleteAccount).toHaveBeenCalledTimes(1);
  });

  it("disables Delete Account and shows progress while deleting", async () => {
    actions.isDeleting = true;
    await renderScreen();

    const del = button("Delete Account");
    expect(del).toBeDisabled();
    expect(within(del).getByRole("progressbar")).toBeOnTheScreen();
    expect(button("Sign Out")).not.toBeDisabled();
  });

  it("closes with the version footer", async () => {
    await renderScreen();

    expect(screen.getByText(/^Barklog \d/)).toHaveTextContent("Barklog 1.4.0 (123)");
  });
});
