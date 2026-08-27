import { useEffect, useState } from "react";

/**
 * 400 ms is chosen against the API's search rate limit of 30 requests/minute,
 * not for feel alone. Together with the query client's 60 s `staleTime` — which
 * makes a query the user has already typed free — it keeps type-ahead inside
 * the budget. Shortening this without raising the server limit will produce
 * 429s during fast typing.
 */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);

    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
