const TOKEN_KEY = "igdb:token";
const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const HEADROOM_SECONDS = 3600;

export interface TokenCache {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
}

export interface TokenSource {
  get(): Promise<string>;
}

export interface TokenSourceOptions {
  clientId: string;
  clientSecret: string;
  cache: TokenCache;
  fetchImpl?: typeof fetch;
}

export function createTokenSource(options: TokenSourceOptions): TokenSource {
  const doFetch = options.fetchImpl ?? fetch;
  let inMemory: string | null = null;
  let inFlight: Promise<string> | null = null;

  async function fetchToken(): Promise<string> {
    const url = new URL(TOKEN_URL);
    url.searchParams.set("client_id", options.clientId);
    url.searchParams.set("client_secret", options.clientSecret);
    url.searchParams.set("grant_type", "client_credentials");

    const response = await doFetch(url.toString(), { method: "POST" });
    if (!response.ok) {
      throw new Error(`IGDB token request failed with ${response.status}`);
    }

    const body = (await response.json()) as { access_token: string; expires_in: number };
    inMemory = body.access_token;
    await options.cache.set(TOKEN_KEY, body.access_token, body.expires_in - HEADROOM_SECONDS);
    return body.access_token;
  }

  return {
    async get(): Promise<string> {
      if (inMemory) return inMemory;

      const cached = await options.cache.get<string>(TOKEN_KEY);
      if (cached) {
        inMemory = cached;
        return cached;
      }

      inFlight ??= fetchToken().finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
  };
}
