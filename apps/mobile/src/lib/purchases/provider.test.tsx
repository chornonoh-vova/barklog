import { act, screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";

import { keys } from "@/lib/api/keys";
import { PurchasesProvider } from "@/lib/purchases/provider";
import { PREMIUM_ENTITLEMENT } from "@/lib/purchases/should-refresh";
import { me } from "@test/fixtures";
import { clerk, emitCustomerInfo, purchases } from "@test/mocks/native";
import { fakeEndpoints, renderWithProviders, testQueryClient } from "@test/render";

const tree = () => (
  <PurchasesProvider>
    <Text>App</Text>
  </PurchasesProvider>
);

function renderProvider() {
  const api = fakeEndpoints({ refreshSubscription: async () => me({ premium: true }) });
  const queryClient = testQueryClient();
  queryClient.setQueryData(keys.me(), me());
  return renderWithProviders(tree(), { api, queryClient });
}

const emit = (entitlements: string[]) => act(async () => emitCustomerInfo(entitlements));

describe("PurchasesProvider", () => {
  it("renders its children", async () => {
    await renderProvider();

    expect(screen.getByText("App")).toBeOnTheScreen();
  });

  it("configures RevenueCat once, with the build's key", async () => {
    const { rerender } = await renderProvider();
    await rerender(tree());

    expect(purchases.configure).toHaveBeenCalledTimes(1);
    expect(purchases.configure).toHaveBeenCalledWith({ apiKey: "test_revenuecat" });
  });

  it("logs the signed-in user in under their Clerk id", async () => {
    await renderProvider();

    expect(purchases.logIn).toHaveBeenCalledWith("user_1");
  });

  it("waits while Clerk has not resolved a user", async () => {
    clerk.userId = undefined;
    await renderProvider();

    expect(purchases.logIn).not.toHaveBeenCalled();
    expect(purchases.logOut).not.toHaveBeenCalled();
  });

  it("logs in again on an account switch, and not on a re-render", async () => {
    const { rerender } = await renderProvider();
    await rerender(tree());
    expect(purchases.logIn).toHaveBeenCalledTimes(1);

    clerk.userId = "user_2";
    await rerender(tree());

    expect(purchases.logIn).toHaveBeenCalledTimes(2);
    expect(purchases.logIn).toHaveBeenLastCalledWith("user_2");
  });

  it("logs out on sign-out", async () => {
    const { rerender } = await renderProvider();

    clerk.userId = null;
    await rerender(tree());

    expect(purchases.logOut).toHaveBeenCalledTimes(1);
  });

  it("does not log an anonymous user out, which RevenueCat refuses", async () => {
    purchases.isAnonymous = true;
    clerk.userId = null;
    await renderProvider();

    expect(purchases.logOut).not.toHaveBeenCalled();
  });

  it("refreshes the entitlement once when it changes outside the paywall", async () => {
    const { api, queryClient } = await renderProvider();

    // The first firing only seeds the comparison.
    await emit([]);
    expect(api.refreshSubscription).not.toHaveBeenCalled();

    await emit([PREMIUM_ENTITLEMENT]);
    await waitFor(() => expect(queryClient.getQueryState(keys.me())?.isInvalidated).toBe(true));
    expect(api.refreshSubscription).toHaveBeenCalledTimes(1);

    // Unchanged: no second refresh.
    await emit([PREMIUM_ENTITLEMENT]);
    expect(api.refreshSubscription).toHaveBeenCalledTimes(1);
  });

  it("ignores entitlements other than premium", async () => {
    const { api } = await renderProvider();

    await emit([]);
    await emit(["something_else"]);

    expect(api.refreshSubscription).not.toHaveBeenCalled();
  });

  it("starts the comparison afresh for the next account", async () => {
    const { api, rerender } = await renderProvider();
    await emit([PREMIUM_ENTITLEMENT]);

    clerk.userId = "user_2";
    await rerender(tree());
    await emit([]);

    expect(api.refreshSubscription).not.toHaveBeenCalled();
  });

  it("stops listening when unmounted", async () => {
    const { api, unmount } = await renderProvider();
    await emit([]);

    await unmount();
    await emit([PREMIUM_ENTITLEMENT]);

    expect(purchases.removeCustomerInfoUpdateListener).toHaveBeenCalledTimes(1);
    expect(api.refreshSubscription).not.toHaveBeenCalled();
  });
});
