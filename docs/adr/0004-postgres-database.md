---
status: accepted
---

# PostgreSQL as the database

Orders and stock live in PostgreSQL, started by Docker Compose. Several kiosks can compete for the last unit of a product, and Postgres gives real transactions and concurrent writers, so the atomic conditional stock decrement behaves the way it would in production.

## Considered options

- **SQLite.** Rejected. Zero setup, but it allows only one writer at a time, which hides exactly the concurrency problem the stock logic has to solve.
- **Plain files.** Rejected. No transactions and no safe concurrent writes.
