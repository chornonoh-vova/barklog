import { RedisContainer } from "@testcontainers/redis";
import { Valkey } from "iovalkey";

export const VALKEY_IMAGE = "valkey/valkey:9-alpine";

export async function startValkey(): Promise<{ url: string; stop(): Promise<void> }> {
  const container = await new RedisContainer(VALKEY_IMAGE).start();

  return {
    url: container.getConnectionUrl(),
    stop: async () => {
      await container.stop();
    },
  };
}

export async function flushAll(url: string): Promise<void> {
  const client = new Valkey(url, { maxRetriesPerRequest: 1, connectTimeout: 1_000 });
  try {
    await client.flushall();
  } finally {
    client.disconnect();
  }
}
