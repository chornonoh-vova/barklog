import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { TestProject } from "vitest/node";

import { createDb } from "../../src/client.js";
import { runMigrations } from "../../src/migrate.js";

declare module "vitest" {
  interface ProvidedContext {
    databaseUrl: string;
  }
}

let container: StartedPostgreSqlContainer | undefined;

export async function setup(project: TestProject) {
  container = await new PostgreSqlContainer("postgres:18-alpine").start();
  const url = container.getConnectionUri();

  const { db, close } = createDb(url);
  await runMigrations(db);
  await close();

  project.provide("databaseUrl", url);
}

export async function teardown() {
  await container?.stop();
}
