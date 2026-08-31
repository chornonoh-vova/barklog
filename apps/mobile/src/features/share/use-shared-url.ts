import { useIncomingShare } from "expo-sharing";
import { useMemo } from "react";

import { sharedUrlFrom } from "./extract-url";

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
   * Not `isResolving` alone. That flag starts `false` and only turns true from
   * the hook's effect, so on the first painted frame of every share it would
   * report settled with no url yet — a terminal empty state flashing before
   * resolution has even started. `sharedPayloads` is seeded synchronously from
   * `getSharedPayloads()`, so on that same frame it already knows a share
   * exists.
   *
   * The `error === null` term is load-bearing: a failed resolution leaves the
   * resolved list empty and returns `isResolving` to `false`, so without it
   * this would report pending forever and spin on the error path.
   */
  const isPending =
    isResolving ||
    (sharedPayloads.length > 0 && resolvedSharedPayloads.length === 0 && error === null);

  return { url, isPending, error, clear: clearSharedPayloads };
}
