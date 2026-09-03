import { eroticGameIdsQuery, gamesPageQuery } from "./games-query.js";
import { createThrottle } from "./throttle.js";
import type { TokenSource } from "./token.js";

const IGDB_BASE = "https://api.igdb.com/v4";
const MAX_ATTEMPTS = 5;
export const PAGE_SIZE = 500;

export interface IgdbClient {
  gamesPage(options: { since: Date | null; afterId: number }): Promise<unknown[]>;
  eroticGameIds(options: { afterId: number }): Promise<unknown[]>;
}

export interface IgdbClientOptions {
  clientId: string;
  tokens: TokenSource;
  fetchImpl?: typeof fetch;
  throttle?: ReturnType<typeof createThrottle>;
  retryBaseMs?: number;
}

const isRetryable = (status: number) => status === 429 || status >= 500;

export function createIgdbClient(options: IgdbClientOptions): IgdbClient {
  const doFetch = options.fetchImpl ?? fetch;
  const throttle = options.throttle ?? createThrottle({ concurrency: 4, minIntervalMs: 250 });
  const retryBaseMs = options.retryBaseMs ?? 500;

  async function request(endpoint: string, body: string): Promise<unknown[]> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const token = await options.tokens.get();

      const response = await throttle(() =>
        doFetch(`${IGDB_BASE}/${endpoint}`, {
          method: "POST",
          headers: {
            "Client-ID": options.clientId,
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
          body,
        }),
      );

      if (response.ok) return (await response.json()) as unknown[];

      lastError = new Error(`IGDB ${endpoint} failed with ${response.status}`);

      if (!isRetryable(response.status)) throw lastError;

      const backoff = retryBaseMs * 2 ** attempt;
      const jitter = Math.floor(backoff * 0.2 * Math.random());
      await new Promise((resolve) => setTimeout(resolve, backoff + jitter));
    }

    throw lastError;
  }

  return {
    gamesPage: (o) => request("games", gamesPageQuery({ ...o, limit: PAGE_SIZE })),
    eroticGameIds: (o) => request("games", eroticGameIdsQuery({ ...o, limit: PAGE_SIZE })),
  };
}
