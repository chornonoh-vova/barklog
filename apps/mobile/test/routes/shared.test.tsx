import AsyncStorage from "@react-native-async-storage/async-storage";
import { screen, userEvent } from "@testing-library/react-native";
import { testRouter } from "expo-router/testing-library";

import { gameDetail, gameSummary, identifyResponse } from "@test/fixtures";
import { share } from "@test/mocks/native";

import {
  fakeServer,
  markOnboardingSeen,
  pressHeaderButton,
  renderApp,
  requests,
  type ServerRoutes,
} from "./app";

const VIDEO = "https://www.youtube.com/watch?v=abc";

beforeEach(async () => {
  await AsyncStorage.clear();
  await markOnboardingSeen();
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** What expo-sharing reports once iOS has handed over a shared video link. */
function shareVideo() {
  share.sharedPayloads = [{ value: VIDEO, shareType: "url" }];
  share.resolvedSharedPayloads = [{ contentType: "website", contentUri: VIDEO }];
}

/** Home first, then the sheet over it, as a warm share presents it. */
async function openShared(routes: ServerRoutes = {}) {
  const fetchMock = fakeServer(routes);
  await renderApp("/");
  await screen.findByText("Your backlog is empty");
  await testRouter.push("/shared");
  return fetchMock;
}

describe("/shared", () => {
  it("says so when the share carried no link, and goes back Home clearing it", async () => {
    await openShared();

    expect(await screen.findByText("No link in that share")).toBeOnTheScreen();
    expect(screen).toHaveSegments(["shared"]);

    await userEvent.setup().press(screen.getByRole("button", { name: "Back to Home" }));

    expect(share.clearSharedPayloads).toHaveBeenCalledTimes(1);
    expect(screen).toHavePathname("/");
  });

  it("closes from its toolbar, clearing the share", async () => {
    await openShared();

    await screen.findByText("No link in that share");
    await pressHeaderButton("Close");

    expect(share.clearSharedPayloads).toHaveBeenCalledTimes(1);
    expect(screen).toHavePathname("/");
  });

  it("identifies the shared video and opens a match inside the sheet", async () => {
    shareVideo();
    const fetchMock = await openShared({
      "POST /api/games/identify": identifyResponse(),
      "/api/games/7": gameDetail({ id: 7 }),
      "/api/games/7/similar": { items: [gameSummary({ id: 8 })] },
      "/api/games/8": gameDetail({ id: 8 }),
      "/api/games/8/similar": { items: [] },
    });

    const match = await screen.findByRole("button", { name: /^Hollow Knight: Silksong/ });
    expect(requests(fetchMock)).toContain("POST /api/games/identify");

    const user = userEvent.setup();
    await user.press(match);
    expect(screen).toHavePathname("/shared/game/7");

    await user.press(await screen.findByRole("button", { name: /^Game 8/ }));
    expect(screen).toHavePathname("/shared/game/8");
    expect(screen).toHaveSegments(["shared", "game", "[id]"]);
  });

  it("offers Search when nothing matched, clearing the share", async () => {
    shareVideo();
    await openShared({ "POST /api/games/identify": identifyResponse({ items: [] }) });

    await userEvent.setup().press(await screen.findByRole("button", { name: "Search Instead" }));

    expect(share.clearSharedPayloads).toHaveBeenCalledTimes(1);
    expect(screen).toHavePathname("/search");
  });
});
