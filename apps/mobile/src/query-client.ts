import { QueryClient } from "@tanstack/react-query";

import { isApiError } from "@/api/errors";

/**
 * A 60 s `staleTime` is not just a network saving: it is what keeps
 * search-as-you-type under the API's 30 requests/minute search limit, because a
 * query the user has already typed comes back from cache for free.
 *
 * 4xx is never retried — a 404, a 422 or a 429 will not succeed on a second
 * attempt, and retrying a 429 makes the situation it reports worse.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        retry: (failureCount, error) => {
          if (isApiError(error) && error.status >= 400 && error.status < 500) return false;

          return failureCount < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}
