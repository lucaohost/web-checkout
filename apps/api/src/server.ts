import { buildApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { createDatabase } from "./db/client.ts";
import { migrateDatabase } from "./db/migrate.ts";
import { seedMenuIfEmpty } from "./db/seed.ts";

const config = loadConfig();
await migrateDatabase(config.databaseUrl);
const db = createDatabase(config.databaseUrl);
const app = buildApp({ db, config, logger: true });

if (config.seedMenu && (await seedMenuIfEmpty(db))) app.log.info("seeded the Menu into an empty database");

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await app.close();
    await db.$client.end();
    process.exit(0);
  });
}

await app.listen({ host: "0.0.0.0", port: config.port });
