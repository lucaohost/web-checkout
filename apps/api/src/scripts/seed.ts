import { loadConfig } from "../config.ts";
import { createDatabase } from "../db/client.ts";
import { migrateDatabase } from "../db/migrate.ts";
import { seedMenuIfEmpty } from "../db/seed.ts";

const config = loadConfig();
await migrateDatabase(config.databaseUrl);
const db = createDatabase(config.databaseUrl);

try {
  const seeded = await seedMenuIfEmpty(db);
  console.log(seeded ? "Seeded the menu into an empty database." : "Menu already present; left it alone.");
} finally {
  await db.$client.end();
}
