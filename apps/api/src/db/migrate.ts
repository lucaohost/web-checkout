import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "./client.ts";

const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

export async function migrateDatabase(url: string) {
  const db = createDatabase(url);
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await db.$client.end();
  }
}
