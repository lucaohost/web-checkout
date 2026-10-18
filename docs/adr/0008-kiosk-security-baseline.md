---
status: accepted
---

# Kiosk security baseline: no authentication for Customers, a shared key for staff

The kiosk is a public, unattended screen, so the API trusts nothing the client sends. The baseline:

- **No authentication at the kiosk.** Customers are anonymous and kiosks carry no secret. This is an accepted risk: anyone who reaches the API can place orders.
- **A shared staff key.** The staff endpoints that move Orders between statuses ([ADR-0013](./0013-order-lifecycle-staff-endpoints.md)) require the `X-Staff-Key` header to match a key set by environment variable.
- **CORS** allows only the frontend's origin. `X-Force-Error` is an allowed header only outside production.
- **Every endpoint validates its input** against a schema; unknown fields are rejected.
- **The server owns prices and totals.** The client's prices are only used to detect that a price changed; they are never charged.
- **Per-order limits**: a maximum quantity per product and a maximum number of distinct products per order, so one request cannot drain stock.
- **Basic rate limiting per kiosk.** The kiosk id is self-declared, so this slows down accidents and casual abuse, not a determined attacker.
- **No card data is typed or stored.** The card terminal is simulated, which keeps the system out of PCI scope.

## Consequences

- One staff key is shared by everyone, so there is no record of which person moved an Order. Per-person staff accounts are future work.
- Real kiosk authentication (device certificates or per-kiosk tokens) is future work.
