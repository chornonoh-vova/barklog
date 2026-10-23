import { screen, userEvent, waitFor } from "@testing-library/react-native";
import { testRouter } from "expo-router/testing-library";

import { me } from "@test/fixtures";

import { fakeServer, markOnboardingSeen, renderApp, requests } from "./app";

beforeEach(() => markOnboardingSeen());

/** Home first, then the sheet over it, the way every route into it goes. */
async function openPaywall() {
  const fetchMock = fakeServer({ "POST /api/subscription/refresh": me({ premium: true }) });
  await renderApp("/");
  await screen.findByText("Your backlog is empty");
  await testRouter.push("/paywall");
  return fetchMock;
}

describe("/paywall", () => {
  it("presents RevenueCat's paywall over the tabs", async () => {
    await openPaywall();

    expect(screen.getByTestId("revenuecat-paywall")).toBeOnTheScreen();
    expect(screen).toHaveSegments(["paywall"]);
  });

  it.each(["Purchase", "Restore"])(
    "asks the server to re-read the subscription after %s, then goes back",
    async (button) => {
      const fetchMock = await openPaywall();

      await userEvent.setup().press(screen.getByRole("button", { name: button }));

      expect(screen).toHavePathname("/");
      await waitFor(() => expect(requests(fetchMock)).toContain("POST /api/subscription/refresh"));
      // `/me` is fetched again once the server has re-read it.
      await waitFor(() =>
        expect(requests(fetchMock).filter((r) => r === "GET /api/me").length).toBeGreaterThan(1),
      );
    },
  );

  it("goes back without a refresh when dismissed", async () => {
    const fetchMock = await openPaywall();

    await userEvent.setup().press(screen.getByRole("button", { name: "Dismiss" }));

    expect(screen).toHavePathname("/");
    expect(requests(fetchMock)).not.toContain("POST /api/subscription/refresh");
  });
});
