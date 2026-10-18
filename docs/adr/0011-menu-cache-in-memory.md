---
status: accepted
---

# Menu cached in API memory, Stock never cached

The Menu (Products' names, prices and Categories) is cached in the API process's memory with a 5-minute expiry as a safety net. It changes only through the seed, and a restart refreshes it. Stock is never cached: `GET /menu` merges the cached Menu with a fresh stock query on every call. A stale Menu cannot cause a wrong charge, because `POST /checkouts` reads prices and stock from the database and reports any difference to the Customer ([ADR-0010](./0010-stock-reservation.md)).

## Considered options

- **Redis.** Deferred. With one API instance, it adds a service and gains nothing. It becomes worth it with several API instances, or with an admin screen that needs to invalidate the Menu immediately.
- **A short expiry, such as 5 s.** Rejected. At snack-bar traffic, almost every request would arrive after the cache expired.
- **Separate `GET /menu` and `GET /availability` endpoints.** Rejected. They would allow different cache policies, but at the cost of two calls from the kiosk for one screen.

## Consequences

- With several API instances, each one holds its own copy of the Menu for up to 5 minutes. That is harmless, for the reason above.
