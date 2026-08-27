import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { ErrorState, LoadingState } from "@/components/query-states";

export function QueryBoundary<T>({
  query,
  children,
}: {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
}) {
  /**
   * Data we already hold wins over an error, and this ordering is the whole
   * point of the component. TanStack's result union has a
   * `QueryObserverRefetchErrorResult` variant carrying `data` together with
   * `isError: true` — a failed background refetch on a screen that already has
   * content. Checking `isError` first would replace a list the user is reading
   * with a full-screen error. It also gives `keepPreviousData` its behaviour
   * for free.
   */
  if (query.data !== undefined) return children(query.data);

  if (query.isPending) return <LoadingState />;

  return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
}
