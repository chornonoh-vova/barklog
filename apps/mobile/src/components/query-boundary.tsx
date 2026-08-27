import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { ErrorState, LoadingState } from "@/components/query-states";

/**
 * The wrapper form of `LoadingState` / `ErrorState`, still used by the screens
 * that have no chrome above their content.
 *
 * Home and Explore branch on the query themselves instead: anything that has
 * to render above the loaded content — Home's status filter — cannot live
 * inside a render prop that only runs in the success branch.
 */
export function QueryBoundary<T>({
  query,
  children,
}: {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
}) {
  /**
   * Data we already hold wins over an error, and this ordering is the whole
   * point of the component.
   *
   * TanStack's result union has a `QueryObserverRefetchErrorResult` variant
   * carrying `data: TData` together with `isError: true` — a background refetch
   * or a failed pull-to-refresh on a screen that already has content. Checking
   * `isError` before `data` would replace a list the user is reading with a
   * full-screen error, which is the wrong trade: the stale list is still
   * useful and the refresh spinner stopping is signal enough.
   *
   * It also gives `placeholderData: keepPreviousData` (used by search) its
   * behaviour for free: previous results stay on screen while the next query
   * resolves.
   */
  if (query.data !== undefined) return children(query.data);

  if (query.isPending) return <LoadingState />;

  // Errored with nothing to fall back on.
  return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
}
