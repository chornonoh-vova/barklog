import { Host, ProgressView } from "@expo/ui/swift-ui";
import { useTranslation } from "react-i18next";

import { errorCopy } from "@/api/error-copy";
import { EmptyState } from "@/components/empty-state";

export function LoadingState() {
  return (
    <Host style={{ flex: 1 }} alignment="center">
      <ProgressView />
    </Host>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { title, description } = errorCopy(error);
  const { t } = useTranslation();

  return (
    <EmptyState
      title={title}
      systemImage="exclamationmark.triangle"
      description={description}
      action={{ label: t("common.tryAgain"), onPress: onRetry }}
      fullscreen
    />
  );
}
