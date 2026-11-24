import type { QueryClient } from "@tanstack/react-query";
import { act, screen, userEvent, waitFor, within } from "@testing-library/react-native";
import { openURL } from "expo-linking";
import { Stack } from "expo-router";
import * as StoreReview from "expo-store-review";
import RevenueCatUI from "react-native-purchases-ui";

import { ProfileScreen } from "@/features/profile/profile-screen";
import { useAccountActions, type AccountActions } from "@/features/profile/use-account-actions";
import { useSendFeedback } from "@/features/profile/use-send-feedback";
import type { Endpoints } from "@/lib/api/endpoints";
import { keys } from "@/lib/api/keys";
import { backlogItem, backlogList, me } from "@test/fixtures";
import { clerk } from "@test/mocks/native";
import {
  fakeEndpoints,
  renderRouterWithProviders,
  renderWithProviders,
  testQueryClient,
} from "@test/render";
import { setWindow, TABLET } from "@test/window";

jest.mock("@/features/profile/use-account-actions");
jest.mock("@/features/profile/use-send-feedback");
jest.mock("expo-linking", () => ({
  ...jest.requireActual<object>("expo-linking"),
  openURL: jest.fn(async () => true),
}));

const onOpenAccount = jest.fn();
const onOpenAbout = jest.fn();
const onOpenStatus = jest.fn();
const onFindGames = jest.fn();

function Profile() {
  return (
    <ProfileScreen
      onOpenAccount={onOpenAccount}
      onOpenAbout={onOpenAbout}
      onOpenStatus={onOpenStatus}
      onFindGames={onFindGames}
    />
  );
}
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
  listBacklog = async () => backlogList(),
  queryClient,
}: {
  premium?: boolean;
  getMe?: Endpoints["getMe"];
  listBacklog?: Endpoints["listBacklog"];
  queryClient?: QueryClient;
} = {}) {
  const api = fakeEndpoints({ getMe, listBacklog });
  const result = await renderWithProviders(<Profile />, { api, queryClient });
  await waitFor(() => expect(api.getMe).toHaveBeenCalled());
  return result;
}

