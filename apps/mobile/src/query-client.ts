import { QueryClient } from "@tanstack/react-query";

import { isApiError } from "@/api/errors";

/**
 * The 60 s `staleTime` is what keeps search-as-you-type under the API's 30
 * requests/minute search limit. 4xx is never retried — a 404, 422 or 429 will
 * not succeed on a second attempt, and retrying a 429 makes it worse.
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
