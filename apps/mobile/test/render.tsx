/**
 * Renders a screen or component the way the app mounts it: inside a query
 * client and an API context, with fake endpoints in place of the network.
 */
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook, type RenderOptions } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";
import type { ReactElement, ReactNode } from "react";

import { ApiContext } from "@/lib/api/provider";
import type { Endpoints } from "@/lib/api/endpoints";
import { createQueryClient } from "@/lib/query/query-client";

import { backlogList, me } from "./fixtures";

export type FakeEndpoints = { [K in keyof Endpoints]: jest.MockedFunction<Endpoints[K]> };

/**
 * Every endpoint is a `jest.fn`. `/me` and the backlog answer with a free user
 * and an empty backlog, since nearly every screen reads them; anything else
 * fails loudly until a test says what it returns.
 */
export function fakeEndpoints(overrides: Partial<Endpoints> = {}): FakeEndpoints {
  const unexpected = (name: string) =>
    jest.fn(() => Promise.reject(new Error(`unexpected api.${name}() — stub it in the test`)));

  const endpoints = {
    searchGames: unexpected("searchGames"),
    gameFeed: unexpected("gameFeed"),
    getGame: unexpected("getGame"),
    similarGames: unexpected("similarGames"),
    identifyShare: unexpected("identifyShare"),
    listBacklog: jest.fn(async () => backlogList()),
    upsertBacklogEntry: unexpected("upsertBacklogEntry"),
    deleteBacklogEntry: unexpected("deleteBacklogEntry"),
    getMe: jest.fn(async () => me()),
    refreshSubscription: unexpected("refreshSubscription"),
  } as unknown as FakeEndpoints;

  for (const [name, impl] of Object.entries(overrides)) {
    (endpoints as unknown as Record<string, jest.Mock>)[name] = jest.fn(
      impl as (...args: unknown[]) => unknown,
    );
  }

  return endpoints;
}

/** The app's own client, minus retries and garbage collection, which only slow a test. */
export function testQueryClient(): QueryClient {
  const client = createQueryClient();
  client.setDefaultOptions({
    queries: { ...client.getDefaultOptions().queries, retry: false, gcTime: Infinity },
    mutations: { retry: false },
  });
  return client;
}

type ProviderOptions = { api?: FakeEndpoints; queryClient?: QueryClient };

function providers({ api = fakeEndpoints(), queryClient = testQueryClient() }: ProviderOptions) {
  function Providers({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ApiContext.Provider value={api}>{children}</ApiContext.Provider>
      </QueryClientProvider>
    );
  }
  return { api, queryClient, Providers };
}

export async function renderWithProviders(
  ui: ReactElement,
  options: ProviderOptions & Omit<RenderOptions, "wrapper"> = {},
) {
  const { api: _api, queryClient: _queryClient, ...renderOptions } = options;
  const { api, queryClient, Providers } = providers(options);
  const result = await render(ui, { ...renderOptions, wrapper: Providers });
  return { ...result, api, queryClient };
}

export async function renderHookWithProviders<Result, Props>(
  hook: (props: Props) => Result,
  options: ProviderOptions & { initialProps?: Props } = {},
) {
  const { api, queryClient, Providers } = providers(options);
  const result = await renderHook(hook, { initialProps: options.initialProps, wrapper: Providers });
  return { ...result, api, queryClient };
}

type RouterContext = Parameters<typeof renderRouter>[0];

/**
 * `renderRouter` with the app's providers, for screens that read params or
 * navigate. Pass a route map of stand-ins around the screen under test, then
 * assert where a press lands with `expect(screen).toHavePathname(...)`.
 */
export async function renderRouterWithProviders(
  routes: RouterContext,
  options: ProviderOptions & { initialUrl?: string } = {},
) {
  const { api, queryClient, Providers } = providers(options);
  const result = await renderRouter(routes, { initialUrl: options.initialUrl, wrapper: Providers });
  return { ...result, api, queryClient };
}
