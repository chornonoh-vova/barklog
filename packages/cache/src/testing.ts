import { RedisContainer } from "@testcontainers/redis";
import { Valkey } from "iovalkey";

// The Redis testcontainers module drives Valkey unchanged — Valkey is
// wire-compatible — so we point it at the same image docker-compose uses.
export const VALKEY_IMAGE = "valkey/valkey:9-alpine";

/** Starts a Valkey for a test suite. Never used outside tests. */
export async function startValkey(): Promise<{ url: string; stop(): Promise<void> }> {
  const container = await new RedisContainer(VALKEY_IMAGE).start();

  return {
    url: container.getConnectionUrl(),
    stop: async () => {
      await container.stop();
    },
  };
}

/** Wipes every key. The cache equivalent of `truncateAll`. */
export async function flushAll(url: string): Promise<void> {
  const client = new Valkey(url, { maxRetriesPerRequest: 1, connectTimeout: 1_000 });
  try {
    await client.flushall();
  } finally {
    client.disconnect();
  }
}
