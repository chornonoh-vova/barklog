import { useIncomingShare } from "expo-sharing";
import { useMemo } from "react";

import { sharedUrlFrom } from "./extract-url";

export function useSharedUrl(): {
  url: string | null;
  isResolving: boolean;
  clear: () => void;
} {
  const { resolvedSharedPayloads, isResolving, clearSharedPayloads } = useIncomingShare();

  const url = useMemo(() => sharedUrlFrom(resolvedSharedPayloads), [resolvedSharedPayloads]);

  return { url, isResolving, clear: clearSharedPayloads };
}