/** With a stack around it, so the paywall push has somewhere to land. */
async function renderScreenInRouter({ premium = false }: { premium?: boolean } = {}) {
  const api = fakeEndpoints({ getMe: async () => me({ premium }) });
  const result = await renderRouterWithProviders(
    {
      _layout: () => <Stack />,
      index: () => <Profile />,
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

describe("Stats", () => {
  const backlog = backlogList(
    backlogItem(1, "waiting", { rating: 8 }),
    backlogItem(2, "waiting"),
    backlogItem(3, "playing", { rating: 6 }),
  );

  it("shows the total and a count per status, zero counts included", async () => {
    await renderScreen({ listBacklog: async () => backlog });

    expect(await screen.findByRole("header", { name: "Stats · 3 games" })).toBeOnTheScreen();
    expect(button("Waiting, 2 games")).toBeOnTheScreen();
    expect(button("Playing, 1 game")).toBeOnTheScreen();
    expect(button("Completed, 0 games")).toBeOnTheScreen();
    expect(button("Abandoned, 0 games")).toBeOnTheScreen();
  });

  it("opens the tapped status", async () => {
    const user = userEvent.setup();
    await renderScreen({ listBacklog: async () => backlog });

    await user.press(await screen.findByRole("button", { name: "Playing, 1 game" }));

    expect(onOpenStatus).toHaveBeenCalledWith("playing");
  });

  it("shows the average rating as a label, not a button", async () => {
    await renderScreen({ listBacklog: async () => backlog });

    expect(
      await screen.findByLabelText("My average rating 7.0 out of 10, from 2 rated games"),
    ).toBeOnTheScreen();
    expect(screen.getByText("7.0")).toBeOnTheScreen();
    expect(screen.getByText("from 2 rated games")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /average rating/i })).not.toBeOnTheScreen();
  });

  it("sets the average rating apart in its own group", async () => {
    await renderScreen({ listBacklog: async () => backlog });

    const average = await screen.findByLabelText(/^My average rating/);
    const statusGroup = screen.getByRole("header", { name: "Stats · 3 games" }).parent!;
    expect(within(statusGroup).getByRole("button", { name: "Waiting, 2 games" })).toBeOnTheScreen();
    expect(within(statusGroup).queryByLabelText(/^My average rating/)).not.toBeOnTheScreen();
    expect(average).toBeOnTheScreen();
  });

  it("has no average rating when nothing is rated", async () => {
    await renderScreen({ listBacklog: async () => backlogList(backlogItem(1, "waiting")) });

    await screen.findByRole("button", { name: "Waiting, 1 game" });
    expect(screen.queryByLabelText(/average rating/i)).not.toBeOnTheScreen();
  });

  it("offers to find games for an empty backlog", async () => {
    const user = userEvent.setup();
    await renderScreen();

    const row = await screen.findByRole("button", { name: "Find games to add" });
    expect(
      screen.getByText("Your stats show up here once your backlog has games."),
    ).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /^Waiting/ })).not.toBeOnTheScreen();

    await user.press(row);

    expect(onFindGames).toHaveBeenCalledTimes(1);
  });

  it("is absent while the backlog loads", async () => {
    await renderScreen({ listBacklog: () => new Promise(() => {}) });

    expect(screen.queryByRole("header", { name: /^Stats/ })).not.toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Find games to add" })).not.toBeOnTheScreen();
  });

  it("is absent when the backlog fails with nothing cached", async () => {
    const listBacklog = jest.fn(async () => {
      throw new Error("offline");
    });
    await renderScreen({ listBacklog });
    await waitFor(() => expect(listBacklog).toHaveBeenCalled());

    expect(screen.queryByRole("header", { name: /^Stats/ })).not.toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Find games to add" })).not.toBeOnTheScreen();
  });

  it("keeps showing a cached backlog when a refetch fails", async () => {
    const queryClient = testQueryClient();
    queryClient.setQueryData(keys.backlog.list(), backlog);
    const listBacklog = jest.fn(async () => {
      throw new Error("offline");
    });
    await renderScreen({ listBacklog, queryClient });

    await act(() => queryClient.refetchQueries({ queryKey: keys.backlog.list() }));

    expect(listBacklog).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Waiting, 2 games" })).toBeOnTheScreen();
  });

  it("switches to the call to action when the backlog empties", async () => {
    const queryClient = testQueryClient();
    const listBacklog = jest
      .fn<ReturnType<Endpoints["listBacklog"]>, []>()
      .mockResolvedValueOnce(backlogList(backlogItem(1, "waiting")))
      .mockResolvedValue(backlogList());
    await renderScreen({ listBacklog, queryClient });
    await screen.findByRole("button", { name: "Waiting, 1 game" });

    await act(() => queryClient.invalidateQueries({ queryKey: keys.backlog.all }));

    expect(await screen.findByRole("button", { name: "Find games to add" })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /^Waiting/ })).not.toBeOnTheScreen();
  });

  it("sits between the account group and the Barklog section", async () => {
    await renderScreen({ listBacklog: async () => backlog });
    await screen.findByRole("header", { name: /^Stats/ });

    const headers = screen.getAllByRole("header").map((header) => header.props.children);
    expect(headers.indexOf("Stats · 3 games")).toBeLessThan(headers.indexOf("Barklog"));
    expect(screen.getByRole("button", { name: "Get Barklog Premium" })).toBeOnTheScreen();
  });
});

describe("wide window", () => {
  it("lays the sections out as cards in one scroll view instead of a list", async () => {
    await setWindow(TABLET);
    await renderScreen();

    expect(screen.getByTestId("swiftui-ScrollView")).toBeOnTheScreen();
    expect(screen.queryByTestId("swiftui-Form")).toBeNull();
    expect(screen.queryByTestId("swiftui-section")).toBeNull();
    // Lines the account card up with the titled Barklog card opposite.
    expect(screen.getByText("Account")).toBeOnTheScreen();
    for (const name of [
      "Ada Lovelace, Profile, email and security",
      "Sign Out",
      "Delete Account",
    ]) {
      expect(button(name)).toBeOnTheScreen();
    }
  });

  it("keeps the native list on a phone", async () => {
    await renderScreen();

    expect(screen.getByTestId("swiftui-Form")).toBeOnTheScreen();
    expect(screen.queryByTestId("swiftui-ScrollView")).toBeNull();
    expect(screen.queryByText("Account")).toBeNull();
  });
});
