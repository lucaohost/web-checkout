import { readFile } from "node:fs/promises";
import { afterAll, expect, inject, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { createDatabase } from "../src/db/client.ts";

const db = createDatabase(inject("databaseUrl"));
const app = buildApp({ db });

afterAll(async () => {
  await app.close();
  await db.$client.end();
});

it("publishes the same OpenAPI document the frontend generates its types from (run `npm run openapi` after changing a route)", async () => {
  const response = await app.inject({ method: "GET", url: "/docs/json" });
  const committed = JSON.parse(await readFile(new URL("../openapi.json", import.meta.url), "utf8"));

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual(committed);
});
