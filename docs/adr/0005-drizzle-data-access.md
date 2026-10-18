---
status: accepted
---

# Drizzle for data access

The API talks to Postgres ([ADR-0004](./0004-postgres-database.md)) through Drizzle. Its queries read like SQL, so the transactions and the conditional `UPDATE ... SET stock = stock - :qty WHERE stock >= :qty` that protects stock stay explicit in the code; table types are inferred from the schema, and drizzle-kit handles migrations.

## Considered options

- **Prisma.** Rejected. It hides SQL behind its own query API and a generated client, which makes the atomic stock decrement less obvious to a reader.
- **Raw `pg`.** Rejected. No typed schema and hand-written migrations.
