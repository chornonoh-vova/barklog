import { Host, ProgressView } from "@expo/ui/swift-ui";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { StyleSheet } from "react-native";

import { isApiError } from "@/api/errors";
import { NativeState } from "@/components/native-state";
import { Brand } from "@/theme";

/**
 * Error copy is keyed off status rather than shown verbatim, because a 5xx
 * problem document carries no `detail` by design — the API strips exception
 * messages so they cannot leak schema names and file paths.
 */
function errorState(error: unknown): { title: string; description: string } {
  if (!isApiError(error)) {
    return { title: "Something went wrong", description: "Please try again." };
  }

  if (error.status === 0) {
    return { title: "You're offline", description: error.detail ?? "Check your connection." };
  }

  if (error.status === 429) {
    return {
      title: "Slow down a moment",
      description: "You've made a lot of requests. Try again shortly.",
    };
  }

  if (error.status >= 500) {
    return {
      title: "Barklog is having trouble",
      description: "The server couldn't answer. Try again in a moment.",
    };
  }

  return { title: error.title, description: error.detail ?? "Please try again." };
}

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

  if (query.isPending) {
    return (
      <Host style={styles.host} seedColor={Brand.tint} useViewportSizeMeasurement>
        <ProgressView />
      </Host>
    );
  }

  // Errored with nothing to fall back on.
  const { title, description } = errorState(query.error);

  return (
    <NativeState
      title={title}
      systemImage="exclamationmark.triangle"
      description={description}
      action={{ label: "Try Again", onPress: () => void query.refetch() }}
    />
  );
}

const styles = StyleSheet.create({
  host: { flex: 1 },
});
