import { screen, userEvent, waitFor, within } from "@testing-library/react-native";
import { openURL } from "expo-linking";
import { Stack } from "expo-router";
import * as StoreReview from "expo-store-review";
import RevenueCatUI from "react-native-purchases-ui";

import { ProfileScreen } from "@/features/profile/profile-screen";
import { useAccountActions, type AccountActions } from "@/features/profile/use-account-actions";
import { useSendFeedback } from "@/features/profile/use-send-feedback";
import type { Endpoints } from "@/lib/api/endpoints";
import { me } from "@test/fixtures";
import { clerk } from "@test/mocks/native";
import { fakeEndpoints, renderRouterWithProviders, renderWithProviders } from "@test/render";

jest.mock("@/features/profile/use-account-actions");
jest.mock("@/features/profile/use-send-feedback");
jest.mock("expo-linking", () => ({
  ...jest.requireActual<object>("expo-linking"),
  openURL: jest.fn(async () => true),
}));

const onOpenAccount = jest.fn();
const onOpenAbout = jest.fn();
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
  const result = await renderWithProviders(
    <ProfileScreen onOpenAccount={onOpenAccount} onOpenAbout={onOpenAbout} />,
    {
      api,
    },
  );
  await waitFor(() => expect(api.getMe).toHaveBeenCalled());
  return result;
}

/** With a stack around it, so the paywall push has somewhere to land. */
async function renderScreenInRouter({ premium = false }: { premium?: boolean } = {}) {
  const api = fakeEndpoints({ getMe: async () => me({ premium }) });
  const result = await renderRouterWithProviders(
    {
      _layout: () => <Stack />,
      index: () => <ProfileScreen onOpenAccount={onOpenAccount} onOpenAbout={onOpenAbout} />,
      paywall: () => null,
    },
    { api },
  );
  await waitFor(() => expect(api.getMe).toHaveBeenCalled());
  return result;
}

const button = (name: string | RegExp) => screen.getByRole("button", { name });

describe("account row", () => {
  it("shows the name with what the row manages and opens the account", async () => {
    const user = userEvent.setup();
    await renderScreen();

    expect(screen.getByText("Ada Lovelace")).toBeOnTheScreen();
    expect(screen.getByText("Profile, email and security")).toBeOnTheScreen();

    await user.press(button("Ada Lovelace, Profile, email and security"));

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

describe("Rate on the App Store", () => {
  it("opens the App Store review composer, not the system prompt", async () => {
    const user = userEvent.setup();
    await renderScreen();

    await user.press(button("Rate on the App Store"));

    expect(openURL).toHaveBeenCalledWith(
      "https://apps.apple.com/app/barklog/id6807319879?action=write-review",
    );
    expect(StoreReview.requestReview).not.toHaveBeenCalled();
  });

  it("is left out when the build has no App Store URL", async () => {
    jest.mocked(StoreReview.storeUrl).mockReturnValue(null);
    await renderScreen();

    expect(screen.queryByRole("button", { name: "Rate on the App Store" })).toBeNull();
  });

  it("sits between the account group and Sign Out", async () => {
    await renderScreen();

    const order = screen.getAllByRole("button").map((b) => b.props.accessibilityLabel);
    expect(order.indexOf("Rate on the App Store")).toBeGreaterThan(
      order.indexOf("Get Barklog Premium"),
    );
    expect(order.indexOf("Rate on the App Store")).toBeLessThan(order.indexOf("Sign Out"));
  });
});

describe("Barklog section", () => {
  it("names the section and explains the feedback row in its footer", async () => {
    await renderScreen();

    expect(screen.getByRole("header", { name: "Barklog" })).toBeOnTheScreen();
    expect(
      screen.getByText("Suggest a feature or report a problem. I read every message."),
    ).toBeOnTheScreen();
  });
});

describe("Sign Out and Delete Account", () => {
  it("draws Sign Out on a grey tile and Delete Account as destructive, after it", async () => {
    await renderScreen();

    const signOut = button("Sign Out");
    const del = button("Delete Account");
    expect(within(signOut).getByTestId("symbol-rectangle.portrait.and.arrow.right")).toBeTruthy();
    expect(signOut.props.accessibilityHint).toBeUndefined();
    expect(within(del).getByTestId("symbol-trash.fill")).toBeTruthy();
    expect(del.props.accessibilityHint).toBe("destructive");

    const order = screen.getAllByRole("button").map((b) => b.props.accessibilityLabel);
    expect(order.indexOf("Delete Account")).toBeGreaterThan(order.indexOf("Sign Out"));
  });

  it("hands the presses to the account actions", async () => {
    const user = userEvent.setup();
    await renderScreen();

    await user.press(button("Sign Out"));
    await user.press(button("Delete Account"));

    expect(actions.signOut).toHaveBeenCalledTimes(1);
    expect(actions.deleteAccount).toHaveBeenCalledTimes(1);
  });

  it("disables Sign Out and Delete Account and shows progress while deleting", async () => {
    actions.isDeleting = true;
    await renderScreen();

    const del = button("Delete Account, deleting");
    expect(del).toBeDisabled();
    expect(within(del).getByRole("progressbar")).toBeOnTheScreen();
    expect(button("Sign Out")).toBeDisabled();
  });

  it("announces deleting to VoiceOver only while it runs", async () => {
    await renderScreen();

    expect(screen.queryByRole("button", { name: "Delete Account, deleting" })).toBeNull();
    expect(button("Delete Account")).toBeTruthy();
  });
});

describe("Send Feedback", () => {
  it("sends feedback from the row after Rate on the App Store", async () => {
    const sendFeedback = jest.fn();
    jest.mocked(useSendFeedback).mockReturnValue(sendFeedback);
    const user = userEvent.setup();
    await renderScreen();

    const row = button("Send Feedback");
    expect(within(row).getByTestId("symbol-paperplane.fill")).toBeTruthy();
    await user.press(row);
    expect(sendFeedback).toHaveBeenCalledTimes(1);

    const order = screen.getAllByRole("button").map((b) => b.props.accessibilityLabel);
    const feedback = order.indexOf("Send Feedback");
    expect(feedback).toBe(order.indexOf("Rate on the App Store") + 1);
    expect(feedback).toBeLessThan(order.indexOf("About"));
  });
});

describe("About", () => {
  it("opens the About screen, after Send Feedback and before Sign Out", async () => {
    const user = userEvent.setup();
    await renderScreen();

    await user.press(button("About"));
    expect(onOpenAbout).toHaveBeenCalledTimes(1);

    const order = screen.getAllByRole("button").map((b) => b.props.accessibilityLabel);
    expect(order.indexOf("About")).toBe(order.indexOf("Send Feedback") + 1);
    expect(order.indexOf("About")).toBeLessThan(order.indexOf("Sign Out"));
  });
});
