import { PostgreSqlContainer } from "@testcontainers/postgresql";

const postgres = await new PostgreSqlContainer("postgres:17-alpine").start();
process.env.DATABASE_URL = postgres.getConnectionUri();
process.env.PORT = "3100";
process.env.CORS_ORIGIN = "http://127.0.0.1:4173,http://localhost:4173";
process.env.PAYMENT_PROVIDER_URL = "http://127.0.0.1:4100";
process.env.SEED_MENU = "true";

await import("../../api/src/server.ts");
