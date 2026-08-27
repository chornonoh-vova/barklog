import { Host, ProgressView } from "@expo/ui/swift-ui";

import { errorCopy } from "@/api/error-copy";
import { EmptyState } from "@/components/empty-state";

/**
 * The two states every read screen shares, as plain siblings rather than a
 * wrapper around the loaded content.
 *
 * A render-prop boundary meant the list only existed inside the success
 * branch, so any chrome that belonged above it — Home's status filter — had to
 * live inside the list too and got torn down on every query-state change. The
 * screens now branch on their own and place these where they need them.
 */
export function LoadingState() {
  return (
    <Host style={{ flex: 1 }}>
      <ProgressView />
    </Host>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { title, description } = errorCopy(error);

  return (
    <EmptyState
      title={title}
      systemImage="exclamationmark.triangle"
      description={description}
      action={{ label: "Try Again", onPress: onRetry }}
    />
  );
}
