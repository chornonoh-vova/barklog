import { startPostgres } from "@repo/db/testing";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  interface ProvidedContext {
    databaseUrl: string;
  }
}

let stop: (() => Promise<void>) | undefined;

export async function setup(project: TestProject) {
  const postgres = await startPostgres();
  stop = postgres.stop;
  project.provide("databaseUrl", postgres.url);
}

export async function teardown() {
  await stop?.();
}
