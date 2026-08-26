import { startValkey } from "@repo/cache/testing";
import { startPostgres } from "@repo/db/testing";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  interface ProvidedContext {
    databaseUrl: string;
    valkeyUrl: string;
  }
}

let stopPostgres: (() => Promise<void>) | undefined;
let stopValkey: (() => Promise<void>) | undefined;

export async function setup(project: TestProject) {
  const [postgres, valkey] = await Promise.all([startPostgres(), startValkey()]);

  stopPostgres = postgres.stop;
  stopValkey = valkey.stop;

  project.provide("databaseUrl", postgres.url);
  project.provide("valkeyUrl", valkey.url);
}

export async function teardown() {
  await stopPostgres?.();
  await stopValkey?.();
}
