import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema.ts";

export function createDatabase(url: string) {
  return drizzle(url, { schema, casing: "snake_case" });
}

export type Database = ReturnType<typeof createDatabase>;
