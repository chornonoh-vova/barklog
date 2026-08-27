import { useAuth } from "@clerk/expo";
import { createContext, useContext, useMemo, type ReactNode } from "react";

import { API_URL } from "@/env";

import { createRequest } from "./client";
import { createEndpoints, type Endpoints } from "./endpoints";

const ApiContext = createContext<Endpoints | null>(null);

/**
 * Mounted inside `ClerkProvider` so `useAuth` has one, and outside `AuthGate` so
 * the endpoints exist before the first screen renders.
 */
export function ApiProvider({ children }: { children: ReactNode }) {
  const { getToken } = useAuth();

  const endpoints = useMemo(
    () => createEndpoints(createRequest({ baseUrl: API_URL, getToken })),
    [getToken],
  );

  return <ApiContext.Provider value={endpoints}>{children}</ApiContext.Provider>;
}

export function useApi(): Endpoints {
  const endpoints = useContext(ApiContext);

  if (endpoints === null) throw new Error("useApi must be used inside <ApiProvider>");

  return endpoints;
}
