import { useEffect, useState } from "react";

/** 400 ms is set against the API's 30/min search limit, not for feel:
 * shortening it without raising that limit produces 429s. */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);

    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
