import type { ShareIdentifyResponse } from "@repo/contracts";
import { screen, userEvent } from "@testing-library/react-native";
import { openURL } from "expo-linking";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ApiError } from "@/lib/api/errors";
import { ShareScreen } from "@/features/share/share-screen";
import { gameSummary, identifyResponse } from "@test/fixtures";
import { fakeEndpoints, renderWithProviders } from "@test/render";
import { setWindow } from "@test/window";

jest.mock("expo-linking", () => ({ openURL: jest.fn(async () => true) }));

const LINK = "https://www.youtube.com/watch?v=abc";

const METRICS = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

const callbacks = { onSelect: jest.fn(), onGoHome: jest.fn(), onSearch: jest.fn() };

function renderShare(
  props: { url?: string | null; isPending?: boolean; error?: Error | null } = {},
  identifyShare: () => Promise<ShareIdentifyResponse> = async () => identifyResponse(),
) {
  const api = fakeEndpoints({ identifyShare });
  return renderWithProviders(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ShareScreen
        url={props.url === undefined ? LINK : props.url}
        isPending={props.isPending ?? false}
        error={props.error ?? null}
        {...callbacks}
      />
    </SafeAreaProvider>,
    { api },
  );
}

describe("ShareScreen", () => {
  it("shows the searching state while the share payload is still arriving", async () => {
    const { api } = await renderShare({ url: null, isPending: true });

    expect(screen.getByText("Working out which game this is")).toBeOnTheScreen();
    expect(api.identifyShare).not.toHaveBeenCalled();
  });

  it("keeps the searching state while the game is being identified", async () => {
    await renderShare({}, () => new Promise(() => {}));

    expect(screen.getByText("Working out which game this is")).toBeOnTheScreen();
    expect(screen.getByRole("progressbar")).toBeOnTheScreen();
  });

  it("explains an unreadable share and goes home", async () => {
    await renderShare({ url: null, error: new Error("resolve failed") });

    expect(screen.getByText("Could not read that share")).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole("button", { name: "Back to Home" }));
    expect(callbacks.onGoHome).toHaveBeenCalledTimes(1);
  });

  it("explains a share that carried no link", async () => {
    const { api } = await renderShare({ url: null });

    expect(screen.getByText("No link in that share")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Back to Home" })).toBeOnTheScreen();
    expect(api.identifyShare).not.toHaveBeenCalled();
  });

  it("lists the identified games under the source and opens the one picked", async () => {
    const { api } = await renderShare();

    expect(await screen.findByText("Matches for the title")).toBeOnTheScreen();
    expect(api.identifyShare).toHaveBeenCalledWith({ url: LINK });
    expect(screen.getByText("Which game is this?")).toBeOnTheScreen();
    expect(screen.getByText("Hollow Knight Silksong review")).toBeOnTheScreen();

    await userEvent.setup().press(screen.getByRole("button", { name: /^Hollow Knight: Silksong/ }));
    expect(callbacks.onSelect).toHaveBeenCalledWith(7);
  });

  it("names the author when the games came from what they usually cover", async () => {
    await renderShare({}, async () => identifyResponse({ basis: "author" }));

    expect(await screen.findByText("Games Reviewer usually covers")).toBeOnTheScreen();
  });

  it("shows title matches without a header when identification was unavailable", async () => {
    await renderShare({}, async () => identifyResponse({ basis: "unavailable" }));

    expect(await screen.findByText(/so these are matches for the title instead/)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: /^Hollow Knight: Silksong/ })).toBeOnTheScreen();
    expect(screen.queryByText("Matches for the title")).not.toBeOnTheScreen();
  });

  it("offers Search Instead when the guessed game is not in the catalogue", async () => {
    await renderShare({}, async () => identifyResponse({ items: [] }));

    expect(await screen.findByText("No match in the catalogue")).toBeOnTheScreen();
    expect(
      screen.getByText(
        "We think this is about Hollow Knight: Silksong, but it isn't in the catalogue yet.",
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /^Open on/ })).not.toBeOnTheScreen();

    await userEvent.setup().press(screen.getByRole("button", { name: "Search Instead" }));
    expect(callbacks.onSearch).toHaveBeenCalledTimes(1);
  });

  it("hands the original page back when nothing could be identified", async () => {
    await renderShare({}, async () =>
      identifyResponse({ basis: "none", identified: false, guesses: [], items: [] }),
    );

    expect(
      await screen.findByText(
        "We couldn't tell which game this is, even after searching the web. Open the original page to check.",
      ),
    ).toBeOnTheScreen();

    await userEvent.setup().press(screen.getByRole("button", { name: "Open on youtube.com" }));
    expect(openURL).toHaveBeenCalledWith(LINK);
  });

  it("shows the error with a retry when identifying fails", async () => {
    const identifyShare = jest
      .fn<Promise<ShareIdentifyResponse>, []>()
      .mockRejectedValueOnce(new ApiError({ status: 500, type: "about:blank", title: "Boom" }))
      .mockResolvedValue(identifyResponse());
    await renderShare({}, identifyShare);

    await userEvent.setup().press(await screen.findByRole("button", { name: "Try Again" }));

    expect(await screen.findByText("Matches for the title")).toBeOnTheScreen();
  });

  it("still lists games at accessibility text sizes", async () => {
    await setWindow({ fontScale: 2 });
    await renderShare({}, async () =>
      identifyResponse({ items: [gameSummary({ id: 3, name: "Tunic" })] }),
    );

    expect(await screen.findByRole("button", { name: /^Tunic/ })).toBeOnTheScreen();
  });
});
