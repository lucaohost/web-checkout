import { writeFile } from "node:fs/promises";
import { buildApp } from "../app.ts";
import { createDatabase } from "../db/client.ts";

// The pool connects lazily, so generating the document never touches a database.
const db = createDatabase("postgres://unused@localhost/unused");
const app = buildApp({ db });
await app.ready();
await writeFile(new URL("../../openapi.json", import.meta.url), `${JSON.stringify(app.swagger(), null, 2)}\n`);
await app.close();
await db.$client.end();
