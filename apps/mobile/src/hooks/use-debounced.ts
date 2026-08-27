import { useEffect, useState } from "react";

/**
 * 400 ms is set against the API's 30 requests/minute search limit, not for feel.
 * Shortening it without raising the server limit produces 429s during fast
 * typing.
 */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);

    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
