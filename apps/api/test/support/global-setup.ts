import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { TestProject } from "vitest/node";
import { migrateDatabase } from "../../src/db/migrate.ts";

let container: StartedPostgreSqlContainer;

export async function setup(project: TestProject) {
  container = await new PostgreSqlContainer("postgres:17-alpine").start();
  await migrateDatabase(container.getConnectionUri());
  project.provide("databaseUrl", container.getConnectionUri());
}

export async function teardown() {
  await container.stop();
}

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}
