import { useIncomingShare } from "expo-sharing";
import { useEffect, useMemo, useRef, useState } from "react";

import { sharedUrlFrom } from "./extract-url";
import { shouldWaitForPayload } from "./should-wait-for-payload";

export function useSharedUrl(): {
  url: string | null;
  isPending: boolean;
  error: Error | null;
  clear: () => void;
} {
  const { sharedPayloads, resolvedSharedPayloads, isResolving, error, clearSharedPayloads } =
    useIncomingShare();

  const url = useMemo(() => sharedUrlFrom(resolvedSharedPayloads), [resolvedSharedPayloads]);

  /**
   * Watching `isResolving` fall back to false is the only signal the hook gives
   * that an attempt finished. Emptiness cannot stand in for it: a resolve that
   * succeeds and yields nothing is indistinguishable from one that has not
   * started, and reading it as the latter waits forever.
   */
  const [hasAttempted, setHasAttempted] = useState(false);
  const wasResolving = useRef(false);

  useEffect(() => {
    if (wasResolving.current && !isResolving) setHasAttempted(true);
    wasResolving.current = isResolving;
  }, [isResolving]);

  const isPending = shouldWaitForPayload({
    isResolving,
    sharedCount: sharedPayloads.length,
    resolvedCount: resolvedSharedPayloads.length,
    hasError: error !== null,
    hasAttempted,
  });

  return { url, isPending, error, clear: clearSharedPayloads };
}
