import { Host, ProgressView } from "@expo/ui/swift-ui";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { StyleSheet } from "react-native";

import { errorCopy } from "@/api/error-copy";
import { NativeState } from "@/components/native-state";
import { Brand } from "@/theme";

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
  const { title, description } = errorCopy(query.error);

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
