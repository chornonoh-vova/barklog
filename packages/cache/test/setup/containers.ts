import { RedisContainer, type StartedRedisContainer } from "@testcontainers/redis";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  interface ProvidedContext {
    valkeyUrl: string;
  }
}

let container: StartedRedisContainer | undefined;

// The Redis testcontainers module drives Valkey unchanged — Valkey is
// wire-compatible — so we point it at the same image docker-compose uses.
export async function setup(project: TestProject) {
  container = await new RedisContainer("valkey/valkey:9-alpine").start();
  project.provide("valkeyUrl", container.getConnectionUrl());
}

export async function teardown() {
  await container?.stop();
}
