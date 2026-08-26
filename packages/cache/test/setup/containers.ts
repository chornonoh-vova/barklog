import type { TestProject } from "vitest/node";

import { startValkey } from "../../src/testing.js";

declare module "vitest" {
  interface ProvidedContext {
    valkeyUrl: string;
  }
}

let stop: (() => Promise<void>) | undefined;

export async function setup(project: TestProject) {
  const valkey = await startValkey();
  stop = valkey.stop;
  project.provide("valkeyUrl", valkey.url);
}

export async function teardown() {
  await stop?.();
}
