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
   * Data wins over an error, and the ordering is the point: a result can carry
   * `data` with `isError: true` (a failed background refetch), and checking
   * `isError` first would replace a list the user is reading with an error.
   */
  if (query.data !== undefined) return children(query.data);

  if (query.isPending) return <LoadingState />;

  return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
}
