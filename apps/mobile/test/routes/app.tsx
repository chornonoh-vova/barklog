/**
 * The whole app under `renderRouter`, with the network faked at `fetch`: the
 * root layout brings its own providers, so only the server is stand-in.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, screen } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";

import { backlogList, me } from "@test/fixtures";

// The full app tree is the heaviest thing the suite renders, and the first test
// in a file also pays for transforming it. 5 s is not enough on a cold CI run.
jest.setTimeout(30_000);

export const API = "https://api.barklog.test";

const ONBOARDING_SEEN = "barklog.onboarding.seen";

type Handler = unknown | ((request: { url: URL; init: RequestInit | undefined }) => unknown);

/** Keyed by `"<METHOD> <path>"` or just `"<path>"` for a GET. */
export type ServerRoutes = Record<string, Handler>;

const json = (body: unknown, status = 200) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status: body === undefined && status === 200 ? 204 : status,
    headers: { "Content-Type": "application/json" },
  });

/** Answers `/api/me` and `/api/backlog` with a free user and an empty backlog
 * unless told otherwise; anything else is a 404 the test will notice. */
export function fakeServer(routes: ServerRoutes = {}) {
  const table: ServerRoutes = {
    "/api/me": me(),
    "/api/backlog": backlogList(),
    ...routes,
  };

  return jest.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(typeof input === "string" ? input : (input as Request).url);
    const method = init?.method ?? "GET";
    const handler =
      table[`${method} ${url.pathname}`] ?? (method === "GET" ? table[url.pathname] : undefined);

    if (handler === undefined) {
      return json({ type: "about:blank", title: `No fake for ${method} ${url.pathname}` }, 404);
    }

    return json(typeof handler === "function" ? await handler({ url, init }) : handler);
  });
}

/** The calls `fetch` received, as `"<METHOD> <path>"`. */
export function requests(fetchMock: jest.SpyInstance): string[] {
  return fetchMock.mock.calls.map(([input, init]: [RequestInfo, RequestInit | undefined]) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    return `${init?.method ?? "GET"} ${url.pathname}`;
  });
}

export const markOnboardingSeen = () => AsyncStorage.setItem(ONBOARDING_SEEN, "1");

export function renderApp(initialUrl = "/") {
  return renderRouter("./src/app", { initialUrl });
}

type BarButtonItem = { accessibilityLabel?: string; buttonId?: string };

/**
 * `Stack.Toolbar.Button` becomes a native bar button item: a prop on the
 * header config, not an element, so no role query reaches it. Presses it the
 * way UIKit reports a tap, by the item's `buttonId`.
 */
export function pressHeaderButton(label: string) {
  for (const config of screen.container.queryAll(
    (node) => node.type === "RNSScreenStackHeaderConfig",
  )) {
    const items = [
      ...((config.props.headerLeftBarButtonItems as BarButtonItem[] | undefined) ?? []),
      ...((config.props.headerRightBarButtonItems as BarButtonItem[] | undefined) ?? []),
    ];
    const item = items.find((candidate) => candidate.accessibilityLabel === label);
    if (item !== undefined) {
      return fireEvent(config, "pressHeaderBarButtonItem", {
        nativeEvent: { buttonId: item.buttonId },
      });
    }
  }
  throw new Error(`No header bar button labelled "${label}"`);
}
