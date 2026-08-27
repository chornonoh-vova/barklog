import { Host, ProgressView } from "@expo/ui/swift-ui";

import { errorCopy } from "@/api/error-copy";
import { EmptyState } from "@/components/empty-state";

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
